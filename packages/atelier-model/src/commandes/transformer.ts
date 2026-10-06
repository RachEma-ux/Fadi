/**
 * Transformations (DA-02) comme commandes réversibles sur une sélection : déplacer, copier, tourner, miroir,
 * échelle, répéter, décaler, étirer, ajuster, prolonger, décomposer, points de contrôle, raccorder, chanfreiner.
 * Règles (D-012) : une ouverture suit son mur et ne se transforme pas seule ; copier / répéter / décaler un mur
 * emporte des copies de ses ouvertures sans `repere`, `exterieur` ni `statutConception` ; l'échelle est uniforme,
 * ne touche pas aux dimensions typées et refuse les escaliers ; un miroir en place d'un mur met « à réparer »
 * les références à ses faces ; étirer conserve la distance des ouvertures à l'extrémité fixe.
 */
import { genererReseau, grouperReseau, lireParametresReseau, nomReseau } from "./reseau-associatif.js";
import { decomposerBloc } from "./bloc.js";
import { ajusterForme, estFormeFermee } from "./ajuster-forme.js";
import { validerParams } from "./validation.js";
import { add, decalerPolyligneArcs, dot, pointsArc, pointsEllipse, pointsPolyligne, centreRenflement, longueurAxeMur, decalerArrondi, decalerContour, distance, intersectionSegments, mul, normalise, pointsSpline, projectionSurSegment, sub, transformerPoint2, type Transformation, type Vec } from "../geometrie.js";
import type { Contour, ModeleAtelier, Occurrence, OccurrenceQuelconque, Reference } from "../modele.js";
import { niveauxOrdonnes, ouverturesDuMur, referencesVers } from "../modele.js";
import { estOuverture } from "../ontologie.js";
import { pt, TOLERANCE_REDUCTEUR, type Point2 } from "../unites.js";
import { ErreurCommande, effetsVides, fusionnerEffets, lire, nouveauProbleme, type ContexteCommande, type Effets, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

function cibles(etat: ModeleAtelier, p: Brut, cibl: string[]): OccurrenceQuelconque[] {
  const ids = Array.isArray(p["cibles"]) ? (p["cibles"] as string[]) : cibl;
  if (ids.length === 0) throw new ErreurCommande("invalide", "cibles", "sélection vide");
  const out: OccurrenceQuelconque[] = [];
  for (const id of ids) {
    const o = etat.objets[id];
    if (!o) throw new ErreurCommande("precondition", "cibles", `objet inconnu : ${id}`);
    const calque = o.calqueId ? etat.calques[o.calqueId] : null;
    if (calque?.verrouille) throw new ErreurCommande("precondition", "cibles", `calque verrouillé : ${calque.nom}`);
    out.push(o);
  }
  // Les ouvertures suivent leur mur : seules si leur hôte est dans la sélection.
  for (const o of out) {
    if (estOuverture(o.classe) && !ids.includes((o as Occurrence<"porte">).params.murHoteId)) {
      throw new ErreurCommande("precondition", "cibles", `${o.id} est une ouverture : elle suit son mur ${(o as Occurrence<"porte">).params.murHoteId} (utiliser ouverture.deplacer)`);
    }
  }
  return out;
}

const contourT = (c: Contour, t: Transformation): Contour => ({ contour: c.contour.map((q) => transformerPoint2(q, t)), trous: c.trous.map((h) => h.map((q) => transformerPoint2(q, t))) });

const axeMiroir = (t: { a: { x: number; y: number }; b: { x: number; y: number } }) => (Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) * 180) / Math.PI;

/** Applique une transformation géométrique aux paramètres d'une occurrence (sans toucher aux dimensions typées). */
export function transformerOccurrence(o: OccurrenceQuelconque, t: Transformation): OccurrenceQuelconque {
  if (t.type === "echelle" && t.facteurY !== undefined) return echelleNonUniforme(o, t as Transformation & { type: "echelle"; facteurY: number });
  const T = (q: Point2) => transformerPoint2(q, t);
  const rot = t.type === "rotation" ? t.angleDeg : 0;
  switch (o.classe) {
    case "mur":
      // Mur courbe (D-086) : le miroir inverse le sens de l'arc.
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b), ...(o.params.renflement && t.type === "miroir" ? { renflement: -o.params.renflement } : {}) } };
    case "porte":
      // Le miroir change le côté d'ouverture d'une porte dont le sens est renseigné (D-037).
      if (t.type === "miroir" && o.params.ouvrant) return { ...o, params: { ...o.params, ouvrant: { ...o.params.ouvrant, cote: o.params.ouvrant.cote === "gauche" ? "droite" : "gauche" } } };
      return o;
    case "fenetre":
    case "ouverture":
      return o;
    case "dalle": {
      // Dalle inclinée (D-140) : la direction de montée suit la rotation ou le miroir.
      const pe = o.params.pente;
      const pente = pe ? { ...pe, direction: { value: t.type === "rotation" ? Math.round((pe.direction.value + rot) * 1e9) / 1e9 : t.type === "miroir" ? Math.round((2 * axeMiroir(t) - pe.direction.value) * 1e9) / 1e9 : pe.direction.value, unit: "deg" as const } } : undefined;
      return { ...o, params: { ...o.params, ...contourT(o.params, t), ...(pente ? { pente } : {}) } };
    }
    case "toiture":
    case "zone":
    case "solide":
    case "reference-plan":
      return { ...o, params: { ...o.params, ...contourT(o.params, t) } } as OccurrenceQuelconque;
    case "piece":
      return { ...o, params: { ...o.params, ...contourT(o.params, t), etiquette: o.params.etiquette ? T(o.params.etiquette) : null } };
    case "espace":
      return { ...o, params: { ...o.params, polygones: o.params.polygones.map((c) => contourT(c, t)), etiquette: o.params.etiquette ? T(o.params.etiquette) : null } };
    case "escalier":
      // Échelle (D-088) : l'axe est mis à l'échelle, les dimensions typées (largeur, hauteur à franchir, contremarches)
      // sont gardées comme pour les murs ; le giron suit la longueur ; aucune règle de confort appliquée.
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } };
    case "poteau": {
      if (t.type !== "miroir") return { ...o, params: { ...o.params, point: T(o.params.point), angle: { value: o.params.angle.value + rot, unit: "deg" } } };
      // Symétrie (D-146) : image = rotation (2φ − θ) ∘ retournement de l'axe local y. Rectangle, cercle, I : invariants ;
      // T et U (symétriques selon x → −x) : demi-tour en plus ; L (sans symétrie) : section retournée (`miroir`).
      const profile = !!o.params.epaisseurProfil;
      const demiTour = profile && (o.params.formeId === "T" || o.params.formeId === "U") ? 180 : 0;
      const angle = Math.round(((((2 * axeMiroir(t) - o.params.angle.value + demiTour + 180) % 360) + 360) % 360 - 180) * 1e9) / 1e9;
      const { miroir: _m, ...reste } = o.params;
      const retourne = profile && o.params.formeId === "L" ? !o.params.miroir : !!o.params.miroir;
      return { ...o, params: { ...reste, point: T(o.params.point), angle: { value: angle, unit: "deg" }, ...(retourne ? { miroir: true as const } : {}) } };
    }
    case "esquisse": {
      const q = o.params;
      // Un rectangle (deux coins, côtés parallèles aux axes) tourné ou symétrisé devient un polygone (D-046).
      if (q.forme === "rectangle" && q.points.length === 2 && (t.type === "rotation" || t.type === "miroir")) {
        const [a, b] = q.points as [Point2, Point2];
        return { ...o, params: { ...q, forme: "polygone", ferme: true, points: [pt(a.x, a.y), pt(b.x, a.y), pt(b.x, b.y), pt(a.x, b.y)].map(T) } };
      }
      // Angles des arcs et orientation des ellipses suivent la rotation ou le miroir.
      const plus = (x: { value: number; unit: "deg" } | null | undefined, d: number) => (x ? { value: Math.round((x.value + d) * 1e9) / 1e9, unit: "deg" as const } : x);
      let angleDebut = q.angleDebut;
      let angleFin = q.angleFin;
      let rotation = q.rotation;
      if (t.type === "rotation") {
        angleDebut = plus(angleDebut, rot) ?? null;
        angleFin = plus(angleFin, rot) ?? null;
        rotation = plus(rotation, rot);
      } else if (t.type === "miroir") {
        const axe = (Math.atan2(t.b.y - t.a.y, t.b.x - t.a.x) * 180) / Math.PI;
        const refl = (x: { value: number; unit: "deg" } | null | undefined) => (x ? { value: Math.round((2 * axe - x.value) * 1e9) / 1e9, unit: "deg" as const } : x);
        [angleDebut, angleFin] = [refl(q.angleFin) ?? null, refl(q.angleDebut) ?? null];
        rotation = refl(rotation);
      }
      const k = t.type === "echelle" ? t.facteur : 1;
      const ech = (x: { value: number; unit: "m" } | null | undefined) => (x && k !== 1 ? { value: x.value * k, unit: "m" as const } : x);
      // Segments en arc (D-063) : le miroir inverse le sens de chaque arc ; les autres transformations le gardent.
      const renflements = q.renflements && t.type === "miroir" ? q.renflements.map((x) => (x === 0 ? 0 : -x)) : q.renflements;
      // Tangentes de courbe (D-082) : partie linéaire de la transformation (vecteurs).
      const tangentes = q.tangentes ? q.tangentes.map((v) => (v ? (() => { const a = T(pt(0, 0)); const b = T(pt(v.x, v.y)); return { x: Math.round((b.x - a.x) * 1e9) / 1e9, y: Math.round((b.y - a.y) * 1e9) / 1e9 }; })() : null)) : undefined;
      // Axe associé (D-132) : sa direction suit la rotation ou le miroir (le suivi le recale sur le centre).
      const axeDe = q.axeDe ? { ...q.axeDe, angle: t.type === "rotation" ? Math.round((q.axeDe.angle + rot) * 1e9) / 1e9 : t.type === "miroir" ? Math.round((2 * axeMiroir(t) - q.axeDe.angle) * 1e9) / 1e9 : q.axeDe.angle, debord: t.type === "echelle" ? q.axeDe.debord * t.facteur : q.axeDe.debord } : undefined;
      // Lignes de motif importé (D-121) : angles tournés ou réfléchis, pas mis à l'échelle.
      const motifLignes = q.motifLignes?.map((f) => ({ angle: t.type === "rotation" ? Math.round((f.angle + rot) * 1e9) / 1e9 : t.type === "miroir" ? Math.round((2 * axeMiroir(t) - f.angle) * 1e9) / 1e9 : f.angle, pas: t.type === "echelle" ? f.pas * t.facteur : f.pas }));
      // Dégradé (D-120) : sa direction suit la rotation ou le miroir.
      const degrade = q.degrade ? { ...q.degrade, angle: t.type === "rotation" ? plus(q.degrade.angle, rot)! : t.type === "miroir" ? { value: Math.round((2 * axeMiroir(t) - q.degrade.angle.value) * 1e9) / 1e9, unit: "deg" as const } : q.degrade.angle } : undefined;
      return { ...o, params: { ...q, ...(tangentes ? { tangentes } : {}), ...(degrade ? { degrade } : {}), ...(motifLignes ? { motifLignes } : {}), ...(axeDe ? { axeDe } : {}), points: q.points.map(T), centre: q.centre ? T(q.centre) : null, rayon: ech(q.rayon) ?? null, angleDebut, angleFin, ...(q.forme === "ellipse" ? { rayonB: ech(q.rayonB) ?? null, rotation: rotation ?? null } : {}), ...(renflements ? { renflements } : {}) } };
    }
    case "cotation":
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } };
    case "texte": {
      // Orientation (D-146) : suit la rotation ; au miroir, réfléchie puis ramenée lisible (]−90°, 90°]).
      const a0 = o.params.angle?.value ?? 0;
      let a = t.type === "rotation" ? a0 + rot : t.type === "miroir" ? 2 * axeMiroir(t) - a0 : a0;
      if (t.type === "miroir") {
        a = ((((a + 180) % 360) + 360) % 360) - 180;
        if (a > 90 + 1e-9) a -= 180;
        else if (a <= -90 + 1e-9) a += 180;
      }
      a = Math.round((((((a + 180) % 360) + 360) % 360) - 180) * 1e9) / 1e9;
      const { angle: _a, ...reste } = o.params;
      return { ...o, params: { ...reste, position: T(o.params.position), ...(a ? { angle: { value: a, unit: "deg" as const } } : {}) } };
    }
    case "etiquette":
      return { ...o, params: { ...o.params, position: T(o.params.position) } } as OccurrenceQuelconque;
    case "bloc-occurrence": {
      // Miroir (D-071) : symétrie d'axe φ ∘ rotation θ ∘ retournement m = rotation (2φ − θ) ∘ retournement (1 − m).
      if (t.type === "miroir") {
        const { miroir: _m, ...reste } = o.params;
        return { ...o, params: { ...reste, position: T(o.params.position), angle: { value: Math.round((2 * axeMiroir(t) - o.params.angle.value) * 1e9) / 1e9, unit: "deg" }, ...(o.params.miroir ? {} : { miroir: true as const }) } };
      }
      return { ...o, params: { ...o.params, position: T(o.params.position), angle: { value: o.params.angle.value + rot, unit: "deg" }, echelle: t.type === "echelle" ? o.params.echelle * t.facteur : o.params.echelle } };
    }
    case "garde-corps":
      return { ...o, params: { ...o.params, points: o.params.points.map(T) } };
    case "objet-importe": {
      const pos = [...o.params.maillage.positions];
      for (let i = 0; i < pos.length; i += 3) {
        const q = T(pt(pos[i]!, pos[i + 1]!));
        pos[i] = q.x;
        pos[i + 1] = q.y;
        if (t.type === "echelle") pos[i + 2] = pos[i + 2]! * t.facteur;
      }
      return { ...o, params: { ...o.params, maillage: { ...o.params.maillage, positions: pos }, empreinte: o.params.empreinte.map(T) } };
    }
  }
}

/**
 * Échelle non uniforme (D-145, DA-02-05) : facteurs fx, fy autour d'un centre. Les dimensions typées (épaisseurs,
 * largeurs, hauteurs) sont gardées comme pour l'échelle uniforme ; seules les positions et les tracés changent.
 * Refusée, en nommant l'objet, pour ce qui ne garde pas sa nature : arc, segment en arc, ellipse tournée en biais,
 * mur courbe, occurrence de bloc (échelle scalaire), objet importé (maillage), hachure à motif importé.
 */
function echelleNonUniforme(o: OccurrenceQuelconque, t: Transformation & { type: "echelle"; facteurY: number }): OccurrenceQuelconque {
  const T = (q: Point2) => transformerPoint2(q, t);
  const fx = t.facteur;
  const fy = t.facteurY;
  const refus = (motif: string) => new ErreurCommande("precondition", "facteurY", `${o.id} : ${motif} — échelle non uniforme refusée`);
  // Direction (degrés) transformée par la partie linéaire.
  const dir = (deg: number) => { const r = (deg * Math.PI) / 180; return Math.round(((Math.atan2(Math.sin(r) * fy, Math.cos(r) * fx) * 180) / Math.PI) * 1e9) / 1e9; };
  switch (o.classe) {
    case "mur":
      if (o.params.renflement) throw refus("mur courbe (l'arc ne resterait pas un arc)");
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } };
    case "bloc-occurrence":
      throw refus("occurrence de bloc (échelle scalaire)");
    case "objet-importe":
      throw refus("représentation importée");
    case "esquisse": {
      const q = o.params;
      if (q.forme === "arc") throw refus("arc");
      if (q.renflements?.some((x) => x !== 0)) throw refus("segment en arc");
      if (q.motifLignes) throw refus("hachure à motif importé");
      let forme = q.forme;
      let rayon = q.rayon;
      let rayonB = q.rayonB ?? null;
      let rotation = q.rotation ?? null;
      if (q.forme === "cercle" || q.forme === "ellipse") {
        const rot = q.forme === "ellipse" ? (rotation?.value ?? 0) : 0;
        const droit = Math.abs(((rot % 90) + 90) % 90) < 1e-9 || Math.abs((((rot % 90) + 90) % 90) - 90) < 1e-9;
        if (!droit) throw refus("ellipse tournée en biais");
        // Demi-axes le long de x et de y avant échelle, puis grand axe / petit axe après.
        const r = q.rayon!.value;
        const rb = q.forme === "ellipse" ? q.rayonB!.value : r;
        const surX = q.forme === "cercle" || Math.abs(((rot % 180) + 180) % 180) < 1e-9;
        const ax = (surX ? r : rb) * fx;
        const ay = (surX ? rb : r) * fy;
        forme = "ellipse";
        rayon = { value: Math.round(Math.max(ax, ay) * 1e9) / 1e9, unit: "m" };
        rayonB = { value: Math.round(Math.min(ax, ay) * 1e9) / 1e9, unit: "m" };
        rotation = { value: ax >= ay ? 0 : 90, unit: "deg" };
      } else if (q.rayon) throw refus(`forme « ${q.forme} » à rayon`);
      const tangentes = q.tangentes ? q.tangentes.map((v) => (v ? { x: Math.round(v.x * fx * 1e9) / 1e9, y: Math.round(v.y * fy * 1e9) / 1e9 } : null)) : undefined;
      const degrade = q.degrade ? { ...q.degrade, angle: { value: dir(q.degrade.angle.value), unit: "deg" as const } } : undefined;
      return { ...o, params: { ...q, forme, ...(tangentes ? { tangentes } : {}), ...(degrade ? { degrade } : {}), points: q.points.map(T), centre: q.centre ? T(q.centre) : null, rayon, ...(forme === "ellipse" ? { rayonB, rotation } : {}) } } as OccurrenceQuelconque;
    }
    case "dalle": {
      const pe = o.params.pente;
      const pente = pe ? { ...pe, direction: { value: dir(pe.direction.value), unit: "deg" as const } } : undefined;
      return { ...o, params: { ...o.params, ...contourT(o.params, t), ...(pente ? { pente } : {}) } };
    }
    default:
      // Contours, axes, points d'insertion : transformation affine des positions, dimensions typées gardées.
      return affine(o, T, fx, fy);
  }
}

/** Positions d'une occurrence transformées par T (classes à contour, axe ou point, sans paramètre d'orientation). */
function affine(o: OccurrenceQuelconque, T: (q: Point2) => Point2, fx0: number, fy0: number): OccurrenceQuelconque {
  const c = (x: Contour): Contour => ({ contour: x.contour.map(T), trous: x.trous.map((h) => h.map(T)) });
  switch (o.classe) {
    case "toiture":
    case "zone":
    case "solide":
    case "reference-plan":
      return { ...o, params: { ...o.params, ...c(o.params) } } as OccurrenceQuelconque;
    case "piece":
      return { ...o, params: { ...o.params, ...c(o.params), etiquette: o.params.etiquette ? T(o.params.etiquette) : null } };
    case "espace":
      return { ...o, params: { ...o.params, polygones: o.params.polygones.map(c), etiquette: o.params.etiquette ? T(o.params.etiquette) : null } };
    case "escalier":
    case "cotation":
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } } as OccurrenceQuelconque;
    case "poteau":
      return { ...o, params: { ...o.params, point: T(o.params.point) } };
    case "texte":
      return { ...o, params: { ...o.params, position: T(o.params.position), ...(o.params.angle ? { angle: { value: Math.round(((Math.atan2(Math.sin((o.params.angle.value * Math.PI) / 180) * fy0, Math.cos((o.params.angle.value * Math.PI) / 180) * fx0) * 180) / Math.PI) * 1e9) / 1e9, unit: "deg" as const } } : {}) } };
    case "etiquette":
      return { ...o, params: { ...o.params, position: T(o.params.position) } } as OccurrenceQuelconque;
    case "garde-corps":
      return { ...o, params: { ...o.params, points: o.params.points.map(T) } };
    default:
      return o; // ouvertures : elles suivent leur mur (position relative)
  }
}

function lireTransformation(p: Brut, type: "translation" | "rotation" | "miroir" | "echelle"): Transformation {
  switch (type) {
    case "translation": {
      const dx = lire.nombre(p, "dx")!;
      const dy = lire.nombre(p, "dy")!;
      return { type, dx, dy };
    }
    case "rotation":
      return { type, centre: lire.point(p, "centre")!, angleDeg: lire.angle(p, "angle")!.value };
    case "miroir": {
      const a = lire.point(p, "a")!;
      const b = lire.point(p, "b")!;
      if (distance(a, b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "b", "axe de miroir de longueur nulle");
      return { type, a, b };
    }
    case "echelle": {
      const facteur = lire.nombre(p, "facteur", { min: 1e-6 })!;
      // Échelle non uniforme (D-145) : facteurY distinct de facteur (sinon, échelle uniforme).
      const facteurY = p["facteurY"] === undefined || p["facteurY"] === null ? undefined : lire.nombre(p, "facteurY", { min: 1e-6 })!;
      return { type, centre: lire.point(p, "centre")!, facteur, ...(facteurY !== undefined && Math.abs(facteurY - facteur) > 1e-12 ? { facteurY } : {}) };
    }
  }
}

function appliquerEnPlace(etat: ModeleAtelier, selection: OccurrenceQuelconque[], t: Transformation, ctx: ContexteCommande): ResultatCommande {
  const objets = { ...etat.objets };
  let references = etat.references;
  let problemes = etat.problemes;
  const effets: Effets = effetsVides();
  for (const o of selection) {
    if (estOuverture(o.classe)) continue;
    objets[o.id] = transformerOccurrence(objets[o.id] ?? o, t);
    effets.modifies.push(o.id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    if (t.type === "miroir" && o.classe === "mur") {
      // Sens d'ouverture des portes hébergées (D-037) : le miroir change le côté d'ouverture.
      for (const x of Object.values(objets)) {
        if (x.classe !== "porte" || x.params.murHoteId !== o.id || !x.params.ouvrant) continue;
        objets[x.id] = { ...x, params: { ...x.params, ouvrant: { ...x.params.ouvrant, cote: x.params.ouvrant.cote === "gauche" ? "droite" : "gauche" } } };
        if (!effets.modifies.includes(x.id)) effets.modifies.push(x.id);
      }
      for (const ref of referencesVers(etat, o.id)) {
        if (ref.caracteristique === "face-gauche" || ref.caracteristique === "face-droite") {
          const inverse = ref.caracteristique === "face-gauche" ? "face-droite" : "face-gauche";
          const reparee: Reference = { ...ref, etat: "a-reparer", propositions: [{ objetId: o.id, caracteristique: inverse }] };
          references = { ...references, [ref.id]: reparee };
          const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", ref.proprietaireId, `miroir du mur ${o.id} : la face référencée a changé de sens — à réparer`);
          problemes = { ...problemes, [pb.id]: pb };
          effets.problemes.push(pb);
          effets.referencesAReparer.push(ref.id);
        }
      }
    }
  }
  return { etat: { ...etat, objets, references, problemes }, effets };
}

/** Copie d'une sélection (nouveaux identifiants, ouvertures des murs copiées avec hôte remappé). */
export function copier(etat: ModeleAtelier, selection: OccurrenceQuelconque[], t: Transformation, ctx: ContexteCommande): ResultatCommande {
  const objets = { ...etat.objets };
  const effets = effetsVides();
  const nouveauxIds = new Map<string, string>();
  const ids = new Set(selection.map((o) => o.id));
  const aCopier: OccurrenceQuelconque[] = [];
  for (const o of selection) {
    if (estOuverture(o.classe)) continue;
    aCopier.push(o);
    if (o.classe === "mur") for (const ouv of ouverturesDuMur(etat, o.id)) if (!ids.has(ouv.id)) aCopier.push(ouv);
  }
  for (const o of selection) if (estOuverture(o.classe) && !aCopier.includes(o)) aCopier.push(o);
  for (const o of aCopier) nouveauxIds.set(o.id, ctx.ids.nouveau(o.classe));
  for (const o of aCopier) {
    const id = nouveauxIds.get(o.id)!;
    // Une copie est libre : le verrou (D-052) tient l'original, pas ses copies.
    const { verrouille: _v, ...libre } = o;
    void _v;
    let copie = transformerOccurrence({ ...libre, id } as OccurrenceQuelconque, t);
    if (copie.classe === "mur") copie = { ...copie, params: { ...copie.params, exterieur: false } };
    if (estOuverture(copie.classe)) {
      const c = copie as Occurrence<"porte">;
      copie = { ...c, params: { ...c.params, murHoteId: nouveauxIds.get(c.params.murHoteId) ?? c.params.murHoteId, repere: null } } as OccurrenceQuelconque;
    }
    if (copie.classe === "poteau") copie = { ...copie, params: { ...copie.params, statutConception: null } };
    copie = { ...copie, groupeId: null } as OccurrenceQuelconque;
    objets[id] = copie;
    effets.crees.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  }
  return { etat: { ...etat, objets }, effets };
}

/**
 * Réseau 3D (D-122) : les copies créées montent de `k` niveaux (ordre des élévations) ; le niveau haut d'un mur monte
 * d'autant. Un niveau manquant n'est jamais inventé : refus motivé (créer les niveaux d'abord) ; un escalier, refusé.
 */
function etagerCopies(r: ResultatCommande, k: number): ResultatCommande {
  const etat = r.etat;
  const ordre = niveauxOrdonnes(etat).map((n) => n.id);
  const monte = (id: string | null, quoi: string): string => {
    const i = id ? ordre.indexOf(id) : -1;
    if (i < 0) throw new ErreurCommande("precondition", "etages", `${quoi} : objet sans niveau`);
    const cible = ordre[i + k];
    if (!cible) throw new ErreurCommande("precondition", "etages", `${quoi} : il manque ${i + k - ordre.length + 1} niveau(x) au-dessus de « ${etat.niveaux[id!]!.nom} » — créer les niveaux d'abord`);
    return cible;
  };
  const objets = { ...etat.objets };
  const touches = new Set<string>();
  for (const id of r.effets.crees) {
    const o = objets[id];
    if (!o) continue;
    if (o.classe === "escalier") throw new ErreurCommande("precondition", "etages", `${id} : un escalier ne se répète pas d'un niveau à l'autre (niveaux de départ et d'arrivée à redéfinir)`);
    const niveauId = monte(o.niveauId, id);
    touches.add(niveauId);
    if ((o.classe === "mur" || o.classe === "espace") && o.params.niveauHautId) objets[id] = { ...o, niveauId, params: { ...o.params, niveauHautId: monte(o.params.niveauHautId, `${id} (niveau haut)`) } } as OccurrenceQuelconque;
    else objets[id] = { ...o, niveauId } as OccurrenceQuelconque;
  }
  return { etat: { ...etat, objets }, effets: { ...r.effets, niveauxTouches: [...new Set([...r.effets.niveauxTouches, ...touches])] } };
}

/**
 * Vers un autre niveau (D-039, `niveauCible` de `transformer.deplacer` et `transformer.copier`) : les objets visés
 * (déplacés, ou les copies créées) passent sur le niveau cible, les ouvertures suivent leur mur. Refusé pour un
 * escalier (niveaux de départ et d'arrivée à redéfinir) et pour un mur dont le niveau haut ne serait plus au-dessus.
 */
function versNiveau(r: ResultatCommande, ids: readonly string[], niveauCible: string): ResultatCommande {
  const etat = r.etat;
  const cible = etat.niveaux[niveauCible];
  if (!cible) throw new ErreurCommande("precondition", "niveauCible", `niveau inconnu : ${niveauCible}`);
  const objets = { ...etat.objets };
  const touches = new Set<string>();
  const changer = (id: string) => {
    const o = objets[id]!;
    if (o.niveauId === niveauCible) return;
    if (o.niveauId === null) throw new ErreurCommande("precondition", "cibles", `${id} : objet sans niveau`);
    if (o.classe === "escalier") throw new ErreurCommande("precondition", "cibles", `${id} : un escalier ne change pas de niveau (niveaux de départ et d'arrivée à redéfinir)`);
    if ((o.classe === "mur" || o.classe === "espace") && o.params.niveauHautId) {
      const haut = etat.niveaux[o.params.niveauHautId];
      if (haut && haut.elevation <= cible.elevation) throw new ErreurCommande("precondition", "niveauCible", `${o.classe} ${id} : son niveau haut « ${haut.nom} » ne serait plus au-dessus du niveau « ${cible.nom} »`);
    }
    touches.add(o.niveauId);
    changes.push(id);
    objets[id] = { ...o, niveauId: niveauCible } as OccurrenceQuelconque;
  };
  const changes: string[] = [];
  for (const id of ids) {
    const o = objets[id];
    if (!o || estOuverture(o.classe)) continue;
    changer(id);
    if (o.classe === "mur") for (const ouv of Object.values(objets)) if (estOuverture(ouv.classe) && (ouv as Occurrence<"porte">).params.murHoteId === id) changer(ouv.id);
  }
  const effets = { ...r.effets, modifies: [...r.effets.modifies], niveauxTouches: [...new Set([...r.effets.niveauxTouches, ...touches, niveauCible])] };
  for (const id of changes) if (!effets.crees.includes(id) && !effets.modifies.includes(id)) effets.modifies.push(id);
  return { ...r, etat: { ...etat, objets }, effets };
}

export const reducteursTransformer = {
  deplacer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    const r = appliquerEnPlace(etat, sel, lireTransformation(p, "translation"), ctx);
    const niveauCible = lire.chaineOuNull(p, "niveauCible");
    return niveauCible ? versNiveau(r, sel.map((o) => o.id), niveauCible) : r;
  },
  tourner(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    // « copie » : garder l'original et tourner une copie (D-043).
    const sel = cibles(etat, p, c);
    const t = lireTransformation(p, "rotation");
    return lire.booleen(p, "copie", false) ? copier(etat, sel, t, ctx) : appliquerEnPlace(etat, sel, t, ctx);
  },
  miroir(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    const t = lireTransformation(p, "miroir");
    return lire.booleen(p, "copie", false) ? copier(etat, sel, t, ctx) : appliquerEnPlace(etat, sel, t, ctx);
  },
  echelle(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    const t = lireTransformation(p, "echelle");
    if (lire.booleen(p, "copie", false)) {
      return copier(etat, sel, t, ctx);
    }
    return appliquerEnPlace(etat, sel, t, ctx);
  },
  copier(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    // Copies multiples à pas irréguliers (D-043) : `vecteurs` = liste de décalages, une copie par décalage, un seul lot.
    if (Array.isArray(p["vecteurs"])) {
      const sel = cibles(etat, p, c);
      const vecteurs = p["vecteurs"] as unknown[];
      if (vecteurs.length < 1 || vecteurs.length > 200) throw new ErreurCommande("invalide", "vecteurs", "de 1 à 200 décalages { dx, dy }");
      let courant = etat;
      let effets = effetsVides();
      vecteurs.forEach((v, i) => {
        const b = (v ?? {}) as Brut;
        if (typeof b["dx"] !== "number" || typeof b["dy"] !== "number" || !Number.isFinite(b["dx"]) || !Number.isFinite(b["dy"])) throw new ErreurCommande("invalide", `vecteurs[${i}]`, "décalage { dx, dy } en mètres attendu");
        const r = copier(courant, sel, { type: "translation", dx: b["dx"], dy: b["dy"] }, ctx);
        courant = r.etat;
        effets = fusionnerEffets(effets, r.effets);
      });
      const niveauCible = lire.chaineOuNull(p, "niveauCible");
      const r = codesDesCopies({ etat: courant, effets }, p);
      return niveauCible ? versNiveau(r, r.effets.crees, niveauCible) : r;
    }
    const r = codesDesCopies(copier(etat, cibles(etat, p, c), lireTransformation(p, "translation"), ctx), p);
    const niveauCible = lire.chaineOuNull(p, "niveauCible");
    return niveauCible ? versNiveau(r, r.effets.crees, niveauCible) : r;
  },
  repeter(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    if (p["trajetId"] !== undefined && p["trajetId"] !== null) return repeterSurTrajet(etat, sel, p, ctx);
    // Réseau associatif (D-115) : paramètres gardés dans un groupe qui réunit les copies.
    if (lire.booleen(p, "associatif", false)) {
      if (p["etages"] !== undefined && p["etages"] !== null) throw new ErreurCommande("invalide", "etages", "réseau associatif : dans le plan seulement (réseau sur les niveaux : non associatif)");
      const params = lireParametresReseau(p, sel.map((o) => o.id));
      const gen = genererReseau(etat, params, ctx, copier);
      const gid = ctx.ids.nouveau("groupe");
      const etatG = grouperReseau(gen.etat, { id: gid, nom: nomReseau(params), reseau: { ...params, copies: gen.copies } }, gen.copies);
      return { etat: etatG, effets: { ...gen.effets, crees: [...gen.effets.crees, gid] } };
    }
    // Réseau 3D (D-122) : `etages` = nombre de niveaux au-dessus qui reçoivent chacun une copie de l'ensemble.
    const etages = p["etages"] === undefined || p["etages"] === null ? 0 : lire.nombre(p, "etages", { entier: true, min: 1, max: 50 })!;
    const nombre = lire.nombre(p, "nombre", { entier: true, min: etages ? 0 : 1, max: 500 })!;
    const centre = lire.point(p, "centre", { optionnel: true });
    let courant = etat;
    let effets = effetsVides();
    for (let i = 1; i <= nombre; i++) {
      const t: Transformation = centre ? { type: "rotation", centre, angleDeg: lire.angle(p, "angle")!.value * i } : { type: "translation", dx: lire.nombre(p, "dx")! * i, dy: lire.nombre(p, "dy")! * i };
      const r = copier(courant, sel, t, ctx);
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
    }
    if (etages) {
      const plan = [...sel, ...effets.crees.map((id) => courant.objets[id]!).filter((o) => !estOuverture(o.classe))];
      for (let k = 1; k <= etages; k++) {
        const r = copier(courant, plan, { type: "translation", dx: 0, dy: 0 }, ctx);
        const e = etagerCopies(r, k);
        courant = e.etat;
        effets = fusionnerEffets(effets, e.effets);
      }
    }
    return { etat: courant, effets };
  },
  decaler(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    // Série de distances (D-049) : une copie par distance, chacune mesurée depuis l'original.
    let distances: number[];
    if (Array.isArray(p["distances"])) {
      const brut = p["distances"] as unknown[];
      if (!brut.length || brut.length > 50 || !brut.every((x) => typeof x === "number" && Number.isFinite(x) && x > 0)) throw new ErreurCommande("invalide", "distances", "distances : de 1 à 50 longueurs positives (m)");
      distances = brut as number[];
    } else distances = [lire.longueur(p, "distance")!.value];
    const cote = lire.enumeration(p, "cote", ["gauche", "droite", "exterieur", "interieur"] as const, "gauche");
    const signe = cote === "gauche" || cote === "exterieur" ? 1 : -1;
    // Angles arrondis (D-064) : esquisses seulement (segments en arc de polyligne, D-063).
    const arrondis = lire.enumeration(p, "angles", ["vifs", "arrondis"] as const, "vifs") === "arrondis";
    let courant = etat;
    let effets = effetsVides();
    const copieAvec = (o: OccurrenceQuelconque, params: Record<string, unknown>) => {
      const id = ctx.ids.nouveau(o.classe);
      // Esquisse : paramètres revalidés (renflements tous nuls retirés, D-064).
      const fusion = { ...o.params, ...params } as Record<string, unknown>;
      const valides = o.classe === "esquisse" ? validerParams(courant, "esquisse", fusion) : fusion;
      courant = { ...courant, objets: { ...courant.objets, [id]: { ...o, id, groupeId: null, params: valides } as OccurrenceQuelconque } };
      effets = fusionnerEffets(effets, { ...effetsVides(), crees: [id], niveauxTouches: o.niveauId ? [o.niveauId] : [] });
    };
    for (const d of distances) {
      for (const o of sel) {
        if (o.classe === "mur" && o.params.renflement) throw new ErreurCommande("precondition", "cibles", `${o.id} : mur courbe, décalage non pris en charge`);
        if (o.classe === "mur" || (o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "construction"))) {
          if (cote === "exterieur" || cote === "interieur") throw new ErreurCommande("invalide", "cote", `${o.id} : côté gauche ou droite pour un mur ou une ligne`);
          const a: Vec = o.classe === "mur" ? o.params.a : o.params.points[0]!;
          const b: Vec = o.classe === "mur" ? o.params.b : o.params.points[1]!;
          const dir = normalise(sub(b, a));
          const n = { x: -dir.y * d * signe, y: dir.x * d * signe };
          const r = copier(courant, [o], { type: "translation", dx: n.x, dy: n.y }, ctx);
          courant = r.etat;
          effets = fusionnerEffets(effets, r.effets);
        } else if (o.classe === "esquisse" && (o.params.forme === "cercle" || o.params.forme === "arc") && o.params.centre && o.params.rayon) {
          // Cercle, arc (D-076) : décalage concentrique ; extérieur = loin du centre. Arc : gauche = vers le centre (sens direct).
          const plus = cote === "exterieur" || (o.params.forme === "arc" && cote === "droite") ? 1 : cote === "interieur" || (o.params.forme === "arc" && cote === "gauche") ? -1 : null;
          if (plus === null) throw new ErreurCommande("invalide", "cote", `${o.id} : côté extérieur ou intérieur pour un cercle`);
          const r = o.params.rayon.value + plus * d;
          if (!(r > 1e-9)) throw new ErreurCommande("precondition", "distances", `${o.id} : décalage de ${d} m impossible (rayon annulé)`);
          copieAvec(o, { rayon: { value: Math.round(r * 1e9) / 1e9, unit: "m" } });
        } else if (o.classe === "esquisse" && (o.params.forme === "spline" || o.params.forme === "ellipse")) {
          // Courbe, ellipse (D-099) : la décalée n'est ni une spline ni une ellipse ; elle est produite en polyligne
          // approchée (courbe : 16 points par segment ; ellipse : 96 points), ouverte ou fermée comme l'original.
          const q = o.params;
          const ferme = q.forme === "ellipse" || q.ferme;
          let pts: Point2[];
          if (q.forme === "ellipse") {
            if (!q.centre || !q.rayon || !q.rayonB) throw new ErreurCommande("precondition", "cibles", `${o.id} : ellipse incomplète`);
            pts = pointsEllipse(q.centre, q.rayon.value, q.rayonB.value, q.rotation?.value ?? 0, 96);
          } else {
            pts = pointsSpline(q.points, 16, q.ferme, q.tangentes);
            if (q.ferme && pts.length > 1 && distance(pts[0]!, pts[pts.length - 1]!) < 1e-9) pts = pts.slice(0, -1);
          }
          const nets = pts.filter((x, i) => i === 0 || distance(x, pts[i - 1]!) > 1e-9);
          let res: Point2[] | null;
          if (ferme) {
            if (cote === "gauche" || cote === "droite") throw new ErreurCommande("invalide", "cote", `${o.id} : côté extérieur ou intérieur pour une courbe fermée`);
            res = decalerContour(nets, d * signe);
            if (!res) throw new ErreurCommande("precondition", "distances", `${o.id} : décalage de ${d} m impossible (courbe trop rétrécie)`);
          } else {
            if (cote === "exterieur" || cote === "interieur") throw new ErreurCommande("invalide", "cote", `${o.id} : côté gauche ou droite pour une courbe ouverte`);
            res = decalerPolylignePure(nets, d * signe);
          }
          const arr = res.map((x) => pt(Math.round(x.x * 1e9) / 1e9, Math.round(x.y * 1e9) / 1e9));
          copieAvec(o, { forme: ferme ? "polygone" : "polyligne", points: arr, ferme, centre: null, rayon: null, rayonB: null, rotation: null, angleDebut: null, angleFin: null, tangentes: undefined });
        } else if (o.classe === "esquisse" && o.params.forme === "polyligne" && o.params.renflements && !arrondis) {
          // Polyligne à segments en arc (D-076) : segments droits glissés, arcs concentriques, jonctions tangentes.
          let delta = d * signe;
          if (o.params.ferme) {
            if (cote === "gauche" || cote === "droite") throw new ErreurCommande("invalide", "cote", `${o.id} : côté extérieur ou intérieur pour un contour fermé`);
            let aire = 0;
            const q = o.params.points;
            for (let i = 0; i < q.length; i++) aire += q[i]!.x * q[(i + 1) % q.length]!.y - q[(i + 1) % q.length]!.x * q[i]!.y;
            delta = -(aire > 0 ? 1 : -1) * d * signe;
          } else if (cote === "exterieur" || cote === "interieur") throw new ErreurCommande("invalide", "cote", `${o.id} : côté gauche ou droite pour une polyligne ouverte`);
          const r = decalerPolyligneArcs(o.params.points, o.params.renflements, o.params.ferme, delta);
          if (typeof r === "string") throw new ErreurCommande("precondition", "cibles", `${o.id} : décalage impossible — ${r}`);
          copieAvec(o, { points: r.points, renflements: r.renflements });
        } else if (o.classe === "esquisse" && o.params.forme === "polyligne" && !(arrondis && o.params.ferme)) {
          if (o.params.renflements) throw new ErreurCommande("precondition", "cibles", `${o.id} : polyligne à segments en arc, décalage en angles arrondis non pris en charge (angles vifs)`);
          if (cote === "exterieur" || cote === "interieur") throw new ErreurCommande("invalide", "cote", `${o.id} : côté gauche ou droite pour une polyligne ouverte`);
          if (arrondis) {
            const r = decalerArrondi(o.params.points, false, d * signe);
            if (!r) throw new ErreurCommande("precondition", "distances", `${o.id} : décalage arrondi de ${d} m impossible (un côté s'inverserait)`);
            copieAvec(o, { points: r.points, renflements: r.renflements });
          } else copieAvec(o, { points: decalerPolylignePure(o.params.points, d * signe) });
        } else if (arrondis) {
          // Contour fermé d'esquisse, angles arrondis vers l'extérieur (ou vifs vers l'intérieur) : polyligne fermée.
          if (o.classe !== "esquisse" || !["polygone", "rectangle", "polyligne"].includes(o.params.forme)) throw new ErreurCommande("precondition", "angles", `${o.id} : angles arrondis pour les polygones, rectangles et polylignes d'esquisse seulement`);
          if (o.params.renflements) throw new ErreurCommande("precondition", "cibles", `${o.id} : polyligne à segments en arc, décalage non pris en charge`);
          if (cote === "gauche" || cote === "droite") throw new ErreurCommande("invalide", "cote", `${o.id} : côté extérieur ou intérieur pour un contour fermé`);
          const contour = o.params.forme === "rectangle" && o.params.points.length === 2 ? rectangleEnPoints(o.params.points[0]!, o.params.points[1]!) : o.params.points;
          let aire = 0;
          for (let i = 0; i < contour.length; i++) aire += contour[i]!.x * contour[(i + 1) % contour.length]!.y - contour[(i + 1) % contour.length]!.x * contour[i]!.y;
          // Contour direct : l'extérieur est à droite des côtés (décalage « à gauche » négatif).
          const r = decalerArrondi(contour, true, -(aire > 0 ? 1 : -1) * d * signe);
          if (!r) throw new ErreurCommande("precondition", "distances", `${o.id} : décalage arrondi de ${d} m impossible (contour trop rétréci)`);
          copieAvec(o, { forme: "polyligne", points: r.points, ferme: true, renflements: r.renflements });
        } else {
          // Contours fermés (D-049) : polygone, rectangle, hachure d'esquisse ; dalle, zone, solide fermé (sans trous).
          const contour: Point2[] | null =
            o.classe === "esquisse" && (o.params.forme === "polygone" || o.params.forme === "hachure") ? o.params.points
            : o.classe === "esquisse" && o.params.forme === "rectangle" && o.params.points.length === 2 ? rectangleEnPoints(o.params.points[0]!, o.params.points[1]!)
            : (o.classe === "dalle" || o.classe === "zone" || (o.classe === "solide" && o.params.ferme)) ? o.params.contour
            : null;
          if (!contour) throw new ErreurCommande("precondition", "cibles", `décalage non pris en charge pour ${o.id} (murs, lignes, polylignes et contours fermés)`);
          if ((o.classe === "dalle" || o.classe === "zone" || o.classe === "solide") && o.params.trous.length) throw new ErreurCommande("precondition", "cibles", `${o.id} : contour à trous, décalage non pris en charge`);
          if (cote === "gauche" || cote === "droite") throw new ErreurCommande("invalide", "cote", `${o.id} : côté extérieur ou intérieur pour un contour fermé`);
          const dec = decalerContour(contour, d * signe);
          if (!dec) throw new ErreurCommande("precondition", "distances", `${o.id} : décalage de ${d} m impossible (contour trop rétréci ou en plusieurs boucles)`);
          if (o.classe === "esquisse") copieAvec(o, { forme: o.params.forme === "rectangle" ? "polygone" : o.params.forme, points: dec, ferme: true });
          else copieAvec(o, { contour: dec });
        }
      }
    }
    return { etat: courant, effets };
  },
  etirer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    void c;
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    const extremite = lire.enumeration(p, "extremite", ["a", "b"] as const);
    const point = lire.point(p, "point")!;
    const effets = effetsVides();
    effets.modifies.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    if (o.classe === "mur") {
      const fixe = extremite === "a" ? o.params.b : o.params.a;
      // Entraîner les murs joints (D-047) : les murs du niveau dont une extrémité coïncide avec celle déplacée la
      // suivent (même commande, même révision) ; leurs ouvertures gardent leur distance à l'extrémité fixe.
      if (lire.booleen(p, "entrainer", false)) {
        const depart = extremite === "a" ? o.params.a : o.params.b;
        let r = reducteursTransformer.etirer(etat, { id, extremite, point }, ctx, []);
        for (const w of Object.values(etat.objets)) {
          if (w.classe !== "mur" || w.id === id || w.niveauId !== o.niveauId) continue;
          const ext: "a" | "b" | null = distance(w.params.a, depart) <= TOLERANCE_REDUCTEUR * 10 ? "a" : distance(w.params.b, depart) <= TOLERANCE_REDUCTEUR * 10 ? "b" : null;
          if (!ext) continue;
          const calqueW = w.calqueId ? etat.calques[w.calqueId] : null;
          if (calqueW?.verrouille) throw new ErreurCommande("precondition", "entrainer", `mur joint ${w.id} sur un calque verrouillé : étirer seul, ou déverrouiller`);
          const r2 = reducteursTransformer.etirer(r.etat, { id: w.id, extremite: ext, point }, ctx, []);
          r = { etat: r2.etat, effets: fusionnerEffets(r.effets, r2.effets) };
        }
        return r;
      }
      const params = extremite === "a" ? { ...o.params, a: point } : { ...o.params, b: point };
      const nouvelleLongueur = longueurAxeMur(params);
      if (nouvelleLongueur <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "point", "mur de longueur nulle");
      const ancienneLongueur = longueurAxeMur(o.params);
      const objets = { ...etat.objets, [id]: { ...o, params } as OccurrenceQuelconque };
      let problemes = etat.problemes;
      for (const ouv of ouverturesDuMur(etat, id)) {
        // distance à l'extrémité fixe conservée
        const distFixe = (extremite === "a" ? 1 - ouv.params.position : ouv.params.position) * ancienneLongueur;
        const position = extremite === "a" ? 1 - distFixe / nouvelleLongueur : distFixe / nouvelleLongueur;
        objets[ouv.id] = { ...ouv, params: { ...ouv.params, position } } as OccurrenceQuelconque;
        effets.modifies.push(ouv.id);
        const demi = ouv.params.largeur.value / 2 / nouvelleLongueur;
        if (position - demi < -1e-9 || position + demi > 1 + 1e-9) {
          const pb = nouveauProbleme(ctx.ids, "reference-a-reparer", ouv.id, `${ouv.id} : l'emprise sort du mur ${id} étiré — à réparer`);
          problemes = { ...problemes, [pb.id]: pb };
          effets.problemes.push(pb);
          effets.referencesAReparer.push(ouv.id);
        }
      }
      void fixe;
      return { etat: { ...etat, objets, problemes }, effets };
    }
    if (o.classe === "escalier") {
      const params = extremite === "a" ? { ...o.params, a: point } : { ...o.params, b: point };
      if (distance(params.a, params.b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "point", "escalier de longueur nulle");
      return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, params } } }, effets };
    }
    // Arc, cercle (D-088) : le centre reste ; l'extrémité étirée suit le point (angle de début ou de fin) ; un cercle
    // prend le rayon jusqu'au point.
    if (o.classe === "esquisse" && (o.params.forme === "arc" || o.params.forme === "cercle") && o.params.centre && o.params.rayon) {
      const c = o.params.centre;
      const r = distance(c, point);
      if (r <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "point", "point au centre : étirement indéfini");
      const angle = Math.round(((Math.atan2(point.y - c.y, point.x - c.x) * 180) / Math.PI) * 1e9) / 1e9;
      const params = o.params.forme === "cercle" ? { ...o.params, rayon: { value: Math.round(r * 1e9) / 1e9, unit: "m" as const } } : extremite === "a" ? { ...o.params, angleDebut: { value: angle, unit: "deg" as const } } : { ...o.params, angleFin: { value: angle, unit: "deg" as const } };
      return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, params } } }, effets };
    }
    if (o.classe === "esquisse" && o.params.points.length >= 2) {
      const points = [...o.params.points];
      points[extremite === "a" ? 0 : points.length - 1] = point;
      return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, params: { ...o.params, points } } } }, effets };
    }
    throw new ErreurCommande("precondition", "id", `étirement non pris en charge pour la classe ${o.classe}`);
  },
  ajuster(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    return ajusterOuProlonger(etat, p, ctx, c, "ajuster");
  },
  prolonger(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    // Prolongement d'une longueur donnée, sans frontière (D-043) : `longueur` et `extremite` au lieu de `limiteId`.
    if (p["longueur"] !== undefined) {
      const id = lire.objet(etat, p, "id");
      const o = etat.objets[id]!;
      const axe = axeDe(o);
      if (!axe) throw new ErreurCommande("precondition", "id", "prolonger : murs, escaliers et lignes seulement");
      const l = lire.longueur(p, "longueur")!.value;
      const extremite = lire.enumeration(p, "extremite", ["a", "b"] as const);
      const dir = normalise(extremite === "a" ? sub(axe[0], axe[1]) : sub(axe[1], axe[0]));
      const depart = extremite === "a" ? axe[0] : axe[1];
      const point = add(depart, mul(dir, l));
      return reducteursTransformer.etirer(etat, { id, extremite, point: pt(Math.round(point.x * 1e9) / 1e9, Math.round(point.y * 1e9) / 1e9) }, ctx, []);
    }
    return ajusterOuProlonger(etat, p, ctx, c, "prolonger");
  },
  decomposer(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    let courant = etat;
    let effets = effetsVides();
    for (const o of sel) {
      if (o.classe === "bloc-occurrence") {
        // Occurrence de bloc ou de composant : copies indépendantes de son contenu, occurrence supprimée.
        const { objets: copies, crees } = decomposerBloc(courant, o, ctx);
        const objets = { ...courant.objets, ...copies };
        delete objets[o.id];
        courant = { ...courant, objets };
        effets = fusionnerEffets(effets, { ...effetsVides(), crees, supprimes: [o.id], niveauxTouches: o.niveauId ? [o.niveauId] : [] });
        continue;
      }
      if (o.classe !== "esquisse" || !["polyligne", "polygone", "rectangle", "hachure"].includes(o.params.forme)) {
        throw new ErreurCommande("precondition", "cibles", `décomposition non prise en charge pour ${o.id} (polylignes, polygones, rectangles et hachures d'esquisse, occurrences de bloc)`);
      }
      const pts = o.params.forme === "rectangle" && o.params.points.length === 2 ? rectangleEnPoints(o.params.points[0]!, o.params.points[1]!) : o.params.points;
      const segments: [Point2, Point2][] = [];
      for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i]!, pts[i + 1]!]);
      if (o.params.ferme && pts.length > 2) segments.push([pts[pts.length - 1]!, pts[0]!]);
      const objets = { ...courant.objets };
      delete objets[o.id];
      const crees: string[] = [];
      const { renflements: _r, ...sansRenflements } = o.params;
      void _r;
      segments.forEach(([a, b], i) => {
        const id = ctx.ids.nouveau("esquisse");
        const bulge = o.params.renflements?.[i] ?? 0;
        if (bulge !== 0) {
          // Segment en arc (D-063) : il devient un arc, parcouru en sens direct.
          const c = centreRenflement(a, b, bulge);
          const ang = (q: Vec) => ({ value: Math.round(((Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI) * 1e9) / 1e9 || 0, unit: "deg" as const });
          const [d0, d1] = bulge > 0 ? [ang(a), ang(b)] : [ang(b), ang(a)];
          objets[id] = { ...o, id, groupeId: null, params: { ...sansRenflements, forme: "arc", points: [], ferme: false, centre: pt(Math.round(c.x * 1e9) / 1e9, Math.round(c.y * 1e9) / 1e9), rayon: { value: Math.round(distance(a, c) * 1e9) / 1e9, unit: "m" }, angleDebut: d0, angleFin: d1, motif: null } };
        } else objets[id] = { ...o, id, groupeId: null, params: { ...sansRenflements, forme: "ligne", points: [a, b], ferme: false, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null } };
        crees.push(id);
      });
      courant = { ...courant, objets };
      effets = fusionnerEffets(effets, { ...effetsVides(), crees, supprimes: [o.id], niveauxTouches: o.niveauId ? [o.niveauId] : [] });
    }
    return { etat: courant, effets };
  },
  /**
   * Joindre (D-043, inverse de décomposer) : des lignes et polylignes d'esquisse jointives bout à bout (tolérance du
   * réducteur) deviennent une polyligne — un polygone si la chaîne se referme. Un même niveau ; sinon refus.
   */
  joindre(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    void ctx;
    const sel = cibles(etat, p, c);
    if (sel.length < 2) throw new ErreurCommande("invalide", "cibles", "joindre : au moins deux lignes ou polylignes");
    for (const o of sel) if (o.classe !== "esquisse" || !["ligne", "polyligne"].includes(o.params.forme) || o.params.ferme) throw new ErreurCommande("precondition", "cibles", `${o.id} : seules les lignes et polylignes ouvertes se joignent`);
    for (const o of sel) if ((o as Occurrence<"esquisse">).params.renflements) throw new ErreurCommande("precondition", "cibles", `${o.id} : polyligne à segments en arc, la décomposer d'abord pour la joindre`);
    if (new Set(sel.map((o) => o.niveauId)).size !== 1) throw new ErreurCommande("precondition", "cibles", "joindre : objets d'un même niveau");
    for (const o of sel) {
      if (referencesVers(etat, o.id).length || Object.values(etat.relations).some((r) => r.sourceId === o.id || r.targetId === o.id)) throw new ErreurCommande("precondition", "cibles", `${o.id} est visé par une cote, une contrainte ou une relation : la détacher d'abord (rien n'est réparé en silence)`);
    }
    const tol = TOLERANCE_REDUCTEUR * 10;
    const meme = (u: Point2, v: Point2) => distance(u, v) <= tol;
    const restes = sel.slice(1).map((o) => [...(o as Occurrence<"esquisse">).params.points]);
    let chaine = [...(sel[0] as Occurrence<"esquisse">).params.points];
    while (restes.length) {
      const i = restes.findIndex((r) => meme(r[0]!, chaine[chaine.length - 1]!) || meme(r[r.length - 1]!, chaine[chaine.length - 1]!) || meme(r[0]!, chaine[0]!) || meme(r[r.length - 1]!, chaine[0]!));
      if (i < 0) throw new ErreurCommande("precondition", "cibles", "joindre : les objets ne sont pas jointifs bout à bout");
      const r = restes.splice(i, 1)[0]!;
      const fin = chaine[chaine.length - 1]!;
      if (meme(r[0]!, fin)) chaine = [...chaine, ...r.slice(1)];
      else if (meme(r[r.length - 1]!, fin)) chaine = [...chaine, ...r.slice(0, -1).reverse()];
      else if (meme(r[r.length - 1]!, chaine[0]!)) chaine = [...r.slice(0, -1), ...chaine];
      else chaine = [...[...r].reverse().slice(0, -1), ...chaine];
    }
    const ferme = chaine.length > 3 && meme(chaine[0]!, chaine[chaine.length - 1]!);
    if (ferme) chaine = chaine.slice(0, -1);
    const premier = sel[0] as Occurrence<"esquisse">;
    const objets = { ...etat.objets };
    for (const o of sel.slice(1)) delete objets[o.id];
    objets[premier.id] = { ...premier, params: { ...premier.params, forme: ferme ? "polygone" : "polyligne", points: chaine, ferme } };
    const effets = effetsVides();
    effets.modifies.push(premier.id);
    effets.supprimes.push(...sel.slice(1).map((o) => o.id));
    if (premier.niveauId) effets.niveauxTouches.push(premier.niveauId);
    return { etat: { ...etat, objets }, effets };
  },
  pointsDeControle(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    void c;
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    const index = lire.nombre(p, "index", { entier: true, min: 0 })!;
    const point = lire.point(p, "point")!;
    // Sommet commun (D-049) : les sommets d'autres objets du niveau confondus avec celui-ci le suivent.
    if (lire.booleen(p, "entrainer", false)) {
      const sommets = (x: OccurrenceQuelconque): Point2[] | null => (x.classe === "esquisse" ? x.params.points : "contour" in x.params && Array.isArray((x.params as { contour?: unknown }).contour) ? (x.params as { contour: Point2[] }).contour : null);
      const propres = sommets(o);
      const depart = propres?.[index];
      if (!depart) throw new ErreurCommande("invalide", "index", "sommet inconnu");
      let r = reducteursTransformer.pointsDeControle(etat, { id, index, point }, ctx, []);
      const tol = TOLERANCE_REDUCTEUR * 10;
      for (const x of Object.values(etat.objets)) {
        if (x.id === id || x.niveauId !== o.niveauId) continue;
        const cal = x.calqueId ? etat.calques[x.calqueId] : null;
        if (x.classe === "mur") {
          const ext: "a" | "b" | null = distance(x.params.a, depart) <= tol ? "a" : distance(x.params.b, depart) <= tol ? "b" : null;
          if (!ext) continue;
          if (cal?.verrouille) throw new ErreurCommande("precondition", "entrainer", `${x.id} sur un calque verrouillé : déplacer le sommet seul, ou déverrouiller`);
          const r2 = reducteursTransformer.etirer(r.etat, { id: x.id, extremite: ext, point }, ctx, []);
          r = { etat: r2.etat, effets: fusionnerEffets(r.effets, r2.effets) };
          continue;
        }
        const pts = sommets(x);
        if (!pts) continue;
        pts.forEach((q, k) => {
          if (distance(q, depart) > tol) return;
          if (cal?.verrouille) throw new ErreurCommande("precondition", "entrainer", `${x.id} sur un calque verrouillé : déplacer le sommet seul, ou déverrouiller`);
          const r2 = reducteursTransformer.pointsDeControle(r.etat, { id: x.id, index: k, point }, ctx, []);
          r = { etat: r2.etat, effets: fusionnerEffets(r.effets, r2.effets) };
        });
      }
      return r;
    }
    const effets = effetsVides();
    effets.modifies.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    const remplacer = (pts: Point2[]): Point2[] => {
      if (index >= pts.length) throw new ErreurCommande("invalide", "index", `index hors du contour (${pts.length} points)`);
      const out = [...pts];
      out[index] = point;
      return out;
    };
    let suivant: OccurrenceQuelconque;
    switch (o.classe) {
      case "dalle":
      case "toiture":
      case "zone":
      case "solide":
      case "reference-plan":
      case "piece":
        suivant = { ...o, params: { ...o.params, contour: remplacer(o.params.contour) } } as OccurrenceQuelconque;
        break;
      case "esquisse":
        suivant = { ...o, params: { ...o.params, points: remplacer(o.params.points) } };
        break;
      default:
        throw new ErreurCommande("precondition", "id", `points de contrôle non pris en charge pour la classe ${o.classe}`);
    }
    // Les références vers `contour[i]` / `sommet[i]` suivent le point déplacé (résolution à la lecture).
    return { etat: { ...etat, objets: { ...etat.objets, [id]: suivant } }, effets };
  },
  raccorder(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    return raccordOuChanfrein(etat, p, ctx, c, "raccorder");
  },
  /**
   * Chanfrein d'un sommet de contour (D-049) : le sommet est remplacé par deux points à `distance` sur ses deux
   * côtés ; l'objet garde sa classe. Objet visé par une cote ou une contrainte : refus (indices de sommets décalés).
   */
  chanfreinerSommet(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    void c;
    // Chanfrein multiple (D-064) : `sommets` (indices du contour d'origine), traités du dernier au premier pour que
    // les indices restent valables ; chaque côté porte alors les reculs de ses deux extrémités.
    if (p["sommets"] !== undefined) {
      const v = p["sommets"];
      if (!Array.isArray(v) || !v.length || !v.every((x) => Number.isInteger(x) && x >= 0)) throw new ErreurCommande("invalide", "sommets", "sommets : liste d'indices");
      let r: ResultatCommande = { etat, effets: effetsVides() };
      for (const index of [...new Set(v as number[])].sort((a, b) => b - a)) {
        const r2 = reducteursTransformer.chanfreinerSommet(r.etat, { id: p["id"], distance: p["distance"], index }, ctx, []);
        r = { etat: r2.etat, effets: fusionnerEffets(r.effets, r2.effets) };
      }
      return r;
    }
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    const index = lire.nombre(p, "index", { entier: true, min: 0 })!;
    const d = lire.longueur(p, "distance", { strict: true })!.value;
    const ferme = o.classe === "esquisse" ? o.params.ferme || o.params.forme === "polygone" || o.params.forme === "hachure" : true;
    const pts: Point2[] | null = o.classe === "esquisse" && ["polygone", "polyligne", "hachure"].includes(o.params.forme) ? o.params.points : ["dalle", "zone", "solide", "piece", "toiture"].includes(o.classe) ? (o.params as { contour: Point2[] }).contour : null;
    if (!pts) throw new ErreurCommande("precondition", "id", "chanfrein de sommet : polygones, polylignes et hachures d'esquisse, dalles, zones, pièces, solides, toitures");
    if (o.classe === "esquisse" && o.params.renflements) throw new ErreurCommande("precondition", "id", "polyligne à segments en arc : chanfrein de sommet non pris en charge");
    if (index >= pts.length) throw new ErreurCommande("invalide", "index", `sommet ${index} inconnu (${pts.length} sommets)`);
    if (!ferme && (index === 0 || index === pts.length - 1)) throw new ErreurCommande("invalide", "index", "extrémité d'une polyligne ouverte : pas de chanfrein");
    if (referencesVers(etat, id).length || Object.values(etat.relations).some((r) => r.sourceId === id || r.targetId === id)) throw new ErreurCommande("precondition", "id", `${id} est visé par une cote, une contrainte ou une relation : la détacher d'abord`);
    const n = pts.length;
    const s0 = pts[index]!;
    const prec = pts[(index - 1 + n) % n]!;
    const suiv = pts[(index + 1) % n]!;
    if (d >= distance(s0, prec) - TOLERANCE_REDUCTEUR || d >= distance(s0, suiv) - TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "distance", "distance plus longue qu'un des côtés du sommet");
    const q1 = add(s0, mul(normalise(sub(prec, s0)), d));
    const q2 = add(s0, mul(normalise(sub(suiv, s0)), d));
    const r6 = (v: number) => Math.round(v * 1e9) / 1e9;
    const nouveaux = [...pts.slice(0, index), pt(r6(q1.x), r6(q1.y)), pt(r6(q2.x), r6(q2.y)), ...pts.slice(index + 1)];
    const suivant = o.classe === "esquisse" ? { ...o, params: { ...o.params, points: nouveaux } } : { ...o, params: { ...o.params, contour: nouveaux } };
    const effets = effetsVides();
    effets.modifies.push(id);
    if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
    return { etat: { ...etat, objets: { ...etat.objets, [id]: suivant as OccurrenceQuelconque } }, effets };
  },
  chanfreiner(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    return raccordOuChanfrein(etat, p, ctx, c, "chanfreiner");
  },
};

function rectangleEnPoints(a: Point2, b: Point2): Point2[] {
  return [pt(a.x, a.y), pt(b.x, a.y), pt(b.x, b.y), pt(a.x, b.y)];
}

function decalerPolylignePure(points: readonly Point2[], d: number): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(0, i - 1)]!;
    const next = points[Math.min(points.length - 1, i + 1)]!;
    const dir = normalise(sub(next, prev));
    out.push(pt(points[i]!.x - dir.y * d, points[i]!.y + dir.x * d));
  }
  return out;
}

function axeDe(o: OccurrenceQuelconque): [Vec, Vec] | null {
  if (o.classe === "mur" && o.params.renflement) return null; // mur courbe (D-086)
  if (o.classe === "mur" || o.classe === "escalier") return [o.params.a, o.params.b];
  if (o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "construction") && o.params.points.length >= 2) return [o.params.points[0]!, o.params.points[1]!];
  return null;
}

function ajusterOuProlonger(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[], mode: "ajuster" | "prolonger"): ResultatCommande {
  void c;
  void ctx;
  const id = lire.objet(etat, p, "id");
  const limiteId = lire.objet(etat, p, "limiteId");
  const o = etat.objets[id]!;
  const limite = etat.objets[limiteId]!;
  const axe = axeDe(o);
  const axeLimite = axeDe(limite);
  // Forme fermée (D-117) : coupée par la droite porteuse d'une limite droite, côté `cote` gardé.
  if (mode === "ajuster" && estFormeFermee(o)) {
    if (!axeLimite) throw new ErreurCommande("precondition", "limiteId", "forme fermée : la limite doit être droite (axe de mur, ligne, escalier)");
    return ajusterForme(etat, p, o, { a: axeLimite[0], b: axeLimite[1] });
  }
  // Extrémité imposée (D-117) : celle qui bouge, au lieu de la plus proche.
  const force = p["extremite"] === undefined ? null : lire.enumeration(p, "extremite", ["a", "b"] as const);
  // Polylignes ouvertes, splines et limites courbes ou polygonales (D-073, D-117) : chemin général.
  if (!axe || !axeLimite) return ajusterOuProlongerChemin(etat, ctx, id, limiteId, mode, force);
  const far = 1e6;
  const dA = sub(axe[1], axe[0]);
  const dB = sub(axeLimite[1], axeLimite[0]);
  const x = intersectionSegments(add(axe[0], mul(dA, -far)), add(axe[1], mul(dA, far)), add(axeLimite[0], mul(dB, -far)), add(axeLimite[1], mul(dB, far)), 1e-6);
  if (!x) throw new ErreurCommande("precondition", "limiteId", "objets parallèles : aucune intersection");
  const pr = projectionSurSegment(x.point, axe[0], axe[1]);
  const extremite: "a" | "b" = force ?? (mode === "prolonger" ? (distance(axe[0], x.point) <= distance(axe[1], x.point) ? "a" : "b") : pr.t < 0.5 ? "a" : "b");
  if (mode === "ajuster" && (pr.t <= 0 || pr.t >= 1)) throw new ErreurCommande("precondition", "limiteId", "la limite ne coupe pas l'objet : rien à ajuster");
  // Intersection de droites prolongées (1e6 m) : arrondie au nanomètre, comme le prolongement d'une longueur donnée.
  return reducteursTransformer.etirer(etat, { id, extremite, point: pt(Math.round(x.point.x * 1e9) / 1e9, Math.round(x.point.y * 1e9) / 1e9) }, ctx, []);
}

type LimiteCoupe = { type: "droite"; a: Vec; b: Vec } | { type: "segments"; segs: [Vec, Vec][] } | { type: "cercle"; c: Vec; r: number };

/** Limite d'ajustement ou de prolongement (D-073) : droite (axes), tracé discrétisé (courbes, contours), cercle exact. */
function limiteDe(o: OccurrenceQuelconque): LimiteCoupe | null {
  const axe = axeDe(o);
  if (axe) return { type: "droite", a: axe[0], b: axe[1] };
  const segs = (pts: readonly Vec[], ferme: boolean): [Vec, Vec][] => {
    const out: [Vec, Vec][] = [];
    for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i]!, pts[i + 1]!]);
    if (ferme && pts.length > 2) out.push([pts[pts.length - 1]!, pts[0]!]);
    return out;
  };
  if (o.classe === "esquisse") {
    const q = o.params;
    if (q.forme === "cercle" && q.centre && q.rayon) return { type: "cercle", c: q.centre, r: q.rayon.value };
    if (q.forme === "arc" && q.centre && q.rayon) return { type: "segments", segs: segs(pointsArc(q.centre, q.rayon.value, q.angleDebut?.value ?? 0, q.angleFin?.value ?? 360, 128), false) };
    if (q.forme === "ellipse" && q.centre && q.rayon && q.rayonB) return { type: "segments", segs: segs(pointsEllipse(q.centre, q.rayon.value, q.rayonB.value, q.rotation?.value ?? 0, 128), true) };
    if (q.forme === "spline") return { type: "segments", segs: segs(pointsSpline(q.points, 16, q.ferme, q.tangentes), q.ferme) };
    if (q.forme === "rectangle" && q.points.length === 2) {
      const [a, b] = [q.points[0]!, q.points[1]!];
      return { type: "segments", segs: segs([a, pt(b.x, a.y), b, pt(a.x, b.y)], true) };
    }
    return { type: "segments", segs: segs(pointsPolyligne(q.points, q.ferme, q.renflements), q.ferme || q.forme === "polygone" || q.forme === "hachure") };
  }
  if (o.classe === "dalle" || o.classe === "toiture" || o.classe === "zone" || o.classe === "piece" || o.classe === "reference-plan") return { type: "segments", segs: segs(o.params.contour, true) };
  if (o.classe === "solide") return { type: "segments", segs: segs(o.params.contour, o.params.ferme) };
  return null;
}

/** Points d'échantillonnage par segment de spline pour ajuster ou prolonger (D-117). */
const PAS_SPLINE = 16;

/** Chemin de l'objet à couper ou prolonger : axe (mur, escalier, ligne), polyligne ouverte sans arc, spline ouverte
 * (tracé échantillonné : PAS_SPLINE points par segment, le k-ième point de passage à l'indice k × PAS_SPLINE). */
function cheminDe(o: OccurrenceQuelconque): Vec[] | null {
  const axe = axeDe(o);
  if (axe) return [axe[0], axe[1]];
  if (o.classe === "esquisse" && o.params.forme === "spline" && !o.params.ferme && o.params.points.length >= 2) return pointsSpline(o.params.points, PAS_SPLINE, false, o.params.tangentes);
  if (o.classe === "esquisse" && o.params.forme === "polyligne" && !o.params.ferme && o.params.points.length >= 2) {
    if (o.params.renflements?.some((b) => b !== 0)) throw new ErreurCommande("precondition", "id", "polyligne à segments en arc : décomposer d'abord");
    return [...o.params.points];
  }
  return null;
}

/** Paramètres t > 0 (en m le long de `dir` unitaire) où la demi-droite depuis `o` rencontre la limite. */
function rencontres(o: Vec, dir: Vec, l: LimiteCoupe): number[] {
  const out: number[] = [];
  if (l.type === "droite") {
    const d = sub(l.b, l.a);
    const den = dir.x * d.y - dir.y * d.x;
    if (Math.abs(den) > 1e-12) {
      const w = sub(l.a, o);
      const t = (w.x * d.y - w.y * d.x) / den;
      if (t > 1e-9) out.push(t);
    }
  } else if (l.type === "segments") {
    for (const [a, b] of l.segs) {
      const d = sub(b, a);
      const den = dir.x * d.y - dir.y * d.x;
      if (Math.abs(den) < 1e-12) continue;
      const w = sub(a, o);
      const t = (w.x * d.y - w.y * d.x) / den;
      const u = (w.x * dir.y - w.y * dir.x) / den;
      if (t > 1e-9 && u >= -1e-12 && u <= 1 + 1e-12) out.push(t);
    }
  } else {
    const w = sub(o, l.c);
    const B = dot(w, dir);
    const C = dot(w, w) - l.r * l.r;
    const D = B * B - C;
    if (D >= 0) for (const t of [-B - Math.sqrt(D), -B + Math.sqrt(D)]) if (t > 1e-9) out.push(t);
  }
  return out.sort((x, y) => x - y);
}

const arrondiNm = (q: Vec) => pt(Math.round(q.x * 1e9) / 1e9, Math.round(q.y * 1e9) / 1e9);

function ajusterOuProlongerChemin(etat: ModeleAtelier, ctx: ContexteCommande, id: string, limiteId: string, mode: "ajuster" | "prolonger", force: "a" | "b" | null = null): ResultatCommande {
  const o = etat.objets[id]!;
  const chemin = cheminDe(o);
  if (!chemin) throw new ErreurCommande("precondition", "id", `${mode} : murs, escaliers, lignes, polylignes et splines ouvertes, formes fermées (ajuster) seulement`);
  const spline = o.classe === "esquisse" && o.params.forme === "spline" ? o.params : null;
  const limite = limiteDe(etat.objets[limiteId]!);
  if (!limite) throw new ErreurCommande("precondition", "limiteId", `${mode} : la limite doit être un axe, un tracé, un cercle ou un contour`);
  const n = chemin.length;
  if (mode === "prolonger") {
    const bouts = [
      { extremite: "a" as const, o: chemin[0]!, dir: normalise(sub(chemin[0]!, chemin[1]!)) },
      { extremite: "b" as const, o: chemin[n - 1]!, dir: normalise(sub(chemin[n - 1]!, chemin[n - 2]!)) },
    ].map((b) => ({ ...b, t: rencontres(b.o, b.dir, limite)[0] ?? Infinity }));
    const choix = force ? bouts[force === "a" ? 0 : 1]! : bouts[0]!.t <= bouts[1]!.t ? bouts[0]! : bouts[1]!;
    if (!Number.isFinite(choix.t)) throw new ErreurCommande("precondition", "limiteId", force ? `la limite n'est pas atteinte en prolongeant l'extrémité ${force}` : "la limite n'est pas atteinte en prolongeant l'une ou l'autre extrémité");
    const X = arrondiNm(add(choix.o, mul(choix.dir, choix.t)));
    if (spline) {
      // Spline (D-117) : un point de passage ajouté dans la direction de la tangente d'extrémité ; la courbe garde ses
      // points de passage et sa tangente imposée éventuelle (libre au nouveau point).
      const debut = choix.extremite === "a";
      const points = debut ? [X, ...spline.points] : [...spline.points, X];
      const tangentes = spline.tangentes ? (debut ? [null, ...spline.tangentes] : [...spline.tangentes, null]) : undefined;
      return remplacerEsquisse(etat, o, { points, ...(tangentes ? { tangentes } : {}) });
    }
    return reducteursTransformer.etirer(etat, { id, extremite: choix.extremite, point: X }, ctx, []);
  }
  // Ajuster : coupure à la rencontre la plus proche d'une extrémité, du côté de cette extrémité.
  const longueurs = [0];
  for (let i = 0; i + 1 < n; i++) longueurs.push(longueurs[i]! + distance(chemin[i]!, chemin[i + 1]!));
  const L = longueurs[n - 1]!;
  let meilleur: { s: number; i: number; point: Vec } | null = null;
  for (let i = 0; i + 1 < n; i++) {
    const l = distance(chemin[i]!, chemin[i + 1]!);
    if (l < 1e-12) continue;
    const dir = normalise(sub(chemin[i + 1]!, chemin[i]!));
    // Origine reculée d'un dixième de micron : une rencontre exactement au sommet de départ est comptée (D-117).
    for (const t0 of rencontres(add(chemin[i]!, mul(dir, -1e-7)), dir, limite)) {
      const t = Math.max(0, t0 - 1e-7);
      if (t0 - 1e-7 < -1e-9 || t >= l - 1e-9) continue;
      const s = longueurs[i]! + t;
      if (s <= 1e-9 || s >= L - 1e-9) continue;
      // Extrémité imposée : la coupe la plus proche de cette extrémité.
      const cle = (x: number) => (force === "a" ? x : force === "b" ? L - x : Math.min(x, L - x));
      if (!meilleur || cle(s) < cle(meilleur.s)) meilleur = { s, i, point: add(chemin[i]!, mul(dir, t)) };
    }
  }
  if (!meilleur) throw new ErreurCommande("precondition", "limiteId", "la limite ne coupe pas l'objet : rien à ajuster");
  const X = arrondiNm(meilleur.point);
  const debut = force ? force === "a" : meilleur.s < L - meilleur.s;
  if (spline) {
    // Spline (D-117) : points de passage du côté gardé, plus le point de coupe (tangente libre au point de coupe).
    const N = spline.points.length;
    const k = Math.min(Math.floor(meilleur.i / PAS_SPLINE), N - 2);
    const proche = (q: Vec) => distance(q, X) <= 1e-9;
    const tg = spline.tangentes;
    let points: Point2[];
    let tangentes: (Vec | null)[] | undefined;
    if (debut) {
      const reste = spline.points.slice(k + 1);
      const tr = tg?.slice(k + 1);
      points = proche(reste[0]!) ? reste : [X, ...reste];
      tangentes = tr ? (proche(reste[0]!) ? tr : [null, ...tr]) : undefined;
    } else {
      const reste = spline.points.slice(0, k + 1);
      const tr = tg?.slice(0, k + 1);
      points = proche(reste[reste.length - 1]!) ? reste : [...reste, X];
      tangentes = tr ? (proche(reste[reste.length - 1]!) ? tr : [...tr, null]) : undefined;
    }
    if (points.length < 2) throw new ErreurCommande("precondition", "limiteId", "il ne resterait qu'un point de la courbe");
    return remplacerEsquisse(etat, o, { points, tangentes: tangentes?.some((v) => v) ? tangentes : undefined });
  }
  if (n === 2) return reducteursTransformer.etirer(etat, { id, extremite: debut ? "a" : "b", point: X }, ctx, []);
  const points = (debut ? [X, ...chemin.slice(meilleur.i + 1)] : [...chemin.slice(0, meilleur.i + 1), X]).map((q) => pt(q.x, q.y));
  const effets = effetsVides();
  effets.modifies.push(id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  const params = validerParams(etat, "esquisse", { ...(o.params as unknown as Brut), points, renflements: undefined });
  return { etat: { ...etat, objets: { ...etat.objets, [id]: { ...o, params } as OccurrenceQuelconque } }, effets };
}

/** Remplace des paramètres d'esquisse, revalidés (D-117). */
function remplacerEsquisse(etat: ModeleAtelier, o: OccurrenceQuelconque, patch: Brut): ResultatCommande {
  const params = validerParams(etat, "esquisse", { ...(o.params as unknown as Brut), ...patch });
  const effets = effetsVides();
  effets.modifies.push(o.id);
  if (o.niveauId) effets.niveauxTouches.push(o.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [o.id]: { ...o, params } as OccurrenceQuelconque } }, effets };
}

type ElementRaccord = { type: "ligne"; a: Vec; b: Vec } | { type: "arc"; c: Vec; r: number; debut: number; fin: number };

const radians = (d: number) => (d * Math.PI) / 180;
const pointArc = (e: { c: Vec; r: number }, deg: number): Vec => ({ x: e.c.x + e.r * Math.cos(radians(deg)), y: e.c.y + e.r * Math.sin(radians(deg)) });

/** Courbes décalées d'un élément (à distance r) : deux droites ou un/deux cercles. */
function decalees(e: ElementRaccord, r: number): ({ type: "droite"; p: Vec; u: Vec } | { type: "cercle"; c: Vec; r: number })[] {
  if (e.type === "ligne") {
    const u = normalise(sub(e.b, e.a));
    const n = { x: -u.y, y: u.x };
    return [{ type: "droite", p: add(e.a, mul(n, r)), u }, { type: "droite", p: add(e.a, mul(n, -r)), u }];
  }
  return [{ type: "cercle", c: e.c, r: e.r + r }, ...(e.r > r + 1e-9 ? [{ type: "cercle" as const, c: e.c, r: e.r - r }] : [])];
}

function intersectionsCourbes(k1: ReturnType<typeof decalees>[number], k2: ReturnType<typeof decalees>[number]): Vec[] {
  if (k1.type === "droite" && k2.type === "droite") {
    const den = k1.u.x * k2.u.y - k1.u.y * k2.u.x;
    if (Math.abs(den) < 1e-12) return [];
    const w = sub(k2.p, k1.p);
    const t = (w.x * k2.u.y - w.y * k2.u.x) / den;
    return [add(k1.p, mul(k1.u, t))];
  }
  if (k1.type === "cercle" && k2.type === "droite") return intersectionsCourbes(k2, k1);
  if (k1.type === "droite" && k2.type === "cercle") {
    const w = sub(k1.p, k2.c);
    const B = dot(w, k1.u);
    const D = B * B - (dot(w, w) - k2.r * k2.r);
    if (D < 0) return [];
    return [-B - Math.sqrt(D), -B + Math.sqrt(D)].map((t) => add(k1.p, mul(k1.u, t)));
  }
  const c1 = k1 as { c: Vec; r: number };
  const c2 = k2 as { c: Vec; r: number };
  const d = distance(c1.c, c2.c);
  if (d < 1e-12 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return [];
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const u = normalise(sub(c2.c, c1.c));
  const m = add(c1.c, mul(u, a));
  return [add(m, mul({ x: -u.y, y: u.x }, h)), add(m, mul({ x: u.y, y: -u.x }, h))];
}

/** Point de tangence : le point de l'élément (droite ou cercle porteur) le plus proche du centre du raccord. */
function tangence(e: ElementRaccord, f: Vec): Vec {
  if (e.type === "ligne") {
    const u = normalise(sub(e.b, e.a));
    return add(e.a, mul(u, dot(sub(f, e.a), u)));
  }
  return add(e.c, mul(normalise(sub(f, e.c)), e.r));
}

const extremites = (e: ElementRaccord): [Vec, Vec] => (e.type === "ligne" ? [e.a, e.b] : [pointArc(e, e.debut), pointArc(e, e.fin)]);

/**
 * Raccord tangent entre une ligne et un arc, ou deux arcs (D-073, DA-02-10) : centres candidats à l'intersection
 * des courbes décalées du rayon ; retenu celui dont les points de tangence sont les plus proches du coin (les deux
 * extrémités les plus proches l'une de l'autre). Chaque élément est ajusté ou prolongé jusqu'à son point de
 * tangence ; l'arc de raccord est créé. Rayon nul refusé (pas de coin vif défini avec un arc).
 */
function raccordCourbe(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, o1: Occurrence<"esquisse">, o2: Occurrence<"esquisse">): ResultatCommande {
  const r = lire.longueur(p, "rayon")!.value;
  if (!(r > 0)) throw new ErreurCommande("invalide", "rayon", "rayon strictement positif pour un raccord avec un arc");
  const element = (o: Occurrence<"esquisse">): ElementRaccord => {
    const q = o.params;
    if (q.forme === "ligne") return { type: "ligne", a: q.points[0]!, b: q.points[1]! };
    if (!q.centre || !q.rayon) throw new ErreurCommande("precondition", "id1", `arc ${o.id} sans centre ni rayon`);
    return { type: "arc", c: q.centre, r: q.rayon.value, debut: q.angleDebut?.value ?? 0, fin: q.angleFin?.value ?? 360 };
  };
  const e1 = element(o1);
  const e2 = element(o2);
  const [x1, x2] = [extremites(e1), extremites(e2)];
  let coin: { i: number; j: number; d: number } = { i: 0, j: 0, d: Infinity };
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const d = distance(x1[i]!, x2[j]!); if (d < coin.d) coin = { i, j, d }; }
  const E1 = x1[coin.i]!;
  const E2 = x2[coin.j]!;
  let meilleur: { f: Vec; t1: Vec; t2: Vec; score: number } | null = null;
  for (const k1 of decalees(e1, r)) for (const k2 of decalees(e2, r)) for (const f of intersectionsCourbes(k1, k2)) {
    const t1 = tangence(e1, f);
    const t2 = tangence(e2, f);
    if (Math.abs(distance(f, t1) - r) > 1e-6 || Math.abs(distance(f, t2) - r) > 1e-6) continue;
    const score = distance(t1, E1) + distance(t2, E2);
    if (!meilleur || score < meilleur.score) meilleur = { f, t1, t2, score };
  }
  if (!meilleur) throw new ErreurCommande("precondition", "rayon", "aucun raccord de ce rayon entre ces deux éléments");
  const arr = (v: Vec) => pt(Math.round(v.x * 1e9) / 1e9, Math.round(v.y * 1e9) / 1e9);
  const angleDe = (c: Vec, q: Vec) => Math.round(((Math.atan2(q.y - c.y, q.x - c.x) * 180) / Math.PI) * 1e9) / 1e9;
  const ajuste = (o: Occurrence<"esquisse">, e: ElementRaccord, bout: number, t: Vec): OccurrenceQuelconque => {
    if (e.type === "ligne") {
      const points = [...o.params.points];
      points[bout] = arr(t);
      if (distance(points[0]!, points[1]!) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "rayon", "rayon trop grand pour ces éléments");
      return { ...o, params: { ...o.params, points } };
    }
    const a = angleDe(e.c, t);
    const q = o.params;
    return { ...o, params: { ...q, ...(bout === 0 ? { angleDebut: { value: a, unit: "deg" as const } } : { angleFin: { value: a, unit: "deg" as const } }) } };
  };
  const n1 = ajuste(o1, e1, coin.i, meilleur.t1);
  const n2 = ajuste(o2, e2, coin.j, meilleur.t2);
  const f = meilleur.f;
  let a0 = angleDe(f, meilleur.t1);
  let a1 = angleDe(f, meilleur.t2);
  let delta = a1 - a0;
  while (delta <= -180) delta += 360;
  while (delta > 180) delta -= 360;
  if (delta < 0) [a0, a1] = [a1, a0];
  const id = ctx.ids.nouveau("esquisse");
  const arc = { ...o1, id, groupeId: null, params: { ...o1.params, forme: "arc" as const, points: [], ferme: false, centre: arr(f), rayon: { value: r, unit: "m" as const }, angleDebut: { value: a0, unit: "deg" as const }, angleFin: { value: a1, unit: "deg" as const }, motif: null } };
  const effets = effetsVides();
  effets.modifies.push(o1.id, o2.id);
  effets.crees.push(id);
  if (o1.niveauId) effets.niveauxTouches.push(o1.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [o1.id]: n1, [o2.id]: n2, [id]: arc as OccurrenceQuelconque } }, effets };
}

/**
 * Chanfrein avec un arc (D-094, DA-02-11) : le coin est l'intersection des deux éléments (prolongés : droite
 * entière, cercle entier) la plus proche des deux extrémités voisines ; chaque élément est ramené à `distance` du coin,
 * mesurée le long de l'élément (longueur d'arc sur un arc), vers son autre extrémité ; un segment relie les deux points.
 */
function chanfreinCourbe(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, o1: Occurrence<"esquisse">, o2: Occurrence<"esquisse">): ResultatCommande {
  const d = lire.longueur(p, "distance", { strict: true })!.value;
  if (!(d > 0)) throw new ErreurCommande("invalide", "distance", "distance strictement positive");
  const element = (o: Occurrence<"esquisse">): ElementRaccord => {
    const q = o.params;
    if (q.forme === "ligne") return { type: "ligne", a: q.points[0]!, b: q.points[1]! };
    if (!q.centre || !q.rayon) throw new ErreurCommande("precondition", "id1", `arc ${o.id} sans centre ni rayon`);
    return { type: "arc", c: q.centre, r: q.rayon.value, debut: q.angleDebut?.value ?? 0, fin: q.angleFin?.value ?? 360 };
  };
  const e1 = element(o1);
  const e2 = element(o2);
  const [x1, x2] = [extremites(e1), extremites(e2)];
  let proche: { i: number; j: number; d: number } = { i: 0, j: 0, d: Infinity };
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { const dd = distance(x1[i]!, x2[j]!); if (dd < proche.d) proche = { i, j, d: dd }; }
  const E1 = x1[proche.i]!;
  const E2 = x2[proche.j]!;
  let coin: Vec | null = null;
  for (const x of intersectionsCourbes(decalees(e1, 0)[0]!, decalees(e2, 0)[0]!)) if (!coin || distance(x, E1) + distance(x, E2) < distance(coin, E1) + distance(coin, E2)) coin = x;
  if (!coin) throw new ErreurCommande("precondition", "id2", "les deux éléments ne se rencontrent pas, même prolongés");
  const X = coin;
  const arr = (v: Vec) => pt(Math.round(v.x * 1e9) / 1e9 || 0, Math.round(v.y * 1e9) / 1e9 || 0);
  const mod360 = (a: number) => ((a % 360) + 360) % 360;
  const ramener = (o: Occurrence<"esquisse">, e: ElementRaccord, bout: number): { objet: OccurrenceQuelconque; point: Vec } => {
    if (e.type === "ligne") {
      const loin = bout === 0 ? e.b : e.a;
      if (d >= distance(X, loin) - TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "distance", `distance trop grande pour ${o.id}`);
      const q = arr(add(X, mul(normalise(sub(loin, X)), d)));
      const points = [...o.params.points];
      points[bout] = q;
      return { objet: { ...o, params: { ...o.params, points } }, point: q };
    }
    const ax = (Math.atan2(X.y - e.c.y, X.x - e.c.x) * 180) / Math.PI;
    const pas = (d / e.r) * (180 / Math.PI);
    // Début ramené vers la fin (sens trigonométrique), ou fin ramenée vers le début (sens horaire).
    const portee = bout === 0 ? mod360(e.fin - ax) : mod360(ax - e.debut);
    if (pas >= portee - 1e-9) throw new ErreurCommande("precondition", "distance", `distance trop grande pour l'arc ${o.id}`);
    const a = Math.round((bout === 0 ? ax + pas : ax - pas) * 1e9) / 1e9;
    const q = o.params;
    return { objet: { ...o, params: { ...q, ...(bout === 0 ? { angleDebut: { value: a, unit: "deg" as const } } : { angleFin: { value: a, unit: "deg" as const } }) } }, point: arr(pointArc(e, a)) };
  };
  const r1 = ramener(o1, e1, proche.i);
  const r2 = ramener(o2, e2, proche.j);
  const id = ctx.ids.nouveau("esquisse");
  const segment = { ...o1, id, groupeId: null, params: { ...o1.params, forme: "ligne" as const, points: [r1.point, r2.point], ferme: false, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null } };
  const effets = effetsVides();
  effets.modifies.push(o1.id, o2.id);
  effets.crees.push(id);
  if (o1.niveauId) effets.niveauxTouches.push(o1.niveauId);
  return { etat: { ...etat, objets: { ...etat.objets, [o1.id]: r1.objet, [o2.id]: r2.objet, [id]: segment as OccurrenceQuelconque } }, effets };
}

function raccordOuChanfrein(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[], mode: "raccorder" | "chanfreiner"): ResultatCommande {
  void c;
  const id1 = lire.objet(etat, p, "id1");
  const id2 = lire.objet(etat, p, "id2");
  const o1 = etat.objets[id1]!;
  const o2 = etat.objets[id2]!;
  if (mode === "raccorder" && o1.classe === "esquisse" && o2.classe === "esquisse" && (o1.params.forme === "arc" || o2.params.forme === "arc") && (o1.params.forme === "ligne" || o1.params.forme === "arc") && (o2.params.forme === "ligne" || o2.params.forme === "arc")) {
    return raccordCourbe(etat, p, ctx, o1 as Occurrence<"esquisse">, o2 as Occurrence<"esquisse">);
  }
  if (mode === "chanfreiner" && o1.classe === "esquisse" && o2.classe === "esquisse" && (o1.params.forme === "arc" || o2.params.forme === "arc") && (o1.params.forme === "ligne" || o1.params.forme === "arc") && (o2.params.forme === "ligne" || o2.params.forme === "arc")) {
    return chanfreinCourbe(etat, p, ctx, o1 as Occurrence<"esquisse">, o2 as Occurrence<"esquisse">);
  }
  if (o1.classe !== "esquisse" || o2.classe !== "esquisse" || o1.params.forme !== "ligne" || o2.params.forme !== "ligne") {
    throw new ErreurCommande("precondition", "id1", `${mode} : deux lignes d'esquisse, ou une ligne et un arc, ou deux arcs`);
  }
  // Rayon nul (D-043) : jonction d'angle — les deux lignes sont ajustées ou prolongées jusqu'à leur intersection.
  const taille = lire.longueur(p, mode === "raccorder" ? "rayon" : "distance", { strict: mode === "chanfreiner" })!.value;
  if (taille < 0) throw new ErreurCommande("invalide", "rayon", "rayon positif ou nul");
  const [a1, b1] = [o1.params.points[0]!, o1.params.points[1]!];
  const [a2, b2] = [o2.params.points[0]!, o2.params.points[1]!];
  const far = 1e6;
  const d1 = sub(b1, a1);
  const d2 = sub(b2, a2);
  const x = intersectionSegments(add(a1, mul(d1, -far)), add(b1, mul(d1, far)), add(a2, mul(d2, -far)), add(b2, mul(d2, far)), 1e-6);
  if (!x) throw new ErreurCommande("precondition", "id2", "lignes parallèles");
  const coin = x.point;
  // Extrémité de chaque ligne la plus proche du coin → raccourcie de `recul`.
  const recul = mode === "raccorder" ? taille / Math.tan(Math.acos(Math.abs(Math.max(-1, Math.min(1, (d1.x * d2.x + d1.y * d2.y) / (Math.hypot(d1.x, d1.y) * Math.hypot(d2.x, d2.y)))))) / 2) : taille;
  const raccourcir = (a: Point2, b: Point2): [Point2, Point2, Point2] => {
    const procheA = distance(a, coin) <= distance(b, coin);
    const loin = procheA ? b : a;
    const dir = normalise(sub(loin, coin));
    const nouveau = add(coin, mul(dir, recul));
    const np = pt(nouveau.x, nouveau.y);
    return procheA ? [np, b, np] : [a, np, np];
  };
  const [n1a, n1b, p1] = raccourcir(a1, b1);
  const [n2a, n2b, p2] = raccourcir(a2, b2);
  if (distance(n1a, n1b) <= TOLERANCE_REDUCTEUR || distance(n2a, n2b) <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "rayon", "taille trop grande pour ces lignes");
  const objets: Record<string, OccurrenceQuelconque> = { ...etat.objets, [id1]: { ...o1, params: { ...o1.params, points: [n1a, n1b] } }, [id2]: { ...o2, params: { ...o2.params, points: [n2a, n2b] } } };
  if (mode === "raccorder" && taille === 0) {
    const e0 = effetsVides();
    e0.modifies.push(id1, id2);
    if (o1.niveauId) e0.niveauxTouches.push(o1.niveauId);
    return { etat: { ...etat, objets }, effets: e0 };
  }
  const id = ctx.ids.nouveau("esquisse");
  if (mode === "chanfreiner") {
    objets[id] = { ...o1, id, groupeId: null, params: { ...o1.params, forme: "ligne", points: [p1, p2] } };
  } else {
    // Centre du raccord : à `rayon` des deux lignes, du côté intérieur ; arc de p1 à p2.
    const dir1 = normalise(sub(p1, coin));
    const dir2 = normalise(sub(p2, coin));
    const bissectrice = normalise(add(dir1, dir2));
    const demiAngle = Math.acos(Math.max(-1, Math.min(1, dir1.x * dir2.x + dir1.y * dir2.y))) / 2;
    const centre = add(coin, mul(bissectrice, taille / Math.sin(demiAngle)));
    const angle = (q: Vec) => (Math.atan2(q.y - centre.y, q.x - centre.x) * 180) / Math.PI;
    let a0 = angle(p1);
    let a1deg = angle(p2);
    // L'arc passe du côté du coin opposé au centre : choisir le sens qui donne l'arc le plus court.
    let delta = a1deg - a0;
    while (delta <= -180) delta += 360;
    while (delta > 180) delta -= 360;
    if (delta < 0) [a0, a1deg] = [a1deg, a0];
    objets[id] = { ...o1, id, groupeId: null, params: { ...o1.params, forme: "arc", points: [], ferme: false, centre: pt(centre.x, centre.y), rayon: { value: taille, unit: "m" }, angleDebut: { value: a0, unit: "deg" }, angleFin: { value: a1deg, unit: "deg" }, motif: null } };
  }
  const effets = effetsVides();
  effets.modifies.push(id1, id2);
  effets.crees.push(id);
  if (o1.niveauId) effets.niveauxTouches.push(o1.niveauId);
  return { etat: { ...etat, objets }, effets };
}

/**
 * Dupliquer un niveau avec son contenu (D-040) : un nouveau niveau (nom, altitude saisis ; hauteur reprise de la
 * source si elle est renseignée) et une copie de chaque objet du niveau source, au même endroit en plan. Ce qui
 * dépend des autres niveaux est traité explicitement, jamais deviné :
 * - un mur à « niveau haut » garde sa hauteur effective, écrite comme hauteur (altitude du niveau haut − altitude
 *   du niveau source), puisque ce niveau haut n'est plus au-dessus de la copie dans le cas général ;
 * - un escalier part du nouveau niveau, sans niveau d'arrivée (hauteur à franchir conservée) ;
 * - les annotations liées gardent leurs références vers les originaux non copiées (copie non associative).
 */
export function dupliquerNiveau(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, creerNiveau: (e: ModeleAtelier, q: Brut) => ResultatCommande): ResultatCommande {
  const sourceId = lire.chaine(p, "source");
  const source = etat.niveaux[sourceId];
  if (!source) throw new ErreurCommande("precondition", "source", `niveau inconnu : ${sourceId}`);
  const r1 = creerNiveau(etat, { id: p["id"], nom: p["nom"], elevation: p["elevation"], hauteur: p["hauteur"] === undefined ? source.hauteur : p["hauteur"] });
  const nouveau = r1.effets.crees[0]!;
  const sel = (Object.values(r1.etat.objets) as OccurrenceQuelconque[]).filter((o) => o.niveauId === sourceId && !estOuverture(o.classe)).sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!sel.length) return r1;
  const r2 = copier(r1.etat, sel, { type: "translation", dx: 0, dy: 0 }, ctx);
  const objets = { ...r2.etat.objets };
  for (const id of r2.effets.crees) {
    const o = objets[id]!;
    let copie = { ...o, niveauId: nouveau } as OccurrenceQuelconque;
    if (copie.classe === "mur") {
      // Le caractère « extérieur » suit le mur source (même axe, copie sur place).
      const src = sel.find((x): x is Occurrence<"mur"> => x.classe === "mur" && x.params.a.x === (copie as Occurrence<"mur">).params.a.x && x.params.a.y === (copie as Occurrence<"mur">).params.a.y && x.params.b.x === (copie as Occurrence<"mur">).params.b.x && x.params.b.y === (copie as Occurrence<"mur">).params.b.y);
      if (src) copie = { ...copie, params: { ...copie.params, exterieur: src.params.exterieur } } as OccurrenceQuelconque;
    }
    if (copie.classe === "mur" && copie.params.niveauHautId) {
      const haut = etat.niveaux[copie.params.niveauHautId];
      copie = { ...copie, params: { ...copie.params, niveauHautId: null, hauteur: haut && haut.elevation > source.elevation ? { value: Math.round((haut.elevation - source.elevation) * 1e6) / 1e6, unit: "m" } : copie.params.hauteur } };
    }
    // Espace sur plusieurs niveaux (D-142) : la copie garde son étendue en hauteur propre.
    if (copie.classe === "espace" && copie.params.niveauHautId) {
      const haut = etat.niveaux[copie.params.niveauHautId];
      const { niveauHautId: _h, ...reste } = copie.params;
      copie = { ...copie, params: { ...reste, ...(haut && haut.elevation > source.elevation ? { hauteur: { value: Math.round((haut.elevation - source.elevation) * 1e6) / 1e6, unit: "m" as const } } : {}) } };
    }
    if (copie.classe === "escalier") copie = { ...copie, params: { ...copie.params, niveauDepartId: nouveau, niveauArriveeId: null } };
    objets[id] = copie;
  }
  const effets = fusionnerEffets(r1.effets, r2.effets);
  return { etat: { ...r2.etat, objets }, effets: { ...effets, niveauxTouches: [...new Set([...effets.niveauxTouches, nouveau])] } };
}


/**
 * Réseau suivant une trajectoire (D-058, DA-02-12) : copies de la sélection le long d'une esquisse (ligne,
 * polyligne, polygone, spline, construction), à intervalles égaux en longueur — `nombre` copies (dernière au bout
 * d'un trajet ouvert ; réparties sur le tour d'un trajet fermé) ou un `pas` (m). Le point de `base` de la sélection
 * est posé sur le trajet à chaque intervalle ; avec `orienter`, chaque copie tourne autour de ce point de l'écart
 * entre la tangente du trajet et la tangente au départ. L'original reste en place.
 */
function repeterSurTrajet(etat: ModeleAtelier, sel: OccurrenceQuelconque[], p: Brut, ctx: ContexteCommande): ResultatCommande {
  const trajetId = lire.chaine(p, "trajetId");
  const tr = etat.objets[trajetId];
  if (!tr || tr.classe !== "esquisse" || !["ligne", "polyligne", "polygone", "spline", "construction"].includes(tr.params.forme)) throw new ErreurCommande("precondition", "trajetId", `trajectoire : ligne, polyligne, polygone ou spline attendue (${trajetId})`);
  if (sel.some((o) => o.id === trajetId)) throw new ErreurCommande("precondition", "cibles", "la trajectoire ne fait pas partie de la sélection répétée");
  const ferme = tr.params.ferme || tr.params.forme === "polygone";
  const brut = tr.params.forme === "spline" ? pointsSpline(tr.params.points, 16, ferme, tr.params.tangentes) : tr.params.points;
  const pts: Vec[] = ferme ? [...brut, brut[0]!] : [...brut];
  const cumul = [0];
  for (let i = 1; i < pts.length; i++) cumul.push(cumul[i - 1]! + distance(pts[i - 1]!, pts[i]!));
  const L = cumul[cumul.length - 1]!;
  if (!(L > TOLERANCE_REDUCTEUR)) throw new ErreurCommande("precondition", "trajetId", "trajectoire de longueur nulle");
  const base = lire.point(p, "base")!;
  const orienter = lire.booleen(p, "orienter", false);
  const pas = lire.nombre(p, "pas", { optionnel: true, min: 0.001 });
  const nombre = pas === null ? lire.nombre(p, "nombre", { entier: true, min: 1, max: 500 })! : null;
  const abscisses: number[] = [];
  if (pas !== null) for (let s = pas; s <= L + 1e-9 && abscisses.length < 500; s += pas) abscisses.push(Math.min(s, L));
  else for (let k = 1; k <= nombre!; k++) abscisses.push(ferme ? (L * k) / (nombre! + 1) : (L * k) / nombre!);
  if (!abscisses.length) throw new ErreurCommande("precondition", "pas", `pas plus long que la trajectoire (${L.toFixed(3)} m)`);
  const en = (s: number): { point: Vec; angle: number } => {
    let i = 1;
    while (i < cumul.length - 1 && cumul[i]! < s) i++;
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const l = cumul[i]! - cumul[i - 1]!;
    const t = l > 0 ? (s - cumul[i - 1]!) / l : 0;
    return { point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  };
  const depart = en(0);
  let courant = etat;
  let effets = effetsVides();
  for (const s of abscisses) {
    const { point, angle } = en(s);
    // Le point de base de la sélection est posé sur le trajet, en P(s).
    const dx = point.x - base.x;
    const dy = point.y - base.y;
    const t = translationPuisRotation(dx, dy, point, orienter ? angle - depart.angle : 0);
    const r = copier(courant, sel, t, ctx);
    courant = r.etat;
    effets = fusionnerEffets(effets, r.effets);
  }
  return { etat: courant, effets };
}

/** Translation (dx, dy) suivie d'une rotation d'angle θ (radians) autour de P : une seule transformation rigide. */
function translationPuisRotation(dx: number, dy: number, P: Vec, theta: number): Transformation {
  if (Math.abs(theta) < 1e-12) return { type: "translation", dx, dy };
  // x ↦ R(x + d − P) + P = R·x + τ, avec τ = R(d − P) + P ; centre fixe Q = (I − R)⁻¹ τ.
  const c = Math.cos(theta);
  const sn = Math.sin(theta);
  const ux = dx - P.x;
  const uy = dy - P.y;
  const tx = c * ux - sn * uy + P.x;
  const ty = sn * ux + c * uy + P.y;
  const a11 = 1 - c;
  const a12 = sn;
  const a21 = -sn;
  const a22 = 1 - c;
  const det = a11 * a22 - a12 * a21;
  return { type: "rotation", centre: { x: (a22 * tx - a12 * ty) / det, y: (-a21 * tx + a11 * ty) / det }, angleDeg: (theta * 180) / Math.PI };
}

/**
 * Aligner (D-058, DA-02-03) : la sélection est déplacée pour que `source1` vienne sur `dest1`, puis tournée autour
 * de `dest1` pour que la direction source1 → source2 prenne celle de dest1 → dest2 (sans mise à l'échelle). Avec
 * `copie`, l'original reste.
 */
export function alignerSelection(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
  const sel = cibles(etat, p, c);
  const s1 = lire.point(p, "source1")!;
  const s2 = lire.point(p, "source2")!;
  const d1 = lire.point(p, "dest1")!;
  const d2 = lire.point(p, "dest2")!;
  if (distance(s1, s2) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "source2", "les deux points source sont confondus");
  if (distance(d1, d2) < TOLERANCE_REDUCTEUR) throw new ErreurCommande("invalide", "dest2", "les deux points de destination sont confondus");
  let theta = Math.atan2(d2.y - d1.y, d2.x - d1.x) - Math.atan2(s2.y - s1.y, s2.x - s1.x);
  theta = Math.atan2(Math.sin(theta), Math.cos(theta));
  const t = translationPuisRotation(d1.x - s1.x, d1.y - s1.y, d1, theta);
  return lire.booleen(p, "copie", false) ? copier(etat, sel, t, ctx) : appliquerEnPlace(etat, sel, t, ctx);
}

/**
 * Codes des pièces copiées (D-060, DA-02-02) : `codes` = « garder » (par défaut, comme avant), « vider » (code à
 * renseigner) ou « suivant » — le numéro final du code est porté au premier numéro libre du projet, zéros de tête
 * gardés (B07 → B08) ; un code sans numéro reçoit « -2 », « -3 »… Aucun autre paramètre de la pièce ne change.
 */
function codesDesCopies(r: ResultatCommande, p: Brut): ResultatCommande {
  const mode = lire.enumeration(p, "codes", ["garder", "vider", "suivant"] as const, "garder");
  if (mode === "garder") return r;
  let objets = r.etat.objets;
  const pris = new Set(Object.values(objets).filter((o): o is Occurrence<"piece"> => o.classe === "piece" && !r.effets.crees.includes(o.id)).map((o) => o.params.code).filter((x): x is string => !!x));
  for (const id of r.effets.crees) {
    const o = objets[id];
    if (o?.classe !== "piece" || !o.params.code) continue;
    let code: string | null = null;
    if (mode === "suivant") {
      const m = /^(.*?)(\d+)$/.exec(o.params.code);
      for (let k = m ? Number(m[2]) + 1 : 2; !code || pris.has(code); k++) code = m ? `${m[1]}${String(k).padStart(m[2]!.length, "0")}` : `${o.params.code}-${k}`;
      pris.add(code);
    }
    objets = { ...objets, [id]: { ...o, params: { ...o.params, code } } };
  }
  return { etat: { ...r.etat, objets }, effets: r.effets };
}
