/**
 * Scénario de bout en bout · 10-accueil-parametres — Accueil et Paramètres.
 *
 * Segments déplacés à l'identique de l'ancien `parcours-scenario.mjs` (L0.5, annexe D du cahier des charges) :
 * mêmes contrôles, même ordre. L'ordre d'exécution et l'état partagé entre segments sont décrits dans `../run.mjs` ;
 * chaque segment reçoit le contexte commun (`sc` : page, navigateur, `check`…) et y dépose les valeurs que les
 * segments suivants relisent. Un fichier = un propriétaire (cahier des charges, §9).
 */

/** Accueil (maquette) sur le projet importé, nom du salut, en-tête du projet. */
export async function accueil(sc) {
  const { BASE, OUT, page, check } = sc;
  const { exampleUrl } = sc;
  // Accueil (maquette) : enveloppe à icônes, « Espace de travail », « Importer » / « + Nouveau projet », carte « Reprendre mon projet » avec
  // l'aperçu conceptuel dessiné depuis le modèle réel, Mon parcours (6 phases, état réel), À poursuivre, « Voir les étapes », accès rapides
  // illustrés par les données du projet (parcelle transmise, répartition du programme, plan du RDC).
  await page.goto(`${BASE}/accueil`);
  await page.waitForSelector(".resume-preview-svg svg", { timeout: 30000 });
  check("accueil : barre latérale à icônes (Accueil, Mes projets, Parcours, Atelier, Documents, Bibliothèque ; Harmonie « Votre assistant de projet », Paramètres), « Espace de travail », recherche « un projet, un document », cloche et avatar", (await page.locator(".app-nav a").allTextContents()).map((t) => t.trim()).join("|") === "Accueil|Mes projets|Parcours|Atelier|Documents|Bibliothèque" && (await page.locator(".app-nav a svg").count()) === 6 && (await page.locator(".app-nav-secondary").textContent()).includes("Votre assistant de projet") && (await page.locator(".app-topbar-title").textContent()) === "Espace de travail" && (await page.locator("#global-search").getAttribute("placeholder")) === "Rechercher un projet, un document…" && (await page.locator(".app-topbar-avatar").count()) === 1);
  check("accueil : « Bonjour … », « Importer » et « + Nouveau projet » en tête", /^Bonjour .+,$/.test((await page.locator(".home-greeting h1").textContent()).trim()) && (await page.locator('.home-greeting-actions button:has-text("Importer")').count()) === 1 && (await page.locator('.home-greeting-actions a:has-text("Nouveau projet")').count()) === 1);
  const homePreviewCaption = await page.locator(".resume-preview figcaption").textContent();
  check("accueil · reprendre mon projet : « P.118 — Escalier B et mezzanine », badge « Parcours terminé », aperçu conceptuel = axonométrie éclatée du modèle réel (6 niveaux, 74 zones), « Reprendre le projet », « Ouvrir l’Atelier »", (await page.locator(".resume-card h2").textContent()) === "P.118 — Escalier B et mezzanine" && (await page.locator(".resume-card .badge").first().textContent()).includes("Parcours terminé") && /Aperçu conceptuel · 6 niveaux · 74 zones/.test(homePreviewCaption) && (await page.locator('.resume-preview-svg svg g[data-level]').count()) === 6 && (await page.locator('.resume-card-actions a:has-text("Reprendre le projet")').count()) === 1 && (await page.locator('.resume-card-actions a:has-text("Ouvrir l’Atelier")').count()) === 1, homePreviewCaption);
  // Validation technique à part de l'avancement : « Parcours terminé » ET les réserves calculées du bilan (7 pour l'exemple), lien vers l'étape 18 ; état d'enregistrement près de la carte.
  const validationBadge = await page.locator(".resume-card .badge-validation").textContent();
  check("accueil · validation technique distincte : badge « N réserves techniques ouvertes » (bilan du bâtiment conçu) à côté de « Parcours terminé », lien vers l'étape 18 ; « Synchronisé avec le serveur » sous la carte", /^\d+ réserves? techniques? ouvertes?$/.test(validationBadge.trim()) && Number(validationBadge.trim().split(" ")[0]) >= 7 && /etape=18$/.test(await page.locator(".resume-card .badge-validation").getAttribute("href")) && /Synchronisé avec le serveur/.test(await page.locator(".resume-card .sync-indicator").textContent()), validationBadge);
  check("accueil · Mon parcours : les 6 phases du prototype, toutes terminées pour l'exemple (3/3, 5/5, 4/4, 4/4, 3/3, 2/2), « À poursuivre » et « Voir les étapes »", (await page.locator(".parcours-phase").count()) === 6 && (await page.locator(".parcours-phase-termine").count()) === 6 && (await page.locator(".parcours-phase-link small").allTextContents()).join(" ") === "3/3 5/5 4/4 4/4 3/3 2/2" && (await page.locator(".home-pursue a").count()) >= 1 && (await page.locator('.home-see-steps').count()) === 1);
  await page.locator('.parcours-phase-toggle').nth(1).click();
  check("accueil · Mon parcours : déplier « Programmer » → ses 5 étapes (04 à 08) avec leur état", (await page.locator(".parcours-phase-steps li").count()) === 5 && (await page.locator(".parcours-phase-steps .parcours-step-number").allTextContents()).join(" ") === "04 05 06 07 08");
  check("accueil · accès rapides illustrés par les données : parcelle 118 transmise (4 sommets), 4 familles de surfaces du programme, plan du RDC du modèle", (await page.locator(".quick-link-card").count()) === 3 && /Parcelle 118 : contour transmis, 4 sommets/.test(await page.locator(".quick-link-card").nth(0).locator(".quick-thumb").getAttribute("aria-label")) && /Programme : 4 familles de surfaces/.test(await page.locator(".quick-link-card").nth(1).locator(".quick-thumb").getAttribute("aria-label")) && (await page.locator(".quick-link-card").nth(2).locator(".quick-thumb svg").count()) === 1);
  // Disposition de la maquette : carte et « Mon parcours » côte à côte, « Accès rapides » sur toute la largeur (3 cartes en ligne).
  await page.setViewportSize({ width: 1536, height: 960 });
  await page.waitForTimeout(300);
  check("accueil (1536 px) : « Accès rapides » sous les deux colonnes, sur toute la largeur, 3 cartes en ligne ; rien ne centre la page verticalement", await page.evaluate(() => { const grid = document.querySelector(".home-grid").getBoundingClientRect(); const quick = document.querySelector(".quick-access").getBoundingClientRect(); const side = document.querySelector(".home-side-column").getBoundingClientRect(); const cols = getComputedStyle(document.querySelector(".quick-links")).gridTemplateColumns.split(" ").length; return Math.abs(quick.width - grid.width) < 2 && quick.top >= side.top && cols === 3 && document.querySelector(".home-greeting").getBoundingClientRect().top < 140; }));
  await page.screenshot({ path: `${OUT}/00-accueil-desktop.png`, fullPage: true });
  // « Site ordinateur » de Chrome sur téléphone (980 px, fenêtre très haute) : une colonne, salut en haut (pas de centrage vertical), 3 accès rapides en ligne.
  await page.setViewportSize({ width: 980, height: 2000 });
  await page.waitForTimeout(300);
  check("accueil (980 px, site ordinateur sur téléphone) : salut en haut de page, une colonne (carte, Mon parcours, accès rapides en 3 colonnes)", await page.evaluate(() => { const g = document.querySelector(".home-greeting").getBoundingClientRect(); const hero = document.querySelector(".resume-card").getBoundingClientRect(); const side = document.querySelector(".home-side-column").getBoundingClientRect(); const cols = getComputedStyle(document.querySelector(".quick-links")).gridTemplateColumns.split(" ").length; return g.top < 140 && side.top >= hero.bottom && cols === 3 && document.documentElement.scrollWidth <= window.innerWidth + 1; }));
  // Nom du salut modifiable sur place (même réglage que Paramètres → Compte).
  await page.locator(".home-name-edit").click();
  await page.fill("#home-display-name", "Roch");
  await page.locator('.home-name-form button[type="submit"]').click();
  await page.waitForFunction(() => document.querySelector(".home-greeting h1")?.textContent?.includes("Bonjour Roch,"), null, { timeout: 10000 });
  check("accueil : crayon à côté du salut → « Comment vous appeler ? » → « Bonjour Roch, », avatar « RO », barre latérale au nom", (await page.locator(".home-greeting h1").textContent()).trim() === "Bonjour Roch," && (await page.locator(".app-topbar-avatar").textContent()) === "RO" && (await page.locator(".app-user-name").textContent()).startsWith("Roch"));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/00-accueil-mobile.png`, fullPage: true });
  check("accueil (téléphone) : une colonne, sans défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator(".home-see-steps").click();
  await page.waitForSelector(".overview-step");
  check("accueil : « Voir les étapes » → vue d'ensemble du projet", page.url().startsWith(exampleUrl) && (await page.locator(".overview-step").count()) === 21);
  await page.waitForFunction(() => /empreinte [0-9a-f]{8}/.test(document.querySelector(".project-header-meta")?.textContent || ""), null, { timeout: 15000 }).catch(() => {});
  check("en-tête du projet : « Révision du modèle : 1 · empreinte <hash> » (détail technique déplacé hors de l'accueil)", /Révision du modèle : 1 · empreinte [0-9a-f]{8}/.test((await page.locator(".project-header-meta").textContent()).replace(/\s+/g, " ")));
}

/** 6p. Paramètres (nom, clé MapTiler, données locales, version). */
export async function parametres(sc) {
  const { BASE, OUT, page, check } = sc;
  const { email } = sc;
  // 6p. Paramètres : compte, clé MapTiler (de session depuis 6c), données locales, version.
  await page.goto(`${BASE}/parametres`);
  await page.waitForSelector(".settings-page", { timeout: 30000 });
  // Nom affiché : saisi ici seulement (jamais déduit) ; l'accueil et la barre latérale le reprennent, initiales de l'avatar comprises.
  await page.fill("#display-name", "Roch Démo");
  await page.locator('.settings-name-form button[type="submit"]').click();
  await page.waitForFunction(() => /Nom enregistré/.test(document.querySelector(".settings-name-form small")?.textContent || ""), null, { timeout: 10000 });
  await page.goto(`${BASE}/accueil`);
  await page.waitForSelector(".home-greeting h1");
  check("Paramètres · nom affiché « Roch Démo » → accueil « Bonjour Roch Démo, », avatar « RD », barre latérale au nom", (await page.locator(".home-greeting h1").textContent()).trim() === "Bonjour Roch Démo," && (await page.locator(".app-topbar-avatar").textContent()) === "RD" && (await page.locator(".app-user-name").textContent()).startsWith("Roch Démo"));
  await page.goto(`${BASE}/parametres`);
  await page.waitForSelector(".settings-page", { timeout: 30000 });
  check("Paramètres : adresse du compte, clé MapTiler de session (6c) reconnue", (await page.locator(".settings-page").textContent()).includes(email) && (await page.locator(".settings-state").getAttribute("data-key-state")) === "session");
  await page.locator('button:has-text("Oublier la clé")').click();
  check("Paramètres : « Oublier la clé » → aucune clé", (await page.locator(".settings-state").getAttribute("data-key-state")) === "absente" && (await page.evaluate(() => sessionStorage.getItem("fadi.maptiler.session-key"))) === null);
  await page.fill("#settings-maptiler-key", "cle-parametres-test");
  await page.locator('.settings-form button:has-text("Utiliser cette clé")').click();
  check("Paramètres : clé saisie sans conservation → session (jamais dans le stockage local)", (await page.locator(".settings-state").getAttribute("data-key-state")) === "session" && (await page.evaluate(() => localStorage.getItem("parcelle-maptiler-key-v1"))) === null);
  await page.waitForFunction(() => /Version/.test(document.querySelector(".settings-page")?.textContent || "") && !/Écritures de l’Atelier en attente\s*…/.test(document.querySelector(".settings-page")?.textContent || ""), null, { timeout: 10000 });
  // Les compteurs affichés sont ceux d'IndexedDB : file des écritures de l'Atelier, modèles mis en cache, lectures déshydratées et saisies en pause du cache persistant.
  const localCounts = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("fadi-local");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction(["outbox", "modelCache", "keyValue"], "readonly");
            const out = { outbox: 0, modelCache: 0, queries: 0, paused: 0, outboxKeys: [], outboxProjects: 0 };
            const o = tx.objectStore("outbox").getAll();
            o.onsuccess = () => {
              out.outbox = o.result.length;
              out.outboxKeys = o.result.map((e) => `${e.key} (${e.attempts} essai(s)${e.lastError ? ` · ${e.lastError}` : ""})`);
              out.outboxProjects = new Set(o.result.map((e) => e.projectId)).size;
            };
            const m = tx.objectStore("modelCache").count();
            m.onsuccess = () => (out.modelCache = m.result);
            const k = tx.objectStore("keyValue").get("fadi-queries-1");
            k.onsuccess = () => {
              try {
                const state = JSON.parse(k.result?.value ?? "null")?.clientState;
                out.queries = state?.queries?.length ?? 0;
                out.paused = (state?.mutations ?? []).filter((x) => x.state?.isPaused).length;
              } catch {
                /* vide */
              }
            };
            tx.oncomplete = () => {
              db.close();
              resolve(out);
            };
          };
          req.onerror = () => resolve(null);
        }),
    );
  const countsBefore = await localCounts();
  const settingsText = (await page.locator(".settings-facts-local").textContent()).replace(/\s+/g, " ");
  check(
    "Paramètres : compteurs des données locales conformes à IndexedDB (écritures de l'Atelier en attente, saisies en pause, modèles, lectures), version du build affichée",
    countsBefore !== null &&
      new RegExp(`Écritures de l’Atelier en attente\\s*${countsBefore.outbox}(?!\\d)`).test(settingsText) &&
      new RegExp(`Saisies en attente de réseau\\s*${countsBefore.paused}(?!\\d)`).test(settingsText) &&
      new RegExp(`Modèles mis en cache\\s*${countsBefore.modelCache}(?!\\d)`).test(settingsText) &&
      new RegExp(`Écrans mis en cache\\s*${countsBefore.queries} lecture`).test(settingsText) &&
      countsBefore.modelCache > 0 &&
      countsBefore.queries > 0 &&
      (countsBefore.outbox === 0 || (await page.locator(".settings-pending a").count()) === countsBefore.outboxProjects) &&
      (await page.locator(".settings-facts code").textContent()).trim().length >= 6,
    `${settingsText} // ${JSON.stringify(countsBefore)}`,
  );
  await page.locator('button:has-text("Vider les caches locaux")').click();
  await page.waitForFunction(() => /Caches vidés/.test(document.querySelector(".settings-page")?.textContent || ""), null, { timeout: 10000 });
  await page.waitForFunction(() => /Modèles mis en cache\s*0(?!\d)/.test(document.querySelector(".settings-facts-local")?.textContent || ""), null, { timeout: 10000 }).catch(() => {});
  const countsAfter = await localCounts();
  check("Paramètres : « Vider les caches locaux » → modèles retirés, lectures réduites à celles de l'écran courant, file des écritures et saisies en pause intactes", countsAfter.modelCache === 0 && countsAfter.queries <= 2 && countsAfter.queries < countsBefore.queries && countsAfter.outbox === countsBefore.outbox && countsAfter.paused === countsBefore.paused && /Modèles mis en cache\s*0(?!\d)/.test(await page.locator(".settings-facts-local").textContent()), JSON.stringify(countsAfter));
  await page.screenshot({ path: `${OUT}/parametres-desktop.png`, fullPage: true });
}
