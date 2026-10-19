import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import {
  cibleSelection, commandePropriete, commandeRetrait, exigenceDe, libelleMetrique, lireNombreSaisi, listeSans, listeSuivante, SAISIE_EXIGENCE_VIDE, SAISIE_PROPRIETE_VIDE,
  saisieDe, uniteImposee, valeurAffichee,
} from "./exigences-ui";
import { PanneauExigences } from "./PanneauExigences";
import { cibleRaccourci, COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { familleDe } from "../planche2d/barre-compacte";

const doc = (): StudioDocument => applyStudioCommands(newStudioDocument("d"), [
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }], thickness: 0.2, height: 2.5, base: 0, justification: "center" } },
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 3 }, end: { x: 1, y: 3 } } },
  { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 5 }, width: 1, height: 1, extrusion: { base: 0, height: 1 } } },
] as StudioCommand[]);

describe("Propriétés BIM — interface (E.1-01)", () => {
  it("cible : mur ou ouverture choisi(e), sinon l'unique objet extrudé sélectionné ; jamais un objet hors périmètre", () => {
    expect(cibleSelection(doc(), "m1", [])).toBe("m1");
    expect(cibleSelection(doc(), null, ["r1"])).toBe("r1");
    expect(cibleSelection(doc(), null, ["l1"])).toBeNull();
    expect(cibleSelection(doc(), null, ["r1", "l1"])).toBeNull();
  });

  it("commande : rien n'est proposé ; nombre avec unité, texte, non évaluée", () => {
    expect(commandePropriete(null, { ...SAISIE_PROPRIETE_VIDE, nom: "x" })).toEqual({ erreur: "Sélectionnez d’abord un mur, une ouverture ou un objet extrudé." });
    expect(commandePropriete("m1", SAISIE_PROPRIETE_VIDE)).toEqual({ erreur: "Saisissez le nom de la propriété." });
    expect(commandePropriete("m1", { ...SAISIE_PROPRIETE_VIDE, nom: "Uw", type: "nombre", valeur: "1,3" })).toMatchObject({ erreur: expect.stringContaining("unité") });
    expect(commandePropriete("m1", { nom: " Uw ", type: "nombre", valeur: "1,3", unite: "W/m2.K", source: "" }))
      .toEqual({ commandes: [{ toolId: "studio.propriete.definir", params: { cibleId: "m1", nom: "Uw", valeur: 1.3, unite: "W/m2.K" } }] });
    expect(commandePropriete("m1", { ...SAISIE_PROPRIETE_VIDE, nom: "Matériau" })).toEqual({ commandes: [{ toolId: "studio.propriete.definir", params: { cibleId: "m1", nom: "Matériau" } }] });
    const r = commandePropriete("m1", { ...SAISIE_PROPRIETE_VIDE, nom: "Code", type: "texte", valeur: "M-01" });
    if (!("commandes" in r)) throw new Error("refus");
    const d = applyStudioCommands(doc(), r.commandes);
    expect(commandeRetrait("m1", "Code", d)).toEqual({ commandes: [{ toolId: "studio.propriete.retirer", params: { cibleId: "m1", nom: "Code" } }] });
    expect(commandeRetrait("m1", "Autre", d)).toMatchObject({ erreur: expect.stringContaining("Aucune propriété") });
    expect(valeurAffichee({ cibleId: "m1", nom: "x" }, "fr-FR")).toBe("non évaluée");
    expect(lireNombreSaisi("abc")).toBeNull();
  });
});

describe("Exigences — interface (E.1-02)", () => {
  const saisie = { ...SAISIE_EXIGENCE_VIDE, libelle: "Volume net des murs", type: "total" as const, grandeur: "volume-net" as const, comparaison: "<=" as const, valeur: "3", source: "Programme v2, § 4" };

  it("unité imposée par la métrique ; source obligatoire ; aucune acceptation envoyée", () => {
    expect(uniteImposee(saisie)).toBe("m3");
    expect(uniteImposee({ type: "nombre", grandeur: "" })).toBe("u");
    expect(uniteImposee({ type: "propriete", grandeur: "" })).toBeNull();
    expect(exigenceDe({ ...saisie, source: "" }, "e1")).toMatchObject({ erreur: expect.stringContaining("source") });
    const r = exigenceDe({ ...saisie, reference: "Référentiel R" }, "e1");
    expect(r).toEqual({ exigence: { id: "e1", libelle: "Volume net des murs", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 3, unite: "m3", source: "Programme v2, § 4", origine: { reference: "Référentiel R" } } });
    if (!("exigence" in r)) throw new Error("refus");
    expect(saisieDe(r.exigence)).toMatchObject({ libelle: "Volume net des murs", grandeur: "volume-net", valeur: "3", reference: "Référentiel R" });
    expect(libelleMetrique(r.exigence.metrique)).toBe("Volume net — document");
    const acceptee = { ...r.exigence, origine: { reference: "Référentiel R", acceptation: { par: "u", le: "2026-10-19T08:00:00.000Z" } } };
    expect(listeSuivante([acceptee], { ...r.exigence, valeur: 4 })).toEqual([{ ...r.exigence, valeur: 4 }]);
    expect(listeSuivante([acceptee], { ...r.exigence, id: "e2" })).toEqual([r.exigence, { ...r.exigence, id: "e2" }]);
    expect(listeSans([acceptee], "e1")).toEqual([]);
  });

  it("le panneau se rend sans jeu (aucune exigence fournie) et range la commande « Exigences et écarts » (F)", () => {
    const html = renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(PanneauExigences, {
      projectId: "p", studyId: "s", variantId: "v", revisionId: "r", doc: doc(), cibleId: "m1", modifiable: true, ecriture: true, nonEnregistre: false, surCommandes: () => true, surErreur: () => {},
    })));
    expect(html).toContain('data-studio-exigences="s"');
    expect(html).toContain('data-studio-propriete-action="studio.propriete.definir"');
    expect(html).toContain('data-studio-propriete-action="studio.propriete.retirer"');
    expect(html).toContain("Aucune propriété déclarée.");
    expect(cibleRaccourci("F")).toEqual({ type: "commande", id: "exigences" });
    expect(cibleRaccourci("K")).toEqual({ type: "outil", toolId: "studio.propriete.definir" });
    expect(cibleRaccourci("G")).toEqual({ type: "outil", toolId: "studio.propriete.retirer" });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "exigences")).toMatchObject({ groupe: "exigences", ecrit: false, iconeSymbolique: "studio-requirements" });
    expect(familleDe("exigences", "exigences")).toBe("architecture");
    expect(familleDe("studio.propriete.definir", "proprietes")).toBe("architecture");
  });
});
