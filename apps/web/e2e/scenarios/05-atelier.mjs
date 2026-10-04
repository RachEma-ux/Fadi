/**
 * Scénario de bout en bout · 05-atelier — Atelier (DrawAll, seul Atelier depuis la bascule du lot 4, D-052) sur
 * l'exemple P.118 : référence protégée et copie de travail automatique, dessin, annuler / rétablir persistés
 * (révisions), second navigateur à la même révision, rechargement ; puis acceptation P.118 : exports au catalogue
 * des documents, tableau des surfaces et plan de lecture à la révision courante (annexe D du cahier des charges).
 *
 * Les niveaux × modes, la vue 3D, pousser / tirer et les vues techniques sont exercés par `14-nouvel-atelier.mjs`
 * sur la copie de travail produite ici. La persistance est lue sur le serveur (`GET /projects/:id/atelier/model`),
 * jamais déduite de l'écran. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs`.
 * Un fichier = un propriétaire (cahier des charges, §9).
 */

/** Modèle typé d'un projet tel que le serveur l'a enregistré. */
const modeleDe = async (p, BASE, pid) => (await p.request.get(`${BASE}/projects/${pid}/atelier/model`)).json();
const objetsDe = (m, classe) => Object.values(m.objets).filter((o) => o.classe === classe);

/** Ouverture de l'Atelier (`?module=atelier`) : interface et zone de plan montées. */
async function ouvrirAtelier(p, url) {
  await p.goto(`${url}?module=atelier`);
  await p.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  await p.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
}

/** Saisie de précision de la zone de plan (`x;y`, repère local) : même geste que `14-nouvel-atelier.mjs`. */
function outilsPlan(page) {
  const toile = page.locator('[data-testid="plan2d-toile"]');
  const saisie = page.locator('[data-testid="plan2d-precision"] input:not([readonly])');
  const poserPoint = async (x, y) => {
    await toile.focus();
    await page.keyboard.press(String(x)[0]);
    await saisie.waitFor({ state: "visible", timeout: 5000 });
    await saisie.fill(`${x};${y}`);
    await saisie.press("Enter");
    await saisie.waitFor({ state: "detached", timeout: 5000 });
  };
  const fileVide = () => page.waitForFunction(() => /^\s*0 lot\(s\) en attente d'envoi/.test(document.querySelector('[data-testid="atl-compte-attente"]')?.textContent ?? ""), null, { timeout: 20000 });
  return { toile, poserPoint, fileVide };
}

/** 6b. Atelier sur l'exemple : copie de travail automatique, annuler / rétablir, second navigateur. */
export async function atelierExemple(sc) {
  const { BASE, OUT, browser, page, check, measure } = sc;
  const { email, exampleUrl } = sc;
  const examplePid = exampleUrl.split("/").pop();
  /** Murs du RDC et révision du modèle d'un projet (lu sur le serveur). */
  const rdcWallsOf = async (pid) => {
    const m = await modeleDe(page, BASE, pid);
    const rdc = objetsDe(m, "niveau").find((n) => n.id.endsWith("_rdc"));
    return { walls: objetsDe(m, "mur").filter((o) => o.niveauId === rdc?.id).length, revision: m.revision, murs: objetsDe(m, "mur").length, empreinte: m.empreinte };
  };
  /** Attente côté Node (pas de `fetch` en boucle depuis l'onglet). */
  const attendre = async (pid, predicat, delaiMs = 20000) => {
    const fin = Date.now() + delaiMs;
    let v = await rdcWallsOf(pid);
    while (!predicat(v) && Date.now() < fin) {
      await page.waitForTimeout(400);
      v = await rdcWallsOf(pid);
    }
    return v;
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await measure("ouverture de l'Atelier sur la référence P.118 (modèle typé, interface, zone de plan)", async () => ouvrirAtelier(page, exampleUrl));
  await page.mouse.move(2, 2);
  const niveaux = await page.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').count();
  check("atelier : interface montée sur la référence, 6 niveaux, bandeau « Atelier Architectural »", niveaux === 6 && (await page.locator('[data-testid="atl-bandeau"]').textContent()) === "Atelier Architectural", `${niveaux} niveaux`);
  check("atelier : un seul Atelier (aucun moteur extrait monté)", (await page.locator("#atelier-toolbar, #nativeDesignerMount").count()) === 0);
  const before = await rdcWallsOf(examplePid);
  check("atelier : 39 murs au RDC avant dessin, révision 1", before.walls === 39 && before.revision === 1, JSON.stringify(before));
  // Référence protégée (`exampleMode = "reference"`, D-052 §7) : la note l'annonce ; la première commande crée la copie de travail.
  check("atelier de la référence : note « Exemple protégé » sous le bandeau, outils disponibles", /Exemple protégé/.test((await page.locator('[data-testid="atl-note"]').textContent()) ?? "") && (await page.locator('[data-testid="atl-refus-outil"]').count()) === 0);

  const { toile, poserPoint } = outilsPlan(page);
  await page.waitForFunction(() => /Sous-sol technique/.test(document.querySelector('[data-testid="atl-niveau-actif"]')?.textContent ?? ""), null, { timeout: 10000 }).catch(() => null);
  const journalConsole = [];
  const surConsole = (msg) => journalConsole.push(`${msg.type()}: ${msg.text()}`.slice(0, 300));
  const surReponse = (r) => /\/(copies|atelier\/commands)/.test(r.url()) && journalConsole.push(`${r.request().method()} ${new URL(r.url()).pathname} → ${r.status()}`);
  page.on("console", surConsole);
  page.on("response", surReponse);
  await toile.focus();
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Mur"), null, { timeout: 5000 }).catch(() => null);
  for (const [champ, valeur] of [["epaisseur", "0,2"], ["hauteur", "2,5"]]) {
    const c = page.locator(`[data-testid="atl-precision-${champ}"]`);
    if (await c.count()) {
      await c.fill(valeur);
      await c.press("Enter");
    }
  }
  // À 3 m au-dessus du carré 40–44 m de `14-nouvel-atelier.mjs` (même copie, même niveau) : la porte de 14 s'accroche
  // à son propre mur, et l'emprise de la copie (cadrage de la vue 3D) reste celle du carré.
  await poserPoint(40, 47);
  await poserPoint(44, 47);
  try {
    await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().includes(examplePid) && /module=atelier/.test(u.toString()), { timeout: 30000 });
  } catch (e) {
    // Diagnostic : ce que l'écran et le réseau montrent quand la copie de travail n'arrive pas.
    await page.screenshot({ path: `${OUT}/atelier-copie-echec-desktop.png`, fullPage: true }).catch(() => {});
    const texte = async (sel) => (await page.locator(sel).first().textContent().catch(() => null))?.replace(/\s+/g, " ").slice(0, 300) ?? "absent";
    console.log(`ℹ diagnostic copie de travail : outil « ${await texte('[data-testid="atl-puce-outil"]')} » · refus « ${await texte('[data-testid="atl-refus-outil"]')} » · file « ${await texte('[data-testid="atl-compte-attente"]')} » · journal « ${await texte('[data-testid="atl-repere-panneau"]')} » · réseau / console : ${journalConsole.join(" | ") || "rien"}`);
    throw e;
  } finally {
    page.off("console", surConsole);
    page.off("response", surReponse);
  }
  const atelierUrl = page.url().split("?")[0];
  const atelierPid = atelierUrl.split("/").pop();
  const copyToastSeen = await page.waitForFunction(() => /Copie de travail créée automatiquement · exemple original conservé\./.test(document.querySelector(".h7-toast")?.textContent || ""), null, { timeout: 6000 }).then(() => true).catch(() => false);
  await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  const copyProject = await (await page.request.get(`${BASE}/projects/${atelierPid}`)).json();
  const afterDraw = await attendre(atelierPid, (v) => v.murs === before.murs + 1);
  const referenceAfter = await rdcWallsOf(examplePid);
  check(
    "atelier de la référence : un mur dessiné → copie de travail créée automatiquement (« P.118 — copie de travail · Atelier », mode modifiable), écran basculé sur la copie, même module",
    copyProject.code === "P.118" && copyProject.name === "copie de travail · Atelier" && copyProject.exampleMode === "editable" && copyProject.sourceExampleId === "p118-exemple-complet" && page.url().includes("module=atelier") && (await page.locator(".project-header h1").textContent()) === "P.118 — copie de travail · Atelier",
    JSON.stringify({ name: copyProject.name, mode: copyProject.exampleMode }),
  );
  check(
    "copie de travail : le mur dessiné y est enregistré (+1 mur, révision 2) ; la référence reste intacte (révision 1, même empreinte)",
    afterDraw.murs === before.murs + 1 && afterDraw.revision === 2 && referenceAfter.murs === before.murs && referenceAfter.revision === 1 && referenceAfter.empreinte === before.empreinte,
    JSON.stringify({ afterDraw: [afterDraw.murs, afterDraw.revision], referenceAfter: [referenceAfter.murs, referenceAfter.revision] }),
  );
  check("copie de travail : plus de note « Exemple protégé » (toast de navigation « Copie de travail créée automatiquement… »)", (await page.locator('[data-testid="atl-note"]').count()) === 0, copyToastSeen ? "toast vu" : "toast non observé (effacé avant la lecture)");
  await page.screenshot({ path: `${OUT}/atelier-concevoir-wall-desktop.png`, fullPage: true });

  const { fileVide } = outilsPlan(page);
  await fileVide().catch(() => null);
  await measure("annulation d'un mur → enregistrée sur le serveur (révision avancée)", async () => {
    await page.locator('[data-testid="atl-annuler"]').click();
    await attendre(atelierPid, (v) => v.revision === 3);
  });
  const afterUndo = await rdcWallsOf(atelierPid);
  check("copie de travail : annuler → mur retiré, révision 3 (l'annulation modifie l'état persistant)", afterUndo.murs === before.murs && afterUndo.revision === 3, JSON.stringify([afterUndo.murs, afterUndo.revision]));
  await fileVide().catch(() => null);
  await page.locator('[data-testid="atl-retablir"]').click();
  const afterRedo = await attendre(atelierPid, (v) => v.revision === 4);
  check("copie de travail : rétablir → mur revenu, révision 4 (le rétablissement est persisté lui aussi)", afterRedo.murs === before.murs + 1 && afterRedo.revision === 4, JSON.stringify([afterRedo.murs, afterRedo.revision]));

  // Second navigateur (même compte) : le modèle enregistré est relu à la même révision et à la même empreinte.
  const ctxDevice2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const device2 = await ctxDevice2.newPage();
  await device2.goto(`${BASE}/connexion`);
  await device2.fill('input[name="email"]', email);
  await device2.fill('input[name="password"]', "scenario-pass-123");
  await device2.click('button[type="submit"]');
  await device2.waitForURL(/\/(projets|accueil)/);
  await ouvrirAtelier(device2, atelierUrl);
  const m2 = await modeleDe(device2, BASE, atelierPid);
  const m1 = await modeleDe(page, BASE, atelierPid);
  const niveaux2 = await device2.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').count();
  check("second navigateur : le modèle est relu à la même révision et à la même empreinte, 6 niveaux affichés", m2.revision === 4 && m2.empreinte === m1.empreinte && niveaux2 === 6, JSON.stringify({ rev: m2.revision, niveaux: niveaux2 }));
  await ctxDevice2.close();

  await measure("rechargement de la page de l'Atelier → modèle affiché", async () => {
    await page.reload();
    await page.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
  });
  check("copie de travail : rechargement → modèle toujours là (6 niveaux, révision 4)", (await page.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').count()) === 6 && (await rdcWallsOf(atelierPid)).revision === 4);
  Object.assign(sc, { examplePid, rdcWallsOf, atelierUrl, atelierPid });
}

/** 5b. Acceptation P.118 dans l'Atelier : exports au catalogue, surfaces et plan de lecture à la révision courante. */
export async function acceptationP118(sc) {
  const { BASE, page, consoleErrors, check } = sc;
  const { atelierPid } = sc;
  const erreursAvant = consoleErrors.length;
  const revision = (await modeleDe(page, BASE, atelierPid)).revision;
  /** Commande de la palette (Ctrl+K) : le libellé exact, puis Entrée. */
  const commande = async (libelle) => {
    await page.locator('[data-testid="plan2d-toile"]').focus();
    await page.keyboard.press("Control+k");
    await page.waitForSelector('[data-testid="atl-palette"]', { timeout: 5000 });
    await page.locator('[data-testid="atl-palette-champ"]').fill(libelle);
    await page.keyboard.press("Enter");
  };
  // Exports du plan du niveau actif (SVG, DXF, PNG) et du métré (CSV) : chacun téléchargé ET enregistré au catalogue
  // (lu sur le serveur : un dessin de plus dans le groupe « dessins »).
  const dessinsAuCatalogue = async () => (await (await page.request.get(`${BASE}/projects/${atelierPid}/documents`)).json()).documents.filter((d) => d.group === "dessins").length;
  const exportes = [];
  for (const [libelle, ext] of [["Exporter le plan en SVG", "svg"], ["Exporter le plan en DXF", "dxf"], ["Exporter le plan en PNG", "png"], ["Exporter le métré CSV", "csv"]]) {
    const avant = await dessinsAuCatalogue();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }).catch(() => null), commande(libelle)]);
    let enregistre = false;
    for (let i = 0; i < 30 && !enregistre; i++) {
      enregistre = (await dessinsAuCatalogue()) > avant;
      if (!enregistre) await page.waitForTimeout(500);
    }
    exportes.push(`${ext}:${download?.suggestedFilename() ?? "aucun"}:${enregistre ? "catalogue" : "non enregistré"}`);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  check("acceptation · exports SVG, DXF, PNG et métré CSV : téléchargés et enregistrés au catalogue", exportes.length === 4 && exportes.every((e, i) => new RegExp(`\\.${["svg", "dxf", "png", "csv"][i]}:catalogue$`).test(e)), exportes.join(" "));
  const documents = (await (await page.request.get(`${BASE}/projects/${atelierPid}/documents`)).json()).documents;
  const dessins = documents.filter((d) => d.group === "dessins");
  check("acceptation · catalogue : 4 dessins / exports « à jour » à la révision courante", dessins.length === 4 && dessins.every((d) => d.freshness === "a-jour" && d.produced.modelRevision === revision), dessins.map((d) => `${d.label} (${d.freshness})`).join(" | "));
  const surfaces = await page.request.get(`${BASE}/projects/${atelierPid}/documents/surfaces`);
  const surfacesDoc = (await (await page.request.get(`${BASE}/projects/${atelierPid}/documents`)).json()).documents.find((d) => d.kind === "tableau-surfaces");
  check("acceptation · tableau des surfaces (CSV) produit depuis la révision courante, mezzanine incluse, « à jour »", surfaces.status() === 200 && /Mezzanine/.test(await surfaces.text()) && surfacesDoc?.freshness === "a-jour" && surfacesDoc?.current?.modelRevision === revision);
  const planLecture = documents.find((d) => /^plan-lecture-/.test(d.kind));
  const plan = planLecture ? await page.request.get(`${BASE}${planLecture.href}`) : null;
  check("acceptation · plan de lecture (SVG) produit depuis la révision courante", !!plan && plan.status() === 200 && /<svg/.test(await plan.text()), planLecture?.label ?? "absent du catalogue");
  check("acceptation · aucune erreur JavaScript pendant l'acceptation", consoleErrors.length === erreursAvant, consoleErrors.slice(erreursAvant).join(" | "));
}
