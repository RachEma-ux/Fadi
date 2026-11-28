/** Protocole 1.5 : matières à motif de hachure, motifs lus et créés par une extension (Échanges DXF 1.1). */
import { describe, expect, it } from "vitest";
import { modeleVide, type Modele } from "./geometrie-libre.js";
import { creerServicesExtension, COULEUR_MATIERE_DEFAUT } from "./services-extensions.js";

function planche(permissions: string[] = ["modele.lire", "modele.modifier"]) {
  let m: Modele = modeleVide();
  const s = creerServicesExtension(
    { id: "essai", permissions: permissions as never },
    { modele: () => m, selection: () => [], dans: () => undefined, appliquer: (t) => ((m = t), true), selectionner: () => {} },
  );
  return { s, modele: () => m };
}
const ok = <T>(r: { ok: boolean; resultat?: unknown }): T => {
  expect(r).toMatchObject({ ok: true });
  return (r as { resultat: T }).resultat;
};
const ANSI31 = [{ angle: 45, x0: 0, y0: 0, dx: 0, dy: 3.175, tirets: [] }];

describe("protocole 1.5 : motifs et matières à hachure", () => {
  it("motifs.creer puis matieres.creer : la matière porte le motif ; matieres.lire et motifs.lire les rendent", () => {
    const { s, modele } = planche();
    ok(s.servir("operation.ouvrir", { nom: "Hachures" }));
    const h = ok<string>(s.servir("motifs.creer", { nom: "ANSI31", familles: ANSI31, fichier: "plan.dxf" }));
    const mat = ok<string>(s.servir("matieres.creer", { nom: "Béton coupé", couleur: "#A0A0A0", motif: h }));
    ok(s.servir("operation.valider", null));
    expect(modele().annotations?.motifs?.[h]).toMatchObject({ nom: "ANSI31", source: { genre: "pat", fichier: "plan.dxf" } });
    expect(ok<unknown[]>(s.servir("matieres.lire", null))).toEqual([{ id: mat, nom: "Béton coupé", couleur: "#a0a0a0", motif: h, opacite: 1 }]);
    expect(ok<unknown[]>(s.servir("motifs.lire", null))).toEqual([{ id: h, nom: "ANSI31", familles: ANSI31 }]);
  });
  it("même nom : le motif ou la matière existants sont rendus, rien n'est doublé ; sans couleur ni motif : gris, aplat", () => {
    const { s, modele } = planche();
    ok(s.servir("operation.ouvrir", { nom: "Deux fois" }));
    const h1 = ok<string>(s.servir("motifs.creer", { nom: "ANSI31", familles: ANSI31 }));
    const h2 = ok<string>(s.servir("motifs.creer", { nom: "ANSI31", familles: ANSI31 }));
    const m1 = ok<string>(s.servir("matieres.creer", { nom: "Enduit" }));
    const m2 = ok<string>(s.servir("matieres.creer", { nom: "Enduit" }));
    ok(s.servir("operation.valider", null));
    expect(h1).toBe(h2);
    expect(m1).toBe(m2);
    expect(Object.keys(modele().annotations?.motifs ?? {})).toHaveLength(1);
    expect(modele().annotations?.materiaux[m1]).toEqual({ id: m1, nom: "Enduit", couleur: COULEUR_MATIERE_DEFAUT });
    expect(modele().annotations?.motifs?.[h1]?.source).toEqual({ genre: "saisie" });
  });
  it("arguments mal formés refusés, motif inconnu refusé, permissions exigées", () => {
    const { s } = planche();
    expect(s.servir("motifs.creer", { nom: "", familles: ANSI31 })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("motifs.creer", { nom: "X", familles: [] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("motifs.creer", { nom: "X", familles: [{ ...ANSI31[0], dy: 0 }] })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("motifs.creer", { nom: "X", familles: ANSI31, fichier: "" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("matieres.creer", { nom: "X", couleur: "rouge" })).toMatchObject({ ok: false, erreur: "argument_invalide" });
    expect(s.servir("matieres.creer", { nom: "X", motif: "h-inconnu" })).toMatchObject({ ok: false, erreur: "objet_introuvable" });
    const lecteur = planche(["modele.lire"]).s;
    expect(lecteur.servir("matieres.creer", { nom: "X" })).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.modifier" });
    expect(lecteur.servir("motifs.creer", { nom: "X", familles: ANSI31 })).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.modifier" });
    expect(planche([]).s.servir("motifs.lire", null)).toEqual({ ok: false, erreur: "permission_refusee", detail: "modele.lire" });
  });
});
