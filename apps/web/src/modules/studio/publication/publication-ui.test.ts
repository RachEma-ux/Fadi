import { describe, expect, it } from "vitest";
import dico from "../../../lib/i18n/en.json";
import { Traducteur } from "../../../lib/i18n/traduire";
import {
  COMMENTAIRE_REQUIS, corpsTransition, LIBELLE_ACTION, LIBELLE_ACTUALITE, LIBELLE_DIFFUSION, LIBELLE_EVENEMENT, LIBELLE_STATUT, LIBELLE_TRAVAIL,
  libelleActualite, libelleEcart, LIBELLE_ETAT_DELEGATION, LIBELLE_PORTEE_DELEGATION, messageRefus, ORDRE_ACTIONS,
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

  it("actualité : « à jour » seulement après comparaison des documents, sinon « non vérifiés »", () => {
    expect(libelleActualite({ freshness: "a-jour", documentsCheck: "verifiee" })).toBe("Contenus à jour");
    expect(libelleActualite({ freshness: "a-jour", documentsCheck: "non-verifiee" })).toBe("Sources à jour, documents non vérifiés");
    expect(libelleActualite({ freshness: "a-jour" })).toBe("Sources à jour, documents non vérifiés");
    expect(libelleActualite({ freshness: "perimee", documentsCheck: "non-verifiee" })).toBe("Contenus périmés");
  });

  it("écarts du manifeste : source déplacée, source introuvable, métadonnée", () => {
    expect(libelleEcart({ type: "source", role: "principale", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: "r_bbbbbbbb22222222" })).toContain("22222222");
    expect(libelleEcart({ type: "source", role: "coordonnee", variantId: "v", revisionFigee: "r_aaaaaaaa11111111", revisionCourante: null })).toContain("introuvable");
    expect(libelleEcart({ type: "meta", champ: "studyName", figee: "A", courante: "B" })).toContain("étude");
    expect(libelleEcart({ type: "documents", formats: ["pdf", "svg"] })).toBe("Documents régénérés : PDF, SVG.");
  });

  it("EX-085 [+] approuver ou refuser au titre d'une délégation l'envoie explicitement ; diffuser ou retirer, jamais", () => {
    const delegue = { ...pub, delegation: { id: "dl1", delegator: { id: "p", email: "p@x.test" }, endsAt: "2026-10-30T00:00:00.000Z", reason: "Congés" } };
    expect(corpsTransition(delegue, "approuver", "")).toEqual({ manifestHash: pub.manifestHash, revisionId: pub.revisionId, documentHash: pub.documentHash, delegationId: "dl1" });
    expect(corpsTransition(delegue, "refuser", "motif")).toEqual({ comment: "motif", delegationId: "dl1" });
    expect(corpsTransition(delegue, "diffuser", "")).toEqual({});
    expect(corpsTransition({ ...delegue, delegation: null }, "approuver", "")).not.toHaveProperty("delegationId");
  });

  it("EX-085 [−] chaque refus de délégation du serveur a son message (hors période, hors portée, révoquée…), traduit", () => {
    const t = new Traducteur(dico as Record<string, string>);
    const codes = ["delegation_autre_delegue", "delegation_revoquee", "delegation_a_venir", "delegation_expiree", "delegation_hors_portee", "delegant_sans_droit", "delegation_sans_droit",
      "delegation_delegue_identique", "delegation_periode_invalide", "delegation_periode_terminee", "delegation_motif_requis", "delegue_inconnu", "portee_inconnue", "portee_invalide"];
    const messages = codes.map((code) => messageRefus(403, { error: "forbidden", code }));
    expect(new Set(messages).size).toBe(codes.length);
    for (const m of messages) { expect(m).not.toBe(messageRefus(403, {})); expect(t.traduire(m), m).not.toBe(m); }
    for (const l of [...Object.values(LIBELLE_ETAT_DELEGATION), ...Object.values(LIBELLE_PORTEE_DELEGATION), "Délégations d’approbation", "Déléguer l’approbation", "Révoquer la délégation",
      "Une délégation porte une portée, une période, un délégant, un délégué et un motif ; elle ne transmet que l’approbation et le refus, jamais la diffusion. L’absence de l’approbateur ne vaut jamais accord.",
      "Délégué", "Portée", "Début", "Fin (exclue)", "Motif (requis)", "Créer la délégation", "Motif de la révocation (requis)", "Approuvée par délégation", "Vous agissez par délégation de",
      "Révocation", "Approbation par délégation", "Refus par délégation", "Révoquée par", "Période", "Motif", "Élément de la portée", "Délégations indisponibles.", "Aucun autre participant ne lit ce projet.",
      "(par délégation)", "Délégation non confirmée. Réessayez : la même demande sera rejouée sans doublon.", "Révocation non confirmée : rechargez avant de réessayer."]) {
      // Un libellé identique dans les deux langues (« Active », « Publication ») doit tout de même figurer au dictionnaire.
      expect(l in dico || t.traduire(l) !== l, l).toBe(true);
    }
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
      libelleEcart({ type: "documents", formats: ["pdf"] }),
      libelleActualite({ freshness: "a-jour" }), "Manifeste", "Remplacée", "Retirée par", "Travail", "Diffusion", "Actualité", "Variantes coordonnées (facultatif)",
      "La révision courante de la variante, celle des variantes coordonnées et les empreintes des documents sont figées dans le manifeste.",
      "Le manifeste est reconstruit depuis les révisions courantes ; l’approbation précédente ne vaut plus et le dossier repasse en brouillon.",
      "Une publication porte sur une révision précise d’une variante, figée dans un manifeste. Propriétaire et éditeurs soumettent ; le propriétaire approuve, refuse, diffuse et retire ; un lecteur consulte. Une publication approuvée se diffuse tant que son manifeste n’a pas changé. Rien n’est supprimé : retrait et remplacement sont journalisés.",
      "Vous approuvez le manifeste 0123456789ab : révision 89abcdef (empreinte aaaaaaaaaaaa).",
    ];
    for (const l of libelles) expect(t.traduire(l), l).not.toBe(l);
  });
});
