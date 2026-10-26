/**
 * Boîte « Fusionner une variante » (lot W3-D, X.1-06) — règles pures de l'interface : libellés des éléments et des
 * conflits, choix explicites (garder la source ou la cible, conflit par conflit, jamais par défaut), corps de
 * l'application, messages des refus du serveur. Ni React ni DOM. Le serveur recalcule tout et reste seul juge.
 */
import type { StudioConflitFusion, StudioCoteFusion, StudioFusionCorps, StudioFusionLue } from "../../../lib/api";

/** Nom français de chaque famille du document (élément `famille:identifiant`). */
export const FAMILLES_FUSION: Readonly<Record<string, string>> = Object.freeze({
  objects: "Objet", layers: "Calque", dimensions: "Cote", annotations: "Annotation", solides: "Solide", exacts: "Solide exact",
  cotesFaces: "Cote de face", architecture: "Élément architectural", proprietes: "Propriété", scenes: "Scène",
  nonNatifs: "Élément non natif", graphismes: "Graphisme", sources: "Source importée", systemeProjet: "Système de projet",
});

/** Élément lisible : famille en français et identifiant (texte du document, jamais traduit). */
export function libelleCle(cle: string): { famille: string; id: string | null } {
  const i = cle.indexOf(":");
  const famille = i < 0 ? cle : cle.slice(0, i);
  return { famille: FAMILLES_FUSION[famille] ?? famille, id: i < 0 ? null : cle.slice(i + 1) };
}

export const TYPES_CONFLITS: Readonly<Record<StudioConflitFusion["type"], string>> = Object.freeze({
  "modification-concurrente": "Modifié des deux côtés",
  "suppression-modification": "Supprimé d’un côté, modifié de l’autre",
  "collision-identifiant": "Identifiant ajouté des deux côtés",
  "combinaison-invalide": "Assemblage des deux versions invalide",
  "reference-cassee": "Référence rompue",
});
export const NATURES_REFERENCES: Readonly<Record<string, string>> = Object.freeze({
  "cote-liee": "cote associative", hote: "mur hôte", "source-profil": "profil source", operande: "opérande", propriete: "cible de la propriété",
  apparence: "objet visé", calque: "calque", "operande-doublon": "opérande d’un solide exact",
});

/** Précision d'un conflit (côté supprimé, propriété, référence), en français. */
export function detailConflit(c: StudioConflitFusion): string {
  if (c.type === "suppression-modification") return c.supprimeDans === "source" ? "Supprimé dans la source, modifié dans la cible." : "Supprimé dans la cible, modifié dans la source.";
  if (c.type === "modification-concurrente") return c.propriete ? `Propriété « ${c.propriete} » modifiée différemment de chaque côté.` : "Élément remplacé différemment de chaque côté.";
  if (c.type === "collision-identifiant") return "Deux contenus différents ajoutés sous le même identifiant.";
  if (c.type === "combinaison-invalide") return "Les propriétés reprises de chaque côté ne forment pas un élément valide : gardez une version entière.";
  return `Lien rompu (${NATURES_REFERENCES[c.reference?.nature ?? ""] ?? c.reference?.nature ?? "référence"}) : les deux éléments prennent la version choisie.`;
}

/** Choix encore valables : seulement ceux qui désignent un conflit de l'aperçu courant (un aperçu relancé les filtre). */
export function choixValables(conflits: readonly StudioConflitFusion[], choix: Readonly<Record<string, StudioCoteFusion>>): Record<string, StudioCoteFusion> {
  const ids = new Set(conflits.map((c) => c.id));
  return Object.fromEntries(Object.entries(choix).filter(([id]) => ids.has(id)));
}

/** Conflits sans choix : la fusion ne s'applique pas tant qu'il en reste (aucun choix par défaut). */
export const conflitsSansChoix = (conflits: readonly StudioConflitFusion[], choix: Readonly<Record<string, StudioCoteFusion>>): string[] =>
  conflits.filter((c) => choix[c.id] !== "source" && choix[c.id] !== "cible").map((c) => c.id);

/** Raison qui empêche d'appliquer (texte français), ou `null`. */
export function raisonBlocage(lu: StudioFusionLue | null, choix: Readonly<Record<string, StudioCoteFusion>>, brouillonNonEnregistre: boolean): string | null {
  if (!lu) return "Choisissez la variante source et lancez l’aperçu.";
  if (!lu.canWrite) return "Vous ne pouvez pas modifier cette variante : la fusion n’est pas proposée.";
  if (brouillonNonEnregistre) return "Enregistrez ou annulez d’abord les modifications en cours de cette variante.";
  const restants = conflitsSansChoix(lu.apercu.conflits, choix);
  if (restants.length) return `${restants.length} conflit(s) sans choix : gardez la source ou la cible pour chacun.`;
  if (lu.apercu.nonResolus.length || lu.apercu.resolutionsInconnues.length) return "Aperçu à relancer avec vos choix.";
  if (!lu.apercu.valide) return "Le résultat de la fusion serait invalide : choisissez d’autres versions.";
  if (!lu.apercu.aFusionner) return "La fusion ne changerait rien à cette variante.";
  return null;
}

/** Corps d'application : l'aperçu accepté (têtes, empreinte exacte) et les choix explicites. */
export function corpsFusion(lu: StudioFusionLue, choix: Readonly<Record<string, StudioCoteFusion>>, requestId: string): StudioFusionCorps {
  const resolutions = choixValables(lu.apercu.conflits, choix);
  return {
    requestId, sourceVariantId: lu.source.variantId, sourceRevisionId: lu.source.revisionId, baseRevisionId: lu.cible.revisionId,
    empreinte: lu.apercu.empreinte ?? "", ...(Object.keys(resolutions).length ? { resolutions } : {}),
  };
}

/** Message d'un refus du serveur (français), sans le message technique brut. */
export function messageRefusFusion(status: number, body: unknown): string {
  const code = (body as { error?: unknown } | null)?.error;
  if (status === 403) return "Fusion refusée par le serveur : vous ne pouvez pas modifier cette variante.";
  if (status === 423) return "Fusion refusée : un autre compte modifie ce projet en ce moment.";
  switch (code) {
    case "archived": return "Fusion refusée : la variante cible est archivée (lecture seule).";
    case "stale_revision": return "La variante a changé depuis l’aperçu : relancez l’aperçu.";
    case "source_changee": return "La variante source a changé depuis l’aperçu : relancez l’aperçu.";
    case "apercu_perime": return "Le résultat n’est plus celui de l’aperçu accepté : relancez l’aperçu.";
    case "conflits_non_resolus": return "Chaque conflit doit être résolu explicitement avant la fusion.";
    case "resolutions_inconnues": return "Des choix ne correspondent plus à cette fusion : relancez l’aperçu.";
    case "fusion_invalide": return "Le document fusionné serait invalide : rien n’a été écrit.";
    case "rien_a_fusionner": return "La fusion ne changerait rien à cette variante.";
    case "fusion_sans_ancetre": return "Ces deux variantes n’ont aucune révision commune (créées séparément, ou copie indépendante) : aucune fusion n’est possible.";
    case "fusion_ancetre_ambigu": return "Plusieurs ancêtres communs possibles : la fusion n’en choisit aucun au hasard.";
    case "pas_une_fusion": return "La tête de la variante n’est pas une fusion : rien à annuler.";
    case "chemin_ecriture": return "Cette étude n’a pas l’autorité d’écriture : elle reste consultable.";
    default: return "Fusion non confirmée : relancez l’aperçu avant de réessayer.";
  }
}

const ETATS: Readonly<Record<string, string>> = Object.freeze({ ajoute: "ajouté", supprime: "supprimé", modifie: "modifié" });
export const libelleEtat = (etat: string): string => ETATS[etat] ?? etat;
