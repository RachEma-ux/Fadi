(function(){
 const $q=(q)=>document.querySelector(q);
 const click=(q)=>{const e=$q(q);if(e){e.click();return true}return false};
 const clickDesignerMode=(mode)=>{
   const root=$q('#nativeDesignerRoot')||document;
   const candidates=[...root.querySelectorAll('button,[role="button"]')];
   const b=candidates.find(x=>(x.dataset?.mode||x.dataset?.view||'').toLowerCase()===mode || x.textContent.trim().toLowerCase()===mode);
   if(b){b.click();return true}return false;
 };
 const groups={
  designhome:[
   ['Nouveau','#home-new-project'],['Importer','#home-import-project'],['2D','#atelier-open-2d'],['3D','#atelier-open-3d']
  ],
  model:[],
  view:[
   ['Façade','#atelier-facade-view'],['Nord','[data-orient-view="north"]'],['Sud','[data-orient-view="south"]'],['Est','[data-orient-view="east"]'],['Ouest','[data-orient-view="west"]'],['Dessus','[data-orient-view="top"]'],['Dessous','[data-orient-view="bottom"]'],['Cadrer','#model-fit']
  ],
  design:[['Grille','#atelier-concevoir-grid'],['Autres Étages','#atelier-other-floors'],['Cadrer','#atelier-concevoir-fit'],['Propriétés','#atelier-tool-props']],
  analyse:[
   ['Soleil & ombres','#solar-toggle'],['Légende','#legend-toggle'],['Harmonie','#atelier-harmonie-page']
  ],
  docs:[],
  more:[
   ['Plein écran','#viewer-fullscreen'],['Réinitialiser','#model-reset'],['Niveaux','#home-level-manager']
  ]
 };
 // V8.7 — Collapsible level menu, shared by 2D and 3D. Native IDs remain unchanged.
 // Popups follow their trigger without expanding the page on narrow screens.
 function positionToolbarPopup(box,toggle){
  if(!box||!toggle||box.hidden)return;
  const r=toggle.getBoundingClientRect(),gap=6,margin=8;
  const width=document.documentElement.clientWidth||window.innerWidth;
  const height=window.innerHeight;
  const w=Math.min(240,width-2*margin);
  box.style.width=w+'px';
  box.style.left=Math.max(margin,Math.min(r.left,width-w-margin))+'px';
  const below=height-r.bottom-gap-margin,above=r.top-gap-margin;
  const useAbove=below<150&&above>below;
  box.style.maxHeight=Math.max(44,Math.min(420,useAbove?above:below))+'px';
  const h=box.getBoundingClientRect().height;
  box.style.top=(useAbove?Math.max(margin,r.top-gap-h):Math.max(margin,r.bottom+gap))+'px';
 }
 function repositionToolbarPopups(){
  for(const name of ['level','view','mode','docs'])positionToolbarPopup($q('#atelier-'+name+'-options'),$q('#atelier-'+name+'-toggle'));
 }
 function levelButtons(){return [...($q('#atelier-level-options')?.querySelectorAll('[data-level-scope]')||[])].filter(b=>!b.disabled);}
 function closeLevelMenu(refocus=false){
  const box=$q('#atelier-level-options'),toggle=$q('#atelier-level-toggle');
  if(box)box.hidden=true;
  if(toggle){toggle.setAttribute('aria-expanded','false');toggle.classList.remove('active');if(refocus)toggle.focus({preventScroll:true});}
 }
 function openLevelMenu(focus=false){
  syncLevelSelect();closeModelViews();closeModelModes();closeDocsMenu();const box=$q('#atelier-level-options'),toggle=$q('#atelier-level-toggle');if(!box||!toggle)return;
  box.hidden=false;toggle.setAttribute('aria-expanded','true');toggle.classList.add('active');positionToolbarPopup(box,toggle);
  if(focus)(levelButtons().find(b=>b.getAttribute('aria-checked')==='true')||levelButtons()[0])?.focus();
 }
 function syncLevelSelect(){
  const bridge=window.V14Bridge,box=$q('#atelier-level-options'),toggle=$q('#atelier-level-toggle');if(!bridge?.levelScopeOptions||!box||!toggle)return;
  const options=bridge.levelScopeOptions(),scope=bridge.levelScope(),al=bridge.activeLevel();
  const current=scope==='building'?'building':scope==='roof'?'roof':options.find(o=>o.levelId===al?.id)?.key;
  // The selected option is indicated in the menu, never in the button's title.
  toggle.setAttribute('aria-label','Niveau');
  toggle.disabled=!options.some(o=>o.available);
  const signature=JSON.stringify(options.map(o=>[o.key,o.label,o.available,o.description]));
  if(box.dataset.signature!==signature){
   const focused=box.contains(document.activeElement)?document.activeElement.dataset.levelScope:null;box.replaceChildren();
   for(const o of options){
    const b=document.createElement('button');b.type='button';b.dataset.levelScope=o.key;b.setAttribute('role','menuitemradio');b.tabIndex=-1;b.textContent=o.label;b.disabled=!o.available;b.title=o.description;
    if(!o.available)b.setAttribute('aria-label',o.label+' · '+o.description);
    b.onclick=()=>{if(bridge.selectLevelScope(o.key)){closeLevelMenu(true);syncLevelSelect();}else syncLevelSelect();};box.appendChild(b);
   }
   box.dataset.signature=signature;
   if(focused)box.querySelector('[data-level-scope="'+focused+'"]')?.focus();
  }
  box.querySelectorAll('[data-level-scope]').forEach(b=>{const chosen=b.dataset.levelScope===current;b.setAttribute('aria-checked',String(chosen));b.classList.toggle('active',chosen);b.tabIndex=chosen?0:-1;});
  if(!current&&!box.hidden&&levelButtons()[0])levelButtons()[0].tabIndex=0;
 }
 function initLevelMenu(tb){
  const toggle=$q('#atelier-level-toggle'),box=$q('#atelier-level-options');if(!toggle||!box)return;
  toggle.onclick=()=>box.hidden?openLevelMenu():closeLevelMenu();
  toggle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();openLevelMenu(true);if(e.key==='ArrowUp')levelButtons().at(-1)?.focus();}});
  box.addEventListener('keydown',e=>{
   const bs=levelButtons(),i=bs.indexOf(document.activeElement);let index=null;
   if(e.key==='ArrowDown')index=(i+1)%bs.length;else if(e.key==='ArrowUp')index=(i-1+bs.length)%bs.length;else if(e.key==='Home')index=0;else if(e.key==='End')index=bs.length-1;
   if(index!==null&&bs.length){e.preventDefault();e.stopPropagation();bs[index].focus();}
  });
  tb.addEventListener('keydown',e=>{if(e.key==='Escape'&&!box.hidden){e.preventDefault();e.stopPropagation();closeLevelMenu(true);}});
  document.addEventListener('pointerdown',e=>{if(!e.target.closest('#atelier-level-menu'))closeLevelMenu();});
  document.addEventListener('focusin',e=>{if(!e.target.closest('#atelier-level-menu'))closeLevelMenu();});
  tb.addEventListener('atelier-toolbar-park',()=>closeLevelMenu());
  window.addEventListener('atelier-level-scope-change',syncLevelSelect);
 }
 function ensureAtelierViewGrid(){
   const surface=$q('#viewer-surface');if(!surface)return null;
   let grid=surface.querySelector('.atelier-view-grid');
   if(!grid){grid=document.createElement('div');grid.className='atelier-view-grid';grid.setAttribute('aria-hidden','true');surface.appendChild(grid)}
   return grid;
 }
 function toggleAtelierViewGrid(force){
   const surface=$q('#viewer-surface');if(!surface)return;
   ensureAtelierViewGrid();
   const next=typeof force==='boolean'?force:!surface.classList.contains('atelier-grid-on');
   surface.classList.toggle('atelier-grid-on',next);
 }
 // V8.9 — Vue et Mode sont des menus déroulants comme Niveau, uniquement dans Modèle.
 let modelViewsExpanded=false,modelModesExpanded=false;
 let currentModelView='facade';
 const MODE_ITEMS=[
   {key:'volume',label:'Volume',target:'#mode-volume'},
   {key:'explode',label:'Éclaté',target:'#mode-explode'},
   {key:'plan',label:'Plan',target:'#mode-plan'},
   {key:'section',label:'Coupe',target:'#mode-section'}
 ];
 const VIEW_ITEMS=[
   {key:'facade',label:'Façade',target:'#view-item-facade'},
   {key:'north',label:'Nord',target:'[data-orient-view="north"]'},
   {key:'south',label:'Sud',target:'[data-orient-view="south"]'},
   {key:'east',label:'Est',target:'[data-orient-view="east"]'},
   {key:'west',label:'Ouest',target:'[data-orient-view="west"]'},
   {key:'top',label:'Dessus',target:'[data-orient-view="top"]'},
   {key:'bottom',label:'Dessous',target:'[data-orient-view="bottom"]'},
   {key:'fit',label:'Cadrer',target:'#model-fit',checkable:false}
 ];
 const DOC_DRAWING_ITEMS=[
   {key:'plan',label:'Plan du niveau',target:'[data-tech-view="plan"]'},
   {key:'siteplan',label:'Plan de masse',target:'[data-tech-view="siteplan"]'},
   {key:'section',label:'Coupe A–A · N–S',target:'[data-tech-view="section"]'},
   {key:'section-ew',label:'Coupe B–B · E–O',target:'[data-tech-view="section-ew"]'},
   {key:'elevation-north',label:'Élévation Nord',target:'[data-tech-view="elevation-north"]'},
   {key:'elevation-south',label:'Élévation Sud',target:'[data-tech-view="elevation-south"]'},
   {key:'elevation-east',label:'Élévation Est',target:'[data-tech-view="elevation-east"]'},
   {key:'elevation-west',label:'Élévation Ouest',target:'[data-tech-view="elevation-west"]'}
 ];
 let technicalDocsExpanded=false;
 function currentModeKey(){
   if($q('#mode-explode')?.classList.contains('active'))return 'explode';
   if($q('#mode-plan')?.classList.contains('active'))return 'plan';
   if($q('#mode-section')?.classList.contains('active'))return 'section';
   return 'volume';
 }
 function closeModelViews(refocus=false){
   modelViewsExpanded=false;
   const box=$q('#atelier-view-options'),toggle=$q('#atelier-view-toggle');
   if(box)box.hidden=true;
   if(toggle){toggle.setAttribute('aria-expanded','false');toggle.classList.remove('active');if(refocus)toggle.focus({preventScroll:true});}
 }
 function closeModelModes(refocus=false){
   modelModesExpanded=false;
   const box=$q('#atelier-mode-options'),toggle=$q('#atelier-mode-toggle');
   if(box)box.hidden=true;
   if(toggle){toggle.setAttribute('aria-expanded','false');toggle.classList.remove('active');if(refocus)toggle.focus({preventScroll:true});}
 }
 function syncModelMenusVisibility(){
   const current=$q('#atelier-toolbar [data-atab].active')?.dataset.atab;
   const toolbar=$q('#atelier-toolbar');if(toolbar)toolbar.dataset.menuGroup=current||'';
   const active=current==='model';
   const level=$q('#atelier-level-menu'),view=$q('#atelier-view-menu'),mode=$q('#atelier-mode-menu'),docs=$q('#atelier-docs-menu');
   if(level)level.hidden=!active; if(view)view.hidden=!active; if(mode)mode.hidden=!active; if(docs)docs.hidden=!active;
   if(!active){closeLevelMenu();closeModelViews();closeModelModes();}
   if(!active)closeDocsMenu();
 }
 function currentTechnicalDrawingKey(){return window.V14Bridge?.capture?.().tech||null;}
 function closeDocsMenu(refocus=false){
   technicalDocsExpanded=false;
   const box=$q('#atelier-docs-options'),toggle=$q('#atelier-docs-toggle');
   if(box)box.hidden=true;
   if(toggle){toggle.setAttribute('aria-expanded','false');toggle.classList.remove('active');if(refocus)toggle.focus({preventScroll:true});}
 }
 function syncDocsMenu(){
   const box=$q('#atelier-docs-options'),toggle=$q('#atelier-docs-toggle');
   syncModelMenusVisibility();
   if(!box||!toggle)return;
   const active=$q('#atelier-toolbar [data-atab].active')?.dataset.atab==='model';
   const shown=technicalDocsExpanded&&active;
   box.hidden=!shown;
   toggle.setAttribute('aria-expanded',String(shown));
   toggle.classList.toggle('active',shown);
   const current=currentTechnicalDrawingKey();
   box.replaceChildren();
   for(const item of DOC_DRAWING_ITEMS){
     const src=$q(item.target);
     const b=document.createElement('button'); b.type='button'; b.dataset.docDrawing=item.key; b.textContent=item.label;
     b.setAttribute('role','menuitemradio'); const chosen=current===item.key; b.setAttribute('aria-checked',String(chosen)); b.classList.toggle('active',chosen); b.disabled=!src||src.disabled;
     b.onclick=()=>{ if(src?.disabled)return; if(src)src.click(); closeDocsMenu(true); syncDocsMenu(); };
     box.appendChild(b);
   }
   positionToolbarPopup(box,toggle);
 }
 function initDocsMenu(tb){
   const toggle=$q('#atelier-docs-toggle'),box=$q('#atelier-docs-options');
   if(!toggle||!box||toggle.dataset.ready)return; toggle.dataset.ready='1';
   toggle.onclick=()=>{closeLevelMenu();closeModelViews();closeModelModes();technicalDocsExpanded=!technicalDocsExpanded;syncDocsMenu();};
   toggle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();closeLevelMenu();closeModelViews();closeModelModes();technicalDocsExpanded=true;syncDocsMenu();(box.querySelector('button.active:not(:disabled)')||box.querySelector('button:not(:disabled)'))?.focus();}});
   box.addEventListener('keydown',e=>{const bs=[...box.querySelectorAll('button:not(:disabled)')],i=bs.indexOf(document.activeElement);let idx=null;if(e.key==='ArrowDown')idx=(i+1)%bs.length;else if(e.key==='ArrowUp')idx=(i-1+bs.length)%bs.length;else if(e.key==='Home')idx=0;else if(e.key==='End')idx=bs.length-1; if(idx!==null&&bs.length){e.preventDefault();bs[idx].focus();}});
   tb.addEventListener('keydown',e=>{if(e.key==='Escape'&&technicalDocsExpanded){e.preventDefault();e.stopPropagation();closeDocsMenu(true);}});
   document.addEventListener('pointerdown',e=>{if(!e.target.closest('#atelier-docs-menu'))closeDocsMenu();});
   document.addEventListener('focusin',e=>{if(!e.target.closest('#atelier-docs-menu'))closeDocsMenu();});
   tb.addEventListener('atelier-toolbar-park',()=>closeDocsMenu());
 }
 function syncModelViewPanel(){
   const box=$q('#atelier-view-options'),toggle=$q('#atelier-view-toggle');
   syncModelMenusVisibility();
   if(!box||!toggle)return;
   const active=$q('#atelier-toolbar [data-atab].active')?.dataset.atab==='model';
   const shown=modelViewsExpanded&&active;
   box.hidden=!shown;
   toggle.setAttribute('aria-expanded',String(shown));
   toggle.classList.toggle('active',shown);
   box.replaceChildren();
   for(const item of VIEW_ITEMS){
     const b=document.createElement('button'); b.type='button'; b.dataset.viewChoice=item.key; b.textContent=item.label;
     const checkable=item.checkable!==false;
     if(checkable){b.setAttribute('role','menuitemradio'); const chosen=currentModelView===item.key; b.setAttribute('aria-checked',String(chosen)); b.classList.toggle('active',chosen);}
     else {b.setAttribute('role','menuitem');}
     b.onclick=()=>{if(item.key!=='fit')currentModelView=item.key; click(item.target); closeModelViews(true); syncModelViewPanel();};
     box.appendChild(b);
   }
   positionToolbarPopup(box,toggle);
 }
 function syncModelModeMenu(){
   const box=$q('#atelier-mode-options'),toggle=$q('#atelier-mode-toggle');
   syncModelMenusVisibility();
   if(!box||!toggle)return;
   const active=$q('#atelier-toolbar [data-atab].active')?.dataset.atab==='model';
   const shown=modelModesExpanded&&active;
   box.hidden=!shown;
   toggle.setAttribute('aria-expanded',String(shown));
   toggle.classList.toggle('active',shown);
   const current=currentModeKey();
   box.replaceChildren();
   for(const item of MODE_ITEMS){
     const b=document.createElement('button'); b.type='button'; b.dataset.modeChoice=item.key; b.textContent=item.label;
     b.setAttribute('role','menuitemradio'); const chosen=current===item.key; b.setAttribute('aria-checked',String(chosen)); b.classList.toggle('active',chosen);
     b.onclick=()=>{click(item.target); setTimeout(()=>{closeModelModes(true); syncLevelSelect(); syncModelModeMenu();},30);};
     box.appendChild(b);
   }
   positionToolbarPopup(box,toggle);
 }
 function initModelMenus(tb){
   const viewToggle=$q('#atelier-view-toggle'),viewBox=$q('#atelier-view-options');
   const modeToggle=$q('#atelier-mode-toggle'),modeBox=$q('#atelier-mode-options');
   if(viewToggle&&viewBox&&!viewToggle.dataset.ready){viewToggle.dataset.ready='1';viewToggle.onclick=()=>{closeDocsMenu();closeLevelMenu();modelModesExpanded=false;syncModelModeMenu();modelViewsExpanded=!modelViewsExpanded;syncModelViewPanel();};viewToggle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();closeDocsMenu();closeLevelMenu();closeModelModes();modelViewsExpanded=true;syncModelViewPanel();(viewBox.querySelector('button.active')||viewBox.querySelector('button'))?.focus();}});viewBox.addEventListener('keydown',e=>{const bs=[...viewBox.querySelectorAll('button')],i=bs.indexOf(document.activeElement);let idx=null;if(e.key==='ArrowDown')idx=(i+1)%bs.length;else if(e.key==='ArrowUp')idx=(i-1+bs.length)%bs.length;else if(e.key==='Home')idx=0;else if(e.key==='End')idx=bs.length-1; if(idx!==null&&bs.length){e.preventDefault();bs[idx].focus();}});}
   if(modeToggle&&modeBox&&!modeToggle.dataset.ready){modeToggle.dataset.ready='1';modeToggle.onclick=()=>{closeDocsMenu();closeLevelMenu();modelViewsExpanded=false;syncModelViewPanel();modelModesExpanded=!modelModesExpanded;syncModelModeMenu();};modeToggle.addEventListener('keydown',e=>{if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();e.stopPropagation();closeDocsMenu();closeLevelMenu();closeModelViews();modelModesExpanded=true;syncModelModeMenu();(modeBox.querySelector('button.active')||modeBox.querySelector('button'))?.focus();}});modeBox.addEventListener('keydown',e=>{const bs=[...modeBox.querySelectorAll('button')],i=bs.indexOf(document.activeElement);let idx=null;if(e.key==='ArrowDown')idx=(i+1)%bs.length;else if(e.key==='ArrowUp')idx=(i-1+bs.length)%bs.length;else if(e.key==='Home')idx=0;else if(e.key==='End')idx=bs.length-1; if(idx!==null&&bs.length){e.preventDefault();bs[idx].focus();}});}
   tb.addEventListener('keydown',e=>{if(e.key==='Escape'){if(modelViewsExpanded){e.preventDefault();e.stopPropagation();closeModelViews(true);} if(modelModesExpanded){e.preventDefault();e.stopPropagation();closeModelModes(true);}}});
   document.addEventListener('pointerdown',e=>{if(!e.target.closest('#atelier-view-menu'))closeModelViews(); if(!e.target.closest('#atelier-mode-menu'))closeModelModes();});
   document.addEventListener('focusin',e=>{if(!e.target.closest('#atelier-view-menu'))closeModelViews(); if(!e.target.closest('#atelier-mode-menu'))closeModelModes();});
   tb.addEventListener('atelier-toolbar-park',()=>{closeModelViews();closeModelModes();closeDocsMenu();});
 }
 function renderGroup(name,container=null){
   const nested=container!==null,c=container||$q('#atelier-toolbar-context');if(!c)return;
   if(!nested)syncModelMenusVisibility();
   c.innerHTML='';
   (groups[name]||[]).filter(([,target])=>target!=='#atelier-harmonie-page'||Number(window.AtelierHost?.stage)===10).forEach(([label,target])=>{const b=document.createElement('button');b.type='button';b.textContent=label;
     if(target==='#atelier-harmonie-page'){b.id='atelier-harmonie-button';b.setAttribute('aria-controls','atelier-harmonie-page');b.setAttribute('aria-expanded',String(window.AtelierHarmonyPage?.isOpen()||false));b.title='Ouvrir la page Harmonie du bâtiment';}
     const src=$q(target);const gridOn=target==='#atelier-concevoir-grid'&&$q('#viewer-surface')?.classList.contains('atelier-grid-on');if(gridOn||src?.classList.contains('active')||src?.getAttribute('aria-pressed')==='true')b.classList.add('active');
     if(target==='#atelier-other-floors'){b.id='atelier-other-floors';const shown=window.V14Bridge?.otherFloorsVisible()!==false;b.classList.toggle('active',shown);b.setAttribute('aria-pressed',String(shown));b.title=shown?'Masquer les autres étages — conserver le niveau actif':'Afficher les autres étages';}
     b.onclick=()=>{
       if(target==='#atelier-harmonie-page'){window.AtelierHarmonyPage?.open();}else if(target.startsWith('#atelier-tool-')){window.AtelierTools?.activate(target.slice(14));}else if(target==='#atelier-concevoir-fit'){
         // The visible Concevoir canvas is the Atelier viewer: use its native fit command.
         click('#model-fit');
       }else if(target==='#atelier-other-floors'){window.V14Bridge?.toggleOtherFloors();}else if(target==='#atelier-concevoir-grid'){
         toggleAtelierViewGrid();
       }else if(target==='#atelier-facade-view'){
         click('#view-item-facade');
       }else if(target==='#atelier-open-2d'){
         window.AtelierTools?.setWorkspaceTab(name,true);click('#mode-plan');
       }else if(target==='#atelier-open-3d'){
         window.AtelierTools?.setWorkspaceTab(name,true);click('#mode-volume');
       }else click(target);
       setTimeout(()=>{
         syncLevelSelect();const tab=$q('#atelier-toolbar [data-atab].active')?.dataset.atab;
         if(tab!==name)return;
         const refocus=document.activeElement===b;
         renderGroup(nested?'model':name);
         if(refocus)[...c.querySelectorAll('button')].find(x=>x.textContent===label)?.focus({preventScroll:true});
       },140)
     };c.appendChild(b)});
   if(name==='designhome'){
     const row=document.createElement('div');row.className='toolbar-rotation-control';
     const rot=document.createElement('button');rot.type='button';rot.className='toolbar-rotation-btn';
     const axis=document.createElement('select');axis.className='toolbar-rotation-axis';axis.setAttribute('aria-label','Axe de rotation');
     axis.innerHTML='<option value="yaw">Tour E/O</option><option value="pitch">Tour N/S</option><option value="roll">Roulis</option>';
     const nativeRot=$q('#auto-rotate'),nativeAxis=$q('#auto-axis');
     const syncRotation=()=>{
       rot.textContent=(nativeRot?.getAttribute('aria-pressed')==='true'?'■':'▶')+' Rotation';
       rot.classList.toggle('active',nativeRot?.getAttribute('aria-pressed')==='true');
       if(nativeAxis)axis.value=nativeAxis.value;
     };
     rot.onclick=()=>{nativeRot?.click();setTimeout(syncRotation,20)};
     axis.onchange=()=>{if(nativeAxis){nativeAxis.value=axis.value;nativeAxis.dispatchEvent(new Event('change',{bubbles:true}))}};
     row.append(rot,axis);c.appendChild(row);syncRotation();
   }
   if(!nested)syncModelViewPanel();
 }
 function initToolbar(){
   const tb=$q('#atelier-toolbar');if(!tb||tb.dataset.ready)return;tb.dataset.ready='1';
   tb.querySelectorAll('[data-atab]').forEach(b=>b.onclick=()=>{closeLevelMenu();modelViewsExpanded=false;modelModesExpanded=false;tb.querySelectorAll('[data-atab]').forEach(x=>x.classList.toggle('active',x===b));window.AtelierTools?.setWorkspaceTab(b.dataset.atab);renderGroup(b.dataset.atab);syncModelViewPanel();syncModelModeMenu();syncDocsMenu();});
   tb.addEventListener('atelier-toolbar-park',()=>{closeModelViews();closeModelModes();closeDocsMenu();});
   initLevelMenu(tb);
   initModelMenus(tb);
   initDocsMenu(tb);
   window.addEventListener('resize',repositionToolbarPopups);
   window.addEventListener('scroll',repositionToolbarPopups,true);
   tb.querySelector('[data-quick="fit"]').onclick=()=>click('#model-fit');
   tb.querySelector('[data-quick="undo"]').onclick=()=>window.AtelierTools?.undo();tb.querySelector('[data-quick="redo"]').onclick=()=>window.AtelierTools?.redo();tb.querySelector('[data-quick="select"]').onclick=()=>window.AtelierTools?.activate('select');tb.querySelector('[data-quick="props"]').onclick=()=>window.AtelierTools?.properties();window.AtelierTools?.afterRender();
   window.AtelierTools?.setWorkspaceTab('model');renderGroup('model');syncLevelSelect();syncModelViewPanel();syncModelModeMenu();syncDocsMenu();
   const floors=$q('#model-floors');if(floors)new MutationObserver(syncLevelSelect).observe(floors,{childList:true,subtree:true,attributes:true});
 }
 window.syncAtelierLevelMenu=syncLevelSelect;
 window.initAtelierToolbar=initToolbar;

})();
