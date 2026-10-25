/**
 * EX-002 (périmètre), cas négatif : la comptabilité, la gestion RH, le commerce, la direction des travaux, les
 * réserves de chantier et l'exploitation restent hors du Studio — aucun domaine, aucune fonction, aucun outil ni
 * aucune commande du Studio ne les porte, et une adresse de domaine qui les viserait n'est pas reconnue. Pur.
 */
import { describe, expect, it } from "vitest";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { COMMANDES_EDITEUR } from "../planche2d/raccourcis";
import { DOMAINES_STUDIO, estDomaineStudio, FONCTIONS_STUDIO } from "./domaines";

const HORS_PERIMETRE = /compta|comptab|factur|paie|salari|ressources-humaines|\brh\b|commerce|vente|devis|chantier|reserve|travaux|exploitation|maintenance/i;

describe("EX-002 — périmètre : aucun module métier concurrent dans le Studio", () => {
  it("EX-002 [−] une demande de comptabilité, RH, commerce, chantier ou exploitation ne trouve aucun domaine Studio", () => {
    expect(DOMAINES_STUDIO.map((d) => d.id)).toEqual(["dessin", "bim", "visualisation", "documentation"]);
    for (const x of ["comptabilite", "rh", "ressources-humaines", "commerce", "chantier", "reserves", "exploitation"]) expect(estDomaineStudio(x), x).toBe(false);
  });
  it("EX-002 [−] aucune fonction, aucun outil, aucune commande de l'éditeur ne relève de ces responsabilités", () => {
    expect(Object.keys(FONCTIONS_STUDIO).filter((f) => HORS_PERIMETRE.test(f))).toEqual([]);
    expect(STUDIO_TOOLS.length).toBeGreaterThan(20);
    expect(STUDIO_TOOLS.filter((t) => HORS_PERIMETRE.test(`${t.toolId} ${t.libelleFR} ${t.groupe}`)).map((t) => t.toolId)).toEqual([]);
    expect(COMMANDES_EDITEUR.filter((c) => HORS_PERIMETRE.test(c.id)).map((c) => c.id)).toEqual([]);
  });
});
