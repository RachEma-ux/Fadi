/**
 * Outils de solides (cahier-planche §4.22, §4.23 ; lot 6, MO-4 « booléens de maillage ») — une fabrique, six machines
 * pures : Coque extérieure, Union, Soustraction, Découpe (Trim), Intersection, Scission (Split).
 *
 * « Choisissez le premier solide. » → « Choisissez le second solide. » : chaque clic doit viser un groupe ou composant
 * SOLIDE (fermé, chaque arête bordant deux faces), sinon le motif est annoncé et rien ne change. Au second clic, le
 * moteur booléen injecté par l'interface (`ctx.booleens`, manifold-3d chargé à la demande) combine les maillages
 * monde des deux solides ; le résultat est reconverti en faces planes polygonales et devient un nouveau groupe à la
 * racine ; les solides d'origine disparaissent selon l'outil (Découpe garde le premier). Un seul pas d'annulation.
 * Matières : celles des faces d'origine coplanaires et superposées sont reportées sur les faces du résultat ; la
 * matière du groupe revient par défaut (obs). Sans moteur chargé, les outils le disent.
 */
import { type FacesPolygonales, type Id, type Modele, contexte, creerGroupeDepuisFaces, effacerEntites, matriceMonde, appliquer, positionsFace, transformerNormale } from "../geometrie-libre.js";
import { type Maillage, PasUnSolide, facesDuMaillage, maillageDuSolide, motifNonSolide, volumeDuMaillage } from "../maillage.js";
import { type Vec3, add, cross, dot, len, normalize, scale, sub, v3 } from "../vecteur.js";
import { contexteSaisie, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, viseeElement, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Transition, VueOutil } from "./machine.js";

export type OperationSolide = "enveloppe-exterieure" | "union" | "soustraction" | "ajuster" | "intersection" | "scinder";

export interface EtatSolide {
  readonly premier: Id | null;
  readonly survol: Id | null;
  readonly erreur: string | null;
}

const initial = (): EtatSolide => ({ premier: null, survol: null, erreur: null });

const NOMS: Readonly<Record<OperationSolide, string>> = {
  "enveloppe-exterieure": "Coque extérieure",
  union: "Union",
  soustraction: "Soustraction",
  ajuster: "Découpe",
  intersection: "Intersection",
  scinder: "Scission",
};

/** Faces monde (avec matière) des deux solides d'origine, pour reporter les matières sur le résultat. */
function facesOrigine(m: Modele, occs: readonly Id[]): { exterieur: Vec3[]; normale: Vec3; materiau: string }[] {
  const r: { exterieur: Vec3[]; normale: Vec3; materiau: string }[] = [];
  for (const occ of occs) {
    const c = contexte(m, occ);
    const M = matriceMonde(m, occ);
    for (const f of Object.values(c.faces)) {
      if (!f.materiauRecto) continue;
      const p = positionsFace(c, f);
      r.push({ exterieur: p.exterieur.map((q) => (M ? appliquer(M, q) : q)), normale: normalize(M ? transformerNormale(M, f.normale) : f.normale), materiau: f.materiauRecto });
    }
  }
  return r;
}

function dansPolygone3D(p: Vec3, poly: readonly Vec3[], n: Vec3): boolean {
  // Projection sur le plan : somme des angles / parité par un axe dominant.
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const p2 = (q: Vec3): { x: number; y: number } => (az >= ax && az >= ay ? { x: q.x, y: q.y } : ax >= ay ? { x: q.y, y: q.z } : { x: q.x, y: q.z });
  const P = p2(p);
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = p2(poly[i] as Vec3), b = p2(poly[j] as Vec3);
    if (a.y > P.y !== b.y > P.y && P.x < ((b.x - a.x) * (P.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}

/** Matière de chaque face du résultat : face d'origine coplanaire (même sens) contenant son centre. */
function materiauxDuResultat(faces: FacesPolygonales, origines: ReturnType<typeof facesOrigine>): (string | undefined)[] {
  return faces.map((f) => {
    const ext = f[0] as readonly Vec3[];
    let centre = v3(0, 0, 0);
    for (const p of ext) centre = add(centre, p);
    centre = scale(centre, 1 / ext.length);
    let n = v3(0, 0, 0);
    for (let i = 0; i < ext.length; i++) n = add(n, cross(ext[i] as Vec3, ext[(i + 1) % ext.length] as Vec3));
    if (len(n) < 1e-12) return undefined;
    n = normalize(n);
    for (const o of origines) {
      if (dot(o.normale, n) < 0.999) continue;
      if (Math.abs(dot(o.normale, sub(centre, o.exterieur[0] as Vec3))) > 1e-6) continue;
      if (dansPolygone3D(centre, o.exterieur, o.normale)) return o.materiau;
    }
    return undefined;
  });
}

function groupeDepuisMaillage(m: Modele, mesh: Maillage, nom: string, origines: ReturnType<typeof facesOrigine>): { modele: Modele; occurrence: Id } | null {
  if (mesh.triangles.length === 0 || Math.abs(volumeDuMaillage(mesh)) < 1e-12) return null;
  const { faces } = facesDuMaillage(mesh);
  if (faces.length === 0) return null;
  const r = creerGroupeDepuisFaces(m, faces, { nom, materiauxFaces: materiauxDuResultat(faces, origines) });
  return { modele: r.modele, occurrence: r.occurrence };
}

/** Applique l'opération ; retourne le modèle final et les ids des groupes créés. */
export function opererSolides(ctx: ContexteOutil, op: OperationSolide, a: Id, b: Id): { modele: Modele; crees: Id[] } {
  const moteur = ctx.booleens;
  if (!moteur) throw new Error("Le moteur booléen (manifold-3d) n'est pas chargé : les outils de solides sont indisponibles.");
  const m0 = ctx.modele;
  const A = maillageDuSolide(m0, a);
  const B = maillageDuSolide(m0, b);
  const origines = facesOrigine(m0, [a, b]);
  const o = ctx.dans !== undefined ? { dans: ctx.dans } : {};
  let m = m0;
  const crees: Id[] = [];
  const poser = (mesh: Maillage, nom: string): void => {
    const g = groupeDepuisMaillage(m, mesh, nom, origines);
    if (g) {
      m = g.modele;
      crees.push(g.occurrence);
    }
  };
  switch (op) {
    case "enveloppe-exterieure":
    case "union":
      poser(moteur.union(A, B), NOMS[op]);
      m = effacerEntites(m, [a, b], o).modele;
      break;
    case "soustraction":
      poser(moteur.difference(B, A), NOMS[op]);
      m = effacerEntites(m, [a, b], o).modele;
      break;
    case "ajuster":
      poser(moteur.difference(B, A), NOMS[op]);
      m = effacerEntites(m, [b], o).modele;
      break;
    case "intersection":
      poser(moteur.intersection(A, B), NOMS[op]);
      m = effacerEntites(m, [a, b], o).modele;
      break;
    case "scinder":
      poser(moteur.difference(A, B), `${NOMS[op]} A − B`);
      poser(moteur.intersection(A, B), `${NOMS[op]} A ∩ B`);
      poser(moteur.difference(B, A), `${NOMS[op]} B − A`);
      m = effacerEntites(m, [a, b], o).modele;
      break;
  }
  if (crees.length === 0) throw new Error(`${NOMS[op]} : le résultat est vide (les solides ne se recouvrent pas comme il faut).`);
  return { modele: m, crees };
}

export function creerMachineSolide(op: OperationSolide): MachineOutil<EtatSolide> {
  const id = op;
  const consigne = (i: 0 | 1): string => consigneDe("enveloppe-exterieure", i);
  return {
    id,
    initial,
    traiter(etat, ev, ctx): Transition<EtatSolide> {
      switch (ev.genre) {
        case "survol": {
          const { el, cible } = viseeElement(ctx, ev);
          return { etat: { ...etat, survol: el && cible && cible.genre === "occurrence" ? cible.id : null } };
        }
        case "clic": {
          const { el, cible } = viseeElement(ctx, ev);
          if (!el || !cible || cible.genre !== "occurrence") return { etat: { ...etat, erreur: "Cliquez sur un groupe ou un composant solide." } };
          const motif = motifNonSolide(ctx.modele, cible.id);
          if (motif) return { etat: { ...etat, erreur: `Cet objet n'est pas un solide : ${motif}.` } };
          if (!etat.premier) return { etat: { ...etat, premier: cible.id, erreur: null } };
          if (etat.premier === cible.id) return { etat: { ...etat, erreur: "Choisissez un second solide différent du premier." } };
          try {
            const r = opererSolides(ctx, op, etat.premier, cible.id);
            return { etat: initial(), modele: r.modele, selection: r.crees, operation: NOMS[op] };
          } catch (err) {
            return { etat: { ...etat, premier: null, erreur: err instanceof PasUnSolide ? err.message : messageErreur(err) } };
          }
        }
        case "echap":
          return { etat: initial() };
        case "saisie":
          return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par les outils de solides." } };
        case "touche":
        case "appui":
        case "glisser":
        case "relache":
          return { etat };
      }
    },
    vue(etat, ctx): VueOutil {
      const sansMoteur = ctx.booleens ? null : "Moteur booléen non chargé : les outils de solides sont indisponibles.";
      return vueModif({ consigne: consigne(etat.premier ? 1 : 0), mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)), survol: etat.survol ? [etat.survol] : [], selection: etat.premier ? [etat.premier, ...ctx.selection.filter((x) => x !== etat.premier)] : ctx.selection, ctx, erreur: etat.erreur ?? sansMoteur });
    },
  };
}

export const MACHINES_SOLIDES: readonly MachineOutil<EtatSolide>[] = (["enveloppe-exterieure", "union", "soustraction", "ajuster", "intersection", "scinder"] as const).map(creerMachineSolide);
