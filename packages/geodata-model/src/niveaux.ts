/**
 * Navigation par niveaux (D-GD-17 lot B, D-GD-42) : pays → région → … → entité la plus fine, en suivant les liens
 * parent → enfant du découpage **lus en base** (`Parents`), jamais une règle écrite dans le code sur les codes, les noms
 * ou les géométries. La profondeur varie selon l'endroit (une ville dont les arrondissements sont regroupés compte un
 * niveau de plus qu'une ville à arrondissements directs, elle-même un de plus qu'une commune ordinaire). Un code absent du découpage (contour non
 * rattaché « contour:… ») n'a pas de parent : il n'est jamais rangé sous une entité. Pur : aucun DOM, aucun moteur.
 */
import { descendDe, type Parents } from "./decoupage.js";

/** Couche de limites de la composition : rang de son niveau (lu en base) et codes de ses entités. */
export interface CoucheNiveau { readonly coucheId: string; readonly rang: number; readonly codes: readonly string[] }
/** Étape du chemin : une entité dans laquelle on est descendu. */
export interface EtapeNiveau { readonly coucheId: string; readonly rang: number; readonly code: string; readonly nom: string }

/** Une couche est navigable si au moins un de ses codes est une entité du découpage en base. */
export const coucheNavigable = (c: CoucheNiveau, parents: Parents): boolean => c.codes.some((x) => parents.has(x));

/**
 * Enfants d'une entité dans les couches chargées : les codes de la couche **la plus proche en dessous** qui descendent
 * de l'entité (les regroupements d'arrondissements si leur couche est chargée, sinon les arrondissements).
 */
export function enfantsDe(etape: Pick<EtapeNiveau, "rang" | "code">, couches: readonly CoucheNiveau[], parents: Parents): { coucheId: string; codes: string[] }[] {
  const dessous = couches.filter((c) => c.rang > etape.rang && coucheNavigable(c, parents)).sort((a, b) => a.rang - b.rang);
  for (const rang of [...new Set(dessous.map((c) => c.rang))]) {
    const r = dessous.filter((c) => c.rang === rang).map((c) => ({ coucheId: c.coucheId, codes: c.codes.filter((x) => descendDe(x, etape.code, parents)) }));
    if (r.some((x) => x.codes.length)) return r;
  }
  return [];
}

/**
 * Filtres d'affichage d'un chemin : au-dessus de la dernière étape, les entités du chemin (le contour de la région reste
 * visible dans une province) ; à son niveau, cette seule entité ; en dessous, ses descendants (liens en base). Chemin
 * vide : aucun filtre. Les couches sans entité du découpage ne sont jamais filtrées.
 */
export function filtresNiveaux(chemin: readonly EtapeNiveau[], couches: readonly CoucheNiveau[], parents: Parents): Map<string, string[]> {
  const filtres = new Map<string, string[]>();
  const fin = chemin[chemin.length - 1];
  if (!fin) return filtres;
  for (const c of couches.filter((x) => coucheNavigable(x, parents))) {
    if (c.rang < fin.rang) filtres.set(c.coucheId, chemin.filter((e) => e.rang === c.rang).map((e) => e.code));
    else if (c.rang === fin.rang) filtres.set(c.coucheId, c.codes.includes(fin.code) ? [fin.code] : []);
    else filtres.set(c.coucheId, c.codes.filter((x) => descendDe(x, fin.code, parents)));
  }
  return filtres;
}

/** Intersection de deux jeux de filtres (filtre de l'utilisateur et filtre de navigation) : une couche absente d'un jeu n'y est pas filtrée. */
export function combinerFiltres(a: ReadonlyMap<string, readonly string[]>, b: ReadonlyMap<string, readonly string[]>): Map<string, string[]> {
  const r = new Map<string, string[]>();
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(id), y = b.get(id);
    if (x && y) { const s = new Set(y); r.set(id, x.filter((c) => s.has(c))); } else r.set(id, [...(x ?? y)!]);
  }
  return r;
}

/** Chemin gardé après un changement de composition : il s'arrête à la première étape dont la couche n'est plus là. */
export function cheminValide(chemin: readonly EtapeNiveau[], couchesPresentes: ReadonlySet<string>): EtapeNiveau[] {
  const i = chemin.findIndex((e) => !couchesPresentes.has(e.coucheId));
  return i < 0 ? [...chemin] : chemin.slice(0, i);
}
