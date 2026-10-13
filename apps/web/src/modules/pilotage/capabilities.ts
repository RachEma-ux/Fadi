/**
 * Tool-level availability is distinct from module presence. A module may
 * open successfully without every professional operation being supported.
 * Do not create links to planned actions or imply regulatory certification.
 */
export interface CockpitCapability {
  key: string;
  label: string;
  state: "available" | "limited" | "planned";
  module: "parcours" | "atelier" | "analyses" | "documents" | null;
  note: string;
}

export const COCKPIT_CAPABILITIES: readonly CockpitCapability[] = [
  { key: "parcours-steps", label: "Parcours — 21 étapes", state: "available", module: "parcours", note: "Étapes, contenus et propositions du dossier." },
  { key: "atelier-core", label: "Atelier 2D/3D", state: "available", module: "atelier", note: "Outils natifs existants ; vérifier la disponibilité de chaque outil spécialisé." },
  { key: "analysis-scope", label: "Analyses métier", state: "limited", module: "analyses", note: "Contrôles disponibles uniquement dans leur périmètre déclaré ; pas de conformité réglementaire universelle." },
  { key: "documents-scope", label: "Documents", state: "limited", module: "documents", note: "Production et fraîcheur des documents existants ; dossier complet non garanti." },
  { key: "planning-edit", label: "Échéances et actions collaboratives", state: "planned", module: null, note: "Saisie et persistance serveur à livrer en R2." },
  { key: "verified-kpis", label: "KPI métier vérifiés", state: "planned", module: null, note: "Activation après validation des calculs et des sources en R4." },
];

export function cockpitCapabilityHref(projectId: string, capability: CockpitCapability): string | null {
  if (capability.state === "planned" || !capability.module) return null;
  return `/projets/${encodeURIComponent(projectId)}?module=${capability.module}`;
}

export function cockpitCapabilityLabel(state: CockpitCapability["state"]) {
  return state === "available" ? "Opérationnel" : state === "limited" ? "Périmètre limité" : "À développer";
}
