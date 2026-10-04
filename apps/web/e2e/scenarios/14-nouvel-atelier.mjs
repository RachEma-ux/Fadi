/**
 * Scénario de bout en bout · 14-nouvel-atelier — Nouvel Atelier (lot 3a) : ouverture sur P.118 importé dans le modèle
 * typé, cinq repères, zone de plan, accessibilité (axe-core, WCAG 2.2 AA) sur ordinateur et téléphone 390 px.
 *
 * Gestes d'acceptation du lot 3a (cahier, « Lot 3a », Acceptation) sur la copie de travail de P.118 (modèle typé
 * importé à la première lecture ; la référence protégée n'est pas modifiée) : mur, porte, pièce, type, annuler /
 * rétablir avec révisions persistées, relecture depuis un second navigateur, téléphone 390 px et clavier.
 *
 * Propriétaire : chef de projet (L3a.4, matrice de propriété du lot 3a). L'ordre d'exécution et l'état partagé entre
 * segments sont décrits dans `../run.mjs`.
 */

/** Ouverture du nouvel Atelier par `?module=atelier&version=nouveau` sur l'exemple P.118. */
export async function ouverture(sc) {
  const { page, check, measure, axeCheck } = sc;
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
  for (const [width, height, device] of [
    [1280, 900, "ordinateur"],
    [390, 844, "téléphone"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(400);
    await axeCheck(page, `nouvel atelier (${device})`);
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
  const { BASE, browser, page, consoleErrors, check, measure, axeCheck } = sc;
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
  const pres = (a, b) => Math.abs(a - b) < 1e-9;
  const memePoint = (p, x, y) => pres(p.x, x) && pres(p.y, y);

  const avant = await modele();
  const idsAvant = new Set(Object.keys(avant.objets));
  const niveauId = "p_ss";
  check("nouvel atelier : copie de travail de P.118 importée dans le modèle typé, niveau actif « Sous-sol technique »", avant.objets[niveauId]?.classe === "niveau" && Object.values(avant.objets).filter((o) => o.classe === "niveau").length === 6 && /Sous-sol technique/.test(await page.locator('[data-testid="atl-niveau-actif"]').textContent()), `révision ${avant.revision}`);

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
  check("nouvel atelier : clavier — Entrée sur la zone de plan sélectionne la pièce, l'inspecteur l'affiche", (await page.locator('[data-testid="atl-inspecteur-objet"]').getAttribute("data-objet").catch(() => null)) === piece?.id);

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
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(400);
  await axeCheck(page, "nouvel atelier après les gestes (ordinateur)");
  check("nouvel atelier : aucune erreur JavaScript pendant les gestes (deux navigateurs)", consoleErrors.length === erreursAvant, consoleErrors.slice(erreursAvant).join(" | "));
}
