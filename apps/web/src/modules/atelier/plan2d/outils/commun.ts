/**
 * Socle commun des outils de `plan2d` (esquisse, transformations) : verrous de saisie de précision, session « à
 * points » générique, contrôle par essai à blanc avant validation, conversions de dessins en formes d'aperçu.
 *
 * Cycle d'un geste (cahier §5.8) : sélection → paramètres → aperçu → contrôle (`ctx.essayer`) → validation (la
 * session rend `valider` avec des `Commande` ; elle n'écrit jamais l'état).
 *
 * Conventions d'évènements (D-033, détaillées dans le rapport L3a.2) :
 * - `survol` / `glisse` : déplacent le curseur de l'aperçu ; `appui` : pose un point ;
 * - `saisie` : verrouille une grandeur (longueur, angle…) jusqu'au point suivant, ou règle un paramètre ;
 * - un `appui` sur le point précédent (double-clic, ou Entrée deux fois) termine une suite libre ; un `appui`
 *   sur le premier point la ferme ; `touche` « Backspace » retire le dernier point.
 */
import { TOLERANCES, type Commande, type EtatModele, type IdObjet, type ObjetModele } from "@parcours/atelier-model";
import type {
  Activation,
  AideOutil,
  Apercu,
  ChampSaisie,
  ContexteAtelier,
  DefinitionOutil,
  DessinPlan,
  ErreurLisible,
  EvenementPlan,
  FamilleOutil,
  FormeApercu,
  FormeDessin,
  Modificateurs,
  NiveauAffichage,
  ReactionOutil,
  RegistreDessinateurs,
  SessionOutil,
  StyleApercu,
} from "../../socle";
import { pointsDeForme } from "../dessinateurs";
import { angleDeg, distance, polaire, pt, scalaire, sous, versPoint, type Vec } from "../geometrie";
import { formaterValeur } from "../saisie";

export const SANS_MODIFICATEUR: Modificateurs = { maj: false, ctrl: false, alt: false };

/** Dépendances des outils de `plan2d`, fournies par `installer`. */
export interface DependancesOutils {
  readonly dessinateurs: Pick<RegistreDessinateurs, "pour">;
}

export const lisible = (objet: string, cause: string, action: string): ErreurLisible => ({ objet, cause, action, message: `${objet} : ${cause} — ${action}` });

// ---------------------------------------------------------------------------------------------------------------
// Activation et en-tête de création
// ---------------------------------------------------------------------------------------------------------------

/** Outil de création : modèle chargé, niveau et calque actifs. */
export function activationCreation(ctx: ContexteAtelier): Activation {
  if (!ctx.etat()) return { ok: false, motif: "le modèle n'est pas chargé" };
  if (!ctx.niveauActif()) return { ok: false, motif: "choisir d'abord un niveau actif" };
  if (!ctx.calqueActif()) return { ok: false, motif: "choisir d'abord un calque actif" };
  return { ok: true };
}

/** Outil de transformation : modèle chargé et sélection non vide. */
export function activationSelection(ctx: ContexteAtelier): Activation {
  if (!ctx.etat()) return { ok: false, motif: "le modèle n'est pas chargé" };
  if (ctx.selection.lire().ids.length === 0) return { ok: false, motif: "sélectionner d'abord au moins un objet" };
  return { ok: true };
}

export interface EnTete {
  readonly niveauId: IdObjet;
  readonly calqueId: IdObjet;
}

/** Niveau et calque actifs, lus à l'instant de l'appel. */
export function enTete(ctx: ContexteAtelier): EnTete | null {
  const niveauId = ctx.niveauActif();
  const calqueId = ctx.calqueActif();
  return niveauId && calqueId ? { niveauId, calqueId } : null;
}

/** Essai à blanc : erreurs lisibles, ou liste vide si le lot passe. */
export function controler(ctx: ContexteAtelier, commandes: readonly Commande[]): readonly ErreurLisible[] {
  const r = ctx.essayer(commandes);
  return r.ok ? [] : r.erreurs;
}

/** Fabrique une `Commande` typée par son nom (le contrôle de forme est fait par le réducteur à l'essai). */
export const commande = (type: Commande["type"], params: unknown, cibles: readonly IdObjet[] = []): Commande => ({ type, params, cibles }) as unknown as Commande;

export const longueur = (value: number) => ({ value, unit: "m" as const });
export const angle = (value: number) => ({ value, unit: "°" as const });

// ---------------------------------------------------------------------------------------------------------------
// Définition d'outil
// ---------------------------------------------------------------------------------------------------------------

export interface SpecDefinition {
  readonly id: string;
  readonly libelle: string;
  readonly famille: FamilleOutil;
  readonly niveau: NiveauAffichage;
  readonly synonymes: readonly string[];
  readonly raccourci?: string;
  readonly fiches: readonly string[];
  readonly aide: AideOutil;
  readonly activation: (ctx: ContexteAtelier) => Activation;
  readonly commencer: (ctx: ContexteAtelier) => SessionOutil;
}

export function definir(s: SpecDefinition): DefinitionOutil {
  return { vues: ["plan"], ecrit: true, ...s };
}

// ---------------------------------------------------------------------------------------------------------------
// Verrous de saisie de précision (DA-02-16)
// ---------------------------------------------------------------------------------------------------------------

export type Verrous = Readonly<Record<string, number>>;

/**
 * Point contraint par les verrous `longueur` (m) et `angle` (°) depuis `reference` : la grandeur verrouillée est
 * imposée, l'autre suit le pointeur (angle verrouillé : longueur = projection du pointeur sur la direction).
 * Les multiples de 90° sont exacts.
 */
export function contraindrePolaire(reference: Vec | null, p: Vec, v: Verrous): Vec {
  if (!reference) return p;
  const l = v.longueur;
  const a = v.angle;
  if (l === undefined && a === undefined) return p;
  const direction = a ?? (distance(reference, p) > 0 ? angleDeg(reference, p) : 0);
  let longueurEffective = l;
  if (longueurEffective === undefined) {
    const u = polaire({ x: 0, y: 0 }, 1, direction);
    longueurEffective = Math.max(0, scalaire(sous(p, reference), u));
  }
  return polaire(reference, longueurEffective, direction);
}

/** Champs « longueur, angle » du segment courant (valeur verrouillée ou mesurée). */
export function champsSegment(reference: Vec | null, curseur: Vec | null, v: Verrous): ChampSaisie[] {
  const mesureL = reference && curseur ? distance(reference, curseur) : null;
  const mesureA = reference && curseur && distance(reference, curseur) > 0 ? angleDeg(reference, curseur) : null;
  return [
    { champ: "longueur", libelle: "Longueur", unite: "m", valeur: v.longueur ?? mesureL },
    { champ: "angle", libelle: "Angle", unite: "°", valeur: v.angle ?? mesureA },
  ];
}

/** Cote d'aperçu d'un segment (longueur affichée à 2 décimales). */
export const coteSegment = (a: Vec, b: Vec): FormeApercu => ({ forme: "cote", a: versPoint(a), b: versPoint(b), texte: formaterValeur(distance(a, b), "m") });

// ---------------------------------------------------------------------------------------------------------------
// Formes d'aperçu
// ---------------------------------------------------------------------------------------------------------------

/** Forme de dessin → forme d'aperçu (les arcs deviennent des polylignes : le contrat d'aperçu n'a pas d'arc). */
export function formeApercu(f: FormeDessin, style: StyleApercu): FormeApercu | null {
  switch (f.forme) {
    case "polygone":
      return { forme: "polygone", points: f.points, style };
    case "polyligne":
      return { forme: "polyligne", points: f.points, fermee: f.fermee, style };
    case "cercle":
      return { forme: "cercle", centre: f.centre, rayon: f.rayon, style };
    case "arc":
      return { forme: "polyligne", points: pointsDeForme(f).points.map(versPoint), fermee: false, style };
    case "texte":
      return { forme: "texte", position: f.position, texte: f.texte, style };
  }
}

export function formesDeDessins(dessins: readonly DessinPlan[], style: StyleApercu): FormeApercu[] {
  return dessins.flatMap((d) => d.formes.map((f) => formeApercu(f, style)).filter((x): x is FormeApercu => x !== null));
}

/** Dessins des objets `ids` par les dessinateurs enregistrés (objets inconnus ou sans dessinateur ignorés). */
export function dessinsDe(deps: DependancesOutils, etat: EtatModele | null, ids: readonly IdObjet[]): DessinPlan[] {
  if (!etat) return [];
  const r: DessinPlan[] = [];
  for (const id of ids) {
    const o: ObjetModele | undefined = etat.objets[id];
    const d = o ? deps.dessinateurs.pour(o.classe)?.dessiner(o, etat) : null;
    if (d) r.push(d);
  }
  return r;
}

// ---------------------------------------------------------------------------------------------------------------
// Session « à points » générique
// ---------------------------------------------------------------------------------------------------------------

export interface EtatPoints {
  readonly points: readonly Vec[];
  /** Curseur contraint (point qu'un appui poserait), `null` avant le premier survol. */
  readonly curseur: Vec | null;
  /** Dernier point reçu du pointeur, avant verrous. */
  readonly brut: Vec | null;
  readonly verrous: Verrous;
  readonly parametres: Readonly<Record<string, number>>;
  readonly modificateurs: Modificateurs;
  /** Objet sous le pointeur au dernier évènement. */
  readonly sousPointeur: IdObjet | null;
}

export type ResultatGeste = { readonly label: string; readonly commandes: readonly Commande[] } | { readonly erreur: ErreurLisible };

export interface SpecPoints {
  /** Nombre de points du geste ; `"libre"` : suite terminée par double appui, fermée par appui sur le premier point. */
  readonly nombre: number | "libre";
  /** Minimum de points d'une suite libre (ouverte) ; fermée : au moins 3. */
  readonly minimum?: number;
  /** La suite libre peut-elle se fermer sur son premier point ? */
  readonly fermable?: boolean;
  /** Consigne de l'étape (nombre de points déjà posés). */
  consigne(e: EtatPoints): string;
  /** Champs de saisie proposés à l'étape. */
  champs(e: EtatPoints): readonly ChampSaisie[];
  /** Point qu'un appui poserait, compte tenu des verrous (défaut : polaire depuis le dernier point). */
  contraindre?(e: EtatPoints, brut: Vec): Vec;
  /** Formes d'aperçu (points posés + curseur). */
  formes(e: EtatPoints): readonly FormeApercu[];
  /** Champs qui sont des paramètres (gardés d'un point à l'autre) et non des verrous. */
  readonly parametres?: readonly string[];
  /** Valeurs initiales des paramètres. */
  readonly parametresInitiaux?: Readonly<Record<string, number>>;
  /** Contrôle d'une valeur de paramètre ; erreur lisible si refusée. */
  controlerParametre?(champ: string, valeur: number): ErreurLisible | null;
  /** Le geste est-il complet (défaut : `nombre` points posés) ? Les verrous de la dernière saisie sont encore là. */
  complet?(e: EtatPoints): boolean;
  /** Commandes du geste complet (`ferme` : suite libre fermée). */
  geste(e: EtatPoints, ferme: boolean): ResultatGeste;
  /** Après validation : `true` ferme l'outil, sinon le geste recommence (défaut : recommence). */
  readonly terminer?: boolean;
  /** Le premier appui peut-il être refusé (ex. il doit désigner un objet) ? Rend une erreur, ou `null`. */
  accepterAppui?(e: EtatPoints, p: Vec, evt: Extract<EvenementPlan, { readonly point: unknown }>): ErreurLisible | null;
}

const confondus = (a: Vec, b: Vec) => distance(a, b) <= TOLERANCES.tolCoincidence;

/** Mémoire des paramètres par outil (l'outil reprend les derniers paramètres saisis, DA-01-11). */
const memoireParametres = new Map<string, Readonly<Record<string, number>>>();

export function sessionPoints(ctx: ContexteAtelier, spec: SpecPoints, cleMemoire?: string): SessionOutil {
  const initiaux = (cleMemoire && memoireParametres.get(cleMemoire)) || spec.parametresInitiaux || {};
  let e: EtatPoints = { points: [], curseur: null, brut: null, verrous: {}, parametres: initiaux, modificateurs: SANS_MODIFICATEUR, sousPointeur: null };
  let erreurs: readonly ErreurLisible[] = [];
  const estParametre = (c: string) => spec.parametres?.includes(c) ?? false;
  const contraindre = (brut: Vec): Vec => (spec.contraindre ? spec.contraindre(e, brut) : contraindrePolaire(e.points.at(-1) ?? null, brut, e.verrous));

  const recommencer = () => {
    e = { ...e, points: [], verrous: {} };
  };

  /** Refus au contrôle : le dernier point d'un geste à nombre fixe est retiré pour pouvoir le reposer. */
  const refuser = (ko: readonly ErreurLisible[]): ReactionOutil => {
    erreurs = ko;
    if (spec.nombre !== "libre") e = { ...e, points: e.points.slice(0, -1), verrous: {} };
    return { action: "continuer" };
  };

  const finir = (ferme: boolean): ReactionOutil => {
    const r = spec.geste(e, ferme);
    if ("erreur" in r) return refuser([r.erreur]);
    const ko = controler(ctx, r.commandes);
    if (ko.length > 0) return refuser(ko);
    erreurs = [];
    recommencer();
    return { action: "valider", label: r.label, commandes: r.commandes, terminer: spec.terminer ?? false };
  };

  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          e = { ...e, modificateurs: evt.modificateurs, sousPointeur: evt.objetSousPointeur, brut: evt.point };
          e = { ...e, curseur: contraindre(evt.point) };
          return { action: "continuer" };
        case "appui": {
          e = { ...e, modificateurs: evt.modificateurs, sousPointeur: evt.objetSousPointeur };
          const p = contraindre(evt.point);
          const refus = spec.accepterAppui?.(e, p, evt) ?? null;
          if (refus) {
            erreurs = [refus];
            return { action: "continuer" };
          }
          erreurs = [];
          if (spec.nombre === "libre") {
            const premier = e.points[0];
            const dernier = e.points.at(-1);
            if (spec.fermable && premier && e.points.length >= 3 && confondus(p, premier)) return finir(true);
            if (dernier && confondus(p, dernier)) {
              if (e.points.length >= (spec.minimum ?? 2)) return finir(false);
              erreurs = [lisible("Tracé", "point confondu avec le précédent", "poser un point distinct")];
              return { action: "continuer" };
            }
            e = { ...e, points: [...e.points, p], verrous: {}, curseur: p };
            return { action: "continuer" };
          }
          const dernier = e.points.at(-1);
          if (dernier && confondus(p, dernier)) {
            erreurs = [lisible("Tracé", "point confondu avec le précédent", "poser un point distinct")];
            return { action: "continuer" };
          }
          e = { ...e, points: [...e.points, p], curseur: p };
          if (spec.complet ? spec.complet(e) : e.points.length >= spec.nombre) return finir(false);
          e = { ...e, verrous: {} };
          return { action: "continuer" };
        }
        case "touche":
          if (evt.touche === "Backspace" && e.points.length > 0) {
            e = { ...e, points: e.points.slice(0, -1), verrous: {} };
            erreurs = [];
          } else if (evt.touche === "Enter" && spec.nombre === "libre" && e.points.length >= (spec.minimum ?? 2)) {
            return finir(false);
          }
          return { action: "continuer" };
        case "saisie-texte":
        case "choix":
          return { action: "continuer" };
        case "saisie": {
          if (!Number.isFinite(evt.valeur)) {
            erreurs = [lisible("Saisie", "nombre attendu", "taper une valeur numérique")];
            return { action: "continuer" };
          }
          if (estParametre(evt.champ)) {
            const refus = spec.controlerParametre?.(evt.champ, evt.valeur) ?? null;
            if (refus) {
              erreurs = [refus];
              return { action: "continuer" };
            }
            e = { ...e, parametres: { ...e.parametres, [evt.champ]: evt.valeur } };
            if (cleMemoire) memoireParametres.set(cleMemoire, e.parametres);
          } else {
            if (evt.champ === "longueur" && evt.valeur < 0) {
              erreurs = [lisible("Longueur", "valeur négative", "taper une longueur positive (l'angle donne le sens)")];
              return { action: "continuer" };
            }
            e = { ...e, verrous: { ...e.verrous, [evt.champ]: evt.valeur } };
          }
          erreurs = [];
          if (e.brut) e = { ...e, curseur: contraindre(e.brut) };
          return { action: "continuer" };
        }
      }
    },
    apercu(): Apercu {
      return { formes: spec.formes(e), champs: spec.champs(e), consigne: spec.consigne(e), erreurs };
    },
    abandonner() {
      recommencer();
      erreurs = [];
    },
  };
}

/** Raccourci : le point à l'indice `i`, ou le curseur s'il n'est pas encore posé. */
export function pointOuCurseur(e: EtatPoints, i: number): Vec | null {
  return e.points[i] ?? (i === e.points.length ? e.curseur : null);
}

export const P = (v: Vec) => pt(v.x, v.y);

/** Vide la mémoire des paramètres (tests). */
export function oublierParametres(): void {
  memoireParametres.clear();
}
