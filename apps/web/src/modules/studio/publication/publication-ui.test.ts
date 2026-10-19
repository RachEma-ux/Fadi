import { describe, expect, it } from "vitest";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import {
  COMMENTAIRE_REQUIS, corpsTransition, LIBELLE_ACTION, LIBELLE_ACTUALITE, LIBELLE_DIFFUSION, LIBELLE_EVENEMENT, LIBELLE_STATUT, LIBELLE_TRAVAIL,
  libelleEcart, messageRefus, ORDRE_ACTIONS,
} from "./publication-ui";

const pub = { revisionId: "studio_revision_0123456789abcdef", documentHash: "a".repeat(64), manifestHash: "c".repeat(64) };

describe("Publications Studio — règles d'affichage pures", () => {
  it("l'approbation envoie l'ensemble examiné (manifeste, révision, empreinte), les autres transitions non", () => {
    expect(corpsTransition(pub, "approuver", "  ok ")).toEqual({ comment: "ok", manifestHash: pub.manifestHash, revisionId: pub.revisionId, documentHash: pub.documentHash });
    expect(corpsTransition({ ...pub, manifestHash: null }, "approuver", "")).toEqual({ revisionId: pub.revisionId, documentHash: pub.documentHash });
    expect(corpsTransition(pub, "diffuser", "")).toEqual({});
    expect(corpsTransition(pub, "actualiser", "")).toEqual({});
    expect(corpsTransition(pub, "retirer", "motif")).toEqual({ comment: "motif" });
  });

  it("refus et retrait exigent un commentaire, comme le serveur", () => {
    expect([...COMMENTAIRE_REQUIS].sort()).toEqual(["refuser", "retirer"]);
    expect(ORDRE_ACTIONS).toEqual(["actualiser", "soumettre", "approuver", "refuser", "diffuser", "retirer"]);
  });

  it("le refus d'une diffusion sous un manifeste différent cite les deux empreintes renvoyées par le serveur", () => {
    const m = messageRefus(409, { error: "manifest_mismatch", approvedManifestHash: "1".repeat(64), currentManifestHash: "2".repeat(64) });
    expect(m).toContain("111111111111");
    expect(m).toContain("222222222222");
    expect(messageRefus(409, { error: "stale_approval", approvedRevisionId: "rev_aaaaaaaa11111111", headRevisionId: "rev_bbbbbbbb22222222" })).toContain("22222222");
    expect(messageRefus(403, { error: "forbidden" })).toMatch(/droits/);
    expect(messageRefus(500, null)).toBe("Action refusée par le serveur.");
  });

  it("écarts du manifeste : source déplacée, source introuvable, métadonnée", () => {
    expect(libelleEcart({ type: "source", role: "principale", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: "r_bbbbbbbb22222222" })).toContain("22222222");
    expect(libelleEcart({ type: "source", role: "coordonnee", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: null })).toContain("introuvable");
    expect(libelleEcart({ type: "meta", champ: "studyName", figee: "A", courante: "B" })).toContain("étude");
  });

  it("chaque libellé français a sa traduction anglaise", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const libelles = [
      ...Object.values(LIBELLE_STATUT), ...Object.values(LIBELLE_ACTION), ...Object.values(LIBELLE_EVENEMENT),
      ...Object.values(LIBELLE_TRAVAIL), ...Object.values(LIBELLE_DIFFUSION), ...Object.values(LIBELLE_ACTUALITE),
      messageRefus(409, { error: "stale_approval", approvedRevisionId: "x12345678", headRevisionId: "y87654321" }), messageRefus(423, {}), messageRefus(409, { error: "revision_mismatch" }),
      messageRefus(409, { error: "manifest_mismatch", approvedManifestHash: "1".repeat(64), currentManifestHash: "2".repeat(64) }),
      messageRefus(409, { error: "manifest_outdated" }), messageRefus(409, { error: "manifest_missing" }), messageRefus(409, { error: "manifest_current" }),
      libelleEcart({ type: "source", role: "principale", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: "r_bbbbbbbb22222222" }),
      libelleEcart({ type: "source", role: "coordonnee", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: "r_bbbbbbbb22222222" }),
      libelleEcart({ type: "source", role: "principale", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: null }),
      libelleEcart({ type: "meta", champ: "variantName", figee: "A", courante: "B" }),
      "Manifeste", "Remplacée", "Retirée par", "Travail", "Diffusion", "Actualité", "Variantes coordonnées (facultatif)",
      "La révision courante de la variante, celle des variantes coordonnées et les empreintes des documents sont figées dans le manifeste.",
      "Le manifeste est reconstruit depuis les révisions courantes ; l’approbation précédente ne vaut plus et le dossier repasse en brouillon.",
      "Une publication porte sur une révision précise d’une variante, figée dans un manifeste. Propriétaire et éditeurs soumettent ; le propriétaire approuve, refuse, diffuse et retire ; un lecteur consulte. Une publication approuvée se diffuse tant que son manifeste n’a pas changé. Rien n’est supprimé : retrait et remplacement sont journalisés.",
      "Vous approuvez le manifeste 0123456789ab : révision 89abcdef (empreinte aaaaaaaaaaaa).",
    ];
    for (const l of libelles) expect(t.traduire(l), l).not.toBe(l);
  });
});
