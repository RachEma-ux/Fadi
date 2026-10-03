/**
 * Provenance et statut — obligatoires sur tout objet, toute propriété et toute valeur annotée (R3, R4).
 *
 * - provenance : d'où vient la valeur (`import` d'un jeu de données, `prototype` = valeur héritée du
 *   prototype et non recalculée, `calcul` = dérivée par un moteur versionné, `saisie` = entrée de
 *   l'utilisateur, `regle` = produite par une règle déclarée) ;
 * - statut : ce qu'on sait de la valeur (`declaree` telle que fournie, `verifiee`, `a-verifier`,
 *   `a-confirmer` = déclarée par la source comme supposée, `non-evaluee` = absente, jamais devinée).
 */

export const PROVENANCES = ["import", "prototype", "calcul", "saisie", "regle"] as const;
export type Provenance = (typeof PROVENANCES)[number];

export const STATUTS = ["declaree", "verifiee", "a-verifier", "a-confirmer", "non-evaluee"] as const;
export type Statut = (typeof STATUTS)[number];

/** Libellés français affichables. */
export const LIBELLES_STATUT: Readonly<Record<Statut, string>> = {
  declaree: "déclarée",
  verifiee: "vérifiée",
  "a-verifier": "à vérifier",
  "a-confirmer": "à confirmer",
  "non-evaluee": "non évaluée",
};

export const LIBELLES_PROVENANCE: Readonly<Record<Provenance, string>> = {
  import: "import",
  prototype: "prototype",
  calcul: "calcul",
  saisie: "saisie",
  regle: "règle",
};

/** Traçabilité minimale : provenance et statut, plus la source du projet le cas échéant (ex. `CAD-S01`). */
export interface Tracabilite {
  readonly provenance: Provenance;
  readonly statut: Statut;
  readonly sourceId?: string;
  /** Explication courte (ex. « 0,25 m conservé uniquement pour la représentation »). */
  readonly note?: string;
}

export function estProvenance(x: unknown): x is Provenance {
  return typeof x === "string" && (PROVENANCES as readonly string[]).includes(x);
}

export function estStatut(x: unknown): x is Statut {
  return typeof x === "string" && (STATUTS as readonly string[]).includes(x);
}

/** Contrôle à l'exécution ; retourne la liste des manquements (vide si conforme). */
export function controlerTracabilite(x: unknown): string[] {
  if (typeof x !== "object" || x === null) return ["provenance et statut obligatoires"];
  const t = x as Record<string, unknown>;
  const erreurs: string[] = [];
  if (!estProvenance(t.provenance)) erreurs.push(`provenance obligatoire (${PROVENANCES.join(" / ")})`);
  if (!estStatut(t.statut)) erreurs.push(`statut obligatoire (${STATUTS.join(" / ")})`);
  if (t.sourceId !== undefined && (typeof t.sourceId !== "string" || t.sourceId.length === 0)) erreurs.push("sourceId doit être un identifiant non vide");
  return erreurs;
}

/**
 * Valeur explicitement non évaluée (R3 : une valeur absente est « non évaluée », jamais devinée).
 * Utilisée pour un paramètre canonique que la source ne fournit pas (ex. contremarches des volées B de P.118).
 */
export interface NonEvaluee {
  readonly nonEvaluee: true;
  readonly motif: string;
}

export type Evaluable<T> = T | NonEvaluee;

export function nonEvaluee(motif: string): NonEvaluee {
  return { nonEvaluee: true, motif };
}

export function estNonEvaluee(x: unknown): x is NonEvaluee {
  return typeof x === "object" && x !== null && (x as { nonEvaluee?: unknown }).nonEvaluee === true;
}
