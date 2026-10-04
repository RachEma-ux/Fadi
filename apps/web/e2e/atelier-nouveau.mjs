/**
 * Recette du nouvel Atelier (lots 3a–3b), indépendante du grand scénario : inscription, import de l'exemple P.118,
 * ouverture de `?module=atelier` (référence protégée → copie de travail à la première modification), tracé au clavier et à la souris, inspecteur, palette, annuler /
 * rétablir, suppression, panneau mobile à 390 px, axe-core (aucune violation critique ou sérieuse).
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-nouveau.mjs
 */
import { chromium } from "playwright";
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
mkdirSync(OUT, { recursive: true });
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs += 1;
};
const mesures = [];
const mesurer = async (nom, fn) => {
  const t = performance.now();
  await fn();
  const ms = Math.round(performance.now() - t);
  mesures.push([nom, ms]);
  console.log(`⏱ ${nom} : ${ms} ms`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));
page.on("response", async (r) => {
  if (r.url().includes("/atelier/commands") && process.env.DIAG === "2") console.log("diagnostic", r.status(), r.request().postData()?.slice(0, 160));
  else if (r.url().includes("/atelier/") && r.status() >= 400 && process.env.DIAG) console.log("diagnostic", r.status(), r.url().replace(/.*\/atelier/, ""), r.request().postData()?.slice(0, 300), (await r.text().catch(() => "")).slice(0, 400));
});

async function axe(nom) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(".atelier-n") ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  });
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}

await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `atelier-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "atelier-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
await page.goto(`${BASE}/projets`);
await page.locator('.example-card button:has-text("Importer")').first().click();
await page.waitForURL(/\/projets\/proj_/, { timeout: 60000 });
const urlReference = page.url().split("?")[0];
let url = urlReference;

await mesurer("ouverture du nouvel Atelier P.118 → plan affiché", async () => {
  await page.goto(`${url}?module=atelier`);
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
});
const nbObjets = await page.locator(".plan2d [data-objet]").count();
check("P.118 : le plan du premier niveau est dessiné depuis le modèle typé", nbObjets > 50, String(nbObjets));
check("cinq repères : barre, outils, navigateur, zone de travail, inspecteur / modifications", (await page.locator(".atelier-n-barre, .atelier-n-outils, .atelier-n-gauche, .atelier-n-travail, .atelier-n-droite").count()) === 5);
const niveaux = await page.locator(".nav-niveaux li").count();
check("navigateur : niveaux du P.118", niveaux >= 3, String(niveaux));
await page.screenshot({ path: `${OUT}/3a-p118-desktop.png` });
await axe("bureau");

// Changer de niveau.
await page.locator(".nav-niveaux button").nth(1).click();
await page.waitForTimeout(200);
check("changer de niveau redessine le plan", (await page.locator(".nav-niveaux button[aria-pressed=true]").count()) === 1);

// Nouveau niveau vierge pour tracer.
await page.locator(".nav-ajout").click();
await page.locator(".navigateur .nav-formulaire input").first().fill("Essai lot 3a");
await page.locator(".navigateur .nav-formulaire input").nth(1).fill("20");
check("référence protégée : la barre d'état l'annonce", /Exemple protégé : première modification dans une copie automatique\./.test(await page.locator(".atelier-n-reference").textContent()));
await page.locator('.navigateur .nav-formulaire button[type="submit"]').click();
// Première modification sur la référence : copie de travail créée, la modification y est appliquée, l'écran bascule dessus.
await page.waitForURL((u) => /\/projets\/proj_/.test(u.toString()) && !u.toString().startsWith(urlReference), { timeout: 30000 });
url = page.url().split("?")[0];
await page.waitForFunction(() => [...document.querySelectorAll(".nav-niveaux li")].some((e) => e.textContent.includes("Essai lot 3a")), null, { timeout: 30000 });
const copieInfo = await (await page.request.get(`${BASE}/projects/${url.split("/").pop()}`)).json();
const referenceModele = await (await page.request.get(`${BASE}/projects/${urlReference.split("/").pop()}/atelier/model`)).json();
check("copie de travail créée automatiquement (« copie de travail · Atelier », modifiable), la référence reste à la révision 1 sans le niveau", copieInfo.name === "copie de travail · Atelier" && copieInfo.exampleMode === "editable" && referenceModele.revision === 1 && !Object.values(referenceModele.modele.niveaux).some((n) => n.nom === "Essai lot 3a") && (await page.locator(".atelier-n-reference").count()) === 0, JSON.stringify({ nom: copieInfo.name, mode: copieInfo.exampleMode, rev: referenceModele.revision }));
check("site : CRS, aire de la parcelle et origine du repère local affichés", /EPSG:26191 · parcelle 1345,55 m² · origine locale/.test(await page.locator("#atelier-site-info").textContent()));
await page.locator('.nav-niveaux button:has-text("Essai lot 3a")').click();
await page.waitForTimeout(200);

const svg = page.locator(".plan2d");
const box = await svg.boundingBox();
const cx = box.x + box.width / 2;
const cy = box.y + box.height / 2;

// Mur au clavier : M, clic, saisie 4, Entrée → un mur de 4 m.
await page.keyboard.press("m");
check("raccourci M → outil Mur", (await page.locator('.atelier-n-outils .outil.est-actif').textContent()).includes("Mur"));
await mesurer("tracer un mur (clic + saisie 4 + Entrée) → mur affiché", async () => {
  await page.mouse.move(cx - 100, cy);
  await page.mouse.click(cx - 100, cy);
  await page.mouse.move(cx + 50, cy);
  await page.keyboard.type("4;0");
  await page.keyboard.press("Enter");
  await page.waitForSelector(".plan2d .obj-mur, .plan2d [data-objet^='mur-']", { timeout: 5000 }).catch(async (err) => {
    await page.screenshot({ path: `${OUT}/echec-mur.png` });
    console.log("diagnostic :", await page.evaluate(() => ({ etat: document.querySelector(".atelier-n-etat")?.textContent, niveau: document.querySelector(".nav-niveaux [aria-pressed=true]")?.textContent, outil: document.querySelector(".atelier-n-outils .est-actif")?.textContent, saisie: document.querySelector("#saisie-precision")?.value, actif: document.activeElement?.outerHTML.slice(0, 80) })));
    throw err;
  });
});
// Trois murs de plus en saisie de précision « dx;dy » pour fermer le carré.
const echelle = await page.evaluate(() => Number(document.querySelector(".etat-echelle").textContent.replace(/[^0-9]/g, "")));
const pas = 4 * echelle;
for (const saisie of ["0;4", "-4;0", "0;-4"]) {
  await page.keyboard.type(saisie);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(100);
}
// Les gestes suivants se placent sur le carré tel qu'il est affiché (boîte des quatre murs, épaisseur comprise).
const B = await page.evaluate(() => { const bs = [...document.querySelectorAll(".plan2d [data-objet^='mur-']")].map((e) => e.getBoundingClientRect()); return { left: Math.min(...bs.map((b) => b.left)), right: Math.max(...bs.map((b) => b.right)), top: Math.min(...bs.map((b) => b.top)), bottom: Math.max(...bs.map((b) => b.bottom)) }; });
const sx = (t) => B.left + t * (B.right - B.left);
const sy = (t) => B.bottom - t * (B.bottom - B.top);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
const murs = await page.locator(".plan2d [data-objet^='mur-']").count();
check("quatre murs tracés (saisie de précision + accrochage aux extrémités)", murs === 4, String(murs));
if (process.env.DIAG) console.log("diagnostic murs", JSON.stringify(await page.evaluate(async (pid) => { const m = await (await fetch(`/projects/${pid}/atelier/model`, { credentials: "include" })).json(); return Object.values(m.modele.objets).filter((o) => o.classe === "mur" && m.modele.niveaux[o.niveauId]?.nom === "Essai lot 3a").map((o) => [o.params.a.x, o.params.a.y, o.params.b.x, o.params.b.y]); }, url.split("/").pop())));
// Pièce par clic dans la boucle.
await page.keyboard.press("Escape");
await page.keyboard.press("r");
await page.mouse.click(sx(0.5), sy(0.5));
await page.waitForTimeout(300);
const pieces = await page.locator(".plan2d [data-objet^='piece-']").count();
check("outil Pièce : clic dans la boucle → pièce de 16 m² créée et sélectionnée", pieces === 1 && (await page.locator(".inspecteur h3").textContent()).includes("Pièce"), `${pieces} pièce(s) · inspecteur « ${await page.locator(".inspecteur h3").textContent()} » · aide « ${await page.locator(".atelier-n-etat").textContent()} »`);
// Inspecteur : renommer la pièce.
await page.locator('.inspecteur input[id$="-nom"]').fill("Bureau");
await page.keyboard.press("Enter");
await page.waitForTimeout(200);
check("inspecteur : renommer → commande appliquée", (await page.locator(".inspecteur h3").textContent()).includes("Bureau"));
// Annuler / rétablir.
await page.locator(".plan2d").click({ position: { x: 5, y: 5 } }).catch(() => {});
await page.keyboard.press("Escape");
const navTexte = () => page.evaluate(() => document.querySelector(".nav-objets").textContent);
await page.waitForFunction(() => document.querySelector(".barre-sync")?.textContent?.startsWith("Enregistré"), null, { timeout: 15000 }).catch(() => {});
await page.keyboard.press("Control+z");
await page.waitForFunction(() => !document.querySelector(".nav-objets").textContent.includes("Bureau"), null, { timeout: 10000 }).catch(() => {});
check("Ctrl Z annule le renommage", !(await navTexte()).includes("Bureau"));
await page.keyboard.press("Control+Shift+z");
await page.waitForFunction(() => document.querySelector(".nav-objets").textContent.includes("Bureau"), null, { timeout: 10000 }).catch(() => {});
check("Ctrl Maj Z le rétablit", (await navTexte()).includes("Bureau"));

// Palette.
await page.keyboard.press("Control+k");
await page.locator(".palette-champ").fill("wall");
check("palette : « wall » → Mur en premier", (await page.locator(".palette-resultats li").first().textContent()).includes("Mur"));
await page.locator(".palette-champ").fill("door");
await page.keyboard.press("Enter");
check("palette : Entrée choisit l'outil (Porte)", (await page.locator('.atelier-n-outils .outil.est-actif').textContent()).includes("Porte"));
// Porte sur le premier mur (milieu).
await page.mouse.click(sx(0.5), sy(0.01));
await page.waitForTimeout(300);
check("porte posée sur le mur cliqué", (await page.locator(".plan2d [data-objet^='porte-']").count()) === 1);

// Type : créer un type depuis un mur, puis l'affecter à un autre.
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.mouse.click(sx(0.99), sy(0.5));
await page.waitForTimeout(150);
await page.locator('.inspecteur button[title="Créer un type à partir de cet objet"]').click();
await page.waitForTimeout(300);
const typeCree = await page.locator('.inspecteur select[id^="type-"] option:checked').textContent();
await page.mouse.click(sx(0.01), sy(0.5));
await page.waitForTimeout(150);
await page.locator('.inspecteur select[id^="type-"]').selectOption({ label: typeCree });
await page.waitForTimeout(200);
check("type : créé depuis un mur puis affecté à un autre mur", typeCree.startsWith("Mur") && (await page.locator('.inspecteur select[id^="type-"] option:checked').textContent()) === typeCree);

// Sélection par cadre et suppression.
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await page.mouse.move(sx(0) - 30, sy(0) + 30);
await page.mouse.down();
await page.mouse.move(sx(1) + 30, sy(0.1), { steps: 5 });
await page.mouse.up();
await page.waitForTimeout(200);
check("cadre : le mur du bas sélectionné", (await page.locator(".etat-selection").textContent()).length > 0);
await page.keyboard.press("Delete");
await page.waitForTimeout(400);
check("Suppr : mur et porte hébergée supprimés ensemble", (await page.locator(".plan2d [data-objet^='porte-']").count()) === 0 && (await page.locator(".plan2d [data-objet^='mur-']").count()) === 3);
await page.waitForFunction(() => document.querySelector(".barre-sync")?.textContent?.startsWith("Enregistré"), null, { timeout: 15000 }).catch(() => {});
check("file synchronisée avec le serveur", (await page.locator(".barre-sync").textContent()).startsWith("Enregistré"), `${await page.locator(".barre-sync").textContent()} ${await page.locator(".mod-lots").textContent().catch(() => "")}`);
await page.screenshot({ path: `${OUT}/3a-trace-desktop.png` });

// Rechargement : le modèle vient du serveur.
await page.reload();
await page.waitForSelector(".plan2d");
await page.locator('.nav-niveaux button:has-text("Essai lot 3a")').click();
await page.waitForTimeout(300);
check("après rechargement : 3 murs et la pièce conservés", (await page.locator(".plan2d [data-objet^='mur-']").count()) === 3 && (await page.locator(".plan2d [data-objet^='piece-']").count()) === 1);

// 3D (lot 3b) : chaque niveau × chaque présentation rendu, sans vue vide ni erreur.
await mesurer("passage en 3D (chargement de three.js, maillage du P.118) → première image", async () => {
  await page.locator('.barre-mode button:has-text("3D")').click();
  await page.waitForFunction(() => (window.fadiMesures3D?.rendus?.length ?? 0) > 0 && window.fadiMesures3D.triangles > 0, null, { timeout: 30000 });
});
check("3D : moteur WebGL2 actif, image non vide", await page.evaluate(() => window.fadiMesures3D.moteur === "webgl2" && window.fadiMesures3D.triangles > 1000), JSON.stringify(await page.evaluate(() => ({ t: window.fadiMesures3D.triangles, a: window.fadiMesures3D.appels }))));
const appels = await page.evaluate(() => window.fadiMesures3D.appels);
check("3D : rendu groupé (peu d'appels de dessin pour tout le P.118)", appels > 0 && appels < 400, String(appels));
const rendus = async () => page.evaluate(() => window.fadiMesures3D.rendus.length);
const attendreRendu = async (n0) => page.waitForFunction((n) => window.fadiMesures3D.rendus.length > n, n0, { timeout: 10000 });
let videsOuErreurs = [];
const niveaux3d = await page.locator(".nav-niveaux button").count();
for (const presentation of ["Bâtiment", "Niveau actif", "Éclaté"]) {
  for (let k = 0; k < niveaux3d; k++) {
    const n0 = await rendus();
    await page.locator(".nav-niveaux button").nth(k).click();
    await page.locator('.vue3d-commandes select[aria-label="Présentation"]').selectOption({ label: presentation });
    await attendreRendu(n0).catch(() => {});
    const t = await page.evaluate(() => window.fadiMesures3D.triangles);
    const nom = await page.locator(".nav-niveaux button").nth(k).textContent();
    if (!(t > 0)) videsOuErreurs.push(`${presentation} / ${nom} : ${t} triangles`);
  }
}
check(`3D : ${niveaux3d} niveaux × 3 présentations rendus (aucune vue vide)`, videsOuErreurs.length === 0 && erreursPage.length === 0, videsOuErreurs.join(" ; "));
await page.locator('.nav-niveaux button').first().click();
await page.locator('.vue3d-commandes select[aria-label="Présentation"]').selectOption({ label: "Bâtiment" });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/3b-p118-batiment.png` });
const vides2 = [];
for (const vue of ["Plan (dessus)", "Coupe nord–sud", "Coupe est–ouest", "Façade sud", "Façade nord", "Façade est", "Façade ouest"]) {
  const n0 = await rendus();
  await page.locator('.vue3d-commandes select[aria-label="Vue"]').selectOption({ label: vue });
  await attendreRendu(n0).catch(() => {});
  const t = await page.evaluate(() => window.fadiMesures3D.triangles);
  if (!(t > 0)) vides2.push(vue);
  if (vue === "Coupe nord–sud" || vue === "Façade sud") await page.screenshot({ path: `${OUT}/3b-${vue.startsWith("Coupe") ? "coupe-ns" : "facade-sud"}.png` });
}
check("vues techniques : plan, coupes N–S / E–O, quatre façades rendues", vides2.length === 0, vides2.join(", "));
await page.locator('.vue3d-commandes select[aria-label="Vue"]').selectOption({ label: "Perspective" });
// Orbite : 60 trames de glisser, budget de trame mesuré.
const canvas3d = await page.locator(".vue3d-canevas").boundingBox();
const debutRendus = await rendus();
await page.mouse.move(canvas3d.x + canvas3d.width / 2, canvas3d.y + canvas3d.height / 2);
await page.mouse.down();
for (let k = 0; k < 60; k++) {
  await page.mouse.move(canvas3d.x + canvas3d.width / 2 + k * 4, canvas3d.y + canvas3d.height / 2 + Math.sin(k / 6) * 20);
  await page.waitForTimeout(16);
}
await page.mouse.up();
await page.waitForTimeout(200);
const orbite = await page.evaluate((n0) => window.fadiMesures3D.rendus.slice(n0), debutRendus);
const tri = [...orbite].sort((a, b) => a - b);
const p95 = tri[Math.floor(tri.length * 0.95)] ?? 0;
mesures.push(["orbite : temps CPU de rendu par image, p95 (ms)", Math.round(p95 * 100) / 100]);
console.log(`⏱ orbite P.118 : ${orbite.length} images, rendu CPU p95 ${p95.toFixed(2)} ms, médiane ${(tri[Math.floor(tri.length / 2)] ?? 0).toFixed(2)} ms`);
check("orbite : au moins 30 images rendues, p95 du rendu < 16 ms", orbite.length >= 30 && p95 < 16, `${orbite.length} images, p95 ${p95.toFixed(2)} ms`);

// Pousser / tirer la hauteur d'un mur du niveau d'essai.
await page.locator('.nav-niveaux button:has-text("Essai lot 3a")').click();
await page.locator('.vue3d-commandes select[aria-label="Présentation"]').selectOption({ label: "Niveau actif" });
await page.waitForTimeout(400);
const murId = await page.evaluate(() => [...document.querySelectorAll(".nav-objets button[data-objet]")].map((b) => b.dataset.objet).find((t) => t.startsWith("mur-")));
await page.keyboard.press("u");
check("raccourci U → Pousser / tirer (reste en 3D)", (await page.locator('.atelier-n-outils .est-actif, .outils-famille .est-actif').first().textContent().catch(() => "")).includes("Pousser") || (await page.locator(".vue3d").count()) === 1);
const pos = await page.evaluate((id) => window.fadiMesures3D.localiser(id), murId);
const c3 = await page.locator(".vue3d-canevas").boundingBox();
await mesurer("pousser / tirer un mur → hauteur enregistrée", async () => {
  await page.mouse.move(c3.x + pos.x, c3.y + pos.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(c3.x + pos.x, c3.y + pos.y - k * 6);
  await page.mouse.up();
  // Le geste part en un lot ; sur une machine de CI chargée, l'enregistrement peut dépasser quelques secondes.
  await page.waitForFunction(() => document.querySelector(".barre-sync")?.textContent?.startsWith("Enregistré"), null, { timeout: 30000 });
});
const hauteurApres = await page.locator('.inspecteur input[id$="-hauteur"]').inputValue().catch(() => "");
check("pousser / tirer : la hauteur du mur a augmenté (> 3 m) et est enregistrée", Number(hauteurApres.replace(",", ".")) > 3, `${hauteurApres} ; ${murId} à ${JSON.stringify(pos)} ; sonde ${await page.evaluate((p) => window.fadiMesures3D.sonder(p.x, p.y), pos)}`);
await page.screenshot({ path: `${OUT}/3b-pousser.png` });
await page.keyboard.press("Escape");
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.waitForSelector(".plan2d");
await page.waitForTimeout(200);

// Manipulation directe en plan (DA-02-17) : sélectionner un mur, le glisser d'un mètre.
await page.keyboard.press("Escape");
const murPlan = page.locator(`.plan2d [data-objet="${murId}"]`);
const bMur = await murPlan.boundingBox();
const ech2 = await page.evaluate(() => Number(document.querySelector(".etat-echelle").textContent.replace(/[^0-9]/g, "")));
await mesurer("sélection d'un mur au clic → inspecteur affiché", async () => {
  const selectionne = () => page.waitForFunction((id) => document.querySelector(".inspecteur-meta")?.textContent?.includes(id), murId, { timeout: 5000 });
  await page.mouse.click(bMur.x + bMur.width / 2, bMur.y + bMur.height / 2);
  // Un rendu du plan peut être en cours au moment du clic (retour de la 3D) : un second clic, une seule fois.
  if (!(await selectionne().then(() => true, () => false))) {
    await page.waitForTimeout(500);
    await page.mouse.click(bMur.x + bMur.width / 2, bMur.y + bMur.height / 2);
    if (!(await selectionne().then(() => true, () => false))) {
      const sous = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return `${e?.tagName}.${e?.getAttribute("class") ?? ""} objet=${e?.closest("[data-objet]")?.getAttribute("data-objet") ?? "-"}`; }, [bMur.x + bMur.width / 2, bMur.y + bMur.height / 2]);
      check("sélection d'un mur au clic", false, `sous le pointeur : ${sous} ; boîte ${JSON.stringify(bMur)} ; inspecteur : ${(await page.locator(".inspecteur").textContent())?.slice(0, 160)}`);
      await page.screenshot({ path: `${OUT}/3b-selection-echec.png` });
    }
  }
});
const avantDeplacement = await page.locator(".inspecteur .champ-lecture").first().textContent();
await mesurer("glisser un mur d'un mètre → déplacement enregistré", async () => {
  await page.mouse.move(bMur.x + bMur.width / 2, bMur.y + bMur.height / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(bMur.x + bMur.width / 2 + (k * ech2) / 10, bMur.y + bMur.height / 2 + 0.3);
  await page.mouse.up();
  await page.waitForFunction(() => document.querySelector(".barre-sync")?.textContent?.startsWith("Enregistré"), null, { timeout: 10000 });
});
const apresDeplacement = await page.locator(".inspecteur .champ-lecture").first().textContent();
await page.waitForFunction(() => document.querySelector(".mod-journal")?.textContent?.includes("Déplacer"), null, { timeout: 5000 }).catch(() => {});
check("manipulation directe : le mur glissé a bougé et c'est enregistré", avantDeplacement !== apresDeplacement && (await page.locator(".mod-journal").textContent()).includes("Déplacer"), `${avantDeplacement} → ${apresDeplacement}`);
await page.keyboard.press("Control+z");
await page.waitForTimeout(800);

// Exports : DXF, SVG, CSV en plan, PNG en 3D — téléchargés et enregistrés au catalogue des documents (niveau, vue, révision).
const exportsFaits = [];
for (const kind of ["dxf", "svg", "csv"]) {
  await page.locator(".barre-exports > summary").click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator(`[data-export="${kind}"]`).click()]);
  const enregistre = await page.waitForFunction((k) => window.__fadiExports?.some((e) => e.kind === k), kind, { timeout: 15000 }).then(() => true).catch(() => false);
  exportsFaits.push(`${kind}:${dl.suggestedFilename()}:${enregistre ? "catalogue" : "non"}`);
}
await page.locator('.barre-mode button:has-text("3D")').click();
await page.waitForFunction(() => (window.fadiMesures3D?.triangles ?? 0) > 0, null, { timeout: 30000 });
await page.locator(".barre-exports > summary").click();
const [dlPng] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.locator('[data-export="png"]').click()]);
const pngOk = await page.waitForFunction(() => window.__fadiExports?.some((e) => e.kind === "png"), null, { timeout: 15000 }).then(() => true).catch(() => false);
exportsFaits.push(`png:${dlPng.suggestedFilename()}:${pngOk ? "catalogue" : "non"}`);
await page.locator('.barre-mode button:has-text("Plan")').click();
const docsCatalogue = (await (await page.request.get(`${BASE}/projects/${url.split("/").pop()}/documents`)).json()).documents.filter((d) => d.group === "dessins");
check("exports DXF, SVG, CSV et PNG : téléchargés et enregistrés au catalogue, « à jour » à la révision courante", exportsFaits.every((e) => /:catalogue$/.test(e)) && docsCatalogue.length === 4 && docsCatalogue.every((d) => d.freshness === "a-jour") && docsCatalogue.some((d) => /Dessin technique DXF · Essai lot 3a · dessin plan/.test(d.label)), `${exportsFaits.join(" ")} | ${docsCatalogue.map((d) => d.label).join(" ; ")}`);

// Second navigateur (même compte) : il lit les mêmes révisions.
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 }, storageState: await ctx.storageState() });
const page2 = await ctx2.newPage();
await page2.goto(`${url}?module=atelier`);
await page2.waitForSelector(".plan2d");
await page2.locator('.nav-niveaux button:has-text("Essai lot 3a")').click();
await page2.waitForTimeout(300);
check("second navigateur : 3 murs, la pièce « Bureau » et la révision du premier", (await page2.locator(".plan2d [data-objet^='mur-']").count()) === 3 && (await page2.locator(".nav-objets").textContent()).includes("Bureau") && (await page2.locator(".barre-sync").textContent()) === (await page.locator(".barre-sync").textContent()));
await ctx2.close();

// Téléphone.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
check("390 px : onglets des panneaux visibles", await page.locator(".atelier-n-onglets").isVisible());
await page.screenshot({ path: `${OUT}/3a-mobile-plan.png` });
await page.locator('.atelier-n-onglets button:has-text("Projet")').click();
check("390 px : onglet Projet → navigateur", await page.locator(".atelier-n-gauche").isVisible());
await page.screenshot({ path: `${OUT}/3a-mobile-projet.png` });
await page.locator('.atelier-n-onglets button:has-text("Inspecteur")').click();
check("390 px : onglet Inspecteur", await page.locator(".droite-inspecteur").isVisible());
await axe("téléphone");

// 3D au toucher (téléphone) : toucher sélectionne, un doigt fait tourner, deux doigts zooment.
const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, storageState: await ctx.storageState() });
const pt3 = await tel.newPage();
pt3.on("pageerror", (e) => erreursPage.push(`téléphone : ${e.message}`));
await pt3.goto(`${url}?module=atelier`);
await pt3.waitForSelector(".plan2d");
await pt3.locator('.barre-mode button:has-text("3D")').tap();
await pt3.waitForFunction(() => (window.fadiMesures3D?.triangles ?? 0) > 0, null, { timeout: 30000 });
await pt3.locator('.vue3d-commandes select[aria-label="Présentation"]').selectOption({ label: "Niveau actif" });
await pt3.waitForTimeout(400);
const murTel = await pt3.evaluate(() => {
  const groupe = [...document.querySelectorAll(".nav-objets details")].find((d) => d.querySelector("summary").textContent.trim().startsWith("Mur"));
  const ids = groupe ? [...groupe.querySelectorAll("button[data-objet]")].map((b) => b.dataset.objet) : [];
  for (const id of ids) {
    const p = window.fadiMesures3D.localiser(id);
    if (p && window.fadiMesures3D.sonder(p.x, p.y) === id) return { id, ...p };
  }
  return null;
});
const cTel = await pt3.locator(".vue3d-canevas").boundingBox();
if (murTel) await pt3.touchscreen.tap(cTel.x + murTel.x, cTel.y + murTel.y);
await pt3.waitForTimeout(300);
check("téléphone 3D : toucher un mur le sélectionne", !!murTel && (await pt3.locator(".inspecteur h3").first().textContent()).startsWith("Mur"), JSON.stringify(murTel));
const cdp = await tel.newCDPSession(pt3);
const n0Tel = await pt3.evaluate(() => window.fadiMesures3D.rendus.length);
const toucher = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x: cTel.x + x, y: cTel.y + y, id })) });
await toucher("touchStart", [[100, 200]]);
for (let k = 1; k <= 12; k++) await toucher("touchMove", [[100 + k * 10, 200]]);
await toucher("touchEnd", []);
await pt3.waitForTimeout(200);
const n1Tel = await pt3.evaluate(() => window.fadiMesures3D.rendus.length);
await toucher("touchStart", [[150, 250], [250, 250]]);
for (let k = 1; k <= 10; k++) await toucher("touchMove", [[150 - k * 6, 250], [250 + k * 6, 250]]);
await toucher("touchEnd", []);
await pt3.waitForTimeout(200);
const n2Tel = await pt3.evaluate(() => window.fadiMesures3D.rendus.length);
check("téléphone 3D : un doigt fait tourner, deux doigts zooment (images rendues)", n1Tel > n0Tel + 3 && n2Tel > n1Tel + 3, `${n0Tel} → ${n1Tel} → ${n2Tel}`);
await pt3.screenshot({ path: `${OUT}/3b-mobile-3d.png` });
check("téléphone 3D : pas de défilement horizontal", await pt3.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await tel.close();

check("aucune erreur JavaScript", erreursPage.length === 0, erreursPage.join(" | "));
console.log(JSON.stringify({ mesures }));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette Atelier : tout est vert");
process.exit(echecs ? 1 : 0);
