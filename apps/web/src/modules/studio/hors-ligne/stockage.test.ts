// Stockage du Studio hors ligne sur un IndexedDB simulé : propriétaire par clé, comparer-puis-écrire entre onglets,
// oubli complet (déconnexion, changement d'utilisateur).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { localStore, type StudioBrouillonEntry, type StudioContexteEntry } from "../../../lib/local-store";
import { appliquerBrouillon, creerBrouillon } from "../planche2d/brouillon";
import { cleVariante, versHorsLigne } from "./persistance";
import { contexteMemorise, ecrireBrouillonHorsLigne, lireBrouillonHorsLigne, memoriserContexte, retirerBrouillonHorsLigne } from "./stockage";

const disk = vi.hoisted(() => ({ brouillons: new Map<string, StudioBrouillonEntry>(), contextes: new Map<string, StudioContexteEntry>() }));
vi.mock("dexie", () => ({
  default: class {
    version() {
      return { stores: () => {
        const table = <T extends { cle: string }>(m: Map<string, T>) => ({
          get: async (k: string) => m.get(k), put: async (e: T) => { m.set(e.cle, structuredClone(e)); }, delete: async (k: string) => { m.delete(k); }, clear: async () => { m.clear(); },
        });
        Object.assign(this, { studioBrouillons: table(disk.brouillons), studioContextes: table(disk.contextes), transaction: async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)() });
        return { upgrade: () => undefined };
      } };
    }
  },
}));

const ligne = (id: string): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } });
const ctx: StudioContext = { study: { id: "s", name: "É", projectId: "p" }, variant: { id: "v", name: "V", studyId: "s", headRevisionId: "r1" }, revision: { id: "r1", parentRevisionId: null, document: newStudioDocument("d") }, canWrite: true };
const brouillon = (userId: string, id: string) => versHorsLigne(userId, ctx, appliquerBrouillon(creerBrouillon(ctx.revision.document), [ligne(id)]), null, 0, null);

beforeEach(() => { vi.stubGlobal("indexedDB", {}); disk.brouillons.clear(); disk.contextes.clear(); });

describe("Studio hors ligne — propriétaire", () => {
  it("un autre utilisateur de l'appareil ne relit ni le brouillon ni la version lue", async () => {
    const cleA = cleVariante("A", "p", "s", "v"), cleB = cleVariante("B", "p", "s", "v");
    expect((await ecrireBrouillonHorsLigne(cleA, brouillon("A", "a"), null)).type).toBe("ecrit");
    await memoriserContexte(cleA, "A", ctx);
    expect(await lireBrouillonHorsLigne(cleB, "B")).toBeNull();
    expect(await contexteMemorise(cleB, "B")).toBeNull();
    // Même en lisant la clé de A, B n'obtient rien : le propriétaire est vérifié sur la ligne.
    expect(await lireBrouillonHorsLigne(cleA, "B")).toBeNull();
    expect(await contexteMemorise(cleA, "B")).toBeNull();
    expect((await lireBrouillonHorsLigne(cleA, "A"))?.brouillon.pas).toEqual([[ligne("a")]]);
  });

  it("déconnexion ou changement d'utilisateur : tout est oublié", async () => {
    await ecrireBrouillonHorsLigne(cleVariante("A", "p", "s", "v"), brouillon("A", "a"), null);
    await memoriserContexte(cleVariante("A", "p", "s", "v"), "A", ctx);
    await localStore.studioOublierTout();
    expect(disk.brouillons.size + disk.contextes.size).toBe(0);
  });
});

describe("Studio hors ligne — deux onglets", () => {
  it("comparer-puis-écrire : l'écriture d'un onglet périmé est refusée, rien n'est écrasé", async () => {
    const cle = cleVariante("A", "p", "s", "v");
    const un = await ecrireBrouillonHorsLigne(cle, brouillon("A", "onglet-1"), null);
    expect(un.type).toBe("ecrit");
    const jeton1 = un.type === "ecrit" ? un.stamp : null;
    // Onglet 2 a lu la même ligne puis écrit : son jeton remplace celui de l'onglet 1.
    const deux = await ecrireBrouillonHorsLigne(cle, brouillon("A", "onglet-2"), jeton1);
    expect(deux.type).toBe("ecrit");
    // Onglet 1, encore sur l'ancien jeton : refusé, la ligne de l'onglet 2 reste intacte.
    expect((await ecrireBrouillonHorsLigne(cle, brouillon("A", "onglet-1-bis"), jeton1)).type).toBe("autre-onglet");
    expect((await lireBrouillonHorsLigne(cle, "A"))?.brouillon.pas).toEqual([[ligne("onglet-2")]]);
    // Un onglet qui n'a rien lu ne remplace pas non plus un brouillon existant.
    expect((await ecrireBrouillonHorsLigne(cle, brouillon("A", "neuf"), null)).type).toBe("autre-onglet");
    // Retrait après enregistrement : refusé pour le jeton périmé, accepté pour le bon.
    expect(await retirerBrouillonHorsLigne(cle, jeton1)).toBe(false);
    expect(disk.brouillons.has(cle)).toBe(true);
    expect(await retirerBrouillonHorsLigne(cle, deux.type === "ecrit" ? deux.stamp : null)).toBe(true);
    expect(disk.brouillons.has(cle)).toBe(false);
  });
});
