/**
 * Import IFC de Studio côté interface (lot F3, TEST-028) : boîte « Importer IFC », rapport de pertes et éléments non
 * natifs, liste des éléments non natifs (état explicite, non éditables, retrait explicite), mention au métré, boîte
 * « Modèles externes » (TR-EX-066) et traductions anglaises.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, lireIfcStudio, newStudioDocument, StudioValidationError, STUDIO_RAISONS_NON_NATIF } from "@parcours/atelier-model";
import dico from "../../../lib/i18n/en.json";
import { NonNatifs } from "../planche2d/ListeElements";
import { cibleRaccourci, COMMANDES_EDITEUR, RACCOURCIS_RESERVES } from "../planche2d/raccourcis";
import { PanneauModelesExternes } from "../echanges/PanneauModelesExternes";
import { FAMILLES_COMPARAISON, LIBELLES_ACTION_MODELE, LIBELLES_ECART_MODELE, LIBELLES_STATUT_MODELE, transformationSaisie, UNITES_DECLARABLES } from "../echanges/modeles-externes-ui";
import { DialogueImportIfc, RapportIfc } from "./DialogueImportIfc";
import { LIBELLES_MOTIF_PERTE, LIBELLES_RAISON_NON_NATIF, lireIfc, MESSAGE_IFC_ILLISIBLE, messageImportIfc } from "./import-ifc-ui";
import { lireDxf } from "./import-dxf-ui";

const RECETTE = readFileSync(new URL("../../../../../../packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const en = dico as Record<string, string>;

describe("Boîte « Importer IFC » (TEST-028)", () => {
  const doc = newStudioDocument("d");

  it("commandes « Importer IFC » (Ctrl+Maj+U) et « Modèles externes » (Maj+F2) : barre Importer, icônes propres, raccourcis non réservés", () => {
    expect(COMMANDES_EDITEUR.find((c) => c.id === "importer-ifc")).toMatchObject({ groupe: "import", ecrit: true, iconeSymbolique: "studio-import-ifc", raccourci: "Ctrl+Shift+U" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "modeles-externes")).toMatchObject({ groupe: "import", ecrit: false, iconeSymbolique: "studio-external-models", raccourci: "Shift+F2" });
    expect(cibleRaccourci("Ctrl+Shift+U")).toEqual({ type: "commande", id: "importer-ifc" });
    expect(cibleRaccourci("Shift+F2")).toEqual({ type: "commande", id: "modeles-externes" });
    expect(cibleRaccourci("Shift+F4")).toEqual({ type: "outil", toolId: "studio.nonnatif.conserver" });
    expect(cibleRaccourci("Shift+F8")).toEqual({ type: "outil", toolId: "studio.nonnatif.retirer" });
    for (const r of ["Ctrl+Shift+U", "Shift+F2", "Shift+F4", "Shift+F8"]) expect(RACCOURCIS_RESERVES).not.toContain(r);
  });

  it("rapport de pertes : unité lue, objets natifs, éléments non natifs par type, pertes par type et motif ; noms IFC non traduits", () => {
    const lecture = lireIfc(RECETTE, doc);
    if (!("resultat" in lecture)) throw new Error("lecture attendue");
    expect(lecture.resultat).toEqual(lireIfcStudio(RECETTE, { document: doc }));
    const html = renderToStaticMarkup(createElement(RapportIfc, { nom: "recette.ifc", resultat: lecture.resultat }));
    expect(html).toContain('data-studio-import-ifc-statut="pret"');
    expect(html).toContain('data-studio-import-ifc-objets="5"');
    expect(html).toContain('data-studio-import-ifc-non-natifs="3"');
    expect(html).toContain('data-studio-import-ifc-pertes="5"');
    expect(html).toContain("Unité du fichier : MILLI METRE · 1 unité = 0,001 m");
    expect(html).toContain("5 objet(s) natif(s) à ajouter : 2 mur(s), 2 ouverture(s) dont 1 porte(s) et 1 fenêtre(s), 1 prisme(s) libre(s).");
    expect(html).toContain('<li data-studio-import-ifc-non-natif="IfcSpace" data-nombre="1"><span translate="no">IfcSpace</span>');
    expect(html).toContain('data-studio-import-ifc-perte="IfcSlab" data-motif="prisme-libre"');
  });

  it("unité absente : rien n'est importé, « non évaluée », jamais supposée ; refus illisible ou schéma non pris en charge", () => {
    const sans = lireIfc(RECETTE.replace("#10=IFCUNITASSIGNMENT((#11,#12));", "#10=IFCUNITASSIGNMENT((#12));"), doc);
    if (!("resultat" in sans)) throw new Error("lecture attendue");
    expect(sans.resultat).toMatchObject({ statut: "unite-inconnue", commandes: [] });
    expect(renderToStaticMarkup(createElement(RapportIfc, { nom: "x.ifc", resultat: sans.resultat }))).toContain("data-studio-import-ifc-unite-inconnue");
    expect(lireIfc("bonjour", doc)).toEqual({ erreur: MESSAGE_IFC_ILLISIBLE });
    expect(messageImportIfc(new StudioValidationError("ifc.schema", "schéma IFC non pris en charge : CIS2 (IFC2X3, IFC4, IFC4X3 lus)"))).toBe("Schéma IFC non pris en charge : CIS2. Schémas lus : IFC2X3, IFC4, IFC4X3.");
    expect(messageImportIfc(new Error("x"))).toBe(MESSAGE_IFC_ILLISIBLE);
  });

  it("la boîte : « Ajouter au brouillon » désactivé sans fichier ; lecture seule annoncée", () => {
    const html = renderToStaticMarkup(createElement(DialogueImportIfc, { doc, modifiable: false, surAjouter: () => true, surFermer: () => {} }));
    expect(html).toContain('<h2 id="studio-import-ifc-titre">Importer IFC</h2>');
    expect(html).toMatch(/<input type="file" accept="\.ifc[^"]*" disabled="" data-studio-import-ifc-fichier="true"\/>/);
    expect(html).toMatch(/<button type="button" disabled=""[^>]*data-studio-import-ifc-ajouter/);
  });

  it("import DXF : l'option « conserver les entités non prises » rend des éléments non natifs", () => {
    const texte = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "6", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES",
      "0", "LINE", "8", "0", "10", "0", "20", "0", "11", "1", "21", "0", "0", "TEXT", "8", "0", "10", "0", "20", "0", "1", "a", "0", "ENDSEC", "0", "EOF"].join("\n");
    const sans = lireDxf(texte, doc, null), avec = lireDxf(texte, doc, null, true);
    if (!("resultat" in sans) || !("resultat" in avec)) throw new Error("lecture attendue");
    expect(sans.resultat.commandes.map((c) => c.toolId)).toEqual(["studio.dessin.ligne"]);
    expect(avec.resultat.commandes.map((c) => c.toolId)).toEqual(["studio.dessin.ligne", "studio.nonnatif.conserver"]);
  });
});

describe("Éléments non natifs dans « Éléments du dessin »", () => {
  const doc = applyStudioCommands(newStudioDocument("d"), lireIfcStudio(RECETTE).commandes);

  it("état « non natif » explicite : type d'origine, GlobalId, nom, raison ; cases et bouton de retrait (icône de l'outil)", () => {
    const html = renderToStaticMarkup(createElement(NonNatifs, { doc, modifiable: true, surRetirer: () => true }));
    expect(html).toContain('data-studio-non-natifs="3"');
    expect(html).toContain("Éléments non natifs (3)");
    expect((html.match(/data-studio-etat="non-natif"/g) ?? []).length).toBe(3);
    expect(html).toContain('<span translate="no">IfcColumn</span> — <span translate="no">Poteau</span>');
    expect(html).toContain('<code translate="no">0PoteauC10000000000000</code>');
    expect(html).toContain("<span>hôte introuvable</span>");
    expect(html).toMatch(/<button type="button" disabled=""[^>]*data-studio-nonnatif-retirer/);
    expect(renderToStaticMarkup(createElement(NonNatifs, { doc: newStudioDocument("v"), modifiable: true }))).toBe("");
  });
});

describe("Boîte « Modèles externes » (TR-EX-066)", () => {
  it("rendu initial (avant la lecture du serveur) : titre, aide ; transformation saisie : quatre nombres, degrés → radians", () => {
    const html = renderToStaticMarkup(createElement(PanneauModelesExternes, {
      projectId: "p", studyId: "s", variantId: "v", revisionId: "r", brouillon: newStudioDocument("d"), modifiable: true, ecriture: true,
      brouillonNonEnregistre: false, surFermer: () => {}, surAjouter: () => true,
    }));
    expect(html).toContain('<h2 id="studio-modeles-externes-titre">Modèles externes</h2>');
    expect(html).toContain("data-studio-modeles-externes");
    expect(transformationSaisie({ dx: "1,5", dy: "0", dz: "-2", rotationDegres: "90" })).toEqual({ dx: 1.5, dy: 0, dz: -2, rotation: Math.PI / 2 });
    expect(transformationSaisie({ dx: "", dy: "0", dz: "0", rotationDegres: "0" })).toHaveProperty("erreur");
  });
});

describe("Traductions anglaises (import IFC, éléments non natifs, modèles externes)", () => {
  it("chaque texte d'interface a sa traduction dans en.json", () => {
    const textes = [
      "Importer IFC", "Modèles externes", "Fichier IFC", "Schéma :", "Unité du fichier : {0} · 1 unité = {1} m", "Comparaison avec la révision", "Format", "Fichier", "Unité lue", "Schéma", "SHA-256", "Lecture de l’IFC en cours", "Rapport d’import et de pertes", "Aucun élément non natif.", "Aucune perte relevée.",
      "IFC en texte (STEP physique : IFC2X3, IFC4, IFC4X3). Murs, ouvertures, portes et fenêtres deviennent des objets natifs ; dalles, des prismes libres ; niveaux, des calques. Toute autre entité est conservée comme élément non natif (type, GlobalId, raison), jamais écartée en silence. L’unité est lue dans le fichier, jamais supposée. Rien n’est enregistré avant « Enregistrer ».",
      "Unité de longueur non évaluée : le fichier n’en déclare pas (IfcUnitAssignment). Rien n’est importé ; elle n’est jamais supposée.",
      "{0} objet(s) natif(s) à ajouter : {1} mur(s), {2} ouverture(s) dont {3} porte(s) et {4} fenêtre(s), {5} prisme(s) libre(s).", "{0} niveau(x) lu(s).",
      "Éléments non natifs conservés : {0}, listés par type (non éditables, exclus des métrés).", "Pertes : {0} information(s) non reprise(s), par type.",
      "Transformation déclarée appliquée : translation ({0} ; {1} ; {2}) m, rotation {3}°.", "calque implicite",
      "Import IFC ajouté au brouillon : {0} objet(s) natif(s), {1} élément(s) non natif(s). Enregistrez pour l’envoyer au serveur.",
      MESSAGE_IFC_ILLISIBLE, "Schéma IFC non pris en charge : {0}. Schémas lus : IFC2X3, IFC4, IFC4X3.",
      "L’import dépasserait la limite de {0} éléments non natifs du document : rien n’est ajouté.",
      "Éléments non natifs ({0})", "Importés sans équivalent natif : conservés tels quels, non éditables, exclus des métrés et des exports.", "non natif", "Identifiant d’origine", "Calque",
      "Retirer les éléments non natifs", "Conserver un élément non natif", "Éléments non natifs",
      "Conserver les entités non prises comme éléments non natifs", "{0} entité(s) conservée(s) comme éléments non natifs (non éditables, exclues des métrés).",
      "{0} élément(s) non natif(s) exclu(s) du métré (importés sans équivalent natif).",
      "Un élément non natif naît d’un import : choisissez le fichier IFC.", "Cochez d’abord, dans « Éléments du dessin », l’élément non natif à retirer.",
      "Modèles reçus de partenaires : chacun est relu et comparé par le serveur à la révision courante, puis accepté ou refusé explicitement. Un modèle reçu ne modifie jamais la variante ; accepté, il peut être ajouté au brouillon.",
      "Lecture seule : la réception d’un modèle est réservée aux comptes qui modifient la variante.", "Aucun modèle externe reçu pour cette variante.",
      "Modèle", "Version", "Auteur", "Discipline", "Statut", "Reçu le", "Recevoir un modèle", "Référence du modèle", "Unité déclarée", "Transformation déclarée par l’émetteur",
      "Transformation vers le repère local (déclarée, jamais devinée)", "Translation X (m)", "Translation Y (m)", "Translation Z (m)", "Rotation autour de Z (°)", "Recevoir et comparer",
      "Renseignez le fichier, la référence, l’auteur, la discipline, la version et l’unité déclarée.", "Transformation déclarée : renseignez les quatre valeurs (nombres) ; aucune n’est supposée.",
      "Aucune transformation déclarée.", "Transformation déclarée : translation ({0} ; {1} ; {2}) m, rotation {3}°.", "non évaluée",
      "La variante a changé depuis cette comparaison : comparez de nouveau avant de décider.", "Aucun écart : le modèle reçu est identique à la révision comparée.",
      "{0} élément(s) diffèrent de la révision comparée (par identifiant).", "Éléments non natifs du modèle : {0}.", "Comparer de nouveau", "Motif (obligatoire pour un refus)",
      "Accepter", "Refuser", "Accepter ou refuser est réservé au propriétaire du projet et aux approbateurs.", "Ajouter au brouillon",
      "Le brouillon contient des modifications non enregistrées : l’ajout s’y joint.", "Journal", "Éléments qui diffèrent ({0})", "Éléments qui diffèrent ({0} sur {1})",
      "Rien à ajouter : l’unité du fichier n’est pas évaluée ou le modèle est vide.", "Le serveur n’a pas répondu.",
      "{0} ajouté(s), {1} supprimé(s), {2} modifié(s), {3} identique(s)", "ajouté", "supprimé", "modifié", "identique", "géométrie", "attributs",
      ...Object.values(LIBELLES_RAISON_NON_NATIF), ...Object.values(LIBELLES_MOTIF_PERTE), ...Object.values(LIBELLES_STATUT_MODELE), ...Object.values(LIBELLES_ECART_MODELE),
      ...Object.values(LIBELLES_ACTION_MODELE), ...FAMILLES_COMPARAISON.map((f) => f.libelle), ...UNITES_DECLARABLES.map((u) => u.libelle),
    ];
    expect(Object.keys(LIBELLES_RAISON_NON_NATIF).sort()).toEqual([...STUDIO_RAISONS_NON_NATIF].sort());
    expect(textes.filter((t) => !en[t])).toEqual([]);
  });
});
