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
 * - `calcul` (premier usage) : groupe partagé de Workers de Studio (maillage, lecture DXF, composition de feuille).
 *
 * Aucun moteur WASM n'est chargé par Studio V1 (noyau exact : Atelier seulement) ; le contrôle de découpage du build
 * le vérifie (`carte-morceaux.ts`). Sans aucune importation : ce fichier est lu par `vite.config.ts` au build.
 */

export type IdMoteur = "coquille-studio" | "planche-2d" | "rendu-3d" | "calcul";
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
}

export const MOTEURS: readonly DescripteurMoteur[] = Object.freeze([
  { id: "coquille-studio", libelleFR: "Coquille de Studio, catalogue et profil", moment: "demarrage", source: "src/modules/studio/StudioShell.tsx", nature: "module", dependances: [] },
  { id: "planche-2d", libelleFR: "Planche 2D (socle, accrochage, outils usuels)", moment: "planche", source: "src/modules/studio/VariantWorkspace.tsx", nature: "module", dependances: ["coquille-studio"] },
  { id: "rendu-3d", libelleFR: "Rendu 3D (three.js)", moment: "premier-usage", source: "src/modules/studio/vue3d/Vue3DStudio.tsx", nature: "module", dependances: ["planche-2d", "calcul"] },
  { id: "calcul", libelleFR: "Calcul hors du fil principal (Workers partagés)", moment: "premier-usage", source: "src/modules/studio/workers/studio.worker.ts", nature: "worker", dependances: [] },
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
