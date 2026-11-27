/**
 * Cotation (cas 2 du catalogue, lot 1 « Cotation et annotations ») — logique pure, indépendante de React et du DOM.
 *
 * - Position des points cotés : une cote associée lit ses sommets (à la racine ou dans le contexte de son `chemin`) ;
 *   un sommet disparu la rend **orpheline** : elle reste dessinée à sa dernière position connue et elle est signalée.
 * - `suivreAnnotations` est appelé à la fin de chaque opération (`Travail.fermer`) : il garde la dernière position
 *   connue des cotes associées, ré-associe une cote dont l'opération a recréé le sommet au même endroit (solides,
 *   épaissir) et fait suivre l'ancre d'un texte à repère quand son entité bouge.
 * - Valeur affichée : format (mètres, millimètre en exposant, centimètres), « ≈ » devant toute valeur arrondie, texte
 *   forcé ; la valeur pleine reste lisible (survol, Info entité).
 * - Contrôles (`controlerCotes`) : cotes orphelines, chaînes dont la somme affichée diffère du total affiché, cotes
 *   sorties de leur plage gardée. Rien n'est corrigé.
 * - Cote pilotante (`piloterCote`) : la valeur saisie déplace le second sommet coté le long de la direction mesurée.
 *
 * Aucune valeur réglementaire n'est fournie ici : la plage d'une cote est saisie par l'utilisateur.
 */
import { type Cote, type DirectionCote, type FormatCote, type ReglagesPlanche, REGLAGES_DEFAUT, type TexteAnnotation } from "./annotations.js";
import { type Contexte, type Id, type Matrice4, type Modele, type Resultat, appliquer, deplacer, inverserMatrice, matriceChemin } from "./geometrie-libre.js";
import { type Vec3, AXE_X, AXE_Y, AXE_Z, add, cross, dist, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

const PRES = 1e-9;

// ————————————————————————————————————————————————————————————— Contextes et sommets

/** Contexte au bout d'un chemin d'occurrences (racine si vide) et sa matrice monde ; null si le chemin est rompu. */
export function contexteDuChemin(m: Modele, chemin: readonly Id[] | undefined): { readonly contexte: Contexte; readonly M: Matrice4 | null } | null {
  if (!chemin || chemin.length === 0) return { contexte: m.racine, M: null };
  const M = matriceChemin(m, chemin);
  if (!M) return null;
  let c: Contexte = m.racine;
  for (const id of chemin) {
    const occ = c.occurrences[id];
    const d = occ ? m.definitions[occ.definition] : undefined;
    if (!d) return null;
    c = d.contenu;
  }
  return { contexte: c, M };
}

/** Position monde d'un sommet du contexte `chemin` ; null s'il n'existe plus. */
export function positionSommet(m: Modele, chemin: readonly Id[] | undefined, sommet: Id): Vec3 | null {
  const c = contexteDuChemin(m, chemin);
  const s = c?.contexte.sommets[sommet];
  if (!c || !s) return null;
  return c.M ? appliquer(c.M, s.position) : s.position;
}

/** Points cotés courants (sommets associés, sinon points enregistrés) et état d'association. */
export interface PointsCote {
  readonly a: Vec3;
  readonly b: Vec3;
  /** « associee » : tous les sommets sont là ; « libre » : cote sans sommet ; « orpheline » : un sommet a disparu. */
  readonly association: "associee" | "libre" | "orpheline";
}

export function pointsCote(m: Modele, c: Cote): PointsCote {
  switch (c.genre) {
    case "lineaire":
    case "pente": {
      if (!c.sommets) return { a: c.a, b: c.b, association: "libre" };
      const A = positionSommet(m, c.chemin, c.sommets[0]);
      const B = positionSommet(m, c.chemin, c.sommets[1]);
      return { a: A ?? c.a, b: B ?? c.b, association: A && B ? "associee" : "orpheline" };
    }
    case "niveau": {
      if (!c.sommet) return { a: c.point, b: c.point, association: "libre" };
      const P = positionSommet(m, c.chemin, c.sommet);
      return { a: P ?? c.point, b: P ?? c.point, association: P ? "associee" : "orpheline" };
    }
    case "diametre":
      return { a: c.centre, b: c.centre, association: "libre" };
    case "angulaire":
      return { a: c.a, b: c.b, association: "libre" };
  }
}

// ————————————————————————————————————————————————————————————— Mesure

/** Vecteur unitaire de la direction mesurée (null si la composante mesurée est nulle). */
export function directionMesuree(a: Vec3, b: Vec3, direction: DirectionCote | undefined): Vec3 | null {
  const d = sub(b, a);
  let u: Vec3;
  switch (direction ?? "alignee") {
    case "alignee":
      u = d;
      break;
    case "horizontale":
      u = v3(d.x, d.y, 0);
      break;
    case "verticale":
      u = v3(0, 0, d.z);
      break;
    case "axe-x":
      u = v3(d.x, 0, 0);
      break;
    case "axe-y":
      u = v3(0, d.y, 0);
      break;
    case "axe-z":
      u = v3(0, 0, d.z);
      break;
  }
  return len(u) < PRES ? null : normalize(u);
}

/**
 * Valeur mesurée : mètres (linéaire, diamètre, niveau), pourcentage (pente), degrés (angulaire). `null` = non évaluable
 * (pente verticale, altitude NGF non déclarée).
 */
export function valeurCote(m: Modele, c: Cote): number | null {
  const p = pointsCote(m, c);
  switch (c.genre) {
    case "lineaire": {
      const u = directionMesuree(p.a, p.b, c.direction);
      return u ? Math.abs(dot(sub(p.b, p.a), u)) : 0;
    }
    case "diametre":
      return 2 * c.rayon;
    case "niveau": {
      if (c.reference === "projet") return p.a.z;
      const alt = reglagesDe(m).emplacement?.altitude;
      return alt === undefined ? null : p.a.z + alt;
    }
    case "pente": {
      const h = Math.hypot(p.b.x - p.a.x, p.b.y - p.a.y);
      return h < PRES ? null : (Math.abs(p.b.z - p.a.z) / h) * 100;
    }
    case "angulaire": {
      const u = sub(c.a, c.centre);
      const w = sub(c.b, c.centre);
      if (len(u) < PRES || len(w) < PRES) return null;
      return (Math.acos(Math.max(-1, Math.min(1, dot(normalize(u), normalize(w))))) * 180) / Math.PI;
    }
  }
}

// ————————————————————————————————————————————————————————————— Style et format

export const reglagesDe = (m: Modele): ReglagesPlanche => m.annotations?.reglages ?? REGLAGES_DEFAUT;

export interface StyleEffectif {
  readonly extremites: ReglagesPlanche["extremitesCote"];
  readonly aligner: ReglagesPlanche["alignerCote"];
  readonly format: FormatCote;
}

/** Style d'une cote : son style nommé, sinon le style par défaut du modèle, sinon les réglages de l'Info modèle. */
export function styleEffectif(r: ReglagesPlanche, c?: Pick<Cote, "style">): StyleEffectif {
  const nomme = (c?.style && r.stylesCote?.[c.style]) || (r.styleCote ? r.stylesCote?.[r.styleCote] : undefined);
  if (nomme) return { extremites: nomme.extremites, aligner: nomme.aligner, format: nomme.format };
  return { extremites: r.extremitesCote, aligner: r.alignerCote, format: r.formatCote ?? "metres" };
}

const EXPOSANTS = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];

/** Pas d'arrondi d'un format (m) : précision d'affichage pour les mètres, 1 mm et 1 cm sinon. */
export function pasArrondi(format: FormatCote, precision: number): number {
  return format === "metres-mm" ? 0.001 : format === "centimetres" ? 0.01 : Math.pow(10, -Math.max(0, Math.min(6, precision)));
}

export interface ValeurAffichee {
  /** Texte de la cote (« ≈ » compris quand la valeur est arrondie). */
  readonly texte: string;
  /** Valeur pleine (survol, Info entité). */
  readonly plein: string;
  /** La valeur affichée diffère de la valeur mesurée. */
  readonly arrondie: boolean;
  /** Valeur arrondie telle qu'affichée (m), pour les sommes de chaîne. */
  readonly affichee: number;
}

const nombre = (v: number, decimales: number, sep: "." | ","): string => {
  const t = v.toFixed(decimales);
  return sep === "," ? t.replace(".", ",") : t;
};

/** Valeur pleine d'une longueur : au dixième de millimètre, zéros inutiles retirés (au moins deux décimales). */
export function valeurPleine(v: number, sep: "." | ","): string {
  let t = v.toFixed(4).replace(/0+$/, "");
  if (/\.\d?$/.test(t)) t = v.toFixed(2);
  return `${sep === "," ? t.replace(".", ",") : t} m`;
}

/** Longueur formatée selon le format de cote ; « ≈ » si la valeur affichée est arrondie (distinct du « ~ » de point non accroché). */
export function formaterLongueurCote(v: number, format: FormatCote, precision: number, sep: "." | ","): ValeurAffichee {
  const pas = pasArrondi(format, precision);
  const affichee = Math.round(v / pas) * pas;
  const arrondie = Math.abs(affichee - v) > 1e-7;
  let texte: string;
  if (format === "centimetres") texte = nombre(affichee * 100, 0, sep);
  else if (format === "metres-mm") {
    const mm = Math.round(affichee * 1000);
    const cm = Math.trunc(mm / 10);
    texte = `${nombre(cm / 100, 2, sep)}${EXPOSANTS[Math.abs(mm % 10)]}`;
  } else texte = nombre(affichee, Math.max(0, Math.min(6, precision)), sep);
  return { texte: arrondie ? `≈ ${texte}` : texte, plein: valeurPleine(v, sep), arrondie, affichee };
}

/** Texte d'une cote (texte forcé prioritaire) et valeur pleine. */
export function texteCote(m: Modele, c: Cote, precision: number, sep: "." | ","): ValeurAffichee & { readonly force: boolean } {
  const r = reglagesDe(m);
  const st = styleEffectif(r, c);
  const v = valeurCote(m, c);
  let base: ValeurAffichee;
  if (v === null) {
    const nonEval = c.genre === "niveau" ? "NGF ?" : "—";
    base = { texte: nonEval, plein: c.genre === "niveau" ? "altitude NGF non déclarée (Emplacement)" : "non évaluable", arrondie: false, affichee: NaN };
  } else if (c.genre === "pente") {
    const t = nombre(Math.round(v), 0, sep);
    const arr = Math.abs(Math.round(v) - v) > 1e-7;
    base = { texte: `${arr ? "≈ " : ""}${t} %`, plein: `${nombre(v, 2, sep)} %`, arrondie: arr, affichee: Math.round(v) };
  } else if (c.genre === "angulaire") {
    const t = nombre(Math.round(v * 10) / 10, 1, sep).replace(/[.,]0$/, "");
    const arr = Math.abs(Math.round(v * 10) / 10 - v) > 1e-7;
    base = { texte: `${arr ? "≈ " : ""}${t}°`, plein: `${nombre(v, 4, sep)}°`, arrondie: arr, affichee: v };
  } else if (c.genre === "niveau") {
    const f = formaterLongueurCote(Math.abs(v), st.format, precision, sep);
    const signe = Math.abs(f.affichee) < 1e-12 ? "±" : v > 0 ? "+" : "−";
    const sans = f.texte.replace(/^≈ /, "");
    base = { ...f, texte: `${f.arrondie ? "≈ " : ""}${signe}${sans}${c.reference === "ngf" ? " NGF" : ""}`, plein: `${v < 0 ? "−" : ""}${f.plein}${c.reference === "ngf" ? " NGF" : ""}` };
  } else if (c.genre === "diametre") {
    const f = formaterLongueurCote(v, st.format, precision, sep);
    base = { ...f, texte: `⌀ ${f.texte}` };
  } else base = formaterLongueurCote(v, st.format, precision, sep);
  const force = typeof c.texteForce === "string" && c.texteForce.trim() !== "";
  return { ...base, ...(force ? { texte: (c.texteForce as string).trim() } : {}), force };
}

// ————————————————————————————————————————————————————————————— Dessin

export interface DessinCote {
  /** Polylignes monde : attaches, ligne de cote, extrémités. */
  readonly lignes: readonly (readonly Vec3[])[];
  /** Point monde de l'étiquette. */
  readonly etiquette: Vec3;
  /** Texte et valeur pleine (survol). */
  readonly texte: string;
  readonly plein: string;
  readonly orpheline: boolean;
  /** La valeur et les extrémités sont passées à l'extérieur des lignes d'attache (cote trop courte). */
  readonly exterieur: boolean;
}

/** Largeur minimale (px) d'une cote pour garder sa valeur entre les lignes d'attache. */
export const LARGEUR_MIN_INTERIEUR_PX = 48;

/** Extrémité dessinée en `p`, la ligne de cote allant vers `u`, dans le plan (u, n) ; `taille` en mètres. */
function extremite(genre: ReglagesPlanche["extremitesCote"], p: Vec3, u: Vec3, n: Vec3, taille: number): Vec3[][] {
  const pt = (k: number, j: number): Vec3 => add(p, add(scale(u, k * taille), scale(n, j * taille)));
  switch (genre) {
    case "aucune":
      return [];
    case "barre":
      return [[pt(-0.5, -0.5), pt(0.5, 0.5)]];
    case "fleche-ouverte":
      return [[pt(1, 0.35), p, pt(1, -0.35)]];
    case "fleche-fermee":
      return [[pt(1, 0.35), p, pt(1, -0.35), pt(1, 0.35)]];
    case "point":
      return [[pt(0.2, 0), pt(0, 0.2), pt(-0.2, 0), pt(0, -0.2), pt(0.2, 0)]];
  }
}

/**
 * Géométrie d'une cote à l'échelle de l'écran : `pas` = mètres par pixel à la cible. Les extrémités et l'alignement du
 * texte suivent le style effectif ; une cote linéaire plus courte que `LARGEUR_MIN_INTERIEUR_PX` passe sa valeur et ses
 * extrémités à l'extérieur des lignes d'attache.
 */
export function dessinerCote(m: Modele, c: Cote, pas: number, precision: number, sep: "." | ","): DessinCote | null {
  const r = reglagesDe(m);
  const st = styleEffectif(r, c);
  const p = pointsCote(m, c);
  const t = texteCote(m, c, precision, sep);
  const orpheline = p.association === "orpheline";
  const taille = 8 * pas;
  const base = { texte: t.texte, plein: t.plein, orpheline };
  switch (c.genre) {
    case "lineaire":
    case "pente": {
      const u0 = c.genre === "lineaire" ? directionMesuree(p.a, p.b, c.direction) : directionMesuree(p.a, p.b, "alignee");
      if (!u0) return null;
      // Ligne de cote : passe par `position`, parallèle à la direction mesurée.
      const A = p.a;
      const off0 = sub(c.position, A);
      const n0 = sub(off0, scale(u0, dot(off0, u0)));
      const A2 = add(A, n0);
      const B2 = add(A2, scale(u0, dot(sub(p.b, A), u0)));
      const L = dist(A2, B2);
      const u = L < PRES ? u0 : normalize(sub(B2, A2));
      const nn = len(n0) < PRES ? normalize(cross(u, Math.abs(u.z) > 0.9 ? AXE_X : AXE_Z)) : normalize(n0);
      if (c.genre === "pente") {
        // Flèche dans le sens de la descente, valeur au milieu.
        const haut = p.a.z >= p.b.z ? A2 : B2;
        const bas = p.a.z >= p.b.z ? B2 : A2;
        const ub = normalize(sub(haut, bas));
        return { ...base, lignes: [[haut, bas], ...extremite("fleche-fermee", bas, ub, nn, taille)], etiquette: add(scale(add(A2, B2), 0.5), scale(nn, 10 * pas)), exterieur: false };
      }
      const exterieur = L / pas < LARGEUR_MIN_INTERIEUR_PX || st.aligner === "exterieur";
      const lignes: Vec3[][] = [[p.a, add(A2, scale(nn, 0.25 * taille))], [p.b, add(B2, scale(nn, 0.25 * taille))]];
      if (L / pas < LARGEUR_MIN_INTERIEUR_PX) {
        // Trop courte : la ligne déborde des deux côtés, les extrémités pointent vers l'intérieur.
        lignes.push([sub(A2, scale(u, 2 * taille)), add(B2, scale(u, 2 * taille))]);
        lignes.push(...extremite(st.extremites, A2, scale(u, -1), nn, taille), ...extremite(st.extremites, B2, u, nn, taille));
      } else {
        lignes.push([A2, B2]);
        lignes.push(...extremite(st.extremites, A2, u, nn, taille), ...extremite(st.extremites, B2, scale(u, -1), nn, taille));
      }
      const milieu = scale(add(A2, B2), 0.5);
      const etiquette = exterieur ? add(B2, scale(u, 3 * taille + 4 * pas * Math.max(1, t.texte.length))) : st.aligner === "dessus" ? add(milieu, scale(nn, 10 * pas)) : milieu;
      return { ...base, lignes, etiquette, exterieur: L / pas < LARGEUR_MIN_INTERIEUR_PX };
    }
    case "diametre":
      return { ...base, lignes: [[c.centre, c.position]], etiquette: c.position, exterieur: false };
    case "niveau": {
      // Repère de niveau : trait d'attache horizontal vers la position, triangle pointe en bas sur le niveau.
      const P = p.a;
      const Q = v3(c.position.x, c.position.y, P.z);
      const h = normalize(len(sub(Q, P)) < PRES ? AXE_X : sub(Q, P));
      const tri: Vec3[] = [Q, add(add(Q, scale(h, -0.5 * taille)), scale(AXE_Z, taille)), add(add(Q, scale(h, 0.5 * taille)), scale(AXE_Z, taille)), Q];
      return { ...base, lignes: [[P, add(Q, scale(h, taille))], tri], etiquette: add(add(Q, scale(h, 2 * taille)), scale(AXE_Z, 0.6 * taille)), exterieur: false };
    }
    case "angulaire": {
      const rayon = Math.max(dist(c.position, c.centre), 4 * taille);
      const u = sub(c.a, c.centre);
      const w = sub(c.b, c.centre);
      if (len(u) < PRES || len(w) < PRES) return null;
      const e1 = normalize(u);
      const n = normalize(c.normale);
      const e2 = normalize(cross(n, e1));
      const angle = Math.atan2(dot(normalize(w), e2), dot(normalize(w), e1));
      const pts: Vec3[] = [];
      const N = 24;
      for (let k = 0; k <= N; k++) {
        const a = (angle * k) / N;
        pts.push(add(c.centre, add(scale(e1, rayon * Math.cos(a)), scale(e2, rayon * Math.sin(a)))));
      }
      const mi = angle / 2;
      const et = add(c.centre, add(scale(e1, (rayon + 3 * taille) * Math.cos(mi)), scale(e2, (rayon + 3 * taille) * Math.sin(mi))));
      return { ...base, lignes: [pts, [c.centre, add(c.centre, scale(e1, rayon))], [c.centre, add(c.centre, scale(normalize(w), rayon))]], etiquette: et, exterieur: false };
    }
  }
}

// ————————————————————————————————————————————————————————————— Contrôles

export interface ChaineIncoherente {
  readonly total: Id;
  readonly partielles: readonly Id[];
  /** Somme des valeurs affichées des cotes partielles et valeur affichée du total (m). */
  readonly somme: number;
  readonly affiche: number;
  /** Écart dû aux arrondis (m), signé : somme − total. */
  readonly ecart: number;
}

export interface HorsPlage {
  readonly id: Id;
  readonly valeur: number;
  readonly min?: number;
  readonly max?: number;
}

export interface ControleCotes {
  readonly orphelines: readonly Id[];
  readonly chaines: readonly ChaineIncoherente[];
  readonly horsPlage: readonly HorsPlage[];
}

interface Intervalle {
  readonly id: Id;
  readonly t0: number;
  readonly t1: number;
  /** Composante de la ligne de cote orthogonale à la direction (identifie la ligne). */
  readonly ligne: Vec3;
  readonly valeur: number;
}

/**
 * Chaînes de cotes : des cotes linéaires de même direction, posées sur une même ligne de cote, qui se suivent bout à
 * bout, et une cote parallèle qui couvre exactement leur étendue (le total). La chaîne est incohérente quand la somme
 * des valeurs affichées diffère de la valeur affichée du total.
 */
export function chainesDeCotes(m: Modele, precision: number): { readonly total: Id; readonly partielles: readonly Id[]; readonly somme: number; readonly affiche: number }[] {
  const r = reglagesDe(m);
  const cotes = Object.values(m.annotations?.cotes ?? {}).filter((c): c is Extract<Cote, { genre: "lineaire" }> => c.genre === "lineaire");
  // Regroupement par direction (au signe près).
  const groupes: { u: Vec3; membres: Intervalle[] }[] = [];
  for (const c of cotes) {
    const p = pointsCote(m, c);
    if (p.association === "orpheline") continue;
    let u = directionMesuree(p.a, p.b, c.direction);
    if (!u) continue;
    let g = groupes.find((x) => len(cross(x.u, u as Vec3)) < 1e-6);
    if (g && dot(g.u, u) < 0) u = scale(u, -1);
    if (!g) {
      g = { u, membres: [] };
      groupes.push(g);
    }
    const ta = dot(p.a, g.u);
    const tb = dot(p.b, g.u);
    const ligne = sub(c.position, scale(g.u, dot(c.position, g.u)));
    g.membres.push({ id: c.id, t0: Math.min(ta, tb), t1: Math.max(ta, tb), ligne, valeur: Math.abs(tb - ta) });
  }
  const res: { total: Id; partielles: Id[]; somme: number; affiche: number }[] = [];
  const pasDe = (id: Id): number => {
    const c = m.annotations?.cotes[id];
    return pasArrondi(styleEffectif(r, c).format, precision);
  };
  const arrondi = (v: number, pas: number): number => Math.round(v / pas) * pas;
  for (const g of groupes) {
    // Lignes de cote distinctes du groupe.
    const lignes: Intervalle[][] = [];
    for (const x of g.membres) {
      const l = lignes.find((L) => dist((L[0] as Intervalle).ligne, x.ligne) < 1e-6);
      if (l) l.push(x);
      else lignes.push([x]);
    }
    for (const L of lignes) {
      const tries = [...L].sort((a, b) => a.t0 - b.t0);
      // Séquences contiguës d'au moins deux cotes.
      let debut = 0;
      while (debut < tries.length) {
        let fin = debut;
        while (fin + 1 < tries.length && Math.abs((tries[fin + 1] as Intervalle).t0 - (tries[fin] as Intervalle).t1) < 1e-6) fin++;
        if (fin > debut) {
          for (let i = debut; i < fin; i++)
            for (let j = i + 1; j <= fin; j++) {
              const seq = tries.slice(i, j + 1);
              const t0 = (seq[0] as Intervalle).t0;
              const t1 = (seq[seq.length - 1] as Intervalle).t1;
              const total = g.membres.find((x) => !seq.includes(x) && Math.abs(x.t0 - t0) < 1e-6 && Math.abs(x.t1 - t1) < 1e-6);
              if (!total) continue;
              const somme = seq.reduce((s, x) => s + arrondi(x.valeur, pasDe(x.id)), 0);
              res.push({ total: total.id, partielles: seq.map((x) => x.id), somme, affiche: arrondi(total.valeur, pasDe(total.id)) });
            }
        }
        debut = fin + 1;
      }
    }
  }
  // Une même cote totale : garder la plus longue chaîne.
  const parTotal = new Map<Id, (typeof res)[number]>();
  for (const x of res) {
    const y = parTotal.get(x.total);
    if (!y || x.partielles.length > y.partielles.length) parTotal.set(x.total, x);
  }
  return [...parTotal.values()];
}

/** Contrôle des cotes : orphelines, chaînes incohérentes, cotes hors de leur plage. Rien n'est corrigé. */
export function controlerCotes(m: Modele, precision = 2): ControleCotes {
  const cotes = Object.values(m.annotations?.cotes ?? {});
  const orphelines = cotes.filter((c) => pointsCote(m, c).association === "orpheline").map((c) => c.id);
  const chaines = chainesDeCotes(m, precision)
    .filter((x) => Math.abs(x.somme - x.affiche) > 1e-7)
    .map((x) => ({ ...x, ecart: x.somme - x.affiche }));
  const horsPlage: HorsPlage[] = [];
  for (const c of cotes) {
    if (c.genre !== "lineaire" || !c.plage) continue;
    const v = valeurCote(m, c);
    if (v === null) continue;
    const { min, max } = c.plage;
    if ((min !== undefined && v < min - 1e-9) || (max !== undefined && v > max + 1e-9)) horsPlage.push({ id: c.id, valeur: v, ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) });
  }
  return { orphelines, chaines, horsPlage };
}

/** Cotes nouvellement sorties de leur plage entre deux états (alerte après une opération). */
export function nouvellesSortiesDePlage(avant: Modele, apres: Modele): HorsPlage[] {
  const deja = new Set(controlerCotes(avant).horsPlage.map((h) => h.id));
  return controlerCotes(apres).horsPlage.filter((h) => !deja.has(h.id));
}

/**
 * Lit une plage saisie : « ≥ 4,00 », « >= 4 », « ≤ 2,5 », « 2,40 – 2,60 », « 2,40..2,60 » ; vide = aucune plage ;
 * null = saisie illisible.
 */
export function lirePlage(texte: string): { readonly min?: number; readonly max?: number } | undefined | null {
  const t = texte.trim().replace(/\s+/g, "").replace(/,/g, ".");
  if (t === "") return undefined;
  const n = (x: string): number | null => (x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
  let mm: RegExpMatchArray | null;
  if ((mm = t.match(/^(?:≥|>=)(.+)$/))) {
    const v = n(mm[1] as string);
    return v === null || v < 0 ? null : { min: v };
  }
  if ((mm = t.match(/^(?:≤|<=)(.+)$/))) {
    const v = n(mm[1] as string);
    return v === null || v < 0 ? null : { max: v };
  }
  if ((mm = t.match(/^([^–\-.]*(?:\.\d+)?)(?:–|-|\.\.)(.+)$/))) {
    const a = n(mm[1] as string);
    const b = n(mm[2] as string);
    return a === null || b === null || a < 0 || b < a ? null : { min: a, max: b };
  }
  return null;
}

/** Plage affichée (« ≥ 4,00 », « ≤ 2,50 », « 2,40 – 2,60 »). */
export function formaterPlage(p: { readonly min?: number; readonly max?: number } | undefined, sep: "." | ","): string {
  if (!p) return "";
  const f = (v: number): string => nombre(v, 2, sep);
  if (p.min !== undefined && p.max !== undefined) return `${f(p.min)} – ${f(p.max)}`;
  if (p.min !== undefined) return `≥ ${f(p.min)}`;
  if (p.max !== undefined) return `≤ ${f(p.max)}`;
  return "";
}

// ————————————————————————————————————————————————————————————— Cote pilotante

/**
 * Cote pilotante : la valeur saisie (m) déplace le second sommet coté le long de la direction mesurée, la géométrie
 * connectée suit (comme Déplacer). Refus nommé si la cote n'est pas associée, est orpheline, ou si la valeur n'est pas
 * une longueur positive.
 */
export function piloterCote(m: Modele, id: Id, valeur: number): Resultat {
  const c = m.annotations?.cotes[id];
  if (!c || c.genre !== "lineaire") throw new RangeError("Seule une cote linéaire peut piloter la géométrie.");
  if (!Number.isFinite(valeur) || valeur <= 0) throw new RangeError("Saisissez une longueur positive.");
  const p = pointsCote(m, c);
  if (p.association !== "associee" || !c.sommets) throw new RangeError("Cette cote n'est pas associée à deux sommets : sa valeur ne pilote rien.");
  const u = directionMesuree(p.a, p.b, c.direction);
  if (!u) throw new RangeError("La cote mesure une longueur nulle dans sa direction : elle ne peut pas piloter.");
  const actuelle = dot(sub(p.b, p.a), u);
  const signe = actuelle < 0 ? -1 : 1;
  const delta = valeur - Math.abs(actuelle);
  if (Math.abs(delta) < 1e-9) return { modele: m, rapport: { crees: [], modifies: [], supprimes: [] } };
  let vecteur = scale(u, signe * delta);
  const ctx = contexteDuChemin(m, c.chemin);
  if (!ctx) throw new RangeError("Le contexte de la cote n'existe plus.");
  if (ctx.M) {
    const inv = inverserMatrice(ctx.M);
    if (!inv) throw new RangeError("Le contexte de la cote est dégénéré.");
    vecteur = sub(appliquer(inv, vecteur), appliquer(inv, v3(0, 0, 0)));
  }
  const dans = c.chemin && c.chemin.length ? c.chemin[c.chemin.length - 1] : undefined;
  return deplacer(m, [c.sommets[1]], vecteur, dans !== undefined ? { dans } : {});
}

// ————————————————————————————————————————————————————————————— Suivi des annotations après une opération

/** Point de référence monde d'une entité (sommet, arête, face, courbe : barycentre des sommets ; occurrence : origine). */
function referenceEntite(m: Modele, chemin: readonly Id[] | undefined, id: Id): Vec3 | null {
  const cx = contexteDuChemin(m, chemin);
  if (!cx) return null;
  const c = cx.contexte;
  const monde = (p: Vec3): Vec3 => (cx.M ? appliquer(cx.M, p) : p);
  const bary = (ids: readonly Id[]): Vec3 | null => {
    const pts = ids.map((s) => c.sommets[s]?.position).filter((p): p is Vec3 => p !== undefined);
    if (pts.length === 0 || pts.length !== ids.length) return null;
    return monde(scale(pts.reduce((s, p) => add(s, p), v3(0, 0, 0)), 1 / pts.length));
  };
  if (c.sommets[id]) return monde((c.sommets[id] as { position: Vec3 }).position);
  const a = c.aretes[id];
  if (a) return bary([a.a, a.b]);
  const f = c.faces[id];
  if (f) return bary(f.exterieur);
  const o = c.occurrences[id];
  if (o) return monde(v3(o.transformation[3] ?? 0, o.transformation[7] ?? 0, o.transformation[11] ?? 0));
  return null;
}

/** Sommet du contexte situé à `p` (monde), à la tolérance de fusion. */
function sommetA(m: Modele, chemin: readonly Id[] | undefined, p: Vec3): Id | null {
  const cx = contexteDuChemin(m, chemin);
  if (!cx) return null;
  for (const s of Object.values(cx.contexte.sommets)) {
    const q = cx.M ? appliquer(cx.M, s.position) : s.position;
    if (dist(q, p) <= 1e-6) return s.id;
  }
  return null;
}

/**
 * Après une opération : une cote associée garde la dernière position connue de ses sommets ; une cote dont un sommet a
 * disparu est ré-associée au sommet recréé au même endroit (opérations de solide, épaissir), sinon elle devient
 * orpheline ; l'ancre d'un texte à repère suit le déplacement de son entité. Rend `apres` inchangé si rien ne bouge.
 */
export function suivreAnnotations(avant: Modele, apres: Modele): Modele {
  const a = apres.annotations;
  if (!a) return apres;
  let cotes: Record<Id, Cote> | null = null;
  let textes: Record<Id, TexteAnnotation> | null = null;
  const majCote = (c: Cote): void => {
    cotes ??= { ...a.cotes };
    cotes[c.id] = c;
  };
  for (const c of Object.values(a.cotes)) {
    if ((c.genre === "lineaire" || c.genre === "pente") && c.sommets) {
      const ids: Id[] = [c.sommets[0], c.sommets[1]];
      const pos: Vec3[] = [c.a, c.b];
      let change = false;
      for (let k = 0; k < 2; k++) {
        const P = positionSommet(apres, c.chemin, ids[k] as Id);
        if (P) {
          if (dist(P, pos[k] as Vec3) > 1e-9) {
            pos[k] = P;
            change = true;
          }
          continue;
        }
        const s = sommetA(apres, c.chemin, pos[k] as Vec3);
        if (s) {
          ids[k] = s;
          change = true;
        }
      }
      if (change) majCote({ ...c, a: pos[0] as Vec3, b: pos[1] as Vec3, sommets: [ids[0] as Id, ids[1] as Id] });
    } else if (c.genre === "niveau" && c.sommet) {
      const P = positionSommet(apres, c.chemin, c.sommet);
      if (P) {
        if (dist(P, c.point) > 1e-9) majCote({ ...c, point: P });
      } else {
        const s = sommetA(apres, c.chemin, c.point);
        if (s) majCote({ ...c, sommet: s });
      }
    }
  }
  for (const t of Object.values(a.textes)) {
    if (t.genre !== "repere" || !t.entite || t.etiquettePiece) continue;
    const r0 = referenceEntite(avant, t.chemin, t.entite);
    const r1 = referenceEntite(apres, t.chemin, t.entite);
    if (!r0 || !r1 || dist(r0, r1) < 1e-9) continue;
    textes ??= { ...a.textes };
    textes[t.id] = { ...t, ancre: add(t.ancre, sub(r1, r0)) };
  }
  if (!cotes && !textes) return apres;
  return Object.freeze({ ...apres, annotations: Object.freeze({ ...a, ...(cotes ? { cotes: Object.freeze(cotes) } : {}), ...(textes ? { textes: Object.freeze(textes) } : {}) }) });
}

// ————————————————————————————————————————————————————————————— Création

/**
 * Cotes en chaîne : une cote par intervalle entre points successifs, toutes sur la même ligne de cote, et la cote
 * totale décalée d'un cran au-delà (`ecart` en mètres). Rend les cotes à ranger dans `annotations.cotes`.
 */
export function cotesEnChaine(
  points: readonly { readonly p: Vec3; readonly sommet?: Id }[],
  position: Vec3,
  ecart: number,
  id: (prefixe: string) => Id,
  chemin?: readonly Id[],
): Cote[] {
  if (points.length < 2) return [];
  const A = (points[0] as { p: Vec3 }).p;
  const Z = (points[points.length - 1] as { p: Vec3 }).p;
  const u = len(sub(Z, A)) < PRES ? AXE_X : normalize(sub(Z, A));
  const off = sub(position, A);
  const n = sub(off, scale(u, dot(off, u)));
  const nn = len(n) < PRES ? AXE_Y : normalize(n);
  const res: Cote[] = [];
  const assoc = (x: { sommet?: Id }, y: { sommet?: Id }) => (x.sommet && y.sommet ? { sommets: [x.sommet, y.sommet] as const } : {});
  const ch = chemin && chemin.length ? { chemin } : {};
  for (let i = 0; i + 1 < points.length; i++) {
    const x = points[i] as { p: Vec3; sommet?: Id };
    const y = points[i + 1] as { p: Vec3; sommet?: Id };
    if (dist(x.p, y.p) < PRES) continue;
    res.push({ id: id("c"), genre: "lineaire", a: x.p, b: y.p, ...assoc(x, y), position, ...ch });
  }
  if (res.length >= 2) {
    const premier = points[0] as { p: Vec3; sommet?: Id };
    const dernier = points[points.length - 1] as { p: Vec3; sommet?: Id };
    res.push({ id: id("c"), genre: "lineaire", a: premier.p, b: dernier.p, ...assoc(premier, dernier), position: add(position, scale(nn, ecart)), ...ch });
  }
  return res;
}

