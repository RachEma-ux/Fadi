import { describe, expect, it } from "vitest";
import {
  couvreDelegation, decisionApprobation, etatDelegation, MESSAGES_REFUS_DELEGATION, problemesNouvelleDelegation, verifierDelegation,
  type CibleApprobation, type DelegationApprobation,
} from "./delegation-approbation.js";

/** EX-085 — délégation contrôlée (REF-02 w:p 816) : règles pures, appliquées par le serveur. */
const d = (over: Partial<DelegationApprobation> = {}): DelegationApprobation => ({
  id: "dl1", delegantId: "proprietaire", delegueId: "editeur", portee: { type: "etude", id: "s" },
  debut: "2026-10-20T00:00:00.000Z", fin: "2026-10-30T00:00:00.000Z", motif: "Congés du propriétaire", revoqueeLe: null, ...over,
});
const cible: CibleApprobation = { publicationId: "pub1", studyId: "s", variantIds: ["v"] };
const pendant = new Date("2026-10-25T12:00:00.000Z");
const usage = (over: Partial<Parameters<typeof verifierDelegation>[1]> = {}) => ({ acteurId: "editeur", maintenant: pendant, cible, delegantApprouve: true, ...over });

describe("EX-085 — délégation d'approbation (modèle)", () => {
  it("EX-085 [+] une délégation valide (portée, période, délégant, délégué, motif) permet l'approbation du délégué", () => {
    expect(verifierDelegation(d(), usage())).toEqual({ ok: true });
    expect(etatDelegation(d(), pendant)).toBe("active");
    // Début inclus, fin exclue.
    expect(etatDelegation(d(), new Date("2026-10-20T00:00:00.000Z"))).toBe("active");
    expect(etatDelegation(d(), new Date("2026-10-30T00:00:00.000Z"))).toBe("expiree");
  });

  it("EX-085 [−] hors période (à venir, expirée), révoquée ou employée par un autre compte : refus nommé", () => {
    expect(verifierDelegation(d(), usage({ maintenant: new Date("2026-10-19T23:59:59.999Z") }))).toEqual({ ok: false, motif: "delegation-a-venir", message: MESSAGES_REFUS_DELEGATION["delegation-a-venir"] });
    expect(verifierDelegation(d(), usage({ maintenant: new Date("2026-11-01T00:00:00.000Z") }))).toMatchObject({ ok: false, motif: "delegation-expiree" });
    expect(verifierDelegation(d({ revoqueeLe: "2026-10-22T00:00:00.000Z" }), usage())).toMatchObject({ ok: false, motif: "delegation-revoquee" });
    expect(verifierDelegation(d(), usage({ acteurId: "lecteur" }))).toMatchObject({ ok: false, motif: "delegation-autre-delegue" });
  });

  it("EX-085 [−] hors portée : autre étude, autre variante, publication coordonnée, autre publication ; délégant sans droit", () => {
    expect(verifierDelegation(d(), usage({ cible: { ...cible, studyId: "s2" } }))).toMatchObject({ ok: false, motif: "delegation-hors-portee" });
    expect(couvreDelegation({ type: "variante", id: "v" }, cible)).toBe(true);
    expect(couvreDelegation({ type: "variante", id: "v" }, { ...cible, variantIds: ["v", "w"] })).toBe(false);
    expect(couvreDelegation({ type: "publication", id: "pub1" }, cible)).toBe(true);
    expect(couvreDelegation({ type: "publication", id: "pub2" }, cible)).toBe(false);
    expect(couvreDelegation({ type: "projet" }, cible)).toBe(true);
    expect(verifierDelegation(d(), usage({ delegantApprouve: false }))).toMatchObject({ ok: false, motif: "delegant-sans-droit" });
  });

  it("EX-085 [−] une délégation se crée seulement nominative, bornée, motivée, à portée désignée", () => {
    const now = pendant;
    expect(problemesNouvelleDelegation(d(), now)).toEqual([]);
    expect(problemesNouvelleDelegation(d({ delegueId: "proprietaire" }), now)).toEqual(["delegue-identique"]);
    expect(problemesNouvelleDelegation(d({ fin: d().debut }), now)).toEqual(["periode-invalide"]);
    expect(problemesNouvelleDelegation(d({ debut: "pas une date" }), now)).toEqual(["periode-invalide"]);
    expect(problemesNouvelleDelegation(d({ debut: "2026-10-01T00:00:00.000Z", fin: "2026-10-02T00:00:00.000Z" }), now)).toEqual(["periode-terminee"]);
    expect(problemesNouvelleDelegation(d({ motif: "  " }), now)).toEqual(["motif-requis"]);
    expect(problemesNouvelleDelegation(d({ portee: { type: "etude", id: "" } }), now)).toEqual(["portee-invalide"]);
    expect(problemesNouvelleDelegation(d({ portee: { type: "inconnue" } as never }), now)).toEqual(["portee-invalide"]);
  });

  it("EX-085 [−] l'absence d'un approbateur ne vaut pas accord : sans décision enregistrée, la publication reste en attente", () => {
    expect(decisionApprobation([{ action: "creer" }, { action: "soumettre" }])).toBe("en-attente");
    expect(decisionApprobation([])).toBe("en-attente");
    expect(decisionApprobation([{ action: "creer" }, { action: "soumettre" }, { action: "approuver" }])).toBe("approuvee");
    expect(decisionApprobation([{ action: "soumettre" }, { action: "refuser" }])).toBe("refusee");
    // Une nouvelle soumission rouvre l'examen : l'approbation antérieure ne la couvre pas.
    expect(decisionApprobation([{ action: "soumettre" }, { action: "approuver" }, { action: "actualiser" }, { action: "soumettre" }])).toBe("en-attente");
  });
});
