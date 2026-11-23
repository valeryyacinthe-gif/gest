
insert into public.feed_nutrient_definitions
(code,name_fr,name_en,unit,basis,nutrient_group,energy_system,applicable_species,description)
values
('lysine_SID_layer','Lysine SID – pondeuse','SID lysine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Lysine digestible iléale standardisée; besoin journalier converti par ingestion.'),
('methionine_SID_layer','Méthionine SID – pondeuse','SID methionine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Méthionine SID; besoin journalier converti par ingestion.'),
('methionine_cystine_SID_layer','Méthionine + cystine SID – pondeuse','SID methionine+cystine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Acides aminés soufrés SID; besoin journalier converti par ingestion.'),
('threonine_SID_layer','Thréonine SID – pondeuse','SID threonine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Thréonine SID; besoin journalier converti par ingestion.'),
('tryptophan_SID_layer','Tryptophane SID – pondeuse','SID tryptophan layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Tryptophane SID; besoin journalier converti par ingestion.'),
('arginine_SID_layer','Arginine SID – pondeuse','SID arginine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Arginine SID; besoin journalier converti par ingestion.'),
('isoleucine_SID_layer','Isoleucine SID – pondeuse','SID isoleucine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Isoleucine SID; besoin journalier converti par ingestion.'),
('valine_SID_layer','Valine SID – pondeuse','SID valine layer','mg/kg','as_fed','amino_acid',null,array['layers']::text[],'Valine SID; besoin journalier converti par ingestion.'),
('crude_protein_layer','Protéines brutes – pondeuse','Crude protein layer','g/kg','as_fed','proximate',null,array['layers']::text[],'Besoin journalier de protéines converti en concentration selon l’ingestion.'),
('sodium_layer','Sodium – pondeuse','Sodium layer','mg/kg','as_fed','mineral',null,array['layers']::text[],'Besoin journalier de sodium converti en concentration.'),
('chloride_layer','Chlorure – pondeuse','Chloride layer','mg/kg','as_fed','mineral',null,array['layers']::text[],'Besoin journalier de chlorure converti en concentration.'),
('linoleic_acid_layer','Acide linoléique – pondeuse','Linoleic acid layer','g/kg','as_fed','fatty_acid',null,array['layers']::text[],'Besoin journalier d’acide linoléique converti en concentration.'),
('choline_layer','Choline – pondeuse','Choline layer','mg/kg','as_fed','vitamin',null,array['layers']::text[],'Besoin journalier de choline converti en concentration.')
on conflict (code) do update set name_fr=excluded.name_fr,name_en=excluded.name_en,unit=excluded.unit,basis=excluded.basis,nutrient_group=excluded.nutrient_group,applicable_species=excluded.applicable_species,description=excluded.description;

with v(stage,protein,sodium,chloride,linoleic,choline) as (
 values
 ('Ponte pic',18.25,180,180,2.00,160),
 ('Ponte 2',17.85,170,170,2.00,180),
 ('Ponte 3',17.42,170,170,1.60,180),
 ('Ponte 4',16.30,170,170,1.50,180),
 ('Ponte 5',15.50,170,170,1.40,180)
),
r as (
 select v.stage, x.nutrient_code,x.nutrient_name,x.value,x.unit
 from v
 cross join lateral (values
  ('crude_protein_layer','Protéines brutes',v.protein,'g/bird/day'),
  ('sodium_layer','Sodium',v.sodium,'mg/bird/day'),
  ('chloride_layer','Chlorure',v.chloride,'mg/bird/day'),
  ('linoleic_acid_layer','Acide linoléique',v.linoleic,'g/bird/day'),
  ('choline_layer','Choline',v.choline,'mg/bird/day')
 ) x(nutrient_code,nutrient_name,value,unit)
)
insert into public.species_requirements
(species,genotype,stage,nutrient_code,nutrient_name,min_value,max_value,unit,basis,requirement_basis,source_title,source_url,source_year,verified,evidence_level,notes,geography,reviewed)
select 'layers','Hy-Line Brown',r.stage,r.nutrient_code,r.nutrient_name,r.value,r.value,r.unit,'as_fed','per_animal_day',
'Hy-Line Brown Commercial Layers – International Standards, January 2024',
'https://www.hylinesa.co.za/sitepad-data/uploads/2025/04/HL-Brown-Commercial-Layers-Jan-2024.pdf',
2024,false,'official_breeder_guide_partial',
'Valeur journalière du guide. Le jeu de besoins reste désactivé dans le solveur tant que les besoins calcium/phosphore liés à l’âge et les contrôles minéraux complets ne sont pas couplés.',
'International',true
from r
where not exists(select 1 from public.species_requirements x where x.species='layers' and x.genotype='Hy-Line Brown' and x.stage=r.stage and x.nutrient_code=r.nutrient_code and x.source_title='Hy-Line Brown Commercial Layers – International Standards, January 2024');

update public.species_requirements
set verified=false,
    evidence_level='official_breeder_guide_partial',
    notes=concat(coalesce(notes,''),' Jeu partiel : besoins calcium/phosphore par âge et contrôles minéraux complets non encore intégrés; non activé dans le solveur.')
where species='layers' and genotype='Hy-Line Brown' and source_title='Hy-Line Brown Commercial Layers – International Standards, January 2024';
