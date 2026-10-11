/**
 * Liste de débit de la Planche (lot L14) — pure, sans React ni DOM. Présentation alignée sur la « Liste de débit » de
 * l'Atelier (`tableaux.ts`) : aucune chute ni surlongueur supposée.
 *
 * Les pièces (occurrences dont la définition porte des métadonnées de pièce, imbrications comprises) sont groupées par
 * **section** — désignation, contour, et source complète (deux catalogues portant la même désignation ne fusionnent
 * jamais) — par **longueur** (à l'axe, décalages compris, à 1e-9 près) et par **angles de coupe**. Chaque ligne retient
 * les identifiants exacts des occurrences qu'elle regroupe. La **masse** n'existe que si la ligne de catalogue porte une
 * masse linéique sourcée, ou si l'utilisateur déclare une masse volumique **avec sa source** ; sinon « non évaluée ».
 */
import { type Contexte, type Id, type Matrice4, type MetadonneesPiece, type Modele, IDENTITE, appliquer, composer } from "./geometrie-libre.js";
import { type SourceSection, aireSection } from "./profiles.js";
import { type Vec3, v3 } from "./vecteur.js";

export const NON_EVALUEE = "non évaluée";

/** Masse volumique déclarée par l'utilisateur : la valeur (kg/m³) n'est retenue qu'avec sa source. */
export interface MasseVolumiqueDeclaree {
  readonly valeur: number;
  readonly source: string;
}

export interface OptionsDebit {
  /** « tout » le modèle, ou la « sélection » (occurrences de la racine données, imbrications comprises). */
  readonly portee: "tout" | "selection";
  readonly selection?: readonly Id[];
  readonly masseVolumique?: MasseVolumiqueDeclaree | null;
}

/** Une pièce relevée dans le modèle. */
export interface PieceDebit {
  readonly occurrence: Id;
  /** Chemin d'occurrences depuis la racine (la pièce comprise). */
  readonly chemin: readonly Id[];
  readonly repere: string | null;
  readonly meta: MetadonneesPiece;
  /** Longueur à l'axe, décalages des extrémités droites compris (m). */
  readonly longueur: number;
  /** Angles de coupe des deux extrémités (°), le plus grand d'abord ; 0 = coupe droite. */
  readonly angles: readonly [number, number];
  /** Milieu de l'axe (monde), pour les étiquettes. */
  readonly milieu: Vec3;
}

export interface LigneDebit {
  readonly cle: string;
  readonly reperes: readonly string[];
  readonly designation: string;
  readonly nombre: number;
  readonly longueurUnitaire: number;
  readonly longueurTotale: number;
  readonly angles: readonly [number, number];
  readonly source: SourceSection;
  /** Masse totale de la ligne (kg), ou `null` (« non évaluée ») avec son motif. */
  readonly masse: number | null;
  readonly origineMasse: string;
  /** Identifiants exacts des occurrences de la ligne (la sélection depuis la liste n'en ajoute aucune autre). */
  readonly occurrences: readonly Id[];
  readonly chemins: readonly (readonly Id[])[];
}

/** Longueur d'une pièce à l'axe : longueur de l'arête plus les allongements des extrémités coupées droit. */
export function longueurPiece(meta: MetadonneesPiece): number {
  return meta.longueur + (meta.coupeDebut ? 0 : meta.placement.decalageDebut) + (meta.coupeFin ? 0 : meta.placement.decalageFin);
}

/** Pièces du modèle (imbrications comprises) ; portée « sélection » : sous les occurrences de la racine données. */
export function piecesDuModele(m: Modele, o: Pick<OptionsDebit, "portee" | "selection"> = { portee: "tout" }): PieceDebit[] {
  const r: PieceDebit[] = [];
  const retenues = o.portee === "selection" ? new Set(o.selection ?? []) : null;
  const parcourir = (c: Contexte, M: Matrice4, chemin: readonly Id[], profondeur: number): void => {
    if (profondeur > 32) return;
    for (const occ of Object.values(c.occurrences)) {
      if (chemin.length === 0 && retenues && !retenues.has(occ.id)) continue;
      const d = m.definitions[occ.definition];
      if (!d) continue;
      const W = composer(M, occ.transformation);
      const ch = [...chemin, occ.id];
      if (d.piece) {
        const meta = d.piece;
        const a = [meta.coupeDebut?.angle ?? 0, meta.coupeFin?.angle ?? 0].sort((x, y) => y - x) as [number, number];
        r.push({ occurrence: occ.id, chemin: ch, repere: occ.repere ?? null, meta, longueur: longueurPiece(meta), angles: a, milieu: appliquer(W, v3(meta.longueur / 2, 0, 0)) });
      } else parcourir(d.contenu, W, ch, profondeur + 1);
    }
  };
  parcourir(m.racine, IDENTITE, [], 0);
  return r;
}

const cleSource = (s: SourceSection) => (s.genre === "saisie" ? ["saisie"] : ["catalogue", s.source, s.edition, s.page ?? "", s.ligne ?? ""]);
const arrondi = (x: number, pas: number) => Math.round(x / pas) * pas;

/** Lignes de la liste de débit, dans l'ordre : désignation, puis longueur décroissante. */
export function listeDebit(m: Modele, o: OptionsDebit = { portee: "tout" }): LigneDebit[] {
  const groupes = new Map<string, PieceDebit[]>();
  for (const p of piecesDuModele(m, o)) {
    const cle = JSON.stringify([p.meta.designation, p.meta.section, cleSource(p.meta.source), arrondi(p.longueur, 1e-9), arrondi(p.angles[0], 1e-6), arrondi(p.angles[1], 1e-6), !!p.meta.coupesProfil]);
    const g = groupes.get(cle);
    if (g) g.push(p);
    else groupes.set(cle, [p]);
  }
  const lignes: LigneDebit[] = [];
  for (const [cle, ps] of groupes) {
    const p0 = ps[0] as PieceDebit;
    const total = ps.reduce((s, p) => s + p.longueur, 0);
    const src = p0.meta.source;
    let masse: number | null = null;
    let origineMasse = `${NON_EVALUEE} : ni masse linéique sourcée, ni masse volumique déclarée avec sa source`;
    if (p0.meta.coupesProfil) origineMasse = `${NON_EVALUEE} : pièce recoupée par un profil`;
    else if (src.genre === "catalogue" && typeof src.masseLineique === "number" && src.masseLineique > 0) {
      masse = src.masseLineique * total;
      origineMasse = `masse linéique du catalogue (${src.source}, ${src.edition}${src.page ? `, p. ${src.page}` : ""})`;
    } else if (o.masseVolumique && o.masseVolumique.valeur > 0 && o.masseVolumique.source.trim() !== "") {
      masse = aireSection(p0.meta.section) * total * o.masseVolumique.valeur;
      origineMasse = `masse volumique déclarée (${o.masseVolumique.source.trim()})`;
    }
    lignes.push({
      cle,
      reperes: [...new Set(ps.map((p) => p.repere).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true })),
      designation: p0.meta.designation,
      nombre: ps.length,
      longueurUnitaire: p0.longueur,
      longueurTotale: total,
      angles: p0.angles,
      source: src,
      masse,
      origineMasse,
      occurrences: ps.map((p) => p.occurrence),
      chemins: ps.map((p) => p.chemin),
    });
  }
  return lignes.sort((a, b) => a.designation.localeCompare(b.designation, "fr", { numeric: true }) || b.longueurUnitaire - a.longueurUnitaire);
}

export type ColonneDebit = "reperes" | "designation" | "nombre" | "longueurUnitaire" | "longueurTotale" | "angles" | "source" | "masse";

/** Tri par colonne (stable) ; « non évaluée » toujours en dernier. */
export function trierDebit(lignes: readonly LigneDebit[], colonne: ColonneDebit, sens: 1 | -1 = 1): LigneDebit[] {
  const val = (l: LigneDebit): string | number | null =>
    colonne === "reperes" ? l.reperes.join(", ") : colonne === "designation" ? l.designation : colonne === "source" ? texteSourceDebit(l.source) : colonne === "angles" ? l.angles[0] * 1000 + l.angles[1] : colonne === "masse" ? l.masse : l[colonne];
  return [...lignes].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
    return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr", { numeric: true })) * sens;
  });
}

/** Source lisible : « saisie » ou « source, édition, p. page, ligne n ». */
export function texteSourceDebit(s: SourceSection): string {
  if (s.genre === "saisie") return "saisie";
  return [s.source, s.edition, s.page ? `p. ${s.page}` : null, s.ligne ? `ligne ${s.ligne}` : null].filter(Boolean).join(", ");
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const cellule = (v: string | number | null) => (v === null ? `"${NON_EVALUEE}"` : typeof v === "number" ? String(v) : `"${v.replace(/"/g, '""')}"`);

/** CSV de la liste (comme l'Atelier) : BOM, séparateur « ; », point décimal, en-tête avec unités, ligne de total. */
export function csvDebit(lignes: readonly LigneDebit[]): string {
  const entete = ["Repère(s)", "Désignation", "Nombre (u)", "Longueur unitaire (m)", "Longueur totale (m)", "Angles de coupe (°)", "Source", "Masse (kg)"];
  const corps = lignes.map((l) => [l.reperes.join(", "), l.designation, l.nombre, r3(l.longueurUnitaire), r3(l.longueurTotale), `${r3(l.angles[0])} / ${r3(l.angles[1])}`, texteSourceDebit(l.source), l.masse === null ? null : r3(l.masse)].map(cellule).join(";"));
  const total = ["Total", `${lignes.length} ligne(s)`, lignes.reduce((s, l) => s + l.nombre, 0), "", r3(lignes.reduce((s, l) => s + l.longueurTotale, 0)), "", "", ""].map((v) => (v === "" ? "" : cellule(v))).join(";");
  return "﻿" + [entete.map((c) => cellule(c)).join(";"), ...corps, total].join("\r\n") + "\r\n";
}

/**
 * Repères d'une renumérotation (lot L14) : préfixe et numéro de départ, dans l'ordre des lignes données ; toutes les
 * occurrences d'une ligne reçoivent le même repère.
 */
export function reperesRenumerotes(lignes: readonly LigneDebit[], prefixe: string, depart: number): { occurrence: Id; repere: string }[] {
  const r: { occurrence: Id; repere: string }[] = [];
  lignes.forEach((l, i) => {
    for (const o of l.occurrences) r.push({ occurrence: o, repere: `${prefixe}${depart + i}` });
  });
  return r;
}
