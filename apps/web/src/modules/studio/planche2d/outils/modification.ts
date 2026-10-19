/**
 * Outils de modification (famille Modification) : Déplacer au pointeur (point de base puis destination, accroché hors
 * sélection) ; aide de Décaler (saisie de la distance, sans pointeur) ; transformations de la sélection, au pointeur
 * avec aperçu ou par la saisie numérique (mêmes constructeurs de commandes) :
 * - Copier (D) : point de base puis destination ; « Copies » copies en série (`studio.dessin.copier`) ;
 * - Rotation (Maj+R) : centre, point de référence, puis point cible ; l'angle saisi est en degrés, la commande en
 *   radians (`studio.dessin.rotation`) ;
 * - Symétrie (I) : deux points de l'axe ; « Conserver l'original » garde la source (`studio.dessin.symetrie`) ;
 * - Échelle (S) : centre, point de référence, puis point cible (facteur = rapport des distances au centre) ;
 *   « Volumes aussi » multiplie aussi les extrusions (`studio.dessin.echelle`).
 * Pur : ni React ni DOM ; les identifiants des copies dérivent d'un préfixe neuf (`nouvelId`).
 */
import type { StudioCommand, StudioPoint } from "@parcours/atelier-model";
import type { StudioToolId } from "../raccourcis";
import { AIDE_DEFAUT, ecart, ERREUR_POINTS_CONFONDUS, memePoint, micro, type ActionOutil, type ContexteClic, type ContexteCreation, type EtatTrace, type OptionsTransformation, type OutilPlanche } from "./type";

export type { OptionsTransformation };

export const OUTIL_DEPLACER: OutilPlanche = {
  ids: ["studio.dessin.deplacer"],
  horsSelection: true,
  clic(e, p) {
    const a = e.trace.point, b = p.point;
    return { type: "deplacer", dx: ecart(a.x, b.x), dy: ecart(a.y, b.y) };
  },
  aideTrace: () => "Point de base placé. Cliquez la destination. Échap pour annuler.",
  aideRepos: (e) => (e.moveWithPointer ? "Cliquez un point de base puis sa destination, ou saisissez le déplacement." : AIDE_DEFAUT),
};

export const AIDE_DECALER = "Sélectionnez un objet, saisissez la distance (positive : à gauche d’une ligne, vers l’extérieur d’une forme fermée, d’un cercle ou d’un arc), puis décalez.";

// ——— Transformations de la sélection ———

export type IdTransformation = "studio.dessin.copier" | "studio.dessin.rotation" | "studio.dessin.symetrie" | "studio.dessin.echelle";
export const OUTILS_TRANSFORMATION: ReadonlySet<StudioToolId> = new Set<StudioToolId>(["studio.dessin.copier", "studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle"]);
export const estTransformation = (t: StudioToolId): t is IdTransformation => OUTILS_TRANSFORMATION.has(t);

export const OPTIONS_DEFAUT: OptionsTransformation = { copies: 1, garder: true, volumes: false };

/** Contexte d'une transformation : sélection courante (objets et cotes) et options saisies. */
export interface ContexteTransformation extends ContexteCreation {
  selection: readonly string[];
  options: OptionsTransformation;
}

const ERREUR_SELECTION = "Sélectionnez d’abord les objets à transformer.";
const lot = (c: StudioCommand): ActionOutil => ({ type: "commandes", commandes: [c], apres: "annuler-trace" });
/** Préfixe neuf des identifiants de copies (le modèle en dérive `préfixe-rang-indice`, déterministes). */
const prefixe = (c: ContexteCreation) => c.nouvelId();

export function commandeCopier(c: ContexteTransformation, dx: number, dy: number): ActionOutil {
  if (!c.selection.length) return { type: "erreur", message: ERREUR_SELECTION };
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return { type: "erreur", message: "Saisissez un déplacement non nul, en mètres." };
  const copies = c.options.copies;
  if (!Number.isInteger(copies) || copies < 1 || copies > 1000) return { type: "erreur", message: "Le nombre de copies est un entier de 1 à 1000." };
  return lot({ toolId: "studio.dessin.copier", params: { ids: [...c.selection], dx, dy, copies, prefix: prefixe(c) } });
}

/** Rotation de `degres` (sens trigonométrique) autour de `centre` ; convertie en radians pour la commande. */
export function commandeRotation(c: ContexteTransformation, centre: StudioPoint, degres: number): ActionOutil {
  if (!c.selection.length) return { type: "erreur", message: ERREUR_SELECTION };
  if (!Number.isFinite(degres) || degres % 360 === 0) return { type: "erreur", message: "Saisissez un angle non nul (hors multiple de 360°), en degrés." };
  return lot({ toolId: "studio.dessin.rotation", params: { ids: [...c.selection], center: { ...centre }, angle: (degres * Math.PI) / 180 } });
}

export function commandeSymetrie(c: ContexteTransformation, a: StudioPoint, b: StudioPoint): ActionOutil {
  if (!c.selection.length) return { type: "erreur", message: ERREUR_SELECTION };
  if (memePoint(a, b)) return { type: "erreur", message: "Les deux points de l’axe doivent être distincts." };
  const base = { ids: [...c.selection], axisStart: { ...a }, axisEnd: { ...b } };
  return lot({ toolId: "studio.dessin.symetrie", params: c.options.garder ? { ...base, keepSource: true, prefix: prefixe(c) } : { ...base, keepSource: false } });
}

export function commandeEchelle(c: ContexteTransformation, centre: StudioPoint, facteur: number): ActionOutil {
  if (!c.selection.length) return { type: "erreur", message: ERREUR_SELECTION };
  if (!(Number.isFinite(facteur) && facteur > 0)) return { type: "erreur", message: "Le facteur doit être strictement positif." };
  return lot({ toolId: "studio.dessin.echelle", params: { ids: [...c.selection], center: { ...centre }, factor: facteur, includeVolumes: c.options.volumes } });
}

/** Angle orienté (degrés, au micro-degré) de la référence `r` vers la cible `t` autour de `c`. */
export function angleDegres(c: StudioPoint, r: StudioPoint, t: StudioPoint): number {
  let d = ((Math.atan2(t.y - c.y, t.x - c.x) - Math.atan2(r.y - c.y, r.x - c.x)) * 180) / Math.PI;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return micro(d);
}
/** Facteur (au millionième) : distance de la cible au centre sur distance de la référence au centre. */
export const facteurPoints = (c: StudioPoint, r: StudioPoint, t: StudioPoint): number => micro(Math.hypot(t.x - c.x, t.y - c.y) / Math.hypot(r.x - c.x, r.y - c.y));

/** Champs de la saisie numérique des transformations (mètres, degrés, facteur ; cases à cocher 0 / 1). */
export interface SaisieTransformation {
  x: number; y: number; a: number; b: number; dx: number; dy: number;
  angle: number; facteur: number; copies: number; garder: number; volumes: number;
}
export type CleTransformation = keyof SaisieTransformation;
/** Champs affichés par outil, dans l'ordre. */
export const CHAMPS_TRANSFORMATION: Record<IdTransformation, readonly CleTransformation[]> = {
  "studio.dessin.copier": ["dx", "dy", "copies"],
  "studio.dessin.rotation": ["x", "y", "angle"],
  "studio.dessin.symetrie": ["x", "y", "a", "b", "garder"],
  "studio.dessin.echelle": ["x", "y", "facteur", "volumes"],
};
/** Cases à cocher (valeur 0 ou 1) plutôt que champs numériques. */
export const CASES_TRANSFORMATION: ReadonlySet<CleTransformation> = new Set(["garder", "volumes"]);
export function libelleTransformation(t: IdTransformation, k: CleTransformation): string {
  if (t === "studio.dessin.symetrie") {
    const axe = { x: "Axe : X du premier point", y: "Axe : Y du premier point", a: "Axe : X du second point", b: "Axe : Y du second point" } as Partial<Record<CleTransformation, string>>;
    if (axe[k]) return axe[k]!;
  }
  return ({ x: "Centre X", y: "Centre Y", a: "X", b: "Y", dx: "Déplacement X", dy: "Déplacement Y", angle: "Angle (°)", facteur: "Facteur", copies: "Copies", garder: "Conserver l’original", volumes: "Volumes aussi (extrusions)" } as const)[k];
}
export const BOUTONS_TRANSFORMATION: Record<IdTransformation, string> = {
  "studio.dessin.copier": "Copier la sélection",
  "studio.dessin.rotation": "Tourner la sélection",
  "studio.dessin.symetrie": "Symétrie de la sélection",
  "studio.dessin.echelle": "Mettre la sélection à l’échelle",
};
export const optionsDeSaisie = (v: Pick<SaisieTransformation, "copies" | "garder" | "volumes">): OptionsTransformation => ({ copies: v.copies, garder: v.garder !== 0, volumes: v.volumes !== 0 });

/** Saisie numérique d'une transformation : mêmes commandes que le pointeur. */
export function soumettreTransformation(t: IdTransformation, v: SaisieTransformation, selection: readonly string[], c: ContexteCreation): ActionOutil {
  const ct: ContexteTransformation = { ...c, selection, options: optionsDeSaisie(v) };
  switch (t) {
    case "studio.dessin.copier": return commandeCopier(ct, v.dx, v.dy);
    case "studio.dessin.rotation": return commandeRotation(ct, { x: v.x, y: v.y }, v.angle);
    case "studio.dessin.symetrie": return commandeSymetrie(ct, { x: v.x, y: v.y }, { x: v.a, y: v.b });
    case "studio.dessin.echelle": return commandeEchelle(ct, { x: v.x, y: v.y }, v.facteur);
  }
}

const contexte = (c: ContexteClic): ContexteTransformation => ({ ...c, selection: c.selection ?? [], options: c.options ?? OPTIONS_DEFAUT });

/** Action d'un clic, ou de l'aperçu (`fin` : point survolé), d'une transformation au pointeur. */
function transformationAuPointeur(e: EtatTrace & { trace: { point: StudioPoint } }, fin: StudioPoint, cc: ContexteClic): ActionOutil {
  const c = contexte(cc);
  const a = e.trace.point;
  switch (e.outil) {
    case "studio.dessin.copier":
      return memePoint(a, fin) ? { type: "erreur", message: ERREUR_POINTS_CONFONDUS } : commandeCopier(c, ecart(a.x, fin.x), ecart(a.y, fin.y));
    case "studio.dessin.symetrie":
      return commandeSymetrie(c, a, fin);
    case "studio.dessin.rotation":
    case "studio.dessin.echelle": {
      const ref = e.suite[0];
      if (memePoint(a, fin)) return { type: "erreur", message: "Le point doit être distinct du centre." };
      if (!ref) return { type: "sommet", suite: [{ ...fin }] };
      return e.outil === "studio.dessin.rotation" ? commandeRotation(c, a, angleDegres(a, ref, fin)) : commandeEchelle(c, a, facteurPoints(a, ref, fin));
    }
    default:
      return { type: "erreur", message: AIDE_DEFAUT };
  }
}

const AIDES_TRACE: Record<IdTransformation, (n: number) => string> = {
  "studio.dessin.copier": () => "Point de base placé. Cliquez la destination de la copie. Échap pour annuler.",
  "studio.dessin.rotation": (n) => (n === 0 ? "Centre placé. Cliquez un point de référence." : "Cliquez la direction cible : l’aperçu montre la rotation. Échap pour annuler."),
  "studio.dessin.symetrie": () => "Premier point de l’axe placé. Cliquez le second point de l’axe. Échap pour annuler.",
  "studio.dessin.echelle": (n) => (n === 0 ? "Centre placé. Cliquez un point de référence." : "Cliquez le point cible : facteur = distance au centre de la cible sur celle de la référence. Échap pour annuler."),
};
const AIDES_REPOS: Record<IdTransformation, string> = {
  "studio.dessin.copier": "Cliquez un point de base puis sa destination, ou saisissez le déplacement et le nombre de copies.",
  "studio.dessin.rotation": "Cliquez le centre, un point de référence puis la direction cible, ou saisissez le centre et l’angle (degrés).",
  "studio.dessin.symetrie": "Cliquez deux points de l’axe de symétrie, ou saisissez-les ; cochez « Conserver l’original » pour garder la source.",
  "studio.dessin.echelle": "Cliquez le centre, un point de référence puis le point cible, ou saisissez le centre et le facteur.",
};

const outilTransformation = (ids: readonly IdTransformation[], horsSelection: boolean): OutilPlanche => ({
  ids,
  horsSelection,
  clic: (e, p, c) => transformationAuPointeur(e, p.point, c),
  apercuCommandes(e, fin, c) {
    const r = transformationAuPointeur(e, fin, c);
    return r.type === "commandes" ? r.commandes : null;
  },
  aideTrace: (e) => AIDES_TRACE[e.outil as IdTransformation](e.suite.length),
  aideRepos: (e) => (e.moveWithPointer ? AIDES_REPOS[e.outil as IdTransformation] : "Sélectionnez d’abord les objets à transformer (clic, Maj + clic ou rectangle)."),
});
/** Copier : la destination s'accroche hors sélection (comme Déplacer). */
export const OUTIL_COPIER = outilTransformation(["studio.dessin.copier"], true);
/** Rotation, Symétrie, Échelle : centre, axe ou référence peuvent s'accrocher à la sélection. */
export const OUTIL_TRANSFORMATIONS = outilTransformation(["studio.dessin.rotation", "studio.dessin.symetrie", "studio.dessin.echelle"], false);
