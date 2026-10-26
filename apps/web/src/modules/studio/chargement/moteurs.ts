/**
 * Moteurs d'exécution de Studio et moment de leur chargement (B.3-01 à B.3-05, REF-02 §7.1, EX-038 à EX-041).
 *
 * Proposition soumise à l'arbitrage DEC-06 (API et limites du Tool Manager, non encore arbitrée) : la granularité est
 * celle du **moteur**, jamais un fichier par bouton (EX-041). Un outil du registre `STUDIO_TOOLS` ne déclare pas ses
 * dépendances (le registre est consommé tel quel, son schéma n'est pas modifié) : c'est sa **barre** (`groupe`) qui
 * désigne les moteurs dont il a besoin (`MOTEURS_PAR_BARRE`). Plusieurs outils partagent donc le même moteur, chargé
 * et initialisé une seule fois pour la session (B.3-05, D.3-04).
 *
 * - `coquille-studio` (démarrage) : coquille de Studio, catalogue léger (registre textuel) et profil d'outils.
 * - `planche-2d` (ouverture d'une planche) : éditeur, socle 2D, accrochage, outils usuels.
 * - `rendu-3d` (premier usage) : three.js et la vue 3D ; il s'appuie sur `calcul` pour le maillage.
 * - `calcul` (premier usage) : groupe partagé de Workers de Studio (maillage, métré, lecture DXF, composition de
 *   feuille). Son premier usage est souvent le métré du panneau « Quantités », affiché par défaut à l'ouverture d'une
 *   planche (ADR-STUDIO-PILOTE-01, P-10) : il n'est jamais démarré d'office.
 *
 * - `noyau-exact` (premier usage, lot F2) : noyau exact OCCT (WebAssembly, composant LGPL chargé séparément, D-177)
 *   dans un Worker dédié, chargé à l'activation de l'outil « Booléen exact » (`MOTEURS_PAR_OUTIL`), jamais à
 *   l'ouverture ; une seule instance pour la session, libérable quand plus rien ne l'emploie.
 *
 * Aucun autre moteur de Studio n'embarque de WebAssembly ; le contrôle de découpage du build le vérifie
 * (`carte-morceaux.ts`). Sans aucune importation : ce fichier est lu par `vite.config.ts` au build.
 */

export type IdMoteur = "coquille-studio" | "planche-2d" | "rendu-3d" | "calcul" | "noyau-exact";
export type MomentChargement = "demarrage" | "planche" | "premier-usage";

export interface DescripteurMoteur {
  readonly id: IdMoteur;
  readonly libelleFR: string;
  readonly moment: MomentChargement;
  /** Module source (chemin depuis `apps/web/`) dont le morceau du build porte ce moteur. */
  readonly source: string;
  /** `module` : morceau JavaScript importé dynamiquement ; `worker` : script de Worker. */
  readonly nature: "module" | "worker";
  /** Moteurs requis, chargés avant celui-ci (jamais une seconde copie). */
  readonly dependances: readonly IdMoteur[];
  /**
   * Fichiers annexes du build chargés par URL à l'exécution (motif sur le nom de fichier émis) : le `.wasm` du noyau
   * exact, qui n'est importé par aucun morceau mais fait partie du moteur (disponibilité hors connexion véridique).
   */
  readonly annexes?: string;
}

export const MOTEURS: readonly DescripteurMoteur[] = Object.freeze([
  { id: "coquille-studio", libelleFR: "Coquille de Studio, catalogue et profil", moment: "demarrage", source: "src/modules/studio/StudioShell.tsx", nature: "module", dependances: [] },
  { id: "planche-2d", libelleFR: "Planche 2D (socle, accrochage, outils usuels)", moment: "planche", source: "src/modules/studio/VariantWorkspace.tsx", nature: "module", dependances: ["coquille-studio"] },
  { id: "rendu-3d", libelleFR: "Rendu 3D (three.js)", moment: "premier-usage", source: "src/modules/studio/vue3d/Vue3DStudio.tsx", nature: "module", dependances: ["planche-2d", "calcul"] },
  { id: "calcul", libelleFR: "Calcul hors du fil principal (Workers partagés)", moment: "premier-usage", source: "src/modules/studio/workers/studio.worker.ts", nature: "worker", dependances: [] },
  { id: "noyau-exact", libelleFR: "Noyau exact (OCCT, WebAssembly)", moment: "premier-usage", source: "src/modules/studio/exact/noyau-exact.worker.ts", nature: "worker", dependances: [], annexes: "(^|/)occt-wasm[^/]*\\.wasm$" },
] satisfies DescripteurMoteur[]);

/**
 * Moteurs requis par une barre du registre (`StudioToolDescriptor.groupe`). Une barre absente de cette table est
 * signalée par le test (tout outil du registre doit avoir ses moteurs).
 */
export const MOTEURS_PAR_BARRE: Readonly<Record<string, readonly IdMoteur[]>> = Object.freeze({
  dessin: ["planche-2d"],
  modification: ["planche-2d"],
  calques: ["planche-2d"],
  volume: ["planche-2d"],
  architecture: ["planche-2d"],
  proprietes: ["planche-2d"],
  "volume-libre": ["planche-2d", "rendu-3d"],
  visualisation: ["planche-2d", "rendu-3d"],
  "non-natifs": ["planche-2d"],
  // Graphismes (EX-055) et système de projet (EX-023) : planche 2D seulement.
  graphismes: ["planche-2d"],
  reperes: ["planche-2d"],
  sources: ["planche-2d"],
  // Lot W3-B : panneau « Bâtiment » de la planche ; la vue 3D, si elle est ouverte, rend niveaux, structure et occurrences.
  batiment: ["planche-2d"],
  // Blocs et contraintes (X.1-01) : planche 2D seulement.
  blocs: ["planche-2d"],
  contraintes: ["planche-2d"],
});

/**
 * Moteurs propres à un outil, en plus de ceux de sa barre (granularité du moteur, jamais un fichier par bouton) : le
 * booléen exact charge le noyau exact ; les autres outils de la barre « volume-libre » ne le chargent jamais.
 */
export const MOTEURS_PAR_OUTIL: Readonly<Record<string, readonly IdMoteur[]>> = Object.freeze({
  "studio.solide.booleen": ["noyau-exact"],
});

/** Carte des morceaux écrite au build à côté de l'application (non empreinte, mise en cache par le service worker). */
export const FICHIER_CARTE = "/chargement.json";

export const moteur = (id: IdMoteur): DescripteurMoteur => MOTEURS.find((m) => m.id === id)!;

/** Moteurs requis par `ids`, dépendances comprises, dans l'ordre de chargement (dépendances d'abord, sans doublon). */
export function fermetureMoteurs(ids: readonly IdMoteur[]): IdMoteur[] {
  const ordre: IdMoteur[] = [];
  const visiter = (id: IdMoteur, pile: readonly IdMoteur[]) => {
    if (ordre.includes(id)) return;
    if (pile.includes(id)) throw new Error(`Dépendance circulaire entre moteurs : ${[...pile, id].join(" → ")}`);
    for (const d of moteur(id).dependances) visiter(d, [...pile, id]);
    ordre.push(id);
  };
  for (const id of ids) visiter(id, []);
  return ordre;
}

/** Moteurs d'une barre du registre (dépendances comprises) ; null pour une barre inconnue de cette table. */
export function moteursDeBarre(groupe: string): IdMoteur[] | null {
  const directs = Object.hasOwn(MOTEURS_PAR_BARRE, groupe) ? MOTEURS_PAR_BARRE[groupe] : undefined;
  return directs ? fermetureMoteurs(directs) : null;
}

/** Moteurs d'un outil : ceux de sa barre, puis ses moteurs propres (`MOTEURS_PAR_OUTIL`) ; null pour une barre inconnue. */
export function moteursDeOutil(outil: string, groupe: string): IdMoteur[] | null {
  const barre = Object.hasOwn(MOTEURS_PAR_BARRE, groupe) ? MOTEURS_PAR_BARRE[groupe] : undefined;
  if (!barre) return null;
  const propres = Object.hasOwn(MOTEURS_PAR_OUTIL, outil) ? MOTEURS_PAR_OUTIL[outil]! : [];
  return fermetureMoteurs([...barre, ...propres]);
}
