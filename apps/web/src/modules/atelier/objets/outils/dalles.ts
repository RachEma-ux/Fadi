/**
 * Dalle (DA-07-06) : `creer.dalle` (S, famille Créer) → `dalle.creer`.
 *
 * Deux modes, choisis dans une liste (D-038) :
 * - « contour » : points successifs, fermeture sur le premier point (ou Entrée dès trois points) ;
 * - « pièce » : clic à l'intérieur d'une pièce du niveau actif ; la dalle reprend ses polygones (contour et trous).
 * Épaisseur et décalage de la sous-face : dernières valeurs saisies, jamais de valeur par défaut (R3). La dalle reste
 * sans type : les types de dalle ne sont pas au contrat `atelier-commands/1` (D-038).
 */
import type { EtatModele, IdObjet, ObjetPiece } from "@parcours/atelier-model";
import type { Apercu, ChampSaisie, ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { activationCreation, commande, controler, definir, enTete, lisible, longueur, P } from "../../plan2d/outils/commun";
import { pointDansPolygone, type Vec } from "../../plan2d/geometrie";
import { aireContour } from "../geometrie";
import { traceContour } from "./contour";
import { controlerChoix, controlerSaisie, ecrireMemoire, lireMemoire, type Valeurs } from "./parametres";

const CLE = "creer.dalle";
const MODES = [
  { valeur: "contour", libelle: "Par contour" },
  { valeur: "piece", libelle: "Depuis une pièce" },
] as const;

/** Pièce du niveau dont un polygone contient le point (l'objet sous le pointeur est préféré). */
export function pieceSousPoint(etat: EtatModele, niveauId: IdObjet, p: Vec, dessous: IdObjet | null): ObjetPiece | null {
  const d = dessous ? etat.objets[dessous] : undefined;
  if (d?.classe === "piece" && d.niveauId === niveauId) return d;
  let r: ObjetPiece | null = null;
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "piece" || o.niveauId !== niveauId) continue;
    if (!o.params.polygones.some((q) => pointDansPolygone(p, q.contour))) continue;
    // La plus petite pièce qui contient le point.
    const aire = (x: ObjetPiece) => Math.min(...x.params.polygones.map((q) => aireContour(q.contour)));
    if (!r || aire(o) < aire(r)) r = o;
  }
  return r;
}

export function sessionDalle(ctx: ContexteAtelier): SessionOutil {
  let valeurs: Valeurs = lireMemoire(CLE);
  const trace = traceContour("Dalle");
  let piece: ObjetPiece | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  const mode = () => (valeurs.choix.mode === "piece" ? "piece" : "contour");
  const refus = (e: ErreurLisible): ReactionOutil => {
    erreurs = [e];
    return { action: "continuer" };
  };
  const champMode = (): ChampSaisie => ({ champ: "mode", libelle: "Mode", unite: "", valeur: null, choix: MODES, valeurChoisie: mode() });

  /** Lot `dalle.creer` pour un contour et ses trous. */
  const creer = (contour: readonly Vec[], trous: readonly { polygone: readonly Vec[] }[], label: string): ReactionOutil => {
    const t = enTete(ctx);
    if (!t) return refus(lisible("Dalle", "niveau ou calque actif absent", "choisir un niveau et un calque"));
    const e = valeurs.nombres.epaisseur;
    const d = valeurs.nombres.decalageBase;
    if (e === undefined) return refus(lisible("Dalle", "épaisseur non renseignée", "taper l'épaisseur dans le champ « Épaisseur » (ex. 0,2)"));
    if (d === undefined) return refus(lisible("Dalle", "décalage de la sous-face non renseigné", "taper le décalage dans le champ « Décalage de la sous-face » (ex. −0,2 sous le niveau)"));
    const c = [commande("dalle.creer", { id: ctx.nouvelId("dalle"), ...t, contour: contour.map(P), trous: trous.map((h) => ({ polygone: h.polygone.map(P) })), epaisseur: longueur(e), decalageBase: longueur(d) })];
    const ko = controler(ctx, c);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    erreurs = [];
    trace.vider();
    ecrireMemoire(CLE, valeurs);
    return { action: "valider", label, commandes: c, terminer: false };
  };

  const fermer = (): ReactionOutil => (trace.points().length >= 3 ? creer(trace.points(), [], "Créer une dalle") : refus(lisible("Dalle", "moins de trois sommets", "poser au moins trois points")));

  const viser = (p: Vec, dessous: IdObjet | null) => {
    const etat = ctx.etat();
    const niveau = ctx.niveauActif();
    piece = etat && niveau && mode() === "piece" ? pieceSousPoint(etat, niveau, p, dessous) : null;
  };

  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          trace.survoler(evt.point);
          viser(evt.point, evt.objetSousPointeur);
          return { action: "continuer" };
        case "appui": {
          if (mode() === "piece") {
            viser(evt.point, evt.objetSousPointeur);
            if (!piece) return refus(lisible("Dalle", "aucune pièce sous le pointeur", "cliquer à l'intérieur d'une pièce du niveau actif, ou choisir le mode « Par contour »"));
            const q = piece.params.polygones.reduce((m, x) => (aireContour(x.contour) > aireContour(m.contour) ? x : m));
            return creer(q.contour, q.trous, `Créer une dalle depuis la pièce ${piece.params.nom}`);
          }
          const r = trace.poser(evt.point);
          if (r === "ferme") return fermer();
          if (r !== "pose") return refus(r);
          erreurs = [];
          return { action: "continuer" };
        }
        case "touche":
          if (evt.touche === "Enter" && trace.points().length >= 3) return fermer();
          if (evt.touche === "Backspace") trace.retirerDernier();
          return { action: "continuer" };
        case "saisie-texte":
          return { action: "continuer" };
        case "choix": {
          const ko = controlerChoix("Dalle", evt.champ === "mode" ? champMode() : undefined, evt.valeur);
          if (ko) return refus(ko);
          valeurs = { ...valeurs, choix: { ...valeurs.choix, mode: evt.valeur } };
          ecrireMemoire(CLE, valeurs);
          trace.vider();
          erreurs = [];
          return { action: "continuer" };
        }
        case "saisie": {
          if (!Number.isFinite(evt.valeur)) return refus(lisible("Saisie", "nombre attendu", "taper une valeur numérique"));
          if (evt.champ === "epaisseur" || evt.champ === "decalageBase") {
            const ko = controlerSaisie("Dalle", evt.champ, evt.valeur);
            if (ko) return refus(ko);
            valeurs = { ...valeurs, nombres: { ...valeurs.nombres, [evt.champ]: evt.valeur } };
            ecrireMemoire(CLE, valeurs);
          } else {
            const ko = trace.verrouiller(evt.champ, evt.valeur);
            if (ko) return refus(ko);
          }
          erreurs = [];
          return { action: "continuer" };
        }
      }
    },
    apercu(): Apercu {
      const style = erreurs.length > 0 ? "erreur" : "trace";
      const formes: FormeApercu[] = [];
      if (mode() === "piece" && piece) {
        for (const q of piece.params.polygones) formes.push({ forme: "polygone", points: q.contour, style }, ...q.trous.map((h): FormeApercu => ({ forme: "polygone", points: h.polygone, style: "fantome" })));
      } else if (mode() === "contour") {
        formes.push(...trace.formes(style));
      }
      const champs: ChampSaisie[] = [
        champMode(),
        ...(mode() === "contour" ? trace.champs() : []),
        { champ: "epaisseur", libelle: "Épaisseur", unite: "m", valeur: valeurs.nombres.epaisseur ?? null },
        { champ: "decalageBase", libelle: "Décalage de la sous-face", unite: "m", valeur: valeurs.nombres.decalageBase ?? null },
      ];
      const consigne =
        mode() === "piece"
          ? piece
            ? `Cliquez pour créer la dalle de la pièce ${piece.params.nom}.`
            : "Survolez une pièce du niveau actif."
          : trace.points().length === 0
            ? "Cliquez le premier sommet du contour de la dalle."
            : "Sommet suivant ; premier point ou Entrée pour fermer le contour.";
      return { formes, champs, consigne, erreurs };
    },
    abandonner() {
      trace.vider();
      piece = null;
      erreurs = [];
    },
  };
}

export function outilDalle(): DefinitionOutil {
  return definir({
    id: "creer.dalle",
    libelle: "Dalle",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["slab", "plancher", "radier", "chape", "floor"],
    raccourci: "S",
    fiches: ["DA-07-06", "DA-07-05"],
    aide: {
      action: "Crée une dalle par son contour, ou reprend le contour d'une pièce.",
      conditions: "Un niveau et un calque actifs ; épaisseur et décalage de la sous-face saisis.",
      exemple: "Tapez 0,2 (épaisseur) et −0,2 (décalage), choisissez « Depuis une pièce », puis cliquez dans la pièce.",
    },
    activation: activationCreation,
    commencer: sessionDalle,
  });
}
