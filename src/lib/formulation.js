const round = (n, digits = 5) => Number(Number(n).toFixed(digits));

function prepareRequirements(requirements, feedIntakeGDay) {
  const errors = [];
  const prepared = [];
  const dailyUnits = {
    'kcal/bird/day': 'kcal/kg',
    'mg/bird/day': 'mg/kg',
    'g/bird/day': 'g/kg'
  };

  for (const requirement of requirements || []) {
    if ((requirement.requirement_basis || 'per_kg_feed') !== 'per_animal_day') {
      prepared.push(requirement);
      continue;
    }

    const feedKgPerDay = Number(feedIntakeGDay) / 1000;
    const outputUnit = dailyUnits[requirement.unit];
    if (!(feedKgPerDay > 0)) {
      errors.push('Renseignez l’ingestion journalière réelle (g/oiseau/jour) pour convertir les besoins des pondeuses.');
      continue;
    }
    if (!outputUnit) {
      errors.push(`Unité journalière non prise en charge pour ${requirement.nutrient_name}: ${requirement.unit}.`);
      continue;
    }

    prepared.push({
      ...requirement,
      min_value: requirement.min_value === null || requirement.min_value === undefined
        ? null : Number(requirement.min_value) / feedKgPerDay,
      max_value: requirement.max_value === null || requirement.max_value === undefined
        ? null : Number(requirement.max_value) / feedKgPerDay,
      unit: outputUnit,
      basis: 'as_fed',
      requirement_basis: 'per_kg_feed',
      original_daily_unit: requirement.unit,
      original_daily_min: requirement.min_value,
      original_daily_max: requirement.max_value
    });
  }

  return { requirements: prepared, errors: [...new Set(errors)] };
}

export function validateFormulationInputs({ ingredients, requirements }) {
  const errors = [];
  if (!ingredients?.length) errors.push('Sélectionnez au moins un ingrédient.');
  if (!requirements?.length) errors.push('Aucun besoin nutritionnel vérifié pour cette espèce, cette souche et ce stade.');
  for (const item of ingredients || []) {
    if (!(Number(item.price_per_kg) > 0)) errors.push(`Prix manquant ou nul pour ${item.name}.`);
    if (item.safety_limit_required && !item.max_inclusion_verified) {
      errors.push(`Limite de sécurité validée manquante pour ${item.name} : cet ingrédient ne peut pas entrer dans l’optimisation.`);
    }
    if (!(Number(item.max_inclusion ?? 100) >= Number(item.min_inclusion ?? 0))) {
      errors.push(`Limites d’incorporation incohérentes pour ${item.name}.`);
    }
    for (const req of requirements || []) {
      const candidates = (item.nutrients || []).filter(n => n.nutrient_code === req.nutrient_code && n.verified === true);
      const profile = candidates.find(n => n.basis === req.basis && n.unit === req.unit);
      if (!profile && !candidates.length) errors.push(`Donnée vérifiée absente : ${req.nutrient_name} pour ${item.name}.`);
      else if (!profile) errors.push(`Unité/base incompatible pour ${req.nutrient_name} dans ${item.name}; attendu ${req.unit}, ${req.basis}.`);
    }
  }
  return [...new Set(errors)];
}

/**
 * Least-cost linear formulation. Ingredient percentages are mass fractions of
 * the final feed. Only verified ingredient analyses, verified requirements and
 * compatible units/bases enter the model. Daily layer requirements are
 * converted to per-kg-feed concentrations using the flock's measured intake.
 */
export async function optimizeLeastCost({ ingredients, requirements, batchKg = 100, feedIntakeGDay = null }) {
  const normalized = prepareRequirements(requirements, feedIntakeGDay);
  if (normalized.errors.length) return { feasible: false, errors: normalized.errors, status: 'blocked' };

  const modelRequirements = normalized.requirements;
  const errors = validateFormulationInputs({ ingredients, requirements: modelRequirements });
  if (errors.length) return { feasible: false, errors, status: 'blocked' };
  if (!(Number(batchKg) > 0)) {
    return { feasible: false, errors: ['La taille du lot doit être supérieure à zéro.'], status: 'blocked' };
  }

  const constraints = { batch: { equal: 100 } };
  for (const req of modelRequirements) {
    const c = {};
    if (req.min_value !== null && req.min_value !== undefined) c.min = Number(req.min_value) * 100;
    if (req.max_value !== null && req.max_value !== undefined) c.max = Number(req.max_value) * 100;
    constraints[`nutrient_${req.nutrient_code}`] = c;
  }
  ingredients.forEach((item, index) => {
    constraints[`min_${index}`] = { min: Number(item.min_inclusion || 0) };
    constraints[`max_${index}`] = { max: Number(item.max_inclusion ?? 100) };
  });

  const variables = {};
  ingredients.forEach((item, index) => {
    const variable = {
      cost: Number(item.price_per_kg),
      batch: 1,
      [`min_${index}`]: 1,
      [`max_${index}`]: 1
    };
    for (const req of modelRequirements) {
      const nutrient = item.nutrients.find(n => n.nutrient_code === req.nutrient_code && n.verified === true && n.unit === req.unit && n.basis === req.basis);
      variable[`nutrient_${req.nutrient_code}`] = Number(nutrient.value);
    }
    variables[`ingredient_${index}`] = variable;
  });

  try {
    const { default: solver } = await import('javascript-lp-solver');
    const result = solver.Solve({ optimize: 'cost', opType: 'min', constraints, variables, timeout: 5000 });
    if (!result.feasible || result.bounded === false) {
      return {
        feasible: false,
        status: 'infeasible',
        errors: ['Aucune combinaison ne respecte toutes les contraintes. Révisez les prix, les ingrédients ou les limites documentées.']
      };
    }
    const items = ingredients.map((ingredient, index) => {
      const percent = Math.max(0, Number(result[`ingredient_${index}`] || 0));
      const quantityKg = batchKg * percent / 100;
      return {
        ingredient_id: ingredient.id,
        name: ingredient.name,
        inclusion_percent: round(percent, 4),
        quantity_kg: round(quantityKg, 4),
        price_per_kg: Number(ingredient.price_per_kg),
        line_cost: round(quantityKg * Number(ingredient.price_per_kg), 2),
        nutrients: ingredient.nutrients
      };
    }).filter(item => item.inclusion_percent > 0.0001);
    const totalCost = items.reduce((sum, item) => sum + item.line_cost, 0);
    const achieved = modelRequirements.map(req => {
      const value = items.reduce((sum, item) => {
        const nutrient = item.nutrients.find(n => n.nutrient_code === req.nutrient_code);
        return sum + item.inclusion_percent * Number(nutrient.value) / 100;
      }, 0);
      return {
        nutrient_code: req.nutrient_code,
        nutrient_name: req.nutrient_name,
        value: round(value, 4),
        min_value: req.min_value,
        max_value: req.max_value,
        unit: req.unit,
        basis: req.basis,
        source_title: req.source_title,
        original_daily_min: req.original_daily_min ?? null,
        original_daily_max: req.original_daily_max ?? null,
        original_daily_unit: req.original_daily_unit ?? null
      };
    });
    return {
      feasible: true,
      status: 'optimal',
      total_cost: round(totalCost, 2),
      cost_per_kg: round(totalCost / batchKg, 4),
      batch_kg: Number(batchKg),
      feed_intake_g_day: Number(feedIntakeGDay || 0) || null,
      items,
      achieved,
      solver: 'javascript-lp-solver 1.0.3',
      note: 'Optimisation mathématique sur les seules données vérifiées fournies. Pour les pondeuses, les besoins journaliers ont été convertis avec l’ingestion saisie. Vérifier les lots et la pertinence zootechnique avant fabrication.'
    };
  } catch (error) {
    return { feasible: false, status: 'error', errors: [error?.message || 'Erreur du solveur.'] };
  }
}
