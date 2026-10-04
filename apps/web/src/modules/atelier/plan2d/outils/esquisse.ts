/**
 * Outils d'esquisse (famille « Créer ») : DA-01-02 ligne et polyligne, DA-01-03 arc et cercle, DA-01-04 rectangle
 * et polygone, DA-01-05 spline, DA-01-06 main levée, DA-01-10 axe et ligne de construction, DA-01-11 hachure.
 * Chacun produit une commande `esquisse.*` du contrat `atelier-commands/1`, contrôlée par essai à blanc avant
 * validation. Les points reçus sont déjà accrochés et en mètres (repère local).
 */
import { TOLERANCES, type IdObjet } from "@parcours/atelier-model";
import type { ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { aireSignee, angleDeg, cercleTroisPoints, courbeSpline, distance, emprise, facettesArc, pointDansPolygone, polaire, simplifier, sommetsPolygone, versPoint, vectoriel, sous, type Vec } from "../geometrie";
import { formaterValeur } from "../saisie";
import {
  activationCreation,
  angle,
  champsSegment,
  commande,
  controler,
  coteSegment,
  definir,
  dessinsDe,
  enTete,
  lisible,
  longueur,
  P,
  sessionPoints,
  type DependancesOutils,
  type EtatPoints,
  type ResultatGeste,
} from "./commun";

const SANS_NIVEAU = lisible("Esquisse", "niveau ou calque actif absent", "choisir un niveau et un calque");

function creation(ctx: ContexteAtelier, type: Parameters<typeof commande>[0], params: Record<string, unknown>, label: string): ResultatGeste {
  const t = enTete(ctx);
  if (!t) return { erreur: SANS_NIVEAU };
  return { label, commandes: [commande(type, { id: ctx.nouvelId("esquisse"), ...t, ...params })] };
}

const trace = (a: Vec, b: Vec): FormeApercu => ({ forme: "segment", a: versPoint(a), b: versPoint(b), style: "trace" });

/** Formes d'une suite de points + curseur, avec la cote du segment courant. */
function formesSuite(e: EtatPoints, ferme = false): FormeApercu[] {
  const pts = [...e.points, ...(e.curseur ? [e.curseur] : [])];
  if (pts.length < 2) return [];
  const f: FormeApercu[] = [{ forme: "polyligne", points: pts.map(versPoint), fermee: ferme, style: "trace" }];
  const a = pts[pts.length - 2] as Vec;
  const b = pts[pts.length - 1] as Vec;
  if (distance(a, b) > 0) f.push(coteSegment(a, b));
  return f;
}

// ---------------------------------------------------------------------------------------------------------------

export function outilLigne(): DefinitionOutil {
  return definir({
    id: "creer.ligne",
    libelle: "Ligne",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["line", "trait", "segment"],
    raccourci: "L",
    fiches: ["DA-01-01", "DA-01-02"],
    aide: { action: "Trace un segment entre deux points.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez le départ, tapez 4,5 puis Entrée : segment de 4,50 m." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le point de départ de la ligne." : "Cliquez le point d'arrivée, ou tapez la longueur et l'angle."),
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous)),
        formes: (e) => formesSuite(e),
        geste: (e) => creation(ctx, "esquisse.ligne", { a: P(e.points[0] as Vec), b: P(e.points[1] as Vec) }, "Tracer une ligne"),
      }),
  });
}

export function outilPolyligne(): DefinitionOutil {
  return definir({
    id: "creer.polyligne",
    libelle: "Polyligne",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["polyline", "pline", "suite de segments"],
    fiches: ["DA-01-01", "DA-01-02"],
    aide: { action: "Trace une suite de segments, ouverte ou fermée.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez les sommets ; double-clic pour finir, clic sur le premier sommet pour fermer." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: "libre",
        minimum: 2,
        fermable: true,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le premier sommet." : "Sommet suivant ; double-clic ou Entrée deux fois pour finir, premier sommet pour fermer, Retour arrière pour reprendre."),
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points.at(-1) ?? null, e.curseur, e.verrous)),
        formes: (e) => formesSuite(e),
        geste: (e, ferme) => creation(ctx, "esquisse.polyligne", { points: e.points.map(P), ferme }, "Tracer une polyligne"),
      }),
  });
}

/** Paramètres canoniques d'un arc par trois points (début, passage, fin) ; `null` si alignés. */
export function arcParTroisPoints(a: Vec, m: Vec, b: Vec): { centre: Vec; rayon: number; angleDebut: number; angleFin: number; sens: "trigo" | "horaire" } | null {
  const c = cercleTroisPoints(a, m, b);
  if (!c) return null;
  const sens = vectoriel(sous(m, a), sous(b, m)) > 0 ? "trigo" : "horaire";
  return { centre: c.centre, rayon: c.rayon, angleDebut: angleDeg(c.centre, a), angleFin: angleDeg(c.centre, b), sens };
}

export function outilArc(): DefinitionOutil {
  return definir({
    id: "creer.arc",
    libelle: "Arc",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["arc", "arc de cercle", "3 points"],
    raccourci: "A",
    fiches: ["DA-01-01", "DA-01-03"],
    aide: { action: "Trace un arc par trois points : début, passage, fin.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez le début, un point de l'arc, puis la fin." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: 3,
        consigne: (e) => ["Cliquez le début de l'arc.", "Cliquez un point de passage.", "Cliquez la fin de l'arc."][e.points.length] ?? "",
        champs: (e) => {
          const [a, m] = e.points;
          const b = e.curseur;
          const arc = a && m && b ? arcParTroisPoints(a, m, b) : null;
          return e.points.length < 2 ? champsSegment(e.points[0] ?? null, e.curseur, e.verrous) : [{ champ: "rayon", libelle: "Rayon (calculé)", unite: "m", valeur: arc?.rayon ?? null }];
        },
        formes: (e) => {
          const [a, m] = e.points;
          const b = e.curseur;
          if (!a || !m || !b) return formesSuite(e);
          const arc = arcParTroisPoints(a, m, b);
          if (!arc) return [trace(a, b)];
          const t = arc.sens === "trigo" ? { d: arc.angleDebut, f: arc.angleFin } : { d: arc.angleFin, f: arc.angleDebut };
          return [{ forme: "polyligne", points: facettesArc(arc.centre, arc.rayon, t.d, t.f, "trigo").map(versPoint), fermee: false, style: "trace" }, { forme: "texte", position: versPoint(arc.centre), texte: `R ${formaterValeur(arc.rayon, "m")}`, style: "cote" }];
        },
        geste: (e) => {
          const [a, m, b] = e.points as [Vec, Vec, Vec];
          const arc = arcParTroisPoints(a, m, b);
          if (!arc) return { erreur: lisible("Arc", "les trois points sont alignés", "choisir un point de passage hors de la corde") };
          return creation(ctx, "esquisse.arc", { centre: P(arc.centre), rayon: longueur(arc.rayon), angleDebut: angle(arc.angleDebut), angleFin: angle(arc.angleFin), sens: arc.sens }, "Tracer un arc");
        },
      }),
  });
}

/** Contrainte d'un rayon verrouillé depuis le centre (premier point). */
function contraindreRayon(e: EtatPoints, brut: Vec): Vec {
  const c = e.points[0];
  const r = e.verrous.rayon;
  if (!c || r === undefined) return brut;
  return polaire(c, r, distance(c, brut) > 0 ? angleDeg(c, brut) : 0);
}

export function outilCercle(): DefinitionOutil {
  return definir({
    id: "creer.cercle",
    libelle: "Cercle",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["circle", "rond"],
    raccourci: "C",
    fiches: ["DA-01-01", "DA-01-03"],
    aide: { action: "Trace un cercle par son centre et son rayon.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez le centre, tapez 1,5 puis Entrée : rayon 1,50 m." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le centre du cercle." : "Cliquez un point du cercle, ou tapez le rayon."),
        champs: (e) => (e.points.length === 0 ? [] : [{ champ: "rayon", libelle: "Rayon", unite: "m", valeur: e.verrous.rayon ?? (e.curseur && e.points[0] ? distance(e.points[0], e.curseur) : null) }]),
        contraindre: contraindreRayon,
        formes: (e) => {
          const c = e.points[0];
          if (!c || !e.curseur) return [];
          return [{ forme: "cercle", centre: versPoint(c), rayon: distance(c, e.curseur), style: "trace" }, coteSegment(c, e.curseur)];
        },
        geste: (e) => {
          const [c, b] = e.points as [Vec, Vec];
          return creation(ctx, "esquisse.cercle", { centre: P(c), rayon: longueur(distance(c, b)) }, "Tracer un cercle");
        },
      }),
  });
}

/** Contrainte des côtés verrouillés d'un rectangle (signe donné par le pointeur). */
function contraindreRectangle(e: EtatPoints, brut: Vec): Vec {
  const o = e.points[0];
  if (!o) return brut;
  const l = e.verrous.largeur;
  const h = e.verrous.profondeur;
  return { x: l === undefined ? brut.x : o.x + (brut.x < o.x ? -l : l), y: h === undefined ? brut.y : o.y + (brut.y < o.y ? -h : h) };
}

export function outilRectangle(): DefinitionOutil {
  return definir({
    id: "creer.rectangle",
    libelle: "Rectangle",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["rectangle", "rect", "rec"],
    raccourci: "R",
    fiches: ["DA-01-01", "DA-01-04"],
    aide: { action: "Trace un rectangle par deux coins opposés.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez un coin, tapez 4 (largeur), Tab, 3 (profondeur), Entrée." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le premier coin." : "Cliquez le coin opposé, ou tapez largeur et profondeur."),
        champs: (e) => {
          const o = e.points[0];
          const c = e.curseur;
          if (!o) return [];
          return [
            { champ: "largeur", libelle: "Largeur", unite: "m", valeur: e.verrous.largeur ?? (c ? Math.abs(c.x - o.x) : null) },
            { champ: "profondeur", libelle: "Profondeur", unite: "m", valeur: e.verrous.profondeur ?? (c ? Math.abs(c.y - o.y) : null) },
          ];
        },
        contraindre: contraindreRectangle,
        formes: (e) => {
          const o = e.points[0];
          const c = e.curseur;
          if (!o || !c) return [];
          const s = [o, { x: c.x, y: o.y }, c, { x: o.x, y: c.y }];
          return [{ forme: "polygone", points: s.map(versPoint), style: "trace" }, coteSegment(o, s[1] as Vec), coteSegment(s[1] as Vec, c), { forme: "texte", position: versPoint({ x: (o.x + c.x) / 2, y: (o.y + c.y) / 2 }), texte: `${formaterValeur(Math.abs((c.x - o.x) * (c.y - o.y)), "")} m²`, style: "cote" }];
        },
        geste: (e) => {
          const [a, b] = e.points as [Vec, Vec];
          return creation(ctx, "esquisse.rectangle", { origine: P({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) }), largeur: longueur(Math.abs(b.x - a.x)), profondeur: longueur(Math.abs(b.y - a.y)), angle: angle(0) }, "Tracer un rectangle");
        },
      }),
  });
}

export function outilPolygone(): DefinitionOutil {
  return definir({
    id: "creer.polygone",
    libelle: "Polygone",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["polygon", "polygone régulier", "hexagone"],
    fiches: ["DA-01-01", "DA-01-04"],
    aide: { action: "Trace un polygone régulier inscrit par son centre et un sommet.", conditions: "Un niveau et un calque actifs.", exemple: "Tab jusqu'à « Côtés », tapez 8, puis cliquez le centre et un sommet." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(
        ctx,
        {
          nombre: 2,
          parametres: ["cotes"],
          parametresInitiaux: { cotes: 6 },
          controlerParametre: (_c, v) => (Number.isInteger(v) && v >= 3 && v <= 1000 ? null : lisible("Polygone", `${v} côté(s)`, "taper un entier de 3 à 1000")),
          consigne: (e) => (e.points.length === 0 ? "Cliquez le centre du polygone." : "Cliquez un sommet, ou tapez le rayon et l'angle."),
          champs: (e) => [
            { champ: "cotes", libelle: "Côtés", unite: "", valeur: e.parametres.cotes ?? null },
            ...(e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous).map((c) => (c.champ === "longueur" ? { ...c, libelle: "Rayon" } : c))),
          ],
          formes: (e) => {
            const c = e.points[0];
            const s = e.curseur;
            const n = e.parametres.cotes ?? 6;
            if (!c || !s || distance(c, s) === 0) return [];
            return [{ forme: "polygone", points: sommetsPolygone(c, n, distance(c, s), "inscrit", angleDeg(c, s)).map(versPoint), style: "trace" }, coteSegment(c, s)];
          },
          geste: (e) => {
            const [c, s] = e.points as [Vec, Vec];
            return creation(ctx, "esquisse.polygone", { centre: P(c), nombreCotes: e.parametres.cotes ?? 6, rayon: longueur(distance(c, s)), mode: "inscrit", angle: angle(angleDeg(c, s)) }, "Tracer un polygone");
          },
        },
        "creer.polygone",
      ),
  });
}

/** Degré des splines de passage (fiche DA-01-05 : 3 par défaut, proposé). */
export const DEGRE_SPLINE = 3;

export function outilSpline(): DefinitionOutil {
  return definir({
    id: "creer.spline",
    libelle: "Spline",
    famille: "creer",
    niveau: "complet",
    synonymes: ["spline", "courbe", "curve", "bézier"],
    fiches: ["DA-01-01", "DA-01-05"],
    aide: { action: "Trace une courbe lisse par points de passage.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez les points ; double-clic pour finir, premier point pour fermer." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: "libre",
        minimum: 2,
        fermable: true,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le premier point de passage." : "Point suivant ; double-clic pour finir, premier point pour fermer."),
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points.at(-1) ?? null, e.curseur, e.verrous)),
        formes: (e) => {
          const pts = [...e.points, ...(e.curseur ? [e.curseur] : [])];
          if (pts.length < 2) return [];
          return [{ forme: "polyligne", points: courbeSpline(pts, "passage", DEGRE_SPLINE, false).map(versPoint), fermee: false, style: "trace" }, { forme: "polyligne", points: pts.map(versPoint), fermee: false, style: "fantome" }];
        },
        geste: (e, ferme) => creation(ctx, "esquisse.spline", { points: e.points.map(P), mode: "passage", degre: DEGRE_SPLINE, ferme }, "Tracer une spline"),
      }),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Main levée (DA-01-06) : appui → glisse → relâche
// ---------------------------------------------------------------------------------------------------------------

/**
 * Simplification du trait brut : tolérance relative à la taille du trait (1 % de la diagonale de son emprise,
 * au moins `longueurMin`) — les évènements sont en mètres, le zoom n'est pas connu de l'outil ; fermeture
 * automatique si la fin revient à moins de 3 % de la diagonale du début.
 */
export function simplifierTrait(brut: readonly Vec[]): { points: Vec[]; ferme: boolean } {
  const r = emprise(brut);
  if (!r) return { points: [], ferme: false };
  const diag = Math.hypot(r.maxX - r.minX, r.maxY - r.minY);
  let pts = simplifier(brut, Math.max(TOLERANCES.longueurMin, diag * 0.01));
  // Sommets consécutifs confondus retirés (refusés par le réducteur).
  pts = pts.filter((p, i) => i === 0 || distance(p, pts[i - 1] as Vec) > TOLERANCES.longueurMin);
  const premier = pts[0];
  const dernier = pts.at(-1);
  const ferme = pts.length >= 4 && premier !== undefined && dernier !== undefined && distance(premier, dernier) <= diag * 0.03;
  return { points: ferme ? pts.slice(0, -1) : pts, ferme };
}

function sessionMainLevee(ctx: ContexteAtelier): SessionOutil {
  let brut: Vec[] = [];
  let actif = false;
  let erreurs: readonly ErreurLisible[] = [];
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      if (evt.type === "appui") {
        brut = [evt.point];
        actif = true;
        erreurs = [];
      } else if (evt.type === "glisse" && actif) {
        brut.push(evt.point);
      } else if (evt.type === "relache" && actif) {
        actif = false;
        const { points, ferme } = simplifierTrait(brut);
        brut = [];
        if (points.length < 2 || (ferme && points.length < 3)) {
          erreurs = [lisible("Main levée", "trait trop court", "tracer un trait plus long")];
          return { action: "continuer" };
        }
        const lisser = evt.modificateurs.alt;
        const r = creation(ctx, lisser ? "esquisse.spline" : "esquisse.polyligne", lisser ? { points: points.map(P), mode: "passage", degre: DEGRE_SPLINE, ferme } : { points: points.map(P), ferme }, "Dessiner à main levée");
        if ("erreur" in r) {
          erreurs = [r.erreur];
          return { action: "continuer" };
        }
        const ko = controler(ctx, r.commandes);
        if (ko.length > 0) {
          erreurs = ko;
          return { action: "continuer" };
        }
        return { action: "valider", label: r.label, commandes: r.commandes, terminer: false };
      }
      return { action: "continuer" };
    },
    apercu() {
      const formes: FormeApercu[] = brut.length >= 2 ? [{ forme: "polyligne", points: brut.map(versPoint), fermee: false, style: "fantome" }] : [];
      if (brut.length >= 2) {
        const s = simplifierTrait(brut);
        if (s.points.length >= 2) formes.push({ forme: "polyligne", points: s.points.map(versPoint), fermee: s.ferme, style: "trace" }, { forme: "texte", position: versPoint(brut.at(-1) as Vec), texte: `${s.points.length} sommets`, style: "cote" });
      }
      return { formes, champs: [], consigne: actif ? "Tracez, puis relâchez (Alt au relâcher : courbe lissée)." : "Appuyez et tracez à main levée.", erreurs };
    },
    abandonner() {
      brut = [];
      actif = false;
      erreurs = [];
    },
  };
}

export function outilMainLevee(): DefinitionOutil {
  return definir({
    id: "creer.main-levee",
    libelle: "Main levée",
    famille: "creer",
    niveau: "complet",
    synonymes: ["freehand", "crayon", "sketch", "croquis"],
    fiches: ["DA-01-06"],
    aide: { action: "Trace à main levée, simplifié en polyligne (ou courbe lissée avec Alt).", conditions: "Un niveau et un calque actifs.", exemple: "Appuyez, tracez, relâchez : la polyligne simplifiée est créée." },
    activation: activationCreation,
    commencer: sessionMainLevee,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Axe et ligne de construction (DA-01-10)
// ---------------------------------------------------------------------------------------------------------------

export function outilAxe(): DefinitionOutil {
  return definir({
    id: "creer.axe",
    libelle: "Axe",
    famille: "creer",
    niveau: "complet",
    synonymes: ["centerline", "axe de symétrie", "cl", "ligne d'axe"],
    fiches: ["DA-01-10"],
    aide: { action: "Trace une ligne d'axe (trait mixte, imprimable) entre deux points.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez les deux extrémités de l'axe." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le début de l'axe." : "Cliquez la fin de l'axe."),
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous)),
        formes: (e) => formesSuite(e),
        geste: (e) => creation(ctx, "esquisse.construction", { nature: "axe", a: P(e.points[0] as Vec), b: P(e.points[1] as Vec) }, "Tracer un axe"),
      }),
  });
}

export function outilConstruction(): DefinitionOutil {
  return definir({
    id: "creer.construction",
    libelle: "Ligne de construction",
    famille: "creer",
    niveau: "complet",
    synonymes: ["xline", "construction", "droite infinie", "ligne de rappel"],
    fiches: ["DA-01-10"],
    aide: { action: "Trace une droite d'aide (non imprimée) par un point et une direction.", conditions: "Un niveau et un calque actifs.", exemple: "Cliquez un point, puis la direction ; Alt : demi-droite." },
    activation: activationCreation,
    commencer: (ctx) =>
      sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez un point de la ligne." : "Cliquez la direction, ou tapez l'angle (Alt : demi-droite)."),
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous).filter((c) => c.champ === "angle")),
        formes: (e) => {
          const a = e.points[0];
          const b = e.curseur;
          if (!a || !b || distance(a, b) === 0) return [];
          const dir = angleDeg(a, b);
          return [trace(e.modificateurs.alt ? a : polaire(a, -1000, dir), polaire(a, 1000, dir))];
        },
        geste: (e) => {
          const [a, b] = e.points as [Vec, Vec];
          return creation(ctx, "esquisse.construction", { nature: "construction", point: P(a), direction: angle(angleDeg(a, b)), etendue: e.modificateurs.alt ? "demi-droite" : "droite" }, "Tracer une ligne de construction");
        },
      }),
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Hachure (DA-01-11)
// ---------------------------------------------------------------------------------------------------------------

/** Motifs proposés (contenu initial neutre, sans prétention normative ; le réducteur ne contrôle pas `motifId`). */
export const MOTIFS_HACHURE = ["lignes", "croisees", "plein", "points"] as const;

/** Classes dont le contour (polygonal, exact) peut être copié dans une hachure. */
const CLASSES_CONTOUR = new Set(["esquisse.polyligne", "esquisse.rectangle", "esquisse.polygone", "esquisse.hachure", "dalle", "toiture", "piece", "espace", "zone", "solide", "reference-plan"]);

interface Profil {
  readonly contour: readonly Vec[];
  readonly trous: readonly (readonly Vec[])[];
  readonly sources: readonly IdObjet[];
}

/**
 * Analyse de profil (DA-01-09) : parmi des contours fermés, le contour extérieur est celui qui contient le point
 * désigné (le plus petit) ou, sans point, le plus grand ; les trous sont les autres contours strictement inclus.
 */
export function analyserProfil(contours: readonly { id: IdObjet; contour: readonly Vec[] }[], point: Vec | null): Profil | null {
  const tries = [...contours].filter((c) => c.contour.length >= 3).sort((a, b) => Math.abs(aireSignee(a.contour)) - Math.abs(aireSignee(b.contour)));
  const exterieur = point ? tries.find((c) => pointDansPolygone(point, c.contour)) : tries.at(-1);
  if (!exterieur) return null;
  const trous = tries.filter((c) => c !== exterieur && Math.abs(aireSignee(c.contour)) < Math.abs(aireSignee(exterieur.contour)) && c.contour.every((p) => pointDansPolygone(p, exterieur.contour)) && (!point || !pointDansPolygone(point, c.contour)));
  return { contour: exterieur.contour, trous: trous.map((t) => t.contour), sources: [exterieur.id, ...trous.map((t) => t.id)] };
}

export function outilHachure(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "creer.hachure",
    libelle: "Hachure",
    famille: "creer",
    niveau: "complet",
    synonymes: ["hatch", "motif", "remplissage", "h"],
    fiches: ["DA-01-09", "DA-01-11"],
    aide: { action: "Remplit un contour fermé (avec ses trous) d'un motif de lignes.", conditions: "Un niveau, un calque et des contours fermés.", exemple: "Tapez l'espacement 0,2, Tab, l'angle 45, puis cliquez à l'intérieur du contour." },
    activation: activationCreation,
    commencer: (ctx) => {
      const contoursCandidats = (): { id: IdObjet; contour: readonly Vec[] }[] => {
        const etat = ctx.etat();
        const niveau = ctx.niveauActif();
        if (!etat || !niveau) return [];
        const selection = ctx.selection.lire().ids;
        const ids = selection.length > 0 ? selection : Object.values(etat.objets).filter((o) => o.niveauId === niveau).map((o) => o.id);
        return dessinsDe(deps, etat, ids)
          .filter((d) => d.contour && CLASSES_CONTOUR.has(etat.objets[d.objetId]?.classe ?? ""))
          .map((d) => ({ id: d.objetId, contour: d.contour as readonly Vec[] }));
      };
      const profilEn = (p: Vec | null) => analyserProfil(contoursCandidats(), ctx.selection.lire().ids.length > 0 ? null : p);
      return sessionPoints(
        ctx,
        {
          nombre: 1,
          parametres: ["espacement", "angle"],
          controlerParametre: (c, v) => (c === "espacement" && !(v >= TOLERANCES.longueurMin) ? lisible("Espacement", `${v} m`, `taper au moins ${TOLERANCES.longueurMin} m`) : null),
          consigne: (e) =>
            e.parametres.espacement === undefined || e.parametres.angle === undefined
              ? "Tapez l'espacement (m), Tab, puis l'angle (°) du motif."
              : ctx.selection.lire().ids.length > 0
                ? "Cliquez ou Entrée pour hachurer les contours sélectionnés."
                : "Cliquez à l'intérieur du contour à hachurer.",
          champs: (e) => [
            { champ: "espacement", libelle: "Espacement", unite: "m", valeur: e.parametres.espacement ?? null },
            { champ: "angle", libelle: "Angle du motif", unite: "°", valeur: e.parametres.angle ?? null },
          ],
          contraindre: (_e, brut) => brut,
          formes: (e) => {
            const pr = profilEn(e.curseur);
            if (!pr) return [];
            return [{ forme: "polygone", points: pr.contour.map(versPoint), style: "fantome" }, ...pr.trous.map((t): FormeApercu => ({ forme: "polygone", points: t.map(versPoint), style: "erreur" })), { forme: "texte", position: versPoint(pr.contour[0] as Vec), texte: `${formaterValeur(Math.abs(aireSignee(pr.contour)) - pr.trous.reduce((s, t) => s + Math.abs(aireSignee(t)), 0), "")} m² nets`, style: "cote" }];
          },
          geste: (e) => {
            const { espacement, angle: a } = e.parametres;
            if (espacement === undefined || a === undefined) return { erreur: lisible("Hachure", "espacement ou angle non saisi", "taper l'espacement puis l'angle du motif") };
            const pr = profilEn(e.points[0] ?? null);
            if (!pr) return { erreur: lisible("Hachure", "aucun contour fermé à cet endroit", "cliquer à l'intérieur d'une polyligne fermée, d'un rectangle ou d'un polygone") };
            return creation(ctx, "esquisse.hachure", { contour: pr.contour.map(P), trous: pr.trous.map((t) => ({ polygone: t.map(P) })), motifId: "lignes", angle: angle(a), espacement: longueur(espacement) }, "Hachurer");
          },
        },
        "creer.hachure",
      );
    },
  });
}

/** Tous les outils d'esquisse de `plan2d`. */
export function outilsEsquisse(deps: DependancesOutils): DefinitionOutil[] {
  return [outilLigne(), outilPolyligne(), outilArc(), outilCercle(), outilRectangle(), outilPolygone(), outilSpline(), outilMainLevee(), outilAxe(), outilConstruction(), outilHachure(deps)];
}
