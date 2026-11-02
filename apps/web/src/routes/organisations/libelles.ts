/** Libellés de l'espace d'organisation (phase 5) — français source, traduits par `en.json`. Purs : aucun DOM. */
import type { BusinessRole, MandateStatus, MembershipStatus, OrganizationRole, OrganizationStatus, TeamResponsibility } from "../../lib/api";

export const ROLE_ORGANISATION: Record<OrganizationRole, string> = { administrateur: "Administrateur", membre: "Membre" };
export const STATUT_ORGANISATION: Record<OrganizationStatus, string> = { active: "Active", suspendue: "Suspendue", close: "Close" };
export const STATUT_ADHESION: Record<MembershipStatus, string> = { active: "Active", suspendue: "Suspendue", terminee: "Terminée" };
export const STATUT_MANDAT: Record<MandateStatus, string> = { propose: "Proposé", actif: "Actif", refuse: "Refusé", annule: "Annulé", termine: "Terminé" };
export const RESPONSABILITE: Record<TeamResponsibility, string> = {
  diriger: "Diriger", produire: "Produire", coordonner: "Coordonner", verifier: "Vérifier", approuver: "Approuver", diffuser: "Diffuser",
};
export const RESPONSABILITES = Object.keys(RESPONSABILITE) as TeamResponsibility[];
export const ROLE_METIER: Record<BusinessRole, string> = {
  lecteur: "Lecteur", concepteur: "Concepteur", relecteur: "Relecteur", coordinateur: "Coordinateur", approbateur: "Approbateur", diffuseur: "Diffuseur",
};
export const ROLES_METIER = Object.keys(ROLE_METIER) as BusinessRole[];
export const ISSUE_APPLICATION: Record<"creer" | "deja-present" | "non-attribue" | "non-eligible", string> = {
  creer: "Fiche contact créée (aucun accès)",
  "deja-present": "Déjà participant : inchangé",
  "non-attribue": "Aucune personne choisie : ignorée",
  "non-eligible": "Pas membre actif : refusée",
};

/** Onglets de l'espace d'une organisation, dans l'ordre de la barre. */
export const ONGLETS = [
  { id: "fiche", libelle: "Fiche" },
  { id: "membres", libelle: "Membres" },
  { id: "groupes", libelle: "Groupes" },
  { id: "gabarits", libelle: "Gabarits" },
  { id: "projets", libelle: "Projets" },
] as const;
export type Onglet = (typeof ONGLETS)[number]["id"];

/** Onglet suivant au clavier (flèches, début, fin) dans une barre d'onglets ; null si la touche ne la concerne pas. */
export function ongletDuClavier(courant: Onglet, touche: string): Onglet | null {
  const i = ONGLETS.findIndex((o) => o.id === courant);
  const n = ONGLETS.length;
  const j = touche === "ArrowRight" ? (i + 1) % n : touche === "ArrowLeft" ? (i - 1 + n) % n : touche === "Home" ? 0 : touche === "End" ? n - 1 : -1;
  return j < 0 ? null : ONGLETS[j]!.id;
}
