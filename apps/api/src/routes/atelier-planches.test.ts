/**
 * Planches (cahier-planche lot 7, D-172) contre la vraie base : commandes `planche.*` validées par le serveur avec
 * les mêmes réducteurs purs, idempotence par `requestId`, 409 sur `baseRevision` périmée ou empreinte fausse, journal
 * (une opération = une entrée), annuler ; export IFC : un IfcBuildingElementProxy tessellé par objet, relu par web-ifc
 * (nombre de proxys et volume égaux à ceux de la Planche) ; export d'une Planche seule.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { ajouterRectangle, differencePlanche, empreintePlanche, grouper, modeleVide as plancheVide, pousserTirer, volume, type Modele as ModelePlanche } from "@parcours/planche-model";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";
import { lireIfc } from "../lib/atelier-ifc.js";

const app = createApp();
const CONTRAT = "atelier-commands/2";

async function resetDb() {
  await pool.query(
    "TRUNCATE volumes, atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, parcels, produced_documents, project_comments, project_members, programme_cases, programme_repartitions, project_steps, step_files, projects, sessions, users CASCADE",
  );
}
beforeAll(resetDb);
beforeEach(resetDb);
afterAll(async () => {
  await pool.end();
});

async function registerAndLogin(email: string) {
  const client = request.agent(app);
  const res = await client.post("/auth/register").send({ email, password: "correct-horse-battery" });
  expect(res.status).toBe(201);
  return client;
}
const enveloppe = (requestId: string, baseRevision: number, commands: unknown[], label = "test") => ({ requestId, baseRevision, contract: CONTRAT, label, commands });

/** Boîte 2 × 2 × 1 (volume 4 m³) groupée en composant solide. */
function boite(): ModelePlanche {
  const r = ajouterRectangle(plancheVide(), { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }).modele;
  const b = pousserTirer(r, Object.keys(r.racine.faces)[0]!, 1).modele;
  return grouper(b, [...Object.keys(b.racine.faces), ...Object.keys(b.racine.aretes)], { nom: "Boîte", genre: "composant" }).modele;
}

/** Volume d'un maillage triangulé fermé (somme des tétraèdres signés depuis l'origine). */
function volumeMaillage(positions: number[], indices: number[]): number {
  let v = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const [a, b, c] = [indices[k]! * 3, indices[k + 1]! * 3, indices[k + 2]! * 3];
    const ax = positions[a]!, ay = positions[a + 1]!, az = positions[a + 2]!;
    const bx = positions[b]!, by = positions[b + 1]!, bz = positions[b + 2]!;
    const cx = positions[c]!, cy = positions[c + 1]!, cz = positions[c + 2]!;
    v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
  }
  return Math.abs(v);
}

describe("Planches (lot 7) : commandes, journal, IFC", () => {
  it("créer depuis un brouillon, opérer par delta, idempotence, 409, journal, annuler, IFC relu par web-ifc", async () => {
    const client = await registerAndLogin("planche@example.com");
    const pid = (await client.post("/projects").send({ code: "P.7", name: "Planche test" })).body.id as string;
    const brouillon = boite();
    const r1 = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p1", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0.5, hauteur: 3 } }, { type: "planche.creer", params: { id: "pl1", nom: "Esquisse", niveauId: "rdc", modele: brouillon } }], "Nouvelle Planche"));
    expect(r1.status).toBe(200);
    expect(r1.body.revision).toBe(1);
    // Idempotence : le même requestId n'applique pas deux fois.
    const rejoue = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p1", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0.5, hauteur: 3 } }, { type: "planche.creer", params: { id: "pl1", nom: "Esquisse", niveauId: "rdc", modele: brouillon } }], "Nouvelle Planche"));
    expect(rejoue.body).toMatchObject({ revision: 1, rejouee: true });
    // Un pas de la Planche : un rectangle de plus (delta + empreinte).
    const apres = ajouterRectangle(brouillon, { x: 5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }).modele;
    const delta = differencePlanche(brouillon, apres)!;
    const r2 = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p2", 1, [{ type: "planche.operation", params: { id: "pl1", libelle: "Rectangle", delta, empreinteApres: empreintePlanche(apres) } }], "Rectangle"));
    expect(r2.status).toBe(200);
    expect(r2.body.revision).toBe(2);
    // baseRevision périmée → 409 ; empreinte fausse → 409 (précondition).
    const perime = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p3", 1, [{ type: "planche.operation", params: { id: "pl1", libelle: "Rectangle", delta, empreinteApres: empreintePlanche(apres) } }], "Rectangle"));
    expect(perime.status).toBe(409);
    expect(perime.body.motif).toBe("revision");
    const faux = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p4", 2, [{ type: "planche.operation", params: { id: "pl1", libelle: "Rectangle", delta: differencePlanche(apres, brouillon), empreinteApres: "0123456789abcdef" } }], "Faux"));
    expect(faux.status).toBe(409);
    expect(faux.body.motif).toBe("precondition");
    // Le modèle relu porte la Planche, son empreinte et un seul composant ; le journal compte une entrée par opération.
    const modele = (await client.get(`/projects/${pid}/atelier/model`)).body;
    expect(modele.revision).toBe(2);
    expect(modele.modele.definitions.pl1.classe).toBe("planche");
    expect(modele.modele.definitions.pl1.params.empreinte).toBe(empreintePlanche(apres));
    expect(Object.keys(modele.modele.definitions.pl1.params.modele.racine.faces)).toHaveLength(1);
    const journal = (await client.get(`/projects/${pid}/atelier/journal`)).body.entrees as { label: string }[];
    expect(journal.map((e) => e.label)).toEqual(["Nouvelle Planche", "Rectangle"]);
    // IFC du projet : un proxy tessellé par objet de la racine (la boîte solide, puis la géométrie libre), relu par web-ifc.
    const ifc = await client.get(`/projects/${pid}/documents/atelier/modele.ifc`);
    expect(ifc.status).toBe(200);
    const texte = ifc.text as string;
    expect((texte.match(/IFCBUILDINGELEMENTPROXY\(/g) ?? []).length).toBe(2);
    expect(texte).toContain("'Fadi_Planche'");
    const lecture = await lireIfc(new Uint8Array(Buffer.from(texte)));
    const proxys = lecture.produits.filter((p) => p.classe === "IfcBuildingElementProxy");
    expect(proxys).toHaveLength(2);
    const solide = proxys.find((p) => p.nom?.includes("Boîte"))!;
    expect(volumeMaillage(solide.maillage.positions, solide.maillage.indices)).toBeCloseTo(volume(brouillon, Object.keys(brouillon.racine.occurrences)[0]!) ?? 0, 6);
    // Altitude : la Planche est posée sous son niveau de référence (z = 0,5 m dans le repère du fichier).
    const zMin = Math.min(...solide.maillage.positions.filter((_, i) => i % 3 === 2));
    expect(zMin).toBeCloseTo(0.5, 6);
    // Export d'une Planche seule.
    const seule = await client.get(`/projects/${pid}/atelier/planches/pl1/export.ifc`);
    expect(seule.status).toBe(200);
    expect(seule.headers["content-disposition"]).toMatch(/Esquisse\.ifc/);
    expect(((seule.text as string).match(/IFCBUILDINGELEMENTPROXY\(/g) ?? []).length).toBe(2);
    expect((await client.get(`/projects/${pid}/atelier/planches/inconnue/export.ifc`)).status).toBe(404);
    // Annuler : la Planche revient à son état d'avant (empreinte du brouillon), une entrée de journal de plus.
    const annule = await client.post(`/projects/${pid}/atelier/commands/annuler`).send({ requestId: "a1", baseRevision: 2 });
    expect(annule.status).toBe(200);
    const apresAnnulation = (await client.get(`/projects/${pid}/atelier/model`)).body;
    expect(apresAnnulation.modele.definitions.pl1.params.empreinte).toBe(empreintePlanche(brouillon));
    // Renommer, copier (« Enregistrer sous »), supprimer.
    const r5 = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p5", 3, [{ type: "planche.renommer", params: { id: "pl1", nom: "Esquisse A", niveauId: null } }, { type: "planche.copier", params: { id: "pl2", source: "pl1", nom: "Esquisse B" } }], "Renommer et copier"));
    expect(r5.status).toBe(200);
    const doublon = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p6", 4, [{ type: "planche.creer", params: { nom: "esquisse b" } }], "Doublon"));
    expect(doublon.status).toBe(409);
    const r7 = await client.post(`/projects/${pid}/atelier/commands`).send(enveloppe("p7", 4, [{ type: "planche.supprimer", params: { id: "pl2" } }], "Supprimer"));
    expect(r7.status).toBe(200);
    const fin = (await client.get(`/projects/${pid}/atelier/model`)).body.modele;
    expect(Object.keys(fin.definitions).filter((id) => fin.definitions[id].classe === "planche")).toEqual(["pl1"]);
    expect(fin.definitions.pl1.params.nom).toBe("Esquisse A");
    expect(fin.definitions.pl1.params.niveauId).toBeNull();
  });
});
