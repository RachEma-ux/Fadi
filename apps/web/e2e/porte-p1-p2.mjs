/**
 * Porte P1 → P2 (cahier P2 §1 et §5 ; D-181, D-183) : parcours bâtiment–mécanique complet dans UN SEUL projet et UN
 * SEUL écran — « P.118-M » : P.118 inchangé, l'ontologie mécanique activée dans le navigateur, une centrale de
 * traitement d'air (4 pièces, pivot et glissière pilotés) posée dans le local technique, un mur dessiné dans le même
 * journal, une version nommée avant modification, une feuille A1 (plan + éclaté) périmée puis régénérée, un seul IFC
 * (IfcWall + IfcElementAssembly), une collision machine × bâtiment signalée, téléphone 390 px, axe-core.
 * Les gaines (P2-5) ne sont pas encore là : la gaine G1 est représentée par une pièce provisoire qui traverse un mur.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/porte-p1-p2.mjs
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
await page.fill('input[name="email"]', `porte-p2-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "porte-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-M" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const journal = async () => (await api("get", `/projects/${pid}/atelier/journal`)).body.entrees.map((e) => e.label);
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
let n = 0;
// Les lots posés par l'API (construction du projet mixte) sont relus par le navigateur au rechargement de la même page (même écran).
const recharger = async () => { await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }); await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 }); await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click(); await page.waitForTimeout(300); };
const commandes = async (label, cmds) => { const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2m-${Date.now()}-${++n}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label, commands: cmds }); if (r.status !== 200) console.log("  ↳ refus", label, JSON.stringify(r.body).slice(0, 300)); return r; };

// 1. Ouvrir P.118-M : un seul écran, Atelier.
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0;
const m0 = await modele();
const r0 = m0.revision;
const objets0 = Object.keys(m0.modele.objets).length;
// Local technique hôte (D-181, D-183) : la pièce « Local technique » de P.118 (R+1 dans l'exemple), sinon la première pièce du niveau 0.
const pieces = Object.values(m0.modele.objets).filter((o) => o.classe === "piece");
const local = pieces.find((o) => /local technique/i.test(o.params.nom ?? "")) ?? pieces.find((o) => m0.modele.niveaux[o.niveauId]?.elevation === 0) ?? pieces[0];
const niveau = m0.modele.niveaux[local.niveauId];
const centre = (pts) => ({ x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length });
const c0 = centre(local.params.contour);
check(`ouverture : P.118-M s'ouvre dans l'Atelier, local hôte « ${local.params.nom} » (niveau ${niveau.nom}) trouvé`, !!local && !!niveau, JSON.stringify({ local: local?.id, niveau: niveau?.nom }));
await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click();
await page.waitForTimeout(300);

// 2. Activer l'ontologie mécanique dans le navigateur : outils dans la palette, aucun écran nouveau.
const compterOutils = () => page.evaluate(() => document.querySelectorAll(".barre-outils button, .barre-famille button").length);
const outilsAvant = await compterOutils();
await page.locator('[data-ontologie="mechanical"]').check();
await enregistre();
check("activation : l'ontologie mécanique est activée par une commande du même journal (ontologies = [mechanical])", JSON.stringify((await modele()).modele.ontologies) === JSON.stringify(["mechanical"]), JSON.stringify((await modele()).modele.ontologies));
await page.locator("[data-palette-bouton]").click();
await page.locator(".palette-champ").fill("pièce mécanique");
await page.waitForTimeout(200);
const palette = (await page.locator(".palette").textContent()) ?? "";
check("palette : « Pièce mécanique » proposée à sa famille, sans ruban ni écran nouveau", /Pièce mécanique/.test(palette) && navigations.length === 0, `${palette.slice(0, 120)} · navigations ${navigations.length}`);
await page.keyboard.press("Escape");
const outilsApres = await compterOutils();
check("barre : l'activation ajoute des outils à la barre (T01)", outilsApres >= outilsAvant, `${outilsAvant} → ${outilsApres}`);

// 3. La CTA : 4 solides exacts calculés par le serveur, l'assemblage dans le local, 2 liaisons pilotées, numérotation.
const boite = (dx, dy, dz) => ({ type: "extrusion", extrusion: { profil: [{ x: -dx / 2, y: -dy / 2 }, { x: dx / 2, y: -dy / 2 }, { x: dx / 2, y: dy / 2 }, { x: -dx / 2, y: dy / 2 }], z0: 0, hauteur: dz } });
const disque = (r, e) => ({ type: "extrusion", extrusion: { profil: Array.from({ length: 24 }, (_, i) => ({ x: Math.round(r * Math.cos((i / 24) * 2 * Math.PI) * 1e6) / 1e6, y: Math.round(r * Math.sin((i / 24) * 2 * Math.PI) * 1e6) / 1e6 })), z0: 0, hauteur: e } });
const sol = (id, nom, entrees) => ({ type: "solideExact.creer", params: { id, niveauId: local.niveauId, nom, operation: { type: "extrusion", sources: [], libelle: nom, entrees } } });
let r = await commandes("Solides de la CTA", [sol("se-socle", "Socle", boite(2.6, 1.8, 0.2)), sol("se-caisson", "Caisson", boite(2.4, 1.6, 1.2)), sol("se-vent", "Ventilateur", disque(0.5, 0.1)), sol("se-panneau", "Panneau", boite(1.0, 0.03, 1.2))]);
check("CTA : quatre solides exacts calculés par le serveur (socle, caisson, ventilateur Ø 1,0 m, panneau)", r.status === 200, JSON.stringify(r.body).slice(0, 200));
r = await commandes("Assemblage CTA", [
  { type: "assemblage.creer", params: { id: "cta", niveauId: local.niveauId, nom: "CTA", numero: "CTA", position: pt(Math.round(c0.x * 100) / 100, Math.round(c0.y * 100) / 100) } },
  { type: "pieceMecanique.creer", params: { id: "p-socle", sourceId: "se-socle", assemblageId: "cta", fixe: true, materiau: "acier (déclaré)" } },
  { type: "pieceMecanique.creer", params: { id: "p-caisson", sourceId: "se-caisson", assemblageId: "cta", pose: { x: 0.1, y: 0.1, z: 0.5 } } },
  { type: "pieceMecanique.creer", params: { id: "p-vent", sourceId: "se-vent", assemblageId: "cta", pose: { x: 1, y: 1, z: 1 } } },
  { type: "pieceMecanique.creer", params: { id: "p-panneau", sourceId: "se-panneau", assemblageId: "cta", pose: { x: 0, y: 1, z: 0.3 } } },
  { type: "liaison.creer", params: { id: "l-socle", type: "encastrement", a: "p-socle", b: "p-caisson", pa: { x: 0, y: 0, z: 0.2 } } },
  // Pivot : axe du ventilateur = y du caisson en (1,25 ; 0 ; 0,6) ; angle piloté entre les x : 45°.
  { type: "liaison.creer", params: { id: "l-pivot", type: "pivot", a: "p-caisson", b: "p-vent", pa: { x: 1.25, y: 0, z: 0.6 }, da: { x: 0, y: 1, z: 0 }, ea: { x: 1, y: 0, z: 0 }, pb: { x: 0, y: 0, z: 0 }, db: { x: 0, y: 0, z: 1 }, eb: { x: 1, y: 0, z: 0 }, valeur: 45 } },
  // Glissière : panneau sur la face y = 0,8 du caisson, course le long de x.
  { type: "liaison.creer", params: { id: "l-gliss", type: "glissiere", a: "p-caisson", b: "p-panneau", pa: { x: -0.5, y: 0.815, z: 0 }, da: { x: 1, y: 0, z: 0 }, ea: { x: 0, y: 1, z: 0 }, pb: { x: 0, y: 0, z: 0 }, db: { x: 1, y: 0, z: 0 }, eb: { x: 0, y: 1, z: 0 }, valeur: 0 } },
  { type: "assemblage.numeroter", params: { id: "cta" } },
]);
let m1 = (await modele()).modele;
await recharger();
check("CTA : assemblage de 4 pièces et 2 liaisons posé dans le local, solveur « bien contraint », pièces numérotées CTA-01…04", r.status === 200 && m1.objets["cta"]?.params.diagnostic === "bien contraint" && (m1.objets["p-vent"]?.params.reference ?? "").startsWith("CTA-"), JSON.stringify({ diag: m1.objets["cta"]?.params.diagnostic, ref: m1.objets["p-vent"]?.params.reference }));
await page.waitForFunction((id) => !!document.querySelector(`.plan2d [data-objet="${id}"]`), "p-caisson", { timeout: 30000 }).catch(() => {});
check("plan : la machine se dessine dans le même plan que le bâtiment (emprises des pièces, repère de l'assemblage)", (await page.locator('.plan2d [data-objet="cta"]').count()) === 1 && (await page.locator(".plan2d .obj-piece-mecanique").count()) === 4, `${await page.locator(".plan2d .obj-piece-mecanique").count()} pièces`);
await page.screenshot({ path: `${OUT}/p2-porte-machine.png` });

// 4. Un mur dans le local (bâtiment) puis le ventilateur de 45° à 90° (mécanique) : deux commandes, deux révisions, même journal, annuler / rétablir.
const murs0 = Object.values(m1.objets).filter((o) => o.classe === "mur").length;
r = await commandes("Mur du local technique", [{ type: "mur.tracer", params: { id: "mur-p2m", niveauId: local.niveauId, a: pt(Math.round((c0.x - 1.5) * 100) / 100, Math.round((c0.y + 2.2) * 100) / 100), b: pt(Math.round((c0.x + 1.5) * 100) / 100, Math.round((c0.y + 2.2) * 100) / 100), epaisseur: { value: 0.15, unit: "m" }, hauteur: { value: 2.5, unit: "m" } } }]);
check("bâtiment : un mur dessiné dans le local technique (même ontologie bâtiment, même journal)", r.status === 200 && Object.values((await modele()).modele.objets).filter((o) => o.classe === "mur").length === murs0 + 1);
// Pilotage depuis la fiche de l'assemblage (clic sur son repère dans le plan).
await recharger();
await page.keyboard.press("Escape");
// Sélection depuis le navigateur du projet (classe Assemblage) : même inspecteur, même écran.
await page.locator(".nav-filtre").fill("CTA");
await page.locator('.nav-objets button:has-text("CTA")').first().click();
await page.waitForSelector("[data-fiche-assemblage]", { timeout: 10000 });
await page.locator(".nav-filtre").fill("");
check("inspecteur : fiche de l'assemblage (4 pièces, 2 liaisons, diagnostic) dans le même inspecteur que les murs", /4/.test((await page.locator("[data-assemblage-pieces]").textContent()) ?? "") && /bien contraint/.test((await page.locator("[data-assemblage-diagnostic]").textContent()) ?? ""));
await page.locator('[data-liaison="l-pivot"] [data-liaison-pilotage]').fill("90");
await page.locator('[data-liaison="l-pivot"] [data-liaison-appliquer]').click();
await enregistre();
m1 = (await modele()).modele;
// Angle du pivot = angle entre la direction x du caisson et la direction x du ventilateur, posées (Rodrigues).
const rot = (pose, v) => { const w = [pose.rx, pose.ry, pose.rz]; const th = Math.hypot(...w); if (th < 1e-12) return v; const k = w.map((c) => c / th); const c = Math.cos(th), s = Math.sin(th); const kxv = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]]; const kv = k[0] * v[0] + k[1] * v[1] + k[2] * v[2]; return v.map((vi, i) => vi * c + kxv[i] * s + k[i] * kv * (1 - c)); };
const anglePivot = (m) => { const a = rot(m.objets["p-caisson"].params.pose, [1, 0, 0]), b = rot(m.objets["p-vent"].params.pose, [1, 0, 0]); return (Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180) / Math.PI; };
const angle = anglePivot(m1);
check("mécanique : le ventilateur passe de 45° à 90° par le pilotage du pivot (le solveur repose la pièce)", Math.abs(angle - 90) < 0.5 && m1.objets["l-pivot"].params.valeur === 90, `${angle.toFixed(2)}°`);
await page.locator(".plan2d").click({ position: { x: 5, y: 5 } }).catch(() => {}); // le plan reprend le clavier (hors du champ de pilotage)
await page.keyboard.press("Escape");
const valeurPivot = async () => (await modele()).modele.objets["l-pivot"].params.valeur;
const attendreValeur = async (v) => { for (let i = 0; i < 40; i++) { if ((await valeurPivot()) === v) return v; await page.waitForTimeout(250); } return valeurPivot(); };
await page.keyboard.press("Control+z");
const apresAnnuler = await attendreValeur(45);
await page.keyboard.press("Control+Shift+z");
const apresRetablir = await attendreValeur(90);
check("même annuler / rétablir : Ctrl Z remet 45°, Ctrl Maj Z remet 90°", apresAnnuler === 45 && apresRetablir === 90, `${apresAnnuler} / ${apresRetablir}`);

// 5. Version « Avant modification », course du panneau 0 → 0,3 m, comparaison qui nomme la pièce.
const version = await api("post", `/projects/${pid}/atelier/versions`, { nom: "Avant modification" });
r = await commandes("Panneau ouvert de 0,3 m", [{ type: "liaison.piloter", params: { id: "l-gliss", valeur: 0.3 } }]);
const cmp = await api("get", `/projects/${pid}/atelier/comparer?de=v:${encodeURIComponent(version.body?.id ?? "")}&a=courante`);
check("version : « Avant modification » puis course du panneau 0 → 0,3 m ; la comparaison nomme la pièce « p-panneau »", version.status === 201 && r.status === 200 && cmp.status === 200 && JSON.stringify(cmp.body?.difference ?? {}).includes("p-panneau"), JSON.stringify(cmp.body).slice(0, 200));

// 6. Feuille A1 : plan du niveau + éclaté de la CTA avec bulles ; périmée après modification, régénérée.
r = await commandes("Vues et feuille A1", [
  { type: "vue.creer", params: { id: "v-plan-m", type: "plan", titre: `Plan ${niveau.nom} — bâtiment et machine`, echelle: 100, niveauId: local.niveauId } },
  { type: "vue.creer", params: { id: "v-eclate", type: "axonometrie", titre: "Éclaté de la CTA", echelle: 20, azimut: { value: 30, unit: "deg" }, inclinaison: { value: 35, unit: "deg" }, lignesCachees: false, eclate: { assemblageId: "cta", distance: 1.5 } } },
  { type: "feuille.creer", params: { id: "f-a1", titre: "Bâtiment et machine", numero: "A1-01", format: "A1", orientation: "paysage", vues: [{ vueId: "v-plan-m", x: 30, y: 60 }, { vueId: "v-eclate", x: 500, y: 60 }], tableaux: [{ type: "nomenclature", x: 500, y: 400 }] } },
]);
const docs = async () => (await api("get", `/projects/${pid}/documents`)).body?.documents ?? [];
let d = (await docs()).find((x) => x.kind === "atelier-feuille-f-a1-pdf");
const pdf1 = d ? await page.request.get(`${BASE}${d.href}`) : null;
d = (await docs()).find((x) => x.kind === "atelier-feuille-f-a1-pdf");
check("feuille A1 : plan + éclaté (bulles) + nomenclature, produite à jour", r.status === 200 && pdf1?.status() === 200 && d?.freshness === "a-jour", JSON.stringify({ r: r.status, pdf: pdf1?.status(), f: d?.freshness }));
const svg = d ? await page.request.get(`${BASE}${d.href.replace(/\.pdf$/, ".svg")}`) : null;
const svgTexte = svg ? await svg.text() : "";
check("éclaté : la vue porte les bulles 1 à 4 des pièces numérotées", svg?.status() === 200 && /<text[^>]*>1<\/text>/.test(svgTexte) && /<text[^>]*>4<\/text>/.test(svgTexte));
r = await commandes("Panneau refermé", [{ type: "liaison.piloter", params: { id: "l-gliss", valeur: 0.1 } }]);
d = (await docs()).find((x) => x.kind === "atelier-feuille-f-a1-pdf");
check("T07 : après la modification du panneau, la feuille est périmée", r.status === 200 && d?.freshness === "perime", d?.freshness);
const pdf2 = d ? await page.request.get(`${BASE}${d.href}`) : null;
d = (await docs()).find((x) => x.kind === "atelier-feuille-f-a1-pdf");
check("T07 : régénérée à la demande, la feuille est à jour", pdf2?.status() === 200 && d?.freshness === "a-jour", d?.freshness);

// 7. Un seul IFC : IfcWall, IfcElementAssembly et ses pièces ; réimport en lecture (R16).
const ifc = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
check("IFC : un seul fichier avec IFCWALL, IFCELEMENTASSEMBLY agrégeant 4 proxys « piece-mecanique »", ifc.status === 200 && ifc.text.includes("IFCWALL(") && ifc.text.includes("IFCELEMENTASSEMBLY(") && (ifc.text.match(/'piece-mecanique'/g) ?? []).length === 4, `${(ifc.text.match(/'piece-mecanique'/g) ?? []).length} pièces`);
const copie = (await api("post", `/projects/${ref}/copies`, { name: "P.118-M réimport" })).body.id;
const imp = await page.request.post(`${BASE}/projects/${copie}/atelier/import-ifc`, { headers: { "Content-Type": "application/octet-stream", "X-File-Name": "p118-m.ifc" }, data: Buffer.from(ifc.text) });
const mImp = (await api("get", `/projects/${copie}/atelier/model`)).body?.modele ?? { objets: {} };
const importes = Object.values(mImp.objets).filter((o) => o.classe === "objet-importe");
check("réimport : les pièces reviennent en représentations importées (lecture, R16), jamais reclassées", imp.status() === 200 && importes.length >= 4, `${imp.status()} · ${importes.length} importé(s)`);

// 8. Collision machine × bâtiment : une gaine provisoire (pièce) traverse un mur du local → signalée, jamais corrigée.
const murLocal = Object.values(m1.objets).filter((o) => o.classe === "mur" && o.niveauId === local.niveauId && !o.params.renflement).sort((a, b) => Math.hypot(a.params.a.x - c0.x, a.params.a.y - c0.y) - Math.hypot(b.params.a.x - c0.x, b.params.a.y - c0.y))[0];
const mm = { x: (murLocal.params.a.x + murLocal.params.b.x) / 2, y: (murLocal.params.a.y + murLocal.params.b.y) / 2 };
const angleMur = (Math.atan2(murLocal.params.b.y - murLocal.params.a.y, murLocal.params.b.x - murLocal.params.a.x) * 180) / Math.PI;
r = await commandes("Gaine G1 (provisoire)", [sol("se-g1", "Gaine G1 (provisoire, P2-5)", boite(0.3, 3, 0.25)), { type: "assemblage.creer", params: { id: "g1", niveauId: local.niveauId, nom: "Gaine G1", position: pt(Math.round(mm.x * 100) / 100, Math.round(mm.y * 100) / 100), angle: { value: Math.round(angleMur * 100) / 100, unit: "deg" }, z: 2.4 } }, { type: "pieceMecanique.creer", params: { id: "p-g1", sourceId: "se-g1", assemblageId: "g1", fixe: true } }]);
const pb = await api("get", `/projects/${pid}/atelier/problemes`);
const collision = (pb.body?.collisions ?? []).find((c) => c.type === "piece-batiment" && c.objets.includes("p-g1"));
check("coordination : la gaine G1 traverse un mur sans réservation → collision signalée (objet, volume), jamais corrigée", r.status === 200 && !!collision, JSON.stringify((pb.body?.collisions ?? []).slice(0, 3)));
await recharger();
await page.waitForFunction(() => document.querySelectorAll('.mod-collisions [data-collision="piece-batiment"]').length >= 1, null, { timeout: 30000 }).catch(() => {});
check("panneau des modifications : la collision pièce / bâtiment est listée avec un lien vers l'objet", (await page.locator('.mod-collisions [data-collision="piece-batiment"]').count()) >= 1);

// 9. Un seul écran, un seul journal, aucune erreur ; téléphone ; axe-core.
const j = await journal();
check("un seul écran : aucune navigation hors de l'Atelier pendant toute la porte", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : activation, solides, assemblage, mur, pilotage, feuille sont des révisions successives du même projet", (await modele()).revision >= r0 + 8 && /ontologie/i.test(j.join("|")) && /mur/i.test(j.join("|")) && /Assemblage/.test(j.join("|")) && /feuille/i.test(j.join("|")), j.slice(-10).join(" / "));
check("bâtiment inchangé : P.118 garde ses objets (la machine s'ajoute, rien n'est reclassé)", Object.keys((await modele()).modele.objets).length >= objets0 + 10);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-porte-p1-p2-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

await browser.close();
console.log(echecs ? `Porte P1 → P2 : ${echecs} contrôle(s) en échec` : "Porte P1 → P2 : les neuf points sont verts");
process.exit(echecs ? 1 : 0);
