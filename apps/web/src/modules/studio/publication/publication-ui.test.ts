import { describe, expect, it } from "vitest";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import { COMMENTAIRE_REQUIS, corpsTransition, LIBELLE_ACTION, LIBELLE_EVENEMENT, LIBELLE_STATUT, messageRefus, ORDRE_ACTIONS } from "./publication-ui";

const pub = { revisionId: "studio_revision_0123456789abcdef", documentHash: "a".repeat(64) };

describe("Publications Studio — règles d'affichage pures", () => {
  it("l'approbation envoie l'ensemble examiné (révision + empreinte), les autres transitions non", () => {
    expect(corpsTransition(pub, "approuver", "  ok ")).toEqual({ comment: "ok", revisionId: pub.revisionId, documentHash: pub.documentHash });
    expect(corpsTransition(pub, "diffuser", "")).toEqual({});
    expect(corpsTransition(pub, "retirer", "motif")).toEqual({ comment: "motif" });
  });

  it("refus et retrait exigent un commentaire, comme le serveur", () => {
    expect([...COMMENTAIRE_REQUIS].sort()).toEqual(["refuser", "retirer"]);
    expect(ORDRE_ACTIONS).toEqual(["soumettre", "approuver", "refuser", "diffuser", "retirer"]);
  });

  it("le refus d'une approbation périmée cite les deux révisions renvoyées par le serveur", () => {
    const m = messageRefus(409, { error: "stale_approval", approvedRevisionId: "rev_aaaaaaaa11111111", headRevisionId: "rev_bbbbbbbb22222222" });
    expect(m).toContain("11111111");
    expect(m).toContain("22222222");
    expect(messageRefus(403, { error: "forbidden" })).toMatch(/droits/);
    expect(messageRefus(500, null)).toBe("Action refusée par le serveur.");
  });

  it("chaque libellé français a sa traduction anglaise", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const libelles = [...Object.values(LIBELLE_STATUT), ...Object.values(LIBELLE_ACTION), ...Object.values(LIBELLE_EVENEMENT),
      messageRefus(409, { error: "stale_approval", approvedRevisionId: "x12345678", headRevisionId: "y87654321" }), messageRefus(423, {}), messageRefus(409, { error: "revision_mismatch" })];
    for (const l of libelles) expect(t.traduire(l), l).not.toBe(l);
  });
});
