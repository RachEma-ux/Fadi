// EX-049 — reprise de session : opérations confirmées, en attente, rejetées, conflictuelles et prévisualisations
// abandonnées distinguées ; identité de déduplication et version de contrat compatibles avec la file. Pur.
import { describe, expect, it } from "vitest";
import { newStudioDocument, STUDIO_CONTRACT, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { accuserLot, planEnvoi } from "../import/envoi";
import { appliquerBrouillon, commandesEnAttente, creerBrouillon } from "../planche2d/brouillon";
import { etatHorsLigne } from "./etat";
import { classerReprise, horsLigneVide, lireHorsLigne, versHorsLigne, type RejetHorsLigne } from "./persistance";

const ligne = (id: string, x: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 0 } } });
const contexte = (revisionId: string): StudioContext => ({
  study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: revisionId },
  revision: { id: revisionId, parentRevisionId: null, document: newStudioDocument("doc-1") }, canWrite: true,
});
const base = { enLigne: true, enAttente: 0, conflit: false, conserve: true, depuisCache: false };

describe("EX-049 — reprise de session", () => {
  it("EX-049 [+] : réouverture après coupure — confirmée, en attente, rejetée, conflit et prévisualisation abandonnée distinguées", () => {
    let b = creerBrouillon(newStudioDocument("doc-1"));
    b = appliquerBrouillon(b, Array.from({ length: 501 }, (_, i) => ligne(`l${i}`, i * 2)));
    const ids = ["req-1", "req-2"];
    const plan = accuserLot(planEnvoi(commandesEnAttente(b), "rev-1", () => ids.shift()!), "rev-2");
    const rejet: RejetHorsLigne = { requestIds: ["req-0"], baseRevisionId: "rev-0", lots: [[ligne("x", 0)]], statut: 400, code: "invalid_commands", at: "2026-10-25T10:00:00Z" };
    const serialise = JSON.stringify(versHorsLigne("u1", contexte("rev-1"), b, plan, 1, null, { rejet, apercu: { outil: "studio.dessin.polyligne", depuis: "2026-10-25T10:01:00Z" } }));
    const relu = lireHorsLigne(serialise, "u1");
    expect(relu.contrat).toBe(STUDIO_CONTRACT);
    expect(classerReprise(relu).map((o) => [o.etat, o.requestId])).toEqual([
      ["confirmee", "req-1"], ["en-attente", "req-2"], ["rejetee", "req-0"], ["previsualisation-abandonnee", null],
    ]);
    // Avec un conflit conservé, les lots non accusés sont conflictuels (jamais renvoyés en silence).
    expect(classerReprise({ ...relu, conflit: { headRevisionId: "rev-9", at: "t" } }).filter((o) => o.etat === "conflictuelle").map((o) => o.requestId)).toEqual(["req-2"]);
    // Bandeau : états explicites « Rejetée » et « Prévisualisation abandonnée ».
    expect(etatHorsLigne({ ...base, rejetee: true })).toMatchObject({ code: "rejetee", texte: "Rejetée" });
    expect(etatHorsLigne({ ...base, apercuAbandonne: true })).toMatchObject({ code: "previsualisation-abandonnee", texte: "Prévisualisation abandonnée" });
    expect(etatHorsLigne({ ...base, conflit: true, rejetee: true }).code).toBe("conflit");
  });

  it("EX-049 [−] : file d'un contrat incompatible jamais rejouée ; une enveloppe rejetée ne disparaît pas sans état explicite", () => {
    const vide = versHorsLigne("u1", contexte("rev-1"), creerBrouillon(newStudioDocument("doc-1")), null, 0, null);
    expect(() => lireHorsLigne(JSON.stringify({ ...vide, contrat: "studio-commands/2" }), "u1")).toThrow(/contrat/);
    // Une file écrite avant EX-049 (sans contrat ni rejet) reste lisible.
    const { contrat: _c, rejet: _r, apercu: _a, ...ancien } = vide;
    expect(lireHorsLigne(JSON.stringify(ancien), "u1").rejet).toBeNull();
    const rejet: RejetHorsLigne = { requestIds: ["req-0"], baseRevisionId: "rev-0", lots: [[ligne("x", 0)]], statut: 403, code: "forbidden", at: "t" };
    const seulRejet = versHorsLigne("u1", contexte("rev-1"), creerBrouillon(newStudioDocument("doc-1")), null, 0, null, { rejet });
    // Un brouillon qui ne garde qu'un rejet n'est pas « vide » : il reste conservé avec son état.
    expect(horsLigneVide(seulRejet)).toBe(false);
    expect(() => lireHorsLigne(JSON.stringify({ ...seulRejet, rejet: { ...rejet, requestIds: [] } }), "u1")).toThrow(/rejet/);
  });
});
