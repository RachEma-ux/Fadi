/**
 * Recette du lot 7 (versions, variantes, publication, collaboration) dans un vrai navigateur : version nommée créée,
 * comparée (mise en évidence 3D), restaurée ; variante créée, modifiée, fusionnée par rejeu validé ; conflit explicite
 * entre deux comptes ; publication figée avec ses documents, restaurable ; verrou fin refusant le lot d'un autre
 * compte (423) ; collision d'architecture signalée ; comparaison d'une vue entre versions ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/atelier-versions.mjs
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3001";
const OUT = process.env.OUT ?? "docs/atelier/captures";
const AXE_SCRIPT = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
const CONTRAT = "atelier-commands/1";
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
page.on("dialog", (d) => void d.accept());

async function axe(nom, selecteur) {
  await page.addScriptTag({ path: AXE_SCRIPT });
  const r = await page.evaluate(async (sel) => {
    // eslint-disable-next-line no-undef
    const res = await axe.run(document.querySelector(sel) ?? document, { resultTypes: ["violations"] });
    return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length}) ${v.nodes[0]?.target}`);
  }, selecteur);
  check(`axe ${nom} : aucune violation critique ou sérieuse`, r.length === 0, r.join(" ; "));
}
const api = async (methode, chemin, data, contexte = page.request) => {
  const r = await contexte[methode](`${BASE}${chemin}`, data === undefined ? undefined : { data });
  return { status: r.status(), body: await r.json().catch(() => null) };
};
const modele = async (pid) => (await api("get", `/projects/${pid}/atelier/model`)).body;
const lot = (pid, requestId, baseRevision, commands, contexte) => api("post", `/projects/${pid}/atelier/commands`, { requestId, baseRevision, contract: CONTRAT, label: requestId, commands }, contexte);
const ouvrir = async (pid) => {
  await page.goto(`${BASE}/projets/${pid}?module=atelier`);
  await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
  await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
};
const info = async () => {
  // Message de l'action (enfant direct du panneau), pas les alertes des sous-blocs (conflits d'une fusion…).
  await page.waitForSelector(".versions > .ver-info, .versions > .ver-erreur", { timeout: 60000 });
  return (await page.locator(".versions > .ver-info, .versions > .ver-erreur").first().textContent()) ?? "";
};
const m = (value) => ({ value, unit: "m" });

// Compte, exemple P.118, copie de travail (le tronc).
const email = `versions-${Date.now()}@example.com`;
await page.goto(`${BASE}/inscription`);
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "versions-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const reference = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${reference}/copies`, { name: "P.118 · versions" })).body.id;
const depart = await modele(pid);
const murs = Object.values(depart.modele.objets).filter((o) => o.classe === "mur");
const murA = murs[0];
const murB = murs[1];
await ouvrir(pid);

// Version nommée.
await page.locator("#ver-nom").fill("Esquisse");
await page.locator('.ver-form:has(#ver-nom) button[type="submit"]').click();
const texteVersion = await info();
await page.waitForSelector('.ver-liste [data-version] .ver-nom:text-is("Esquisse")', { timeout: 15000 }).catch(() => {});
check("version nommée « Esquisse » enregistrée à la révision courante et listée", /Version « Esquisse » enregistrée \(révision 1\)/.test(texteVersion) && (await page.locator('.ver-liste [data-version] .ver-nom:text-is("Esquisse")').count()) === 1, texteVersion);
await axe("panneau des versions", ".versions");

// Une modification, puis comparer et mettre en évidence.
check("modification du tronc (épaisseur d'un mur)", (await lot(pid, `mod-${Date.now()}`, 1, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.42) } } }])).status === 200);
await ouvrir(pid);
await page.locator('.ver-liste [data-version] button:has-text("Comparer")').first().click();
await page.waitForSelector('.ver-diff[data-diff="differences"]', { timeout: 20000 });
check("comparer à la version : 1 objet modifié (epaisseur)", /0 ajouté\(s\), 1 modifié\(s\), 0 supprimé\(s\)/.test(await page.locator(".ver-diff").textContent()) && (await page.locator(".ver-diff").textContent()).includes("epaisseur"));
await page.locator(".ver-diff .ver-evidence").click();
await page.waitForSelector(".vue3d canvas", { timeout: 30000 });
check("mise en évidence en 3D : vue 3D ouverte, l'objet modifié sélectionné", (await page.locator(".etat-selection").textContent()).includes(murA.id));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/7-version-evidence-3d.png` });
await page.locator('.barre-mode button:has-text("Plan")').click();

// Restaurer la version.
await page.locator('.ver-liste [data-version] button:has-text("Restaurer")').first().click();
check("restaurer : nouvelle révision, modèle identique à la version", /restaurée \(révision 3\)/.test(await info()) && (await api("get", `/projects/${pid}/atelier/comparer?de=v:${(await api("get", `/projects/${pid}/atelier/versions`)).body.versions[0].id}`)).body.difference.identiques === true);

// Variante : création, modification, fusion.
await page.locator("#var-nom").fill("Mezzanine ouverte");
await mesurer("créer une variante du P.118 (copie intégrale reliée au tronc)", async () => {
  await page.locator('.ver-form:has(#var-nom) button[type="submit"]').click();
  await page.waitForURL((u) => !u.toString().includes(pid) && /\/projets\/proj_/.test(u.toString()), { timeout: 60000 });
});
const vid = page.url().split("?")[0].split("/").pop();
await page.waitForSelector(".ver-tronc", { timeout: 30000 });
check("variante ouverte : rattachée à son tronc, bifurcation à la révision 3", /Variante « Mezzanine ouverte » de .* \(révision 3\) · ouverte/.test(await page.locator(".ver-tronc p").first().textContent()));
const base = (await api("get", `/projects/${vid}/atelier/variantes`)).body.tronc.baseRevision;
check("modification dans la variante (deux murs)", (await lot(vid, `var-${Date.now()}`, base, [{ type: "objet.modifier", params: { id: murA.id, params: { hauteur: m(2.9) } } }, { type: "objet.modifier", params: { id: murB.id, params: { epaisseur: m(0.3) } } }])).status === 200);
// Un second compte, éditeur du tronc, modifie le mur B : conflit explicite.
const second = await browser.newContext();
const autre = second.request;
await autre.post(`${BASE}/auth/register`, { data: { email: `versions-autre-${Date.now()}@example.com`, password: "versions-pass-456" } });
const moi = (await api("get", "/auth/me")).body;
void moi;
const emailAutre = (await (await autre.get(`${BASE}/auth/me`)).json()).email;
check("second compte invité éditeur du tronc", (await api("post", `/projects/${pid}/members`, { email: emailAutre, role: "editeur" })).status === 201);
const revTronc = (await modele(pid)).revision;
check("le second compte modifie le mur B dans le tronc", (await lot(pid, `autre-${Date.now()}`, revTronc, [{ type: "objet.modifier", params: { id: murB.id, params: { hauteur: m(3.4) } } }], autre)).status === 200);
await ouvrir(vid);
await page.locator('.ver-tronc button:has-text("Préparer la fusion")').click();
await page.waitForSelector(".ver-fusion", { timeout: 30000 });
check("essai de fusion : 1 lot, 2 modifications, 1 conflit explicite (mur B, modifié des deux côtés)", (await page.locator(".ver-fusion").getAttribute("data-conflits")) === "1" && /1 lot\(s\) à rejouer .* 2 modification\(s\)/.test(await page.locator(".ver-fusion p").first().textContent()) && (await page.locator(".ver-conflits li").first().textContent()).includes(murB.id));
await page.screenshot({ path: `${OUT}/7-variante-fusion.png` });
await page.locator('.ver-fusion button.primaire').click();
const texteFusion = await info();
check("fusion « la variante prévaut » confirmée : rejouée dans le tronc", /Variante fusionnée dans le tronc \(1 lot\(s\)/.test(texteFusion), texteFusion);
const troncApres = (await modele(pid)).modele;
check("tronc : les deux murs ont les valeurs de la variante ; statut « fusionnée »", troncApres.objets[murA.id].params.hauteur.value === 2.9 && troncApres.objets[murB.id].params.epaisseur.value === 0.3 && (await api("get", `/projects/${pid}/atelier/variantes`)).body.variantes[0].statut === "fusionnee");

// Mise à jour de la variante depuis le tronc (D-136) : les lots du tronc absents de la variante y sont rejoués.
{
  const revT = (await modele(pid)).revision;
  check("le tronc avance après la fusion (mur A)", (await lot(pid, `tronc-maj-${Date.now()}`, revT, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.27) } } }], autre)).status === 200);
  await ouvrir(vid);
  await page.locator("[data-preparer-mise-a-jour]").click();
  await page.waitForSelector("[data-mise-a-jour]", { timeout: 30000 });
  const n = Number(await page.locator("[data-mise-a-jour]").getAttribute("data-mise-a-jour"));
  await page.locator("[data-appliquer-mise-a-jour]").click();
  const texte = await info();
  const variante = (await modele(vid)).modele;
  check("variante mise à jour depuis le tronc : lots repris, valeurs du tronc dans la variante", n === 2 && /Variante mise à jour depuis le tronc \(2 lot\(s\)/.test(texte) && variante.objets[murA.id].params.epaisseur.value === 0.27 && variante.objets[murB.id].params.hauteur.value === 3.4, `${n} · ${texte}`);
}

// Publication.
await ouvrir(pid);
await page.locator("#pub-nom").fill("Dossier PC");
await mesurer("publier (version figée + documents produits et rangés en volumes)", async () => {
  await page.locator('.ver-form:has(#pub-nom) button[type="submit"]').click();
  await page.waitForSelector(".ver-publication a", { timeout: 60000 });
});
const liens = await page.locator(".ver-publication a").count();
check("publication figée : documents listés (tableaux, quantités, maquette IFC), catalogues inchangés", liens >= 8 && (await page.locator(".ver-publication").textContent()).includes("Catalogues de règles inchangés"));
const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('.ver-publication a:has-text("IFC")').click()]);
const contenu = readFileSync(await dl.path());
const pub = (await api("get", `/projects/${pid}/atelier/publications`)).body.publications[0];
const detail = (await api("get", `/projects/${pid}/atelier/publications/${pub.id}`)).body;
const ifcPublie = detail.documents.find((d) => d.kind === "atelier-ifc");
check("fichier publié restitué à l'octet (SHA-256 = identifiant du volume)", createHash("sha256").update(contenu).digest("hex") === ifcPublie.volumeId);
await page.screenshot({ path: `${OUT}/7-publication.png` });
const revPub = (await modele(pid)).revision;
check("la conception continue après la publication", (await lot(pid, `apres-pub-${Date.now()}`, revPub, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.5) } } }])).status === 200);
await ouvrir(pid);
await page.locator(`.ver-liste [data-publication="${pub.id}"] button.lien`).click();
await page.waitForSelector(".ver-publication button", { timeout: 20000 });
await page.locator('.ver-publication button:has-text("Restaurer cette publication")').click();
check("publication restaurée avec ses dépendances : état de la version publiée", /Publication « Dossier PC » restaurée/.test(await info()) && (await api("get", `/projects/${pid}/atelier/comparer?de=v:${pub.versionId}`)).body.difference.identiques === true);

// Verrou fin.
// Le mur A est sur son niveau : on l'active, puis on le choisit dans la liste des objets du niveau.
await page.locator(`.nav-niveaux button:has-text("${depart.modele.niveaux[murA.niveauId].nom}")`).first().click();
await page.waitForSelector(`.nav-objets button[data-objet="${murA.id}"]`, { state: "attached", timeout: 15000 });
await page.evaluate((id) => document.querySelector(`.nav-objets button[data-objet="${id}"]`)?.click(), murA.id);
await page.waitForFunction((id) => (document.querySelector(".etat-selection")?.textContent ?? "").includes(id), murA.id, { timeout: 10000 });
await page.locator('.versions button:has-text("Verrouiller la sélection")').click();
check("verrou posé sur l'objet sélectionné, listé « vous »", /1 objet\(s\) verrouillé\(s\)/.test(await info()) && (await page.locator(`.ver-liste [data-verrou="${murA.id}"]`).textContent()).includes("vous"));
const revV = (await modele(pid)).revision;
const refus = await lot(pid, `autre-verrou-${Date.now()}`, revV, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.33) } } }], autre);
check("le second compte est refusé sur l'objet verrouillé (423, auteur et échéance)", refus.status === 423 && refus.body.erreur === "verrou" && refus.body.verrous[0].auteur === email);
await page.locator(`.ver-liste [data-verrou="${murA.id}"] button:has-text("Lever")`).click();
await page.waitForFunction((id) => !document.querySelector(`.ver-liste [data-verrou="${id}"]`), murA.id, { timeout: 10000 });
check("verrou levé : le second compte peut modifier", (await lot(pid, `autre-apres-${Date.now()}`, revV, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.33) } } }], autre)).status === 200);

// Réservation par zone (D-143) : une zone autour du mur A, réservée depuis le panneau ; le second compte est refusé.
{
  const P = (x, y) => ({ x, y, frame: "local", unit: "m" });
  const { a, b } = murA.params;
  const [x0, x1, y0, y1] = [Math.min(a.x, b.x) - 0.5, Math.max(a.x, b.x) + 0.5, Math.min(a.y, b.y) - 0.5, Math.max(a.y, b.y) + 0.5];
  const rz = await lot(pid, `zone-e2e-${Date.now()}`, (await modele(pid)).revision, [{ type: "objet.creer", params: { id: "zone-e2e", classe: "zone", niveauId: murA.niveauId, params: { contour: [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)], trous: [], nom: "Zone e2e" } } }]);
  await ouvrir(pid);
  await page.locator(`.nav-niveaux button:has-text("${depart.modele.niveaux[murA.niveauId].nom}")`).first().click();
  await page.waitForSelector(`.nav-objets button[data-objet="zone-e2e"]`, { state: "attached", timeout: 15000 });
  await page.evaluate(() => document.querySelector(`.nav-objets button[data-objet="zone-e2e"]`)?.click());
  await page.waitForFunction(() => (document.querySelector(".etat-selection")?.textContent ?? "").includes("zone-e2e"), null, { timeout: 10000 });
  await page.locator("[data-verrouiller-zone]").click();
  await page.waitForSelector('.ver-liste [data-verrou="zone:zone-e2e"]', { timeout: 10000 });
  const refusZ = await lot(pid, `autre-zone-${Date.now()}`, (await modele(pid)).revision, [{ type: "objet.modifier", params: { id: murA.id, params: { epaisseur: m(0.34) } } }], autre);
  const libelle = await page.locator('.ver-liste [data-verrou="zone:zone-e2e"]').textContent();
  check("zone réservée : un objet dedans est refusé au second compte (423, clé de zone)", rz.status === 200 && refusZ.status === 423 && refusZ.body.verrous?.[0]?.cle === "zone:zone-e2e" && libelle.includes("Zone e2e"), `${rz.status} · ${refusZ.status} · ${libelle}`);
  await page.locator('.ver-liste [data-verrou="zone:zone-e2e"] button:has-text("Lever")').click();
  await page.waitForFunction(() => !document.querySelector('.ver-liste [data-verrou="zone:zone-e2e"]'), null, { timeout: 10000 });
  const notes = (await (await autre.get(`${BASE}/notifications`)).json()).items.filter((x) => x.kind === "verrou").map((x) => x.text);
  check("prise et libération de la zone notifiées au second compte", notes.some((t) => /a réservé la zone Zone e2e/.test(t)) && notes.some((t) => /a libéré la zone Zone e2e/.test(t)), notes.slice(0, 2).join(" | "));
}

// Collision d'architecture : deux fenêtres qui se chevauchent dans un mur (le plus long, pour que les deux tiennent :
// l'ordre des objets d'une copie ne suit pas celui du fichier).
const longueur = (o) => Math.hypot(o.params.b.x - o.params.a.x, o.params.b.y - o.params.a.y);
const murHote = murs.filter((o) => o.id !== murA.id).sort((x, y) => longueur(y) - longueur(x))[0];
const revC = (await modele(pid)).revision;
const lc = await lot(pid, `collision-${Date.now()}`, revC, [
  { type: "ouverture.poser", params: { id: "e2e-f1", classe: "fenetre", murHoteId: murHote.id, position: 0.5, largeur: m(0.6), hauteur: m(1), allege: m(1) } },
  { type: "ouverture.poser", params: { id: "e2e-f2", classe: "fenetre", murHoteId: murHote.id, position: 0.5 + 0.2 / longueur(murHote), largeur: m(0.6), hauteur: m(1), allege: m(1) } },
]);
await ouvrir(pid);
await page.waitForSelector(".mod-collisions li", { timeout: 30000 }).catch(() => {});
check("collision signalée : ouvertures qui se chevauchent, menant à l'objet", lc.status === 200 && (await page.locator('.mod-collisions [data-collision="ouvertures-chevauchantes"]').count()) >= 1, `${lc.status} ${JSON.stringify(lc.body).slice(0, 200)} · ${await page.locator(".mod-collisions").count()}`);

// Comparaison d'une vue entre versions (mode Documents).
const revD = (await modele(pid)).revision;
const niveauRdc = murHote.niveauId;
await lot(pid, `vue-${Date.now()}`, revD, [{ type: "vue.creer", params: { id: "e2e-plan", type: "plan", titre: "Plan comparé", echelle: 100, niveauId: niveauRdc } }]);
await api("post", `/projects/${pid}/atelier/versions`, { nom: "Avant reprise" });
const revE = (await modele(pid)).revision;
await lot(pid, `reprise-${Date.now()}`, revE, [{ type: "objet.supprimer", params: { id: "e2e-f2" } }]);
await ouvrir(pid);
await page.locator('.barre-mode button:has-text("Documents")').click();
await page.locator('[data-vue="e2e-plan"]').click();
await page.waitForSelector('[data-detail="vue"] .docs-svg svg', { timeout: 60000 });
await page.locator('[data-comparer="version"]').selectOption({ label: `Avant reprise (r${revE})` });
await page.waitForSelector("[data-comparaison-resultat]", { timeout: 60000 });
const res = (await page.locator("[data-comparaison-resultat]").getAttribute("data-comparaison-resultat")).split(":").map(Number);
check("vue comparée entre versions : traits retirés (la fenêtre supprimée) en rouge", res[0] > 0, res.join(":"));
await page.locator(".docs-comparaison").scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/7-vue-comparee.png` });

// Téléphone : panneau « problèmes » avec versions.
await page.locator('.barre-mode button:has-text("Plan")').click();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
await page.locator('.atelier-n-onglets button').last().click();
await page.waitForTimeout(300);
check("390 px : versions accessibles dans le panneau des modifications, sans défilement horizontal", (await page.locator(".versions").isVisible()) && (await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)));
await page.screenshot({ path: `${OUT}/7-versions-mobile.png` });

check("aucune erreur JavaScript", erreursPage.length === 0, erreursPage.join(" | "));
console.log(JSON.stringify({ mesures }));
await second.close();
await browser.close();
console.log(echecs ? `${echecs} échec(s)` : "Recette versions : tout est vert");
process.exit(echecs ? 1 : 0);
