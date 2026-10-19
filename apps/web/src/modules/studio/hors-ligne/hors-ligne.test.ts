// Studio hors ligne : sérialisation du brouillon et des enveloppes non confirmées, restauration, report après conflit,
// état du bandeau. Pur : ni IndexedDB, ni réseau.
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { enveloppeSuivante, planEnvoi } from "../import/envoi";
import { annulerBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, peutRetablir, retablirBrouillon } from "../planche2d/brouillon";
import { etatHorsLigne } from "./etat";
import { cleVariante, horsLigneVide, lireHorsLigne, reporterSurTete, restaurerBrouillon, versHorsLigne } from "./persistance";

const ligne = (id: string, x: number): StudioCommand => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x, y: 0 }, end: { x: x + 1, y: 0 } } });
const supprimer = (id: string): StudioCommand => ({ toolId: "studio.dessin.supprimer", params: { ids: [id] } });
const contexte = (revisionId: string, document = newStudioDocument("doc-1")): StudioContext => ({
  study: { id: "s", name: "Étude", projectId: "p" }, variant: { id: "v", name: "Variante", studyId: "s", headRevisionId: revisionId },
  revision: { id: revisionId, parentRevisionId: null, document }, canWrite: true,
});

describe("brouillon hors ligne", () => {
  it("conserve pas, pas annulés et enveloppes (mêmes requestId, même base) à travers la sérialisation", () => {
    let b = creerBrouillon(newStudioDocument("doc-1"));
    b = appliquerBrouillon(b, [ligne("a", 0)]);
    b = appliquerBrouillon(b, [ligne("b", 2)]);
    b = appliquerBrouillon(b, [ligne("c", 4)]);
    b = annulerBrouillon(annulerBrouillon(b));
    const ids = ["req-1"];
    const plan = planEnvoi(commandesEnAttente(b), "rev-1", () => ids.shift()!);
    const relu = lireHorsLigne(JSON.stringify(versHorsLigne(contexte("rev-1"), b, plan, null)));
    expect(relu.plan).toEqual(plan);
    expect(enveloppeSuivante(relu.plan!)).toEqual({ contractVersion: "studio-commands/1", requestId: "req-1", baseRevisionId: "rev-1", commands: [ligne("a", 0)] });
    const r = restaurerBrouillon(relu.base.revision.document, relu.pas, relu.refaire);
    expect(documentBrouillon(r)).toEqual(documentBrouillon(b));
    expect(r.refaire).toEqual(b.refaire);
    expect(peutRetablir(r)).toBe(true);
    expect(documentBrouillon(retablirBrouillon(r))).toEqual(documentBrouillon(retablirBrouillon(b)));
  });

  it("refuse un contenu illisible au lieu de le réinterpréter", () => {
    const bon = versHorsLigne(contexte("rev-1"), creerBrouillon(newStudioDocument("doc-1")), null, null);
    expect(() => lireHorsLigne("{")).toThrow();
    expect(() => lireHorsLigne(JSON.stringify({ ...bon, version: 2 }))).toThrow();
    expect(() => lireHorsLigne(JSON.stringify({ ...bon, pas: [[{ params: {} }]] }))).toThrow();
    expect(() => lireHorsLigne(JSON.stringify({ ...bon, plan: { lots: [[ligne("a", 0)]], requestIds: [], envoyes: 0, base: "rev-1" } }))).toThrow();
    expect(() => lireHorsLigne(JSON.stringify({ ...bon, plan: { lots: [[ligne("a", 0)]], requestIds: ["r"], envoyes: 2, base: "rev-1" } }))).toThrow();
  });

  it("n'a rien à conserver sans commande, enveloppe ni conflit", () => {
    const vide = versHorsLigne(contexte("rev-1"), creerBrouillon(newStudioDocument("doc-1")), null, null);
    expect(horsLigneVide(vide)).toBe(true);
    expect(horsLigneVide({ ...vide, conflit: { headRevisionId: "rev-2", at: "t" } })).toBe(false);
    expect(cleVariante("p", "s", "v")).toBe("p|s|v");
  });

  it("reporte les commandes sur la nouvelle tête seulement si le modèle les applique", () => {
    const tete = applyStudioCommands(newStudioDocument("doc-1"), [ligne("autre", 10)]);
    const ok = reporterSurTete(tete, [[ligne("a", 0)]]);
    expect(ok.ok && documentBrouillon(ok.brouillon).objects.map(o => o.id).sort()).toEqual(["a", "autre"]);
    expect(ok.ok && commandesEnAttente(ok.brouillon)).toEqual([ligne("a", 0)]);
    // L'objet supprimé hors ligne n'existe pas sur la nouvelle tête : rien n'est reporté, résolution manuelle.
    expect(reporterSurTete(newStudioDocument("doc-1"), [[supprimer("x")]]).ok).toBe(false);
  });
});

describe("état de connexion", () => {
  const base = { enLigne: true, enAttente: 0, conflit: false, conserve: false, depuisCache: false };
  it("en ligne, hors ligne, en attente, conflit — le conflit prime", () => {
    expect(etatHorsLigne(base)).toMatchObject({ code: "en-ligne", texte: "En ligne", detail: null });
    expect(etatHorsLigne({ ...base, enLigne: false, depuisCache: true })).toMatchObject({ code: "hors-ligne", texte: "Hors ligne" });
    expect(etatHorsLigne({ ...base, enLigne: false, enAttente: 2 })).toMatchObject({ code: "en-attente", texte: "2 en attente" });
    expect(etatHorsLigne({ ...base, enAttente: 1, conflit: true })).toMatchObject({ code: "conflit", texte: "Conflit" });
    expect(etatHorsLigne({ ...base, conserve: true }).detail).toContain("conservé");
  });
});
