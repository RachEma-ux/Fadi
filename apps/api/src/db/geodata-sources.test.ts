/**
 * Fiches de source qualifiées livrées (`docs/geodata/sources`, D-GD-04, D-GD-12) : chaque fiche est complète (licence,
 * attribution, droits par usage connus) et, quand ses données sont livrées avec elle, le fichier existe, son empreinte
 * est celle de la fiche, il passe la validation partagée sous la borne d'une couche V1 et ses codes sont uniques.
 * Sans base de données.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluer, trouverIndicateur, validerDefinitionTableauDeBord, type Expression, type IndicateurZone, CATEGORIES_CATALOGUE, MAX_PIXELS_RASTER, OBJETS_PAR_COUCHE, USAGES, validerDeclarationRaster, validerDeclarationTerritoire, validerGeoJSON } from "@parcours/geodata-model";
import { lireGeoTiff } from "../lib/geodata/raster.js";
import { codesDesObjets } from "../lib/geodata/versions.js";
import type { FicheSource } from "./geodata-reference.js";
import { lireConcepts } from "../lib/geodata/annexes.js";
import { empreinteAttendue } from "../lib/geodata/empreinte-fiche.js";

const DOSSIER = fileURLToPath(new URL("../../../../docs/geodata/sources/", import.meta.url));
const fiches = readdirSync(DOSSIER).filter((f) => f.endsWith(".json")).sort();

describe("fiches de source GeoData livrées", () => {
  it("au moins les limites administratives du HCP et une source ouverte à données livrées ; geoBoundaries n'est plus une fiche livrée (D-GD-30)", () => {
    expect(fiches).toContain("hcp-rgph2024-population-regions.json");
    expect(fiches).not.toContain("geoboundaries-mar-adm1.json");
    expect(fiches.some((f) => f.startsWith("osm-mar-"))).toBe(true);
  });

  for (const nom of fiches) {
    it(nom, async () => {
      const fiche = JSON.parse(readFileSync(join(DOSSIER, nom), "utf8")) as FicheSource;
      expect(`${fiche.cle}.json`).toBe(nom);
      expect(fiche.version.licence.length).toBeGreaterThan(5);
      expect(fiche.version.attribution.length).toBeGreaterThan(5);
      expect(fiche.version.synthetique).toBe(false);
      for (const u of USAGES) expect(["autorise", "refuse", "inconnu"]).toContain(fiche.version.droits[u]);
      expect(fiche.version.url || fiche.version.fichier).toBeTruthy();
      if (!fiche.version.fichier) return;
      expect(fiche.version.fichier).toMatch(/^donnees\/[a-z0-9-]+\.(geojson|tif)$/);
      const octets = readFileSync(join(DOSSIER, fiche.version.fichier));
      expect(createHash("sha256").update(octets).digest("hex")).toBe(fiche.version.empreinte);
      if (fiche.version.fichier.endsWith(".tif")) {
        // Couche raster (D-GD-13) : déclaration valide, GeoTIFF EPSG:4326 lisible sous la borne de cellules.
        expect(validerDeclarationRaster(fiche.couche.raster).ok).toBe(true);
        const r = await lireGeoTiff(octets);
        expect(r.grille.largeur * r.grille.hauteur).toBeLessThanOrEqual(MAX_PIXELS_RASTER);
        return;
      }
      const v = validerGeoJSON(JSON.parse(octets.toString("utf8")), { octets: 200 * 1024 * 1024, objets: OBJETS_PAR_COUCHE, sommets: 20_000_000, proprietes: 200, longueurTexte: 2000 });
      expect(v.ok).toBe(true);
      if (!v.ok) return;
      const { codes: codesCouche, doublons, manquants } = codesDesObjets(v.objets, fiche.couche.champCode);
      expect(doublons).toEqual([]);
      expect(manquants).toBe(0);
      const t = fiche.version.tableau;
      if (!t) return;
      // Tableau de valeurs (lot A2) : empreinte de la fiche, une colonne par indicateur déclaré, codes connus de la
      // couche, cellules numériques ou signes déclarés (jamais un zéro mis pour une absence).
      expect(t.fichier).toMatch(/^donnees\/[a-z0-9-]+\.csv$/);
      const tab = readFileSync(join(DOSSIER, t.fichier));
      expect(createHash("sha256").update(tab).digest("hex")).toBe(t.empreinte);
      const [entete, ...lignes] = tab.toString("utf8").split("\n").filter((l) => l.length);
      const colonnes = entete!.split(",");
      expect(colonnes[0]).toBe("code");
      expect(colonnes.slice(1).sort()).toEqual((fiche.indicateurs ?? []).map((i) => i.propriete).sort());
      const codes = new Set(codesCouche);
      const signes = new Set(Object.keys(t.signes ?? {}));
      const fautes: string[] = [];
      for (const l of lignes) {
        const c = l.split(",");
        if (c.length !== colonnes.length || !codes.has(c[0]!)) fautes.push(c[0]!);
        for (const x of c.slice(1)) if (!(x === "" || /^-?\d+(\.\d+)?$/.test(x) || signes.has(x))) fautes.push(`${c[0]} : ${x}`);
      }
      expect(fautes).toEqual([]);
    }, 30_000);
  }

  it("extraits OpenStreetMap sans couche propre (D-GD-18) : fiche consignée, empreinte vérifiée, aucune fiche importable", () => {
    const extraits = JSON.parse(readFileSync(join(DOSSIER, "donnees", "osm-extraits.json"), "utf8")) as Record<string, FicheSource>;
    expect(Object.keys(extraits).sort()).toEqual(["osm-mar-arrondissements", "osm-mar-communes", "osm-mar-villes"]);
    for (const [cle, f] of Object.entries(extraits)) {
      expect(f.cle).toBe(cle);
      expect(fiches).not.toContain(`${cle}.json`);
      expect(createHash("sha256").update(readFileSync(join(DOSSIER, f.version.fichier ?? ""))).digest("hex")).toBe(f.version.empreinte);
    }
  });

  it("priorité HCP (D-GD-18) : une ville rattachée au HCP n'a plus la population d'OpenStreetMap", () => {
    const villes = JSON.parse(readFileSync(join(DOSSIER, "donnees", "hcp-rgph2024-villes.geojson"), "utf8")) as { features: { properties: Record<string, unknown> }[] };
    const rattachees = villes.features.filter((f) => f.properties["code_hcp"]);
    expect(rattachees.length).toBeGreaterThan(200);
    for (const f of rattachees) {
      expect(f.properties["population"]).toBeUndefined();
      expect(f.properties["source_population"]).toBe("HCP, RGPH 2024");
    }
    for (const f of villes.features.filter((x) => !x.properties["code_hcp"] && x.properties["population"] !== undefined)) {
      expect(f.properties["source_population"]).toBe("OpenStreetMap (aucune donnée HCP rattachée)");
    }
  });

  it("douars en annexe (lot E) : empreinte de la fiche, colonnes attendues, code rangé sous sa commune, aucun zéro mis pour « X »", () => {
    const fiche = JSON.parse(readFileSync(join(DOSSIER, "hcp-rgph2024-population-communes.json"), "utf8")) as FicheSource;
    const a = fiche.version.annexes?.douars;
    expect(a).toBeTruthy();
    const octets = readFileSync(join(DOSSIER, a!.fichier));
    expect(createHash("sha256").update(octets).digest("hex")).toBe(a!.empreinte);
    const [entete, ...lignes] = octets.toString("utf8").split("\n").filter((l) => l.length);
    expect(entete!.split("\t")).toEqual(["code", "commune", "fraction", "nom", "type", "menages", "population", "masculin", "feminin", "moins_15", "de_15_a_59", "plus_60"]);
    expect(lignes.length).toBeGreaterThan(30_000);
    const fautes: string[] = [];
    for (const l of lignes) {
      const [code, commune, , , type, ...nombres] = l.split("\t");
      // Code du douar : province + cercle + commune (7 chiffres) = fin du code de sa commune du RGPH.
      if (!/^\d{13}$/.test(code!) || !commune!.endsWith(code!.slice(0, 7)) || !["groupé", "éclaté", "dispersé"].includes(type!)) fautes.push(code!);
      for (const x of nombres) if (!(x === "" || x === "X" || /^-?\d+(\.\d+)?$/.test(x))) fautes.push(`${code} : ${x}`);
    }
    expect(fautes.slice(0, 5)).toEqual([]);
  }, 30_000);

  it("services publics du MTNRA (D-GD-42) : une couche par région du RGPH, chaque ligne de la source une seule fois, rattachement déclaré", () => {
    const mtnra = fiches.filter((f) => f.startsWith("mtnra-services-publics-2022-"));
    expect(mtnra).toHaveLength(12);
    const lignes: number[] = [];
    for (const nom of mtnra) {
      const fiche = JSON.parse(readFileSync(join(DOSSIER, nom), "utf8")) as FicheSource;
      expect(fiche.theme).toBe("equipements");
      expect(fiche.version.licence).toContain("ODbL");
      expect(fiche.description).toContain("7d1a4d308bd89089e18fff9639a2ab90e976d7efd1bfa13c1a28524c64a6f920");
      const fc = JSON.parse(readFileSync(join(DOSSIER, fiche.version.fichier!), "utf8")) as { features: { properties: Record<string, unknown>; geometry: { type: string } }[] };
      for (const f of fc.features) {
        expect(f.geometry.type).toBe("Point");
        expect(f.properties["code"]).toBe(`l${String(f.properties["ligne"]).padStart(5, "0")}`);
        expect(["contour", "province-hcp", "province-source"]).toContain(f.properties["rattachement"]);
        lignes.push(f.properties["ligne"] as number);
      }
    }
    // 17 499 lignes de données dans la source, dont 22 sans point lisible (écartées et listées dans les fiches).
    expect(lignes.length).toBe(17_477);
    expect(new Set(lignes).size).toBe(lignes.length);
  });

  it("import automatique (D-GD-23) : l'empreinte attendue lue dans la fiche est celle de la version importée (fichier, tableau, douars)", () => {
    const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");
    for (const nom of fiches) {
      const fiche = JSON.parse(readFileSync(join(DOSSIER, nom), "utf8")) as FicheSource;
      if (!fiche.version.fichier) continue;
      const ef = sha(readFileSync(join(DOSSIER, fiche.version.fichier)));
      const t = fiche.version.tableau;
      const a = fiche.version.annexes;
      const annexes = [a?.douars, a?.concepts, a?.tableau].filter((x) => !!x).map((x) => `:${sha(readFileSync(join(DOSSIER, x!.fichier)))}`).join("");
      const reelle = t ? sha(`${ef}:${sha(readFileSync(join(DOSSIER, t.fichier)))}${annexes}`) : ef;
      expect(empreinteAttendue(fiche), nom).toBe(reelle);
    }
  }, 60_000);

  it("Royaume du Maroc (D-GD-37) : ligne nationale HCP, valeurs de contrôle, totaux CEE calculés, concepts, tableau de bord valide", () => {
    const fiche = JSON.parse(readFileSync(join(DOSSIER, "hcp-rgph2024-royaume.json"), "utf8")) as FicheSource & { indicateurs: (FicheSource["indicateurs"] extends (infer T)[] | undefined ? T : never)[] };
    const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    const [entete, ligne] = readFileSync(join(DOSSIER, fiche.version.tableau!.fichier), "utf8").trim().split("\n");
    const cellules = new Map(entete!.split(",").map((c, i) => [c, ligne!.split(",")[i]!]));
    expect(cellules.get("code")).toBe("MA");
    const zone: IndicateurZone[] = fiche.indicateurs.map((i) => {
      const brut = cellules.get(i.propriete) ?? "";
      const valeur = /^-?\d+(\.\d+)?$/.test(brut) ? Number(brut) : null;
      return { titre: i.titre, unite: i.unite, nature: (i as { calcul?: string }).calcul ? "calcule" : "source", theme: i.theme ?? null, famille: i.famille ?? null, modalite: i.modalite ?? null, milieu: i.milieu ?? null, sexe: i.sexe ?? null, valeur, motifAbsence: valeur === null ? "non-publiee" : null };
    });
    const v = (famille: string, milieu: "ensemble" | "urbain" | "rural" = "ensemble") => evaluer({ indicateur: { famille, milieu } }, zone).valeur;
    // Valeurs de contrôle de la demande (HCP, RGPH 2024).
    expect(v("Population légale")).toBe(36828330);
    expect(v("Ménages")).toBe(9275038);
    expect(v("Population municipale")).toBe(36490591);
    expect(v("Population municipale", "urbain")).toBe(22921202);
    expect(v("Population municipale", "rural")).toBe(13569389);
    expect(v("Taux de chômage (%)")).toBe(21.3);
    // Tableau de bord : définition valide ; toute famille désignée existe dans la fiche nationale (aucune valeur écrite).
    const t = JSON.parse(readFileSync(join(DOSSIER, fiche.version.annexes!.tableau!.fichier), "utf8"));
    expect(sha(readFileSync(join(DOSSIER, fiche.version.annexes!.tableau!.fichier)))).toBe(fiche.version.annexes!.tableau!.empreinte);
    const d = validerDefinitionTableauDeBord(t);
    if (!d.ok) throw new Error(d.erreurs.join(" ; "));
    const selecteurs = (e: Expression): { famille: string }[] => ("indicateur" in e ? [e.indicateur] : "somme" in e ? [...e.somme] : "ratio" in e ? [...selecteurs(e.ratio[0]), ...selecteurs(e.ratio[1])] : []);
    const absents = d.definition.blocs.flatMap((b) => (b.type === "chiffre" ? [b.valeur] : b.lignes.flatMap((l) => l.cellules))).flatMap(selecteurs).filter((s) => !trouverIndicateur(s, zone));
    expect(absents).toEqual([]);
    const taux = d.definition.blocs.find((b) => b.cle === "taux-urbanisation");
    expect(taux?.type === "chiffre" && Math.round(evaluer(taux.valeur, zone).valeur! * 10) / 10).toBe(62.8);
    // Totaux CEE : calculés, déclarés comme tels.
    const cee = fiche.indicateurs.filter((i) => i.propriete.startsWith("cee_"));
    expect(cee.length).toBeGreaterThan(5);
    for (const i of cee) expect((i as { calcul?: string }).calcul).toMatch(/Somme des valeurs des 12 régions/);
    // Concepts : empreinte, français, titres uniques non vides.
    const c = lireConcepts(JSON.parse(readFileSync(join(DOSSIER, fiche.version.annexes!.concepts!.fichier), "utf8")));
    expect(c.source).toMatch(/HCP, RGPH 2024/);
    expect(c.liste.length).toBeGreaterThan(40);
    expect(new Set(c.liste.map((x) => x.titre)).size).toBe(c.liste.length);
    expect(c.liste.find((x) => x.titre === "Population légale")?.texte).toMatch(/territoire national/);
  });

  it("retraits déclarés (D-GD-23) : sources sans fiche importable, remplaçante livrée, motif et décision", () => {
    const retraits = JSON.parse(readFileSync(join(DOSSIER, "donnees", "retraits-sources.json"), "utf8")) as { cle: string; remplacePar: string; motif: string; decision: string }[];
    expect(retraits.map((r) => r.cle).sort()).toEqual(["geoboundaries-mar-adm1", "geoboundaries-mar-adm2", "osm-mar-communes", "osm-mar-villes"]);
    for (const r of retraits) {
      expect(fiches).not.toContain(`${r.cle}.json`);
      expect(fiches).toContain(`${r.remplacePar}.json`);
      expect(r.motif.trim().length).toBeGreaterThanOrEqual(3);
      expect(r.decision).toMatch(/^D-GD-\d+$/);
    }
  });

  it("chaque thème déclaré par une fiche livrée a sa catégorie initiale", () => {
    const themes = new Set(CATEGORIES_CATALOGUE.flatMap((c) => c.themes));
    for (const nom of fiches) expect(themes.has((JSON.parse(readFileSync(join(DOSSIER, nom), "utf8")) as FicheSource).theme)).toBe(true);
  });
  it("découpage territorial (lot H) : régions, provinces, communes et arrondissements du HCP déclarent le Maroc, rangs 1 à 4", () => {
    const decl = (nom: string) => JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), "utf8")).territoire;
    const rangs = ["hcp-rgph2024-population-regions", "hcp-rgph2024-population-provinces", "hcp-rgph2024-population-communes", "hcp-rgph2024-arrondissements"].map((n) => {
      const v = validerDeclarationTerritoire(decl(n));
      expect(v.ok, n).toBe(true);
      return v.ok ? [v.declaration.pays, v.declaration.rang, v.declaration.parent] : null;
    });
    expect(rangs).toEqual([["MA", 1, "codes-hcp"], ["MA", 2, "codes-hcp"], ["MA", 3, "codes-hcp"], ["MA", 4, "codes-hcp"]]);
  });
});
