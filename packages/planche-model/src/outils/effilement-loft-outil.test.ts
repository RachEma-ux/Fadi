/** Lot L22 : méthodes Effilement et Loft de l'outil Suivez-moi — clic, aperçu, correction depuis la recette. */
import { describe, expect, it } from "vitest";
import { type Id, type Matrice4, type Modele, ajouterRectangle, grouper, modeleVide } from "../geometrie-libre.js";
import { type Vec3, v3 } from "../vecteur.js";
import { ERREUR_CONTEXTE_DEFORME, pointsDe } from "./commun-modif.js";
import { clicVers, faces, partie, saisie, survolVers, volumeAbsolu } from "./essais-modification.js";
import type { ContexteOutil, EvenementOutil } from "./machine.js";
import { CONSIGNE_LOFT_1, CONSIGNE_LOFT_2, ERREUR_SAISIE_EFFILEMENT, machineSuivezMoi } from "./suivez-moi.js";

const option = (p: { vue(): { options?: readonly { id: string; valeur: string }[] } }, id: string) => p.vue().options?.find((o) => o.id === id)?.valeur;
const DEPUIS = v3(0.3, -1, 0.2);
/** Profil carré 1 × 1 dans le plan XZ. */
const carre = (): Modele => ajouterRectangle(modeleVide(), v3(1, 0, 0), v3(1, 0, 0), v3(0, 0, 1)).modele;
/** Deux carrés horizontaux 1 × 1 : z = 0 (x de 0 à 1) et z = 2 (x de 3 à 4). */
function deuxCarres(): Modele {
  const m = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
  return ajouterRectangle(m, v3(3, 0, 2), v3(1, 0, 0), v3(0, 1, 0)).modele;
}
const tronc = (h: number, a1: number, a2: number) => (h / 3) * (a1 + a2 + Math.sqrt(a1 * a2));

describe("Effilement, méthode de Suivez-moi (L22)", () => {
  it("Alt fait le tour des quatre méthodes, sans outil ni lettre de plus", () => {
    const p = partie(machineSuivezMoi, carre());
    const vues: (string | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      p.seule("Alt");
      vues.push(option(p, "methode"));
    }
    expect(vues).toEqual(["revolution", "effilement", "loft", "chemin"]);
  });

  it("survol → aperçu sans pas ; clic → un pas « Effilement » (tronc de pyramide, échelle 0,5 par défaut)", () => {
    const p = partie(machineSuivezMoi, carre()).configurer("methode", "effilement");
    expect(p.vue().consigne).toMatch(/^Effilement : cliquez sur le profil \(longueur 1 m, échelle 0\.5, torsion 0°\)\.$/);
    p.jouer(survolVers(v3(1.5, 0, 0.5), DEPUIS));
    expect(p.historique).toHaveLength(1);
    expect(p.vue().apercu.faces.length).toBeGreaterThan(0);
    p.jouer(clicVers(v3(1.5, 0, 0.5), DEPUIS));
    expect(p.vue().erreur).toBeNull();
    expect(p.operations).toEqual(["Effilement"]);
    expect(faces(p.modele)).toHaveLength(6);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(tronc(1, 1, 0.25), 9);
  });

  it("correction juste après : « 2;;0 » puis « ;1 » régénèrent depuis le profil d'origine, en remplaçant le dernier pas", () => {
    const p = partie(machineSuivezMoi, carre()).configurer("methode", "effilement").jouer(clicVers(v3(1.5, 0, 0.5), DEPUIS));
    p.jouer(saisie("2;;0"));
    expect(p.historique).toHaveLength(2);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(tronc(2, 1, 0.25), 9);
    p.jouer(saisie(";1"));
    expect(p.historique).toHaveLength(2);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(2, 9);
    expect(p.vue().mesures?.valeur).toBe("2;1;0");
  });

  it("saisie illisible ou échelle nulle : refus, rien d'écrit", () => {
    const p = partie(machineSuivezMoi, carre()).configurer("methode", "effilement");
    p.jouer(saisie("a;b"));
    expect(p.vue().erreur).toBe(ERREUR_SAISIE_EFFILEMENT);
    p.jouer(saisie("1;0"), clicVers(v3(1.5, 0, 0.5), DEPUIS));
    expect(p.vue().erreur).toMatch(/Effiler : l'échelle d'arrivée.*\[EX_DISTANCE_INVALID\]$/);
    expect(p.historique).toHaveLength(1);
  });
});

describe("Loft, méthode de Suivez-moi (L22)", () => {
  it("deux clics : premier profil puis second → un pas « Loft » (prisme cisaillé, volume 2)", () => {
    const p = partie(machineSuivezMoi, deuxCarres()).configurer("methode", "loft");
    expect(p.vue().consigne).toBe(CONSIGNE_LOFT_1);
    p.jouer(clicVers(v3(0.5, 0.5, 0), v3(0.5, 0.5, -5)));
    expect(p.vue().consigne).toBe(CONSIGNE_LOFT_2);
    expect(p.historique).toHaveLength(1);
    p.jouer(clicVers(v3(3.5, 0.5, 2), v3(3.5, 0.5, 7)));
    expect(p.vue().erreur).toBeNull();
    expect(p.operations).toEqual(["Loft"]);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(2, 9);
    expect(p.vue().consigne).toBe(CONSIGNE_LOFT_1);
  });

  it("tronçons corrigés juste après (« 4s ») : même volume, plus de faces, dernier pas remplacé", () => {
    const p = partie(machineSuivezMoi, deuxCarres()).configurer("methode", "loft");
    p.jouer(clicVers(v3(0.5, 0.5, 0), v3(0.5, 0.5, -5)), clicVers(v3(3.5, 0.5, 2), v3(3.5, 0.5, 7)));
    const n = faces(p.modele).length;
    p.jouer(saisie("4s"));
    expect(p.historique).toHaveLength(2);
    expect(faces(p.modele).length).toBeGreaterThan(n);
    expect(volumeAbsolu(p.modele)).toBeCloseTo(2, 9);
  });
});

describe("Revue de #135 : effilement dans un contexte transformé, capuchons du loft", () => {
  /** Carré 1 × 1 au sol groupé, occurrence transformée par M ; la machine est jouée dans ce contexte, méthode Effilement. */
  function dansGroupe(M: Matrice4, evs: readonly EvenementOutil[]) {
    const sol = ajouterRectangle(modeleVide(), v3(0, 0, 0), v3(1, 0, 0), v3(0, 1, 0)).modele;
    const g = grouper(sol, [...Object.keys(sol.racine.faces), ...Object.keys(sol.racine.aretes)]);
    const o = g.modele.racine.occurrences[g.occurrence]!;
    let modele: Modele = { ...g.modele, racine: { ...g.modele.racine, occurrences: { ...g.modele.racine.occurrences, [g.occurrence]: { ...o, transformation: M } } } };
    const ctx = (): ContexteOutil => ({ modele, selection: [], separateurDecimal: ",", dans: g.occurrence });
    let etat = machineSuivezMoi.configurer!(machineSuivezMoi.initial(), "methode", "effilement", ctx()).etat;
    const operations: string[] = [];
    for (const ev of evs) {
      const t = machineSuivezMoi.traiter(etat, ev, ctx());
      etat = t.etat;
      if (t.modele) modele = t.modele;
      if (t.operation) operations.push(t.operation);
    }
    const hauteur = () => {
      const zs = pointsDe(modele, [g.occurrence]).map((p: Vec3) => p.z);
      return Math.max(...zs) - Math.min(...zs);
    };
    return { etat, modele, operations, hauteur, occ: g.occurrence as Id };
  }
  const DEUX: Matrice4 = [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 1];
  const X2: Matrice4 = [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it("groupe × 2 : la longueur tapée est en mètres monde (1 m, puis correction « 2;;0 » → 2 m), pas en unités locales", () => {
    const r = dansGroupe(DEUX, [clicVers(v3(1, 1, 0), v3(0, 0, 1))]);
    expect(r.etat.erreur).toBeNull();
    expect(r.operations).toEqual(["Effilement"]);
    expect(r.hauteur()).toBeCloseTo(1, 9);
    const c = dansGroupe(DEUX, [clicVers(v3(1, 1, 0), v3(0, 0, 1)), saisie("2;;0")]);
    expect(c.etat.erreur).toBeNull();
    expect(c.hauteur()).toBeCloseTo(2, 9);
  });

  it("groupe à l'échelle (2 ; 1 ; 1) : sans torsion la longueur reste juste ; avec torsion, refus nommé (l'angle ne serait pas celui tapé)", () => {
    const sans = dansGroupe(X2, [saisie("1;0,5;0"), clicVers(v3(1, 0.5, 0), v3(0, 0, 1))]);
    expect(sans.etat.erreur).toBeNull();
    expect(sans.hauteur()).toBeCloseTo(1, 9);
    const avec = dansGroupe(X2, [saisie("1;0,5;90"), clicVers(v3(1, 0.5, 0), v3(0, 0, 1))]);
    expect(avec.etat.erreur).toContain(ERREUR_CONTEXTE_DEFORME);
    expect(avec.operations).toEqual([]);
  });

  it("Loft suit l'option Capuchons : « sans » donne une surface ouverte de quatre parois, « avec » la coque fermée", () => {
    const p = partie(machineSuivezMoi, deuxCarres()).configurer("methode", "loft").configurer("bouchons", "sans");
    expect(option(p, "bouchons")).toBe("sans");
    p.jouer(clicVers(v3(0.5, 0.5, 0)), clicVers(v3(3.5, 0.5, 2)));
    expect(p.vue().erreur).toBeNull();
    expect(p.operations).toEqual(["Loft"]);
    expect(faces(p.modele)).toHaveLength(4);
    const q = partie(machineSuivezMoi, deuxCarres()).configurer("methode", "loft");
    q.jouer(clicVers(v3(0.5, 0.5, 0)), clicVers(v3(3.5, 0.5, 2)));
    expect(faces(q.modele)).toHaveLength(6);
    expect(volumeAbsolu(q.modele)).toBeCloseTo(2, 9);
  });
});
