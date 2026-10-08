/**
 * Recette du lot 7 de la Planche (persistance par commandes, Planches nommées, IFC, PNG) : ordinateur 1536 × 864 puis
 * émulation téléphone ; axe-core. Critères du cahier (§8, lot 7) : une opération = une entrée de journal ; rejouer un
 * `requestId` ne l'applique pas deux fois ; `baseRevision` périmée → 409 ; hors ligne → file puis reprise ; IFC avec
 * un proxy par objet ; décision P-1 (plusieurs Planches nommées, niveau de référence) ; brouillon local repris sur
 * proposition, jamais imposé.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/planche-lot-7.mjs
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
mkdirSync(OUT, { recursive: true });
const resultats = [];
const note = (sujet, cas, ok, detail = "") => { resultats.push({ sujet, cas, ok, detail }); console.log(`${ok ? "✓" : "✗"} [${sujet}] ${cas}${detail ? " — " + detail : ""}`); };

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? undefined });
const ctx = await browser.newContext({ viewport: { width: 1536, height: 864 }, acceptDownloads: true });
const page = await ctx.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => void d.accept());
const api = async (m, c, d, p = page) => { const r = await p.request[m](`${BASE}${c}`, d === undefined ? undefined : { data: d }); return { status: r.status(), body: await r.json().catch(() => null), text: await r.text().catch(() => "") }; };

await page.goto(`${BASE}/inscription`);
const email = `lot7-${Date.now()}@example.com`;
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "planche-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "lot 7 Planche" })).body.id;
const ouvrirPlanche = async (p = page) => {
  await p.goto(`${BASE}/projets/${pid}?module=atelier`);
  await p.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await p.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
  const bouton = p.locator("[data-mode-planche]"); await bouton.scrollIntoViewIfNeeded(); await bouton.click();
  await p.waitForSelector("[data-planche-vue] canvas", { timeout: 30000 });
  await p.waitForFunction(() => !!window.fadiPlanche);
  await p.locator("[data-planche-vue]").focus();
};
await ouvrirPlanche();

// ——— Instrumentation
const etat = (p = page) => p.evaluate(() => { const P = window.fadiPlanche; const m = P.modele(); return { faces: Object.keys(m.racine.faces).length, pas: P.pas(), outil: P.outil() }; });
const serveur = async () => { const m = (await api("get", `/projects/${pid}/atelier/model`)).body; const planches = Object.values(m.modele.definitions).filter((d) => d.classe === "planche"); return { revision: m.revision, planches: planches.map((d) => ({ id: d.id, nom: d.params.nom, niveauId: d.params.niveauId, faces: Object.keys(d.params.modele.racine.faces).length, empreinte: d.params.empreinte })) }; };
const journal = async () => (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.map((e) => e.label);
const enregistre = (p = page) => p.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 20000 });
const boite = async (p = page) => p.locator("[data-planche-vue] canvas").boundingBox();
const ecran = async (q, p = page) => { const b = await boite(p); const e = await p.evaluate((x) => window.fadiPlanche.versEcran(x), q); return { x: b.x + e.x, y: b.y + e.y }; };
const cliquer = async (q, p = page) => { const e = await ecran(q, p); await p.mouse.move(e.x, e.y, { steps: 3 }); await p.mouse.click(e.x, e.y); await p.waitForTimeout(40); };
const rect = async (coin, dims, p = page) => { await p.locator("[data-planche-vue]").focus(); await p.keyboard.press("r"); await cliquer(coin, p); await p.keyboard.type(dims); await p.keyboard.press("Enter"); await p.waitForTimeout(80); };
const nomAffiche = (p = page) => p.locator("[data-planche-menu-ouvrir]").getAttribute("data-planche-nom");
const menu = async (entree, p = page) => { if (!(await p.locator(".planche-menu-liste").count())) await p.locator("[data-planche-menu-ouvrir]").click(); await p.locator(`[data-planche-${entree}]`).click(); await p.waitForTimeout(60); };
const capture = (nom) => page.screenshot({ path: `${OUT}/planche-${nom}.png` });
async function axe(nom, selecteur, p = page) {
  await p.addScriptTag({ path: AXE_SCRIPT });
  const r = await p.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  }, selecteur);
  note("axe", `${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}

// ============================================================================================ Brouillon → Planche du projet
{
  note("brouillon", "projet sans Planche : le dessin est un brouillon local (note affichée)", (await page.locator("[data-planche-brouillon]").count()) === 1 && (await serveur()).planches.length === 0);
  await rect({ x: 0, y: 0, z: 0 }, "4;3");
  note("brouillon", "un rectangle dessiné dans le brouillon", (await etat()).faces === 1);
  await menu("nouvelle");
  note("menu", "« Nouvelle Planche… » : volet avec le nom proposé « Planche 1 » et la reprise du brouillon cochée", (await page.locator("[data-planche-volet-nom]").inputValue()) === "Planche 1" && (await page.locator("[data-planche-volet-brouillon]").isChecked()));
  await page.locator("[data-planche-volet-nom]").fill("Esquisse");
  await page.locator("[data-planche-volet-valider]").click();
  await page.waitForFunction(() => document.querySelector("[data-planche-menu-ouvrir]")?.getAttribute("data-planche-nom") === "Esquisse", null, { timeout: 10000 });
  await enregistre();
  let s = await serveur();
  note("planche", "Planche « Esquisse » créée dans le projet avec le brouillon (1 face), la note de brouillon disparaît", s.planches.length === 1 && s.planches[0].nom === "Esquisse" && s.planches[0].faces === 1 && (await page.locator("[data-planche-brouillon]").count()) === 0, JSON.stringify(s));
  const j0 = await journal();
  note("journal", "une entrée de journal « Nouvelle Planche… »", /Nouvelle Planche/.test(j0.at(-1) ?? ""), j0.at(-1));
  // Un pas = une commande = une entrée.
  await rect({ x: 6, y: 0, z: 0 }, "2;2");
  await enregistre();
  s = await serveur();
  const j1 = await journal();
  note("journal", "un rectangle de plus : la Planche du projet a 2 faces, une entrée « Rectangle »", s.planches[0].faces === 2 && j1.length === j0.length + 1 && /Rectangle/.test(j1.at(-1)), `${s.planches[0].faces} face(s) ; ${j1.at(-1)}`);
  await page.locator("[data-planche-vue]").focus(); await page.keyboard.press("Control+z"); await enregistre();
  s = await serveur();
  const j2 = await journal();
  note("journal", "Ctrl + Z : la Planche du projet revient à 1 face, entrée « Annulé : Rectangle »", s.planches[0].faces === 1 && j2.length === j1.length + 1 && /Annulé : Rectangle/.test(j2.at(-1)), `${s.planches[0].faces} face(s) ; ${j2.at(-1)}`);
  await page.keyboard.press("Control+y"); await enregistre();
  s = await serveur();
  note("journal", "Ctrl + Y : 2 faces à nouveau, entrée « Rétabli : Rectangle »", s.planches[0].faces === 2 && /Rétabli : Rectangle/.test((await journal()).at(-1)), (await journal()).at(-1));
  // Idempotence et révision périmée (API, même compte).
  const plId = s.planches[0].id;
  const rev = s.revision;
  const lotRenom = { requestId: `rq-${Date.now()}`, baseRevision: rev, contract: "atelier-commands/2", label: "Renommer", commands: [{ type: "planche.renommer", params: { id: plId, nom: "Esquisse 2" } }] };
  const a = await api("post", `/projects/${pid}/atelier/commands`, lotRenom);
  const b = await api("post", `/projects/${pid}/atelier/commands`, lotRenom);
  note("commandes", "rejouer le même requestId : revision inchangée, « rejouee »", a.status === 200 && b.status === 200 && b.body.rejouee === true && b.body.revision === a.body.revision, JSON.stringify({ a: a.body.revision, b: b.body }));
  const perime = await api("post", `/projects/${pid}/atelier/commands`, { ...lotRenom, requestId: `rq2-${Date.now()}` });
  note("commandes", "baseRevision périmée → 409 (conflit de révision)", perime.status === 409 && perime.body.motif === "revision", JSON.stringify(perime.body));
  // Le bus suit le journal du projet toutes les 60 s (pas de canal temps réel, D-172) : la réouverture suffit ici.
  await ouvrirPlanche();
  note("sync", "le renommage fait par un autre poste (API) est repris à la réouverture : la Planche « Esquisse 2 » s'ouvre avec ses 2 faces", (await nomAffiche()) === "Esquisse 2" && (await etat()).faces === 2, `${await nomAffiche()} ; ${JSON.stringify(await etat())}`);
  await capture("lot7-planche");
}

// ============================================================================================ Hors ligne : file locale puis reprise
{
  const avant = (await serveur()).planches[0].faces;
  await ctx.setOffline(true);
  await rect({ x: 0, y: 6, z: 0 }, "1;1");
  await page.waitForFunction(() => ["hors-ligne", "injoignable", "attente"].includes(document.querySelector(".barre-sync")?.dataset.etat ?? ""), null, { timeout: 10000 }).catch(() => {});
  const etatBarre = await page.locator(".barre-sync").getAttribute("data-etat");
  note("hors-ligne", "dessin hors ligne : la barre signale la file locale", ["hors-ligne", "injoignable", "attente"].includes(etatBarre), etatBarre);
  await ctx.setOffline(false);
  await enregistre(page);
  const apres = (await serveur()).planches[0].faces;
  note("hors-ligne", "retour du réseau : le lot est rejoué, la Planche du projet a une face de plus", apres === avant + 1, `${avant} → ${apres}`);
}

// ============================================================================================ Planches nommées : renommer, niveau, enregistrer sous, ouvrir, supprimer
{
  await menu("renommer");
  await page.locator("[data-planche-volet-nom]").fill("Esquisse A");
  const options = await page.locator("[data-planche-volet-niveau] option").allTextContents();
  await page.locator("[data-planche-volet-niveau]").selectOption({ index: 1 });
  await page.locator("[data-planche-volet-valider]").click(); await enregistre();
  let s = await serveur();
  note("planches", "Renommer + niveau de référence : nom et niveau enregistrés (P-1)", s.planches[0].nom === "Esquisse A" && !!s.planches[0].niveauId && (await nomAffiche()) === "Esquisse A", `${JSON.stringify(s.planches[0])} ; niveaux proposés : ${options.length}`);
  await menu("copier");
  await page.locator("[data-planche-volet-nom]").fill("Variante");
  await page.locator("[data-planche-volet-valider]").click();
  await page.waitForFunction(() => document.querySelector("[data-planche-menu-ouvrir]")?.getAttribute("data-planche-nom") === "Variante", null, { timeout: 10000 });
  await enregistre();
  s = await serveur();
  const variante = s.planches.find((p) => p.nom === "Variante");
  note("planches", "Enregistrer sous : 2 Planches, la copie a le même contenu et s'ouvre", s.planches.length === 2 && variante && variante.faces === s.planches.find((p) => p.nom === "Esquisse A").faces && variante.niveauId === s.planches[0].niveauId, JSON.stringify(s.planches.map((p) => `${p.nom}:${p.faces}`)));
  await rect({ x: 0, y: -4, z: 0 }, "1;1"); await enregistre();
  s = await serveur();
  note("planches", "un dessin dans la copie ne touche que la copie", s.planches.find((p) => p.nom === "Variante").faces === s.planches.find((p) => p.nom === "Esquisse A").faces + 1, JSON.stringify(s.planches.map((p) => `${p.nom}:${p.faces}`)));
  await page.locator("[data-planche-menu-ouvrir]").click();
  note("menu", "le menu liste les 2 Planches, la courante cochée", (await page.locator("[data-planche-ouvrir]").count()) === 2 && (await page.locator('[data-planche-ouvrir][aria-checked="true"]').textContent()).includes("Variante"));
  const idA = s.planches.find((p) => p.nom === "Esquisse A").id;
  await page.locator(`[data-planche-ouvrir="${idA}"]`).click();
  await page.waitForFunction(() => document.querySelector("[data-planche-menu-ouvrir]")?.getAttribute("data-planche-nom") === "Esquisse A", null, { timeout: 10000 });
  note("planches", "Ouvrir « Esquisse A » : son modèle est affiché (3 faces), historique local vide", (await etat()).faces === s.planches.find((p) => p.nom === "Esquisse A").faces && (await etat()).pas === 0, JSON.stringify(await etat()));
  // IFC et PNG.
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), menu("exporter-ifc")]);
  note("ifc", "Exporter la Planche en IFC : un fichier .ifc téléchargé", /\.ifc$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const ifcSeule = await api("get", `/projects/${pid}/atelier/planches/${idA}/export.ifc`);
  const nbProxy = (ifcSeule.text.match(/IFCBUILDINGELEMENTPROXY\(/g) ?? []).length;
  note("ifc", "IFC d'une Planche seule : un IfcBuildingElementProxy pour la géométrie libre, aucun mur", ifcSeule.status === 200 && nbProxy === 1 && !/IFCWALL\(/.test(ifcSeule.text), `${nbProxy} proxy(s)`);
  const ifcProjet = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
  note("ifc", "IFC du projet : les 2 Planches y sont (2 proxys « Planche »), avec les murs", ((ifcProjet.text.match(/,'Planche',/g) ?? []).length === 2) && /IFCWALL\(/.test(ifcProjet.text), String((ifcProjet.text.match(/,'Planche',/g) ?? []).length));
  const [png] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), menu("telecharger-png")]);
  note("png", "Télécharger la vue : un fichier .png", /\.png$/.test(png.suggestedFilename()), png.suggestedFilename());
  // Supprimer la variante (ouverte d'abord).
  const idV = variante.id;
  await page.locator("[data-planche-menu-ouvrir]").click(); await page.locator(`[data-planche-ouvrir="${idV}"]`).click();
  await page.waitForFunction(() => document.querySelector("[data-planche-menu-ouvrir]")?.getAttribute("data-planche-nom") === "Variante", null, { timeout: 10000 });
  await menu("supprimer");
  note("menu", "Supprimer : confirmation demandée", /Variante/.test(await page.locator("[data-planche-menu-volet]").textContent()));
  await page.locator("[data-planche-volet-valider]").click(); await enregistre();
  s = await serveur();
  note("planches", "Planche supprimée : 1 Planche reste, « Esquisse A » s'ouvre", s.planches.length === 1 && (await nomAffiche()) === "Esquisse A", JSON.stringify(s.planches.map((p) => p.nom)));
  await axe("Planche (ordinateur)", ".planche");
  // 3D : la Planche est représentée en lecture seule.
  await page.locator('.barre-mode button[aria-pressed]:has-text("3D")').click();
  await page.waitForFunction(() => (window.fadiMesures3D?.planches ?? 0) >= 1, null, { timeout: 20000 }).catch(() => {});
  note("3d", "mode 3D : au moins un maillage de Planche dessiné en lecture seule", (await page.evaluate(() => window.fadiMesures3D?.planches ?? 0)) >= 1, String(await page.evaluate(() => window.fadiMesures3D?.planches ?? 0)));
  await capture("lot7-3d");
}

// ============================================================================================ Téléphone
{
  const tel = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await ctx.storageState(), acceptDownloads: true });
  const p = await tel.newPage();
  p.on("pageerror", (e) => erreurs.push(`téléphone : ${e.message}`));
  await ouvrirPlanche(p);
  note("téléphone", "la Planche du projet s'ouvre (nom « Esquisse A », 3 faces)", (await nomAffiche(p)) === "Esquisse A" && (await etat(p)).faces === 3, JSON.stringify(await etat(p)));
  await p.locator("[data-planche-menu-ouvrir]").click();
  note("téléphone", "menu principal ouvert : Nouvelle Planche, Renommer, Enregistrer sous, Supprimer, IFC, PNG", (await p.locator("[data-planche-nouvelle]").isVisible()) && (await p.locator("[data-planche-exporter-ifc]").isVisible()));
  await p.keyboard.press("Escape");
  await rect({ x: 1, y: 1, z: 0 }, "1;1", p); await enregistre(p);
  note("téléphone", "un dessin au téléphone est enregistré dans le projet (4 faces)", (await serveur()).planches[0].faces === 4, String((await serveur()).planches[0].faces));
  await axe("Planche (téléphone)", ".planche", p);
  await p.screenshot({ path: `${OUT}/planche-lot7-telephone.png` });
  await tel.close();
}

note("page", "aucune erreur JavaScript", erreurs.length === 0, erreurs.slice(0, 3).join(" | "));
await browser.close();
const ko = resultats.filter((r) => !r.ok);
console.log(ko.length ? `\n${ko.length} échec(s) sur ${resultats.length} vérifications` : `\nRecette du lot 7 de la Planche : tout est vert (${resultats.length} vérifications).`);
process.exit(ko.length ? 1 : 0);
