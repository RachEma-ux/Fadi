/**
 * Escalier droit paramétrique (DA-07-10) : outil `creer.escalier` (E) → `escalier.creer`, et valeurs retenues
 * calculées, jamais saisies.
 *
 * Outil : niveau d'arrivée choisi dans une liste (escalier complet : hauteur à franchir dérivée des altitudes,
 * départ au niveau actif) ou « aucun » (volée partielle : hauteur à franchir et décalage saisis) ; emmarchement
 * (largeur), contremarches et marches saisis ; giron facultatif : s'il est saisi, la longueur de l'axe est
 * verrouillée à giron × marches. Deux clics : départ puis arrivée de la volée (sens de montée).
 *
 * - hauteur à franchir : déclarée, sinon dérivée des altitudes des niveaux reliés (arrivée − départ) ;
 * - hauteur de contremarche = hauteur à franchir / contremarches ; giron = longueur de l'axe / marches ;
 * - 2h + g (loi de Blondel) **affiché à titre indicatif** : DA-07-10 n'active aucune règle dimensionnelle tant
 *   que le maître d'ouvrage n'en a pas fourni la source ; aucune borne n'est inventée ni imposée.
 */
import { estNonEvaluee, nonEvaluee, TOLERANCES, type EtatModele, type ObjetModele, type ObjetNiveau } from "@parcours/atelier-model";
import type { Apercu, ChampSaisie, ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { activationCreation, champsSegment, commande, contraindrePolaire, controler, coteSegment, definir, enTete, lisible, longueur, P, type Verrous } from "../../plan2d/outils/commun";
import { formaterValeur } from "../../plan2d/saisie";
import { distance, versPoint, type Vec } from "../../plan2d/geometrie";
import { contourMur, repereAxe, surMur } from "../geometrie";
import { controlerChoix, controlerSaisie, ecrireMemoire, lireMemoire, type Valeurs } from "./parametres";

export interface IndicesEscalier {
  readonly hauteurAFranchir: number | null;
  readonly hauteur: number | null;
  readonly giron: number | null;
  readonly blondel: number | null;
}

const nombre = (x: unknown): number | null => (estNonEvaluee(x) ? null : typeof x === "number" ? x : typeof x === "object" && x !== null && typeof (x as { value?: unknown }).value === "number" ? (x as { value: number }).value : null);

/** Hauteur à franchir dérivée des niveaux reliés, ou `null`. */
export function denivele(etat: EtatModele | null, depart: string | undefined, arrivee: string | undefined): number | null {
  const d = depart ? etat?.objets[depart] : undefined;
  const a = arrivee ? etat?.objets[arrivee] : undefined;
  return d?.classe === "niveau" && a?.classe === "niveau" ? a.params.elevation.value - d.params.elevation.value : null;
}

/** Valeurs retenues à partir de grandeurs brutes (outil ou objet). */
export function indices(H: number | null, contremarches: number | null, marches: number | null, longueur: number | null): IndicesEscalier {
  const hauteur = H !== null && contremarches !== null && contremarches >= 1 ? H / contremarches : null;
  const giron = longueur !== null && marches !== null && marches > 0 ? longueur / marches : null;
  return { hauteurAFranchir: H, hauteur, giron, blondel: hauteur !== null && giron !== null ? 2 * hauteur + giron : null };
}

export function indicesEscalier(o: ObjetModele, etat: EtatModele | null): IndicesEscalier {
  if (o.classe !== "escalier") return { hauteurAFranchir: null, hauteur: null, giron: null, blondel: null };
  const p = o.params;
  const r = repereAxe(p.axe.a, p.axe.b);
  const H = nombre(p.hauteurAFranchir) ?? denivele(etat, p.niveauDepartId, p.niveauArriveeId);
  return indices(H, nombre(p.contremarches), nombre(p.marches), r ? r.L : null);
}

// ---------------------------------------------------------------------------------------------------------------
// Outil
// ---------------------------------------------------------------------------------------------------------------

const CLE = "creer.escalier";
const AUCUN = "aucun";
const NOMBRES = ["largeur", "contremarches", "marches", "giron", "hauteurAFranchir", "epaisseurPaillasse", "decalageBase"];

/** Texte des valeurs retenues (aperçu). */
export function texteIndices(i: IndicesEscalier): string {
  const f = (x: number | null) => (x === null ? "non évaluée" : formaterValeur(x, "m"));
  return `h = ${f(i.hauteur)} · g = ${f(i.giron)} · 2h + g = ${f(i.blondel)} (indicatif)`;
}

/** Niveaux au-dessus du niveau actif, candidats à l'arrivée. */
function niveauxAuDessus(etat: EtatModele | null, depart: string | null): ObjetNiveau[] {
  const d = depart ? etat?.objets[depart] : undefined;
  if (!etat || d?.classe !== "niveau") return [];
  return Object.values(etat.objets)
    .filter((o): o is ObjetNiveau => o.classe === "niveau" && o.params.elevation.value > d.params.elevation.value)
    .sort((a, b) => a.params.elevation.value - b.params.elevation.value);
}

export function sessionEscalier(ctx: ContexteAtelier): SessionOutil {
  let valeurs: Valeurs = lireMemoire(CLE);
  let depart: Vec | null = null;
  let curseur: Vec | null = null;
  let brut: Vec | null = null;
  let verrous: Verrous = {};
  let erreurs: readonly ErreurLisible[] = [];
  const refus = (e: ErreurLisible): ReactionOutil => {
    erreurs = [e];
    return { action: "continuer" };
  };
  const arrivee = (): string | null => {
    const id = valeurs.choix.arrivee;
    return id && id !== AUCUN && niveauxAuDessus(ctx.etat(), ctx.niveauActif()).some((x) => x.id === id) ? id : null;
  };
  const champArrivee = (): ChampSaisie => ({
    champ: "arrivee",
    libelle: "Niveau d'arrivée",
    unite: "",
    valeur: null,
    choix: [{ valeur: AUCUN, libelle: "Aucun (volée partielle)" }, ...niveauxAuDessus(ctx.etat(), ctx.niveauActif()).map((x) => ({ valeur: x.id, libelle: x.params.nom }))],
    valeurChoisie: arrivee() ?? AUCUN,
  });
  const hauteur = (): number | null => valeurs.nombres.hauteurAFranchir ?? denivele(ctx.etat(), ctx.niveauActif() ?? undefined, arrivee() ?? undefined);
  /** Verrou de longueur imposé par giron × marches. */
  const verrousEffectifs = (): Verrous => {
    const { giron, marches } = valeurs.nombres;
    return giron !== undefined && marches !== undefined && marches > 0 ? { ...verrous, longueur: giron * marches } : verrous;
  };
  const contraindre = (p: Vec) => contraindrePolaire(depart, p, verrousEffectifs());
  const indicesCourants = (b: Vec | null) => indices(hauteur(), valeurs.nombres.contremarches ?? null, valeurs.nombres.marches ?? null, depart && b ? distance(depart, b) : null);

  const poser = (a: Vec, b: Vec): ReactionOutil => {
    const t = enTete(ctx);
    if (!t) return refus(lisible("Escalier", "niveau ou calque actif absent", "choisir un niveau et un calque"));
    const v = valeurs.nombres;
    const H = hauteur();
    const arr = arrivee();
    const manque = (champ: string, libelle: string) => refus(lisible("Escalier", `${libelle} non renseigné(e)`, `taper la valeur dans le champ « ${champ} »`));
    if (v.largeur === undefined) return manque("Emmarchement", "emmarchement");
    if (v.contremarches === undefined) return manque("Contremarches", "nombre de contremarches");
    if (v.marches === undefined) return manque("Marches", "nombre de marches");
    if (H === null) return manque("Hauteur à franchir", "hauteur à franchir (ou niveau d'arrivée)");
    // Escalier complet : départ au niveau actif (décalage nul par définition) ; volée partielle : décalage saisi.
    const decalage = v.decalageBase ?? (arr ? 0 : undefined);
    if (decalage === undefined) return manque("Décalage de départ", "décalage de départ de la volée");
    const c = [
      commande("escalier.creer", {
        id: ctx.nouvelId("escalier"),
        ...t,
        axe: { a: P(a), b: P(b) },
        largeur: longueur(v.largeur),
        hauteurAFranchir: longueur(H),
        marches: v.marches,
        contremarches: v.contremarches,
        epaisseurPaillasse: v.epaisseurPaillasse !== undefined ? longueur(v.epaisseurPaillasse) : nonEvaluee("épaisseur de paillasse non saisie"),
        decalageBase: longueur(decalage),
        niveauDepartId: t.niveauId,
        ...(arr ? { niveauArriveeId: arr } : {}),
        referencePlanSeulement: false,
      }),
    ];
    const ko = controler(ctx, c);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    erreurs = [];
    depart = null;
    verrous = {};
    ecrireMemoire(CLE, valeurs);
    return { action: "valider", label: "Créer un escalier droit", commandes: c, terminer: false };
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
        case "appui": {
          const p = contraindre(evt.point);
          if (!depart) {
            depart = p;
            curseur = p;
            erreurs = [];
            return { action: "continuer" };
          }
          if (distance(depart, p) <= TOLERANCES.tolCoincidence) return refus(lisible("Escalier", "arrivée confondue avec le départ", "cliquer l'arrivée de la volée"));
          return poser(depart, p);
        }
        case "touche":
          if (evt.touche === "Backspace") {
            depart = null;
            verrous = {};
          }
          return { action: "continuer" };
        case "saisie-texte":
          return { action: "continuer" };
        case "choix": {
          const ko = controlerChoix("Escalier", evt.champ === "arrivee" ? champArrivee() : undefined, evt.valeur);
          if (ko) return refus(ko);
          valeurs = { ...valeurs, choix: { ...valeurs.choix, arrivee: evt.valeur } };
          ecrireMemoire(CLE, valeurs);
          erreurs = [];
          return { action: "continuer" };
        }
        case "saisie": {
          if (!Number.isFinite(evt.valeur)) return refus(lisible("Saisie", "nombre attendu", "taper une valeur numérique"));
          if (NOMBRES.includes(evt.champ)) {
            const ko = evt.champ === "decalageBase" ? null : controlerSaisie("Escalier", evt.champ === "epaisseurPaillasse" ? "epaisseur" : evt.champ, evt.valeur);
            if (ko) return refus(ko);
            valeurs = { ...valeurs, nombres: { ...valeurs.nombres, [evt.champ]: evt.valeur } };
            ecrireMemoire(CLE, valeurs);
          } else {
            if (evt.champ === "longueur" && !(evt.valeur > 0)) return refus(lisible("Longueur", "valeur nulle ou négative", "taper une longueur positive (l'angle donne le sens)"));
            verrous = { ...verrous, [evt.champ]: evt.valeur };
          }
          erreurs = [];
          if (brut) curseur = contraindre(brut);
          return { action: "continuer" };
        }
      }
    },
    apercu(): Apercu {
      const v = valeurs.nombres;
      const formes: FormeApercu[] = [];
      const r = depart && curseur ? repereAxe(depart, curseur) : null;
      const i = indicesCourants(curseur);
      if (r && depart && curseur) {
        const h = (v.largeur ?? 0) / 2;
        const style = erreurs.length > 0 ? "erreur" : "trace";
        if (h > 0) formes.push({ forme: "polygone", points: contourMur(r, { gauche: h, droite: -h }).map(versPoint), style });
        const nm = v.marches !== undefined && v.marches > 0 ? v.marches : 0;
        for (let k = 1; k < nm && h > 0; k++) formes.push({ forme: "segment", a: versPoint(surMur(r, (k * r.L) / nm, h)), b: versPoint(surMur(r, (k * r.L) / nm, -h)), style: "fantome" });
        formes.push({ forme: "segment", a: versPoint(depart), b: versPoint(curseur), style: "fantome" }, coteSegment(depart, curseur));
        formes.push({ forme: "texte", position: versPoint(surMur(r, r.L / 2, h + 0.3)), texte: texteIndices(i), style: "cote" });
      }
      const champs: ChampSaisie[] = [
        ...(depart ? champsSegment(depart, curseur, verrousEffectifs()) : []),
        champArrivee(),
        { champ: "hauteurAFranchir", libelle: "Hauteur à franchir", unite: "m", valeur: hauteur() },
        { champ: "largeur", libelle: "Emmarchement", unite: "m", valeur: v.largeur ?? null },
        { champ: "contremarches", libelle: "Contremarches", unite: "", valeur: v.contremarches ?? null },
        { champ: "marches", libelle: "Marches", unite: "", valeur: v.marches ?? null },
        { champ: "giron", libelle: "Giron (verrouille la longueur)", unite: "m", valeur: v.giron ?? i.giron },
        { champ: "epaisseurPaillasse", libelle: "Épaisseur de paillasse", unite: "m", valeur: v.epaisseurPaillasse ?? null },
        { champ: "decalageBase", libelle: "Décalage de départ", unite: "m", valeur: v.decalageBase ?? (arrivee() ? 0 : null) },
      ];
      const consigne = !depart ? "Cliquez le départ de la volée (bas de l'escalier)." : `Cliquez l'arrivée de la volée (sens de montée). ${texteIndices(i)}.`;
      return { formes, champs, consigne, erreurs };
    },
    abandonner() {
      depart = null;
      verrous = {};
      erreurs = [];
    },
  };
}

export function outilEscalier(): DefinitionOutil {
  return definir({
    id: "creer.escalier",
    libelle: "Escalier droit",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["stair", "stairs", "volée", "escalier"],
    raccourci: "E",
    fiches: ["DA-07-10"],
    aide: {
      action: "Crée une volée droite entre deux niveaux, avec hauteur de contremarche, giron et 2h + g (indicatif) calculés.",
      conditions: "Un niveau et un calque actifs ; emmarchement, contremarches, marches ; niveau d'arrivée ou hauteur à franchir.",
      exemple: "Choisissez le niveau d'arrivée, tapez 1,2 (emmarchement), 20 (contremarches), 19 (marches), 0,28 (giron), puis cliquez départ et direction.",
    },
    activation: activationCreation,
    commencer: sessionEscalier,
  });
}
