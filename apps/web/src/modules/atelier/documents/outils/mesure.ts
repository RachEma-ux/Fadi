/**
 * Outil « Mètre » (U, DA-15-01, famille Analyser) : mesure point à point dans le plan du niveau actif, en chaîne
 * (cumul des segments), avec distance, Δx, Δy et angle du dernier segment. **Aucune commande** : la session ne
 * rend jamais `valider` et ne lit pas l'état du modèle ; elle est permise en lecture seule et
 * hors ligne (`ecrit: false`).
 *
 * Gestes : appui = point suivant ; appui sur le dernier point (double appui) = mesure figée, le prochain appui
 * en commence une nouvelle ; Retour arrière retire le dernier point ; Échap efface. Les verrous longueur / angle
 * de la saisie de précision placent le point suivant. Changement de niveau actif : mesure effacée.
 * Valeurs internes exactes ; affichage au millimètre (« 4,500 m », comme le prototype).
 */
import { TOLERANCES } from "@parcours/atelier-model";
import type { Apercu, ContexteAtelier, DefinitionOutil, FormeApercu, SessionOutil } from "../../socle";
import { champsSegment, contraindrePolaire, P, type Verrous } from "../../plan2d/outils/commun";
import { angleDeg, distance, type Vec } from "../../plan2d/geometrie";
import { texteDegres, texteMetre } from "../format";

export const ID_METRE = "analyser.metre";

export interface SegmentMesure {
  readonly a: Vec;
  readonly b: Vec;
  readonly longueur: number;
  readonly dx: number;
  readonly dy: number;
  /** Angle de a→b en degrés dans [0 ; 360[, `null` si les points sont confondus (« non défini »). */
  readonly angle: number | null;
}

export interface Mesure {
  readonly segments: readonly SegmentMesure[];
  /** Somme des longueurs (chaîne). */
  readonly total: number;
}

/** Mesure pure d'une suite de points (valeurs exactes). */
export function mesurer(points: readonly Vec[]): Mesure {
  const segments: SegmentMesure[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec;
    const b = points[i] as Vec;
    const l = distance(a, b);
    segments.push({ a, b, longueur: l, dx: b.x - a.x, dy: b.y - a.y, angle: l < TOLERANCES.tolCoincidence ? null : angleDeg(a, b) });
  }
  return { segments, total: segments.reduce((s, x) => s + x.longueur, 0) };
}

/** Résumé lisible d'une mesure (dernier segment, puis total s'il y en a plusieurs). */
export function resumeMesure(m: Mesure): string {
  const d = m.segments.at(-1);
  if (!d) return "";
  const base = `Distance : ${texteMetre(d.longueur)} (Δx ${texteMetre(d.dx)}, Δy ${texteMetre(d.dy)}, angle ${d.angle === null ? "non défini" : texteDegres(d.angle)})`;
  return m.segments.length > 1 ? `${base} · cumul de ${m.segments.length} segments : ${texteMetre(m.total)}` : base;
}

function sessionMetre(ctx: ContexteAtelier): SessionOutil {
  let points: Vec[] = [];
  let curseur: Vec | null = null;
  let brut: Vec | null = null;
  let verrous: Verrous = {};
  let figee = false;
  let niveau = ctx.niveauActif();

  const effacer = () => {
    points = [];
    verrous = {};
    figee = false;
  };
  const suivreNiveau = () => {
    if (ctx.niveauActif() !== niveau) {
      niveau = ctx.niveauActif();
      effacer();
    }
  };
  const contraindre = (p: Vec): Vec => (figee ? p : contraindrePolaire(points.at(-1) ?? null, p, verrous));
  /** Points posés, plus le curseur s'il prolonge la chaîne (distinct du dernier point). */
  const chaine = (): Vec[] => {
    const dernier = points.at(-1);
    return figee || !curseur || !dernier || distance(dernier, curseur) <= TOLERANCES.tolCoincidence ? points : [...points, curseur];
  };

  return {
    traiter(evt) {
      suivreNiveau();
      switch (evt.type) {
        case "survol":
        case "glisse":
        case "relache":
          brut = evt.point;
          curseur = contraindre(evt.point);
          break;
        case "appui": {
          if (figee) effacer();
          const p = contraindre(evt.point);
          const dernier = points.at(-1);
          if (dernier && points.length >= 2 && distance(dernier, p) <= TOLERANCES.tolCoincidence) figee = true;
          else points = [...points, p];
          curseur = p;
          verrous = {};
          break;
        }
        case "touche":
          if (evt.touche === "Escape") effacer();
          else if (evt.touche === "Backspace" && points.length > 0) {
            points = points.slice(0, -1);
            figee = false;
          } else if (evt.touche === "Enter" && points.length >= 2) figee = true;
          break;
        case "saisie":
          if (Number.isFinite(evt.valeur) && (evt.champ === "longueur" || evt.champ === "angle") && !(evt.champ === "longueur" && evt.valeur < 0)) {
            verrous = { ...verrous, [evt.champ]: evt.valeur };
            if (brut) curseur = contraindre(brut);
          }
          break;
      }
      // Le mètre ne rend jamais de commande (DA-15-01) : rien à valider, rien à annuler.
      return { action: "continuer" };
    },
    apercu(): Apercu {
      const c = chaine();
      const m = mesurer(c);
      const formes: FormeApercu[] = m.segments.map((s) => ({ forme: "cote", a: P(s.a), b: P(s.b), texte: texteMetre(s.longueur) }));
      const fin = c.at(-1);
      if (m.segments.length > 1 && fin) formes.push({ forme: "texte", position: P(fin), texte: `Σ ${texteMetre(m.total)}`, style: "cote" });
      const consigne = m.segments.length > 0 ? `${resumeMesure(m)}${figee ? " — cliquez pour une nouvelle mesure, Échap pour effacer." : ""}` : points.length === 0 ? "Mètre : cliquez le premier point." : "Mètre : cliquez le point suivant (double clic pour figer).";
      return { formes, champs: figee ? [] : champsSegment(points.at(-1) ?? null, curseur, verrous), consigne, erreurs: [] };
    },
    abandonner() {
      effacer();
      curseur = null;
    },
  };
}

export function outilMetre(): DefinitionOutil {
  return {
    id: ID_METRE,
    libelle: "Mètre",
    famille: "analyser",
    niveau: "essentiel",
    synonymes: ["mesurer", "mesure", "distance", "règle", "measure", "tape", "dist"],
    raccourci: "U",
    fiches: ["DA-15-01"],
    aide: { action: "Mesure une distance ou une chaîne de segments sans rien créer.", conditions: "Un niveau actif ; possible en lecture seule et hors ligne.", exemple: "Deux extrémités d'un mur → « Distance : 4,500 m »." },
    vues: ["plan"],
    ecrit: false,
    activation: (ctx) => (ctx.niveauActif() ? { ok: true } : { ok: false, motif: "choisir d'abord un niveau actif" }),
    commencer: sessionMetre,
  };
}
