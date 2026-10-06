/**
 * Recette de la disposition « Canevas » (D-156 et suivantes ; ergonomie de référence SketchUp pour le Web) sur
 * desktop et en émulation mobile : canevas plein écran, barre d'outils flottante, outils étendus, panneaux flottants
 * exclusifs sans redimensionner le dessin, Instructeur, champ Mesures, Échap vers l'outil précédent ; réglages de
 * navigation (D-157) ; outils de vue, rapporteur et raccourcis (D-158) ;
 * panneaux Affichage, Info modèle, Matériaux, arborescence et ombres (D-159) ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-canevas.mjs
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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));
page.on("dialog", (d) => void d.accept());

const api = async (methode, chemin, data, p = page) => {
  const r = await p.request[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const modele = async (pid) => (await api("get", `/projects/${pid}/atelier/model`)).body;
const attendreEnregistre = (p = page) => p.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const ouvrir = async (pid, p = page) => {
  await p.goto(`${BASE}/projets/${pid}?module=atelier`);
  await p.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await attendreEnregistre(p);
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

const email = `canevas-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "canevas-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · canevas" })).body.id;

// 1. Disposition Canevas : le dessin occupe toute la zone ; les panneaux flottent sans le redimensionner.
await ouvrir(pid);
const avant = await boite(".atelier-n-travail");
await page.locator("[data-disposition-canevas]").click();
await page.waitForSelector(".atelier-n.disposition-canevas");
const travail = await boite(".atelier-n-travail");
const racine = await boite(".atelier-n");
check("canevas : la zone de dessin s'élargit à toute la largeur de l'Atelier", travail.width > avant.width + 200 && travail.width >= racine.width - 4, `${Math.round(avant.width)} → ${Math.round(travail.width)} / ${Math.round(racine.width)}`);
const outils = await boite(".atelier-n-outils");
check("canevas : barre d'outils verticale flottante à gauche, par-dessus le dessin", outils.x < travail.x + 40 && outils.height > outils.width && outils.y >= travail.y, JSON.stringify(outils));
await page.locator('[data-panneau-icone="outliner"]').click();
const apresPanneau = await boite(".atelier-n-travail");
check("panneau flottant ouvert : le dessin n'est pas redimensionné", Math.abs(apresPanneau.width - travail.width) < 1 && Math.abs(apresPanneau.height - travail.height) < 1, `${Math.round(apresPanneau.width)}×${Math.round(apresPanneau.height)}`);
check("Navigateur ouvert en panneau flottant", await page.locator(".atelier-n-gauche").isVisible());
await page.locator('[data-panneau-icone="instructeur"]').click();
const exclusifs = (await page.locator(".atelier-n-gauche").isVisible()) === false && (await page.locator('[data-panneau-flottant="instructeur"]').isVisible());
check("panneaux exclusifs : ouvrir l'Instructeur ferme le Navigateur", exclusifs);
check("Instructeur : outil actif « Sélection » expliqué en étapes", ((await page.locator("[data-instructeur]").textContent()) ?? "").includes("Sélection") && (await page.locator("[data-instructeur] ol li").count()) >= 2);
await page.screenshot({ path: `${OUT}/canevas-instructeur.png` });

// 2. Outils étendus en grille ; Échap la ferme.
await page.locator("[data-outils-etendus]").click();
check("outils étendus : grille ouverte", await page.locator("[data-grille-outils]").isVisible());
await page.keyboard.press("Escape");
check("outils étendus : fermés par Échap", !(await page.locator("[data-grille-outils]").isVisible().catch(() => false)));

// 3. Tracer un mur avec le champ Mesures (valeur exacte) ; l'Instructeur suit l'outil.
const avantMurs = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur").length;
await page.locator('.atelier-n-outils .outil:has-text("Mur")').first().click();
check("Instructeur : suit l'outil choisi (Mur)", ((await page.locator("[data-instructeur]").textContent()) ?? "").includes("Mur"));
check("champ Mesures toujours visible en Canevas", await page.locator("#saisie-precision").isVisible());
await page.locator('[data-panneau-icone="instructeur"]').click();
const plan = await boite(".plan2d");
const x0 = plan.x + plan.width * 0.35;
const y0 = plan.y + plan.height * 0.85;
await page.mouse.click(x0, y0);
await page.mouse.move(x0 + 120, y0);
await page.keyboard.type("5");
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
let murs = avantMurs;
for (let k = 0; k < 20 && murs === avantMurs; k++) {
  murs = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur").length;
  if (murs === avantMurs) await page.waitForTimeout(500);
}
const nouveau = Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "mur").sort((a, b) => (a.id < b.id ? 1 : -1)).find((o) => Math.abs(Math.hypot(o.params.b.x - o.params.a.x, o.params.b.y - o.params.a.y) - 5) < 1e-6);
check("mur tracé avec une longueur exacte de 5,00 m saisie au champ Mesures", murs === avantMurs + 1 && !!nouveau, `${avantMurs} → ${murs}`);

// 4. Échap revient à l'outil précédent (Canevas).
await page.locator('.atelier-n-outils .outil:has-text("Porte")').first().click();
await page.locator('.atelier-n-outils .outil:has-text("Mur")').first().click();
await page.keyboard.press("Escape");
check("Échap sans tracé en cours : retour à l'outil précédent (Porte)", ((await page.locator(".atelier-n-outils .outil.est-actif").textContent()) ?? "").includes("Porte"));
await page.keyboard.press("Escape");

// 5. Barre d'outils repliable.
await page.locator("[data-replier-outils]").click();
const repliee = await boite(".atelier-n-outils");
check("barre d'outils repliée : seuls le bouton de repli et l'outil actif restent", repliee.height < outils.height / 2, `${Math.round(outils.height)} → ${Math.round(repliee.height)}`);
await page.locator("[data-replier-outils]").click();

// 5 bis. Navigation configurable (D-157) : sensibilité, inversion, trackpad, 3D (molette maintenue = orbite).
await page.keyboard.press("Escape");
await page.locator('[data-panneau-icone="navigation"]').click();
check("panneau Navigation ouvert", await page.locator("[data-nav-reglages]").isVisible());
const centre = async () => { const b = await boite(".plan2d"); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
const dessin = () => boite(".plan2d .plan-objets");
const c2 = await centre();
await page.mouse.move(c2.x, c2.y);
const molette = async (dx, dy) => { await page.mouse.move(c2.x, c2.y); const a = await dessin(); await page.mouse.wheel(dx, dy); await page.waitForTimeout(150); const b = await dessin(); return { a, b, k: b.width / a.width }; };
const z1 = await molette(0, -100);
await molette(0, 100);
await page.locator('[data-nav-sensibilite="sensibiliteZoom"]').fill("1");
const z2 = await molette(0, -100);
await molette(0, 200);
check("sensibilité du zoom ×2 : le zoom double en logarithme", Math.abs(Math.log(z2.k) / Math.log(z1.k) - 2) < 0.15, `${z1.k.toFixed(3)} → ${z2.k.toFixed(3)}`);
await page.locator('[data-nav-inverser="zoom"]').check();
const z3 = await molette(0, -100);
check("zoom inversé : la molette vers le haut éloigne", z3.k < 1 && z1.k > 1, z3.k.toFixed(3));
await page.locator("[data-nav-reinitialiser]").click();
check("Réinitialiser tout : réglages par défaut", !(await page.locator('[data-nav-inverser="zoom"]').isChecked()) && (await page.locator('[data-nav-sensibilite="sensibiliteZoom"]').inputValue()) === "0");
await page.locator("[data-nav-peripherique-rapide]").selectOption("trackpad");
check("barre inférieure : périphérique Trackpad repris dans le panneau", await page.locator('[data-nav-peripherique="trackpad"]').isChecked());
const p1 = await molette(30, 40);
check("trackpad : deux doigts = panoramique (pas de zoom)", Math.abs(p1.k - 1) < 0.01 && Math.abs(p1.b.x - p1.a.x + 30) < 2 && Math.abs(p1.b.y - p1.a.y + 40) < 2, `dx ${Math.round(p1.b.x - p1.a.x)} dy ${Math.round(p1.b.y - p1.a.y)}`);
await page.keyboard.down("Control");
const p2 = await molette(0, -20);
await page.keyboard.up("Control");
check("trackpad : pincement (Ctrl + molette) = zoom", p2.k > 1.05, p2.k.toFixed(3));
const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem("fadi.atelier.prefs") ?? "{}").navigation ?? null);
check("réglages de navigation enregistrés sur l'appareil", prefs?.peripherique === "trackpad");
await page.locator('.barre-mode button:has-text("3D")').click();
await page.waitForSelector(".vue3d canvas", { timeout: 30000 });
await page.waitForFunction(() => !!window.fadiMesures3D?.pointDeVue, null, { timeout: 20000 });
await page.waitForTimeout(500);
const c3 = await boite(".vue3d-canevas");
await page.mouse.move(c3.x + c3.width / 2, c3.y + c3.height / 2);
const vue = () => page.evaluate(() => window.fadiMesures3D.pointDeVue());
const ecart = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
let v0 = await vue();
await page.mouse.wheel(60, 0);
await page.waitForTimeout(150);
let v1 = await vue();
check("3D trackpad : deux doigts = orbite (la cible reste, la caméra tourne)", ecart(v0.cible, v1.cible) < 1e-3 && ecart(v0.position, v1.position) > 0.1);
await page.keyboard.down("Shift");
await page.mouse.wheel(60, 0);
await page.keyboard.up("Shift");
await page.waitForTimeout(150);
const v2 = await vue();
check("3D trackpad : Maj + deux doigts = panoramique (la cible se déplace)", ecart(v1.cible, v2.cible) > 0.05);
await page.locator("[data-nav-peripherique-rapide]").selectOption("souris");
v0 = await vue();
await page.mouse.down({ button: "middle" });
for (let k = 1; k <= 8; k++) await page.mouse.move(c3.x + c3.width / 2 + k * 10, c3.y + c3.height / 2);
await page.mouse.up({ button: "middle" });
v1 = await vue();
check("3D souris : molette maintenue = orbite", ecart(v0.cible, v1.cible) < 1e-3 && ecart(v0.position, v1.position) > 0.1);
await page.keyboard.down("Shift");
await page.mouse.down({ button: "middle" });
for (let k = 1; k <= 8; k++) await page.mouse.move(c3.x + c3.width / 2 + 80 - k * 10, c3.y + c3.height / 2 + k * 5);
await page.mouse.up({ button: "middle" });
await page.keyboard.up("Shift");
const v3 = await vue();
check("3D souris : Maj + molette maintenue = panoramique", ecart(v1.cible, v3.cible) > 0.05);
await page.screenshot({ path: `${OUT}/canevas-navigation.png` });
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.waitForSelector(".plan2d .plan-objets [data-objet]");

// 5 ter. Outils de vue et de saisie (D-158) : raccourcis configurables, Rapporteur, Zoom, Zoom étendu, Panoramique.
await page.locator('[data-panneau-icone="raccourcis"]').click();
await page.locator("[data-raccourcis-filtre]").fill("rapp");
await page.locator('[data-raccourci-outil="rapporteur"]').press("j");
check("raccourci J affecté au Rapporteur", (await page.locator('[data-raccourci-outil="rapporteur"]').inputValue()) === "J");
await page.locator("[data-raccourcis-filtre]").fill("");
await page.locator('[data-raccourci-outil="mesurer"]').press("j");
check("touche déjà prise : retirée de l'autre outil et dit à l'écran", ((await page.locator("[data-raccourcis-message]").textContent()) ?? "").includes("retirée de Rapporteur") && (await page.locator('[data-raccourci-outil="rapporteur"]').inputValue()) === "");
await page.locator('[data-raccourci-outil="mesurer"]').press("Backspace");
await page.locator('[data-raccourci-outil="rapporteur"]').press("j");
await page.locator('[data-raccourci-outil="mesurer"]').press("1");
check("touche réservée refusée avec son motif", ((await page.locator("[data-raccourcis-message]").textContent()) ?? "").startsWith("Touche refusée"));
await page.locator('[data-panneau-icone="raccourcis"]').click();
await page.mouse.click(c2.x, c2.y - 200);
await page.keyboard.press("Escape");
await page.keyboard.press("j");
const outilActif = () => page.locator(".atelier-n").getAttribute("data-outil-actif");
check("la touche personnalisée choisit l'outil (Rapporteur)", (await outilActif()) === "rapporteur");
const constructions = async () => Object.values((await modele(pid)).modele.objets).filter((o) => o.classe === "esquisse" && o.params.forme === "construction").length;
const avantConstr = await constructions();
await page.mouse.click(c2.x - 150, c2.y + 120);
await page.mouse.click(c2.x - 50, c2.y + 120);
await page.mouse.move(c2.x - 100, c2.y + 60);
await page.keyboard.type("30");
await page.keyboard.press("Enter");
let apresConstr = avantConstr;
for (let k = 0; k < 20 && apresConstr === avantConstr; k++) {
  apresConstr = await constructions();
  if (apresConstr === avantConstr) await page.waitForTimeout(500);
}
const etatBas = (await page.locator(".atelier-n-etat").textContent()) ?? "";
// La référence suit les accrochages (pas forcément horizontale) : l'angle affiché est celui saisi, la ligne est posée.
check("Rapporteur : angle saisi (30°) → angle affiché et ligne de construction posée", apresConstr === avantConstr + 1 && etatBas.includes("30,00°"), `${avantConstr} → ${apresConstr}`);
await page.keyboard.press("Escape");
const ouvrirPalette = async (mot) => { await page.keyboard.press("Control+k"); await page.keyboard.type(mot); await page.keyboard.press("Enter"); };
await ouvrirPalette("loupe");
check("outil Zoom choisi depuis la palette", (await outilActif()) === "zoom");
let d0 = await dessin();
await page.mouse.click(c2.x, c2.y);
let d1 = await dessin();
check("Zoom : clic = rapprocher × 2", Math.abs(d1.width / d0.width - 2) < 0.1, (d1.width / d0.width).toFixed(3));
await page.keyboard.down("Shift");
await page.mouse.click(c2.x, c2.y);
await page.keyboard.up("Shift");
d1 = await dessin();
check("Zoom : Maj + clic = éloigner", Math.abs(d1.width / d0.width - 1) < 0.05, (d1.width / d0.width).toFixed(3));
await page.mouse.move(c2.x - 60, c2.y - 40);
await page.mouse.down();
await page.mouse.move(c2.x, c2.y, { steps: 4 });
await page.mouse.move(c2.x + 60, c2.y + 40, { steps: 4 });
await page.mouse.up();
d1 = await dessin();
check("Zoom : glisser un cadre = zoom sur le cadre", d1.width / d0.width > 3, (d1.width / d0.width).toFixed(2));
await ouvrirPalette("zoom extents");
await page.waitForTimeout(150);
d1 = await dessin();
const zoneTravail = await boite(".plan2d");
check("Zoom étendu : tout le niveau tient dans la vue", d1.width <= zoneTravail.width + 1 && d1.height <= zoneTravail.height + 1 && d1.width > zoneTravail.width * 0.3, `${Math.round(d1.width)}×${Math.round(d1.height)}`);
await page.keyboard.press("h");
check("Panoramique : touche H", (await outilActif()) === "naviguer");
d0 = await dessin();
await page.mouse.move(c2.x, c2.y);
await page.mouse.down();
await page.mouse.move(c2.x + 80, c2.y + 30, { steps: 5 });
await page.mouse.up();
d1 = await dessin();
check("Panoramique : glisser déplace la vue sans zoomer", Math.abs(d1.x - d0.x - 80) < 2 && Math.abs(d1.y - d0.y - 30) < 2 && Math.abs(d1.width - d0.width) < 1);
check("infobulle d'outil : raccourci affiché (Mur, M)", ((await page.locator('.atelier-n-outils .outil:has-text("Mur")').first().getAttribute("title")) ?? "").startsWith("Mur (M)"));
await page.keyboard.press("Escape");
await page.evaluate(() => { const p = JSON.parse(localStorage.getItem("fadi.atelier.prefs") ?? "{}"); return p.raccourcis; }).then((r) => check("raccourcis enregistrés sur l'appareil", r?.rapporteur === "j", JSON.stringify(r)));

// 5 quater. Panneaux Affichage, Info modèle, Matériaux, Arborescence, Ombres (D-159).
await page.locator('[data-panneau-icone="outliner"]').click();
await page.locator("[data-arborescence] > summary").click();
const objetsModele = (await modele(pid)).modele.objets;
const idArbre = (await page.locator(".plan2d .plan-objets [data-objet]").evaluateAll((els) => els.map((e) => e.getAttribute("data-objet")))).find((id) => objetsModele[id] && !objetsModele[id].groupeId && objetsModele[id].classe === "mur");
const oArbre = objetsModele[idArbre];
const noeud = page.locator(`[data-arbre-noeud="n:${oArbre.niveauId}"]`);
if (!(await noeud.evaluate((e) => e.parentElement.open))) await noeud.click();
await page.locator(`[data-arbre-noeud="n:${oArbre.niveauId}/c:${oArbre.classe}"]`).click();
const premierArbre = page.locator(`[data-arbre-objet="${idArbre}"]`);
await premierArbre.click();
check("Arborescence : clic = sélection de l'objet", (await premierArbre.getAttribute("aria-pressed")) === "true");
await page.locator('[data-panneau-icone="affichage"]').click();
const surPlan = () => page.locator(`.plan2d [data-objet="${idArbre}"]`).count();
const avantMasque = await surPlan();
await page.locator("[data-masquer-selection]").click();
check("Masquer la sélection : l'objet sort du plan (pour soi)", avantMasque > 0 && (await surPlan()) === 0, `${avantMasque} → ${await surPlan()}`);
check("masquage local : le modèle n'est pas modifié", !!(await modele(pid)).modele.objets[idArbre]);
await page.locator("[data-reafficher-dernier]").click();
check("Réafficher le dernier : l'objet revient", (await surPlan()) === avantMasque);
await page.locator('[data-panneau-icone="outliner"]').click();
await page.locator(`[data-arbre-objet="${idArbre}"]`).click();
await page.locator('[data-panneau-icone="affichage"]').click();
await page.locator("[data-masquer-selection]").click();
await page.locator("[data-reafficher-tout]").click();
check("Réafficher tout", (await surPlan()) === avantMasque && (await page.locator("[data-masques]").getAttribute("data-masques")) === "0");
await page.locator('[data-panneau-icone="modele"]').click();
const nbObjets = Object.keys((await modele(pid)).modele.objets).length;
check("Info modèle : nombre d'objets du modèle", ((await page.locator("[data-info-objets]").textContent()) ?? "").replace(/\s/g, "") === String(nbObjets), `${await page.locator("[data-info-objets]").textContent()} / ${nbObjets}`);
check("Info modèle : niveaux listés", (await page.locator("[data-info-niveaux] tbody tr").count()) === Object.keys((await modele(pid)).modele.niveaux).length);
await page.locator('[data-panneau-icone="materiaux"]').click();
check("Matériaux : panneau en lecture (compositions ou « non renseigné »)", await page.locator("[data-materiaux]").isVisible() && (await page.locator("[data-murs-sans-composition]").count()) === 1);
await page.screenshot({ path: `${OUT}/canevas-materiaux.png` });
await page.locator('[data-panneau-icone="affichage"]').click();
await page.locator("[data-ombres]").check();
await page.locator('.barre-mode button:has-text("3D")').click();
await page.waitForFunction(() => window.fadiMesures3D?.ombres?.actives === true, null, { timeout: 20000 }).catch(() => {});
const ombres = await page.evaluate(() => window.fadiMesures3D?.ombres ?? null);
check("Ombres en 3D : activées, portées par la maquette", ombres?.actives === true && ombres.portees > 0, JSON.stringify(ombres));
await page.screenshot({ path: `${OUT}/canevas-ombres.png` });
await page.locator("[data-ombres]").uncheck();
await page.waitForFunction(() => window.fadiMesures3D?.ombres?.actives === false, null, { timeout: 10000 }).catch(() => {});
check("Ombres désactivées", (await page.evaluate(() => window.fadiMesures3D?.ombres?.actives)) === false);
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.waitForSelector(".plan2d .plan-objets [data-objet]");
await axe("disposition Canevas (desktop)");

// 6. Mobile (390 × 844, tactile) : panneau en surcouche, barre d'outils toujours accessible.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await ctx.storageState() });
const tel = await mobile.newPage();
tel.on("pageerror", (e) => erreursPage.push(e.message));
await ouvrir(pid, tel);
check("mobile : préférence Canevas conservée sur l'appareil (stockage local)", await tel.locator(".atelier-n.disposition-canevas").count() === 1);
await tel.locator('[data-panneau-icone="outliner"]').tap();
const panneauTel = await boite(".atelier-n-gauche", tel);
const outilsTel = await boite(".atelier-n-outils", tel);
check("mobile : le panneau ouvert laisse la barre d'outils accessible", panneauTel.x >= outilsTel.x + outilsTel.width - 1, `panneau x ${Math.round(panneauTel.x)} · outils ${Math.round(outilsTel.x + outilsTel.width)}`);
const petites = await tel.locator(".atelier-n-outils .outil:visible, .canevas-colonne .canevas-icone").evaluateAll((els) => els.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).length);
check("mobile : cibles des outils et des panneaux d'au moins 44 px", petites === 0, `${petites} trop petite(s)`);
await tel.screenshot({ path: `${OUT}/canevas-mobile.png` });
await axe("disposition Canevas (mobile)", tel);
await mobile.close();

// Retour à la disposition classique (préférence locale).
await page.locator("[data-disposition-canevas]").click();
check("retour à la disposition classique", await page.locator(".atelier-n.disposition-classique").count() === 1);
check("aucune erreur JavaScript dans la page", erreursPage.length === 0, erreursPage.slice(0, 3).join(" | "));
await browser.close();
console.log(echecs ? `\n${echecs} échec(s)` : "\nRecette Canevas : tout est vert.");
process.exit(echecs ? 1 : 0);
