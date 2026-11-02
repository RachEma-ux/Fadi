/**
 * Périmètre du Studio (EX-002) : il traite la conception architecturale (dessin, modèles, BIM, rendu, métrés,
 * coordination, observations, révisions, livrables). Comptabilité, gestion RH, commerce, direction quotidienne des
 * travaux, réserves de chantier et exploitation restent **hors** de sa responsabilité : une demande qui les vise est
 * refusée par un motif nommé (`hors-perimetre`), jamais traitée par un module concurrent. Pur.
 */
export const STUDIO_DOMAINES_TRAITES = Object.freeze(["dessin", "modeles", "bim", "rendu", "metres", "coordination", "observations", "revisions", "livrables"] as const);

export const STUDIO_DOMAINES_EXCLUS = Object.freeze([
  { id: "comptabilite", libelle: "comptabilité", mots: ["comptabilite", "compta", "facture", "facturation"] },
  { id: "rh", libelle: "gestion RH", mots: ["rh", "ressources-humaines", "paie", "salaire", "conges", "personnel"] },
  { id: "commerce", libelle: "commerce", mots: ["commerce", "vente", "ventes"] },
  { id: "direction-travaux", libelle: "direction quotidienne des travaux", mots: ["direction-travaux", "chantier"] },
  { id: "reserves-chantier", libelle: "réserves de chantier", mots: ["reserves", "reserve-chantier", "levee-reserves"] },
  { id: "exploitation", libelle: "exploitation", mots: ["exploitation", "maintenance", "gmao"] },
] as const);
export type StudioDomaineExclu = (typeof STUDIO_DOMAINES_EXCLUS)[number]["id"];

export interface StudioRefusPerimetre { code: "hors-perimetre"; domaine: StudioDomaineExclu; libelle: string; message: string }

const normaliser = (s: string) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();

/**
 * Refus nommé d'une demande hors périmètre : un identifiant d'outil `studio.<domaine>.…` (ou tout segment) qui désigne
 * un domaine exclu. `null` : la demande n'est pas hors périmètre (elle peut encore être refusée pour une autre raison).
 */
export function studioHorsPerimetre(identifiant: unknown): StudioRefusPerimetre | null {
  if (typeof identifiant !== "string") return null;
  const segments = normaliser(identifiant).split(/[.:/\s_]+/).filter(Boolean);
  for (const d of STUDIO_DOMAINES_EXCLUS) {
    if (segments.some((s) => (d.mots as readonly string[]).includes(s))) {
      return { code: "hors-perimetre", domaine: d.id, libelle: d.libelle, message: `Hors du périmètre du Studio (EX-002) : ${d.libelle} n’est pas traitée par le Studio, limité à la conception architecturale.` };
    }
  }
  return null;
}
