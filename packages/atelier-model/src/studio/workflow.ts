/**
 * Workflow de conception d'une étude Studio (Définition officielle de référence V2.1, REF-01 §06) : « Cadrer →
 * Explorer → Concevoir → Contrôler → Coordonner et corriger → Approuver → Publier ». Les sept phases, leur ordre et
 * leur nom sont ceux de la référence, ni inventés ni renommés ici. Le workflow « s'applique à des révisions ou dossiers
 * identifiés, et ne remplace pas la méthode des 21 étapes du Parcours » : la phase d'une étude est **déclarée** par un
 * membre autorisé (jamais déduite du contenu par heuristique) ; une étude sans déclaration est « non déclarée ».
 * Pur : ni React, ni DOM, ni base. Contrat partagé par le serveur (validation de la déclaration) et l'interface.
 */

export type StudioPhaseWorkflow = "cadrer" | "explorer" | "concevoir" | "controler" | "coordonner" | "approuver" | "publier";

export interface DefinitionPhaseWorkflow {
  readonly id: StudioPhaseWorkflow;
  /** Rang dans le workflow de la référence (1 à 7). */
  readonly rang: number;
  /** Nom exact de la phase (REF-01 §06). */
  readonly libelleFR: string;
}

/** REF-01 §06, dans l'ordre de la référence. */
export const STUDIO_PHASES_WORKFLOW: readonly DefinitionPhaseWorkflow[] = Object.freeze(([
  { id: "cadrer", rang: 1, libelleFR: "Cadrer" },
  { id: "explorer", rang: 2, libelleFR: "Explorer" },
  { id: "concevoir", rang: 3, libelleFR: "Concevoir" },
  { id: "controler", rang: 4, libelleFR: "Contrôler" },
  { id: "coordonner", rang: 5, libelleFR: "Coordonner et corriger" },
  { id: "approuver", rang: 6, libelleFR: "Approuver" },
  { id: "publier", rang: 7, libelleFR: "Publier" },
] as DefinitionPhaseWorkflow[]).map((p) => Object.freeze(p)));

export const estPhaseWorkflowStudio = (v: unknown): v is StudioPhaseWorkflow =>
  typeof v === "string" && STUDIO_PHASES_WORKFLOW.some((p) => p.id === v);
