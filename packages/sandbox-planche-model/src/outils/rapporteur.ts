/**
 * Outil Rapporteur (cahier-planche §4.29, relevé mesure-camera-panneaux §1.3) — machine pure.
 *
 * Étape 1 : centre (plan du rapporteur = face survolée, sinon sol ; flèches → ← ↑ avant le clic : plan
 * perpendiculaire à l'axe rouge / vert / bleu, bascules ; Maj maintenue : plan courant verrouillé). Étape 2 : début
 * de l'angle. Étape 3 : l'angle suit le curseur (Mesures « Angle », une décimale) ; un clic ou une saisie (« 30 »
 * en degrés, « 4:12 » en pente) crée une LIGNE DE GUIDE infinie passant par le centre à cet angle, si la création de
 * guides est active (Ctrl = bascule, active par défaut — CA-RAP-1) ; puis retour à l'étape 1, Mesures garde la
 * saisie. Un lecteur ne crée rien. Échap annule.
 */
import { modifierAnnotations } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, cross, dot, len, normalize, scale, sub, tourner } from "../vecteur.js";
import { contexteSaisie, formaterAngle, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Touche, Transition, VueOutil } from "./machine.js";
import { couleurPlan } from "./plan-de-coupe.js";

export const ID_RAPPORTEUR = "rapporteur";

export interface EtatRapporteur {
  readonly etape: 1 | 2 | 3;
  readonly centre: Vec3 | null;
  readonly normale: Vec3;
  readonly depart: Vec3 | null;
  readonly creerGuides: boolean;
  readonly fleche: Touche | null;
  readonly verrouMaj: Vec3 | null;
  readonly inference: Inference | null;
  readonly texte: string | null;
  readonly erreur: string | null;
}

const initial = (): EtatRapporteur => ({ etape: 1, centre: null, normale: AXE_Z, depart: null, creerGuides: true, fleche: null, verrouMaj: null, inference: null, texte: null, erreur: null });
const retour = (e: EtatRapporteur): EtatRapporteur => ({ ...e, etape: 1, centre: null, depart: null });

function inferer2(ctx: ContexteOutil, rayon: Rayon, tolerance: number, depart?: Vec3): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele), ...(depart ? { depart } : {}), ...(ctx.repere ? { axes: ctx.repere } : {}) });
}

/** Normale du plan du rapporteur à l'étape 1 : verrou Maj, flèche, face survolée, sinon sol. */
function normaleCourante(e: EtatRapporteur, ctx: ContexteOutil, i: Inference): Vec3 {
  if (e.verrouMaj) return e.verrouMaj;
  if (e.fleche === "FlecheDroite") return AXE_X;
  if (e.fleche === "FlecheGauche") return AXE_Y;
  if (e.fleche === "FlecheHaut") return AXE_Z;
  if (i.type === "sur-face" && i.entite !== undefined) {
    const f = geometrieVisible(ctx.modele).faces.find((x) => x.id === i.entite);
    if (f) return normalize(f.normale);
  }
  return AXE_Z;
}

/** Projection d'un point dans le plan du rapporteur, relative au centre. */
function dansLePlan(e: EtatRapporteur, p: Vec3): Vec3 {
  const v = sub(p, e.centre as Vec3);
  return sub(v, scale(e.normale, dot(v, e.normale)));
}

/** Angle signé (rad) du curseur depuis la direction de départ, autour de la normale. */
export function angleCourant(e: EtatRapporteur, p: Vec3): number {
  if (!e.centre || !e.depart) return 0;
  const v = dansLePlan(e, p);
  if (len(v) < 1e-9) return 0;
  return Math.atan2(dot(cross(e.depart, normalize(v)), e.normale), dot(e.depart, normalize(v)));
}

function creerGuide(e: EtatRapporteur, ctx: ContexteOutil, angle: number, texte: string | null): Transition<EtatRapporteur> {
  if (!e.creerGuides || ctx.lecture) return { etat: { ...retour(e), texte, erreur: null } };
  const direction = normalize(tourner(e.depart as Vec3, { x: 0, y: 0, z: 0 }, e.normale, angle));
  try {
    const r = modifierAnnotations(ctx.modele, (a, id) => {
      const g = id("g");
      a.guides[g] = { id: g, genre: "ligne", origine: e.centre as Vec3, direction };
    });
    return { etat: { ...retour(e), texte, erreur: null }, modele: r.modele, selection: ctx.selection, operation: "Ligne de guide" };
  } catch (err) {
    return { etat: { ...retour(e), texte, erreur: messageErreur(err) } };
  }
}

export const machineRapporteur: MachineOutil<EtatRapporteur> = {
  id: ID_RAPPORTEUR,
  initial,

  traiter(etat, ev, ctx): Transition<EtatRapporteur> {
    switch (ev.genre) {
      case "survol": {
        const i = inferer2(ctx, ev.rayon, ev.tolerance, etat.centre ?? undefined);
        return { etat: { ...etat, inference: i, ...(etat.etape === 1 ? { normale: normaleCourante(etat, ctx, i) } : {}), erreur: null } };
      }
      case "clic": {
        const i = inferer2(ctx, ev.rayon, ev.tolerance, etat.centre ?? undefined);
        if (etat.etape === 1) return { etat: { ...etat, etape: 2, centre: i.point, normale: normaleCourante(etat, ctx, i), inference: i, texte: null, erreur: null } };
        if (etat.etape === 2) {
          const v = dansLePlan({ ...etat, inference: i }, i.point);
          if (len(v) < 1e-9) return { etat: { ...etat, inference: i, erreur: "Choisissez un point distinct du centre pour le début de l'angle." } };
          return { etat: { ...etat, etape: 3, depart: normalize(v), inference: i, erreur: null } };
        }
        return creerGuide({ ...etat, inference: i }, ctx, angleCourant(etat, i.point), null);
      }
      case "saisie": {
        if (etat.etape !== 3) return { etat: { ...etat, texte: ev.texte, erreur: "Placez d'abord le centre et le début de l'angle." } };
        const res = analyserSaisie(ev.texte, contexteSaisie("angle", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, texte: ev.texte, erreur: res.message } };
        if (res.genre !== "angle") return { etat: { ...etat, texte: ev.texte, erreur: `Saisie « ${ev.texte} » non reconnue.` } };
        // Sens = côté du curseur (angle courant négatif → sens inverse), négatif saisi = inverse.
        const sens = etat.inference && angleCourant(etat, etat.inference.point) < 0 ? -1 : 1;
        return creerGuide(etat, ctx, sens * res.radians, ev.texte);
      }
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "relachee") return { etat: { ...etat, verrouMaj: null } };
          return { etat: { ...etat, verrouMaj: etat.etape === 1 ? etat.normale : etat.verrouMaj } };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "Ctrl") return { etat: { ...etat, creerGuides: !etat.creerGuides, erreur: null } };
        if (etat.etape === 1 && (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut" || t === "FlecheBas")) {
          const fleche = etat.fleche === t ? null : t;
          const e2 = { ...etat, fleche };
          return { etat: etat.inference ? { ...e2, normale: normaleCourante(e2, ctx, etat.inference) } : e2 };
        }
        return { etat };
      }
      case "echap":
        return { etat: { ...retour(etat), texte: null, erreur: null } };
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    const consigne = etat.etape === 3 ? consigneDe(ID_RAPPORTEUR, 2) : consigneDe(ID_RAPPORTEUR, 0);
    const angle = etat.etape === 3 && etat.inference ? angleCourant(etat, etat.inference.point) : 0;
    const m = mesures("Angle", etat.texte ?? (etat.etape === 3 ? formaterAngle(Math.abs((angle * 180) / Math.PI), sep) : ""), contexteSaisie("angle", ctx));
    const lignes: Vec3[][] = [];
    const etiquettes: { point: Vec3; texte: string }[] = [];
    const point = etat.inference?.point;
    const centre = etat.centre ?? point ?? null;
    if (etat.centre && point && etat.etape >= 2) {
      lignes.push([etat.centre, point]);
      if (etat.depart) {
        lignes.push([etat.centre, { x: etat.centre.x + etat.depart.x, y: etat.centre.y + etat.depart.y, z: etat.centre.z + etat.depart.z }]);
        etiquettes.push({ point, texte: `${formaterAngle(Math.abs((angle * 180) / Math.PI), sep)}°` });
      }
    }
    const rapporteur = centre ? { centre, normale: etat.normale, rayon: 1, depart: etat.depart ?? { x: 1, y: 0, z: 0 }, angle, couleur: couleurPlan(etat.normale) } : undefined;
    return vueModif({ consigne, mesures: m, inference: etat.inference, apercu: { lignes, faces: [], etiquettes, ...(rapporteur ? { rapporteur } : {}) } as VueOutil["apercu"], ctx, erreur: etat.erreur });
  },
};
