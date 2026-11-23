
alter table public.species_requirements
  add column if not exists genotype text not null default 'generic',
  add column if not exists age_min_days integer,
  add column if not exists age_max_days integer,
  add column if not exists body_weight_min_kg numeric,
  add column if not exists body_weight_max_kg numeric,
  add column if not exists requirement_basis text not null default 'per_kg_feed',
  add column if not exists geography text not null default 'international',
  add column if not exists evidence_level text not null default 'provisional',
  add column if not exists reviewed boolean not null default false;

alter table public.ingredient_nutrients
  add column if not exists n_samples integer,
  add column if not exists standard_deviation numeric,
  add column if not exists min_value numeric,
  add column if not exists max_value numeric,
  add column if not exists geography text,
  add column if not exists is_estimated boolean not null default false,
  add column if not exists energy_system text,
  add column if not exists target_species text,
  add column if not exists genotype text,
  add column if not exists processing_state text;

alter table public.ingredient_inclusion_limits
  add column if not exists genotype text not null default 'generic',
  add column if not exists limit_type text not null default 'experimental',
  add column if not exists geography text not null default 'international',
  add column if not exists evidence_level text not null default 'low',
  add column if not exists sample_size integer,
  add column if not exists conditions text,
  add column if not exists adverse_effects text;

alter table public.formulas
  add column if not exists genotype text not null default 'generic',
  add column if not exists body_weight_kg numeric,
  add column if not exists feed_intake_g_day numeric;

alter table public.nutrition_references
  add column if not exists source_status text not null default 'to_review',
  add column if not exists last_reviewed_on date,
  add column if not exists citation_notes text;

create table if not exists public.feed_nutrient_definitions (
  code text primary key,
  name_fr text not null,
  name_en text,
  unit text not null,
  basis text not null default 'as_fed',
  nutrient_group text not null,
  energy_system text,
  applicable_species text[] not null default '{}',
  description text,
  created_at timestamptz not null default now()
);
alter table public.feed_nutrient_definitions enable row level security;
grant select on public.feed_nutrient_definitions to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='feed_nutrient_definitions' and policyname='Authenticated users can read nutrient definitions') then
    create policy "Authenticated users can read nutrient definitions" on public.feed_nutrient_definitions for select to authenticated using (true);
  end if;
end $$;

create table if not exists public.ingredient_safety_analyses (
  id uuid primary key default gen_random_uuid(),
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  analyte_code text not null,
  analyte_name text not null,
  value numeric not null check (value >= 0),
  unit text not null,
  basis text not null default 'as_fed' check (basis in ('as_fed','dry_matter','unspecified')),
  sample_location text,
  sample_date date,
  sample_code text,
  analytical_method text,
  source_title text,
  source_url text,
  reviewed boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.ingredient_safety_analyses enable row level security;
grant select on public.ingredient_safety_analyses to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ingredient_safety_analyses' and policyname='Authenticated users can read safety analyses') then
    create policy "Authenticated users can read safety analyses" on public.ingredient_safety_analyses for select to authenticated using (true);
  end if;
end $$;

create index if not exists idx_species_requirements_context on public.species_requirements(species, genotype, stage, verified);
create index if not exists idx_ingredient_nutrients_context on public.ingredient_nutrients(ingredient_id, nutrient_code, verified);
create index if not exists idx_inclusion_limits_context on public.ingredient_inclusion_limits(ingredient_id, species, genotype, stage, verified);
create index if not exists idx_safety_analyses_ingredient on public.ingredient_safety_analyses(ingredient_id, analyte_code);
