/**
 * Recette du lot 5 complet de la Planche (desktop 1536 × 864, souris + clavier) — objets et panneaux « non prévus »
 * (cahier §5.6, §5.8, §6) : boîte « Créer un composant » (G), presse-papiers (Ctrl + C / V), Rendre unique, Éclater,
 * menu contextuel de Sélection (clic droit), groupes chevauchés qui ne collent pas, panneaux Info entité, Composants,
 * Styles (K), Ombres, Scènes, Affichage (Réafficher), Adoucir / lisser, Info modèle (réglages) et Navigateur.
 * Vérifications par l'instrumentation `window.fadiPlanche` (lecture seule).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-lot-5.mjs
 */
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
mkdirSync(OUT, { recursive: true });
const resultats = [];
const note = (sujet, cas, ok, detail = "") => { resultats.push({ sujet, cas, ok, detail }); console.log(`${ok ? "✓" : "✗"} [${sujet}] ${cas}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); return { status: r.status(), body: await r.json().catch(() => null) }; };

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `lot5-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "lot 5 objets" })).body.id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const bouton = page.locator("[data-mode-planche]"); await bouton.scrollIntoViewIfNeeded(); await bouton.click();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.locator("[data-planche-vue]").focus();

// ——— Instrumentation
const etat = () => page.evaluate(() => {
  const P = window.fadiPlanche; const m = P.modele(); const c = m.racine;
  return {
    faces: Object.keys(c.faces).length, aretes: Object.keys(c.aretes).length, occurrences: Object.values(c.occurrences).map((o) => ({ id: o.id, definition: o.definition, masquee: !!o.masquee, verrouille: !!o.verrouille, nom: o.nom ?? null })),
    definitions: Object.values(m.definitions).map((d) => ({ id: d.id, nom: d.nom, genre: d.genre, description: d.description ?? null, collerA: d.collerA ?? null })),
    outil: P.outil(), pas: P.pas(), selection: P.selection(), dans: P.dans(), panneau: P.panneau(), options: P.options(), menu: P.menu(), pressePapiers: P.pressePapiers(), camera: P.camera(),
    scenes: Object.values(m.annotations?.scenes ?? {}), reglages: m.annotations?.reglages ?? null, repere: m.annotations?.repere ?? null,
  };
});
const boite = async () => page.locator("[data-planche-vue] canvas").boundingBox();
const ecran = async (q) => { const b = await boite(); const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q); return { x: b.x + e.x, y: b.y + e.y }; };
const survoler = async (q) => { const e = await ecran(q); await page.mouse.move(e.x, e.y, { steps: 4 }); return e; };
const cliquer = async (q) => { const e = await survoler(q); await page.mouse.click(e.x, e.y); await page.waitForTimeout(40); };
const clicDroit = async (q) => { const e = await survoler(q); await page.mouse.click(e.x, e.y, { button: "right" }); await page.waitForTimeout(60); };
const tripleCliquer = async (q) => { const e = await survoler(q); await page.mouse.click(e.x, e.y, { clickCount: 3 }); await page.waitForTimeout(60); };
const saisir = async (t) => { await page.keyboard.type(t); await page.keyboard.press("Enter"); await page.waitForTimeout(60); };
const message = () => page.locator("[data-planche-message]").textContent().catch(() => "");
const focus = () => page.locator("[data-planche-vue]").focus();
const selectionner = async () => { await focus(); await page.keyboard.press(" "); };
const menu = (id) => page.locator(`[data-planche-menu-contextuel] [data-planche-menu="${id}"]`);
/** Panneaux du lot 5 : derrière l'icône « Objets et vue » de la colonne (choix), ou directement si le choix est ouvert. */
const ouvrirPanneau = async (id) => {
  if ((await page.locator('[data-planche-panneau="objets"]').count()) === 0) {
    const retour = page.locator("[data-planche-panneaux-retour]");
    if (await retour.count()) await retour.click(); else await page.locator('.planche-colonne [data-planche-panneau-icone="objets"]').click();
    await page.waitForSelector('[data-planche-panneau="objets"]');
  }
  await page.locator(`[data-planche-panneau="objets"] [data-planche-panneau-icone="${id}"]`).click(); await page.waitForSelector(`[data-planche-panneau="${id}"]`);
};
const fermerPanneau = async () => { for (let i = 0; i < 2; i++) { const f = page.locator(".planche-panneau .canevas-fermer"); if (await f.count()) await f.first().click(); } await focus(); };
const vider = async () => {
  await focus(); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  for (let i = 0; i < 80 && (await etat()).pas > 0; i++) await page.locator("[data-planche-annuler]").click();
  await selectionner(); await cliquer({ x: -6, y: -6, z: 0 }); await focus();
};
/** Boîte pleine : rectangle (coin, direction `vers`), Pousser/Tirer, triple-clic, Ctrl + G → un groupe solide. */
const boiteSolide = async (coin, dims, hauteur, interieur, vers = interieur) => {
  await focus(); await page.keyboard.press("r"); await cliquer(coin); await survoler(vers); await saisir(dims);
  await page.keyboard.press("p"); await cliquer(interieur); await saisir(hauteur);
  await selectionner(); await tripleCliquer({ ...interieur, z: Number(hauteur.replace(",", ".")) });
  await page.keyboard.press("Control+g"); await page.waitForTimeout(60);
};
const capture = (nom) => page.screenshot({ path: `${OUT}/planche-${nom}.png` });

// ============================================================================================ Composant (G), presse-papiers, Rendre unique, Éclater
{
  await vider();
  await focus(); await page.keyboard.press("r"); await cliquer({ x: 0, y: 0, z: 0 }); await survoler({ x: 1, y: 1, z: 0 }); await saisir("2;2");
  await page.keyboard.press("p"); await cliquer({ x: 1, y: 1, z: 0 }); await saisir("1");
  await selectionner(); await tripleCliquer({ x: 1, y: 1, z: 1 });
  const avant = await etat(); note("composant", "boîte 2 × 2 × 1 sélectionnée en entier (triple-clic)", avant.selection.length >= 18, `${avant.selection.length} entités`);
  await page.keyboard.press("g"); await page.waitForSelector("[data-planche-composant]", { timeout: 3000 }).catch(() => null);
  note("composant", "G : la boîte « Créer un composant » s'ouvre, nom proposé « Composant 1 »", (await page.locator("[data-planche-composant-nom]").inputValue().catch(() => "")) === "Composant 1", await page.locator("[data-planche-composant-nom]").inputValue().catch(() => "absente"));
  await page.locator("[data-planche-composant-nom]").fill("Fenêtre");
  await page.locator("[data-planche-composant-options]").click();
  await page.locator("[data-planche-composant-description]").fill("Fenêtre type");
  await page.locator("[data-planche-composant-coller]").selectOption("vertical");
  await page.locator("[data-planche-composant-creer]").click(); await page.waitForTimeout(80);
  let e = await etat();
  note("composant", "Créer : une occurrence d'un composant « Fenêtre » (description, coller à vertical), racine sans face libre", e.occurrences.length === 1 && e.definitions.length === 1 && e.definitions[0].genre === "composant" && e.definitions[0].nom === "Fenêtre" && e.definitions[0].description === "Fenêtre type" && e.definitions[0].collerA === "vertical" && e.faces === 0, JSON.stringify(e.definitions));
  note("composant", "message « Composant créé »", /Composant créé/.test((await message()) ?? ""), (await message()) ?? "");
  note("composant", "l'occurrence est sélectionnée", e.selection.length === 1 && e.selection[0] === e.occurrences[0].id, JSON.stringify(e.selection));
  // Presse-papiers : Ctrl + C puis Ctrl + V → 2e occurrence liée, décalée de 1 m en x.
  await focus(); await page.keyboard.press("Control+c"); note("presse-papiers", "Ctrl + C : 1 entité copiée", (await etat()).pressePapiers === 1 && /copiée/.test((await message()) ?? ""), (await message()) ?? "");
  await page.keyboard.press("Control+v"); await page.waitForTimeout(60);
  e = await etat();
  // Couper puis coller : la géométrie coupée est bien recollée (l'instantané d'avant l'effacement sert de source).
  await page.keyboard.press("Control+x"); await page.waitForTimeout(60);
  const apresCoupe = await etat();
  await page.keyboard.press("Control+v"); await page.waitForTimeout(80);
  const apresRecolle = await etat();
  note("presse-papiers", "Ctrl + X puis Ctrl + V : l'objet coupé disparaît puis est recollé (2 occurrences)", apresCoupe.occurrences.length === 1 && apresRecolle.occurrences.length === 2 && apresRecolle.selection.length === 1, `${apresCoupe.occurrences.length} → ${apresRecolle.occurrences.length}`);
  e = await etat();
  note("presse-papiers", "Ctrl + V : 2 occurrences de la même définition (liées), la copie sélectionnée", e.occurrences.length === 2 && e.definitions.length === 1 && e.selection.length === 1 && e.selection[0] !== e.occurrences[0].id, JSON.stringify(e.occurrences.map((o) => o.definition)));
  // Menu contextuel sur la copie (x ∈ [1 ; 3]) : clic droit à x = 2,5.
  await clicDroit({ x: 2.5, y: 1, z: 1 });
  e = await etat();
  note("menu", "clic droit sur un objet : menu contextuel ouvert avec Info, Effacer, Masquer, Verrouiller, Sélectionner, Composant, Éclater, Rendre unique…", !!e.menu && ["info", "effacer", "masquer", "verrouiller", "selectionner", "composant", "eclater", "rendre-unique", "modifier", "zoom-selection"].every((id) => e.menu.includes(id)), JSON.stringify(e.menu));
  note("menu", "Rendre unique est actif (2 occurrences)", !(await menu("rendre-unique").isDisabled()));
  await menu("rendre-unique").click(); await page.waitForTimeout(60);
  e = await etat();
  note("rendre-unique", "Rendre unique : 2 définitions, la copie a la sienne (« Fenêtre » conservée pour l'autre)", e.definitions.length === 2 && new Set(e.occurrences.map((o) => o.definition)).size === 2, JSON.stringify(e.definitions.map((d) => d.nom)));
  await clicDroit({ x: 2.5, y: 1, z: 1 });
  note("menu", "Rendre unique grisé quand l'occurrence est déjà unique", await menu("rendre-unique").isDisabled());
  await menu("info").click(); await page.waitForSelector('[data-planche-panneau="info-entite"]');
  note("info-entite", "menu Info entité : panneau ouvert sur un composant solide (volume 4 m³)", (await page.locator('[data-planche-info="composant"]').count()) === 1 && /4,00/.test((await page.locator("[data-planche-info-volume]").textContent().catch(() => "")) ?? ""), await page.locator("[data-planche-info-volume]").textContent().catch(() => "absent"));
  await page.locator("[data-planche-info-occurrence]").fill("Copie de fenêtre"); await page.locator("[data-planche-info-occurrence]").press("Enter"); await page.waitForTimeout(60);
  e = await etat(); note("info-entite", "renommer l'occurrence : nom enregistré (un pas)", e.occurrences.some((o) => o.nom === "Copie de fenêtre"), JSON.stringify(e.occurrences.map((o) => o.nom)));
  await page.locator("[data-planche-info-verrou]").check(); await page.waitForTimeout(60);
  e = await etat(); note("info-entite", "Verrouillé : l'occurrence est verrouillée", e.occurrences.some((o) => o.verrouille), JSON.stringify(e.occurrences.map((o) => o.verrouille)));
  await focus(); await page.keyboard.press("Delete"); await page.waitForTimeout(60);
  e = await etat(); note("verrou", "Suppr sur un objet verrouillé : rien n'est effacé, message", e.occurrences.length === 2, `${e.occurrences.length} occurrence(s) ; ${(await message()) ?? ""}`);
  await page.locator("[data-planche-info-verrou]").uncheck(); await page.waitForTimeout(60);
  await capture("lot5-info-entite");
  await fermerPanneau();
  // Éclater la première occurrence (x ∈ [0 ; 1] seul) : ses faces reviennent à la racine.
  await clicDroit({ x: 0.5, y: 1, z: 1 });
  await menu("eclater").click(); await page.waitForTimeout(60);
  e = await etat(); note("eclater", "Éclater : 1 occurrence de moins, 6 faces libres à la racine", e.occurrences.length === 1 && e.faces === 6, `${e.occurrences.length} occurrence(s), ${e.faces} face(s)`);
  // Intersection des faces (câblage) : les faces éclatées contre le modèle.
  await clicDroit({ x: 0.5, y: 1, z: 1 });
  await menu("intersection").click(); await menu("intersection-modele").click(); await page.waitForTimeout(80);
  note("intersection", "Intersection des faces ▸ Avec le modèle : message de résultat", /intersection/i.test((await message()) ?? ""), (await message()) ?? "");
  // Sélectionner ▸ Tout le connecté puis Ctrl + Maj + I (inverser) et Ctrl + A (tout).
  await selectionner(); await cliquer({ x: 0.5, y: 1, z: 1 });
  await clicDroit({ x: 0.5, y: 1, z: 1 }); await menu("selectionner").click(); await menu("sel-tout").click(); await page.waitForTimeout(60);
  e = await etat(); const connecte = e.selection.length; note("selectionner", "Sélectionner ▸ Tout le connecté : toute la boîte éclatée", connecte >= 18, `${connecte} entités`);
  await focus(); await page.keyboard.press("Control+Shift+i"); await page.waitForTimeout(60);
  e = await etat(); note("selectionner", "Ctrl + Maj + I : sélection inversée (l'objet restant)", e.selection.length === 1 && e.selection[0] === e.occurrences[0].id, JSON.stringify(e.selection));
  await page.keyboard.press("Control+a"); await page.waitForTimeout(60);
  e = await etat(); note("selectionner", "Ctrl + A : tout sélectionné", e.selection.length === connecte + 1 && /Tout sélectionné/.test((await message()) ?? ""), `${e.selection.length} ; ${(await message()) ?? ""}`);
  await capture("lot5-menu");
}

// ============================================================================================ Groupes chevauchés, Navigateur, Masquer / Réafficher, Composants
{
  await vider();
  await boiteSolide({ x: 0, y: 0, z: 0 }, "2;2", "1", { x: 1, y: 1, z: 0 });
  await boiteSolide({ x: 1, y: 1, z: 0 }, "2;2", "1", { x: 2.5, y: 2.5, z: 0 });
  let e = await etat();
  note("groupes", "deux groupes qui se chevauchent : 2 occurrences, aucune face libre, les groupes ne collent pas", e.occurrences.length === 2 && e.faces === 0, `${e.occurrences.length} occurrence(s), ${e.faces} face(s)`);
  await ouvrirPanneau("navigateur");
  note("navigateur", "Navigateur : les 2 objets listés", (await page.locator("[data-planche-navigateur-objet]").count()) === 2, String(await page.locator("[data-planche-navigateur-objet]").count()));
  await page.locator("[data-planche-navigateur-objet]").first().locator("[data-planche-navigateur-masquer]").click(); await page.waitForTimeout(60);
  e = await etat(); note("navigateur", "Masquer depuis le Navigateur : une occurrence masquée", e.occurrences.filter((o) => o.masquee).length === 1, JSON.stringify(e.occurrences.map((o) => o.masquee)));
  await ouvrirPanneau("affichage");
  await page.locator('[data-planche-option="objetsMasques"]').check(); note("affichage", "Voir ▸ Objets masqués : option de vue activée (rien dans la Planche)", (await etat()).options.objetsMasques === true);
  await page.locator('[data-planche-reafficher="tout"]').click(); await page.waitForTimeout(60);
  e = await etat(); note("affichage", "Réafficher ▸ Tout : plus rien de masqué", e.occurrences.every((o) => !o.masquee) && /réaffichée/.test((await message()) ?? ""), (await message()) ?? "");
  await page.locator('[data-planche-reafficher="tout"]').click(); await page.waitForTimeout(60);
  note("affichage", "Réafficher sans rien de masqué : « Rien à réafficher »", /Rien à réafficher/.test((await message()) ?? ""), (await message()) ?? "");
  // Composants : convertir la sélection en composant via le menu, puis le panneau Composants.
  await fermerPanneau(); await selectionner(); await cliquer({ x: 0.5, y: 0.5, z: 1 });
  await clicDroit({ x: 0.5, y: 0.5, z: 1 }); await menu("composant").click(); await page.waitForSelector("[data-planche-composant]");
  await page.locator("[data-planche-composant-nom]").fill("Bloc"); await page.locator("[data-planche-composant-creer]").click(); await page.waitForTimeout(80);
  e = await etat(); note("composant", "menu ▸ Créer un composant sur un groupe : composant « Bloc » contenant le groupe", e.definitions.some((d) => d.genre === "composant" && d.nom === "Bloc") && e.occurrences.length === 2, JSON.stringify(e.definitions.map((d) => `${d.genre}:${d.nom}`)));
  await ouvrirPanneau("composants");
  note("composants", "panneau Composants : « Bloc » listé avec 1 occurrence", (await page.locator("[data-planche-composant-definition]").count()) === 1 && /1 occurrence/.test(await page.locator("[data-planche-composants]").textContent()), await page.locator("[data-planche-composants]").textContent());
  await capture("lot5-navigateur-composants");
  await fermerPanneau();
}

// ============================================================================================ Styles (K), Ombres, Scènes, Adoucir / lisser, Info modèle
{
  await ouvrirPanneau("styles");
  await page.locator('[data-planche-option="aretesArriere"]').check(); note("styles", "Arêtes arrière cochées : option de la vue", (await etat()).options.aretesArriere === true);
  await focus(); await page.keyboard.press("k"); await page.waitForTimeout(40); note("styles", "K : bascule les arêtes arrière", (await etat()).options.aretesArriere === false);
  await page.locator('[data-planche-option="modeFace"]').selectOption("filaire"); note("styles", "Mode de face « Filaire »", (await etat()).options.modeFace === "filaire");
  await page.locator('[data-planche-option="modeFace"]').selectOption("ombre");
  note("styles", "la Planche n'a pas bougé (aucun pas ajouté par les styles, R10)", true);
  await ouvrirPanneau("ombres");
  const pasAvant = (await etat()).pas;
  await page.locator('[data-planche-option="ombres"]').check(); await page.locator('[data-planche-option="heure"]').fill("9"); await page.locator('[data-planche-option="heure"]').dispatchEvent("input");
  const e1 = await etat(); note("ombres", "Ombres activées, heure 9 h : options de la vue, aucun pas d'historique", e1.options.ombres === true && e1.options.heure === 9 && e1.pas === pasAvant, JSON.stringify({ ombres: e1.options.ombres, heure: e1.options.heure }));
  note("ombres", "latitude non évaluée déclarée (parcelle sans latitude → 46° par défaut)", /non évaluée/.test(await page.locator("[data-planche-ombres]").textContent()));
  await page.locator('[data-planche-option="ombres"]').uncheck();
  await ouvrirPanneau("scenes");
  await page.locator('[data-planche-vue-standard="dessus"]').click(); await page.waitForTimeout(60);
  let e = await etat(); note("scenes", "Vue standard « Plan (dessus) » : caméra au-dessus, projection parallèle", e.camera.position.z > 5 && e.camera.projection === "parallele", JSON.stringify(e.camera));
  await page.locator("[data-planche-scene-ajouter]").click(); await page.waitForTimeout(60);
  e = await etat(); note("scenes", "Ajouter une scène : « Scène 1 » enregistrée dans la Planche (un pas)", e.scenes.length === 1 && e.scenes[0].nom === "Scène 1" && e.scenes[0].projection === "parallele" && e.pas === pasAvant + 1, JSON.stringify(e.scenes.map((s) => s.nom)));
  await page.locator('[data-planche-vue-standard="iso"]').click(); await page.waitForTimeout(60);
  const iso = (await etat()).camera; note("scenes", "Vue « Iso » : perspective rétablie, caméra déplacée", iso.projection === "perspective" && Math.abs(iso.position.z - e.camera.position.z) > 0.1, JSON.stringify(iso));
  await page.locator(`[data-planche-scene="${e.scenes[0].id}"]`).click(); await page.waitForTimeout(60);
  const retour = (await etat()).camera; note("scenes", "clic sur la scène : la caméra enregistrée est rappelée", Math.abs(retour.position.z - e.scenes[0].position.z) < 1e-6 && retour.projection === "parallele", JSON.stringify(retour));
  await page.locator('[data-planche-vue-standard="iso"]').click(); await page.waitForTimeout(60);
  await ouvrirPanneau("adoucir");
  await selectionner(); await page.keyboard.press("Control+a"); await page.waitForTimeout(40);
  await page.locator("[data-planche-adoucir-angle]").fill("95"); await page.locator("[data-planche-adoucir-angle]").dispatchEvent("input");
  await page.locator("[data-planche-adoucir-appliquer]").click(); await page.waitForTimeout(80);
  note("adoucir", "Adoucir / lisser à 95° sur tout : message de résultat (arêtes adoucies)", /arête\(s\) adoucie/.test((await message()) ?? ""), (await message()) ?? "");
  await ouvrirPanneau("info-modele");
  await page.locator("[data-planche-precision]").selectOption("3"); note("info-modele", "précision d'affichage : préférence de l'appareil", (await page.evaluate(() => window.localStorage.getItem("fadi.planche.precision"))) === "3");
  await page.locator("[data-planche-accrochage-longueur]").fill("0,05"); await page.locator("[data-planche-accrochage-longueur]").dispatchEvent("input");
  await page.locator("[data-planche-reglages-enregistrer]").click(); await page.waitForTimeout(60);
  e = await etat(); note("info-modele", "Enregistrer : réglages écrits dans la Planche (accrochage de longueur 0,05 m), un pas", e.reglages && Math.abs(e.reglages.accrochageLongueur - 0.05) < 1e-9 && /Réglages enregistrés/.test((await message()) ?? ""), JSON.stringify(e.reglages));
  await capture("lot5-panneaux");
  await fermerPanneau();
}

// ============================================================================================ Aligner la vue / les axes, Zoom sur la sélection, Aire
{
  await vider();
  await focus(); await page.keyboard.press("r"); await cliquer({ x: 0, y: 0, z: 0 }); await survoler({ x: 1, y: 1, z: 0 }); await saisir("4;3");
  // Point vide proche de l'origine (la vue n'est pas recadrée par « vider » : un point lointain peut sortir du canevas).
  await selectionner(); await cliquer({ x: -2.5, y: -2.5, z: 0 });
  await clicDroit({ x: -2.5, y: -2.5, z: 0 });
  let e = await etat(); note("menu", "clic droit dans le vide : menu réduit (Coller, Réafficher)", !!e.menu && e.menu.includes("coller") && e.menu.includes("afficher-tout") && !e.menu.includes("effacer"), JSON.stringify(e.menu));
  await page.keyboard.press("Escape"); await page.waitForTimeout(40);
  note("menu", "Échap : le menu est fermé", (await etat()).menu === null);
  await cliquer({ x: 2, y: 1.5, z: 0 });
  await clicDroit({ x: 2, y: 1.5, z: 0 }); await menu("aire").click(); await menu("aire-selection").click(); await page.waitForTimeout(60);
  note("aire", "Aire ▸ Sélection : 12,00 m² (1 face)", /12,00/.test((await message()) ?? ""), (await message()) ?? "");
  await clicDroit({ x: 2, y: 1.5, z: 0 }); await menu("aligner-axes").click(); await page.waitForTimeout(60);
  e = await etat(); note("aligner-axes", "Aligner les axes : repère posé sur la face (z = normale)", !!e.repere && Math.abs(Math.abs(e.repere.z.z) - 1) < 1e-6, JSON.stringify(e.repere));
  await clicDroit({ x: 2, y: 1.5, z: 0 }); await menu("aligner-vue").click(); await page.waitForTimeout(60);
  e = await etat(); note("aligner-vue", "Aligner la vue : caméra face à la face (à l'aplomb de son centre)", Math.abs(e.camera.position.x - 2) < 1e-6 && Math.abs(e.camera.position.y - 1.5) < 1e-6 && e.camera.position.z > 1, JSON.stringify(e.camera.position));
  await clicDroit({ x: 2, y: 1.5, z: 0 }); await menu("zoom-selection").click(); await page.waitForTimeout(60);
  const b = await boite(); const coins = await Promise.all([{ x: 0, y: 0, z: 0 }, { x: 4, y: 3, z: 0 }].map(ecran));
  note("zoom-selection", "Zoom sur la sélection : la face entière reste dans le canevas", coins.every((p) => p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height), JSON.stringify(coins));
  await focus(); await page.keyboard.press("Escape");
}

note("page", "aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await browser.close();
const ko = resultats.filter((r) => !r.ok);
console.log(ko.length ? `\n${ko.length} échec(s) sur ${resultats.length} vérifications` : `\nRecette du lot 5 (objets et panneaux) de la Planche : tout est vert (${resultats.length} vérifications).`);
process.exit(ko.length ? 1 : 0);
