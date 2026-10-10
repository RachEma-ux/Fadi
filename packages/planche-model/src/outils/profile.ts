/**
 * Outil Profilé (lot L12, programme D-202 ; statut `fadi` au catalogue) — machine pure.
 *
 * La section vient de l'interface (`ContexteOutil.sectionCourante` : ligne d'un catalogue sourcé du projet, dimensions
 * saisies ou face de la Planche) ; sans section, l'outil le dit et ne pose rien. Étape 1 : un clic place le début de la
 * pièce. Étape 2 : la pièce suit le curseur en aperçu ; un clic ou une longueur tapée la pose (un pas d'historique),
 * puis l'outil revient à l'étape 1. Flèches : verrou d'axe (rouge, vert, bleu) ; Maj reste le verrou d'inférence.
 * Options : point de placement (Ctrl seul les fait défiler) et rotation de 90° (Alt seul) — écart Fadi déclaré
 * (MetalFab garde Ctrl / Alt pour d'autres usages).
 */
import { poserPiece } from "../geometrie-libre.js";
import { type Inference, type Verrou, geometrieVisible, inferer } from "../inference.js";
import { type PlacementPiece, type PointPlacement, PLACEMENT_DEFAUT, POINTS_PLACEMENT, prismePiece, repereSegment, sectionPosee } from "../profiles.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, add, dist, len, normalize, scale, sub } from "../vecteur.js";
import { messageErreur } from "./commun-formes.js";
import { enLocal, saisieDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, ModificateurSeul, OptionOutil, Rayon, Touche, Transition, VueOutil } from "./machine.js";
import { optionsDans } from "./selection.js";

export const ID_PROFILE = "profile";

export const ERREUR_SANS_SECTION = "Choisissez d'abord une section dans le panneau Profilés : ligne de catalogue, dimensions saisies ou face.";
export const CONSIGNE_PROFILE_1 = "Cliquez le début de la pièce.";
export const CONSIGNE_PROFILE_2 = "Cliquez la fin de la pièce, ou tapez sa longueur.";

export interface EtatProfile {
  readonly etape: 1 | 2;
  readonly depart: Vec3 | null;
  readonly inference: Inference | null;
  readonly fleche: { readonly touche: Touche; readonly verrou: Verrou } | null;
  readonly verrouMaj: Verrou | null;
  readonly point: PointPlacement;
  readonly rotation90: boolean;
  readonly rayon: { readonly rayon: Rayon; readonly tolerance: number } | null;
  readonly erreur: string | null;
}

const placementDe = (e: EtatProfile): PlacementPiece => ({ ...PLACEMENT_DEFAUT, point: e.point, rotation90: e.rotation90 });

function inferenceProfile(e: EtatProfile, ctx: ContexteOutil, r: Rayon, tolerance: number): Inference {
  const v = e.verrouMaj ?? e.fleche?.verrou;
  return inferer({
    rayon: r,
    tolerance,
    geometrie: geometrieVisible(ctx.modele),
    ...(e.etape === 2 && e.depart ? { depart: e.depart } : {}),
    ...(v ? { verrou: v } : {}),
    ...(ctx.repere ? { axes: ctx.repere } : {}),
  });
}

const recalculer = (e: EtatProfile, ctx: ContexteOutil): EtatProfile => (e.rayon ? { ...e, inference: inferenceProfile(e, ctx, e.rayon.rayon, e.rayon.tolerance) } : e);

/** Pose la pièce de A à B (monde) dans le contexte d'édition : un pas « Profilé », la pièce sélectionnée. */
function poser(e: EtatProfile, ctx: ContexteOutil, A: Vec3, B: Vec3): Transition<EtatProfile> {
  const s = ctx.sectionCourante;
  if (!s) return { etat: { ...e, erreur: ERREUR_SANS_SECTION } };
  if (dist(A, B) < 1e-9) return { etat: { ...e, erreur: "Longueur nulle : aucune pièce posée." } };
  try {
    const L = enLocal(ctx).point;
    const r = poserPiece(ctx.modele, { a: L(A), b: L(B) }, s.section, placementDe(e), { designation: s.designation, source: s.source, ...optionsDans(ctx) });
    return { etat: { ...e, etape: 1, depart: null, fleche: null, verrouMaj: null, erreur: null }, modele: r.modele, selection: [r.occurrence], operation: "Profilé" };
  } catch (err) {
    return { etat: { ...e, erreur: messageErreur(err) } };
  }
}

/** Aperçu de la pièce de A vers le curseur : prisme en coordonnées monde (lignes des parois). */
function apercuPiece(e: EtatProfile, ctx: ContexteOutil): { lignes: Vec3[][]; faces: Vec3[][] } {
  const s = ctx.sectionCourante;
  if (!s || e.etape !== 2 || !e.depart || !e.inference || dist(e.depart, e.inference.point) < 1e-9) return { lignes: [], faces: [] };
  try {
    const r = repereSegment(e.depart, e.inference.point);
    const { parois, bouts } = prismePiece(sectionPosee(s.section, placementDe(e)), r.longueur, { genre: "droit", decalage: 0 }, { genre: "droit", decalage: 0 });
    const monde = (p: Vec3): Vec3 => add(add(add(r.origine, scale(r.x, p.x)), scale(r.y, p.y)), scale(r.z, p.z));
    const faces = [...parois, ...bouts.map((b) => b.ext)].map((f) => f.map(monde));
    return { lignes: faces.map((f) => [...f, f[0] as Vec3]), faces };
  } catch {
    return { lignes: [], faces: [] };
  }
}

function options(e: EtatProfile): OptionOutil[] {
  return [
    { id: "point", valeur: e.point, valeurs: POINTS_PLACEMENT.map((id) => ({ id, disponible: true, raccourci: "Ctrl" })) },
    { id: "rotation", valeur: e.rotation90 ? "oui" : "non", valeurs: [{ id: "non", disponible: true, raccourci: "Alt" }, { id: "oui", disponible: true, raccourci: "Alt" }] },
  ];
}

export const machineProfile: MachineOutil<EtatProfile> = {
  id: ID_PROFILE,
  initial: () => ({ etape: 1, depart: null, inference: null, fleche: null, verrouMaj: null, point: "centre", rotation90: false, rayon: null, erreur: null }),

  traiter(etat, ev, ctx): Transition<EtatProfile> {
    switch (ev.genre) {
      case "survol": {
        const e0 = { ...etat, rayon: { rayon: ev.rayon, tolerance: ev.tolerance } };
        return { etat: { ...e0, inference: inferenceProfile(e0, ctx, ev.rayon, ev.tolerance), erreur: null } };
      }
      case "clic": {
        if (!ctx.sectionCourante) return { etat: { ...etat, erreur: ERREUR_SANS_SECTION } };
        const e0 = { ...etat, rayon: { rayon: ev.rayon, tolerance: ev.tolerance }, erreur: null };
        const i = inferenceProfile(e0, ctx, ev.rayon, ev.tolerance);
        if (e0.etape === 1) return { etat: { ...e0, etape: 2, depart: i.point, inference: i } };
        return poser({ ...e0, inference: i }, ctx, e0.depart as Vec3, i.point);
      }
      case "saisie": {
        if (etat.etape !== 2 || !etat.depart) return { etat: { ...etat, erreur: "Placez d'abord le début de la pièce." } };
        const res = analyserSaisie(ev.texte, saisieDe("longueur", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, erreur: res.message } };
        if (res.genre !== "longueur" || res.valeur <= 0) return { etat: { ...etat, erreur: "Tapez une longueur positive (ex. 3)." } };
        const vers = etat.inference ? sub(etat.inference.point, etat.depart) : null;
        if (!vers || len(vers) < 1e-9) return { etat: { ...etat, erreur: "Orientez le curseur pour donner la direction de la pièce." } };
        return poser(etat, ctx, etat.depart, add(etat.depart, scale(normalize(vers), res.valeur)));
      }
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "relachee") return { etat: recalculer({ ...etat, verrouMaj: null }, ctx) };
          if (etat.etape === 2 && etat.inference && !etat.verrouMaj) return { etat: { ...etat, verrouMaj: { genre: "inference", inference: etat.inference } } };
          return { etat };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut") {
          if (etat.fleche?.touche === t) return { etat: recalculer({ ...etat, fleche: null }, ctx) };
          const axe = t === "FlecheDroite" ? "x" : t === "FlecheGauche" ? "y" : "z";
          return { etat: recalculer({ ...etat, fleche: { touche: t, verrou: { genre: "axe", axe } } }, ctx) };
        }
        return { etat };
      }
      case "echap":
        return { etat: { ...etat, etape: 1, depart: null, fleche: null, verrouMaj: null, erreur: null } };
      default:
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatProfile> {
    if (option === "point" && (POINTS_PLACEMENT as readonly string[]).includes(valeur)) return { etat: { ...etat, point: valeur as PointPlacement } };
    if (option === "rotation" && (valeur === "oui" || valeur === "non")) return { etat: { ...etat, rotation90: valeur === "oui" } };
    return { etat };
  },

  modificateurSeul(etat, touche: ModificateurSeul): Transition<EtatProfile> {
    if (touche === "Ctrl") return { etat: { ...etat, point: POINTS_PLACEMENT[(POINTS_PLACEMENT.indexOf(etat.point) + 1) % POINTS_PLACEMENT.length] as PointPlacement } };
    if (touche === "Alt") return { etat: { ...etat, rotation90: !etat.rotation90 } };
    return { etat };
  },

  vue(etat, ctx): VueOutil {
    const s = ctx.sectionCourante;
    const base = etat.etape === 1 ? CONSIGNE_PROFILE_1 : CONSIGNE_PROFILE_2;
    const consigne = s ? `${base} Section : ${s.designation}.` : `${base} ${ERREUR_SANS_SECTION}`;
    const longueur = etat.etape === 2 && etat.depart && etat.inference ? dist(etat.depart, etat.inference.point) : null;
    const v = vueModif({
      consigne,
      mesures: { libelle: "Longueur", valeur: longueur !== null ? longueur.toFixed(2).replace(".", ctx.separateurDecimal) : "", saisie: saisieDe("longueur", ctx) },
      ctx,
      erreur: etat.erreur,
      inference: etat.inference,
    });
    const ap = apercuPiece(etat, ctx);
    return { ...v, options: options(etat), apercu: { ...v.apercu, lignes: ap.lignes, faces: ap.faces } };
  },
};

