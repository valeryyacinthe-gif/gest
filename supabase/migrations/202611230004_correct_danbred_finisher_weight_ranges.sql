
update public.species_requirements
set stage='60–115 kg',
    body_weight_max_kg=115,
    min_value=case nutrient_code
      when 'protein_SID_pig' then 121
      when 'lysine_SID_pig' then 7.8
      when 'phosphorus_digestible_pig' then 2.2
      when 'calcium' then 0.70
      else min_value end,
    max_value=case nutrient_code
      when 'protein_SID_pig' then 121
      when 'lysine_SID_pig' then 7.8
      when 'phosphorus_digestible_pig' then 2.2
      when 'calcium' then 0.70
      else max_value end,
    notes='Référence DanBred, plage de poids 60–115 kg telle qu’indiquée dans le manuel; SID = standardized ileal digestible.'
where species='pigs' and genotype='DanBred' and stage='60–110 kg';

with v(nutrient_code,nutrient_name,value,unit) as (
 values
 ('ME_pig','Énergie métabolisable',13.1,'MJ/kg'),
 ('NE_pig','Énergie nette',9.3,'MJ/kg'),
 ('protein_SID_pig','Protéines SID minimales',117,'g/kg'),
 ('lysine_SID_pig','Lysine SID',7.5,'g/kg'),
 ('phosphorus_digestible_pig','Phosphore digestible',2.1,'g/kg'),
 ('calcium','Calcium sans phytase',0.69,'%')
)
insert into public.species_requirements
(species,genotype,stage,nutrient_code,nutrient_name,min_value,max_value,unit,basis,requirement_basis,source_title,source_url,verified,evidence_level,notes,body_weight_min_kg,body_weight_max_kg,geography,reviewed)
select 'pigs','DanBred','75–115 kg',v.nutrient_code,v.nutrient_name,v.value,v.value,v.unit,'as_fed','per_kg_feed',
'DanBred Feeding and Growth Performance – finisher table',
'https://danbred-manual.com/en/pig-finisher-manual/feeding-and-growth-performance/',
true,'official_breeder_guide','Plage 75–115 kg, distincte de 60–115 kg dans le manuel DanBred; SID = standardized ileal digestible.',
75,115,'International',true
from v
where not exists(select 1 from public.species_requirements x where x.species='pigs' and x.genotype='DanBred' and x.stage='75–115 kg' and x.nutrient_code=v.nutrient_code and x.source_title='DanBred Feeding and Growth Performance – finisher table');
