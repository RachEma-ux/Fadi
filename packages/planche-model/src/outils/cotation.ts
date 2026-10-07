/**
 * Outil Cotes (cahier-planche §4.28, relevé mesure-camera-panneaux §1.2) — machine pure.
 *
 * Repos : un clic sur une ARÊTE prend ses deux extrémités, un clic sur la COURBE d'un cercle (ou polygone) prépare une
 * cote de DIAMÈTRE ; sinon le clic pose le premier point (étape 2), puis le second (étape 3). Étape 3 : « Placez la
 * cote. » : le clic de placement crée la cote (le point cliqué fixe la ligne de cote) et l'outil revient au repos.
 * Une cote linéaire entre deux sommets existants est ASSOCIÉE à ces sommets (sa valeur suit leur déplacement).
 * Échap annule. Mesures inactif.
 */
import { type Id, aretesDeLaCourbe, contexte, modifierAnnotations } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { type Vec3, dist } from "../vecteur.js";
import { contexteSaisie, formaterLongueur, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, sommetEn, viseeElement, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";

/** Association à un sommet (la cote suit ses déplacements) : point accroché, à la racine seulement — dans un groupe ouvert, la
 * cote garde ses coordonnées de création (choix déclaré, PL-04-02). */
const associable = (ctx: ContexteOutil, i: Inference): boolean => ctx.dans === undefined && POINTS_ACCROCHES.has(i.type);

export const ID_COTATION = "cotation";
const POINTS_ACCROCHES = new Set(["extremite", "milieu", "intersection", "centre", "origine"]);

export interface EtatCotation {
  readonly etape: 1 | 2 | 3;
  readonly a: Vec3 | null;
  readonly b: Vec3 | null;
  readonly sommets: readonly [Id | undefined, Id | undefined];
  /** Cote de diamètre en préparation (étape 3) : courbe visée. */
  readonly diametre: { readonly courbe: Id; readonly centre: Vec3; readonly rayon: number; readonly normale: Vec3 } | null;
  readonly inference: Inference | null;
  readonly erreur: string | null;
}

const initial = (): EtatCotation => ({ etape: 1, a: null, b: null, sommets: [undefined, undefined], diametre: null, inference: null, erreur: null });
const repos = (e: EtatCotation): EtatCotation => ({ ...initial(), inference: e.inference });

function inferer2(ctx: ContexteOutil, rayon: Rayon, tolerance: number, depart?: Vec3): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele), ...(depart ? { depart } : {}), ...(ctx.repere ? { axes: ctx.repere } : {}) });
}

/** Courbe fermée (cercle, polygone) du contexte à laquelle appartient l'arête `id`, ou null. */
function courbeFermee(ctx: ContexteOutil, arete: Id): EtatCotation["diametre"] {
  const c = contexte(ctx.modele, ctx.dans);
  const a = c.aretes[arete];
  if (!a?.courbe) return null;
  const k = c.courbes[a.courbe];
  if (!k || k.genre === "arc") return null;
  const aretes = aretesDeLaCourbe(ctx.modele, arete, ctx.dans !== undefined ? { dans: ctx.dans } : {});
  // Fermée : chaque sommet de la courbe est partagé par deux de ses arêtes.
  const usages = new Map<Id, number>();
  for (const id of aretes) {
    const x = c.aretes[id];
    if (!x) continue;
    usages.set(x.a, (usages.get(x.a) ?? 0) + 1);
    usages.set(x.b, (usages.get(x.b) ?? 0) + 1);
  }
  if ([...usages.values()].some((n) => n !== 2)) return null;
  return { courbe: k.id, centre: k.centre, rayon: k.rayon, normale: k.normale };
}

export const machineCotation: MachineOutil<EtatCotation> = {
  id: ID_COTATION,
  initial,

  traiter(etat, ev, ctx): Transition<EtatCotation> {
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, inference: inferer2(ctx, ev.rayon, ev.tolerance, etat.a ?? undefined), erreur: null } };
      case "clic": {
        const i = inferer2(ctx, ev.rayon, ev.tolerance, etat.a ?? undefined);
        if (etat.etape === 3) {
          try {
            const r = modifierAnnotations(ctx.modele, (an, id) => {
              const cid = id("c");
              if (etat.diametre) an.cotes[cid] = { id: cid, genre: "diametre", ...etat.diametre, position: i.point };
              else an.cotes[cid] = { id: cid, genre: "lineaire", a: etat.a as Vec3, b: etat.b as Vec3, ...(etat.sommets[0] && etat.sommets[1] ? { sommets: [etat.sommets[0], etat.sommets[1]] as [Id, Id] } : {}), position: i.point };
              return cid;
            });
            return { etat: repos({ ...etat, inference: i }), modele: r.modele, selection: ctx.selection, operation: "Cote" };
          } catch (err) {
            return { etat: { ...repos(etat), erreur: messageErreur(err) } };
          }
        }
        if (etat.etape === 2) {
          if (etat.a && dist(i.point, etat.a) < 1e-9) return { etat: { ...etat, inference: i, erreur: "Choisissez un second point distinct." } };
          return { etat: { ...etat, etape: 3, b: i.point, sommets: [etat.sommets[0], associable(ctx, i) ? sommetEn(ctx, i.point) : undefined], inference: i, erreur: null } };
        }
        // Étape 1 : arête ou courbe visée (hors accrochage ponctuel), sinon premier point.
        if (!POINTS_ACCROCHES.has(i.type)) {
          const { el, cible } = viseeElement(ctx, ev);
          if (el?.genre === "arete" && cible?.genre === "arete") {
            const d = courbeFermee(ctx, cible.id);
            if (d) return { etat: { ...etat, etape: 3, a: null, b: null, sommets: [undefined, undefined], diametre: d, inference: i, erreur: null } };
            const c = contexte(ctx.modele, ctx.dans);
            const ar = c.aretes[cible.id];
            if (ar) return { etat: { ...etat, etape: 3, a: el.a, b: el.b, sommets: [ar.a, ar.b], diametre: null, inference: i, erreur: null } };
          }
        }
        return { etat: { ...etat, etape: 2, a: i.point, b: null, sommets: [associable(ctx, i) ? sommetEn(ctx, i.point) : undefined, undefined], diametre: null, inference: i, erreur: null } };
      }
      case "saisie":
        return { etat: { ...etat, erreur: "Le champ Mesures n'est pas utilisé par l'outil Cotes." } };
      case "echap":
        return { etat: repos(etat) };
      case "touche":
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const sep = ctx.separateurDecimal;
    const consigne = consigneDe(ID_COTATION, etat.etape - 1);
    const lignes: Vec3[][] = [];
    const etiquettes: { point: Vec3; texte: string }[] = [];
    if (etat.etape === 2 && etat.a && etat.inference) lignes.push([etat.a, etat.inference.point]);
    if (etat.etape === 3 && etat.inference) {
      if (etat.diametre) {
        etiquettes.push({ point: etat.inference.point, texte: `⌀ ${formaterLongueur(2 * etat.diametre.rayon, sep)}` });
        lignes.push([etat.diametre.centre, etat.inference.point]);
      } else if (etat.a && etat.b) {
        lignes.push([etat.a, etat.b], [etat.a, etat.inference.point], [etat.b, etat.inference.point]);
        etiquettes.push({ point: etat.inference.point, texte: formaterLongueur(dist(etat.a, etat.b), sep) });
      }
    }
    return vueModif({ consigne, mesures: mesures("Mesures", "", contexteSaisie("aucune", ctx)), inference: etat.inference, apercu: { lignes, faces: [], etiquettes } as VueOutil["apercu"], ctx, erreur: etat.erreur });
  },
};
