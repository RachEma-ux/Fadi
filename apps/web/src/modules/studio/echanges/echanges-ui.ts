/**
 * Libellés et lecture de la matrice d'échanges (E.6-01 à E.6-05) pour la boîte « Matrice d'échanges » : la donnée
 * vient du modèle (`STUDIO_MATRICE_ECHANGES`), jamais recopiée ; les libellés sont écrits en français et traduits à
 * l'affichage par `en.json`. Pur : ni React ni DOM.
 */
import {
  STUDIO_MATRICE_ECHANGES, studioCouvertureFormat,
  type StudioCouvertureEntite, type StudioEntreeEchange, type StudioFamilleEchange, type StudioSensEchange, type StudioStatutEchange,
} from "@parcours/atelier-model";
import { LIBELLES_RAISON_FIDELITE, LIBELLES_STATUT_FIDELITE, libelleType } from "../variante/rapport-export";

export const LIBELLES_STATUT_ECHANGE: Readonly<Record<StudioStatutEchange, string>> = Object.freeze({ livre: "Livré", "non-livre": "Non livré", renonce: "Renoncé" });
export const LIBELLES_SENS_ECHANGE: Readonly<Record<StudioSensEchange, string>> = Object.freeze({ import: "Import", export: "Export" });
export const LIBELLES_COUVERTURE_ENTITE: Readonly<Record<StudioCouvertureEntite, string>> = Object.freeze({ portee: "Portée", partielle: "Partielle", absente: "Absente" });
export const LIBELLES_FAMILLE_ECHANGE: Readonly<Record<StudioFamilleEchange, string>> = Object.freeze({
  natif: "Données natives", dessin: "Dessin", maquette: "Maquette", feuille: "Feuille", dossier: "Dossier", tableau: "Tableau",
  rendu: "Rendu", paquet: "Paquet", rapport: "Rapport", diagnostic: "Diagnostic", coordination: "Coordination",
});
export const LIBELLES_CATEGORIE: Readonly<Record<string, string>> = Object.freeze({
  objets: "Formes", cotes: "Cotes", annotations: "Annotations", solides: "Solides", exacts: "Solides exacts", architecture: "Architecture", proprietes: "Propriétés", scenes: "Visualisation",
});

export const TEXTES_ECHANGES = Object.freeze({
  titre: "Matrice d’échanges",
  aide: "Formats lus et écrits par Studio, par sens, entité et version, avec leur limite de couverture. Aucune entrée n’est une déclaration de conformité : « livré » dit ce que le code écrit ou lit et le contrôle qui le vérifie ; un format reporté est inscrit « non livré » avec sa raison.",
  resume: "Révision {0} du {1} : {2} entrées — {3} livrées, {4} non livrées, {5} renoncées.",
  filtre: "Statut",
  tous: "Tous",
  colonnes: ["Format", "Version du format", "Sens", "Objet", "Statut", "Limite de couverture"] as const,
  details: "Entités, contrôle et sources",
  /** Nom propre de chaque bloc de détails : format, sens et objet (deux entrées n'ont jamais le même, test). */
  detailsDe: "Entités, contrôle et sources de {0} ({1}) : {2}",
  entites: "Entités",
  ecritureIfc: "Entités IFC écrites",
  jeuxIfc: "Jeux de propriétés IFC écrits",
  couvertureFidelite: "Couverture par type (rapport de fidélité)",
  colonnesFidelite: ["Catégorie", "Type", "Sort à l’export"] as const,
  controle: "Contrôle",
  route: "Route",
  preuves: "Preuves dans le dépôt",
  raison: "Raison",
  sources: "Sources",
  famille: "Famille",
  aucune: "Aucune entrée pour ce statut.",
});

export type FiltreStatut = StudioStatutEchange | "tous";
export const FILTRES_STATUT: readonly FiltreStatut[] = Object.freeze(["tous", "livre", "non-livre", "renonce"] as const);

export function entreesFiltrees(filtre: FiltreStatut, entrees: readonly StudioEntreeEchange[] = STUDIO_MATRICE_ECHANGES.entrees): readonly StudioEntreeEchange[] {
  return filtre === "tous" ? entrees : entrees.filter((e) => e.statut === filtre);
}

export const gabarit = (modele: string, ...valeurs: (string | number)[]): string => modele.replace(/\{(\d+)\}/g, (_, i: string) => String(valeurs[Number(i)] ?? ""));

export function resumeMatrice(entrees: readonly StudioEntreeEchange[] = STUDIO_MATRICE_ECHANGES.entrees): string {
  const n = (s: StudioStatutEchange) => entrees.filter((e) => e.statut === s).length;
  return gabarit(TEXTES_ECHANGES.resume, STUDIO_MATRICE_ECHANGES.revision, STUDIO_MATRICE_ECHANGES.etablieLe, entrees.length, n("livre"), n("non-livre"), n("renonce"));
}

/** Couverture par type d'une entrée liée au rapport de fidélité : une ligne par type, sorts possibles en clair. */
export function lignesFidelite(e: StudioEntreeEchange): { categorie: string; type: string; sorts: string[] }[] {
  if (!e.fidelite) return [];
  return studioCouvertureFormat(e.fidelite).map((c) => ({
    categorie: LIBELLES_CATEGORIE[c.categorie] ?? c.categorie,
    type: libelleType(c.type),
    sorts: c.raisons.map((r) => `${LIBELLES_STATUT_FIDELITE[r.statut]} : ${LIBELLES_RAISON_FIDELITE[r.raison]}`),
  }));
}

/** Nom du bloc de détails d'une entrée (résumé du `<details>`) : distinct pour chaque entrée. */
export const nomDetails = (e: StudioEntreeEchange): string => gabarit(TEXTES_ECHANGES.detailsDe, e.format, LIBELLES_SENS_ECHANGE[e.sens], e.objet);

/**
 * Textes français affichés par la boîte (hors chemins du dépôt, routes, noms d'entités IFC et références des sources,
 * marqués `translate="no"`) : chacun doit avoir sa traduction dans `en.json` (test). Le commentaire d'une source est
 * de la prose : il est traduit.
 */
export function textesAffiches(): string[] {
  const t = new Set<string>();
  const ajouter = (s: string | undefined) => { if (s && /\p{L}/u.test(s)) t.add(s); };
  for (const v of Object.values(TEXTES_ECHANGES)) (Array.isArray(v) ? v : [v]).forEach((x) => ajouter(x as string));
  for (const tab of [LIBELLES_STATUT_ECHANGE, LIBELLES_SENS_ECHANGE, LIBELLES_COUVERTURE_ENTITE, LIBELLES_FAMILLE_ECHANGE]) Object.values(tab).forEach(ajouter);
  for (const e of STUDIO_MATRICE_ECHANGES.entrees) {
    [e.format, e.versionFormat, e.objet, e.limite, e.controle, e.raison, nomDetails(e)].forEach(ajouter);
    for (const x of e.entites) { ajouter(x.entite); ajouter(x.detail); }
    for (const s of e.sources) ajouter(s.commentaire);
    for (const x of e.ecritureIfc?.elements ?? []) ajouter(x.detail);
    for (const x of e.ecritureIfc?.jeuxDeProprietes ?? []) ajouter(x.detail);
    for (const l of lignesFidelite(e)) { ajouter(l.categorie); ajouter(l.type); l.sorts.forEach(ajouter); }
  }
  return [...t];
}
