/**
 * Outil Mur (cas 4 du catalogue des extensions, étape 4 : D4-F5-003 ; statut `fadi` au catalogue) — machine pure.
 *
 * L'épaisseur et la hauteur viennent de la barre d'options de l'interface (`ContexteOutil.parametresMur`) ; le côté de
 * référence (axe, nu intérieur, nu extérieur) est une option de l'outil, que Ctrl frappé seul fait défiler. Chaque clic
 * ajoute un point de l'axe ; une longueur tapée place le point suivant dans la direction du curseur ; un clic sur le
 * premier point ferme le tracé ; Entrée ou un double-clic termine ; Échap annule le tracé en cours. Le mur est posé en
 * un pas d'historique (« Mur »), dans la racine du modèle.
 */
import { mursDuModele, poserMurs, empreinteMur, nettoyerAxe, type ErreurMur, type ReferenceMur, REFERENCES_MUR } from "../murs.js";
import { type Inference, type Verrou, geometrieVisible, inferer } from "../inference.js";
import { analyserSaisie } from "../saisie-vcb.js";
import { type Vec3, add, dist, len, normalize, scale, sub } from "../vecteur.js";
import { axesDeSaisie } from "./commun-formes.js";
import { saisieDe, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, ModificateurSeul, OptionOutil, Rayon, Touche, Transition, VueOutil } from "./machine.js";

export const ID_MUR = "mur";
export const CONSIGNE_MUR_1 = "Cliquez le début de l'axe du mur.";
export const CONSIGNE_MUR_2 = "Cliquez le point suivant ou tapez une longueur ; Entrée ou double-clic termine, Échap annule le segment en cours.";
export const ERREUR_SANS_PARAMETRES = "Tapez d'abord une épaisseur et une hauteur positives dans la barre d'options.";
export const ERREUR_DANS_OBJET = "Un mur se pose dans le modèle : sortez d'abord du groupe ou du composant ouvert.";
export const MOTIFS_ERREUR_MUR: Readonly<Record<ErreurMur, string>> = {
  axe: "Axe trop court : placez au moins deux points distincts.",
  epaisseur: "Épaisseur : tapez une valeur positive.",
  hauteur: "Hauteur : tapez une valeur positive.",
  aigu: "Angle trop aigu entre deux segments : le mur ne peut pas être raccordé.",
  absent: "Mur introuvable.",
};

export interface EtatMur {
  readonly points: readonly Vec3[];
  readonly inference: Inference | null;
  readonly fleche: { readonly touche: Touche; readonly verrou: Verrou } | null;
  readonly verrouMaj: Verrou | null;
  readonly reference: ReferenceMur;
  readonly rayon: { readonly rayon: Rayon; readonly tolerance: number } | null;
  readonly erreur: string | null;
}

const dernier = (e: EtatMur): Vec3 | null => e.points[e.points.length - 1] ?? null;

function inferenceMur(e: EtatMur, ctx: ContexteOutil, r: Rayon, tolerance: number): Inference {
  const v = e.verrouMaj ?? e.fleche?.verrou;
  const d = dernier(e);
  return inferer({ rayon: r, tolerance, geometrie: geometrieVisible(ctx.modele), ...(d ? { depart: d } : {}), ...(v ? { verrou: v } : {}), ...axesDeSaisie(ctx) });
}

const recalculer = (e: EtatMur, ctx: ContexteOutil): EtatMur => (e.rayon ? { ...e, inference: inferenceMur(e, ctx, e.rayon.rayon, e.rayon.tolerance) } : e);
const vide = (e: EtatMur): EtatMur => ({ ...e, points: [], fleche: null, verrouMaj: null });

/** Pose le tracé (fermé si demandé) : un pas « Mur », le mur sélectionné. */
function poser(e: EtatMur, ctx: ContexteOutil, points: readonly Vec3[], ferme: boolean): Transition<EtatMur> {
  if (ctx.lecture) return { etat: vide(e) };
  if (ctx.dans !== undefined) return { etat: { ...e, erreur: ERREUR_DANS_OBJET } };
  const p = ctx.parametresMur;
  if (!p) return { etat: { ...e, erreur: ERREUR_SANS_PARAMETRES } };
  const trace = ferme ? [...points, points[0]!] : points;
  const r = poserMurs(ctx.modele, [trace], { ...p, reference: e.reference });
  if (!r.ok) return { etat: { ...e, erreur: MOTIFS_ERREUR_MUR[r.erreur] } };
  const occ = r.ids.map((id) => r.modele.annotations?.murs?.[id]?.occurrence).filter((x): x is string => !!x);
  return { etat: { ...vide(e), erreur: null }, modele: r.modele, selection: occ, operation: "Mur" };
}

/** Ajoute un point ; un clic sur le premier point d'un tracé d'au moins trois points le ferme et le pose. */
function ajouter(e: EtatMur, ctx: ContexteOutil, q: Vec3): Transition<EtatMur> {
  const d = dernier(e);
  if (d && dist(d, q) < 1e-6) return { etat: e };
  if (e.points.length >= 3 && dist(e.points[0]!, q) < 1e-6) return poser(e, ctx, e.points, true);
  return { etat: { ...e, points: [...e.points, q], fleche: null, erreur: null } };
}

function options(e: EtatMur): OptionOutil[] {
  return [{ id: "reference", valeur: e.reference, valeurs: REFERENCES_MUR.map((id) => ({ id, disponible: true, raccourci: "Ctrl" })) }];
}

/** Aperçu : empreinte du tracé en cours jusqu'au curseur (et son axe), d'après les murs voisins. */
function apercu(e: EtatMur, ctx: ContexteOutil): { lignes: Vec3[][]; faces: Vec3[][] } {
  const p = ctx.parametresMur;
  const pts = e.inference && e.points.length ? [...e.points, e.inference.point] : [...e.points];
  const axe = pts.length >= 2 ? [pts] : [];
  const n = p ? nettoyerAxe(pts) : null;
  if (!p || !n || n.ferme) return { lignes: axe, faces: [] };
  try {
    const emp = empreinteMur({ ...n, ...p, reference: e.reference }, mursDuModele(ctx.modele));
    const b = emp.boucles.map((x) => [...x]);
    return { lignes: [...axe, ...b.map((x) => [...x, x[0]!])], faces: b };
  } catch {
    return { lignes: axe, faces: [] };
  }
}

export const machineMur: MachineOutil<EtatMur> = {
  id: ID_MUR,
  initial: () => ({ points: [], inference: null, fleche: null, verrouMaj: null, reference: "axe", rayon: null, erreur: null }),

  traiter(etat, ev, ctx): Transition<EtatMur> {
    switch (ev.genre) {
      case "survol": {
        const e0 = { ...etat, rayon: { rayon: ev.rayon, tolerance: ev.tolerance } };
        return { etat: { ...e0, inference: inferenceMur(e0, ctx, ev.rayon, ev.tolerance) } };
      }
      case "clic": {
        const e0 = { ...etat, rayon: { rayon: ev.rayon, tolerance: ev.tolerance } };
        const i = inferenceMur(e0, ctx, ev.rayon, ev.tolerance);
        // Double-clic : termine le tracé (le premier clic du double a déjà posé le point) ; sans tracé, c'est un clic.
        if (ev.double && e0.points.length >= 2) return poser(e0, ctx, e0.points, false);
        if (e0.points.length === 0 && !ctx.parametresMur) return { etat: { ...e0, inference: i, erreur: ERREUR_SANS_PARAMETRES } };
        return ajouter({ ...e0, inference: i }, ctx, i.point);
      }
      case "saisie": {
        const d = dernier(etat);
        if (!d) return { etat: { ...etat, erreur: "Placez d'abord le début de l'axe." } };
        if (ev.texte.trim() === "") return etat.points.length >= 2 ? poser(etat, ctx, etat.points, false) : { etat };
        const res = analyserSaisie(ev.texte, saisieDe("longueur", ctx));
        if (res.genre === "erreur") return { etat: { ...etat, erreur: res.message } };
        if (res.genre !== "longueur" || res.valeur <= 0) return { etat: { ...etat, erreur: "Tapez une longueur positive (ex. 3)." } };
        const vers = etat.inference ? sub(etat.inference.point, d) : null;
        if (!vers || len(vers) < 1e-9) return { etat: { ...etat, erreur: "Orientez le curseur pour donner la direction du mur." } };
        return ajouter(etat, ctx, add(d, scale(normalize(vers), res.valeur)));
      }
      case "touche": {
        const t = ev.touche;
        if (t === "Maj") {
          if (ev.etat === "relachee") return { etat: recalculer({ ...etat, verrouMaj: null }, ctx) };
          if (etat.points.length && etat.inference && !etat.verrouMaj) return { etat: { ...etat, verrouMaj: { genre: "inference", inference: etat.inference } } };
          return { etat };
        }
        if (ev.etat !== "enfoncee") return { etat };
        if (t === "Entree") return etat.points.length >= 2 ? poser(etat, ctx, etat.points, false) : { etat };
        if (t === "FlecheDroite" || t === "FlecheGauche" || t === "FlecheHaut") {
          if (etat.fleche?.touche === t) return { etat: recalculer({ ...etat, fleche: null }, ctx) };
          const axe = t === "FlecheDroite" ? "x" : t === "FlecheGauche" ? "y" : "z";
          return { etat: recalculer({ ...etat, fleche: { touche: t, verrou: { genre: "axe", axe } } }, ctx) };
        }
        return { etat };
      }
      case "echap":
        return { etat: { ...vide(etat), erreur: null } };
      default:
        return { etat };
    }
  },

  configurer(etat, option, valeur): Transition<EtatMur> {
    if (option === "reference" && (REFERENCES_MUR as readonly string[]).includes(valeur)) return { etat: { ...etat, reference: valeur as ReferenceMur } };
    return { etat };
  },

  modificateurSeul(etat, touche: ModificateurSeul): Transition<EtatMur> {
    if (touche === "Ctrl") return { etat: { ...etat, reference: REFERENCES_MUR[(REFERENCES_MUR.indexOf(etat.reference) + 1) % REFERENCES_MUR.length]! } };
    return { etat };
  },

  vue(etat, ctx): VueOutil {
    const d = dernier(etat);
    const longueur = d && etat.inference ? dist(d, etat.inference.point) : null;
    const base = etat.points.length === 0 ? CONSIGNE_MUR_1 : CONSIGNE_MUR_2;
    const v = vueModif({
      consigne: ctx.parametresMur ? base : `${base} ${ERREUR_SANS_PARAMETRES}`,
      mesures: { libelle: "Longueur", valeur: longueur !== null ? longueur.toFixed(2).replace(".", ctx.separateurDecimal) : "", saisie: saisieDe("longueur", ctx) },
      ctx,
      erreur: etat.erreur,
      inference: etat.inference,
    });
    const ap = apercu(etat, ctx);
    return { ...v, options: options(etat), references: etat.points, apercu: { ...v.apercu, lignes: ap.lignes, faces: ap.faces } };
  },
};
