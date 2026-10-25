/**
 * Chantier Axes, lot AX-5 (phase D) : repères liés et leur santé (AX13), coordonnées des exports (AX16).
 */
import { describe, expect, it } from "vitest";
import { lireModelePlanche } from "./delta.js";
import { disponibiliteCoordonnees, modeleAExporter, modeleDansRepere } from "./echanges-coordonnees.js";
import { exporterObj } from "./echanges.js";
import { importerMaillages, lireObj } from "./echanges-import.js";
import { type Modele, ajouterRectangle, deplacer, effacerEntites, modeleVide, redimensionner } from "./geometrie-libre.js";
import { detacherRepereLie, enregistrerRepereLie, mettreAJourDepuisSource, santeRepere } from "./reperes-lies.js";
import { REPERE_DU_MODELE, pivoterRepere } from "./reperes.js";
import { v3 } from "./vecteur.js";

const ok = <T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};
const sol = (): { m: Modele; face: string } => {
  const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(4, 0, 0), v3(0, 2, 0)).modele;
  return { m, face: Object.keys(m.racine.faces)[0]! };
};

describe("AX13 — repère lié à une face : santé explicite, aucune réparation devinée", () => {
  it("lié et sain ; face déplacée → périmé, base gardée ; mise à jour explicite → sain, révision suivante", () => {
    const { m, face } = sol();
    const e = ok(enregistrerRepereLie(m, "Dalle", face));
    const r1 = e.modele.annotations!.reperes![e.id]!;
    expect(r1.source.mode).toBe("lie");
    expect(santeRepere(e.modele, r1)).toBe("sain");
    expect(r1.origine).toEqual(v3(2, 1, 0));
    const deplace = deplacer(e.modele, [face], v3(0, 0, 3)).modele;
    expect(santeRepere(deplace, deplace.annotations!.reperes![e.id]!)).toBe("perime");
    expect(deplace.annotations!.reperes![e.id]!.origine).toEqual(v3(2, 1, 0));
    const maj = ok(mettreAJourDepuisSource(deplace, e.id));
    const r2 = maj.modele.annotations!.reperes![e.id]!;
    expect(r2.revision).toBe(2);
    expect(r2.origine.z).toBeCloseTo(3, 12);
    expect(santeRepere(maj.modele, r2)).toBe("sain");
  });

  it("face supprimée → manquant ; la mise à jour est refusée (aucune autre face substituée) ; détacher → instantané", () => {
    const { m, face } = sol();
    const e = ok(enregistrerRepereLie(m, "Dalle", face));
    const avecAutre = ajouterRectangle(e.modele, v3(10, 0, 0), v3(4, 0, 0), v3(0, 2, 0)).modele;
    const sans = effacerEntites(avecAutre, [face]).modele;
    const r = sans.annotations!.reperes![e.id]!;
    expect(santeRepere(sans, r)).toBe("manquant");
    expect(mettreAJourDepuisSource(sans, e.id)).toMatchObject({ ok: false, erreur: expect.stringMatching(/aucune autre face/) });
    const d = ok(detacherRepereLie(sans, e.id));
    expect(santeRepere(d.modele, d.modele.annotations!.reperes![e.id]!)).toBe("instantane");
  });

  it("refus : face d'un groupe ou identifiant inconnu ; le lien survit à la relecture du document et à la mise à l'échelle", () => {
    const { m, face } = sol();
    expect(enregistrerRepereLie(m, "X", "f999")).toMatchObject({ ok: false });
    const e = ok(enregistrerRepereLie(m, "Dalle", face));
    const relu = lireModelePlanche(JSON.parse(JSON.stringify(e.modele)))!;
    expect(santeRepere(relu, relu.annotations!.reperes![e.id]!)).toBe("sain");
    const x2 = redimensionner(e.modele, 2).modele;
    expect(santeRepere(x2, x2.annotations!.reperes![e.id]!)).toBe("sain");
  });
});

describe("AX16 — coordonnées des exports", () => {
  it("modèle (défaut) ; repère de travail : coordonnées locales, document intact ; aller-retour local → monde", () => {
    const { m } = sol();
    const r = ok(pivoterRepere({ ...REPERE_DU_MODELE, origine: v3(1, 1, 0) }, "z", "local", Math.PI / 2)).repere;
    const mod = ok(modeleAExporter(m, "modele", "obj", r));
    expect(mod.modele).toBe(m);
    const loc = ok(modeleAExporter(m, "travail", "obj", r));
    expect(loc.repere).toBe(r);
    // Le coin (0 ; 0 ; 0) du monde, vu du repère (origine (1 ; 1), X = +Y monde) : (−1 ; 1 ; 0).
    const pts = Object.values(loc.modele.racine.sommets).map((s) => s.position);
    expect(pts.some((p) => Math.abs(p.x + 1) < 1e-12 && Math.abs(p.y - 1) < 1e-12)).toBe(true);
    expect(Object.values(m.racine.sommets).map((s) => s.position)).toContainEqual(v3(0, 0, 0));
    // Aller-retour : le repère du modèle exprimé dans lui-même est l'identité.
    expect(modeleDansRepere(m, REPERE_DU_MODELE).racine.sommets).toEqual(m.racine.sommets);
  });

  it("coordonnées d'origine : seulement avec une correspondance consignée, unique, hors IFC ; l'unité source est rétablie", () => {
    const { m } = sol();
    expect(disponibiliteCoordonnees(m, "source", "obj")).toMatch(/Aucune correspondance/);
    const obj = "v 0 0 0\nv 100 0 0\nv 100 50 0\nf 1 2 3\n";
    const imp = importerMaillages(modeleVide(), lireObj(obj), 0.01, "piece", { format: "obj", fichier: "piece.obj" });
    const corr = Object.values(imp.modele.annotations!.correspondances!);
    expect(corr).toEqual([{ id: corr[0]!.id, format: "obj", fichier: "piece.obj", metresParUnite: 0.01 }]);
    expect(disponibiliteCoordonnees(imp.modele, "source", "ifc")).toMatch(/IFC/);
    const src = ok(modeleAExporter(imp.modele, "source", "obj", null));
    expect(src.unite).toBe("cm");
    const texte = exporterObj(src.modele, "piece", `unités : ${src.unite} (coordonnées d'origine)`).contenu;
    expect(texte).toContain("v 100 50 0");
    expect(texte).toContain("unités : cm (coordonnées d'origine)");
    expect(exporterObj(m, "x").contenu).toContain("unités : mètres");
    const deux = importerMaillages(imp.modele, lireObj(obj), 0.001, "autre", { format: "obj", fichier: "autre.obj" });
    expect(disponibiliteCoordonnees(deux.modele, "source", "stl")).toMatch(/Plusieurs imports/);
  });
});
