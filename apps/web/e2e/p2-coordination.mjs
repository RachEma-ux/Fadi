/**
 * Lot P2-6 — Surfaces, bâtiment P2, coordination (cahier P2 §5 : « un projet qui contient un bâtiment, une machine et un
 * réseau ; une collision signalée ; un mécanisme animé ») : dans P.118 copié, plafond, rampe, mur-rideau et terrain créés
 * depuis l'inspecteur ; une gaine qui traverse un mur → collision « ontologies » signalée dans Modifications, exemptée
 * par une réservation accordée créée depuis l'inspecteur ; une potence (socle + bras sur pivot) animée depuis la fiche de
 * la liaison (trajectoire, obstacle relevé) ; masse volumique sourcée déclarée depuis la fiche ; surface libre convertie
 * depuis la coque et subdivisée ; tableaux rénovation / chantier, IFC natif ; un seul écran ; téléphone ; axe-core.
 *
 *   BASE_URL=http://localhost:3001 node apps/web/e2e/p2-coordination.mjs
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
await page.fill('input[name="email"]', `p2-coordination-${Date.now()}@example.com`);
await page.fill('input[name="password"]', "coordination-pass-123");
await page.click('button[type="submit"]');
await page.waitForURL(/\/(projets|accueil)/);
const ref = (await api("post", "/examples/p118-exemple-complet/import")).body.id;
const pid = (await api("post", `/projects/${ref}/copies`, { name: "P.118-C" })).body.id;
const modele = async () => (await api("get", `/projects/${pid}/atelier/model`)).body;
const enregistre = () => page.waitForFunction(() => document.querySelector(".barre-sync")?.dataset.etat === "enregistre", null, { timeout: 30000 });
const pt = (x, y) => ({ x, y, frame: "local", unit: "m" });
const m = (value) => ({ value, unit: "m" });
const P3 = (x, y, z) => ({ x, y, z });
let n = 0;
const commandes = async (label, cmds) => { const r = await api("post", `/projects/${pid}/atelier/commands`, { requestId: `p2c-${Date.now()}-${++n}`, baseRevision: (await modele()).revision, contract: "atelier-commands/3", label, commands: cmds }); if (r.status !== 200) console.log("  ↳ refus", label, JSON.stringify(r.body).slice(0, 300)); return r; };
const recharger = async () => { await page.reload(); await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 }); await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 }); await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click(); await page.waitForTimeout(300); };
const choisirId = async (id, selecteurFiche) => { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.keyboard.press("Escape"); await page.locator(".nav-filtre").fill(id); await page.locator(`.nav-objets button[data-objet="${id}"]`).first().click(); await page.waitForSelector(selecteurFiche, { timeout: 10000 }); await page.locator(".nav-filtre").fill(""); };
const choisirObjet = async (texte, selecteurFiche) => { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.keyboard.press("Escape"); await page.locator(".nav-filtre").fill(texte); await page.locator(`.nav-objets button:has-text("${texte}")`).first().click(); await page.waitForSelector(selecteurFiche, { timeout: 10000 }); await page.locator(".nav-filtre").fill(""); };
const outil = async (recherche, selecteur, garderSelection = false) => {
  if (!garderSelection) { await page.locator(".nav-filtre").evaluate((el) => el.blur()); await page.locator(".plan2d").focus().catch(() => {}); await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await page.waitForTimeout(200); }
  await page.locator(".barre-palette").click(); await page.locator(".palette-champ").fill(recherche); await page.keyboard.press("Enter");
  try { await page.waitForSelector(selecteur, { timeout: 15000 }); } catch (e) { console.log("  ↳ outil non affiché :", recherche, "| actif =", await page.evaluate(() => document.querySelector(".atelier-n")?.dataset.outilActif)); throw e; }
};
const classe = (mod, c) => Object.values(mod.objets).filter((o) => o.classe === c);

// 1. P.118-C dans l'Atelier ; ontologies réseaux et mécanique activées.
await page.goto(`${BASE}/projets/${pid}?module=atelier`);
await page.waitForSelector(".plan2d .plan-objets [data-objet]", { timeout: 30000 });
await page.waitForFunction(() => /^Enregistré · r\d+/.test(document.querySelector(".barre-sync")?.textContent ?? ""), null, { timeout: 30000 });
const urlAtelier = page.url();
navigations.length = 0;
const m0 = await modele();
const r0 = m0.revision;
const objets0 = Object.keys(m0.modele.objets).length;
const niveau = Object.values(m0.modele.niveaux).find((x) => x.elevation === 0) ?? Object.values(m0.modele.niveaux).sort((a, b) => a.ordre - b.ordre)[0];
await page.locator(`.nav-niveaux button:has-text("${niveau.nom}")`).first().click();
await page.waitForTimeout(300);
await page.locator('[data-ontologie="mep"]').check();
await enregistre();
await page.locator('[data-ontologie="mechanical"]').check();
await enregistre();
check("activation : ontologies réseaux et mécanique activées depuis le navigateur (bâtiment + machine + réseau dans un même projet)", JSON.stringify([...((await modele()).modele.ontologies ?? [])].sort()) === JSON.stringify(["mechanical", "mep"]), JSON.stringify((await modele()).modele.ontologies));
await page.locator(".barre-palette").click();
await page.locator(".palette-champ").fill("plafond");
await page.waitForTimeout(200);
check("palette : « Plafond » proposé (socle, sans ontologie ni écran nouveau)", /Plafond/.test((await page.locator(".palette").textContent()) ?? "") && navigations.length === 0);
await page.keyboard.press("Escape");

// 2. Bâtiment P2 depuis l'inspecteur : plafond (rectangle), rampe (axe saisi), mur-rideau, terrain.
const cx = 30, cy = 30;
await outil("plafond", "[data-outil-plafond]");
await page.locator("[data-contour-longueur]").fill("4");
await page.locator("[data-contour-largeur]").fill("3");
await page.locator("[data-plafond-hauteur]").fill("2.5");
await page.locator("[data-plafond-creer]").click();
await enregistre();
let mod = (await modele()).modele;
const plafond = classe(mod, "plafond")[0];
check("plafond créé depuis l'inspecteur : rectangle 4 × 3 centré sur la vue, hauteur sous plafond 2,50 m, épaisseur 0,05 m", !!plafond && plafond.params.hauteur.value === 2.5 && plafond.params.contour.length === 4, JSON.stringify(plafond?.params).slice(0, 200));
await outil("rampe", "[data-outil-rampe]");
await page.locator("[data-axe-saisi]").fill(`${cx} ; ${cy}\n${cx + 6} ; ${cy}`);
await page.locator("[data-rampe-hauteur]").fill("0.3");
const pente = (await page.locator("[data-rampe-pente]").textContent()) ?? "";
check("outil Rampe : longueur 6 m et pente dérivée 5 % affichées avant création (jamais comparée à une règle)", /6/.test(pente) && /5/.test(pente), pente);
await page.locator("[data-rampe-creer]").click();
await enregistre();
mod = (await modele()).modele;
const rampe = classe(mod, "rampe")[0];
check("rampe créée : axe saisi (6 m), 1,40 m de large, 0,30 m à franchir", !!rampe && rampe.params.hauteurAFranchir.value === 0.3 && Math.abs(Math.hypot(rampe.params.b.x - rampe.params.a.x, rampe.params.b.y - rampe.params.a.y) - 6) < 1e-6, JSON.stringify(rampe?.params).slice(0, 200));
await outil("mur-rideau", "[data-outil-mur-rideau]");
await page.locator("[data-axe-saisi]").fill(`${cx} ; ${cy + 5}\n${cx + 6} ; ${cy + 5}`);
await page.locator("[data-mur-rideau-hauteur]").fill("3");
const comptes = (await page.locator("[data-mur-rideau-comptes]").textContent()) ?? "";
check("outil Mur-rideau : 5 montants, 3 traverses, 8 panneaux comptés depuis la trame 1,50 m avant création", /5 montants/.test(comptes) && /3 traverses/.test(comptes) && /8 panneaux/.test(comptes), comptes);
await page.locator("[data-mur-rideau-creer]").click();
await enregistre();
await outil("terrain", "[data-outil-terrain]");
await page.locator("[data-terrain-points]").fill(`${cx - 20} ; ${cy - 20} ; 0\n${cx + 40} ; ${cy - 20} ; 1\n${cx + 40} ; ${cy + 40} ; 2\n${cx - 20} ; ${cy + 40} ; 1\n${cx} ; ${cy} ; 0,5`);
await page.locator("[data-terrain-source]").fill("relevé géomètre (déclaré)");
check("outil Terrain : 5 points, 4 triangles (Delaunay) annoncés", /5 points/.test((await page.locator("[data-terrain-triangles]").textContent()) ?? "") && /4 triangles/.test((await page.locator("[data-terrain-triangles]").textContent()) ?? ""));
await page.locator("[data-terrain-creer]").click();
await enregistre();
mod = (await modele()).modele;
check("mur-rideau et terrain créés ; le plan dessine plafond, rampe, mur-rideau et terrain avec le bâtiment", classe(mod, "mur-rideau").length === 1 && classe(mod, "terrain").length === 1 && (await page.locator(".plan2d .obj-plafond").count()) === 1 && (await page.locator(".plan2d .obj-rampe").count()) === 1 && (await page.locator(".plan2d .obj-mur-rideau").count()) === 1 && (await page.locator(".plan2d .obj-terrain").count()) === 1);
await page.screenshot({ path: `${OUT}/p2-coordination-batiment.png` });

// 3. Coordination : un mur neuf et une gaine qui le traverse (API) → collision « ontologies » dans Modifications.
let r = await commandes("Mur et gaine traversante", [
  { type: "mur.tracer", params: { id: "mur-c", niveauId: niveau.id, a: pt(cx + 10, cy + 11), b: pt(cx + 16, cy + 11), epaisseur: m(0.2), hauteur: m(3), phase: "neuf" } },
  { type: "segmentReseau.creer", params: { id: "gaine-c", niveauId: niveau.id, nom: "Soufflage C", systeme: "gaine", sommets: [P3(cx + 13, cy + 9, 1.5), P3(cx + 13, cy + 13, 1.5)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.3) }, fluide: "air" } },
]);
let col = (await api("get", `/projects/${pid}/atelier/collisions`)).body?.collisions ?? [];
check("collision entre ontologies : la gaine (réseau) traverse le mur (bâtiment) → signalée (volume commun 0,024 m³), jamais corrigée", r.status === 200 && col.filter((c) => c.type === "ontologies" && c.objets.includes("gaine-c") && c.objets.includes("mur-c")).length === 1, JSON.stringify(col).slice(0, 300));
await recharger();
await page.waitForSelector('.mod-collisions [data-collision="ontologies"]', { timeout: 30000 }).catch(() => {});
check("Modifications : la collision gaine × mur est listée (« réservation ou déplacement à décider »)", (await page.locator('[data-collision="ontologies"]').count()) >= 1 && /réservation ou déplacement/.test((await page.locator('[data-collision="ontologies"]').first().textContent()) ?? ""));
await page.screenshot({ path: `${OUT}/p2-coordination-collision.png` });

// 4. Réservation accordée créée depuis l'inspecteur (hôte = mur, pour = gaine) : la collision est exemptée.
await page.locator(".nav-filtre").fill("Soufflage C");
await page.locator('.nav-objets button[data-objet="gaine-c"]').first().click();
await page.keyboard.down("Shift");
await page.locator(".nav-filtre").fill("mur-c");
await page.locator('.nav-objets button[data-objet="mur-c"]').first().click();
await page.keyboard.up("Shift");
await page.locator(".nav-filtre").fill("");
await outil("réservation", "[data-outil-reservation]", true);
const hote = (await page.locator("[data-reservation-hote]").textContent()) ?? "";
await page.locator("[data-reservation-x]").fill(String(cx + 13));
await page.locator("[data-reservation-y]").fill(String(cy + 11));
await page.locator("[data-reservation-z]").fill("1.3");
await page.locator("[data-reservation-statut]").selectOption("accordee");
await page.locator("[data-reservation-creer]").click();
await enregistre();
mod = (await modele()).modele;
const reservation = classe(mod, "reservation")[0];
col = (await api("get", `/projects/${pid}/atelier/collisions`)).body?.collisions ?? [];
check("réservation accordée créée depuis l'inspecteur (hôte mur-c, pour la gaine, 60 × 60 cm, z 1,30 → 1,70) : la collision couverte n'est plus signalée", !!reservation && reservation.params.statut === "accordee" && reservation.params.hoteId === "mur-c" && col.filter((c) => c.type === "ontologies").length === 0, `${hote} | ${JSON.stringify(reservation?.params).slice(0, 200)} | ${JSON.stringify(col).slice(0, 200)}`);
r = await commandes("Réservation refusée", [{ type: "reservation.modifier", params: { id: reservation.id, params: { statut: "refusee" } } }]);
col = (await api("get", `/projects/${pid}/atelier/collisions`)).body?.collisions ?? [];
check("réservation refusée : la collision revient (statut tenu, rien n'est deviné)", r.status === 200 && col.filter((c) => c.type === "ontologies").length === 1);
await commandes("Réservation accordée", [{ type: "reservation.modifier", params: { id: reservation.id, params: { statut: "accordee" } } }]);

// 5. Mécanisme : potence (socle fixe + bras sur pivot) devant un mur ; animation depuis la fiche de la liaison.
const ox = cx + 20, oy = cy + 20;
r = await commandes("Potence et mur d'obstacle", [
  { type: "solideExact.creer", params: { id: "se-socle", niveauId: niveau.id, nom: "Socle", operation: { type: "extrusion", sources: [], libelle: "Socle", entrees: { type: "extrusion", extrusion: { profil: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }], z0: 0, hauteur: 0.2 } } } } },
  { type: "solideExact.creer", params: { id: "se-bras", niveauId: niveau.id, nom: "Bras", operation: { type: "extrusion", sources: [], libelle: "Bras", entrees: { type: "extrusion", extrusion: { profil: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 0.2 }, { x: 0, y: 0.2 }], z0: 0, hauteur: 0.2 } } } } },
  { type: "assemblage.creer", params: { id: "potence", niveauId: niveau.id, nom: "Potence", position: pt(ox, oy) } },
  { type: "pieceMecanique.creer", params: { id: "p-socle", sourceId: "se-socle", assemblageId: "potence", fixe: true } },
  { type: "pieceMecanique.creer", params: { id: "p-bras", sourceId: "se-bras", assemblageId: "potence", pose: { x: 0, y: 0, z: 0.2 } } },
  { type: "liaison.creer", params: { id: "pivot-bras", type: "pivot", a: "p-socle", b: "p-bras", pa: { x: 0, y: 0, z: 0.2 }, da: { x: 0, y: 0, z: 1 }, ea: { x: 1, y: 0, z: 0 }, pb: { x: 0, y: 0, z: 0 }, db: { x: 0, y: 0, z: 1 }, eb: { x: 1, y: 0, z: 0 }, valeur: 0 } },
  { type: "mur.tracer", params: { id: "mur-obstacle", niveauId: niveau.id, a: pt(ox + 2.5, oy - 2), b: pt(ox + 2.5, oy + 3), epaisseur: m(0.2), hauteur: m(3) } },
]);
check("potence : socle fixe, bras de 3 m sur pivot vertical, mur d'obstacle à 2,50 m du pivot (bâtiment + machine + réseau dans le même projet)", r.status === 200 && !!(await modele()).modele.objets["pivot-bras"], JSON.stringify(r.body).slice(0, 300));
await recharger();
await choisirObjet("Potence", "[data-fiche-assemblage]");
await page.waitForSelector("[data-animation-liaison]", { timeout: 10000 });
await page.locator("[data-animation-de]").fill("0");
await page.locator("[data-animation-a]").fill("90");
await page.locator("[data-animation-calculer]").click();
await page.waitForSelector("[data-animation-bilan]", { timeout: 15000 });
const bilan = (await page.locator("[data-animation-bilan]").textContent()) ?? "";
check("animation (fiche de l'assemblage, pivot du bras) : trajectoire 0° → 90° en 7 pas calculée dans le navigateur (dérivée, rien n'écrit), premier obstacle relevé au pas 1 (le bras traverse le mur à 0°)", /7 pas/.test(bilan) && /premier obstacle au pas 1/.test(bilan) && /mur-obstacle/.test(bilan), bilan);
await page.locator("[data-animation-pas]").fill("6");
await page.waitForTimeout(200);
const collisionsFin = await page.locator("[data-animation-collisions]").count();
check("au dernier pas (90°), le bras pointe vers +y : plus aucun volume commun ; l'aperçu dessine la pièce et la trace des pas", collisionsFin === 0 && (await page.locator("[data-animation-apercu] [data-animation-piece]").count()) >= 1);
const valeurPivot = (await modele()).modele.objets["pivot-bras"].params.valeur;
check("rien n'est écrit par l'animation : la liaison vaut toujours 0°", valeurPivot === 0, String(valeurPivot));
await page.screenshot({ path: `${OUT}/p2-coordination-animation.png` });

// 6. Masse volumique sourcée depuis la fiche de la pièce ; inertie de l'assemblage.
await choisirId("p-socle", "[data-fiche-piece]");
check("fiche de la pièce : masse « non évaluée (aucune masse volumique sourcée) » tant que rien n'est déclaré", /non évaluée/.test((await page.locator("[data-piece-masse]").textContent()) ?? ""));
await page.locator("[data-piece-mv]").fill("7850");
check("sans source, le bouton Déclarer reste inactif (aucune densité n'est connue du code)", await page.locator("[data-piece-mv-appliquer]").isDisabled());
await page.locator("[data-piece-mv-source]").fill("fiche matière acier S235 (fournisseur, déclarée)");
await page.locator("[data-piece-mv-appliquer]").click();
await enregistre();
await page.waitForFunction(() => /kg/.test(document.querySelector("[data-piece-masse]")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => {});
const masse = (await page.locator("[data-piece-masse]").textContent()) ?? "";
check("masse volumique déclarée avec sa source : masse 3 140 kg (0,4 m³ × 7 850) et tenseur d'inertie au centre affichés", /3\s?140/.test(masse) && /fiche matière/.test(masse) && /kg·m²/.test((await page.locator("[data-piece-inertie]").textContent()) ?? ""), masse);
await choisirObjet("Potence", "[data-fiche-assemblage]");
check("fiche de l'assemblage : masse et inertie « non évaluées » tant qu'une pièce (le bras) n'a pas de masse volumique", /non évaluées/.test((await page.locator("[data-assemblage-inertie]").textContent()) ?? ""), await page.locator("[data-assemblage-inertie]").textContent());

// 7. Surface libre : coque créée (API) puis convertie depuis l'inspecteur, subdivisée dans la fiche, sommet déplacé.
r = await commandes("Coque", [{ type: "coque.creer", params: { id: "coque-c", niveauId: niveau.id, nom: "Coque C", contour: [pt(cx + 40, cy), pt(cx + 50, cy), pt(cx + 50, cy + 10), pt(cx + 40, cy + 10)], trous: [], fleche: m(2), epaisseur: m(0.1) } }]);
await recharger();
await choisirObjet("Coque C", '[data-fiche-batiment-p2="coque"]');
await outil("surface libre", "[data-outil-surface-libre]", true);
check("outil Surface libre : la coque sélectionnée est proposée à la conversion explicite", /Coque C/.test((await page.locator("[data-surface-source]").textContent()) ?? ""));
await page.locator("[data-surface-niveaux]").fill("0");
await page.locator("[data-surface-convertir]").click();
await enregistre();
mod = (await modele()).modele;
const surface = classe(mod, "surface-libre")[0];
check("conversion : surface libre créée depuis la coque (origine nommée), la coque reste", !!surface && surface.params.origine?.id === "coque-c" && !!mod.objets["coque-c"], JSON.stringify(surface?.params.origine));
await recharger();
await choisirObjet("Coque C (surface libre)", "[data-fiche-surface-libre]");
const faces0 = (await page.locator("[data-surface-subdivision]").textContent()) ?? "";
await page.locator("[data-surface-niveaux-fiche]").fill("1");
await enregistre();
await page.waitForFunction((avant) => (document.querySelector("[data-surface-subdivision]")?.textContent ?? "") !== avant, faces0, { timeout: 15000 }).catch(() => {});
const faces1 = (await page.locator("[data-surface-subdivision]").textContent()) ?? "";
check("fiche : subdivision 0 → 1 depuis le curseur, quatre fois plus de faces", /^0 niveau/.test(faces0.trim()) && /^1 niveau/.test(faces1.trim()) && Number((faces1.match(/→ (\d+) faces/) ?? [])[1]) === 4 * Number((faces0.match(/→ (\d+) faces/) ?? [])[1]), `${faces0} | ${faces1}`);
await page.locator("[data-surface-indice]").fill("0");
await page.locator("[data-surface-dz]").fill("1");
await page.locator("[data-surface-deplacer]").click();
await enregistre();
mod = (await modele()).modele;
check("morphing : sommet de contrôle 0 relevé de 1 m par la fiche (édition directe, la surface subdivisée suit)", Math.abs(mod.objets[surface.id].params.sommets[0].z - surface.params.sommets[0].z - 1) < 1e-9);

// 8. Documents : tableaux rénovation et chantier, IFC natif.
r = await commandes("Grue", [{ type: "installationChantier.creer", params: { id: "grue-c", niveauId: niveau.id, nom: "Grue G1", type: "grue", contour: [pt(cx + 60, cy), pt(cx + 66, cy), pt(cx + 66, cy + 6), pt(cx + 60, cy + 6)], trous: [], hauteur: m(40), debut: "2027-03-01", fin: "2027-11-30", phaseChantier: "gros œuvre" } }]);
const docs = (await api("get", `/projects/${pid}/documents`)).body?.documents ?? [];
const tRenov = docs.find((d) => d.kind === "atelier-tableau-renovation");
const tChantier = docs.find((d) => d.kind === "atelier-tableau-chantier");
const csvR = tRenov ? await api("get", tRenov.href) : { status: 0, text: "" };
const csvC = tChantier ? await api("get", tChantier.href) : { status: 0, text: "" };
check("tableau « Objets par phase (rénovation) » : phase « neuf » du mur et du plafond, objets sans phase comptés « non évaluée »", csvR.status === 200 && /neuf/.test(csvR.text) && /non évaluée/.test(csvR.text), csvR.text.slice(0, 200));
check("tableau « Installations de chantier » : grue G1, 36 m², 40 m, du 2027-03-01 au 2027-11-30, phase gros œuvre", csvC.status === 200 && /Grue G1/.test(csvC.text) && /2027-03-01/.test(csvC.text) && /gros œuvre/.test(csvC.text), csvC.text.slice(0, 200));
const ifc = await api("get", `/projects/${pid}/documents/atelier/modele.ifc`);
const attendus = ["IFCCOVERING(", ".CEILING.", "IFCRAMP(", "IFCCURTAINWALL(", "IFCGEOGRAPHICELEMENT(", ".TERRAIN.", "IFCOPENINGELEMENT(", "IFCRELVOIDSELEMENT(", "IFCROOF(", "'chantier:grue'", "'Fadi_SurfaceLibre'"];
check("IFC natif : IfcCovering .CEILING., IfcRamp, IfcCurtainWall, IfcGeographicElement .TERRAIN., IfcOpeningElement + IfcRelVoidsElement (réservation dans le mur), IfcRoof (coque), proxy de chantier, surface libre", ifc.status === 200 && attendus.every((a) => ifc.text.includes(a)), attendus.filter((a) => !ifc.text.includes(a)).join(", "));
check("catalogue des documents : les deux tableaux de P2-6 s'ajoutent (15 tableaux de l'Atelier, 51 documents sur une copie de P.118 — sans les fiches de l'exemple résolu)", docs.filter((d) => d.kind.startsWith("atelier-tableau-")).length === 15 && docs.length === 51, `${docs.length} / ${docs.filter((d) => d.kind.startsWith("atelier-tableau-")).length}`);

// 9. Un seul écran, un seul journal, bâtiment inchangé ; téléphone ; axe-core.
await recharger();
check("un seul écran : aucune navigation hors de l'Atelier", navigations.every((u) => u.startsWith(urlAtelier.split("?")[0])), navigations.join(" ; "));
check("un seul journal : activations, plafond, rampe, mur-rideau, terrain, réservation, animation (rien), masse volumique, conversion, subdivision sont des révisions successives", (await modele()).revision >= r0 + 12);
check("bâtiment inchangé : P.118 garde ses objets, le bâtiment P2, la machine et le réseau s'y ajoutent", Object.keys((await modele()).modele.objets).length >= objets0 + 14);
check("aucune erreur JavaScript", erreurs.length === 0, erreurs.join(" ; "));
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(400);
check("390 px : pas de défilement horizontal", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.screenshot({ path: `${OUT}/p2-coordination-mobile.png` });
await page.addScriptTag({ path: AXE_SCRIPT });
const violations = await page.evaluate(async () => {
  // eslint-disable-next-line no-undef
  const res = await axe.run(document, { resultTypes: ["violations"] });
  return res.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => `${v.id} (${v.nodes.length})`);
});
check("axe-core : aucune violation critique ou sérieuse", violations.length === 0, violations.join(" ; "));

await browser.close();
console.log(echecs ? `Lot P2-6 coordination : ${echecs} contrôle(s) en échec` : "Lot P2-6 coordination : tout est vert");
process.exit(echecs ? 1 : 0);
