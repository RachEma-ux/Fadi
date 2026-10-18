/** Reveal a world point through real camera gestures; never force a click through
 * a floating control, hide UI, alter geometry or replace a business assertion.
 * The returned callback reverses only the camera pans made by this helper. */
export async function revelerPointPlanche(page, point) {
  const pans = [];
  const snapshot = () => page.evaluate((q) => {
    const canvas = document.querySelector('[data-planche-vue] canvas');
    const p = window.fadiPlanche;
    if (!canvas || !p) throw new Error('Planche non prête');
    const r = canvas.getBoundingClientRect();
    const screen = p.versEcran(q);
    if (!screen) throw new Error('Point derrière la caméra');
    const target = {x: r.x + screen.x, y: r.y + screen.y};
    const free = (x, y) => x >= 8 && y >= 8 && x <= innerWidth - 8 && y <= innerHeight - 8 && document.elementFromPoint(x, y) === canvas;
    const spots = [];
    for (const fy of [0.35, 0.25, 0.45, 0.55, 0.15, 0.65]) {
      for (const fx of [0.5, 0.4, 0.6, 0.3, 0.7]) {
        const x = r.x + r.width * fx, y = r.y + r.height * fy;
        if ([[0,0],[-12,0],[12,0],[0,-12],[0,12]].every(([dx,dy]) => free(x+dx,y+dy))) spots.push({x,y});
      }
    }
    return {target, visible: free(target.x,target.y), spots, pas: p.pas(),
      hit: document.elementFromPoint(target.x,target.y)?.outerHTML?.slice(0,250)};
  }, point);
  const pan = async (dx, dy) => {
    const before = await snapshot();
    const start = before.spots.find(s => s.x + dx >= 8 && s.y + dy >= 8 && s.x + dx <= page.viewportSize().width - 8 && s.y + dy <= page.viewportSize().height - 8);
    if (!start) throw new Error('Aucune zone libre pour le panoramique de recette');
    await page.mouse.move(start.x,start.y);
    await page.keyboard.down('Shift');
    try {
      await page.mouse.down({button:'middle'});
      await page.mouse.move(start.x+dx,start.y+dy,{steps:8});
      await page.mouse.up({button:'middle'});
    } finally {
      await page.keyboard.up('Shift');
    }
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const after = await snapshot();
    if (after.pas !== before.pas) throw new Error('Le panoramique a modifié le modèle');
  };
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await snapshot();
    if (state.visible) return async () => {
      for (const [dx,dy] of [...pans].reverse()) await pan(-dx,-dy);
    };
    const aim = state.spots[0];
    if (!aim) throw new Error('Aucune surface de dessin accessible');
    const dx = Math.max(-180,Math.min(180,aim.x-state.target.x));
    const dy = Math.max(-140,Math.min(140,aim.y-state.target.y));
    await pan(dx,dy);
    pans.push([dx,dy]);
  }
  throw new Error(`Point toujours masqué après panoramique : ${JSON.stringify(await snapshot())}`);
}
