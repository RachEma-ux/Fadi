import { defineConfig } from "vitest/config";

// Tests unitaires de la logique pure de l'interface (accrochages, outils, actions) : sans DOM ni plugins Vite.
export default defineConfig({ test: { environment: "node", include: ["src/**/*.test.ts"] } });
