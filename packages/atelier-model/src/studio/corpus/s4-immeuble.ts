import { annotation, architecture, calque, construireCorpus, coteGrille, nombreMotifs, objet, solide, type Primitive } from "./commun.js";
import type { StudioLayer } from "../document-2d.js";
import type { CorpusStudio } from "./types.js";

/**
 * S4 — immeuble multi-niveaux (X.1-04). REF-02 §18.2 : « immeuble multi-niveaux, structure, réseaux et composants
 * répétitifs ». Motif de 10 primitives = une travée de 6 m d'un niveau : mur de façade et mur de refend (cote de base au
 * niveau), une fenêtre et une porte (composants répétés), une boîte de 0,3 × 0,3 × 3 m et un rectangle extrudé de 6 × 6
 * × 0,2 m sur le calque « structure », une polyligne et une ligne sur le calque « réseaux », un cercle extrudé
 * (descente verticale), un texte. Les travées d'un niveau se suivent le long de x ; les niveaux s'empilent tous les
 * 3,2 m (hauteur synthétique). Le modèle n'acquiert aucune signification structurelle de la géométrie (A.3-09) : une
 * boîte reste une boîte, un rectangle extrudé un prisme ; les calques ne font que ranger.
 */

export const MOTIF_S4 = 10;
export const DEFINITION_S4 = "Scène S4 : immeuble multi-niveaux, structure, réseaux et composants répétitifs.";

/** Dimensions nominales (mètres) : les seules entrées des oracles. */
export const PARAMETRES_S4 = Object.freeze({
  travee: 6, hauteurNiveau: 3.2, epaisseur: 0.2, hauteurMur: 3,
  fenetre: { largeur: 1.2, hauteur: 1.4, allege: 0.9, position: 2.4 },
  porte: { largeur: 1, hauteur: 2.1, allege: 0, position: 2.5 },
  boite: { cote: 0.3, hauteur: 3 },
  plateau: { cote: 6, epaisseur: 0.2 },
  /** Réseau : équerre de 5 + 5 m, ligne de 5 m. */
  reseau: { equerre: 10, ligne: 5 },
  descente: { rayon: 0.1 },
});

/**
 * Travées par niveau pour `motifs` travées au total : au plus le côté de la grille carrée (⌈√motifs⌉) et au plus la
 * moitié des travées (arrondie au-dessus), une au moins — donc deux niveaux au moins dès deux travées, un seul niveau
 * pour une travée.
 */
export const traveesParNiveau = (motifs: number): number => Math.max(1, Math.min(coteGrille(motifs), Math.ceil(motifs / 2)));

export function corpusS4(taille: number): CorpusStudio {
  const P = PARAMETRES_S4, motifs = nombreMotifs(taille, MOTIF_S4), parNiveau = traveesParNiveau(motifs);
  const niveaux = Math.ceil(motifs / parNiveau);
  const primitive = (j: number, role: number): Primitive => {
    const niveau = Math.floor(j / parNiveau), x = (j % parNiveau) * P.travee, z = niveau * P.hauteurNiveau, id = (s: string) => `s4-${j}-${s}`;
    const layerId = `niveau-${niveau}`;
    const mur = (s: string, fin: { x: number; y: number }) => architecture({ id: id(s), type: "wall", layerId, axis: [{ x, y: 0 }, fin], thickness: P.epaisseur, height: P.hauteurMur, base: z, justification: "center" });
    switch (role) {
      case 0: return mur("facade", { x: x + P.travee, y: 0 });
      case 1: return architecture({ id: id("fenetre"), type: "opening", hostId: id("facade"), position: P.fenetre.position, width: P.fenetre.largeur, height: P.fenetre.hauteur, sill: P.fenetre.allege, kind: "fenetre" });
      case 2: return mur("refend", { x, y: P.travee });
      case 3: return architecture({ id: id("porte"), type: "opening", hostId: id("refend"), position: P.porte.position, width: P.porte.largeur, height: P.porte.hauteur, sill: P.porte.allege, kind: "porte" });
      case 4: return solide({ id: id("boite"), type: "box", layerId: "structure", placement: { origin: { x: x - P.boite.cote / 2, y: -P.boite.cote / 2, z }, rotation: 0 }, width: P.boite.cote, depth: P.boite.cote, height: P.boite.hauteur });
      case 5: return objet({ id: id("plateau"), type: "rectangle", layerId: "structure", origin: { x, y: 0 }, width: P.plateau.cote, height: P.plateau.cote, extrusion: { base: z + P.hauteurMur, height: P.plateau.epaisseur } });
      case 6: return objet({ id: id("reseau"), type: "polyline", layerId: "reseaux", points: [{ x: x + 0.5, y: 5.5 }, { x: x + 5.5, y: 5.5 }, { x: x + 5.5, y: 0.5 }], closed: false });
      case 7: return objet({ id: id("branche"), type: "line", layerId: "reseaux", start: { x: x + 0.5, y: 5.5 }, end: { x: x + 0.5, y: 0.5 } });
      case 8: return objet({ id: id("descente"), type: "circle", layerId: "reseaux", center: { x: x + 5.5, y: 5.5 }, radius: P.descente.rayon, extrusion: { base: z, height: P.hauteurNiveau } });
      default: return annotation({ id: id("etiquette"), type: "text", layerId, position: { x: x + 1, y: 3 }, height: 0.2, rotation: 0, content: `Niveau ${niveau}, travée ${j % parNiveau} (synthétique)`, justification: "left" });
    }
  };
  const calques: StudioLayer[] = [
    ...Array.from({ length: niveaux }, (_, k) => calque(`niveau-${k}`, `Niveau ${k} (synthétique)`)),
    calque("structure", "Structure (synthétique)"), calque("reseaux", "Réseaux (synthétique)"),
  ];
  return construireCorpus({
    scene: "S4", definition: DEFINITION_S4, taille, motif: MOTIF_S4, primitive, calques,
    couverture: {
      representes: ["niveaux empilés (cote de base des murs, des boîtes et des extrusions)", "géométrie rangée sur un calque « structure »", "réseaux (polylignes, lignes, cercles extrudés)", "répétition géométrique (travées, fenêtres et portes répétées par motif)"],
      absents: [
        { element: "niveaux comme objets", raison: "studio-document/1 n'a pas d'objet niveau : un calque par niveau et la cote de base en tiennent lieu" },
        { element: "composants (définition partagée + occurrences)", raison: "studio-document/1 n'a pas de type composant" },
        { element: "éléments structurels typés (poteau, dalle)", raison: "aucune signification BIM n'est acquise par la géométrie (A.3-09) : boîtes et prismes seulement" },
      ],
    },
  });
}
