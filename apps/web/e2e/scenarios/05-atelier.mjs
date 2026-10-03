/**
 * Scénario de bout en bout · 05-atelier — Atelier : Atelier natif actuel et acceptation P.118. Réécrit au lot 4 pour le nouvel Atelier (annexe D du cahier des charges : dessin, annuler / rétablir, second navigateur, niveaux × modes, pousser / tirer, exports).
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** 6b. Atelier natif sur l'exemple : copie de travail automatique, annuler / rétablir, second appareil. */
export async function atelierExemple(sc) {
  const { BASE, OUT, browser, page, check, measure } = sc;
  const { email, exampleUrl } = sc;
  // 6b. Atelier natif sur l'exemple : moteur, niveaux, dessin d'un mur persisté (projection + révision), annulation persistée
  await measure("ouverture de l'Atelier (moteur, modèle P.118, géométrie affichée)", async () => {
    await page.goto(`${exampleUrl}?module=atelier`);
    await page.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
  });
  await page.waitForTimeout(600);
  const examplePid = exampleUrl.split("/").pop();
  const rdcWallsOf = async (pid) =>
    page.evaluate(async (pid) => {
      const levels = await (await fetch(`/projects/${pid}/levels`, { credentials: "include" })).json();
      const rdc = levels.find((l) => l.id.endsWith("_rdc"));
      const objs = await (await fetch(`/projects/${pid}/levels/${rdc.id}/objects`, { credentials: "include" })).json();
      const project = await (await fetch(`/projects/${pid}`, { credentials: "include" })).json();
      return { walls: objs.filter((o) => o.kind === "wall").length, revision: project.modelRevision };
    }, pid);
  const rdcWalls = () => rdcWallsOf(examplePid);
  check("atelier : géométrie P.118 chargée (EPSG:26191 · 1345.55 m²)", (await page.locator("#viewer-info").textContent()).includes("1345.55"));
  check("atelier : 6 niveaux", (await page.locator("#model-floors button").count()) === 6);
  check("atelier : barre d'outils V8 prête", (await page.locator("#atelier-toolbar").getAttribute("data-ready")) === "1");
  const before = await rdcWalls();
  check("atelier : 39 murs au RDC avant dessin, révision 1", before.walls === 39 && before.revision === 1, JSON.stringify(before));
  // Référence protégée de l'exemple (`demoP118V81.mode = "reference"`) : la note l'annonce, l'aide de l'outil aussi, et la première
  // modification validée crée la copie de travail automatiquement (`ensureDrawingCopy` → `copy('P.118 — copie de travail · Atelier')`).
  check("atelier de la référence : note « Exemple protégé : première modification dans une copie automatique. »", /Exemple protégé : première modification dans une copie automatique\./.test(await page.locator(".native-atelier-reference").textContent()));
  await page.locator("#model-floors button", { hasText: "RDC" }).first().click();
  await page.locator('#atelier-toolbar [data-atab="design"]').click();
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Mur")').first().click();
  check("atelier de la référence : l'aide de l'outil ajoute « Exemple protégé : première modification dans une copie automatique »", /Exemple protégé : première modification dans une copie automatique/.test(await page.evaluate(() => document.querySelector("#nativeDesignerRoot")?.textContent || "")));
  const box = await page.locator("#viewer-surface").boundingBox();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);
  await page.waitForTimeout(200);
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.5);
  await page.keyboard.press("Enter");
  await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().includes(examplePid) && /module=atelier/.test(u.toString()), { timeout: 30000 });
  const atelierUrl = page.url().split("?")[0];
  const atelierPid = atelierUrl.split("/").pop();
  const copyToastSeen = await page.waitForFunction(() => /Copie de travail créée automatiquement · exemple original conservé\./.test(document.querySelector(".h7-toast")?.textContent || ""), null, { timeout: 6000 }).then(() => true).catch(() => false); // s'efface de lui-même après 3,6 s
  await page.waitForFunction(() => document.querySelector("#atelier-toolbar")?.getAttribute("data-ready") === "1", null, { timeout: 30000 });
  await page.waitForFunction(() => /Enregistré sur le serveur|Modèle chargé depuis le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
  const copyProject = await (await page.request.get(`${BASE}/projects/${atelierPid}`)).json();
  const afterDraw = await rdcWallsOf(atelierPid);
  const referenceAfter = await rdcWalls();
  check("atelier de la référence : un mur dessiné → copie de travail créée automatiquement (« P.118 — copie de travail · Atelier », mode modifiable), écran basculé sur la copie, même module", copyProject.code === "P.118" && copyProject.name === "copie de travail · Atelier" && copyProject.exampleMode === "editable" && copyProject.sourceExampleId === "p118-exemple-complet" && page.url().includes("module=atelier") && (await page.locator(".project-header h1").textContent()) === "P.118 — copie de travail · Atelier", JSON.stringify({ name: copyProject.name, mode: copyProject.exampleMode, title: await page.locator(".project-header h1").textContent() }));
  check("copie de travail : le mur dessiné y est enregistré → 40 murs, révision 2 (projection régénérée) ; la référence reste à 39 murs, révision 1", afterDraw.walls === 40 && afterDraw.revision === 2 && referenceAfter.walls === 39 && referenceAfter.revision === 1, JSON.stringify({ afterDraw, referenceAfter }));
  check("copie de travail : plus de note « Exemple protégé », aide du moteur « Copie de travail active · modification enregistrée ; exemple original conservé. » (toast de navigation « Copie de travail créée automatiquement… »)", (await page.locator(".native-atelier-reference").count()) === 0 && /Copie de travail active · modification enregistrée ; exemple original conservé\./.test(await page.evaluate(() => document.querySelector("#nativeDesignerRoot")?.textContent || "")), copyToastSeen ? "toast vu" : "toast non observé (effacé avant la lecture)");
  await page.screenshot({ path: `${OUT}/atelier-concevoir-wall-desktop.png`, fullPage: true });
  await measure("annulation d'un mur → enregistrée sur le serveur (révision avancée)", async () => {
    await page.locator('#atelier-toolbar [data-quick="undo"]').click();
    await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  });
  await page.waitForTimeout(400);
  const afterUndo = await rdcWallsOf(atelierPid);
  check("copie de travail : annuler → 39 murs, révision 3 (l'annulation modifie l'état persistant)", afterUndo.walls === 39 && afterUndo.revision === 3, JSON.stringify(afterUndo));
  await page.locator('#atelier-toolbar [data-quick="redo"]').click();
  await page.waitForFunction(() => /Enregistré sur le serveur/.test(document.querySelector(".native-atelier-status")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  await page.waitForFunction(async (pid) => (await (await fetch(`/projects/${pid}`, { credentials: "include" })).json()).modelRevision === 4, atelierPid, { timeout: 10000 }).catch(() => {});
  const afterRedo = await rdcWallsOf(atelierPid);
  check("copie de travail : rétablir → 40 murs, révision 4 (le rétablissement est persisté lui aussi)", afterRedo.walls === 40 && afterRedo.revision === 4, JSON.stringify(afterRedo));
  // Second appareil (même compte, autre navigateur) : le modèle enregistré est relu à la même révision, avec le mur rétabli.
  const ctxDevice2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const device2 = await ctxDevice2.newPage();
  await device2.goto(`${BASE}/connexion`);
  await device2.fill('input[name="email"]', email);
  await device2.fill('input[name="password"]', "scenario-pass-123");
  await device2.click('button[type="submit"]');
  await device2.waitForURL(/\/(projets|accueil)/);
  await device2.goto(`${atelierUrl}?module=atelier`);
  await device2.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
  const device2Store = await (await device2.request.get(`${BASE}/projects/${atelierPid}/atelier/store`)).json();
  const device1Store = await (await page.request.get(`${BASE}/projects/${atelierPid}/atelier/store`)).json();
  const floorDesignKey = Object.keys(device2Store.entries).find((k) => k.endsWith(".floorDesign"));
  check("second appareil : le modèle est relu à la même révision (floorDesign identique, même révision de clé), 6 niveaux affichés", device2Store.modelRevision >= 4 && JSON.stringify(device2Store.entries[floorDesignKey]) === JSON.stringify(device1Store.entries[floorDesignKey]) && device2Store.revisions[floorDesignKey] === device1Store.revisions[floorDesignKey] && (await device2.locator("#model-floors button").count()) === 6, JSON.stringify({ rev: device2Store.modelRevision, key: floorDesignKey, keyRev: device2Store.revisions[floorDesignKey] }));
  await ctxDevice2.close();
  await measure("rechargement de la page de l'Atelier → géométrie affichée", async () => {
    await page.reload();
    await page.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
  });
  check("copie de travail : rechargement → modèle toujours là", (await page.locator("#model-floors button").count()) === 6);
  Object.assign(sc, { examplePid, rdcWallsOf, atelierUrl, atelierPid });
}

/** 5b. Acceptation P.118 dans l'Atelier (niveaux × modes, dessins, mezzanine, exports, catalogue). */
export async function acceptationP118(sc) {
  const { BASE, browser, page, consoleErrors, check } = sc;
  const { email, atelierUrl, atelierPid } = sc;
  // 5b. Acceptation P.118 dans l'Atelier (copie de travail) : chaque niveau × chaque mode de vue (volume, éclatée, plan = D2, coupe) et
  // chaque dessin technique rendus sans erreur ni vue vide ; la mezzanine modifiée en D2 (plan) puis relue en D3 (volume) et en vue
  // éclatée ; hauteur du mur modifiée (propriétés) ; Pousser/Tirer activable ; annuler / rétablir persistés ; réouverture sur un autre
  // appareil à la même révision ; exports DXF / SVG / CSV / PNG enregistrés au catalogue ; tableau des surfaces de la même révision.
  const wallsOf = async (pid, suffix) =>
    page.evaluate(
      async ([pid, suffix]) => {
        const levels = await (await fetch(`/projects/${pid}/levels`, { credentials: "include" })).json();
        const level = levels.find((l) => l.id.endsWith(suffix));
        const objs = await (await fetch(`/projects/${pid}/levels/${level.id}/objects`, { credentials: "include" })).json();
        const project = await (await fetch(`/projects/${pid}`, { credentials: "include" })).json();
        const walls = objs.filter((o) => o.kind === "wall");
        return { walls: walls.length, revision: project.modelRevision, heights: walls.map((w) => w.height ?? w.properties?.height ?? null) };
      },
      [pid, suffix],
    );
  const canvasInk = () =>
    page.evaluate(() => {
      const c = document.getElementById("building-canvas");
      if (!c || c.hidden || !c.width) return 0;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      const bg = [d[0], d[1], d[2]];
      let ink = 0;
      for (let i = 0; i < d.length; i += 4 * 101) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 40) ink++;
      return ink;
    });
  const techContent = () => page.evaluate(() => { const svg = document.querySelector("#technical-stage svg"); return svg ? svg.querySelectorAll("path, line, polygon, polyline, rect").length : 0; });
  /** Les commandes natives du viewer (modes, niveaux, dessins techniques, export de vue) sont pilotées par la barre V8 et peuvent être masquées : clic par script, comme la barre le fait (`click(item.target)`). */
  const nativeClick = (selector) => page.locator(selector).first().evaluate((el) => el.click());
  const errorsBeforeAcceptance = consoleErrors.length;
  /** Attente côté Node (pas de relecture en boucle dans la page : des `fetch` répétés depuis l'onglet retardent l'envoi du modèle). */
  const waitRevisionAbove = async (pid, n, timeoutMs = 20000) => {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if ((await (await page.request.get(`${BASE}/projects/${pid}`)).json()).modelRevision > n) return true;
      await page.waitForTimeout(400);
    }
    return false;
  };
  const levelIds = await page.$$eval("#model-floors button", (bs) => bs.map((b) => b.dataset.level));
  const combos = [];
  for (const levelId of levelIds) {
    await nativeClick(`#model-floors button[data-level="${levelId}"]`);
    await page.waitForTimeout(150);
    for (const mode of ["volume", "explode", "plan", "section"]) {
      const button = page.locator(`#mode-${mode}`);
      if (await button.isDisabled()) { combos.push(`${levelId}/${mode}:désactivé`); continue; }
      await nativeClick(`#mode-${mode}`);
      await page.waitForTimeout(250);
      const ok = (await page.locator(`#mode-${mode}`).getAttribute("aria-pressed")) === "true" && (mode === "plan" || mode === "section" ? (await techContent()) > 10 : (await canvasInk()) > 30);
      if (!ok) combos.push(`${levelId}/${mode}:vide`);
    }
  }
  check("acceptation · 6 niveaux × 4 modes (volume, éclatée, plan D2, coupe) : chaque combinaison rendue (dessin non vide), aucune erreur JavaScript", levelIds.length === 6 && combos.length === 0 && consoleErrors.length === errorsBeforeAcceptance, combos.join(" ") || `${levelIds.length} niveaux`);
  const techViews = [];
  for (const view of ["plan", "siteplan", "section", "section-ew", "elevation-north", "elevation-south", "elevation-east", "elevation-west"]) {
    const b = page.locator(`[data-tech-view="${view}"]`).first();
    if ((await b.count()) === 0 || (await b.isDisabled())) { techViews.push(`${view}:absent`); continue; }
    await nativeClick(`[data-tech-view="${view}"]`);
    await page.waitForTimeout(250);
    if ((await techContent()) < 5) techViews.push(`${view}:vide`);
  }
  check("acceptation · dessins techniques (plan, plan de situation, coupes N-S / E-O, 4 élévations) : chacun rendu en SVG, aucune erreur JavaScript", techViews.length === 0 && consoleErrors.length === errorsBeforeAcceptance, techViews.join(" "));
  // Mezzanine modifiée en D2 (plan) : un mur dessiné, enregistré sur le serveur, relu en D3 (volume) et en vue éclatée.
  await nativeClick('#model-floors button[data-level="mezz"]');
  await nativeClick("#mode-plan");
  await page.waitForTimeout(300);
  const mezzBefore = await wallsOf(atelierPid, "_mezz");
  await page.locator('#atelier-toolbar [data-atab="design"]').click();
  await page.waitForTimeout(400);
  await page.locator('[data-atelier-tool="wall"]').first().click();
  const surface = await page.locator("#viewer-surface").boundingBox();
  await page.mouse.click(surface.x + surface.width * 0.42, surface.y + surface.height * 0.46);
  await page.waitForTimeout(150);
  await page.mouse.click(surface.x + surface.width * 0.52, surface.y + surface.height * 0.46);
  await page.keyboard.press("Enter");
  await waitRevisionAbove(atelierPid, mezzBefore.revision);
  const mezzAfter = await wallsOf(atelierPid, "_mezz");
  check("acceptation · mezzanine (D2, plan) : un mur dessiné → enregistré sur le serveur (murs +1, révision avancée)", mezzAfter.walls === mezzBefore.walls + 1 && mezzAfter.revision > mezzBefore.revision, `${mezzBefore.walls} → ${mezzAfter.walls}, révision ${mezzBefore.revision} → ${mezzAfter.revision} · outil mur ${await page.locator('[data-atelier-tool="wall"]').first().getAttribute("aria-pressed")} · aide « ${await page.locator("#atelier-tool-status").textContent().catch(() => "-")} » · ${await page.locator(".native-atelier-status").textContent().catch(() => "-")}`);
  await nativeClick("#mode-volume");
  await page.waitForTimeout(300);
  const d3Ink = await canvasInk();
  await nativeClick("#mode-explode");
  await page.waitForTimeout(300);
  const explodeInk = await canvasInk();
  check("acceptation · mezzanine relue en D3 (volume) puis en vue éclatée : dessins non vides, aucune erreur JavaScript", d3Ink > 30 && explodeInk > 30 && consoleErrors.length === errorsBeforeAcceptance, `volume ${d3Ink} · éclatée ${explodeInk}`);
  // Propriétés du mur dessiné : le mur venant d'être tracé est la sélection courante ; « Propriétés » (⚙) ouvre son panneau — hauteur 2,40 m appliquée, persistée.
  await nativeClick("#mode-plan");
  await page.waitForTimeout(250);
  await page.locator('#atelier-toolbar [data-quick="props"]').click();
  await page.waitForSelector('#atelier-properties input[name="height"]', { timeout: 10000 }).catch(() => {});
  const heightField = page.locator('#atelier-properties input[name="height"]');
  let heightChanged = false;
  if (await heightField.count()) {
    await heightField.fill("2.4");
    await page.locator('#atelier-properties button[type="submit"]:has-text("Appliquer")').click();
    await waitRevisionAbove(atelierPid, mezzAfter.revision);
    const afterHeight = await wallsOf(atelierPid, "_mezz");
    heightChanged = afterHeight.heights.some((h) => Math.abs(Number(h) - 2.4) < 1e-6) && afterHeight.revision > mezzAfter.revision;
  }
  check("acceptation · propriétés du mur (hauteur 2,40 m) : appliquées et persistées (révision avancée)", heightChanged, `panneau ${await page.locator("#atelier-properties").evaluate((p) => (p.hidden ? "masqué" : "ouvert · " + [...p.querySelectorAll("input")].map((i) => i.name).join(","))).catch(() => "absent")}`);
  await page.locator('[data-atelier-tool="pushpull"]').first().click();
  await page.waitForTimeout(200);
  check("acceptation · Pousser/Tirer : outil activé sur la sélection (poignées L / l / H), aide affichée", (await page.locator('[data-atelier-tool="pushpull"]').first().getAttribute("aria-pressed")) === "true" && /Glissez une flèche/.test(await page.locator("#atelier-tool-status").textContent().catch(() => "")));
  await page.locator('[data-atelier-tool="select"]').first().click();
  // Annuler / rétablir persistés sur la mezzanine, puis relecture sur un autre appareil à la même révision.
  const beforeUndoMezz = await wallsOf(atelierPid, "_mezz");
  await page.locator('#atelier-toolbar [data-quick="undo"]').click();
  await waitRevisionAbove(atelierPid, beforeUndoMezz.revision);
  const afterUndoMezz = await wallsOf(atelierPid, "_mezz");
  await page.locator('#atelier-toolbar [data-quick="redo"]').click();
  await waitRevisionAbove(atelierPid, afterUndoMezz.revision);
  const afterRedoMezz = await wallsOf(atelierPid, "_mezz");
  check("acceptation · annuler (hauteur) puis rétablir : chaque pas persisté (révisions successives), état final = hauteur 2,40 m", afterUndoMezz.revision > beforeUndoMezz.revision && afterRedoMezz.revision > afterUndoMezz.revision && afterRedoMezz.heights.some((h) => Math.abs(Number(h) - 2.4) < 1e-6), `${beforeUndoMezz.revision} → ${afterUndoMezz.revision} → ${afterRedoMezz.revision}`);
  const ctxDevice3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const device3 = await ctxDevice3.newPage();
  await device3.goto(`${BASE}/connexion`);
  await device3.fill('input[name="email"]', email);
  await device3.fill('input[name="password"]', "scenario-pass-123");
  await device3.click('button[type="submit"]');
  await device3.waitForURL(/\/(projets|accueil)/);
  await device3.goto(`${atelierUrl}?module=atelier`);
  await device3.waitForFunction(() => document.getElementById("viewer-info")?.textContent?.includes("EPSG"), null, { timeout: 30000 });
  await device3.locator('#model-floors button[data-level="mezz"]').first().evaluate((el) => el.click());
  await device3.locator("#mode-plan").first().evaluate((el) => el.click());
  await device3.waitForTimeout(300);
  const device3Project = await (await device3.request.get(`${BASE}/projects/${atelierPid}`)).json();
  const device3Tech = await device3.evaluate(() => document.querySelectorAll("#technical-stage svg path, #technical-stage svg line, #technical-stage svg polygon").length);
  check("acceptation · autre appareil : la copie se rouvre à la même révision, mezzanine en plan avec son mur (dessin non vide)", device3Project.modelRevision === afterRedoMezz.revision && device3Tech > 10, `révision ${device3Project.modelRevision} vs ${afterRedoMezz.revision}`);
  await ctxDevice3.close();
  // Exports de la même révision : DXF, SVG, CSV (panneau Exporter du moteur) et PNG (vue), chacun téléchargé ET enregistré au catalogue avec niveau, vue et révision.
  await page.locator('[data-atelier-tool="exports"]').first().click();
  await page.waitForSelector('[data-export="dxf"]', { timeout: 10000 });
  const exported = [];
  for (const kind of ["dxf", "svg", "csv"]) {
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator(`[data-export="${kind}"]`).click()]);
    const registered = await page.waitForFunction((k) => window.__fadiExports?.some((e) => e.kind === k), kind, { timeout: 15000 }).then(() => true).catch(() => false);
    exported.push(`${kind}:${download.suggestedFilename()}:${registered ? "catalogue" : "non enregistré"}`);
  }
  check("acceptation · exports DXF, SVG et CSV du moteur : téléchargés et enregistrés au catalogue (niveau mezzanine, vue plan, révision courante)", exported.length === 3 && exported.every((e) => /:catalogue$/.test(e)), exported.join(" "));
  const [pngDownload] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), nativeClick("#mode-volume").then(() => page.waitForTimeout(300)).then(() => nativeClick("#export-view"))]);
  const pngRegistered = await page.waitForFunction(() => window.__fadiExports?.some((e) => e.kind === "png"), null, { timeout: 15000 }).then(() => true).catch(() => false);
  check("acceptation · export PNG de la vue : téléchargé et enregistré au catalogue", /\.png$/.test(pngDownload.suggestedFilename()) && pngRegistered, pngDownload.suggestedFilename());
  const catalogueDocs = (await (await page.request.get(`${BASE}/projects/${atelierPid}/documents`)).json()).documents;
  const drawingDocs = catalogueDocs.filter((d) => d.group === "dessins");
  const surfacesDoc = catalogueDocs.find((d) => d.kind === "tableau-surfaces");
  check("acceptation · catalogue : 4 dessins / exports « à jour » à la révision courante (DXF · mezzanine · dessin plan…), tableau des surfaces productible à la même révision", drawingDocs.length === 4 && drawingDocs.every((d) => d.freshness === "a-jour" && d.produced.modelRevision === afterRedoMezz.revision) && drawingDocs.some((d) => /Dessin technique DXF · Mezzanine · dessin plan/.test(d.label)) && surfacesDoc.current.modelRevision === afterRedoMezz.revision, drawingDocs.map((d) => d.label).join(" | "));
  const acceptanceSurfaces = await page.request.get(`${BASE}/projects/${atelierPid}/documents/surfaces`);
  check("acceptation · tableau des surfaces (CSV) produit depuis cette révision, mezzanine incluse", acceptanceSurfaces.status() === 200 && /Mezzanine/.test(await acceptanceSurfaces.text()) && ((await (await page.request.get(`${BASE}/projects/${atelierPid}/documents`)).json()).documents.find((d) => d.kind === "tableau-surfaces").freshness === "a-jour"));
  check("acceptation · aucune erreur JavaScript pendant l'acceptation", consoleErrors.length === errorsBeforeAcceptance, consoleErrors.slice(errorsBeforeAcceptance).join(" | "));
}
