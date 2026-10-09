/**
 * Lot P2-6 (bâtiment P2, surfaces libres, coordination, cinématique et inerties) contre la vraie base : classes du
 * bâtiment P2 créées et exportées en IFC natif, surface libre convertie puis subdivisée, collision entre ontologies
 * (gaine × mur) signalée dans `/collisions` puis exemptée par une réservation accordée, contrôle de spécification,
 * tableaux « rénovation » et « chantier », masse volumique sourcée exigée, deux documents de plus au catalogue.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";

const app = createApp();
const CONTRAT = "atelier-commands/3";
async function resetDb() {
  await pool.query("TRUNCATE volumes, atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE");
}
beforeAll(resetDb);
beforeEach(resetDb);
afterAll(async () => { await pool.end(); });
async function registerAndLogin(email: string) {
  const client = request.agent(app);
  const res = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return client;
}
const enveloppe = (requestId: string, baseRevision: number, commands: unknown[], label = "test") => ({ requestId, baseRevision, contract: CONTRAT, label, commands });
const pt = (x: number, y: number) => ({ x, y, frame: "local", unit: "m" });
const m = (value: number) => ({ value, unit: "m" });
const P3 = (x: number, y: number, z: number) => ({ x, y, z });
const carre = (x: number, y: number, c: number) => [pt(x, y), pt(x + c, y), pt(x + c, y + c), pt(x, y + c)];

describe("Lot P2-6 — bâtiment P2, surfaces libres, coordination", () => {
  it("classes P2, surface libre, collision gaine × mur signalée puis exemptée par une réservation accordée, spécification, tableaux, IFC, masse volumique sourcée", async () => {
    const client = await registerAndLogin("coordination@example.com");
    const pid = (await client.post("/projects").send({ code: "P.C", name: "Coordination" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }, { type: "ontologie.activer", params: { nom: "mep" } }]);
    // Bâtiment P2 : plafond, coque, rampe, échelle, mur-rideau, terrain, installation de chantier ; mur et gaine qui le traverse.
    rev = await post("p2", rev, [
      { type: "mur.tracer", params: { id: "w", niveauId: "rdc", a: pt(-1, 1), b: pt(5, 1), epaisseur: m(0.2), hauteur: m(3), phase: "existant" } },
      { type: "plafond.creer", params: { id: "pl", niveauId: "rdc", nom: "Faux plafond", contour: carre(0, 2, 4), trous: [], hauteur: m(2.5), epaisseur: m(0.05), suspendu: true, phase: "neuf" } },
      { type: "coque.creer", params: { id: "cq", niveauId: "rdc", contour: carre(20, 0, 10), trous: [], fleche: m(2), epaisseur: m(0.1) } },
      { type: "rampe.creer", params: { id: "r", niveauId: "rdc", nom: "Rampe d'accès", a: pt(0, 10), b: pt(10, 10), largeur: m(1.4), hauteurAFranchir: m(0.5), epaisseur: m(0.15) } },
      { type: "echelle.creer", params: { id: "ec", niveauId: "rdc", a: pt(15, 10), b: pt(15, 11), hauteur: m(4), largeur: m(0.5), entraxeBarreaux: m(0.3), crinolineDepuis: m(2.2) } },
      { type: "murRideau.creer", params: { id: "mr", niveauId: "rdc", a: pt(0, 15), b: pt(6, 15), hauteur: m(3), entraxeMontants: m(1.5), entraxeTraverses: m(1.5), largeurProfil: m(0.05), profondeurProfil: m(0.1), epaisseurVitrage: m(0.028) } },
      { type: "terrain.creer", params: { id: "t", niveauId: "rdc", points: [P3(-20, -20, 0), P3(40, -20, 1), P3(40, 40, 2), P3(-20, 40, 1)], source: "relevé géomètre (déclaré)" } },
      { type: "installationChantier.creer", params: { id: "gr", niveauId: "rdc", nom: "Grue G1", type: "grue", contour: carre(50, 50, 6), trous: [], hauteur: m(40), debut: "2027-03-01", fin: "2027-11-30", phaseChantier: "gros œuvre" } },
      { type: "segmentReseau.creer", params: { id: "g", niveauId: "rdc", nom: "Soufflage", systeme: "gaine", sommets: [P3(2, -1, 1.5), P3(2, 3, 1.5)], section: { forme: "rectangulaire", largeur: m(0.4), hauteur: m(0.3) } } },
    ]);
    // Refus nommés : dates à l'envers, entraxe supérieur à la hauteur.
    const refusDates = await client.post(`${base}/commands`).send(enveloppe("rd", rev, [{ type: "installationChantier.creer", params: { id: "x", niveauId: "rdc", nom: "X", type: "acces", contour: carre(0, 0, 1), trous: [], debut: "2027-05-01", fin: "2027-01-01" } }]));
    expect(refusDates.status).not.toBe(200);
    expect(JSON.stringify(refusDates.body)).toMatch(/fin avant le début/);
    expect(JSON.stringify((await client.post(`${base}/commands`).send(enveloppe("re", rev, [{ type: "echelle.creer", params: { id: "x", niveauId: "rdc", a: pt(0, 0), b: pt(0, 1), hauteur: m(2), largeur: m(0.5), entraxeBarreaux: m(2.5) } }]))).body)).toMatch(/entraxe/);
    // Coordination : la gaine traverse le mur → collision « ontologies » (réseau / bâtiment) ; l'objet n'a pas bougé.
    let col = (await client.get(`${base}/collisions`)).body.collisions as { type: string; objets: string[]; message: string }[];
    const onto = col.filter((c) => c.type === "ontologies");
    expect(onto).toHaveLength(1);
    expect(onto[0]!.objets).toEqual(["g", "w"]);
    expect(onto[0]!.message).toMatch(/réservation ou déplacement à décider/);
    // Réservation demandée : rien ne change ; accordée dans le mur, couvrant le passage : la collision est exemptée.
    rev = await post("rv", rev, [{ type: "reservation.creer", params: { id: "rv", niveauId: "rdc", nom: "Passage gaine", contour: carre(1.7, 0.8, 0.6), trous: [], hoteId: "w", pourId: "g", z: 1.3, hauteur: m(0.4), statut: "demandee" } }]);
    col = (await client.get(`${base}/collisions`)).body.collisions;
    expect(col.filter((c) => c.type === "ontologies")).toHaveLength(1);
    rev = await post("acc", rev, [{ type: "reservation.modifier", params: { id: "rv", params: { statut: "accordee" } } }]);
    col = (await client.get(`${base}/collisions`)).body.collisions;
    expect(col.filter((c) => c.type === "ontologies")).toHaveLength(0);
    expect(JSON.stringify((await client.post(`${base}/commands`).send(enveloppe("rh", rev, [{ type: "reservation.creer", params: { id: "x", niveauId: "rdc", contour: carre(0, 0, 1), trous: [], hoteId: "g", hauteur: m(0.4) } }]))).body)).toMatch(/hôte/);
    // Contrôle de spécification : une spécification « gaine » existe, la gaine ne la suit pas.
    rev = await post("spec", rev, [{ type: "specification.definir", params: { id: "spec-g", nom: "Gaines galva", systeme: "gaine", materiau: "acier galvanisé" } }]);
    col = (await client.get(`${base}/collisions`)).body.collisions;
    expect(col.filter((c) => c.type === "specification").map((c) => c.message)).toEqual([expect.stringMatching(/sans spécification/)]);
    // Surface libre : conversion explicite depuis la coque (maillage de contrôle), subdivision 2, sommet déplacé ; la coque reste.
    rev = await post("sl", rev, [{ type: "surfaceLibre.depuisObjet", params: { id: "sl", sourceId: "cq", niveaux: 0 } }]);
    let modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["sl"].params.origine).toEqual({ classe: "coque", id: "cq" });
    expect(modele.objets["cq"]).toBeDefined();
    const n0 = modele.objets["sl"].params.sommets.length as number;
    rev = await post("sub", rev, [{ type: "surfaceLibre.subdiviser", params: { id: "sl", niveaux: 1 } }, { type: "surfaceLibre.deplacerSommet", params: { id: "sl", index: 0, dz: 1 } }]);
    modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["sl"].params.niveaux).toBe(1);
    expect(modele.objets["sl"].params.sommets.length).toBe(n0);
    // Mécanique : masse volumique sans source refusée ; avec source, acceptée.
    rev = await post("meca", rev, [
      { type: "ontologie.activer", params: { nom: "mechanical" } },
      { type: "solideExact.creer", params: { id: "se", niveauId: "rdc", nom: "Socle", operation: { type: "extrusion", sources: [], libelle: "Socle", entrees: { type: "extrusion", extrusion: { profil: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], z0: 0, hauteur: 1 } } } } },
      { type: "assemblage.creer", params: { id: "a1", niveauId: "rdc", nom: "Potence", position: pt(30, 30) } },
      { type: "pieceMecanique.creer", params: { id: "p1", sourceId: "se", assemblageId: "a1", fixe: true } },
    ]);
    const sansSource = await client.post(`${base}/commands`).send(enveloppe("mv0", rev, [{ type: "pieceMecanique.modifier", params: { id: "p1", params: { masseVolumique: { valeur: 7850 } } } }]));
    expect(sansSource.status).not.toBe(200);
    expect(JSON.stringify(sansSource.body)).toMatch(/source/);
    rev = await post("mv", rev, [{ type: "pieceMecanique.modifier", params: { id: "p1", params: { masseVolumique: { valeur: 7850, source: "fiche matière (déclarée)" } } } }]);
    modele = (await client.get(`${base}/model`)).body.modele;
    expect(modele.objets["p1"].params.masseVolumique).toEqual({ valeur: 7850, source: "fiche matière (déclarée)" });
    // Documents : tableaux « rénovation » (par phase) et « chantier » ; IFC natif des classes P2.
    const docs = (await client.get(`/projects/${pid}/documents`)).body.documents as { kind: string; href: string }[];
    const renovation = docs.find((d) => d.kind === "atelier-tableau-renovation")!;
    const chantier = docs.find((d) => d.kind === "atelier-tableau-chantier")!;
    expect(renovation && chantier).toBeTruthy();
    const csvR = (await client.get(renovation.href)).text;
    expect(csvR).toContain("existant");
    expect(csvR).toContain("neuf");
    expect(csvR).toContain("non évaluée");
    const csvC = (await client.get(chantier.href)).text;
    expect(csvC).toContain("Grue G1");
    expect(csvC).toContain("2027-03-01");
    expect(csvC).toContain("gros œuvre");
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    for (const cls of ["IFCCOVERING(", ".CEILING.", "IFCROOF(", ".FREEFORM.", "IFCRAMP(", "IFCSTAIR(", ".LADDER.", "IFCCURTAINWALL(", "IFCGEOGRAPHICELEMENT(", ".TERRAIN.", "IFCOPENINGELEMENT(", "IFCRELVOIDSELEMENT(", "'chantier:grue'", "'Fadi_SurfaceLibre'", "'Fadi_Reservation'"]) expect(ifc.text, cls).toContain(cls);
    const copie = (await client.post("/projects").send({ code: "P.C2", name: "Réimport" })).body.id;
    const imp = await client.post(`/projects/${copie}/atelier/import-ifc`).set("Content-Type", "application/octet-stream").set("X-File-Name", "p2-6.ifc").send(Buffer.from(ifc.text));
    expect(imp.status).toBe(200);
    const importes = Object.values((await client.get(`/projects/${copie}/atelier/model`)).body.modele.objets as Record<string, { classe: string; params: { ifcClasse?: string } }>).filter((o) => o.classe === "objet-importe");
    expect(importes.some((o) => o.params.ifcClasse === "IfcCurtainWall")).toBe(true);
    expect(importes.some((o) => o.params.ifcClasse === "IfcRamp")).toBe(true);
  }, 60_000);
});
