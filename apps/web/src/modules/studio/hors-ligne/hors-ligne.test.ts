// Studio hors ligne : sérialisation du brouillon et des enveloppes non confirmées, restauration, report après conflit,
// état du bandeau. Pur : ni IndexedDB, ni réseau.
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, type StudioCommand } from "@parcours/atelier-model";
import type { StudioContext } from "../../../lib/api";
import { enveloppeSuivante, planEnvoi } from "../import/envoi";
import { annulerBrouillon, appliquerBrouillon, avecPlancher, peutAnnuler, commandesEnAttente, creerBrouillon, documentBrouillon, peutRetablir, retablirBrouillon } from "../planche2d/brouillon";
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
    const relu = lireHorsLigne(JSON.stringify(versHorsLigne("u1", contexte("rev-1"), b, plan, 1, null)), "u1");
    expect(relu.plan).toEqual(plan);
    expect(enveloppeSuivante(relu.plan!)).toEqual({ contractVersion: "studio-commands/1", requestId: "req-1", baseRevisionId: "rev-1", commands: [ligne("a", 0)] });
    const r = restaurerBrouillon(relu.base.revision.document, relu.pas, relu.refaire);
    expect(documentBrouillon(r)).toEqual(documentBrouillon(b));
    expect(r.refaire).toEqual(b.refaire);
    expect(peutRetablir(r)).toBe(true);
    expect(documentBrouillon(retablirBrouillon(r))).toEqual(documentBrouillon(retablirBrouillon(b)));
  });

  it("refuse un contenu illisible au lieu de le réinterpréter", () => {
    const bon = versHorsLigne("u1", contexte("rev-1"), creerBrouillon(newStudioDocument("doc-1")), null, 0, null);
    expect(() => lireHorsLigne("{", "u1")).toThrow();
    // Brouillon d’un autre utilisateur de l’appareil : jamais relu.
    expect(() => lireHorsLigne(JSON.stringify(bon), "u2")).toThrow();
    expect(lireHorsLigne(JSON.stringify(bon), "u1").userId).toBe("u1");
    expect(() => lireHorsLigne(JSON.stringify({ ...bon, version: 2 }), "u1")).toThrow();
    expect(() => lireHorsLigne(JSON.stringify({ ...bon, pas: [[{ params: {} }]] }), "u1")).toThrow();
    const unPas = { ...bon, pas: [[ligne("a", 0)]], pasCouverts: 1 };
    expect(() => lireHorsLigne(JSON.stringify({ ...unPas, plan: { lots: [[ligne("a", 0)]], requestIds: [], envoyes: 0, base: "rev-1" } }), "u1")).toThrow();
    expect(() => lireHorsLigne(JSON.stringify({ ...unPas, plan: { lots: [[ligne("a", 0)]], requestIds: ["r"], envoyes: 2, base: "rev-1" } }), "u1")).toThrow();
    // Les enveloppes doivent porter exactement les pas couverts : sinon le rejeu enverrait autre chose.
    expect(() => lireHorsLigne(JSON.stringify({ ...unPas, plan: { lots: [[ligne("b", 0)]], requestIds: ["r"], envoyes: 0, base: "rev-1" } }), "u1")).toThrow();
    expect(lireHorsLigne(JSON.stringify({ ...unPas, plan: { lots: [[ligne("a", 0)]], requestIds: ["r"], envoyes: 0, base: "rev-1" } }), "u1").pasCouverts).toBe(1);
  });

  it("n'a rien à conserver sans commande, enveloppe ni conflit", () => {
    const vide = versHorsLigne("u1", contexte("rev-1"), creerBrouillon(newStudioDocument("doc-1")), null, 0, null);
    expect(horsLigneVide(vide)).toBe(true);
    expect(horsLigneVide({ ...vide, conflit: { headRevisionId: "rev-2", at: "t" } })).toBe(false);
    expect(cleVariante("u1", "p", "s", "v")).toBe("u1|p|s|v");
    expect(cleVariante("u1", "p", "s", "v")).not.toBe(cleVariante("u2", "p", "s", "v"));
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

describe("dessin derrière une enveloppe en attente", () => {
  it("les pas couverts ne s'annulent pas ; les suivants oui ; le plancher survit à la restauration", () => {
    let b = appliquerBrouillon(creerBrouillon(newStudioDocument("doc-1")), [ligne("a", 0)]);
    b = avecPlancher(b, 1);
    expect(peutAnnuler(b)).toBe(false);
    b = appliquerBrouillon(b, [ligne("b", 2)]);
    expect(peutAnnuler(b)).toBe(true);
    b = annulerBrouillon(b);
    expect(peutAnnuler(b)).toBe(false);
    expect(commandesEnAttente(b)).toEqual([ligne("a", 0)]);
    const r = restaurerBrouillon(newStudioDocument("doc-1"), [[ligne("a", 0)], [ligne("b", 2)]], [], 1);
    expect(r.plancher).toBe(1);
    expect(peutAnnuler(annulerBrouillon(r))).toBe(false);
    expect(avecPlancher(r, 0).plancher).toBeUndefined();
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
    expect(etatHorsLigne({ ...base, conflit: true, autreOnglet: true })).toMatchObject({ code: "conflit", detail: "Brouillon modifié dans un autre onglet : rien n’a été écrasé." });
  });
});
