/**
 * Écart E7 (CR-D5 (a)) : un projet devenu inaccessible est oublié de l'appareil — ses lots, son modèle, ses
 * brouillons et contextes Studio — sans toucher aux autres projets ni supprimer la base locale.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

type Ligne = { projectId: string } & Record<string, unknown>;
const disque = vi.hoisted(() => ({ tables: new Map<string, Map<string, Ligne>>() }));

vi.mock("dexie", () => {
  const table = (nom: string, cle: string) => {
    const lignes = () => { if (!disque.tables.has(nom)) disque.tables.set(nom, new Map()); return disque.tables.get(nom)!; };
    return {
      put: async (l: Ligne) => { lignes().set(String(l[cle]), l); },
      where: () => ({ equals: (v: string) => ({ primaryKeys: async () => [...lignes().values()].filter((l) => l.projectId === v).map((l) => String(l[cle])) }) }),
      bulkDelete: async (cles: string[]) => { for (const c of cles) lignes().delete(c); },
    };
  };
  return {
    default: class {
      version() {
        return { stores: () => {
          Object.assign(this, {
            lots: table("lots", "id"), modelCache: table("modelCache", "projectId"),
            studioBrouillons: table("studioBrouillons", "cle"), studioContextes: table("studioContextes", "cle"), keyValue: table("keyValue", "key"), comPhotos: table("comPhotos", "id"),
            transaction: async (_mode: string, _tables: unknown, fn: () => Promise<void>) => fn(),
          });
          return { upgrade: () => ({}) };
        } };
      }
    },
  };
});

const avant = globalThis.indexedDB;
beforeAll(() => { (globalThis as { indexedDB?: unknown }).indexedDB = {}; });
afterAll(() => { (globalThis as { indexedDB?: unknown }).indexedDB = avant; });

describe("oublierProjet (E7, CR-D5)", () => {
  it("oublie lots, modèle, brouillons et contextes Studio, photos COM en attente du projet, et seulement de lui", async () => {
    const { localStore } = await import("./local-store");
    const ecrire = (nom: string, cle: string, l: Ligne) => { if (!disque.tables.has(nom)) disque.tables.set(nom, new Map()); disque.tables.get(nom)!.set(cle, l); };
    for (const p of ["p1", "p2"]) {
      ecrire("lots", `${p}|r1`, { id: `${p}|r1`, projectId: p });
      ecrire("modelCache", p, { projectId: p });
      ecrire("studioBrouillons", `u|${p}|s|v`, { cle: `u|${p}|s|v`, projectId: p });
      ecrire("studioContextes", `u|${p}|s|v`, { cle: `u|${p}|s|v`, projectId: p });
      ecrire("comPhotos", `photo-${p}`, { id: `photo-${p}`, projectId: p });
    }
    await localStore.oublierProjet("p1");
    for (const nom of ["lots", "modelCache", "studioBrouillons", "studioContextes", "comPhotos"]) {
      const restants = [...disque.tables.get(nom)!.values()].map((l) => l.projectId);
      expect(restants, nom).toEqual(["p2"]);
    }
  });
});
