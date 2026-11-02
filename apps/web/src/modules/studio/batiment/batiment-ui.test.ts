/**
 * Lot W3-B (X.1-04) — panneau « Bâtiment » : constructeurs de commandes des quatre outils, sans pointeur (saisie au
 * clavier), refus quand une valeur manque (aucune valeur proposée), cote relative au niveau choisi, « Rendre unique » en
 * un lot, vue par niveau ; rendu statique du panneau (libellés, champs, actions). Valeurs de test synthétiques.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioMesh3d, studioVueNiveau, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { lireSommets } from "../planche2d/geometrie-2d";
import {
  choixVueValide, commandeComposant, commandeNiveau, commandeOccurrence, commandeRendreUnique, commandeStructure, coteAbsolue, ERREUR_COMPOSANT, ERREUR_NIVEAU, ERREUR_OCCURRENCE,
  ERREUR_STRUCTURE, lireBoites, niveauxDu, SAISIE_STRUCTURE_VIDE, VUE_SANS_NIVEAU,
} from "./batiment-ui";
import { PanneauBatiment } from "./PanneauBatiment";

let n = 0;
const ctx = { nouvelId: () => `id-${++n}`, layerId: undefined };
const ok = (r: { commandes: StudioCommand[] } | { erreur: string }): StudioCommand[] => { if ("erreur" in r) throw new Error(r.erreur); return r.commandes; };
const erreur = (r: { commandes: StudioCommand[] } | { erreur: string }): string => ("erreur" in r ? r.erreur : "accepté");

function immeuble(): StudioDocument {
  return applyStudioCommands(newStudioDocument("w3b-ui"), [
    ...ok(commandeNiveau({ nouvelId: () => "n0", layerId: undefined }, { nom: "Rez", cote: 0 })),
    ...ok(commandeNiveau({ nouvelId: () => "n1", layerId: undefined }, { nom: "Étage 1", cote: 3.2 })),
    ...ok(commandeComposant({ nouvelId: () => "k1", layerId: undefined }, { nom: "Gaine", boites: "0 0 0 0.2 0.2 3" })),
  ]);
}

describe("X.1-04 — panneau Bâtiment : commandes saisies au clavier, refus sans valeur", () => {
  it("niveau : création, modification de la cote (même identifiant), refus sans nom ni cote", () => {
    expect(ok(commandeNiveau(ctx, { nom: " Étage 2 ", cote: 6.4 }))[0]).toMatchObject({ toolId: "studio.niveau.definir", params: { nom: "Étage 2", cote: 6.4 } });
    expect(ok(commandeNiveau(ctx, { id: "n1", nom: "Étage 1", cote: 4 }))[0]!.params).toEqual({ id: "n1", nom: "Étage 1", cote: 4 });
    expect(erreur(commandeNiveau(ctx, { nom: "", cote: 3 }))).toBe(ERREUR_NIVEAU);
    expect(erreur(commandeNiveau(ctx, { nom: "R+1", cote: Number.NaN }))).toBe(ERREUR_NIVEAU);
    expect(niveauxDu(immeuble()).map((x) => x.id)).toEqual(["n0", "n1"]);
  });

  it("composant : boîtes « x y z largeur profondeur hauteur », une par ligne ; refus d'une ligne incomplète ; modifier garde l'identifiant", () => {
    expect(lireBoites("0 0 0 1 2 3; 1 1 3 0,5 0,5 1")).toHaveLength(2);
    expect(lireBoites("0 0 0 1 2")).toBeNull();
    expect(erreur(commandeComposant(ctx, { nom: "Gaine", boites: "0 0 0 1" }))).toBe(ERREUR_COMPOSANT);
    expect(erreur(commandeComposant(ctx, { nom: " ", boites: "0 0 0 1 1 1" }))).toBe(ERREUR_COMPOSANT);
    const d = immeuble();
    const c = ok(commandeComposant(ctx, { id: "k1", nom: "Gaine", boites: "0 0 0 0.3 0.3 3" }, d.composants![0]));
    expect(c[0]!.params).toMatchObject({ id: "k1", solides: [{ width: 0.3, depth: 0.3 }] });
  });

  it("occurrence : cote relative au niveau choisi (cote absolue écrite), orientation en degrés ; refus sans composant ni origine", () => {
    const d = immeuble();
    const c = ok(commandeOccurrence(ctx, d, { composantId: "k1", niveauId: "n1", x: 1, y: 2, z: 0.5, orientation: 90 }));
    expect(c[0]!.params).toMatchObject({ type: "occurrence", composantId: "k1", niveauId: "n1", placement: { origin: { x: 1, y: 2, z: 3.7 } } });
    expect((c[0]!.params as { placement: { rotation: number } }).placement.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect(erreur(commandeOccurrence(ctx, d, { composantId: "", niveauId: "", x: 1, y: 2, z: 0, orientation: 0 }))).toBe(ERREUR_OCCURRENCE);
    expect(erreur(commandeOccurrence(ctx, d, { composantId: "k1", niveauId: "", x: Number.NaN, y: 2, z: 0, orientation: 0 }))).toBe(ERREUR_OCCURRENCE);
    expect(erreur(commandeOccurrence(ctx, d, { composantId: "k1", niveauId: "inconnu", x: 1, y: 2, z: 0, orientation: 0 }))).toBe("Niveau introuvable.");
    expect(coteAbsolue(d, "", 2)).toBe(2);
  });

  it("élément structurel : poteau, poutre, dalle depuis la saisie ; refus sans type, sans section ou avec une géométrie incomplète ; le modèle les accepte", () => {
    const d = immeuble();
    const poteau = ok(commandeStructure(ctx, d, { ...SAISIE_STRUCTURE_VIDE, type: "column", niveauId: "n1", geometrie: "1 1", largeur: 0.3, profondeur: 0.4, hauteur: 3, base: 0, orientation: 0 }, lireSommets));
    const poutre = ok(commandeStructure(ctx, d, { ...SAISIE_STRUCTURE_VIDE, type: "beam", niveauId: "n1", geometrie: "0 0; 6 0", largeur: 0.2, hauteur: 0.5, base: 2.5 }, lireSommets));
    const dalle = ok(commandeStructure(ctx, d, { ...SAISIE_STRUCTURE_VIDE, type: "slab", niveauId: "n1", geometrie: "0 0; 6 0; 6 5; 0 5", hauteur: 0.2, base: 3 }, lireSommets));
    expect(poteau[0]!.params).toMatchObject({ type: "column", base: 3.2, niveauId: "n1", width: 0.3, depth: 0.4 });
    expect(dalle[0]!.params).toMatchObject({ type: "slab", base: 6.2, thickness: 0.2 });
    const apres = applyStudioCommands(d, [...poteau, ...poutre, ...dalle]);
    expect(apres.architecture!.map((x) => x.type)).toEqual(["column", "beam", "slab"]);
    expect(erreur(commandeStructure(ctx, d, SAISIE_STRUCTURE_VIDE, lireSommets))).toBe(ERREUR_STRUCTURE);
    expect(erreur(commandeStructure(ctx, d, { ...SAISIE_STRUCTURE_VIDE, type: "column", geometrie: "1 1", hauteur: 3, base: 0, orientation: 0, largeur: 0.3 }, lireSommets))).toBe(ERREUR_STRUCTURE);
    expect(erreur(commandeStructure(ctx, d, { ...SAISIE_STRUCTURE_VIDE, type: "beam", geometrie: "0 0", largeur: 0.2, hauteur: 0.5, base: 0 }, lireSommets))).toMatch(/deux points de l’axe/);
    expect(erreur(commandeStructure(ctx, d, { ...SAISIE_STRUCTURE_VIDE, type: "slab", geometrie: "0 0; 1 1", hauteur: 0.2, base: 0 }, lireSommets))).toMatch(/trois points au moins/);
  });

  it("rendre unique : une définition copiée et l'occurrence replacée sur elle, en un seul lot accepté", () => {
    const d = applyStudioCommands(immeuble(), ok(commandeOccurrence({ nouvelId: () => "q1", layerId: undefined }, immeuble(), { composantId: "k1", niveauId: "", x: 0, y: 0, z: 0, orientation: 0 })));
    const lot = ok(commandeRendreUnique({ nouvelId: () => "k2", layerId: undefined }, d, "q1"));
    expect(lot.map((c) => c.toolId)).toEqual(["studio.composant.definir", "studio.composant.placer"]);
    const apres = applyStudioCommands(d, lot);
    expect(apres.occurrences![0]!.composantId).toBe("k2");
    expect(apres.composants!.find((c) => c.id === "k2")!.nom).toBe("Gaine (unique)");
    expect(erreur(commandeRendreUnique(ctx, d, "absente"))).toBe("Occurrence ou définition introuvable.");
  });

  it("vue par niveau : un niveau supprimé revient à « tous » ; la vue n'affiche que les objets du niveau", () => {
    const d = applyStudioCommands(immeuble(), [
      ...ok(commandeOccurrence({ nouvelId: () => "q0", layerId: undefined }, immeuble(), { composantId: "k1", niveauId: "n0", x: 0, y: 0, z: 0, orientation: 0 })),
      ...ok(commandeOccurrence({ nouvelId: () => "q1", layerId: undefined }, immeuble(), { composantId: "k1", niveauId: "n1", x: 0, y: 0, z: 0, orientation: 0 })),
    ]);
    expect(choixVueValide(d, "n1")).toBe("n1");
    expect(choixVueValide(d, "supprime")).toBeNull();
    expect(choixVueValide(d, VUE_SANS_NIVEAU)).toBe(VUE_SANS_NIVEAU);
    expect(studioMesh3d(studioVueNiveau(d, "n1")).occurrences!.map((o) => o.id)).toEqual(["q1"]);
  });
});

describe("X.1-04 — rendu du panneau Bâtiment (libellés en français, champs, actions)", () => {
  const rendu = (outil: string, doc = immeuble()) => renderToStaticMarkup(createElement(PanneauBatiment, {
    doc, outil: outil as never, modifiable: true, contexte: () => ctx, surCommandes: () => true, surErreur: () => {}, vueNiveau: null, surVueNiveau: () => {}, masquerLibres: false, surMasquerLibres: () => {},
  }));
  it("chaque outil ouvre son formulaire ; la vue par niveau est toujours proposée ; aucune valeur n'est pré-remplie", () => {
    expect(rendu("studio.niveau.definir")).toContain("data-studio-niveau-formulaire");
    expect(rendu("studio.niveau.definir")).toContain('data-studio-niveau="n1"');
    expect(rendu("studio.composant.definir")).toContain("data-studio-composant-formulaire");
    expect(rendu("studio.composant.placer")).toContain("data-studio-occurrence-formulaire");
    const s = rendu("studio.structure.element");
    expect(s).toContain("data-studio-structure-formulaire");
    expect(s).toContain("Élément structurel");
    expect(s).not.toMatch(/data-studio-champ-batiment="structure-(hauteur|base)"[^>]*value="\d/);
    for (const o of ["studio.niveau.definir", "studio.composant.definir", "studio.composant.placer", "studio.structure.element"]) expect(rendu(o)).toContain("data-studio-vue-niveau=\"\"");
  });
});
