/**
 * Lot P2-8 (automatisation P2) contre la vraie base : graphes de génération contrôlée (intégrés + définitions du
 * projet) proposés par la même boucle que l'assistant — règle du graphe non tenue → proposition échouée nommée ; règles
 * tenues → proposition, rien d'écrit, puis accord → exécution validée ; règles par ontologie contrôlées après chaque
 * commande (problèmes rattachés aux objets, jamais corrigés).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { pool } from "../db/client.js";

const app = createApp();
const CONTRAT = "atelier-commands/3";
async function resetDb() {
  await pool.query("TRUNCATE volumes, atelier_outbox, atelier_commands, atelier_site, atelier_problemes, atelier_references, atelier_groupes, atelier_calques, atelier_definitions, atelier_relations, atelier_objets, atelier_niveaux, parcels, project_members, projects, users, atelier_scripts, atelier_propositions CASCADE");
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

describe("Lot P2-8 — graphes de génération contrôlée et règles par ontologie", () => {
  it("graphes : liste, règle non tenue (échec nommé, rien d'écrit), proposition puis accord, graphe du projet, droits", async () => {
    const client = await registerAndLogin("graphes@example.com");
    const pid = (await client.post("/projects").send({ code: "P.G", name: "Graphes" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[], label = id) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, label));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body.revision as number;
    };
    let rev = await post("niv", 0, [{ type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } }]);
    const liste = await client.get(`${base}/graphes`);
    expect(liste.status).toBe(200);
    expect(liste.body.integres.map((g: { id: string }) => g.id)).toEqual(["trame-poteaux-controlee", "ossature-de-mur"]);
    expect(liste.body.projet).toEqual([]);
    expect((await client.get(`${base}/graphes`)).body.integres[0].noeuds.length).toBe(17);
    // Règle du graphe non tenue : proposition échouée nommée, aucune commande, révision inchangée.
    const refus = await client.post(`${base}/graphes/trame-poteaux-controlee/proposer`).send({ parametres: { niveauId: "rdc", nx: 2, ny: 2, px: 0.2, py: 5, section: 0.3, hauteur: 3 }, niveauId: "rdc" });
    expect(refus.status).toBe(201);
    expect(refus.body.statut).toBe("echouee");
    expect(refus.body.commandes).toEqual([]);
    expect(refus.body.explication).toMatch(/section d'un poteau doit rester inférieure au pas en x/);
    expect(refus.body.iterations[0].resultat).toBe("refuse");
    expect((await client.post(`${base}/assistant/propositions/${refus.body.id}/accepter`).send({ requestId: "acc-0", baseRevision: rev })).status).toBe(409);
    // Règles tenues : proposition (essai à blanc), rien d'écrit ; accord → exécution par les routes de l'assistant.
    const prop = await client.post(`${base}/graphes/trame-poteaux-controlee/proposer`).send({ parametres: { niveauId: "rdc", nx: 2, ny: 2, px: 4, py: 5, hauteur: 3 }, niveauId: "rdc" });
    expect(prop.status, JSON.stringify(prop.body)).toBe(201);
    expect(prop.body.statut).toBe("proposee");
    expect(prop.body.generateur).toBe("graphes-fadi/1");
    expect(prop.body.regle).toBe("graphe:trame-poteaux-controlee");
    expect(prop.body.commandes).toHaveLength(4);
    expect(prop.body.effets.crees).toHaveLength(4);
    expect(prop.body.hypotheses.map((h: { texte: string }) => h.texte)).toEqual(expect.arrayContaining(["Section (m) = 0.3", "emprise = 20", "nombre = 4"]));
    expect(prop.body.graphe).toEqual({ id: "trame-poteaux-controlee", nom: "Trame de poteaux contrôlée", version: 1 });
    expect((await client.get(`/projects/${pid}`)).body.modelRevision).toBe(rev);
    const acc = await client.post(`${base}/assistant/propositions/${prop.body.id}/accepter`).send({ requestId: "acc-1", baseRevision: rev });
    expect(acc.status, JSON.stringify(acc.body)).toBe(200);
    rev = acc.body.revision;
    const modele = (await client.get(`${base}/model`)).body.modele;
    expect((Object.values(modele.objets) as { classe: string }[]).filter((o) => o.classe === "poteau")).toHaveLength(4);
    const journal = (await client.get(`${base}/journal`)).body.entrees;
    expect(journal.at(-1).label).toBe("Assistant : Graphe « Trame de poteaux contrôlée » v1");
    expect((await client.get(`${base}/assistant/propositions`)).body.propositions.find((p: { id: string }) => p.id === prop.body.id).statut).toBe("acceptee");
    // Graphe du projet : définition versionnée avec le modèle, listée, proposable ; refus nommé d'un graphe mal câblé.
    const noeuds = [
      { id: "n", type: "parametre", nom: "nb", libelle: "Nombre", typeParametre: "entier", defaut: 2, x: 0, y: 0 },
      { id: "i", type: "serie", variable: "i", de: 1, a: "nb", x: 1, y: 0 },
      { id: "t", type: "commande", commande: { type: "texte.creer", params: { niveauId: "rdc", position: pt(0, 0), texte: "Repère {i}" } }, x: 2, y: 0 },
    ];
    const malCable = await client.post(`${base}/commands`).send(enveloppe("g-ko", rev, [{ type: "graphe.definir", params: { id: "reperes", nom: "Repères", noeuds, liens: [{ de: "n", a: "i" }] } }]));
    expect(malCable.status).toBe(400);
    expect(JSON.stringify(malCable.body)).toMatch(/« i » \(nœud i\) non reliée au nœud t/);
    rev = await post("g-ok", rev, [{ type: "graphe.definir", params: { id: "reperes", nom: "Repères", description: "n repères", noeuds, liens: [{ de: "n", a: "i" }, { de: "i", a: "t" }] } }]);
    expect((await client.get(`${base}/graphes`)).body.projet).toMatchObject([{ id: "reperes", nom: "Repères", version: 1, origine: "projet" }]);
    const p2 = await client.post(`${base}/graphes/reperes/proposer`).send({ parametres: { nb: 3 } });
    expect(p2.body.statut).toBe("proposee");
    expect(p2.body.commandes.map((c: { params: { texte: string } }) => c.params.texte)).toEqual(["Repère 1", "Repère 2", "Repère 3"]);
    expect((await client.post(`${base}/graphes/inconnu/proposer`).send({})).status).toBe(404);
    // Droits : un lecteur ne propose pas.
    const lecteur = await registerAndLogin("graphes-lecteur@example.com");
    expect((await client.post(`/projects/${pid}/members`).send({ email: "graphes-lecteur@example.com", role: "lecteur" })).status).toBe(201);
    expect((await lecteur.post(`${base}/graphes/reperes/proposer`).send({ parametres: { nb: 1 } })).status).toBe(403);
    expect((await lecteur.get(`${base}/graphes`)).status).toBe(200);
  });

  it("règles par ontologie : problèmes « regle » rattachés aux objets après chaque commande, servis par /problemes ; rien n'est corrigé", async () => {
    const client = await registerAndLogin("regles@example.com");
    const pid = (await client.post("/projects").send({ code: "P.R", name: "Règles" })).body.id as string;
    const base = `/projects/${pid}/atelier`;
    const post = async (id: string, rev: number, commands: unknown[]) => {
      const r = await client.post(`${base}/commands`).send(enveloppe(id, rev, commands, id));
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      return r.body;
    };
    let rev = (await post("niv", 0, [
      { type: "niveau.creer", params: { id: "rdc", nom: "RDC", elevation: 0, hauteur: 3 } },
      { type: "mur.tracer", params: { id: "w1", niveauId: "rdc", a: pt(0, 0), b: pt(4, 0), epaisseur: m(0.2), hauteur: m(2.6) } },
      { type: "mur.tracer", params: { id: "w2", niveauId: "rdc", a: pt(0, 2), b: pt(4, 2), epaisseur: m(0.4), hauteur: m(2.6) } },
    ])).revision as number;
    const r = await post("regle", rev, [{ type: "regle.definir", params: { id: "r-ep", nom: "Épaisseur minimale (programme, déclaré)", classe: "mur", expression: "epaisseur >= 0.3", message: "mur plus mince que le programme" } }]);
    rev = r.revision;
    expect(r.effets.problemes).toMatchObject([{ id: "pb-regle-r-ep-w1", type: "regle", objetId: "w1" }]);
    const problemes = (await client.get(`${base}/problemes`)).body;
    expect(JSON.stringify(problemes)).toMatch(/pb-regle-r-ep-w1/);
    const modele = (await client.get(`${base}/model`)).body.modele;
    expect((Object.values(modele.problemes) as { type: string }[]).filter((p) => p.type === "regle")).toHaveLength(1);
    expect(modele.objets.w1.params.epaisseur.value).toBe(0.2);
    // Le mur épaissi n'est plus signalé ; une classe d'ontologie inactive est refusée.
    rev = (await post("ep", rev, [{ type: "mur.modifier", params: { id: "w1", params: { epaisseur: m(0.3) } } }])).revision;
    expect((Object.values((await client.get(`${base}/model`)).body.modele.problemes) as { type: string }[]).filter((p) => p.type === "regle")).toHaveLength(0);
    const inactive = await client.post(`${base}/commands`).send(enveloppe("ko", rev, [{ type: "regle.definir", params: { nom: "x", classe: "poutre", expression: "za <= 3", message: "m" } }]));
    expect(inactive.status).toBe(409);
    expect(JSON.stringify(inactive.body)).toMatch(/non activée/);
  });
});
