/**
 * BD-4.8 (décision D-BD-7) — choix du verrou d'une écriture Studio, sans base : le lot de commandes verrouille sa
 * VARIANTE (projet en `FOR SHARE`, variante en `FOR UPDATE`) ; toute autre écriture garde le verrou exclusif du projet
 * (`lockProject`, `FOR UPDATE`). La démonstration de concurrence réelle (deux variantes en parallèle, même variante
 * sérialisée) se fait sur une base PostgreSQL jetable, hors de cette suite.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ db: {} }));
const { lockProject } = vi.hoisted(() => ({ lockProject: vi.fn(async (..._a: unknown[]) => undefined) }));
vi.mock("./step-rows.js", () => ({ lockProject }));

import { projects } from "../db/schema.js";
import { modeVerrouProjetStudio, verrouillerProjetStudio } from "./studio-commands.js";
import type { Tx } from "./atelier-validation.js";

/** Transaction enregistreuse : table lue et mode de verrou demandé. */
function txEnregistreuse() {
  const appels: { table: unknown; mode: string | null }[] = [];
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const appel = { table, mode: null as string | null };
        appels.push(appel);
        const q = { where: () => q, for: (mode: string) => { appel.mode = mode; return Promise.resolve([]); } };
        return q;
      },
    }),
  };
  return { tx: tx as unknown as Tx, appels };
}

describe("BD-4.8 — portée du verrou Studio", () => {
  it("choix pur : `variante` → FOR SHARE sur le projet ; `projet` → FOR UPDATE", () => {
    expect(modeVerrouProjetStudio("variante")).toBe("share");
    expect(modeVerrouProjetStudio("projet")).toBe("update");
  });

  it("`variante` : ligne `projects` en FOR SHARE, jamais `lockProject` (aucune montée de verrou)", async () => {
    lockProject.mockClear();
    const { tx, appels } = txEnregistreuse();
    await verrouillerProjetStudio(tx, "p", "variante");
    expect(lockProject).not.toHaveBeenCalled();
    expect(appels).toEqual([{ table: projects, mode: "share" }]);
  });

  it("`projet` : verrou exclusif historique (`lockProject`)", async () => {
    lockProject.mockClear();
    const { tx, appels } = txEnregistreuse();
    await verrouillerProjetStudio(tx, "p", "projet");
    expect(lockProject).toHaveBeenCalledWith(tx, "p");
    expect(appels).toEqual([]);
  });

  it("seul le lot de commandes prend la portée `variante`, suivie du verrou FOR UPDATE de sa variante ; la fusion garde le projet", () => {
    const lib = readFileSync(fileURLToPath(new URL("./studio-commands.ts", import.meta.url)), "utf8");
    const corps = (debut: string) => { const i = lib.indexOf(debut); expect(i).toBeGreaterThan(0); return lib.slice(i, lib.indexOf("\n}\n", i)); };
    const lot = corps("export async function submitStudioCommands(");
    const iVerrou = lot.indexOf('lockedAccess(transaction, scope.projectId, actorId, "variante")');
    expect(iVerrou).toBeGreaterThan(0);
    expect(lot.indexOf('.for("update")', iVerrou)).toBeGreaterThan(iVerrou);
    expect(lot).not.toContain("lockProject(");
    const fusion = corps("export async function ecrireRevisionFusionStudio(");
    expect(fusion).toContain("lockedAccess(t, scope.projectId, actorId);");
    // Aucun autre appel de `lockedAccess` dans l'API ne passe la portée `variante`.
    expect([...lib.matchAll(/lockedAccess\([^)]*"variante"\)/g)]).toHaveLength(1);
  });
});
