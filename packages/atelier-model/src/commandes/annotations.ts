/**
 * Annotations (annexe B) : `cotation.creer`, `.modifier`, `.rattacher`, `.supprimer`, `texte.*`, `etiquette.*`,
 * et `reference.reparer` (choisir une nouvelle cible ou détacher, jamais de rattachement silencieux, R12).
 *
 * Une cotation est `libre` sans référence, `rattachee` avec des références valides, `a-reparer` si l'une de
 * ses références vise un objet disparu. Les extrémités `a` / `b` ne sont pas recalculées ici : leur
 * résolution géométrique est le travail du résolveur de références (L1.3).
 */
import type { ReferenceTopologique } from "../contrats/references.js";
import { caracteristiqueAdmise, estCaracteristiqueNommee } from "../ontologie/caracteristiques.js";
import type { EtatCotation, IdObjet, ObjetCotation, ReferenceExtremite } from "../ontologie/classes.js";
import { relationAdmise } from "../ontologie/relations.js";
import { controlerLongueurMin, exigerCibles, fabriqueCreation, fabriqueModification, fabriqueSuppression, nomObjet, avecParams, controlerEnTete, nouvelObjet, sansCles, type ControleObjet, type Corps } from "./communs.js";
import { motif, type Transaction } from "./transaction.js";

/** Une référence vise un objet existant, d'une classe admise, et une caractéristique de cette classe. */
function controlerCible(tx: Transaction, porteur: "cotation" | "etiquette", objetId: unknown, caracteristique: unknown, chemin: string): boolean {
  const o = typeof objetId === "string" ? tx.objet(objetId) : undefined;
  if (!o) {
    tx.refuser("precondition", `${chemin}.objetId`, motif(`Objet ${String(objetId)}`, "introuvable ou supprimé", "choisir un objet existant"), typeof objetId === "string" ? [objetId] : []);
    return false;
  }
  if (!relationAdmise("reference", porteur, o.classe)) {
    tx.refuser("precondition", `${chemin}.objetId`, motif(nomObjet(o), `une ${porteur} ne peut pas référencer la classe ${o.classe}`, "choisir un objet du bâtiment"), [o.id]);
    return false;
  }
  if (caracteristique !== undefined && (typeof caracteristique !== "string" || !caracteristiqueAdmise(o.classe, caracteristique))) {
    tx.refuser("precondition", `${chemin}.caracteristique`, motif(nomObjet(o), `caractéristique « ${String(caracteristique)} » inexistante pour la classe ${o.classe}`, "choisir une caractéristique nommée de l'objet"), [o.id]);
    return false;
  }
  return true;
}

function controlerReferences(tx: Transaction, refs: unknown, chemin: string): refs is readonly ReferenceExtremite[] {
  if (!Array.isArray(refs)) {
    tx.refuser("parametre-invalide", chemin, motif("Cotation", "références mal formées", "fournir une liste `{ extremite, objetId, caracteristique }`"));
    return false;
  }
  let ok = true;
  const extremites = new Set<string>();
  refs.forEach((r: unknown, i) => {
    const x = (typeof r === "object" && r !== null ? r : {}) as Partial<ReferenceExtremite>;
    if (x.extremite !== "a" && x.extremite !== "b") {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}[${i}].extremite`, motif("Cotation", "extrémité « a » ou « b » attendue", "corriger la référence"));
      return;
    }
    if (extremites.has(x.extremite)) {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}[${i}].extremite`, motif("Cotation", `extrémité « ${x.extremite} » référencée deux fois`, "une référence par extrémité"));
      return;
    }
    extremites.add(x.extremite);
    if (x.caracteristique === undefined) {
      ok = false;
      tx.refuser("parametre-invalide", `${chemin}[${i}].caracteristique`, motif("Cotation", "caractéristique absente", "choisir une caractéristique nommée"));
      return;
    }
    if (!controlerCible(tx, "cotation", x.objetId, x.caracteristique, `${chemin}[${i}]`)) ok = false;
  });
  return ok;
}

/** État d'une cotation d'après ses références. */
export function etatCotation(tx: Transaction, refs: readonly ReferenceExtremite[]): EtatCotation {
  if (refs.length === 0) return "libre";
  return refs.every((r) => tx.objet(r.objetId) !== undefined) ? "rattachee" : "a-reparer";
}

export const cotationCreer: Corps<"cotation.creer"> = (tx, c) => {
  const p = c.params;
  if (!controlerEnTete(tx, p)) return;
  if (!controlerReferences(tx, p.references, "params.references")) return;
  const params = { ...sansCles(p, ["id", "niveauId", "calqueId"]), etat: etatCotation(tx, p.references) } as unknown as ObjetCotation["params"];
  const o = nouvelObjet("cotation", p.id, params, { niveauId: p.niveauId, calqueId: p.calqueId });
  controlerLongueurMin(tx, p.a, p.b, "params.b", nomObjet(o));
  tx.mettre(o);
};

const controleCotation: ControleObjet = (tx, o, chemin, cles) => {
  if (o.classe === "cotation" && (cles === null || cles.includes("a") || cles.includes("b"))) controlerLongueurMin(tx, o.params.a, o.params.b, `${chemin}.b`, nomObjet(o));
};

export const cotationModifier = fabriqueModification<"cotation.modifier">(["cotation"], controleCotation, ["etat", "references"]);

export const cotationRattacher: Corps<"cotation.rattacher"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ["cotation"], { min: 1, max: 1 });
  const o = cibles?.[0];
  if (!o || o.classe !== "cotation") return;
  if (!controlerReferences(tx, c.params.references, "params.references")) return;
  const refs = c.params.references;
  tx.mettre(avecParams(o, { references: refs, etat: etatCotation(tx, refs) }, ["references", "etat"]));
  for (const r of refs) if (estCaracteristiqueNommee(r.caracteristique)) tx.referencesTouchees.push({ porteurId: o.id, reference: { objetId: r.objetId, caracteristique: r.caracteristique } });
};

export const cotationSupprimer = fabriqueSuppression<"cotation.supprimer">(["cotation"]);

const controleTexte: ControleObjet = (tx, o, chemin, cles) => {
  if (o.classe === "texte" && (cles === null || cles.includes("texte")) && typeof o.params.texte === "string" && o.params.texte.trim() === "") {
    tx.refuser("parametre-invalide", `${chemin}.texte`, motif(nomObjet(o), "texte vide", "saisir un texte ou supprimer l'objet"), [o.id]);
  }
};

export const texteCreer = fabriqueCreation<"texte.creer">("texte", controleTexte);
export const texteModifier = fabriqueModification<"texte.modifier">(["texte"], controleTexte);
export const texteSupprimer = fabriqueSuppression<"texte.supprimer">(["texte"]);

const controleEtiquette: ControleObjet = (tx, o, chemin, cles) => {
  if (o.classe !== "etiquette") return;
  if (cles !== null && !cles.includes("objetId") && !cles.includes("caracteristique")) return;
  if (o.params.objetId === undefined) {
    if (o.params.caracteristique !== undefined) tx.refuser("parametre-invalide", `${chemin}.caracteristique`, motif(nomObjet(o), "caractéristique sans objet étiqueté", "indiquer l'objet (objetId)"), [o.id]);
    return;
  }
  controlerCible(tx, "etiquette", o.params.objetId, o.params.caracteristique, chemin);
};

export const etiquetteCreer = fabriqueCreation<"etiquette.creer">("etiquette", controleEtiquette);
export const etiquetteModifier = fabriqueModification<"etiquette.modifier">(["etiquette"], controleEtiquette);
export const etiquetteSupprimer = fabriqueSuppression<"etiquette.supprimer">(["etiquette"]);

// --- reference.reparer --------------------------------------------------------

const memeRef = (r: { objetId: IdObjet; caracteristique?: string | undefined }, a: ReferenceTopologique) => r.objetId === a.objetId && r.caracteristique === a.caracteristique;

export const reparer: Corps<"reference.reparer"> = (tx, c) => {
  const cibles = exigerCibles(tx, c.cibles, ["cotation", "etiquette"], { min: 1, max: 1 });
  const o = cibles?.[0];
  if (!o) return;
  const { ancienne, nouvelle } = c.params;
  if (typeof ancienne !== "object" || ancienne === null || typeof ancienne.objetId !== "string") {
    tx.refuser("parametre-invalide", "params.ancienne", motif(nomObjet(o), "ancienne référence mal formée", "fournir `{ objetId, caracteristique }`"), [o.id]);
    return;
  }
  if (nouvelle !== null) {
    if (typeof nouvelle !== "object" || !estCaracteristiqueNommee(nouvelle.caracteristique)) {
      tx.refuser("parametre-invalide", "params.nouvelle", motif(nomObjet(o), "nouvelle référence mal formée", "fournir `{ objetId, caracteristique }` ou null pour détacher"), [o.id]);
      return;
    }
    if (!controlerCible(tx, o.classe === "cotation" ? "cotation" : "etiquette", nouvelle.objetId, nouvelle.caracteristique, "params.nouvelle")) return;
  }
  if (o.classe === "cotation") {
    const i = o.params.references.findIndex((r) => memeRef(r, ancienne));
    if (i < 0) {
      tx.refuser("precondition", "params.ancienne", motif(nomObjet(o), `ne porte pas la référence ${ancienne.objetId} (${ancienne.caracteristique})`, "recharger la cotation"), [o.id]);
      return;
    }
    const refs = o.params.references.flatMap((r, j) => (j !== i ? [r] : nouvelle === null ? [] : [{ extremite: r.extremite, objetId: nouvelle.objetId, caracteristique: nouvelle.caracteristique }]));
    tx.mettre(avecParams(o, { references: refs, etat: etatCotation(tx, refs) }, ["references", "etat"]));
  } else if (o.classe === "etiquette") {
    if (!memeRef({ objetId: o.params.objetId ?? "", caracteristique: o.params.caracteristique }, ancienne)) {
      tx.refuser("precondition", "params.ancienne", motif(nomObjet(o), `ne porte pas la référence ${ancienne.objetId} (${ancienne.caracteristique})`, "recharger l'étiquette"), [o.id]);
      return;
    }
    const { objetId: _o, caracteristique: _c, ...reste } = o.params;
    void _o;
    void _c;
    const params = nouvelle === null ? reste : { ...reste, objetId: nouvelle.objetId, caracteristique: nouvelle.caracteristique };
    tx.mettre(avecParams({ ...o, params }, {}, ["objetId", "caracteristique"]));
  }
  tx.referencesTouchees.push({ porteurId: o.id, reference: nouvelle ?? ancienne });
};
