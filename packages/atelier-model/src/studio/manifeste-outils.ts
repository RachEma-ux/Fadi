/**
 * Manifeste versionné du catalogue d'outils Studio (#166, lot B.1 : B.1-02, B.1-03, B.1-04, B.1-06). Il se pose
 * **au-dessus** du registre `STUDIO_TOOLS` sans le recopier ni le modifier (le registre reste la source des libellés,
 * icônes, raccourcis, barres et schémas, figés par la caractérisation) et déclare pour chaque `toolId` :
 *
 * - son **propriétaire** (module du modèle qui porte le contrat) et son **contrat** (version, nature, refus) ;
 * - ses **contextes** d'action (planche 2D, vue 3D, feuille) ;
 * - le **droit** requis pour l'exécuter (`lecture` : tout membre du projet ; `ecriture` : droit d'écriture du projet,
 *   accordé par le serveur — rôle `modify`). Le manifeste ne donne aucun droit : le serveur reste seul juge ;
 * - son **chargeur** (registre `STUDIO_CHARGEURS_OUTILS` : module de l'interface, inclus ou chargé à la demande, et
 *   ses dépendances) et ses **prérequis** (outils dont il vise le résultat) ;
 *
 * puis la table **scopée et versionnée** des alias de migration d'identifiants (`STUDIO_ALIAS_OUTILS`) : identifiants
 * historiques ou d'un autre catalogue (Planche, palette de l'Atelier) → `toolId` Studio. Un alias ambigu n'est jamais
 * converti en silence : `resoudreAliasOutil` rend alors les alternatives (ex. « echelle » de l'Atelier avant #173).
 *
 * Requalification de la collision « echelle » (B.1-05), constatée au commit de réalisation : voir
 * `docs/ai-team/reports/claude-v8-b1/B1-CATALOGUE-OUTILS.md`. Depuis le lot G2 (EX-027), Studio a deux capacités distinctes :
 * `studio.dessin.echelle` (transformation) et `studio.architecture.echelle-acces` (objet d'accès) ; la palette de l'Atelier a séparé `echelle-acces` de `echelle` au
 * commit 1a6f9b5 (#173). Pur : ni React, ni DOM, ni base.
 */
import { STUDIO_TOOLS, STUDIO_TOOL_IDS, type StudioToolGroup, type StudioToolId } from "./registry.js";

export const STUDIO_MANIFESTE_OUTILS_VERSION = "studio-tool-manifest/1" as const;
export type StudioManifesteOutilsVersion = typeof STUDIO_MANIFESTE_OUTILS_VERSION;

/** Contextes où une capacité agit. `feuille` : feuille de présentation (aucun outil du registre n'y agit aujourd'hui). */
export const STUDIO_CONTEXTES_OUTILS = ["planche-2d", "vue-3d", "feuille"] as const;
export type StudioContexteOutil = (typeof STUDIO_CONTEXTES_OUTILS)[number];

/** Droit requis : `lecture` (tout membre qui lit le projet), `ecriture` (droit d'écriture du projet, jugé par le serveur). */
export type StudioDroitOutil = "lecture" | "ecriture";

export type StudioIdChargeur = "planche-2d" | "vue-3d" | "feuille";
export interface StudioChargeurOutil {
  readonly id: StudioIdChargeur;
  /** `inclus` : présent dans le paquet de la planche ; `a-la-demande` : module chargé à la première ouverture. */
  readonly mode: "inclus" | "a-la-demande";
  /** Module de l'interface qui porte les outils (chemin du dépôt, information de traçabilité). */
  readonly module: string;
  /** Chargeurs à charger avant lui, puis bibliothèques tierces qu'il charge (`npm:`). */
  readonly dependances: readonly (StudioIdChargeur | `npm:${string}`)[];
}

/** Registre des chargeurs (B.1-06). L'état réel des moteurs (chargement, erreurs) est suivi ailleurs (`taches/`). */
export const STUDIO_CHARGEURS_OUTILS: readonly StudioChargeurOutil[] = Object.freeze([
  { id: "planche-2d", mode: "inclus", module: "apps/web/src/modules/studio/planche2d", dependances: [] },
  { id: "vue-3d", mode: "a-la-demande", module: "apps/web/src/modules/studio/vue3d", dependances: ["planche-2d", "npm:three"] },
  { id: "feuille", mode: "inclus", module: "apps/web/src/modules/studio/feuille", dependances: ["planche-2d"] },
].map((c) => Object.freeze({ ...c, dependances: Object.freeze([...c.dependances]) })) as StudioChargeurOutil[]);

/** Propriétaire d'une capacité : module du modèle qui porte son contrat (schémas, commande, validation). */
export interface StudioProprietaireOutil {
  readonly id: string;
  readonly module: string;
}
const PROPRIETAIRES: Readonly<Record<StudioToolGroup, StudioProprietaireOutil>> = Object.freeze({
  dessin: { id: "studio.objets-2d", module: "packages/atelier-model/src/studio/objets" },
  modification: { id: "studio.transformations", module: "packages/atelier-model/src/studio/commandes/modification.ts" },
  calques: { id: "studio.calques", module: "packages/atelier-model/src/studio/commandes/calques.ts" },
  volume: { id: "studio.extrusion", module: "packages/atelier-model/src/studio/commandes/volume.ts" },
  "volume-libre": { id: "studio.objets-3d", module: "packages/atelier-model/src/studio/objets-3d" },
  architecture: { id: "studio.architecture", module: "packages/atelier-model/src/studio/architecture" },
  proprietes: { id: "studio.exigences", module: "packages/atelier-model/src/studio/exigences" },
  visualisation: { id: "studio.scenes", module: "packages/atelier-model/src/studio/scenes" },
  "non-natifs": { id: "studio.non-natifs", module: "packages/atelier-model/src/studio/non-natifs" },
  graphismes: { id: "studio.graphismes", module: "packages/atelier-model/src/studio/graphismes" },
  reperes: { id: "studio.reperes", module: "packages/atelier-model/src/studio/reperes.ts" },
  sources: { id: "studio.sources", module: "packages/atelier-model/src/studio/sources" },
});

export interface StudioEntreeManifeste {
  readonly toolId: StudioToolId;
  readonly proprietaire: StudioProprietaireOutil;
  readonly contrat: {
    readonly contractVersion: (typeof STUDIO_TOOLS)[number]["contractVersion"];
    readonly nature: "lecture" | "mutation";
    readonly refusalCodes: readonly string[];
    readonly supportsDryRun: boolean;
    readonly agentExposure: "none";
  };
  readonly contextes: readonly StudioContexteOutil[];
  readonly droit: StudioDroitOutil;
  readonly chargeur: StudioIdChargeur;
  /** Outils dont celui-ci vise le résultat ; il suffit que l'un d'eux en ait produit un. */
  readonly prerequis: readonly StudioToolId[];
}

interface Declaration { readonly contextes: readonly StudioContexteOutil[]; readonly prerequis?: readonly StudioToolId[] }
const P2D = ["planche-2d"] as const;
const V3D = ["vue-3d"] as const;
const SEL: readonly StudioToolId[] = ["studio.dessin.selection"];

/** Déclaration de chaque capacité ; `satisfies` impose qu'aucun outil du registre ne manque (et aucun en trop). */
const DECLARATIONS = {
  "studio.dessin.selection": { contextes: ["planche-2d", "vue-3d"] },
  "studio.dessin.ligne": { contextes: P2D },
  "studio.dessin.rectangle": { contextes: P2D },
  "studio.dessin.cercle": { contextes: P2D },
  "studio.dessin.arc": { contextes: P2D },
  "studio.dessin.polyligne": { contextes: P2D },
  "studio.dessin.cote": { contextes: P2D },
  "studio.dessin.cote-angulaire": { contextes: P2D },
  "studio.dessin.texte": { contextes: P2D },
  "studio.dessin.deplacer": { contextes: P2D, prerequis: SEL },
  "studio.dessin.modifier": { contextes: P2D, prerequis: SEL },
  "studio.dessin.decaler": { contextes: P2D, prerequis: SEL },
  "studio.dessin.supprimer": { contextes: P2D, prerequis: SEL },
  "studio.dessin.copier": { contextes: P2D, prerequis: SEL },
  "studio.dessin.rotation": { contextes: P2D, prerequis: SEL },
  "studio.dessin.symetrie": { contextes: P2D, prerequis: SEL },
  "studio.dessin.echelle": { contextes: P2D, prerequis: SEL },
  "studio.calque.creer": { contextes: P2D },
  "studio.calque.modifier": { contextes: P2D, prerequis: ["studio.calque.creer"] },
  "studio.objet.calque": { contextes: P2D, prerequis: ["studio.calque.creer"] },
  "studio.objet.extruder": { contextes: P2D, prerequis: SEL },
  "studio.objet.aplatir": { contextes: P2D, prerequis: ["studio.objet.extruder"] },
  "studio.solide.boite": { contextes: V3D },
  "studio.solide.prisme": { contextes: V3D },
  "studio.solide.deplacer": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.solide.supprimer": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.solide.face-decaler": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.solide.face-diviser": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.solide.pivoter": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.solide.resoudre": { contextes: V3D, prerequis: ["studio.solide.prisme"] },
  "studio.solide.booleen": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.solide.cote-face": { contextes: V3D, prerequis: ["studio.solide.boite", "studio.solide.prisme"] },
  "studio.surface.nurbs": { contextes: V3D },
  "studio.surface.modifier": { contextes: V3D, prerequis: ["studio.surface.nurbs"] },
  "studio.surface.epaissir": { contextes: V3D, prerequis: ["studio.surface.nurbs"] },
  "studio.architecture.mur": { contextes: P2D },
  "studio.architecture.ouverture": { contextes: P2D, prerequis: ["studio.architecture.mur"] },
  "studio.architecture.modifier": { contextes: P2D, prerequis: ["studio.architecture.mur"] },
  "studio.architecture.supprimer": { contextes: P2D, prerequis: ["studio.architecture.mur"] },
  "studio.architecture.echelle-acces": { contextes: P2D },
  "studio.propriete.definir": { contextes: P2D },
  "studio.propriete.retirer": { contextes: P2D, prerequis: ["studio.propriete.definir"] },
  "studio.scene.creer": { contextes: V3D },
  "studio.scene.modifier": { contextes: V3D, prerequis: ["studio.scene.creer"] },
  "studio.scene.rappeler": { contextes: V3D, prerequis: ["studio.scene.creer"] },
  "studio.scene.supprimer": { contextes: V3D, prerequis: ["studio.scene.creer"] },
  "studio.apparence.definir": { contextes: V3D },
  "studio.apparence.retirer": { contextes: V3D, prerequis: ["studio.apparence.definir"] },
  "studio.nonnatif.conserver": { contextes: P2D },
  "studio.nonnatif.retirer": { contextes: P2D, prerequis: ["studio.nonnatif.conserver"] },
  "studio.graphisme.creer": { contextes: P2D },
  "studio.graphisme.retirer": { contextes: P2D, prerequis: ["studio.graphisme.creer"] },
  "studio.repere.projet": { contextes: P2D },
  "studio.source.declarer": { contextes: P2D },
} as const satisfies Record<StudioToolId, Declaration>;

const chargeurDe = (contextes: readonly StudioContexteOutil[]): StudioIdChargeur =>
  contextes.includes("planche-2d") ? "planche-2d" : contextes.includes("vue-3d") ? "vue-3d" : "feuille";

/** Manifeste : une entrée par outil du registre, dans l'ordre du registre. */
export const STUDIO_MANIFESTE_OUTILS: {
  readonly version: StudioManifesteOutilsVersion;
  readonly entrees: readonly StudioEntreeManifeste[];
} = Object.freeze({
  version: STUDIO_MANIFESTE_OUTILS_VERSION,
  entrees: Object.freeze(STUDIO_TOOLS.map((t): StudioEntreeManifeste => {
    const d: Declaration = DECLARATIONS[t.toolId];
    return Object.freeze({
      toolId: t.toolId,
      proprietaire: PROPRIETAIRES[t.groupe],
      contrat: Object.freeze({ contractVersion: t.contractVersion, nature: t.nature, refusalCodes: t.refusalCodes, supportsDryRun: t.supportsDryRun, agentExposure: t.agentExposure }),
      contextes: Object.freeze([...d.contextes]),
      droit: t.nature === "mutation" ? "ecriture" : "lecture",
      chargeur: chargeurDe(d.contextes),
      prerequis: Object.freeze([...(d.prerequis ?? [])]),
    });
  })),
});

const PAR_ID: ReadonlyMap<string, StudioEntreeManifeste> = new Map(STUDIO_MANIFESTE_OUTILS.entrees.map((e) => [e.toolId, e]));
export const entreeManifeste = (toolId: string): StudioEntreeManifeste | null => PAR_ID.get(toolId) ?? null;

// ---------------------------------------------------------------------------------------------------------------
// Alias de migration (B.1-04)
// ---------------------------------------------------------------------------------------------------------------

/** Catalogues dont un identifiant peut être migré vers Studio. */
/** Catalogues dont un identifiant peut être migré vers Studio ; `referentiel` : identifiants cités par le Référentiel technique (RT-001, EX-027). */
export type StudioCatalogueSource = "studio" | "planche" | "atelier" | "referentiel";
/**
 * Règle d'un alias : `equivalent` (même capacité dans un autre catalogue), `renomme` (ancien identifiant Studio),
 * `hors-studio` (capacité sans équivalent Studio : jamais convertie vers un outil voisin).
 */
export type StudioRegleAlias = "equivalent" | "renomme" | "hors-studio";
export interface StudioAliasOutil {
  readonly catalogue: StudioCatalogueSource;
  /** Période de validité de l'identifiant source : `courante` (au commit de réalisation) ou `avant-<commit>`. */
  readonly periode: "courante" | `avant-${string}`;
  readonly idHistorique: string;
  /** Précision qui lève une ambiguïté (fiche, famille) ; absente = l'identifiant seul. */
  readonly contexte?: string;
  readonly regle: StudioRegleAlias;
  /** Outil Studio visé ; null pour `hors-studio`. */
  readonly toolId: StudioToolId | null;
}

const eq = (catalogue: StudioCatalogueSource, idHistorique: string, toolId: StudioToolId): StudioAliasOutil =>
  ({ catalogue, periode: "courante", idHistorique, regle: "equivalent", toolId });

/**
 * Table des alias. Aucun identifiant Studio n'a été renommé depuis le premier registre (constat sur l'historique de
 * `registre/`) : aucune entrée `renomme`. Les équivalences Planche et Atelier ne retiennent que les capacités de même
 * nature (Retourner, Pousser / tirer, Rapporteur… n'ont pas d'équivalent Studio et ne sont pas listées).
 */
export const STUDIO_ALIAS_OUTILS: readonly StudioAliasOutil[] = Object.freeze([
  // Planche (packages/planche-model, catalogue-outils.ts).
  eq("planche", "selection", "studio.dessin.selection"), eq("planche", "ligne", "studio.dessin.ligne"), eq("planche", "rectangle", "studio.dessin.rectangle"),
  eq("planche", "cercle", "studio.dessin.cercle"), eq("planche", "arc", "studio.dessin.arc"), eq("planche", "deplacer", "studio.dessin.deplacer"),
  eq("planche", "faire-pivoter", "studio.dessin.rotation"), eq("planche", "echelle", "studio.dessin.echelle"), eq("planche", "decalage", "studio.dessin.decaler"),
  eq("planche", "cotation", "studio.dessin.cote"), eq("planche", "texte", "studio.dessin.texte"),
  // Palette de l'Atelier (apps/web/src/modules/atelier/nouveau/outils.ts), au commit de réalisation.
  eq("atelier", "selection", "studio.dessin.selection"), eq("atelier", "ligne", "studio.dessin.ligne"), eq("atelier", "rectangle", "studio.dessin.rectangle"),
  eq("atelier", "cercle", "studio.dessin.cercle"), eq("atelier", "arc", "studio.dessin.arc"), eq("atelier", "polyligne", "studio.dessin.polyligne"),
  eq("atelier", "deplacer", "studio.dessin.deplacer"), eq("atelier", "copier", "studio.dessin.copier"), eq("atelier", "tourner", "studio.dessin.rotation"),
  eq("atelier", "miroir", "studio.dessin.symetrie"), eq("atelier", "echelle", "studio.dessin.echelle"), eq("atelier", "decaler", "studio.dessin.decaler"),
  eq("atelier", "supprimer", "studio.dessin.supprimer"), eq("atelier", "cotation", "studio.dessin.cote"), eq("atelier", "texte", "studio.dessin.texte"),
  eq("atelier", "mur", "studio.architecture.mur"), eq("atelier", "ouverture", "studio.architecture.ouverture"),
  eq("atelier", "echelle-acces", "studio.architecture.echelle-acces"),
  // Atelier avant 1a6f9b5 (#173) : deux outils portaient « echelle ». Seule la fiche lève l'ambiguïté.
  { catalogue: "atelier", periode: "avant-1a6f9b5", idHistorique: "echelle", contexte: "DA-07-13", regle: "equivalent", toolId: "studio.architecture.echelle-acces" },
  { catalogue: "atelier", periode: "avant-1a6f9b5", idHistorique: "echelle", contexte: "DA-02-05", regle: "equivalent", toolId: "studio.dessin.echelle" },
  // Référentiel technique RT-001 (EX-027) : identifiants d'exemple du texte source, distincts, résolus vers Studio.
  eq("referentiel", "studio.draw.line2d", "studio.dessin.ligne"), eq("referentiel", "studio.transform.scale", "studio.dessin.echelle"),
  eq("referentiel", "studio.arch.ladder", "studio.architecture.echelle-acces"),
].map((a) => Object.freeze(a)) as StudioAliasOutil[]);

export type StudioResolutionAlias =
  | { readonly statut: "canonique"; readonly toolId: StudioToolId }
  | { readonly statut: "alias"; readonly toolId: StudioToolId; readonly alias: StudioAliasOutil }
  | { readonly statut: "hors-studio"; readonly alias: StudioAliasOutil }
  /** Plusieurs lectures possibles : rien n'est choisi ; `alternatives` les nomme (null = hors Studio). */
  | { readonly statut: "ambigu"; readonly alternatives: readonly StudioAliasOutil[] }
  | { readonly statut: "inconnu" };

const CANONIQUES: ReadonlySet<string> = new Set(STUDIO_TOOL_IDS as readonly string[]);

/**
 * Résout un identifiant d'outil vers Studio. Catalogue `studio` (défaut) : un `toolId` du registre est canonique ; un
 * ancien identifiant passe par un alias `renomme`. Autre catalogue : l'alias de la période (défaut `courante`) et du
 * contexte donné ; plusieurs lectures distinctes → `ambigu`, jamais un choix par défaut.
 */
export function resoudreAliasOutil(
  id: string,
  options: { catalogue?: StudioCatalogueSource; periode?: StudioAliasOutil["periode"]; contexte?: string } = {},
  table: readonly StudioAliasOutil[] = STUDIO_ALIAS_OUTILS,
): StudioResolutionAlias {
  const catalogue = options.catalogue ?? "studio";
  if (catalogue === "studio" && CANONIQUES.has(id)) return { statut: "canonique", toolId: id as StudioToolId };
  const periode = options.periode ?? "courante";
  const candidats = table.filter((a) => a.catalogue === catalogue && a.idHistorique === id && a.periode === periode
    && (options.contexte === undefined || a.contexte === undefined || a.contexte === options.contexte));
  const lectures = new Map(candidats.map((a) => [a.toolId ?? "hors-studio", a]));
  if (lectures.size === 0) return { statut: "inconnu" };
  if (lectures.size > 1) return { statut: "ambigu", alternatives: candidats };
  const a = candidats[0]!;
  return a.toolId === null ? { statut: "hors-studio", alias: a } : { statut: "alias", toolId: a.toolId, alias: a };
}

/**
 * Identifiant stocké (préférences d'un compte) → `toolId` canonique, ou null s'il n'a plus de lecture sûre. Un
 * identifiant du registre reste tel quel ; un ancien identifiant Studio suit son alias `renomme`.
 */
export function toolIdCanonique(id: string, table: readonly StudioAliasOutil[] = STUDIO_ALIAS_OUTILS): StudioToolId | null {
  const r = resoudreAliasOutil(id, { catalogue: "studio" }, table);
  return r.statut === "canonique" || r.statut === "alias" ? r.toolId : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Contrôle du manifeste
// ---------------------------------------------------------------------------------------------------------------

/**
 * Problèmes du manifeste et de la table d'alias (vide = valide) : outil du registre sans entrée ou cité deux fois,
 * chargeur inconnu ou dépendance circulaire, prérequis hors registre ou circulaire, contexte inconnu, droit qui ne
 * suit pas la nature, alias qui masque un `toolId` canonique, cible hors registre, doublon d'alias.
 */
export function controlerManifesteOutils(
  manifeste: { readonly version: string; readonly entrees: readonly StudioEntreeManifeste[] } = STUDIO_MANIFESTE_OUTILS,
  alias: readonly StudioAliasOutil[] = STUDIO_ALIAS_OUTILS,
  chargeurs: readonly StudioChargeurOutil[] = STUDIO_CHARGEURS_OUTILS,
): string[] {
  const pbs: string[] = [];
  if (!/^studio-tool-manifest\/[1-9][0-9]*$/.test(manifeste.version)) pbs.push(`version de manifeste invalide : ${manifeste.version}`);
  const vus = new Map<string, number>();
  for (const e of manifeste.entrees) vus.set(e.toolId, (vus.get(e.toolId) ?? 0) + 1);
  for (const [id, n] of vus) if (n > 1) pbs.push(`outil cité ${n} fois : ${id}`);
  for (const id of CANONIQUES) if (!vus.has(id)) pbs.push(`outil du registre sans entrée : ${id}`);
  for (const id of vus.keys()) if (!CANONIQUES.has(id)) pbs.push(`entrée hors registre : ${id}`);
  const idsChargeurs = new Map(chargeurs.map((c) => [c.id as string, c]));
  if (idsChargeurs.size !== chargeurs.length) pbs.push("chargeur déclaré deux fois");
  for (const c of chargeurs) for (const d of c.dependances) if (!d.startsWith("npm:") && !idsChargeurs.has(d)) pbs.push(`chargeur ${c.id} : dépendance inconnue ${d}`);
  const cycle = (suivants: (n: string) => readonly string[], noeuds: Iterable<string>, quoi: string) => {
    const etat = new Map<string, 1 | 2>();
    const visiter = (n: string, chemin: string[]): void => {
      if (etat.get(n) === 2) return;
      if (etat.get(n) === 1) { pbs.push(`${quoi} circulaire : ${[...chemin, n].join(" → ")}`); return; }
      etat.set(n, 1);
      for (const s of suivants(n)) visiter(s, [...chemin, n]);
      etat.set(n, 2);
    };
    for (const n of noeuds) visiter(n, []);
  };
  cycle((n) => (idsChargeurs.get(n)?.dependances ?? []).filter((d) => !d.startsWith("npm:")), idsChargeurs.keys(), "dépendance de chargeur");
  for (const e of manifeste.entrees) {
    if (!idsChargeurs.has(e.chargeur)) pbs.push(`${e.toolId} : chargeur inconnu ${e.chargeur}`);
    if (!e.contextes.length) pbs.push(`${e.toolId} : aucun contexte`);
    for (const c of e.contextes) if (!(STUDIO_CONTEXTES_OUTILS as readonly string[]).includes(c)) pbs.push(`${e.toolId} : contexte inconnu ${c}`);
    if (e.droit !== (e.contrat.nature === "mutation" ? "ecriture" : "lecture")) pbs.push(`${e.toolId} : droit ${e.droit} pour une ${e.contrat.nature}`);
    for (const p of e.prerequis) if (!CANONIQUES.has(p)) pbs.push(`${e.toolId} : prérequis hors registre ${p}`);
    if (e.prerequis.includes(e.toolId)) pbs.push(`${e.toolId} : prérequis de lui-même`);
  }
  const prerequis = new Map(manifeste.entrees.map((e) => [e.toolId as string, e.prerequis as readonly string[]]));
  cycle((n) => prerequis.get(n) ?? [], prerequis.keys(), "prérequis");
  const cles = new Set<string>();
  for (const a of alias) {
    const cle = `${a.catalogue}|${a.periode}|${a.idHistorique}|${a.contexte ?? ""}`;
    if (cles.has(cle)) pbs.push(`alias en double : ${cle}`);
    cles.add(cle);
    if (a.catalogue === "studio" && CANONIQUES.has(a.idHistorique)) pbs.push(`alias qui masque un outil du registre : ${a.idHistorique}`);
    if (a.toolId !== null && !CANONIQUES.has(a.toolId)) pbs.push(`alias ${a.idHistorique} : cible hors registre ${a.toolId}`);
    if ((a.regle === "hors-studio") !== (a.toolId === null)) pbs.push(`alias ${a.idHistorique} : règle ${a.regle} incohérente avec sa cible`);
    if (a.regle === "renomme" && a.catalogue !== "studio") pbs.push(`alias ${a.idHistorique} : « renomme » réservé au catalogue studio`);
  }
  return pbs;
}
