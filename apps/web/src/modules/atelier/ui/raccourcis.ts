/**
 * Raccourcis clavier du nouvel Atelier (L3a.1, cahier §5.8 : « raccourcis conservés »). Module pur.
 *
 * - Raccourcis réservés de l'interface : `Ctrl/⌘ K` (palette), `Ctrl/⌘ Z` (annuler), `Ctrl/⌘ Maj Z` et
 *   `Ctrl/⌘ Y` (rétablir), `Échap` (abandonner le geste, fermer la palette ou la feuille).
 * - Raccourcis d'outil : `DefinitionOutil.raccourci`, une lettre ou chiffre, éventuellement `Maj+X` ; jamais avec
 *   Ctrl, ⌘ ou Alt (réservés au navigateur et à l'interface).
 * - Dans un champ de saisie (input, textarea, select, contenteditable), seuls `Échap` et `Ctrl/⌘ K` agissent :
 *   taper « m » dans l'inspecteur n'active pas l'outil Mur, et `Ctrl/⌘ Z` reste l'annulation du champ.
 */
import type { DefinitionOutil } from "../socle";

/** Touche normalisée d'un raccourci : `{ touche: "m", maj: false }`. */
export interface Combinaison {
  readonly touche: string;
  readonly maj: boolean;
  readonly mod: boolean;
}

/** Ce qu'un évènement clavier fournit (sous-ensemble de `KeyboardEvent`, testable sans DOM). */
export interface EvenementTouche {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly shiftKey: boolean;
  /** Le focus est-il dans un champ de saisie ? */
  readonly dansChamp: boolean;
}

export type ActionClavier =
  | { readonly type: "palette" }
  | { readonly type: "annuler" }
  | { readonly type: "retablir" }
  | { readonly type: "echap" }
  | { readonly type: "outil"; readonly id: string };

export const RESERVES: readonly { readonly libelle: string; readonly combinaison: Combinaison; readonly action: ActionClavier }[] = [
  { libelle: "Ctrl/⌘ K", combinaison: { touche: "k", maj: false, mod: true }, action: { type: "palette" } },
  { libelle: "Ctrl/⌘ Z", combinaison: { touche: "z", maj: false, mod: true }, action: { type: "annuler" } },
  { libelle: "Ctrl/⌘ Maj Z", combinaison: { touche: "z", maj: true, mod: true }, action: { type: "retablir" } },
  { libelle: "Ctrl/⌘ Y", combinaison: { touche: "y", maj: false, mod: true }, action: { type: "retablir" } },
  { libelle: "Échap", combinaison: { touche: "escape", maj: false, mod: false }, action: { type: "echap" } },
];

/** Analyse « M », « Maj+X », « Shift+X » ; `null` si le raccourci est mal formé ou utilise Ctrl / ⌘ / Alt. */
export function analyserRaccourci(texte: string): Combinaison | null {
  const parties = texte.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const touche = parties.pop();
  if (!touche) return null;
  let maj = false;
  for (const p of parties) {
    if (p === "maj" || p === "shift") maj = true;
    else return null;
  }
  if (!/^[\p{L}\p{N}]$/u.test(touche)) return null;
  return { touche, maj, mod: false };
}

const cle = (c: Combinaison) => `${c.mod ? "mod+" : ""}${c.maj ? "maj+" : ""}${c.touche}`;

/** Texte affiché d'un raccourci d'outil : « M », « Maj M ». */
export function texteRaccourci(texte: string): string {
  const c = analyserRaccourci(texte);
  if (!c) return texte;
  return `${c.maj ? "Maj " : ""}${c.touche.toUpperCase()}`;
}

export interface TableRaccourcis {
  readonly parCle: ReadonlyMap<string, ActionClavier>;
  /** Raccourcis d'outil ignorés, avec le motif (mal formé, réservé, doublon). */
  readonly conflits: readonly { readonly outilId: string; readonly raccourci: string; readonly motif: string }[];
}

export function tableRaccourcis(outils: readonly Pick<DefinitionOutil, "id" | "raccourci">[]): TableRaccourcis {
  const parCle = new Map<string, ActionClavier>();
  const conflits: { outilId: string; raccourci: string; motif: string }[] = [];
  const reserves = new Map(RESERVES.map((r) => [cle(r.combinaison), r.libelle]));
  for (const r of RESERVES) parCle.set(cle(r.combinaison), r.action);
  const pris = new Map<string, string>();
  for (const o of outils) {
    if (!o.raccourci) continue;
    const c = analyserRaccourci(o.raccourci);
    if (!c) {
      conflits.push({ outilId: o.id, raccourci: o.raccourci, motif: "raccourci mal formé (une lettre ou un chiffre, éventuellement Maj+)" });
      continue;
    }
    const k = cle(c);
    const reserve = reserves.get(k);
    if (reserve) {
      conflits.push({ outilId: o.id, raccourci: o.raccourci, motif: `réservé par l'interface (${reserve})` });
      continue;
    }
    const autre = pris.get(k);
    if (autre) {
      conflits.push({ outilId: o.id, raccourci: o.raccourci, motif: `déjà pris par « ${autre} »` });
      continue;
    }
    pris.set(k, o.id);
    parCle.set(k, { type: "outil", id: o.id });
  }
  return { parCle, conflits };
}

/** Action clavier d'un évènement, ou `null` (l'évènement suit alors son cours normal). */
export function resoudreTouche(e: EvenementTouche, table: TableRaccourcis): ActionClavier | null {
  if (e.key === "Escape" || e.key === "Esc") return { type: "echap" };
  const mod = e.ctrlKey || e.metaKey;
  if (e.altKey) return null;
  const touche = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  if (mod) {
    const action = table.parCle.get(cle({ touche, maj: e.shiftKey, mod: true })) ?? null;
    if (!action) return null;
    if (e.dansChamp && action.type !== "palette") return null;
    return action;
  }
  if (e.dansChamp) return null;
  return table.parCle.get(cle({ touche, maj: e.shiftKey, mod: false })) ?? null;
}
