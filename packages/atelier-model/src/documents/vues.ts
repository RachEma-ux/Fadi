/**
 * Vues générées depuis le modèle typé à une révision (cahier §5.9, fiches DA-01-12, DA-14-02) : plan par niveau
 * (hauteur de coupe réglable), coupe (plan vertical quelconque), façade (projection avec visibilité par faces),
 * plan de masse avec la parcelle (conversion de repères explicite) et détail à l'échelle (plan découpé par un cadre).
 *
 * Une vue est une définition du modèle (`vue.creer`) : ses paramètres sont canoniques, le dessin est dérivé. Chaque
 * génération rend ses objets référencés et une empreinte de ses entrées : même modèle, même vue, mêmes primitives
 * et même empreinte (reproductibilité). Rien n'est inventé : une hauteur absente ne produit aucun volume, un sens
 * d'ouverture de porte non renseigné est dessiné selon la convention de l'Atelier et signalé ; renseigné, il est suivi (D-037).
 */
import { pointsPolyligne, aireNette, centroide, facesMur, hoteOuverture, longueurAxeMur, normalise, perp, pointsArc, pointsEllipse, pointsSpline, sub, type Vec } from "../geometrie.js";
import type { Definition, ModeleAtelier, Niveau, Occurrence, OccurrenceQuelconque } from "../modele.js";
import { niveauxOrdonnes } from "../modele.js";
import { lignesHachure, motifHachure, pointsHachure } from "../hachures.js";
import { contenuPlace, contoursArchitecture } from "../blocs-places.js";
import { etendueMur, geometrieToiture, maillageObjet, type Maillage } from "../projection/maillage.js";
import { traitsMenuiseriePlan } from "../menuiserie.js";
import { polygoneMurRaccorde } from "../raccords.js";
import { battantPorte, symbolePorte } from "../ouvrants.js";
import { separationsCouches } from "../compositions.js";
import { extremitesCotation } from "../references.js";
import type { Angle, Longueur, Point2 } from "../unites.js";
import { ErreurCommande, lire } from "../commandes/base.js";
import { bornesPrimitives, decouper, type Bornes, type Primitive, type Remplissage, type Trait } from "./dessin.js";
import { empreinteDe } from "./empreinte.js";
import { contoursUnion, projeterMaillages, type Camera, type ResultatProjection } from "./visibilite.js";

export type TypeVue = "plan" | "coupe" | "facade" | "masse" | "detail" | "axonometrie";
export const TYPES_VUE: readonly TypeVue[] = ["plan", "coupe", "facade", "masse", "detail", "axonometrie"];
export type Orientation = "nord" | "sud" | "est" | "ouest";
export const ORIENTATIONS: readonly Orientation[] = ["nord", "sud", "est", "ouest"];
/** Phases de projet (DA-21 / lot 5) : un objet sans phase est dessiné dans toutes les vues. */
export type Phase = "existant" | "nouveau" | "a-demolir";
export const PHASES: readonly Phase[] = ["existant", "nouveau", "a-demolir"];
export type FiltrePhase = Phase | "sans-phase";

/**
 * Hauteur de coupe des plans par défaut, au-dessus du niveau (cahier §5.9 : 1,00 m « à confirmer dans la fiche ») —
 * convention de dessin réglable vue par vue, pas une donnée du projet (décision D-017).
 */
export const HAUTEUR_COUPE_DEFAUT = 1;
export const ECHELLES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 200, 250, 500, 1000, 2000] as const;

export interface ParamsVue {
  type: TypeVue;
  titre: string;
  /** Dénominateur de l'échelle (1:N). */
  echelle: number;
  /** Plan, détail : niveau dessiné. */
  niveauId: string | null;
  /** Plan, détail : hauteur du plan de coupe au-dessus du niveau. */
  hauteurCoupe: Longueur | null;
  /** Coupe : trace du plan de coupe (repère local) ; on regarde vers la gauche de a → b. */
  ligneA: Point2 | null;
  ligneB: Point2 | null;
  /** Coupe : profondeur vue au-delà du plan ; null = sans limite. */
  profondeur: Longueur | null;
  /** Façade : côté regardé (nord = la façade tournée vers le nord du quadrillage du repère local). */
  orientation: Orientation | null;
  /** Détail : cadre (repère local). */
  cadreMin: Point2 | null;
  cadreMax: Point2 | null;
  /** Coupe, façade : dessiner aussi les arêtes cachées (tirets). */
  lignesCachees: boolean;
  /** Phases dessinées ; null = toutes. */
  phases: FiltrePhase[] | null;
  /**
   * Annotations propres à la vue (coupes, façades surtout), dans le repère du dessin en mètres : abscisse le long
   * de la vue, ordonnée = altitude pour une coupe ou une façade. Absent = aucune.
   */
  annotations?: AnnotationVue[];
  /**
   * Axonométrie (D-048) : direction d'où l'on regarde — azimut (degrés, depuis l'axe x local, sens direct) et
   * inclinaison au-dessus de l'horizontale ; projection parallèle, arêtes cachées au choix.
   */
  azimut?: Angle | null;
  inclinaison?: Angle | null;
  /** Calques masqués dans cette vue seulement (D-057), en plus des calques masqués du projet. Absent = aucun. */
  calquesMasques?: string[];
}

export type AnnotationVue =
  | { id: string; type: "texte"; position: { x: number; y: number }; texte: string }
  | { id: string; type: "cote"; a: { x: number; y: number }; b: { x: number; y: number }; decalage: number };

const lirePointDessin = (b: Brut, cle: string, chemin: string): { x: number; y: number } => {
  const v = b[cle] as Brut | undefined;
  const x = v && typeof v === "object" ? v["x"] : undefined;
  const y = v && typeof v === "object" ? v["y"] : undefined;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e6 || Math.abs(y) > 1e6) throw new ErreurCommande("invalide", `${chemin}.${cle}`, "point { x, y } du dessin attendu (m)");
  return { x, y };
};

/** Lecture validée d'une annotation de vue. */
export function lireAnnotationVue(b: Brut, chemin = "annotation"): AnnotationVue {
  const id = lire.chaine(b, "id");
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new ErreurCommande("invalide", `${chemin}.id`, "identifiant d'annotation invalide");
  const type = lire.enumeration(b, "type", ["texte", "cote"] as const);
  if (type === "texte") {
    const texte = lire.chaine(b, "texte").trim();
    if (!texte || texte.length > 200) throw new ErreurCommande("invalide", `${chemin}.texte`, "texte requis (200 caractères au plus)");
    return { id, type, position: lirePointDessin(b, "position", chemin), texte };
  }
  const a = lirePointDessin(b, "a", chemin);
  const bb = lirePointDessin(b, "b", chemin);
  if (Math.hypot(bb.x - a.x, bb.y - a.y) < 0.001) throw new ErreurCommande("invalide", `${chemin}.b`, "cote de longueur nulle");
  const decalage = typeof b["decalage"] === "number" && Number.isFinite(b["decalage"]) ? (b["decalage"] as number) : 0.5;
  return { id, type, a, b: bb, decalage };
}

type Brut = Record<string, unknown>;

/** Lecture validée des paramètres d'une vue (commandes `vue.creer` / `vue.modifier`). */
export function lireParamsVue(etat: ModeleAtelier, p: Brut): ParamsVue {
  const type = lire.enumeration(p, "type", TYPES_VUE);
  const titre = lire.chaine(p, "titre").trim();
  if (!titre) throw new ErreurCommande("invalide", "titre", "titre de vue requis");
  const echelle = lire.nombre(p, "echelle", { min: 1, max: 5000 })!;
  const niveauId = lire.chaineOuNull(p, "niveauId");
  if (niveauId !== null && !etat.niveaux[niveauId]) throw new ErreurCommande("precondition", "niveauId", `niveau inconnu : ${niveauId}`);
  const hauteurCoupe = lire.longueur(p, "hauteurCoupe", { optionnel: true, strict: true });
  const ligneA = lire.point(p, "ligneA", { optionnel: true });
  const ligneB = lire.point(p, "ligneB", { optionnel: true });
  const profondeur = lire.longueur(p, "profondeur", { optionnel: true, strict: true });
  const orientation = p["orientation"] === undefined || p["orientation"] === null ? null : lire.enumeration(p, "orientation", ORIENTATIONS);
  const cadreMin = lire.point(p, "cadreMin", { optionnel: true });
  const cadreMax = lire.point(p, "cadreMax", { optionnel: true });
  const lignesCachees = lire.booleen(p, "lignesCachees", false);
  let phases: FiltrePhase[] | null = null;
  if (p["phases"] !== undefined && p["phases"] !== null) {
    const v = p["phases"];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && ([...PHASES, "sans-phase"] as string[]).includes(x))) throw new ErreurCommande("invalide", "phases", "« phases » : liste de existant / nouveau / a-demolir / sans-phase");
    phases = [...new Set(v as FiltrePhase[])];
  }
  if ((type === "plan" || type === "detail") && niveauId === null) throw new ErreurCommande("invalide", "niveauId", `une vue « ${type} » dessine un niveau : niveauId requis`);
  if (type === "coupe") {
    if (!ligneA || !ligneB) throw new ErreurCommande("invalide", "ligneA", "une coupe demande sa trace (ligneA, ligneB)");
    if (Math.hypot(ligneB.x - ligneA.x, ligneB.y - ligneA.y) < 0.01) throw new ErreurCommande("invalide", "ligneB", "trace de coupe trop courte");
  }
  if (type === "facade" && !orientation) throw new ErreurCommande("invalide", "orientation", "une façade demande son orientation (nord / sud / est / ouest)");
  if (type === "detail") {
    if (!cadreMin || !cadreMax) throw new ErreurCommande("invalide", "cadreMin", "un détail demande son cadre (cadreMin, cadreMax)");
    if (cadreMax.x - cadreMin.x < 0.05 || cadreMax.y - cadreMin.y < 0.05) throw new ErreurCommande("invalide", "cadreMax", "cadre de détail vide ou inversé");
  }
  const brutes = p["annotations"];
  let annotations: AnnotationVue[] = [];
  if (brutes !== undefined && brutes !== null) {
    if (!Array.isArray(brutes) || brutes.length > 500) throw new ErreurCommande("invalide", "annotations", "« annotations » : liste (500 au plus)");
    annotations = brutes.map((x, i) => lireAnnotationVue((x ?? {}) as Brut, `annotations[${i}]`));
    if (new Set(annotations.map((x) => x.id)).size !== annotations.length) throw new ErreurCommande("invalide", "annotations", "identifiants d'annotation en double");
  }
  let axo: { azimut: Angle; inclinaison: Angle } | null = null;
  if (type === "axonometrie") {
    const azimut = lire.angle(p, "azimut")!;
    const inclinaison = lire.angle(p, "inclinaison")!;
    if (!(inclinaison.value > 0 && inclinaison.value < 90)) throw new ErreurCommande("invalide", "inclinaison", "inclinaison : strictement entre 0° et 90°");
    axo = { azimut, inclinaison };
  }
  let calquesMasques: string[] = [];
  if (p["calquesMasques"] !== undefined && p["calquesMasques"] !== null) {
    const v = p["calquesMasques"];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw new ErreurCommande("invalide", "calquesMasques", "« calquesMasques » : liste d'identifiants de calques");
    for (const c of v as string[]) if (!etat.calques[c]) throw new ErreurCommande("precondition", "calquesMasques", `calque inconnu : ${c}`);
    calquesMasques = [...new Set(v as string[])].sort();
  }
  const base = { type, titre, echelle, niveauId, hauteurCoupe, ligneA, ligneB, profondeur, orientation, cadreMin, cadreMax, lignesCachees, phases, ...(axo ?? {}), ...(calquesMasques.length ? { calquesMasques } : {}) };
  // Une vue sans annotation garde exactement la forme d'avant (empreintes inchangées).
  return annotations.length ? { ...base, annotations } : base;
}

export interface VueGeneree {
  definitionId: string | null;
  params: ParamsVue;
  primitives: Primitive[];
  bornes: Bornes | null;
  /** Objets dont la vue dépend (dessinés ou lus). */
  objets: string[];
  empreinte: string;
  /** Conventions appliquées et limites, affichées avec la vue. */
  avertissements: string[];
  mesures: { triangles: number; primitives: number };
}

const PHYSIQUES = new Set<OccurrenceQuelconque["classe"]>(["mur", "porte", "fenetre", "dalle", "toiture", "escalier", "poteau", "solide", "garde-corps", "bloc-occurrence", "objet-importe"]);
/** Objet physique d'une vue ; un espace IFC importé n'est pas de la matière (ni coupé, ni occultant). */
const physique = (o: OccurrenceQuelconque): boolean => PHYSIQUES.has(o.classe) && !(o.classe === "objet-importe" && o.params.ifcClasse.toLowerCase() === "ifcspace");
const POCHES = new Set<string>(["mur", "poteau", "dalle", "toiture", "escalier"]);

/** L'objet est-il dessiné (calque visible, phase retenue) ? */
function retenu(etat: ModeleAtelier, o: OccurrenceQuelconque, v: Pick<ParamsVue, "phases" | "calquesMasques">): boolean {
  if (o.calqueId && (etat.calques[o.calqueId]?.visible === false || etat.calques[o.calqueId]?.gele)) return false;
  // Calques masqués dans cette vue seulement (D-057).
  if (o.calqueId && v.calquesMasques?.includes(o.calqueId)) return false;
  const phases = v.phases;
  if (!phases) return true;
  const ph = (o.phase as FiltrePhase | null) ?? "sans-phase";
  return phases.includes(ph);
}

const fmt = (v: number, d = 2) => v.toFixed(d).replace(".", ",").replace("-", "−");
const altitude = (n: Niveau) => `${n.elevation >= 0 ? "+" : ""}${fmt(n.elevation)}`;

class Collecteur {
  primitives: Primitive[] = [];
  avertissements = new Set<string>();
  mesures = { triangles: 0 };
  ligne(a: Vec, b: Vec, trait: Trait, objetId: string | null): void {
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return;
    this.primitives.push({ type: "ligne", a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y }, trait, objetId });
  }
  poly(points: readonly Vec[], ferme: boolean, trait: Trait | null, remplissage: Remplissage, objetId: string | null): void {
    if (points.length < 2) return;
    this.primitives.push({ type: "poly", points: points.map((p) => ({ x: p.x, y: p.y })), ferme, trait, remplissage, objetId });
  }
  texte(position: Vec, texte: string, hauteurMm: number, objetId: string | null, options: { ancre?: "debut" | "milieu" | "fin"; angle?: number; trait?: Trait } = {}): void {
    if (!texte.trim()) return;
    this.primitives.push({ type: "texte", position: { x: position.x, y: position.y }, texte, hauteurMm, ancre: options.ancre ?? "milieu", angle: options.angle ?? 0, trait: options.trait ?? "annotation", objetId });
  }
  cercle(centre: Vec, rayon: number, trait: Trait, objetId: string | null): void {
    this.primitives.push({ type: "cercle", centre: { x: centre.x, y: centre.y }, rayon, trait, remplissage: null, objetId });
  }
}

/** Ajoute la matière coupée (pochés + contour de l'union) et les arêtes vues d'une projection. */
function verserProjection(c: Collecteur, etat: ModeleAtelier, r: ResultatProjection, traitVu: (o: OccurrenceQuelconque | undefined) => Trait): void {
  const poches: { points: Vec[]; objetId: string }[] = [];
  for (const k of r.coupes) {
    const o = etat.objets[k.objetId];
    if (o && POCHES.has(o.classe) && k.ferme && k.points.length >= 3) {
      poches.push({ points: k.points, objetId: k.objetId });
      c.poly(k.points, true, null, "poche", k.objetId);
    } else c.poly(k.points, k.ferme, "vue", null, k.objetId);
  }
  for (const s of contoursUnion(poches)) c.ligne(s.a, s.b, "coupe", s.objetId);
  for (const s of r.vues) c.ligne(s.a, s.b, traitVu(etat.objets[s.objetId]), s.objetId);
  for (const s of r.cachees) c.ligne(s.a, s.b, "cache", s.objetId);
}

function maillagesDe(etat: ModeleAtelier, objets: readonly OccurrenceQuelconque[], exclure: ReadonlySet<string> = new Set()): Maillage[] {
  const out: Maillage[] = [];
  for (const o of objets) {
    if (!physique(o) || exclure.has(o.classe)) continue;
    const m = maillageObjet(etat, o);
    if (m && m.indices.length) out.push(m);
  }
  return out;
}

// --- Symboles du plan ------------------------------------------------------------------------------------------

function cadreOuverture(etat: ModeleAtelier, o: Occurrence<"porte" | "fenetre" | "ouverture">) {
  const hote = etat.objets[o.params.murHoteId];
  if (!hote || hote.classe !== "mur") return null;
  const { epaisseur, alignement } = hote.params;
  // Mur courbe (D-095) : symbole posé sur la tangente à l'axe au centre de l'ouverture.
  const { a, b, position } = hoteOuverture(hote.params, o.params.position, o.params.largeur.value);
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return null;
  const u = normalise(sub(b, a));
  const f = facesMur(a, b, epaisseur.value, alignement);
  const c = { x: a.x + (b.x - a.x) * position, y: a.y + (b.y - a.y) * position };
  const w = o.params.largeur.value;
  const p1 = { x: c.x - (u.x * w) / 2, y: c.y - (u.y * w) / 2 };
  const p2 = { x: c.x + (u.x * w) / 2, y: c.y + (u.y * w) / 2 };
  const dec = (p: Vec, k: number): Vec => ({ x: p.x + (f.gauche[0].x - a.x) * k + (f.droite[0].x - a.x) * (1 - k), y: p.y + (f.gauche[0].y - a.y) * k + (f.droite[0].y - a.y) * (1 - k) });
  return { u, w, p1, p2, dec };
}

function symbolesPlan(c: Collecteur, etat: ModeleAtelier, objets: readonly OccurrenceQuelconque[]): void {
  let portes = 0;
  for (const o of objets) {
    switch (o.classe) {
      case "porte": {
        const k = cadreOuverture(etat, o);
        const bt = battantPorte(etat, o);
        const sym = symbolePorte(etat, o);
        if (!k || !bt || !sym) break;
        // Vantaux selon le sens et la nature renseignés (D-037, D-047), sinon selon la convention de l'Atelier (dit).
        if (!bt.explicite) portes++;
        for (const v of sym.vantaux) c.poly(v, false, "vue", null, o.id);
        for (const a of sym.arcs) c.poly(a, false, "fin", null, o.id);
        // Seuil : sur la face opposée au battant.
        const fs = bt.ouvrant.cote === "gauche" ? 0 : 1;
        c.ligne(k.dec(k.p1, fs), k.dec(k.p2, fs), "fin", o.id);
        break;
      }
      case "fenetre": {
        const k = cadreOuverture(etat, o);
        if (!k) break;
        c.ligne(k.dec(k.p1, 0.5), k.dec(k.p2, 0.5), "vue", o.id);
        c.ligne(k.dec(k.p1, 0), k.dec(k.p1, 1), "vue", o.id);
        c.ligne(k.dec(k.p2, 0), k.dec(k.p2, 1), "vue", o.id);
        // Menuiserie paramétrée (D-101) : montants du dormant et entre vantaux.
        if (o.params.menuiserie) {
          const q0 = k.dec(k.p1, 0);
          const q1 = k.dec(k.p1, 1);
          const ln = Math.hypot(q1.x - q0.x, q1.y - q0.y) || 1;
          for (const r of traitsMenuiseriePlan(k.dec(k.p1, 0.5), k.u, { x: (q1.x - q0.x) / ln, y: (q1.y - q0.y) / ln }, k.w, o.params.menuiserie)) c.poly(r, true, "vue", null, o.id);
        }
        break;
      }
      case "ouverture": {
        const k = cadreOuverture(etat, o);
        if (!k) break;
        c.ligne(k.dec(k.p1, 0), k.dec(k.p2, 1), "cache", o.id);
        break;
      }
      case "piece": {
        c.poly(o.params.contour, true, "fin", null, o.id);
        for (const t of o.params.trous) c.poly(t, true, "fin", null, o.id);
        const pos = o.params.etiquette ?? centroide(o.params.contour);
        const nom = [o.params.code, o.params.nom].filter(Boolean).join(" · ");
        c.texte({ x: pos.x, y: pos.y + 0.18 }, nom, 2.5, o.id);
        c.texte({ x: pos.x, y: pos.y - 0.32 }, `${fmt(aireNette(o.params.contour, o.params.trous))} m²`, 2, o.id);
        break;
      }
      case "escalier": {
        const { a, b } = o.params;
        const L = Math.hypot(b.x - a.x, b.y - a.y);
        if (L < 1e-9) break;
        const u = normalise(sub(b, a));
        const n = perp(u);
        const w = o.params.largeur.value / 2;
        if (o.params.referencePlanSeulement) {
          c.poly([
            { x: a.x - n.x * w, y: a.y - n.y * w },
            { x: b.x - n.x * w, y: b.y - n.y * w },
            { x: b.x + n.x * w, y: b.y + n.y * w },
            { x: a.x + n.x * w, y: a.y + n.y * w },
          ], true, "fin", null, o.id);
          const nb = o.params.contremarches ?? o.params.marches ?? 0;
          for (let k = 1; k < nb; k++) {
            const p = { x: a.x + (u.x * L * k) / nb, y: a.y + (u.y * L * k) / nb };
            c.ligne({ x: p.x - n.x * w, y: p.y - n.y * w }, { x: p.x + n.x * w, y: p.y + n.y * w }, "fin", o.id);
          }
        }
        // Ligne de foulée et flèche de montée.
        c.ligne(a, b, "annotation", o.id);
        const t = Math.min(0.35, L / 4);
        c.ligne(b, { x: b.x - u.x * t + n.x * t * 0.5, y: b.y - u.y * t + n.y * t * 0.5 }, "annotation", o.id);
        c.ligne(b, { x: b.x - u.x * t - n.x * t * 0.5, y: b.y - u.y * t - n.y * t * 0.5 }, "annotation", o.id);
        c.cercle(a, 0.06, "annotation", o.id);
        break;
      }
      default:
        break;
    }
  }
  if (portes) c.avertissements.add(`Sens d'ouverture non renseigné pour ${portes} porte${portes > 1 ? "s" : ""} : battant${portes > 1 ? "s" : ""} dessiné${portes > 1 ? "s" : ""} selon la convention de l'Atelier (charnière au début, côté gauche du mur hôte).`);
}

/** Annotations, esquisses, références de plan et blocs d'un niveau (communs au plan et au détail). */
/** Cote : lignes d'attache, ligne de cote décalée, traits obliques, valeur au milieu (même dessin partout). */
function dessinerCote(c: Collecteur, a: Vec, b: Vec, d: number, objetId: string | null, trait: Trait, suffixe: string): void {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (L < 1e-9) return;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
  const n = { x: -u.y, y: u.x };
  const a2 = { x: a.x + n.x * d, y: a.y + n.y * d };
  const b2 = { x: b.x + n.x * d, y: b.y + n.y * d };
  c.ligne(a, a2, trait, objetId);
  c.ligne(b, b2, trait, objetId);
  c.ligne(a2, b2, trait, objetId);
  const tick = 0.08;
  for (const p of [a2, b2]) c.ligne({ x: p.x - (u.x + n.x) * tick, y: p.y - (u.y + n.y) * tick }, { x: p.x + (u.x + n.x) * tick, y: p.y + (u.y + n.y) * tick }, trait, objetId);
  let angle = (Math.atan2(u.y, u.x) * 180) / Math.PI;
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  c.texte({ x: (a2.x + b2.x) / 2 + n.x * 0.12, y: (a2.y + b2.y) / 2 + n.y * 0.12 }, `${fmt(L)}${suffixe}`, 2.2, objetId, { angle, trait });
}

/**
 * Marques de centre (D-062, DA-01-10) : une croix en trait fin au centre des cercles, arcs et ellipses d'esquisse
 * (hors lignes de construction), de 3 mm sur le papier quelle que soit l'échelle, bornée au rayon.
 */
function marquesDeCentre(c: Collecteur, objets: readonly OccurrenceQuelconque[], echelle: number): void {
  for (const o of objets) {
    if (o.classe !== "esquisse") continue;
    const p = o.params;
    if (!(p.forme === "cercle" || p.forme === "arc" || p.forme === "ellipse") || !p.centre || !p.rayon) continue;
    const h = Math.min((0.003 * echelle) / 2, p.rayon.value * 0.5);
    const { x, y } = p.centre;
    c.ligne({ x: x - h, y }, { x: x + h, y }, "fin", o.id);
    c.ligne({ x, y: y - h }, { x, y: y + h }, "fin", o.id);
  }
}

function annotations2D(c: Collecteur, etat: ModeleAtelier, objets: readonly OccurrenceQuelconque[], echelle: number | null = null): void {
  for (const o of objets) {
    switch (o.classe) {
      case "cotation": {
        const ext = extremitesCotation(etat, o.id);
        if (!ext) break;
        dessinerCote(c, ext.a, ext.b, o.params.decalage.value, o.id, ext.aReparer ? "a-reparer" : "annotation", ext.aReparer ? " · à réparer" : "");
        break;
      }
      case "texte":
        c.texte(o.params.position, o.params.texte, 2.5, o.id, { ancre: "debut" });
        break;
      case "etiquette": {
        c.texte(o.params.position, o.params.texte, 2.2, o.id, { ancre: "debut" });
        const cible = o.params.objetId ? etat.objets[o.params.objetId] : undefined;
        if (cible && "contour" in cible.params) {
          const ct = centroide((cible.params as { contour: Point2[] }).contour);
          c.ligne(o.params.position, ct, "annotation", o.id);
        }
        break;
      }
      case "esquisse": {
        const p = o.params;
        const trait: Trait = p.forme === "construction" ? "cache" : "fin";
        if (p.forme === "cercle" && p.centre && p.rayon) c.cercle(p.centre, p.rayon.value, trait, o.id);
        else if (p.forme === "ellipse" && p.centre && p.rayon && p.rayonB) c.poly(pointsEllipse(p.centre, p.rayon.value, p.rayonB.value, p.rotation?.value ?? 0), true, trait, null, o.id);
        else if (p.forme === "arc" && p.centre && p.rayon) c.poly(pointsArc(p.centre, p.rayon.value, p.angleDebut?.value ?? 0, p.angleFin?.value ?? 360), false, trait, null, o.id);
        else if (p.forme === "spline") c.poly(pointsSpline(p.points, 8, p.ferme, p.tangentes), p.ferme, trait, null, o.id);
        else if (p.forme === "rectangle" && p.points.length === 2) {
          const [q1, q2] = [p.points[0]!, p.points[1]!];
          c.poly([q1, { x: q2.x, y: q1.y }, q2, { x: q1.x, y: q2.y }], true, trait, null, o.id);
        } else if (p.renflements) c.poly(pointsPolyligne(p.points, p.ferme, p.renflements), p.ferme, trait, null, o.id);
        else c.poly(p.points, p.ferme || p.forme === "polygone" || p.forme === "hachure", trait, null, o.id);
        // Motif de hachure (D-072) : pas papier converti à l'échelle de la vue ; sans échelle, contour seul.
        if (p.forme === "hachure" && echelle) {
          const m = motifHachure(p.motif);
          if (!m.connu) c.avertissements.add(`Motif de hachure inconnu « ${p.motif} » : dessiné avec le motif « ${m.motif.libelle} ».`);
          for (const f of m.motif.familles) for (const [a, b] of lignesHachure([p.points], f.angle, (f.pasMm * echelle) / 1000)) c.ligne(a, b, "fin", o.id);
          if (m.motif.points) for (const q of pointsHachure([p.points], (m.motif.points.pasMm * echelle) / 1000)) c.cercle(q, (m.motif.points.rayonMm * echelle) / 1000, "fin", o.id);
        }
        break;
      }
      case "reference-plan":
        c.poly(o.params.contour, true, "cache", null, o.id);
        break;
      case "bloc-occurrence":
        dessinerBloc(c, etat, o);
        break;
      default:
        break;
    }
  }
}

/** Contenu 2D d'une définition de bloc, placé par l'occurrence (translation, rotation, échelle uniforme). */
function dessinerBloc(c: Collecteur, etat: ModeleAtelier, o: Occurrence<"bloc-occurrence">): void {
  const def = o.definitionId ? etat.definitions[o.definitionId] : undefined;
  const contenu = (def?.params["contenu"] as { classe: string; params: Record<string, unknown> }[] | undefined) ?? [];
  if (!def) {
    c.cercle(o.params.position, 0.1, "a-reparer", o.id);
    c.texte(o.params.position, "définition de bloc absente", 2, o.id, { trait: "a-reparer" });
    return;
  }
  void contenu;
  for (const { classe, params, tr, k } of contenuPlace(etat, o.definitionId, o.params)) {
    const e = { classe, params };
    const pts = Array.isArray(e.params["points"]) ? (e.params["points"] as Vec[]) : Array.isArray(e.params["contour"]) ? (e.params["contour"] as Vec[]) : [];
    const archi = contoursArchitecture(e.classe, e.params);
    if (archi) {
      // Poteaux et dalles d'un bloc (D-108) : section ou contour, avec les trous.
      for (const x of [archi.contour, ...archi.trous]) c.poly(x.map(tr), true, "vue", null, o.id);
      continue;
    }
    if (e.classe === "esquisse" && e.params["forme"] === "cercle" && e.params["centre"] && e.params["rayon"]) c.cercle(tr(e.params["centre"] as Vec), (e.params["rayon"] as Longueur).value * k, "fin", o.id);
    else if (e.classe === "esquisse" && e.params["forme"] === "rectangle" && pts.length === 2) {
      const [q1, q2] = [pts[0]!, pts[1]!];
      c.poly([q1, { x: q2.x, y: q1.y }, q2, { x: q1.x, y: q2.y }].map(tr), true, "fin", null, o.id);
    } else if (pts.length >= 2) c.poly(pts.map(tr), e.params["ferme"] === true || "contour" in e.params, "fin", null, o.id);
    else if (e.classe === "texte" && e.params["position"]) c.texte(tr(e.params["position"] as Vec), String(e.params["texte"] ?? ""), 2, o.id);
  }
}

// --- Générateurs ------------------------------------------------------------------------------------------------

function genererPlan(c: Collecteur, etat: ModeleAtelier, v: ParamsVue, options: OptionsGeneration = {}): void {
  const niveau = etat.niveaux[v.niveauId!]!;
  dessinerExternes(c, etat, niveau.id, options);
  const h = (v.hauteurCoupe ?? { value: HAUTEUR_COUPE_DEFAUT }).value;
  const zc = niveau.elevation + h;
  const objets = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => o.niveauId === niveau.id && retenu(etat, o, v)).sort((a, b) => (a.id < b.id ? -1 : 1));
  const camera: Camera = { origine: [0, 0, zc], regard: [0, 0, -1], droite: [1, 0, 0], haut: [0, 1, 0] };
  const r = projeterMaillages(maillagesDe(etat, objets, new Set(["porte", "fenetre"])), camera, { coupe: true, profondeurMax: h + 0.6, lignesCachees: false });
  verserProjection(c, etat, r, (o) => (o && (o.classe === "mur" || o.classe === "poteau" || o.classe === "dalle" || o.classe === "toiture") ? "vue" : "fin"));
  // Couches des parois coupées (composition cohérente du type, D-026) : séparations en trait fin, hors des baies coupées.
  for (const o of objets) {
    if (o.classe !== "mur") continue;
    const ext = etendueMur(etat, o);
    if (!ext || zc < ext[0] || zc > ext[1]) continue;
    const L = longueurAxeMur(o.params);
    const vides: [number, number][] = [];
    for (const x of objets) {
      if ((x.classe !== "porte" && x.classe !== "fenetre" && x.classe !== "ouverture") || x.params.murHoteId !== o.id) continue;
      const zb = ext[0] + (x.params.allege?.value ?? 0);
      if (zc < zb || zc > zb + x.params.hauteur.value) continue;
      const cc = x.params.position * L;
      vides.push([cc - x.params.largeur.value / 2, cc + x.params.largeur.value / 2]);
    }
    for (const sep of separationsCouches(etat, o, vides)) c.ligne(sep.a, sep.b, "fin", o.id);
  }
  symbolesPlan(c, etat, objets);
  annotations2D(c, etat, objets, v.echelle);
  marquesDeCentre(c, objets, v.echelle);
  if (!v.hauteurCoupe) c.avertissements.add(`Hauteur de coupe : ${fmt(h)} m au-dessus du niveau (convention de dessin par défaut, réglable).`);
  const sansHauteur = objets.filter((o) => o.classe === "mur" && !o.params.hauteur && !o.params.niveauHautId).length;
  if (sansHauteur) c.avertissements.add(`${sansHauteur} mur(s) sans hauteur renseignée : non coupés, dessinés en contour seulement.`);
  for (const o of objets) if (o.classe === "mur" && !o.params.hauteur && !o.params.niveauHautId) c.poly(polygoneMurRaccorde(etat, o), true, "cache", null, o.id);
  c.mesures.triangles += r.triangles;
}

function reperesNiveaux(c: Collecteur, etat: ModeleAtelier, xGauche: number, xDroite: number): void {
  for (const n of niveauxOrdonnes(etat)) {
    c.ligne({ x: xGauche - 1.2, y: n.elevation }, { x: xGauche - 0.2, y: n.elevation }, "annotation", null);
    c.ligne({ x: xDroite + 0.2, y: n.elevation }, { x: xDroite + 1.2, y: n.elevation }, "annotation", null);
    c.texte({ x: xGauche - 1.3, y: n.elevation + 0.12 }, `${n.nom} ${altitude(n)}`, 2.2, null, { ancre: "fin" });
  }
}

function genererCoupeOuFacade(c: Collecteur, etat: ModeleAtelier, v: ParamsVue): void {
  const objets = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => physique(o) && retenu(etat, o, v)).sort((a, b) => (a.id < b.id ? -1 : 1));
  let camera: Camera;
  let coupe = false;
  if (v.type === "coupe") {
    const a = v.ligneA!;
    const b = v.ligneB!;
    const u = normalise(sub(b, a));
    camera = { origine: [a.x, a.y, 0], regard: [-u.y, u.x, 0], droite: [u.x, u.y, 0], haut: [0, 0, 1] };
    coupe = true;
  } else if (v.type === "axonometrie") {
    const az = ((v.azimut?.value ?? 0) * Math.PI) / 180;
    const inc = ((v.inclinaison?.value ?? 30) * Math.PI) / 180;
    const regard: [number, number, number] = [-Math.cos(inc) * Math.cos(az), -Math.cos(inc) * Math.sin(az), -Math.sin(inc)];
    const droite: [number, number, number] = [-Math.sin(az), Math.cos(az), 0];
    const haut: [number, number, number] = [droite[1] * regard[2] - droite[2] * regard[1], droite[2] * regard[0] - droite[0] * regard[2], droite[0] * regard[1] - droite[1] * regard[0]];
    camera = { origine: [0, 0, 0], regard, droite, haut };
    c.avertissements.add("Axonométrie : projection parallèle, sans échelle de mesure dans la profondeur (les longueurs ne se mesurent pas sur le dessin).");
  } else {
    const regard: Record<Orientation, [number, number, number]> = { nord: [0, -1, 0], sud: [0, 1, 0], est: [-1, 0, 0], ouest: [1, 0, 0] };
    const d = regard[v.orientation!];
    camera = { origine: [0, 0, 0], regard: d, droite: [d[1], -d[0], 0], haut: [0, 0, 1] };
    c.avertissements.add("Orientation : nord du quadrillage du repère local (repère cadastral du projet), pas le nord géographique.");
  }
  const maillages = maillagesDe(etat, objets);
  const garde = new Set(maillages.map((m) => m.objetId));
  const r = projeterMaillages(maillages, camera, { coupe, profondeurMax: v.type === "coupe" ? (v.profondeur?.value ?? null) : null, lignesCachees: v.lignesCachees });
  verserProjection(c, etat, r, () => "vue");
  const b = bornesPrimitives(c.primitives);
  if (b && v.type !== "axonometrie") reperesNiveaux(c, etat, b.min.x, b.max.x);
  const sansVolume = objets.filter((o) => !garde.has(o.id)).length;
  if (sansVolume) c.avertissements.add(`${sansVolume} objet(s) sans volume (hauteur non renseignée, ou bloc dessiné en 2D seulement) : absents de la vue.`);
  c.mesures.triangles += r.triangles;
}

/** Conversion explicite du repère cadastral vers le repère local du projet : local = cadastral − origine. */
export function cadastralVersLocal(p: { x: number; y: number; crs: string }, origine: { x: number; y: number; crs: string }): Vec {
  if (p.crs !== origine.crs) throw new Error(`repères incompatibles : ${p.crs} / ${origine.crs}`);
  return { x: p.x - origine.x, y: p.y - origine.y };
}

function genererMasse(c: Collecteur, etat: ModeleAtelier, v: ParamsVue): void {
  const parcelle = etat.site.parcelle;
  if (parcelle) {
    const pts = parcelle.sommets.map((s) => cadastralVersLocal(s.cadastral, parcelle.origineLocale));
    c.poly(pts, true, "site", null, null);
    parcelle.sommets.forEach((s, i) => {
      const p = pts[i]!;
      c.cercle(p, 0.15, "annotation", null);
      c.texte({ x: p.x + 0.3, y: p.y + 0.3 }, `${s.id} · ${fmt(s.cadastral.x)} ; ${fmt(s.cadastral.y)}`, 1.8, null, { ancre: "debut" });
    });
    const yBas = Math.min(...pts.map((q) => q.y));
    const ct = { x: centroide(pts).x, y: yBas - 3 };
    const aires = [parcelle.aire ? `aire calculée ${fmt(parcelle.aire.value)} m²` : null, parcelle.aireOfficielle ? `aire officielle ${fmt(parcelle.aireOfficielle.value)} m²` : "aire officielle non renseignée"].filter(Boolean).join(" · ");
    c.texte(ct, `Parcelle · ${parcelle.crs} · ${aires}`, 2.5, null);
  } else c.avertissements.add("Aucune parcelle transmise : plan de masse sans limite foncière.");
  if (etat.site.emprise) c.poly(etat.site.emprise.sommets, true, "site", null, null);
  // Bâtiment : union des murs du niveau de référence (altitude la plus proche de 0, au-dessus de préférence).
  const niveaux = niveauxOrdonnes(etat);
  const ref = niveaux.filter((n) => n.elevation >= -1e-9).sort((a, b) => a.elevation - b.elevation)[0] ?? niveaux[0];
  if (ref) {
    const tous = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"mur"> => o.classe === "mur" && o.niveauId === ref.id && retenu(etat, o, v));
    // Murs extérieurs déclarés s'il y en a (enveloppe du bâtiment), sinon tous les murs du niveau.
    const murs = tous.some((m) => m.params.exterieur) ? tous.filter((m) => m.params.exterieur) : tous;
    for (const s of contoursUnion(murs.map((m) => ({ points: polygoneMurRaccorde(etat, m), objetId: m.id })))) c.ligne(s.a, s.b, "coupe", s.objetId);
    const toitures = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"toiture"> => o.classe === "toiture" && retenu(etat, o, v));
    for (const t of toitures) {
      c.poly(t.params.contour, true, "vue", null, t.id);
      const g = t.params.type !== "plate" && t.params.pente ? geometrieToiture(t.params.contour, t.params.type, t.params.pente.value) : null;
      if (g?.faitage) c.ligne(g.faitage[0], g.faitage[1], "vue", t.id);
      if (t.params.type !== "plate" && !t.params.pente) c.avertissements.add(`Toiture ${t.params.nom ?? t.id} : pente non renseignée, dessinée plate.`);
    }
  }
  const b = bornesPrimitives(c.primitives);
  if (b) {
    // Flèche du nord du quadrillage (le nord géographique n'est pas une donnée du modèle).
    const p = { x: b.max.x + 3, y: b.max.y - 3 };
    c.ligne({ x: p.x, y: p.y - 1.5 }, { x: p.x, y: p.y + 1.5 }, "annotation", null);
    c.poly([{ x: p.x, y: p.y + 1.5 }, { x: p.x - 0.5, y: p.y + 0.4 }, { x: p.x + 0.5, y: p.y + 0.4 }], true, "annotation", "poche", null);
    c.texte({ x: p.x, y: p.y + 2 }, "N", 3.5, null);
    c.texte({ x: p.x, y: p.y - 2.2 }, parcelle ? `nord du quadrillage ${parcelle.crs}` : "nord du quadrillage local", 1.8, null);
  }
  c.avertissements.add("Nord : nord du quadrillage du repère cadastral, pas le nord géographique (non renseigné).");
}

function genererDetail(c: Collecteur, etat: ModeleAtelier, v: ParamsVue, options: OptionsGeneration = {}): void {
  genererPlan(c, etat, v, options);
  const cadre = { min: { x: v.cadreMin!.x, y: v.cadreMin!.y }, max: { x: v.cadreMax!.x, y: v.cadreMax!.y } };
  c.primitives = decouper(c.primitives, cadre);
  c.poly([cadre.min, { x: cadre.max.x, y: cadre.min.y }, cadre.max, { x: cadre.min.x, y: cadre.max.y }], true, "fin", null, null);
}

/** Vue d'une définition du modèle (classe « vue »). */
export function paramsDeDefinition(def: Definition): ParamsVue {
  return def.params as unknown as ParamsVue;
}

/**
 * Objets (et définitions) dont dépend une vue, sans la générer : la fraîcheur se calcule pour tout le catalogue
 * sans projeter un seul maillage, et la génération déclare exactement les mêmes dépendances.
 */
export function objetsVue(etat: ModeleAtelier, params: ParamsVue): string[] {
  const tous = Object.values(etat.objets) as OccurrenceQuelconque[];
  const ids = new Set<string>();
  if (params.type === "plan" || params.type === "detail") {
    for (const o of tous) {
      if (o.niveauId !== params.niveauId || !retenu(etat, o, params)) continue;
      ids.add(o.id);
      if (o.classe === "bloc-occurrence" && o.definitionId) ids.add(o.definitionId);
      if (o.classe === "etiquette" && o.params.objetId) ids.add(o.params.objetId);
      if (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") ids.add(o.params.murHoteId);
      // Type de mur composé : ses couches sont dessinées (D-026) ; un type sans couches ne change rien au dessin.
      if (o.classe === "mur" && o.definitionId && etat.definitions[o.definitionId]?.params["couches"]) ids.add(o.definitionId);
    }
    for (const r of Object.values(etat.references)) if (ids.has(r.proprietaireId) && r.objetId) ids.add(r.objetId);
  } else if (params.type === "coupe" || params.type === "facade" || params.type === "axonometrie") {
    for (const o of tous) if (physique(o) && retenu(etat, o, params)) ids.add(o.id);
  } else {
    const niveaux = niveauxOrdonnes(etat);
    const ref = niveaux.filter((n) => n.elevation >= -1e-9).sort((a, b) => a.elevation - b.elevation)[0] ?? niveaux[0];
    for (const o of tous) if (((o.classe === "mur" && o.niveauId === ref?.id) || o.classe === "toiture") && retenu(etat, o, params)) ids.add(o.id);
  }
  return [...ids].filter((id) => etat.objets[id] || etat.definitions[id]).sort();
}

/** Empreinte des entrées d'une vue : paramètres, objets dépendants, références, niveaux, calques, site (masse). */
export function empreinteVue(etat: ModeleAtelier, params: ParamsVue, objets: readonly string[] = objetsVue(etat, params)): string {
  const set = new Set(objets);
  return empreinteDe({
    params,
    objets: objets.map((id) => etat.objets[id] ?? etat.definitions[id] ?? null),
    references: Object.values(etat.references).filter((r) => set.has(r.proprietaireId)).sort((a, b) => (a.id < b.id ? -1 : 1)),
    niveaux: niveauxOrdonnes(etat).map((n) => [n.id, n.nom, n.elevation, n.hauteur]),
    calques: Object.values(etat.calques).map((k) => (k.gele ? [k.id, k.visible, "gele"] : [k.id, k.visible])).sort(),
    site: params.type === "masse" ? etat.site : null,
    // Références externes du niveau dessiné (épinglage et conversion) ; absent quand il n'y en a pas.
    ...((params.type === "plan" || params.type === "detail") && params.niveauId && refsDuNiveau(etat, params.niveauId).length ? { externes: refsDuNiveau(etat, params.niveauId).map((d) => [d.id, d.params]) } : {}),
  });
}

/** Génère une vue à partir de ses paramètres (définition du modèle ou paramètres d'aperçu). */
/**
 * Références externes (DA-05-11) : le modèle ne connaît pas les autres projets ; l'appelant (serveur, navigateur)
 * fournit les traits déjà convertis dans le repère du projet, lus avec les droits de l'utilisateur (null = source
 * inaccessible). Sans ces traits, la vue le dit au lieu de dessiner.
 */
export interface TraitsExternes {
  id: string;
  traits: readonly { a: Vec; b: Vec }[] | null;
}

export interface OptionsGeneration {
  externes?: readonly TraitsExternes[];
}

const refsDuNiveau = (etat: ModeleAtelier, niveauId: string) =>
  Object.values(etat.definitions)
    .filter((d) => d.classe === ("reference-externe" as Definition["classe"]) && (d.params as Record<string, unknown>)["niveauId"] === niveauId)
    .sort((a, b) => (a.id < b.id ? -1 : 1));

function dessinerExternes(c: Collecteur, etat: ModeleAtelier, niveauId: string, options: OptionsGeneration): void {
  for (const d of refsDuNiveau(etat, niveauId)) {
    const x = options.externes?.find((e) => e.id === d.id);
    if (!options.externes) c.avertissements.add(`Référence externe « ${d.nom} » non dessinée : aperçu sans accès aux sources.`);
    else if (!x || !x.traits) c.avertissements.add(`Référence externe « ${d.nom} » non dessinée : source inaccessible.`);
    else {
      for (const t of x.traits.slice(0, 20000)) c.ligne(t.a, t.b, "fin", null);
      c.avertissements.add(`Référence externe « ${d.nom} » dessinée en trait fin (révision publiée ${(d.params as Record<string, unknown>)["revisionSource"]}, lecture seule).`);
    }
  }
}

export function genererVue(etat: ModeleAtelier, params: ParamsVue, definitionId: string | null = null, options: OptionsGeneration = {}): VueGeneree {
  const c = new Collecteur();
  if ((params.type === "plan" || params.type === "detail") && !(params.niveauId && etat.niveaux[params.niveauId])) {
    c.avertissements.add("Niveau de la vue absent du modèle : vue à réparer.");
  } else if (params.type === "plan") genererPlan(c, etat, params, options);
  else if (params.type === "detail") genererDetail(c, etat, params, options);
  else if (params.type === "coupe" || params.type === "facade" || params.type === "axonometrie") genererCoupeOuFacade(c, etat, params);
  else genererMasse(c, etat, params);
  for (const an of params.annotations ?? []) {
    if (an.type === "texte") c.texte(an.position, an.texte, 2.5, null, { ancre: "debut" });
    else dessinerCote(c, an.a, an.b, an.decalage, null, "annotation", "");
  }
  // Phase « à démolir » : tirets, sans poché.
  const demolis = new Set((Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o) => o.phase === "a-demolir").map((o) => o.id));
  if (demolis.size)
    c.primitives = c.primitives.map((p) => {
      if (!p.objetId || !demolis.has(p.objetId)) return p;
      if (p.type === "poly") return { ...p, remplissage: null, trait: p.trait ? "demoli" : null };
      return p.type === "texte" ? p : { ...p, trait: "demoli" };
    });
  const objets = objetsVue(etat, params);
  const empreinte = empreinteVue(etat, params, objets);
  return {
    definitionId,
    params,
    primitives: c.primitives,
    bornes: bornesPrimitives(c.primitives, params.echelle),
    objets,
    empreinte,
    avertissements: [...c.avertissements],
    mesures: { triangles: c.mesures.triangles, primitives: c.primitives.length },
  };
}

/** Vue d'une définition « vue » du modèle, par identifiant. */
export function genererVueDefinition(etat: ModeleAtelier, id: string, options: OptionsGeneration = {}): VueGeneree | null {
  const def = etat.definitions[id];
  if (!def || def.classe !== ("vue" as Definition["classe"])) return null;
  return genererVue(etat, paramsDeDefinition(def), id, options);
}
