import type { StudioCommand, StudioDocument } from "../document-2d.js";
import { commandesDuDocument } from "./commandes.js";
import { PARAMETRES_S2, planDeNiveau } from "./s2-niveau.js";
import { AVERTISSEMENT_CORPUS, GRAINES_CORPUS, LICENCE_CORPUS, type CouvertureCorpus } from "./types.js";

/**
 * S6 — étude à variantes et révisions (X.1-06). REF-02 §18.2 : « étude avec plusieurs variantes, révisions, dossiers et
 * contrôles ». Plan déterministe, rejoué par l'API dans la recette `apps/web/e2e/studio-corpus-s6.mjs` :
 * - variante A (variante initiale de l'étude) : A1 pose le plan de niveau synthétique (S2, préfixe `s6-`) ; A2 ajoute une
 *   fenêtre de 0,6 × 0,7 m au mur `s6-0-mur-h` (REC-A-03 : net 3,180 m³ puis 3,096 m³) ; A3 déplace un texte ;
 * - variante B, dérivée de A **à la révision A1** : B1 supprime le mur `s6-1-mur-v` avec son ouverture (cascade) ; B2
 *   ajoute une ligne ;
 * - variante C, dérivée de la **tête** de A (après A3) : C1 ajoute deux lignes ;
 * - une feuille et un dossier de conception sur la tête de A ; trois exigences de **recette** (nombre de murs, volume net
 *   des murs, volume net du mur `s6-0-mur-h` ; valeurs exigées = celles de A selon l'oracle, source déclarée
 *   synthétique, sans valeur réglementaire) contrôlées sur chaque variante.
 */

const SOURCE_EXIGENCE = "Exigence de recette synthétique du corpus S6, sans valeur réglementaire";
export const DEFINITION_S6 = "Scène S6 : étude avec plusieurs variantes, révisions, dossiers et contrôles.";
export type CleVarianteS6 = "A" | "B" | "C";

export interface EtapeS6 {
  variante: CleVarianteS6;
  /** A1, A2… : une enveloppe de commandes, donc une révision. */
  cle: string;
  libelle: string;
  commandes: StudioCommand[];
}

export interface VarianteS6 {
  cle: CleVarianteS6;
  nom: string;
  /** Source de la dérivation : variante et étape après laquelle elle part (null : variante initiale de l'étude). */
  depuis: { variante: CleVarianteS6; apresEtape: string } | null;
}

export interface PlanS6 {
  scene: "S6";
  definition: string;
  taille: number;
  graine: number;
  synthetique: true;
  licence: string;
  avertissement: string;
  /** Ce que l'étude représente de la définition REF-02 §18.2 et ce qu'elle déclare absent. */
  couverture: CouvertureCorpus;
  etude: string;
  base: StudioDocument;
  variantes: VarianteS6[];
  /** Dans l'ordre d'exécution : une variante dérivée est créée juste avant sa première étape. */
  etapes: EtapeS6[];
  feuille: { variante: CleVarianteS6; number: string; title: string; format: "A4"; orientation: "portrait"; scale: 100 };
  dossier: { title: string };
  /** Exigences de **recette** (source déclarée synthétique) ; leurs valeurs exigées viennent de l'oracle (`oracleS6().exigences`). */
  exigences: ExigenceS6[];
}

export interface ExigenceS6 {
  id: string;
  libelle: string;
  metrique: { type: "nombre"; nature: "mur-architectural" } | { type: "total"; grandeur: "volume-net" } | { type: "objet"; objetId: string; grandeur: "volume-net" };
  comparaison: "=";
  tolerance?: number;
  unite: "u" | "m3";
  source: string;
}

export function planS6(taille = 100): PlanS6 {
  const base = planDeNiveau("S6", DEFINITION_S6, taille).documents;
  if (base.length !== 1) throw new RangeError("S6 : un seul feuillet attendu (taille de 20 000 primitives au plus)");
  const doc = base[0]!;
  const F = PARAMETRES_S2.fenetre;
  const ligne = (id: string, y: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", layerId: "axes", start: { x: -3, y }, end: { x: -1, y } } });
  return {
    scene: "S6", definition: DEFINITION_S6, taille, graine: GRAINES_CORPUS.S6, synthetique: true, licence: LICENCE_CORPUS, avertissement: AVERTISSEMENT_CORPUS,
    couverture: {
      representes: [
        "plusieurs variantes : A initiale, B dérivée d'une révision antérieure de A, C dérivée de la tête de A",
        "révisions : une enveloppe de commandes par étape (six étapes), rejeu d'une enveloppe sans révision en double (recette)",
        "dossier : une feuille et un dossier de conception sur la tête de A",
        "contrôles : trois exigences de recette contrôlées sur chaque tête, statuts et conclusions attendus",
        "comparaison de révisions entre variantes (A ↔ B)",
      ],
      absents: [
        { element: "exigences réglementaires", raison: "aucune valeur réglementaire n'est inventée : exigences de recette synthétiques, source déclarée" },
        { element: "fusion de variantes", raison: "le plan dérive et compare des variantes ; il n'en fusionne aucune" },
      ],
    },
    etude: "Étude synthétique S6 (corpus de qualification)", base: doc,
    variantes: [
      { cle: "A", nom: "Variante A (synthétique)", depuis: null },
      { cle: "B", nom: "Variante B (synthétique)", depuis: { variante: "A", apresEtape: "A1" } },
      { cle: "C", nom: "Variante C (synthétique)", depuis: { variante: "A", apresEtape: "A3" } },
    ],
    etapes: [
      { variante: "A", cle: "A1", libelle: "pose du plan de niveau synthétique", commandes: commandesDuDocument(doc) },
      { variante: "A", cle: "A2", libelle: "fenêtre ajoutée au mur s6-0-mur-h", commandes: [{ toolId: "studio.architecture.ouverture", params: { id: "s6-0-fenetre-ajoutee", type: "opening", hostId: "s6-0-mur-h", position: 4.5, width: F.largeur, height: F.hauteur, sill: F.allege, kind: "fenetre" } }] },
      { variante: "A", cle: "A3", libelle: "texte de la pièce 0 déplacé", commandes: [{ toolId: "studio.dessin.deplacer", params: { id: "s6-0-piece", dx: 0.5, dy: 0.5 } }] },
      { variante: "B", cle: "B1", libelle: "mur s6-1-mur-v supprimé avec sa fenêtre", commandes: [{ toolId: "studio.architecture.supprimer", params: { ids: ["s6-1-mur-v"], cascade: true } }] },
      { variante: "B", cle: "B2", libelle: "ligne ajoutée", commandes: [ligne("s6-b-ligne", -2)] },
      { variante: "C", cle: "C1", libelle: "deux lignes ajoutées", commandes: [ligne("s6-c-ligne-1", -2), ligne("s6-c-ligne-2", -4)] },
    ],
    feuille: { variante: "A", number: "F-01", title: "Plan synthétique S6", format: "A4", orientation: "portrait", scale: 100 },
    dossier: { title: "Dossier synthétique S6" },
    exigences: [
      { id: "s6-nombre-murs", libelle: "Nombre de murs (recette du corpus S6)", metrique: { type: "nombre", nature: "mur-architectural" }, comparaison: "=", unite: "u", source: SOURCE_EXIGENCE },
      { id: "s6-volume-net", libelle: "Volume net des murs (recette du corpus S6)", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "=", tolerance: 1e-6, unite: "m3", source: SOURCE_EXIGENCE },
      { id: "s6-mur-0", libelle: "Volume net du mur s6-0-mur-h (recette REC-A-03)", metrique: { type: "objet", objetId: "s6-0-mur-h", grandeur: "volume-net" }, comparaison: "=", tolerance: 1e-9, unite: "m3", source: SOURCE_EXIGENCE },
    ],
  };
}
