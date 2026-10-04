/**
 * Recette du lot 6 (échanges) dans un vrai navigateur : maquette IFC 4.3 du P.118 exportée depuis l'Atelier (fichier
 * au catalogue, à jour, rapport de fidélité affiché), réimportée dans un autre projet en représentations (rapport,
 * plan, 3D), plan DXF 2D importé (unités, calques, groupe, rapport) ; exemple protégé : import désactivé ; téléphone ;
 * axe-core ; aucune erreur JavaScript.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-echanges.mjs
 */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const TMP = mkdtempSync(join(tmpdir(), "fadi-echanges-"));
let echecs = 0;
const check = (nom, ok, detail = "") => {
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
  if (!ok) echecs++;
};
const mesures = [];
const mesurer = async (nom, fn) => {
  const t0 = Date.now();
  const r = await fn();
  const ms = Date.now() - t0;
  mesures.push([nom, ms]);
  console.log(`⏱ ${nom} : ${ms} ms`);
  return r;
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const erreursPage = [];
page.on("pageerror", (e) => erreursPage.push(e.message));

async function axe(nom, selecteur = ".atelier-n") {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  }, selecteur);
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
const enregistre = () => page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const modele = async (id) => (await (await page.request.get(`${BASE}/projects/${id}/atelier/model`)).json()).modele;
const catalogue = async (id) => (await (await page.request.get(`${BASE}/projects/${id}/documents`)).json()).documents;
const fermerRapport = async () => {
  await page.locator(".echanges-rapport .dialogue-actions button").click();
  await page.locator(".echanges-rapport").waitFor({ state: "detached", timeout: 5000 });
};

// Compte, exemple P.118 (référence protégée), copie de travail.
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', `echanges-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "echanges-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
await page.goto(`${BASE}/projets`);
await page.locator('.example-card button:has-text("Importer")').first().click();
await page.waitForURL(/\/projets\/proj_/, { timeout: 60000 });
const reference = page.url().split("?")[0];
await page.goto(`${reference}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.locator(".barre-imports > summary").click();
check("exemple protégé : import IFC et DXF désactivés (à faire dans une copie de travail)", (await page.locator('[data-import="ifc"]').isDisabled()) && (await page.locator('[data-import="dxf"]').isDisabled()));
await page.locator(".barre-imports > summary").click();
const copie = await page.request.post(`${BASE}/projects/${reference.split("/").pop()}/copies`, { data: { name: "P.118 · échanges" } });
const pid = (await copie.json()).id;
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await enregistre();

// Export IFC : téléchargement, rapport, catalogue.
await page.locator(".barre-exports > summary").click();
const [dl] = await mesurer("export IFC du P.118 (serveur + rapport)", () =>
  Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.locator('[data-export="ifc"]').click()]),
);
const cheminIfc = join(TMP, dl.suggestedFilename());
await dl.saveAs(cheminIfc);
const ifc = readFileSync(cheminIfc, "utf8");
check("export IFC : fichier .ifc IFC4X3_ADD2 avec IfcMapConversion vers le CRS de la parcelle", /\.ifc$/.test(dl.suggestedFilename()) && ifc.includes("FILE_SCHEMA(('IFC4X3_ADD2'));") && /IFCMAPCONVERSION\(/.test(ifc) && /IFCPROJECTEDCRS\('EPSG:/.test(ifc));
await page.locator(".echanges-rapport").waitFor({ timeout: 15000 });
const murs = Object.values((await modele(pid)).objets).filter((o) => o.classe === "mur").length;
const ligneMur = await page.locator('.echanges-rapport tbody tr:has(th:text-is("mur")) td').allTextContents();
check("rapport d'export : chaque mur lu est écrit (IfcWall), remarques de conversion présentes", ligneMur[0] === String(murs) && ligneMur[1] === String(murs) && ligneMur[2].includes("IfcWall") && (await page.locator(".echanges-rapport .rapport-remarques li").count()) > 0, ligneMur.join(" | "));
await axe("rapport d'échange", ".echanges-rapport");
await page.screenshot({ path: `${OUT}/6-export-ifc-rapport.png` });
await fermerRapport();
const entree = (await catalogue(pid)).find((d) => d.kind === "atelier-ifc");
check("catalogue : maquette IFC inscrite, à jour à la révision courante", entree?.freshness === "a-jour" && entree?.produced?.modelRevision === entree?.current?.modelRevision);

// Import IFC dans un autre projet.
const cree = await page.request.post(`${BASE}/projects`, { data: { code: "ECH6", name: "Réimport IFC" } });
const cible = (await cree.json()).id;
const lot = (await page.request.post(`${BASE}/projects/${cible}/atelier/commands`, { data: { requestId: `n-${Date.now()}`, baseRevision: 0, contract: "atelier-commands/1", label: "Niveau", commands: [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0 } }] } })).status();
check("projet cible créé avec un niveau RDC (altitude 0)", lot === 200);
await page.goto(`${BASE}/projets/${cible}?module=atelier`);
await page.waitForSelector(".plan2d", { timeout: 30000 });
await enregistre();
await page.locator(".barre-imports > summary").click();
const [choix] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-import="ifc"]').click()]);
await mesurer("import IFC du P.118 (lecture web-ifc, 4 lots, relecture du modèle)", async () => {
  await choix.setFiles(cheminIfc);
  await page.locator(".echanges-rapport").waitFor({ timeout: 120000 });
});
const lignes = await page.locator(".echanges-rapport tbody tr").evaluateAll((trs) => Object.fromEntries(trs.map((tr) => [tr.querySelector("th").textContent, [...tr.querySelectorAll("td")].map((t) => t.textContent)])));
check("rapport d'import : IfcWall lus = importés = murs du P.118 ; ouvertures déclarées non importées, annotations reprises en textes et traits", lignes["IfcWall"]?.[0] === String(murs) && lignes["IfcWall"]?.[1] === String(murs) && lignes["IfcOpeningElement"]?.[1] === "0" && !!lignes["IfcAnnotation"], JSON.stringify(lignes).slice(0, 300));
check("rapport d'import : repère déclaré (projet sans parcelle : coordonnées gardées)", (await page.locator(".echanges-rapport .rapport-remarques").textContent()).includes("pas de parcelle"));
await page.screenshot({ path: `${OUT}/6-import-ifc-rapport.png` });
await fermerRapport();
const apres = await modele(cible);
const importes = Object.values(apres.objets).filter((o) => o.classe === "objet-importe");
check("modèle : représentations importées avec classe et GlobalId d'origine ; RDC réutilisé, autres étages créés « IFC · … »", importes.length > 1000 && importes.every((o) => o.params.globalId && o.params.ifcClasse) && Object.values(apres.niveaux).filter((n) => n.nom.startsWith("IFC · ")).length === 5);
await page.waitForFunction(() => document.querySelectorAll(".plan2d .obj-objet-importe").length > 50, null, { timeout: 20000 }).catch(() => {});
check("plan : emprises des objets importés dessinées (tirets), classe IFC au survol", (await page.locator(".plan2d .obj-objet-importe").count()) > 50 && ((await page.locator(".plan2d .obj-objet-importe title").first().textContent()) ?? "").includes("importé"));
await page.locator(".barre button:has-text(\"Cadrer\")").first().click().catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/6-import-ifc-plan.png` });
// Sélection depuis la liste des objets du niveau (groupe « Objet importé (IFC) »).
const murImporte = importes.find((o) => o.niveauId === "rdc" && o.params.ifcClasse === "IfcWall");
await page.locator('.nav-objets details:has(summary:has-text("Objet importé")) > summary').click();
await page.locator(`.nav-objets button[data-objet="${murImporte.id}"]`).click();
await page.locator(".inspecteur-meta").first().waitFor({ timeout: 10000 }).catch(() => {});
const texteInspecteur = (await page.locator(".inspecteur").first().textContent().catch(() => "")) ?? "";
check("inspecteur : classe IFC d'origine, GlobalId, maillage résumé (non paramétrique)", texteInspecteur.includes("non paramétrique") && texteInspecteur.includes("(importé)"), texteInspecteur.slice(0, 200));
await page.keyboard.press("Escape");
await page.locator('.barre-mode button:has-text("3D")').click();
await page.waitForSelector(".vue3d canvas", { timeout: 30000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/6-import-ifc-3d.png` });
check("3D : la maquette importée s'affiche sans erreur", erreursPage.length === 0, erreursPage.join(" | "));
await page.locator('.barre-mode button:has-text("Plan")').click();

// Import DXF 2D.
const dxf = [
  "0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "Murs", "10", "0", "20", "-3000", "11", "8000", "21", "-3000",
  "0", "LWPOLYLINE", "8", "Murs", "90", "4", "70", "1", "10", "0", "20", "-6000", "10", "8000", "20", "-6000", "10", "8000", "20", "-4000", "10", "0", "20", "-4000",
  "0", "CIRCLE", "8", "Mobilier", "10", "4000", "20", "-5000", "40", "600",
  "0", "TEXT", "8", "Textes", "10", "500", "20", "-5500", "40", "250", "1", "Terrasse %%c 12",
  "0", "INSERT", "8", "0", "2", "ARBRE", "10", "0", "20", "0",
  "0", "ENDSEC", "0", "EOF",
].join("\n");
const cheminDxf = join(TMP, "terrasse.dxf");
writeFileSync(cheminDxf, dxf);
await page.locator(".barre-imports > summary").click();
await page.locator('[data-import="dxf"]').click();
await page.locator(".echanges-dxf").waitFor();
await axe("dialogue d'import DXF", ".echanges-dxf");
await page.locator('.echanges-dxf input[data-entree="dxf"]').setInputFiles(cheminDxf);
await page.locator(".echanges-dxf .dialogue-actions .primaire").click();
await page.locator(".echanges-rapport").waitFor({ timeout: 30000 });
const dxfLignes = await page.locator(".echanges-rapport tbody tr").evaluateAll((trs) => Object.fromEntries(trs.map((tr) => [tr.querySelector("th").textContent, [...tr.querySelectorAll("td")].map((t) => t.textContent)])));
check("rapport DXF : unité mm lue dans le fichier ; INSERT signalé non importé", (await page.locator(".echanges-rapport .dialogue-note").textContent()).includes("mm (déclarée par le fichier)") && dxfLignes["INSERT"]?.[1] === "0" && dxfLignes["LINE"]?.[1] === "1", JSON.stringify(dxfLignes));
await page.screenshot({ path: `${OUT}/6-import-dxf-rapport.png` });
await fermerRapport();
await enregistre();
const avecDxf = await modele(cible);
// Esquisses venues du DXF (le projet porte aussi les traits des annotations IFC importées plus haut).
const esquisses = Object.values(avecDxf.objets).filter((o) => o.classe === "esquisse" && o.id.startsWith("dxf-"));
const ligne = esquisses.find((o) => o.params.forme === "ligne");
check("modèle : esquisses en mètres (8 m), calques « DXF · … », un groupe", ligne && Math.abs(ligne.params.points[1].x - 8) < 1e-9 && Object.values(avecDxf.calques).some((c) => c.nom === "DXF · Murs") && Object.values(avecDxf.groupes).some((g) => g.nom.includes("terrasse.dxf")), `${esquisses.length} esquisse(s) · ${JSON.stringify(ligne?.params.points ?? null)} · calques ${Object.values(avecDxf.calques).map((c) => c.nom).join(", ")} · groupes ${Object.values(avecDxf.groupes).map((g) => g.nom).join(", ")} · r${avecDxf.revision ?? "?"}`);

// Téléphone.
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.locator(".barre-imports > summary").click();
check("390 px : menu Importer dans l'écran, sans défilement horizontal", await page.evaluate(() => {
  const r = document.querySelector(".barre-imports .exports-liste")?.getBoundingClientRect();
  return !!r && r.left >= 0 && r.right <= window.innerWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth + 1;
}));
await page.screenshot({ path: `${OUT}/6-echanges-mobile.png` });

check("aucune erreur JavaScript", erreursPage.length === 0, erreursPage.join(" | "));
console.log(JSON.stringify({ mesures }));
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette échanges : tout est vert");
process.exit(echecs ? 1 : 0);
