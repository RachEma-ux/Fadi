import type { StudioOperandeExact, StudioResultatExact, StudioSolideExact } from "./objets-3d/exacts.js";

/**
 * Données SYNTHÉTIQUES de test (lot F2) : un « résultat exact » de forme valide pour le modèle (base64, maillage indexé,
 * mesures positives, empreinte de 16 caractères hexadécimaux) sans aucun calcul du noyau. Le brep n'est pas un vrai
 * binaire OCCT : ces données servent à tester la validation, les commandes, le maillage d'affichage et les échanges du
 * modèle, jamais une géométrie exacte (les tests du noyau et de l'API en calculent de vraies).
 */
export function resultatSynthetique(volume = 1, empreinte = "0123456789abcdef"): StudioResultatExact {
  // Tétraèdre unité, sommets dupliqués par face comme le fait le noyau.
  const s = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]] as const;
  const faces = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]] as const;
  const positions: number[] = [], indices: number[] = [];
  for (const f of faces) { for (const i of f) positions.push(...s[i]); const n = positions.length / 3; indices.push(n - 3, n - 2, n - 1); }
  return { brep: "U1lOVEhFVElRVUU=", maillage: { positions, indices }, volume, aire: 2.366, faces: 4, solides: 1, moteur: "occt-wasm", versionMoteur: "5.6.1", empreinte };
}

export function exactSynthetique(id: string, operandes: [StudioOperandeExact, StudioOperandeExact], layerId?: string): StudioSolideExact {
  return { id, type: "exact", ...(layerId ? { layerId } : {}), operation: "union", operandes, resultat: resultatSynthetique() };
}
