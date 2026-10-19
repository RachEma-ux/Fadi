// File locale incompatible (B.3-11) et protection du stockage (B.3-10) sur un IndexedDB simulé : l'export relit la
// ligne conservée au moment du clic ; l'abandon ne retire que la ligne exportée (jeton comparé) ; la première écriture
// d'un brouillon relance la demande de stockage persistant.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import type { StudioBrouillonEntry } from "../../../lib/local-store";
import { appliquerBrouillon, creerBrouillon } from "../planche2d/brouillon";
import { abandonnerFileLocale, fileBloquee, preparerExportFileLocale, signalerFileBloquee, TEXTES_FILE_LOCALE } from "./AvisFileLocale";
import { cleVariante, versHorsLigne } from "./persistance";
import { ecrireBrouillonHorsLigne } from "./stockage";

const disk = vi.hoisted(() => ({ brouillons: new Map<string, StudioBrouillonEntry>() }));
const proteger = vi.hoisted(() => vi.fn(async () => "persistant" as const));
vi.mock("../chargement/hors-connexion-studio", () => ({ protegerFileLocale: proteger }));
vi.mock("dexie", () => ({
  default: class {
    version() {
      return { stores: () => {
        const table = <T extends { cle: string }>(m: Map<string, T>) => ({
          get: async (k: string) => m.get(k), put: async (e: T) => { m.set(e.cle, structuredClone(e)); }, delete: async (k: string) => { m.delete(k); }, clear: async () => { m.clear(); },
        });
        Object.assign(this, { studioBrouillons: table(disk.brouillons), studioContextes: table(new Map()), transaction: async (...args: unknown[]) => (args[args.length - 1] as () => Promise<unknown>)() });
        return { upgrade: () => undefined };
      } };
    }
  },
}));

const cle = cleVariante("A", "p", "s", "v");
const ligne = (stamp: string, donnees = '{"version":99}'): StudioBrouillonEntry => ({ cle, userId: "A", projectId: "p", stamp, donnees, majA: "2026-10-19T00:00:00.000Z" });

beforeEach(() => { vi.stubGlobal("indexedDB", {}); disk.brouillons.clear(); proteger.mockClear(); });

describe("file locale incompatible : export relu, abandon comparé (B.3-11)", () => {
  it("l'export relit la ligne au clic, pas la copie signalée en mémoire", async () => {
    disk.brouillons.set(cle, ligne("v1"));
    signalerFileBloquee(cle, "version-future", ligne("v1"));
    // Un autre onglet réécrit la ligne après le signalement.
    disk.brouillons.set(cle, ligne("v2", '{"version":99,"plus":1}'));
    const e = await preparerExportFileLocale(cle, "A", "version-future", () => new Date("2026-10-19T10:00:00.000Z"));
    expect(e?.jeton).toBe("v2");
    const fichier = JSON.parse(e!.contenu) as { raison: string; ligne: StudioBrouillonEntry; exporteeA: string };
    expect(fichier.ligne.stamp).toBe("v2");
    expect(fichier.ligne.donnees).toBe('{"version":99,"plus":1}');
    expect(fichier.raison).toBe("version-future");
    // Ligne d'un autre compte ou disparue : rien à exporter.
    expect(await preparerExportFileLocale(cle, "B", "version-future")).toBeNull();
    disk.brouillons.clear();
    expect(await preparerExportFileLocale(cle, "A", "version-future")).toBeNull();
  });

  it("l'abandon retire la ligne exportée ; une ligne réécrite depuis l'export est conservée et refusée", async () => {
    disk.brouillons.set(cle, ligne("v1"));
    signalerFileBloquee(cle, "version-future", ligne("v1"));
    const e = await preparerExportFileLocale(cle, "A", "version-future");
    disk.brouillons.set(cle, ligne("v2"));
    expect(await abandonnerFileLocale(cle, e!.jeton)).toBe("changee");
    expect(disk.brouillons.get(cle)?.stamp).toBe("v2");
    expect(fileBloquee(cle)).not.toBeNull();
    // Nouvel export, puis abandon accepté.
    const e2 = await preparerExportFileLocale(cle, "A", "version-future");
    expect(await abandonnerFileLocale(cle, e2!.jeton)).toBe("abandonnee");
    expect(disk.brouillons.has(cle)).toBe(false);
    expect(fileBloquee(cle)).toBeNull();
    expect(TEXTES_FILE_LOCALE.changee).toMatch(/Téléchargez-la de nouveau/);
  });
});

describe("stockage persistant redemandé à la première écriture d'un brouillon (B.3-10, EX-044)", () => {
  it("création de la ligne : demande relancée pour ce compte ; réécriture : non", async () => {
    const ctx: StudioContext = { study: { id: "s", name: "É", projectId: "p" }, variant: { id: "v", name: "V", studyId: "s", headRevisionId: "r1" }, revision: { id: "r1", parentRevisionId: null, document: newStudioDocument("d") }, canWrite: true };
    const cmd: StudioCommand = { toolId: "studio.dessin.ligne", params: { id: "a", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } };
    const h = versHorsLigne("A", ctx, appliquerBrouillon(creerBrouillon(ctx.revision.document), [cmd]), null, 0, null);
    const un = await ecrireBrouillonHorsLigne(cle, h, null);
    expect(un.type).toBe("ecrit");
    expect(proteger).toHaveBeenCalledTimes(1);
    expect(proteger).toHaveBeenCalledWith("A");
    await ecrireBrouillonHorsLigne(cle, h, un.type === "ecrit" ? un.stamp : null);
    expect(proteger).toHaveBeenCalledTimes(1);
  });
});
