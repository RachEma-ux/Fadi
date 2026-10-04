/**
 * Outils des murs (DA-07-01) : tracé chaîné (`creer.mur`, M), scission (`connecter.scinder-mur`) et jonction
 * (`connecter.joindre-murs`), familles selon la maquette validée (D-022 : « Joindre les murs » et « Scinder un
 * mur » sont dans « Connecter »). Chaque geste rend des `Commande` contrôlées par `ctx.essayer` avant validation.
 *
 * Tracé chaîné : chaque appui après le premier valide un mur (`mur.tracer`) et le geste continue depuis son
 * extrémité ; un appui sur le premier point ferme la chaîne, un appui sur le point courant (double-clic) ou
 * Entrée la termine. Jonction automatique : si une extrémité du nouveau mur tombe sur l'extrémité d'un mur
 * colinéaire, de même sens et de mêmes paramètres (seul cas que `mur.joindre` admet), le lot contient aussi
 * `mur.joindre`. Les jonctions en L et en T n'ont pas de commande dans `atelier-commands/1` : non inventées.
 */
import { estNonEvaluee, jsonCanonique, TOLERANCES, type Commande, type EtatModele, type IdObjet, type ObjetMur } from "@parcours/atelier-model";
import type { Apercu, ChampSaisie, ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { activationCreation, champsSegment, commande, contraindrePolaire, controler, coteSegment, definir, enTete, lisible, longueur, P, type Verrous } from "../../plan2d/outils/commun";
import { distance, scalaire, sous, versPoint, vectoriel, type Vec } from "../../plan2d/geometrie";
import { contourMur, estMur, murSousPoint, repereAxe } from "../geometrie";
import { alignementDe, champAlignement, champType, controlerChoix, controlerSaisie, dimensionProposee, ecrireMemoire, lireMemoire, typeDe, type Valeurs } from "./parametres";

const CLE = "creer.mur";
const confondus = (a: Vec, b: Vec) => distance(a, b) <= TOLERANCES.tolCoincidence;

/** Paramètres canoniques d'un nouveau mur (sans axe), ou l'erreur du champ manquant. */
export function parametresMur(etat: EtatModele | null, v: Valeurs): Record<string, unknown> | { erreur: ErreurLisible } {
  const typeId = typeDe(etat, "mur", v);
  const e = v.nombres.epaisseur ?? dimensionProposee(etat, "mur", typeId, "epaisseur");
  const h = v.nombres.hauteur ?? dimensionProposee(etat, "mur", typeId, "hauteur");
  if (e === undefined) return { erreur: lisible("Mur", "épaisseur non renseignée", "taper l'épaisseur dans le champ « Épaisseur » (ex. 0,2)") };
  if (h === undefined) return { erreur: lisible("Mur", "hauteur non renseignée", "taper la hauteur dans le champ « Hauteur » (ex. 2,5)") };
  return { epaisseur: longueur(e), hauteur: longueur(h), alignement: alignementDe(v), typeId, exterieur: false };
}

/** Mur existant que le nouveau mur prolonge exactement (colinéaire, même sens, contigu, mêmes paramètres). */
function prolonge(etat: EtatModele, niveauId: IdObjet, calqueId: IdObjet, params: Record<string, unknown>, a: Vec, b: Vec, cote: "avant" | "apres"): ObjetMur | null {
  const d = sous(b, a);
  const L = Math.hypot(d.x, d.y);
  const cible = jsonCanonique(params);
  for (const o of Object.values(etat.objets)) {
    if (!estMur(o) || o.niveauId !== niveauId || o.calqueId !== calqueId || o.groupeId !== undefined) continue;
    const { axe, ...reste } = o.params;
    if (jsonCanonique(reste) !== cible) continue;
    const contact = cote === "avant" ? confondus(axe.b, a) : confondus(axe.a, b);
    if (!contact) continue;
    const w = sous(axe.b, axe.a);
    const colin = Math.abs(vectoriel(d, w)) / (L * Math.hypot(w.x, w.y)) <= TOLERANCES.tolAngle && scalaire(d, w) > 0;
    if (colin) return o;
  }
  return null;
}

/** Lot d'un segment de mur : `mur.tracer`, puis `mur.joindre` avec les murs qu'il prolonge exactement. */
export function lotMur(ctx: ContexteAtelier, a: Vec, b: Vec, valeurs: Valeurs): { commandes: Commande[]; id: IdObjet } | { erreur: ErreurLisible } {
  const t = enTete(ctx);
  if (!t) return { erreur: lisible("Mur", "niveau ou calque actif absent", "choisir un niveau et un calque") };
  const etat = ctx.etat();
  const params = parametresMur(etat, valeurs);
  if ("erreur" in params) return { erreur: params.erreur as ErreurLisible };
  const id = ctx.nouvelId("mur");
  const commandes: Commande[] = [commande("mur.tracer", { id, ...t, ...params, a: P(a), b: P(b) })];
  let courant = id;
  if (etat) {
    for (const cote of ["avant", "apres"] as const) {
      const voisin = prolonge(etat, t.niveauId, t.calqueId, params, a, b, cote);
      if (!voisin) continue;
      const nouvelId = ctx.nouvelId("mur");
      commandes.push(commande("mur.joindre", { nouvelId }, cote === "avant" ? [voisin.id, courant] : [courant, voisin.id]));
      courant = nouvelId;
    }
  }
  return { commandes, id: courant };
}

/** Formes d'aperçu d'un segment de mur : contour d'épaisseur, axe et cote. */
export function formesMur(a: Vec, b: Vec, valeurs: Valeurs, epaisseur: number | undefined, style: "trace" | "erreur"): FormeApercu[] {
  const r = repereAxe(a, b);
  if (!r) return [];
  const f: FormeApercu[] = [{ forme: "segment", a: versPoint(a), b: versPoint(b), style: "fantome" }];
  if (epaisseur !== undefined && epaisseur > 0) {
    const al = alignementDe(valeurs);
    const faces = al === "axe" ? { gauche: epaisseur / 2, droite: -epaisseur / 2 } : al === "gauche" ? { gauche: 0, droite: -epaisseur } : { gauche: epaisseur, droite: 0 };
    f.push({ forme: "polygone", points: contourMur(r, faces).map(versPoint), style });
  }
  f.push(coteSegment(a, b));
  return f;
}

/** Valeurs initiales : mémoire de session, ou paramètres d'un mur sélectionné (pipette). */
function valeursInitiales(ctx: ContexteAtelier): Valeurs {
  const etat = ctx.etat();
  const sel = ctx.selection.lire().principal;
  const m = sel && etat ? etat.objets[sel] : undefined;
  if (estMur(m)) {
    const al = m.params.alignement;
    return {
      nombres: { epaisseur: m.params.epaisseur.value, ...(m.params.hauteur ? { hauteur: m.params.hauteur.value } : {}) },
      choix: { ...(estNonEvaluee(al) ? {} : { alignement: al }), type: m.params.typeId },
    };
  }
  return lireMemoire(CLE);
}

const PARAMETRES = ["epaisseur", "hauteur"];

export function sessionMur(ctx: ContexteAtelier): SessionOutil {
  let valeurs: Valeurs = valeursInitiales(ctx);
  let premier: Vec | null = null;
  let depart: Vec | null = null;
  let segments = 0;
  let curseur: Vec | null = null;
  let brut: Vec | null = null;
  let verrous: Verrous = {};
  let erreurs: readonly ErreurLisible[] = [];

  const finChaine = () => {
    premier = null;
    depart = null;
    segments = 0;
    verrous = {};
  };
  const contraindre = (p: Vec) => contraindrePolaire(depart, p, verrous);
  const champsParametres = (): ChampSaisie[] => {
    const etat = ctx.etat();
    const typeId = typeDe(etat, "mur", valeurs);
    const e = valeurs.nombres.epaisseur ?? dimensionProposee(etat, "mur", typeId, "epaisseur");
    const h = valeurs.nombres.hauteur ?? dimensionProposee(etat, "mur", typeId, "hauteur");
    return [
      { champ: "epaisseur", libelle: "Épaisseur", unite: "m", valeur: e ?? null },
      { champ: "hauteur", libelle: "Hauteur", unite: "m", valeur: h ?? null },
      champAlignement(valeurs),
      champType(etat, "mur", valeurs),
    ];
  };

  const poser = (p: Vec): ReactionOutil => {
    if (!depart) {
      premier = p;
      depart = p;
      curseur = p;
      erreurs = [];
      return { action: "continuer" };
    }
    if (confondus(p, depart)) {
      finChaine();
      erreurs = [];
      return { action: "continuer" };
    }
    const r = lotMur(ctx, depart, p, valeurs);
    if ("erreur" in r) {
      erreurs = [r.erreur];
      return { action: "continuer" };
    }
    const ko = controler(ctx, r.commandes);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    erreurs = [];
    ecrireMemoire(CLE, valeurs);
    const ferme = premier !== null && segments >= 1 && confondus(p, premier);
    if (ferme) finChaine();
    else {
      depart = p;
      segments++;
      verrous = {};
    }
    return { action: "valider", label: "Tracer un mur", commandes: r.commandes, terminer: false };
  };

  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          brut = evt.point;
          curseur = contraindre(evt.point);
          return { action: "continuer" };
        case "appui":
          return poser(contraindre(evt.point));
        case "touche":
          if (evt.touche === "Enter" || evt.touche === "Backspace") finChaine();
          return { action: "continuer" };
        case "saisie-texte":
          return { action: "continuer" };
        case "choix": {
          const refus = controlerChoix("Mur", champsParametres().find((c) => c.champ === evt.champ), evt.valeur);
          erreurs = refus ? [refus] : [];
          if (!refus) {
            valeurs = { ...valeurs, choix: { ...valeurs.choix, [evt.champ]: evt.valeur } };
            ecrireMemoire(CLE, valeurs);
          }
          return { action: "continuer" };
        }
        case "saisie": {
          if (!Number.isFinite(evt.valeur)) {
            erreurs = [lisible("Saisie", "nombre attendu", "taper une valeur numérique")];
            return { action: "continuer" };
          }
          if (PARAMETRES.includes(evt.champ)) {
            const refus = controlerSaisie("Mur", evt.champ, evt.valeur);
            if (refus) {
              erreurs = [refus];
              return { action: "continuer" };
            }
            valeurs = { ...valeurs, nombres: { ...valeurs.nombres, [evt.champ]: evt.valeur } };
            ecrireMemoire(CLE, valeurs);
          } else {
            if (evt.champ === "longueur" && !(evt.valeur > 0)) {
              erreurs = [lisible("Longueur", "valeur nulle ou négative", "taper une longueur positive (l'angle donne le sens)")];
              return { action: "continuer" };
            }
            verrous = { ...verrous, [evt.champ]: evt.valeur };
          }
          erreurs = [];
          if (brut) curseur = contraindre(brut);
          return { action: "continuer" };
        }
      }
    },
    apercu(): Apercu {
      const parametres = champsParametres();
      const e = parametres[0]?.valeur ?? undefined;
      const champs: ChampSaisie[] = [...(depart ? champsSegment(depart, curseur, verrous) : []), ...parametres];
      const formes = depart && curseur && distance(depart, curseur) > 0 ? formesMur(depart, curseur, valeurs, e, erreurs.length > 0 ? "erreur" : "trace") : [];
      const consigne = !depart
        ? "Cliquez le point de départ du mur (tapez d'abord épaisseur et hauteur si elles sont vides)."
        : "Point suivant, ou tapez longueur et angle ; premier point pour fermer, double-clic ou Entrée pour finir.";
      return { formes, champs, consigne, erreurs };
    },
    abandonner() {
      finChaine();
      erreurs = [];
    },
  };
}

export function outilMur(): DefinitionOutil {
  return definir({
    id: "creer.mur",
    libelle: "Mur",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["wall", "paroi", "cloison", "tracer un mur"],
    raccourci: "M",
    fiches: ["DA-07-01", "DA-05-12", "DA-05-14"],
    aide: {
      action: "Trace des murs enchaînés par leur axe, avec épaisseur, hauteur, alignement et type.",
      conditions: "Un niveau et un calque actifs ; épaisseur et hauteur saisies (ou proposées par le type).",
      exemple: "Tapez 0,2 (épaisseur), 2,5 (hauteur), cliquez le départ, tapez 4,5 puis Entrée : mur de 4,50 m.",
    },
    activation: activationCreation,
    commencer: sessionMur,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Scinder, joindre
// ---------------------------------------------------------------------------------------------------------------

/** Marge de capture d'un mur autour de son épaisseur (m). */
export const MARGE_MUR = 0.05;

export function outilScinderMur(): DefinitionOutil {
  return definir({
    id: "connecter.scinder-mur",
    libelle: "Scinder un mur",
    famille: "connecter",
    niveau: "contextuel",
    synonymes: ["split", "couper un mur", "diviser", "break"],
    fiches: ["DA-07-01"],
    aide: { action: "Coupe un mur en deux au point cliqué ; les ouvertures suivent leur segment.", conditions: "Un niveau actif contenant des murs.", exemple: "Cliquez un point sur l'axe d'un mur : deux murs remplacent l'ancien." },
    activation: (ctx) => (!ctx.etat() ? { ok: false, motif: "le modèle n'est pas chargé" } : !ctx.niveauActif() ? { ok: false, motif: "choisir d'abord un niveau actif" } : { ok: true }),
    commencer: (ctx) => {
      let cible: { mur: ObjetMur; point: Vec } | null = null;
      let erreurs: readonly ErreurLisible[] = [];
      const viser = (p: Vec, dessous: IdObjet | null) => {
        const etat = ctx.etat();
        const niveau = ctx.niveauActif();
        const h = etat && niveau ? murSousPoint(etat, niveau, p, MARGE_MUR, dessous) : null;
        const r = h ? repereAxe(h.mur.params.axe.a, h.mur.params.axe.b) : null;
        cible = h && r ? { mur: h.mur, point: { x: r.a.x + r.u.x * h.s, y: r.a.y + r.u.y * h.s } } : null;
      };
      return {
        traiter(evt) {
          if (evt.type === "survol" || evt.type === "glisse") viser(evt.point, evt.objetSousPointeur);
          if (evt.type !== "appui") return { action: "continuer" };
          viser(evt.point, evt.objetSousPointeur);
          if (!cible) {
            erreurs = [lisible("Scission", "aucun mur sous le pointeur", "cliquer sur un mur du niveau actif")];
            return { action: "continuer" };
          }
          const c = [commande("mur.scinder", { point: P(cible.point), nouveauxIds: [ctx.nouvelId("mur"), ctx.nouvelId("mur")] }, [cible.mur.id])];
          const ko = controler(ctx, c);
          erreurs = ko;
          return ko.length > 0 ? { action: "continuer" } : { action: "valider", label: "Scinder un mur", commandes: c, terminer: false };
        },
        apercu() {
          const formes: FormeApercu[] = cible ? [{ forme: "surligner", ids: [cible.mur.id], style: "trace" }, { forme: "cercle", centre: versPoint(cible.point), rayon: 0.1, style: "trace" }] : [];
          return { formes, champs: [], consigne: "Cliquez le point de scission sur un mur.", erreurs };
        },
        abandonner() {
          cible = null;
          erreurs = [];
        },
      };
    },
  });
}

export function outilJoindreMurs(): DefinitionOutil {
  return definir({
    id: "connecter.joindre-murs",
    libelle: "Joindre les murs",
    famille: "connecter",
    niveau: "contextuel",
    synonymes: ["join", "fusionner", "merge", "réunir"],
    fiches: ["DA-07-01"],
    aide: {
      action: "Réunit deux murs alignés et contigus, de mêmes paramètres, en un seul mur.",
      conditions: "Deux murs colinéaires, de même sens, qui se touchent (les jonctions en L ou en T ne sont pas au contrat).",
      exemple: "Cliquez le premier mur puis le second.",
    },
    activation: (ctx) => (!ctx.etat() ? { ok: false, motif: "le modèle n'est pas chargé" } : !ctx.niveauActif() ? { ok: false, motif: "choisir d'abord un niveau actif" } : { ok: true }),
    commencer: (ctx) => {
      let premier: IdObjet | null = null;
      let survole: IdObjet | null = null;
      let erreurs: readonly ErreurLisible[] = [];
      const mur = (p: Vec, dessous: IdObjet | null) => {
        const etat = ctx.etat();
        const niveau = ctx.niveauActif();
        return etat && niveau ? (murSousPoint(etat, niveau, p, MARGE_MUR, dessous)?.mur.id ?? null) : null;
      };
      return {
        traiter(evt) {
          if (evt.type === "survol" || evt.type === "glisse") survole = mur(evt.point, evt.objetSousPointeur);
          if (evt.type !== "appui") return { action: "continuer" };
          const id = mur(evt.point, evt.objetSousPointeur);
          if (!id) {
            erreurs = [lisible("Jonction", "aucun mur sous le pointeur", "cliquer sur un mur du niveau actif")];
            return { action: "continuer" };
          }
          if (!premier || premier === id) {
            premier = id;
            erreurs = [];
            return { action: "continuer" };
          }
          const c = [commande("mur.joindre", { nouvelId: ctx.nouvelId("mur") }, [premier, id])];
          const ko = controler(ctx, c);
          erreurs = ko;
          if (ko.length > 0) return { action: "continuer" };
          premier = null;
          return { action: "valider", label: "Joindre deux murs", commandes: c, terminer: false };
        },
        apercu() {
          const ids = [premier, survole].filter((x): x is IdObjet => x !== null);
          return { formes: ids.length ? [{ forme: "surligner", ids, style: "trace" }] : [], champs: [], consigne: premier ? "Cliquez le second mur." : "Cliquez le premier mur.", erreurs };
        },
        abandonner() {
          premier = null;
          erreurs = [];
        },
      };
    },
  });
}
