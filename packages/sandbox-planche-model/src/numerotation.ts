/**
 * Numérotation en série (cas 2 du catalogue, lot 1, D3-F3-017) — logique pure.
 *
 * Les objets sélectionnés (groupes et composants du contexte ouvert) sont rangés par famille — le nom de leur
 * définition, sans le suffixe « #n » —, par niveau puis dans l'ordre de lecture du plan (de haut en bas, de gauche à
 * droite). Chaque famille reçoit son préfixe ; le numéro est écrit au début du nom de l'objet (« R.01 Séjour »), un
 * ancien numéro de même préfixe est remplacé. Une seule opération : une seule annulation défait toute la série.
 *
 * Niveau : en attendant les niveaux nommés du noyau, deux objets sont au même niveau quand leur base est à moins de
 * `HAUTEUR_TRANCHE_NIVEAU` de la base la plus basse du niveau (une allège de fenêtre reste au niveau de sa porte).
 */
import { type Id, type Modele, type Resultat, boiteOccurrence, contexte, renommerOccurrences } from "./geometrie-libre.js";

/** Hauteur de la tranche d'un niveau (m), convention de rangement et non donnée de projet. */
export const HAUTEUR_TRANCHE_NIVEAU = 2;
/** Bande de lecture d'une rangée (m) : deux objets dont les centres sont à moins de cette distance en Y sont sur la même rangée. */
export const BANDE_LECTURE = 0.5;

export interface FamilleNumerotation {
  readonly famille: string;
  readonly ids: readonly Id[];
}

export interface OptionsNumerotation {
  /** Préfixe par famille, dans l'ordre de `famillesNumerotation` ; manquant = première lettre de la famille et « . ». */
  readonly prefixes: readonly string[];
  /** Premier numéro, avec ses zéros de tête (« 01 », « 1 », « 101 »). */
  readonly depart: string;
  /** Repartir du premier numéro à chaque niveau. */
  readonly parNiveau: boolean;
  readonly dans?: Id;
  readonly chemin?: readonly Id[];
}

const familleDe = (m: Modele, def: Id): string => (m.definitions[def]?.nom ?? "Objet").replace(/#\d+$/, "").trim() || "Objet";

interface Place {
  readonly id: Id;
  readonly base: number;
  readonly x: number;
  readonly y: number;
}

function places(m: Modele, ids: readonly Id[], o: { dans?: Id; chemin?: readonly Id[] }): Place[] {
  const res: Place[] = [];
  for (const id of ids) {
    const chemin = o.chemin && o.chemin.length ? [...o.chemin, id] : o.dans !== undefined ? undefined : [id];
    const b = boiteOccurrence(m, id, chemin);
    if (!b) continue;
    res.push({ id, base: b.min.z, x: (b.min.x + b.max.x) / 2, y: (b.min.y + b.max.y) / 2 });
  }
  return res;
}

/** Niveaux (du plus bas au plus haut), chacun dans l'ordre de lecture. */
export function ordreDeLecture(m: Modele, ids: readonly Id[], o: { dans?: Id; chemin?: readonly Id[] } = {}): Id[][] {
  const ps = places(m, ids, o).sort((a, b) => a.base - b.base);
  const niveaux: Place[][] = [];
  for (const p of ps) {
    const n = niveaux[niveaux.length - 1];
    if (n && p.base - (n[0] as Place).base < HAUTEUR_TRANCHE_NIVEAU) n.push(p);
    else niveaux.push([p]);
  }
  return niveaux.map((n) =>
    [...n]
      .sort((a, b) => {
        const ra = Math.round(-a.y / BANDE_LECTURE);
        const rb = Math.round(-b.y / BANDE_LECTURE);
        return ra !== rb ? ra - rb : a.x - b.x;
      })
      .map((p) => p.id),
  );
}

/** Familles des objets sélectionnés, dans l'ordre de leur premier objet en lecture. */
export function famillesNumerotation(m: Modele, ids: readonly Id[], o: { dans?: Id; chemin?: readonly Id[] } = {}): FamilleNumerotation[] {
  const c = contexte(m, o.dans);
  const lecture = ordreDeLecture(m, ids.filter((id) => c.occurrences[id]), o).flat();
  const familles = new Map<string, Id[]>();
  for (const id of lecture) {
    const occ = c.occurrences[id];
    if (!occ) continue;
    const f = familleDe(m, occ.definition);
    const l = familles.get(f);
    if (l) l.push(id);
    else familles.set(f, [id]);
  }
  return [...familles.entries()].map(([famille, l]) => ({ famille, ids: l }));
}

export const prefixeParDefaut = (famille: string): string => `${(famille.trim()[0] ?? "O").toUpperCase()}.`;

/** Lit « R. · P. · F. » (séparateurs « · », « ; » ou « , ») en liste de préfixes. */
export const lirePrefixes = (texte: string): string[] =>
  texte
    .split(/[·;,]/)
    .map((x) => x.trim())
    .filter((x) => x !== "");

/** Noms proposés (aperçu) : identifiant → nouveau nom. */
export function nomsNumerotes(m: Modele, ids: readonly Id[], o: OptionsNumerotation): Record<Id, string> {
  const c = contexte(m, o.dans);
  const dep = o.depart.trim() === "" ? "1" : o.depart.trim();
  if (!/^\d{1,6}$/.test(dep)) throw new RangeError("Le premier numéro doit être un nombre entier (« 01 », « 1 », « 101 »).");
  const largeur = dep.length;
  const premier = Number(dep);
  const familles = famillesNumerotation(m, ids, o);
  const prefixe = new Map(familles.map((f, i) => [f.famille, o.prefixes[i]?.trim() || prefixeParDefaut(f.famille)]));
  const niveaux = ordreDeLecture(m, ids.filter((id) => c.occurrences[id]), o);
  const compteurs = new Map<string, number>();
  const noms: Record<Id, string> = {};
  for (const niveau of niveaux) {
    if (o.parNiveau) compteurs.clear();
    for (const id of niveau) {
      const occ = c.occurrences[id];
      if (!occ) continue;
      const f = familleDe(m, occ.definition);
      const p = prefixe.get(f) as string;
      const n = compteurs.get(f) ?? premier;
      compteurs.set(f, n + 1);
      const numero = `${p}${String(n).padStart(largeur, "0")}`;
      const ancien = (occ.nom ?? "").trim();
      const echappe = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const reste = ancien.replace(new RegExp(`^${echappe}\\d+\\s*`), "").trim() || (occ.nom ? "" : familleDe(m, occ.definition));
      noms[id] = reste ? `${numero} ${reste}` : numero;
    }
  }
  return noms;
}

/** Numérote la sélection en une seule opération. */
export function numeroterEnSerie(m: Modele, ids: readonly Id[], o: OptionsNumerotation): Resultat {
  const noms = nomsNumerotes(m, ids, o);
  if (Object.keys(noms).length === 0) throw new RangeError("Sélectionnez des groupes ou des composants à numéroter.");
  return renommerOccurrences(m, noms, o.dans !== undefined ? { dans: o.dans } : {});
}
