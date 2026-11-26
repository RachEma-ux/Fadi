/**
 * Entrées de la navigation au téléphone (chantier Design, lots L5 à L7 ; spécification `ai/reprise-barre-bas.md` § 1.1 et
 * § 1.2 du Multi-Arena Design, décision du maître d'ouvrage du 25-11-2026 : barre du bas sous 700 px).
 *
 * Fonction pure, sans React ni DOM : la barre du bas, la feuille « Plus » et le rail du bureau lisent la même liste, dans
 * le même ordre pour tous les rôles ; le rôle ne fait qu'ajouter ou retirer Administration.
 */
import type { IconName } from "../components/Icon";

export type CleEntree = "accueil" | "projets" | "studio" | "geodata" | "collaboration" | "bibliotheque" | "harmonie" | "revues" | "organisations" | "extensions" | "parametres" | "administration";

export interface EntreeNavigation {
  readonly cle: CleEntree;
  readonly libelle: string;
  readonly icone: IconName;
  readonly cible: string;
  /** Marque déposée : jamais traduite. */
  readonly marque?: boolean;
}

/** Seuil de la barre du bas (S-nav) : barre à ≤ 700 px, rail à ≥ 701 px. */
export const SEUIL_BARRE_BAS_PX = 700;
export const REQUETE_BARRE_BAS = `(max-width: ${SEUIL_BARRE_BAS_PX}px)`;

/** Les quatre liens de la barre du bas ; « Plus » (5ᵉ) est un bouton qui ouvre la feuille. */
export function entreesBarre(): EntreeNavigation[] {
  return [
    { cle: "accueil", libelle: "Accueil", icone: "home", cible: "/accueil" },
    { cle: "projets", libelle: "Projets", icone: "folder", cible: "/projets" },
    { cle: "studio", libelle: "Studio", icone: "studio", cible: "/studio" },
    { cle: "geodata", libelle: "GeoData", icone: "map", cible: "/geodata", marque: true },
  ];
}

/** Entrées de la feuille « Plus », dans l'ordre du groupe secondaire du rail. */
export function entreesPlus(o: { administration: boolean; collaboration: string }): EntreeNavigation[] {
  const e: EntreeNavigation[] = [
    { cle: "collaboration", libelle: "Collaboration", icone: "people", cible: o.collaboration },
    { cle: "bibliotheque", libelle: "Bibliothèque", icone: "book", cible: "/bibliotheque/batiments" },
    { cle: "harmonie", libelle: "Harmonie", icone: "sparkle", cible: "/harmonie" },
    { cle: "revues", libelle: "Revues externes", icone: "review", cible: "/revues" },
    { cle: "organisations", libelle: "Organisations", icone: "organization", cible: "/organisations" },
    { cle: "extensions", libelle: "Extensions", icone: "puzzle", cible: "/extensions" },
    { cle: "parametres", libelle: "Paramètres", icone: "gear", cible: "/parametres" },
  ];
  if (o.administration) e.push({ cle: "administration", libelle: "Administration", icone: "admin", cible: "/admin/utilisateurs" });
  return e;
}

/**
 * Entrée active d'après l'adresse : exactement une entrée (ou aucune) porte `aria-current="page"`.
 * Projets couvre `/projets/*` sauf le module Collaboration d'un projet, qui active Collaboration (règle du rail).
 */
export function entreeActive(pathname: string, search: string): CleEntree | null {
  const module = new URLSearchParams(search).get("module");
  if (pathname === "/accueil") return "accueil";
  if (pathname === "/collaboration" || (pathname.startsWith("/projets/") && module === "collaboration")) return "collaboration";
  if (pathname === "/projets" || pathname.startsWith("/projets/")) return "projets";
  if (pathname === "/studio" || pathname.startsWith("/studio/") || pathname === "/sandbox" || pathname.startsWith("/sandbox/")) return "studio";
  if (pathname === "/geodata" || pathname.startsWith("/geodata/")) return "geodata";
  if (pathname.startsWith("/bibliotheque")) return "bibliotheque";
  if (pathname === "/harmonie") return "harmonie";
  if (pathname.startsWith("/revues")) return "revues";
  if (pathname.startsWith("/organisations")) return "organisations";
  if (pathname.startsWith("/extensions")) return "extensions";
  if (pathname === "/parametres") return "parametres";
  if (pathname.startsWith("/admin")) return "administration";
  return null;
}

/** Événement par lequel GeoData (qui n'importe rien de la coquille) demande l'ouverture de la feuille « Plus » (lot L7). */
export const EVENEMENT_OUVRIR_PLUS = "fadi:ouvrir-plus";
/** Réponse de la coquille à la fermeture de cette feuille, pour que le bouton « Plus » de GeoData remette `aria-expanded`. */
export const EVENEMENT_PLUS_FERME = "fadi:plus-ferme";
