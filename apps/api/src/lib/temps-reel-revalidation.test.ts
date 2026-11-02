/**
 * BD-4.2 (chantier base-donnees, constat Q2) : revalidation des droits toutes les 2 s sans saturer le pool. Base
 * simulée : chaque lecture est comptée, ainsi que le nombre de lectures simultanées.
 */
import { describe, expect, it } from "vitest";
import { HubTempsReel, REVALIDATIONS_SIMULTANEES, type DependancesHub, type Prise, type SessionConnue } from "./temps-reel-hub.js";

class Prise0 implements Prise {
  fermeture: { code: number; raison: string } | null = null;
  envoyer() {}
  fermer(code: number, raison: string) { this.fermeture = { code, raison }; }
  enAttente() { return 0; }
  ping() {}
}

function monde() {
  const t = 1_000_000;
  const lectures = { comptes: 0, acces: 0, enCours: 0, max: 0 };
  const lent = async <T>(f: () => T): Promise<T> => {
    lectures.enCours++; lectures.max = Math.max(lectures.max, lectures.enCours);
    await new Promise((r) => setTimeout(r, 2));
    lectures.enCours--;
    return f();
  };
  const session: SessionConnue = {
    id: "rtses_1", projectId: "p1", portee: "studio-revision", titre: "Revue", studyId: "s1", variantId: "v1", revisionId: "r1", publicationId: null,
    hoteId: "u0", presentateurId: "u0", statut: "ouverte", expireLe: new Date(t + 3_600_000).toISOString(),
  };
  const d: DependancesHub = {
    maintenant: () => t,
    verifierCompte: (jeton) => lent(() => { lectures.comptes++; return { userId: jeton.split(":")[0]!, sessionCompteId: `sc-${jeton}` }; }),
    verifierAcces: () => lent(() => { lectures.acces++; return "editeur" as const; }),
    chargerSession: async (id) => (id === session.id ? { ...session } : null),
    chargerObjets: async () => new Set<string>(),
    noms: async (ids) => new Map(ids.map((i) => [i, i])),
    journaliserPresence: async () => {},
    journal: () => {},
  };
  const hub = new HubTempsReel(d);
  const ouvrir = async (userId: string, jeton: string) => {
    const prise = new Prise0();
    const c = hub.ouvrir(prise, jeton, { userId, sessionCompteId: `sc-${jeton}` })!;
    await hub.recevoir(c, JSON.stringify({ v: 1, type: "rejoindre", sessionId: "rtses_1" }));
    return prise;
  };
  return { hub, lectures, ouvrir };
}

describe("BD-4.2 — revalidation regroupée et bornée", () => {
  it("un compte avec plusieurs connexions dans la même salle : une lecture de session et une lecture d'accès par cycle", async () => {
    const m = monde();
    for (let i = 0; i < 12; i++) await m.ouvrir("u1", "u1:jeton");
    m.lectures.comptes = 0; m.lectures.acces = 0;
    await m.hub.revalider();
    expect(m.lectures).toMatchObject({ comptes: 1, acces: 1 });
    // Cycle suivant : nouvelle lecture (rien n'est gardé d'un cycle à l'autre).
    await m.hub.revalider();
    expect(m.lectures).toMatchObject({ comptes: 2, acces: 2 });
  });

  it("des comptes distincts : chacun relu, jamais plus de lectures simultanées que la borne", async () => {
    const m = monde();
    for (let i = 0; i < 30; i++) await m.ouvrir(`u${i}`, `u${i}:jeton`);
    m.lectures.comptes = 0; m.lectures.acces = 0; m.lectures.max = 0;
    await m.hub.revalider();
    expect(m.lectures.comptes).toBe(30);
    expect(m.lectures.acces).toBe(30);
    expect(m.lectures.max).toBeLessThanOrEqual(REVALIDATIONS_SIMULTANEES);
    expect(m.lectures.max).toBeGreaterThan(1);
  });
});
