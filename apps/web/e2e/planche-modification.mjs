/**
 * Recette des outils de modification de la Planche (cahier-planche §8, lot 3), desktop 1536 px : rectangle 4 × 3 au
 * sol, puis Déplacer (M, → verrou rouge, « 2 »), Échelle (S, poignée de coin, « 2 »), Retourner (recherche, → plan
 * rouge), Faire pivoter (Q, centre, départ, « 90 ») et Décalage (F, « 0,5 ») — chaque outil au clavier et à la souris,
 * état lu par l'instrumentation `window.fadiPlanche` (lecture seule). Aucune commande ne doit partir (brouillon local,
 * C6) et aucune erreur JavaScript ne doit survenir. Pousser/Tirer et Diviser sont vérifiés par `planche.mjs`.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-modification.mjs
 */
import { createRequire } from "node:module";
import { chromium } from "playwright";
import { ecarterBarreActions } from "./lib-barre.mjs";

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
// D-195 : la barre d'actions flottante est rangée hors du dessin (la recette clique à des coordonnées projetées).
await ecarterBarreActions(page);
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


await ouvrir(pid);
await ouvrirPlanche();
await page.locator("[data-planche-vue]").focus();
const sommetsTous = () => page.evaluate(() => Object.values(window.fadiPlanche.modele().racine.sommets).map((s) => s.position));
const emprise = async () => { const s = await sommetsTous(); const f = (k) => [Math.min(...s.map((p) => p[k])), Math.max(...s.map((p) => p[k]))]; return { x: f("x"), y: f("y"), z: f("z") }; };
const r3 = (a) => a.map((v) => Math.round(v * 1e6) / 1e6);
// Rectangle 4 × 3 au sol.
await page.keyboard.press("r");
const a1 = await ecran({ x: 0, y: 0, z: 0 });
await page.mouse.move(a1.x, a1.y, { steps: 3 }); await page.mouse.click(a1.x, a1.y);
const a2 = await ecran({ x: 1, y: 1, z: 0 });
await page.mouse.move(a2.x, a2.y, { steps: 5 });
await page.keyboard.type("4;3"); await page.keyboard.press("Enter");
check("rectangle 4 × 3 posé", (await etat()).faces === 1, JSON.stringify(await etat()));

// Sélection (Espace) : clic sur une arête → ses deux extrémités sont des poignées ; glisser l'une déplace le sommet
// (l'arête reste sélectionnée pendant le geste) ; Annuler remet le rectangle en place.
await page.keyboard.press(" ");
check("Espace : outil Sélection", (await etat()).outil === "selection");
const bord = await ecran({ x: 2, y: 0, z: 0 });
await page.mouse.move(bord.x, bord.y, { steps: 3 }); await page.mouse.click(bord.x, bord.y);
const selArete = await page.evaluate(() => window.fadiPlanche.selection());
check("Sélection : clic sur l'arête basse → 1 arête sélectionnée", selArete.length === 1 && selArete[0].startsWith("a"), JSON.stringify(selArete));
const coin40 = await ecran({ x: 4, y: 0, z: 0 });
const vers = await ecran({ x: 5, y: -1, z: 0 });
await page.mouse.move(coin40.x, coin40.y, { steps: 3 });
await page.mouse.down();
await page.mouse.move(vers.x, vers.y, { steps: 8 });
const pendant = await page.evaluate(() => window.fadiPlanche.selection());
check("poignée glissée : l'arête reste sélectionnée pendant le geste", pendant.length === 1 && pendant[0] === selArete[0], JSON.stringify(pendant));
await page.mouse.up();
let som = (await sommetsTous()).map((q) => `${Math.round(q.x * 100) / 100};${Math.round(q.y * 100) / 100}`);
check("poignée relâchée : le sommet (4;0) est déplacé vers (5;-1), 4 sommets", som.includes("5;-1") && !som.includes("4;0") && som.length === 4, som.join(" "));
await page.locator("[data-planche-annuler]").click();
som = (await sommetsTous()).map((q) => `${Math.round(q.x * 100) / 100};${Math.round(q.y * 100) / 100}`);
check("Annuler : le sommet revient en (4;0)", som.includes("4;0") && !som.includes("5;-1"), som.join(" "));
await page.keyboard.press("Escape");

// Déplacer (M) : clic sur la face (base), → verrou rouge, « 2 » Entrée.
await page.keyboard.press("m");
check("touche M : outil Déplacer", (await etat()).outil === "deplacer");
const c = await ecran({ x: 2, y: 1.5, z: 0 });
await page.mouse.move(c.x, c.y, { steps: 3 }); await page.mouse.click(c.x, c.y);
check("Déplacer : base posée (étape 2)", (await etat()).etape === 2, JSON.stringify(await etat()));
await page.keyboard.press("ArrowRight");
await page.keyboard.type("2"); await page.keyboard.press("Enter");
let e = await emprise();
check("Déplacer : face déplacée de 2 m sur rouge (x ∈ [2 ; 6])", r3(e.x).join() === "2,6" && r3(e.y).join() === "0,3", JSON.stringify(e));
check("Déplacer : un seul pas", (await etat()).pas === 2, String((await etat()).pas));

// Échelle (S) : la face reste sélectionnée ; poignée de coin (6,3,0) puis « 2 ».
await page.keyboard.press("s");
check("touche S : outil Échelle", (await etat()).outil === "echelle");
const coin = await ecran({ x: 6, y: 3, z: 0 });
await page.mouse.move(coin.x, coin.y, { steps: 3 }); await page.mouse.click(coin.x, coin.y);
check("Échelle : poignée de coin choisie (étape 2)", (await etat()).etape === 2, JSON.stringify(await etat()));
await page.keyboard.type("2"); await page.keyboard.press("Enter");
e = await emprise();
check("Échelle « 2 » : 8 × 6 depuis le coin opposé fixe (x ∈ [2 ; 10], y ∈ [0 ; 6])", r3(e.x).join() === "2,10" && r3(e.y).join() === "0,6", JSON.stringify(e));

// Retourner : recherche, puis flèche → (plan rouge) = miroir immédiat autour du centre.
await page.keyboard.press("Shift+Minus");
await page.locator("#planche-recherche-champ").fill("retourner");
await page.keyboard.press("Enter");
check("recherche « retourner » : outil Retourner", (await etat()).outil === "retourner");
await page.keyboard.press("ArrowRight");
e = await emprise();
check("Retourner (→) : rectangle symétrique, emprise inchangée", r3(e.x).join() === "2,10" && r3(e.y).join() === "0,6", JSON.stringify(e));

// Faire pivoter (Q) : centre à l'origine (2;0), départ (6;0), « 90 » → rotation de 90°.
await page.keyboard.press("q");
check("touche Q : outil Faire pivoter", (await etat()).outil === "faire-pivoter");
const o = await ecran({ x: 2, y: 0, z: 0 });
await page.mouse.move(o.x, o.y, { steps: 3 }); await page.mouse.click(o.x, o.y);
const d = await ecran({ x: 6, y: 0, z: 0 });
await page.mouse.move(d.x, d.y, { steps: 3 }); await page.mouse.click(d.x, d.y);
check("Faire pivoter : étape angle", (await etat()).etape === 3, JSON.stringify(await etat()));
await page.keyboard.type("90"); await page.keyboard.press("Enter");
e = await emprise();
check("Faire pivoter « 90 » : le rectangle 8 × 6 devient 6 × 8 autour de (2 ; 0)", r3(e.x).join() === "-4,2" && r3(e.y).join() === "0,8", JSON.stringify(e));

// Décalage (F) : clic sur la face, « 0,5 » → anneau + face intérieure.
await page.keyboard.press("Escape");
await page.keyboard.press("f");
check("touche F : outil Décalage", (await etat()).outil === "decalage");
const m = await ecran({ x: -1, y: 4, z: 0 });
await page.mouse.move(m.x, m.y, { steps: 3 }); await page.mouse.click(m.x, m.y);
await page.keyboard.type("0,5"); await page.keyboard.press("Enter");
const dec = await etat();
check("Décalage « 0,5 » : la face est divisée en un anneau et une face intérieure", dec.faces === 2, JSON.stringify(dec));
check("aucune requête POST vers /commands pendant la Planche (brouillon local)", commandesEmises.length === 0, commandesEmises.slice(0, 3).join(" | "));
check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await axe("mode Planche, outils de modification (desktop)");
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette des outils de modification : tout est vert.");
process.exit(echecs ? 1 : 0);
