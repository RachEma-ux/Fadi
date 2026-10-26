/**
 * Navigation par niveaux (D-GD-17, lot B) : Maroc → région → province ou préfecture → commune → arrondissement, comme
 * les cartes du HCP. La parenté se lit des codes géographiques du HCP, jamais des géométries ni des noms :
 *   - province (rang 2) : son code sans ses 3 derniers chiffres est celui de sa région (« 1511 » → « 1 ») ;
 *   - commune (rang 3) : la province dont le code est le plus long préfixe du sien (« 15110507 » → « 1511 ») ;
 *   - arrondissement (rang 4, 8 chiffres) : la commune de 7 chiffres qui partage ses 6 premiers (« 61410111 » → « 6141010 »).
 * Un code qui n'est pas un code HCP (contour non rattaché « contour:… », code geoBoundaries) n'a pas de parent : il
 * n'est jamais rangé sous une entité. Pur : aucun DOM, aucun moteur.
 */
import type { RangAdministratif } from "./limites.js";

export const estCodeHcp = (code: string): boolean => /^\d{1,9}$/.test(code);

/** Code du parent (au rang au-dessus) parmi `parents`, ou null si aucun ne convient (jamais deviné). */
export function parentHcp(code: string, rangEnfant: RangAdministratif, parents: ReadonlySet<string>): string | null {
  if (!estCodeHcp(code) || rangEnfant === 1) return null;
  if (rangEnfant === 2) {
    const p = code.slice(0, -3);
    return p && parents.has(p) ? p : null;
  }
  if (rangEnfant === 3) {
    let meilleur: string | null = null;
    for (const p of parents) if (p.length < code.length && code.startsWith(p) && (!meilleur || p.length > meilleur.length)) meilleur = p;
    return meilleur;
  }
  const candidats = [...parents].filter((p) => p.length === 7 && code.length === 8 && p.slice(0, 6) === code.slice(0, 6));
  return candidats.length === 1 ? candidats[0]! : null;
}

/** Couche de limites de la composition qui porte des codes HCP. */
export interface CoucheNiveau { readonly coucheId: string; readonly rang: RangAdministratif; readonly codes: readonly string[] }
/** Étape du chemin : une entité dans laquelle on est descendu. */
export interface EtapeNiveau { readonly coucheId: string; readonly rang: RangAdministratif; readonly code: string; readonly nom: string }

export const LIBELLES_ENFANTS: Record<RangAdministratif, string> = { 1: "régions", 2: "provinces et préfectures", 3: "communes", 4: "arrondissements" };

/** Une couche est navigable si elle porte au moins un code HCP. */
export const coucheNavigable = (c: CoucheNiveau): boolean => c.codes.some(estCodeHcp);

const codesDuRang = (couches: readonly CoucheNiveau[], rang: number): Set<string> => new Set(couches.filter((c) => c.rang === rang).flatMap((c) => c.codes.filter(estCodeHcp)));

/** Enfants directs d'une entité (rang + 1) dans les couches données, par couche. */
export function enfantsDe(etape: Pick<EtapeNiveau, "rang" | "code">, couches: readonly CoucheNiveau[]): { coucheId: string; codes: string[] }[] {
  if (etape.rang >= 4) return [];
  const rang = (etape.rang + 1) as RangAdministratif;
  const parents = codesDuRang(couches, etape.rang);
  parents.add(etape.code);
  return couches.filter((c) => c.rang === rang && coucheNavigable(c)).map((c) => ({ coucheId: c.coucheId, codes: c.codes.filter((x) => parentHcp(x, rang, parents) === etape.code) }));
}

/**
 * Filtres d'affichage d'un chemin : au rang de la dernière étape, cette seule entité ; au-dessus, les entités du chemin
 * (le contour de la région reste visible dans une province) ; en dessous, ses descendants, rang par rang. Un rang sans
 * couche interrompt la descente : les couches plus fines restent alors sans filtre (aucune parenté devinée). Chemin
 * vide : aucun filtre. Les couches sans code HCP ne sont jamais filtrées.
 */
export function filtresNiveaux(chemin: readonly EtapeNiveau[], couches: readonly CoucheNiveau[]): Map<string, string[]> {
  const filtres = new Map<string, string[]>();
  const fin = chemin[chemin.length - 1];
  if (!fin) return filtres;
  const navigables = couches.filter(coucheNavigable);
  for (const c of navigables) {
    if (c.rang < fin.rang) filtres.set(c.coucheId, chemin.filter((e) => e.rang === c.rang).map((e) => e.code));
    else if (c.rang === fin.rang) filtres.set(c.coucheId, c.codes.includes(fin.code) ? [fin.code] : []);
  }
  let retenus = new Set([fin.code]);
  for (let rang = fin.rang + 1; rang <= 4; rang++) {
    const duRang = navigables.filter((c) => c.rang === rang);
    if (!duRang.length) break;
    const parents = codesDuRang(navigables, rang - 1);
    for (const p of retenus) parents.add(p);
    const suivants = new Set<string>();
    for (const c of duRang) {
      const gardes = c.codes.filter((x) => { const p = parentHcp(x, rang as RangAdministratif, parents); return p !== null && retenus.has(p); });
      filtres.set(c.coucheId, gardes);
      for (const g of gardes) suivants.add(g);
    }
    retenus = suivants;
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
