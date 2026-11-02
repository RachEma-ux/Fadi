/**
 * Tableau de bord RGPH 2024 (D-GD-37) : onglets « Chiffres clés 2024 », « Tableaux RGPH 2024 », « CEE 2024 ». Logique
 * pure, indépendante de React et du DOM.
 *
 * Interface ≠ base de données (D-GD-29) : aucun chiffre, aucun libellé d'indicateur n'est écrit dans le code. Les blocs
 * (quelle famille d'indicateurs va dans quelle carte ou quel tableau) sont une **définition** chargée en base depuis une
 * annexe de fiche qualifiée (`geodata_tableaux_bord`) ; les valeurs sont celles de la zone choisie, lues dans
 * `geodata_valeurs`. Une valeur absente reste absente (« Donnée non disponible »), jamais zéro ; un résultat composé
 * (somme, rapport) est marqué « calculé ».
 */
import { estMilieu, estSexe, LIBELLES_MILIEU, LIBELLES_SEXE, MILIEUX, SEXES, type Milieu, type Sexe } from "./dimensions.js";

export const ONGLETS_TABLEAU_DE_BORD = ["chiffres-cles", "cee"] as const;
export type OngletBlocs = (typeof ONGLETS_TABLEAU_DE_BORD)[number];
export const GRAPHIQUES = ["barres", "barres-horizontales", "courbe"] as const;
export type Graphique = (typeof GRAPHIQUES)[number];

/** Désigne un indicateur de la zone par ses dimensions (jamais par un identifiant de base). */
export interface SelecteurIndicateur {
  readonly famille: string;
  readonly modalite?: string | null;
  readonly milieu?: Milieu;
  readonly sexe?: Sexe;
}

export type Expression =
  | { readonly indicateur: SelecteurIndicateur }
  | { readonly somme: readonly SelecteurIndicateur[] }
  | { readonly ratio: readonly [Expression, Expression]; readonly facteur?: number }
  | { readonly indisponible: string };

export interface BlocChiffre {
  readonly cle: string;
  readonly onglet: OngletBlocs;
  readonly type: "chiffre";
  readonly titre: string;
  readonly valeur: Expression;
  readonly unite: string | null;
  readonly decimales: number | null;
  readonly source: string;
  readonly note: string | null;
}

export interface LigneBloc { readonly libelle: string; readonly cellules: readonly Expression[] }

export interface BlocTableau {
  readonly cle: string;
  readonly onglet: OngletBlocs;
  readonly type: "tableau";
  readonly titre: string;
  readonly enTeteLignes: string;
  readonly colonnes: readonly string[];
  readonly lignes: readonly LigneBloc[];
  readonly unite: string | null;
  readonly decimales: number | null;
  readonly graphique: Graphique | null;
  readonly source: string;
  readonly note: string | null;
}

export type Bloc = BlocChiffre | BlocTableau;

export interface DefinitionTableauDeBord {
  readonly pays: string;
  readonly zone: { readonly code: string; readonly nom: string };
  readonly blocs: readonly Bloc[];
}

/** Indicateur d'une zone tel que servi par l'API (fiche d'objet). */
export interface IndicateurZone {
  readonly titre: string;
  readonly unite: string | null;
  readonly nature?: string | null;
  readonly theme: string | null;
  readonly famille: string | null;
  readonly modalite: string | null;
  readonly milieu: Milieu | null;
  readonly sexe: Sexe | null;
  readonly valeur: number | null;
  readonly motifAbsence: string | null;
}

export interface ValeurEvaluee {
  readonly valeur: number | null;
  /** Résultat composé par GeoData (somme, rapport) ou indicateur de nature « calculé » : jamais présenté comme publié. */
  readonly calcule: boolean;
  /** Motif d'absence (signe du HCP, indicateur absent de la zone, série non chargée…). */
  readonly motif: string | null;
}

// ——— Validation de la définition (lue en base, venue d'une annexe) ———

const texte = (x: unknown, max = 400): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const CLE = /^[a-z0-9-]{1,64}$/;

function validerSelecteur(x: unknown, ou: string, erreurs: string[]): SelecteurIndicateur | null {
  if (!x || typeof x !== "object") { erreurs.push(`${ou} : sélecteur attendu`); return null; }
  const s = x as Record<string, unknown>;
  if (!texte(s["famille"])) { erreurs.push(`${ou} : famille attendue`); return null; }
  if (s["modalite"] !== undefined && s["modalite"] !== null && !texte(s["modalite"])) erreurs.push(`${ou} : modalité invalide`);
  if (s["milieu"] !== undefined && !estMilieu(s["milieu"])) erreurs.push(`${ou} : milieu invalide`);
  if (s["sexe"] !== undefined && !estSexe(s["sexe"])) erreurs.push(`${ou} : sexe invalide`);
  return {
    famille: s["famille"] as string,
    ...(s["modalite"] !== undefined ? { modalite: (s["modalite"] as string | null) } : {}),
    ...(estMilieu(s["milieu"]) ? { milieu: s["milieu"] } : {}),
    ...(estSexe(s["sexe"]) ? { sexe: s["sexe"] } : {}),
  };
}

function validerExpression(x: unknown, ou: string, erreurs: string[], profondeur = 0): Expression | null {
  if (!x || typeof x !== "object" || profondeur > 3) { erreurs.push(`${ou} : expression attendue`); return null; }
  const e = x as Record<string, unknown>;
  if ("indicateur" in e) { const s = validerSelecteur(e["indicateur"], ou, erreurs); return s ? { indicateur: s } : null; }
  if ("somme" in e) {
    if (!Array.isArray(e["somme"]) || e["somme"].length === 0 || e["somme"].length > 40) { erreurs.push(`${ou} : somme de 1 à 40 indicateurs attendue`); return null; }
    const termes = e["somme"].map((t, i) => validerSelecteur(t, `${ou}.somme[${i}]`, erreurs));
    return termes.every((t) => t !== null) ? { somme: termes as SelecteurIndicateur[] } : null;
  }
  if ("ratio" in e) {
    const r = e["ratio"];
    if (!Array.isArray(r) || r.length !== 2) { erreurs.push(`${ou} : rapport de deux expressions attendu`); return null; }
    const a = validerExpression(r[0], `${ou}.ratio[0]`, erreurs, profondeur + 1);
    const b = validerExpression(r[1], `${ou}.ratio[1]`, erreurs, profondeur + 1);
    const f = e["facteur"];
    if (f !== undefined && (typeof f !== "number" || !Number.isFinite(f) || f <= 0)) erreurs.push(`${ou} : facteur positif attendu`);
    return a && b ? { ratio: [a, b], ...(typeof f === "number" ? { facteur: f } : {}) } : null;
  }
  if ("indisponible" in e) {
    if (!texte(e["indisponible"])) { erreurs.push(`${ou} : motif d'indisponibilité attendu`); return null; }
    return { indisponible: e["indisponible"] as string };
  }
  erreurs.push(`${ou} : expression inconnue`);
  return null;
}

const decimalesValides = (x: unknown) => x === undefined || x === null || (Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 3);

export function validerDefinitionTableauDeBord(x: unknown): { ok: true; definition: DefinitionTableauDeBord } | { ok: false; erreurs: string[] } {
  const erreurs: string[] = [];
  if (!x || typeof x !== "object") return { ok: false, erreurs: ["définition attendue"] };
  const d = x as Record<string, unknown>;
  if (typeof d["pays"] !== "string" || !/^[A-Z]{2}$/.test(d["pays"])) erreurs.push("pays : code ISO à deux lettres attendu");
  const z = d["zone"] as Record<string, unknown> | undefined;
  if (!z || !texte(z["code"], 64) || !texte(z["nom"], 200)) erreurs.push("zone : code et nom attendus");
  const blocs: Bloc[] = [];
  const cles = new Set<string>();
  if (!Array.isArray(d["blocs"]) || d["blocs"].length === 0 || d["blocs"].length > 200) erreurs.push("blocs : 1 à 200 blocs attendus");
  else d["blocs"].forEach((brut, i) => {
    const b = brut as Record<string, unknown>;
    const ou = `blocs[${i}]`;
    if (!b || typeof b !== "object") { erreurs.push(`${ou} : bloc attendu`); return; }
    if (typeof b["cle"] !== "string" || !CLE.test(b["cle"]) || cles.has(b["cle"])) { erreurs.push(`${ou} : clé unique attendue`); return; }
    cles.add(b["cle"]);
    if (!(ONGLETS_TABLEAU_DE_BORD as readonly unknown[]).includes(b["onglet"])) erreurs.push(`${ou} : onglet inconnu`);
    if (!texte(b["titre"]) || !texte(b["source"])) erreurs.push(`${ou} : titre et source attendus`);
    if (!decimalesValides(b["decimales"])) erreurs.push(`${ou} : décimales de 0 à 3`);
    const commun = {
      cle: b["cle"], onglet: b["onglet"] as OngletBlocs, titre: b["titre"] as string, source: b["source"] as string,
      unite: typeof b["unite"] === "string" ? b["unite"] : null, decimales: typeof b["decimales"] === "number" ? b["decimales"] : null,
      note: typeof b["note"] === "string" ? b["note"] : null,
    };
    if (b["type"] === "chiffre") {
      const v = validerExpression(b["valeur"], `${ou}.valeur`, erreurs);
      if (v) blocs.push({ ...commun, type: "chiffre", valeur: v });
      return;
    }
    if (b["type"] === "tableau") {
      const colonnes = b["colonnes"];
      if (!Array.isArray(colonnes) || colonnes.length === 0 || colonnes.length > 12 || !colonnes.every((c) => texte(c, 120))) { erreurs.push(`${ou} : 1 à 12 colonnes attendues`); return; }
      if (!Array.isArray(b["lignes"]) || b["lignes"].length === 0 || b["lignes"].length > 60) { erreurs.push(`${ou} : 1 à 60 lignes attendues`); return; }
      if (b["graphique"] !== undefined && b["graphique"] !== null && !(GRAPHIQUES as readonly unknown[]).includes(b["graphique"])) erreurs.push(`${ou} : graphique inconnu`);
      const lignes: LigneBloc[] = [];
      (b["lignes"] as unknown[]).forEach((l, k) => {
        const li = l as Record<string, unknown>;
        if (!li || !texte(li["libelle"], 160) || !Array.isArray(li["cellules"]) || li["cellules"].length !== colonnes.length) { erreurs.push(`${ou}.lignes[${k}] : libellé et une cellule par colonne attendus`); return; }
        const cellules = (li["cellules"] as unknown[]).map((c, n) => validerExpression(c, `${ou}.lignes[${k}].cellules[${n}]`, erreurs));
        if (cellules.every((c) => c !== null)) lignes.push({ libelle: li["libelle"] as string, cellules: cellules as Expression[] });
      });
      blocs.push({ ...commun, type: "tableau", enTeteLignes: texte(b["enTeteLignes"], 120) ? b["enTeteLignes"] as string : "", colonnes: colonnes as string[], lignes, graphique: (b["graphique"] as Graphique | undefined) ?? null });
      return;
    }
    erreurs.push(`${ou} : type « chiffre » ou « tableau » attendu`);
  });
  if (erreurs.length) return { ok: false, erreurs };
  return { ok: true, definition: { pays: d["pays"] as string, zone: { code: (z!["code"] as string), nom: (z!["nom"] as string) }, blocs } };
}

// ——— Évaluation sur les indicateurs d'une zone ———

/** L'indicateur de la zone qui répond au sélecteur (milieu et sexe « ensemble » par défaut). */
export function trouverIndicateur<T extends IndicateurZone>(s: SelecteurIndicateur, indicateurs: readonly T[]): T | null {
  const modalite = s.modalite ?? null, milieu = s.milieu ?? "ensemble", sexe = s.sexe ?? "ensemble";
  return indicateurs.find((i) => i.famille === s.famille && (i.modalite ?? null) === modalite && (i.milieu ?? "ensemble") === milieu && (i.sexe ?? "ensemble") === sexe) ?? null;
}

export const MOTIF_INDICATEUR_ABSENT = "indicateur-absent";

function lire(s: SelecteurIndicateur, indicateurs: readonly IndicateurZone[]): ValeurEvaluee {
  const i = trouverIndicateur(s, indicateurs);
  if (!i) return { valeur: null, calcule: false, motif: MOTIF_INDICATEUR_ABSENT };
  if (i.valeur === null || !Number.isFinite(i.valeur)) return { valeur: null, calcule: false, motif: i.motifAbsence ?? "non-evaluee" };
  return { valeur: i.valeur, calcule: i.nature === "calcule", motif: null };
}

/** Évite les artefacts de virgule flottante d'une somme ou d'un rapport (affichage arrondi ensuite). */
const net = (x: number) => Math.round(x * 1e9) / 1e9;

export function evaluer(e: Expression, indicateurs: readonly IndicateurZone[]): ValeurEvaluee {
  if ("indisponible" in e) return { valeur: null, calcule: false, motif: e.indisponible };
  if ("indicateur" in e) return lire(e.indicateur, indicateurs);
  if ("somme" in e) {
    const termes = e.somme.map((s) => lire(s, indicateurs));
    const absent = termes.find((t) => t.valeur === null);
    // Une somme dont un terme manque n'est pas une somme partielle : elle est absente.
    if (absent) return { valeur: null, calcule: true, motif: absent.motif };
    return { valeur: net(termes.reduce((n, t) => n + (t.valeur as number), 0)), calcule: true, motif: null };
  }
  const [a, b] = [evaluer(e.ratio[0], indicateurs), evaluer(e.ratio[1], indicateurs)];
  if (a.valeur === null) return { valeur: null, calcule: true, motif: a.motif };
  if (b.valeur === null) return { valeur: null, calcule: true, motif: b.motif };
  if (b.valeur === 0) return { valeur: null, calcule: true, motif: "non-evaluee" };
  return { valeur: net((a.valeur / b.valeur) * (e.facteur ?? 1)), calcule: true, motif: null };
}

export interface BlocEvalue {
  readonly bloc: Bloc;
  /** Chiffre : une valeur ; tableau : une ligne de valeurs par ligne du bloc. */
  readonly valeurs: readonly (readonly ValeurEvaluee[])[];
  readonly calcule: boolean;
  readonly disponibles: number;
}

export function evaluerBloc(bloc: Bloc, indicateurs: readonly IndicateurZone[]): BlocEvalue {
  const valeurs = bloc.type === "chiffre" ? [[evaluer(bloc.valeur, indicateurs)]] : bloc.lignes.map((l) => l.cellules.map((c) => evaluer(c, indicateurs)));
  const toutes = valeurs.flat();
  return { bloc, valeurs, calcule: toutes.some((v) => v.calcule && v.valeur !== null), disponibles: toutes.filter((v) => v.valeur !== null).length };
}

/** Nombre au format français (espace fine insécable des milliers, virgule décimale) ; absent → null. */
export function formaterNombre(x: number | null, decimales: number | null = null, locale = "fr-FR"): string | null {
  if (x === null || !Number.isFinite(x)) return null;
  // Sans nombre de décimales déclaré : la valeur telle que publiée (au plus deux décimales, « 1,97 » enfants par femme).
  const [min, max] = decimales === null ? [0, 2] : [decimales, decimales];
  return x.toLocaleString(locale, { minimumFractionDigits: min, maximumFractionDigits: max }).replace(/[  ]/g, " ");
}

// ——— Onglet « Tableaux RGPH 2024 » : un tableau par thème, colonnes Milieu → Sexe ———

export interface ColonneVentilee { readonly milieu: Milieu; readonly sexe: Sexe; readonly libelle: string }
export interface LigneThematique { readonly famille: string; readonly modalite: string | null; readonly libelle: string; readonly unite: string | null; readonly cellules: readonly (IndicateurZone | null)[] }
export interface TableauThematique { readonly theme: string; readonly colonnes: readonly ColonneVentilee[]; readonly lignes: readonly LigneThematique[] }

/**
 * Regroupe les indicateurs d'une zone par thème (ordre reçu) ; lignes = famille et modalité, colonnes = milieu puis
 * sexe, limitées aux combinaisons présentes dans le thème. Les thèmes exclus (CEE, servie par son onglet) sont écartés.
 */
export function tableauxParTheme(indicateurs: readonly IndicateurZone[], exclus: readonly string[] = []): TableauThematique[] {
  const themes = new Map<string, IndicateurZone[]>();
  for (const i of indicateurs) {
    if (!i.famille || !i.theme || exclus.includes(i.theme)) continue;
    const l = themes.get(i.theme) ?? [];
    l.push(i);
    themes.set(i.theme, l);
  }
  return [...themes].map(([theme, liste]) => {
    const presentes = new Set(liste.map((i) => `${i.milieu ?? "ensemble"}|${i.sexe ?? "ensemble"}`));
    const colonnes: ColonneVentilee[] = MILIEUX.flatMap((m) => SEXES.filter((s) => presentes.has(`${m}|${s}`)).map((s) => ({ milieu: m, sexe: s, libelle: `${LIBELLES_MILIEU[m]} — ${LIBELLES_SEXE[s]}` })));
    const lignes = new Map<string, { famille: string; modalite: string | null; unite: string | null; parCol: Map<string, IndicateurZone> }>();
    for (const i of liste) {
      const k = `${i.famille}\u0000${i.modalite ?? ""}`;
      const l = lignes.get(k) ?? { famille: i.famille!, modalite: i.modalite ?? null, unite: i.unite, parCol: new Map() };
      const c = `${i.milieu ?? "ensemble"}|${i.sexe ?? "ensemble"}`;
      if (!l.parCol.has(c)) l.parCol.set(c, i);
      lignes.set(k, l);
    }
    return {
      theme, colonnes,
      lignes: [...lignes.values()].map((l) => ({
        famille: l.famille, modalite: l.modalite, unite: l.unite,
        libelle: l.modalite ? `${l.famille} — ${l.modalite}` : l.famille,
        cellules: colonnes.map((c) => l.parCol.get(`${c.milieu}|${c.sexe}`) ?? null),
      })),
    };
  });
}

/** Tri d'un tableau par colonne : absents toujours en fin, libellés selon le français. */
export function trierLignes<L>(lignes: readonly L[], cle: (l: L) => number | string | null, sens: "asc" | "desc"): L[] {
  const k = sens === "asc" ? 1 : -1;
  return [...lignes].sort((a, b) => {
    const x = cle(a), y = cle(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * k;
    return String(x).localeCompare(String(y), "fr") * k;
  });
}

// ——— Export CSV (séparateur point-virgule, nombres au point, absents vides avec motif) ———

const echapper = (x: string) => (/[";\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x);

export function versCsv(entetes: readonly string[], lignes: readonly (readonly (string | number | null)[])[], pied: readonly string[] = []): string {
  const l = [entetes.map(echapper).join(";"), ...lignes.map((r) => r.map((c) => (c === null ? "" : typeof c === "number" ? String(c) : echapper(c))).join(";")), ...pied.map((p) => echapper(p))];
  return `﻿${l.join("\r\n")}\r\n`;
}

// ——— Onglets et adresses ———

export const ONGLETS_GEODATA = [
  { cle: "cartes", chemin: "", libelle: "Cartes thématiques" },
  { cle: "chiffres-cles", chemin: "chiffres-cles", libelle: "Chiffres clés 2024" },
  { cle: "tableaux", chemin: "tableaux", libelle: "Tableaux RGPH 2024" },
  { cle: "cee", chemin: "cee", libelle: "CEE 2024" },
  { cle: "concepts", chemin: "concepts", libelle: "Concepts et définitions" },
] as const;
export type OngletGeoData = (typeof ONGLETS_GEODATA)[number]["cle"];

/** Onglet d'une adresse `/geodata[/…]` ; toute autre fin d'adresse revient aux cartes. */
export function ongletDeChemin(pathname: string): OngletGeoData {
  const fin = pathname.replace(/^\/geodata\/?/, "").replace(/\/+$/, "");
  return ONGLETS_GEODATA.find((o) => o.chemin === fin)?.cle ?? "cartes";
}

export function cheminOnglet(o: OngletGeoData): string {
  const c = ONGLETS_GEODATA.find((x) => x.cle === o)?.chemin ?? "";
  return c ? `/geodata/${c}` : "/geodata";
}
