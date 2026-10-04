/**
 * Éditeur guidé de scripts (D-028) — partie pure : un catalogue de gabarits de commandes courants, décrits champ par
 * champ, et leur construction en gabarit de commande du contrat (`{ type, params }`) avec les conventions des scripts :
 * un nombre littéral reste un nombre ; `=expression` est évaluée au développement ; `$nom` reprend la valeur brute d'un
 * paramètre ou d'une variable ; `{i}` s'interpole dans un texte. Une saisie qui n'est ni un nombre ni un `$nom` est
 * une expression (le `=` est ajouté). Rien n'est supposé : un champ requis vide est une erreur, pas une valeur par défaut.
 */
import type { Commande } from "../commandes/index.js";
import { ErreurScript, validerScript, type BouclePour, type ParametreScript, type ScriptAtelier } from "./scripts.js";

export type NatureChamp = "niveau" | "longueur" | "nombre" | "texte" | "coordonnee";

export interface ChampGabarit {
  /** Nom stable du champ dans le formulaire. */
  cle: string;
  libelle: string;
  nature: NatureChamp;
  requis: boolean;
  aide?: string;
}

export interface GabaritGuide {
  type: string;
  libelle: string;
  description: string;
  champs: ChampGabarit[];
}

const c = (cle: string, libelle: string, nature: NatureChamp, requis = true, aide?: string): ChampGabarit => ({ cle, libelle, nature, requis, ...(aide ? { aide } : {}) });

export const GABARITS_GUIDES: readonly GabaritGuide[] = [
  {
    type: "mur.tracer",
    libelle: "Mur",
    description: "Un mur de l'extrémité A à l'extrémité B, sur un niveau.",
    champs: [c("niveauId", "Niveau", "niveau"), c("ax", "A · x (m)", "coordonnee"), c("ay", "A · y (m)", "coordonnee"), c("bx", "B · x (m)", "coordonnee"), c("by", "B · y (m)", "coordonnee"), c("epaisseur", "Épaisseur (m)", "longueur"), c("hauteur", "Hauteur (m)", "longueur", false, "Vide : mur sans hauteur (contour seul), jamais une hauteur supposée.")],
  },
  {
    type: "poteau.creer",
    libelle: "Poteau rectangulaire",
    description: "Un poteau rectangulaire centré sur un point.",
    champs: [c("niveauId", "Niveau", "niveau"), c("x", "x (m)", "coordonnee"), c("y", "y (m)", "coordonnee"), c("largeur", "Largeur (m)", "longueur"), c("profondeur", "Profondeur (m)", "longueur"), c("hauteur", "Hauteur (m)", "longueur", false), c("nom", "Nom", "texte", false, "Les variables s'écrivent entre accolades : « Poteau {i} »."), c("angle", "Rotation (°)", "nombre", false)],
  },
  {
    type: "dalle.creer",
    libelle: "Dalle rectangulaire",
    description: "Une dalle rectangulaire depuis son coin bas gauche.",
    champs: [c("niveauId", "Niveau", "niveau"), c("x0", "Coin x (m)", "coordonnee"), c("y0", "Coin y (m)", "coordonnee"), c("lx", "Longueur en x (m)", "longueur"), c("ly", "Longueur en y (m)", "longueur"), c("epaisseur", "Épaisseur (m)", "longueur")],
  },
  {
    type: "esquisse.ligne",
    libelle: "Ligne d'esquisse",
    description: "Un segment d'esquisse de A à B.",
    champs: [c("niveauId", "Niveau", "niveau"), c("ax", "A · x (m)", "coordonnee"), c("ay", "A · y (m)", "coordonnee"), c("bx", "B · x (m)", "coordonnee"), c("by", "B · y (m)", "coordonnee")],
  },
  {
    type: "texte.creer",
    libelle: "Texte",
    description: "Un texte posé en un point.",
    champs: [c("niveauId", "Niveau", "niveau"), c("x", "x (m)", "coordonnee"), c("y", "y (m)", "coordonnee"), c("texte", "Texte", "texte")],
  },
  {
    type: "niveau.creer",
    libelle: "Niveau",
    description: "Un niveau à une altitude donnée.",
    champs: [c("nom", "Nom", "texte"), c("elevation", "Altitude (m)", "nombre"), c("hauteur", "Hauteur (m)", "nombre", false)],
  },
];

export const GABARIT_PAR_TYPE: Readonly<Record<string, GabaritGuide>> = Object.fromEntries(GABARITS_GUIDES.map((g) => [g.type, g]));

const NOMBRE = /^-?\d+(?:[.,]\d+)?$/;

/** Valeur d'un champ dans un gabarit : nombre littéral, `$nom`, `=expression` (le `=` est ajouté au besoin). */
export function valeurGabarit(saisie: string, chemin: string): number | string {
  const v = saisie.trim();
  if (!v) throw new ErreurScript(chemin, "valeur requise");
  if (NOMBRE.test(v)) return Number(v.replace(",", "."));
  if (/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(v)) return v;
  return v.startsWith("=") ? v : `=${v}`;
}

/** Corps d'expression (sans `=` ni `$`), pour composer des sommes : « x0 + lx ». */
const corps = (saisie: string) => {
  const v = saisie.trim();
  return v.startsWith("=") || v.startsWith("$") ? v.slice(1) : v.replace(",", ".");
};

const point = (x: number | string, y: number | string) => ({ x, y, frame: "local", unit: "m" });
const longueur = (v: number | string) => ({ value: v, unit: "m" });

/** Construit le gabarit de commande d'un formulaire guidé ; erreurs nominatives par champ. */
export function construireGabarit(type: string, saisies: Readonly<Record<string, string>>, chemin = "commande"): Commande {
  const g = GABARIT_PAR_TYPE[type];
  if (!g) throw new ErreurScript(chemin, `gabarit guidé inconnu : ${type}`);
  const v = (cle: string) => {
    const champ = g.champs.find((x) => x.cle === cle)!;
    const s = (saisies[cle] ?? "").trim();
    if (!s) {
      if (champ.requis) throw new ErreurScript(`${chemin}.${cle}`, `« ${champ.libelle} » requis`);
      return undefined;
    }
    if (champ.nature === "texte") return s;
    if (champ.nature === "niveau") return s; // identifiant de niveau ou $paramètre
    return valeurGabarit(s, `${chemin}.${cle}`);
  };
  const sans = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x !== undefined));
  switch (type) {
    case "mur.tracer": {
      const h = v("hauteur");
      return { type, params: sans({ niveauId: v("niveauId"), a: point(v("ax")!, v("ay")!), b: point(v("bx")!, v("by")!), epaisseur: longueur(v("epaisseur")!), hauteur: h === undefined ? undefined : longueur(h) }) };
    }
    case "poteau.creer": {
      const h = v("hauteur");
      const angle = v("angle");
      return { type, params: sans({ niveauId: v("niveauId"), point: point(v("x")!, v("y")!), formeId: "rectangle", largeur: longueur(v("largeur")!), profondeur: longueur(v("profondeur")!), hauteur: h === undefined ? undefined : longueur(h), nom: v("nom"), angle: angle === undefined ? undefined : { value: angle, unit: "deg" } }) };
    }
    case "dalle.creer": {
      for (const k of ["x0", "y0", "lx", "ly"]) v(k); // contrôle des champs requis
      const x0 = corps(saisies["x0"]!);
      const y0 = corps(saisies["y0"]!);
      const lx = corps(saisies["lx"]!);
      const ly = corps(saisies["ly"]!);
      const e = (s: string) => `=${s}`;
      return { type, params: { niveauId: v("niveauId"), contour: [point(e(x0), e(y0)), point(e(`(${x0}) + (${lx})`), e(y0)), point(e(`(${x0}) + (${lx})`), e(`(${y0}) + (${ly})`)), point(e(x0), e(`(${y0}) + (${ly})`))], trous: [], epaisseur: longueur(v("epaisseur")!) } };
    }
    case "esquisse.ligne":
      return { type, params: { niveauId: v("niveauId"), points: [point(v("ax")!, v("ay")!), point(v("bx")!, v("by")!)] } };
    case "texte.creer":
      return { type, params: { niveauId: v("niveauId"), position: point(v("x")!, v("y")!), texte: v("texte") } };
    case "niveau.creer":
      return { type, params: sans({ nom: v("nom"), elevation: v("elevation"), hauteur: v("hauteur") }) };
    default:
      throw new ErreurScript(chemin, `gabarit guidé inconnu : ${type}`);
  }
}

/** Ligne de commande d'un script guidé : un gabarit du catalogue (saisies) ou une commande libre (JSON). */
export type LigneScriptGuide = { type: string; saisies: Record<string, string> } | { libre: string };

export interface ScriptGuide {
  id: string;
  nom: string;
  description: string;
  parametres: ParametreScript[];
  pour: BouclePour[];
  commandes: LigneScriptGuide[];
}

/** Assemble et valide un script depuis l'éditeur guidé (mêmes règles que `validerScript`). */
export function assemblerScript(s: ScriptGuide): ScriptAtelier {
  const commandes = s.commandes.map((l, k) => {
    if ("libre" in l) {
      try {
        return JSON.parse(l.libre) as Commande;
      } catch {
        throw new ErreurScript(`commandes[${k}]`, "commande libre : JSON illisible");
      }
    }
    return construireGabarit(l.type, l.saisies, `commandes[${k}]`);
  });
  return validerScript({ id: s.id, nom: s.nom, description: s.description, parametres: s.parametres, pour: s.pour, commandes });
}

/** Lecture inverse : un script enregistré vers l'éditeur guidé (gabarits reconnus, sinon commande libre). */
export function versScriptGuide(script: ScriptAtelier): ScriptGuide {
  const txt = (x: unknown) => (x === undefined || x === null ? "" : typeof x === "number" ? String(x) : String(x));
  const val = (x: unknown) => (x && typeof x === "object" && "value" in (x as Record<string, unknown>) ? txt((x as Record<string, unknown>)["value"]) : txt(x));
  const commandes: LigneScriptGuide[] = script.commandes.map((cmd): LigneScriptGuide => {
    const p = cmd.params as Record<string, unknown>;
    const pt = (k: string) => (p[k] ?? {}) as Record<string, unknown>;
    try {
      switch (cmd.type) {
        case "mur.tracer":
          return { type: cmd.type, saisies: { niveauId: txt(p["niveauId"]), ax: txt(pt("a")["x"]), ay: txt(pt("a")["y"]), bx: txt(pt("b")["x"]), by: txt(pt("b")["y"]), epaisseur: val(p["epaisseur"]), hauteur: val(p["hauteur"]) } };
        case "poteau.creer":
          if (p["formeId"] !== "rectangle") break;
          return { type: cmd.type, saisies: { niveauId: txt(p["niveauId"]), x: txt(pt("point")["x"]), y: txt(pt("point")["y"]), largeur: val(p["largeur"]), profondeur: val(p["profondeur"]), hauteur: val(p["hauteur"]), nom: txt(p["nom"]), angle: val(p["angle"]) } };
        case "esquisse.ligne": {
          const pts = (p["points"] as Record<string, unknown>[] | undefined) ?? [];
          if (pts.length !== 2) break;
          return { type: cmd.type, saisies: { niveauId: txt(p["niveauId"]), ax: txt(pts[0]!["x"]), ay: txt(pts[0]!["y"]), bx: txt(pts[1]!["x"]), by: txt(pts[1]!["y"]) } };
        }
        case "texte.creer":
          return { type: cmd.type, saisies: { niveauId: txt(p["niveauId"]), x: txt(pt("position")["x"]), y: txt(pt("position")["y"]), texte: txt(p["texte"]) } };
        case "niveau.creer":
          return { type: cmd.type, saisies: { nom: txt(p["nom"]), elevation: txt(p["elevation"]), hauteur: txt(p["hauteur"]) } };
      }
    } catch {
      /* repli : commande libre */
    }
    return { libre: JSON.stringify(cmd, null, 2) };
  });
  return { id: script.id, nom: script.nom, description: script.description, parametres: script.parametres.map((x) => ({ ...x })), pour: script.pour.map((x) => ({ ...x })), commandes };
}
