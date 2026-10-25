/**
 * Statuts « actif / déprécié » des outils et modules de Studio et leur plan de compatibilité (EX-030, TR-EX-030).
 *
 * EX-030 : « Un changement majeur du contrat exige un plan de compatibilité avec profils enregistrés, commandes hors
 * ligne en attente et documents réouvrables. Un module marqué « déprécié » reste résoluble tant que sa présence est
 * nécessaire à la lecture d'un travail existant, ou fournit une migration sûre. »
 *
 * Posé **au-dessus** du manifeste (`manifeste-outils.ts`) sans le modifier : chaque `toolId` y est actif sauf s'il est
 * déclaré dans `STUDIO_OUTILS_DEPRECIES` avec son plan. Un plan couvre obligatoirement les trois travaux existants :
 * - `profils` : un identifiant déprécié cité par un profil enregistré reste lu (`conserve`) ou suit son remplacement
 *   (`remplacement`, outil actif du registre) — jamais retiré en silence ;
 * - `commandesEnAttente` : les commandes hors ligne de l'outil restent exécutables (`executees`), jamais effacées ;
 * - `documents` : les objets créés avec l'outil restent lisibles (`lecture-conservee`) — le document se rouvre.
 * Chaque chargeur (module) peut aussi être déprécié (`STUDIO_MODULES_DEPRECIES`) : il reste chargé tant qu'un outil
 * résoluble l'emploie.
 *
 * Aucun outil n'est déprécié aujourd'hui (constat au commit de réalisation) : les tables sont vides et rien n'est
 * inventé ; le mécanisme et ses contrôles sont éprouvés par les tests sur des tables d'essai. Pur : ni React, ni DOM.
 */
import { STUDIO_CHARGEURS_OUTILS, STUDIO_MANIFESTE_OUTILS, type StudioEntreeManifeste, type StudioIdChargeur } from "./manifeste-outils.js";
import { STUDIO_TOOL_IDS, type StudioToolId } from "./registry.js";
import type { StudioDocument } from "./composition/types.js";

export interface PlanCompatibilite {
  /** Version du manifeste qui a déprécié l'outil (`studio-tool-manifest/<n>`). */
  readonly depuis: string;
  /** Motif (français source). */
  readonly motif: string;
  /** Outil actif qui le remplace pour les nouveaux travaux, ou null (aucun : l'outil reste seul à lire ses objets). */
  readonly remplacement: StudioToolId | null;
  readonly profils: "conserve" | "remplacement";
  readonly commandesEnAttente: "executees";
  readonly documents: "lecture-conservee";
}

export interface DeclarationDepreciation { readonly toolId: StudioToolId; readonly plan: PlanCompatibilite }
export interface DeclarationModuleDeprecie { readonly chargeur: StudioIdChargeur; readonly depuis: string; readonly motif: string }

/** Outils dépréciés (aucun au commit de réalisation). */
export const STUDIO_OUTILS_DEPRECIES: readonly DeclarationDepreciation[] = Object.freeze([]);
/** Modules (chargeurs) dépréciés (aucun au commit de réalisation). */
export const STUDIO_MODULES_DEPRECIES: readonly DeclarationModuleDeprecie[] = Object.freeze([]);

export type StatutOutil = { readonly statut: "actif" } | { readonly statut: "deprecie"; readonly plan: PlanCompatibilite } | { readonly statut: "inconnu" };

const CANONIQUES: ReadonlySet<string> = new Set(STUDIO_TOOL_IDS as readonly string[]);

/** Statut d'un outil pour la lecture d'un travail existant : un outil déprécié reste résoluble avec son plan. */
export function statutOutil(toolId: string, deprecies: readonly DeclarationDepreciation[] = STUDIO_OUTILS_DEPRECIES): StatutOutil {
  if (!CANONIQUES.has(toolId)) return { statut: "inconnu" };
  const d = deprecies.find((x) => x.toolId === toolId);
  return d ? { statut: "deprecie", plan: d.plan } : { statut: "actif" };
}

/** Contrôle des déclarations (vide = valide) : plan complet, remplacement actif, module encore employé déclaré. */
export function controlerDepreciations(
  deprecies: readonly DeclarationDepreciation[] = STUDIO_OUTILS_DEPRECIES,
  modules: readonly DeclarationModuleDeprecie[] = STUDIO_MODULES_DEPRECIES,
  manifeste: { readonly entrees: readonly StudioEntreeManifeste[] } = STUDIO_MANIFESTE_OUTILS,
): string[] {
  const pbs: string[] = [];
  const vus = new Set<string>();
  const idsDeprecies = new Set(deprecies.map((d) => d.toolId as string));
  for (const { toolId, plan } of deprecies) {
    if (vus.has(toolId)) pbs.push(`outil déprécié deux fois : ${toolId}`);
    vus.add(toolId);
    if (!CANONIQUES.has(toolId)) pbs.push(`outil déprécié hors registre : ${toolId}`);
    if (!/^studio-tool-manifest\/[1-9][0-9]*$/.test(plan.depuis)) pbs.push(`${toolId} : version de dépréciation invalide`);
    if (!plan.motif.trim()) pbs.push(`${toolId} : motif absent`);
    if (plan.commandesEnAttente !== "executees") pbs.push(`${toolId} : commandes en attente sans plan`);
    if (plan.documents !== "lecture-conservee") pbs.push(`${toolId} : documents sans plan de lecture`);
    if (plan.profils === "remplacement" && plan.remplacement === null) pbs.push(`${toolId} : profils remplacés sans outil de remplacement`);
    if (plan.remplacement !== null && (!CANONIQUES.has(plan.remplacement) || idsDeprecies.has(plan.remplacement) || plan.remplacement === toolId)) pbs.push(`${toolId} : remplacement non actif ${plan.remplacement}`);
  }
  const chargeurs = new Set(STUDIO_CHARGEURS_OUTILS.map((c) => c.id as string));
  for (const m of modules) if (!chargeurs.has(m.chargeur)) pbs.push(`module déprécié inconnu : ${m.chargeur}`);
  return pbs;
}

/**
 * Outils dont les objets d'un document ont besoin pour être relus (type d'objet → outil qui le crée). Ne lit que la
 * forme du document ; un type inconnu de cette table est rendu dans `inconnus`, jamais ignoré.
 */
const OUTIL_DU_TYPE: Readonly<Record<string, StudioToolId>> = Object.freeze({
  line: "studio.dessin.ligne", rectangle: "studio.dessin.rectangle", circle: "studio.dessin.cercle", arc: "studio.dessin.arc",
  polyline: "studio.dessin.polyligne", dimension: "studio.dessin.cote", "angular-dimension": "studio.dessin.cote-angulaire", text: "studio.dessin.texte",
  box: "studio.solide.boite", prism: "studio.solide.prisme", wall: "studio.architecture.mur", opening: "studio.architecture.ouverture",
});

export function outilsDuDocument(doc: Pick<StudioDocument, "objects"> & Partial<Pick<StudioDocument, "dimensions" | "annotations" | "solides" | "exacts" | "architecture">>): { outils: StudioToolId[]; inconnus: string[] } {
  const types = [
    ...doc.objects.map((o) => o.type), ...(doc.dimensions ?? []).map((o) => o.type), ...(doc.annotations ?? []).map((o) => o.type),
    ...(doc.solides ?? []).map((o) => o.type), ...(doc.architecture ?? []).map((o) => o.type),
  ] as string[];
  const outils = new Set<StudioToolId>();
  const inconnus = new Set<string>();
  for (const t of types) { const o = Object.hasOwn(OUTIL_DU_TYPE, t) ? OUTIL_DU_TYPE[t] : undefined; if (o) outils.add(o); else inconnus.add(t); }
  if ((doc.exacts ?? []).length) outils.add("studio.solide.booleen");
  return { outils: STUDIO_TOOL_IDS.filter((id) => outils.has(id)), inconnus: [...inconnus].sort() };
}

export interface AvisDepreciation { readonly toolId: StudioToolId; readonly ou: "profil" | "commandes-en-attente" | "document"; readonly plan: PlanCompatibilite }

export interface CompatibiliteTravail {
  /** Le travail se rouvre : chaque outil requis est résoluble (actif, ou déprécié avec plan). */
  readonly reouvrable: boolean;
  /** Outils dépréciés employés, où, et leur plan (à afficher : jamais une perte silencieuse). */
  readonly avis: readonly AvisDepreciation[];
  /** Outils requis absents du registre (travail écrit par une version plus récente, ou outil retiré). */
  readonly introuvables: readonly string[];
  /** Profil relu : identifiants dépréciés conservés, ou suivant leur remplacement. */
  readonly profil: readonly string[];
  /** Commandes en attente : toutes conservées telles quelles (jamais effacées par une dépréciation). */
  readonly commandesConservees: number;
}

/**
 * Compatibilité d'un travail existant (profil enregistré, commandes hors ligne en attente, document à rouvrir) avec
 * les dépréciations déclarées : rien n'est retiré, chaque emploi d'un outil déprécié est rendu visible.
 */
export function compatibiliteTravail(
  travail: { profil?: readonly string[]; commandes?: readonly { toolId: string }[]; document?: Parameters<typeof outilsDuDocument>[0] },
  deprecies: readonly DeclarationDepreciation[] = STUDIO_OUTILS_DEPRECIES,
): CompatibiliteTravail {
  const avis: AvisDepreciation[] = [];
  const introuvables = new Set<string>();
  const noter = (id: string, ou: AvisDepreciation["ou"]) => {
    const s = statutOutil(id, deprecies);
    if (s.statut === "inconnu") introuvables.add(id);
    else if (s.statut === "deprecie" && !avis.some((a) => a.toolId === id && a.ou === ou)) avis.push({ toolId: id as StudioToolId, ou, plan: s.plan });
  };
  const profil = (travail.profil ?? []).map((id) => {
    noter(id, "profil");
    const s = statutOutil(id, deprecies);
    return s.statut === "deprecie" && s.plan.profils === "remplacement" && s.plan.remplacement ? s.plan.remplacement : id;
  });
  for (const c of travail.commandes ?? []) noter(c.toolId, "commandes-en-attente");
  const doc = travail.document ? outilsDuDocument(travail.document) : null;
  for (const id of doc?.outils ?? []) noter(id, "document");
  for (const t of doc?.inconnus ?? []) introuvables.add(`type:${t}`);
  return { reouvrable: introuvables.size === 0, avis, introuvables: [...introuvables], profil: [...new Set(profil)], commandesConservees: travail.commandes?.length ?? 0 };
}
