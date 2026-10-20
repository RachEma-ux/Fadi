/**
 * Enregistrer la Console dans un projet : une étude neuve, les commandes envoyées par lots dans l'ordre, et une reprise
 * qui ne recrée ni l'étude ni les lots déjà confirmés.
 */
import { describe, expect, it } from "vitest";
import type { StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { transfererVersProjet, type ClientTransfert, type EtatTransfert } from "./transfert";
import { contexteConsole } from "./contexte-console";

const commande = (i: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id: `o${i}`, start: { x: 0, y: i }, end: { x: 1, y: i } } }) as StudioCommand;
const ctx = (revisionId: string): StudioContext => ({ ...contexteConsole(), study: { id: "E1", name: "n", projectId: "P1" }, variant: { id: "V1", name: "v", studyId: "E1", headRevisionId: revisionId }, revision: { id: revisionId, parentRevisionId: null, document: contexteConsole().revision.document } });

function faux(echecLot: number | null = null) {
  const appels = { creations: [] as { p: string; nom: string; requestId?: string }[], lots: [] as { base: string; n: number; requestId: string }[] };
  let echecDispo = echecLot;
  const client: ClientTransfert = {
    createStudioStudy: async (p, nom, requestId) => { appels.creations.push({ p, nom, requestId }); return ctx("r0"); },
    studioCommands: async (_p, _s, _v, e) => {
      if (echecDispo !== null && appels.lots.length === echecDispo) { echecDispo = null; throw new Error("réseau"); }
      appels.lots.push({ base: e.baseRevisionId, n: e.commands.length, requestId: e.requestId });
      return ctx(`r${appels.lots.length}`);
    },
  };
  return { client, appels };
}

describe("transfert de la Console vers un projet", () => {
  it("crée l'étude une fois, puis envoie les commandes par lots de 500, chaque lot sur la révision du précédent", async () => {
    const { client, appels } = faux();
    const etat: { current: EtatTransfert | null } = { current: null };
    const cible = await transfererVersProjet({ client, projectId: "P1", nom: "Étude", commandes: Array.from({ length: 1200 }, (_, i) => commande(i)), requestId: "q1", etat });
    expect(cible).toEqual({ projectId: "P1", studyId: "E1", variantId: "V1" });
    expect(appels.creations).toEqual([{ p: "P1", nom: "Étude", requestId: "q1" }]);
    expect(appels.lots.map((l) => [l.base, l.n])).toEqual([["r0", 500], ["r1", 500], ["r2", 200]]);
  });

  it("un échec en cours d'envoi garde l'étude et les lots confirmés ; la reprise rejoue les mêmes identifiants sans recréer l'étude", async () => {
    const { client, appels } = faux(1);
    const etat: { current: EtatTransfert | null } = { current: null };
    const o = { client, projectId: "P1", nom: "Étude", commandes: Array.from({ length: 1200 }, (_, i) => commande(i)), requestId: "q1", etat };
    await expect(transfererVersProjet(o)).rejects.toThrow("réseau");
    expect(appels.creations).toHaveLength(1);
    expect(appels.lots).toHaveLength(1);
    const ids = etat.current!.plan.requestIds;
    await transfererVersProjet(o);
    expect(appels.creations).toHaveLength(1);
    expect(appels.lots.map((l) => l.n)).toEqual([500, 500, 200]);
    expect(appels.lots.map((l) => l.requestId)).toEqual([...ids]);
  });

  it("un échec à la création ne laisse aucun état : le rejeu repart de la création, même requestId", async () => {
    const etat: { current: EtatTransfert | null } = { current: null };
    const client: ClientTransfert = { createStudioStudy: async () => { throw new Error("réseau"); }, studioCommands: async () => ctx("r1") };
    await expect(transfererVersProjet({ client, projectId: "P1", nom: "É", commandes: [commande(0)], requestId: "q1", etat })).rejects.toThrow();
    expect(etat.current).toBeNull();
  });
});
