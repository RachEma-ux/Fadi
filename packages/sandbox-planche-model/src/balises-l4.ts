/**
 * Cas 2 du catalogue, lot 4 « Balises, scènes et gabarit » (maquettes `analyses/catalogue-extensions/cas-2/lot-4`,
 * validées le 27 novembre 2026). Pur : ni React, ni DOM.
 *
 * - Balises : balise courante posée sur ce qui est créé (n° 74), balise verrouillée (n° 82), épaisseur et type de trait
 *   des sorties (n° 115), géométrie nue et annotations balisées (n° 69), balises réservées par genre (n° 63), balises de
 *   phase (n° 56) et classement existant / à démolir / projeté avec vues d'état (n° 116).
 * - Scènes : état de la vue mémorisé (n° 11), échelle nominale (n° 43), date et heure du soleil (n° 108), scènes types
 *   (n° 44), scène face à un plan de coupe (n° 85).
 * - Plans de coupe : distance le long de la normale et pas (n° 66), profondeur vue limitée (n° 59).
 * - Gabarit d'agence (n° 9) : fichier de l'agence, sourcé, archivé tel quel ; Fadi n'en fournit aucun contenu.
 *
 * Aucune épaisseur, aucun type de trait ni aucune couleur n'est imposé : ils sont saisis ou repris du gabarit.
 */
import type { Balise, Cote, PlanDeCoupe, ReglagesPlanche, Scene, StyleCote, TexteAnnotation, UniteSaisie } from "./annotations.js";
import { REGLAGES_DEFAUT } from "./annotations.js";
import type { ArchiveFichier, MotifRefusArchive } from "./fichiers-extensions.js";
import { type Contexte, type Id, type Modele, type Resultat, baliserEntites, contexte, modeleVide, modifierAnnotations } from "./geometrie-libre.js";
import { geometrieVisible } from "./inference.js";
import { nomParametreProjetValide } from "./saisie-projet.js";
import { type Vec3, add, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

// ————————————————————————————————————————————————————————————— Balises

export const TRAITS_BALISE = ["continu", "tirets", "pointilles", "mixte"] as const;
export type TraitBalise = (typeof TRAITS_BALISE)[number];
export const PHASES_BALISE = ["existant", "demolir", "projete"] as const;
export type PhaseBalise = (typeof PHASES_BALISE)[number];
export const GENRES_RESERVES = ["cotes", "textes", "plans"] as const;
export type GenreReserve = (typeof GENRES_RESERVES)[number];
export type BalisesReservees = Readonly<Partial<Record<GenreReserve, Id>>>;

/** Tirets d'un type de trait, en multiples de l'épaisseur (sorties SVG / PDF) ; continu = aucun. */
export function tiretsDuTrait(trait: TraitBalise | undefined, epaisseur: number): readonly number[] {
  const e = Math.max(epaisseur, 0.05);
  switch (trait) {
    case "tirets":
      return [12 * e, 6 * e];
    case "pointilles":
      return [1.5 * e, 4 * e];
    case "mixte":
      return [14 * e, 4 * e, 1.5 * e, 4 * e];
    default:
      return [];
  }
}

const baliseDe = (m: Modele, id: Id | undefined): Balise | undefined => (id ? m.annotations?.balises[id] : undefined);
/** La balise est masquée (son contenu n'est ni affiché, ni accroché, ni sélectionnable). */
export const baliseMasquee = (m: Modele, id: Id | undefined): boolean => baliseDe(m, id)?.visible === false;
/** La balise est verrouillée : son contenu est affiché, mais ni sélectionnable ni modifiable. */
export const baliseVerrouillee = (m: Modele, id: Id | undefined): boolean => baliseDe(m, id)?.verrouillee === true;

export interface ChangementBalise {
  readonly nom?: string;
  readonly couleur?: string;
  /** Épaisseur en mm papier ; `null` retire la valeur. */
  readonly epaisseur?: number | null;
  readonly trait?: TraitBalise | null;
  readonly verrouillee?: boolean;
  readonly phase?: PhaseBalise | null;
}

/** Modifie une balise (nom, couleur, épaisseur, trait, verrou, phase) ; une valeur invalide est refusée. */
export function modifierBalise(m: Modele, id: Id, v: ChangementBalise): Resultat {
  const b = baliseDe(m, id);
  if (!b) throw new RangeError("Balise introuvable.");
  if (v.nom !== undefined && !v.nom.trim()) throw new RangeError("Une balise demande un nom.");
  if (v.couleur !== undefined && !/^#[0-9a-f]{6}$/i.test(v.couleur)) throw new RangeError("Couleur de balise invalide (#rrggbb).");
  if (v.epaisseur !== undefined && v.epaisseur !== null && !(v.epaisseur > 0 && v.epaisseur <= 10)) throw new RangeError("Épaisseur de trait : saisissez une valeur entre 0 et 10 mm.");
  if (v.trait !== undefined && v.trait !== null && !TRAITS_BALISE.includes(v.trait)) throw new RangeError("Type de trait inconnu.");
  if (v.phase !== undefined && v.phase !== null && !PHASES_BALISE.includes(v.phase)) throw new RangeError("Phase inconnue.");
  return modifierAnnotations(m, (a) => {
    const { epaisseur, trait, verrouillee, phase, ...reste } = b;
    const e = v.epaisseur === undefined ? epaisseur : v.epaisseur ?? undefined;
    const t = v.trait === undefined ? trait : v.trait ?? undefined;
    const ph = v.phase === undefined ? phase : v.phase ?? undefined;
    const ver = v.verrouillee ?? verrouillee;
    a.balises[id] = {
      ...reste,
      ...(v.nom !== undefined ? { nom: v.nom.trim() } : {}),
      ...(v.couleur !== undefined ? { couleur: v.couleur.toLowerCase() } : {}),
      ...(e !== undefined ? { epaisseur: e } : {}),
      ...(t !== undefined ? { trait: t } : {}),
      ...(ver ? { verrouillee: true } : {}),
      ...(ph !== undefined ? { phase: ph } : {}),
    };
  });
}

/** Balise d'une phase (la première de la liste qui la porte), ou `undefined`. */
export const baliseDePhase = (m: Modele, phase: PhaseBalise): Balise | undefined => Object.values(m.annotations?.balises ?? {}).find((b) => b.phase === phase);

/** Nom donné à une balise de phase créée en un geste (donnée du projet, non traduite). */
export const NOMS_PHASES: Readonly<Record<PhaseBalise, string>> = { existant: "Existant", demolir: "À démolir", projete: "Projeté" };

/**
 * Crée en un pas les balises de phase qui manquent (Existant, À démolir, Projeté), avec les couleurs données (gabarit
 * d'agence ou choix de la personne) ; une balise du même nom existante reçoit sa phase. Rend les balises par phase.
 */
export function creerBalisesPhase(m: Modele, couleurs: Readonly<Record<PhaseBalise, string>>): Resultat & { extra: Record<PhaseBalise, Id> } {
  for (const c of Object.values(couleurs)) if (!/^#[0-9a-f]{6}$/i.test(c)) throw new RangeError("Couleur de balise invalide (#rrggbb).");
  return modifierAnnotations(m, (a, id) => {
    const r = {} as Record<PhaseBalise, Id>;
    for (const ph of PHASES_BALISE) {
      const deja = Object.values(a.balises).find((b) => b.phase === ph) ?? Object.values(a.balises).find((b) => b.nom === NOMS_PHASES[ph]);
      if (deja) {
        a.balises[deja.id] = { ...deja, phase: ph };
        r[ph] = deja.id;
        continue;
      }
      const k = id("b");
      a.balises[k] = { id: k, nom: NOMS_PHASES[ph], couleur: couleurs[ph].toLowerCase(), visible: true, phase: ph };
      r[ph] = k;
    }
    return r;
  });
}

/** Vue d'état : tout, état existant (existant et à démolir), état projeté (existant et projeté). */
export const VUES_ETAT = ["tout", "existant", "projet"] as const;
export type VueEtat = (typeof VUES_ETAT)[number];

/** Montre les balises de phase selon la vue d'état ; les balises hors phase ne changent pas. */
export function appliquerVueEtat(m: Modele, vue: VueEtat): Resultat {
  const voir: Record<VueEtat, Record<PhaseBalise, boolean>> = {
    tout: { existant: true, demolir: true, projete: true },
    existant: { existant: true, demolir: true, projete: false },
    projet: { existant: true, demolir: false, projete: true },
  };
  return modifierAnnotations(m, (a) => {
    for (const b of Object.values(a.balises)) if (b.phase) a.balises[b.id] = { ...b, visible: voir[vue][b.phase] };
  });
}

/** Vue d'état en vigueur d'après la visibilité des balises de phase, ou `null` (aucune phase, ou un autre réglage). */
export function vueEtatCourante(m: Modele): VueEtat | null {
  const phases = Object.values(m.annotations?.balises ?? {}).filter((b) => b.phase);
  if (!phases.length) return null;
  for (const v of VUES_ETAT) {
    const r = appliquerVueEtat(m, v).modele;
    if (phases.every((b) => r.annotations!.balises[b.id]!.visible === b.visible)) return v;
  }
  return null;
}

/** Ce que porte une sélection : arêtes et faces nues, objets, cotes, textes, plans de coupe. */
export interface CompteClassement {
  readonly aretes: number;
  readonly faces: number;
  readonly objets: number;
  readonly cotes: number;
  readonly textes: number;
  readonly plans: number;
}

/** Compte, par genre, les entités d'une sélection (contexte ouvert et annotations). */
export function compterSelection(m: Modele, ids: readonly Id[], dans?: Id): CompteClassement {
  const c = contexte(m, dans);
  const a = m.annotations;
  return {
    aretes: ids.filter((id) => c.aretes[id]).length,
    faces: ids.filter((id) => c.faces[id]).length,
    objets: ids.filter((id) => c.occurrences[id]).length,
    cotes: ids.filter((id) => a?.cotes[id]).length,
    textes: ids.filter((id) => a?.textes[id]).length,
    plans: ids.filter((id) => a?.plansDeCoupe[id]).length,
  };
}

/**
 * Classe une sélection sous une balise (ou la retire, `null`) en un pas : géométrie nue, objets et annotations (n° 69,
 * n° 116). Rend le nombre d'entités classées.
 */
export function classerSelection(m: Modele, ids: readonly Id[], balise: Id | null, dans?: Id): Resultat & { extra: number } {
  if (balise !== null && !baliseDe(m, balise)) throw new RangeError("Balise introuvable.");
  const geo = baliserEntites(m, ids, balise, dans !== undefined ? { dans } : {});
  const r = modifierAnnotations(geo.modele, (a) => {
    let n = 0;
    const poser = <T extends { readonly balise?: Id }>(x: T): T => {
      n++;
      const { balise: _b, ...reste } = x;
      return (balise ? { ...reste, balise } : reste) as T;
    };
    for (const id of ids) {
      if (a.cotes[id]) a.cotes[id] = poser(a.cotes[id]!);
      if (a.textes[id]) a.textes[id] = poser(a.textes[id]!);
      if (a.plansDeCoupe[id]) a.plansDeCoupe[id] = poser(a.plansDeCoupe[id]!);
    }
    return n;
  });
  return { ...r, extra: geo.extra + r.extra };
}

/** Balises réservées : chaque genre désigne une balise existante, ou rien. */
export function poserBalisesReservees(m: Modele, r: BalisesReservees): Resultat {
  for (const g of GENRES_RESERVES) if (r[g] !== undefined && !baliseDe(m, r[g])) throw new RangeError("Balise réservée introuvable.");
  return modifierAnnotations(m, (a) => {
    const { balisesReservees: _r, ...reste } = a.reglages ?? REGLAGES_DEFAUT;
    const propre = Object.fromEntries(GENRES_RESERVES.filter((g) => r[g] !== undefined).map((g) => [g, r[g]!])) as BalisesReservees;
    a.reglages = Object.keys(propre).length ? { ...reste, balisesReservees: propre } : reste;
  });
}

/**
 * Pose la balise courante et les balises réservées sur ce qu'une opération vient de créer (n° 74, n° 63) : arêtes,
 * faces et objets nouveaux du contexte, cotes, textes et plans de coupe nouveaux. Ce qui a déjà une balise la garde.
 * Rend le modèle d'après inchangé (même référence) si rien n'est à poser.
 */
export function baliserNouveautes(avant: Modele, apres: Modele, courante: Id | null, dans?: Id): Modele {
  const reservees = apres.annotations?.reglages?.balisesReservees ?? {};
  const existe = (id: Id | null | undefined): id is Id => !!id && !!apres.annotations?.balises[id];
  const cour = existe(courante) ? courante : null;
  let m = apres;
  if (cour) {
    let c0: Contexte;
    let c1: Contexte;
    try {
      c0 = contexte(avant, dans);
      c1 = contexte(apres, dans);
    } catch {
      return apres;
    }
    const neufs = [
      ...Object.values(c1.aretes).filter((x) => !c0.aretes[x.id] && x.balise === undefined).map((x) => x.id),
      ...Object.values(c1.faces).filter((x) => !c0.faces[x.id] && x.balise === undefined).map((x) => x.id),
      ...Object.values(c1.occurrences).filter((x) => !c0.occurrences[x.id] && x.balise === undefined).map((x) => x.id),
    ];
    if (neufs.length) m = baliserEntites(m, neufs, cour, dans !== undefined ? { dans } : {}).modele;
  }
  const a0 = avant.annotations;
  const a1 = m.annotations;
  if (!a1) return m;
  const pour = (g: GenreReserve) => (existe(reservees[g]) ? reservees[g]! : cour);
  const cotes = Object.values(a1.cotes).filter((x) => !a0?.cotes[x.id] && x.balise === undefined);
  const textes = Object.values(a1.textes).filter((x) => !a0?.textes[x.id] && x.balise === undefined);
  const plans = Object.values(a1.plansDeCoupe).filter((x) => !a0?.plansDeCoupe[x.id] && x.balise === undefined);
  if ((!cotes.length || !pour("cotes")) && (!textes.length || !pour("textes")) && (!plans.length || !pour("plans"))) return m;
  return modifierAnnotations(m, (a) => {
    const b = pour("cotes");
    if (b) for (const x of cotes) a.cotes[x.id] = { ...x, balise: b } as Cote;
    const bt = pour("textes");
    if (bt) for (const x of textes) a.textes[x.id] = { ...x, balise: bt } as TexteAnnotation;
    const bp = pour("plans");
    if (bp) for (const x of plans) a.plansDeCoupe[x.id] = { ...x, balise: bp };
  }).modele;
}

// ————————————————————————————————————————————————————————————— Plans de coupe

/** Distance signée du plan à l'origine du dessin, le long de sa normale (m). */
export const distancePlan = (p: PlanDeCoupe): number => dot(p.origine, normalize(p.normale));

function planDe(m: Modele, id: Id): PlanDeCoupe {
  const p = m.annotations?.plansDeCoupe[id];
  if (!p) throw new RangeError("Plan de coupe introuvable.");
  return p;
}

/** Place le plan à la distance donnée le long de sa normale (n° 66). */
export function placerPlan(m: Modele, id: Id, distance: number): Resultat {
  if (!Number.isFinite(distance)) throw new RangeError("Distance : saisissez un nombre.");
  const p = planDe(m, id);
  return decalerPlan(m, id, distance - distancePlan(p));
}

/** Avance (ou recule) le plan le long de sa normale (n° 66, glissière et pas). */
export function decalerPlan(m: Modele, id: Id, delta: number): Resultat {
  if (!Number.isFinite(delta)) throw new RangeError("Distance : saisissez un nombre.");
  const p = planDe(m, id);
  return modifierAnnotations(m, (a) => void (a.plansDeCoupe[id] = { ...p, origine: add(p.origine, scale(normalize(p.normale), delta)) }));
}

/** Limite la profondeur vue au-delà de la coupe (n° 59) ; `null` = sans limite. */
export function limiterProfondeur(m: Modele, id: Id, profondeur: number | null): Resultat {
  if (profondeur !== null && !(profondeur > 0)) throw new RangeError("Profondeur vue : saisissez une valeur positive.");
  const p = planDe(m, id);
  const { profondeur: _p, ...reste } = p;
  return modifierAnnotations(m, (a) => void (a.plansDeCoupe[id] = profondeur === null ? reste : { ...reste, profondeur }));
}

/** Le point est-il gardé par la coupe (côté conservé, et dans la profondeur vue s'il y en a une) ? */
export function gardeParCoupe(p: PlanDeCoupe, q: Vec3): boolean {
  const s = dot(sub(q, p.origine), p.normale) * (p.inverse ? -1 : 1);
  return s <= 1e-9 && (p.profondeur === undefined || -s <= p.profondeur + 1e-9);
}

// ————————————————————————————————————————————————————————————— Scènes

export interface SoleilScene {
  /** Jour de l'année (1–365). */
  readonly jour: number;
  /** Heure décimale (0–24). */
  readonly heure: number;
  /** (Cas 2, lot 5) Année de la date choisie au calendrier : le rang du jour se relit dans la bonne année. */
  readonly annee?: number;
}

export interface EtatScene {
  readonly balisesVisibles: readonly Id[];
  readonly plansActifs: readonly Id[];
  /** Objets de la racine masqués. */
  readonly masques: readonly Id[];
  /** Style des faces (option d'affichage), s'il est mémorisé. */
  readonly style?: string;
}

/** État de la vue mémorisable : balises visibles, plans de coupe actifs, objets masqués de la racine, style. */
export function capturerEtatScene(m: Modele, style?: string): EtatScene {
  const a = m.annotations;
  return {
    balisesVisibles: Object.values(a?.balises ?? {}).filter((b) => b.visible).map((b) => b.id),
    plansActifs: Object.values(a?.plansDeCoupe ?? {}).filter((p) => p.actif).map((p) => p.id),
    masques: Object.values(m.racine.occurrences).filter((o) => o.masquee).map((o) => o.id),
    ...(style ? { style } : {}),
  };
}

/** Rappelle l'état mémorisé (n° 11) : visibilité des balises, plans actifs, objets masqués de la racine. */
export function appliquerEtatScene(m: Modele, e: EtatScene): Modele {
  const visibles = new Set(e.balisesVisibles);
  const actifs = new Set(e.plansActifs);
  const masques = new Set(e.masques);
  let r = modifierAnnotations(m, (a) => {
    for (const b of Object.values(a.balises)) if (b.visible !== visibles.has(b.id)) a.balises[b.id] = { ...b, visible: visibles.has(b.id) };
    for (const p of Object.values(a.plansDeCoupe)) if (p.actif !== actifs.has(p.id)) a.plansDeCoupe[p.id] = { ...p, actif: actifs.has(p.id) };
  }).modele;
  const changes = Object.values(r.racine.occurrences).filter((o) => (o.masquee === true) !== masques.has(o.id));
  if (changes.length) {
    r = {
      ...r,
      racine: {
        ...r.racine,
        occurrences: Object.fromEntries(
          Object.values(r.racine.occurrences).map((o) => {
            if (!changes.includes(o)) return [o.id, o];
            const { masquee: _m, ...reste } = o;
            return [o.id, masques.has(o.id) ? { ...reste, masquee: true } : reste];
          }),
        ),
      },
    };
  }
  return r;
}

export interface ChangementScene {
  /** Dénominateur de l'échelle nominale ; `null` retire l'échelle. */
  readonly echelle?: number | null;
  readonly soleil?: SoleilScene | null;
  readonly etat?: EtatScene | null;
  readonly nom?: string;
}

/** Modifie une scène : échelle nominale (n° 43), soleil (n° 108), état mémorisé (n° 11), nom. */
export function modifierScene(m: Modele, id: Id, v: ChangementScene): Resultat {
  const s = m.annotations?.scenes?.[id];
  if (!s) throw new RangeError("Scène introuvable.");
  if (v.echelle !== undefined && v.echelle !== null && !(Number.isInteger(v.echelle) && v.echelle >= 1 && v.echelle <= 100000)) throw new RangeError("Échelle nominale : saisissez 1:n, n entier.");
  if (v.soleil && !(v.soleil.jour >= 1 && v.soleil.jour <= 366 && v.soleil.heure >= 0 && v.soleil.heure <= 24 && (v.soleil.annee === undefined || (Number.isInteger(v.soleil.annee) && v.soleil.annee >= 1 && v.soleil.annee <= 9999)))) throw new RangeError("Date et heure du soleil invalides.");
  if (v.nom !== undefined && !v.nom.trim()) throw new RangeError("Une scène demande un nom.");
  return modifierAnnotations(m, (a) => {
    const { echelle, soleil, etat, ...reste } = s;
    const e = v.echelle === undefined ? echelle : v.echelle ?? undefined;
    const so = v.soleil === undefined ? soleil : v.soleil ?? undefined;
    const et = v.etat === undefined ? etat : v.etat ?? undefined;
    a.scenes[id] = { ...reste, ...(v.nom !== undefined ? { nom: v.nom.trim() } : {}), ...(e !== undefined ? { echelle: e } : {}), ...(so ? { soleil: so } : {}), ...(et ? { etat: et } : {}) };
  });
}

/** Lit une échelle saisie « 1:100 », « 1/100 » ou « 100 » ; `null` si illisible. */
export function lireEchelle(texte: string): number | null {
  const t = texte.trim().replace(/\s+/g, "");
  const x = /^(?:1[:/])?(\d{1,6})$/.exec(t);
  if (!x) return null;
  const n = Number(x[1]);
  return n >= 1 ? n : null;
}

/** Jour de l'année d'une date ISO (AAAA-MM-JJ), ou `null`. */
export function jourDeLAnnee(iso: string): number | null {
  const x = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!x) return null;
  const d = Date.UTC(Number(x[1]), Number(x[2]) - 1, Number(x[3]));
  if (Number.isNaN(d)) return null;
  return Math.floor((d - Date.UTC(Number(x[1]), 0, 1)) / 86400000) + 1;
}

/** Date ISO (année donnée) d'un jour de l'année. */
export function dateDuJour(jour: number, annee: number): string {
  return new Date(Date.UTC(annee, 0, jour)).toISOString().slice(0, 10);
}

export type CameraScene = Pick<Scene, "position" | "cible" | "champDeVision" | "projection">;
/** Champ de vision de référence des scènes calculées (la projection parallèle garde la demi-hauteur, D-053). */
export const CHAMP_SCENE = 35;

interface Emprise {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Emprise du modèle visible (racine et objets) ; `null` s'il est vide. */
export function empriseModele(m: Modele): Emprise | null {
  const g = geometrieVisible(m);
  const pts = [...g.aretes.flatMap((a) => [a.a, a.b]), ...g.faces.flatMap((f) => f.exterieur)];
  if (!pts.length) return null;
  const min = pts.reduce((u, p) => v3(Math.min(u.x, p.x), Math.min(u.y, p.y), Math.min(u.z, p.z)));
  const max = pts.reduce((u, p) => v3(Math.max(u.x, p.x), Math.max(u.y, p.y), Math.max(u.z, p.z)));
  return { min, max };
}

/** Caméra parallèle regardant `cible` depuis la direction `dir` (de la cible vers l'œil), cadrant une taille donnée. */
function cameraVers(cible: Vec3, dir: Vec3, taille: number): CameraScene {
  const d = Math.max(1, ((taille / 2) * 1.2) / Math.tan((CHAMP_SCENE * Math.PI) / 360));
  return { position: add(cible, scale(normalize(dir), d)), cible, champDeVision: CHAMP_SCENE, projection: "parallele" };
}

/** Scène face à un plan de coupe (n° 85) : caméra parallèle du côté caché vers le côté gardé, coupe seule active. */
export function sceneFaceCoupe(m: Modele, planId: Id, echelle: number | null, style?: string): Omit<Scene, "id"> {
  const p = planDe(m, planId);
  const e = empriseModele(m);
  const taille = e ? len(sub(e.max, e.min)) : Math.max(p.demiU, p.demiW) * 2;
  const vers = scale(normalize(p.normale), p.inverse ? -1 : 1);
  const etat = capturerEtatScene(m, style);
  return {
    nom: `Coupe ${p.nom}`,
    ...cameraVers(p.origine, vers, Math.max(taille, 1)),
    etat: { ...etat, plansActifs: [planId] },
    ...(echelle ? { echelle } : {}),
  };
}

export const GENRES_SCENE_TYPE = ["plans-niveaux", "facades", "coupes", "existant-demoli", "projete"] as const;
export type GenreSceneType = (typeof GENRES_SCENE_TYPE)[number];
export interface SceneType {
  readonly genre: GenreSceneType;
  /** Dénominateur de l'échelle nominale donnée par le gabarit ; absent = sans échelle. */
  readonly echelle?: number;
}

/**
 * Scènes types (n° 44) : la liste vient du gabarit d'agence ; chacune est calculée sur le modèle (plans par niveau d'étage,
 * quatre façades, une scène par plan de coupe, états existant / démoli et projeté). Rien n'est créé sans gabarit.
 */
export function scenesTypes(m: Modele, types: readonly SceneType[]): Omit<Scene, "id">[] {
  const e = empriseModele(m);
  if (!e) return [];
  const centre = scale(add(e.min, e.max), 0.5);
  const taille = Math.max(len(sub(e.max, e.min)), 1);
  const base = capturerEtatScene(m);
  const ech = (t: SceneType) => (t.echelle ? { echelle: t.echelle } : {});
  const r: Omit<Scene, "id">[] = [];
  for (const t of types) {
    if (t.genre === "plans-niveaux") {
      for (const n of Object.values(m.annotations?.niveaux ?? {}).sort((a, b) => a.altitude - b.altitude)) {
        r.push({ nom: `Plan ${n.nom}${t.echelle ? ` 1:${t.echelle}` : ""}`, ...cameraVers(v3(centre.x, centre.y, n.altitude), v3(0, 0, 1), taille), etat: base, ...ech(t) });
      }
    } else if (t.genre === "facades") {
      const f: [string, Vec3][] = [["sud", v3(0, -1, 0)], ["est", v3(1, 0, 0)], ["nord", v3(0, 1, 0)], ["ouest", v3(-1, 0, 0)]];
      for (const [nom, dir] of f) r.push({ nom: `Façade ${nom}${t.echelle ? ` 1:${t.echelle}` : ""}`, ...cameraVers(centre, dir, taille), etat: base, ...ech(t) });
    } else if (t.genre === "coupes") {
      for (const p of Object.values(m.annotations?.plansDeCoupe ?? {})) {
        const s = sceneFaceCoupe(m, p.id, t.echelle ?? null);
        r.push({ ...s, nom: `${s.nom}${t.echelle ? ` 1:${t.echelle}` : ""}` });
      }
    } else {
      const vue: VueEtat = t.genre === "existant-demoli" ? "existant" : "projet";
      const etat = capturerEtatScene(appliquerVueEtat(m, vue).modele);
      r.push({ nom: t.genre === "existant-demoli" ? "Existant et démoli" : "Projeté", position: add(centre, scale(normalize(v3(1, -1, 0.8)), taille * 1.4)), cible: centre, champDeVision: CHAMP_SCENE, projection: "perspective", etat, ...ech(t) });
    }
  }
  return r;
}

/** Ajoute des scènes en un pas ; rend leurs identifiants. */
export function ajouterScenes(m: Modele, scenes: readonly Omit<Scene, "id">[]): Resultat & { extra: Id[] } {
  return modifierAnnotations(m, (a, id) =>
    scenes.map((s) => {
      const k = id("v");
      a.scenes[k] = { id: k, ...s };
      return k;
    }),
  );
}

// ————————————————————————————————————————————————————————————— Gabarit d'agence (n° 9)

export const EXTENSION_GABARIT = ".fadi-gabarit.json";
export const FORMAT_GABARIT = "fadi-gabarit/1";

export interface BaliseGabarit {
  readonly nom: string;
  readonly couleur: string;
  readonly epaisseur?: number;
  readonly trait?: TraitBalise;
  readonly phase?: PhaseBalise;
  readonly verrouillee?: boolean;
}
export interface Gabarit {
  readonly format: typeof FORMAT_GABARIT;
  readonly nom: string;
  /** Origine déclarée du gabarit (agence, document de référence). */
  readonly source: string;
  readonly unite?: UniteSaisie;
  /** Pas de longueur de l'accrochage (m). */
  readonly pas?: number;
  readonly balises: readonly BaliseGabarit[];
  /** Balise réservée par genre, désignée par son nom. */
  readonly reservees?: Readonly<Partial<Record<GenreReserve, string>>>;
  readonly scenesTypes?: readonly SceneType[];
  readonly stylesCote?: readonly Omit<StyleCote, "id">[];
  readonly parametres?: readonly { readonly nom: string; readonly valeur: number }[];
  /** (Cas 2, lot 7) Statuts de la Planche proposés par l'agence (« Esquisse », « Permis »…), dans l'ordre. */
  readonly statuts?: readonly string[];
}
export interface GabaritApplique {
  readonly nom: string;
  readonly source: string;
  readonly nomFichier: string;
  /** Texte du fichier, archivé tel quel avec le modèle. */
  readonly texte: string;
  readonly scenesTypes: readonly SceneType[];
  readonly archive?: ArchiveFichier;
  readonly refusArchive?: MotifRefusArchive;
}

const UNITES: readonly UniteSaisie[] = ["m", "cm", "mm", "pieds-pouces"];
const estObjet = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Lit un gabarit d'agence ; il doit citer sa source et déclarer au moins une balise. Toute valeur invalide est refusée. */
export function lireGabarit(texte: string): { readonly ok: true; readonly gabarit: Gabarit } | { readonly ok: false; readonly erreur: string } {
  let j: unknown;
  try {
    j = JSON.parse(texte);
  } catch {
    return { ok: false, erreur: "Le fichier n'est pas un JSON lisible." };
  }
  if (!estObjet(j) || j["format"] !== FORMAT_GABARIT) return { ok: false, erreur: `Le fichier n'est pas un gabarit (format « ${FORMAT_GABARIT} » attendu).` };
  const nom = typeof j["nom"] === "string" ? j["nom"].trim() : "";
  const source = typeof j["source"] === "string" ? j["source"].trim() : "";
  if (!nom) return { ok: false, erreur: "Le gabarit doit porter un nom." };
  if (!source) return { ok: false, erreur: "Le gabarit doit citer sa source (agence, document de référence)." };
  const unite = j["unite"];
  if (unite !== undefined && !UNITES.includes(unite as UniteSaisie)) return { ok: false, erreur: "Unité inconnue." };
  const pas = j["pas"];
  if (pas !== undefined && !(typeof pas === "number" && pas > 0 && pas <= 1)) return { ok: false, erreur: "Pas de longueur : valeur positive en mètres, 1 m au plus." };
  const bal = j["balises"];
  if (!Array.isArray(bal) || !bal.length) return { ok: false, erreur: "Le gabarit ne déclare aucune balise." };
  const balises: BaliseGabarit[] = [];
  for (const b of bal) {
    if (!estObjet(b) || typeof b["nom"] !== "string" || !b["nom"].trim() || typeof b["couleur"] !== "string" || !/^#[0-9a-f]{6}$/i.test(b["couleur"])) return { ok: false, erreur: "Chaque balise demande un nom et une couleur (#rrggbb)." };
    const e = b["epaisseur"];
    if (e !== undefined && !(typeof e === "number" && e > 0 && e <= 10)) return { ok: false, erreur: `Balise « ${b["nom"]} » : épaisseur entre 0 et 10 mm.` };
    if (b["trait"] !== undefined && !TRAITS_BALISE.includes(b["trait"] as TraitBalise)) return { ok: false, erreur: `Balise « ${b["nom"]} » : type de trait inconnu.` };
    if (b["phase"] !== undefined && !PHASES_BALISE.includes(b["phase"] as PhaseBalise)) return { ok: false, erreur: `Balise « ${b["nom"]} » : phase inconnue.` };
    balises.push({
      nom: b["nom"].trim(),
      couleur: b["couleur"].toLowerCase(),
      ...(e !== undefined ? { epaisseur: e as number } : {}),
      ...(b["trait"] !== undefined ? { trait: b["trait"] as TraitBalise } : {}),
      ...(b["phase"] !== undefined ? { phase: b["phase"] as PhaseBalise } : {}),
      ...(b["verrouillee"] === true ? { verrouillee: true } : {}),
    });
  }
  const noms = new Set(balises.map((b) => b.nom));
  if (noms.size !== balises.length) return { ok: false, erreur: "Deux balises du gabarit portent le même nom." };
  const res = j["reservees"];
  if (res !== undefined) {
    if (!estObjet(res)) return { ok: false, erreur: "Balises réservées : objet { cotes, textes, plans } attendu." };
    for (const [g, n] of Object.entries(res)) if (!GENRES_RESERVES.includes(g as GenreReserve) || typeof n !== "string" || !noms.has(n)) return { ok: false, erreur: `Balise réservée « ${g} » : nom d'une balise du gabarit attendu.` };
  }
  const st = j["scenesTypes"];
  if (st !== undefined && (!Array.isArray(st) || st.some((s) => !estObjet(s) || !GENRES_SCENE_TYPE.includes(s["genre"] as GenreSceneType) || (s["echelle"] !== undefined && !(Number.isInteger(s["echelle"]) && (s["echelle"] as number) >= 1)))))
    return { ok: false, erreur: "Scènes types : genre connu et échelle entière attendus." };
  const sc = j["stylesCote"];
  if (sc !== undefined && (!Array.isArray(sc) || sc.some((s) => !estObjet(s) || typeof s["nom"] !== "string" || typeof s["extremites"] !== "string" || typeof s["aligner"] !== "string" || typeof s["format"] !== "string")))
    return { ok: false, erreur: "Styles de cote : nom, extrémités, alignement et format attendus." };
  const pa = j["parametres"];
  if (pa !== undefined && (!Array.isArray(pa) || pa.some((p) => !estObjet(p) || typeof p["nom"] !== "string" || !nomParametreProjetValide(p["nom"].trim()) || typeof p["valeur"] !== "number" || !Number.isFinite(p["valeur"]))))
    return { ok: false, erreur: "Paramètres : nom (une lettre, puis lettres, chiffres ou « _ ») et valeur (m) attendus." };
  const stt = j["statuts"];
  if (stt !== undefined && (!Array.isArray(stt) || stt.some((x) => typeof x !== "string" || !x.trim() || x.trim().length > 60)))
    return { ok: false, erreur: "Statuts : liste de libellés (60 caractères au plus) attendue." };
  return {
    ok: true,
    gabarit: {
      format: FORMAT_GABARIT,
      nom,
      source,
      ...(unite !== undefined ? { unite: unite as UniteSaisie } : {}),
      ...(pas !== undefined ? { pas: pas as number } : {}),
      balises,
      ...(res !== undefined ? { reservees: res as NonNullable<Gabarit["reservees"]> } : {}),
      ...(st !== undefined ? { scenesTypes: (st as SceneType[]).map((s) => ({ genre: s.genre, ...(s.echelle ? { echelle: s.echelle } : {}) })) } : {}),
      ...(sc !== undefined ? { stylesCote: sc as NonNullable<Gabarit["stylesCote"]> } : {}),
      ...(pa !== undefined ? { parametres: (pa as { nom: string; valeur: number }[]).map((p) => ({ nom: p.nom.trim(), valeur: p.valeur })) } : {}),
      ...(stt !== undefined ? { statuts: [...new Set((stt as string[]).map((x) => x.trim()))] } : {}),
    },
  };
}

/** Résumé d'un gabarit pour le panneau « Nouvelle Planche ». */
export function resumeGabarit(g: Gabarit): { readonly unite: UniteSaisie; readonly pas: number | null; readonly balises: number; readonly reservees: number; readonly scenesTypes: number } {
  return { unite: g.unite ?? "m", pas: g.pas ?? null, balises: g.balises.length, reservees: Object.keys(g.reservees ?? {}).length, scenesTypes: g.scenesTypes?.length ?? 0 };
}

/**
 * Modèle d'une nouvelle Planche créée depuis un gabarit (n° 9) : unité, pas de longueur, balises et balises réservées,
 * styles de cote, paramètres ; le fichier est gardé tel quel avec le modèle (et archivé en base par l'interface).
 */
export function modeleDepuisGabarit(g: Gabarit, fichier: { readonly nom: string; readonly texte: string }, archive?: { readonly archive?: ArchiveFichier; readonly refusArchive?: MotifRefusArchive }): Modele {
  return modifierAnnotations(modeleVide(), (a, id) => {
    const parNom = new Map<string, Id>();
    for (const b of g.balises) {
      const k = id("b");
      parNom.set(b.nom, k);
      a.balises[k] = { id: k, nom: b.nom, couleur: b.couleur, visible: true, ...(b.epaisseur !== undefined ? { epaisseur: b.epaisseur } : {}), ...(b.trait ? { trait: b.trait } : {}), ...(b.phase ? { phase: b.phase } : {}), ...(b.verrouillee ? { verrouillee: true } : {}) };
    }
    const reservees = Object.fromEntries(Object.entries(g.reservees ?? {}).map(([genre, nom]) => [genre, parNom.get(nom!)!])) as BalisesReservees;
    const styles = Object.fromEntries((g.stylesCote ?? []).map((s, i) => {
      const k = `style-cote-${i + 1}`;
      return [k, { ...s, id: k } as StyleCote];
    }));
    const parametres = Object.fromEntries((g.parametres ?? []).map((p) => {
      const k = id("q");
      return [k, { id: k, nom: p.nom, valeur: p.valeur }];
    }));
    const reglages: ReglagesPlanche = {
      ...REGLAGES_DEFAUT,
      ...(g.pas !== undefined ? { accrochageLongueur: g.pas } : {}),
      ...(g.unite ? { uniteSaisie: g.unite } : {}),
      ...(Object.keys(reservees).length ? { balisesReservees: reservees } : {}),
      ...(Object.keys(styles).length ? { stylesCote: styles } : {}),
      ...(Object.keys(parametres).length ? { parametres } : {}),
      gabarit: { nom: g.nom, source: g.source, nomFichier: fichier.nom, texte: fichier.texte, scenesTypes: g.scenesTypes ?? [], ...(archive?.archive ? { archive: archive.archive } : {}), ...(archive?.refusArchive ? { refusArchive: archive.refusArchive } : {}) },
    };
    a.reglages = reglages;
  }).modele;
}

/** Gabarit tiré de la Planche ouverte (« Enregistrer la Planche comme gabarit ») : rien de la géométrie, seulement ses réglages. */
export function gabaritDeLaPlanche(m: Modele, nom: string, source: string): Gabarit {
  if (!nom.trim()) throw new RangeError("Le gabarit doit porter un nom.");
  if (!source.trim()) throw new RangeError("Le gabarit doit citer sa source (agence, document de référence).");
  const a = m.annotations;
  const r = a?.reglages;
  const balises = Object.values(a?.balises ?? {});
  if (!balises.length) throw new RangeError("La Planche n'a aucune balise : un gabarit en demande au moins une.");
  const nomDe = (id: Id | undefined) => (id ? a?.balises[id]?.nom : undefined);
  const reservees = Object.fromEntries(GENRES_RESERVES.filter((g) => nomDe(r?.balisesReservees?.[g])).map((g) => [g, nomDe(r!.balisesReservees![g])!]));
  return {
    format: FORMAT_GABARIT,
    nom: nom.trim(),
    source: source.trim(),
    ...(r?.uniteSaisie ? { unite: r.uniteSaisie } : {}),
    ...(r?.accrochageLongueur ? { pas: r.accrochageLongueur } : {}),
    balises: balises.map((b) => ({ nom: b.nom, couleur: b.couleur, ...(b.epaisseur !== undefined ? { epaisseur: b.epaisseur } : {}), ...(b.trait ? { trait: b.trait } : {}), ...(b.phase ? { phase: b.phase } : {}), ...(b.verrouillee ? { verrouillee: true } : {}) })),
    ...(Object.keys(reservees).length ? { reservees } : {}),
    ...(r?.gabarit?.scenesTypes.length ? { scenesTypes: r.gabarit.scenesTypes } : {}),
    ...(r?.stylesCote && Object.keys(r.stylesCote).length ? { stylesCote: Object.values(r.stylesCote).map(({ id: _i, ...s }) => s) } : {}),
    ...(r?.parametres && Object.keys(r.parametres).length ? { parametres: Object.values(r.parametres).map((p) => ({ nom: p.nom, valeur: p.valeur })) } : {}),
  };
}
