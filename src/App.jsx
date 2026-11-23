import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { optimizeLeastCost } from './lib/formulation';
import './style.css';

const species = [
  { id: 'broiler', name: 'Poulets de chair', genotypes: ['Ross 308 (>3,5 kg cible)', 'Cobb 500', 'Hubbard Flex', 'Autre souche commerciale'], stages: ['Démarrage', 'Croissance', 'Finition 1', 'Finition 2', 'Finition 3'], icon: '🐔' },
  { id: 'layers', name: 'Poules pondeuses commerciales', genotypes: ['Hy-Line Brown', 'ISA Brown', 'Lohmann Brown', 'Bovans Brown', 'Autre souche commerciale'], stages: ['Ponte pic', 'Ponte 2', 'Ponte 3', 'Ponte 4', 'Ponte 5'], icon: '🥚' },
  { id: 'local_barred_layer', name: 'Poules locales barrées', genotypes: ['Poule barrée locale camerounaise'], stages: ['Ponte (19–65 semaines) – Hautes Terres de l’Ouest'], icon: '🐓' },
  { id: 'local_chicken', name: 'Poulets locaux (chair)', genotypes: ['Poulet local non amélioré', 'Poulet local sélectionné / croisé'], stages: ['Démarrage', 'Croissance', 'Finition'], icon: '🐓' },
  { id: 'pigs', name: 'Porcs', genotypes: ['Race locale camerounaise', 'Croisé amélioré (Large White × Landrace)', 'DanBred'], stages: ['6–9 kg', '9–15 kg', '15–30 kg', '30–60 kg', '60–115 kg', '75–115 kg', 'Cochette', 'Truie gestante', 'Truie allaitante'], icon: '🐖' },
  { id: 'rabbits', name: 'Lapins', genotypes: ['Néo-Zélandais blanc', 'Californien', 'Croisé', 'Population locale'], stages: ['Croissance/engraissement', 'Entretien', 'Gestation', 'Lactation'], icon: '🐇' }
];
const OFFLINE_KEY = 'feedform_offline_queue_v1';
const CATALOG_KEY = 'feedform_catalog_cache_v1';
const readCatalog = () => { try { return JSON.parse(localStorage.getItem(CATALOG_KEY) || 'null'); } catch { return null; } };
const money = value => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' FCFA';
const readQueue = () => { try { return JSON.parse(localStorage.getItem(OFFLINE_KEY) || '[]'); } catch { return []; } };

export default function App() {
  const [mode, setMode] = useState('simple');
  const [page, setPage] = useState('Accueil');
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [ingredients, setIngredients] = useState([]);
  const [nutrients, setNutrients] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [references, setReferences] = useState([]);
  const [limits, setLimits] = useState([]);
  const [prices, setPrices] = useState({});
  const [formulas, setFormulas] = useState([]);
  const [pendingCount, setPendingCount] = useState(readQueue().length);
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [animal, setAnimal] = useState('broiler');
  const [genotype, setGenotype] = useState('Ross 308 (>3,5 kg cible)');
  const [feedIntakeGDay, setFeedIntakeGDay] = useState('110');
  const [stage, setStage] = useState('Démarrage');
  const [batchKg, setBatchKg] = useState('100');
  const [selected, setSelected] = useState([]);
  const [priceDraft, setPriceDraft] = useState({});
  const [capDraft, setCapDraft] = useState({});
  const [result, setResult] = useState(null);
  const [formulaTitle, setFormulaTitle] = useState('Nouvelle formule');

  const activeSpecies = species.find(s => s.id === animal) || species[0];
  const filteredIngredients = useMemo(() => ingredients.filter(i => (i.name + ' ' + i.category).toLowerCase().includes(query.toLowerCase())), [ingredients, query]);
  const selectedIngredients = useMemo(() => selected.map(id => {
    const item = ingredients.find(i => i.id === id);
    if (!item) return null;
    const limit = limits.find(l => l.ingredient_id === id && l.species === animal && l.stage === stage && (l.genotype === genotype || l.genotype === 'generic') && l.verified);
    return {
      ...item,
      price_per_kg: Number(priceDraft[id] ?? prices[id] ?? 0),
      min_inclusion: Number(limit?.min_percent ?? 0),
      max_inclusion: limit ? Math.min(Number(capDraft[id] ?? limit.max_percent), Number(limit.max_percent)) : Number(capDraft[id] ?? 100),
      max_inclusion_verified: Boolean(limit),
      nutrients: nutrients.filter(n => n.ingredient_id === id),
    };
  }).filter(Boolean), [selected, ingredients, limits, animal, genotype, stage, priceDraft, prices, capDraft, nutrients]);

  const loadWorkspace = useCallback(async currentUser => {
    if (!supabase || !currentUser) return;
    const [iRes, nRes, rRes, lRes, pRes, fRes, refRes] = await Promise.all([
      supabase.from('ingredients').select('*').eq('is_published', true).order('name'),
      supabase.from('ingredient_nutrients').select('*'),
      supabase.from('species_requirements').select('*'),
      supabase.from('ingredient_inclusion_limits').select('*').eq('verified', true),
      supabase.from('ingredient_prices').select('*').eq('user_id', currentUser.id).order('observed_on', { ascending: false }),
      supabase.from('formulas').select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: false }),
      supabase.from('nutrition_references').select('*').order('publication_year', { ascending: false })
    ]);
    const firstError = [iRes, nRes, rRes, lRes, pRes, fRes, refRes].find(x => x.error);
    if (firstError) {
      const cached = readCatalog();
      if (cached) {
        setIngredients(cached.ingredients || []); setNutrients(cached.nutrients || []);
        setRequirements(cached.requirements || []); setLimits(cached.limits || []); setReferences(cached.references || []);
        setNotice('Mode hors connexion : bibliothèque locale chargée. Les données seront actualisées au retour du réseau.');
      } else setNotice('Certaines données n’ont pas pu être synchronisées : ' + firstError.error.message);
      return;
    }
    const catalogSnapshot = { ingredients: iRes.data || [], nutrients: nRes.data || [], requirements: rRes.data || [], limits: lRes.data || [], references: refRes.data || [] };
    localStorage.setItem(CATALOG_KEY, JSON.stringify(catalogSnapshot));
    setIngredients(catalogSnapshot.ingredients);
    setNutrients(catalogSnapshot.nutrients);
    setRequirements(catalogSnapshot.requirements);
    setLimits(catalogSnapshot.limits);
    setReferences(catalogSnapshot.references);
    const priceMap = {};
    (pRes.data || []).forEach(p => { if (!(p.ingredient_id in priceMap)) priceMap[p.ingredient_id] = p.price_per_kg; });
    setPrices(priceMap);
    const formulaRows = fRes.data || [];
    if (formulaRows.length) {
      const ids = formulaRows.map(f => f.id);
      const { data: itemRows, error } = await supabase.from('formula_items').select('*, ingredients(name)').in('formula_id', ids);
      if (!error) setFormulas(formulaRows.map(f => ({ ...f, items: (itemRows || []).filter(x => x.formula_id === f.id) })));
      else setFormulas(formulaRows);
    } else setFormulas([]);
  }, []);

  const syncQueue = useCallback(async currentUser => {
    if (!supabase || !currentUser || !navigator.onLine) return;
    const queue = readQueue();
    if (!queue.length) { setPendingCount(0); return; }
    const remaining = [];
    for (const draft of queue) {
      const { data: formula, error } = await supabase.from('formulas').insert({
        user_id: currentUser.id, title: draft.title, species: draft.species, genotype: draft.genotype || 'generic', stage: draft.stage,
        feed_intake_g_day: draft.feed_intake_g_day || null,
        batch_kg: draft.batch_kg, currency: 'XAF', total_cost: draft.total_cost,
        cost_per_kg: draft.cost_per_kg, solver_status: draft.solver_status,
        model_snapshot: draft.model_snapshot, notes: draft.notes || null
      }).select().single();
      if (error) { remaining.push(draft); continue; }
      if (draft.items?.length) {
        const rows = draft.items.map(item => ({ ...item, formula_id: formula.id, user_id: currentUser.id }));
        const { error: itemError } = await supabase.from('formula_items').insert(rows);
        if (itemError) {
          await supabase.from('formulas').delete().eq('id', formula.id).eq('user_id', currentUser.id);
          remaining.push(draft);
        }
      }
    }
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(remaining));
    setPendingCount(remaining.length);
    if (remaining.length < queue.length) {
      setNotice('Synchronisation terminée : vos formules hors connexion sont maintenant enregistrées.');
      await loadWorkspace(currentUser);
    }
  }, [loadWorkspace]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) loadWorkspace(data.session.user);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        window.setTimeout(() => { loadWorkspace(nextSession.user); syncQueue(nextSession.user); }, 0);
      } else {
        setIngredients([]); setNutrients([]); setRequirements([]); setLimits([]); setReferences([]); setPrices({}); setFormulas([]);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadWorkspace, syncQueue]);

  useEffect(() => {
    if (!session?.user) return;
    const handleOnline = () => syncQueue(session.user);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [session, syncQueue]);

  async function handleAuth(event) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setAuthMessage('');
    const response = authMode === 'signup'
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (response.error) setAuthMessage(response.error.message);
    else if (authMode === 'signup' && !response.data.session) setAuthMessage('Compte créé. Consultez votre e-mail pour confirmer votre adresse, puis connectez-vous.');
    else setAuthMessage('Connexion réussie.');
  }

  async function savePrice(ingredientId, value) {
    const amount = Number(value);
    if (!session?.user || !amount || amount < 0 || !supabase) return;
    const { error } = await supabase.from('ingredient_prices').upsert({
      user_id: session.user.id, ingredient_id: ingredientId, price_per_kg: amount, currency: 'XAF', observed_on: new Date().toISOString().slice(0, 10)
    }, { onConflict: 'user_id,ingredient_id,observed_on' });
    if (error) setNotice('Prix non enregistré : ' + error.message);
    else { setPrices(v => ({ ...v, [ingredientId]: amount })); setNotice('Prix enregistré.'); }
  }

  async function runOptimizer() {
    const verifiedRequirements = requirements.filter(r =>
      r.species === animal && r.stage === stage && r.verified &&
      (r.genotype === genotype || r.genotype === 'generic')
    );
    const output = await optimizeLeastCost({
      ingredients: selectedIngredients,
      requirements: verifiedRequirements,
      batchKg: Number(batchKg),
      feedIntakeGDay: animal === 'layers' ? Number(feedIntakeGDay) : null
    });
    setResult(output);
    if (output.feasible) setNotice('Solution mathématique trouvée. Vérifiez les lots et les consignes du nutritionniste avant fabrication.');
    else setNotice('Optimisation bloquée : les données ou contraintes vérifiées sont encore incomplètes.');
  }

  function buildDraft() {
    const chosenItems = result?.feasible ? result.items : selectedIngredients.map(item => ({
      ingredient_id: item.id, inclusion_percent: 0, quantity_kg: 0, price_per_kg: Number(item.price_per_kg || 0), line_cost: 0, nutrient_snapshot: {}
    }));
    const itemRows = chosenItems.map(item => ({
      ingredient_id: item.ingredient_id,
      inclusion_percent: Number(item.inclusion_percent || 0),
      quantity_kg: Number(item.quantity_kg || 0),
      price_per_kg: Number(item.price_per_kg || 0),
      line_cost: Number(item.line_cost || 0),
      nutrient_snapshot: item.nutrients ? Object.fromEntries(item.nutrients.map(n => [n.nutrient_code, { value: n.value, unit: n.unit, basis: n.basis, source: n.source_title }])) : (item.nutrient_snapshot || {})
    }));
    return {
      title: formulaTitle.trim() || 'Formule sans titre', species: animal, genotype, stage,
      feed_intake_g_day: animal === 'layers' ? Number(feedIntakeGDay || 0) : null,
      batch_kg: Number(batchKg || 100),
      total_cost: result?.feasible ? result.total_cost : null,
      cost_per_kg: result?.feasible ? result.cost_per_kg : null,
      solver_status: result?.feasible ? 'optimal' : (result?.status === 'infeasible' ? 'infeasible' : 'unverified'),
      model_snapshot: result || { status: 'draft', selected_ingredients: selectedIngredients.map(i => i.name) },
      items: itemRows, notes: result?.note || 'Brouillon : données nutritionnelles ou contraintes à compléter.'
    };
  }

  async function saveFormula() {
    if (!selected.length) { setNotice('Sélectionnez au moins un ingrédient avant de sauvegarder.'); return; }
    const draft = buildDraft();
    if (!navigator.onLine || !supabase || !session?.user) {
      const queue = readQueue(); queue.unshift(draft); localStorage.setItem(OFFLINE_KEY, JSON.stringify(queue));
      setPendingCount(queue.length);
      setFormulas(v => [{ ...draft, id: 'local-' + Date.now(), local: true }, ...v]);
      setNotice('Formule enregistrée sur cet appareil. Elle sera synchronisée après connexion à votre compte et à Internet.');
      return;
    }
    setBusy(true);
    const { data: formula, error } = await supabase.from('formulas').insert({
      user_id: session.user.id, title: draft.title, species: draft.species, genotype: draft.genotype || 'generic', stage: draft.stage,
      feed_intake_g_day: draft.feed_intake_g_day || null, batch_kg: draft.batch_kg,
      currency: 'XAF', total_cost: draft.total_cost, cost_per_kg: draft.cost_per_kg,
      solver_status: draft.solver_status, model_snapshot: draft.model_snapshot, notes: draft.notes
    }).select().single();
    if (error) { setBusy(false); setNotice('Sauvegarde impossible : ' + error.message); return; }
    const rows = draft.items.map(item => ({ ...item, formula_id: formula.id, user_id: session.user.id }));
    if (rows.length) {
      const { error: itemError } = await supabase.from('formula_items').insert(rows);
      if (itemError) { await supabase.from('formulas').delete().eq('id', formula.id); setBusy(false); setNotice('Formule non finalisée : ' + itemError.message); return; }
    }
    setBusy(false); setNotice('Formule enregistrée et synchronisée.'); await loadWorkspace(session.user);
  }

  const openFormula = formula => {
    const savedSpecies = species.find(s => s.id === formula.species) || species[0];
    setAnimal(formula.species); setGenotype(formula.genotype || savedSpecies.genotypes[0]); setStage(formula.stage);
    setFeedIntakeGDay(String(formula.feed_intake_g_day || 110)); setBatchKg(String(formula.batch_kg));
    setFormulaTitle(formula.title); setResult(formula.model_snapshot?.feasible ? formula.model_snapshot : null);
    setPage('Formuler');
  };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">F</div>
      <div className="brand"><strong>FEEDFORM</strong><span>by Kenfack Sobtia</span></div>
      <button className="mode-switch" onClick={() => setMode(mode === 'simple' ? 'expert' : 'simple')}>{mode === 'simple' ? 'Mode simple' : 'Mode expert'} <span>⇄</span></button>
    </header>
    <div className="intro"><div className="eyebrow">NUTRITION ANIMALE · AFRIQUE CENTRALE & OUEST</div><h1>Formulez mieux.<br/><em>Nourrissez durablement.</em></h1><p>Un outil d’aide à la formulation adapté aux matières premières locales.</p></div>

    {!session?.user ? <section className="panel auth-panel">
      <span className="eyebrow">ESPACE PERSONNEL ET SYNCHRONISATION</span><h2>{authMode === 'login' ? 'Connectez-vous à FEEDFORM' : 'Créer votre compte'}</h2>
      <p className="muted">La connexion permet de retrouver vos prix et vos formules sur vos différents appareils.</p>
      <form onSubmit={handleAuth}>
        <label>Adresse e-mail<input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="nom@exemple.com"/></label>
        <label>Mot de passe<input type="password" required minLength={6} value={password} onChange={e => setPassword(e.target.value)} placeholder="Au moins 6 caractères"/></label>
        <button className="primary-button" disabled={busy}>{busy ? 'Patientez…' : authMode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
      </form>
      <button className="text-button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthMessage(''); }}>{authMode === 'login' ? 'Créer un compte' : 'J’ai déjà un compte'}</button>
      {authMessage && <p className="status-text">{authMessage}</p>}
      {!isSupabaseConfigured && <p className="status-text">Configuration Supabase en attente.</p>}
      <p className="tiny-note">Vous pouvez préparer un brouillon hors connexion. La synchronisation cloud nécessite un compte.</p>
    </section> : <>
      <div className="account-bar"><span>Connecté : <strong>{session.user.email}</strong></span><span className="sync-state">{navigator.onLine ? '● En ligne' : '○ Hors ligne'} · {pendingCount} en attente</span><button onClick={() => supabase.auth.signOut()}>Déconnexion</button></div>
      <nav className="nav">{['Accueil','Formuler','Ingrédients','Références','Mes formules'].map(n => <button key={n} className={page === n ? 'active' : ''} onClick={() => setPage(n)}>{n}</button>)}</nav>
      <main>
        {page === 'Accueil' && <>
          <section className="section-head"><div><span className="eyebrow">VOTRE ESPACE DE TRAVAIL</span><h2>Que souhaitez-vous faire ?</h2></div><span className="offline"><i/> {navigator.onLine ? 'Synchronisation disponible' : 'Mode hors connexion'}</span></section>
          <div className="action-grid">
            <button className="action-card primary" onClick={() => setPage('Formuler')}><span className="action-icon">＋</span><strong>Nouvelle formulation</strong><small>Construire une ration selon l’espèce et le stade</small><b>Commencer →</b></button>
            <button className="action-card" onClick={() => setPage('Ingrédients')}><span className="action-icon">▤</span><strong>Bibliothèque d’ingrédients</strong><small>Fiches, sources, précautions et composition</small><b>Explorer →</b></button>
            <button className="action-card" onClick={() => setPage('Références')}><span className="action-icon">📚</span><strong>Bibliothèque scientifique</strong><small>Études camerounaises et références nutritionnelles</small><b>Consulter →</b></button>
          </div>
          <section className="notice"><span>ⓘ</span><div><strong>Moteur prudent et documenté</strong><p>Le calcul au moindre coût n’utilise que des compositions et besoins nutritionnels marqués comme vérifiés, avec unités et bases compatibles. Les données non validées restent visibles mais ne sont pas utilisées dans l’optimisation.</p></div></section>
          <section className="section-head"><div><span className="eyebrow">ESPÈCES PRÉVUES</span><h2>Choisissez votre production</h2></div></section>
          <div className="species-grid">{species.map(s => <button key={s.id} className="species-card" onClick={() => { setAnimal(s.id); setGenotype(s.genotypes[0]); setStage(s.stages[0]); setPage('Formuler'); }}><span>{s.icon}</span><strong>{s.name}</strong><small>{s.stages.length} stades</small></button>)}</div>
        </>}
        {page === 'Formuler' && <section className="panel wide-panel">
          <span className="eyebrow">OPTIMISATION AU MOINDRE COÛT</span><h2>Paramètres de formulation</h2>
          <div className="form-grid">
            <label>Espèce<select value={animal} onChange={e => { const next = species.find(s => s.id === e.target.value); setAnimal(e.target.value); setGenotype(next.genotypes[0]); setStage(next.stages[0]); setResult(null); }}>{species.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Souche / type génétique<select value={genotype} onChange={e => { setGenotype(e.target.value); setResult(null); }}>{activeSpecies.genotypes.map(g => <option key={g} value={g}>{g}</option>)}</select></label>
            <label>Stade<select value={stage} onChange={e => { setStage(e.target.value); setResult(null); }}>{activeSpecies.stages.map(s => <option key={s}>{s}</option>)}</select></label>
            {animal === 'layers' && <label>Ingestion réelle (g/oiseau/jour)<input type="number" min="30" max="250" step="1" value={feedIntakeGDay} onChange={e => { setFeedIntakeGDay(e.target.value); setResult(null); }}/></label>}
            <label>Quantité à produire (kg)<input type="number" min="1" step="1" value={batchKg} onChange={e => setBatchKg(e.target.value)}/></label>
          </div>
          <label>Nom de la formule<input value={formulaTitle} onChange={e => setFormulaTitle(e.target.value)} placeholder="Ex. Aliment croissance - lot 1"/></label>
          <div className="section-head compact"><div><span className="eyebrow">MATIÈRES PREMIÈRES</span><h3>Choisissez les ingrédients disponibles</h3></div><span className="muted">{selected.length} sélectionné(s)</span></div>
          {ingredients.length === 0 ? <p className="muted">Chargement de la bibliothèque… Si la liste reste vide, vérifiez la connexion.</p> : <div className="ingredient-picker">{ingredients.map(item => {
            const checked = selected.includes(item.id);
            const limit = limits.find(l => l.ingredient_id === item.id && l.species === animal && l.stage === stage && (l.genotype === genotype || l.genotype === 'generic'));
            return <div className={'picker-row ' + (checked ? 'chosen' : '')} key={item.id}>
              <label className="picker-check"><input type="checkbox" checked={checked} onChange={() => { setSelected(v => checked ? v.filter(x => x !== item.id) : [...v, item.id]); setResult(null); }}/><span><strong>{item.name}</strong><small>{item.category}</small></span></label>
              {checked && <div className="picker-fields">
                <label>Prix/kg (FCFA)<input type="number" min="0" value={priceDraft[item.id] ?? prices[item.id] ?? ''} onChange={e => setPriceDraft(v => ({ ...v, [item.id]: e.target.value }))} onBlur={e => savePrice(item.id, e.target.value)} placeholder="Prix local"/></label>
                {mode === 'expert' && <label>Maximum (%)<input type="number" min="0" max="100" value={capDraft[item.id] ?? limit?.max_percent ?? ''} onChange={e => setCapDraft(v => ({ ...v, [item.id]: e.target.value }))} placeholder={limit ? 'Limite source' : 'Sans validation'}/></label>}
                {item.safety_limit_required && !limit && <small className="warning-text">Limite de sécurité non documentée pour ce stade</small>}
              </div>}
            </div>;
          })}</div>}
          <div className="button-row"><button className="primary-button" onClick={runOptimizer}>Calculer au moindre coût</button><button className="secondary-button" onClick={saveFormula} disabled={busy}>{busy ? 'Sauvegarde…' : 'Enregistrer la formule'}</button></div>
          {result && <div className="result-panel">
            <h3>{result.feasible ? 'Solution optimale calculée' : 'Optimisation non disponible'}</h3>
            {result.feasible ? <>
              <div className="result-metrics"><div><small>Coût du lot</small><strong>{money(result.total_cost)}</strong></div><div><small>Coût par kg</small><strong>{money(result.cost_per_kg)}</strong></div></div>
              <div className="table-wrap"><table><thead><tr><th>Ingrédient</th><th>%</th><th>Quantité</th><th>Coût</th></tr></thead><tbody>{result.items.map(item => <tr key={item.ingredient_id}><td>{item.name}</td><td>{item.inclusion_percent.toFixed(2)}%</td><td>{item.quantity_kg.toFixed(2)} kg</td><td>{money(item.line_cost)}</td></tr>)}</tbody></table></div>
              <h4>Contrôle des contraintes nutritionnelles</h4><ul className="constraint-list">{result.achieved.map(row => <li key={row.nutrient_code}><span>{row.nutrient_name}</span><strong>{row.value} {row.unit}</strong><small>Min. {row.min_value ?? '—'} · Max. {row.max_value ?? '—'} · {row.basis === 'dry_matter' ? 'MS' : 'brut'}</small><small>Source : {row.source_title || 'Non renseignée'}</small>{row.original_daily_unit && <small>Besoin journalier source : {row.original_daily_min}–{row.original_daily_max} {row.original_daily_unit}</small>}</li>)}</ul>
              <p className="tiny-note">{result.note}</p>
            </> : <ul className="error-list">{(result.errors || []).map((error, index) => <li key={index}>{error}</li>)}</ul>}
          </div>}
          <p className="tiny-note">Les besoins des pondeuses sont exprimés par oiseau et par jour puis convertis en concentrations selon l’ingestion réelle saisie. Les références par souche ne sont pas interchangeables. Les prix sont propres à votre compte; un plafond manuel ne remplace jamais une limite de sécurité documentée.</p>
        </section>}
        {page === 'Ingrédients' && <section className="panel wide-panel">
          <span className="eyebrow">MATIÈRES PREMIÈRES RÉGIONALES</span><h2>Bibliothèque documentée</h2>
          <p className="muted">Chaque fiche sépare les précautions d’utilisation des résultats analytiques. Les compositions et leurs sources seront affichées ici lorsqu’elles seront enregistrées.</p>
          <input className="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Rechercher un ingrédient…"/>
          <div className="ingredient-list">{filteredIngredients.map(item => {
            const data = nutrients.filter(n => n.ingredient_id === item.id);
            return <button className="ingredient-card" key={item.id} onClick={() => setDetail(item)}><span><strong>{item.name}</strong><small>{item.category}</small><em>{data.filter(n => n.verified).length} donnée(s) vérifiée(s) · {data.length} documentée(s)</em></span><b>Voir la fiche →</b></button>;
          })}</div>
          {detail && <div className="detail-card"><button className="close-button" onClick={() => setDetail(null)}>Fermer ✕</button><h3>{detail.name}</h3><p>{detail.description || 'Description générale à compléter.'}</p><p><strong>Traitement :</strong> {detail.processing_notes || 'Non documenté.'}</p><p><strong>Précautions :</strong> {detail.safety_notes || 'Aucune précision enregistrée.'}</p><p><strong>Facteurs antinutritionnels / risques :</strong> {detail.anti_nutritional_factors || 'Non documentés.'}</p><p><strong>Contexte régional :</strong> {detail.region_notes || 'À préciser par zone et saison.'}</p><h4>Composition enregistrée</h4>
            {nutrients.filter(n => n.ingredient_id === detail.id).length ? <div className="table-wrap"><table><thead><tr><th>Paramètre</th><th>Valeur</th><th>Base</th><th>Source</th><th>Statut</th></tr></thead><tbody>{nutrients.filter(n => n.ingredient_id === detail.id).map(n => <tr key={n.id}><td>{n.nutrient_name}</td><td>{n.value} {n.unit}</td><td>{n.basis === 'dry_matter' ? 'MS' : n.basis === 'as_fed' ? 'Produit brut' : 'Non précisée'}</td><td>{n.source_title}{n.source_year ? ' (' + n.source_year + ')' : ''}{n.source_cell ? ' · cellule ' + n.source_cell : ''}</td><td>{n.verified ? 'Vérifiée' : 'À vérifier'}</td></tr>)}</tbody></table></div> : <p className="muted">Aucune analyse nutritionnelle vérifiée n’est encore enregistrée pour cet ingrédient.</p>}
          </div>}
        </section>}
        {page === 'Références' && <section className="panel wide-panel"><span className="eyebrow">BASE SCIENTIFIQUE CAMEROUNAISE</span><h2>Références et bibliographie</h2><p className="muted">Les études locales sont classées selon leur type de preuve. Un essai expérimental ou une enquête de terrain n’est pas automatiquement une norme nutritionnelle ni une limite d’incorporation.</p><div className="saved-list">{references.map(ref => <article className="detail-card" key={ref.id}><div className="section-head compact"><div><strong>{ref.title}</strong><small>{ref.authors || 'Auteurs non renseignés'} · {ref.publication_year || 'Année non renseignée'}</small></div><span className="offline">{ref.geography}</span></div><p><strong>Publication :</strong> {ref.publication || 'Non renseignée'}</p><p><strong>Espèces :</strong> {(ref.species || []).join(', ') || 'Non précisées'}</p><p><strong>Type de preuve :</strong> {({ official_guide: 'Guide officiel de souche', draft_standard: 'Projet de norme (non adopté)', scientific_standard: 'Référence scientifique', controlled_trial: 'Essai expérimental', field_survey: 'Enquête de terrain' }[ref.source_kind] || ref.source_kind)}</p><p><strong>Statut documentaire :</strong> {ref.source_status === 'draft' ? 'Projet non adopté — ne pas utiliser comme norme' : ref.source_status === 'source_checked' ? 'Source consultée et référencée' : 'À examiner'}</p><p><strong>Portée :</strong> {ref.evidence_scope}</p><p><strong>Résultats utiles :</strong> {ref.key_findings}</p><p><strong>Limites d’interprétation :</strong> {ref.limitations}</p>{ref.doi && <p><strong>DOI :</strong> {ref.doi}</p>}{ref.source_url && <a href={ref.source_url} target="_blank" rel="noreferrer">Consulter la publication →</a>}</article>)}{references.length === 0 && <p className="muted">Aucune référence disponible hors connexion ou dans la base actuelle.</p>}</div></section>}
        {page === 'Mes formules' && <section className="panel wide-panel"><span className="eyebrow">VOTRE HISTORIQUE</span><h2>Mes formules</h2><p className="muted">Vos formules cloud et brouillons enregistrés sur cet appareil.</p>
          {formulas.length === 0 && pendingCount === 0 ? <p className="muted">Aucune formule enregistrée pour le moment.</p> : <div className="saved-list">{formulas.map(formula => <div className="saved-card" key={formula.id}><div><strong>{formula.title}</strong><small>{species.find(s => s.id === formula.species)?.name || formula.species} · {formula.stage} · {formula.batch_kg} kg</small><small>{formula.local ? 'Sur cet appareil, en attente de synchronisation' : formula.solver_status === 'optimal' ? 'Optimisée' : 'Brouillon / données à vérifier'}</small></div><div><strong>{formula.total_cost ? money(formula.total_cost) : 'Coût non calculé'}</strong><button onClick={() => openFormula(formula)}>Ouvrir</button></div></div>)}</div>}
          {pendingCount > 0 && <button className="secondary-button" onClick={() => session?.user && syncQueue(session.user)}>Synchroniser {pendingCount} brouillon(s)</button>}
        </section>}
      </main>
    </>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button onClick={() => setNotice('')}>✕</button></div>}
    <footer><strong>FEEDFORM</strong><span>Formulation documentée · Sauvegarde personnelle · Synchronisation</span></footer>
  </div>;
}
