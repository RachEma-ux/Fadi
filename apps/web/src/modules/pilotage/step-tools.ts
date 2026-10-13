/**
 * R3 — Routes métiers vérifiées de ProjectShell, aucune URL conjecturale.
 *
 * Le cockpit orchestre les outils existants ; il n'est pas propriétaire de
 * leurs données. « Bloqué » concerne l'usage précis (ex. comparaison) et
 * non pas l'accès général au module. Les voies de préparation restent ouvertes.
 */
export type StepToolState = "available" | "limited" | "blocked" | "checking" | "planned";
export type StepToolKey =
  | "parcours" | "parcelle" | "programmation" | "hypotheses" | "modele-programme"
  | "atelier" | "analyses" | "documents" | "collaboration" | "conformite-auto";

export interface StepToolContext {
  /** Une absence de lecture n'est pas assimilée à un programme manquant. */
  programme: "unknown" | "missing" | "applied";
  /** « Modèle dessiné » = au moins une zone liée à la maquette ; pas seulement un fichier. */
  modele: "unknown" | "missing" | "zones";
  /** La lecture et les commentaires restent possibles sans droit d'écriture. */
  editing: "allowed" | "read-only" | "unknown";
}

interface ToolDefinition {
  key: StepToolKey;
  label: string;
  first: number;
  last: number;
  state: "available" | "limited" | "planned";
  route: "parcours" | "projets-sources" | "programmation" | "atelier" | "analyses" | "documents" | "collaboration" | null;
  vue?: "hypotheses" | "modele";
  prerequisite?: "programme" | "programme-modele";
  detail: string;
  /** Texte de préparation lorsque le prérequis manque effectivement. */
  preparation?: string;
  preparationRoute?: "programmation" | "atelier";
}

const STEP_TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    key: "parcelle", label: "Explorer la parcelle et les sources", first: 1, last: 1, state: "limited",
    route: "projets-sources",
    detail: "Outil Parcelle intégré au dossier : géométrie, bornes et sources. Certaines fonctions restent celles du prototype actuel.",
  },
  {
    key: "programmation", label: "Ouvrir la programmation", first: 4, last: 9, state: "available",
    route: "programmation", detail: "Répartition, besoins, surfaces et cas de programme du projet.",
  },
  {
    key: "hypotheses", label: "Registre des hypothèses du programme", first: 7, last: 9, state: "limited",
    route: "programmation", vue: "hypotheses", prerequisite: "programme",
    detail: "Cette vue dépend d'un cas de programme appliqué ; les confirmations exigent leurs preuves.",
    preparation: "Appliquer un cas de programme avant de consulter ses hypothèses.",
    preparationRoute: "programmation",
  },
  {
    key: "atelier", label: "Ouvrir l’Atelier architectural", first: 9, last: 12, state: "available",
    route: "atelier", detail: "Dessin 2D/3D natif ; les opérations spécialisées conservent leurs propres limites.",
  },
  {
    key: "modele-programme", label: "Comparer le programme au modèle dessiné", first: 9, last: 12,
    state: "limited", route: "programmation", vue: "modele", prerequisite: "programme-modele",
    detail: "Liaisons entre fiches du programme et zones du modèle ; ce lien n'est pas déduit des noms des pièces.",
    preparation: "Un cas de programme et des zones dessinées sont nécessaires.",
    preparationRoute: "programmation",
  },
  {
    key: "analyses", label: "Consulter les analyses métier", first: 13, last: 19, state: "limited",
    route: "analyses",
    detail: "Contrôles et quantités dans leur domaine calculable. Aucun certificat réglementaire global n'est fourni.",
  },
  {
    key: "documents", label: "Ouvrir les documents du projet", first: 17, last: 21,
    state: "limited", route: "documents",
    detail: "Catalogue, productions et état de fraîcheur ; les pièces non produites restent annoncées comme telles.",
  },
  {
    key: "collaboration", label: "Consulter la collaboration", first: 20, last: 21, state: "limited",
    route: "collaboration",
    detail: "Commentaires, partage et révisions. Les droits de partage dépendent de votre rôle.",
  },
  {
    key: "conformite-auto", label: "Certification réglementaire automatique", first: 13, last: 16,
    state: "planned", route: null, detail: "Fonction non développée ; aucun résultat de conformité ne peut être certifié ici.",
  },
  {
    key: "parcours", label: "Ouvrir l’étape dans Parcours", first: 1, last: 21,
    state: "available", route: "parcours", detail: "Formulaire métier, propositions Harmonie et décisions de cette étape.",
  },
];

export interface ResolvedStepTool {
  key: StepToolKey;
  label: string;
  status: StepToolState;
  href: string | null;
  detail: string;
  recovery: { label: string; href: string } | null;
}

export function toolHref(projectId: string, module: NonNullable<ToolDefinition["route"]>, stepNumber: number, vue?: ToolDefinition["vue"]): string {
  const root = `/projets/${encodeURIComponent(projectId)}`;
  if (module === "parcours") return `${root}?module=parcours&etape=${stepNumber}`;
  // ProjectShell ne lit « vue » que pour le module Programmation.
  return `${root}?module=${module}${vue ? `&vue=${vue}` : ""}`;
}

export function resolveStepTools(projectId: string, stepNumber: number, context: StepToolContext): ResolvedStepTool[] {
  if (!Number.isInteger(stepNumber) || stepNumber < 1 || stepNumber > 21) return [];
  return STEP_TOOL_DEFINITIONS
    .filter((rule) => stepNumber >= rule.first && stepNumber <= rule.last)
    .map((rule) => {
      if (!rule.route || rule.state === "planned") {
        return { key: rule.key, label: rule.label, status: "planned" as const, href: null, detail: rule.detail, recovery: null };
      }
      let status: StepToolState = rule.state;
      let detail = rule.detail;
      let recovery: ResolvedStepTool["recovery"] = null;
      if (rule.prerequisite) {
        const missingProgramme = context.programme === "missing";
        const unknownProgramme = context.programme === "unknown";
        const needsModele = rule.prerequisite === "programme-modele";
        if (unknownProgramme || needsModele && context.modele === "unknown" && !missingProgramme) {
          status = "checking";
          detail = "Prérequis non vérifiés : lecture des données métier en cours ou indisponible.";
        } else if (missingProgramme || needsModele && context.modele === "missing") {
          status = "blocked";
          detail = rule.preparation ?? "Des données préalables sont nécessaires.";
          const recoveryModule = missingProgramme ? "programmation" : "atelier";
          recovery = { label: missingProgramme ? "Préparer le programme" : "Ouvrir l’Atelier", href: toolHref(projectId, recoveryModule, stepNumber) };
        }
      }
      if ((status === "available" || status === "limited") && context.editing !== "allowed" && rule.key !== "parcours") {
        status = "limited";
        detail += " Consultation possible ; l’écriture reste soumise aux droits et verrous du projet.";
      }
      return {
        key: rule.key, label: rule.label, status,
        href: status === "blocked" || status === "checking" ? null : toolHref(projectId, rule.route!, stepNumber, rule.vue),
        detail, recovery,
      };
    });
}

/**
 * Le raccourci d'une carte préfère un outil métier déjà utilisable, puis
 * revient à l'étape exacte du Parcours. Jamais de lien vers une vue bloquée.
 */
export function primaryStepTool(projectId: string, stepNumber: number, context: StepToolContext): ResolvedStepTool | null {
  const tools = resolveStepTools(projectId, stepNumber, context);
  return tools.find((tool) => tool.key !== "parcours" && !!tool.href) ?? tools.find((tool) => tool.key === "parcours" && !!tool.href) ?? null;
}

export const STEP_TOOL_STATUS: Record<StepToolState, string> = {
  available: "Disponible",
  limited: "Périmètre limité",
  blocked: "Prérequis manquants",
  checking: "À vérifier",
  planned: "Non développé",
};
