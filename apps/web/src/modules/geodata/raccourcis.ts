/**
 * Raccourcis clavier de la page GeoData (feuille de route équipe A, PR P3 : extraction, aucun changement visible).
 *
 * Une table unique remplace la cascade de conditions de `PageGeoData.tsx` ; les tables des barres (`RACCOURCIS_BARRE`,
 * `RACCOURCIS_TERRAIN`, `RACCOURCIS_BARRE_BAS`) en sont dérivées. `commandeDeTouche` est pure : elle rend la commande
 * d'une touche dans un contexte donné, exactement comme l'ancien gestionnaire (même ordre, mêmes conditions).
 */

export type CommandeClavier =
  | "imprimer-fiche" | "mini-carte" | "imprimer" | "recherche" | "libelles" | "synthese" | "regrouper" | "lien"
  | "carte-seule" | "couches" | "enregistrer" | "pastilles" | "plan-satellite" | "zone" | "emplacements" | "terrain"
  | "altitude" | "profil" | "remonter" | "descendre";

/**
 * Quand une commande répond : `toujours` (même dans un champ de saisie), `hors-saisie`, `hors-saisie-sauf-recherche`
 * (aussi depuis le champ de la recherche flottante) ; `carte` : seulement si la carte est disponible.
 */
export interface Raccourci {
  readonly commande: CommandeClavier;
  /** Touche déclarée (`aria-keyshortcuts`). */
  readonly touche: string;
  readonly saisie: "toujours" | "hors-saisie" | "hors-saisie-sauf-recherche";
  readonly carte: boolean;
}

const r = (commande: CommandeClavier, touche: string, saisie: Raccourci["saisie"] = "hors-saisie", carte = false): Raccourci => ({ commande, touche, saisie, carte });

/** Ordre = ordre d'examen de l'ancien gestionnaire (`P:841-874`). */
export const RACCOURCIS: readonly Raccourci[] = [
  r("imprimer-fiche", "Alt+P", "toujours"),
  r("mini-carte", "Alt+M", "hors-saisie", true),
  r("imprimer", "Alt+I", "hors-saisie", true),
  r("recherche", "Alt+R", "hors-saisie-sauf-recherche"),
  r("libelles", "Alt+L"),
  r("synthese", "Alt+V", "hors-saisie", true),
  r("regrouper", "Alt+G", "hors-saisie", true),
  r("lien", "Alt+K"),
  r("carte-seule", "Alt+X"),
  r("couches", "Alt+C"),
  r("enregistrer", "Alt+E"),
  r("pastilles", "Alt+T"),
  r("plan-satellite", "Alt+S", "hors-saisie", true),
  r("zone", "Alt+Z"),
  r("emplacements", "Alt+J"),
  r("terrain", "Alt+H"),
  r("altitude", "Alt+O", "hors-saisie", true),
  r("profil", "Alt+U", "hors-saisie", true),
  r("remonter", "Alt+ArrowUp"),
  r("descendre", "Alt+ArrowDown"),
];

const touche = (c: CommandeClavier) => RACCOURCIS.find((x) => x.commande === c)!.touche;

/** Barre d'outils de la carte (D-GD-40, lot G). */
export const RACCOURCIS_BARRE = { etiquettes: touche("libelles"), "mini-carte": touche("mini-carte"), imprimer: touche("imprimer"), synthese: touche("synthese"), regrouper: touche("regrouper"), lien: touche("lien") } as const;
/** Terrain haute résolution (TER-05). */
export const RACCOURCIS_TERRAIN = { terrain: touche("terrain"), altitude: touche("altitude"), profil: touche("profil") } as const;
/** Barre du bas au téléphone (D-GD-52). */
export const RACCOURCIS_BARRE_BAS = { carte: touche("carte-seule"), chercher: touche("recherche"), couches: touche("couches"), enregistrer: touche("enregistrer") } as const;

export interface ContexteClavier {
  /** Focus dans un champ de saisie (input, select, textarea, contenteditable). */
  readonly saisie: boolean;
  /** Focus dans la barre de recherche flottante. */
  readonly dansRecherche: boolean;
  readonly carteDisponible: boolean;
  /** Une fiche est ouverte dans son volet (Alt+P). */
  readonly ficheOuverte: boolean;
  /** Un niveau est choisi dans le fil (Alt+↑). */
  readonly niveauChoisi: boolean;
  /** La fiche ouverte a un niveau inférieur (Alt+↓). */
  readonly descentePossible: boolean;
}

/** Touche (lettre ou flèche) d'un événement : `key` d'abord, `code` ensuite (dispositions non latines). */
function cle(e: { key: string; code: string }): string | null {
  if (e.key === "ArrowUp" || e.key === "ArrowDown") return e.key;
  if (/^[a-z]$/i.test(e.key)) return e.key.toUpperCase();
  const m = /^Key([A-Z])$/.exec(e.code);
  return m ? m[1]! : null;
}

/** Commande d'une touche dans un contexte, ou null (la touche est laissée au navigateur). */
export function commandeDeTouche(e: { altKey: boolean; key: string; code: string }, c: ContexteClavier): CommandeClavier | null {
  if (!e.altKey) return null;
  const k = cle(e);
  if (!k) return null;
  const x = RACCOURCIS.find((y) => y.touche === `Alt+${k}`);
  if (!x) return null;
  if (x.commande === "imprimer-fiche") return c.ficheOuverte ? x.commande : null;
  if (x.saisie === "hors-saisie" && c.saisie) return null;
  if (x.saisie === "hors-saisie-sauf-recherche" && c.saisie && !c.dansRecherche) return null;
  if (x.carte && !c.carteDisponible) return null;
  if (x.commande === "remonter") return c.niveauChoisi ? x.commande : null;
  if (x.commande === "descendre") return c.descentePossible ? x.commande : null;
  return x.commande;
}
