import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { pointLocal } from "../ontologie/reperes.js";
import { longueur } from "../ontologie/unites.js";
import type { Commande, CommandeDeType } from "./commandes.js";
import { EFFETS_VIDES } from "./effets.js";
import { CONTRAT_COMMANDES, TYPES_COMMANDE, type EnveloppeCommandes } from "./enveloppe.js";
import { CODES_PROBLEME } from "./probleme.js";
import { REGLE_QUANTITES } from "./quantites.js";
import { TOLERANCES } from "./tolerances.js";

describe("contrat atelier-commands/1", () => {
  it("accepte l'enveloppe du cahier (§5.3), complétée des paramètres canoniques sans valeur par défaut", () => {
    const mur: CommandeDeType<"mur.tracer"> = {
      type: "mur.tracer",
      params: {
        id: "p_mur-1",
        niveauId: "rdc",
        a: pointLocal(0, 0),
        b: pointLocal(4.5, 0),
        epaisseur: longueur(0.2),
        hauteur: longueur(3.2),
        alignement: "axe",
        exterieur: false,
        typeId: "cloison",
        calqueId: "Cloisons",
      },
      cibles: [],
    };
    const enveloppe: EnveloppeCommandes = {
      requestId: "f3c1a2b4-0000-4000-8000-000000000000",
      baseRevision: 42,
      contract: CONTRAT_COMMANDES,
      label: "Tracer un mur",
      commands: [mur],
    };
    expect(enveloppe.contract).toBe("atelier-commands/1");
    expect(JSON.parse(JSON.stringify(enveloppe))).toEqual(enveloppe);
  });

  it("énumère chaque type de commande une seule fois, couvrant toutes les familles de l'annexe B", () => {
    expect(new Set(TYPES_COMMANDE).size).toBe(TYPES_COMMANDE.length);
    const familles = new Set(TYPES_COMMANDE.map((t) => t.split(".")[0]));
    for (const f of ["niveau", "mur", "ouverture", "dalle", "toiture", "escalier", "piece", "espace", "zone", "poteau", "solide", "esquisse", "transformer", "cotation", "texte", "etiquette", "calque", "groupe", "bloc", "type", "propriete", "classification", "reference", "site"]) {
      expect(familles.has(f)).toBe(true);
    }
  });

  it("discrimine les commandes par type", () => {
    const c: Commande = { type: "ouverture.deplacer", params: { t: 0.5 }, cibles: ["p_porte-1"] };
    if (c.type === "ouverture.deplacer") expect(c.params.t).toBe(0.5);
  });
});

describe("constantes de contrat", () => {
  it("tolérances D-012", () => {
    expect(TOLERANCES).toEqual({
      tolCoincidence: 1e-6,
      longueurMin: 0.001,
      tolAngle: 1e-6,
      aireMin: 1e-6,
      tolCorde: 0.001,
      copiesMax: 500,
      rayonAccrochageSourisPx: 8,
      rayonAccrochageTouchePx: 16,
    });
  });

  it("règle de quantités, effets vides, codes de problème uniques", () => {
    expect(REGLE_QUANTITES).toBe("quantites/1");
    expect(Object.values(EFFETS_VIDES).every((v) => Array.isArray(v) && v.length === 0)).toBe(true);
    expect(new Set(CODES_PROBLEME).size).toBe(CODES_PROBLEME.length);
  });
});

describe("position d'une baie (DA-07-02) : `distance` = t × longueur, jusqu'au centre", () => {
  it("aucune des 210 baies de P.118 n'est hors emprise de son mur hôte avec cette lecture", () => {
    const ici = dirname(fileURLToPath(import.meta.url));
    const fichier = resolve(ici, "../../../../apps/api/src/data/examples/p118-native-model.json");
    const d = JSON.parse(readFileSync(fichier, "utf8")) as {
      domains: { floorDesign: { levels: Record<string, { walls: { id: string; a: number[]; b: number[] }[]; doors: Baie[]; windows: Baie[] }> } };
    };
    type Baie = { hostWallId: string; t: number; width: number };
    let baies = 0;
    let horsEmprise = 0;
    let horsEmpriseLectureDebut = 0;
    for (const niveau of Object.values(d.domains.floorDesign.levels)) {
      const murs = new Map(niveau.walls.map((w) => [w.id, w]));
      for (const o of [...niveau.doors, ...niveau.windows]) {
        baies++;
        const w = murs.get(o.hostWallId);
        if (!w) continue;
        const [ax = 0, ay = 0] = w.a;
        const [bx = 0, by = 0] = w.b;
        const l = Math.hypot(bx - ax, by - ay);
        const centre = o.t * l;
        if (centre - o.width / 2 < -TOLERANCES.tolCoincidence || centre + o.width / 2 > l + TOLERANCES.tolCoincidence) horsEmprise++;
        if (centre < -TOLERANCES.tolCoincidence || centre + o.width > l + TOLERANCES.tolCoincidence) horsEmpriseLectureDebut++;
      }
    }
    expect(baies).toBe(210);
    expect(horsEmprise).toBe(0);
    // La lecture « distance jusqu'au bord de début » mettrait des baies hors emprise : elle est écartée.
    expect(horsEmpriseLectureDebut).toBeGreaterThan(0);
  });
});
