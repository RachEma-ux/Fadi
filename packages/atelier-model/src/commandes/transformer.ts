/**
 * Transformations (DA-02) comme commandes réversibles sur une sélection : déplacer, copier, tourner, miroir,
 * échelle, répéter, décaler, étirer, ajuster, prolonger, décomposer, points de contrôle, raccorder, chanfreiner.
 * Règles (D-012) : une ouverture suit son mur et ne se transforme pas seule ; copier / répéter / décaler un mur
 * emporte des copies de ses ouvertures sans `repere`, `exterieur` ni `statutConception` ; l'échelle est uniforme,
 * ne touche pas aux dimensions typées et refuse les escaliers ; un miroir en place d'un mur met « à réparer »
 * les références à ses faces ; étirer conserve la distance des ouvertures à l'extrémité fixe.
 */
import { decomposerBloc } from "./bloc.js";
import { add, distance, intersectionSegments, mul, normalise, projectionSurSegment, sub, transformerPoint2, type Transformation, type Vec } from "../geometrie.js";
import type { Contour, ModeleAtelier, Occurrence, OccurrenceQuelconque, Reference } from "../modele.js";
import { ouverturesDuMur, referencesVers } from "../modele.js";
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

/** Applique une transformation géométrique aux paramètres d'une occurrence (sans toucher aux dimensions typées). */
export function transformerOccurrence(o: OccurrenceQuelconque, t: Transformation): OccurrenceQuelconque {
  const T = (q: Point2) => transformerPoint2(q, t);
  const rot = t.type === "rotation" ? t.angleDeg : 0;
  switch (o.classe) {
    case "mur":
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } };
    case "porte":
      // Le miroir change le côté d'ouverture d'une porte dont le sens est renseigné (D-037).
      if (t.type === "miroir" && o.params.ouvrant) return { ...o, params: { ...o.params, ouvrant: { ...o.params.ouvrant, cote: o.params.ouvrant.cote === "gauche" ? "droite" : "gauche" } } };
      return o;
    case "fenetre":
    case "ouverture":
      return o;
    case "dalle":
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
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } };
    case "poteau":
      return { ...o, params: { ...o.params, point: T(o.params.point), angle: { value: o.params.angle.value + rot, unit: "deg" } } };
    case "esquisse":
      return { ...o, params: { ...o.params, points: o.params.points.map(T), centre: o.params.centre ? T(o.params.centre) : null, rayon: t.type === "echelle" && o.params.rayon ? { value: o.params.rayon.value * t.facteur, unit: "m" } : o.params.rayon } };
    case "cotation":
      return { ...o, params: { ...o.params, a: T(o.params.a), b: T(o.params.b) } };
    case "texte":
    case "etiquette":
      return { ...o, params: { ...o.params, position: T(o.params.position) } } as OccurrenceQuelconque;
    case "bloc-occurrence":
      return { ...o, params: { ...o.params, position: T(o.params.position), angle: { value: o.params.angle.value + rot, unit: "deg" }, echelle: t.type === "echelle" ? o.params.echelle * t.facteur : o.params.echelle } };
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
      return { type, centre: lire.point(p, "centre")!, facteur };
    }
  }
}

function appliquerEnPlace(etat: ModeleAtelier, selection: OccurrenceQuelconque[], t: Transformation, ctx: ContexteCommande): ResultatCommande {
  if (t.type === "echelle" && selection.some((o) => o.classe === "escalier")) throw new ErreurCommande("precondition", "cibles", "échelle refusée sur un escalier (dimensions typées)");
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
function copier(etat: ModeleAtelier, selection: OccurrenceQuelconque[], t: Transformation, ctx: ContexteCommande): ResultatCommande {
  if (t.type === "echelle" && selection.some((o) => o.classe === "escalier")) throw new ErreurCommande("precondition", "cibles", "échelle refusée sur un escalier");
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
    let copie = transformerOccurrence({ ...o, id }, t);
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
    if (o.classe === "mur" && o.params.niveauHautId) {
      const haut = etat.niveaux[o.params.niveauHautId];
      if (haut && haut.elevation <= cible.elevation) throw new ErreurCommande("precondition", "niveauCible", `mur ${id} : son niveau haut « ${haut.nom} » ne serait plus au-dessus du niveau « ${cible.nom} »`);
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
    return appliquerEnPlace(etat, cibles(etat, p, c), lireTransformation(p, "rotation"), ctx);
  },
  miroir(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    const t = lireTransformation(p, "miroir");
    return lire.booleen(p, "copie", false) ? copier(etat, sel, t, ctx) : appliquerEnPlace(etat, sel, t, ctx);
  },
  echelle(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    return appliquerEnPlace(etat, cibles(etat, p, c), lireTransformation(p, "echelle"), ctx);
  },
  copier(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const r = copier(etat, cibles(etat, p, c), lireTransformation(p, "translation"), ctx);
    const niveauCible = lire.chaineOuNull(p, "niveauCible");
    return niveauCible ? versNiveau(r, r.effets.crees, niveauCible) : r;
  },
  repeter(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    const nombre = lire.nombre(p, "nombre", { entier: true, min: 1, max: 500 })!;
    const centre = lire.point(p, "centre", { optionnel: true });
    let courant = etat;
    let effets = effetsVides();
    for (let i = 1; i <= nombre; i++) {
      const t: Transformation = centre ? { type: "rotation", centre, angleDeg: lire.angle(p, "angle")!.value * i } : { type: "translation", dx: lire.nombre(p, "dx")! * i, dy: lire.nombre(p, "dy")! * i };
      const r = copier(courant, sel, t, ctx);
      courant = r.etat;
      effets = fusionnerEffets(effets, r.effets);
    }
    return { etat: courant, effets };
  },
  decaler(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    const sel = cibles(etat, p, c);
    const d = lire.longueur(p, "distance")!.value;
    const cote = lire.enumeration(p, "cote", ["gauche", "droite"] as const, "gauche");
    const signe = cote === "gauche" ? 1 : -1;
    let courant = etat;
    let effets = effetsVides();
    for (const o of sel) {
      if (o.classe === "mur" || (o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "construction"))) {
        const a: Vec = o.classe === "mur" ? o.params.a : o.params.points[0]!;
        const b: Vec = o.classe === "mur" ? o.params.b : o.params.points[1]!;
        const dir = normalise(sub(b, a));
        const n = { x: -dir.y * d * signe, y: dir.x * d * signe };
        const r = copier(courant, [o], { type: "translation", dx: n.x, dy: n.y }, ctx);
        courant = r.etat;
        effets = fusionnerEffets(effets, r.effets);
      } else if (o.classe === "esquisse" && o.params.forme === "polyligne") {
        const dec = decalerPolylignePure(o.params.points, d * signe);
        const id = ctx.ids.nouveau("esquisse");
        courant = { ...courant, objets: { ...courant.objets, [id]: { ...o, id, params: { ...o.params, points: dec }, groupeId: null } } };
        effets = fusionnerEffets(effets, { ...effetsVides(), crees: [id], niveauxTouches: o.niveauId ? [o.niveauId] : [] });
      } else {
        throw new ErreurCommande("precondition", "cibles", `décalage non pris en charge pour la classe ${o.classe} (murs, lignes et polylignes seulement)`);
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
      const params = extremite === "a" ? { ...o.params, a: point } : { ...o.params, b: point };
      const nouvelleLongueur = distance(params.a, params.b);
      if (nouvelleLongueur <= TOLERANCE_REDUCTEUR) throw new ErreurCommande("precondition", "point", "mur de longueur nulle");
      const ancienneLongueur = distance(o.params.a, o.params.b);
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
      if (o.classe !== "esquisse" || !["polyligne", "polygone", "rectangle"].includes(o.params.forme)) {
        throw new ErreurCommande("precondition", "cibles", `décomposition non prise en charge pour ${o.id} (polylignes, polygones et rectangles d'esquisse, occurrences de bloc)`);
      }
      const pts = o.params.forme === "rectangle" && o.params.points.length === 2 ? rectangleEnPoints(o.params.points[0]!, o.params.points[1]!) : o.params.points;
      const segments: [Point2, Point2][] = [];
      for (let i = 0; i + 1 < pts.length; i++) segments.push([pts[i]!, pts[i + 1]!]);
      if (o.params.ferme && pts.length > 2) segments.push([pts[pts.length - 1]!, pts[0]!]);
      const objets = { ...courant.objets };
      delete objets[o.id];
      const crees: string[] = [];
      for (const [a, b] of segments) {
        const id = ctx.ids.nouveau("esquisse");
        objets[id] = { ...o, id, groupeId: null, params: { ...o.params, forme: "ligne", points: [a, b], ferme: false, centre: null, rayon: null, angleDebut: null, angleFin: null, motif: null } };
        crees.push(id);
      }
      courant = { ...courant, objets };
      effets = fusionnerEffets(effets, { ...effetsVides(), crees, supprimes: [o.id], niveauxTouches: o.niveauId ? [o.niveauId] : [] });
    }
    return { etat: courant, effets };
  },
  pointsDeControle(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[]): ResultatCommande {
    void c;
    void ctx;
    const id = lire.objet(etat, p, "id");
    const o = etat.objets[id]!;
    const index = lire.nombre(p, "index", { entier: true, min: 0 })!;
    const point = lire.point(p, "point")!;
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
  if (!axe || !axeLimite) throw new ErreurCommande("precondition", "id", `${mode} : murs, escaliers et lignes seulement`);
  const far = 1e6;
  const dA = sub(axe[1], axe[0]);
  const dB = sub(axeLimite[1], axeLimite[0]);
  const x = intersectionSegments(add(axe[0], mul(dA, -far)), add(axe[1], mul(dA, far)), add(axeLimite[0], mul(dB, -far)), add(axeLimite[1], mul(dB, far)), 1e-6);
  if (!x) throw new ErreurCommande("precondition", "limiteId", "objets parallèles : aucune intersection");
  const pr = projectionSurSegment(x.point, axe[0], axe[1]);
  const extremite: "a" | "b" = mode === "prolonger" ? (distance(axe[0], x.point) <= distance(axe[1], x.point) ? "a" : "b") : pr.t < 0.5 ? "a" : "b";
  if (mode === "ajuster" && (pr.t <= 0 || pr.t >= 1)) throw new ErreurCommande("precondition", "limiteId", "la limite ne coupe pas l'objet : rien à ajuster");
  return reducteursTransformer.etirer(etat, { id, extremite, point: pt(x.point.x, x.point.y) }, ctx, []);
}

function raccordOuChanfrein(etat: ModeleAtelier, p: Brut, ctx: ContexteCommande, c: string[], mode: "raccorder" | "chanfreiner"): ResultatCommande {
  void c;
  const id1 = lire.objet(etat, p, "id1");
  const id2 = lire.objet(etat, p, "id2");
  const o1 = etat.objets[id1]!;
  const o2 = etat.objets[id2]!;
  if (o1.classe !== "esquisse" || o2.classe !== "esquisse" || o1.params.forme !== "ligne" || o2.params.forme !== "ligne") {
    throw new ErreurCommande("precondition", "id1", `${mode} : deux lignes d'esquisse seulement`);
  }
  const taille = lire.longueur(p, mode === "raccorder" ? "rayon" : "distance", { strict: true })!.value;
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

