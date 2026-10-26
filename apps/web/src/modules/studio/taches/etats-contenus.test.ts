import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { newStudioDocument } from "@parcours/atelier-model";
import { documentSansElement, etatApercuFeuille, etatFeuille, etatMetre, etatPublication, MOTIF_FEUILLE_VIDE, MOTIF_METRE_VIDE, MOTIF_PUBLICATION_REMPLACEE, MOTIF_PUBLICATION_RETIREE } from "./etats-contenus";
import { EtatContenu } from "./EtatContenu";

const R12 = "studio_revision_000000000012", R13 = "studio_revision_000000000013";

describe("TR-EX-016 — cinq états dérivés du métré, des feuilles et des publications", () => {
  it("métré : à jour pour la révision affichée, à recalculer, en calcul, échec, non applicable (aucun objet)", () => {
    const base = { revisionId: R13, nonEnregistre: false, courante: "13", affichee: "12", tache: "done" as const, message: null, objets: 3 };
    const aJour = etatMetre({ ...base, affichee: "13" });
    expect([aJour.etat.etat, aJour.libelle]).toEqual(["a-jour", "À jour pour la révision 00000013"]);
    expect(etatMetre({ ...base, affichee: "13", nonEnregistre: true }).libelle).toBe("À jour pour la révision 00000013 (brouillon non enregistré)");
    expect(etatMetre({ ...base, tache: "inactive" }).etat.etat).toBe("a-recalculer");
    // Le métré précédent (révision 12) reste affiché pendant le calcul : « en calcul », jamais « à jour ».
    const calcul = etatMetre({ ...base, tache: "running" });
    expect([calcul.etat.etat, calcul.etat.image, calcul.libelle]).toEqual(["en-calcul", "12", "En calcul"]);
    const echec = etatMetre({ ...base, tache: "timed-out", message: "Le calcul n’a pas répondu à temps : réessayez ; il sera relancé." });
    expect([echec.etat.etat, echec.libelle]).toEqual(["echec", "Échec du calcul : Le calcul n’a pas répondu à temps : réessayez ; il sera relancé."]);
    const na = etatMetre({ ...base, affichee: "13", objets: 0 });
    expect([na.etat.etat, na.libelle]).toEqual(["non-applicable", `Non applicable : ${MOTIF_METRE_VIDE}`]);
    // Sans métré de la révision courante, « aucun objet » n'est pas conclu : à recalculer.
    expect(etatMetre({ ...base, objets: 0 }).etat.etat).toBe("a-recalculer");
    expect([aJour, calcul, echec, na].every((e) => e.coherent)).toBe(true);
  });

  it("aperçu de la feuille : composition demandée comparée à l'aperçu affiché ; document vide non applicable", () => {
    const base = { revisionId: "00000013", courante: "7:aa", affichee: "6:aa", enCours: false, erreur: null, sansElement: false };
    expect(etatApercuFeuille({ ...base, affichee: "7:aa" }).libelle).toBe("À jour pour la révision 00000013");
    expect(etatApercuFeuille({ ...base, enCours: true }).etat.etat).toBe("en-calcul");
    expect(etatApercuFeuille(base).etat.etat).toBe("a-recalculer");
    expect(etatApercuFeuille({ ...base, affichee: "7:aa", erreur: "Feuille impossible" })).toMatchObject({ etat: { etat: "echec", image: null, motif: "Feuille impossible" } });
    expect(etatApercuFeuille({ ...base, sansElement: true }).libelle).toBe(`Non applicable : ${MOTIF_FEUILLE_VIDE}`);
    expect(documentSansElement(newStudioDocument("d"))).toBe(true);
  });

  it("feuille composée : épinglée sur la tête (à jour), plus ancienne (à recalculer), actualisation (en calcul), erreur serveur (échec), vue vide (non applicable)", () => {
    const elements = { objets: 2, cotes: 1, annotations: 0, architecture: 1 };
    const base = { revisionId: R12, headRevisionId: R13, error: null, elements, enCours: false };
    const aJour = etatFeuille({ ...base, revisionId: R13 });
    expect([aJour.etat.etat, aJour.libelle]).toEqual(["a-jour", "À jour pour la révision 00000013"]);
    const perimee = etatFeuille(base);
    expect([perimee.etat.etat, perimee.etat.image]).toEqual(["a-recalculer", R12]);
    expect(etatFeuille({ ...base, enCours: true }).etat.etat).toBe("en-calcul");
    const echec = etatFeuille({ ...base, revisionId: R13, error: "vue source illisible" });
    expect([echec.etat.etat, echec.etat.image, echec.libelle]).toEqual(["echec", null, "Échec du calcul : vue source illisible"]);
    expect(etatFeuille({ ...base, revisionId: R13, elements: { objets: 0, cotes: 0, annotations: 0, architecture: 0 } }).libelle).toBe(`Non applicable : ${MOTIF_FEUILLE_VIDE}`);
    expect([aJour, perimee, echec].every((e) => e.coherent)).toBe(true);
  });

  it("publication : manifeste à jour, variante avancée, actualisation, refus, retirée ou remplacée — jamais « à jour » sur une image ancienne", () => {
    const base = { revisionId: R12, headRevisionId: R13, freshness: "perimee" as const, diffusionStatus: "non-diffuse" as const, replacedBy: null, enCours: false, echec: null };
    expect(etatPublication({ ...base, revisionId: R13, freshness: "a-jour" }).libelle).toBe("À jour pour la révision 00000013");
    const perimee = etatPublication(base);
    expect([perimee.etat.etat, perimee.etat.image, perimee.coherent]).toEqual(["a-recalculer", R12, true]);
    // Même révision, documents régénérés : aucune image valable pour la tête (jamais « à jour »).
    expect(etatPublication({ ...base, revisionId: R13 }).etat).toMatchObject({ etat: "a-recalculer", image: null });
    expect(etatPublication({ ...base, enCours: true }).etat.etat).toBe("en-calcul");
    expect(etatPublication({ ...base, echec: "Action refusée par le serveur." }).libelle).toBe("Échec du calcul : Action refusée par le serveur.");
    expect(etatPublication({ ...base, diffusionStatus: "retire" }).libelle).toBe(`Non applicable : ${MOTIF_PUBLICATION_RETIREE}`);
    expect(etatPublication({ ...base, diffusionStatus: "remplace" }).libelle).toBe(`Non applicable : ${MOTIF_PUBLICATION_REMPLACEE}`);
  });

  it("pastille : état, image et cohérence portés par l'élément affiché", () => {
    const html = renderToStaticMarkup(createElement(EtatContenu, { etat: etatFeuille({ revisionId: R12, headRevisionId: R13, error: null, elements: null, enCours: false }), nom: "feuille" }));
    expect(html).toContain('data-studio-etat-contenu="feuille"');
    expect(html).toContain('data-etat="a-recalculer"');
    expect(html).toContain(`data-image="${R12}"`);
    expect(html).toContain('data-coherent="oui"');
    expect(html).toContain(">À recalculer<");
  });
});
