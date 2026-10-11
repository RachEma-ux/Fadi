/** Lot 10d (EX-RV-01 à 04) : méthode Révolution de l'outil Suivez-moi — axe, aperçu, correction depuis la recette. */
import { describe, expect, it } from "vitest";
import { type Id, type Modele, ajouterRectangle, ajouterSegment, contexte, modeleVide } from "../geometrie-libre.js";
import { v3 } from "../vecteur.js";
import { clicVers, echap, faces, partie, saisie, survolVers, volumeAbsolu } from "./essais-modification.js";
import { CONSIGNE_AXE_1, CONSIGNE_AXE_2, machineSuivezMoi } from "./suivez-moi.js";

/** Profil 1 × 1 dans le plan XZ (x de 1 à 2) et axe Z dessiné comme une arête (0;0;0) → (0;0;1). */
function scene(): { m: Modele; axe: Id; profil: Id } {
  let m = ajouterRectangle(modeleVide(), v3(1, 0, 0), v3(1, 0, 0), v3(0, 0, 1)).modele;
  const profil = Object.keys(m.racine.faces)[0] as Id;
  const avant = new Set(Object.keys(m.racine.aretes));
  m = ajouterSegment(m, v3(0, 0, 0), v3(0, 0, 1)).modele;
  const axe = Object.keys(m.racine.aretes).find((a) => !avant.has(a)) as Id;
  return { m, axe, profil };
}
const DEPUIS = v3(0.3, -1, 0.2);
const surProfil = () => survolVers(v3(1.5, 0, 0.5), DEPUIS);
const clicProfil = () => clicVers(v3(1.5, 0, 0.5), DEPUIS);
const option = (p: { vue(): { options?: readonly { id: string; valeur: string }[] } }, id: string) => p.vue().options?.find((o) => o.id === id)?.valeur;

describe("Révolution, méthode de Suivez-moi (EX-RV-01)", () => {
  it("option « Méthode » (Chemin par défaut) ; Alt seul bascule ; aucun outil ni lettre de plus", () => {
    const p = partie(machineSuivezMoi, scene().m);
    expect(option(p, "methode")).toBe("chemin");
    p.seule("Alt");
    expect(option(p, "methode")).toBe("revolution");
    expect(option(p, "groupe")).toBe("non");
    expect(p.vue().consigne).toBe(CONSIGNE_AXE_1);
    p.seule("Alt"); // L22 : Effilement puis Loft avant de revenir à Chemin
    expect(option(p, "methode")).toBe("effilement");
  });

  it("axe = arête présélectionnée : survol du profil → aperçu (192 faces, 48 segments, écart annoncé), rien d'écrit ; clic → un pas « Révolution »", () => {
    const { m, axe } = scene();
    const p = partie(machineSuivezMoi, m, [axe]).configurer("methode", "revolution").jouer(surProfil());
    expect(p.historique).toHaveLength(1);
    expect(p.vue().apercu.faces).toHaveLength(192);
    expect(p.vue().consigne).toMatch(/48 segments, écart de facettage ≈ 4\.282 mm\.$/);
    p.jouer(clicProfil());
    expect(p.operations).toEqual(["Révolution"]);
    expect(faces(p.modele)).toHaveLength(192);
    expect(contexte(p.modele).aretes[axe]).toBeDefined(); // l'axe n'est pas consommé, le profil l'est
    expect(p.selection).toEqual([axe]); // et reste sélectionné pour le profil suivant
    expect(p.vue().consigne).toMatch(/^Révolution : cliquez sur le profil/);
  });

  it("R-04 : correction par le champ Mesures — 90 puis 96s régénèrent depuis le profil d'origine, en remplaçant le dernier pas", () => {
    const { m, axe } = scene();
    const p = partie(machineSuivezMoi, m, [axe]).configurer("methode", "revolution").jouer(clicProfil());
    p.jouer(saisie("90"));
    expect(p.historique).toHaveLength(2);
    expect(p.operations).toEqual(["Révolution (corrigé)"]);
    expect(faces(p.modele)).toHaveLength(4 * 12 + 2);
    p.jouer(saisie("96s"));
    expect(faces(p.modele)).toHaveLength(4 * 24 + 2);
    expect(p.historique).toHaveLength(2);
    expect(p.vue().mesures?.valeur).toBe("90°");
  });

  it("axe par deux points cliqués (arête du profil x = 1) : profil qui touche l'axe → cylindre plein, pôles partagés", () => {
    const { m } = scene();
    const p = partie(machineSuivezMoi, m).configurer("methode", "revolution");
    p.jouer(clicVers(v3(1, 0, 0), DEPUIS));
    expect(p.vue().consigne).toBe(CONSIGNE_AXE_2);
    p.jouer(clicVers(v3(1, 0, 1), DEPUIS), saisie("24s"), clicProfil());
    expect(p.vue().erreur).toBeNull();
    expect(p.operations).toEqual(["Révolution"]);
    const N = 24;
    expect(volumeAbsolu(p.modele)).toBeCloseTo((N / 2) * Math.sin((2 * Math.PI) / N), 9);
  });

  it("« Résultat en nouveau groupe » (Maj seul) : le corps est rangé dans une occurrence", () => {
    const { m, axe } = scene();
    const p = partie(machineSuivezMoi, m, [axe]).configurer("methode", "revolution").seule("Maj");
    expect(option(p, "groupe")).toBe("oui");
    p.jouer(clicProfil());
    expect(Object.keys(contexte(p.modele).occurrences)).toHaveLength(1);
    expect(faces(p.modele)).toHaveLength(0);
  });

  it("Capuchons (Ctrl seul) sur un tour partiel : sans coiffes, surface ouverte", () => {
    const { m, axe } = scene();
    const p = partie(machineSuivezMoi, m, [axe]).configurer("methode", "revolution").seule("Ctrl").jouer(saisie("90"), clicProfil());
    expect(option(p, "bouchons")).toBe("sans");
    expect(faces(p.modele)).toHaveLength(4 * 12);
  });

  it("valeurs refusées (0°, 11s, 400) : message, rien d'appliqué ; Échap oublie l'axe cliqué", () => {
    const { m, axe } = scene();
    const p = partie(machineSuivezMoi, m, [axe]).configurer("methode", "revolution");
    for (const t of ["0", "11s", "400"]) expect(p.jouer(saisie(t)).vue().erreur).not.toBeNull();
    expect(p.historique).toHaveLength(1);
    const q = partie(machineSuivezMoi, m).configurer("methode", "revolution").jouer(clicVers(v3(1, 0, 0), DEPUIS));
    expect(q.vue().consigne).toBe(CONSIGNE_AXE_2);
    expect(q.jouer(echap).vue().consigne).toBe(CONSIGNE_AXE_1);
  });
});

describe("Revue de #124 — axe qui borde le profil", () => {
  it("rectangle tourné autour de son propre bord : l'arête consommée, l'axe reste prêt pour le profil suivant", () => {
    const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 0, 1)).modele;
    const c = contexte(m);
    const bord = Object.values(c.aretes).find((a) => Math.abs(c.sommets[a.a]!.position.x) < 1e-9 && Math.abs(c.sommets[a.b]!.position.x) < 1e-9)!;
    const p = partie(machineSuivezMoi, m, [bord.id]).configurer("methode", "revolution").jouer(clicVers(v3(0.5, 0, 0.5), DEPUIS));
    expect(p.operations).toEqual(["Révolution"]);
    expect(contexte(p.modele).aretes[bord.id]).toBeUndefined();
    expect(p.vue().consigne).toMatch(/^Révolution : cliquez sur le profil/);
    expect(p.vue().consigne).not.toBe(CONSIGNE_AXE_1);
  });
});
