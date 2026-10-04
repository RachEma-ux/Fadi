/**
 * Scénario de bout en bout · 14-nouvel-atelier — Nouvel Atelier (lot 3a) : ouverture sur P.118 importé dans le modèle
 * typé, cinq repères, zone de plan, accessibilité (axe-core, WCAG 2.2 AA) sur ordinateur et téléphone 390 px.
 *
 * Gestes d'acceptation du lot 3a (cahier, « Lot 3a », Acceptation) sur la copie de travail de P.118 (modèle typé
 * importé à la première lecture ; la référence protégée n'est pas modifiée) : mur, porte, pièce, type, annuler /
 * rétablir avec révisions persistées, relecture depuis un second navigateur, téléphone 390 px et clavier ; puis
 * (lot 3b, L3b.0, D-045) suppression par la touche Suppr annulée et rétablie, panneau Métré monté.
 *
 * Propriétaire : chef de projet (L3a.4, matrice de propriété du lot 3a). L'ordre d'exécution et l'état partagé entre
 * segments sont décrits dans `../run.mjs`.
 */

/** Ouverture du nouvel Atelier par `?module=atelier&version=nouveau` sur l'exemple P.118. */
export async function ouverture(sc) {
  const { OUT, page, check, measure, axeCheck } = sc;
  const { exampleUrl } = sc;
  const url = `${exampleUrl}?module=atelier&version=nouveau`;
  await page.setViewportSize({ width: 1280, height: 900 });
  await measure("ouverture du nouvel Atelier (modèle typé P.118, interface, zone de plan)", async () => {
    await page.goto(url);
    await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="plan2d-svg"]', { state: "attached", timeout: 30000 });
  });
  await page.waitForTimeout(600);
  check("nouvel atelier : interface montée, pas d'erreur d'ouverture", (await page.locator('[data-testid="nouvel-atelier-erreur"]').count()) === 0);
  const niveaux = await page.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').count();
  check("nouvel atelier : les 6 niveaux de P.118 dans le navigateur", niveaux === 6, `${niveaux} niveaux`);
  check("nouvel atelier : zone de plan affichée", await page.locator('[data-testid="plan2d-zone"]').isVisible());
  check("nouvel atelier : l'ancien Atelier n'est pas monté", (await page.locator("#atelier-toolbar").count()) === 0);
  for (const [width, height, device, capture] of [
    [1280, 900, "ordinateur", "desktop"],
    [390, 844, "téléphone", "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await axeCheck(page, `nouvel atelier (${device})`);
    await page.screenshot({ path: `${OUT}/nouvel-atelier-ouverture-${capture}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 900 });
}

/**
 * Gestes d'acceptation du lot 3a sur la copie de travail de P.118 (niveau actif : le premier, « Sous-sol technique »).
 * Les points sont tapés dans la saisie de précision de la zone de plan (`x;y`, repère local, sans accrochage), dans un
 * carré libre (40;40)–(44;44) hors de l'emprise du niveau ; la persistance est lue sur le serveur
 * (`GET /projects/:id/atelier/model`), jamais déduite de l'écran.
 */
export async function gestes(sc) {
  const { BASE, OUT, browser, page, consoleErrors, check, measure, axeCheck } = sc;
  const { email, atelierUrl, atelierPid } = sc;
  const url = `${atelierUrl}?module=atelier&version=nouveau`;
  const erreursAvant = consoleErrors.length;
  await page.setViewportSize({ width: 1280, height: 900 });
  await measure("ouverture du nouvel Atelier sur la copie de travail de P.118", async () => {
    await page.goto(url);
    await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
    await page.waitForSelector('[data-testid="plan2d-toile"]', { timeout: 30000 });
  });
  // Le pointeur reste hors de la zone de plan : seuls la saisie de précision et le clavier placent les points.
  await page.mouse.move(2, 2);
  await page.waitForFunction(() => /Sous-sol technique/.test(document.querySelector('[data-testid="atl-niveau-actif"]')?.textContent ?? ""), null, { timeout: 10000 }).catch(() => null);

  /** Modèle typé tel que le serveur l'a enregistré. */
  const modele = async (p = page) => (await p.request.get(`${BASE}/projects/${atelierPid}/atelier/model`)).json();
  /** Attente côté Node (même raison que `05-atelier.mjs` : pas de `fetch` en boucle depuis l'onglet). */
  const attendreModele = async (predicat, p = page, delaiMs = 20000) => {
    const fin = Date.now() + delaiMs;
    let m = await modele(p);
    while (!predicat(m) && Date.now() < fin) {
      await p.waitForTimeout(400);
      m = await modele(p);
    }
    return m;
  };
  const nouveaux = (m, classe) => Object.values(m.objets).filter((o) => o.classe === classe && !idsAvant.has(o.id));
  const pres = (a, b) => Math.abs(a - b) < 1e-6;
  const memePoint = (p, x, y) => pres(p.x, x) && pres(p.y, y);

  const avant = await modele();
  const idsAvant = new Set(Object.keys(avant.objets));
  // Identifiants importés préfixés par l'identifiant du projet (`<projet>_ss`) : le niveau actif est le premier par ordre.
  const niveauxAvant = Object.values(avant.objets).filter((o) => o.classe === "niveau").sort((a, b) => a.params.ordre - b.params.ordre);
  const niveauId = niveauxAvant[0]?.id;
  check(
    "nouvel atelier : copie de travail de P.118 importée dans le modèle typé (6 niveaux), niveau actif « Sous-sol technique »",
    niveauxAvant.length === 6 && niveauxAvant[0]?.params.nom === "Sous-sol technique" && niveauId.endsWith("_ss") && /Sous-sol technique/.test(await page.locator('[data-testid="atl-niveau-actif"]').textContent()),
    `niveau ${niveauId}, révision ${avant.revision}`,
  );

  const toile = page.locator('[data-testid="plan2d-toile"]');
  const puce = page.locator('[data-testid="atl-puce-outil"]');
  const saisie = page.locator('[data-testid="plan2d-precision"] input:not([readonly])');
  /** Point exact par la saisie de précision : un chiffre sur la zone ouvre le champ, `x;y` puis Entrée pose le point. */
  const poserPoint = async (x, y) => {
    await toile.focus();
    await page.keyboard.press(String(x)[0]);
    await saisie.waitFor({ state: "visible", timeout: 5000 });
    await saisie.fill(`${x};${y}`);
    await saisie.press("Enter");
    await saisie.waitFor({ state: "detached", timeout: 5000 });
  };
  /** Paramètre d'outil saisi dans la bande de précision de la zone de travail (Entrée applique). */
  const parametre = async (champ, valeur) => {
    const c = page.locator(`[data-testid="atl-precision-${champ}"]`);
    await c.fill(valeur);
    await c.press("Enter");
  };
  /** Plus aucun lot en attente d'envoi (annuler / rétablir l'exigent). */
  const fileVide = () => page.waitForFunction(() => /^\s*0 lot\(s\) en attente d'envoi/.test(document.querySelector('[data-testid="atl-compte-attente"]')?.textContent ?? ""), null, { timeout: 20000 });

  // Mur (raccourci M) : quatre segments chaînés, fermés sur le premier point.
  await toile.focus();
  await page.keyboard.press("m");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Mur"), null, { timeout: 5000 }).catch(() => null);
  check("nouvel atelier : raccourci M → outil Mur actif, écriture permise (aucun refus d'outil)", (await puce.textContent()).includes("Mur") && (await page.locator('[data-testid="atl-refus-outil"]').count()) === 0);
  await parametre("epaisseur", "0,2");
  await parametre("hauteur", "2,5");
  for (const [x, y] of [[40, 40], [44, 40], [44, 44], [40, 44], [40, 40]]) await poserPoint(x, y);
  const apresMurs = await attendreModele((m) => nouveaux(m, "mur").length >= 4);
  const murs = nouveaux(apresMurs, "mur");
  const murBas = murs.find((o) => memePoint(o.params.axe.a, 40, 40) && memePoint(o.params.axe.b, 44, 40));
  check(
    "nouvel atelier : quatre murs chaînés et fermés enregistrés sur le serveur (axes exacts, épaisseur 0,20 m, hauteur 2,50 m, niveau actif)",
    murs.length === 4 && !!murBas && murs.every((o) => o.niveauId === niveauId && pres(o.params.epaisseur.value, 0.2) && pres(o.params.hauteur.value, 2.5)) && apresMurs.revision > avant.revision,
    `${murs.length} mur(s), révision ${avant.revision} → ${apresMurs.revision}`,
  );
  await toile.focus();
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Sélection"), null, { timeout: 5000 });

  // Porte (raccourci P) au milieu du mur bas.
  await page.keyboard.press("p");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Porte"), null, { timeout: 5000 });
  await parametre("largeur", "0,9");
  await parametre("hauteur", "2,1");
  await poserPoint(42, 40);
  const apresPorte = await attendreModele((m) => nouveaux(m, "porte").length >= 1);
  const porte = nouveaux(apresPorte, "porte")[0];
  check(
    "nouvel atelier : raccourci P → porte posée sur le mur dessiné (hôte, largeur 0,90 m, hauteur 2,10 m) et enregistrée",
    !!porte && porte.params.murHoteId === murBas?.id && pres(porte.params.largeur.value, 0.9) && pres(porte.params.hauteur.value, 2.1) && apresPorte.revision > apresMurs.revision,
    porte ? `hôte ${porte.params.murHoteId}, révision ${apresPorte.revision}` : "aucune porte",
  );
  await toile.focus();
  await page.keyboard.press("Escape");

  // Pièce : outil de la barre, curseur déplacé au clavier dans le carré (flèches, pas de grille 0,50 m), Entrée crée la pièce proposée.
  await page.locator('[data-testid="atl-outil-creer.piece"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Pièce"), null, { timeout: 5000 });
  await toile.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowUp");
  const proposee = await page
    .waitForFunction(() => /Cliquez pour créer la pièce proposée/.test(document.querySelector('[data-testid="atl-consigne"]')?.textContent ?? ""), null, { timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  check("nouvel atelier : outil Pièce, curseur au clavier dans le carré → pièce proposée (contour fermé par les murs)", proposee, await page.locator('[data-testid="atl-consigne"]').textContent());
  await page.keyboard.press("Enter");
  const apresPiece = await attendreModele((m) => nouveaux(m, "piece").length >= 1);
  const piece = nouveaux(apresPiece, "piece")[0];
  const contour = piece?.params.polygones?.[0]?.contour ?? [];
  check(
    "nouvel atelier : pièce créée sur les axes des quatre murs (4 sommets du carré 4 × 4 m, nom « Pièce n ») et enregistrée",
    !!piece && piece.niveauId === niveauId && contour.length === 4 && [[40, 40], [44, 40], [44, 44], [40, 44]].every(([x, y]) => contour.some((p) => memePoint(p, x, y))) && /^Pièce \d+$/.test(piece.params.nom) && apresPiece.revision > apresPorte.revision,
    piece ? `${piece.params.nom}, révision ${apresPiece.revision}` : "aucune pièce",
  );
  await page.keyboard.press("Escape");

  // Sélection au clavier : sans outil, Entrée choisit l'objet sous le curseur clavier (centre de la pièce).
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Sélection"), null, { timeout: 5000 });
  await page.keyboard.press("Enter");
  await page.waitForSelector(`[data-testid="atl-inspecteur-objet"][data-objet="${piece?.id}"]`, { timeout: 5000 }).catch(() => null);
  const inspecte = page.locator('[data-testid="atl-inspecteur-objet"]');
  check("nouvel atelier : clavier — Entrée sur la zone de plan sélectionne la pièce, l'inspecteur l'affiche", (await inspecte.count()) === 1 && (await inspecte.getAttribute("data-objet")) === piece?.id);

  // Type : mur choisi dans le navigateur (filtre par identifiant), liste de choix de l'inspecteur (D-038).
  await page.locator('[data-testid="atl-nav-filtre"]').fill(murBas.id);
  await page.locator(`[data-testid="atl-objet-${murBas.id}"]`).click();
  await page.waitForSelector(`[data-testid="atl-inspecteur-objet"][data-objet="${murBas.id}"]`, { timeout: 5000 });
  const champType = page.locator('[data-testid="atl-champ-typeId"]');
  const typeInitial = await champType.inputValue();
  await champType.selectOption("cloison");
  const apresType = await attendreModele((m) => m.objets[murBas.id]?.params.typeId === "cloison");
  check(
    "nouvel atelier : type du mur modifié dans l'inspecteur (« Sans type » → « cloison »), enregistré, révision persistée en hausse",
    typeInitial === "non-type" && apresType.objets[murBas.id]?.params.typeId === "cloison" && apresType.revision > apresPiece.revision,
    `${typeInitial} → ${apresType.objets[murBas.id]?.params.typeId}, révision ${apresType.revision}`,
  );

  // Annuler / rétablir (boutons de l'en-tête) : révision persistée à chaque fois, type relu sur le serveur et dans l'inspecteur.
  const revisionAnnoncee = async (motif, apres) => {
    await page.waitForFunction(
      ({ source, apres }) => {
        const m = new RegExp(source).exec(document.querySelector('[data-testid="atl-annonce"]')?.textContent ?? "");
        return !!m && Number(m[1]) > apres;
      },
      { source: motif.source, apres },
      { timeout: 20000 },
    );
    return Number(new RegExp(motif.source).exec(await page.locator('[data-testid="atl-annonce"]').textContent())[1]);
  };
  const ANNULEE = /Modification annulée — révision (\d+)/;
  const RETABLIE = /Modification rétablie — révision (\d+)/;
  await fileVide();
  await page.locator('[data-testid="atl-annuler"]').click();
  const revAnnulee = await revisionAnnoncee(ANNULEE, apresType.revision);
  const apresAnnuler = await modele();
  check(
    "nouvel atelier : Annuler → type revenu à « Sans type » sur le serveur et dans l'inspecteur, nouvelle révision persistée (celle annoncée)",
    apresAnnuler.objets[murBas.id]?.params.typeId === "non-type" && apresAnnuler.revision === revAnnulee && revAnnulee > apresType.revision && (await champType.inputValue()) === "non-type",
    `révision ${apresType.revision} → ${apresAnnuler.revision}`,
  );
  await page.locator('[data-testid="atl-retablir"]').click();
  const revRetablie = await revisionAnnoncee(RETABLIE, revAnnulee);
  const apresRetablir = await modele();
  check(
    "nouvel atelier : Rétablir → type « cloison » de nouveau sur le serveur et dans l'inspecteur, nouvelle révision persistée (celle annoncée)",
    apresRetablir.objets[murBas.id]?.params.typeId === "cloison" && apresRetablir.revision === revRetablie && revRetablie > revAnnulee && (await champType.inputValue()) === "cloison",
    `révision ${revAnnulee} → ${apresRetablir.revision}`,
  );

  // Second navigateur (autre contexte, même compte) : relecture à la même révision.
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page2 = await ctx2.newPage();
  page2.on("pageerror", (e) => consoleErrors.push(e.message));
  await page2.goto(`${BASE}/connexion`);
  await page2.fill('input[name="email"]', email);
  await page2.fill('input[name="password"]', "scenario-pass-123");
  await page2.click('button[type="submit"]');
  await page2.waitForURL(/\/(projets|accueil)/);
  await page2.goto(url);
  await page2.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  const lu2 = await modele(page2);
  check(
    "nouvel atelier : second navigateur — même révision persistée, murs, porte, pièce et type « cloison » relus",
    lu2.revision === apresRetablir.revision && murs.every((o) => lu2.objets[o.id]?.classe === "mur") && lu2.objets[porte.id]?.classe === "porte" && lu2.objets[piece.id]?.classe === "piece" && lu2.objets[murBas.id]?.params.typeId === "cloison",
    `révision ${lu2.revision} (premier navigateur ${apresRetablir.revision})`,
  );
  await page2.locator('[data-testid="atl-nav-filtre"]').fill(murBas.id);
  await page2.locator(`[data-testid="atl-objet-${murBas.id}"]`).click();
  await page2.waitForSelector(`[data-testid="atl-inspecteur-objet"][data-objet="${murBas.id}"]`, { timeout: 10000 });
  check("nouvel atelier : second navigateur — le mur s'ouvre dans l'inspecteur avec le type « cloison »", (await page2.locator('[data-testid="atl-champ-typeId"]').inputValue()) === "cloison");
  await ctx2.close();

  // Téléphone 390 px : disposition en feuilles, sans défilement horizontal ; annuler / rétablir au clavier.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  check(
    "nouvel atelier : téléphone 390 px — disposition téléphone (onglets du bas, sélection), sans défilement horizontal",
    (await page.locator('[data-testid="atelier-interface"]').evaluate((el) => el.classList.contains("atl-tel"))) && (await page.locator('[data-testid="atl-onglet-inspecteur"]').isVisible()) && (await page.locator('[data-testid="atl-tel-selection"]').isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)),
  );
  await fileVide();
  await toile.focus();
  await page.keyboard.press("Control+z");
  const revClavierA = await revisionAnnoncee(ANNULEE, revRetablie);
  const apresClavierA = await modele();
  check(
    "nouvel atelier : téléphone + clavier — Ctrl+Z annule (type « Sans type » sur le serveur, révision annoncée persistée)",
    apresClavierA.objets[murBas.id]?.params.typeId === "non-type" && apresClavierA.revision === revClavierA && revClavierA > revRetablie,
    `révision ${revRetablie} → ${apresClavierA.revision}`,
  );
  await toile.focus();
  await page.keyboard.press("Control+Shift+Z");
  const revClavierR = await revisionAnnoncee(RETABLIE, revClavierA);
  const apresClavierR = await modele();
  check(
    "nouvel atelier : téléphone + clavier — Ctrl+Maj+Z rétablit (type « cloison » sur le serveur, révision annoncée persistée)",
    apresClavierR.objets[murBas.id]?.params.typeId === "cloison" && apresClavierR.revision === revClavierR && revClavierR > revClavierA,
    `révision ${revClavierA} → ${apresClavierR.revision}`,
  );
  await page.locator('[data-testid="atl-onglet-inspecteur"]').click();
  await page.waitForSelector('[data-testid="atl-champ-typeId"]', { state: "visible", timeout: 5000 });
  check("nouvel atelier : téléphone — la feuille Inspecteur montre le mur sélectionné, type « cloison »", (await page.locator('[data-testid="atl-inspecteur-objet"]').getAttribute("data-objet")) === murBas.id && (await page.locator('[data-testid="atl-champ-typeId"]').inputValue()) === "cloison");
  await axeCheck(page, "nouvel atelier après les gestes (téléphone, feuille Inspecteur)");
  await page.screenshot({ path: `${OUT}/nouvel-atelier-gestes-mobile.png` });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  await axeCheck(page, "nouvel atelier après les gestes (ordinateur)");
  await page.screenshot({ path: `${OUT}/nouvel-atelier-gestes-desktop.png` });

  // Suppression (L3b.0, D-045) : mur bas sélectionné, touche Suppr → outil « Supprimer » qui liste la porte hébergée
  // avant l'accord ; Entrée supprime ; Annuler la rend, Rétablir la refait, révisions persistées.
  await page.locator('[data-testid="atl-nav-filtre"]').fill(murBas.id);
  await page.locator(`[data-testid="atl-objet-${murBas.id}"]`).click();
  await page.waitForSelector(`[data-testid="atl-inspecteur-objet"][data-objet="${murBas.id}"]`, { timeout: 10000 });
  await page.locator('[data-testid="atl-nav-filtre"]').fill("");
  await fileVide();
  await toile.focus();
  await page.keyboard.press("Delete");
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Supprimer"), null, { timeout: 5000 }).catch(() => null);
  const consigneSuppr = (await page.locator('[data-testid="atl-consigne"]').textContent()) ?? "";
  check(
    "nouvel atelier : Suppr sur le mur sélectionné → outil Supprimer, la porte hébergée est listée avant l'accord, rien n'est encore écrit",
    (await puce.textContent()).includes("Supprimer") && consigneSuppr.includes(murBas.id) && consigneSuppr.includes(porte.id) && (await modele()).revision === apresClavierR.revision,
    consigneSuppr,
  );
  await toile.focus();
  await page.keyboard.press("Enter");
  const apresSuppr = await attendreModele((m) => !m.objets[murBas.id]);
  check(
    "nouvel atelier : Entrée → mur et porte hébergée supprimés sur le serveur, nouvelle révision",
    !apresSuppr.objets[murBas.id] && !apresSuppr.objets[porte.id] && apresSuppr.revision > apresClavierR.revision,
    `révision ${apresClavierR.revision} → ${apresSuppr.revision}`,
  );
  await fileVide();
  await page.locator('[data-testid="atl-annuler"]').click();
  const revSupprA = await revisionAnnoncee(ANNULEE, apresSuppr.revision);
  const apresSupprA = await modele();
  check(
    "nouvel atelier : Annuler la suppression → mur (type « cloison ») et porte de retour sur le serveur, révision annoncée persistée",
    apresSupprA.objets[murBas.id]?.params.typeId === "cloison" && apresSupprA.objets[porte.id]?.params.murHoteId === murBas.id && apresSupprA.revision === revSupprA,
    `révision ${apresSuppr.revision} → ${apresSupprA.revision}`,
  );
  await page.locator('[data-testid="atl-retablir"]').click();
  const revSupprR = await revisionAnnoncee(RETABLIE, revSupprA);
  const apresSupprR = await modele();
  check(
    "nouvel atelier : Rétablir la suppression → mur et porte de nouveau absents, révision annoncée persistée",
    !apresSupprR.objets[murBas.id] && !apresSupprR.objets[porte.id] && apresSupprR.revision === revSupprR && revSupprR > revSupprA,
    `révision ${revSupprA} → ${apresSupprR.revision}`,
  );

  // Panneau « Métré » monté sous le navigateur (D-045) : niveau actif et révision courante.
  const metre = page.locator('[data-testid="atl-doc-metre"]');
  await metre.scrollIntoViewIfNeeded().catch(() => null);
  // Calculé à l'ouverture, il est marqué « À recalculer » après les gestes (R11) ; « Recalculer » le remet à la révision courante.
  const perime = await metre.getByText("À recalculer").isVisible().catch(() => false);
  if (perime) await metre.getByRole("button", { name: "Recalculer", exact: true }).click();
  await page.waitForFunction((rev) => (document.querySelector('[data-testid="atl-doc-metre"]')?.textContent ?? "").includes(`Révision ${rev} `), apresSupprR.revision, { timeout: 5000 }).catch(() => null);
  const texteMetre = (await metre.textContent().catch(() => "")) ?? "";
  check(
    "nouvel atelier : panneau Métré monté (onglet Projet), périmé après les gestes puis recalculé à la révision courante",
    (await metre.isVisible()) && perime && /Métré · /.test(texteMetre) && texteMetre.includes(`Révision ${apresSupprR.revision} `) && !texteMetre.includes("À recalculer"),
    texteMetre.slice(0, 160),
  );
  check("nouvel atelier : aucune erreur JavaScript pendant les gestes (deux navigateurs)", consoleErrors.length === erreursAvant, consoleErrors.slice(erreursAvant).join(" | "));
}

/**
 * Vue 3D (lot 3b, L3b.1) sur la copie de travail de P.118 : bascule Plan 2D → 3D (WebGL2), puis chaque niveau ×
 * chaque mode (volume, éclaté, coupe) rendu sans vue vide (triangles dessinés > 0, lus dans `atl-3d-etat`) ni
 * erreur JavaScript ; plan de coupe réglable ; navigation au clavier ; axe-core ordinateur et téléphone.
 */
export async function vue3d(sc) {
  const { OUT, page, consoleErrors, check, measure, axeCheck } = sc;
  const { atelierUrl } = sc;
  const erreursAvant = consoleErrors.length;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${atelierUrl}?module=atelier&version=nouveau`);
  await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  const etat = page.locator('[data-testid="atl-3d-etat"]');
  const lire = async () => ({
    mode: await etat.getAttribute("data-mode"),
    moteur: await etat.getAttribute("data-moteur"),
    niveaux: await etat.getAttribute("data-niveaux"),
    triangles: Number(await etat.getAttribute("data-triangles")),
    objets: Number(await etat.getAttribute("data-objets")),
  });
  /** Attend que l'état du rendu corresponde (mode, niveaux) avec des triangles dessinés. */
  const attendreRendu = (mode, niveaux) =>
    page
      .waitForFunction(
        ({ mode, niveaux }) => {
          const el = document.querySelector('[data-testid="atl-3d-etat"]');
          return !!el && el.getAttribute("data-mode") === mode && (niveaux === null || el.getAttribute("data-niveaux") === niveaux) && Number(el.getAttribute("data-triangles")) > 0;
        },
        { mode, niveaux },
        { timeout: 30000 },
      )
      .then(() => true)
      .catch(() => false);

  await measure("ouverture de la vue 3D (WebGL2, tous les niveaux de P.118)", async () => {
    await page.locator('[data-testid="atl-vue-3d"]').click();
    await page.waitForSelector('[data-testid="atl-3d-toile"]', { timeout: 30000 });
    await attendreRendu("volume", null);
  });
  const ouverte = await lire();
  check(
    "nouvel atelier 3D : bascule Plan 2D → 3D, rendu WebGL2 de tous les niveaux (triangles dessinés, aucun échec de moteur)",
    ouverte.moteur === "webgl2" && ouverte.triangles > 0 && ouverte.objets > 0 && ouverte.niveaux?.split(",").length === 6 && (await page.locator('[data-testid="atl-3d-echec"]').count()) === 0,
    JSON.stringify(ouverte),
  );

  // Chaque niveau × chaque mode, niveau actif seul.
  await page.locator('[data-testid="atl-3d-niveaux-actif"]').click();
  const ids = await page.locator('[data-testid^="atl-niveau-"]:not([data-testid="atl-niveau-actif"])').evaluateAll((els) => els.map((e) => e.getAttribute("data-testid").slice("atl-niveau-".length)));
  const vides = [];
  for (const id of ids) {
    await page.locator(`[data-testid="atl-niveau-${id}"]`).click();
    for (const mode of ["volume", "eclate", "coupe"]) {
      await page.locator(`[data-testid="atl-3d-mode-${mode}"]`).click();
      if (!(await attendreRendu(mode, id))) vides.push(`${id}/${mode} ${JSON.stringify(await lire())}`);
    }
  }
  check(`nouvel atelier 3D : ${ids.length} niveaux × 3 modes (volume, éclaté, coupe) rendus sans vue vide`, ids.length === 6 && vides.length === 0, vides.join(" | ") || `${ids.length * 3} rendus`);

  // Plan de coupe réglable (mode coupe, dernier niveau) : le libellé suit le curseur.
  const curseur = page.locator('[data-testid="atl-3d-coupe"]');
  const avantCoupe = await curseur.inputValue();
  await curseur.evaluate((el) => {
    const v = String(Number(el.min) + (Number(el.max) - Number(el.min)) / 2);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const apresCoupe = await curseur.inputValue();
  const libelleCoupe = (await page.locator(".atl-3d-coupe").textContent()) ?? "";
  check(
    "nouvel atelier 3D : plan de coupe réglable (curseur), hauteur affichée mise à jour, rendu non vide",
    apresCoupe !== avantCoupe && libelleCoupe.includes(Number(apresCoupe).toFixed(2).replace(".", ",")) && (await attendreRendu("coupe", null)),
    `${avantCoupe} → ${apresCoupe} · ${libelleCoupe}`,
  );

  // Clavier : orbite (flèches), panoramique (Maj+flèches), zoom (+ / −), toujours rendu.
  await page.locator('[data-testid="atl-3d-mode-volume"]').click();
  await page.locator('[data-testid="atl-3d-niveaux-tous"]').click();
  await page.locator('[data-testid="atl-3d-toile"]').focus();
  for (const k of ["ArrowLeft", "ArrowUp", "Shift+ArrowRight", "+", "-", "Escape"]) await page.keyboard.press(k);
  check("nouvel atelier 3D : orbite, panoramique et zoom au clavier sur la vue focalisée, rendu toujours non vide", (await attendreRendu("volume", null)) && (await page.evaluate(() => document.activeElement?.getAttribute("data-testid"))) === "atl-3d-toile");

  await axeCheck(page, "nouvel atelier, vue 3D (ordinateur)");
  await page.screenshot({ path: `${OUT}/nouvel-atelier-3d-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  await attendreRendu("volume", null);
  await axeCheck(page, "nouvel atelier, vue 3D (téléphone)");
  await page.screenshot({ path: `${OUT}/nouvel-atelier-3d-mobile.png` });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  await page.locator('[data-testid="atl-vue-plan"]').click();
  check("nouvel atelier 3D : aucune erreur JavaScript pendant la vue 3D, retour au plan 2D", consoleErrors.length === erreursAvant && (await page.locator('[data-testid="plan2d-zone"]').isVisible()), consoleErrors.slice(erreursAvant).join(" | "));
}

/**
 * Pousser / tirer et extrusion (lot 3b, L3b.2) sur la copie de travail de P.118 : en 3D, la hauteur d'un mur du
 * niveau actif est modifiée par un glisser vertical puis par une valeur tapée, et persistée (lue sur le serveur) ;
 * dans le plan, un rectangle tracé au clavier est extrudé à 0,90 m en solide, visible en 3D.
 */
export async function pousserTirer(sc) {
  const { BASE, page, consoleErrors, check } = sc;
  const { atelierUrl, atelierPid } = sc;
  const erreursAvant = consoleErrors.length;
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${atelierUrl}?module=atelier&version=nouveau`);
  await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  const modele = async () => (await page.request.get(`${BASE}/projects/${atelierPid}/atelier/model`)).json();
  const attendreModele = async (predicat, delaiMs = 20000) => {
    const fin = Date.now() + delaiMs;
    let m = await modele();
    while (!predicat(m) && Date.now() < fin) {
      await page.waitForTimeout(400);
      m = await modele();
    }
    return m;
  };
  const puce = page.locator('[data-testid="atl-puce-outil"]');
  const parametre = async (champ, valeur) => {
    const c = page.locator(`[data-testid="atl-precision-${champ}"]`);
    await c.fill(valeur);
    await c.press("Enter");
  };
  const choisirObjet = async (id) => {
    await page.locator('[data-testid="atl-nav-filtre"]').fill(id);
    await page.locator(`[data-testid="atl-objet-${id}"]`).click();
    await page.waitForSelector(`[data-testid="atl-inspecteur-objet"][data-objet="${id}"]`, { timeout: 10000 });
    await page.locator('[data-testid="atl-nav-filtre"]').fill("");
  };

  // Mur du niveau actif dont la hauteur est donnée (pas liée à un niveau haut).
  const niveauActif = (await page.locator('[data-testid^="atl-niveau-"][aria-pressed="true"]').first().getAttribute("data-testid"))?.slice("atl-niveau-".length);
  const avant = await modele();
  const poussable = (o) => o.classe === "mur" && o.params.hauteur && !o.params.niveauHaut;
  const mur = Object.values(avant.objets).find((o) => poussable(o) && o.niveauId === niveauActif) ?? Object.values(avant.objets).find(poussable);
  const h0 = mur?.params.hauteur.value;
  if (mur && mur.niveauId !== niveauActif) await page.locator(`[data-testid="atl-niveau-${mur.niveauId}"]`).click();

  await page.locator('[data-testid="atl-vue-3d"]').click();
  await page.waitForSelector('[data-testid="atl-3d-toile"]', { timeout: 30000 });
  await choisirObjet(mur.id);
  // Les onglets de famille n'existent qu'au niveau d'affichage Complet (le niveau courant dépend des scénarios précédents).
  await page.locator('[data-testid="atl-affichage-complet"]').click();
  await page.locator('[data-testid="atl-outil-famille-modifier"]').click();
  await page.locator('[data-testid="atl-outil-modifier.pousser"]').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="atl-puce-outil"]')?.textContent?.includes("Pousser"), null, { timeout: 5000 }).catch(() => null);
  check(
    "nouvel atelier 3D : outil Pousser / tirer actif sur le mur sélectionné (hauteur courante proposée)",
    (await puce.textContent()).includes("Pousser") && ((await page.locator('[data-testid="atl-consigne"]').textContent()) ?? "").includes(mur.id),
    `${mur?.id} h=${h0}`,
  );

  // Glisser vertical vers le haut au centre de la vue : aperçu puis validation au relâcher.
  // page.mouse ne fait pas défiler : le canevas est amené à l'écran et le geste vise le centre de sa partie visible.
  const toile3d = page.locator('[data-testid="atl-3d-toile"]');
  await toile3d.scrollIntoViewIfNeeded();
  const boite = await toile3d.boundingBox();
  const vp = page.viewportSize();
  const haut = Math.max(boite.y, 0);
  const bas = Math.min(boite.y + boite.height, vp.height);
  const cx = boite.x + boite.width / 2;
  const cy = Math.max(haut + 90, (haut + bas) / 2);
  const sousPointeur = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.getAttribute("data-testid") ?? document.elementFromPoint(x, y)?.tagName ?? "rien", [cx, cy]);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx, cy - i * 10);
  const consignePendant = (await page.locator('[data-testid="atl-consigne"]').textContent()) ?? "";
  await page.mouse.up();
  const apresGlisser = await attendreModele((m) => m.objets[mur.id]?.params.hauteur?.value > h0);
  const h1 = apresGlisser.objets[mur.id]?.params.hauteur?.value;
  const erreursGeste = (await page.locator('[data-testid="atl-erreurs-geste"], [data-testid="atl-3d-erreurs"]').allTextContents()).join(" / ");
  check(
    "nouvel atelier 3D : pousser / tirer — glisser vers le haut augmente la hauteur du mur, persistée sur le serveur (nouvelle révision)",
    h1 > h0 && apresGlisser.revision > avant.revision,
    `hauteur ${h0} → ${h1} m, révision ${avant.revision} → ${apresGlisser.revision} · sous le pointeur : ${sousPointeur} · consigne pendant : ${consignePendant} · erreurs : ${erreursGeste.slice(0, 300)}`,
  );

  // L'outil se ferme après une validation ; s'il est resté actif (refus), un nouveau clic le désactiverait.
  if (!((await puce.textContent()) ?? "").includes("Pousser")) await page.locator('[data-testid="atl-outil-modifier.pousser"]').click();
  await parametre("hauteur", "3,2");
  const apresSaisie = await attendreModele((m) => m.objets[mur.id]?.params.hauteur?.value === 3.2);
  check("nouvel atelier 3D : pousser / tirer — hauteur tapée 3,20 m persistée exactement", apresSaisie.objets[mur.id]?.params.hauteur?.value === 3.2 && apresSaisie.revision > apresGlisser.revision, `révision ${apresSaisie.revision}`);

  // Extrusion : rectangle 2 × 1 m tracé au clavier (R, deux points) dans un endroit libre, puis Extruder à 0,90 m.
  await page.locator('[data-testid="atl-vue-plan"]').click();
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
  const idsAvant = new Set(Object.keys(apresSaisie.objets));
  await toile.focus();
  await page.keyboard.press("r");
  await poserPoint(50, 50);
  await poserPoint(52, 51);
  const apresRect = await attendreModele((m) => Object.values(m.objets).some((o) => o.classe === "esquisse.rectangle" && !idsAvant.has(o.id)));
  const rect = Object.values(apresRect.objets).find((o) => o.classe === "esquisse.rectangle" && !idsAvant.has(o.id));
  await toile.focus();
  await page.keyboard.press("Escape");
  await choisirObjet(rect.id);
  await page.locator('[data-testid="atl-affichage-complet"]').click();
  await page.locator('[data-testid="atl-outil-famille-creer"]').click();
  await page.locator('[data-testid="atl-outil-creer.extruder"]').click();
  await parametre("hauteur", "0,9");
  const apresExtr = await attendreModele((m) => Object.values(m.objets).some((o) => o.classe === "solide" && !idsAvant.has(o.id)));
  const solide = Object.values(apresExtr.objets).find((o) => o.classe === "solide" && !idsAvant.has(o.id));
  check(
    "nouvel atelier : Extruder — rectangle 2,00 × 1,00 m extrudé à 0,90 m en solide (contour à 4 sommets, esquisse conservée), persisté",
    !!solide && solide.params.hauteur.value === 0.9 && solide.params.contour.length === 4 && solide.niveauId === rect.niveauId && !!apresExtr.objets[rect.id],
    solide ? `${solide.id}, révision ${apresExtr.revision}` : "aucun solide",
  );

  await page.locator('[data-testid="atl-affichage-essentiel"]').click();
  await page.locator('[data-testid="atl-vue-3d"]').click();
  await page.locator('[data-testid="atl-3d-niveaux-actif"]').click();
  const visible = await page
    .waitForFunction((rev) => {
      const el = document.querySelector('[data-testid="atl-3d-etat"]');
      return !!el && el.getAttribute("data-revision") === String(rev) && Number(el.getAttribute("data-triangles")) > 0;
    }, apresExtr.revision, { timeout: 20000 })
    .then(() => true)
    .catch(() => false);
  await page.locator('[data-testid="atl-vue-plan"]').click();
  check("nouvel atelier 3D : solide et mur modifié rendus en 3D à la révision courante, aucune erreur JavaScript", visible && consoleErrors.length === erreursAvant, consoleErrors.slice(erreursAvant).join(" | "));
}

/**
 * Mesures et toucher de la vue 3D (lot 3b, L3b.3) sur P.118. Mesures `⏱` imprimées (jamais annoncées avant, R14) :
 * ouverture de la vue 3D, construction de la scène, sélection au clic, déplacement par le manipulateur (jusqu'à la
 * révision serveur), orbite (p95 de l'intervalle entre images pendant un glisser continu, et p95 du temps de rendu
 * côté processeur), enregistrement (pousser / tirer jusqu'à la révision serveur). Puis téléphone tactile (contexte
 * `hasTouch`) : un doigt fait tourner la vue, deux doigts qui s'écartent rapprochent la caméra, un toucher
 * sélectionne ; cibles d'au moins 44 px dans la barre de la vue 3D.
 */
export async function mesures3d(sc) {
  const { BASE, browser, page, consoleErrors, check, measure, measures } = sc;
  const { email, atelierUrl, atelierPid } = sc;
  const erreursAvant = consoleErrors.length;
  const url = `${atelierUrl}?module=atelier&version=nouveau`;
  const modele = async (p = page) => (await p.request.get(`${BASE}/projects/${atelierPid}/atelier/model`)).json();
  const attendreModele = async (predicat, p = page, delaiMs = 20000) => {
    const fin = Date.now() + delaiMs;
    let m = await modele(p);
    while (!predicat(m) && Date.now() < fin) {
      await p.waitForTimeout(200);
      m = await modele(p);
    }
    return m;
  };
  const attr = async (nom, p = page) => p.locator('[data-testid="atl-3d-etat"]').getAttribute(`data-${nom}`);
  const publier = (label, ms) => {
    measures.push({ label, ms });
    console.log(`⏱ ${label} : ${ms} ms`);
  };

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(url);
  await page.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  await measure("vue 3D : bascule et première image (tous les niveaux de P.118)", async () => {
    await page.locator('[data-testid="atl-vue-3d"]').click();
    await page.waitForFunction(() => Number(document.querySelector('[data-testid="atl-3d-etat"]')?.getAttribute("data-triangles")) > 0, null, { timeout: 30000 });
  });
  publier("vue 3D : construction de la scène (prismes, fusion, arêtes)", Number(await attr("scene-ms")));

  // Sélection au clic : premier objet trouvé sur une grille de points autour du centre.
  const toile = page.locator('[data-testid="atl-3d-toile"]');
  const b = await toile.boundingBox();
  let selectionMs = null;
  const pt = { x: 0, y: 0 };
  for (const [fx, fy] of [[0.5, 0.5], [0.45, 0.55], [0.55, 0.45], [0.4, 0.5], [0.6, 0.5], [0.5, 0.6], [0.5, 0.4]]) {
    pt.x = b.x + b.width * fx;
    pt.y = b.y + b.height * fy;
    const t0 = Date.now();
    await page.mouse.click(pt.x, pt.y);
    const ok = await page.waitForFunction(() => Number(document.querySelector('[data-testid="atl-3d-etat"]')?.getAttribute("data-selection")) > 0, null, { timeout: 3000 }).then(() => true).catch(() => false);
    if (ok) {
      selectionMs = Date.now() - t0;
      break;
    }
  }
  if (selectionMs !== null) publier("vue 3D : sélection au clic (jusqu'à la surbrillance)", selectionMs);
  const choisi = await page.locator('[data-testid="atl-inspecteur-objet"]').getAttribute("data-objet").catch(() => null);

  // Déplacement par le manipulateur (objet sélectionné, glisser de 40 px), jusqu'à la révision serveur ; annulé ensuite.
  let deplacementMs = null;
  const avant = await modele();
  // Le glisser part du point qui a sélectionné l'objet (il est donc sous le pointeur et sélectionné).
  if (selectionMs !== null && choisi && !["porte", "fenetre", "ouverture"].includes(avant.objets[choisi]?.classe)) {
    const t0 = Date.now();
    await page.mouse.move(pt.x, pt.y);
    await page.mouse.down();
    for (let i = 1; i <= 4; i++) await page.mouse.move(pt.x + i * 10, pt.y);
    await page.mouse.up();
    const apres = await attendreModele((m) => m.revision > avant.revision, page, 10000);
    if (apres.revision > avant.revision) {
      deplacementMs = Date.now() - t0;
      publier("vue 3D : déplacement par le manipulateur (jusqu'à la révision serveur)", deplacementMs);
      await page.waitForFunction(() => /^\s*0 lot\(s\) en attente d'envoi/.test(document.querySelector('[data-testid="atl-compte-attente"]')?.textContent ?? ""), null, { timeout: 20000 }).catch(() => null);
      await page.locator('[data-testid="atl-annuler"]').click();
      await attendreModele((m) => m.revision > apres.revision, page, 10000);
    }
  }

  // Orbite : glisser continu de 120 pas sur une zone vide (bord haut de la vue), intervalles entre images mesurés dans la page.
  await page.keyboard.press("Escape");
  await page.evaluate(() => {
    window.__intervalles = [];
    let precedent = performance.now();
    const boucle = (t) => {
      window.__intervalles.push(t - precedent);
      precedent = t;
      if (window.__intervalles.length < 400) requestAnimationFrame(boucle);
    };
    requestAnimationFrame(boucle);
  });
  const x0 = b.x + b.width * 0.15;
  const y0 = b.y + 12;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 120; i++) await page.mouse.move(x0 + i * 4, y0 + (i % 2));
  await page.mouse.up();
  const intervalles = await page.evaluate(() => window.__intervalles.slice(1));
  const tri = [...intervalles].sort((a, c) => a - c);
  const p95Images = tri.length ? Math.round(tri[Math.min(tri.length - 1, Math.ceil(0.95 * tri.length) - 1)]) : null;
  const p95Rendu = Number(await attr("trame-p95"));
  const nTrames = Number(await attr("trames"));
  if (p95Images !== null) publier(`vue 3D : orbite, p95 de l'intervalle entre images (${tri.length} images)`, p95Images);
  publier(`vue 3D : orbite, p95 du temps de rendu processeur (${nTrames} trames)`, Math.round(p95Rendu * 100) / 100);

  // Enregistrement : pousser / tirer d'un mur à hauteur donnée, valeur tapée → révision serveur.
  const m0 = await modele();
  const mur = Object.values(m0.objets).find((o) => o.classe === "mur" && o.params.hauteur && !o.params.niveauHaut);
  let enregistrementMs = null;
  if (mur) {
    await page.locator('[data-testid="atl-nav-filtre"]').fill(mur.id);
    await page.locator(`[data-testid="atl-objet-${mur.id}"]`).click();
    await page.locator('[data-testid="atl-nav-filtre"]').fill("");
    await page.locator('[data-testid="atl-affichage-complet"]').click();
    await page.locator('[data-testid="atl-outil-famille-modifier"]').click();
    await page.locator('[data-testid="atl-outil-modifier.pousser"]').click();
    const champ = page.locator('[data-testid="atl-precision-hauteur"]');
    await champ.fill(String(mur.params.hauteur.value + 0.1).replace(".", ","));
    const t0 = Date.now();
    await champ.press("Enter");
    const apres = await attendreModele((m) => m.revision > m0.revision);
    if (apres.revision > m0.revision) enregistrementMs = Date.now() - t0;
    if (enregistrementMs !== null) publier("vue 3D : enregistrement d'un pousser / tirer (jusqu'à la révision serveur)", enregistrementMs);
  }
  check(
    "nouvel atelier 3D : mesures imprimées — ouverture, scène, sélection, déplacement, orbite p95 (images et rendu), enregistrement",
    p95Images !== null && tri.length >= 60 && nTrames >= 60 && Number.isFinite(p95Rendu) && selectionMs !== null && enregistrementMs !== null,
    `sélection ${selectionMs} ms, déplacement ${deplacementMs ?? "non mesuré"} ms, orbite p95 ${p95Images} ms / rendu ${p95Rendu} ms (${nTrames} trames), enregistrement ${enregistrementMs} ms`,
  );
  await page.locator('[data-testid="atl-vue-plan"]').click();

  // Téléphone tactile : un doigt (orbite), deux doigts (pincer), toucher (sélection), cibles ≥ 44 px.
  const ctxTel = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const tel = await ctxTel.newPage();
  tel.on("pageerror", (e) => consoleErrors.push(e.message));
  await tel.goto(`${BASE}/connexion`);
  await tel.fill('input[name="email"]', email);
  await tel.fill('input[name="password"]', "scenario-pass-123");
  await tel.click('button[type="submit"]');
  await tel.waitForURL(/\/(projets|accueil)/);
  await tel.goto(url);
  await tel.waitForSelector('[data-testid="atelier-interface"]', { timeout: 30000 });
  await tel.locator('[data-testid="atl-vue-3d"]').tap();
  await tel.waitForFunction(() => Number(document.querySelector('[data-testid="atl-3d-etat"]')?.getAttribute("data-triangles")) > 0, null, { timeout: 30000 });
  const cdp = await ctxTel.newCDPSession(tel);
  const bt = await tel.locator('[data-testid="atl-3d-toile"]').boundingBox();
  const cx = bt.x + bt.width / 2;
  const cy = bt.y + bt.height / 2;
  const toucher = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
  const az0 = Number(await attr("azimut", tel));
  await toucher("touchStart", [[cx - 60, cy]]);
  for (let i = 1; i <= 10; i++) await toucher("touchMove", [[cx - 60 + i * 12, cy]]);
  await toucher("touchEnd", []);
  await tel.waitForTimeout(200);
  const az1 = Number(await attr("azimut", tel));
  const d0 = Number(await attr("distance", tel));
  await toucher("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 10; i++) await toucher("touchMove", [[cx - 30 - i * 8, cy], [cx + 30 + i * 8, cy]]);
  await toucher("touchEnd", []);
  await tel.waitForTimeout(200);
  const d1 = Number(await attr("distance", tel));
  const cibles = await tel.locator('[data-testid="atl-3d"] .atl-3d-barre button, [data-testid="atl-3d"] .atl-3d-barre select').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 44).map((e) => e.textContent?.trim() || e.getAttribute("data-testid")));
  check(
    "nouvel atelier 3D : téléphone tactile — un doigt fait tourner la vue, deux doigts écartés rapprochent la caméra, cibles de la barre ≥ 44 px",
    az1 !== az0 && d1 < d0 && cibles.length === 0,
    `azimut ${az0}° → ${az1}°, distance ${d0} → ${d1} m, cibles < 44 px : ${cibles.join(", ") || "aucune"}`,
  );
  await ctxTel.close();
  check("nouvel atelier 3D : aucune erreur JavaScript pendant les mesures et le toucher", consoleErrors.length === erreursAvant, consoleErrors.slice(erreursAvant).join(" | "));
}
