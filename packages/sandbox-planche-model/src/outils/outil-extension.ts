/**
 * Outil interactif d'une extension (protocole 1.0, lot 6, permission « outil ») — machine pure, la même pour tous les
 * outils d'extension (identifiant `extension:<extension>:<outil>`).
 *
 * Un outil de la Planche est une machine synchrone ; une extension, elle, répond depuis son espace isolé. Cette machine
 * fait le lien sans rien savoir de l'extension :
 *  - `traiter` calcule l'accrochage comme les outils d'origine (`inferer`) et prépare l'événement à transmettre
 *    (`etat.emis`) ; elle ne modifie jamais le dessin — l'extension le fait par `planche.modele.*`, dans une opération ;
 *  - la Planche transmet l'événement, reçoit la **description** rendue par l'outil, la relit (`lireDescriptionOutil`)
 *    et la pose dans l'état (`avecDescription`) ;
 *  - `vue` traduit la description en ce que la Planche dessine. L'outil ne dessine jamais lui-même dans la vue.
 *
 * Événements transmis (`outil.<outil>.<evenement>`) : activation, desactivation, pause, reprise, annulation,
 * deplacement, appui, relachement, clic, double-clic, touche, validation, saisie. Un événement de souris porte
 * `{ point: [x, y, z], nature, objet }` : le point accroché, sa nature (sommet, milieu, arete, face, axe, origine,
 * intersection, centre, libre) et l'objet touché, ou `null`. (1.3) Il porte aussi `vise` : le point visé avant tout
 * accrochage, intersection du rayon du pointeur avec le plan de travail (le sol du repère à défaut), ou `null` quand
 * le rayon lui est parallèle ou le regarde de dos.
 *
 * Description rendue par l'outil (tout est facultatif ; `null` ou rien = la description précédente reste) :
 *   apercu     { segments: [[a, b]…], pointilles: [[a, b]…], points: [p…], contours: [[p…]…], textes: [{ point, texte }…] }
 *   etat       texte de la barre d'état
 *   saisie     { libelle, valeur } — libellé et valeur de la zone de saisie ; absent = zone inactive
 *   curseur    « croix », « fleche », « main » ou « cible »
 *   reference  point de départ de l'accrochage (axes, parallèles), d'ordinaire le dernier point cliqué
 */
import { type Inference, etatOutil, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import type { Vec3 } from "../vecteur.js";
import { axesDeSaisie, contexteSaisie } from "./commun-formes.js";
import type { ContexteOutil, EvenementOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

export const PREFIXE_OUTIL_EXTENSION = "extension:";
/** Teinte de l'aperçu d'un outil d'extension (image validée le 26 novembre 2026) : il se distingue des outils d'origine. */
export const TEINTE_APERCU_EXTENSION = "#b5852d";
const MOTIF_CLE_OUTIL = /^extension:([a-z0-9][a-z0-9-]*):([a-z][a-z0-9]*(?:-[a-z0-9]+)*)$/;
export const cleOutilExtension = (extension: string, outil: string): string => `${PREFIXE_OUTIL_EXTENSION}${extension}:${outil}`;
export function lireCleOutilExtension(id: string): { readonly extension: string; readonly outil: string } | null {
  const m = MOTIF_CLE_OUTIL.exec(id);
  return m ? { extension: m[1]!, outil: m[2]! } : null;
}

export const CURSEURS_OUTIL = ["croix", "fleche", "main", "cible"] as const;
export type CurseurOutil = (typeof CURSEURS_OUTIL)[number];
export const estCurseurOutil = (v: unknown): v is CurseurOutil => typeof v === "string" && (CURSEURS_OUTIL as readonly string[]).includes(v);

export const EVENEMENTS_OUTIL = ["activation", "desactivation", "pause", "reprise", "annulation", "deplacement", "appui", "relachement", "clic", "double-clic", "touche", "validation", "saisie"] as const;
export type EvenementOutilExtension = (typeof EVENEMENTS_OUTIL)[number];
/** Nom de l'appel adressé à l'extension pour un événement de son outil. */
export const nomAppelOutil = (outil: string, evenement: EvenementOutilExtension): string => `outil.${outil}.${evenement}`;

export const BORNES_OUTIL = {
  segments: 400,
  points: 200,
  contours: 100,
  /** Sommets d'un contour. */
  sommets: 200,
  textes: 40,
  texte: 80,
  etat: 240,
  libelle: 40,
  valeur: 40,
  /** Valeur absolue d'une coordonnée, en mètres. */
  coordonnee: 1_000_000,
  /** Délai d'un événement d'outil (décision du 25 novembre 2026 : 1 s par événement). */
  delaiMs: 1000,
} as const;

export interface DescriptionOutil {
  readonly segments: readonly (readonly [Vec3, Vec3])[];
  readonly pointilles: readonly (readonly [Vec3, Vec3])[];
  readonly points: readonly Vec3[];
  readonly contours: readonly (readonly Vec3[])[];
  readonly textes: readonly { readonly point: Vec3; readonly texte: string }[];
  readonly etat: string | null;
  readonly saisie: { readonly libelle: string; readonly valeur: string } | null;
  readonly curseur: CurseurOutil | null;
  readonly reference: Vec3 | null;
}
export const DESCRIPTION_OUTIL_VIDE: DescriptionOutil = { segments: [], pointilles: [], points: [], contours: [], textes: [], etat: null, saisie: null, curseur: null, reference: null };

export type LectureDescription = { readonly ok: true; readonly description: DescriptionOutil | null } | { readonly ok: false; readonly detail: string };

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const point = (v: unknown): Vec3 | null => {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((c) => typeof c === "number" && Number.isFinite(c) && Math.abs(c) <= BORNES_OUTIL.coordonnee)) return null;
  return { x: v[0] as number, y: v[1] as number, z: v[2] as number };
};
const texte = (v: unknown, max: number): string | null => (typeof v === "string" && v.length <= max ? v : null);

/**
 * Relit la description rendue par un outil d'extension. `null` ou rien : la description précédente reste (`description:
 * null`). Tout ce qui n'a pas la forme attendue ou dépasse les bornes refuse la description entière.
 */
export function lireDescriptionOutil(v: unknown): LectureDescription {
  if (v === null || v === undefined) return { ok: true, description: null };
  if (!estObjet(v)) return { ok: false, detail: "description : objet attendu" };
  for (const cle of Object.keys(v)) if (!["apercu", "etat", "saisie", "curseur", "reference"].includes(cle)) return { ok: false, detail: `description : champ inconnu « ${cle.slice(0, 40)} »` };
  const a = v["apercu"] ?? {};
  if (!estObjet(a)) return { ok: false, detail: "apercu : objet attendu" };
  for (const cle of Object.keys(a)) if (!["segments", "pointilles", "points", "contours", "textes"].includes(cle)) return { ok: false, detail: `apercu : champ inconnu « ${cle.slice(0, 40)} »` };
  const liste = (cle: string, max: number): readonly unknown[] | null => {
    const l = a[cle] ?? [];
    return Array.isArray(l) && l.length <= max ? l : null;
  };
  const paires = (cle: "segments" | "pointilles"): readonly (readonly [Vec3, Vec3])[] | null => {
    const l = liste(cle, BORNES_OUTIL.segments);
    if (!l) return null;
    const lus: (readonly [Vec3, Vec3])[] = [];
    for (const s of l) {
      const p = Array.isArray(s) && s.length === 2 ? [point(s[0]), point(s[1])] : null;
      if (!p || !p[0] || !p[1]) return null;
      lus.push([p[0], p[1]]);
    }
    return lus;
  };
  const segments = paires("segments");
  const pointilles = paires("pointilles");
  if (!segments || !pointilles) return { ok: false, detail: `apercu : segments et pointilles sont des listes de [point, point], ${BORNES_OUTIL.segments} au plus` };
  const points = liste("points", BORNES_OUTIL.points)?.map(point) ?? null;
  if (!points || points.some((p) => p === null)) return { ok: false, detail: `apercu.points : liste de [x, y, z], ${BORNES_OUTIL.points} au plus` };
  const contours = liste("contours", BORNES_OUTIL.contours)?.map((c) => (Array.isArray(c) && c.length >= 2 && c.length <= BORNES_OUTIL.sommets ? c.map(point) : null)) ?? null;
  if (!contours || contours.some((c) => c === null || c.some((p) => p === null))) return { ok: false, detail: `apercu.contours : listes de 2 à ${BORNES_OUTIL.sommets} points, ${BORNES_OUTIL.contours} au plus` };
  const textes = liste("textes", BORNES_OUTIL.textes)?.map((x) => {
    const p = estObjet(x) ? point(x["point"]) : null;
    const t = estObjet(x) ? texte(x["texte"], BORNES_OUTIL.texte) : null;
    return p && t !== null ? { point: p, texte: t } : null;
  }) ?? null;
  if (!textes || textes.some((x) => x === null)) return { ok: false, detail: `apercu.textes : liste de { point, texte }, ${BORNES_OUTIL.textes} au plus, ${BORNES_OUTIL.texte} caractères par texte` };
  const etat = v["etat"] === undefined || v["etat"] === null ? null : texte(v["etat"], BORNES_OUTIL.etat);
  if (v["etat"] !== undefined && v["etat"] !== null && etat === null) return { ok: false, detail: `etat : texte de ${BORNES_OUTIL.etat} caractères au plus` };
  let saisie: DescriptionOutil["saisie"] = null;
  if (v["saisie"] !== undefined && v["saisie"] !== null) {
    const s = v["saisie"];
    const libelle = estObjet(s) ? texte(s["libelle"], BORNES_OUTIL.libelle) : null;
    const valeur = estObjet(s) ? texte(s["valeur"] ?? "", BORNES_OUTIL.valeur) : null;
    if (libelle === null || libelle === "" || valeur === null) return { ok: false, detail: `saisie : { libelle, valeur }, ${BORNES_OUTIL.libelle} caractères au plus chacun` };
    saisie = { libelle, valeur };
  }
  const curseur = v["curseur"] ?? null;
  if (curseur !== null && !estCurseurOutil(curseur)) return { ok: false, detail: `curseur : ${CURSEURS_OUTIL.join(", ")}` };
  const reference = v["reference"] === undefined || v["reference"] === null ? null : point(v["reference"]);
  if (v["reference"] !== undefined && v["reference"] !== null && reference === null) return { ok: false, detail: "reference : [x, y, z]" };
  return {
    ok: true,
    description: { segments, pointilles, points: points as Vec3[], contours: contours as Vec3[][], textes: textes as { point: Vec3; texte: string }[], etat, saisie, curseur, reference },
  };
}

/** Événement à transmettre à l'extension ; `n` avance à chaque émission. */
export interface EmissionOutil {
  readonly n: number;
  readonly nom: EvenementOutilExtension;
  readonly donnees: Readonly<Record<string, unknown>>;
}

export interface EtatOutilExtension {
  readonly inference: Inference | null;
  readonly description: DescriptionOutil;
  readonly emis: EmissionOutil | null;
}

const NATURES: Readonly<Partial<Record<Inference["type"], string>>> = {
  extremite: "sommet",
  milieu: "milieu",
  "sur-arete": "arete",
  "sur-face": "face",
  "axe-x": "axe",
  "axe-y": "axe",
  "axe-z": "axe",
  origine: "origine",
  intersection: "intersection",
  centre: "centre",
};
/** Ce qu'un événement de souris dit à l'outil : le point accroché, sa nature, l'objet touché. */
export const pointeDe = (i: Inference): { readonly point: readonly [number, number, number]; readonly nature: string; readonly objet: string | null } => ({
  point: [i.point.x, i.point.y, i.point.z],
  nature: NATURES[i.type] ?? "libre",
  objet: i.entite ?? null,
});

const initial = (): EtatOutilExtension => ({ inference: null, description: DESCRIPTION_OUTIL_VIDE, emis: null });
const emettre = (e: EtatOutilExtension, nom: EvenementOutilExtension, donnees: Readonly<Record<string, unknown>>, inference: Inference | null = e.inference): Transition<EtatOutilExtension> => ({
  etat: { ...e, inference, emis: { n: (e.emis?.n ?? 0) + 1, nom, donnees } },
});

/** (1.3) Point visé : le rayon coupe le plan de travail (le plan z = 0 à défaut) devant la caméra ; `null` sinon. */
export function pointVise(rayon: Rayon, plan: { readonly origine: Vec3; readonly normale: Vec3 } | undefined): readonly [number, number, number] | null {
  const o = plan?.origine ?? { x: 0, y: 0, z: 0 };
  const n = plan?.normale ?? { x: 0, y: 0, z: 1 };
  const d = rayon.direction;
  const den = d.x * n.x + d.y * n.y + d.z * n.z;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((o.x - rayon.origine.x) * n.x + (o.y - rayon.origine.y) * n.y + (o.z - rayon.origine.z) * n.z) / den;
  if (!Number.isFinite(t) || t < 0) return null;
  return [rayon.origine.x + t * d.x, rayon.origine.y + t * d.y, rayon.origine.z + t * d.z];
}

function accrocher(e: EtatOutilExtension, ctx: ContexteOutil, rayon: Rayon, tolerance: number): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele, etatOutil(ctx)), ...(e.description.reference ? { depart: e.description.reference } : {}), ...axesDeSaisie(ctx) });
}

function traiter(e: EtatOutilExtension, ev: EvenementOutil, ctx: ContexteOutil): Transition<EtatOutilExtension> {
  switch (ev.genre) {
    case "survol":
    case "glisser": {
      const i = accrocher(e, ctx, ev.rayon, ev.tolerance);
      return emettre(e, "deplacement", { ...pointeDe(i), vise: pointVise(ev.rayon, ctx.planDeTravail), appuye: ev.genre === "glisser" }, i);
    }
    case "clic": {
      const i = accrocher(e, ctx, ev.rayon, ev.tolerance);
      return emettre(e, ev.double ? "double-clic" : "clic", { ...pointeDe(i), vise: pointVise(ev.rayon, ctx.planDeTravail) }, i);
    }
    case "appui":
    case "relache": {
      const i = accrocher(e, ctx, ev.rayon, ev.tolerance);
      return emettre(e, ev.genre === "appui" ? "appui" : "relachement", { ...pointeDe(i), vise: pointVise(ev.rayon, ctx.planDeTravail) }, i);
    }
    case "touche":
      if (ev.touche === "Entree") return ev.etat === "enfoncee" ? emettre(e, "validation", {}) : { etat: e };
      return emettre(e, "touche", { touche: ev.touche, etat: ev.etat });
    case "saisie": {
      // La valeur saisie est donnée telle quelle, et lue comme une longueur (mètres) quand elle en est une.
      const lu = analyserSaisie(ev.texte, contexteSaisie("longueur", ctx));
      return emettre(e, "saisie", { texte: ev.texte.slice(0, 200), longueur: lu.genre === "longueur" ? lu.valeur : null });
    }
    case "echap":
      return emettre(e, "annulation", {});
  }
}

function vue(e: EtatOutilExtension, ctx: ContexteOutil): VueOutil {
  const d = e.description;
  return {
    consigne: d.etat ?? "",
    mesures: d.saisie ? { libelle: d.saisie.libelle, valeur: d.saisie.valeur, saisie: contexteSaisie("texte", ctx) } : null,
    inference: e.inference,
    apercu: {
      lignes: [...d.segments, ...d.contours.map((c) => [...c, c[0]!])],
      faces: [],
      points: d.points,
      pointilles: d.pointilles,
      etiquettes: d.textes,
      teinte: TEINTE_APERCU_EXTENSION,
    },
    selection: ctx.selection,
    survol: [],
    erreur: null,
  };
}

export const MACHINE_OUTIL_EXTENSION: MachineOutil<EtatOutilExtension> = { id: "extension", initial, traiter, vue };

/** Pose dans l'état la description rendue par l'outil (`null` = la précédente reste). */
export const avecDescription = (e: EtatOutilExtension, description: DescriptionOutil | null): EtatOutilExtension => (description ? { ...e, description } : e);
