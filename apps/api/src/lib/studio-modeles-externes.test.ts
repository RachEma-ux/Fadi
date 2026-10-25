import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { newStudioDocument } from "@parcours/atelier-model";
import { decideComparaison, deciderPassage, deciderReception, empreinteRequete, rejeuAdmis, sha256, studioModelePassageSchema, studioModeleReceptionSchema, type StudioModeleReception } from "./studio-modeles-externes.js";

const RECETTE = readFileSync(new URL("../../../../packages/atelier-model/src/studio/import-ifc/fixtures/recette-ifc2x3.ifc", import.meta.url), "utf8");
const initSql = readFileSync(new URL("../db/init.sql", import.meta.url), "utf8");
const entree = (x: Partial<StudioModeleReception> = {}): StudioModeleReception => studioModeleReceptionSchema.parse({
  reference: "Architecte — bâtiment A", auteur: "Cabinet partenaire", discipline: "architecture", format: "ifc", version: "B",
  uniteDeclaree: "mm", transformation: null, nomFichier: "recette.ifc", contenu: RECETTE, ...x,
});
const tete = { revisionId: "rev-1", document: newStudioDocument("v") };

describe("Modèles externes (TR-EX-066) — réception relue par le serveur", () => {
  it("réception : fichier relu et comparé à la tête ; SHA-256 du fichier reçu ; la variante n'est pas touchée", () => {
    const avant = JSON.stringify(tete.document);
    const r = deciderReception(entree(), tete);
    if (!("ok" in r)) throw new Error(JSON.stringify(r.refus));
    expect(r.ok.contentSha256).toBe(sha256(RECETTE));
    expect(r.ok.rapport.entites.murs).toBe(2);
    expect(r.ok.comparaison).toMatchObject({ revisionId: "rev-1", identiques: false, ecarts: ["transformation-non-declaree", "elements-non-natifs"] });
    expect(JSON.stringify(tete.document)).toBe(avant);
    expect(decideComparaison(RECETTE, r.ok.meta, tete)).toEqual(r.ok.comparaison);
  });

  it("refus : fichier illisible (422), métadonnée vide (400), champ inconnu, format autre qu'IFC", () => {
    expect(deciderReception(entree({ contenu: "pas un IFC" }), tete)).toMatchObject({ refus: { status: 422, body: { error: "fichier_illisible" } } });
    expect(deciderReception(entree({ auteur: "  " }), tete)).toMatchObject({ refus: { status: 400 } });
    expect(studioModeleReceptionSchema.safeParse({ ...entree(), statut: "accepte" }).success).toBe(false);
    expect(studioModeleReceptionSchema.safeParse({ ...entree(), format: "dwg" }).success).toBe(false);
    expect(studioModelePassageSchema.safeParse({ motif: "x", acceptePar: "u" }).success).toBe(false);
  });

  it("passages : acceptation réservée au rôle habilité (403), refus motivé (400), comparaison périmée (409), décision définitive (409)", () => {
    const etat = { statut: "compare" as const, revisionComparee: "rev-1", uniteLue: true };
    expect(deciderPassage(etat, "accepter", { habilite: true, revisionCourante: "rev-1" })).toEqual({ ok: "accepte" });
    expect(deciderPassage(etat, "accepter", { habilite: false, revisionCourante: "rev-1" })).toMatchObject({ refus: { status: 403, body: { error: "role_insuffisant" } } });
    expect(deciderPassage(etat, "refuser", { habilite: true, revisionCourante: "rev-1" })).toMatchObject({ refus: { status: 400, body: { error: "motif_obligatoire" } } });
    expect(deciderPassage(etat, "accepter", { habilite: true, revisionCourante: "rev-2" })).toMatchObject({ refus: { status: 409, body: { error: "comparaison_perimee" } } });
    expect(deciderPassage({ ...etat, statut: "refuse" }, "comparer", { habilite: true, revisionCourante: "rev-1" })).toMatchObject({ refus: { status: 409, body: { error: "deja_decide" } } });
  });

  it("rejeu de la réception par requestId : même auteur et même contenu seulement", () => {
    const h = empreinteRequete({ a: 1 });
    expect(rejeuAdmis({ authorId: "u", payloadHash: h }, "u", h)).toBeNull();
    expect(rejeuAdmis({ authorId: "u", payloadHash: h }, "v", h)?.status).toBe(409);
    expect(rejeuAdmis({ authorId: "u", payloadHash: h }, "u", empreinteRequete({ a: 2 }))?.status).toBe(409);
  });

  it("init.sql : tables additives, statuts et actions alignés sur le modèle, journal en ajout seul", () => {
    expect(initSql).toContain("CREATE TABLE IF NOT EXISTS studio_external_models (");
    expect(initSql).toContain("CHECK (status IN ('compare', 'accepte', 'refuse'))");
    expect(initSql).toContain("CHECK (action IN ('recevoir', 'comparer', 'accepter', 'refuser'))");
    expect(initSql).toContain("CREATE OR REPLACE TRIGGER studio_external_model_events_no_update BEFORE UPDATE ON studio_external_model_events");
  });
});
