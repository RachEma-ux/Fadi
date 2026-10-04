/**
 * Outils du lot 3b (L3b.2) : « Pousser / tirer » (`modifier.pousser`, DA-04-07) et « Extruder » (`creer.extruder`,
 * DA-04-01). Utilisables dans le plan 2D (valeur tapée dans la saisie de précision) et dans la vue 3D (glisser
 * vertical, aperçu du volume avant validation : `Vue3d.tsx`).
 *
 * Évènements : `saisie` du champ de la grandeur → validation immédiate de la valeur exacte ; `saisie` du champ
 * `glisser` → valeur proposée (aperçu, contrôle par essai à blanc) ; Entrée ou appui → validation de la valeur
 * proposée ; Échap → renoncer.
 */
import type { Apercu, ChampSaisie, ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, ReactionOutil, SessionOutil } from "../socle";
import { activationSelection, controler, definir, lisible } from "../plan2d/outils/commun";
import { formaterValeur } from "../plan2d/saisie";
import { ecrireMemoire, lireMemoire } from "../objets/outils/parametres";
import { ciblePoussee, commandesExtrusion, commandesPoussee, contourExtrudable } from "./pousser";

export const ID_POUSSER = "modifier.pousser";
export const ID_EXTRUDER = "creer.extruder";
/** Champ de la valeur proposée par un glisser dans la vue 3D. */
export const CHAMP_GLISSER = "glisser";

const texteM = (v: number) => `${formaterValeur(v, "m")}`;
const OUI_NON = [
  { valeur: "oui", libelle: "Conserver l'esquisse" },
  { valeur: "non", libelle: "Consommer l'esquisse" },
] as const;

function sessionPousser(ctx: ContexteAtelier): SessionOutil {
  let propose: number | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  const cible = () => ciblePoussee(ctx.etat()?.objets[ctx.selection.lire().principal ?? ""]);
  const valider = (v: number): ReactionOutil => {
    const c = cible();
    if ("motif" in c) {
      erreurs = [lisible("Pousser / tirer", c.motif, "sélectionner un mur, une dalle, une toiture, un solide ou un poteau")];
      return { action: "continuer" };
    }
    const cmds = commandesPoussee(c, v);
    if (!Array.isArray(cmds)) {
      erreurs = [lisible(c.libelle, (cmds as { motif: string }).motif, "saisir ou glisser vers une valeur positive")];
      return { action: "continuer" };
    }
    const ko = controler(ctx, cmds);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    erreurs = [];
    propose = null;
    return { action: "valider", label: `${c.libelle} de ${c.objetId} : ${texteM(c.valeur)} → ${texteM(v)}`, commandes: cmds, terminer: true };
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      const c = cible();
      switch (evt.type) {
        case "saisie":
          if (!Number.isFinite(evt.valeur)) return { action: "continuer" };
          if (evt.champ === CHAMP_GLISSER) {
            propose = evt.valeur;
            if (!("motif" in c)) {
              const cmds = commandesPoussee(c, evt.valeur);
              erreurs = Array.isArray(cmds) ? controler(ctx, cmds) : [lisible(c.libelle, (cmds as { motif: string }).motif, "glisser vers une valeur positive")];
            }
            return { action: "continuer" };
          }
          if (!("motif" in c) && evt.champ === c.cle) return valider(evt.valeur);
          return { action: "continuer" };
        case "appui":
          return propose !== null ? valider(propose) : { action: "continuer" };
        case "touche":
          if (evt.touche === "Enter" && propose !== null) return valider(propose);
          if (evt.touche === "Escape") return { action: "terminer" };
          return { action: "continuer" };
        default:
          return { action: "continuer" };
      }
    },
    apercu(): Apercu {
      const c = cible();
      if ("motif" in c) return { formes: [], champs: [], consigne: `Pousser / tirer : ${c.motif}.`, erreurs };
      const champs: ChampSaisie[] = [{ champ: c.cle, libelle: c.libelle, unite: "m", valeur: propose ?? c.valeur }];
      const consigne =
        propose === null
          ? `${c.libelle} de ${c.objetId} : ${texteM(c.valeur)}. Glissez verticalement dans la vue 3D, ou tapez la valeur puis Entrée.`
          : `${c.libelle} de ${c.objetId} : ${texteM(c.valeur)} → ${texteM(propose)}. Relâchez ou Entrée pour valider, Échap pour renoncer.`;
      return { formes: [{ forme: "surligner", ids: [c.objetId], style: erreurs.length > 0 ? "erreur" : "trace" }], champs, consigne, erreurs };
    },
    abandonner() {
      propose = null;
      erreurs = [];
    },
  };
}

function sessionExtruder(ctx: ContexteAtelier): SessionOutil {
  let valeurs = lireMemoire(ID_EXTRUDER);
  let propose: number | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  const source = () => contourExtrudable(ctx.etat()?.objets[ctx.selection.lire().principal ?? ""]);
  const decalage = () => valeurs.nombres.decalageBase ?? 0;
  const conserver = () => valeurs.choix.conserver !== "non";
  const lot = (h: number, id: string) => {
    const s = source();
    return "motif" in s ? s : commandesExtrusion(s, { id, hauteur: h, decalageBase: decalage(), conserverSource: conserver() });
  };
  const valider = (h: number): ReactionOutil => {
    const cmds = lot(h, ctx.nouvelId("solide"));
    if (!Array.isArray(cmds)) {
      erreurs = [lisible("Extruder", (cmds as { motif: string }).motif, "sélectionner un contour fermé et saisir une hauteur positive")];
      return { action: "continuer" };
    }
    const ko = controler(ctx, cmds);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    valeurs = { ...valeurs, nombres: { ...valeurs.nombres, hauteur: h } };
    ecrireMemoire(ID_EXTRUDER, valeurs);
    erreurs = [];
    propose = null;
    return { action: "valider", label: "Extruder un contour", commandes: cmds, terminer: true };
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "saisie":
          if (!Number.isFinite(evt.valeur)) return { action: "continuer" };
          if (evt.champ === "hauteur") return valider(evt.valeur);
          if (evt.champ === "decalageBase") {
            valeurs = { ...valeurs, nombres: { ...valeurs.nombres, decalageBase: evt.valeur } };
            ecrireMemoire(ID_EXTRUDER, valeurs);
            erreurs = [];
          } else if (evt.champ === CHAMP_GLISSER) {
            propose = evt.valeur;
            const cmds = lot(evt.valeur, "solide-apercu");
            erreurs = Array.isArray(cmds) ? controler(ctx, cmds) : [lisible("Extruder", (cmds as { motif: string }).motif, "glisser vers une hauteur positive")];
          }
          return { action: "continuer" };
        case "choix":
          if (evt.champ === "conserver" && OUI_NON.some((o) => o.valeur === evt.valeur)) {
            valeurs = { ...valeurs, choix: { ...valeurs.choix, conserver: evt.valeur } };
            ecrireMemoire(ID_EXTRUDER, valeurs);
          }
          return { action: "continuer" };
        case "appui": {
          const h = propose ?? valeurs.nombres.hauteur;
          return h !== undefined ? valider(h) : { action: "continuer" };
        }
        case "touche": {
          const h = propose ?? valeurs.nombres.hauteur;
          if (evt.touche === "Enter" && h !== undefined) return valider(h);
          if (evt.touche === "Escape") return { action: "terminer" };
          return { action: "continuer" };
        }
        default:
          return { action: "continuer" };
      }
    },
    apercu(): Apercu {
      const s = source();
      if ("motif" in s) return { formes: [], champs: [], consigne: `Extruder : ${s.motif}.`, erreurs };
      const h = propose ?? valeurs.nombres.hauteur ?? null;
      const champs: ChampSaisie[] = [
        { champ: "hauteur", libelle: "Hauteur", unite: "m", valeur: h },
        { champ: "decalageBase", libelle: "Décalage de base", unite: "m", valeur: decalage() },
        { champ: "conserver", libelle: "Esquisse source", unite: "", valeur: null, choix: OUI_NON, valeurChoisie: conserver() ? "oui" : "non" },
      ];
      const consigne =
        h === null
          ? `Extruder ${s.source.id} : tapez la hauteur puis Entrée, ou glissez verticalement dans la vue 3D.`
          : `Extruder ${s.source.id} sur ${texteM(h)} (base ${texteM(decalage())}). Entrée ou relâcher pour valider, Échap pour renoncer.`;
      return { formes: [{ forme: "polygone", points: s.contour, style: erreurs.length > 0 ? "erreur" : "trace" }], champs, consigne, erreurs };
    },
    abandonner() {
      propose = null;
      erreurs = [];
    },
  };
}

export function outilPousser(): DefinitionOutil {
  const d = definir({
    id: ID_POUSSER,
    libelle: "Pousser / tirer",
    famille: "modifier",
    niveau: "essentiel",
    synonymes: ["push/pull", "push pull", "pousser", "tirer", "hauteur", "épaisseur", "extruder la face"],
    fiches: ["DA-04-07"],
    aide: {
      action: "Change la hauteur d'un mur, d'un solide ou d'un poteau, ou l'épaisseur d'une dalle ou d'une toiture.",
      conditions: "Un objet sélectionné ; projet modifiable. Mur : hauteur donnée (pas liée à un niveau haut).",
      exemple: "En 3D, sélectionnez un mur, glissez vers le haut, relâchez ; ou tapez 3,2 puis Entrée.",
    },
    activation: (ctx) => {
      const a = activationSelection(ctx);
      if (!a.ok) return a;
      const c = ciblePoussee(ctx.etat()?.objets[ctx.selection.lire().principal ?? ""]);
      return "motif" in c ? { ok: false, motif: c.motif } : { ok: true };
    },
    commencer: sessionPousser,
  });
  return { ...d, vues: ["3d", "plan"] };
}

export function outilExtruder(): DefinitionOutil {
  const d = definir({
    id: ID_EXTRUDER,
    libelle: "Extruder",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["extrude", "extrusion", "volume", "solide", "push/pull"],
    fiches: ["DA-04-01"],
    aide: {
      action: "Crée un solide droit à partir d'un contour d'esquisse fermé (trous compris).",
      conditions: "Un contour fermé sélectionné (polyligne fermée, rectangle, polygone, cercle, spline fermée, hachure).",
      exemple: "Sélectionnez un rectangle, tapez 0,9 dans « Hauteur » puis Entrée.",
    },
    activation: (ctx) => {
      const a = activationSelection(ctx);
      if (!a.ok) return a;
      const s = contourExtrudable(ctx.etat()?.objets[ctx.selection.lire().principal ?? ""]);
      return "motif" in s ? { ok: false, motif: s.motif } : { ok: true };
    },
    commencer: sessionExtruder,
  });
  return { ...d, vues: ["plan", "3d"] };
}
