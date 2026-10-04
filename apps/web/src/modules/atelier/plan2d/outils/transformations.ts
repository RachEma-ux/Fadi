/**
 * Transformations (famille « Modifier ») sur la sélection, avec aperçu fantôme : DA-02-01 déplacer, -02 copier,
 * -03 tourner, -04 miroir, -05 échelle (uniforme), -06 étirer, -07 ajuster, -08 prolonger, -09 décaler,
 * -12 répéter (linéaire), -13 décomposer, -14 points de contrôle. Chaque outil rend la commande `transformer.*`
 * du contrat ; les identifiants des objets créés (`nouveauxIds`) sont tirés au moment du geste par
 * `ctx.nouvelId`, et les **mêmes** servent à l'essai et à la validation.
 *
 * Sans commande dans `atelier-commands/1` (non inventées, listées au rapport) : DA-02-10 raccorder, DA-02-11
 * chanfreiner, réseaux polaire et en grille de DA-02-12, échelle non uniforme de DA-02-05.
 */
import { CLASSES_BAIE, TOLERANCES, type EtatModele, type IdObjet, type ObjetModele, type PointLocal } from "@parcours/atelier-model";
import type { ChampSaisie, ContexteAtelier, DefinitionOutil, DessinPlan, ErreurLisible, EvenementPlan, FormeApercu, ReactionOutil, SessionOutil } from "../../socle";
import { lasso } from "../choix";
import { transformerDessin } from "../dessinateurs";
import { angleDeg, cosSinDeg, distance, distanceSegment, sous, versPoint, type Vec } from "../geometrie";
import { formaterValeur } from "../saisie";
import {
  activationSelection,
  champsSegment,
  commande,
  controler,
  coteSegment,
  definir,
  dessinsDe,
  formesDeDessins,
  lisible,
  longueur,
  angle as angleG,
  P,
  sessionPoints,
  type DependancesOutils,
  type EtatPoints,
} from "./commun";

/** Nombre maximal d'objets dessinés en fantôme (au-delà : contour d'emprise seulement). */
export const FANTOMES_MAX = 400;

const vecteur = (a: Vec, b: Vec) => ({ dx: b.x - a.x, dy: b.y - a.y, unit: "m" as const });

/** Sélection courante, complétée des baies hébergées par les murs sélectionnés (elles suivent leur mur). */
export function selectionAvecBaies(etat: EtatModele | null, ids: readonly IdObjet[]): IdObjet[] {
  if (!etat) return [...ids];
  const murs = new Set(ids.filter((id) => etat.objets[id]?.classe === "mur"));
  const r = [...ids];
  if (murs.size === 0) return r;
  for (const o of Object.values(etat.objets)) {
    if ((CLASSES_BAIE as readonly string[]).includes(o.classe) && murs.has((o.params as { murHoteId?: string }).murHoteId ?? "") && !r.includes(o.id)) r.push(o.id);
  }
  return r;
}

/** Identifiants neufs, un par objet créé, préfixés par la classe de l'objet source. */
function nouveauxIds(ctx: ContexteAtelier, etat: EtatModele | null, sources: readonly IdObjet[]): IdObjet[] {
  return sources.map((id) => ctx.nouvelId((etat?.objets[id]?.classe ?? "objet").replace(/\./g, "-")));
}

/** Image d'une transformation affine décrite par fonctions (point, angle, retournement, facteur). */
interface Image {
  readonly point: (p: Vec) => Vec;
  readonly angle?: (a: number) => number;
  readonly retourne?: boolean;
  readonly facteur?: number;
}

const translation = (dx: number, dy: number): Image => ({ point: (p) => ({ x: p.x + dx, y: p.y + dy }) });
const rotation = (c: Vec, deg: number): Image => {
  const [co, si] = cosSinDeg(deg);
  return { point: (p) => ({ x: c.x + (p.x - c.x) * co - (p.y - c.y) * si, y: c.y + (p.x - c.x) * si + (p.y - c.y) * co }), angle: (a) => a + deg };
};
const symetrie = (a: Vec, b: Vec): Image => {
  const d = sous(b, a);
  const l2 = d.x * d.x + d.y * d.y;
  const theta = angleDeg(a, b);
  return {
    point: (p) => {
      const t = ((p.x - a.x) * d.x + (p.y - a.y) * d.y) / l2;
      const q = { x: a.x + d.x * t, y: a.y + d.y * t };
      return { x: 2 * q.x - p.x, y: 2 * q.y - p.y };
    },
    angle: (x) => 2 * theta - x,
    retourne: true,
  };
};
const homothetie = (c: Vec, f: number): Image => ({ point: (p) => ({ x: c.x + (p.x - c.x) * f, y: c.y + (p.y - c.y) * f }), facteur: f });

/** Formes fantômes de la sélection transformée (aperçu local, sans écrire). */
function fantomes(dessins: readonly DessinPlan[], image: Image | null): FormeApercu[] {
  if (!image) return [];
  const d = dessins.slice(0, FANTOMES_MAX).map((x) => transformerDessin(x, image.point, image.angle, image.retourne, image.facteur));
  return formesDeDessins(d, "fantome");
}

/** Spécification commune d'une transformation à deux points (base, cible) de la sélection. */
interface SpecTransfo {
  readonly id: string;
  readonly libelle: string;
  readonly synonymes: readonly string[];
  readonly fiches: readonly string[];
  readonly aide: DefinitionOutil["aide"];
  readonly niveau: DefinitionOutil["niveau"];
  readonly consignes: readonly string[];
}

function surSelection(deps: DependancesOutils, ctx: ContexteAtelier) {
  const ids = ctx.selection.lire().ids;
  const dessins = dessinsDe(deps, ctx.etat(), ids);
  return { ids, dessins };
}

// ---------------------------------------------------------------------------------------------------------------
// Déplacer, copier (DA-02-01, DA-02-02 ; Ctrl au second point de « Déplacer » : copie, DA-02-17)
// ---------------------------------------------------------------------------------------------------------------

function outilVecteur(deps: DependancesOutils, s: SpecTransfo, copieParDefaut: boolean): DefinitionOutil {
  return definir({
    id: s.id,
    libelle: s.libelle,
    famille: "modifier",
    niveau: s.niveau,
    synonymes: s.synonymes,
    fiches: s.fiches,
    aide: s.aide,
    activation: activationSelection,
    commencer: (ctx) => {
      const sel = surSelection(deps, ctx);
      return sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => s.consignes[e.points.length] ?? "",
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous)),
        formes: (e) => {
          const a = e.points[0];
          const b = e.curseur;
          if (!a || !b) return [];
          return [...fantomes(sel.dessins, translation(b.x - a.x, b.y - a.y)), { forme: "segment", a: versPoint(a), b: versPoint(b), style: "trace" }, coteSegment(a, b)];
        },
        geste: (e) => {
          const [a, b] = e.points as [Vec, Vec];
          const copie = copieParDefaut || e.modificateurs.ctrl;
          const n = sel.ids.length;
          if (!copie) return { label: `Déplacer ${n} objet${n > 1 ? "s" : ""}`, commandes: [commande("transformer.deplacer", { vecteur: vecteur(a, b) }, sel.ids)] };
          const cibles = selectionAvecBaies(ctx.etat(), sel.ids);
          return { label: `Copier ${cibles.length} objet${cibles.length > 1 ? "s" : ""}`, commandes: [commande("transformer.copier", { vecteur: vecteur(a, b), nouveauxIds: nouveauxIds(ctx, ctx.etat(), cibles) }, cibles)] };
        },
        terminer: !copieParDefaut,
      });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Tourner (DA-02-03), miroir (DA-02-04), échelle (DA-02-05)
// ---------------------------------------------------------------------------------------------------------------

export function outilTourner(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.tourner",
    libelle: "Tourner",
    famille: "modifier",
    niveau: "essentiel",
    synonymes: ["rotate", "pivoter", "rotation"],
    fiches: ["DA-02-03"],
    aide: { action: "Tourne la sélection autour d'un centre ; l'angle se mesure depuis l'axe +x.", conditions: "Une sélection non vide.", exemple: "Cliquez le centre, tapez 90 puis Entrée : quart de tour." },
    activation: activationSelection,
    commencer: (ctx) => {
      const sel = surSelection(deps, ctx);
      const angleDe = (e: EtatPoints) => {
        const c = e.points[0];
        const b = e.points[1] ?? e.curseur;
        return c && b && distance(c, b) > 0 ? (e.verrous.angle ?? angleDeg(c, b)) : null;
      };
      return sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le centre de rotation." : "Cliquez la direction (angle depuis +x), ou tapez l'angle en degrés."),
        champs: (e) => (e.points.length === 0 ? [] : [{ champ: "angle", libelle: "Angle", unite: "°", valeur: angleDe(e) }]),
        formes: (e) => {
          const c = e.points[0];
          const a = angleDe(e);
          if (!c || a === null || !e.curseur) return [];
          return [...fantomes(sel.dessins, rotation(c, a)), { forme: "segment", a: versPoint(c), b: versPoint(e.curseur), style: "trace" }, { forme: "texte", position: versPoint(e.curseur), texte: formaterValeur(a, "°"), style: "cote" }];
        },
        geste: (e) => {
          const c = e.points[0] as Vec;
          const a = angleDe(e);
          if (a === null) return { erreur: lisible("Rotation", "direction confondue avec le centre", "cliquer un autre point") };
          return { label: `Tourner ${sel.ids.length} objet(s)`, commandes: [commande("transformer.tourner", { centre: P(c), angle: angleG(a) }, sel.ids)] };
        },
        terminer: true,
      });
    },
  });
}

export function outilMiroir(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.miroir",
    libelle: "Miroir",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ["mirror", "symétrie", "symetriser"],
    fiches: ["DA-02-04"],
    aide: { action: "Crée le symétrique de la sélection par rapport à un axe (Ctrl au second point : garder l'original).", conditions: "Une sélection non vide.", exemple: "Cliquez deux points de l'axe ; Ctrl maintenu : copie symétrique." },
    activation: activationSelection,
    commencer: (ctx) => {
      const sel = surSelection(deps, ctx);
      return sessionPoints(ctx, {
        nombre: 2,
        consigne: (e) => (e.points.length === 0 ? "Cliquez le premier point de l'axe de symétrie." : "Cliquez le second point de l'axe (Ctrl : garder l'original)."),
        champs: (e) => (e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous).filter((c) => c.champ === "angle")),
        formes: (e) => {
          const a = e.points[0];
          const b = e.curseur;
          if (!a || !b || distance(a, b) === 0) return [];
          return [...fantomes(sel.dessins, symetrie(a, b)), { forme: "segment", a: versPoint(a), b: versPoint(b), style: "cote" }];
        },
        geste: (e) => {
          const [a, b] = e.points as [Vec, Vec];
          const axe = { a: P(a), b: P(b) };
          if (!e.modificateurs.ctrl) return { label: `Miroir de ${sel.ids.length} objet(s)`, commandes: [commande("transformer.miroir", { axe, conserverOriginal: false }, sel.ids)] };
          const cibles = selectionAvecBaies(ctx.etat(), sel.ids);
          return { label: `Copie symétrique de ${cibles.length} objet(s)`, commandes: [commande("transformer.miroir", { axe, conserverOriginal: true, nouveauxIds: nouveauxIds(ctx, ctx.etat(), cibles) }, cibles)] };
        },
        terminer: true,
      });
    },
  });
}

export function outilEchelle(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.echelle",
    libelle: "Échelle",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ["scale", "mise à l'échelle", "homothétie", "agrandir", "réduire"],
    fiches: ["DA-02-05"],
    aide: { action: "Met la sélection à l'échelle autour d'un centre ; épaisseurs, hauteurs et ouvertures conservées (D-014).", conditions: "Une sélection non vide.", exemple: "Cliquez le centre, tapez 2 puis Entrée : facteur 2." },
    activation: activationSelection,
    commencer: (ctx) => {
      const sel = surSelection(deps, ctx);
      const facteurDe = (e: EtatPoints): number | null => {
        if (e.verrous.facteur !== undefined) return e.verrous.facteur;
        const [c, r] = e.points;
        const b = e.points[2] ?? e.curseur;
        return c && r && b && distance(c, r) > 0 ? distance(c, b) / distance(c, r) : null;
      };
      return sessionPoints(ctx, {
        nombre: 3,
        complet: (e) => e.points.length === 3 || (e.points.length === 2 && e.verrous.facteur !== undefined),
        consigne: (e) => ["Cliquez le centre de l'échelle.", "Cliquez un point de référence, ou tapez le facteur.", "Cliquez la nouvelle position du point de référence."][e.points.length] ?? "",
        champs: (e) => (e.points.length === 0 ? [] : [{ champ: "facteur", libelle: "Facteur", unite: "", valeur: facteurDe(e) }]),
        formes: (e) => {
          const c = e.points[0];
          const f = facteurDe(e);
          if (!c || f === null || !(f > 0)) return [];
          return [...fantomes(sel.dessins, homothetie(c, f)), { forme: "texte", position: versPoint(e.curseur ?? c), texte: `× ${formaterValeur(f, "")} · épaisseurs, hauteurs et ouvertures conservées`, style: "cote" }];
        },
        geste: (e) => {
          const f = facteurDe(e);
          if (f === null) return { erreur: lisible("Mise à l'échelle", "facteur indéterminé", "taper le facteur ou cliquer un point de référence distinct du centre") };
          return { label: `Mettre à l'échelle ${sel.ids.length} objet(s)`, commandes: [commande("transformer.echelle", { centre: P(e.points[0] as Vec), facteur: f }, sel.ids)] };
        },
        terminer: true,
      });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Étirer (DA-02-06)
// ---------------------------------------------------------------------------------------------------------------

function dessinsDuNiveau(deps: DependancesOutils, ctx: ContexteAtelier): DessinPlan[] {
  const etat = ctx.etat();
  const niveau = ctx.niveauActif();
  if (!etat || !niveau) return [];
  return dessinsDe(
    deps,
    etat,
    Object.values(etat.objets)
      .filter((o) => o.niveauId === niveau)
      .map((o) => o.id),
  );
}

export function outilEtirer(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.etirer",
    libelle: "Étirer",
    famille: "modifier",
    niveau: "complet",
    synonymes: ["stretch", "allonger", "étirement"],
    fiches: ["DA-02-06"],
    aide: { action: "Déplace les sommets compris dans une fenêtre ; sans sélection, les objets touchés par la fenêtre.", conditions: "Un modèle chargé et un niveau actif.", exemple: "Tracez la fenêtre autour d'une extrémité de mur, puis le vecteur : le mur s'allonge." },
    activation: (ctx) => (ctx.etat() && ctx.niveauActif() ? { ok: true } : { ok: false, motif: "choisir d'abord un niveau actif" }),
    commencer: (ctx) => {
      const fenetreDe = (a: Vec, b: Vec): Vec[] => [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }];
      const ciblesDe = (a: Vec, b: Vec): IdObjet[] => {
        const sel = ctx.selection.lire().ids;
        if (sel.length > 0) return [...sel];
        const etat = ctx.etat();
        return lasso(dessinsDuNiveau(deps, ctx), b, a).filter((id) => {
          const c = etat?.objets[id]?.classe ?? "";
          return !(CLASSES_BAIE as readonly string[]).includes(c);
        });
      };
      return sessionPoints(ctx, {
        nombre: 4,
        consigne: (e) => ["Cliquez un coin de la fenêtre de capture.", "Cliquez le coin opposé.", "Cliquez le point de base.", "Cliquez la destination, ou tapez longueur et angle."][e.points.length] ?? "",
        champs: (e) => (e.points.length < 3 ? [] : champsSegment(e.points[2] ?? null, e.curseur, e.verrous)),
        formes: (e) => {
          const [a, b, base] = e.points;
          const c = e.curseur;
          const f: FormeApercu[] = [];
          const coin = b ?? c;
          if (a && coin) f.push({ forme: "polygone", points: fenetreDe(a, coin).map(versPoint), style: "cote" });
          if (a && b && base && c) {
            const dx = c.x - base.x;
            const dy = c.y - base.y;
            const dessins = dessinsDe(deps, ctx.etat(), ciblesDe(a, b));
            const dedans = (p: Vec) => p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
            f.push(...fantomes(dessins, { point: (p) => (dedans(p) ? { x: p.x + dx, y: p.y + dy } : p) }), { forme: "segment", a: versPoint(base), b: versPoint(c), style: "trace" }, coteSegment(base, c));
          }
          return f;
        },
        geste: (e) => {
          const [a, b, base, dest] = e.points as [Vec, Vec, Vec, Vec];
          const cibles = ciblesDe(a, b);
          if (cibles.length === 0) return { erreur: lisible("Étirement", "aucun objet dans la fenêtre", "agrandir la fenêtre ou sélectionner les objets") };
          return { label: `Étirer ${cibles.length} objet(s)`, commandes: [commande("transformer.etirer", { fenetre: fenetreDe(a, b).map(P), vecteur: vecteur(base, dest) }, cibles)] };
        },
        terminer: true,
      });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Ajuster, prolonger (DA-02-07, DA-02-08)
// ---------------------------------------------------------------------------------------------------------------

/** Classes acceptées comme cible par `transformer.ajuster` / `.prolonger` (réducteur). */
export const CIBLES_AJUSTER = ["mur", "esquisse.ligne"] as const;
/** Classes qui fournissent une arête limite (réducteur, `segmentsLimite`). */
export const CLASSES_LIMITE = ["mur", "esquisse.ligne", "esquisse.polyligne", "esquisse.construction", "esquisse.rectangle", "dalle", "toiture", "solide", "esquisse.hachure"] as const;

function outilLimite(nature: "ajuster" | "prolonger"): DefinitionOutil {
  const ajuster = nature === "ajuster";
  return definir({
    id: `modifier.${nature}`,
    libelle: ajuster ? "Ajuster" : "Prolonger",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ajuster ? ["trim", "couper", "ajuster"] : ["extend", "allonger jusqu'à", "prolonger"],
    fiches: [ajuster ? "DA-02-07" : "DA-02-08"],
    aide: ajuster
      ? { action: "Coupe une ligne ou un mur à ses limites : la partie désignée disparaît.", conditions: "Des limites sélectionnées (sinon : tous les tracés du niveau).", exemple: "Sélectionnez la limite, lancez Ajuster, cliquez la partie à couper." }
      : { action: "Allonge une ligne ou un mur jusqu'à la première limite rencontrée.", conditions: "Des limites sélectionnées (sinon : tous les tracés du niveau).", exemple: "Sélectionnez la limite, lancez Prolonger, cliquez près de l'extrémité à allonger." },
    activation: (ctx) => (ctx.etat() && ctx.niveauActif() ? { ok: true } : { ok: false, motif: "choisir d'abord un niveau actif" }),
    commencer: (ctx) => {
      const limitesPour = (cible: IdObjet): IdObjet[] => {
        const etat = ctx.etat();
        if (!etat) return [];
        const sel = ctx.selection.lire().ids.filter((id) => id !== cible);
        const source = sel.length > 0 ? sel : Object.values(etat.objets).filter((o) => o.niveauId === etat.objets[cible]?.niveauId).map((o) => o.id);
        return source.filter((id) => id !== cible && (CLASSES_LIMITE as readonly string[]).includes(etat.objets[id]?.classe ?? ""));
      };
      const cibleValide = (id: IdObjet | null): id is IdObjet => id !== null && (CIBLES_AJUSTER as readonly string[]).includes(ctx.etat()?.objets[id]?.classe ?? "");
      return sessionPoints(ctx, {
        nombre: 1,
        contraindre: (_e, brut) => brut,
        consigne: () => (ajuster ? "Cliquez la partie de ligne ou de mur à couper." : "Cliquez près de l'extrémité à prolonger."),
        champs: () => [],
        accepterAppui: (e) => (cibleValide(e.sousPointeur) ? null : lisible(ajuster ? "Ajuster" : "Prolonger", "aucune ligne ni aucun mur sous le pointeur", "cliquer une ligne d'esquisse ou un mur")),
        formes: (e) => (cibleValide(e.sousPointeur) ? [{ forme: "surligner", ids: [e.sousPointeur], style: ajuster ? "erreur" : "trace" }, { forme: "surligner", ids: limitesPour(e.sousPointeur).slice(0, FANTOMES_MAX), style: "cote" }] : []),
        geste: (e) => {
          const cible = e.sousPointeur as IdObjet;
          return { label: ajuster ? "Ajuster" : "Prolonger", commandes: [commande(`transformer.${nature}`, { limiteIds: limitesPour(cible), pointChoix: P(e.points[0] as Vec) }, [cible])] };
        },
      });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Décaler (DA-02-09)
// ---------------------------------------------------------------------------------------------------------------

export const CLASSES_DECALER = ["mur", "esquisse.ligne", "esquisse.polyligne", "esquisse.cercle", "esquisse.arc", "esquisse.rectangle"] as const;

export function outilDecaler(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.decaler",
    libelle: "Décaler",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ["offset", "parallèle", "décalage"],
    fiches: ["DA-02-09"],
    aide: { action: "Crée une copie parallèle à une distance donnée, du côté désigné.", conditions: "Une ligne, polyligne, cercle, arc, rectangle ou mur (sélectionné ou désigné).", exemple: "Tapez 0,5 puis cliquez le côté : copie à 0,50 m." },
    activation: (ctx) => (ctx.etat() ? { ok: true } : { ok: false, motif: "le modèle n'est pas chargé" }),
    commencer: (ctx) => {
      const selection = () => ctx.selection.lire().ids;
      let designe: IdObjet | null = null;
      const ciblesCourantes = (e: EtatPoints): IdObjet[] => (selection().length > 0 ? [...selection()] : designe && e.points.length > 0 ? [designe] : []);
      const distanceDe = (e: EtatPoints, cote: Vec | null): number | null => {
        if (e.verrous.distance !== undefined) return e.verrous.distance;
        if (e.parametres.distance !== undefined) return e.parametres.distance;
        if (!cote) return null;
        const d = dessinsDe(deps, ctx.etat(), ciblesCourantes(e))[0];
        if (!d) return null;
        let m = Infinity;
        for (const s of d.segments) m = Math.min(m, distanceSegment(s, cote));
        for (const f of d.formes) if (f.forme === "cercle" || f.forme === "arc") m = Math.min(m, Math.abs(distance(f.centre, cote) - f.rayon));
        return Number.isFinite(m) ? m : null;
      };
      return sessionPoints(
        ctx,
        {
          nombre: 2,
          parametres: ["distance"],
          controlerParametre: (_c, v) => (v >= TOLERANCES.longueurMin ? null : lisible("Décalage", `distance ${v} m`, `taper au moins ${TOLERANCES.longueurMin} m`)),
          complet: (e) => e.points.length === (selection().length > 0 ? 1 : 2),
          contraindre: (_e, brut) => brut,
          accepterAppui: (e) => {
            if (selection().length > 0 || e.points.length > 0) return null;
            const o = e.sousPointeur ? ctx.etat()?.objets[e.sousPointeur] : undefined;
            if (!o || !(CLASSES_DECALER as readonly string[]).includes(o.classe)) return lisible("Décalage", "aucun objet décalable sous le pointeur", "cliquer une ligne, polyligne, cercle, arc, rectangle ou mur");
            designe = o.id;
            return null;
          },
          consigne: (e) => (selection().length === 0 && e.points.length === 0 ? "Cliquez l'objet à décaler (tapez d'abord la distance pour la fixer)." : "Cliquez le côté du décalage."),
          champs: (e) => [{ champ: "distance", libelle: "Distance", unite: "m", valeur: distanceDe(e, e.curseur) }],
          formes: (e) => {
            const ids = ciblesCourantes(e);
            const d = distanceDe(e, e.curseur);
            const f: FormeApercu[] = [{ forme: "surligner", ids, style: "trace" }];
            if (d !== null && e.curseur) f.push({ forme: "texte", position: versPoint(e.curseur), texte: formaterValeur(d, "m"), style: "cote" });
            return f;
          },
          geste: (e) => {
            const ids = ciblesCourantes(e);
            const cote = e.points.at(-1) as Vec;
            const d = distanceDe(e, cote);
            if (ids.length === 0) return { erreur: lisible("Décalage", "aucun objet à décaler", "sélectionner ou désigner un objet") };
            if (d === null) return { erreur: lisible("Décalage", "distance indéterminée", "taper la distance") };
            return { label: "Décaler", commandes: [commande("transformer.decaler", { distance: longueur(d), cote: P(cote), nouveauxIds: nouveauxIds(ctx, ctx.etat(), ids) }, ids)] };
          },
        },
        "modifier.decaler",
      );
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Répéter (DA-02-12, réseau linéaire seulement)
// ---------------------------------------------------------------------------------------------------------------

export function outilRepeter(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.repeter",
    libelle: "Répéter",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ["array", "réseau", "trame", "pattern", "répétition"],
    fiches: ["DA-02-12"],
    aide: { action: "Répète la sélection en ligne : n copies au pas du vecteur.", conditions: "Une sélection non vide.", exemple: "Tapez 4 (copies), Tab, puis cliquez la base et le pas." },
    activation: activationSelection,
    commencer: (ctx) => {
      const sel = surSelection(deps, ctx);
      const nombreDe = (e: EtatPoints) => e.parametres.nombre ?? 2;
      return sessionPoints(
        ctx,
        {
          nombre: 2,
          parametres: ["nombre"],
          parametresInitiaux: { nombre: 2 },
          controlerParametre: (_c, v) => (Number.isInteger(v) && v >= 1 && v * sel.ids.length <= TOLERANCES.copiesMax ? null : lisible("Répétition", `${v} copie(s)`, `taper un entier de 1 à ${Math.floor(TOLERANCES.copiesMax / Math.max(1, sel.ids.length))}`)),
          consigne: (e) => (e.points.length === 0 ? "Cliquez le point de base." : "Cliquez le pas de la répétition, ou tapez longueur et angle."),
          champs: (e): ChampSaisie[] => [{ champ: "nombre", libelle: "Copies", unite: "", valeur: nombreDe(e) }, ...(e.points.length === 0 ? [] : champsSegment(e.points[0] ?? null, e.curseur, e.verrous))],
          formes: (e) => {
            const a = e.points[0];
            const b = e.curseur;
            if (!a || !b) return [];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const n = Math.min(nombreDe(e), 50);
            return [...Array.from({ length: n }, (_, k) => fantomes(sel.dessins, translation(dx * (k + 1), dy * (k + 1)))).flat(), coteSegment(a, b)];
          },
          geste: (e) => {
            const [a, b] = e.points as [Vec, Vec];
            const n = nombreDe(e);
            const cibles = selectionAvecBaies(ctx.etat(), sel.ids);
            const ids = Array.from({ length: n }, () => nouveauxIds(ctx, ctx.etat(), cibles)).flat();
            return { label: `Répéter ${cibles.length} objet(s) × ${n}`, commandes: [commande("transformer.repeter", { nombre: n, vecteur: vecteur(a, b), nouveauxIds: ids }, cibles)] };
          },
          terminer: true,
        },
        "modifier.repeter",
      );
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Décomposer (DA-02-13)
// ---------------------------------------------------------------------------------------------------------------

/** Nombre de lignes produites par la décomposition (réducteur : polyligne et rectangle seulement). */
export function segmentsDecomposes(o: ObjetModele): number | null {
  if (o.classe === "esquisse.polyligne") return o.params.ferme ? o.params.points.length : o.params.points.length - 1;
  if (o.classe === "esquisse.rectangle") return 4;
  return null;
}

/** Pertes annoncées avant accord (DA-02-13) : paramètres qui disparaissent. */
export function pertesDecomposition(o: ObjetModele): string {
  return o.classe === "esquisse.rectangle" ? "largeur, profondeur et angle du rectangle" : o.classe === "esquisse.polyligne" ? (o.params.ferme ? "fermeture et identité du contour" : "identité de la polyligne") : "";
}

export function outilDecomposer(deps: DependancesOutils): DefinitionOutil {
  return definir({
    id: "modifier.decomposer",
    libelle: "Décomposer",
    famille: "modifier",
    niveau: "complet",
    synonymes: ["explode", "éclater", "décomposer"],
    fiches: ["DA-02-13"],
    aide: { action: "Décompose polylignes et rectangles en lignes ; les pertes sont listées avant accord.", conditions: "Une sélection de polylignes ou de rectangles.", exemple: "Sélectionnez un rectangle, lancez Décomposer, cliquez ou Entrée : 4 lignes." },
    activation: activationSelection,
    commencer: (ctx) => {
      const sel = surSelection(deps, ctx);
      const analyse = () => {
        const etat = ctx.etat();
        const objets = sel.ids.map((id) => etat?.objets[id]).filter((o): o is ObjetModele => o !== undefined);
        const refuses = objets.filter((o) => segmentsDecomposes(o) === null);
        return { objets, refuses };
      };
      return sessionPoints(ctx, {
        nombre: 1,
        contraindre: (_e, brut) => brut,
        consigne: () => {
          const { objets, refuses } = analyse();
          if (refuses.length > 0) return `Rien à décomposer pour : ${refuses.map((o) => o.classe).join(", ")}.`;
          return `Pertes : ${[...new Set(objets.map(pertesDecomposition))].join(" ; ")}. Cliquez ou Entrée pour accepter et décomposer.`;
        },
        champs: () => [],
        formes: () => {
          const segs = sel.dessins.flatMap((d) => d.segments);
          return segs.map((s): FormeApercu => ({ forme: "segment", a: s.a, b: s.b, style: "fantome" }));
        },
        geste: () => {
          const { objets, refuses } = analyse();
          if (refuses.length > 0) return { erreur: lisible(refuses[0]?.id ?? "Objet", `la classe ${refuses[0]?.classe ?? ""} ne se décompose pas`, "ne sélectionner que des polylignes et des rectangles") };
          const ids = objets.flatMap((o) => Array.from({ length: segmentsDecomposes(o) ?? 0 }, () => ctx.nouvelId("esquisse-ligne")));
          return { label: `Décomposer ${objets.length} objet(s)`, commandes: [commande("transformer.decomposer", { nouveauxIds: ids }, objets.map((o) => o.id))] };
        },
        terminer: true,
      });
    },
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Points de contrôle (DA-02-14)
// ---------------------------------------------------------------------------------------------------------------

/** Points de contrôle éditables d'un objet (mêmes indices que le réducteur `transformer.pointsDeControle`). */
export function pointsDeControle(o: ObjetModele): { points: readonly PointLocal[]; ferme: boolean } | null {
  switch (o.classe) {
    case "mur":
      return { points: [o.params.axe.a, o.params.axe.b], ferme: false };
    case "esquisse.ligne":
    case "cotation":
      return { points: [o.params.a, o.params.b], ferme: false };
    case "esquisse.construction":
      return o.params.nature === "axe" ? { points: [o.params.a, o.params.b], ferme: false } : null;
    case "esquisse.polyligne":
    case "esquisse.spline":
      return { points: o.params.points, ferme: o.params.ferme };
    case "dalle":
    case "toiture":
    case "solide":
    case "esquisse.hachure":
      return { points: o.params.contour, ferme: true };
    default:
      return null;
  }
}

/** Indice du point de contrôle le plus proche. */
export function poigneeLaPlusProche(points: readonly Vec[], p: Vec): number {
  let k = -1;
  let m = Infinity;
  points.forEach((q, i) => {
    const d = distance(q, p);
    if (d < m) {
      m = d;
      k = i;
    }
  });
  return k;
}

function sessionPointsDeControle(ctx: ContexteAtelier): SessionOutil {
  let saisie: number | null = null;
  let courant: Vec | null = null;
  let deplace = false;
  let erreurs: readonly ErreurLisible[] = [];
  const objet = (): ObjetModele | null => {
    const id = ctx.selection.lire().ids[0];
    return id ? (ctx.etat()?.objets[id] ?? null) : null;
  };
  const poser = (p: Vec): ReactionOutil => {
    const o = objet();
    const pc = o ? pointsDeControle(o) : null;
    if (!o || !pc || saisie === null) return { action: "continuer" };
    const commandes = [commande("transformer.pointsDeControle", { deplacements: [{ indice: saisie, point: P(p) }] }, [o.id])];
    const ko = controler(ctx, commandes);
    saisie = null;
    deplace = false;
    if (ko.length > 0) {
      erreurs = ko;
      return { action: "continuer" };
    }
    erreurs = [];
    return { action: "valider", label: "Modifier les points", commandes, terminer: false };
  };
  return {
    traiter(evt: EvenementPlan): ReactionOutil {
      switch (evt.type) {
        case "survol":
        case "glisse":
          courant = evt.point;
          if (evt.type === "glisse" && saisie !== null) deplace = true;
          return { action: "continuer" };
        case "appui": {
          courant = evt.point;
          if (saisie !== null) return poser(evt.point);
          const o = objet();
          const pc = o ? pointsDeControle(o) : null;
          if (!pc) {
            erreurs = [lisible(o?.id ?? "Sélection", o ? `la classe ${o.classe} n'a pas de points de contrôle éditables` : "aucun objet sélectionné", "sélectionner une ligne, une polyligne, un contour ou un mur")];
            return { action: "continuer" };
          }
          saisie = poigneeLaPlusProche(pc.points, evt.point);
          deplace = false;
          erreurs = [];
          return { action: "continuer" };
        }
        case "relache":
          courant = evt.point;
          return saisie !== null && deplace ? poser(evt.point) : { action: "continuer" };
        case "touche":
          if (evt.touche === "Escape") saisie = null;
          return { action: "continuer" };
        case "saisie-texte":
        case "choix":
          return { action: "continuer" };
        case "saisie":
          return { action: "continuer" };
      }
    },
    apercu() {
      const o = objet();
      const pc = o ? pointsDeControle(o) : null;
      const formes: FormeApercu[] = [];
      if (pc) {
        // Poignées : cercles de rayon 0 (dessinés à taille fixe à l'écran, cibles de 24 px au moins).
        pc.points.forEach((q, i) => formes.push({ forme: "cercle", centre: q, rayon: 0, style: i === saisie ? "erreur" : "trace" }));
        if (saisie !== null && courant) {
          const pts = pc.points.map((q, i): Vec => (i === saisie ? (courant as Vec) : q));
          formes.push({ forme: "polyligne", points: pts.map(versPoint), fermee: pc.ferme, style: "fantome" });
          const q = pc.points[saisie];
          if (q) formes.push(coteSegment(q, courant));
        }
      }
      return { formes, champs: [], consigne: saisie === null ? "Cliquez (ou appuyez et glissez) le point à déplacer." : "Cliquez ou relâchez à la nouvelle position ; Échap annule.", erreurs };
    },
    abandonner() {
      saisie = null;
      deplace = false;
      erreurs = [];
    },
  };
}

export function outilPointsDeControle(): DefinitionOutil {
  return definir({
    id: "modifier.points",
    libelle: "Points de contrôle",
    famille: "modifier",
    niveau: "contextuel",
    synonymes: ["sommets", "poignées", "grips", "edit points", "modifier les points"],
    fiches: ["DA-02-14"],
    aide: { action: "Déplace un sommet ou une extrémité de l'objet sélectionné.", conditions: "Exactement un objet sélectionné (ligne, polyligne, spline, contour, mur, axe).", exemple: "Sélectionnez une polyligne, cliquez un sommet puis sa nouvelle position." },
    activation: (ctx) => {
      const a = activationSelection(ctx);
      if (!a.ok) return a;
      return ctx.selection.lire().ids.length === 1 ? { ok: true } : { ok: false, motif: "sélectionner un seul objet" };
    },
    commencer: sessionPointsDeControle,
  });
}

// ---------------------------------------------------------------------------------------------------------------

export function outilsTransformation(deps: DependancesOutils): DefinitionOutil[] {
  return [
    outilVecteur(deps, { id: "modifier.deplacer", libelle: "Déplacer", niveau: "essentiel", synonymes: ["move", "translater", "déplacement"], fiches: ["DA-02-01", "DA-02-17"], aide: { action: "Déplace la sélection d'un point à un autre (Ctrl au second point : copie).", conditions: "Une sélection non vide.", exemple: "Cliquez la base, tapez 2 puis Entrée : déplacement de 2 m." }, consignes: ["Cliquez le point de base.", "Cliquez la destination, ou tapez longueur et angle (Ctrl : copie)."] }, false),
    outilVecteur(deps, { id: "modifier.copier", libelle: "Copier", niveau: "essentiel", synonymes: ["copy", "dupliquer", "copie"], fiches: ["DA-02-02"], aide: { action: "Copie la sélection (et les ouvertures de ses murs) à un autre endroit.", conditions: "Une sélection non vide.", exemple: "Cliquez la base puis chaque destination ; Échap pour finir." }, consignes: ["Cliquez le point de base.", "Cliquez la destination de la copie."] }, true),
    outilTourner(deps),
    outilMiroir(deps),
    outilEchelle(deps),
    outilEtirer(deps),
    outilLimite("ajuster"),
    outilLimite("prolonger"),
    outilDecaler(deps),
    outilRepeter(deps),
    outilDecomposer(deps),
    outilPointsDeControle(),
  ];
}
