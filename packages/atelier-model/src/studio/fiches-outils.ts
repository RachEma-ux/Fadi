/**
 * Fiches d'outils du manifeste et règle « prêt à développer / conforme » (AC-011, TR-AC-011).
 *
 * AC-011 : « Un outil est déclaré prêt pour implémentation seulement lorsque ses entrées, sorties, préconditions,
 * permissions, effets, risques, mesures et jeux d'essai sont explicités. Un outil est déclaré conforme seulement après
 * preuve d'exécution sur version et profil de charge désignés. »
 *
 * Chaque fiche est **dérivée** du registre et du manifeste (jamais recopiée) pour ce qu'ils déclarent déjà :
 * entrées (`inputSchema`), sorties (`outputSchema`), préconditions (contextes et prérequis), permission (droit) et effets
 * (nature) ; elle ajoute ce que le manifeste ne portait pas :
 * - **risques** : les refus du contrat d'exécution (paramètres `studio-invalid`, révision dépassée, droit retiré, quota
 *   d'invocation — EX-028), et l'échec du noyau pour l'outil exact (AC-006) — des faits du contrat, rien d'inventé ;
 * - **mesures** : les codes de performance (REF-02 §18.1, `chargement/perf.ts`) qui relèvent cet outil ;
 * - **jeux d'essai** : fichiers de test réels — caractérisation (cas positif, chaque outil) et fichiers qui citent
 *   l'outil avec des cas de refus (cas négatifs) ; leur existence et leur contenu sont contrôlés par test.
 *
 * Règle (`evaluerFicheOutil`) : `incomplet` dès qu'un champ manque (dont un jeu négatif) ; `pret-a-developper` quand
 * tout est explicité ; `conforme` seulement avec une preuve d'exécution dont le build ET le profil de charge sont ceux
 * désignés (`DESIGNATION_CONFORMITE`). Aucune version ni aucun profil de charge ne sont désignés à ce jour (limites
 * DEC-13 non arbitrées) : aucun outil n'est déclaré conforme, quelle que soit la présence de ses champs.
 * Pur : ni React, ni DOM.
 */
import { STUDIO_MANIFESTE_OUTILS, type StudioContexteOutil, type StudioDroitOutil } from "./manifeste-outils.js";
import { STUDIO_TOOLS, type StudioToolId } from "./registry.js";

/** Codes de performance de REF-02 §18.1 relevés par Studio (`apps/web/src/modules/studio/chargement/perf.ts`). */
export type CodeMesureOutil = "PERF-02" | "PERF-03" | "PERF-04" | "PERF-05" | "PERF-07" | "PERF-08";

export interface JeuEssai {
  readonly cas: "positif" | "negatif";
  /** Fichier de test du paquet du modèle (chemin relatif à `packages/atelier-model/src/studio/`). */
  readonly fichier: string;
}

export interface PreuveExecution {
  readonly toolId: StudioToolId;
  /** Identifiant du build exécuté (commit + empreinte). */
  readonly build: string;
  /** Profil de charge désigné (corpus, appareil, réseau). */
  readonly profilCharge: string;
  /** Recette ou rapport qui porte le résultat. */
  readonly recette: string;
  readonly resultat: "reussi" | "echoue";
}

export interface FicheOutil {
  readonly toolId: StudioToolId;
  readonly entrees: Readonly<Record<string, unknown>> | null;
  readonly sorties: Readonly<Record<string, unknown>> | null;
  readonly preconditions: { readonly contextes: readonly StudioContexteOutil[]; readonly prerequis: readonly StudioToolId[] } | null;
  readonly permission: StudioDroitOutil | null;
  readonly effets: string | null;
  readonly risques: readonly string[];
  readonly mesures: readonly CodeMesureOutil[];
  readonly jeuxEssai: readonly JeuEssai[];
}

const CARACTERISATION = "caracterisation.test.ts";

/** Cas positifs hors caractérisation (outils que la caractérisation ne cite pas par leur identifiant). */
const POSITIFS: Readonly<Partial<Record<StudioToolId, string>>> = {
  "studio.solide.boite": "objets-3d/objets-3d.test.ts", "studio.solide.prisme": "objets-3d/objets-3d.test.ts",
  "studio.solide.deplacer": "objets-3d/objets-3d.test.ts", "studio.solide.supprimer": "objets-3d/objets-3d.test.ts",
};

/** Fichiers de test qui citent l'outil avec des cas de refus (contrôlés par `fiches-outils.test.ts`). */
const NEGATIFS: Readonly<Record<StudioToolId, readonly string[]>> = {
  "studio.architecture.mur": ["architecture/architecture.test.ts", "studio-invariants.test.ts", "exigences/exigences.test.ts"],
  "studio.architecture.ouverture": ["architecture/architecture.test.ts", "studio-invariants.test.ts", "exigences/exigences.test.ts"],
  "studio.architecture.modifier": ["architecture/architecture.test.ts", "studio-invariants.test.ts"],
  "studio.architecture.supprimer": ["architecture/architecture.test.ts", "exigences/exigences.test.ts"],
  "studio.calque.creer": ["planche-2d.test.ts", "annotations.test.ts", "transformations-annotations.test.ts"],
  "studio.calque.modifier": ["planche-2d.test.ts", "annotations.test.ts", "transformations-annotations.test.ts"],
  "studio.objet.calque": ["planche-2d.test.ts", "annotations.test.ts", "transformations-annotations.test.ts"],
  "studio.dessin.selection": ["studio-invariants.test.ts", "planche-2d.test.ts"],
  "studio.dessin.ligne": ["transformations.test.ts", "courbes.test.ts", "studio-invariants.test.ts", "annotations.test.ts", "planche-2d.test.ts"],
  "studio.dessin.rectangle": ["transformations.test.ts", "studio-invariants.test.ts"],
  "studio.dessin.cercle": ["transformations.test.ts", "courbes.test.ts"],
  "studio.dessin.arc": ["transformations.test.ts", "courbes.test.ts"],
  "studio.dessin.polyligne": ["transformations.test.ts", "courbes.test.ts", "studio-invariants.test.ts", "annotations.test.ts"],
  "studio.dessin.cote": ["transformations.test.ts", "courbes.test.ts", "studio-invariants.test.ts", "planche-2d.test.ts"],
  "studio.dessin.cote-angulaire": ["studio-invariants.test.ts", "annotations.test.ts"],
  "studio.dessin.texte": ["annotations.test.ts"],
  "studio.dessin.deplacer": ["courbes.test.ts", "architecture/architecture.test.ts", "annotations.test.ts", "studio-invariants.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.dessin.modifier": ["courbes.test.ts", "annotations.test.ts", "studio-invariants.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.dessin.decaler": ["courbes.test.ts"],
  "studio.dessin.supprimer": ["courbes.test.ts", "architecture/architecture.test.ts", "annotations.test.ts", "studio-invariants.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.dessin.copier": ["transformations.test.ts", "architecture/architecture.test.ts", "studio-invariants.test.ts"],
  "studio.dessin.rotation": ["transformations.test.ts", "architecture/architecture.test.ts", "annotations.test.ts", "studio-invariants.test.ts"],
  "studio.dessin.symetrie": ["transformations.test.ts", "architecture/architecture.test.ts", "annotations.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.dessin.echelle": ["transformations.test.ts", "architecture/architecture.test.ts", "annotations.test.ts"],
  "studio.nonnatif.conserver": ["import-ifc/import-ifc.test.ts"],
  "studio.nonnatif.retirer": ["import-ifc/import-ifc.test.ts"],
  "studio.propriete.definir": ["exigences/exigences.test.ts", "exemples/p118.test.ts"],
  "studio.propriete.retirer": ["exigences/exigences.test.ts"],
  "studio.scene.creer": ["scenes/scenes.test.ts"],
  "studio.scene.modifier": ["scenes/scenes.test.ts"],
  "studio.scene.rappeler": ["scenes/scenes.test.ts"],
  "studio.scene.supprimer": ["scenes/scenes.test.ts"],
  "studio.apparence.definir": ["scenes/scenes.test.ts"],
  "studio.apparence.retirer": ["scenes/scenes.test.ts"],
  "studio.solide.boite": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts", "f2-booleen.test.ts", "preuves-b.test.ts"],
  "studio.solide.prisme": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts", "f2-booleen.test.ts", "preuves-b.test.ts"],
  "studio.solide.deplacer": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts", "f2-booleen.test.ts"],
  "studio.solide.supprimer": ["objets-3d/objets-3d.test.ts", "f2-booleen.test.ts"],
  "studio.solide.face-decaler": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts", "preuves-b.test.ts"],
  "studio.solide.face-diviser": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.solide.pivoter": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts", "preuves-b.test.ts"],
  "studio.solide.resoudre": ["objets-3d/objets-3d.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.solide.booleen": ["objets-3d/objets-3d.test.ts", "f2-booleen.test.ts"],
  "studio.objet.extruder": ["exigences/exigences.test.ts", "mesh-3d.test.ts", "composition/f1-geometrie.test.ts"],
  "studio.objet.aplatir": ["exigences/exigences.test.ts", "mesh-3d.test.ts"],
};

/** Mesures par barre (codes instrumentés par Studio) ; l'outil exact relève aussi PERF-07. */
const MESURES_PAR_BARRE: Readonly<Record<string, readonly CodeMesureOutil[]>> = {
  dessin: ["PERF-02", "PERF-03", "PERF-04"], modification: ["PERF-02", "PERF-03", "PERF-04"], calques: ["PERF-02"], volume: ["PERF-02", "PERF-05"],
  "volume-libre": ["PERF-02", "PERF-05"], architecture: ["PERF-02", "PERF-03", "PERF-04"], proprietes: ["PERF-02"], visualisation: ["PERF-02", "PERF-05"], "non-natifs": ["PERF-02"],
};

/** Risques du contrat d'exécution (EX-028) : chaque refus laisse le document intact. */
function risquesDe(nature: "lecture" | "mutation", toolId: string): string[] {
  if (nature === "lecture") return ["Objet ou contexte introuvable : aucun résultat, rien n'est modifié."];
  const r = [
    "Paramètres refusés par la validation canonique (studio-invalid) : lot rejeté en entier, rien n'est écrit.",
    "Révision de base dépassée : refus 409, aucune réécriture silencieuse.",
    "Droit d'écriture absent ou retiré : refus 403 / 423 à l'exécution.",
    "Quota d'invocation du compte atteint : refus 429, rien n'est écrit.",
  ];
  if (toolId === "studio.solide.booleen") r.push("Échec ou coupure du noyau exact : aucune mutation partielle, attente résolue, relance explicite (AC-006).");
  return r;
}

const PAR_ENTREE = new Map(STUDIO_MANIFESTE_OUTILS.entrees.map((e) => [e.toolId as string, e]));

/** Fiches de tous les outils du registre, dans son ordre. */
export const STUDIO_FICHES_OUTILS: readonly FicheOutil[] = Object.freeze(STUDIO_TOOLS.map((t): FicheOutil => {
  const m = PAR_ENTREE.get(t.toolId)!;
  return Object.freeze({
    toolId: t.toolId,
    entrees: t.inputSchema, sorties: t.outputSchema,
    preconditions: { contextes: m.contextes, prerequis: m.prerequis },
    permission: m.droit,
    effets: t.nature === "mutation" ? "Mutation du document par une commande validée (nouvelle révision)." : "Lecture seule : aucune commande persistée.",
    risques: risquesDe(t.nature, t.toolId),
    mesures: [...(MESURES_PAR_BARRE[t.groupe] ?? []), ...(t.toolId === "studio.solide.booleen" ? ["PERF-07" as const] : [])],
    jeuxEssai: [
      { cas: "positif" as const, fichier: POSITIFS[t.toolId] ?? CARACTERISATION },
      ...(NEGATIFS[t.toolId] ?? []).map((fichier) => ({ cas: "negatif" as const, fichier })),
    ],
  });
}));

/** Build et profil de charge désignés pour déclarer un outil conforme ; null = aucun désigné (DEC-13 non arbitrée). */
export interface DesignationConformite { readonly build: string; readonly profilsCharge: readonly string[] }
export const DESIGNATION_CONFORMITE: DesignationConformite | null = null;
/** Preuves d'exécution enregistrées (aucune sur un build et un profil désignés à ce jour). */
export const PREUVES_EXECUTION_OUTILS: readonly PreuveExecution[] = Object.freeze([]);

export type EtatFicheOutil = "incomplet" | "pret-a-developper" | "conforme";

/** Règle AC-011 : champs explicités → prêt ; preuve réussie sur le build ET un profil désignés → conforme. */
export function evaluerFicheOutil(f: FicheOutil, preuves: readonly PreuveExecution[] = PREUVES_EXECUTION_OUTILS, designation: DesignationConformite | null = DESIGNATION_CONFORMITE): { etat: EtatFicheOutil; manques: string[] } {
  const manques: string[] = [];
  if (!f.entrees || Object.keys(f.entrees).length === 0) manques.push("entrées");
  if (!f.sorties || Object.keys(f.sorties).length === 0) manques.push("sorties");
  if (!f.preconditions || f.preconditions.contextes.length === 0) manques.push("préconditions");
  if (!f.permission) manques.push("permissions");
  if (!f.effets) manques.push("effets");
  if (f.risques.length === 0) manques.push("risques");
  if (f.mesures.length === 0) manques.push("mesures");
  if (!f.jeuxEssai.some((j) => j.cas === "positif")) manques.push("jeu d'essai positif");
  if (!f.jeuxEssai.some((j) => j.cas === "negatif")) manques.push("jeu d'essai négatif");
  if (manques.length) return { etat: "incomplet", manques };
  const prouve = designation !== null && preuves.some((p) => p.toolId === f.toolId && p.resultat === "reussi" && p.build === designation.build && designation.profilsCharge.includes(p.profilCharge));
  return { etat: prouve ? "conforme" : "pret-a-developper", manques: prouve ? [] : ["preuve d'exécution sur build et profil de charge désignés"] };
}
