/**
 * Extension « Contrôle et nettoyage » (25 novembre 2026) : un relevé de ce qui encombre une Planche et son nettoyage,
 * sur commande seulement. Pur : ni React, ni DOM.
 *
 * Le contrôle ne modifie rien : il compte. Le nettoyage n'emploie que les opérations publiques du modèle (`effacerAretes`,
 * `effacerEntites`, `modifierAnnotations`) : liens d'extrusion, courbes, cotes et pièces sont donc tenus comme par un
 * effacement fait à la main, et le tout tient en une opération pour l'interface (un seul Annuler). Rien n'est corrigé sans
 * avoir été choisi ; un objet verrouillé n'est jamais touché ; les arêtes isolées ne sont retirées que sur demande
 * expresse (un trait de construction peut être voulu).
 */
import { annotationsDe } from "./annotations.js";
import { type Contexte, type Id, type Modele, contexte, effacerAretes, effacerEntites, estSolide, modifierAnnotations } from "./geometrie-libre.js";

/** Ce que le nettoyage peut retirer, dans l'ordre du panneau. */
export const POINTS_NETTOYAGE = ["objetsVides", "materiauxInutilises", "balisesInutilisees", "aretesIsolees"] as const;
export type PointNettoyage = (typeof POINTS_NETTOYAGE)[number];
export type ChoixNettoyage = Readonly<Record<PointNettoyage, boolean>>;
/** Choix d'origine : tout ce qui est sans effet sur le dessin ; les arêtes isolées restent à cocher. */
export const CHOIX_NETTOYAGE_DEFAUT: ChoixNettoyage = Object.freeze({ objetsVides: true, materiauxInutilises: true, balisesInutilisees: true, aretesIsolees: false });

export interface RapportControle extends Readonly<Record<PointNettoyage, number>> {
  /** Objets (groupes et composants) posés à la racine, et ceux d'entre eux qui ne sont pas des solides fermés. */
  readonly objets: number;
  readonly objetsNonSolides: number;
}

const cleArete = (a: Id, b: Id): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Arêtes d'un contexte qui ne bordent aucune face ; une courbe n'est retenue que si toutes ses arêtes sont isolées. */
export function aretesIsolees(c: Contexte): Id[] {
  const bordees = new Set<string>();
  for (const f of Object.values(c.faces)) {
    for (const b of [f.exterieur, ...f.trous]) for (let i = 0; i < b.length; i++) bordees.add(cleArete(b[i] as Id, b[(i + 1) % b.length] as Id));
  }
  const isolee = (id: Id): boolean => {
    const a = c.aretes[id];
    return a !== undefined && !bordees.has(cleArete(a.a, a.b));
  };
  return Object.values(c.aretes)
    .filter((a) => isolee(a.id) && (a.courbe === undefined || (c.courbes[a.courbe]?.aretes ?? [a.id]).every(isolee)))
    .map((a) => a.id);
}

/** Définitions sans géométrie : ni arête, ni face, et seulement des objets eux-mêmes vides. */
function definitionsVides(m: Modele): Set<Id> {
  const vides = new Set<Id>();
  let change = true;
  while (change) {
    change = false;
    for (const d of Object.values(m.definitions)) {
      if (vides.has(d.id)) continue;
      const c = d.contenu;
      if (Object.keys(c.aretes).length > 0 || Object.keys(c.faces).length > 0) continue;
      if (Object.values(c.occurrences).every((o) => vides.has(o.definition))) {
        vides.add(d.id);
        change = true;
      }
    }
  }
  return vides;
}

/**
 * Définitions tenues par un verrou : celles d'un objet verrouillé et tout ce qu'elles contiennent. Modifier une telle
 * définition changerait ce que montre un objet verrouillé, même par un objet contenu qui ne l'est pas lui-même.
 */
function definitionsVerrouillees(m: Modele): Set<Id> {
  const tenues = new Set<Id>();
  const pile: Id[] = [];
  for (const porteur of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) {
    for (const o of Object.values(porteur.occurrences)) if (o.verrouille === true) pile.push(o.definition);
  }
  while (pile.length) {
    const id = pile.pop() as Id;
    if (tenues.has(id)) continue;
    tenues.add(id);
    for (const o of Object.values(m.definitions[id]?.contenu.occurrences ?? {})) pile.push(o.definition);
  }
  return tenues;
}

/** Contextes rendus : la racine et le contenu des définitions non vides, avec une occurrence qui y mène (absente à la racine). */
function contextes(m: Modele): { readonly dans: Id | undefined; readonly definition: Id | undefined; readonly c: Contexte; readonly verrouille: boolean }[] {
  const liste: { dans: Id | undefined; definition: Id | undefined; c: Contexte; verrouille: boolean }[] = [{ dans: undefined, definition: undefined, c: m.racine, verrouille: false }];
  const tenues = definitionsVerrouillees(m);
  for (const porteur of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) {
    for (const o of Object.values(porteur.occurrences)) {
      const d = m.definitions[o.definition];
      if (d) liste.push({ dans: o.id, definition: d.id, c: d.contenu, verrouille: tenues.has(d.id) });
    }
  }
  return liste;
}

/** Objets vides à retirer : occurrences d'une définition vide, non verrouillées, portées par un contexte qui ne l'est pas. */
function objetsVides(m: Modele): { readonly dans: Id | undefined; readonly ids: Id[] }[] {
  const vides = definitionsVides(m);
  const vus = new Set<Id>();
  const lots: { dans: Id | undefined; ids: Id[] }[] = [];
  for (const x of contextes(m)) {
    if (x.definition !== undefined && (vides.has(x.definition) || vus.has(x.definition) || x.verrouille)) continue;
    if (x.definition !== undefined) vus.add(x.definition);
    const ids = Object.values(x.c.occurrences).filter((o) => vides.has(o.definition) && !o.verrouille).map((o) => o.id);
    if (ids.length) lots.push({ dans: x.dans, ids });
  }
  return lots;
}

function inutilises(m: Modele): { readonly materiaux: Id[]; readonly balises: Id[] } {
  const a = annotationsDe(m.annotations);
  const materiaux = new Set<string>();
  const balises = new Set<string>();
  for (const c of [m.racine, ...Object.values(m.definitions).map((d) => d.contenu)]) {
    for (const f of Object.values(c.faces)) {
      if (f.materiauRecto !== undefined) materiaux.add(f.materiauRecto);
      if (f.materiauVerso !== undefined) materiaux.add(f.materiauVerso);
    }
    for (const o of Object.values(c.occurrences)) {
      if (o.materiau !== undefined) materiaux.add(o.materiau);
      if (o.balise !== undefined) balises.add(o.balise);
    }
  }
  return { materiaux: Object.keys(a.materiaux).filter((id) => !materiaux.has(id)), balises: Object.keys(a.balises).filter((id) => !balises.has(id)) };
}

/** Arêtes isolées par contexte, une définition comptée une fois ; les contenus verrouillés sont laissés. */
function isoleesParContexte(m: Modele, ecartes: ReadonlySet<Id> = new Set()): { readonly dans: Id | undefined; readonly ids: Id[] }[] {
  const vus = new Set<Id>();
  const lots: { dans: Id | undefined; ids: Id[] }[] = [];
  for (const x of contextes(m)) {
    if (x.definition !== undefined && (vus.has(x.definition) || x.verrouille || ecartes.has(x.dans as Id))) continue;
    if (x.definition !== undefined) vus.add(x.definition);
    const ids = aretesIsolees(x.c);
    if (ids.length) lots.push({ dans: x.dans, ids });
  }
  return lots;
}

/** Contrôle : relevé de la Planche entière, sans rien modifier. */
export function controlerModele(m: Modele): RapportControle {
  const u = inutilises(m);
  const racine = Object.values(m.racine.occurrences);
  return {
    objetsVides: objetsVides(m).reduce((s, l) => s + l.ids.length, 0),
    materiauxInutilises: u.materiaux.length,
    balisesInutilisees: u.balises.length,
    aretesIsolees: isoleesParContexte(m).reduce((s, l) => s + l.ids.length, 0),
    objets: racine.length,
    objetsNonSolides: racine.filter((o) => !estSolide(m, o.id)).length,
  };
}

/** Objets de la racine qui ne sont pas des solides fermés (pour les sélectionner depuis le panneau). */
export function objetsNonSolides(m: Modele): Id[] {
  return Object.values(m.racine.occurrences)
    .filter((o) => !estSolide(m, o.id))
    .map((o) => o.id);
}

/** Rien à nettoyer pour ces choix. */
export function rienANettoyer(r: RapportControle, choix: ChoixNettoyage): boolean {
  return POINTS_NETTOYAGE.every((p) => !choix[p] || r[p] === 0);
}

/**
 * Nettoyage : retire ce qui est coché, et rend le nouveau modèle avec ce qui a réellement été retiré. Les objets vides
 * sont repris jusqu'à épuisement (un groupe qui ne contenait que des groupes vides le devient). Un contenu que le modèle
 * refuse de modifier est laissé tel quel.
 */
export function nettoyerModele(m: Modele, choix: ChoixNettoyage = CHOIX_NETTOYAGE_DEFAUT): { readonly modele: Modele; readonly retires: Readonly<Record<PointNettoyage, number>> } {
  const retires: Record<PointNettoyage, number> = { objetsVides: 0, materiauxInutilises: 0, balisesInutilisees: 0, aretesIsolees: 0 };
  let modele = m;
  const GARDE = 10_000;
  if (choix.aretesIsolees) {
    const ecartes = new Set<Id>();
    for (let i = 0; i < GARDE; i++) {
      const lot = isoleesParContexte(modele, ecartes)[0];
      if (!lot) break;
      try {
        const avant = Object.keys(contexte(modele, lot.dans).aretes).length;
        const suite = effacerAretes(modele, lot.ids, lot.dans !== undefined ? { dans: lot.dans } : {}).modele;
        const apres = Object.keys(contexte(suite, lot.dans).aretes).length;
        if (apres >= avant) throw new Error("aucun progrès");
        retires.aretesIsolees += avant - apres;
        modele = suite;
      } catch {
        if (lot.dans === undefined) break;
        ecartes.add(lot.dans);
      }
    }
  }
  if (choix.objetsVides) {
    for (let i = 0; i < GARDE; i++) {
      const lot = objetsVides(modele)[0];
      if (!lot) break;
      try {
        modele = effacerEntites(modele, lot.ids, lot.dans !== undefined ? { dans: lot.dans } : {}).modele;
        retires.objetsVides += lot.ids.length;
      } catch {
        break;
      }
    }
  }
  if (choix.materiauxInutilises || choix.balisesInutilisees) {
    const u = inutilises(modele);
    const materiaux = choix.materiauxInutilises ? u.materiaux : [];
    const balises = choix.balisesInutilisees ? u.balises : [];
    if (materiaux.length + balises.length > 0) {
      modele = modifierAnnotations(modele, (a) => {
        for (const id of materiaux) delete a.materiaux[id];
        for (const id of balises) delete a.balises[id];
      }).modele;
      retires.materiauxInutilises = materiaux.length;
      retires.balisesInutilisees = balises.length;
    }
  }
  return { modele, retires };
}
