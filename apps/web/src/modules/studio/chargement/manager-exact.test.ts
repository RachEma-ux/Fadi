import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_TOOLS } from "@parcours/atelier-model";
import { MoteurExact } from "@parcours/geometry-exact";
import { GestionnaireRessources } from "./gestionnaire-ressources";

/**
 * TR-EX-032 / EX-032 — « Le Tool Manager construit les barres, réconcilie les préférences et le contexte, résout les
 * loaders, active/désactive les machines d'outil et expédie les événements. Il n'effectue pas lui-même de booléens, de
 * tessellation ou de validation canonique. » Le Manager de Studio (gestionnaire des ressources, lot B.3) active l'outil
 * « Booléen exact » et charge son moteur `noyau-exact` (lot F2) ; des espions sur le noyau exact (booléen, tessellation,
 * STEP, chargement d'OCCT), sur le constructeur de Worker et sur le calcul injecté prouvent qu'il ne calcule ni ne valide
 * aucune géométrie : il appelle seulement le chargeur et le libérateur du moteur.
 */
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("TR-EX-032 — le Manager ne calcule ni ne valide la géométrie (espions)", () => {
  it("activer, désactiver, réactiver 50 fois le Booléen exact puis libérer le moteur : chargeur appelé une fois, aucun booléen, aucune tessellation, aucun Worker créé par le Manager", async () => {
    const executer = vi.spyOn(MoteurExact.prototype, "executer");
    const mailler = vi.spyOn(MoteurExact.prototype, "mailler");
    const step = vi.spyOn(MoteurExact.prototype, "exporterStep");
    const chargerOcct = vi.spyOn(MoteurExact, "charger");
    const Worker = vi.fn();
    vi.stubGlobal("Worker", Worker);
    // Le « noyau » injecté : le Manager ne voit que son chargeur et son libérateur ; son calcul est un espion.
    const calculer = vi.fn();
    const chargerNoyau = vi.fn(async () => ({ calculer }));
    const libererNoyau = vi.fn();
    const g = new GestionnaireRessources({
      dejaCharges: ["coquille-studio", "planche-2d", "rendu-3d"],
      chargeurs: { "noyau-exact": { charger: chargerNoyau, liberer: libererNoyau }, calcul: { liberer: () => {} } },
      maintenant: () => 0,
    });
    const outil = STUDIO_TOOLS.find((t) => t.toolId === "studio.solide.booleen")!;
    for (let i = 0; i < 50; i++) {
      const r = await g.activerOutil(outil.toolId, outil.groupe);
      expect(r.moteurs).toContain("noyau-exact");
      expect(g.lire("noyau-exact")).toMatchObject({ initialise: true, actif: true });
      g.desactiverOutil();
      expect(g.lire("noyau-exact").actif).toBe(false);
    }
    expect(g.liberer("noyau-exact")).toBe(true);
    expect(chargerNoyau).toHaveBeenCalledTimes(1);
    expect(libererNoyau).toHaveBeenCalledTimes(1);
    expect(g.lire("noyau-exact").initialisations).toBe(1);
    for (const espion of [executer, mailler, step, chargerOcct, Worker, calculer]) expect(espion).not.toHaveBeenCalled();
  });

  it("un outil sans noyau exact (Boîte) n'atteint jamais le chargeur du noyau", async () => {
    const chargerNoyau = vi.fn(async () => ({}));
    const g = new GestionnaireRessources({ dejaCharges: ["coquille-studio", "planche-2d", "rendu-3d"], chargeurs: { "noyau-exact": { charger: chargerNoyau } }, maintenant: () => 0 });
    // X.1-05 : l'épaississement d'une surface libre est l'autre outil du noyau exact.
    for (const t of STUDIO_TOOLS.filter((x) => x.toolId !== "studio.solide.booleen" && x.toolId !== "studio.surface.epaissir" && x.toolId !== "studio.subdivision.solidifier")) await g.activerOutil(t.toolId, t.groupe);
    expect(chargerNoyau).not.toHaveBeenCalled();
    expect(g.lire("noyau-exact").phase).toBe("non-charge");
  });

  it("le Manager n'importe ni le modèle, ni le noyau exact, ni un Worker : son seul import est la table des moteurs", () => {
    const source = readFileSync(new URL("./gestionnaire-ressources.ts", import.meta.url), "utf8");
    const imports = [...source.matchAll(/^import[^"']*["']([^"']+)["']/gm)].map((m) => m[1]);
    expect(imports).toEqual(["./moteurs"]);
    expect(source).not.toMatch(/new Worker|applyStudioCommands|validateStudioDocument|studioMesh3d|executer\(|tessell/);
  });

  it("témoin : le modèle, lui, valide (refus d'un booléen mal formé) — la validation canonique reste au modèle et au serveur", () => {
    const d = applyStudioCommands(newStudioDocument("t"), [{ toolId: "studio.solide.boite", params: { id: "A", type: "box", placement: { origin: { x: 0, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } }]);
    expect(() => applyStudioCommands(d, [{ toolId: "studio.solide.booleen", params: { id: "E", operation: "union", operandes: ["A", "A"], resultat: {} as never } }])).toThrow(/deux opérandes distincts/);
  });
});
