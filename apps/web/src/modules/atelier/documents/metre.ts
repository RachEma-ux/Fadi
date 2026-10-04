/**
 * Métré du niveau actif (DA-16-10-b/-c, D-018, D-019). Fonction pure : aucune écriture, aucun arrondi.
 *
 * Les grandeurs viennent **toutes** de `calculerQuantites` (règle `quantites/1`, `atelier-model`, même code que le
 * serveur) ; ce module ne recalcule aucune aire ni longueur : il regroupe les quantités par objet en lignes de
 * métré (murs par type, baies par classe et par type, dalles par type, pièces une à une, poteaux, escaliers,
 * solides, espaces et zones) et ajoute deux comptes lus tels quels dans le modèle : les effectifs par type et le
 * nombre de marches des escaliers (`marches`, « non évaluée » propagée, jamais 0).
 *
 * Chaque métré porte la **révision** et l'empreinte de l'état dont il est tiré (R11) ; il est « à recalculer »
 * dès que la révision de l'état courant diffère. Calques masqués inclus, comme le prototype (D-019, indiqué à
 * l'écran). Une classe absente de l'état donne zéro ligne, pas d'erreur. Une somme dont une entrée est non
 * évaluée est non évaluée (« partiel »), avec la somme des entrées évaluées et la liste des autres.
 */
import { calculerQuantites, estNonEvaluee, nonEvaluee, REGLE_QUANTITES, type EtatModele, type IdObjet, type NatureQuantite, type NonEvaluee, type ObjetModele, type Quantite, type StatutQuantite } from "@parcours/atelier-model";
import { celluleCsv, nomSur } from "./format";

export type UniteMetre = "m" | "m²" | "m³" | "unite";

export const RUBRIQUES_METRE = ["murs", "portes", "fenetres", "ouvertures", "dalles", "pieces", "poteaux", "escaliers", "solides", "espaces", "zones"] as const;
export type RubriqueMetre = (typeof RUBRIQUES_METRE)[number];

export const LIBELLES_RUBRIQUE: Readonly<Record<RubriqueMetre, string>> = {
  murs: "Murs",
  portes: "Portes",
  fenetres: "Fenêtres",
  ouvertures: "Ouvertures",
  dalles: "Dalles",
  pieces: "Pièces",
  poteaux: "Poteaux",
  escaliers: "Escaliers",
  solides: "Solides",
  espaces: "Espaces",
  zones: "Zones",
};

export interface LigneMetre {
  readonly rubrique: RubriqueMetre;
  /** Groupe de la ligne : type (`typeId`), objet (pièce) ou `null` (toute la rubrique). */
  readonly groupe: string | null;
  /** Grandeur mesurée (« longueur », « aire nette », « nombre »…). */
  readonly grandeur: string;
  readonly valeur: number | NonEvaluee;
  readonly unite: UniteMetre;
  readonly statut: StatutQuantite;
  /** Objets comptés. */
  readonly objets: readonly IdObjet[];
  /** Somme des entrées évaluées et entrées non évaluées, si la valeur est non évaluée faute de l'une d'elles. */
  readonly partiel?: { readonly somme: number; readonly nonEvalues: readonly IdObjet[] };
}

export interface Metre {
  readonly projetId: string;
  readonly niveauId: IdObjet;
  readonly niveauNom: string;
  readonly revision: number;
  readonly empreinte: string;
  readonly regle: typeof REGLE_QUANTITES;
  /** Règle de cumul affichée en tête (reprise du prototype). */
  readonly mention: string;
  readonly lignes: readonly LigneMetre[];
}

export const MENTION_METRE = "Vides d'ouvertures déduits ; chevauchements entre objets additionnés (pas de booléen) ; calques masqués inclus.";

/** Le métré est-il périmé pour cet état (révision différente) ? */
export const metrePerime = (m: Metre, etat: EtatModele | null): boolean => !etat || etat.revision !== m.revision || etat.empreinte !== m.empreinte;

// ---------------------------------------------------------------------------------------------------------------

interface Entree {
  readonly id: IdObjet;
  readonly valeur: number | NonEvaluee;
  readonly statut: StatutQuantite;
}

/** Somme sans arrondi, dans l'ordre des identifiants ; non évaluée si une entrée l'est. */
function sommer(entrees: readonly Entree[]): Pick<LigneMetre, "valeur" | "statut" | "objets" | "partiel"> {
  const triees = [...entrees].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  let somme = 0;
  const nonEvalues: IdObjet[] = [];
  for (const e of triees) {
    if (estNonEvaluee(e.valeur)) nonEvalues.push(e.id);
    else somme += e.valeur;
  }
  const objets = triees.map((e) => e.id);
  if (nonEvalues.length > 0) return { valeur: nonEvaluee(`partiel : ${nonEvalues.length} objet(s) non évalué(s) (${nonEvalues.join(", ")})`), statut: "non-evaluee", objets, partiel: { somme, nonEvalues } };
  return { valeur: somme, statut: triees.some((e) => e.statut === "a-verifier") ? "a-verifier" : "calculee", objets };
}

const SANS_TYPE = "sans type";

function typeDe(o: ObjetModele | undefined): string {
  const t = (o?.params as { typeId?: unknown } | undefined)?.typeId;
  return typeof t === "string" ? t : SANS_TYPE;
}

const RUBRIQUE_CLASSE: Readonly<Partial<Record<string, RubriqueMetre>>> = { mur: "murs", porte: "portes", fenetre: "fenetres", ouverture: "ouvertures", dalle: "dalles", piece: "pieces", poteau: "poteaux", escalier: "escaliers", solide: "solides", espace: "espaces", zone: "zones" };

/** Grandeurs par rubrique : nature de `quantites/1`, libellé, regroupement (par type, par objet, ou total). */
const GRANDEURS: readonly { readonly nature: NatureQuantite; readonly rubrique: RubriqueMetre; readonly grandeur: string; readonly par: "type" | "objet" | "total" }[] = [
  { nature: "longueur-mur", rubrique: "murs", grandeur: "longueur d'axe", par: "type" },
  { nature: "aire-mur-brute", rubrique: "murs", grandeur: "aire brute d'une face", par: "type" },
  { nature: "aire-baies-mur", rubrique: "murs", grandeur: "aire des baies hébergées", par: "type" },
  { nature: "aire-mur", rubrique: "murs", grandeur: "aire nette d'une face", par: "type" },
  { nature: "volume-mur", rubrique: "murs", grandeur: "volume net", par: "type" },
  { nature: "aire-baie", rubrique: "portes", grandeur: "aire de baie", par: "type" },
  { nature: "aire-baie", rubrique: "fenetres", grandeur: "aire de baie", par: "type" },
  { nature: "aire-baie", rubrique: "ouvertures", grandeur: "aire de baie", par: "type" },
  { nature: "aire-dalle", rubrique: "dalles", grandeur: "aire nette", par: "type" },
  { nature: "volume-dalle", rubrique: "dalles", grandeur: "volume", par: "type" },
  { nature: "aire-piece", rubrique: "pieces", grandeur: "aire calculée", par: "objet" },
  { nature: "aire-piece-declaree", rubrique: "pieces", grandeur: "aire déclarée", par: "objet" },
  { nature: "ecart-aire-piece", rubrique: "pieces", grandeur: "écart calculée − déclarée", par: "objet" },
  { nature: "aire-piece", rubrique: "pieces", grandeur: "aire calculée", par: "total" },
  { nature: "volume-poteau", rubrique: "poteaux", grandeur: "volume", par: "total" },
  { nature: "volume-solide", rubrique: "solides", grandeur: "volume net", par: "total" },
  { nature: "aire-espace", rubrique: "espaces", grandeur: "aire", par: "total" },
  { nature: "aire-zone", rubrique: "zones", grandeur: "aire", par: "total" },
];

const UNITE_NATURE = (q: Quantite): UniteMetre => (q.unite === "m" || q.unite === "m²" || q.unite === "m³" ? q.unite : "unite");

/** Nom affichable d'un objet (pièce : code et nom). */
export function nomObjet(o: ObjetModele | undefined, id: IdObjet): string {
  const p = o?.params as { nom?: unknown; code?: unknown } | undefined;
  const nom = typeof p?.nom === "string" ? p.nom : "";
  const code = typeof p?.code === "string" ? p.code : "";
  return [code, nom].filter(Boolean).join(" · ") || id;
}

/** Métré du niveau `niveauId` de `etat` (pur, reproductible). */
export function calculerMetre(etat: EtatModele, niveauId: IdObjet): Metre {
  const quantites = calculerQuantites(etat, { niveauId }).filter((q) => q.objetId !== undefined);
  const objetsNiveau = Object.values(etat.objets).filter((o) => o.niveauId === niveauId);
  const rubriqueDe = (id: IdObjet | undefined) => (id ? RUBRIQUE_CLASSE[etat.objets[id]?.classe ?? ""] : undefined);
  const lignes: LigneMetre[] = [];

  for (const rubrique of RUBRIQUES_METRE) {
    const objets = objetsNiveau.filter((o) => RUBRIQUE_CLASSE[o.classe] === rubrique);
    if (objets.length === 0) continue;
    // Effectifs (lus dans le modèle) : par type pour les classes typées, sinon total.
    const types = [...new Set(objets.map(typeDe))].sort();
    const parType = ["murs", "portes", "fenetres", "ouvertures", "dalles"].includes(rubrique);
    for (const t of parType ? types : [null]) {
      const ids = objets.filter((o) => t === null || typeDe(o) === t).map((o) => o.id);
      lignes.push({ rubrique, groupe: t, grandeur: "nombre", ...sommer(ids.map((id) => ({ id, valeur: 1, statut: "calculee" as const }))), unite: "unite" });
    }
    // Grandeurs de `quantites/1`.
    for (const g of GRANDEURS.filter((x) => x.rubrique === rubrique)) {
      const qs = quantites.filter((q) => q.nature === g.nature && rubriqueDe(q.objetId) === rubrique);
      if (qs.length === 0) continue;
      const unite = UNITE_NATURE(qs[0] as Quantite);
      const entree = (q: Quantite): Entree => ({ id: q.objetId as IdObjet, valeur: q.valeur, statut: q.statut });
      const groupes: (string | null)[] = g.par === "type" ? types : g.par === "objet" ? [...new Set(qs.map((q) => q.objetId as IdObjet))].sort() : [null];
      for (const grp of groupes) {
        const dans = qs.filter((q) => grp === null || (g.par === "type" ? typeDe(etat.objets[q.objetId as IdObjet]) === grp : q.objetId === grp));
        if (dans.length === 0) continue;
        lignes.push({ rubrique, groupe: g.par === "objet" && grp ? nomObjet(etat.objets[grp], grp) : grp, grandeur: g.par === "total" && g.rubrique === "pieces" ? "aire calculée (total)" : g.grandeur, ...sommer(dans.map(entree)), unite });
      }
    }
    // Marches des escaliers (paramètre `marches`, évaluable).
    if (rubrique === "escaliers") {
      const entrees = objets.map((o): Entree => {
        const m = o.classe === "escalier" ? o.params.marches : undefined;
        return { id: o.id, valeur: typeof m === "number" ? m : estNonEvaluee(m) ? m : nonEvaluee(`${o.id} : nombre de marches absent`), statut: "calculee" };
      });
      lignes.push({ rubrique, groupe: null, grandeur: "nombre de marches", ...sommer(entrees), unite: "unite" });
    }
  }
  const niveau = etat.objets[niveauId];
  return { projetId: etat.projetId, niveauId, niveauNom: niveau?.classe === "niveau" ? niveau.params.nom : niveauId, revision: etat.revision, empreinte: etat.empreinte, regle: REGLE_QUANTITES, mention: MENTION_METRE, lignes };
}

// ---------------------------------------------------------------------------------------------------------------
// Export CSV (DA-16-10-c)
// ---------------------------------------------------------------------------------------------------------------

/** Nom du fichier CSV : `<projet>_<niveau>_r<révision>_metre.csv`. */
export const nomCsvMetre = (m: Metre): string => `${nomSur(m.projetId)}_${nomSur(m.niveauNom)}_r${m.revision}_metre.csv`;

/**
 * CSV du métré : BOM UTF-8, `;`, fins de ligne CRLF, métadonnées en tête (projet, niveau, révision, empreinte,
 * règle, date, mention), puis une ligne par grandeur ; valeurs exactes (`String(n)`), « non évaluée » avec motif.
 */
export function csvMetre(m: Metre, date: Date): string {
  const meta: [string, string | number][] = [
    ["projet", m.projetId],
    ["niveau", m.niveauNom],
    ["niveau_id", m.niveauId],
    ["revision", m.revision],
    ["empreinte", m.empreinte],
    ["regles", m.regle],
    ["date", date.toISOString()],
    ["mention", m.mention],
  ];
  const lignes = [
    ...meta.map(([k, v]) => `${celluleCsv(k)};${celluleCsv(v)}`),
    "",
    ["rubrique", "groupe", "grandeur", "valeur", "unite", "statut", "objets", "motif"].map(celluleCsv).join(";"),
    ...m.lignes.map((l) =>
      [celluleCsv(LIBELLES_RUBRIQUE[l.rubrique]), celluleCsv(l.groupe ?? ""), celluleCsv(l.grandeur), estNonEvaluee(l.valeur) ? celluleCsv("non évaluée") : celluleCsv(l.valeur), celluleCsv(l.unite === "unite" ? "" : l.unite), celluleCsv(l.statut), celluleCsv(l.objets.join(" ")), celluleCsv(estNonEvaluee(l.valeur) ? l.valeur.motif : "")].join(";"),
    ),
  ];
  return `﻿${lignes.join("\r\n")}\r\n`;
}
