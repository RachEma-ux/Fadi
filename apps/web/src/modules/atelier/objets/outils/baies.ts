/**
 * Baies hébergées (DA-07-02 porte, DA-07-03 fenêtre, DA-07-04 ouverture) : pose (`ouverture.poser`, P / F / O)
 * et déplacement le long d'un mur (`ouverture.deplacer`, famille Modifier).
 *
 * L'hôte est trouvé **depuis l'état** (axe du mur le plus proche du point reçu, dans sa demi-épaisseur), jamais
 * depuis l'écran. Contrôle d'emprise local avant l'essai à blanc : hors du mur, chevauchement d'une autre baie,
 * trop près d'une jonction (demi-épaisseur du mur rencontré) → aperçu `erreur` et message « objet, cause,
 * action ». Paramètres : dernières valeurs saisies, ou dimensions proposées par le type (R3) ; l'allège d'une
 * porte ou d'une ouverture est proposée à 0 (passage au niveau du sol), celle d'une fenêtre est à saisir.
 */
import type { ClasseBaie, EtatModele, IdObjet, ObjetBaie, ObjetMur } from "@parcours/atelier-model";
import type { Apercu, ChampSaisie, ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { activationCreation, commande, controler, definir, enTete, lisible, longueur } from "../../plan2d/outils/commun";
import { formaterValeur } from "../../plan2d/saisie";
import { versPoint, type Vec } from "../../plan2d/geometrie";
import { controlerEmpriseBaie, estBaie, faces, murSousPoint, repereAxe, surMur } from "../geometrie";
import { MARGE_MUR } from "./murs";
import { champType, controlerSaisie, dimensionProposee, ecrireMemoire, lireMemoire, typeDeRang } from "./parametres";

export const LIBELLES_BAIE: Readonly<Record<ClasseBaie, string>> = { porte: "Porte", fenetre: "Fenêtre", ouverture: "Ouverture" };

interface Cible {
  readonly mur: ObjetMur;
  /** Abscisse du centre de la baie le long de l'axe (m, depuis `a`). */
  readonly s: number;
}

/** Valeurs effectives (saisies, sinon proposées par le type ; allège 0 pour porte et ouverture). */
export function valeursBaie(etat: EtatModele | null, classe: ClasseBaie, v: Readonly<Record<string, number>>): { largeur?: number; hauteur?: number; allege?: number; typeId: string } {
  const typeId = typeDeRang(etat, classe, v.type);
  const p = (k: "largeur" | "hauteur" | "allege") => v[k] ?? dimensionProposee(etat, classe, typeId, k);
  const allege = p("allege") ?? (classe === "fenetre" ? undefined : 0);
  return { largeur: p("largeur"), hauteur: p("hauteur"), ...(allege !== undefined ? { allege } : {}), typeId };
}

/** Cible sous le point : mur hôte et abscisse du centre (verrou `distance` éventuel). */
function viser(ctx: ContexteAtelier, p: Vec, dessous: IdObjet | null, distance: number | undefined): Cible | null {
  const etat = ctx.etat();
  const niveau = ctx.niveauActif();
  const h = etat && niveau ? murSousPoint(etat, niveau, p, MARGE_MUR, dessous) : null;
  return h ? { mur: h.mur, s: distance ?? h.s } : null;
}

/** Emprise de la baie dans l'épaisseur du mur (aperçu) et cotes de position depuis les extrémités du mur. */
function formesBaie(c: Cible, largeur: number | undefined, style: "trace" | "erreur"): FormeApercu[] {
  const r = repereAxe(c.mur.params.axe.a, c.mur.params.axe.b);
  const f = faces(c.mur);
  if (!r || !f) return [];
  const w = largeur ?? 0;
  const s0 = c.s - w / 2;
  const s1 = c.s + w / 2;
  const formes: FormeApercu[] = [{ forme: "surligner", ids: [c.mur.id], style: "fantome" }];
  if (w > 0) formes.push({ forme: "polygone", points: [surMur(r, s0, f.gauche), surMur(r, s1, f.gauche), surMur(r, s1, f.droite), surMur(r, s0, f.droite)].map(versPoint), style });
  else formes.push({ forme: "cercle", centre: versPoint(surMur(r, c.s)), rayon: 0.05, style });
  const k = f.gauche + 0.3;
  if (s0 > 0) formes.push({ forme: "cote", a: versPoint(surMur(r, 0, k)), b: versPoint(surMur(r, s0, k)), texte: formaterValeur(s0, "m") });
  if (s1 < r.L) formes.push({ forme: "cote", a: versPoint(surMur(r, s1, k)), b: versPoint(surMur(r, r.L, k)), texte: formaterValeur(r.L - s1, "m") });
  return formes;
}

/** Erreur d'emprise lisible, ou `null`. */
function emprise(etat: EtatModele, nom: string, c: Cible, largeur: number, ignorer: IdObjet | null): ErreurLisible | null {
  const e = controlerEmpriseBaie(etat, c.mur, c.s, largeur, ignorer);
  return e ? { ...lisible(nom, e.cause, e.action), objetIds: e.ids } : null;
}

const PARAMETRES = ["largeur", "hauteur", "allege", "type"];

export function sessionPoserBaie(ctx: ContexteAtelier, classe: ClasseBaie): SessionOutil {
  const cle = `creer.${classe}`;
  const nom = LIBELLES_BAIE[classe];
  let valeurs: Record<string, number> = { ...lireMemoire(cle) };
  let distance: number | undefined;
  let cible: Cible | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  let erreurSurvol: ErreurLisible | null = null;

  const evaluer = () => {
    const etat = ctx.etat();
    const v = valeursBaie(etat, classe, valeurs);
    erreurSurvol = etat && cible && v.largeur !== undefined ? emprise(etat, nom, cible, v.largeur, null) : null;
  };

  const poser = (): ReactionOutil => {
    const etat = ctx.etat();
    const t = enTete(ctx);
    if (!etat || !t) return refus(lisible(nom, "niveau ou calque actif absent", "choisir un niveau et un calque"));
    if (!cible) return refus(lisible(nom, "le pointeur n'est sur aucun mur du niveau actif", "cliquer sur un mur"));
    const v = valeursBaie(etat, classe, valeurs);
    for (const k of ["largeur", "hauteur", "allege"] as const) if (v[k] === undefined) return refus(lisible(nom, `${k === "allege" ? "allège" : k} non renseignée`, `taper la valeur dans le champ « ${k === "allege" ? "Allège" : k === "largeur" ? "Largeur" : "Hauteur"} »`));
    const ko = emprise(etat, nom, cible, v.largeur as number, null);
    if (ko) return refus(ko);
    const r = repereAxe(cible.mur.params.axe.a, cible.mur.params.axe.b);
    if (!r) return refus(lisible(nom, "mur hôte dégénéré", "choisir un autre mur"));
    const c = [
      commande("ouverture.poser", {
        id: ctx.nouvelId(classe),
        ...t,
        classe,
        murHoteId: cible.mur.id,
        position: { t: cible.s / r.L },
        largeur: longueur(v.largeur as number),
        hauteur: longueur(v.hauteur as number),
        allege: longueur(v.allege as number),
        typeId: v.typeId,
      }),
    ];
    const essai = controler(ctx, c);
    if (essai.length > 0) {
      erreurs = essai;
      return { action: "continuer" };
    }
    erreurs = [];
    distance = undefined;
    ecrireMemoire(cle, valeurs);
    return { action: "valider", label: `Poser une ${nom.toLowerCase()}`, commandes: c, terminer: false };
  };

  const refus = (e: ErreurLisible): ReactionOutil => {
    erreurs = [e];
    return { action: "continuer" };
  };

  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          cible = viser(ctx, evt.point, evt.objetSousPointeur, distance);
          evaluer();
          return { action: "continuer" };
        case "appui":
          cible = viser(ctx, evt.point, evt.objetSousPointeur, distance);
          return poser();
        case "touche":
          return { action: "continuer" };
        case "saisie": {
          if (!Number.isFinite(evt.valeur)) return refus(lisible("Saisie", "nombre attendu", "taper une valeur numérique"));
          if (evt.champ === "distance") {
            if (!(evt.valeur >= 0)) return refus(lisible(nom, "distance négative", "taper la distance depuis le début du mur jusqu'au centre de la baie"));
            distance = evt.valeur;
            if (cible) cible = { ...cible, s: distance };
          } else if (PARAMETRES.includes(evt.champ)) {
            const ko = controlerSaisie(nom, evt.champ, evt.valeur, ctx.etat(), classe);
            if (ko) return refus(ko);
            valeurs = { ...valeurs, [evt.champ]: evt.valeur };
            ecrireMemoire(cle, valeurs);
          }
          erreurs = [];
          evaluer();
          return { action: "continuer" };
        }
      }
    },
    apercu(): Apercu {
      const etat = ctx.etat();
      const v = valeursBaie(etat, classe, valeurs);
      const champs: ChampSaisie[] = [
        { champ: "distance", libelle: "Distance au centre", unite: "m", valeur: distance ?? cible?.s ?? null },
        { champ: "largeur", libelle: "Largeur", unite: "m", valeur: v.largeur ?? null },
        { champ: "hauteur", libelle: "Hauteur", unite: "m", valeur: v.hauteur ?? null },
        { champ: "allege", libelle: "Allège", unite: "m", valeur: v.allege ?? null },
        champType(etat, classe, valeurs.type),
      ];
      const tous = erreurs.length > 0 ? erreurs : erreurSurvol ? [erreurSurvol] : [];
      return {
        formes: cible ? formesBaie(cible, v.largeur, tous.length > 0 ? "erreur" : "trace") : [],
        champs,
        consigne: cible ? `Cliquez pour poser la ${nom.toLowerCase()} sur ce mur, ou tapez la distance au centre.` : `Survolez un mur pour y poser une ${nom.toLowerCase()}.`,
        erreurs: tous,
      };
    },
    abandonner() {
      cible = null;
      distance = undefined;
      erreurs = [];
      erreurSurvol = null;
    },
  };
}

function outilPoser(classe: ClasseBaie, raccourci: string, fiche: string, synonymes: readonly string[]): DefinitionOutil {
  const nom = LIBELLES_BAIE[classe];
  return definir({
    id: `creer.${classe}`,
    libelle: nom,
    famille: "creer",
    niveau: classe === "ouverture" ? "contextuel" : "essentiel",
    synonymes,
    raccourci,
    fiches: [fiche, "DA-05-12", "DA-05-14"],
    aide: {
      action: `Pose une ${nom.toLowerCase()} hébergée par un mur, avec contrôle d'emprise.`,
      conditions: "Un niveau et un calque actifs, un mur sous le pointeur ; largeur, hauteur et allège saisies ou proposées par le type.",
      exemple: `Tapez 0,9 (largeur) et 2,1 (hauteur), puis cliquez sur un mur : la ${nom.toLowerCase()} est centrée sur le point cliqué.`,
    },
    activation: activationCreation,
    commencer: (ctx) => sessionPoserBaie(ctx, classe),
  });
}

export const outilPorte = () => outilPoser("porte", "P", "DA-07-02", ["door", "porte battante", "baie"]);
export const outilFenetre = () => outilPoser("fenetre", "F", "DA-07-03", ["window", "baie vitrée", "croisée"]);
export const outilOuverture = () => outilPoser("ouverture", "O", "DA-07-04", ["opening", "baie libre", "passage", "trou dans le mur"]);

// ---------------------------------------------------------------------------------------------------------------
// Déplacer une baie le long d'un mur
// ---------------------------------------------------------------------------------------------------------------

function baieSelectionnee(ctx: ContexteAtelier): ObjetBaie | null {
  const id = ctx.selection.lire().principal;
  const o = id ? ctx.etat()?.objets[id] : undefined;
  return estBaie(o) ? o : null;
}

export function outilDeplacerBaie(): DefinitionOutil {
  return definir({
    id: "modifier.deplacer-baie",
    libelle: "Déplacer une baie",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ["glisser une porte", "déplacer une fenêtre", "move opening", "faire coulisser"],
    fiches: ["DA-07-02", "DA-07-03", "DA-07-04"],
    aide: {
      action: "Fait glisser la porte, fenêtre ou ouverture sélectionnée le long de son mur, ou vers un autre mur du même niveau.",
      conditions: "Une baie sélectionnée.",
      exemple: "Sélectionnez une porte, puis cliquez sa nouvelle position sur le mur (ou tapez la distance au centre).",
    },
    activation: (ctx) => (!ctx.etat() ? { ok: false, motif: "le modèle n'est pas chargé" } : baieSelectionnee(ctx) ? { ok: true } : { ok: false, motif: "sélectionner d'abord une porte, une fenêtre ou une ouverture" }),
    commencer: (ctx) => {
      const b = baieSelectionnee(ctx);
      const nom = b ? `${LIBELLES_BAIE[b.classe]} ${b.id}` : "Baie";
      let distance: number | undefined;
      let cible: Cible | null = null;
      let erreurs: readonly ErreurLisible[] = [];
      let erreurSurvol: ErreurLisible | null = null;
      const evaluer = () => {
        const etat = ctx.etat();
        erreurSurvol = etat && b && cible ? emprise(etat, nom, cible, b.params.largeur.value, b.id) : null;
      };
      const viserMeme = (p: Vec, dessous: IdObjet | null) => {
        cible = viser(ctx, p, dessous === b?.id ? (b?.params.murHoteId ?? null) : dessous, distance);
        evaluer();
      };
      return {
        traiter(evt) {
          if (!b) return { action: "terminer" };
          if (evt.type === "survol" || evt.type === "glisse" || evt.type === "relache") viserMeme(evt.point, evt.objetSousPointeur);
          if (evt.type === "saisie" && evt.champ === "distance" && evt.valeur >= 0) {
            distance = evt.valeur;
            cible = { mur: cible?.mur ?? (ctx.etat()?.objets[b.params.murHoteId] as ObjetMur), s: distance };
            evaluer();
          }
          if (evt.type !== "appui") return { action: "continuer" };
          viserMeme(evt.point, evt.objetSousPointeur);
          const etat = ctx.etat();
          if (!etat || !cible) {
            erreurs = [lisible(nom, "le pointeur n'est sur aucun mur du niveau", "cliquer sur un mur")];
            return { action: "continuer" };
          }
          const ko = emprise(etat, nom, cible, b.params.largeur.value, b.id);
          const r = repereAxe(cible.mur.params.axe.a, cible.mur.params.axe.b);
          if (ko || !r) {
            erreurs = [ko ?? lisible(nom, "mur hôte dégénéré", "choisir un autre mur")];
            return { action: "continuer" };
          }
          const params = cible.mur.id === b.params.murHoteId ? { t: cible.s / r.L } : { murHoteId: cible.mur.id, t: cible.s / r.L };
          const c = [commande("ouverture.deplacer", params, [b.id])];
          erreurs = controler(ctx, c);
          return erreurs.length > 0 ? { action: "continuer" } : { action: "valider", label: "Déplacer une baie", commandes: c, terminer: true };
        },
        apercu() {
          const tous = erreurs.length > 0 ? erreurs : erreurSurvol ? [erreurSurvol] : [];
          return {
            formes: cible && b ? [{ forme: "surligner", ids: [b.id], style: "fantome" }, ...formesBaie(cible, b.params.largeur.value, tous.length > 0 ? "erreur" : "trace")] : [],
            champs: [{ champ: "distance", libelle: "Distance au centre", unite: "m", valeur: distance ?? cible?.s ?? null }],
            consigne: "Cliquez la nouvelle position de la baie sur un mur, ou tapez la distance au centre.",
            erreurs: tous,
          };
        },
        abandonner() {
          cible = null;
          erreurs = [];
        },
      };
    },
  });
}
