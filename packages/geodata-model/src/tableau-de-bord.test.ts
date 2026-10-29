import { describe, expect, it } from "vitest";
import { cheminOnglet, evaluer, evaluerBloc, formaterNombre, MOTIF_INDICATEUR_ABSENT, ongletDeChemin, tableauxParTheme, trierLignes, validerDefinitionTableauDeBord, versCsv, type IndicateurZone } from "./tableau-de-bord.js";

const ind = (famille: string, valeur: number | null, o: Partial<IndicateurZone> = {}): IndicateurZone => ({
  titre: famille, unite: "%", nature: "source", theme: "Démographie", famille, modalite: null, milieu: "ensemble", sexe: "ensemble", valeur, motifAbsence: valeur === null ? "non-publiee" : null, ...o,
});

const zone: IndicateurZone[] = [
  ind("Population", 200, { unite: "personnes" }),
  ind("Population", 150, { unite: "personnes", milieu: "urbain" }),
  ind("Âge (%)", 30.2, { modalite: "0-4" }),
  ind("Âge (%)", 25.1, { modalite: "5-9" }),
  ind("Âge (%)", null, { modalite: "10-14" }),
  ind("Chômage (%)", 12.5, { milieu: "rural", sexe: "feminin", theme: "Activité" }),
  ind("Établissements", 40, { unite: "établissements", nature: "calcule", theme: "CEE" }),
];

describe("tableau de bord (D-GD-37)", () => {
  it("valide une définition et refuse une expression inconnue, une clé en double, des cellules manquantes", () => {
    const bonne = {
      pays: "ZZ", zone: { code: "ZZ", nom: "Pays" },
      blocs: [
        { cle: "pop", onglet: "chiffres-cles", type: "chiffre", titre: "Population", valeur: { indicateur: { famille: "Population" } }, source: "Source", unite: "personnes", decimales: 0 },
        { cle: "t", onglet: "cee", type: "tableau", titre: "T", source: "S", colonnes: ["A"], lignes: [{ libelle: "x", cellules: [{ indisponible: "série absente" }] }], graphique: "barres" },
      ],
    };
    const v = validerDefinitionTableauDeBord(bonne);
    expect(v.ok).toBe(true);
    const mauvaise = { ...bonne, blocs: [bonne.blocs[0], { ...bonne.blocs[0] }, { ...bonne.blocs[1], cle: "u", lignes: [{ libelle: "x", cellules: [] }] }, { ...bonne.blocs[0], cle: "z", valeur: { inconnu: 1 } }] };
    const m = validerDefinitionTableauDeBord(mauvaise);
    expect(m.ok).toBe(false);
    if (!m.ok) expect(m.erreurs.join(" | ")).toMatch(/clé unique.*cellule par colonne.*expression inconnue/);
  });

  it("lit un indicateur par ses dimensions (ensemble par défaut) ; absent → motif, jamais zéro", () => {
    expect(evaluer({ indicateur: { famille: "Population" } }, zone)).toEqual({ valeur: 200, calcule: false, motif: null });
    expect(evaluer({ indicateur: { famille: "Population", milieu: "urbain" } }, zone).valeur).toBe(150);
    expect(evaluer({ indicateur: { famille: "Population", milieu: "rural" } }, zone)).toEqual({ valeur: null, calcule: false, motif: MOTIF_INDICATEUR_ABSENT });
    expect(evaluer({ indicateur: { famille: "Âge (%)", modalite: "10-14" } }, zone)).toEqual({ valeur: null, calcule: false, motif: "non-publiee" });
    expect(evaluer({ indisponible: "Série 1960–2014 non chargée" }, zone)).toEqual({ valeur: null, calcule: false, motif: "Série 1960–2014 non chargée" });
    // Un indicateur de nature « calculé » reste marqué calculé.
    expect(evaluer({ indicateur: { famille: "Établissements" } }, zone).calcule).toBe(true);
  });

  it("somme et rapport : marqués calculés ; un terme absent rend le résultat absent (pas de somme partielle)", () => {
    expect(evaluer({ somme: [{ famille: "Âge (%)", modalite: "0-4" }, { famille: "Âge (%)", modalite: "5-9" }] }, zone)).toEqual({ valeur: 55.3, calcule: true, motif: null });
    expect(evaluer({ somme: [{ famille: "Âge (%)", modalite: "0-4" }, { famille: "Âge (%)", modalite: "10-14" }] }, zone)).toEqual({ valeur: null, calcule: true, motif: "non-publiee" });
    const r = evaluer({ ratio: [{ indicateur: { famille: "Population", milieu: "urbain" } }, { indicateur: { famille: "Population" } }], facteur: 100 }, zone);
    expect(r).toEqual({ valeur: 75, calcule: true, motif: null });
    expect(evaluer({ ratio: [{ indicateur: { famille: "Population", milieu: "rural" } }, { indicateur: { famille: "Population" } }] }, zone).valeur).toBeNull();
  });

  it("évalue un bloc tableau ligne par ligne et compte les valeurs disponibles", () => {
    const v = validerDefinitionTableauDeBord({ pays: "ZZ", zone: { code: "ZZ", nom: "P" }, blocs: [{ cle: "c", onglet: "chiffres-cles", type: "tableau", titre: "Chômage", source: "S", colonnes: ["Rural", "Urbain"], lignes: [{ libelle: "Féminin", cellules: [{ indicateur: { famille: "Chômage (%)", milieu: "rural", sexe: "feminin" } }, { indicateur: { famille: "Chômage (%)", milieu: "urbain", sexe: "feminin" } }] }] }] });
    if (!v.ok) throw new Error(v.erreurs.join());
    const e = evaluerBloc(v.definition.blocs[0]!, zone);
    expect(e.valeurs[0]!.map((x) => x.valeur)).toEqual([12.5, null]);
    expect(e.disponibles).toBe(1);
    expect(e.calcule).toBe(false);
  });

  it("tableaux par thème : lignes famille/modalité, colonnes milieu → sexe présentes, thèmes exclus écartés", () => {
    const t = tableauxParTheme(zone, ["CEE"]);
    expect(t.map((x) => x.theme)).toEqual(["Démographie", "Activité"]);
    expect(t[0]!.colonnes.map((c) => `${c.milieu}/${c.sexe}`)).toEqual(["ensemble/ensemble", "urbain/ensemble"]);
    expect(t[0]!.lignes.map((l) => l.libelle)).toEqual(["Population", "Âge (%) — 0-4", "Âge (%) — 5-9", "Âge (%) — 10-14"]);
    expect(t[0]!.lignes[0]!.cellules.map((c) => c?.valeur ?? null)).toEqual([200, 150]);
    expect(t[1]!.colonnes.map((c) => c.libelle)).toEqual(["Rural — Féminin"]);
  });

  it("tri : absents en fin, nombres et libellés", () => {
    const l = [{ v: 3 }, { v: null }, { v: 10 }];
    expect(trierLignes(l, (x) => x.v, "desc").map((x) => x.v)).toEqual([10, 3, null]);
    expect(trierLignes(l, (x) => x.v, "asc").map((x) => x.v)).toEqual([3, 10, null]);
    expect(trierLignes([{ n: "Rural" }, { n: "Ensemble" }], (x) => x.n, "asc").map((x) => x.n)).toEqual(["Ensemble", "Rural"]);
  });

  it("CSV : BOM, point-virgule, absents vides, échappement", () => {
    const c = versCsv(["Zone", "Valeur"], [["A;B", 1.5], ["C", null]], ["Source : HCP"]);
    expect(c).toBe('﻿Zone;Valeur\r\n"A;B";1.5\r\nC;\r\nSource : HCP\r\n');
  });

  it("nombres au format français ; absent → null", () => {
    expect(formaterNombre(36828330)).toBe("36 828 330");
    expect(formaterNombre(62.7509, 1)).toBe("62,8");
    expect(formaterNombre(1.97)).toBe("1,97");
    expect(formaterNombre(null)).toBeNull();
  });

  it("onglets : une adresse par onglet, toute autre adresse revient aux cartes", () => {
    expect(ongletDeChemin("/geodata")).toBe("cartes");
    expect(ongletDeChemin("/geodata/chiffres-cles")).toBe("chiffres-cles");
    expect(ongletDeChemin("/geodata/tableaux/")).toBe("tableaux");
    expect(ongletDeChemin("/geodata/inconnu")).toBe("cartes");
    expect(cheminOnglet("concepts")).toBe("/geodata/concepts");
    expect(cheminOnglet("cartes")).toBe("/geodata");
  });
});
