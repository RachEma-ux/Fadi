/**
 * AC-010 (lot G2) — « Approuver » est une commande du catalogue de l'éditeur : découverte par recherche (nom,
 * synonyme, raccourci) comme toute commande, avec son icône, sa barre et son raccourci (règle d'or), sans droit
 * présumé côté interface — le serveur seul juge du droit métier (refus contrôlés dans
 * `apps/api/src/routes/studio-g2.preuves-g2.test.ts`).
 */
import { describe, expect, it } from "vitest";
import { CATALOGUE, rechercher } from "../planche2d/catalogue";
import { cibleRaccourci, COMMANDES_EDITEUR, commandesDeBarre } from "../planche2d/raccourcis";
import { domaineExecution } from "../domaines/domaines";
import { messageRefusApprobation, publicationsAApprouver } from "./publication-ui";

describe("AC-010 — « Approuver » dans le catalogue des commandes (lot G2)", () => {
  it("AC-010 [+] un concepteur découvre « Approuver » par recherche (nom, synonyme, raccourci) : commande de la barre Présentation, icône propre, Ctrl+Maj+F7, aucun droit présumé par l'interface", () => {
    expect(rechercher("approuver")[0]).toMatchObject({ identifiant: "approuver", nature: "editeur", barre: "presentation", icone: "studio-approve", raccourcis: ["Ctrl+Shift+F7"] });
    expect(rechercher("approbation").map((e) => e.identifiant)).toContain("approuver");
    expect(rechercher("Ctrl+Maj+F7").map((e) => e.identifiant)).toContain("approuver");
    expect(cibleRaccourci("Ctrl+Shift+F7")).toEqual({ type: "commande", id: "approuver" });
    expect(commandesDeBarre("presentation").map((c) => c.id)).toContain("approuver");
    // Visible et lançable par tout membre (droit « lecture » côté interface) : l'exécution est jugée par le serveur.
    const e = CATALOGUE.find((x) => x.identifiant === "approuver")!;
    expect(e).toMatchObject({ droit: "lecture", contextes: ["planche-2d", "vue-3d", "feuille"] });
    expect(COMMANDES_EDITEUR.find((c) => c.id === "approuver")).toMatchObject({ ecrit: false });
    // Lancée depuis un autre domaine, la boîte s'ouvre par-dessus (aucune bascule de domaine).
    expect(domaineExecution({ type: "commande", id: "approuver" }, "dessin")).toBe("dessin");
  });

  it("AC-010 [−] la boîte propose les publications en revue sans juger du droit ; un refus 403 du serveur est dit tel quel, profil et rôle technique compris", () => {
    const ps = [{ id: "a", workStatus: "brouillon" }, { id: "b", workStatus: "en-revue" }, { id: "c", workStatus: "approuve" }, { id: "d", workStatus: "en-revue" }] as const;
    expect(publicationsAApprouver(ps).map((p) => p.id)).toEqual(["b", "d"]);
    expect(messageRefusApprobation(403, { error: "forbidden" })).toMatch(/^Approbation refusée par le serveur : vous ne détenez pas le droit d’approuver/);
    expect(messageRefusApprobation(403, {})).toContain("ni un profil importé, ni un rôle d’administration technique");
    expect(messageRefusApprobation(409, { error: "revision_mismatch" })).toBe("Approbation refusée : l’ensemble examiné n’est pas celui de la publication.");
  });
});
