/**
 * Feuilles et jeux (cahier §5.9) : une feuille est une définition du modèle (`feuille.creer`) qui place des vues à
 * leur échelle dans un cadre normalisé avec son cartouche. La composition est dérivée : feuille en millimètres,
 * origine en bas à gauche, y vers le haut (repère du PDF) — les rendus SVG, PDF et DXF lisent la même composition.
 * Le cartouche porte la révision du modèle et l'empreinte de la feuille, jamais une date de génération : deux
 * générations à la même révision donnent le même fichier.
 */
import type { Vec } from "../geometrie.js";
import type { Definition, ModeleAtelier } from "../modele.js";
import { ErreurCommande, lire } from "../commandes/base.js";
import type { Primitive, Trait } from "./dessin.js";
import { empreinteDe } from "./empreinte.js";
import { empreinteVue, genererVueDefinition, paramsDeDefinition, type OptionsGeneration, type VueGeneree } from "./vues.js";
import { genererTableau, TABLEAUX, type Tableau, type TypeTableau } from "./tableaux.js";

export type FormatFeuille = "A0" | "A1" | "A2" | "A3" | "A4";
export const FORMATS: Record<FormatFeuille, { largeur: number; hauteur: number }> = {
  A0: { largeur: 1189, hauteur: 841 },
  A1: { largeur: 841, hauteur: 594 },
  A2: { largeur: 594, hauteur: 420 },
  A3: { largeur: 420, hauteur: 297 },
  A4: { largeur: 297, hauteur: 210 },
};
export type OrientationFeuille = "paysage" | "portrait";

export interface PlacementVue {
  vueId: string;
  /** Centre de la vue sur la feuille (mm, depuis le coin bas gauche). */
  x: number;
  y: number;
}

/** Nomenclature (tableau) placée sur une feuille : coin haut gauche (mm, depuis le coin bas gauche). */
export interface PlacementTableau {
  type: TypeTableau;
  x: number;
  y: number;
}

export interface ParamsFeuille {
  titre: string;
  numero: string;
  format: FormatFeuille;
  orientation: OrientationFeuille;
  /** Jeu de feuilles (dossier, phase de rendu) ; null = hors jeu. */
  jeu: string | null;
  indice: string | null;
  /** Saisis par l'utilisateur ; jamais remplis automatiquement. */
  auteur: string | null;
  date: string | null;
  vues: PlacementVue[];
  /** Nomenclatures placées (absent des feuilles antérieures : aucune). */
  tableaux?: PlacementTableau[];
}

type Brut = Record<string, unknown>;

export function lireParamsFeuille(etat: ModeleAtelier, p: Brut): ParamsFeuille {
  const titre = lire.chaine(p, "titre").trim();
  if (!titre) throw new ErreurCommande("invalide", "titre", "titre de feuille requis");
  const numero = lire.chaine(p, "numero").trim();
  if (!numero || numero.length > 20) throw new ErreurCommande("invalide", "numero", "numéro de feuille requis (20 caractères au plus)");
  const format = lire.enumeration(p, "format", Object.keys(FORMATS) as FormatFeuille[], "A3");
  const orientation = lire.enumeration(p, "orientation", ["paysage", "portrait"] as const, "paysage");
  const texte = (cle: string, max: number) => {
    const v = lire.chaineOuNull(p, cle);
    if (v !== null && v.length > max) throw new ErreurCommande("invalide", cle, `« ${cle} » : ${max} caractères au plus`);
    return v === null || !v.trim() ? null : v.trim();
  };
  const brutes = p["vues"] ?? [];
  if (!Array.isArray(brutes)) throw new ErreurCommande("invalide", "vues", "« vues » : liste de placements { vueId, x, y }");
  const { largeur, hauteur } = dimensions(format, orientation);
  const vues: PlacementVue[] = brutes.map((v, i) => {
    if (!v || typeof v !== "object") throw new ErreurCommande("invalide", `vues[${i}]`, "placement { vueId, x, y } attendu");
    const b = v as Brut;
    const vueId = lire.chaine(b, "vueId");
    const def = etat.definitions[vueId];
    if (!def || def.classe !== ("vue" as Definition["classe"])) throw new ErreurCommande("precondition", `vues[${i}].vueId`, `vue inconnue : ${vueId}`);
    const x = lire.nombre(b, "x", { min: 0, max: largeur })!;
    const y = lire.nombre(b, "y", { min: 0, max: hauteur })!;
    return { vueId, x, y };
  });
  if (new Set(vues.map((v) => v.vueId)).size !== vues.length) throw new ErreurCommande("invalide", "vues", "une vue ne figure qu'une fois sur une feuille");
  const brutsT = p["tableaux"] ?? [];
  if (!Array.isArray(brutsT)) throw new ErreurCommande("invalide", "tableaux", "« tableaux » : liste de placements { type, x, y }");
  const tableaux: PlacementTableau[] = brutsT.map((v, i) => {
    if (!v || typeof v !== "object") throw new ErreurCommande("invalide", `tableaux[${i}]`, "placement { type, x, y } attendu");
    const b = v as Brut;
    const type = lire.enumeration(b, "type", Object.keys(TABLEAUX) as TypeTableau[], "pieces");
    return { type, x: lire.nombre(b, "x", { min: 0, max: largeur })!, y: lire.nombre(b, "y", { min: 0, max: hauteur })! };
  });
  if (new Set(tableaux.map((t) => t.type)).size !== tableaux.length) throw new ErreurCommande("invalide", "tableaux", "un tableau ne figure qu'une fois sur une feuille");
  const base = { titre, numero, format, orientation, jeu: texte("jeu", 60), indice: texte("indice", 10), auteur: texte("auteur", 80), date: texte("date", 30), vues };
  // Une feuille sans tableau garde exactement la forme d'avant (empreintes inchangées).
  return tableaux.length ? { ...base, tableaux } : base;
}

export function dimensions(format: FormatFeuille, orientation: OrientationFeuille): { largeur: number; hauteur: number } {
  const f = FORMATS[format];
  return orientation === "paysage" ? f : { largeur: f.hauteur, hauteur: f.largeur };
}

/** Marges du cadre (mm) : 20 à gauche (reliure), 10 ailleurs ; cartouche en bas à droite. */
export const MARGES = { gauche: 20, droite: 10, haut: 10, bas: 10 };
export const CARTOUCHE = { largeur: 180, hauteur: 48 };

export interface FeuilleComposee {
  definitionId: string | null;
  params: ParamsFeuille;
  largeur: number;
  hauteur: number;
  /** Primitives en millimètres sur la feuille (y vers le haut). */
  primitives: Primitive[];
  vues: { vueId: string; titre: string; echelle: number; empreinte: string; cadre: { x0: number; y0: number; x1: number; y1: number } }[];
  tableaux: { type: TypeTableau; titre: string; empreinte: string; lignes: number; omises: number; cadre: { x0: number; y0: number; x1: number; y1: number } }[];
  empreinte: string;
  avertissements: string[];
}

/** Taille (mm) d'une vue générée à son échelle, sans marge. */
export function tailleDessinMm(vue: VueGeneree): { largeur: number; hauteur: number } {
  if (!vue.bornes) return { largeur: 0, hauteur: 0 };
  const k = 1000 / vue.params.echelle;
  return { largeur: (vue.bornes.max.x - vue.bornes.min.x) * k, hauteur: (vue.bornes.max.y - vue.bornes.min.y) * k };
}

function transformer(p: Primitive, tr: (v: Vec) => Vec, k: number): Primitive {
  switch (p.type) {
    case "ligne":
      return { ...p, a: tr(p.a), b: tr(p.b) };
    case "poly":
      return { ...p, points: p.points.map(tr) };
    case "cercle":
      return { ...p, centre: tr(p.centre), rayon: p.rayon * k };
    case "texte":
      return { ...p, position: tr(p.position) };
  }
}

/** Zone utile de la feuille (hors marges), cartouche compris. */
export function zoneUtile(params: Pick<ParamsFeuille, "format" | "orientation">): { x0: number; y0: number; x1: number; y1: number } {
  const { largeur, hauteur } = dimensions(params.format, params.orientation);
  return { x0: MARGES.gauche, y0: MARGES.bas, x1: largeur - MARGES.droite, y1: hauteur - MARGES.haut };
}

/**
 * Position libre pour une nouvelle vue : rangées de gauche à droite et de haut en bas, au-dessus du cartouche ;
 * null si la vue ne tient nulle part.
 */
export function positionLibre(params: Pick<ParamsFeuille, "format" | "orientation">, occupees: { x0: number; y0: number; x1: number; y1: number }[], taille: { largeur: number; hauteur: number }): { x: number; y: number } | null {
  const z = zoneUtile(params);
  const w = taille.largeur + 10;
  const h = taille.hauteur + 16;
  const cartouche = { x0: z.x1 - CARTOUCHE.largeur, y0: z.y0, x1: z.x1, y1: z.y0 + CARTOUCHE.hauteur };
  const libre = (r: { x0: number; y0: number; x1: number; y1: number }) => [...occupees, cartouche].every((o) => r.x1 <= o.x0 || r.x0 >= o.x1 || r.y1 <= o.y0 || r.y0 >= o.y1);
  for (let y1 = z.y1 - 4; y1 - h >= z.y0; y1 -= 5) {
    for (let x0 = z.x0 + 4; x0 + w <= z.x1; x0 += 5) {
      const r = { x0, y0: y1 - h, x1: x0 + w, y1 };
      if (libre(r)) return { x: Math.round(x0 + w / 2), y: Math.round(y1 - h + 10 + taille.hauteur / 2) };
    }
  }
  return null;
}

export interface Projet {
  nom: string;
  code: string;
}

/** Compose une feuille : cadre, vues à leur échelle avec leur titre, cartouche. */
export function composerFeuille(etat: ModeleAtelier, params: ParamsFeuille, revision: number, projet: Projet, definitionId: string | null = null, options: OptionsGeneration = {}): FeuilleComposee {
  const { largeur, hauteur } = dimensions(params.format, params.orientation);
  const z = zoneUtile(params);
  const out: Primitive[] = [];
  const avertissements: string[] = [];
  const ligne = (a: Vec, b: Vec, trait: Trait = "vue") => out.push({ type: "ligne", a, b, trait, objetId: null });
  const rect = (x0: number, y0: number, x1: number, y1: number, trait: Trait = "vue") => out.push({ type: "poly", points: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], ferme: true, trait, remplissage: null, objetId: null });
  const texte = (x: number, y: number, t: string, h: number, ancre: "debut" | "milieu" | "fin" = "debut") => out.push({ type: "texte", position: { x, y }, texte: t, hauteurMm: h, ancre, angle: 0, trait: "annotation", objetId: null });

  // Cadre.
  rect(z.x0, z.y0, z.x1, z.y1, "coupe");

  // Vues.
  const vues: FeuilleComposee["vues"] = [];
  for (const pl of params.vues) {
    const vue = genererVueDefinition(etat, pl.vueId, options);
    if (!vue) {
      avertissements.push(`Vue ${pl.vueId} absente du modèle : placement à retirer.`);
      continue;
    }
    const k = 1000 / vue.params.echelle;
    const b = vue.bornes;
    const t = tailleDessinMm(vue);
    const cx = b ? (b.min.x + b.max.x) / 2 : 0;
    const cy = b ? (b.min.y + b.max.y) / 2 : 0;
    const tr = (p: Vec): Vec => ({ x: pl.x + (p.x - cx) * k, y: pl.y + (p.y - cy) * k });
    for (const p of vue.primitives) out.push(transformer(p, tr, k));
    const cadre = { x0: pl.x - t.largeur / 2, y0: pl.y - t.hauteur / 2, x1: pl.x + t.largeur / 2, y1: pl.y + t.hauteur / 2 };
    texte(cadre.x0, cadre.y0 - 7, `${vue.params.titre} · 1:${vue.params.echelle}`, 3.5);
    ligne({ x: cadre.x0, y: cadre.y0 - 8.5 }, { x: cadre.x0 + Math.min(80, Math.max(30, t.largeur)), y: cadre.y0 - 8.5 }, "annotation");
    if (cadre.x0 < z.x0 || cadre.x1 > z.x1 || cadre.y0 - 9 < z.y0 || cadre.y1 > z.y1) avertissements.push(`« ${vue.params.titre} » (1:${vue.params.echelle}) dépasse le cadre de la feuille : changer d'échelle, de format ou de position.`);
    for (const a of vue.avertissements) avertissements.push(`${vue.params.titre} : ${a}`);
    vues.push({ vueId: pl.vueId, titre: vue.params.titre, echelle: vue.params.echelle, empreinte: vue.empreinte, cadre });
  }
  if (!params.vues.length && !(params.tableaux ?? []).length) avertissements.push("Feuille sans vue.");

  // Nomenclatures : le tableau généré par le même code que le tableau seul (même empreinte), en grille.
  const tableaux: FeuilleComposee["tableaux"] = [];
  for (const pl of params.tableaux ?? []) {
    const t = genererTableau(etat, pl.type);
    const g = grilleTableau(t, pl.y - z.y0);
    const x0 = pl.x;
    const y1 = pl.y;
    texte(x0, y1 - 4, `${t.titre}`, 3.5);
    let y = y1 - 6;
    const lignesDessin = [t.colonnes.map((c, i) => (t.unites[i] ? `${c} (${t.unites[i]})` : c)), ...g.lignes];
    lignesDessin.forEach((cellules, r) => {
      const yb = y - g.hauteurLigne;
      rect(x0, yb, x0 + g.largeur, y, r === 0 ? "coupe" : "fin");
      let x = x0;
      cellules.forEach((c, i) => {
        if (i > 0) ligne({ x, y: yb }, { x, y }, "fin");
        texte(x + 1, yb + 1.4, c, g.texte);
        x += g.colonnes[i]!;
      });
      y = yb;
    });
    if (g.omises) {
      texte(x0, y - 4, `… ${g.omises} ligne(s) de plus : voir le tableau complet.`, 2.2);
      avertissements.push(`« ${t.titre} » : ${g.omises} ligne(s) ne tiennent pas sur la feuille (tableau complet au catalogue).`);
    }
    const cadre = { x0, y0: y - (g.omises ? 6 : 0), x1: x0 + g.largeur, y1 };
    if (cadre.x1 > z.x1 || cadre.x0 < z.x0 || cadre.y1 > z.y1) avertissements.push(`« ${t.titre} » dépasse le cadre de la feuille : déplacez-le.`);
    tableaux.push({ type: pl.type, titre: t.titre, empreinte: t.empreinte, lignes: t.lignes.length, omises: g.omises, cadre });
  }

  const empreinte = empreinteFeuille(etat, params, projet);

  // Cartouche.
  const cx0 = z.x1 - CARTOUCHE.largeur;
  const cy0 = z.y0;
  const cy1 = z.y0 + CARTOUCHE.hauteur;
  rect(cx0, cy0, z.x1, cy1, "coupe");
  const lignes = [cy0 + 12, cy0 + 24, cy0 + 36];
  for (const y of lignes) ligne({ x: cx0, y }, { x: z.x1, y });
  ligne({ x: cx0 + 120, y: cy0 }, { x: cx0 + 120, y: lignes[1]! });
  texte(cx0 + 3, cy1 - 8, `${projet.code} — ${projet.nom}`.slice(0, 70), 4);
  texte(cx0 + 3, lignes[1]! + 4, params.titre.slice(0, 70), 4);
  texte(cx0 + 3, lignes[0]! + 4, `Jeu : ${params.jeu ?? "—"} · Indice : ${params.indice ?? "—"} · Auteur : ${params.auteur ?? "non renseigné"}`.slice(0, 80), 2.6);
  texte(cx0 + 123, lignes[0]! + 4, `Feuille ${params.numero}`, 4);
  texte(cx0 + 3, cy0 + 4, `Révision du modèle ${revision} · empreinte ${empreinte} · date : ${params.date ?? "non renseignée"} · ${params.format} ${params.orientation}`.slice(0, 95), 2.2);
  const echelles = [...new Set(vues.map((v) => v.echelle))].sort((a, b) => a - b);
  texte(cx0 + 123, cy0 + 4, echelles.length ? `Échelle${echelles.length > 1 ? "s" : ""} 1:${echelles.join(" · 1:")}` : "Sans vue", 2.6);
  return { definitionId, params, largeur, hauteur, primitives: out, vues, tableaux, empreinte, avertissements };
}

const TEXTE_TABLEAU = 2.2;
const fmtCellule = (c: string | number | null): string => (c === null ? "—" : typeof c === "number" ? String(c).replace(".", ",") : c);

/** Mise en grille d'un tableau : largeur des colonnes d'après leur contenu (bornée), lignes qui tiennent dans `hauteurDispo`. */
export function grilleTableau(t: Tableau, hauteurDispo: number): { colonnes: number[]; largeur: number; hauteurLigne: number; texte: number; lignes: string[][]; omises: number } {
  const hauteurLigne = 5;
  const lignes = [...t.lignes, ...(t.total ? [t.total] : [])].map((l) => l.map(fmtCellule));
  const entetes = t.colonnes.map((c, i) => (t.unites[i] ? `${c} (${t.unites[i]})` : c));
  const colonnes = entetes.map((e, i) => Math.min(60, Math.max(12, Math.max(e.length, ...lignes.map((l) => (l[i] ?? "").length)) * TEXTE_TABLEAU * 0.62 + 2.5)));
  const largeur = colonnes.reduce((s, c) => s + c, 0);
  const places = Math.max(0, Math.floor((hauteurDispo - 6 - 8) / hauteurLigne) - 1);
  const retenues = lignes.length > places ? lignes.slice(0, places) : lignes;
  return { colonnes, largeur, hauteurLigne, texte: TEXTE_TABLEAU, lignes: retenues.map((l) => l.map((c, i) => tronquer(c, colonnes[i]!))), omises: lignes.length - retenues.length };
}

const tronquer = (c: string, largeurMm: number) => {
  const max = Math.max(3, Math.floor((largeurMm - 2.5) / (TEXTE_TABLEAU * 0.62)));
  return c.length > max ? `${c.slice(0, max - 1)}…` : c;
};

/** Empreinte d'une feuille sans la composer : ses paramètres, l'empreinte de chaque vue placée, le projet. */
export function empreinteFeuille(etat: ModeleAtelier, params: ParamsFeuille, projet: Projet): string {
  const vues = params.vues.map((pl) => {
    const d = etat.definitions[pl.vueId];
    return [pl.vueId, d && d.classe === ("vue" as Definition["classe"]) ? empreinteVue(etat, paramsDeDefinition(d)) : null];
  });
  const tableaux = (params.tableaux ?? []).map((t) => [t.type, genererTableau(etat, t.type).empreinte]);
  return empreinteDe(tableaux.length ? { params, vues, projet, tableaux } : { params, vues, projet });
}

export function composerFeuilleDefinition(etat: ModeleAtelier, id: string, revision: number, projet: Projet, options: OptionsGeneration = {}): FeuilleComposee | null {
  const def = etat.definitions[id];
  if (!def || def.classe !== ("feuille" as Definition["classe"])) return null;
  return composerFeuille(etat, def.params as unknown as ParamsFeuille, revision, projet, id, options);
}
