/**
 * Recette de la disposition « Canevas » (D-156 et suivantes ; ergonomie de référence SketchUp pour le Web) sur
 * desktop et en émulation mobile : canevas plein écran, barre d'outils flottante, outils étendus, panneaux flottants
 * exclusifs sans redimensionner le dessin, Instructeur, champ Mesures, Échap vers l'outil précédent ; axe-core.
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
