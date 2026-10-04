/**
 * Pièces (DA-07-15) : la détection (`piece.detecter`) n'est qu'une **proposition** ; rien n'est créé sans
 * validation explicite, qui produit `piece.creer`.
 *
 * `ctx.essayer` ne rend pas les effets (`propositions`) : l'aperçu appelle directement `detecterPieces`
 * d'`@parcours/atelier-model` (le calcul du réducteur `piece.detecter`, non réécrit ici). Limite héritée : les
 * contours suivent les **axes** des murs, pas leurs faces intérieures (limite déclarée du réducteur).
 *
 * - `creer.piece` (famille Créer, maquette « Pièce ») : survol = contour proposé sous le pointeur et sa surface ;
 *   appui = `piece.creer` ;
 * - `analyser.pieces` (famille Analyser, maquette « Détecter les pièces ») : toutes les boucles fermées du niveau
 *   actif, marquées « nouvelle » ou « correspond à » une pièce existante ; Entrée (ou appui) crée les nouvelles.
 */
import { detecterPieces, type EtatModele, type IdObjet, type ObjetPiece, type PieceProposee } from "@parcours/atelier-model";
import type { ContexteAtelier, DefinitionOutil, ErreurLisible, FormeApercu, ReactionOutil } from "../../socle";
import { activationCreation, commande, controler, definir, enTete, lisible } from "../../plan2d/outils/commun";
import { pointDansPolygone, versPoint, type Vec } from "../../plan2d/geometrie";
import { aireContour, centreContour } from "../geometrie";
import { texteAire } from "../dessinateurs";

/** Pièce existante du niveau dont le contour correspond à la proposition (même aire, centre contenu). */
export function pieceCorrespondante(etat: EtatModele, niveauId: IdObjet, p: PieceProposee): ObjetPiece | null {
  const c = centreContour(p.contour);
  for (const o of Object.values(etat.objets)) {
    if (o.classe !== "piece" || o.niveauId !== niveauId) continue;
    if (o.params.polygones.some((q) => Math.abs(aireContour(q.contour) - p.aire) <= 1e-6 && pointDansPolygone(c, q.contour))) return o;
  }
  return null;
}

function nomsLibres(etat: EtatModele, niveauId: IdObjet, n: number): string[] {
  const pris = new Set(Object.values(etat.objets).flatMap((o) => (o.classe === "piece" && o.niveauId === niveauId ? [o.params.nom] : [])));
  const r: string[] = [];
  for (let i = 1; r.length < n; i++) if (!pris.has(`Pièce ${i}`)) r.push(`Pièce ${i}`);
  return r;
}

function creations(ctx: ContexteAtelier, propositions: readonly PieceProposee[]) {
  const t = enTete(ctx);
  const etat = ctx.etat();
  if (!t || !etat) return null;
  const noms = nomsLibres(etat, t.niveauId, propositions.length);
  return propositions.map((p, i) => commande("piece.creer", { id: ctx.nouvelId("piece"), ...t, polygones: [{ contour: p.contour, trous: [] }], nom: noms[i] }));
}

const formeProposition = (p: PieceProposee, style: "trace" | "fantome" | "erreur", texte: string): FormeApercu[] => [
  { forme: "polygone", points: p.contour, style },
  { forme: "texte", position: versPoint(centreContour(p.contour)), texte, style },
];

export function outilPiece(): DefinitionOutil {
  return definir({
    id: "creer.piece",
    libelle: "Pièce",
    famille: "creer",
    niveau: "essentiel",
    synonymes: ["room", "local", "pièce fermée", "surface"],
    fiches: ["DA-07-15"],
    aide: {
      action: "Propose la pièce fermée par les murs sous le pointeur, avec sa surface ; le clic la crée.",
      conditions: "Un niveau et un calque actifs ; des murs qui ferment la pièce.",
      exemple: "Survolez l'intérieur d'une pièce fermée par quatre murs, puis cliquez.",
    },
    activation: activationCreation,
    commencer: (ctx) => {
      let proposition: PieceProposee | null = null;
      let existante: ObjetPiece | null = null;
      let erreurs: readonly ErreurLisible[] = [];
      const viser = (p: Vec) => {
        const etat = ctx.etat();
        const niveau = ctx.niveauActif();
        proposition = etat && niveau ? (detecterPieces(etat, niveau, p)[0] ?? null) : null;
        existante = proposition && etat && niveau ? pieceCorrespondante(etat, niveau, proposition) : null;
      };
      return {
        traiter(evt): ReactionOutil {
          if (evt.type === "survol" || evt.type === "glisse") viser(evt.point);
          if (evt.type !== "appui") return { action: "continuer" };
          viser(evt.point);
          if (!proposition) {
            erreurs = [lisible("Pièce", "aucune boucle de murs fermée autour du point", "fermer la pièce par des murs, ou cliquer à l'intérieur d'une pièce fermée")];
            return { action: "continuer" };
          }
          if (existante) {
            erreurs = [{ ...lisible("Pièce", `correspond déjà à la pièce ${existante.params.nom} (${existante.id})`, "la modifier dans l'inspecteur"), objetIds: [existante.id] }];
            return { action: "continuer" };
          }
          const c = creations(ctx, [proposition]);
          if (!c) {
            erreurs = [lisible("Pièce", "niveau ou calque actif absent", "choisir un niveau et un calque")];
            return { action: "continuer" };
          }
          erreurs = controler(ctx, c);
          return erreurs.length > 0 ? { action: "continuer" } : { action: "valider", label: "Créer une pièce", commandes: c, terminer: false };
        },
        apercu() {
          const p = proposition;
          const formes = p ? formeProposition(p, existante ? "fantome" : "trace", existante ? `${existante.params.nom} (existante)` : `Proposition — ${texteAire(p.aire)}`) : [];
          return {
            formes,
            champs: [],
            consigne: p ? "Cliquez pour créer la pièce proposée (contour sur les axes des murs)." : "Survolez l'intérieur d'une pièce fermée par des murs.",
            erreurs,
          };
        },
        abandonner() {
          proposition = null;
          erreurs = [];
        },
      };
    },
  });
}

/** Propositions du niveau, avec la pièce existante correspondante éventuelle. */
export function propositionsDuNiveau(etat: EtatModele, niveauId: IdObjet): { proposition: PieceProposee; existante: ObjetPiece | null }[] {
  return detecterPieces(etat, niveauId).map((proposition) => ({ proposition, existante: pieceCorrespondante(etat, niveauId, proposition) }));
}

export function outilDetecterPieces(): DefinitionOutil {
  return definir({
    id: "analyser.pieces",
    libelle: "Détecter les pièces",
    famille: "analyser",
    niveau: "contextuel",
    synonymes: ["room detection", "détection", "pièces fermées", "piece.detecter"],
    fiches: ["DA-07-15"],
    aide: {
      action: "Propose toutes les pièces fermées par les murs du niveau ; rien n'est imposé, Entrée crée les nouvelles.",
      conditions: "Un niveau et un calque actifs.",
      exemple: "Lancez l'outil, vérifiez les contours proposés, puis Entrée.",
    },
    activation: activationCreation,
    commencer: (ctx) => {
      let erreurs: readonly ErreurLisible[] = [];
      const liste = () => {
        const etat = ctx.etat();
        const niveau = ctx.niveauActif();
        return etat && niveau ? propositionsDuNiveau(etat, niveau) : [];
      };
      const valider = (): ReactionOutil => {
        const nouvelles = liste().filter((x) => !x.existante).map((x) => x.proposition);
        if (nouvelles.length === 0) {
          erreurs = [lisible("Détection des pièces", "aucune nouvelle pièce fermée", "fermer des pièces par des murs, ou terminer (Échap)")];
          return { action: "continuer" };
        }
        const c = creations(ctx, nouvelles);
        if (!c) return { action: "continuer" };
        erreurs = controler(ctx, c);
        return erreurs.length > 0 ? { action: "continuer" } : { action: "valider", label: `Créer ${c.length} pièce(s) détectée(s)`, commandes: c, terminer: true };
      };
      return {
        traiter(evt) {
          if (evt.type === "appui" || (evt.type === "touche" && evt.touche === "Enter")) return valider();
          return { action: "continuer" };
        },
        apercu() {
          const l = liste();
          const nouvelles = l.filter((x) => !x.existante);
          return {
            formes: l.flatMap((x) => formeProposition(x.proposition, x.existante ? "fantome" : "trace", x.existante ? `correspond à ${x.existante.params.nom}` : `nouvelle — ${texteAire(x.proposition.aire)}`)),
            champs: [],
            consigne: l.length === 0 ? "Aucune boucle de murs fermée sur ce niveau." : `${l.length} contour(s) proposé(s), dont ${nouvelles.length} nouveau(x) : Entrée ou clic pour créer les nouvelles pièces.`,
            erreurs,
          };
        },
        abandonner() {
          erreurs = [];
        },
      };
    },
  });
}
