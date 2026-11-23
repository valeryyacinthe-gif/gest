
with raw as (
 select id,slug from public.ingredients where slug in ('maize','wheat-grain','wheat-bran','palm-kernel-cake','sunflower-meal')
),
limits as (
 select * from (values
  ('maize','60–115 kg',40::numeric,'Maize / corn'),
  ('maize','75–115 kg',40::numeric,'Maize / corn'),
  ('wheat-grain','60–115 kg',70::numeric,'Wheat grain'),
  ('wheat-grain','75–115 kg',70::numeric,'Wheat grain'),
  ('wheat-bran','60–115 kg',20::numeric,'Wheat bran'),
  ('wheat-bran','75–115 kg',20::numeric,'Wheat bran'),
  ('palm-kernel-cake','60–115 kg',10::numeric,'Palm kernel cake / expeller'),
  ('palm-kernel-cake','75–115 kg',10::numeric,'Palm kernel cake / expeller'),
  ('sunflower-meal','60–115 kg',15::numeric,'Sunflower meal'),
  ('sunflower-meal','75–115 kg',15::numeric,'Sunflower meal')
 ) as x(slug,stage,max_percent,source_ingredient_name)
)
insert into public.ingredient_inclusion_limits
(ingredient_id,species,genotype,stage,min_percent,max_percent,source_title,source_url,verified,notes,limit_type,geography,evidence_level,conditions,adverse_effects)
select i.id,'pigs','DanBred',l.stage,0,l.max_percent,
'DanBred Pig Manual – Usage Rate of Feed Ingredients',
'https://danbred-manual.com/en/pig-finisher-manual/feeding-and-growth-performance/',
true,
concat('Plafond conseillé par DanBred pour les finishers au-dessus de 40 kg; maximum d’utilisation rapporté dans le contexte DanBred, pas une recommandation universelle. Ingrédient : ',l.source_ingredient_name,'.'),
'advised_maximum','International','official_breeder_guide',
'Finishers above 40 kg; applies to DanBred feeding context only.',
'Exceeding the source maximum is not supported by this guide.'
from limits l join raw i on i.slug=l.slug
where not exists(
 select 1 from public.ingredient_inclusion_limits x
 where x.ingredient_id=i.id and x.species='pigs' and x.genotype='DanBred' and x.stage=l.stage
 and x.source_title='DanBred Pig Manual – Usage Rate of Feed Ingredients'
);
