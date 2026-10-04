import { describe, expect, it } from "vitest";
import { construireEnveloppe, creerClientAtelierCommandes, ErreurAtelierApi, type Requete } from "./atelier-commandes";
import { ApiError } from "./http";

interface Appel {
  chemin: string;
  methode: string;
  corps: unknown;
}

/** Requête factice : enregistre l'appel, rend le corps donné ou lève comme `request` (ApiError, TypeError). */
function factice(reponse: (a: Appel) => unknown) {
  const appels: Appel[] = [];
  const requete = (async (chemin: string, init?: RequestInit) => {
    const a = { chemin, methode: init?.method ?? "GET", corps: init?.body ? JSON.parse(String(init.body)) : null };
    appels.push(a);
    return reponse(a);
  }) as Requete;
  return { appels, client: creerClientAtelierCommandes(requete) };
}

const env = construireEnveloppe("req-1", 4, "Tracer un mur", []);

describe("client atelier-commandes (§5.4)", () => {
  it("routes sous /projects/:projectId/atelier, identifiants encodés", async () => {
    const { appels, client } = factice((a) =>
      a.chemin.includes("/journal")
        ? { revisionCourante: 3, entrees: [] }
        : a.chemin.includes("/problemes")
          ? { revision: 3, problemes: [] }
          : a.chemin.includes("/niveaux/")
            ? { revision: 3, niveauId: "r+1", objets: [], relations: [] }
            : a.chemin.includes("/model")
              ? { revision: 3, objets: {} }
              : { revision: 5, applique: [], effets: {}, journalId: 9 },
    );
    await client.lireModele("p/1");
    await client.lireModele("p/1", 2);
    await client.lireNiveau("p/1", "r+1");
    await client.envoyerCommandes("p/1", env);
    await client.annuler("p/1", { requestId: "u1", baseRevision: 5 });
    await client.retablir("p/1", { requestId: "u2", baseRevision: 6, journalId: "j3" });
    await client.essayer("p/1", env);
    await client.lireJournal("p/1", 2);
    await client.lireProblemes("p/1");
    expect(appels.map((a) => `${a.methode} ${a.chemin}`)).toEqual([
      "GET /projects/p%2F1/atelier/model",
      "GET /projects/p%2F1/atelier/model?revision=2",
      "GET /projects/p%2F1/atelier/model/niveaux/r%2B1",
      "POST /projects/p%2F1/atelier/commands",
      "POST /projects/p%2F1/atelier/commands/annuler",
      "POST /projects/p%2F1/atelier/commands/retablir",
      "POST /projects/p%2F1/atelier/commands/essai",
      "GET /projects/p%2F1/atelier/journal?apres=2",
      "GET /projects/p%2F1/atelier/problemes",
    ]);
    expect(appels[3]?.corps).toEqual({ requestId: "req-1", baseRevision: 4, contract: "atelier-commands/1", label: "Tracer un mur", commands: [] });
    expect(appels[5]?.corps).toEqual({ requestId: "u2", baseRevision: 6, journalId: "j3" });
  });

  it("200 : réponse typée (effets complétés, journalId en chaîne) ; essai sans journalId", async () => {
    const { client } = factice(() => ({ revision: 5, applique: [{ type: "mur.tracer", objetIds: ["M1"] }], effets: { vues: [{ nature: "plan-niveau", etat: "a-recalculer" }] }, journalId: 12 }));
    const r = await client.envoyerCommandes("p", env);
    expect(r).toEqual({
      statut: "accepte",
      reponse: { revision: 5, applique: [{ type: "mur.tracer", objetIds: ["M1"] }], effets: { vues: [{ nature: "plan-niveau", etat: "a-recalculer" }], documents: [], problemes: [], propositions: [], remplacements: [] }, journalId: "12" },
    });
    const e = await client.essayer("p", env);
    expect(e.statut === "accepte" && "journalId" in e.reponse).toBe(false);
  });

  it("400 invalide : détails { chemin, objet, cause, action, message }", async () => {
    const details = [{ chemin: "commands[0].params.epaisseur", objet: "Mur M1", cause: "épaisseur négative", action: "saisir une valeur positive", message: "Mur M1 : épaisseur négative. Action : saisir une valeur positive." }];
    const { client } = factice(() => {
      throw new ApiError(400, "http_400", null, { erreur: "invalide", details });
    });
    expect(await client.envoyerCommandes("p", env)).toEqual({ statut: "invalide", http: 400, details, message: "invalide" });
  });

  it("409 conflit : révisions et objets avec leur état serveur", async () => {
    const corps = { erreur: "conflit", baseRevision: 4, revisionCourante: 6, conflits: [{ objetId: "M1", motif: "modifié", etatServeur: { id: "M1", classe: "mur" } }, { objetId: "M2", motif: "supprimé", etatServeur: null }] };
    const { client } = factice(() => {
      throw new ApiError(409, "http_409", null, corps);
    });
    const r = await client.envoyerCommandes("p", env);
    expect(r.statut).toBe("conflit");
    expect(r.statut === "conflit" && r.conflit).toEqual(corps);
  });

  it("403 / 404 interdit, 423 réservé, autre statut en erreur, sans réponse injoignable", async () => {
    const statuts: unknown[] = [];
    for (const [status, body] of [
      [403, { error: "forbidden", message: "Droit d'écriture requis" }],
      [404, { error: "not_found" }],
      [423, { erreur: "reserve", message: "Réservé par un autre compte" }],
      [500, null],
    ] as const) {
      const { client } = factice(() => {
        throw new ApiError(status, `http_${status}`, null, body);
      });
      statuts.push(await client.envoyerCommandes("p", env));
    }
    const { client } = factice(() => {
      throw new TypeError("Failed to fetch");
    });
    statuts.push(await client.envoyerCommandes("p", env));
    expect(statuts).toEqual([
      { statut: "interdit", http: 403, message: "Droit d'écriture requis" },
      { statut: "interdit", http: 404, message: "not_found" },
      { statut: "reserve", http: 423, message: "Réservé par un autre compte" },
      { statut: "erreur", http: 500, message: "Réponse 500 du serveur" },
      { statut: "injoignable", message: "Failed to fetch" },
    ]);
  });

  it("lectures : modèle (nu ou enrobé), niveau en tableau, journal trié, erreurs levées", async () => {
    const modele = { projetId: "p", revision: 3, empreinte: "e", objets: {}, relations: [] };
    expect((await factice(() => modele).client.lireModele("p")).revision).toBe(3);
    expect((await factice(() => ({ modele })).client.lireModele("p")).revision).toBe(3);
    await expect(factice(() => ({ rien: true })).client.lireModele("p")).rejects.toBeInstanceOf(ErreurAtelierApi);
    const niveau = await factice(() => ({ revision: 3, niveauId: "rdc", objets: [{ id: "M1", classe: "mur" }], relations: [] })).client.lireNiveau("p", "rdc");
    expect(Object.keys(niveau.objets)).toEqual(["M1"]);
    const journal = await factice(() => [{ journalId: 2, requestId: "b", revision: 5 }, { journalId: 1, requestId: "a", revision: 4 }]).client.lireJournal("p", 3);
    expect(journal.entrees.map((e) => e.requestId)).toEqual(["a", "b"]);
    expect(journal.revisionCourante).toBe(5);
    const refus = factice(() => {
      throw new ApiError(404, "not_found", null, { error: "not_found" });
    });
    await expect(refus.client.lireModele("p")).rejects.toMatchObject({ status: 404 });
    const coupure = factice(() => {
      throw new TypeError("Failed to fetch");
    });
    await expect(coupure.client.lireJournal("p", 0)).rejects.toBeInstanceOf(TypeError);
  });
});
