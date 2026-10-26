import { STUDIO_DOMAINES_DERIVES, type StudioDomaineDerive } from "./effets.js";

/**
 * Fraîcheur des contenus dérivés (EX-016, EX-051, INV-006) : chaque contenu calculé depuis une révision (vue 3D, plan,
 * métré, export, publication) est dans exactement un état :
 * - `a-jour` pour la révision R (le résultat affiché a été calculé sur R, la révision courante) ;
 * - `a-recalculer` (la source a changé, aucun calcul n'est lancé) ;
 * - `en-calcul` (un calcul est lancé pour la révision courante) ;
 * - `echec` (le calcul de la révision courante a échoué : motif explicite) ;
 * - `non-applicable` (le contrat du contenu ne s'applique pas à ce document).
 *
 * `image` garde la révision du dernier résultat produit : « dernière image produite » n'est jamais « état courant ».
 * Un résultat calculé sur une autre révision que la révision courante est **ignoré** (il ne remplace pas le courant,
 * INV-006) : l'état ne change pas et la transition le dit (`ignore`). Pur, sans React ni DOM.
 */
export type StudioCodeEtatDerive = "a-jour" | "a-recalculer" | "en-calcul" | "echec" | "non-applicable";
export const STUDIO_ETATS_DERIVES: readonly StudioCodeEtatDerive[] = Object.freeze(["a-jour", "a-recalculer", "en-calcul", "echec", "non-applicable"] as const);

export interface StudioEtatDerive {
  etat: StudioCodeEtatDerive;
  /** Révision courante de la source (celle pour laquelle le contenu doit valoir). */
  revision: string | null;
  /** Révision du dernier résultat produit (affiché), ou null s'il n'y en a aucun. */
  image: string | null;
  motif: string | null;
}

export type StudioEvenementDerive =
  | { type: "source"; revision: string }
  | { type: "debut"; revision: string }
  | { type: "resultat"; revision: string; ok: true }
  | { type: "resultat"; revision: string; ok: false; motif: string }
  | { type: "non-applicable"; motif: string };

export interface StudioTransitionDerive { etat: StudioEtatDerive; ignore: null | "autre-revision" | "non-applicable" }

export const studioEtatDeriveInitial = (revision: string | null): StudioEtatDerive => ({ etat: "a-recalculer", revision, image: null, motif: null });

export function studioTransitionDerive(e: StudioEtatDerive, ev: StudioEvenementDerive): StudioTransitionDerive {
  if (ev.type === "non-applicable") return { etat: { etat: "non-applicable", revision: e.revision, image: e.image, motif: ev.motif }, ignore: null };
  if (ev.type === "source") {
    if (ev.revision === e.revision && e.etat !== "non-applicable") return { etat: e, ignore: null };
    return { etat: { etat: "a-recalculer", revision: ev.revision, image: e.image, motif: null }, ignore: null };
  }
  if (e.etat === "non-applicable") return { etat: e, ignore: "non-applicable" };
  // Un calcul ou un résultat d'une autre révision que la courante n'a aucun effet (jamais présenté comme courant).
  if (ev.revision !== e.revision) return { etat: e, ignore: "autre-revision" };
  if (ev.type === "debut") return { etat: { ...e, etat: "en-calcul", motif: null }, ignore: null };
  if (ev.ok) return { etat: { etat: "a-jour", revision: ev.revision, image: ev.revision, motif: null }, ignore: null };
  return { etat: { etat: "echec", revision: e.revision, image: e.image, motif: ev.motif }, ignore: null };
}

/**
 * Oracle EX-016 : un état est cohérent avec la révision courante. Refuse notamment « à jour R13 » quand l'image est
 * celle de R12 (ancienne image présentée à jour après un échec), un « à jour » sans image, ou un état d'une autre révision.
 */
export function studioEtatDeriveCoherent(e: StudioEtatDerive, revisionCourante: string): boolean {
  if (e.etat === "non-applicable") return e.motif !== null;
  if (e.revision !== revisionCourante) return false;
  if (e.etat === "a-jour") return e.image === revisionCourante;
  if (e.etat === "echec") return e.motif !== null && e.image !== revisionCourante;
  return e.image !== revisionCourante;
}

/** Libellé affiché (français, source de la traduction de l'interface). */
export function studioLibelleEtatDerive(e: StudioEtatDerive, court: (revision: string) => string = (r) => r): string {
  switch (e.etat) {
    case "a-jour": return `À jour pour la révision ${court(e.revision ?? "")}`;
    case "a-recalculer": return "À recalculer";
    case "en-calcul": return "En calcul";
    case "echec": return `Échec du calcul : ${e.motif ?? "motif non communiqué"}`;
    case "non-applicable": return `Non applicable : ${e.motif ?? ""}`;
  }
}

/** États de tous les domaines dérivés d'une révision. */
export type StudioEtatsDomaines = Readonly<Record<StudioDomaineDerive, StudioEtatDerive>>;

export function studioEtatsDomainesInitiaux(revision: string): StudioEtatsDomaines {
  return Object.fromEntries(STUDIO_DOMAINES_DERIVES.map((d) => [d, { etat: "a-jour", revision, image: revision, motif: null }])) as StudioEtatsDomaines;
}

/**
 * Révision R → R' (événement d'effets d'une commande acceptée) : seuls les domaines invalidés passent « à recalculer »
 * pour R' ; les autres restent à jour et suivent R' (le lot ne les a pas touchés).
 */
export function studioInvaliderDomaines(etats: StudioEtatsDomaines, revision: string, invalides: readonly StudioDomaineDerive[]): StudioEtatsDomaines {
  const s = new Set(invalides);
  return Object.fromEntries(STUDIO_DOMAINES_DERIVES.map((d) => {
    const e = etats[d];
    if (s.has(d)) return [d, studioTransitionDerive(e, { type: "source", revision }).etat];
    if (e.etat === "a-jour") return [d, { ...e, revision, image: revision }];
    return [d, { ...e, revision }];
  })) as StudioEtatsDomaines;
}

/** Domaines non à jour pour la révision courante (« données périmées »), dans l'ordre d'affichage. */
export function studioDomainesPerimes(etats: StudioEtatsDomaines): StudioDomaineDerive[] {
  return STUDIO_DOMAINES_DERIVES.filter((d) => etats[d].etat !== "a-jour" && etats[d].etat !== "non-applicable");
}
