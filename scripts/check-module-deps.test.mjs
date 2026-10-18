// Tests de check-module-deps.mjs : chaque cas construit un arbre minimal et lance le script avec --root.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-module-deps.mjs");

function controler(fichiers) {
  const racine = mkdtempSync(join(tmpdir(), "fadi-deps-"));
  try {
    mkdirSync(join(racine, "packages"));
    for (const [chemin, contenu] of Object.entries(fichiers)) {
      mkdirSync(dirname(join(racine, chemin)), { recursive: true });
      writeFileSync(join(racine, chemin), contenu);
    }
    const r = spawnSync(process.execPath, [script, `--root=${racine}`], { encoding: "utf8" });
    return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
  } finally {
    rmSync(racine, { recursive: true, force: true });
  }
}

const S = "apps/web/src/modules/studio";
const base = {
  "apps/web/src/modules/atelier/nouveau/interne.ts": "export const y = 1;\n",
  "apps/web/src/modules/parcours/ParcoursModule.tsx": "export const p = 1;\n",
  "apps/web/src/routes/ProjectShell.tsx": "export const s = 1;\n",
  "apps/web/src/lib/use-immersive.ts": "export const i = 1;\n",
  "apps/web/src/lib/api.ts": "export const api = 1;\n",
};

test("le dépôt réel est conforme", () => {
  const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

for (const [cas, spec, interdit] of [
  ["Studio → internes de l'Atelier", "../atelier/nouveau/interne", "modules/atelier"],
  ["Studio → Parcours", "../parcours/ParcoursModule", "modules/parcours"],
  ["Studio → ProjectShell sans extension", "../../routes/ProjectShell", "routes/ProjectShell"],
  ["Studio → ProjectShell avec extension", "../../routes/ProjectShell.tsx", "routes/ProjectShell"],
  ["Studio → mode immersif", "../../lib/use-immersive", "lib/use-immersive"],
]) {
  test(`refusé : ${cas}`, () => {
    const r = controler({ ...base, [`${S}/StudioShell.tsx`]: `import { x } from "${spec}";\n` });
    assert.equal(r.code, 1, r.sortie);
    assert.match(r.sortie, new RegExp(`frontière modules/studio → ${interdit} interdite`));
  });
}

test("refusé : import dynamique littéral et chemin détourné par un sous-dossier", () => {
  const r = controler({ ...base, [`${S}/domaines/dessin/Planche.tsx`]: 'const m = await import("../../../atelier/nouveau/interne");\nimport { z } from "../../../studio/../atelier/nouveau/interne";\n' });
  assert.equal(r.code, 1, r.sortie);
  assert.equal(r.sortie.match(/frontière modules\/studio → modules\/atelier/g)?.length, 2);
});

test("refusé : l'Atelier n'importe pas Studio", () => {
  const r = controler({ ...base, [`${S}/contrat.ts`]: "export const c = 1;\n", "apps/web/src/modules/atelier/nouveau/x.ts": 'import { c } from "../../studio/contrat";\n' });
  assert.equal(r.code, 1, r.sortie);
  assert.match(r.sortie, /frontière modules\/atelier → modules\/studio interdite/);
});

test("autorisé : services communs, paquets purs, fichiers internes de Studio et préfixe seulement voisin", () => {
  const r = controler({
    ...base,
    "apps/web/src/modules/atelierx/outil.ts": "export const o = 1;\n",
    [`${S}/etat.ts`]: "export const e = 1;\n",
    [`${S}/StudioShell.tsx`]: [
      'import { api } from "../../lib/api";',
      'import { modeleVide } from "@parcours/atelier-model";',
      'import { e } from "./etat";',
      'import { o } from "../atelierx/outil";',
    ].join("\n") + "\n",
  });
  assert.equal(r.code, 0, r.sortie);
});

test("hors des dossiers concernés, rien ne change (ProjectShell peut importer l'Atelier)", () => {
  const r = controler({ ...base, "apps/web/src/routes/ProjectShell.tsx": 'import { y } from "../modules/atelier/nouveau/interne";\n' });
  assert.equal(r.code, 0, r.sortie);
});
