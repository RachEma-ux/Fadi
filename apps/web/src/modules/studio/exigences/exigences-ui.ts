/**
 * Propriétés BIM et exigences de Studio (E.1) côté interface : libellés, constructeurs de commandes et d'exigences à
 * partir des champs saisis, cible des propriétés. Pur : ni React, ni DOM. Rien n'est proposé : un champ vide refuse
 * avec un message (aucune valeur, aucune unité de propriété, aucune source ne sont inventées) ; l'unité d'une exigence
 * sur le métré est celle de la métrique (affichée, jamais convertie).
 */
import {
  ciblePropriete, COMPARAISONS_EXIGENCE, GRANDEURS_QUANTITE, UNITE_GRANDEUR, UNITE_NOMBRE,
  type ComparaisonExigence, type ConclusionControle, type EtatExecution, type ExigenceStudio, type GrandeurQuantite, type MetriqueExigence,
  type MotifNonEvaluee, type StatutExigence, type StudioCommand, type StudioDocument, type StudioPropriete,
} from "@parcours/atelier-model";
import { LIBELLE_GRANDEUR, LIBELLE_NATURE, SYMBOLE_UNITE } from "../quantites/quantites-vue";

export const LIBELLE_EXECUTION: Readonly<Record<EtatExecution, string>> = {
  execute: "Exécuté", "non-execute": "Non exécuté", erreur: "Erreur d’exécution",
};
export const LIBELLE_CONCLUSION: Readonly<Record<ConclusionControle, string>> = {
  satisfaite: "Conforme", "non-satisfaite": "Non conforme", "non-evaluee": "Non évalué",
};
export const LIBELLE_STATUT: Readonly<Record<StatutExigence, string>> = {
  satisfaite: "Satisfaite", "non-satisfaite": "Non satisfaite", "non-evaluee": "Non évaluée", "non-utilisee": "Non utilisée (référence non acceptée)",
};
export const LIBELLE_MOTIF_EXIGENCE: Readonly<Record<MotifNonEvaluee, string>> = {
  "metrique-absente": "métrique absente de la révision", "metrique-non-evaluee": "métrique non évaluée",
  "total-partiel": "total partiel (objets non évalués)", "unite-incompatible": "unité différente, non convertie",
  "valeur-non-numerique": "valeur déclarée non numérique",
};
export const LIBELLE_MOTIF_EXECUTION: Readonly<Record<string, string>> = {
  "aucun-jeu": "aucun jeu d’exigences enregistré pour cette étude",
  "aucune-exigence-utilisable": "aucune exigence utilisable (références partenaires non acceptées ?)",
  "document-illisible": "le document de la révision n’a pas pu être lu",
};
export const LIBELLE_COMPARAISON: Readonly<Record<ComparaisonExigence, string>> = { "<=": "≤", "<": "<", ">=": "≥", ">": ">", "=": "=" };
export const LIBELLE_TYPE_METRIQUE: Readonly<Record<MetriqueExigence["type"], string>> = {
  total: "Total du métré", objet: "Grandeur d’un objet", nombre: "Nombre d’objets", propriete: "Propriété déclarée",
};
export const NON_EVALUEE = "non évaluée";

/** Unité affichée (m² pour m2…) ; une unité déclarée s'affiche telle quelle. */
export const uniteAffichee = (u: string): string => (u === UNITE_NOMBRE ? "u" : (SYMBOLE_UNITE as Record<string, string>)[u] ?? u);

/** Libellé lisible d'une métrique (les identifiants restent tels quels). */
export function libelleMetrique(m: MetriqueExigence): string {
  switch (m.type) {
    case "total": return `${LIBELLE_GRANDEUR[m.grandeur]} — ${m.calqueId === undefined ? "document" : `calque ${m.calqueId}`}`;
    case "objet": return `${LIBELLE_GRANDEUR[m.grandeur]} — objet ${m.objetId}`;
    case "nombre": return `Nombre d’objets${m.nature ? ` — ${LIBELLE_NATURE[m.nature]}` : ""}${m.calqueId === undefined ? "" : ` — calque ${m.calqueId}`}`;
    case "propriete": return `Propriété « ${m.nom} » — objet ${m.cibleId}`;
  }
}

// ——— Propriétés ———

export type TypeValeur = "nombre" | "texte" | "non-evaluee";
export interface SaisiePropriete { nom: string; type: TypeValeur; valeur: string; unite: string; source: string }
export const SAISIE_PROPRIETE_VIDE: SaisiePropriete = Object.freeze({ nom: "", type: "non-evaluee", valeur: "", unite: "", source: "" });

/** Objet porteur de propriétés de la sélection : mur / ouverture choisi(e), sinon l'unique objet extrudé sélectionné. */
export function cibleSelection(doc: StudioDocument, selectionArchi: string | null, selectionIds: readonly string[]): string | null {
  const candidats = [selectionArchi, selectionIds.length === 1 ? selectionIds[0]! : null].filter((x): x is string => !!x);
  for (const id of candidats) if (!("refus" in ciblePropriete(doc.objects, doc.architecture ?? [], id))) return id;
  return null;
}

export type ResultatPropriete = { commandes: StudioCommand[] } | { erreur: string };

/** Écriture d’un nombre saisi (point décimal, après remplacement de la virgule). */
const NOMBRE_SAISI = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

/** Lit un nombre saisi (virgule ou point décimal) ; `null` s'il est mal écrit ou non fini. */
export function lireNombreSaisi(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!NOMBRE_SAISI.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function commandePropriete(cibleId: string | null, s: SaisiePropriete): ResultatPropriete {
  if (!cibleId) return { erreur: "Sélectionnez d’abord un mur, une ouverture ou un objet extrudé." };
  const nom = s.nom.trim();
  if (!nom) return { erreur: "Saisissez le nom de la propriété." };
  const unite = s.unite.trim(), source = s.source.trim();
  const p: StudioPropriete = { cibleId, nom, ...(unite ? { unite } : {}), ...(source ? { source } : {}) };
  if (s.type === "nombre") {
    const v = lireNombreSaisi(s.valeur);
    if (v === null) {
      // Nombre bien écrit mais hors des nombres représentables (1e400…) : refusé, jamais remplacé par une borne.
      if (NOMBRE_SAISI.test(s.valeur.trim().replace(",", "."))) {
        return { erreur: "Nombre hors des valeurs représentables : saisissez un nombre fini." };
      }
      return { erreur: "Saisissez une valeur numérique, ou choisissez « Non évaluée »." };
    }
    if (!unite) return { erreur: "Saisissez l’unité de la valeur numérique : aucune unité n’est proposée." };
    p.valeur = v;
  } else if (s.type === "texte") {
    const v = s.valeur.trim();
    if (!v) return { erreur: "Saisissez la valeur, ou choisissez « Non évaluée »." };
    p.valeur = v;
  }
  return { commandes: [{ toolId: "studio.propriete.definir", params: p }] };
}

export function commandeRetrait(cibleId: string | null, nom: string, doc: StudioDocument): ResultatPropriete {
  if (!cibleId) return { erreur: "Sélectionnez d’abord l’objet qui porte la propriété." };
  const n = nom.trim();
  if (!n) return { erreur: "Saisissez le nom de la propriété à retirer." };
  if (!(doc.proprietes ?? []).some((p) => p.cibleId === cibleId && p.nom === n)) return { erreur: `Aucune propriété « ${n} » sur cet objet.` };
  return { commandes: [{ toolId: "studio.propriete.retirer", params: { cibleId, nom: n } }] };
}

// ——— Exigences ———

export interface SaisieExigence {
  libelle: string;
  type: MetriqueExigence["type"];
  grandeur: GrandeurQuantite | "";
  calqueId: string;
  objetId: string;
  nature: string;
  cibleId: string;
  nom: string;
  comparaison: ComparaisonExigence | "";
  valeur: string;
  tolerance: string;
  unite: string;
  source: string;
  reference: string;
}
export const SAISIE_EXIGENCE_VIDE: SaisieExigence = Object.freeze({
  libelle: "", type: "total", grandeur: "", calqueId: "", objetId: "", nature: "", cibleId: "", nom: "", comparaison: "", valeur: "", tolerance: "", unite: "", source: "", reference: "",
});
export const GRANDEURS = GRANDEURS_QUANTITE;
export const COMPARAISONS = COMPARAISONS_EXIGENCE;

/** Unité imposée par la métrique saisie (null : propriété, unité saisie). */
export function uniteImposee(s: Pick<SaisieExigence, "type" | "grandeur">): string | null {
  if (s.type === "nombre") return UNITE_NOMBRE;
  if (s.type === "propriete") return null;
  return s.grandeur ? UNITE_GRANDEUR[s.grandeur] : null;
}

/** Saisie reprise d'une exigence (édition). */
export function saisieDe(e: ExigenceStudio): SaisieExigence {
  const m = e.metrique;
  return {
    ...SAISIE_EXIGENCE_VIDE, libelle: e.libelle, type: m.type,
    grandeur: m.type === "total" || m.type === "objet" ? m.grandeur : "",
    calqueId: (m.type === "total" || m.type === "nombre") && m.calqueId !== undefined ? m.calqueId : "",
    objetId: m.type === "objet" ? m.objetId : "", nature: m.type === "nombre" && m.nature ? m.nature : "",
    cibleId: m.type === "propriete" ? m.cibleId : "", nom: m.type === "propriete" ? m.nom : "",
    comparaison: e.comparaison, valeur: String(e.valeur), tolerance: e.tolerance === undefined ? "" : String(e.tolerance),
    unite: e.unite, source: e.source, reference: e.origine?.reference ?? "",
  };
}

export type ResultatExigence = { exigence: ExigenceStudio } | { erreur: string };

/**
 * Exigence construite depuis la saisie. `precedente` : l'exigence éditée (son identifiant et, contenu inchangé, son
 * acceptation sont repris par le serveur ; l'interface n'envoie jamais d'acceptation).
 */
export function exigenceDe(s: SaisieExigence, id: string): ResultatExigence {
  const libelle = s.libelle.trim(), source = s.source.trim();
  if (!libelle) return { erreur: "Saisissez le libellé de l’exigence." };
  let metrique: MetriqueExigence;
  if (s.type === "total" || s.type === "objet") {
    if (!s.grandeur) return { erreur: "Choisissez la grandeur du métré visée." };
    if (s.type === "objet") {
      if (!s.objetId.trim()) return { erreur: "Saisissez l’identifiant de l’objet visé." };
      metrique = { type: "objet", objetId: s.objetId.trim(), grandeur: s.grandeur };
    } else metrique = { type: "total", grandeur: s.grandeur, ...(s.calqueId.trim() ? { calqueId: s.calqueId.trim() } : {}) };
  } else if (s.type === "nombre") {
    metrique = { type: "nombre", ...(s.nature ? { nature: s.nature as never } : {}), ...(s.calqueId.trim() ? { calqueId: s.calqueId.trim() } : {}) };
  } else {
    if (!s.cibleId.trim() || !s.nom.trim()) return { erreur: "Saisissez l’objet et le nom de la propriété visée." };
    metrique = { type: "propriete", cibleId: s.cibleId.trim(), nom: s.nom.trim() };
  }
  if (!s.comparaison) return { erreur: "Choisissez la comparaison." };
  const valeur = lireNombreSaisi(s.valeur);
  if (valeur === null) return { erreur: "Saisissez la valeur exigée (nombre)." };
  const unite = uniteImposee(s) ?? s.unite.trim();
  if (!unite) return { erreur: "Saisissez l’unité de la propriété visée : aucune unité n’est proposée." };
  let tolerance: number | undefined;
  if (s.tolerance.trim()) {
    if (s.comparaison !== "=") return { erreur: "Une tolérance ne s’applique qu’à la comparaison « = »." };
    const t = lireNombreSaisi(s.tolerance);
    if (t === null || t < 0) return { erreur: "Saisissez une tolérance positive ou nulle." };
    tolerance = t;
  }
  if (!source) return { erreur: "Saisissez la source de l’exigence (document, article, programme…) : elle est obligatoire." };
  const reference = s.reference.trim();
  return { exigence: { id, libelle, metrique, comparaison: s.comparaison, valeur, ...(tolerance !== undefined ? { tolerance } : {}), unite, source, ...(reference ? { origine: { reference } } : {}) } };
}

/** Liste de la version suivante : l'exigence remplacée à sa place, ou ajoutée en fin ; acceptations retirées (le serveur les reprend). */
export function listeSuivante(courantes: readonly ExigenceStudio[], e: ExigenceStudio): ExigenceStudio[] {
  const sans = courantes.map(sansAcceptation);
  const i = sans.findIndex((x) => x.id === e.id);
  return i < 0 ? [...sans, e] : sans.map((x, j) => (j === i ? e : x));
}
export function listeSans(courantes: readonly ExigenceStudio[], id: string): ExigenceStudio[] {
  return courantes.filter((x) => x.id !== id).map(sansAcceptation);
}
function sansAcceptation(e: ExigenceStudio): ExigenceStudio {
  return e.origine ? { ...e, origine: { reference: e.origine.reference } } : e;
}

/** Valeur affichée d'une propriété déclarée : la valeur et son unité, ou « non évaluée ». */
export function valeurAffichee(p: StudioPropriete, locale: string): string {
  if (p.valeur === undefined) return NON_EVALUEE;
  const v = typeof p.valeur === "number" ? p.valeur.toLocaleString(locale, { maximumFractionDigits: 6 }) : p.valeur;
  return p.unite ? `${v} ${p.unite}` : v;
}
