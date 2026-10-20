import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// Build-time adapter: the static edition consumes the canonical reference JSON,
// without making the browser import the API application or duplicating the data.
const referenceId = "virtual:fadi-front-reference";
// This read-only edition has no Studio engines or application service worker.
export default defineConfig({
  plugins: [{
    name: "fadi-front-reference",
    resolveId(id) { if (id === referenceId) return `\0${referenceId}`; },
    load(id) {
      if (id !== `\0${referenceId}`) return;
      const sources = {
        stepsRaw: "../api/src/data/parcours-steps.json",
        exampleRaw: "../api/src/data/examples/p118-exemple-complet.json",
        parcelRaw: "../api/src/data/examples/p118-parcel.json",
      };
      return Object.entries(sources).map(([name, path]) => {
        const url = new URL(path, import.meta.url);
        this.addWatchFile(url.pathname);
        return `export const ${name} = ${JSON.stringify(readFileSync(url, "utf8"))};`;
      }).join("\n");
    },
  }],
  build: { outDir: "dist-front", emptyOutDir: true, rollupOptions: { input: "front.html" } },
});
