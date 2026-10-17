/** Geometry recipes target model points, never whichever floating control now
 * occupies an old screen coordinate. Reveal covered points by a real camera
 * pan, without hiding controls, forcing clicks or changing the model. */
export async function pointVisiblePlanche(page, point) {
  const inspecter = () => page.evaluate((point) => {
    const canvas = document.querySelector('[data-planche-vue] canvas');
    const root = canvas?.getBoundingClientRect();
    const p = window.fadiPlanche?.versEcran(point);
    if (!root || !p) throw new Error('Point du modèle non projetable');
    const cible = { x: root.left + p.x, y: root.top + p.y };
    const libre = (x,y) => document.elementFromPoint(x,y) === canvas;
    const visibles = [];
    const x0=Math.max(root.left,0)+24, x1=Math.min(root.right,innerWidth)-24;
    const y0=Math.max(root.top,0)+24, y1=Math.min(root.bottom,innerHeight)-24;
    for(let fy=1;fy<8;fy++) for(let fx=1;fx<8;fx++) {
      const x=x0+(x1-x0)*fx/8, y=y0+(y1-y0)*fy/8;
      if([[0,0],[-16,0],[16,0],[0,-16],[0,16]].every(([dx,dy])=>libre(x+dx,y+dy))) visibles.push({x,y});
    }
    // Prefer a central free patch, not a thin exposed strip beside a panel.
    const cx=(x0+x1)/2, cy=(y0+y1)/2;
    visibles.sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy));
    return { cible, libre:libre(cible.x,cible.y), depart:visibles[0],
      outil:window.fadiPlanche.outil(), pas:window.fadiPlanche.pas(),
      obstacle:document.elementFromPoint(cible.x,cible.y)?.outerHTML.slice(0,180) };
  }, point);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  for(let essai=0;essai<5;essai++) {
    const etat=await inspecter();
    if(etat.libre) return etat.cible;
    if(!etat.depart) throw new Error('Aucune zone de dessin accessible pour le panoramique');
    const d={x:etat.depart.x-etat.cible.x,y:etat.depart.y-etat.cible.y};
    const f=Math.min(1,140/Math.max(Math.abs(d.x),Math.abs(d.y),1));
    await page.mouse.move(etat.depart.x,etat.depart.y);
    await page.keyboard.down('Shift');
    try {
      await page.mouse.down({button:'middle'});
      await page.mouse.move(etat.depart.x+d.x*f,etat.depart.y+d.y*f,{steps:12});
      await page.mouse.up({button:'middle'});
    } finally { await page.keyboard.up('Shift'); }
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const apres=await inspecter();
    if(apres.outil!==etat.outil || apres.pas!==etat.pas) throw new Error('Le panoramique a modifié un outil ou le modèle');
  }
  throw new Error(`Point encore masqué après panoramique : ${JSON.stringify(await inspecter())}`);
}
