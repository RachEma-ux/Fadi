/**
 * Profils d'outils et favoris de la planche Studio (#166, B.2-02, B.2-04, B.2-06, B.2-07) : règle pure de visibilité
 * dans les barres d'outils. Ni React ni DOM.
 *
 * - Standard : tout le registre dans les barres.
 * - Métier : listes simples d'identifiants `STUDIO_TOOLS` déclarées ici (« Esquisse 2D », « Cotation », « Volume »).
 * - Personnel : la liste choisie par le compte.
 * - Équipe : **option non implémentée** (B.2-08) — aucun contrat de profil partagé n'est retenu ; le serveur refuse
 *   tout profil hors de `standard`, `personnel` et `metier:<id>`.
 *
 * Regroupements personnels (B.2-02) : listes nommées d'outils propres au compte, qui filtrent le catalogue « Outils »
 * sans rien changer aux barres.
 *
 * Trois choses distinctes, jamais confondues (B.2-06) : la **visibilité** dans les barres (ce module), la
 * **disponibilité** dans le contexte (lecture seule, sélection — décidée par l'éditeur) et le **droit** d'exécution
 * (décidé par le serveur). Un profil ne retire aucun outil du catalogue « Outils » ni de la palette, ne désactive
 * aucun raccourci clavier et ne touche ni géométrie, ni révision, ni droit (B.2-07). La Sélection reste toujours dans
 * les barres (outil de repos). Les commandes de l'éditeur (hors registre) ne sont pas filtrées.
 */
import { STUDIO_TOOLS, toolIdCanonique } from "@parcours/atelier-model";
import type { StudioToolId } from "./raccourcis";

export type IdProfilMetier = "esquisse-2d" | "cotation" | "volume";
export type IdProfil = "standard" | "personnel" | `metier:${string}`;

/** Regroupement personnel d'outils (B.2-02) : liste nommée, propre au compte, qui sert de filtre du catalogue. */
export interface GroupeOutils {
  readonly id: string;
  readonly nom: string;
  readonly outils: readonly StudioToolId[];
}

export interface PreferencesOutils {
  profil: IdProfil;
  favoris: readonly StudioToolId[];
  personnel: readonly StudioToolId[];
  groupes: readonly GroupeOutils[];
}

/** Bornes des regroupements, les mêmes que le serveur (`apps/api/src/lib/studio-preferences.ts`). */
export const LIMITES_GROUPES = Object.freeze({ groupes: 20, nom: 60 });

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

export const PREFERENCES_DEFAUT: PreferencesOutils = Object.freeze({ profil: "standard", favoris: [], personnel: [], groupes: [] });

const IDS_REGISTRE: ReadonlySet<string> = new Set(STUDIO_TOOLS.map((t) => t.toolId));
export const estIdOutil = (id: string): id is StudioToolId => IDS_REGISTRE.has(id);
const ID_GROUPE = /^[a-z0-9-]{1,40}$/;

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
 * absent du registre écarté (un identifiant renommé suit son alias du manifeste, `toolIdCanonique`) ; doublons
 * retirés (ordre gardé) ; regroupement mal formé ou en double écarté.
 */
export function normaliserPreferences(brut: { profil?: unknown; favoris?: unknown; personnel?: unknown; groupes?: unknown } | null | undefined): PreferencesOutils {
  const liste = (v: unknown): StudioToolId[] => (Array.isArray(v)
    ? [...new Set(v.flatMap((x) => { const c = typeof x === "string" ? toolIdCanonique(x) : null; return c && estIdOutil(c) ? [c] : []; }))]
    : []);
  const p = typeof brut?.profil === "string" ? brut.profil : "standard";
  const profil: IdProfil = p === "standard" || p === "personnel" || (p.startsWith("metier:") && profilMetier(p as IdProfil)) ? (p as IdProfil) : "standard";
  const vus = new Set<string>();
  const groupes = (Array.isArray(brut?.groupes) ? brut.groupes : []).flatMap((g): GroupeOutils[] => {
    if (!g || typeof g !== "object") return [];
    const { id, nom, outils } = g as Record<string, unknown>;
    if (typeof id !== "string" || !ID_GROUPE.test(id) || vus.has(id) || typeof nom !== "string" || !nom.trim()) return [];
    vus.add(id);
    return [{ id, nom: nom.trim().slice(0, LIMITES_GROUPES.nom), outils: liste(outils) }];
  }).slice(0, LIMITES_GROUPES.groupes);
  return { profil, favoris: liste(brut?.favoris), personnel: liste(brut?.personnel), groupes };
}

/** Corps complet d'enregistrement (PUT), regroupements compris. */
export const corpsPreferences = (p: PreferencesOutils) => ({
  profil: p.profil, favoris: [...p.favoris], personnel: [...p.personnel], groupes: p.groupes.map((g) => ({ id: g.id, nom: g.nom, outils: [...g.outils] })),
});

const cleNom = (nom: string) => nom.trim().toLocaleLowerCase("fr");

/** Refus d'un nom de regroupement (null = accepté) : vide, trop long, déjà pris, ou trop de regroupements. */
export function refusNomGroupe(prefs: PreferencesOutils, nom: string, sauf?: string): "vide" | "long" | "pris" | "nombre" | null {
  const n = nom.trim();
  if (!n) return "vide";
  if (n.length > LIMITES_GROUPES.nom) return "long";
  if (prefs.groupes.some((g) => g.id !== sauf && cleNom(g.nom) === cleNom(n))) return "pris";
  if (sauf === undefined && prefs.groupes.length >= LIMITES_GROUPES.groupes) return "nombre";
  return null;
}

/** Identifiant stable d'un nouveau regroupement, tiré du nom (sans accents), unique dans les préférences. */
export function idGroupe(prefs: PreferencesOutils, nom: string): string {
  const base = nom.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "groupe";
  const pris = new Set(prefs.groupes.map((g) => g.id));
  if (!pris.has(base)) return base;
  for (let i = 2; ; i += 1) if (!pris.has(`${base}-${i}`)) return `${base}-${i}`;
}

/** Nouveau regroupement (vide) ; refusé (préférences inchangées) si le nom ne convient pas. */
export function creerGroupe(prefs: PreferencesOutils, nom: string): PreferencesOutils {
  if (refusNomGroupe(prefs, nom) !== null) return prefs;
  return { ...prefs, groupes: [...prefs.groupes, { id: idGroupe(prefs, nom), nom: nom.trim(), outils: [] }] };
}

export const supprimerGroupe = (prefs: PreferencesOutils, id: string): PreferencesOutils => ({ ...prefs, groupes: prefs.groupes.filter((g) => g.id !== id) });

/** Ajoute ou retire un outil d'un regroupement ; un regroupement inconnu laisse tout inchangé. */
export const basculerDansGroupe = (prefs: PreferencesOutils, id: string, outil: StudioToolId): PreferencesOutils =>
  prefs.groupes.some((g) => g.id === id)
    ? { ...prefs, groupes: prefs.groupes.map((g) => (g.id === id ? { ...g, outils: g.outils.includes(outil) ? g.outils.filter((x) => x !== outil) : [...g.outils, outil] } : g)) }
    : prefs;

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
