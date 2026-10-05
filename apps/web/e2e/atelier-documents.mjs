/**
 * Recette du lot 5 (documents dérivés, quantités, objets reportés) dans un vrai navigateur :
 * cote associative rattachée puis « à réparer » après scission du mur, toiture bipente, garde-corps, contrainte
 * d'esquisse, bloc créé puis placé, phase « à démolir » ; mode Documents : vues (plan, façade), feuille A1 avec
 * deux vues, PDF produit au catalogue à la révision courante, périmé après une commande ; tableaux et CSV.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-documents.mjs
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
const mesures = [];
const mesurer = async (nom, fn) => {
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  mesures.push([nom, ms]);
  console.log(`⏱ ${nom} : ${ms} ms`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));

async function axe(nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(".atelier-n") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
/** Révision affichée par la barre ; `enregistre()` attend la révision suivante, enregistrée sur le serveur (un lot par geste). */
let derniere = 0;
const revisionAffichee = () => page.evaluate(() => {
  const t = document.querySelector(".barre-sync")?.textContent ?? "";
  const m = /^Enregistré · r(\d+)/.exec(t);
  return m ? Number(m[1]) : -1;
});
const enregistre = async () => {
  await page.waitForFunction((r0) => {
    const m = /^Enregistré · r(\d+)/.exec(document.querySelector(".barre-sync")?.textContent ?? "");
    return !!m && Number(m[1]) > r0;
  }, derniere, { timeout: 20000 }).catch(async (err) => {
    console.log("diagnostic enregistrement :", derniere, await page.locator(".barre-sync").textContent(), "|", await page.locator(".atelier-n-etat").textContent());
    await page.screenshot({ path: `${OUT}/echec-enregistrement.png` });
    throw err;
  });
  derniere = await revisionAffichee();
};
const outil = async (nom) => {
  // Échap deux fois : fin de l'outil courant, puis sélection vidée (l'inspecteur montre les paramètres de l'outil).
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.locator(".saisie-precision").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  await page.locator(".barre-palette").click();
  await page.locator(".palette-champ").fill(nom);
  await page.keyboard.press("Enter");
  await page.locator(".palette-champ").waitFor({ state: "detached", timeout: 5000 });
};
const modele = async () => (await (await page.request.get(`${BASE}/projects/${pid()}/atelier/model`)).json()).modele;
let url = "";
/** Attend qu'un objet satisfaisant `f` existe sur le serveur (le lot peut être encore en file). */
const attendreObjet = async (f, nom) => {
  for (let k = 0; k < 40; k++) {
    const o = Object.values((await modele()).objets).find(f);
    if (o) return o;
    await page.waitForTimeout(250);
  }
  console.log(`diagnostic ${nom} :`, await page.locator(".atelier-n-etat").textContent(), await page.locator(".inspecteur h3").first().textContent().catch(() => "-"));
  await page.screenshot({ path: `${OUT}/echec-${nom}.png` });
  return undefined;
};
const pid = () => url.split("/").pop();

// Compte, exemple, copie de travail par un premier niveau d'essai.
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `docs-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "documents-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
await page.goto(`${BASE}/projets`);
await page.locator('.example-card button:has-text("Importer")').first().click();
await page.waitForURL(/\/projets\/proj_/, { timeout: 60000 });
const reference = page.url().split("?")[0];
await page.goto(`${reference}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.locator(".nav-ajout").click();
await page.locator(".navigateur .nav-formulaire input").first().fill("Essai lot 5");
await page.locator(".navigateur .nav-formulaire input").nth(1).fill("30");
await page.locator('.navigateur .nav-formulaire button[type="submit"]').click();
await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().startsWith(reference), { timeout: 30000 });
url = page.url().split("?")[0];
await page.waitForFunction(() => [...document.querySelectorAll(".nav-niveaux li")].some((e) => e.textContent.includes("Essai lot 5")), null, { timeout: 30000 });
await page.locator('.nav-niveaux button:has-text("Essai lot 5")').click();
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 20000 });
derniere = await revisionAffichee();
await page.waitForTimeout(200);
const box = await page.locator(".plan2d").boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

// Mur de 6 m, puis cote rattachée à ses deux extrémités.
await page.keyboard.press("m");
await page.mouse.move(cx - 150, cy);
await page.mouse.click(cx - 150, cy);
await page.mouse.move(cx, cy);
await page.keyboard.type("6;0");
await page.keyboard.press("Enter");
await page.keyboard.press("Escape");
await enregistre();
const ext = await page.evaluate(() => {
  const m = document.querySelector(".plan2d [data-objet^='mur-'] path")?.getBoundingClientRect();
  return m ? { x0: m.left, x1: m.right, y: m.top + m.height / 2 } : null;
});
await outil("Cotation");
await page.mouse.click(ext.x0 + 1, ext.y);
await page.mouse.click(ext.x1 - 1, ext.y);
await page.mouse.click((ext.x0 + ext.x1) / 2, ext.y - 50);
await enregistre();
const rattachees = await page.locator(".plan2d .obj-cotation").getAttribute("data-rattachees");
check("cotation : posée sur les extrémités du mur, rattachée aux deux (cote associative)", rattachees === "2", `rattachées : ${rattachees}`);
await outil("Scinder");
await page.mouse.click((ext.x0 + ext.x1) / 2 + 20, ext.y);
await enregistre();
await page.waitForFunction(() => document.querySelectorAll(".plan2d [data-objet^='mur-']").length === 2, null, { timeout: 5000 }).catch(async () => {
  console.log("diagnostic scission :", await page.locator(".atelier-n-etat").textContent(), JSON.stringify(ext));
  await page.screenshot({ path: `${OUT}/echec-scission.png` });
});
check("scission du mur : deux murs, la cote passe « à réparer » (tracé rouge et libellé)", (await page.locator(".plan2d [data-objet^='mur-']").count()) === 2 && (await page.locator(".plan2d .cotation-a-reparer").count()) === 1 && /à réparer/.test(await page.locator(".plan2d .obj-cotation text").textContent()));

// Toiture bipente à 30°.
await outil("Toiture");
await page.locator("#outil-penteToiture").fill("30");
await page.mouse.click(cx + 120, cy + 120);
for (const s of ["6;0", "0;4", "-6;0"]) {
  await page.keyboard.type(s);
  await page.keyboard.press("Enter");
}
await page.keyboard.press("Enter");
await enregistre();
const toit = await attendreObjet((o) => o.classe === "toiture" && o.params.type === "bipente", "toiture");
check("toiture : bipente à 30° enregistrée, faîtage dessiné en plan", !!toit && toit.params.pente.value === 30 && (await page.locator(`.plan2d [data-objet="${toit?.id}"] path`).count()) === 2, toit ? `${toit.id} · ${toit.params.type} ${toit.params.pente?.value}°` : "absente");

// Garde-corps (hauteur de l'outil, saisie visible).
await outil("Garde-corps");
await page.mouse.click(cx - 150, cy + 120);
for (const s of ["3;0", "0;2"]) {
  await page.keyboard.type(s);
  await page.keyboard.press("Enter");
}
await page.keyboard.press("Enter");
await enregistre();
const gc = await attendreObjet((o) => o.classe === "garde-corps", "garde-corps");
check("garde-corps : trois points, hauteur saisie 1,00 m, dessiné en plan", !!gc && gc.params.points.length === 3 && gc.params.hauteur.value === 1 && (await page.locator(`.plan2d [data-objet="${gc?.id}"]`).count()) === 1);

// Esquisse contrainte : horizontal sur le premier segment.
await outil("Polyligne");
await page.mouse.click(cx + 120, cy - 150);
for (const s of ["3;0,5", "0;2"]) {
  await page.keyboard.type(s);
  await page.keyboard.press("Enter");
}
await page.keyboard.press("Enter");
await enregistre();
await page.keyboard.press("Escape");
const esq = await attendreObjet((o) => o.classe === "esquisse" && o.params.forme === "polyligne", "polyligne");
await page.locator(`.nav-objets button[data-objet="${esq.id}"]`).click();
await page.locator(".inspecteur-contraintes > summary").click();
await page.locator(".ajout-contrainte select").first().selectOption("horizontal");
await page.locator('.ajout-contrainte button:has-text("Ajouter la contrainte")').click();
await enregistre();
const esqApres = (await modele()).objets[esq.id];
check("contrainte « horizontal » : premier segment rendu horizontal, contrainte listée avec les degrés de liberté", Math.abs(esqApres.params.points[0].y - esqApres.params.points[1].y) < 1e-6 && (await page.locator(".liste-contraintes li").count()) === 1 && /degré\(s\) de liberté/.test(await page.locator(".inspecteur-contraintes > summary").textContent()), JSON.stringify(esqApres.params.points.slice(0, 2).map((p) => [p.x, p.y])));
// Angle (D-051) : 90° du premier au second segment, saisi dans l'inspecteur.
await page.locator(".ajout-contrainte select").first().selectOption("angle");
await page.locator(".ajout-contrainte select").nth(2).selectOption({ label: "2" });
await page.locator(".ajout-contrainte input").first().fill("90");
await page.locator('.ajout-contrainte button:has-text("Ajouter la contrainte")').click();
await enregistre();
const esqAngle = (await modele()).objets[esq.id].params.points;
const prodScal = (esqAngle[1].x - esqAngle[0].x) * (esqAngle[2].x - esqAngle[1].x) + (esqAngle[1].y - esqAngle[0].y) * (esqAngle[2].y - esqAngle[1].y);
check("contrainte « angle » 90° : second segment perpendiculaire au premier, deux contraintes listées", Math.abs(prodScal) < 1e-4 && (await page.locator(".liste-contraintes li").count()) === 2, JSON.stringify(esqAngle.map((p) => [p.x, p.y])));

// Bloc : depuis l'esquisse (remplacée par une occurrence), puis une seconde occurrence placée.
await page.locator(".inspecteur-bloc > summary").click();
await page.locator('.inspecteur-bloc input').first().fill("Banc");
await page.locator('.inspecteur-bloc button[type="submit"]').click();
await enregistre();
await outil("Placer un bloc");
await page.locator('input[name="definition-bloc"]').first().check();
await page.mouse.click(cx + 250, cy - 150);
await enregistre();
const m1 = await modele();
const occ = Object.values(m1.objets).filter((o) => o.classe === "bloc-occurrence");
check("bloc « Banc » : définition au catalogue, esquisse remplacée par une occurrence, seconde occurrence placée", Object.values(m1.definitions).some((d) => d.classe === "bloc" && d.nom === "Banc") && occ.length === 2 && !m1.objets[esq.id] && (await page.locator(".plan2d .obj-bloc").count()) === 2);

// Phase : le garde-corps passe « à démolir ».
await page.keyboard.press("Escape");
await page.locator(`.nav-objets button[data-objet="${gc.id}"]`).click();
await page.locator("#phase-objet").selectOption("a-demolir");
await enregistre();
check("phase : garde-corps « à démolir », dessiné en tirets", (await modele()).objets[gc.id].phase === "a-demolir" && (await page.locator('.plan2d [data-phase="a-demolir"]').count()) === 1);
await page.screenshot({ path: `${OUT}/5-objets-plan.png` });

// Mode Documents : vues du niveau d'essai et façade, feuille A1.
await page.keyboard.press("Escape");
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.waitForSelector(".atelier-docs");
await mesurer("nouvelle vue en plan → aperçu généré", async () => {
  await page.locator(".docs-nouvelle > summary").click();
  await page.locator('[data-nouvelle="plan"]').click();
  await page.waitForSelector('[data-detail="vue"] .docs-svg svg', { timeout: 30000 });
});
const apercuPlan = await page.locator('[data-detail="vue"] .docs-svg').innerHTML();
check("plan du niveau : murs coupés en poché, cote « à réparer » signalée dans le dessin, convention des portes non requise (aucune porte)", /fill="#404040"/.test(apercuPlan) && /à réparer/.test(apercuPlan));
await page.locator('[data-detail="vue"] .docs-reglages select').first().selectOption("100");
await page.locator('[data-detail="vue"] .docs-reglages button[type="submit"]').click();
await enregistre();
await mesurer("nouvelle façade sud → aperçu (visibilité par faces, modèle complet)", async () => {
  await page.locator(".docs-nouvelle > summary").click();
  await page.locator('[data-nouvelle="facade-sud"]').click();
  await page.waitForFunction(() => document.querySelectorAll("[data-vue]").length === 2, null, { timeout: 30000 });
  await page.waitForSelector('[data-detail="vue"] .docs-svg svg', { timeout: 60000 });
});
await page.locator('[data-detail="vue"] .docs-reglages select').first().selectOption("200");
await page.locator('[data-detail="vue"] .docs-reglages button[type="submit"]').click();
await enregistre();
// Annotation propre à la façade : une cote de hauteur dans le repère du dessin (altitude en ordonnée).
await page.locator('[data-annoter="type"]').selectOption("cote");
await page.locator('[data-annoter="a"]').fill("0 ; 0");
await page.locator('[data-annoter="b"]').fill("0 ; 3");
await page.locator('[data-annoter="ok"]').click();
await page.waitForSelector('[data-annotation="cote"]', { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => /3,00/.test(document.querySelector('[data-detail="vue"] .docs-svg svg')?.textContent ?? ""), null, { timeout: 60000 }).catch(() => {});
check("façade : cote propre à la vue ajoutée et dessinée (3,00)", (await page.locator('[data-annotation="cote"]').count()) === 1 && /3,00/.test((await page.locator('[data-detail="vue"] .docs-svg svg').textContent()) ?? ""));
await page.locator(".docs-contenu").evaluate((e) => e.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/5-documents-facade.png` });
await page.locator('[data-nouvelle="feuille"]').click();
await page.waitForSelector('[data-detail="feuille"]', { timeout: 30000 });
await page.locator('[data-detail="feuille"] .docs-reglages select').first().selectOption("A1");
await page.locator('[data-detail="feuille"] .docs-reglages button[type="submit"]').click();
await page.waitForFunction(() => /A1 paysage/.test(document.querySelector("[data-feuille]")?.textContent || ""), null, { timeout: 30000 });
for (const n of [1, 2]) {
  // « Placer » attend la composition à jour de la feuille ; sur un banc chargé, elle peut prendre du temps. Trois
  // tentatives au plus : un clic arrivé pendant un recalcul (bouton redevenu inactif) est refait.
  for (let essai = 0; essai < 3; essai++) {
    await page.locator('[data-placer="vue"]').selectOption({ index: 1 });
    await page.waitForFunction(() => { const b = document.querySelector('[data-placer="ok"]'); return !!b && !b.disabled; }, null, { timeout: 60000 }).catch(() => {});
    await page.locator('[data-placer="ok"]').click().catch(() => {});
    const place = await page.waitForFunction((k) => document.querySelectorAll(".docs-placements li").length >= k, n, { timeout: 25000 }).then(() => true).catch(() => false);
    if (place) break;
  }
  await page.waitForFunction((k) => document.querySelectorAll(".docs-placements li").length === k, n, { timeout: 30000 }).catch(async (err) => {
    console.log("diagnostic placement :", await page.locator(".docs-contenu").textContent());
    await page.screenshot({ path: `${OUT}/echec-placement.png` });
    (await import("node:fs")).writeFileSync(`${OUT}/modele-echec.json`, JSON.stringify(await modele()));
    throw err;
  });
}
await page.waitForSelector('[data-detail="feuille"] .docs-svg svg', { timeout: 60000 });
check("feuille A1 : deux vues placées sans dépassement du cadre", (await page.locator(".docs-placements li").count()) === 2 && !/dépasse le cadre/.test(await page.locator('[data-detail="feuille"]').textContent()));
// Déplacer une vue sur la feuille à la souris : glisser son cadre, relâcher = un lot « feuille.placer ».
const champCentre = page.locator("[data-centre-vue]").first();
const nomVue = await champCentre.getAttribute("data-centre-vue");
const centreAvant = await champCentre.inputValue();
const poignee = page.locator(`[data-detail="feuille"] .feuille-poignee[data-poignee-vue="${nomVue}"]`);
// La composition de la feuille est recalculée après chaque placement : attendre celle qui porte les deux vues.
await page.waitForFunction(() => document.querySelectorAll('[data-detail="feuille"] .feuille-poignee[data-poignee-vue]').length === 2 && !document.querySelector('[data-detail="feuille"] [aria-busy="true"]'), null, { timeout: 60000 });
await page.waitForTimeout(300);
await poignee.waitFor({ timeout: 60000 });
await poignee.scrollIntoViewIfNeeded();
const bp = await poignee.boundingBox();
await page.mouse.move(bp.x + bp.width / 2, bp.y + bp.height / 2);
const sousPointeur = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.getAttribute("class")} ${e?.getAttribute("data-poignee-vue") ?? e?.getAttribute("data-tableau") ?? ""}`; }, [bp.x + bp.width / 2, bp.y + bp.height / 2]);
// Un glissement peut tomber pendant un recalcul de la composition (banc chargé) : une seconde tentative au besoin.
for (let essai = 0; essai < 2; essai++) {
  const b = essai === 0 ? bp : ((await poignee.boundingBox()) ?? bp);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(b.x + b.width / 2 + k * 5, b.y + b.height / 2 + k * 2);
  await page.mouse.up();
  const bouge = await page.waitForFunction(([nom, avant]) => [...document.querySelectorAll("[data-centre-vue]")].find((e) => e.getAttribute("data-centre-vue") === nom)?.value !== avant, [nomVue, centreAvant], { timeout: 30000 }).then(() => true, () => false);
  if (bouge) break;
  await page.waitForFunction(() => !document.querySelector('[data-detail="feuille"] [aria-busy="true"]'), null, { timeout: 30000 }).catch(() => {});
}
const centreApres = await page.locator(`[data-centre-vue="${nomVue}"]`).inputValue();
const [xa, ya] = centreAvant.split(";").map((t) => Number(t.trim().replace(",", ".")));
const [xb, yb] = centreApres.split(";").map((t) => Number(t.trim().replace(",", ".")));
check("vue glissée sur la feuille : centre déplacé vers la droite et vers le bas (environ 40 × 16 px), enregistré", xb > xa && yb < ya && xb - xa < 120 && (xb - xa) / Math.max(1, ya - yb) > 1.5, `${nomVue} : ${centreAvant} → ${centreApres} ; boîte ${JSON.stringify(bp)} ; sous le pointeur ${sousPointeur}`);
// Nomenclature placée sur la feuille : le tableau des portes, à une place libre, dessiné en grille.
await page.locator('[data-placer="tableau"]').selectOption("portes");
await page.locator('[data-placer="tableau-ok"]').click();
await page.waitForSelector('[data-tableau-place="portes"]', { timeout: 30000 }).catch(() => {});
await page.waitForFunction(() => /Tableau des portes/.test(document.querySelector('[data-detail="feuille"] .docs-svg svg')?.textContent ?? ""), null, { timeout: 60000 }).catch(() => {});
check("nomenclature sur la feuille : tableau des portes placé et dessiné, déplaçable", (await page.locator('[data-tableau-place="portes"]').count()) === 1 && /Tableau des portes/.test((await page.locator('[data-detail="feuille"] .docs-svg svg').textContent()) ?? "") && (await page.locator('.feuille-poignee[data-tableau="portes"]').count()) === 1);
await page.waitForSelector('[data-detail="feuille"] .docs-svg svg', { timeout: 60000 });
await page.locator(".docs-contenu").evaluate((e) => e.scrollTo(0, 0));
await page.screenshot({ path: `${OUT}/5-documents-feuille.png` });
await axe("mode Documents");

// PDF de la feuille, produit par le serveur à la révision courante et inscrit au catalogue.
const feuilleId = await page.locator("[data-feuille]").first().getAttribute("data-feuille");
const href = await page.locator('[data-detail="feuille"] [data-format="pdf"]').getAttribute("href");
let telechargement;
await mesurer("PDF de la feuille A1 (2 vues) produit par le serveur", async () => {
  [telechargement] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.locator('[data-detail="feuille"] [data-format="pdf"]').click()]);
  await telechargement.path();
});
const octets = (await import("node:fs")).readFileSync(await telechargement.path());
const pdf = await page.request.get(`${BASE}${href}`);
const revision = Number(pdf.headers()["x-model-revision"]);
const cat = async () => (await (await page.request.get(`${BASE}/projects/${pid()}/documents`)).json()).documents;
const docFeuille = (await cat()).find((d) => d.kind === `atelier-feuille-${feuilleId}-pdf`);
check("PDF de la feuille : application/pdf, %PDF-1.4, inscrit au catalogue « à jour » à la révision courante", pdf.status() === 200 && pdf.headers()["content-type"] === "application/pdf" && telechargement.suggestedFilename().endsWith(".pdf") && octets.subarray(0, 8).toString("latin1") === "%PDF-1.4" && docFeuille?.freshness === "a-jour" && docFeuille.produced.modelRevision === revision, `${octets.length} octets · révision ${revision}`);
const pdf2 = await pdf.body();
check("PDF reproductible : deux productions à la même révision, mêmes octets", Buffer.compare(octets, pdf2) === 0);
await page.waitForFunction(() => document.querySelector('[data-detail="feuille"] [data-fraicheur]')?.getAttribute("data-fraicheur") === "a-jour", null, { timeout: 15000 }).catch(() => {});
check("Atelier : la feuille affiche « À jour » après production", (await page.locator('[data-detail="feuille"] [data-fraicheur]').getAttribute("data-fraicheur")) === "a-jour");

// Une commande qui change le dessin : la feuille devient périmée (dessin modifié).
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.locator(`.nav-objets button[data-objet="${gc.id}"]`).click();
await page.locator("#phase-objet").selectOption("");
await enregistre();
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.locator('[data-feuille]').first().click();
await page.waitForFunction(() => document.querySelector('[data-detail="feuille"] [data-fraicheur]')?.getAttribute("data-fraicheur") === "perime", null, { timeout: 15000 }).catch(() => {});
check("après une commande : la feuille est « périmée » (dessin changé), au catalogue comme dans l'Atelier", (await page.locator('[data-detail="feuille"] [data-fraicheur]').getAttribute("data-fraicheur")) === "perime" && (await cat()).find((d) => d.kind === `atelier-feuille-${feuilleId}-pdf`)?.freshness === "perime");

// Tableaux et quantités.
await page.locator('[data-tableau="murs"]').click();
check("tableau des murs : les deux murs du niveau d'essai y figurent (après scission)", (await page.locator('.docs-tableau tbody tr:has-text("Essai lot 5")').count()) === 2);
const csv1 = await (await page.request.get(`${BASE}/projects/${pid()}/documents/atelier/tableaux/pieces.csv`)).text();
const csv2 = await (await page.request.get(`${BASE}/projects/${pid()}/documents/atelier/tableaux/pieces.csv`)).text();
check("tableau des pièces (CSV) : identique entre deux générations, 74 pièces du P.118", csv1 === csv2 && csv1.trim().split("\r\n").length === 76);
await page.screenshot({ path: `${OUT}/5-documents-tableau.png` });

// Téléphone : le mode Documents reste utilisable.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check("390 px : mode Documents sans défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/5-documents-mobile.png` });

check("aucune erreur JavaScript", erreursPage.length === 0, erreursPage.join(" | "));
console.log(JSON.stringify({ mesures }));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette documents : tout est vert");
process.exit(echecs ? 1 : 0);
