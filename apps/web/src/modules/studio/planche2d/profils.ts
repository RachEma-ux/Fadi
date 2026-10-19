/**
 * Profils d'outils et favoris de la planche Studio (#166, B.2-02, B.2-04, B.2-06, B.2-07) : règle pure de visibilité
 * dans les barres d'outils. Ni React ni DOM.
 *
 * - Standard : tout le registre dans les barres.
 * - Métier : listes simples d'identifiants `STUDIO_TOOLS` déclarées ici (« Esquisse 2D », « Cotation », « Volume »).
 * - Personnel : la liste choisie par le compte.
 *
 * Trois choses distinctes, jamais confondues (B.2-06) : la **visibilité** dans les barres (ce module), la
 * **disponibilité** dans le contexte (lecture seule, sélection — décidée par l'éditeur) et le **droit** d'exécution
 * (décidé par le serveur). Un profil ne retire aucun outil du catalogue « Outils » ni de la palette, ne désactive
 * aucun raccourci clavier et ne touche ni géométrie, ni révision, ni droit (B.2-07). La Sélection reste toujours dans
 * les barres (outil de repos). Les commandes de l'éditeur (hors registre) ne sont pas filtrées.
 */
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import type { StudioToolId } from "./raccourcis";

export type IdProfilMetier = "esquisse-2d" | "cotation" | "volume";
export type IdProfil = "standard" | "personnel" | `metier:${string}`;

export interface PreferencesOutils {
  profil: IdProfil;
  favoris: readonly StudioToolId[];
  personnel: readonly StudioToolId[];
}

export interface ProfilMetier {
  readonly id: IdProfilMetier;
  readonly libelleFR: string;
  readonly outils: readonly StudioToolId[];
}

/** Outil de repos : jamais retiré des barres, quel que soit le profil. */
export const OUTIL_TOUJOURS_VISIBLE: StudioToolId = "studio.dessin.selection";

export const PROFILS_METIER: readonly ProfilMetier[] = Object.freeze([
  {
    id: "esquisse-2d", libelleFR: "Esquisse 2D",
    outils: ["studio.dessin.selection", "studio.dessin.ligne", "studio.dessin.rectangle", "studio.dessin.cercle", "studio.dessin.arc", "studio.dessin.polyligne",
      "studio.dessin.deplacer", "studio.dessin.modifier", "studio.dessin.decaler", "studio.dessin.supprimer"],
  },
  {
    id: "cotation", libelleFR: "Cotation",
    outils: ["studio.dessin.selection", "studio.dessin.cote", "studio.dessin.deplacer", "studio.dessin.modifier", "studio.dessin.supprimer"],
  },
  {
    id: "volume", libelleFR: "Volume",
    outils: ["studio.dessin.selection", "studio.dessin.rectangle", "studio.dessin.polyligne", "studio.objet.extruder", "studio.objet.aplatir",
      "studio.dessin.deplacer", "studio.dessin.modifier", "studio.dessin.supprimer"],
  },
] satisfies ProfilMetier[]);

export const PREFERENCES_DEFAUT: PreferencesOutils = Object.freeze({ profil: "standard", favoris: [], personnel: [] });

const IDS_REGISTRE: ReadonlySet<string> = new Set(STUDIO_TOOLS.map((t) => t.toolId));
export const estIdOutil = (id: string): id is StudioToolId => IDS_REGISTRE.has(id);

export const profilMetier = (profil: IdProfil): ProfilMetier | null =>
  profil.startsWith("metier:") ? PROFILS_METIER.find((p) => `metier:${p.id}` === profil) ?? null : null;

/** Choix proposés, dans l'ordre affiché. */
export const CHOIX_PROFILS: readonly { id: IdProfil; libelleFR: string }[] = Object.freeze([
  { id: "standard", libelleFR: "Standard (tous les outils)" },
  ...PROFILS_METIER.map((p) => ({ id: `metier:${p.id}` as IdProfil, libelleFR: `Métier : ${p.libelleFR}` })),
  { id: "personnel", libelleFR: "Personnel" },
]);

/**
 * Préférences relues (serveur ou défaut) → forme sûre : profil inconnu de cette interface → standard ; identifiant
 * absent du registre écarté ; doublons retirés (ordre gardé).
 */
export function normaliserPreferences(brut: { profil?: unknown; favoris?: unknown; personnel?: unknown } | null | undefined): PreferencesOutils {
  const liste = (v: unknown): StudioToolId[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is StudioToolId => typeof x === "string" && estIdOutil(x)))] : []);
  const p = typeof brut?.profil === "string" ? brut.profil : "standard";
  const profil: IdProfil = p === "standard" || p === "personnel" || (p.startsWith("metier:") && profilMetier(p as IdProfil)) ? (p as IdProfil) : "standard";
  return { profil, favoris: liste(brut?.favoris), personnel: liste(brut?.personnel) };
}

/** Outils montrés dans les barres par le profil ; `null` = tous (Standard). */
export function outilsDuProfil(prefs: PreferencesOutils): ReadonlySet<StudioToolId> | null {
  if (prefs.profil === "standard") return null;
  const liste = prefs.profil === "personnel" ? prefs.personnel : profilMetier(prefs.profil)?.outils;
  if (!liste) return null;
  return new Set<StudioToolId>([OUTIL_TOUJOURS_VISIBLE, ...liste]);
}

/**
 * Visibilité d'un outil dans les barres d'outils. Un identifiant hors registre (commande de l'éditeur) reste
 * visible : les profils ne filtrent que le registre. Ne dit rien de la disponibilité ni du droit d'exécution.
 */
export function visibleDansBarres(prefs: PreferencesOutils, toolId: string): boolean {
  if (!estIdOutil(toolId)) return true;
  const retenus = outilsDuProfil(prefs);
  return retenus === null || retenus.has(toolId);
}

/** Fabrique la fonction de visibilité d'un jeu de préférences (calcul de l'ensemble une seule fois). */
export function filtreBarres(prefs: PreferencesOutils): (toolId: string) => boolean {
  const retenus = outilsDuProfil(prefs);
  return (toolId) => !estIdOutil(toolId) || retenus === null || retenus.has(toolId);
}

/** Favoris dans l'ordre du registre (ordre stable du groupe « Favoris »). */
export const favorisOrdonnes = (prefs: PreferencesOutils): StudioToolId[] =>
  STUDIO_TOOLS.map((t) => t.toolId).filter((id) => prefs.favoris.includes(id));

const basculer = (l: readonly StudioToolId[], id: StudioToolId): StudioToolId[] => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]);

export const basculerFavori = (prefs: PreferencesOutils, id: StudioToolId): PreferencesOutils => ({ ...prefs, favoris: basculer(prefs.favoris, id) });

/**
 * Ajoute ou retire un outil de la liste Personnel. Passer en Personnel depuis un autre profil part de la liste que ce
 * profil montrait (rien ne disparaît des barres par surprise).
 */
export const basculerPersonnel = (prefs: PreferencesOutils, id: StudioToolId): PreferencesOutils => {
  if (id === OUTIL_TOUJOURS_VISIBLE) return prefs;
  return { ...prefs, personnel: basculer(prefs.personnel, id) };
};

/** Change de profil ; passer à Personnel sans liste encore choisie part des outils montrés jusque-là. */
export function choisirProfil(prefs: PreferencesOutils, profil: IdProfil): PreferencesOutils {
  if (profil === "personnel" && prefs.personnel.length === 0 && prefs.profil !== "personnel") {
    const avant = outilsDuProfil(prefs);
    const depart = STUDIO_TOOLS.map((t) => t.toolId).filter((id) => id !== OUTIL_TOUJOURS_VISIBLE && (avant === null || avant.has(id)));
    return { ...prefs, profil, personnel: depart };
  }
  return { ...prefs, profil };
}
