import { beforeEach, describe, expect, it, vi } from "vitest";
/**
 * A.5 — contrat de commandes Studio côté serveur, sur un transport simulé (garde DB fermée : aucune base, aucun
 * serveur). La base simulée garde des lignes en mémoire ; une transaction travaille sur une copie, publiée seulement
 * si sa fonction aboutit (tout ou rien, comme PostgreSQL). Les conditions drizzle sont rendues par le dialecte réel
 * (`PgDialect.sqlToQuery`) : une ligne répond si chacun des paramètres de la condition est l'une de ses valeurs.
 *
 * - A.5-02 : identité de l'acteur fixée par le serveur (aucun champ d'auteur dans l'enveloppe), contexte (étude du
 *   projet, variante de l'étude), appartenance, droit `modify`, paramètres, révision de base.
 * - A.5-04 : un lot refusé — par le modèle au milieu du lot, ou par une écriture qui échoue après l'insertion de la
 *   révision — ne laisse aucune ligne modifiée.
 * - A.5-05 : rejeu du même requestId après coupure → réponse d'origine, aucune seconde révision ; autre contenu ou
 *   autre auteur → 409 request_conflict.
 * - A.5-06 / A.5-10 : base périmée → 409 stale_revision avec la tête, les éléments changés depuis et les
 *   chevauchements ; un rejeu d'une ancienne requête ne remplace pas la tête courante.
 * - A.5-07 : l'enveloppe enregistrée est celle envoyée (aucune réécriture) ; commandes et delta relus par révision.
 */
type Ligne = Record<string, unknown>;
const banc = vi.hoisted(() => ({
  lignes: new Map<unknown, Ligne[]>(),
  /** Échec simulé de la mise à jour de la tête (panne après l'insertion de la révision). */
  pannePromotion: false,
  transactions: { ouvertes: 0, validees: 0, annulees: 0 },
}));

vi.mock("../db/client.js", async () => {
  const { getTableColumns } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const schema = await import("../db/schema.js");
  const dialecte = new PgDialect();
  const params = (where: unknown): unknown[] => (where ? dialecte.sqlToQuery(where as never).params : []);
  const repond = (ligne: Ligne, where: unknown) => params(where).every((p) => Object.values(ligne).some((v) => v === p));
  const projeter = (table: unknown, ligne: Ligne, selection?: Record<string, unknown>): Ligne => {
    if (!selection) return structuredClone(ligne);
    const colonnes = Object.entries(getTableColumns(table as never));
    return Object.fromEntries(Object.entries(selection).map(([k, col]) => [k, structuredClone(ligne[colonnes.find(([, c]) => c === col)![0]])]));
  };
  const requetes = (lire: () => Map<unknown, Ligne[]>) => ({
    select(selection?: Record<string, unknown>) {
      return {
        from: (table: unknown) => ({
          where: (where: unknown) => {
            const resultat = async () => (lire().get(table) ?? []).filter((l) => repond(l, where)).map((l) => projeter(table, l, selection));
            return { limit: resultat, for: resultat };
          },
        }),
      };
    },
    insert(table: unknown) {
      return { values: async (v: Ligne) => { const store = lire(); store.set(table, [...(store.get(table) ?? []), { createdAt: new Date(), ...structuredClone(v) }]); } };
    },
    update(table: unknown) {
      return {
        set: (v: Ligne) => ({
          where: async (where: unknown) => {
            if (table === schema.studioVariants && "headRevisionId" in v && banc.pannePromotion) throw new Error("panne simulée");
            for (const l of lire().get(table) ?? []) if (repond(l, where)) Object.assign(l, structuredClone(v));
          },
        }),
      };
    },
  });
  return {
    db: {
      async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        banc.transactions.ouvertes++;
        const copie = new Map([...banc.lignes].map(([t, ls]) => [t, ls.map((l) => structuredClone(l))]));
        try {
          const r = await fn(requetes(() => copie));
          banc.lignes = copie; banc.transactions.validees++;
          return r;
        } catch (e) { banc.transactions.annulees++; throw e; }
      },
      ...requetes(() => banc.lignes),
    },
  };
});
vi.mock("../lib/owned-project.js", async (original) => {
  const reel = await original<typeof import("../lib/owned-project.js")>();
  const roles: Record<string, "proprietaire" | "editeur" | "lecteur"> = { proprietaire: "proprietaire", editeur: "editeur", lecteur: "lecteur" };
  return {
    ...reel,
    // Accès au projet `p` selon le compte ; tout autre projet ou un non-membre : aucun accès (404).
    loadProjectAccess: vi.fn(async (projectId: string, actorId: string) =>
      projectId === "p" && roles[actorId] ? { id: "p", role: roles[actorId], exampleMode: false, editingLock: null } : null),
  };
});
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import { newStudioDocument, STUDIO_CONTRACT, type StudioCommand, type StudioEnvelope } from "@parcours/atelier-model";
import { db } from "../db/client.js";
import { projectMembers, studioRevisions, studioStudies, studioVariants } from "../db/schema.js";
import { readStudioRevisionChanges, StudioRequestError, submitStudioCommands } from "../lib/studio-commands.js";

const scope = { projectId: "p", studyId: "s", variantId: "v" };
const ligne = (id: string, x: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 0 } } });
const deplacer = (id: string, dx: number): StudioCommand => ({ toolId: "studio.dessin.deplacer", params: { id, dx, dy: 0 } });
const enveloppe = (requestId: string, baseRevisionId: string, commands: StudioCommand[]): StudioEnvelope => ({ contractVersion: STUDIO_CONTRACT, requestId, baseRevisionId, commands });

function initialiser(options: { archivee?: boolean } = {}) {
  const document = newStudioDocument("doc");
  const contexte = { study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: "r0" }, revision: { id: "r0", parentRevisionId: null, document }, canWrite: true };
  banc.lignes = new Map<unknown, Ligne[]>([
    [projectMembers, ["proprietaire", "editeur", "lecteur"].map((userId) => ({ projectId: "p", userId }))],
    [studioStudies, [{ id: "s", projectId: "p", name: "Étude", initialVariantId: "v", archivedAt: null }, { id: "s2", projectId: "p", name: "Autre", initialVariantId: "v2", archivedAt: null }]],
    [studioVariants, [
      { id: "v", studyId: "s", name: "Variante", headRevisionId: "r0", archivedAt: options.archivee ? new Date() : null, derivedFromVariantId: null, derivedFromRevisionId: null },
      { id: "v2", studyId: "s2", name: "Autre", headRevisionId: "r2", archivedAt: null, derivedFromVariantId: null, derivedFromRevisionId: null },
    ]],
    [studioRevisions, [{ id: "r0", variantId: "v", parentRevisionId: null, document, envelope: null, requestId: "init-0", payloadHash: "h", source: "study-initialization", authorId: "proprietaire", response: contexte, createdAt: new Date() }]],
  ]);
  banc.pannePromotion = false;
}
/** Instantané comparable de toutes les lignes (dates comprises). */
const instantane = () => JSON.stringify([...banc.lignes].map(([, ls]) => ls));
const tete = () => banc.lignes.get(studioVariants)!.find((v) => v.id === "v")!.headRevisionId as string;
const nbRevisions = () => banc.lignes.get(studioRevisions)!.length;

async function refus(actorId: string, input: unknown, s = scope) {
  const avant = instantane();
  const e = await submitStudioCommands(s, actorId, input).then(() => null, (x: unknown) => x);
  expect(e).toBeInstanceOf(StudioRequestError);
  // Rien n'est écrit, pas même en partie.
  expect(instantane()).toBe(avant);
  return e as StudioRequestError;
}

beforeEach(() => initialiser());

describe("A.5-02 — validation serveur de chaque enveloppe", () => {
  it("témoin : le propriétaire et l'éditeur écrivent ; l'auteur enregistré est l'acteur authentifié", async () => {
    const r = await submitStudioCommands(scope, "editeur", enveloppe("q1", "r0", [ligne("a", 0)]));
    expect(r.replayed).toBe(false);
    expect(tete()).toBe(r.revision.id);
    expect(banc.lignes.get(studioRevisions)!.at(-1)).toMatchObject({ authorId: "editeur", source: "authenticated-session", parentRevisionId: "r0" });
  });
  it("identité : l'enveloppe ne porte aucun auteur (champ refusé par le schéma strict)", async () => {
    const e = await refus("editeur", { ...enveloppe("q1", "r0", [ligne("a", 0)]), authorId: "proprietaire" });
    expect(e.status).toBe(400);
  });
  it("appartenance : un compte non membre ne voit pas la variante (404)", async () => {
    expect((await refus("etranger", enveloppe("q1", "r0", [ligne("a", 0)]))).status).toBe(404);
  });
  it("droits : un lecteur ne modifie pas le dessin (403)", async () => {
    const e = await refus("lecteur", enveloppe("q1", "r0", [ligne("a", 0)]));
    expect(e.status).toBe(403);
    expect(e.body).toMatchObject({ error: "forbidden" });
  });
  it("contexte : une variante d'une autre étude, une étude d'un autre projet → 404", async () => {
    expect((await refus("proprietaire", enveloppe("q1", "r2", [ligne("a", 0)]), { ...scope, variantId: "v2" })).status).toBe(404);
    expect((await refus("proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]), { ...scope, projectId: "autre" })).status).toBe(404);
  });
  it("EX-003 [−] contexte : un objet soumis sans variante (variantId absent ou vide) est rejeté (404), sans objet orphelin", async () => {
    for (const variantId of [undefined, "", null]) {
      const e = await refus("proprietaire", enveloppe("q1", "r0", [ligne("orphelin", 0)]), { ...scope, variantId } as unknown as typeof scope);
      expect(e.status).toBe(404);
    }
    // Rien n'est écrit (contrôlé par `refus`) : aucune révision ne porte l'objet soumis, la tête reste r0.
    expect(banc.lignes.get(studioRevisions)!.some((r) => JSON.stringify(r.document).includes("orphelin"))).toBe(false);
    expect(tete()).toBe("r0");
  });
  it("paramètres : une géométrie invalide est refusée (400 invalid_commands)", async () => {
    const e = await refus("proprietaire", enveloppe("q1", "r0", [{ toolId: "studio.dessin.ligne", params: { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 0, y: 0 } } } as StudioCommand]));
    expect(e.status).toBe(400);
  });
  it("variante archivée : 409 archived, rien d'écrit", async () => {
    initialiser({ archivee: true });
    expect((await refus("proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]))).body).toMatchObject({ error: "archived" });
  });
});

describe("A.5-04 — refus atomique", () => {
  it("une commande refusée au milieu du lot n'applique pas les précédentes", async () => {
    const e = await refus("proprietaire", enveloppe("q1", "r0", [ligne("a", 0), ligne("b", 2), deplacer("inconnu", 1)]));
    expect(e.status).toBe(400);
    expect(e.body["path"]).toContain("commands[2]");
    expect(tete()).toBe("r0");
  });
  it("une panne après l'insertion de la révision annule toute la transaction (aucune révision orpheline)", async () => {
    banc.pannePromotion = true;
    const avant = instantane(), annulees = banc.transactions.annulees;
    await expect(submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]))).rejects.toThrow("panne simulée");
    expect(banc.transactions.annulees).toBe(annulees + 1);
    expect(instantane()).toBe(avant);
    // Le même requestId, renvoyé après la panne, est une première exécution (rien n'a été retenu).
    banc.pannePromotion = false;
    expect((await submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]))).replayed).toBe(false);
  });
});

describe("A.5-05 — idempotence par requestId", () => {
  it("la répétition après coupure rend la réponse d'origine, sans seconde révision", async () => {
    const e = enveloppe("q1", "r0", [ligne("a", 0)]);
    const premier = await submitStudioCommands(scope, "proprietaire", e);
    const n = nbRevisions();
    const second = await submitStudioCommands(scope, "proprietaire", structuredClone(e));
    expect(second.replayed).toBe(true);
    expect(second.revision.id).toBe(premier.revision.id);
    expect(nbRevisions()).toBe(n);
    // Ordre des clés indifférent : même contenu canonique.
    const permute = { commands: e.commands, baseRevisionId: e.baseRevisionId, requestId: e.requestId, contractVersion: e.contractVersion };
    expect((await submitStudioCommands(scope, "proprietaire", permute)).replayed).toBe(true);
  });
  it("même requestId avec un autre contenu ou par un autre auteur → 409 request_conflict, rien d'écrit", async () => {
    await submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]));
    expect((await refus("proprietaire", enveloppe("q1", "r0", [ligne("a", 5)]))).body).toMatchObject({ error: "request_conflict" });
    expect((await refus("editeur", enveloppe("q1", "r0", [ligne("a", 0)]))).body).toMatchObject({ error: "request_conflict" });
  });
});

describe("A.5-06 / A.5-10 — conflits signalés, jamais d'écrasement", () => {
  it("base périmée : 409 stale_revision avec la tête, les éléments changés et les chevauchements ; la tête est intacte", async () => {
    const r1 = await submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0), ligne("b", 4)]));
    const r2 = await submitStudioCommands(scope, "editeur", enveloppe("q2", r1.revision.id, [deplacer("a", 2)]));
    // Un autre compte, resté sur r1, modifie `a` (chevauchement) et `b` (aucun conflit).
    const e = await refus("proprietaire", enveloppe("q3", r1.revision.id, [deplacer("a", 1), deplacer("b", 1)]));
    expect(e.status).toBe(409);
    expect(e.body).toMatchObject({ error: "stale_revision", headRevisionId: r2.revision.id, baseRevisionId: r1.revision.id, baseKnown: true, changedCount: 1, changedKeys: ["objects:a"], overlapCount: 1, overlaps: ["objects:a"], appliesOnHead: true });
    expect(tete()).toBe(r2.revision.id);
  });
  it("base inconnue de la variante : 409 sans détail inventé", async () => {
    await submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]));
    expect((await refus("proprietaire", enveloppe("q2", "r2", [ligne("b", 0)]))).body).toMatchObject({ error: "stale_revision", baseKnown: false });
  });
  it("le rejeu d'une requête ancienne rend sa révision d'origine sans toucher la tête courante", async () => {
    const r1 = await submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]));
    const r2 = await submitStudioCommands(scope, "editeur", enveloppe("q2", r1.revision.id, [deplacer("a", 2)]));
    const rejeu = await submitStudioCommands(scope, "proprietaire", enveloppe("q1", "r0", [ligne("a", 0)]));
    expect(rejeu).toMatchObject({ replayed: true, revision: { id: r1.revision.id } });
    expect(tete()).toBe(r2.revision.id);
  });
});

describe("A.5-07 — historique hybride : commandes et delta par révision", () => {
  it("l'enveloppe enregistrée est celle envoyée ; la révision se relit en commandes et en éléments changés", async () => {
    const e = enveloppe("q1", "r0", [ligne("a", 0), ligne("b", 4)]);
    const r1 = await submitStudioCommands(scope, "proprietaire", e);
    expect(banc.lignes.get(studioRevisions)!.at(-1)!.envelope).toEqual(e);
    const r2 = await submitStudioCommands(scope, "proprietaire", enveloppe("q2", r1.revision.id, [deplacer("b", 1)]));
    // Lecture hors transaction (la base simulée sert aussi les lectures directes), par un simple lecteur.
    const lu = await readStudioRevisionChanges(db as never, scope, "lecteur", r2.revision.id);
    expect(lu).toMatchObject({ revisionId: r2.revision.id, parentRevisionId: r1.revision.id, requestId: "q2", commands: [deplacer("b", 1)], changedKeys: ["objects:b"] });
    expect(lu.summary.objets).toMatchObject({ modifie: 1, deplace: 1 });
    const init = await readStudioRevisionChanges(db as never, scope, "lecteur", "r0");
    expect(init).toMatchObject({ commands: [], requestId: null, changedKeys: [] });
    await expect(readStudioRevisionChanges(db as never, scope, "etranger", r2.revision.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe("X.1-04 — serveur : niveaux, composants 3D et éléments structurels appliqués par le même réducteur, refus sans écriture", () => {
  const batiment: StudioCommand[] = [
    { toolId: "studio.niveau.definir", params: { id: "n1", nom: "Étage 1", cote: 3.2 } },
    { toolId: "studio.structure.element", params: { id: "p1", type: "column", niveauId: "n1", position: { x: 0, y: 0 }, rotation: 0, width: 0.3, depth: 0.3, height: 3, base: 3.2 } },
    { toolId: "studio.composant.definir", params: { id: "k1", nom: "Gaine", solides: [{ id: "s", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 0.2, depth: 0.2, height: 3 }] } },
    { toolId: "studio.composant.placer", params: { id: "q1", type: "occurrence", composantId: "k1", niveauId: "n1", placement: { origin: { x: 1, y: 1, z: 3.2 }, rotation: 0 } } },
  ];
  it("X.1-04 serveur : les quatre outils du bâtiment sont acceptés par le schéma de l'API et appliqués par le serveur ; déplacer le niveau translate ses objets dans la révision enregistrée", async () => {
    const r = await submitStudioCommands(scope, "editeur", enveloppe("b1", "r0", batiment));
    const doc = r.revision.document;
    expect(doc.niveaux).toEqual([{ id: "n1", nom: "Étage 1", cote: 3.2 }]);
    expect(doc.architecture?.[0]).toMatchObject({ type: "column", niveauId: "n1" });
    expect(doc.occurrences?.[0]).toMatchObject({ composantId: "k1", niveauId: "n1" });
    const r2 = await submitStudioCommands(scope, "editeur", enveloppe("b2", r.revision.id, [{ toolId: "studio.niveau.definir", params: { id: "n1", nom: "Étage 1", cote: 4 } }]));
    expect((r2.revision.document.architecture?.[0] as { base: number }).base).toBeCloseTo(4, 12);
    expect(r2.revision.document.occurrences?.[0]?.placement.origin.z).toBeCloseTo(4, 12);
  });
  it("X.1-04 serveur [−] niveau inconnu, définition inconnue, champ métier ajouté : 400, rien n'est écrit", async () => {
    const refusees = [
      { toolId: "studio.structure.element", params: { id: "p9", type: "column", niveauId: "absent", position: { x: 0, y: 0 }, rotation: 0, width: 0.3, depth: 0.3, height: 3, base: 0 } },
      { toolId: "studio.composant.placer", params: { id: "q9", type: "occurrence", composantId: "absente", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 } } },
      { toolId: "studio.structure.element", params: { id: "p8", type: "column", materiau: "béton", position: { x: 0, y: 0 }, rotation: 0, width: 0.3, depth: 0.3, height: 3, base: 0 } },
    ];
    for (const [i, commande] of refusees.entries()) {
      const e = await refus("editeur", enveloppe(`x${i}`, "r0", [commande as StudioCommand]));
      expect(e.status).toBe(400);
    }
  });
});
