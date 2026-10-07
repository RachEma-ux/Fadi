/**
 * Outil Texte (cahier-planche §4.31, relevé mesure-camera-panneaux §1.5) — machine pure.
 *
 * Repos : un clic sur une ENTITÉ ouvre un texte avec repère (« Placez le texte. ») ; le texte par défaut est l'aire
 * d'une face (« 9,68 m² »), la longueur d'une arête, les coordonnées d'un sommet (choix Fadi, nv dans SketchUp) ;
 * le clic suivant pose le texte et l'interface ouvre la saisie (`Transition.editerTexte`) ; la saisie renvoyée
 * (`saisie`) remplace le texte dans le même pas. Un clic dans le VIDE crée un texte écran fixé en pixels, saisie
 * ouverte aussitôt. Le texte est figé à la création (CA-TXT-1, choix Fadi). Échap annule.
 */
import { type Id, aire, contexte, modifierAnnotations } from "../geometrie-libre.js";
import { type Inference, geometrieVisible, inferer } from "../inference.js";
import { type Vec3, dist } from "../vecteur.js";
import { contexteSaisie, formaterLongueur, formaterNombre, mesures, messageErreur } from "./commun-formes.js";
import { consigneDe, viseeElement, vueModif } from "./commun-modif.js";
import type { ContexteOutil, MachineOutil, Rayon, Transition, VueOutil } from "./machine.js";
import { formaterAire } from "./metre.js";

export const ID_TEXTE = "texte";
export const TEXTE_PAR_DEFAUT_ECRAN = "Saisissez le texte";

export interface EtatTexte {
  /** 1 repos ; 2 texte avec repère à placer ; 3 saisie en cours (annotation déjà créée). */
  readonly etape: 1 | 2 | 3;
  readonly ancre: Vec3 | null;
  readonly entite: Id | undefined;
  readonly defaut: string;
  /** Annotation créée, en cours de saisie. */
  readonly enEdition: Id | null;
  readonly inference: Inference | null;
  readonly erreur: string | null;
}

const initial = (): EtatTexte => ({ etape: 1, ancre: null, entite: undefined, defaut: "", enEdition: null, inference: null, erreur: null });

function inferer2(ctx: ContexteOutil, rayon: Rayon, tolerance: number): Inference {
  return inferer({ rayon, tolerance, geometrie: geometrieVisible(ctx.modele), ...(ctx.repere ? { axes: ctx.repere } : {}) });
}

/** Texte par défaut selon l'entité visée : aire, longueur ou coordonnées. */
export function texteParDefaut(ctx: ContexteOutil, i: Inference, entite: { genre: "face" | "arete"; id: Id } | null): string {
  const sep = ctx.separateurDecimal;
  if (i.type === "extremite" || i.type === "milieu" || i.type === "intersection" || i.type === "origine") {
    const f = (v: number) => formaterNombre(v, 2, sep);
    return `[${f(i.point.x)}; ${f(i.point.y)}; ${f(i.point.z)}]`;
  }
  if (entite?.genre === "face") {
    try {
      return formaterAire(aire(ctx.modele, entite.id, ctx.dans !== undefined ? { dans: ctx.dans } : {}), sep);
    } catch {
      return "";
    }
  }
  if (entite?.genre === "arete") {
    const a = geometrieVisible(ctx.modele).aretes.find((x) => x.id === entite.id);
    return a ? formaterLongueur(dist(a.a, a.b), sep) : "";
  }
  return "";
}

export const machineTexte: MachineOutil<EtatTexte> = {
  id: ID_TEXTE,
  initial,

  traiter(etat, ev, ctx): Transition<EtatTexte> {
    switch (ev.genre) {
      case "survol":
        return { etat: { ...etat, inference: inferer2(ctx, ev.rayon, ev.tolerance), erreur: null } };
      case "clic": {
        const i = inferer2(ctx, ev.rayon, ev.tolerance);
        if (etat.etape === 3) return { etat: initial() }; // un clic en dehors valide (l'interface a déjà renvoyé la saisie)
        if (etat.etape === 2 && etat.ancre) {
          try {
            const r = modifierAnnotations(ctx.modele, (a, id) => {
              const t = id("t");
              a.textes[t] = { id: t, genre: "repere", ancre: etat.ancre as Vec3, ...(etat.entite ? { entite: etat.entite } : {}), position: i.point, texte: etat.defaut };
              return t;
            });
            return { etat: { ...etat, etape: 3, enEdition: r.extra, inference: i, erreur: null }, modele: r.modele, selection: ctx.selection, operation: "Texte", editerTexte: { id: r.extra, texte: etat.defaut } };
          } catch (err) {
            return { etat: { ...initial(), erreur: messageErreur(err) } };
          }
        }
        const { el, cible } = viseeElement(ctx, ev);
        const entite = el && cible && (cible.genre === "face" || cible.genre === "arete") ? { genre: cible.genre, id: cible.id } : null;
        const surEntite = entite !== null || i.type !== "aucune";
        if (!surEntite) {
          // Texte écran.
          const ecran = ev.ecran ?? { x: 0, y: 0 };
          try {
            const r = modifierAnnotations(ctx.modele, (a, id) => {
              const t = id("t");
              a.textes[t] = { id: t, genre: "ecran", ecran: { x: ecran.x, y: ecran.y }, texte: TEXTE_PAR_DEFAUT_ECRAN };
              return t;
            });
            return { etat: { ...etat, etape: 3, enEdition: r.extra, inference: i, erreur: null }, modele: r.modele, selection: ctx.selection, operation: "Texte", editerTexte: { id: r.extra, texte: TEXTE_PAR_DEFAUT_ECRAN } };
          } catch (err) {
            return { etat: { ...initial(), erreur: messageErreur(err) } };
          }
        }
        return { etat: { ...etat, etape: 2, ancre: i.point, entite: entite?.id, defaut: texteParDefaut(ctx, i, entite), inference: i, erreur: null } };
      }
      case "saisie": {
        if (etat.etape !== 3 || !etat.enEdition) return { etat: { ...etat, erreur: "Cliquez d'abord pour poser le texte." } };
        const id = etat.enEdition;
        const texte = ev.texte;
        const existant = ctx.modele.annotations?.textes[id];
        if (!existant) return { etat: initial() };
        if (existant.texte === texte) return { etat: initial() };
        try {
          const r = modifierAnnotations(ctx.modele, (a) => {
            a.textes[id] = { ...existant, texte };
          });
          return { etat: initial(), modele: r.modele, selection: ctx.selection, operation: "Texte", remplaceDernier: true };
        } catch (err) {
          return { etat: { ...initial(), erreur: messageErreur(err) } };
        }
      }
      case "echap":
        return { etat: initial() };
      case "touche":
      case "appui":
      case "glisser":
      case "relache":
        return { etat };
    }
  },

  vue(etat, ctx): VueOutil {
    const consigne = consigneDe(ID_TEXTE, etat.etape - 1);
    const lignes: Vec3[][] = [];
    const etiquettes: { point: Vec3; texte: string }[] = [];
    if (etat.etape === 2 && etat.ancre && etat.inference) {
      lignes.push([etat.ancre, etat.inference.point]);
      etiquettes.push({ point: etat.inference.point, texte: etat.defaut });
    }
    return vueModif({ consigne, mesures: mesures(null, "", contexteSaisie("aucune", ctx)), inference: etat.etape === 1 ? etat.inference : null, apercu: { lignes, faces: [], etiquettes } as VueOutil["apercu"], ctx, erreur: etat.erreur });
  },
};

export { contexte as _contexteTexte };
