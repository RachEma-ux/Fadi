import { describe, expect, it, vi } from "vitest";
/**
 * X.2-03 — les validations centrales tournent à l'exécution, même quand types et registre sont contrôlés à la construction.
 * Une commande « bien typée » (forcée par `as`, comme le ferait un client compilé contre un autre registre) mais dont
 * l'outil est inconnu ou les paramètres sortent du schéma du registre est refusée par le point d'entrée Studio
 * (`submitStudioCommands`), sans aucune écriture. Transport simulé : aucune base, aucun serveur (garde DB fermée).
 */
const espion = vi.hoisted(() => ({ transaction: 0, insertions: 0, misesAJour: 0 }));
const etat = vi.hoisted(() => ({ document: null as unknown }));

vi.mock("../db/client.js", async () => {
  const schema = await import("../db/schema.js");
  // Lignes servies par table : l'étude, la variante, la révision de tête ; aucune révision rejouée.
  const lignes = (table: unknown, verrou: boolean, requeteRejeu: boolean): unknown[] => {
    if (table === schema.projectMembers) return [{ userId: "u" }];
    // Verrou des participations du compte (Issue #262, phase 2, `access-locks.ts`) : aucune ligne dans ce banc.
    if (table === schema.projectParticipations) return [];
    if (table === schema.studioStudies) return [{ id: "s", name: "Étude", projectId: "p", archivedAt: null }];
    if (table === schema.studioVariants) return verrou ? [{ id: "v" }] : [{ id: "v", name: "Variante", headRevisionId: "r0", archivedAt: null, derivedFromVariantId: null, derivedFromRevisionId: null }];
    if (table === schema.studioRevisions) return requeteRejeu ? [] : [{ id: "r0", parentRevisionId: null, document: etat.document }];
    // Bascule Atelier → Studio (MIG-COEX-06) : aucune dans ce banc.
    if (table === schema.studioBascules) return [];
    throw new Error("table inattendue");
  };
  const tx = {
    lectures: 0,
    select() {
      return {
        from: (table: unknown) => ({
          where: () => {
            // Ordre de submitStudioCommands : prepare lit la révision de tête, puis replay cherche le requestId.
            const rejeu = table === schema.studioRevisions && tx.lectures++ > 0;
            const resultat = lignes(table, false, rejeu);
            return { limit: async () => resultat, for: async () => lignes(table, true, false) };
          },
        }),
      };
    },
    // Une révision par lot ; l'événement du journal (IF-011) l'accompagne dans la même transaction, compté à part.
    insert(table: unknown) { if (table !== schema.studioRevisionEvents) espion.insertions++; return { values: async () => undefined }; },
    update() { espion.misesAJour++; return { set: () => ({ where: async () => undefined }) }; },
  };
  return { db: { transaction: async (fn: (t: unknown) => unknown) => { espion.transaction++; tx.lectures = 0; return fn(tx); } } };
});
vi.mock("../lib/owned-project.js", () => ({ loadProjectAccess: vi.fn(async () => ({ role: "owner" })), projectAccessRefusal: vi.fn(() => null) }));
vi.mock("../lib/step-rows.js", () => ({ lockProject: vi.fn(async () => undefined) }));
vi.mock("../lib/atelier-exact.js", () => ({ TYPE_CREER_EXACT: "solideExact.creer", revaliderSolidesExacts: vi.fn() }));
vi.mock("../lib/atelier-events.js", () => ({ EVENEMENT_COMMANDE_VALIDEE: "atelier.commande.validee", enregistrerEvenement: vi.fn() }));
vi.mock("../lib/atelier-modele.js", () => ({ chargerModele: vi.fn(), creerModeleVide: vi.fn(), persisterDifferentiel: vi.fn() }));
vi.mock("../lib/atelier-refexterne.js", () => ({ controlerRattachements: vi.fn() }));

import {
  applyStudioCommands, newStudioDocument, STUDIO_COMMAND_TOOL_IDS, STUDIO_CONTRACT, STUDIO_LIMITS, STUDIO_TOOLS, StudioValidationError,
  type StudioCommandToolId, type StudioEnvelope,
} from "@parcours/atelier-model";
import { parseStudioEnvelope, StudioRequestError, submitStudioCommands } from "../lib/studio-commands.js";

const scope = { projectId: "p", studyId: "s", variantId: "v" };
const enveloppe = (commands: StudioEnvelope["commands"]): StudioEnvelope =>
  ({ contractVersion: STUDIO_CONTRACT, requestId: "req-1", baseRevisionId: "r0", commands });
type Commande = StudioEnvelope["commands"][number];
/** Commande forcée au type de l'enveloppe, comme le produirait un client compilé contre un autre registre. */
const forcer = (toolId: string, params: unknown) => ({ toolId, params }) as unknown as Commande;
const calque = (params: Record<string, unknown>) => enveloppe([forcer("studio.calque.creer", params)]);
const valide = { id: "c1", name: "Calque", visible: true, locked: false };

async function refus(input: unknown) {
  const avant = { ...espion };
  const erreur = await submitStudioCommands(scope, "u", input).then(() => null, (e: unknown) => e);
  expect(erreur).toBeInstanceOf(StudioRequestError);
  expect({ insertions: espion.insertions - avant.insertions, misesAJour: espion.misesAJour - avant.misesAJour }).toEqual({ insertions: 0, misesAJour: 0 });
  return { erreur: erreur as StudioRequestError, transactionOuverte: espion.transaction > avant.transaction };
}

describe("X.2-03 — validation centrale à l'exécution du point d'entrée Studio (transport simulé)", () => {
  etat.document = newStudioDocument("doc");

  it("témoin : une commande conforme au registre est appliquée et écrite une fois", async () => {
    const avant = espion.insertions;
    const r = await submitStudioCommands(scope, "u", calque(valide));
    expect(r.replayed).toBe(false);
    expect(r.revision.document.layers).toEqual([valide]);
    expect(espion.insertions - avant).toBe(1);
  });

  it("refuse un toolId absent du registre, même typé par forçage, avant toute transaction", async () => {
    const forge = "studio.inconnu" as StudioCommandToolId;
    expect((STUDIO_COMMAND_TOOL_IDS as readonly string[]).includes(forge)).toBe(false);
    const { erreur, transactionOuverte } = await refus(enveloppe([forcer(forge, {})]));
    expect(erreur.status).toBe(400);
    expect(erreur.body).toMatchObject({ error: "invalid_input" });
    expect(transactionOuverte).toBe(false);
    // Un outil de lecture du registre n'est pas une commande persistée : refusé de même.
    const lecture = STUDIO_TOOLS.find((t) => t.nature === "lecture");
    if (lecture) expect((await refus(enveloppe([forcer(lecture.toolId, {})]))).erreur.status).toBe(400);
  });

  it("deuxième ligne de défense : le noyau refuse lui aussi un toolId inconnu, sans passer par l'API", () => {
    expect(() => applyStudioCommands(newStudioDocument("doc"), [forcer("studio.inconnu", {})])).toThrow(StudioValidationError);
  });

  it("refuse une valeur hors des bornes du schéma du registre (nom de calque trop long) : 400 invalid_commands, rien d'écrit", async () => {
    const outil = STUDIO_TOOLS.find((t) => t.toolId === "studio.calque.creer")!;
    const borne = (outil.inputSchema as { properties: { name: { maxLength: number } } }).properties.name.maxLength;
    expect(borne).toBe(STUDIO_LIMITS.layerName);
    // L'enveloppe passe le contrôle de forme : la borne n'est pas dans le schéma d'enveloppe, elle est au noyau.
    expect(() => parseStudioEnvelope(calque({ ...valide, name: "x".repeat(borne + 1) }))).not.toThrow();
    const { erreur, transactionOuverte } = await refus(calque({ ...valide, name: "x".repeat(borne + 1) }));
    expect(transactionOuverte).toBe(true);
    expect(erreur.status).toBe(400);
    expect(erreur.body).toMatchObject({ error: "invalid_commands" });
    expect(String(erreur.body["path"])).toContain("commands[0]");
  });

  it.each([
    ["type erroné (visible en texte)", { ...valide, visible: "oui" }],
    ["champ requis absent (locked)", { id: "c1", name: "Calque", visible: true }],
    ["propriété hors schéma (additionalProperties: false)", { ...valide, couleur: "rouge" }],
    ["nom vide (minLength: 1)", { ...valide, name: "" }],
    ["identifiant sans caractère visible (pattern \\S)", { ...valide, id: "   " }],
    ["identifiant contenant NUL (pattern sans \\u0000)", { ...valide, id: "c\u00001" }],
  ])("refuse à l'exécution des paramètres typés qui violent le schéma du registre : %s", async (_cas, params) => {
    const { erreur } = await refus(calque(params));
    expect(erreur.status).toBe(400);
    expect(erreur.body).toMatchObject({ error: "invalid_commands" });
  });

  it("refuse une enveloppe d'un autre contrat ou des paramètres qui ne sont pas un objet, avant toute transaction", async () => {
    for (const input of [
      { ...calque(valide), contractVersion: "studio-commands/0" },
      enveloppe([forcer("studio.calque.creer", [])]),
      { ...calque(valide), extra: true },
    ]) {
      const { erreur, transactionOuverte } = await refus(input);
      expect(erreur.body).toMatchObject({ error: "invalid_input" });
      expect(transactionOuverte).toBe(false);
    }
  });
});
