/**
 * Règles d'affichage du panneau « Feuilles et dossier » (E.3-01 à E.3-03). Pur : ni React, ni DOM.
 */
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_NON_EVALUE, type BilanQuantitesStudio, type StudioDocument, type TotalBilan } from "@parcours/atelier-model";
import type { StudioSheet, StudioSheetInput } from "../../../lib/api";

/** Saisie initiale d'une nouvelle feuille : numéro proposé, A3 paysage ajustée, calques visibles, auteur vide. */
export interface SaisieFeuilleUi {
  numero: string; titre: string; format: StudioSheetInput["format"]; orientation: StudioSheetInput["orientation"]; echelle: StudioSheetInput["scale"];
  /** null : calques visibles de la révision ; sinon calques choisis. */
  calques: string[] | null; auteur: string;
}

/** Prochain numéro libre de la forme « F-01 », « F-02 »… (proposition, toujours modifiable). */
export function numeroPropose(feuilles: readonly Pick<StudioSheet, "definition">[]): string {
  const pris = new Set(feuilles.map((f) => f.definition.numero));
  for (let i = 1; i < 1000; i++) {
    const n = `F-${String(i).padStart(2, "0")}`;
    if (!pris.has(n)) return n;
  }
  return "";
}

export const saisieInitiale = (feuilles: readonly Pick<StudioSheet, "definition">[]): SaisieFeuilleUi => ({
  numero: numeroPropose(feuilles), titre: "", format: "A3", orientation: "paysage", echelle: "ajuster", calques: null, auteur: "",
});

/** Corps de création : champs nettoyés ; calques et auteur seulement s'ils sont fournis. */
export function corpsFeuille(s: SaisieFeuilleUi): StudioSheetInput {
  return {
    number: s.numero.trim(), title: s.titre.trim(), format: s.format, orientation: s.orientation, scale: s.echelle,
    ...(s.calques ? { layers: s.calques } : {}), ...(s.auteur.trim() ? { author: s.auteur.trim() } : {}),
  };
}

/** Motif d'un refus de saisie (avant l'envoi), sinon null. */
export function refusSaisie(s: SaisieFeuilleUi): string | null {
  if (!s.numero.trim()) return "Saisissez le numéro de la feuille.";
  if (!s.titre.trim()) return "Saisissez le titre de la feuille.";
  if (s.calques && s.calques.length === 0) return "Choisissez au moins un calque, ou revenez aux calques visibles.";
  return null;
}

/** Calques proposés pour la vue source : ceux de la révision (le calque implicite s'il porte un élément). */
export function calquesProposes(doc: StudioDocument): { id: string; nom: string; visible: boolean }[] {
  const declares = (doc.layers ?? []).map((l) => ({ id: l.id, nom: l.name, visible: l.visible }));
  if (declares.some((l) => l.id === STUDIO_DEFAULT_LAYER_ID)) return declares;
  const occupe = [...doc.objects, ...(doc.dimensions ?? []), ...(doc.annotations ?? []), ...(doc.architecture ?? []).filter((x) => x.type === "wall")]
    .some((o) => ((o as { layerId?: string }).layerId ?? STUDIO_DEFAULT_LAYER_ID) === STUDIO_DEFAULT_LAYER_ID);
  return occupe ? [{ id: STUDIO_DEFAULT_LAYER_ID, nom: "0", visible: true }, ...declares] : declares;
}

/** Déplace l'élément `i` d'un cran (−1 : vers le haut, +1 : vers le bas) ; inchangé au bord. */
export function deplacer<T>(liste: readonly T[], i: number, sens: -1 | 1): T[] {
  const j = i + sens;
  if (i < 0 || i >= liste.length || j < 0 || j >= liste.length) return [...liste];
  const out = [...liste];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** Empreinte abrégée (16 premiers caractères) ; absente : « non évalué ». */
export const empreinteAbregee = (h: string | null | undefined): string => (h ? h.slice(0, 16) : STUDIO_NON_EVALUE);
export const revisionCourte = (id: string): string => id.slice(-8);

/** Libellé de la vue source d'une feuille. */
export function libelleVueSource(f: Pick<StudioSheet, "definition" | "provenance">): string {
  const calques = f.provenance?.vue.vueSource.calques ?? f.definition.vueSource.calques ?? [];
  const mode = f.definition.vueSource.calques ? "calques choisis" : "calques visibles";
  return `Planche 2D, ${mode} : ${calques.length ? calques.join(", ") : "aucun"}`;
}

const nombre = (v: number, locale: string) => new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v);
/** Total du bilan (m³) : valeur, partiel si des lignes ne sont pas évaluées, « non évalué » sinon. */
export function libelleTotal(t: TotalBilan, locale: string): string {
  if (t.valeur === null) return STUDIO_NON_EVALUE;
  return `${nombre(t.valeur, locale)} m³${t.nonEvalues ? ` (partiel : ${t.nonEvalues} non évalué${t.nonEvalues > 1 ? "s" : ""})` : ""}`;
}
/** Résumé du bilan brut / déductions / net. */
export const resumeBilan = (b: BilanQuantitesStudio, locale: string) => ({
  brut: libelleTotal(b.totaux.brut, locale), deduit: libelleTotal(b.totaux.deduit, locale), net: libelleTotal(b.totaux.net, locale),
  deductions: b.deductionsDeclarees, coherent: b.controle.coherent,
});

/** Message d'un refus du serveur pour les feuilles et dossiers. */
export function messageRefusDossier(status: number, body: unknown): string {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  if (status === 409 && b["error"] === "sheet_number_taken") return "Ce numéro de feuille est déjà utilisé dans l’étude.";
  if (status === 409 && b["error"] === "sheet_in_dossier") return "Cette feuille fait partie d’un dossier : retirez-la du dossier d’abord.";
  if (status === 409 && b["error"] === "dossier_sheet_missing") return "Une feuille du dossier n’existe plus.";
  if (status === 409 && (b["error"] === "dossier_invalid" || b["error"] === "sheet_view_invalid")) return "La vue n’a pas pu être produite sur cette révision (calque retiré depuis ?).";
  if (status === 409 && b["error"] === "archived") return "Étude ou variante archivée : lecture seule.";
  if (status === 400 && b["code"] === "sheet_view_invalid") return "Vue impossible : un calque choisi n’existe pas dans la révision.";
  if (status === 400) return "Saisie refusée par le serveur : vérifiez les champs.";
  if (status === 403) return "Action refusée : vos droits sur ce projet ne la permettent pas.";
  if (status === 423) return "Édition réservée par un autre compte : réessayez plus tard.";
  return "Action refusée par le serveur.";
}
