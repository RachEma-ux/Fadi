/**
 * Recette outil par outil de la Planche (desktop 1536 × 864, souris + clavier) : chaque outil livré (22 machines
 * d'états + Orbite, Panoramique, Zoom) est activé seul (touche ou recherche) et son effet sur le modèle est vérifié
 * par l'instrumentation `window.fadiPlanche` (lecture seule) ; plus aucun outil n'est grisé (lots 4 à 6 : recette planche-lots-4-6.mjs) ; annuler /
 * rétablir et le brouillon local sont relus. Toute coordonnée visée reste dans le canevas (|x| ≤ 8, |y| ≤ 8 autour
 * de l'origine dans la vue par défaut).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-outils.mjs
 */
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const resultats = [];
const note = (outil, cas, ok, detail = "") => { resultats.push({ outil, cas, ok, detail }); console.log(`${ok ? "✓" : "✗"} [${outil}] ${cas}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); return { status: r.status(), body: await r.json().catch(() => null) }; };

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `audit-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "audit planche" })).body.id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const bouton = page.locator("[data-mode-planche]"); await bouton.scrollIntoViewIfNeeded(); await bouton.click();
await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.fadiPlanche);
await page.locator("[data-planche-vue]").focus();

const etat = () => page.evaluate(() => {
  const P = window.fadiPlanche; const c = P.modele().racine; const pos = (id) => c.sommets[id].position;
  const aires = Object.values(c.faces).map((f) => { const q = f.exterieur.map(pos); let a = 0; for (let i = 0; i < q.length; i++) { const p = q[i], n = q[(i + 1) % q.length]; a += p.x * n.y - n.x * p.y; } return Math.round(Math.abs(a) / 2 * 1000) / 1000; });
  const e = P.etatOutil();
  return { faces: Object.keys(c.faces).length, aretes: Object.keys(c.aretes).length, sommets: Object.keys(c.sommets).length, courbes: Object.keys(c.courbes).length, aires, outil: P.outil(), etape: e?.etape ?? null, pas: P.pas(), selection: P.selection() };
});
const sommets = () => page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.sommets).map((s) => s.position));
const emprise = async () => { const s = await sommets(); if (!s.length) return null; const f = (k) => [Math.min(...s.map((p) => p[k])), Math.max(...s.map((p) => p[k]))].map((v) => Math.round(v * 1000) / 1000); return { x: f("x"), y: f("y"), z: f("z") }; };
const boite = async () => page.locator("[data-planche-vue] canvas").boundingBox();
const ecran = async (q) => { const b = await boite(); const e = await page.evaluate((x) => window.fadiPlanche.versEcran(x), q); return { x: b.x + e.x, y: b.y + e.y }; };
const survoler = async (q) => { const e = await ecran(q); await page.mouse.move(e.x, e.y, { steps: 4 }); return e; };
const cliquer = async (q) => { const e = await survoler(q); await page.mouse.click(e.x, e.y); await page.waitForTimeout(40); };
const doubleCliquer = async (q) => { const e = await survoler(q); await page.mouse.dblclick(e.x, e.y); await page.waitForTimeout(40); };
const saisir = async (t) => { await page.keyboard.type(t); await page.keyboard.press("Enter"); await page.waitForTimeout(60); };
const consigne = () => page.locator("[data-planche-etat]").textContent().then((t) => t ?? "");
const message = () => page.locator("[data-planche-message]").textContent().catch(() => "");
const tout = async () => { await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.keyboard.press(" "); };
const vider = async () => { // Annuler jusqu'au modèle vide, puis Sélection, puis clic dans le vide.
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  for (let i = 0; i < 40 && (await etat()).pas > 0; i++) await page.locator("[data-planche-annuler]").click();
  await page.keyboard.press(" ");
  await cliquer({ x: -6, y: -6, z: 0 });
  await page.locator("[data-planche-vue]").focus();
};
const parRecherche = async (texte, id) => {
  await page.keyboard.press("Shift+Minus");
  await page.locator("#planche-recherche-champ").fill(texte);
  await page.waitForFunction((id) => document.querySelector("#planche-recherche-liste [role=option]")?.id === `planche-recherche-${id}`, id, { timeout: 3000 }).catch(() => {});
  await page.keyboard.press("Enter");
  await page.waitForTimeout(60);
};
const outil = async (id, touche, recherche) => {
  await page.locator("[data-planche-vue]").focus();
  if (touche) await page.keyboard.press(touche); else await parRecherche(recherche ?? id, id);
  const e = await etat();
  note(id, touche ? `activation par la touche ${touche}` : `activation par la recherche « ${recherche ?? id} »`, e.outil === id, e.outil);
  return e.outil === id;
};
const rect = async (coin, dims) => { await outil("rectangle", "r"); await cliquer(coin); await saisir(dims); };
const delta = (a, b) => ({ faces: b.faces - a.faces, aretes: b.aretes - a.aretes, sommets: b.sommets - a.sommets, courbes: b.courbes - a.courbes });

// ——— 1. Ligne
{
  await vider(); const a = await etat();
  if (await outil("ligne", "l")) {
    await cliquer({ x: 0, y: 0, z: 0 }); note("ligne", "1er clic : étape 2", (await etat()).etape === 2);
    await survoler({ x: 4, y: 0, z: 0 }); await cliquer({ x: 4, y: 0, z: 0 });
    let b = await etat(); note("ligne", "2e clic : 1 arête (0;0)→(4;0), chaîne continue (étape 2)", delta(a, b).aretes === 1 && b.etape === 2, JSON.stringify(delta(a, b)));
    await survoler({ x: 4, y: 3, z: 0 }); await saisir("3");
    b = await etat(); const emp = await emprise();
    note("ligne", "saisie « 3 » dans la direction du curseur : 2e arête de 3 m", delta(a, b).aretes === 2 && emp.y[1] === 3, JSON.stringify(emp));
    await survoler({ x: 0, y: 3, z: 0 }); await cliquer({ x: 0, y: 3, z: 0 }); await survoler({ x: 0, y: 0, z: 0 }); await cliquer({ x: 0, y: 0, z: 0 });
    b = await etat(); note("ligne", "boucle fermée : face de 12 m², retour étape 1", b.faces === a.faces + 1 && b.aires.includes(12) && b.etape === 1, JSON.stringify(b));
    note("ligne", "un segment = un pas d'annulation (4 pas)", b.pas === a.pas + 4, String(b.pas));
    await page.keyboard.press("ArrowRight"); await cliquer({ x: 0, y: 0, z: 0 }); await survoler({ x: 2, y: 2, z: 0 }); await saisir("2");
    const s = await sommets(); const verrou = s.some((p) => Math.abs(p.x + 2) < 1e-6 && Math.abs(p.y) < 1e-6) || s.some((p) => Math.abs(p.x - 2) < 1e-6 && Math.abs(p.y) < 1e-6);
    note("ligne", "→ verrou rouge : la saisie suit l'axe rouge", verrou, JSON.stringify(s.map((p) => `${p.x};${p.y}`)));
    await page.keyboard.press("ArrowRight"); await page.keyboard.press("Escape");
    note("ligne", "Échap pendant le tracé : étape 1, outil gardé", (await etat()).etape === 1 && (await etat()).outil === "ligne");
  }
}
// ——— 2. Rectangle
{
  await vider(); const a = await etat();
  if (await outil("rectangle", "r")) {
    await cliquer({ x: 0, y: 0, z: 0 }); note("rectangle", "1er coin : étape 2", (await etat()).etape === 2);
    await survoler({ x: 1, y: 1, z: 0 }); await saisir("4;3");
    let b = await etat(); note("rectangle", "« 4;3 » : face 12 m², 4 arêtes, étape 1", b.faces === 1 && b.aires[0] === 12 && b.aretes === 4 && b.etape === 1, JSON.stringify(b));
    await saisir("5;2"); b = await etat(); note("rectangle", "correction après coup « 5;2 » : remplace (10 m², toujours 1 pas)", b.aires[0] === 10 && b.pas === 1, JSON.stringify(b));
    await cliquer({ x: 6, y: -3, z: 0 }); await survoler({ x: 8, y: -1, z: 0 }); await cliquer({ x: 8, y: -1, z: 0 });
    b = await etat(); note("rectangle", "2 clics : 2e face de 4 m²", b.faces === 2 && b.aires.includes(4), JSON.stringify(b.aires));
    await page.keyboard.press("Control"); await cliquer({ x: 0, y: -5, z: 0 }); await survoler({ x: 1, y: -4, z: 0 }); await saisir("2;2");
    b = await etat(); const e2 = await emprise(); note("rectangle", "Ctrl = depuis le centre : « 2;2 » centré en (0;-5) → y de -6 à -4", b.faces === 3 && e2.y[0] === -6, JSON.stringify(e2));
    await page.keyboard.press("Control");
  }
}
// ——— 3. Rectangle pivoté
{
  await vider(); const a = await etat();
  if (await outil("rectangle-pivote", null, "pivoté")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await survoler({ x: 3, y: 0, z: 0 }); await cliquer({ x: 3, y: 0, z: 0 });
    note("rectangle-pivote", "2 clics : étape 3 (largeur, angle)", (await etat()).etape === 3);
    await survoler({ x: 3, y: 2, z: 0 }); await saisir("2;90");
    const b = await etat(); note("rectangle-pivote", "« 2;90 » : face 6 m² au sol, 4 arêtes", b.faces === 1 && b.aires[0] === 6 && b.aretes === 4, JSON.stringify(b));
  }
}
// ——— 4. Cercle
{
  await vider();
  if (await outil("cercle", "c")) {
    await cliquer({ x: 0, y: 0, z: 0 }); note("cercle", "centre posé : étape 2", (await etat()).etape === 2);
    await survoler({ x: 2, y: 0, z: 0 }); await saisir("2");
    let b = await etat(); note("cercle", "rayon « 2 » : 1 face, 1 courbe, 24 arêtes (défaut)", b.faces === 1 && b.courbes === 1 && b.aretes === 24, JSON.stringify(b));
    await saisir("8s"); b = await etat(); note("cercle", "« 8s » juste après : courbe reconstruite à 8 côtés, même pas", b.aretes === 8 && b.pas === 1, JSON.stringify(b));
    await saisir("3"); b = await etat(); const emp = await emprise(); note("cercle", "rayon « 3 » juste après : rayon corrigé (emprise x de -3 à 3)", emp.x[0] === -3 && emp.x[1] === 3 && b.pas === 1, JSON.stringify(emp));
  }
}
// ——— 5. Polygone
{
  await vider();
  if (await outil("polygone", null, "polygone")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await survoler({ x: 2, y: 0, z: 0 }); await saisir("2");
    let b = await etat(); note("polygone", "rayon « 2 » : face à 6 côtés (défaut)", b.faces === 1 && b.aretes === 6, JSON.stringify(b));
    const aireInscrit = b.aires[0];
    await page.keyboard.press("Control"); await cliquer({ x: 6, y: 0, z: 0 }); await survoler({ x: 8, y: 0, z: 0 }); await saisir("2");
    b = await etat(); note("polygone", "Ctrl = rayon circonscrit : 2e hexagone plus grand (apothème 2)", b.faces === 2 && b.aires[1] > aireInscrit, JSON.stringify(b.aires));
    await page.keyboard.press("Control");
  }
}
// ——— 6. Arc (centre)
{
  await vider();
  if (await outil("arc", null, "arc")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await cliquer({ x: 2, y: 0, z: 0 }); note("arc", "centre + départ : étape 3 (angle)", (await etat()).etape === 3);
    await survoler({ x: 0, y: 2, z: 0 }); await saisir("90");
    const b = await etat(); const emp = await emprise();
    note("arc", "angle « 90 » : courbe sans face, 12 côtés (défaut), de (2;0) à (0;2)", b.faces === 0 && b.courbes === 1 && b.aretes === 12 && emp.y[1] === 2 && emp.x[1] === 2, JSON.stringify({ b, emp }));
  }
}
// ——— 7. Arc 2 points
{
  await vider();
  if (await outil("arc-2-points", "a")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await cliquer({ x: 4, y: 0, z: 0 }); note("arc-2-points", "départ + fin : étape 3 (flèche)", (await etat()).etape === 3);
    await survoler({ x: 2, y: 1, z: 0 }); await saisir("1");
    const b = await etat(); const emp = await emprise();
    note("arc-2-points", "flèche « 1 » : courbe sans face, 12 arêtes, sommet à y = 1", b.faces === 0 && b.courbes === 1 && b.aretes === 12 && emp.y[1] === 1, JSON.stringify({ b, emp }));
  }
}
// ——— 8. Arc 3 points
{
  await vider();
  if (await outil("arc-3-points", null, "3 points")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await cliquer({ x: 2, y: 2, z: 0 }); note("arc-3-points", "2 clics : étape 3", (await etat()).etape === 3);
    await survoler({ x: 4, y: 0, z: 0 }); await cliquer({ x: 4, y: 0, z: 0 });
    const b = await etat(); const emp = await emprise();
    note("arc-3-points", "3e clic : courbe passant par (2;2), 12 arêtes, sans face", b.faces === 0 && b.courbes === 1 && b.aretes === 12 && Math.abs(emp.y[1] - 2) < 1e-6, JSON.stringify({ b, emp }));
  }
}
// ——— 9. Secteur
{
  await vider();
  if (await outil("secteur", null, "secteur")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await cliquer({ x: 2, y: 0, z: 0 }); await survoler({ x: 0, y: 2, z: 0 }); await saisir("90");
    const b = await etat(); note("secteur", "angle « 90 » : arc de 12 côtés + 2 rayons, face automatique (≈ π m²)", b.faces === 1 && b.aretes === 14 && Math.abs(b.aires[0] - Math.PI) < 0.2, JSON.stringify(b));
  }
}
// ——— 10. Main levée
{
  await vider();
  if (await outil("main-levee", null, "main levée")) {
    const p0 = await ecran({ x: 0, y: 0, z: 0 }); const p1 = await ecran({ x: 3, y: 1, z: 0 }); const p2 = await ecran({ x: 4, y: 3, z: 0 });
    await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p1.x, p1.y, { steps: 15 }); await page.mouse.move(p2.x, p2.y, { steps: 15 }); await page.mouse.up(); await page.waitForTimeout(80);
    let b = await etat(); note("main-levee", "appuyer-glisser-relâcher : une courbe de plusieurs arêtes, sans face", b.courbes === 1 && b.aretes >= 3 && b.faces === 0 && b.pas === 1, JSON.stringify(b));
    const avant = b.aretes; await page.keyboard.press("Control+Minus"); b = await etat();
    note("main-levee", "Ctrl − juste après : moins de segments, pas d'annulation remplacé", b.aretes < avant && b.pas === 1, `${avant} → ${b.aretes}`);
    const q0 = await ecran({ x: -2, y: -2, z: 0 }); const q1 = await ecran({ x: 2, y: -2, z: 0 }); const q2 = await ecran({ x: 2, y: -5, z: 0 });
    await page.mouse.move(q0.x, q0.y); await page.mouse.down(); await page.mouse.move(q1.x, q1.y, { steps: 10 }); await page.mouse.move(q2.x, q2.y, { steps: 10 }); await page.mouse.move(q0.x, q0.y, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(80);
    b = await etat(); note("main-levee", "boucle fermée au sol : face créée", b.faces === 1, JSON.stringify(b));
  }
}
// ——— 11. Gomme
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await outil("ligne", "l"); await cliquer({ x: 5, y: -2, z: 0 }); await survoler({ x: 8, y: -2, z: 0 }); await cliquer({ x: 8, y: -2, z: 0 }); await page.keyboard.press("Escape");
  const a = await etat();
  if (await outil("gomme", "e")) {
    await cliquer({ x: 6.5, y: -2, z: 0 }); let b = await etat(); note("gomme", "clic sur une arête libre : arête effacée (1 pas)", b.aretes === a.aretes - 1 && b.pas === a.pas + 1, JSON.stringify(delta(a, b)));
    await cliquer({ x: 2, y: 0, z: 0 }); const c = await etat(); note("gomme", "clic sur une arête de face : l'arête ET la face disparaissent", c.aretes === b.aretes - 1 && c.faces === b.faces - 1, JSON.stringify(delta(b, c)));
    await cliquer({ x: 2, y: 1.5, z: 0 }); const d = await etat(); note("gomme", "clic sur une face seule / dans le vide : rien", d.aretes === c.aretes && d.faces === c.faces);
    const p0 = await ecran({ x: -0.5, y: 1.5, z: 0 }); const p1 = await ecran({ x: 4.5, y: 1.5, z: 0 });
    await page.mouse.move(p0.x, p0.y); await page.mouse.down(); await page.mouse.move(p1.x, p1.y, { steps: 20 }); await page.mouse.up(); await page.waitForTimeout(80);
    const e = await etat(); note("gomme", "glisser à travers 2 arêtes : effacées au relâchement, un seul pas", e.aretes === d.aretes - 2 && e.pas === d.pas + 1, JSON.stringify(delta(d, e)));
  }
}
// ——— 12. Sélection
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await rect({ x: 6, y: 0, z: 0 }, "2;2");
  if (await outil("selection", " ")) {
    await cliquer({ x: 2, y: 1.5, z: 0 }); let e = await etat(); note("selection", "clic sur une face : 1 face", e.selection.length === 1 && e.selection[0].startsWith("f"), JSON.stringify(e.selection));
    await cliquer({ x: 2, y: 0, z: 0 }); e = await etat(); note("selection", "clic sur une arête : 1 arête", e.selection.length === 1 && e.selection[0].startsWith("a"));
    await doubleCliquer({ x: 2, y: 1.5, z: 0 }); e = await etat(); note("selection", "double-clic sur une face : face + 4 arêtes", e.selection.length === 5, String(e.selection.length));
    await page.keyboard.down("Control"); await cliquer({ x: 7, y: 1, z: 0 }); await page.keyboard.up("Control"); e = await etat(); note("selection", "Ctrl + clic : ajoute (6)", e.selection.length === 6, String(e.selection.length));
    await page.waitForTimeout(450); // > délai du double-clic (400 ms) : même point que le clic précédent
    await page.keyboard.down("Shift"); await cliquer({ x: 7, y: 1, z: 0 }); await page.keyboard.up("Shift"); e = await etat(); note("selection", "Maj + clic : bascule (5)", e.selection.length === 5, String(e.selection.length));
    await cliquer({ x: -3, y: -3, z: 0 }); e = await etat(); note("selection", "clic dans le vide : sélection vidée", e.selection.length === 0);
    const coins = await Promise.all([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 3, z: 0 }, { x: 0, y: 3, z: 0 }].map(ecran));
    const minx = Math.min(...coins.map((c) => c.x)) - 20, maxx = Math.max(...coins.map((c) => c.x)) + 20, miny = Math.min(...coins.map((c) => c.y)) - 20, maxy = Math.max(...coins.map((c) => c.y)) + 20;
    await page.mouse.move(minx, miny); await page.mouse.down(); await page.mouse.move(maxx, maxy, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(60);
    e = await etat(); note("selection", "cadre gauche → droite (fenêtre) englobant le rectangle : face + 4 arêtes", e.selection.length === 5, String(e.selection.length));
    await cliquer({ x: -5, y: -5, z: 0 });
    await page.mouse.move(maxx, miny); await page.mouse.down(); await page.mouse.move((minx + maxx) / 2, (miny + maxy) / 2, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(60);
    e = await etat(); note("selection", "cadre droite → gauche (croisée) touchant le rectangle : éléments touchés sélectionnés", e.selection.length >= 1, String(e.selection.length));
    await cliquer({ x: 7, y: 1, z: 0 }); const avant = await etat(); await page.keyboard.press("Delete"); e = await etat();
    note("selection", "Suppr : la face sélectionnée est effacée (1 pas)", e.faces === avant.faces - 1 && e.pas === avant.pas + 1, JSON.stringify(delta(avant, e)));
    await cliquer({ x: 2, y: 0, z: 0 }); const c = await ecran({ x: 4, y: 0, z: 0 }); const d = await ecran({ x: 5, y: -1, z: 0 });
    await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.down(); await page.mouse.move(d.x, d.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(60);
    const s = await sommets(); note("selection", "poignée d'extrémité glissée (4;0) → (5;-1)", s.some((p) => Math.abs(p.x - 5) < 1e-6 && Math.abs(p.y + 1) < 1e-6), JSON.stringify(s.map((p) => `${p.x};${p.y}`)));
    await page.keyboard.press("Escape"); e = await etat(); note("selection", "Échap : sélection vidée", e.selection.length === 0);
  }
}
// ——— 13. Lasso
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("lasso", "Shift+ ")) {
    await cliquer({ x: -1, y: -1, z: 0 }); await cliquer({ x: 5, y: -1, z: 0 }); await cliquer({ x: 5, y: 4, z: 0 }); await doubleCliquer({ x: -1, y: 4, z: 0 });
    let e = await etat(); note("lasso", "contour polygonal horaire (fenêtre) fermé au double-clic : face + 4 arêtes", e.selection.length === 5, String(e.selection.length));
    await page.keyboard.press("Escape"); await cliquer({ x: -1, y: 1.5, z: 0 }); await cliquer({ x: 2, y: 1.5, z: 0 }); await doubleCliquer({ x: 2, y: 4, z: 0 });
    e = await etat(); note("lasso", "contour anti-horaire (croisée) touchant la face : éléments touchés", e.selection.length >= 1, String(e.selection.length));
  }
}
// ——— 14. Pousser/Tirer
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("pousser-tirer", "p")) {
    await cliquer({ x: 2, y: 1.5, z: 0 }); note("pousser-tirer", "clic sur la face : étape 2", (await etat()).etape === 2, await consigne());
    await survoler({ x: 2, y: 1.5, z: 2 }); await saisir("2");
    let b = await etat(); const emp = await emprise(); note("pousser-tirer", "« 2 » : boîte 4 × 3 × 2 (6 faces, 12 arêtes), z max 2", b.faces === 6 && b.aretes === 12 && emp.z[1] === 2 && b.pas === 2, JSON.stringify({ b, emp }));
    await saisir("3"); const emp2 = await emprise(); b = await etat(); note("pousser-tirer", "« 3 » juste après : hauteur corrigée, même pas", emp2.z[1] === 3 && b.pas === 2, JSON.stringify(emp2));
    await cliquer({ x: 2, y: 1.5, z: 3 }); await survoler({ x: 2, y: 1.5, z: 2 }); await saisir("-1"); const emp3 = await emprise();
    note("pousser-tirer", "« -1 » sur le dessus : pousse vers le bas (z max 2)", emp3.z[1] === 2, JSON.stringify(emp3));
  }
}
// ——— 15. Déplacer
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("deplacer", "m")) {
    await cliquer({ x: 2, y: 1.5, z: 0 }); note("deplacer", "clic sur la face sans présélection : base posée, étape 2", (await etat()).etape === 2);
    await page.keyboard.press("ArrowRight"); await saisir("2"); let emp = await emprise();
    note("deplacer", "→ puis « 2 » : translation rouge de 2 m (x de 2 à 6)", emp.x[0] === 2 && emp.x[1] === 6, JSON.stringify(emp));
    await cliquer({ x: 4, y: 1.5, z: 0 }); await saisir("<0;2;0>"); emp = await emprise();
    note("deplacer", "saisie relative « <0;2;0> » : y de 2 à 5", emp.y[0] === 2 && emp.y[1] === 5, JSON.stringify(emp));
    const a = await etat(); await page.keyboard.press("Control"); await cliquer({ x: 4, y: 3.5, z: 0 }); await page.keyboard.press("ArrowRight"); await saisir("5");
    let b = await etat(); note("deplacer", "Ctrl = copier : 2e face, même forme", b.faces === a.faces + 1, JSON.stringify(delta(a, b)));
    await saisir("x3"); b = await etat(); note("deplacer", "« x3 » : réseau de 3 copies (4 faces), un seul pas", b.faces === a.faces + 3 && b.pas === a.pas + 1, JSON.stringify({ faces: b.faces, pas: b.pas }));
  }
}
// ——— 16. Faire pivoter
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await page.keyboard.press(" "); await cliquer({ x: 2, y: 1.5, z: 0 });
  if (await outil("faire-pivoter", "q")) {
    await cliquer({ x: 0, y: 0, z: 0 }); await cliquer({ x: 4, y: 0, z: 0 }); note("faire-pivoter", "centre + départ : étape 3 (angle)", (await etat()).etape === 3);
    await survoler({ x: 0, y: 4, z: 0 }); await saisir("90"); const emp = await emprise(); const b = await etat();
    note("faire-pivoter", "« 90 » autour de (0;0) : le 4 × 3 devient 3 × 4 (x de -3 à 0, y de 0 à 4), aire 12", emp.x[0] === -3 && emp.x[1] === 0 && emp.y[1] === 4 && b.aires[0] === 12, JSON.stringify(emp));
  }
}
// ——— 17. Échelle
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await page.keyboard.press(" "); await cliquer({ x: 2, y: 1.5, z: 0 });
  if (await outil("echelle", "s")) {
    await cliquer({ x: 4, y: 3, z: 0 }); note("echelle", "poignée de coin (4;3) : étape 2", (await etat()).etape === 2, await consigne());
    await survoler({ x: 6, y: 5, z: 0 }); await saisir("2"); let emp = await emprise();
    note("echelle", "facteur « 2 » depuis le coin opposé (0;0) : 8 × 6", emp.x[1] === 8 && emp.y[1] === 6, JSON.stringify(emp));
    await cliquer({ x: 0, y: 3, z: 0 }); await survoler({ x: -2, y: 3, z: 0 }); await saisir("10m"); emp = await emprise();
    note("echelle", "face plate : poignée du milieu du bord gauche (0;3) + « 10m » → largeur cible 10 (x de -2 à 8), hauteur inchangée", emp.x[0] === -2 && emp.x[1] === 8 && emp.y[1] === 6, JSON.stringify(emp));
  }
}
// ——— 18. Décalage
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  if (await outil("decalage", "f")) {
    await cliquer({ x: 2, y: 1.5, z: 0 }); note("decalage", "clic sur la face : étape 2", (await etat()).etape === 2);
    await survoler({ x: 2, y: 1.2, z: 0 }); await saisir("0,5"); let b = await etat();
    note("decalage", "« 0,5 » : anneau + face intérieure 3 × 2 (aires 12 − 6 et 6)", b.faces === 2 && b.aires.some((x) => x === 6), JSON.stringify(b.aires));
    await page.keyboard.press(" "); await cliquer({ x: 2, y: 0, z: 0 }); await outil("decalage", "f"); await cliquer({ x: 2, y: -1, z: 0 }); await saisir("1"); const c = await etat(); const e3 = await emprise();
    note("decalage", "arête présélectionnée, point de mesure à l'extérieur + « 1 » : polyligne parallèle du côté du curseur (y = -1), aucune face nouvelle", c.aretes > b.aretes && c.faces === b.faces && e3.y[0] === -1, JSON.stringify({ d: delta(b, c), emp: e3 }));
  }
}
// ——— 19. Retourner
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await page.keyboard.press(" "); await cliquer({ x: 2, y: 1.5, z: 0 });
  if (await outil("retourner", null, "retourner")) {
    await page.keyboard.press("ArrowRight"); const emp = await emprise(); const b = await etat();
    note("retourner", "→ (plan rouge) : miroir en place autour du centre, mêmes dimensions, 1 pas", emp.x[0] === 0 && emp.x[1] === 4 && b.pas === 2 && b.faces === 1, JSON.stringify({ emp, pas: b.pas }));
    await page.keyboard.press("Control"); await page.keyboard.press("ArrowLeft"); const c = await etat();
    note("retourner", "Ctrl + ← : « Retourner et copier » enregistré (la copie par le plan central se confond avec l'original : rien de nouveau)", c.pas === 3 && c.faces === 1, JSON.stringify({ pas: c.pas, faces: c.faces }));
    await page.keyboard.press("Control");
  }
}
// ——— 20. Diviser
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); const a = await etat();
  if (await outil("diviser", null, "diviser")) {
    note("diviser", "champ Segments à 5 par défaut", (await page.locator("[data-planche-mesures]").inputValue()) === "5");
    await cliquer({ x: 2, y: 0, z: 0 }); await saisir("4"); const b = await etat();
    note("diviser", "arête + « 4 » : 3 arêtes de plus, face conservée, retour à Sélection", b.aretes === a.aretes + 3 && b.faces === a.faces && b.outil === "selection", JSON.stringify({ d: delta(a, b), outil: b.outil }));
  }
}
// ——— 21. Suivez-moi
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  // Profil vertical dans le plan x = 0, posé sur le coin (0;0) : (0;0;0) → (0;0;0,5) → (0;-0,5;0,5) → (0;-0,5;0) → fermé.
  await outil("ligne", "l"); await cliquer({ x: 0, y: 0, z: 0 }); await saisir("[0;0;0,5]"); await saisir("[0;-0,5;0,5]"); await saisir("[0;-0,5;0]"); await saisir("[0;0;0]"); await page.keyboard.press("Escape");
  const a = await etat(); note("suivez-moi", "préparation : chemin (face 4 × 3) + profil vertical fermé (2 faces)", a.faces === 2, JSON.stringify(a));
  await page.keyboard.press(" "); await cliquer({ x: 2, y: 1.5, z: 0 });
  if (await outil("suivez-moi", null, "suivez")) {
    const e = await etat(); note("suivez-moi", "chemin présélectionné : consigne « profil »", /profil/i.test(await consigne()), await consigne());
    await cliquer({ x: 0, y: -0.25, z: 0.25 }); const b = await etat();
    note("suivez-moi", "clic sur le profil : extrusion le long du périmètre (faces en plus)", b.faces > a.faces + 1, JSON.stringify(delta(a, b)));
  }
}
// ——— 22. Caméra : Orbite, Panoramique, Zoom
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3");
  const ref = await ecran({ x: 4, y: 3, z: 0 }); const o = await ecran({ x: 0, y: 0, z: 0 });
  if (await outil("orbite", "o")) {
    const c = await ecran({ x: 2, y: 1.5, z: 0 }); await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x + 120, c.y + 40, { steps: 10 }); await page.mouse.up();
    const r2 = await ecran({ x: 4, y: 3, z: 0 }); note("orbite", "glisser : la vue tourne (projection du point (4;3) déplacée)", Math.hypot(r2.x - ref.x, r2.y - ref.y) > 5, JSON.stringify({ avant: ref, apres: r2 }));
  }
  if (await outil("panoramique", "h")) {
    const o1 = await ecran({ x: 0, y: 0, z: 0 }); const r1 = await ecran({ x: 4, y: 3, z: 0 });
    await page.mouse.move(o1.x, o1.y); await page.mouse.down(); await page.mouse.move(o1.x + 100, o1.y, { steps: 10 }); await page.mouse.up();
    const o2 = await ecran({ x: 0, y: 0, z: 0 }); const r2 = await ecran({ x: 4, y: 3, z: 0 });
    const d1 = Math.hypot(r1.x - o1.x, r1.y - o1.y), d2 = Math.hypot(r2.x - o2.x, r2.y - o2.y);
    note("panoramique", "glisser : la vue se déplace sans changer d'échelle (perspective : ± 10 %)", Math.abs(o2.x - o1.x) > 50 && Math.abs(d2 / d1 - 1) < 0.1, JSON.stringify({ dx: o2.x - o1.x, d1, d2 }));
  }
  if (await outil("zoom", "z")) {
    const o1 = await ecran({ x: 0, y: 0, z: 0 }); const r1 = await ecran({ x: 4, y: 3, z: 0 }); const c = await ecran({ x: 2, y: 1.5, z: 0 });
    await page.mouse.move(c.x, c.y); await page.mouse.down(); await page.mouse.move(c.x, c.y - 80, { steps: 10 }); await page.mouse.up();
    const o2 = await ecran({ x: 0, y: 0, z: 0 }); const r2 = await ecran({ x: 4, y: 3, z: 0 });
    const d1 = Math.hypot(r1.x - o1.x, r1.y - o1.y), d2 = Math.hypot(r2.x - o2.x, r2.y - o2.y);
    note("zoom", "glisser vertical : l'échelle change", Math.abs(d2 / d1 - 1) > 0.05, JSON.stringify({ d1, d2 }));
    await page.keyboard.type("60"); await page.keyboard.press("Enter"); note("zoom", "« 60 » : champ de vision annoncé", ((await message()) ?? "").includes("60"), await message());
    await page.keyboard.press("Escape"); note("zoom", "Échap : retour à l'outil précédent (Panoramique)", (await etat()).outil === "panoramique", (await etat()).outil);
  }
}
// ——— 23. Outils prévus : plus aucun outil grisé (lots 4 à 6 livrés) ; la recette des lots 4 à 6 teste chacun d'eux
{
  await page.keyboard.press(" "); await page.locator("[data-planche-plus]").click(); await page.waitForSelector("[data-planche-grille]");
  const grises = await page.locator("[data-planche-grille] button[disabled], [data-planche-grille] button[aria-disabled=true]").count();
  const total = await page.locator("[data-planche-grille] button[data-planche-outil]").count();
  note("prevus", "grille « … » : aucun outil grisé (lots 4 à 6 livrés)", grises === 0 && total >= 30, `${grises} grisés sur ${total}`);
  await page.keyboard.press("Escape");
  await parRecherche("mètre", "metre"); note("prevus", "recherche « mètre » puis Entrée : Mètre activé", (await etat()).outil === "metre", (await etat()).outil);
  await page.keyboard.press("Escape");
}
// ——— 24. Annuler / Rétablir et brouillon
{
  await vider(); await rect({ x: 0, y: 0, z: 0 }, "4;3"); await outil("pousser-tirer", "p"); await cliquer({ x: 2, y: 1.5, z: 0 }); await saisir("1");
  const a = await etat(); await page.keyboard.press("Control+z"); const b = await etat(); await page.keyboard.press("Control+y"); const c = await etat();
  note("historique", "Ctrl+Z puis Ctrl+Y : état restauré à l'identique", b.faces === 1 && c.faces === a.faces && c.pas === a.pas, JSON.stringify({ a: a.faces, b: b.faces, c: c.faces }));
  await page.waitForTimeout(600); await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  const b2 = page.locator("[data-mode-planche]"); await b2.scrollIntoViewIfNeeded(); await b2.click(); await page.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 }); await page.waitForFunction(() => !!window.fadiPlanche); await page.waitForTimeout(500);
  const d = await etat(); note("historique", "brouillon local relu après rechargement (mêmes faces et arêtes)", d.faces === c.faces && d.aretes === c.aretes, JSON.stringify({ c: [c.faces, c.aretes], d: [d.faces, d.aretes] }));
}
note("page", "aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await browser.close();
const ko = resultats.filter((r) => !r.ok);
console.log(ko.length ? `\n${ko.length} échec(s) sur ${resultats.length} vérifications` : `\nRecette outil par outil de la Planche : tout est vert (${resultats.length} vérifications).`);
process.exit(ko.length ? 1 : 0);
