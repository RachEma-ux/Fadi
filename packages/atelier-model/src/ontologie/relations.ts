/**
 * Relations entre objets (cahier §5.2, colonne « Relations »).
 *
 * Une relation est orientée `sourceId → cibleId`. `derivee: true` signale une relation recalculée à partir des
 * paramètres canoniques (ex. `heberge-par` dérivée de `murHoteId`, `delimitee-par`, `joint-a`) : elle n'est
 * jamais saisie. Une relation non dérivée (`contient` d'une zone, `appartient-a` d'un groupe…) est portée par
 * les commandes.
 */
import type { ClasseObjet, IdObjet } from "./classes.js";

export const TYPES_RELATION = [
  /** baie → mur hôte */
  "heberge-par",
  /** mur → baies (réciproque de `heberge-par`, dérivée) */
  "heberge",
  /** escalier → niveau (rôle `depart` ou `arrivee`) */
  "relie",
  /** zone → pièces / espaces (le niveau d'un objet est porté par `niveauId`, une seule source : D-024) */
  "contient",
  /** pièce → murs (dérivée) */
  "delimitee-par",
  /** mur → pièces (dérivée) */
  "delimite",
  /** mur → murs (dérivée) */
  "joint-a",
  /** dalle → objets posés (dérivée) */
  "porte",
  /** annotation → objet (référence à une caractéristique) */
  "reference",
  /** pièce → espace programmé (liaison avec le module Programmation) */
  "programme",
  /** objet → groupe */
  "appartient-a",
] as const;
export type TypeRelation = (typeof TYPES_RELATION)[number];

export interface Relation {
  readonly type: TypeRelation;
  readonly sourceId: IdObjet;
  readonly cibleId: IdObjet;
  /** Rôle précis (ex. `depart` / `arrivee` pour `relie`, caractéristique pour `reference`). */
  readonly role?: string;
  readonly derivee: boolean;
}

/** Relations admises par classe source → classes cibles (validation, DA-05-02). */
export const RELATIONS_ADMISES: Readonly<Partial<Record<TypeRelation, { readonly sources: readonly ClasseObjet[]; readonly cibles: readonly ClasseObjet[] }>>> = {
  "heberge-par": { sources: ["porte", "fenetre", "ouverture"], cibles: ["mur"] },
  heberge: { sources: ["mur"], cibles: ["porte", "fenetre", "ouverture"] },
  relie: { sources: ["escalier"], cibles: ["niveau"] },
  "delimitee-par": { sources: ["piece", "espace"], cibles: ["mur"] },
  delimite: { sources: ["mur"], cibles: ["piece", "espace"] },
  "joint-a": { sources: ["mur"], cibles: ["mur"] },
  reference: { sources: ["cotation", "texte", "etiquette"], cibles: ["mur", "porte", "fenetre", "ouverture", "dalle", "escalier", "poteau", "piece", "espace", "zone", "solide"] },
  "appartient-a": {
    sources: [
      "mur",
      "porte",
      "fenetre",
      "ouverture",
      "dalle",
      "toiture",
      "escalier",
      "poteau",
      "piece",
      "espace",
      "zone",
      "solide",
      "esquisse.ligne",
      "esquisse.polyligne",
      "esquisse.arc",
      "esquisse.cercle",
      "esquisse.rectangle",
      "esquisse.polygone",
      "esquisse.spline",
      "esquisse.construction",
      "esquisse.hachure",
      "cotation",
      "texte",
      "etiquette",
    ],
    cibles: ["groupe"],
  },
};

/** Vrai si la relation est admise entre ces classes. `contient`, `porte`, `programme` : contrôlés par leur réducteur. */
export function relationAdmise(type: TypeRelation, source: ClasseObjet, cible: ClasseObjet): boolean {
  if (type === "contient") return source === "zone" && (cible === "piece" || cible === "espace");
  if (type === "porte") return source === "dalle";
  if (type === "programme") return source === "piece";
  const regle = RELATIONS_ADMISES[type];
  return regle !== undefined && regle.sources.includes(source) && regle.cibles.includes(cible);
}
