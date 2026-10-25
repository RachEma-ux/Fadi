/**
 * Lot F2 (IF-003, R9) — le serveur recalcule chaque booléen exact de Studio avec le même noyau que le navigateur
 * (occt-wasm en Node), depuis les opérandes de SON document, et remplace le résultat annoncé : sans base de données
 * (fonction pure au-dessus du noyau), la route l'appelle avant `applyStudioCommands`.
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, studioCaptureBooleen, type StudioCommand, type StudioDocument } from "@parcours/atelier-model";
import { MoteurExact } from "@parcours/geometry-exact";
import { revaliderBooleensStudio } from "./studio-exact.js";

const boite = (id: string, x: number) => ({ toolId: "studio.solide.boite", params: { id, type: "box", placement: { origin: { x, y: 0, z: 0 }, rotation: 0 }, width: 2, depth: 2, height: 2 } }) as StudioCommand;
const doc = (): StudioDocument => applyStudioCommands(newStudioDocument("srv"), [boite("A", 0), boite("B", 1)]);

async function resultatNavigateur(d: StudioDocument, operation: "union" | "difference" | "intersection", operandes: [string, string]) {
  const c = studioCaptureBooleen(d, { operation, operandes });
  if (!c.ok) throw new Error(c.message);
  return (await MoteurExact.charger()).executer(c.capture.entrees);
}

describe("revaliderBooleensStudio (lot F2) : le serveur fait autorité", () => {
  it("sans booléen : rien n'est calculé ni modifié", async () => {
    const cs = [boite("C", 5)];
    expect(await revaliderBooleensStudio(doc(), cs, applyStudioCommands)).toBeNull();
    expect(cs[0]).toEqual(boite("C", 5));
  });

  it("même empreinte : le résultat du serveur remplace celui du client (un maillage altéré par le client est corrigé)", async () => {
    const d = doc();
    const r = await resultatNavigateur(d, "union", ["A", "B"]);
    const annonce = { ...r, maillage: { positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] }, volume: 999 };
    const cs: StudioCommand[] = [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat: annonce } }];
    expect(await revaliderBooleensStudio(d, cs, applyStudioCommands)).toBeNull();
    const p = cs[0]!.params as { resultat: { volume: number; maillage: unknown; empreinte: string } };
    expect(p.resultat.volume).toBeCloseTo(12, 9);
    expect(p.resultat.maillage).toEqual(r.maillage);
    const apres = applyStudioCommands(d, cs);
    expect(apres.exacts![0]!.resultat.volume).toBeCloseTo(12, 9);
    expect(apres.exacts![0]!.operandes.map((o) => o.id)).toEqual(["A", "B"]);
  });

  it("empreinte différente (calcul du client sur d'autres opérandes) : refus 400 exact-mismatch, rien n'est appliqué", async () => {
    const d = doc();
    const autre = applyStudioCommands(d, [{ toolId: "studio.solide.deplacer", params: { id: "B", dx: 0.5, dy: 0, dz: 0 } }]);
    const r = await resultatNavigateur(autre, "union", ["A", "B"]);
    const cs: StudioCommand[] = [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat: r } }];
    const refus = await revaliderBooleensStudio(d, cs, applyStudioCommands);
    expect(refus).toMatchObject({ status: 400, body: { error: "invalid_commands", code: "exact-mismatch", path: "commands[0].params.resultat.empreinte" } });
  });

  it("préfixe qui ne s'applique pas seul (calque créé plus loin dans le lot) : 400 exact-etat-intermediaire, jamais accepté sans recalcul", async () => {
    const d = doc();
    const faux = { brep: "x", maillage: { positions: [], indices: [] }, volume: 1, empreinte: "fabriquee" };
    const cs: StudioCommand[] = [
      boite("C", 5),
      { toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat: faux } } as unknown as StudioCommand,
    ];
    const appliquerPrefixeInvalide = (dd: StudioDocument, cc: readonly StudioCommand[]) => {
      if (cc.length) throw new Error("calque « later » absent");
      return dd;
    };
    const r = await revaliderBooleensStudio(d, cs, appliquerPrefixeInvalide);
    expect(r).toMatchObject({ status: 400, body: { code: "exact-etat-intermediaire", path: "commands[1]" } });
    expect((cs[1]!.params as { resultat: unknown }).resultat).toBe(faux);
  });

  it("lot à plusieurs commandes : chaque booléen est recalculé sur le document du serveur juste avant lui (chaîne comprise)", async () => {
    const d = doc();
    const u = await resultatNavigateur(d, "union", ["A", "B"]);
    const apresUnion = applyStudioCommands(d, [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat: u } }, boite("C", 0)]);
    const diff = await resultatNavigateur(apresUnion, "difference", ["E", "C"]);
    const cs: StudioCommand[] = [
      { toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "B"], resultat: u } },
      boite("C", 0),
      { toolId: "studio.solide.booleen", params: { id: "E2", operation: "difference", operandes: ["E", "C"], resultat: diff } },
    ];
    expect(await revaliderBooleensStudio(d, cs, applyStudioCommands)).toBeNull();
    const fin = applyStudioCommands(d, cs);
    // Union 12 m³, moins la boîte C (2 × 2 × 2 à l'origine, entièrement dans l'union) : 4 m³.
    expect(fin.exacts!.map((x) => [x.id, Math.round(x.resultat.volume * 1e9) / 1e9])).toEqual([["E2", 4]]);
  });

  it("opérande refusé par la capture (oblique, absent) : 400 studio-invalid ; intersection vide : 400 exact-echec", async () => {
    const d = doc();
    expect(await revaliderBooleensStudio(d, [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "Z"], resultat: {} } } as unknown as StudioCommand], applyStudioCommands))
      .toMatchObject({ status: 400, body: { code: "studio-invalid", message: "Solide introuvable : Z." } });
    const loin = applyStudioCommands(d, [{ toolId: "studio.solide.deplacer", params: { id: "B", dx: 10, dy: 0, dz: 0 } }]);
    expect(await revaliderBooleensStudio(loin, [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "intersection", operandes: ["A", "B"], resultat: {} } } as unknown as StudioCommand], applyStudioCommands))
      .toMatchObject({ status: 400, body: { code: "exact-echec" } });
  });
});
