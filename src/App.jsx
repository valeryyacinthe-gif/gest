import React, { useMemo, useState } from 'react';
import './style.css';

const species = [
  { id:'broiler', name:'Poulets de chair', stages:['Démarrage','Croissance','Finition'], icon:'🐔' },
  { id:'layers', name:'Poules pondeuses', stages:['Poulettes','Pré-ponte','Ponte'], icon:'🥚' },
  { id:'pigs', name:'Porcs', stages:['Porcelet','Croissance','Finition','Truie'], icon:'🐖' },
  { id:'rabbits', name:'Lapins', stages:['Sevrage','Croissance','Reproduction'], icon:'🐇' },
  { id:'fish', name:'Poissons', stages:['Alevinage','Croissance','Finition'], icon:'🐟' }
];

const ingredients = [
  {name:'Maïs grain',group:'Énergie',status:'À documenter'},
  {name:'Son de blé',group:'Énergie / fibres',status:'À documenter'},
  {name:'Tourteau de soja',group:'Protéines',status:'À documenter'},
  {name:'Tourteau d’arachide',group:'Protéines',status:'Contrôle aflatoxines requis'},
  {name:'Tourteau de palmiste',group:'Fibres / énergie',status:'À documenter'},
  {name:'Manioc (racines/épluchures)',group:'Énergie',status:'Traitement requis selon matière'},
  {name:'Tourteau de coton',group:'Protéines',status:'Gossypol : contrôle requis'},
  {name:'Mucuna',group:'Protéines',status:'L-DOPA : traitement et limites requis'},
  {name:'Farine de poisson',group:'Protéines',status:'Qualité et fraîcheur à contrôler'}
];

export default function App() {
  const [mode,setMode]=useState('simple');
  const [page,setPage]=useState('Accueil');
  const [animal,setAnimal]=useState('broiler');
  const [stage,setStage]=useState('Démarrage');
  const [query,setQuery]=useState('');
  const [selected,setSelected]=useState([]);
  const active=species.find(s=>s.id===animal)||species[0];
  const filtered=useMemo(()=>ingredients.filter(i=>(i.name+' '+i.group).toLowerCase().includes(query.toLowerCase())),[query]);
  const toggle=(name)=>setSelected(v=>v.includes(name)?v.filter(x=>x!==name):[...v,name]);

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand-mark">F</div>
      <div className="brand"><strong>FEEDFORM</strong><span>by Kenfack Sobtia</span></div>
      <button className="mode-switch" onClick={()=>setMode(mode==='simple'?'expert':'simple')}>{mode==='simple'?'Mode simple':'Mode expert'} <span>⇄</span></button>
    </header>
    <div className="intro"><div className="eyebrow">NUTRITION ANIMALE · AFRIQUE CENTRALE & OUEST</div><h1>Formulez mieux.<br/><em>Nourrissez durablement.</em></h1><p>Un outil d’aide à la formulation adapté aux matières premières locales.</p></div>
    <nav className="nav">{['Accueil','Formuler','Ingrédients','Mes formules'].map(n=><button key={n} className={page===n?'active':''} onClick={()=>setPage(n)}>{n}</button>)}</nav>
    <main>
      {page==='Accueil' && <>
        <section className="section-head"><div><span className="eyebrow">VOTRE ESPACE DE TRAVAIL</span><h2>Que souhaitez-vous faire ?</h2></div><span className="offline"><i/> Utilisable hors connexion</span></section>
        <div className="action-grid">
          <button className="action-card primary" onClick={()=>setPage('Formuler')}><span className="action-icon">＋</span><strong>Nouvelle formulation</strong><small>Construire une ration selon l’espèce et le stade</small><b>Commencer →</b></button>
          <button className="action-card" onClick={()=>setPage('Ingrédients')}><span className="action-icon">▤</span><strong>Bibliothèque d’ingrédients</strong><small>Consulter les matières premières et leurs données</small><b>Explorer →</b></button>
        </div>
        <section className="notice"><span>ⓘ</span><div><strong>Base nutritionnelle en cours de validation</strong><p>Les valeurs ne seront intégrées qu’avec leur source, leur base (brut ou matière sèche) et leur niveau de fiabilité. Les formules ne seront pas présentées comme validées tant que les données ne le sont pas.</p></div></section>
        <section className="section-head"><div><span className="eyebrow">ESPÈCES PRÉVUES</span><h2>Choisissez votre production</h2></div></section>
        <div className="species-grid">{species.map(s=><button key={s.id} className="species-card" onClick={()=>{setAnimal(s.id);setStage(s.stages[0]);setPage('Formuler')}}><span>{s.icon}</span><strong>{s.name}</strong><small>{s.stages.length} stades prévus</small></button>)}</div>
      </>}
      {page==='Formuler' && <section className="panel">
        <span className="eyebrow">NOUVELLE RATION</span><h2>Paramètres de formulation</h2>
        <label>Espèce animale<select value={animal} onChange={e=>{setAnimal(e.target.value);setStage(species.find(s=>s.id===e.target.value).stages[0])}}>{species.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}</select></label>
        <label>Stade physiologique<select value={stage} onChange={e=>setStage(e.target.value)}>{active.stages.map(s=><option key={s}>{s}</option>)}</select></label>
        {mode==='expert' && <label>Objectif / contraintes techniques<textarea placeholder="Précisez le poids cible, les contraintes locales ou les recommandations du nutritionniste."/></label>}
        <div className="notice"><span>⚠</span><div><strong>Calcul nutritionnel non activé à ce stade</strong><p>Les besoins par espèce et par stade, les limites d’incorporation et les valeurs des ingrédients doivent être documentés et validés avant d’activer l’optimiseur.</p></div></div>
        <button className="primary-button" onClick={()=>setPage('Ingrédients')}>Choisir les ingrédients →</button>
      </section>}
      {page==='Ingrédients' && <section className="panel">
        <span className="eyebrow">MATIÈRES PREMIÈRES RÉGIONALES</span><h2>Bibliothèque d’ingrédients</h2><p className="muted">Sélectionnez les ingrédients disponibles dans votre zone. Les fiches techniques complètes seront ajoutées après vérification des sources.</p>
        <input className="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un ingrédient…"/>
        <div className="ingredient-list">{filtered.map(i=><label className="ingredient" key={i.name}><input type="checkbox" checked={selected.includes(i.name)} onChange={()=>toggle(i.name)}/><span><strong>{i.name}</strong><small>{i.group}</small><em>{i.status}</em></span></label>)}</div>
        <p className="muted">{selected.length} ingrédient(s) sélectionné(s)</p>
        <button className="primary-button" onClick={()=>setPage('Formuler')}>Retour à la formulation</button>
      </section>}
      {page==='Mes formules' && <section className="panel"><span className="eyebrow">VOTRE HISTORIQUE</span><h2>Mes formules</h2><p className="muted">Vos formulations enregistrées apparaîtront ici. La sauvegarde synchronisée sera activée après la configuration sécurisée de Supabase.</p></section>}
    </main>
    <footer><strong>FEEDFORM</strong><span>Version de démarrage · Données nutritionnelles en validation</span></footer>
  </div>;
}
