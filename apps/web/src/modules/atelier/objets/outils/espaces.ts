/**
 * Espaces, zones et étages (DA-07-16, DA-07-17, DA-05-04). Aucun raccourci d'une lettre (D-037).
 *
 * - `creer.espace` → `espace.creer` : contour tracé point par point (comme la dalle) ; nom et catégorie saisis dans
 *   des champs texte (D-038), sinon « Espace n » libre du niveau ;
 * - `creer.zone` → `zone.creer` : clic sur les pièces et espaces du niveau actif pour les ajouter ou les retirer du
 *   contenu, Entrée pour créer. La zone n'a pas de tracé propre : son contour se lit dans son contenu (relations
 *   `contient`, voir `dessinerPiece`) ;
 * - `creer.niveau` → `niveau.creer` : nom, altitude, hauteur et ordre saisis, aucun n'est déduit (R3) ; Entrée crée.
 *   Activable sans niveau actif : c'est par lui qu'on crée le premier.
 */
import type { EtatModele, IdObjet, ObjetEspace, ObjetModele, ObjetPiece } from "@parcours/atelier-model";
import type { Activation, Apercu, ChampSaisie, ContexteAtelier, DefinitionOutil, ErreurLisible, EvenementPlan, ReactionOutil, SessionOutil } from "../../socle";
import { activationCreation, commande, controler, definir, enTete, lisible, longueur, P } from "../../plan2d/outils/commun";
import { pointDansPolygone, type Vec } from "../../plan2d/geometrie";
import { aireContour } from "../geometrie";
import { traceContour } from "./contour";

type Surface = ObjetPiece | ObjetEspace;

function nomLibre(etat: EtatModele | null, classe: ObjetModele["classe"], niveauId: IdObjet, prefixe: string): string {
  const pris = new Set(Object.values(etat?.objets ?? {}).flatMap((o) => (o.classe === classe && o.niveauId === niveauId && "nom" in o.params ? [String(o.params.nom)] : [])));
  let i = 1;
  while (pris.has(`${prefixe} ${i}`)) i++;
  return `${prefixe} ${i}`;
}

const champTexte = (champ: string, libelle: string): ChampSaisie => ({ champ, libelle, unite: "", valeur: null, genre: "texte" });

/** Résultat d'une validation contrôlée par `ctx.essayer`. */
function valider(ctx: ContexteAtelier, label: string, commandes: ReturnType<typeof commande>[], terminer: boolean): ReactionOutil | readonly ErreurLisible[] {
  const ko = controler(ctx, commandes);
  return ko.length > 0 ? ko : { action: "valider", label, commandes, terminer };
}

// --- Espace ----------------------------------------------------------------------------------------------------

export function sessionEspace(ctx: ContexteAtelier): SessionOutil {
  const trace = traceContour("Espace");
  let nom: string | null = null;
  let categorie: string | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  const refus = (e: readonly ErreurLisible[]): ReactionOutil => {
    erreurs = e;
    return { action: "continuer" };
  };
  const fermer = (): ReactionOutil => {
    const t = enTete(ctx);
    if (!t) return refus([lisible("Espace", "niveau ou calque actif absent", "choisir un niveau et un calque")]);
    const params = { id: ctx.nouvelId("espace"), ...t, polygones: [{ contour: trace.points().map(P), trous: [] }], nom: nom ?? nomLibre(ctx.etat(), "espace", t.niveauId, "Espace"), ...(categorie ? { categorie } : {}) };
    const r = valider(ctx, `Créer l'espace ${params.nom}`, [commande("espace.creer", params)], false);
    if (Array.isArray(r)) return refus(r);
    erreurs = [];
    trace.vider();
    nom = null;
    return r as ReactionOutil;
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          trace.survoler(evt.point);
          return { action: "continuer" };
        case "appui": {
          const r = trace.poser(evt.point);
          if (r === "ferme") return fermer();
          if (r !== "pose") return refus([r]);
          erreurs = [];
          return { action: "continuer" };
        }
        case "touche":
          if (evt.touche === "Enter" && trace.points().length >= 3) return fermer();
          if (evt.touche === "Backspace") trace.retirerDernier();
          return { action: "continuer" };
        case "saisie-texte":
          if (evt.champ === "nom") nom = evt.texte.trim() || null;
          if (evt.champ === "categorie") categorie = evt.texte.trim() || null;
          erreurs = [];
          return { action: "continuer" };
        case "choix":
          return refus([lisible("Espace", `« ${evt.valeur} » : aucun choix attendu ici`, "utiliser les champs proposés par l'outil")]);
        case "saisie": {
          const ko = Number.isFinite(evt.valeur) ? trace.verrouiller(evt.champ, evt.valeur) : lisible("Saisie", "nombre attendu", "taper une valeur numérique");
          if (ko) return refus([ko]);
          erreurs = [];
          return { action: "continuer" };
        }
      }
    },
    apercu(): Apercu {
      return {
        formes: trace.formes(erreurs.length > 0 ? "erreur" : "trace"),
        champs: [...trace.champs(), champTexte("nom", "Nom"), champTexte("categorie", "Catégorie")],
        consigne: trace.points().length === 0 ? `Cliquez le premier sommet de l'espace${nom ? ` ${nom}` : ""}.` : "Sommet suivant ; premier point ou Entrée pour fermer le contour.",
        erreurs,
      };
    },
    abandonner() {
      trace.vider();
      erreurs = [];
    },
  };
}

export function outilEspace(): DefinitionOutil {
  return definir({
    id: "creer.espace",
    libelle: "Espace",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["space", "aire", "surface libre", "dégagement"],
    fiches: ["DA-07-16"],
    aide: {
      action: "Crée un espace par son contour, sans murs qui le ferment (terrasse, dégagement, aire de jeux…).",
      conditions: "Un niveau et un calque actifs.",
      exemple: "Tapez « Terrasse » dans le champ Nom, cliquez quatre sommets, puis le premier pour fermer.",
    },
    activation: activationCreation,
    commencer: sessionEspace,
  });
}

// --- Zone ------------------------------------------------------------------------------------------------------

/** Pièce ou espace du niveau sous le point (l'objet sous le pointeur d'abord, sinon le plus petit qui contient le point). */
export function surfaceSousPoint(etat: EtatModele, niveauId: IdObjet, p: Vec, dessous: IdObjet | null): Surface | null {
  const d = dessous ? etat.objets[dessous] : undefined;
  if ((d?.classe === "piece" || d?.classe === "espace") && d.niveauId === niveauId) return d;
  const aire = (x: Surface) => Math.min(...x.params.polygones.map((q) => aireContour(q.contour)));
  let r: Surface | null = null;
  for (const o of Object.values(etat.objets)) {
    if ((o.classe !== "piece" && o.classe !== "espace") || o.niveauId !== niveauId) continue;
    if (!o.params.polygones.some((q) => pointDansPolygone(p, q.contour))) continue;
    if (!r || aire(o) < aire(r)) r = o;
  }
  return r;
}

export function sessionZone(ctx: ContexteAtelier): SessionOutil {
  let contenu: IdObjet[] = [];
  let survolee: Surface | null = null;
  let nom: string | null = null;
  let erreurs: readonly ErreurLisible[] = [];
  const refus = (e: readonly ErreurLisible[]): ReactionOutil => {
    erreurs = e;
    return { action: "continuer" };
  };
  const viser = (p: Vec, dessous: IdObjet | null) => {
    const etat = ctx.etat();
    const niveau = ctx.niveauActif();
    survolee = etat && niveau ? surfaceSousPoint(etat, niveau, p, dessous) : null;
  };
  const creer = (): ReactionOutil => {
    const t = enTete(ctx);
    if (!t) return refus([lisible("Zone", "niveau ou calque actif absent", "choisir un niveau et un calque")]);
    if (contenu.length === 0) return refus([lisible("Zone", "aucune pièce ni aucun espace choisi", "cliquer les pièces ou espaces à regrouper, puis Entrée")]);
    const params = { id: ctx.nouvelId("zone"), ...t, polygones: [], nom: nom ?? nomLibre(ctx.etat(), "zone", t.niveauId, "Zone"), contenu };
    const r = valider(ctx, `Créer la zone ${params.nom}`, [commande("zone.creer", params)], false);
    if (Array.isArray(r)) return refus(r);
    contenu = [];
    nom = null;
    erreurs = [];
    return r as ReactionOutil;
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          viser(evt.point, evt.objetSousPointeur);
          return { action: "continuer" };
        case "appui": {
          viser(evt.point, evt.objetSousPointeur);
          const s = survolee as Surface | null;
          if (!s) return refus([lisible("Zone", "aucune pièce ni aucun espace sous le pointeur", "cliquer à l'intérieur d'une pièce ou d'un espace du niveau actif")]);
          contenu = contenu.includes(s.id) ? contenu.filter((x) => x !== s.id) : [...contenu, s.id];
          erreurs = [];
          return { action: "continuer" };
        }
        case "touche":
          if (evt.touche === "Enter") return creer();
          if (evt.touche === "Backspace") contenu = contenu.slice(0, -1);
          return { action: "continuer" };
        case "saisie-texte":
          if (evt.champ === "nom") nom = evt.texte.trim() || null;
          erreurs = [];
          return { action: "continuer" };
        case "choix":
        case "saisie":
          return refus([lisible("Zone", "aucune valeur numérique ni aucun choix attendu", "utiliser le champ « Nom »")]);
      }
    },
    apercu(): Apercu {
      const s = survolee as Surface | null;
      const formes: Apercu["formes"][number][] = [];
      if (contenu.length > 0) formes.push({ forme: "surligner", ids: contenu, style: erreurs.length > 0 ? "erreur" : "trace" });
      if (s && !contenu.includes(s.id)) formes.push({ forme: "surligner", ids: [s.id], style: "fantome" });
      const etat = ctx.etat();
      const noms = contenu.map((id) => {
        const o = etat?.objets[id];
        return o && "nom" in o.params ? String(o.params.nom) : id;
      });
      return {
        formes,
        champs: [champTexte("nom", "Nom")],
        consigne: contenu.length === 0 ? "Cliquez les pièces ou espaces à regrouper dans la zone." : `Contenu : ${noms.join(", ")}. Clic pour ajouter ou retirer, Entrée pour créer la zone.`,
        erreurs,
      };
    },
    abandonner() {
      contenu = [];
      survolee = null;
      erreurs = [];
    },
  };
}

export function outilZone(): DefinitionOutil {
  return definir({
    id: "creer.zone",
    libelle: "Zone",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["zone", "regroupement", "logement", "secteur", "unité"],
    fiches: ["DA-07-17"],
    aide: {
      action: "Regroupe des pièces et des espaces du niveau dans une zone (logement, secteur, compartiment…).",
      conditions: "Un niveau et un calque actifs ; des pièces ou des espaces sur ce niveau.",
      exemple: "Tapez « Logement A » dans le champ Nom, cliquez les pièces du logement, puis Entrée.",
    },
    activation: activationCreation,
    commencer: sessionZone,
  });
}

// --- Niveau ----------------------------------------------------------------------------------------------------

const CHAMPS_NIVEAU = [
  { champ: "elevation", libelle: "Altitude (zéro du projet)" },
  { champ: "hauteur", libelle: "Hauteur d'étage" },
  { champ: "ordre", libelle: "Ordre" },
] as const;

export function sessionNiveau(ctx: ContexteAtelier): SessionOutil {
  let nom: string | null = null;
  let nombres: Partial<Record<(typeof CHAMPS_NIVEAU)[number]["champ"], number>> = {};
  let erreurs: readonly ErreurLisible[] = [];
  const refus = (e: readonly ErreurLisible[]): ReactionOutil => {
    erreurs = e;
    return { action: "continuer" };
  };
  const creer = (): ReactionOutil => {
    if (!nom) return refus([lisible("Niveau", "nom non renseigné", "taper le nom dans le champ « Nom »")]);
    for (const c of CHAMPS_NIVEAU) if (nombres[c.champ] === undefined) return refus([lisible("Niveau", `${c.libelle.toLowerCase()} non renseigné(e)`, `taper la valeur dans le champ « ${c.libelle} »`)]);
    const { elevation, hauteur, ordre } = nombres as Record<(typeof CHAMPS_NIVEAU)[number]["champ"], number>;
    const r = valider(ctx, `Créer le niveau ${nom}`, [commande("niveau.creer", { id: ctx.nouvelId("niveau"), nom, elevation: longueur(elevation), hauteur: longueur(hauteur), ordre })], true);
    if (Array.isArray(r)) return refus(r);
    erreurs = [];
    return r as ReactionOutil;
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "touche":
          return evt.touche === "Enter" ? creer() : { action: "continuer" };
        case "saisie-texte":
          if (evt.champ === "nom") nom = evt.texte.trim() || null;
          erreurs = [];
          return { action: "continuer" };
        case "saisie": {
          if (!CHAMPS_NIVEAU.some((c) => c.champ === evt.champ)) return refus([lisible("Niveau", `champ « ${evt.champ} » inconnu`, "utiliser les champs proposés")]);
          const champ = evt.champ as (typeof CHAMPS_NIVEAU)[number]["champ"];
          if (!Number.isFinite(evt.valeur)) return refus([lisible("Saisie", "nombre attendu", "taper une valeur numérique")]);
          if (champ === "hauteur" && !(evt.valeur > 0)) return refus([lisible("Niveau", `hauteur ${evt.valeur} m : doit être strictement positive`, "taper une valeur supérieure à 0")]);
          if (champ === "ordre" && !(Number.isInteger(evt.valeur) && evt.valeur >= 0)) return refus([lisible("Niveau", `ordre ${evt.valeur} : entier positif ou nul attendu`, "taper un entier (0 pour le plus bas)")]);
          nombres = { ...nombres, [champ]: evt.valeur };
          erreurs = [];
          return { action: "continuer" };
        }
        case "choix":
          return refus([lisible("Niveau", `« ${evt.valeur} » : aucun choix attendu ici`, "utiliser les champs proposés")]);
        default:
          return { action: "continuer" };
      }
    },
    apercu(): Apercu {
      const champs: ChampSaisie[] = [champTexte("nom", "Nom"), ...CHAMPS_NIVEAU.map((c) => ({ champ: c.champ, libelle: c.libelle, unite: c.champ === "ordre" ? ("" as const) : ("m" as const), valeur: nombres[c.champ] ?? null }))];
      return { formes: [], champs, consigne: "Saisissez le nom, l'altitude, la hauteur et l'ordre du niveau, puis Entrée.", erreurs };
    },
    abandonner() {
      erreurs = [];
    },
  };
}

function activationNiveau(ctx: ContexteAtelier): Activation {
  return ctx.etat() ? { ok: true } : { ok: false, motif: "le modèle n'est pas chargé" };
}

export function outilNiveau(): DefinitionOutil {
  return definir({
    id: "creer.niveau",
    libelle: "Niveau",
    famille: "creer",
    niveau: "contextuel",
    synonymes: ["étage", "level", "storey", "plancher", "sous-sol"],
    fiches: ["DA-05-04"],
    aide: {
      action: "Crée un niveau (étage) avec son altitude, sa hauteur et son ordre.",
      conditions: "Un modèle chargé ; un ordre libre.",
      exemple: "Tapez « Étage 1 », 3 (altitude), 2,8 (hauteur), 1 (ordre), puis Entrée.",
    },
    activation: activationNiveau,
    commencer: sessionNiveau,
  });
}
