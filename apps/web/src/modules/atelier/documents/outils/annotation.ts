/**
 * Outils « Cotation » (K, DA-15-02-a) et « Texte » (T, DA-15-04-a), famille Documenter. Ils n'écrivent jamais :
 * ils rendent `cotation.creer` / `texte.creer`, contrôlés à blanc (`ctx.essayer`) avant validation.
 *
 * Cotation : premier point, second point (verrous longueur / angle), puis position de la ligne de cote : le
 * décalage signé (côté gauche de a→b positif) suit le pointeur ou se saisit (champ `decalage`, m, négatif
 * admis). Décalage proposé : le dernier posé dans la session, sinon 0,60 m (valeur d'outil du prototype). Au
 * lot 3a la cote est **libre** : `references: []`, aucune `cotation.rattacher` (D-018, D-019) ; les points
 * accrochés sont copiés.
 *
 * Texte : point d'insertion (coin bas-gauche), puis contenu saisi dans le champ `texte` de genre `"texte"`
 * (zone de texte multiligne de la zone de travail, évènement `saisie-texte`, D-038) ; plusieurs lignes admises
 * (D-019), espaces de bord retirés, 1 à 2 000 caractères, caractères de contrôle autres que le retour à la ligne
 * refusés.
 */
import type { Commande, PointLocal } from "@parcours/atelier-model";
import type { Apercu, ContexteAtelier, DefinitionOutil, ErreurLisible, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { activationCreation, champsSegment, commande, contraindrePolaire, controler, coteSegment, enTete, formeApercu, longueur, P, pointOuCurseur, sessionPoints, type EtatPoints } from "../../plan2d/outils/commun";
import { distance, fois, parametreProjection, plus, sous, vectoriel, versPoint, type Vec } from "../../plan2d/geometrie";
import { contourTexte, formesCote, HAUTEUR_TEXTE } from "../annotations";
import { lisible, texteCote } from "../format";

export const ID_COTATION = "documenter.cotation";
export const ID_TEXTE = "documenter.texte";

/** Décalage proposé à la première cote de la session (m) — valeur d'outil du prototype, pas une norme. */
export const DECALAGE_INITIAL = 0.6;
let dernierDecalage = DECALAGE_INITIAL;

/** Remet le décalage proposé à sa valeur initiale (tests). */
export function oublierDecalage(): void {
  dernierDecalage = DECALAGE_INITIAL;
}

// ---------------------------------------------------------------------------------------------------------------
// Cotation
// ---------------------------------------------------------------------------------------------------------------

/** Décalage signé de `p` par rapport à la droite a→b (positif à gauche). */
export function decalageSigne(a: Vec, b: Vec, p: Vec): number {
  const l = distance(a, b);
  return l > 0 ? vectoriel(sous(b, a), sous(p, a)) / l : 0;
}

/** Point de la ligne de cote : projection de `p` sur a→b, décalée de `d` sur la normale gauche. */
function pointDecale(a: Vec, b: Vec, p: Vec, d: number): PointLocal {
  const l = distance(a, b);
  const n = { x: -(b.y - a.y) / l, y: (b.x - a.x) / l };
  const t = parametreProjection({ a, b }, p);
  return versPoint(plus(plus(a, fois(sous(b, a), t)), fois(n, d)));
}

/** Décalage du geste : verrou saisi (exact), sinon mesuré sur le point posé ou le curseur. */
function decalageDe(e: EtatPoints): number | null {
  const [a, b] = e.points;
  if (!a || !b) return null;
  if (e.verrous.decalage !== undefined) return e.verrous.decalage;
  // Tant que le pointeur n'a pas quitté le second point, le décalage proposé reste le dernier posé.
  const p = e.points[2] ?? (e.curseur && distance(e.curseur, b) > 0 ? e.curseur : null);
  return p ? decalageSigne(a, b, p) : dernierDecalage;
}

function sessionCotation(ctx: ContexteAtelier): SessionOutil {
  return sessionPoints(ctx, {
    nombre: 3,
    consigne: (e) => ["Cotation : cliquez le premier point.", "Cotation : cliquez le second point (longueur et angle au clavier).", "Cotation : placez la ligne de cote, ou tapez le décalage (m, négatif à droite)."][e.points.length] ?? "",
    champs: (e) => {
      if (e.points.length < 2) return champsSegment(e.points[0] ?? null, e.curseur, e.verrous);
      return [{ champ: "decalage", libelle: "Décalage", unite: "m", valeur: decalageDe(e) }];
    },
    contraindre: (e, brut) => {
      const [a, b] = e.points;
      if (a && b) return pointDecale(a, b, brut, e.verrous.decalage ?? decalageSigne(a, b, brut));
      return contraindrePolaire(e.points.at(-1) ?? null, brut, e.verrous);
    },
    formes: (e) => {
      const a = pointOuCurseur(e, 0);
      const b = pointOuCurseur(e, 1);
      if (!a || !b || e.points.length === 0) return [];
      if (e.points.length === 1) return [{ forme: "segment", a: P(a), b: P(b), style: "trace" }, coteSegment(a, b)];
      const d = decalageDe(e) ?? dernierDecalage;
      return formesCote(a, b, d).map((f) => formeApercu(f, "trace")).filter((f): f is FormeApercu => f !== null);
    },
    geste: (e) => {
      const t = enTete(ctx);
      const [a, b] = e.points;
      const d = decalageDe(e);
      if (!t) return { erreur: lisible("Cotation", "niveau ou calque actif absent", "choisir un niveau et un calque") };
      if (!a || !b || d === null) return { erreur: lisible("Cotation", "points manquants", "cliquer deux points puis la ligne de cote") };
      dernierDecalage = d;
      const params = { ...t, id: ctx.nouvelId("cotation"), a: P(a), b: P(b), decalage: longueur(d), references: [] };
      return { label: `Coter ${texteCote(distance(a, b))}`, commandes: [commande("cotation.creer", params)] };
    },
  });
}

export function outilCotation(): DefinitionOutil {
  return {
    id: ID_COTATION,
    libelle: "Cotation",
    famille: "documenter",
    niveau: "essentiel",
    synonymes: ["cote", "coter", "dimension", "dim", "dimlinear", "aligned dimension", "cotation libre"],
    raccourci: "K",
    fiches: ["DA-15-02"],
    aide: { action: "Pose une cote libre entre deux points, décalée de la valeur choisie.", conditions: "Niveau et calque actifs ; projet modifiable. La cote ne suit pas les objets (rattachement au lot 5).", exemple: "Deux extrémités de mur, puis décalage 0,60 m → « 4,50 m »." },
    vues: ["plan"],
    ecrit: true,
    activation: activationCreation,
    commencer: sessionCotation,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Texte
// ---------------------------------------------------------------------------------------------------------------

export const LONGUEUR_TEXTE_MAX = 2000;
export const CHAMP_TEXTE = "texte";

/** Contrôle client du contenu (même règle que le serveur pour le vide ; longueur et caractères : fiche DA-15-04). */
export function controlerTexte(brut: string): { ok: true; texte: string } | { ok: false; erreur: ErreurLisible } {
  const texte = brut.replace(/\r\n?/g, "\n").trim();
  if (texte === "") return { ok: false, erreur: lisible("Texte", "texte vide", "taper le texte à poser") };
  if ([...texte].length > LONGUEUR_TEXTE_MAX) return { ok: false, erreur: lisible("Texte", `plus de ${LONGUEUR_TEXTE_MAX} caractères`, "raccourcir le texte") };
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u0009\u000b-\u001f\u007f]/.test(texte)) return { ok: false, erreur: lisible("Texte", "caractère de contrôle", "retirer les tabulations et caractères invisibles") };
  return { ok: true, texte };
}

function sessionTexte(ctx: ContexteAtelier): SessionOutil {
  let position: PointLocal | null = null;
  let curseur: PointLocal | null = null;
  let texte = "";
  let erreurs: readonly ErreurLisible[] = [];

  const poser = (): ReactionOutil => {
    const t = enTete(ctx);
    if (!t) {
      erreurs = [lisible("Texte", "niveau ou calque actif absent", "choisir un niveau et un calque")];
      return { action: "continuer" };
    }
    if (!position) return { action: "continuer" };
    const c = controlerTexte(texte);
    if (!c.ok) {
      erreurs = [c.erreur];
      return { action: "continuer" };
    }
    const commandes: readonly Commande[] = [commande("texte.creer", { ...t, id: ctx.nouvelId("texte"), position, texte: c.texte })];
    const ko = controler(ctx, commandes);
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    const premiere = c.texte.split("\n")[0] ?? "";
    position = null;
    texte = "";
    erreurs = [];
    return { action: "valider", label: `Écrire « ${[...premiere].length > 40 ? `${[...premiere].slice(0, 40).join("")}…` : premiere} »`, commandes, terminer: false };
  };

  return {
    traiter(evt) {
      switch (evt.type) {
        case "saisie-texte":
          if (evt.champ !== CHAMP_TEXTE) return { action: "continuer" };
          texte = evt.texte;
          erreurs = [];
          return position ? poser() : { action: "continuer" };
        case "survol":
        case "glisse":
        case "relache":
          curseur = evt.point;
          return { action: "continuer" };
        case "appui":
          position = evt.point;
          erreurs = [];
          return texte.trim() ? poser() : { action: "continuer" };
        case "touche":
          if (evt.touche === "Enter" && position && texte) return poser();
          if (evt.touche === "Escape" || evt.touche === "Backspace") {
            position = null;
            erreurs = [];
          }
          return { action: "continuer" };
        default:
          return { action: "continuer" };
      }
    },
    apercu(): Apercu {
      const ou = position ?? curseur;
      const formes: FormeApercu[] = [];
      if (ou) {
        const contenu = texte.trim() || "Texte";
        formes.push({ forme: "texte", position: ou, texte: contenu, style: position ? "trace" : "fantome" });
        formes.push({ forme: "polyligne", points: contourTexte(ou, contenu, HAUTEUR_TEXTE), fermee: true, style: "fantome" });
      }
      const consigne = position ? "Texte : tapez le contenu dans le champ « Texte à poser », puis Entrée (Maj+Entrée : nouvelle ligne)." : "Texte : cliquez le point d'insertion (coin bas-gauche).";
      const champs = position ? [{ champ: CHAMP_TEXTE, libelle: "Texte à poser", unite: "" as const, valeur: null, genre: "texte" as const }] : [];
      return { formes, champs, consigne, erreurs };
    },
    abandonner() {
      position = null;
      texte = "";
      erreurs = [];
    },
  };
}

export function outilTexte(): DefinitionOutil {
  return {
    id: ID_TEXTE,
    libelle: "Texte",
    famille: "documenter",
    niveau: "essentiel",
    synonymes: ["annotation", "note", "écrire", "text", "mtext", "dtext", "texte libre"],
    raccourci: "T",
    fiches: ["DA-15-04"],
    aide: { action: "Pose un texte libre (une ou plusieurs lignes) en un point du plan.", conditions: "Niveau et calque actifs ; projet modifiable.", exemple: "Cliquer près de l'ascenseur, écrire « ASC », Entrée." },
    vues: ["plan"],
    ecrit: true,
    activation: activationCreation,
    commencer: sessionTexte,
  };
}
