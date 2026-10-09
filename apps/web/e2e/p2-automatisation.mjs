/**
 * Lot P2-8 — Automatisation P2 (cahier P2 §5 : « graphes visuels de génération contrôlée et règles par ontologie, même
 * boucle que le lot 8 ») : dans P.118 copié, graphe intégré « Trame de poteaux contrôlée » dessiné, règle du graphe non
 * tenue → proposition échouée nommée (rien d'écrit) ; paramètres corrigés → proposition (essai, hypothèses, aperçu) →
 * accord → poteaux posés ; graphe composé dans l'éditeur visuel (paramètre → série → commande, liens), déposé dans le
 * projet, proposé ; règle par ontologie sur les murs : problèmes rattachés aux murs non tenus, levés quand un mur change,
 * rien corrigé ; un seul écran ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-automatisation.mjs
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
let echecs = 0;
const check = (nom, ok, detail = "") => { console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`); if (!ok) echecs += 1; };
const mesures = [];
const mesurer = async (nom, fn) => { const t0 = Date.now(); const r = await fn(); const ms = Date.now() - t0; mesures.push([nom, ms]); console.log(`⏱ ${nom} : ${ms} ms`); return r; };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 } });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d) => { const r = await page.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); const text = await r.text().catch(() => ""); let body = null; try { body = JSON.parse(text); } catch { body = null; } return { status: r.status(), body, text }; };
const navigations = [];
page.on("framenavigated", (f) => { if (f === page.mainFrame()) navigations.push(f.url()); });

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `p2-automatisation-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "automatisation-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-A" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const message = async () => { await page.waitForSelector(".automatisation .ver-info, .automatisation .ver-erreur", { timeout: 30000 }).catch(() => {}); return (await page.locator(".automatisation .ver-info, .automatisation .ver-erreur").first().textContent().catch(() => "")) ?? ""; };
const classe = (mod, c) => Object.values(mod.objets).filter((o) => o.classe === c);

// 1. P.118-A : panneau d'automatisation ouvert, graphes présents.
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0;
const m0 = await modele();
const r0 = m0.revision;
const niveau = Object.values(m0.modele.niveaux).find((x) => x.elevation === 0) ?? Object.values(m0.modele.niveaux).sort((a, b) => a.ordre - b.ordre)[0];
await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click();
await page.waitForTimeout(300);
await page.locator(".automatisation > summary").click();
await page.locator(".automatisation").scrollIntoViewIfNeeded();
await page.waitForSelector('[data-graphe="choix"]', { timeout: 30000 });
const options = await page.locator('[data-graphe="choix"] option').allTextContents();
check("graphes de génération listés : « Trame de poteaux contrôlée » et « Ossature bois d'un mur » (intégrés)", options.some((o) => /Trame de poteaux contrôlée/.test(o)) && options.some((o) => /Ossature bois/.test(o)), options.join(" | "));
await page.locator('[data-graphe="choix"]').selectOption("trame-poteaux-controlee");
const noeuds = await page.locator(".graphes .graphe-vue [data-graphe-noeud]").count();
const liens = await page.locator(".graphes .graphe-vue [data-graphe-lien]").count();
check("graphe dessiné : 17 nœuds (paramètres, calculs, règles, séries, commande) et 22 liens", noeuds === 17 && liens === 22, `${noeuds} nœuds, ${liens} liens`);
await page.locator('.graphes .graphe-vue [data-graphe-noeud="r-section"]').click();
check("nœud de règle choisi : son message est lu dans le détail", /section d'un poteau doit rester inférieure au pas en x/.test((await page.locator("[data-graphe-detail]").textContent()) ?? ""));
await page.screenshot({ path: `${OUT}/p2-automatisation-graphe.png` });

// 2. Règle du graphe non tenue : proposition échouée nommée, rien d'écrit.
await page.locator('[data-graphe-parametre="niveauId"]').selectOption(niveau.id);
for (const [k, v] of Object.entries({ nx: "2", ny: "2", px: "0,2", py: "5", ox: "300", oy: "300", section: "0,3", hauteur: "3" })) await page.locator(`[data-graphe-parametre="${k}"]`).fill(v);
await page.locator('[data-graphe="proposer"]').click();
await page.waitForSelector('.auto-proposition[data-statut="echouee"]', { timeout: 60000 });
const texteRefus = (await page.locator(".auto-proposition").textContent()) ?? "";
check("règle « section < pas » non tenue : proposition échouée nommée, aucune commande, rien à accepter, révision inchangée", /section d'un poteau doit rester inférieure au pas en x/.test(texteRefus) && (await page.locator('.auto-proposition button:has-text("Accepter")').count()) === 0 && (await modele()).revision === r0, texteRefus.slice(0, 200));

// 3. Paramètres corrigés : proposition par la même boucle, hypothèses (calculs), aperçu ; accord → poteaux.
await page.locator('[data-graphe-parametre="px"]').fill("4");
await mesurer("proposition d'un graphe (compilation, règles, essai à blanc, aperçu)", async () => {
  await page.locator('[data-graphe="proposer"]').click();
  await page.waitForSelector('.auto-proposition[data-statut="proposee"]', { timeout: 60000 });
});
const texteProp = (await page.locator(".auto-proposition").textContent()) ?? "";
check("proposition du graphe : statut proposé, « graphe de génération », 4 commandes, 3 règles tenues, hypothèses « emprise = 20 » et « nombre = 4 », essai 1 valide, aperçu 4 créations", /Proposée — en attente de votre accord/.test(texteProp) && /graphe de génération/.test(texteProp) && /4 commande\(s\), 3 règle\(s\) tenue\(s\)/.test(texteProp) && /emprise = 20/.test(texteProp) && /nombre = 4/.test(texteProp) && /Essai 1 : 4 commande\(s\), valide/.test(texteProp) && /4 création\(s\)/.test(texteProp), texteProp.slice(0, 300));
check("rien n'est écrit avant l'accord", (await modele()).revision === r0);
await page.locator(".auto-proposition").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/p2-automatisation-proposition.png` });
await page.locator('.auto-proposition button:has-text("Accepter et exécuter")').click();
await page.waitForFunction(() => /Proposition exécutée/.test(document.querySelector(".automatisation .ver-info")?.textContent ?? ""), null, { timeout: 30000 }).catch(() => {});
let mod = (await modele()).modele;
const poteaux = classe(mod, "poteau").filter((o) => o.params.point.x >= 300);
check("accord → exécution validée : 4 poteaux posés par les commandes ordinaires, hauteur saisie 3 m, noms de la trame", poteaux.length === 4 && poteaux.every((o) => o.params.hauteur.value === 3 && /^Poteau \d-\d$/.test(o.params.nom ?? "")), `${poteaux.length} poteaux`);
const journal = (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees;
check("journal : « Assistant : Graphe « Trame de poteaux contrôlée » v1 »", journal.at(-1)?.label === "Assistant : Graphe « Trame de poteaux contrôlée » v1", journal.at(-1)?.label);

// 4. Éditeur visuel : paramètre → série → commande, reliés ; validé à mesure ; déposé dans le projet ; proposé.
await page.locator(".graphe-editeur > summary").click();
await page.locator('[data-gediteur="id"]').fill("reperes-ligne");
await page.locator('[data-gediteur="nom"]').fill("Repères en ligne");
await page.locator('[data-gediteur-ajouter="parametre"]').click();
await page.locator('[data-gediteur-noeud="parametre-1"] [data-gediteur-champ="nom"]').fill("nb");
await page.locator('[data-gediteur-noeud="parametre-1"] [data-gediteur-champ="typeParametre"]').selectOption("entier");
await page.locator('[data-gediteur-noeud="parametre-1"] [data-gediteur-champ="defaut"]').fill("3");
await page.locator('[data-gediteur-ajouter="serie"]').click();
await page.locator('[data-gediteur-noeud="serie-2"] [data-gediteur-champ="de"]').fill("1");
await page.locator('[data-gediteur-noeud="serie-2"] [data-gediteur-champ="a"]').fill("nb");
await page.locator('[data-gediteur-ajouter="commande"]').click();
await page.locator('[data-gediteur-noeud="commande-3"] [data-gediteur-champ="commande"]').fill(JSON.stringify({ type: "texte.creer", params: { niveauId: niveau.id, position: { x: "=320 + i * 2", y: 320, frame: "local", unit: "m" }, texte: "Repère {i}" } }));
const verdictAvant = (await page.locator("[data-gediteur-verdict]").textContent()) ?? "";
check("sans lien, le graphe est refusé nommément : la variable « nb » n'est pas reliée à la série", /« nb » \(nœud parametre-1\) non reliée au nœud serie-2/.test(verdictAvant), verdictAvant);
const relier = async (de, a) => { await page.locator('[data-gediteur="lien-de"]').selectOption(de); await page.locator('[data-gediteur="lien-a"]').selectOption(a); await page.locator('[data-gediteur="relier"]').click(); };
await relier("parametre-1", "serie-2");
await relier("serie-2", "commande-3");
await page.waitForSelector('[data-gediteur-verdict="valide"]', { timeout: 10000 }).catch(() => {});
const verdict = (await page.locator("[data-gediteur-verdict]").textContent()) ?? "";
check("éditeur visuel : graphe valide à mesure (3 nœuds, 2 liens, 3 commandes avec les valeurs par défaut)", /Graphe valide : 3 nœud\(s\), 2 lien\(s\) ; 3 commande\(s\)/.test(verdict), verdict);
check("le graphe composé est dessiné dans l'éditeur (3 nœuds, 2 liens)", (await page.locator(".graphe-editeur .graphe-vue [data-graphe-noeud]").count()) === 3 && (await page.locator(".graphe-editeur .graphe-vue [data-graphe-lien]").count()) === 2);
await page.screenshot({ path: `${OUT}/p2-automatisation-editeur.png` });
await page.locator('[data-gediteur="enregistrer"]').click();
await enregistre();
mod = (await modele()).modele;
check("graphe déposé dans le projet : définition « graphe » versionnée avec le modèle (version 1), listée avec la mention (projet)", mod.definitions["reperes-ligne"]?.classe === "graphe" && mod.definitions["reperes-ligne"]?.version === 1 && (await page.locator('[data-graphe="choix"] option', { hasText: "Repères en ligne" }).count()) === 1);
await page.locator('[data-graphe="choix"]').selectOption("reperes-ligne");
await page.locator('[data-graphe-parametre="nb"]').fill("2");
await page.locator('[data-graphe="proposer"]').click();
await page.waitForFunction(() => /Repères en ligne/.test(document.querySelector(".auto-proposition")?.textContent ?? "") && document.querySelector(".auto-proposition")?.getAttribute("data-statut") === "proposee", null, { timeout: 60000 }).catch(() => {});
check("graphe du projet proposé par la même boucle : 2 commandes texte.creer", /2 commande\(s\)/.test((await page.locator(".auto-proposition").textContent()) ?? "") && (await page.locator('.auto-proposition[data-statut="proposee"]').count()) === 1);

// 5. Règle par ontologie sur les murs : problèmes rattachés, levés quand un mur change, rien corrigé.
const murs = classe(mod, "mur");
const epaisseurs = murs.map((w) => w.params.epaisseur.value);
const seuil = 0.3;
const attendus = murs.filter((w) => w.params.epaisseur.value < seuil);
await page.locator('[data-regle-onto="nom"]').fill("Épaisseur minimale des murs (programme P.118, déclaré)");
await page.locator('[data-regle-onto="classe"]').selectOption("mur");
await page.locator('[data-regle-onto="expression"]').fill(`epaisseur >= ${seuil}`);
await page.locator('[data-regle-onto="message"]').fill("mur plus mince que le minimum du programme");
check("variables lisibles de la classe proposées à la saisie (epaisseur, hauteur, niveau_elevation…)", /epaisseur/.test((await page.locator(".regles-form .nav-detail").first().textContent()) ?? ""));
await page.locator('[data-regle-onto="definir"]').click();
await enregistre();
mod = (await modele()).modele;
const regleId = Object.values(mod.definitions).find((d) => d.classe === "regle")?.id;
const pbs = Object.values(mod.problemes).filter((p) => p.type === "regle" && p.objetId);
check(`règle sur la classe mur : ${attendus.length} mur(s) plus mince(s) que ${seuil} m signalé(s) comme problèmes « regle » rattachés à l'objet, aucun corrigé`, !!regleId && pbs.length === attendus.length && attendus.every((w) => pbs.some((p) => p.objetId === w.id)) && classe(mod, "mur").every((w, i) => w.params.epaisseur.value === epaisseurs[i]), `${pbs.length} problèmes pour ${attendus.length} murs (épaisseurs ${[...new Set(epaisseurs)].join(", ")})`);
check("la règle est listée avec son bilan", new RegExp(`${murs.length} objet\\(s\\), ${attendus.length} non tenu\\(s\\)`).test((await page.locator(`[data-regle-id="${regleId}"]`).textContent()) ?? ""));
const cible = attendus[0];
if (cible) {
  await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2a-ep-${Date.now()}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label: "Épaissir", commands: [{ type: "mur.modifier", params: { id: cible.id, params: { epaisseur: { value: seuil, unit: "m" } } } }] });
  await page.reload();
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  mod = (await modele()).modele;
  check("le mur épaissi n'est plus signalé ; les autres le restent (règle rejugée après chaque commande)", !Object.values(mod.problemes).some((p) => p.type === "regle" && p.objetId === cible.id) && Object.values(mod.problemes).filter((p) => p.type === "regle" && p.objetId).length === attendus.length - 1);
}
await page.locator(".atelier-n-onglets button, .barre-mode button").first().isVisible().catch(() => {});
const modifs = (await page.locator(".modifications").textContent().catch(() => "")) ?? "";
check("panneau Modifications : « Règle de conception non tenue » visible", /Règle de conception non tenue/.test(modifs) || attendus.length <= 1, modifs.slice(0, 120));
await page.screenshot({ path: `${OUT}/p2-automatisation-regles.png` });

// 6. Un seul écran, un seul journal ; téléphone ; axe-core.
check("un seul écran : aucune navigation hors de l'Atelier", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : proposition acceptée, graphe déposé, règle définie sont des révisions successives", (await modele()).revision >= r0 + 3);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.locator(".automatisation > summary").click().catch(() => {});
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-automatisation-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

console.log(JSON.stringify({ mesures }));
await browser.close();
console.log(echecs ? `Lot P2-8 automatisation : ${echecs} contrôle(s) en échec` : "Lot P2-8 automatisation : tout est vert");
process.exit(echecs ? 1 : 0);
