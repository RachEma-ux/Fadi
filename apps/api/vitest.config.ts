import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./vitest.setup.ts"],
    // Les fichiers de test partagent la même base (remise à zéro par TRUNCATE) : ils s'exécutent l'un après l'autre,
    // sans quoi une remise à zéro croise les écritures de l'autre fichier (verrous mortels, sessions effacées).
    fileParallelism: false,
    // Essais d'intégration : plusieurs importent l'exemple complet P.118 (des milliers d'objets) ; 5 s par défaut
    // laissait trop peu de marge sur un banc chargé. Les essais plus longs gardent leur délai propre.
    testTimeout: 20_000,
  },
});
