/**
 * Tool-level availability is distinct from module presence. A module may
 * open successfully without every professional operation being supported.
 * Do not create links to planned actions or imply regulatory certification.
 */
export interface CockpitCapability {
  key: string;
  label: string;
  state: "available" | "limited" | "planned";
  module: "parcours" | "projets-sources" | "programmation" | "atelier" | "analyses" | "documents" | "collaboration" | "pilotage" | null;
  note: string;
}

export const COCKPIT_CAPABILITIES: readonly CockpitCapability[] = [
  { key: "parcours-steps", label: "Parcours — 21 étapes", state: "available", module: "parcours", note: "Étapes, contenus et propositions du dossier." },
  { key: "parcel-sources", label: "Parcelle et sources", state: "limited", module: "projets-sources", note: "Accès à l’outil Parcelle existant et aux sources du dossier ; certaines opérations restent issues du prototype." },
  { key: "programmation-core", label: "Programmation", state: "available", module: "programmation", note: "Répartition et cas de programme ; les vues avancées dépendent de leur préparation." },
  { key: "collaboration-core", label: "Collaboration", state: "limited", module: "collaboration", note: "Consultation, commentaires et partage suivant les permissions confirmées du serveur." },
  { key: "atelier-core", label: "Atelier 2D/3D", state: "available", module: "atelier", note: "Outils natifs existants ; vérifier la disponibilité de chaque outil spécialisé." },
  { key: "analysis-scope", label: "Analyses métier", state: "limited", module: "analyses", note: "Contrôles disponibles uniquement dans leur périmètre déclaré ; pas de conformité réglementaire universelle." },
  { key: "documents-scope", label: "Documents", state: "limited", module: "documents", note: "Production et fraîcheur des documents existants ; dossier complet non garanti." },
  { key: "planning-edit", label: "Planning métier", state: "available", module: "pilotage", note: "Dates, responsable, prochaine action et références de planning conservées sur le serveur." },
  { key: "verified-kpis", label: "KPI métier vérifiés", state: "planned", module: null, note: "Activation après validation des calculs et des sources en R4." },
];

export function cockpitCapabilityHref(projectId: string, capability: CockpitCapability): string | null {
  if (capability.state === "planned" || !capability.module) return null;
  if (capability.module === "pilotage") return `/projets/${encodeURIComponent(projectId)}/pilotage`;
  return `/projets/${encodeURIComponent(projectId)}?module=${capability.module}`;
}

export function cockpitCapabilityLabel(state: CockpitCapability["state"]) {
  return state === "available" ? "Opérationnel" : state === "limited" ? "Périmètre limité" : "À développer";
}
