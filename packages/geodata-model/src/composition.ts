/**
 * Composition d'une carte enregistrée (`geodata-composition/1`, concept § 5.1) : caméra, fond, couches **versionnées** et
 * leur ordre, styles, indicateur, seuils et filtre. Elle ne contient aucune adresse ni clé de fournisseur (INV : aucune
 * clé embarquée) et ne référence aucun projet. Déplacer la carte ne modifie pas la composition enregistrée : seul
 * l'enregistrement explicite l'écrit.
 */
import { seuilsValides, type MethodeClassification } from "./classification.js";

export const FORMAT_COMPOSITION = "geodata-composition/1";
export const MAX_COUCHES = 20;

export interface Camera {
  readonly lon: number;
  readonly lat: number;
  readonly zoom: number;
  /** Orientation en degrés (0 = nord en haut). */
  readonly cap: number;
}

export type StyleCouche =
  | { readonly mode: "simple"; readonly couleur: string }
  | {
      readonly mode: "thematique";
      readonly indicateurId: string;
      readonly methode: MethodeClassification;
      readonly seuils: readonly number[];
      readonly couleurs: readonly string[];
    };

export interface FiltreCouche {
  readonly propriete: string;
  readonly operateur: "egal" | "contient";
  readonly valeur: string;
}

export interface CoucheComposee {
  readonly coucheId: string;
  /** Version de données figée : une nouvelle publication ne la remplace pas (INV-07). */
  readonly versionId: string;
  readonly visible: boolean;
  /** 0 à 1. */
  readonly opacite: number;
  readonly style: StyleCouche;
  readonly filtre: FiltreCouche | null;
}

export interface Composition {
  readonly format: typeof FORMAT_COMPOSITION;
  readonly camera: Camera;
  /** Identifiant d'un fond : `neutre` ou un fond configuré ; jamais une adresse. */
  readonly fond: string;
  /** Ordre d'affichage : la première est dessous. */
  readonly couches: readonly CoucheComposee[];
}

export const COMPOSITION_INITIALE: Composition = Object.freeze({
  format: FORMAT_COMPOSITION,
  // Territoire par défaut : le Maroc entier (premier périmètre de données, concept § 1).
  camera: Object.freeze({ lon: -7.09, lat: 31.79, zoom: 4.6, cap: 0 }),
  fond: "neutre",
  couches: Object.freeze([]) as readonly CoucheComposee[],
});

export type ValidationComposition = { readonly ok: true; readonly composition: Composition } | { readonly ok: false; readonly erreurs: readonly string[] };

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const COULEUR = /^#[0-9a-fA-F]{6}$/;
const fini = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const objet = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function lireStyle(x: unknown, chemin: string, erreurs: string[]): StyleCouche | null {
  if (!objet(x)) return erreurs.push(`${chemin} : style absent`), null;
  if (x["mode"] === "simple") {
    if (typeof x["couleur"] !== "string" || !COULEUR.test(x["couleur"])) return erreurs.push(`${chemin}.couleur : couleur #rrggbb attendue`), null;
    return { mode: "simple", couleur: x["couleur"] };
  }
  if (x["mode"] === "thematique") {
    const { indicateurId, methode, seuils, couleurs } = x;
    if (typeof indicateurId !== "string" || !ID.test(indicateurId)) erreurs.push(`${chemin}.indicateurId : identifiant attendu`);
    if (methode !== "quantiles" && methode !== "intervalles-egaux" && methode !== "manuel") erreurs.push(`${chemin}.methode : quantiles, intervalles-egaux ou manuel`);
    if (!Array.isArray(seuils) || seuils.length > 9 || !seuils.every(fini) || !seuilsValides(seuils)) erreurs.push(`${chemin}.seuils : au plus 9 nombres strictement croissants`);
    if (!Array.isArray(couleurs) || !couleurs.every((c) => typeof c === "string" && COULEUR.test(c)) || (Array.isArray(seuils) && couleurs.length !== seuils.length + 1)) erreurs.push(`${chemin}.couleurs : une couleur #rrggbb par classe (seuils + 1)`);
    if (erreurs.length) return null;
    return { mode: "thematique", indicateurId: indicateurId as string, methode: methode as MethodeClassification, seuils: [...(seuils as number[])], couleurs: [...(couleurs as string[])] };
  }
  return erreurs.push(`${chemin}.mode : simple ou thematique`), null;
}

function lireFiltre(x: unknown, chemin: string, erreurs: string[]): FiltreCouche | null {
  if (x === null || x === undefined) return null;
  if (!objet(x) || typeof x["propriete"] !== "string" || !/^[\p{L}\p{N}_ -]{1,64}$/u.test(x["propriete"]) || (x["operateur"] !== "egal" && x["operateur"] !== "contient") || typeof x["valeur"] !== "string" || x["valeur"].length > 200) {
    erreurs.push(`${chemin} : filtre { propriete, operateur egal|contient, valeur ≤ 200 caractères } attendu`);
    return null;
  }
  return { propriete: x["propriete"], operateur: x["operateur"], valeur: x["valeur"] };
}

export function validerComposition(x: unknown): ValidationComposition {
  const erreurs: string[] = [];
  if (!objet(x)) return { ok: false, erreurs: ["composition : objet attendu"] };
  if (x["format"] !== FORMAT_COMPOSITION) erreurs.push(`format : ${FORMAT_COMPOSITION} attendu`);
  const texte = JSON.stringify(x);
  if (texte.length > 64_000) erreurs.push("composition : 64 000 caractères au plus");
  if (/https?:|\/\/|[?&](key|token|access_token|apikey)=/i.test(texte)) erreurs.push("composition : aucune adresse ni clé de fournisseur ne peut y figurer");
  const c = x["camera"];
  let camera: Camera | null = null;
  if (!objet(c) || !fini(c["lon"]) || !fini(c["lat"]) || !fini(c["zoom"]) || !fini(c["cap"]) || c["lon"] < -180 || c["lon"] > 180 || c["lat"] < -85.06 || c["lat"] > 85.06 || c["zoom"] < 0 || c["zoom"] > 22) {
    erreurs.push("camera : { lon −180..180, lat −85..85, zoom 0..22, cap } attendus");
  } else camera = { lon: c["lon"], lat: c["lat"], zoom: c["zoom"], cap: ((c["cap"] % 360) + 360) % 360 };
  if (typeof x["fond"] !== "string" || !ID.test(x["fond"])) erreurs.push("fond : identifiant de fond attendu");
  const couches: CoucheComposee[] = [];
  if (!Array.isArray(x["couches"]) || x["couches"].length > MAX_COUCHES) erreurs.push(`couches : liste de ${MAX_COUCHES} couches au plus`);
  else {
    const vus = new Set<string>();
    x["couches"].forEach((k: unknown, i: number) => {
      const chemin = `couches[${i}]`;
      if (!objet(k)) return void erreurs.push(`${chemin} : objet attendu`);
      const { coucheId, versionId, visible, opacite } = k;
      if (typeof coucheId !== "string" || !ID.test(coucheId)) erreurs.push(`${chemin}.coucheId : identifiant attendu`);
      else if (vus.has(coucheId)) erreurs.push(`${chemin}.coucheId : couche en double`);
      else vus.add(coucheId);
      if (typeof versionId !== "string" || !ID.test(versionId)) erreurs.push(`${chemin}.versionId : version figée attendue`);
      if (typeof visible !== "boolean") erreurs.push(`${chemin}.visible : booléen attendu`);
      if (!fini(opacite) || opacite < 0 || opacite > 1) erreurs.push(`${chemin}.opacite : 0 à 1`);
      const style = lireStyle(k["style"], `${chemin}.style`, erreurs);
      const filtre = lireFiltre(k["filtre"], `${chemin}.filtre`, erreurs);
      if (style && typeof coucheId === "string" && typeof versionId === "string" && typeof visible === "boolean" && fini(opacite)) {
        couches.push({ coucheId, versionId, visible, opacite, style, filtre });
      }
    });
  }
  if (erreurs.length || !camera) return { ok: false, erreurs };
  return { ok: true, composition: { format: FORMAT_COMPOSITION, camera, fond: x["fond"] as string, couches } };
}

/** Sérialisation canonique (clés triées) : PostgreSQL `jsonb` réordonne les clés, l'ordre ne doit jamais compter. */
export function canonique(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonique).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonique((x as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(x) ?? "null";
}

/** Deux compositions sont-elles identiques (pour signaler « modifications non enregistrées ») ? La caméra compte. */
export const memeComposition = (a: Composition, b: Composition): boolean => canonique(a) === canonique(b);
