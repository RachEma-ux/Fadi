import { annotation, architecture, calque, construireCorpus, coteGrille, nombreMotifs, objet, occurrence, type Primitive } from "./commun.js";
import type { StudioLayer } from "../document-2d.js";
import type { StudioComposant } from "../batiment/composants.js";
import type { StudioNiveau } from "../batiment/niveaux.js";
import type { CorpusStudio } from "./types.js";

/**
 * S4 — immeuble multi-niveaux (X.1-04). REF-02 §18.2 : « immeuble multi-niveaux, structure, réseaux et composants
 * répétitifs ». Motif de 10 primitives = une travée de 6 m d'un niveau : mur de façade et mur de refend rattachés au
 * niveau (cote de base = cote du niveau), une fenêtre et une porte, un **poteau**, une **dalle** et une **poutre** typés
 * (calque « structure »), une polyligne de réseau (calque « réseaux »), une **occurrence** du composant partagé
 * « Gaine (synthétique) » rattachée au niveau, un texte. Les travées d'un niveau se suivent le long de x ; les niveaux
 * sont des **objets** (`niveaux` : nom et cote) qui s'empilent tous les 3,2 m (hauteur synthétique). Chaque feuillet porte
 * les niveaux et la définition qu'il emploie.
 *
 * Géométrie seulement : aucune vérification structurelle, aucun matériau, aucune valeur réglementaire ni constante
 * normative (sections, épaisseurs et hauteurs sont des données synthétiques de test) ; une boîte ne devient jamais un
 * poteau (A.3-09) : poteaux, poutres et dalles sont créés comme tels.
 */

export const MOTIF_S4 = 10;
export const DEFINITION_S4 = "Scène S4 : immeuble multi-niveaux, structure, réseaux et composants répétitifs.";

/** Dimensions nominales (mètres) : les seules entrées des oracles. */
export const PARAMETRES_S4 = Object.freeze({
  travee: 6, hauteurNiveau: 3.2, epaisseur: 0.2, hauteurMur: 3,
  fenetre: { largeur: 1.2, hauteur: 1.4, allege: 0.9, position: 2.4 },
  porte: { largeur: 1, hauteur: 2.1, allege: 0, position: 2.5 },
  poteau: { cote: 0.3, hauteur: 3 },
  dalle: { cote: 6, epaisseur: 0.2 },
  poutre: { largeur: 0.2, hauteur: 0.4 },
  /** Réseau : équerre de 5 + 5 m. */
  reseau: { equerre: 10 },
  /** Gaine : composant partagé, boîte de section carrée sur la hauteur d'un niveau, posée en (x + 5,4 ; 5,4). */
  gaine: { cote: 0.2, position: 5.4 },
});

export const COMPOSANT_S4 = "s4-gaine";
export const niveauS4 = (k: number): StudioNiveau => ({ id: `s4-niveau-${k}`, nom: `Niveau ${k} (synthétique)`, cote: k * PARAMETRES_S4.hauteurNiveau });
export const composantS4 = (): StudioComposant => ({
  id: COMPOSANT_S4, nom: "Gaine (synthétique)",
  solides: [{ id: "gaine", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: PARAMETRES_S4.gaine.cote, depth: PARAMETRES_S4.gaine.cote, height: PARAMETRES_S4.hauteurNiveau }],
});

/**
 * Travées par niveau pour `motifs` travées au total : au plus le côté de la grille carrée (⌈√motifs⌉) et au plus la
 * moitié des travées (arrondie au-dessus), une au moins — donc deux niveaux au moins dès deux travées, un seul niveau
 * pour une travée.
 */
export const traveesParNiveau = (motifs: number): number => Math.max(1, Math.min(coteGrille(motifs), Math.ceil(motifs / 2)));

export function corpusS4(taille: number): CorpusStudio {
  const P = PARAMETRES_S4, motifs = nombreMotifs(taille, MOTIF_S4), parNiveau = traveesParNiveau(motifs);
  const primitive = (j: number, role: number): Primitive => {
    const niveau = Math.floor(j / parNiveau), x = (j % parNiveau) * P.travee, z = niveau * P.hauteurNiveau, id = (s: string) => `s4-${j}-${s}`;
    const niveauId = niveauS4(niveau).id;
    const mur = (s: string, fin: { x: number; y: number }) => architecture({ id: id(s), type: "wall", niveauId, axis: [{ x, y: 0 }, fin], thickness: P.epaisseur, height: P.hauteurMur, base: z, justification: "center" });
    switch (role) {
      case 0: return mur("facade", { x: x + P.travee, y: 0 });
      case 1: return architecture({ id: id("fenetre"), type: "opening", hostId: id("facade"), position: P.fenetre.position, width: P.fenetre.largeur, height: P.fenetre.hauteur, sill: P.fenetre.allege, kind: "fenetre" });
      case 2: return mur("refend", { x, y: P.travee });
      case 3: return architecture({ id: id("porte"), type: "opening", hostId: id("refend"), position: P.porte.position, width: P.porte.largeur, height: P.porte.hauteur, sill: P.porte.allege, kind: "porte" });
      case 4: return architecture({ id: id("poteau"), type: "column", layerId: "structure", niveauId, position: { x, y: 0 }, rotation: 0, width: P.poteau.cote, depth: P.poteau.cote, height: P.poteau.hauteur, base: z });
      case 5: return architecture({ id: id("dalle"), type: "slab", layerId: "structure", niveauId, contour: [{ x, y: 0 }, { x: x + P.dalle.cote, y: 0 }, { x: x + P.dalle.cote, y: P.dalle.cote }, { x, y: P.dalle.cote }], thickness: P.dalle.epaisseur, base: z + P.hauteurMur });
      case 6: return architecture({ id: id("poutre"), type: "beam", layerId: "structure", niveauId, start: { x, y: P.travee }, end: { x: x + P.travee, y: P.travee }, width: P.poutre.largeur, height: P.poutre.hauteur, base: z + P.hauteurMur - P.poutre.hauteur });
      case 7: return objet({ id: id("reseau"), type: "polyline", layerId: "reseaux", points: [{ x: x + 0.5, y: 5.5 }, { x: x + 5.5, y: 5.5 }, { x: x + 5.5, y: 0.5 }], closed: false });
      case 8: return occurrence({ id: id("gaine"), type: "occurrence", composantId: COMPOSANT_S4, layerId: "reseaux", niveauId, placement: { origin: { x: x + P.gaine.position, y: P.gaine.position, z }, rotation: 0 } });
      default: return annotation({ id: id("etiquette"), type: "text", position: { x: x + 1, y: 3 }, height: 0.2, rotation: 0, content: `Niveau ${niveau}, travée ${j % parNiveau} (synthétique)`, justification: "left" });
    }
  };
  const calques: StudioLayer[] = [calque("structure", "Structure (synthétique)"), calque("reseaux", "Réseaux (synthétique)")];
  return construireCorpus({
    scene: "S4", definition: DEFINITION_S4, taille, motif: MOTIF_S4, primitive, calques,
    // Chaque feuillet porte les niveaux de ses objets (par cote croissante) et la définition de la gaine s'il en place.
    communs: (primitives) => {
      const niveaux = new Set<string>();
      let gaine = false;
      for (const p of primitives) {
        const v = p.valeur as { niveauId?: string };
        if (v.niveauId !== undefined) niveaux.add(v.niveauId);
        if (p.champ === "occurrences") gaine = true;
      }
      const liste = [...niveaux].map((n) => Number(n.slice("s4-niveau-".length))).sort((a, b) => a - b).map(niveauS4);
      return { ...(liste.length ? { niveaux: liste } : {}), ...(gaine ? { composants: [composantS4()] } : {}) };
    },
    couverture: {
      representes: [
        "niveaux comme objets (nom, cote) ; murs, poteaux, poutres, dalles et occurrences rattachés à leur niveau",
        "éléments structurels typés (poteau, poutre, dalle) sur un calque « structure » : géométrie seulement",
        "réseaux (polylignes, occurrences de la gaine)",
        "composants répétitifs : une définition partagée (gaine) et une occurrence par travée ; fenêtres et portes répétées par motif",
      ],
      absents: [],
    },
  });
}
