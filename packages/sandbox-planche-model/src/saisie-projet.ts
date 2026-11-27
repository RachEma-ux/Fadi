/**
 * Cas 2 du catalogue, lot 2 « Accrochage et saisie » (maquettes lot2-2 à lot2-4 validées le 27 novembre 2026) : ce que
 * le champ Mesures et le Mètre lisent du projet, et les opérations de saisie précise.
 *
 * - Unité d'affichage et de saisie (n° 21) : un réglage d'affichage ; les valeurs stockées restent en mètres. Le
 *   changement est contrôlé : chaque coordonnée et chaque réglage de longueur est comparé avant et après, l'écart doit
 *   être nul.
 * - Paramètres nommés du projet (n° 93) : valeurs saisies par l'utilisateur, employables dans toute saisie.
 * - Longueur d'une arête et coordonnées d'un sommet modifiables (n° 34), remise à l'échelle d'un seul import par une
 *   distance connue (n° 47), mesure du Mètre décomposée (n° 27), guide répété en réseau (n° 87), répartition entre deux
 *   bornes (n° 103), chanfrein et ressaut (n° 83).
 * Aucune valeur réglementaire n'est fournie : le ressaut maximal est saisi avec sa source, sinon « non évalué ».
 */
import { type ParametreProjet, type ReglagesPlanche, type UniteSaisie, REGLAGES_DEFAUT } from "./annotations.js";
import { type Id, type Modele, type Resultat, copier, deplacer, mettreAEchelle, modifierAnnotations } from "./geometrie-libre.js";
import type { UniteLongueur } from "./saisie-vcb.js";
import { type Vec3, TOL, add, dist, dot, len, normalize, scale, sub, v3 } from "./vecteur.js";

const reglages = (m: Modele): ReglagesPlanche => m.annotations?.reglages ?? REGLAGES_DEFAUT;

/** Unité d'une valeur nue dans le champ Mesures (pieds-pouces : le pouce). */
export function uniteDeSaisie(u: UniteSaisie | undefined): UniteLongueur {
  return u === "cm" ? "cm" : u === "mm" ? "mm" : u === "pieds-pouces" ? "in" : "m";
}

/** Contexte du champ Mesures tiré du projet : unité d'une valeur nue et paramètres nommés. */
export function saisieDuProjet(m: Modele): { uniteModele: UniteLongueur; parametres?: Readonly<Record<string, number>> } {
  const r = reglages(m);
  const ps = Object.values(r.parametres ?? {});
  return { uniteModele: uniteDeSaisie(r.uniteSaisie), ...(ps.length ? { parametres: Object.fromEntries(ps.map((p) => [p.nom, p.valeur])) } : {}) };
}

/** Longueur affichée dans l'unité choisie (« 2,40 m », « 240 cm », « 2400 mm », « 7' 10 1/2" »). */
export function formaterLongueurUnite(metres: number, unite: UniteSaisie | undefined, sep: "." | ",", decimales = 2): string {
  const signe = metres < 0 ? "-" : "";
  const v = Math.abs(metres);
  const n = (x: number, d: number) => x.toFixed(d).replace(".", sep);
  switch (unite ?? "m") {
    case "cm":
      return `${signe}${n(v * 100, Math.max(0, decimales - 2))} cm`;
    case "mm":
      return `${signe}${n(v * 1000, 0)} mm`;
    case "pieds-pouces": {
      const pouces = Math.round((v / 0.0254) * 8) / 8;
      const pieds = Math.floor(pouces / 12);
      const reste = pouces - pieds * 12;
      const entier = Math.floor(reste);
      const huitiemes = Math.round((reste - entier) * 8);
      const frac = huitiemes === 0 ? "" : ` ${huitiemes / gcd(huitiemes, 8)}/${8 / gcd(huitiemes, 8)}`;
      return `${signe}${pieds}' ${entier}${frac}"`;
    }
    default:
      return `${signe}${n(v, decimales)} m`;
  }
}
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Empreinte de toutes les longueurs stockées : coordonnées des sommets (tous contextes) et réglages de longueur. */
function valeursStockees(m: Modele): number[] {
  const r: number[] = [];
  const parcourir = (c: Modele["racine"]) => {
    for (const s of Object.values(c.sommets)) r.push(s.position.x, s.position.y, s.position.z);
    for (const o of Object.values(c.occurrences)) r.push(...o.transformation);
  };
  parcourir(m.racine);
  for (const d of Object.values(m.definitions)) parcourir(d.contenu);
  const g = reglages(m);
  if (g.accrochageLongueur != null) r.push(g.accrochageLongueur);
  for (const p of Object.values(g.parametres ?? {})) r.push(p.valeur);
  return r;
}

/**
 * (N° 21) Change l'unité d'affichage et de saisie. Seul le réglage change ; le contrôle compare toutes les valeurs
 * stockées avant et après et compte les écarts (attendu : 0). Un écart non nul refuse le changement.
 */
export function changerUnite(m: Modele, unite: UniteSaisie): Resultat & { controle: { valeurs: number; ecarts: number } } {
  const avant = valeursStockees(m);
  const r = modifierAnnotations(m, (a) => {
    const base = a.reglages ?? REGLAGES_DEFAUT;
    a.reglages = { ...base, uniteSaisie: unite };
  });
  const apres = valeursStockees(r.modele);
  let ecarts = Math.abs(avant.length - apres.length);
  for (let i = 0; i < Math.min(avant.length, apres.length); i++) if (avant[i] !== apres[i]) ecarts++;
  if (ecarts > 0) throw new RangeError(`Changement d'unité refusé : ${ecarts} valeur(s) stockée(s) auraient changé.`);
  return { modele: r.modele, rapport: r.rapport, controle: { valeurs: avant.length, ecarts } };
}

/** Un nom de paramètre : une lettre puis lettres, chiffres ou « _ » (employable tel quel dans le champ Mesures). */
export function nomParametreProjetValide(nom: string): boolean {
  return /^[\p{L}_][\p{L}\d_]*$/u.test(nom);
}

/** (N° 93) Ajoute ou modifie un paramètre nommé du projet (valeur saisie par l'utilisateur, en mètres). */
export function poserParametre(m: Modele, p: { id?: Id; nom: string; valeur: number }): Resultat & { extra: Id } {
  if (!nomParametreProjetValide(p.nom)) throw new RangeError("Nom de paramètre invalide : une lettre, puis lettres, chiffres ou « _ ».");
  if (!Number.isFinite(p.valeur)) throw new RangeError("Valeur de paramètre invalide.");
  const existants = Object.values(reglages(m).parametres ?? {});
  if (existants.some((x) => x.nom === p.nom && x.id !== p.id)) throw new RangeError(`Le paramètre « ${p.nom} » existe déjà.`);
  return modifierAnnotations(m, (a, nouvelId) => {
    const id = p.id ?? nouvelId("q");
    const base = a.reglages ?? REGLAGES_DEFAUT;
    const parametres: Record<Id, ParametreProjet> = { ...(base.parametres ?? {}), [id]: { id, nom: p.nom, valeur: p.valeur } };
    a.reglages = { ...base, parametres };
    return id;
  });
}

export function supprimerParametre(m: Modele, id: Id): Resultat {
  return modifierAnnotations(m, (a) => {
    if (!a.reglages?.parametres?.[id]) return;
    const { [id]: _x, ...reste } = a.reglages.parametres;
    a.reglages = { ...a.reglages, parametres: reste };
  });
}

// ————————————————————————————————————————————————————————————— Mètre (n° 27)

export interface MesureDecomposee {
  readonly longueur: number;
  readonly horizontale: number;
  /** Dénivelé signé (arrivée − départ) le long de l'axe vertical. */
  readonly denivele: number;
  /** Pente en pour cent (null pour une mesure verticale). */
  readonly pentePourcent: number | null;
  readonly angleDegres: number;
  /** Altitude du point d'arrivée rapportée au ±0,00 du projet (cote z). */
  readonly altitude: number;
  /** Altitude NGF : seulement si l'altitude du ±0,00 est déclarée dans Emplacement, sinon null (« NGF ? »). */
  readonly altitudeNgf: number | null;
}

/** Décompose une mesure du Mètre ; `zero` = altitude NGF déclarée du ±0,00 (Emplacement), sinon absente. */
export function decomposerMesure(a: Vec3, b: Vec3, zero?: number | null, vertical: Vec3 = v3(0, 0, 1)): MesureDecomposee {
  const z = normalize(vertical);
  const d = sub(b, a);
  const denivele = dot(d, z);
  const horizontale = len(sub(d, scale(z, denivele)));
  const longueur = len(d);
  return {
    longueur,
    horizontale,
    denivele,
    pentePourcent: horizontale > TOL ? (denivele / horizontale) * 100 : null,
    angleDegres: (Math.atan2(denivele, horizontale) * 180) / Math.PI,
    altitude: dot(b, z),
    altitudeNgf: zero == null ? null : zero + dot(b, z),
  };
}

// ————————————————————————————————————————————————————————————— Répartition entre deux bornes (n° 103)

export type RegleRepartition = "entraxe-max" | "vide-max" | "nombre";

/**
 * Nombre d'éléments et entraxe pour répartir entre deux bornes distantes de `longueur`, les éléments (largeur `largeur`
 * le long de la ligne) posés aux deux bornes comprises. Entraxe maximal : intervalles = ⌈L / e⌉ ; vide maximal :
 * intervalles = ⌈(L − l) / (v + l)⌉ ; nombre : éléments imposés (≥ 2).
 */
export function repartition(longueur: number, regle: RegleRepartition, valeur: number, largeur = 0): { elements: number; entraxe: number; vide: number } {
  if (!(longueur > TOL)) throw new RangeError("Les deux bornes sont confondues.");
  if (!(valeur > 0)) throw new RangeError("Saisissez une valeur positive.");
  let intervalles: number;
  if (regle === "nombre") {
    if (!Number.isInteger(valeur) || valeur < 2) throw new RangeError("Au moins deux éléments.");
    intervalles = valeur - 1;
  } else if (regle === "entraxe-max") intervalles = Math.max(1, Math.ceil(longueur / valeur - 1e-9));
  else {
    if (largeur >= longueur) throw new RangeError("L'élément est plus large que l'intervalle à répartir.");
    intervalles = Math.max(1, Math.ceil((longueur - largeur) / (valeur + largeur) - 1e-9));
  }
  const entraxe = longueur / intervalles;
  return { elements: intervalles + 1, entraxe, vide: entraxe - largeur };
}

/**
 * Copie les entités entre deux bornes : l'original est supposé posé à la borne `a` ; copies au pas de l'entraxe jusqu'à
 * la borne `b` comprise. Une seule opération.
 */
export function repartir(m: Modele, entites: readonly Id[], a: Vec3, b: Vec3, regle: RegleRepartition, valeur: number, largeur = 0, o: { dans?: Id } = {}): Resultat & { extra: { elements: number; entraxe: number } } {
  const r = repartition(dist(a, b), regle, valeur, largeur);
  const pas = scale(normalize(sub(b, a)), r.entraxe);
  const res = copier(m, entites, pas, { copies: r.elements - 1 }, o.dans !== undefined ? { dans: o.dans } : {});
  return { ...res, extra: { elements: r.elements, entraxe: r.entraxe } };
}

// ————————————————————————————————————————————————————————————— Guide en réseau (n° 87)

/** Répète un guide : `copies` copies au pas `pas` (« x5 »), ou `divisions` intervalles du pas (« /5 »). */
export function repeterGuide(m: Modele, guide: Id, pas: Vec3, reseau: { copies: number } | { divisions: number }): Resultat & { extra: Id[] } {
  const g = m.annotations?.guides[guide];
  if (!g) throw new RangeError("Guide introuvable.");
  const n = "copies" in reseau ? reseau.copies : reseau.divisions;
  if (!Number.isInteger(n) || n < 1) throw new RangeError("Nombre de répétitions invalide.");
  const decalages: Vec3[] = [];
  if ("copies" in reseau) for (let k = 1; k <= n; k++) decalages.push(scale(pas, k));
  else for (let k = 1; k < n; k++) decalages.push(scale(pas, -k / n));
  return modifierAnnotations(m, (an, nouvelId) => {
    const ids: Id[] = [];
    for (const d of decalages) {
      const id = nouvelId("g");
      an.guides[id] =
        g.genre === "segment" ? { id, genre: "segment", origine: add(g.origine, d), fin: add(g.fin, d) } : g.genre === "ligne" ? { id, genre: "ligne", origine: add(g.origine, d), direction: g.direction } : { id, genre: "point", origine: add(g.origine, d) };
      ids.push(id);
    }
    return ids;
  });
}

// ————————————————————————————————————————————————————————————— Arête et sommets (n° 34)

/** Sommets monde d'une arête de la racine. */
function areteRacine(m: Modele, arete: Id): { a: Id; b: Id; pa: Vec3; pb: Vec3 } {
  const x = m.racine.aretes[arete];
  if (!x) throw new RangeError("Arête introuvable (seules les arêtes du contexte ouvert se modifient).");
  const pa = m.racine.sommets[x.a]?.position;
  const pb = m.racine.sommets[x.b]?.position;
  if (!pa || !pb) throw new RangeError("Arête incomplète.");
  return { a: x.a, b: x.b, pa, pb };
}

/** Longueur d'une arête : le second sommet glisse le long de l'arête ; la géométrie connectée suit (une opération). */
export function changerLongueurArete(m: Modele, arete: Id, longueur: number): Resultat {
  if (!Number.isFinite(longueur) || longueur <= TOL) throw new RangeError("Saisissez une longueur positive.");
  const x = areteRacine(m, arete);
  const L = dist(x.pa, x.pb);
  if (L <= TOL) throw new RangeError("Arête de longueur nulle.");
  return deplacer(m, [x.b], scale(normalize(sub(x.pb, x.pa)), longueur - L));
}

/** Coordonnées d'un sommet : le sommet est déplacé à la position saisie ; la géométrie connectée suit. */
export function placerSommet(m: Modele, sommet: Id, position: Vec3): Resultat {
  const p = m.racine.sommets[sommet]?.position;
  if (!p) throw new RangeError("Sommet introuvable.");
  return deplacer(m, [sommet], sub(position, p));
}

// ————————————————————————————————————————————————————————————— Remise à l'échelle d'un import (n° 47)

/**
 * Remet à l'échelle un seul objet (un import) par une distance connue : facteur = réelle / mesurée, autour de l'origine
 * donnée (par défaut le premier point mesuré). Le reste du modèle ne bouge pas.
 */
export function remettreAEchelleImport(m: Modele, occurrence: Id, mesuree: number, reelle: number, origine: Vec3): Resultat & { facteur: number } {
  if (!m.racine.occurrences[occurrence]) throw new RangeError("Choisissez l'objet importé à remettre à l'échelle.");
  if (!(mesuree > TOL) || !(reelle > TOL)) throw new RangeError("Les deux distances doivent être positives.");
  const facteur = reelle / mesuree;
  return { ...mettreAEchelle(m, [occurrence], origine, facteur), facteur };
}

// ————————————————————————————————————————————————————————————— Chanfrein et ressaut (n° 83)

/** Point d'arrivée d'un chanfrein : course horizontale = hauteur / pente dans la direction donnée, montée = hauteur. */
export function pointChanfrein(depart: Vec3, direction: Vec3, pente: number, hauteur: number, vertical: Vec3 = v3(0, 0, 1)): Vec3 | null {
  const z = normalize(vertical);
  const h = sub(direction, scale(z, dot(direction, z)));
  if (len(h) <= TOL || pente <= 0) return null;
  return add(add(depart, scale(normalize(h), Math.abs(hauteur) / pente)), scale(z, hauteur));
}

/** Ressaut comparé au maximum saisi : « non évalué » sans valeur saisie, jamais de seuil fourni par Fadi. */
export function controlerRessaut(m: Modele, hauteur: number): { etat: "non-evalue" } | { etat: "conforme" | "au-dessus"; max: number; source: string } {
  const r = reglages(m).ressautMax;
  if (!r) return { etat: "non-evalue" };
  return { etat: Math.abs(hauteur) > r.valeur + 1e-9 ? "au-dessus" : "conforme", max: r.valeur, source: r.source };
}
