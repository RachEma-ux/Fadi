/**
 * Repère altimétrique du site (D-067, fiche DA-05-04, R5) : `site.altimetrie.definir` { altitude, systeme, source }
 * déclare l'altitude absolue de la cote locale ±0,00 (altitude 0 des niveaux) dans un système nommé par
 * l'utilisateur (par exemple « NGF-IGN69 », « RAN95 ») avec sa source (relevé, plan de géomètre…). Rien n'est
 * déduit : sans déclaration, l'altitude absolue d'un niveau est « non évaluée ». `altitude: null` retire la
 * déclaration. Stocké dans les propriétés du projet (`site:altimetrie:*`, provenance « saisie »).
 */
import type { ModeleAtelier } from "../modele.js";
import { effetsVides, ErreurCommande, lire, type ResultatCommande } from "./base.js";

type Brut = Record<string, unknown>;

export interface Altimetrie {
  /** Altitude absolue de la cote locale 0 (m). */
  altitude: number;
  systeme: string;
  source: string;
}

export function altimetrieDu(etat: ModeleAtelier): Altimetrie | null {
  const a = etat.proprietes["site:altimetrie:altitude"]?.valeur;
  const s = etat.proprietes["site:altimetrie:systeme"]?.valeur;
  const src = etat.proprietes["site:altimetrie:source"]?.valeur;
  return typeof a === "number" && Number.isFinite(a) && typeof s === "string" ? { altitude: a, systeme: s, source: typeof src === "string" ? src : "" } : null;
}

/** Altitude absolue d'une altitude locale (m), ou null si le repère n'est pas déclaré. */
export function altitudeAbsolue(etat: ModeleAtelier, elevationLocale: number): number | null {
  const r = altimetrieDu(etat);
  return r ? Math.round((r.altitude + elevationLocale) * 1e6) / 1e6 : null;
}

export function definirAltimetrie(etat: ModeleAtelier, p: Brut): ResultatCommande {
  const proprietes = { ...etat.proprietes };
  const effets = effetsVides();
  effets.modifies.push("site:altimetrie");
  if (p["altitude"] === null) {
    delete proprietes["site:altimetrie:altitude"];
    delete proprietes["site:altimetrie:systeme"];
    delete proprietes["site:altimetrie:source"];
    return { etat: { ...etat, proprietes }, effets };
  }
  const altitude = lire.longueur(p, "altitude")!.value;
  if (Math.abs(altitude) > 10000) throw new ErreurCommande("invalide", "altitude", "altitude hors des valeurs terrestres (±10 000 m)");
  const systeme = lire.chaine(p, "systeme").trim();
  if (!systeme || systeme.length > 60) throw new ErreurCommande("invalide", "systeme", "système altimétrique requis (60 caractères au plus)");
  const source = lire.chaine(p, "source").trim();
  if (!source || source.length > 200) throw new ErreurCommande("invalide", "source", "source de l'altitude requise (relevé, plan… ; 200 caractères au plus)");
  proprietes["site:altimetrie:altitude"] = { valeur: altitude, unite: "m", provenance: "saisie", statut: "declaree" };
  proprietes["site:altimetrie:systeme"] = { valeur: systeme, provenance: "saisie", statut: "declaree" };
  proprietes["site:altimetrie:source"] = { valeur: source, provenance: "saisie", statut: "declaree" };
  return { etat: { ...etat, proprietes }, effets };
}
