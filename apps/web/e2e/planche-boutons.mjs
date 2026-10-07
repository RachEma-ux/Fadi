/**
 * Recette des BOUTONS de la Planche (contrôle exhaustif), sur ordinateur (1536 × 864) puis en émulation téléphone
 * (390 × 844, tactile) : disposition (aucun bouton recouvert par un autre élément, aucune superposition des barres,
 * cibles ≥ 44 px au toucher, barre d'outils défilante avec « Rechercher » et « Plus d'outils » toujours visibles) ;
 * chaque bouton de la barre d'outils, de la grille « … », de la recherche, annuler / rétablir, OK du champ Mesures,
 * touches modificatrices (téléphone), Instructeur et « ? », sélecteurs, modes Plan / 3D / Documents / Planche, Fichier,
 * Canevas, Harmonie. Aucune commande émise, aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-boutons.mjs
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const mesurer = async (nom, fn) => {
  const t = performance.now();
  const r = await fn();
  console.log(`⏱ ${nom} : ${Math.round(performance.now() - t)} ms`);
  return r;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreursPage = [];
// Brouillon local (C6) : aucune commande ne doit partir pendant que la Planche est ouverte.
let enPlanche = false;
const commandesEmises = [];
const ecouter = (p) => {
  p.on("pageerror", (e) => erreursPage.push(e.message));
  p.on("request", (r) => {
    if (enPlanche && r.method() === "POST" && /\/commands\b/.test(r.url())) commandesEmises.push(r.url());
  });
};
ecouter(page);
page.on("dialog", (d) => void d.accept());

const api = async (methode, chemin, data, p = page) => {
  const r = await p.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const ouvrir = async (pid, p = page) => {
  await p.goto(`${BASE}/projets/${pid}?module=atelier`);
  await p.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await p.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
};
async function axe(nom, p = page) {
  await p.addScriptTag({ path: AXE_SCRIPT });
  const r = await p.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(".atelier-n") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
const boite = async (sel, p = page) => p.locator(sel).first().boundingBox();

/** Ouvre le mode Planche et attend la vue three.js et l'instrumentation. */
async function ouvrirPlanche(p = page, toucher = false) {
  const bouton = p.locator("[data-mode-planche]");
  await bouton.scrollIntoViewIfNeeded();
  if (toucher) await bouton.tap();
  else await bouton.click();
  await p.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
  await p.waitForFunction(() => !!window.fadiPlanche, null, { timeout: 30000 });
  enPlanche = true;
}
/** État lisible du brouillon : comptes, aires des faces (contour extérieur, plan horizontal), outil, étape. */
const etat = (p = page) =>
  p.evaluate(() => {
    const P = window.fadiPlanche;
    const c = P.modele().racine;
    const pos = (id) => c.sommets[id].position;
    const aires = Object.values(c.faces).map((f) => {
      const q = f.exterieur.map(pos);
      let a = 0;
      for (let i = 0; i < q.length; i++) {
        const u = q[i];
        const v = q[(i + 1) % q.length];
        a += u.x * v.y - v.x * u.y;
      }
      return Math.round((Math.abs(a) / 2) * 1e6) / 1e6;
    });
    const e = P.etatOutil();
    return { faces: aires.length, aretes: Object.keys(c.aretes).length, sommets: Object.keys(c.sommets).length, aires, outil: P.outil(), etape: e?.etape ?? null, depart: e?.depart ?? null, fleche: e?.fleche?.touche ?? null, pas: P.pas() };
  });
/** Position page (px) d'un point du repère local de la Planche. */
async function ecran(q, p = page) {
  const b = await boite("[data-planche-vue] canvas", p);
  const e = await p.evaluate((x) => window.fadiPlanche.versEcran(x), q);
  return e && { x: b.x + e.x, y: b.y + e.y };
}
const plus = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const consigne = (p = page) => p.locator("[data-planche-etat]").textContent().then((t) => t ?? "");

const email = `planche-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · planche" })).body.id;



const esc = (id) => `[data-planche-outil="${id}"]`;
const msg = (p) => p.locator("[data-planche-message]").textContent().catch(() => "").then((t) => t ?? "");
const outilActif = (p) => p.evaluate(() => window.fadiPlanche.outil());
const faces = (p) => p.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.faces).length);
const aretes = (p) => p.evaluate(() => Object.keys(window.fadiPlanche.modele().racine.aretes).length);

async function auditer(nom, vp, tactile) {
  console.log(`\n──── ${nom} (${vp.width} × ${vp.height}${tactile ? ", tactile" : ""}) ────`);
  const c = await browser.newContext({ viewport: vp, hasTouch: tactile, isMobile: tactile, storageState: await ctx.storageState() });
  const p = await c.newPage();
  ecouter(p);
  p.on("dialog", (d) => void d.accept());
  await ouvrir(pid, p);
  await ouvrirPlanche(p, tactile);
  const cliquer = async (loc, force = false) => {
    await loc.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
    if (tactile) await loc.tap({ force });
    else await loc.click({ force });
  };
  const T = (sel) => p.locator(sel).first();

  // 1. Disposition : aucun bouton recouvert (après défilement dans sa zone), cibles ≥ 44 px au toucher.
  if (tactile) { const e = await ecran({ x: -3, y: -3, z: 0 }, p); await p.touchscreen.tap(e.x, e.y); }
  const boutons = await p.locator("[data-planche] button:visible, [data-planche] input:visible, [data-planche] select:visible").count();
  const defauts = [];
  for (let i = 0; i < boutons; i++) {
    const b = p.locator("[data-planche] button:visible, [data-planche] input:visible, [data-planche] select:visible").nth(i);
    await b.evaluate((e) => e.scrollIntoView({ block: "center", inline: "center" }));
    const r = await b.evaluate((e, tact) => {
      const q = e.getBoundingClientRect();
      const x = Math.min(Math.max(q.x + q.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(q.y + q.height / 2, 0), innerHeight - 1);
      const top = document.elementFromPoint(x, y);
      const nom = (e.getAttribute("data-planche-outil") ?? e.getAttribute("data-planche-mod") ?? e.getAttribute("aria-label") ?? e.textContent ?? "").trim().slice(0, 30);
      return { nom, libre: top === e || e.contains(top) || !!(top && top.contains(e)), petit: tact && e.tagName === "BUTTON" && (q.width < 43.5 || q.height < 43.5), hors: q.right > innerWidth + 1 || q.left < -1 };
    }, tactile);
    if (!r.libre) defauts.push(`${r.nom} recouvert`);
    if (r.petit) defauts.push(`${r.nom} < 44 px`);
    if (r.hors) defauts.push(`${r.nom} hors de l'écran`);
  }
  check(`${nom} : ${boutons} boutons et champs de la Planche accessibles, non recouverts${tactile ? ", ≥ 44 px" : ""}`, defauts.length === 0, defauts.join(" ; "));
  const zones = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null; const q = e.getBoundingClientRect(); return q.width && q.height ? { s, x: q.x, y: q.y, r: q.right, b: q.bottom } : null; };
    return ["[data-planche] .planche-outils", "[data-planche-pied]", "[data-planche] .planche-haut", "[data-planche] .planche-colonne"].map(r).filter(Boolean);
  });
  const chev = [];
  for (let i = 0; i < zones.length; i++) for (let k = i + 1; k < zones.length; k++) { const a = zones[i], b = zones[k]; if (a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1) chev.push(`${a.s} × ${b.s}`); }
  check(`${nom} : barre d'outils, pied (touches + barre d'état), carte du haut et colonne ne se superposent pas`, chev.length === 0, chev.join(" ; "));
  const plus = await T("[data-planche-plus]").boundingBox();
  const recherche = await T("[data-planche-recherche]").boundingBox();
  check(`${nom} : « Rechercher » et « Plus d'outils » visibles sans défiler`, !!plus && !!recherche && plus.y + plus.height <= vp.height && recherche.y >= 0, JSON.stringify({ plus, recherche }));

  // 2. Barre d'outils : chaque outil, un clic.
  const ids = await p.locator(".planche-outils [data-planche-outil]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-planche-outil"), indispo: e.getAttribute("aria-disabled") === "true" })));
  const uniques = [...new Map(ids.map((x) => [x.id, x])).values()];
  const echecsOutils = [];
  for (const o of uniques) {
    const avant = await outilActif(p);
    await cliquer(p.locator(`.planche-outils ${esc(o.id)}`).first(), o.indispo);
    const apres = await outilActif(p);
    if (o.indispo) { if (apres !== avant || !/prévu au lot|planned for batch/.test(await msg(p))) echecsOutils.push(`${o.id} (grisé) : outil=${apres}, message=« ${await msg(p)} »`); }
    else if (apres !== o.id) echecsOutils.push(`${o.id} : outil actif ${apres}`);
  }
  check(`${nom} : ${uniques.length} boutons de la barre d'outils (${uniques.filter((o) => !o.indispo).length} actifs, ${uniques.filter((o) => o.indispo).length} grisés « prévu au lot »)`, echecsOutils.length === 0, echecsOutils.join(" ; "));

  // 3. Recherche d'outil.
  await cliquer(T("[data-planche-recherche]"));
  check(`${nom} : bouton Rechercher ouvre la boîte de recherche`, (await p.locator("[data-planche-recherche-dialogue]").count()) === 1);
  await p.keyboard.press("Escape");
  check(`${nom} : Échap ferme la recherche`, (await p.locator("[data-planche-recherche-dialogue]").count()) === 0);
  await cliquer(T("[data-planche-recherche]"));
  await p.locator("#planche-recherche-champ").fill("rectangle");
  await cliquer(p.locator("#planche-recherche-liste [role=option]").first());
  check(`${nom} : choisir un résultat de recherche active l'outil et ferme la boîte`, (await outilActif(p)) === "rectangle" && (await p.locator("[data-planche-recherche-dialogue]").count()) === 0, await outilActif(p));
  await cliquer(T("[data-planche-recherche]"));
  await cliquer(p.locator("[data-planche-recherche-dialogue] button", { hasText: /Fermer|Close/ }).first());
  check(`${nom} : bouton Fermer de la recherche`, (await p.locator("[data-planche-recherche-dialogue]").count()) === 0);

  // 4. Grille « … » : chaque outil de la grille.
  await cliquer(T("[data-planche-plus]"));
  check(`${nom} : « Plus d'outils » ouvre la grille`, (await p.locator("[data-planche-grille]").count()) === 1);
  const grille = await p.locator("[data-planche-grille] [data-planche-outil]").evaluateAll((els) => els.map((e) => ({ id: e.getAttribute("data-planche-outil"), indispo: e.getAttribute("aria-disabled") === "true" })));
  await cliquer(T("[data-planche-plus]"));
  check(`${nom} : « Plus d'outils » referme la grille`, (await p.locator("[data-planche-grille]").count()) === 0);
  const echecsGrille = [];
  for (const o of grille) {
    if ((await p.locator("[data-planche-grille]").count()) === 0) await cliquer(T("[data-planche-plus]"));
    const avant = await outilActif(p);
    await cliquer(p.locator(`[data-planche-grille] ${esc(o.id)}`).first(), o.indispo);
    const apres = await outilActif(p);
    const ferme = (await p.locator("[data-planche-grille]").count()) === 0;
    if (o.indispo) { if (apres !== avant) echecsGrille.push(`${o.id} (grisé) a changé l'outil`); if (!ferme) await cliquer(T("[data-planche-plus]")); }
    else if (apres !== o.id || !ferme) echecsGrille.push(`${o.id} : outil=${apres}, grille ${ferme ? "fermée" : "restée ouverte"}`);
  }
  check(`${nom} : ${grille.length} boutons de la grille (${grille.filter((o) => !o.indispo).length} actifs dont Suivez-moi, Retourner, Décalage, Diviser ; ${grille.filter((o) => o.indispo).length} grisés)`, echecsGrille.length === 0 && ["decalage", "suivez-moi", "retourner", "diviser"].every((id) => grille.some((o) => o.id === id && !o.indispo)), echecsGrille.join(" ; "));
  if ((await p.locator("[data-planche-grille]").count()) === 1) await cliquer(T("[data-planche-plus]"));

  // 5. Rectangle, OK du champ Mesures, annuler / rétablir.
  await cliquer(p.locator(`.planche-outils ${esc("rectangle")}`).first());
  check(`${nom} : Annuler désactivé quand il n'y a rien à annuler`, await T("[data-planche-annuler]").isDisabled());
  const o = await ecran({ x: 0, y: 0, z: 0 }, p);
  if (tactile) await p.touchscreen.tap(o.x, o.y); else { await p.mouse.move(o.x, o.y, { steps: 3 }); await p.mouse.click(o.x, o.y); }
  const o2 = await ecran({ x: 1, y: 1, z: 0 }, p);
  if (!tactile) await p.mouse.move(o2.x, o2.y, { steps: 5 });
  await T("[data-planche-mesures]").fill("4;3");
  await cliquer(p.locator(".planche-ok"));
  check(`${nom} : bouton OK du champ Mesures valide la saisie (rectangle 4 × 3)`, (await faces(p)) === 1, `faces=${await faces(p)}`);
  check(`${nom} : Annuler activé après une opération`, !(await T("[data-planche-annuler]").isDisabled()));
  await cliquer(T("[data-planche-annuler]"));
  check(`${nom} : bouton Annuler défait l'opération`, (await faces(p)) === 0 && /Annulé|Undone/.test(await msg(p)), await msg(p));
  await cliquer(T("[data-planche-retablir]"));
  check(`${nom} : bouton Rétablir la refait`, (await faces(p)) === 1);

  // 6. Touches modificatrices (téléphone seulement ; masquées à la souris).
  if (tactile) {
    await cliquer(p.locator(`.planche-outils ${esc("deplacer")}`).first());
    const mode = () => p.evaluate(() => window.fadiPlanche.etatOutil()?.mode ?? null);
    await cliquer(T('[data-planche-mod="Ctrl"]'));
    const m1 = await mode();
    await cliquer(T('[data-planche-mod="Ctrl"]'));
    const m2 = await mode();
    await cliquer(T('[data-planche-mod="Ctrl"]'));
    check("téléphone : bouton Ctrl fait défiler Copier → Tamponner → Déplacer", m1 === "copier" && m2 === "tampon" && (await mode()) === "deplacer", `${m1} → ${m2} → ${await mode()}`);
    await cliquer(p.locator(`.planche-outils ${esc("ligne")}`).first());
    const pt = await ecran({ x: 5, y: 5, z: 0 }, p);
    await p.touchscreen.tap(pt.x, pt.y);
    // Les flèches vivent dans le volet déployé (refonte responsive) : « Plus » les révèle, « Réduire » les range.
    const bascule = T("[data-planche-volet-bascule]");
    const flechesCachees = !(await T('[data-planche-mod="FlecheDroite"]').isVisible());
    if (flechesCachees) await cliquer(bascule);
    check("téléphone : « Plus » déploie le volet (flèches visibles, consigne complète)", flechesCachees && (await T('[data-planche-mod="FlecheDroite"]').isVisible()) && (await bascule.getAttribute("aria-expanded")) === "true");
    const fleches = [["FlecheDroite", "FlecheDroite"], ["FlecheGauche", "FlecheGauche"], ["FlecheHaut", "FlecheHaut"], ["FlecheBas", "FlecheBas"]];
    const ko = [];
    for (const [id, attendu] of fleches) {
      await cliquer(T(`[data-planche-mod="${id}"]`));
      const f = await p.evaluate(() => window.fadiPlanche.etatOutil()?.fleche?.touche ?? null);
      if (f !== attendu) ko.push(`${id} → ${f}`);
      await cliquer(T(`[data-planche-mod="${id}"]`));
    }
    check("téléphone : boutons ← ↑ → ↓ verrouillent puis libèrent la direction", ko.length === 0, ko.join(" ; "));
    await cliquer(bascule);
    check("téléphone : « Réduire » replie le volet (flèches rangées)", !(await T('[data-planche-mod="FlecheDroite"]').isVisible()));
    await cliquer(T('[data-planche-mod="Alt"]'));
    await cliquer(T('[data-planche-mod="Maj"]'));
    check("téléphone : boutons Alt et Maj répondent sans erreur", (await outilActif(p)) === "ligne");
    await p.keyboard.press("Escape");
  } else {
    check("ordinateur : la barre de touches modificatrices est masquée à la souris", !(await T("[data-planche-modificateurs]").isVisible()));
  }

  // 7. Instructeur et « ? ».
  await cliquer(T("[data-planche-panneau-icone]"));
  check(`${nom} : bouton Instructeur ouvre le panneau`, (await p.locator('[data-planche-panneau="instructeur"]').count()) === 1);
  await cliquer(p.locator('[data-planche-panneau="instructeur"] .canevas-fermer'));
  check(`${nom} : bouton × du panneau le ferme`, (await p.locator('[data-planche-panneau="instructeur"]').count()) === 0);
  await cliquer(p.locator(".planche-bas .lien").first());
  check(`${nom} : bouton « ? » ouvre l'Instructeur`, (await p.locator('[data-planche-panneau="instructeur"]').count()) === 1);
  await cliquer(p.locator(".planche-bas .lien").first());
  check(`${nom} : « ? » le referme`, (await p.locator('[data-planche-panneau="instructeur"]').count()) === 0);

  // 8. Sélecteurs de la barre du bas (ordinateur ; masqués sur téléphone par la mise en page).
  if (!tactile) {
    await p.locator('[data-nav-peripherique-rapide]').selectOption("trackpad");
    await p.locator('[data-nav-peripherique-rapide]').selectOption("souris");
    check("ordinateur : sélecteur du périphérique de navigation (Souris ⇄ Trackpad)", (await p.locator('[data-nav-peripherique-rapide]').inputValue()) === "souris");
    check("ordinateur : sélecteur de langue présent", (await p.locator("[data-choix-langue]").count()) >= 1);
  }

  // 9. Boutons de la barre du haut de l'Atelier : Plan / 3D / Documents / Planche, Fichier, Canevas, Harmonie.
  for (const mode of ["Plan", "3D", "Documents"]) {
    enPlanche = false;
    await cliquer(p.locator(`.barre-mode button:text-is("${mode}")`));
    await p.waitForTimeout(700);
    check(`${nom} : bouton « ${mode} » ouvre le mode (la Planche se ferme)`, (await p.locator("[data-planche]").count()) === 0);
    await ouvrirPlanche(p, tactile);
  }
  await cliquer(p.locator("[data-menu-principal] summary").first());
  const items = await p.locator("[data-menu-principal] button[data-menu]").evaluateAll((els) => els.map((e) => e.getAttribute("data-menu")));
  check(`${nom} : bouton Fichier ouvre le menu principal (${items.length} commandes : ${items.join(", ")})`, items.length >= 5 && (await p.locator('[data-menu-principal] button[data-menu="enregistrer"]').first().isVisible()), items.join(","));
  await cliquer(p.locator('[data-menu-principal] button[data-menu="enregistrer"]').first());
  await p.waitForTimeout(400);
  check(`${nom} : « Enregistrer maintenant » répond (le menu se referme)`, !(await p.locator("[data-menu-principal]").first().evaluate((e) => e.hasAttribute("open"))));
  const nbPlanche = () => p.locator("[data-planche]").count();
  await cliquer(p.locator('.atelier-n button:has-text("Canevas")').first());
  await p.waitForTimeout(500);
  const apresCanevas = await nbPlanche();
  await cliquer(p.locator('.atelier-n button:has-text("Canevas")').first());
  await p.waitForTimeout(500);
  check(`${nom} : bouton Canevas bascule la disposition (aller-retour) sans perdre la Planche`, apresCanevas === 1 && (await nbPlanche()) === 1, `${apresCanevas} / ${await nbPlanche()}`);
  const harmonie = p.getByRole("button", { name: /^\s*[◈◇]?\s*Harmonie\s*$/ }).first();
  if ((await harmonie.count()) > 0) {
    await cliquer(harmonie);
    await p.waitForTimeout(500);
    check(`${nom} : bouton Harmonie répond (la page reste utilisable, aucune erreur)`, (await p.locator("body").isVisible()) && erreursPage.length === 0, erreursPage.slice(0, 2).join(" | "));
  } else console.log(`(${nom} : pas de bouton Harmonie dans la barre du haut à cette largeur)`);
  await c.close();
}

await auditer("ordinateur", { width: 1536, height: 864 }, false);
await auditer("téléphone", { width: 390, height: 844 }, true);
check("aucune requête POST vers /commands pendant la Planche (brouillon local)", commandesEmises.length === 0, commandesEmises.slice(0, 3).join(" | "));
check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette des boutons de la Planche : tout est vert.");
process.exit(echecs ? 1 : 0);
