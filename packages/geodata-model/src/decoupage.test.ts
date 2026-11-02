import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ancetresDe, bilanDecoupage, descendDe, lireCsv, lireCsvLignes, lireEntites, lireNiveaux, sansParent, validerDecoupage, type EntiteAdministrative } from "./decoupage.js";
import { niveauxDuPoint } from "./selection-clics.js";

// Données livrées (fichiers qualifiés, chargés en base par la commande d'import) : lues ici seulement comme contrôle.
const DOSSIER = fileURLToPath(new URL("../../../docs/geodata/sources/decoupage/", import.meta.url));
const texte = (f: string) => readFileSync(join(DOSSIER, f), "utf8");
const niveaux = lireNiveaux(texte("ma-niveaux.csv"));
const brut = lireCsv(texte("hcp-rgph2024-entites.csv"));
const entites = lireEntites(texte("hcp-rgph2024-entites.csv"));
const parents = new Map(entites.map((e) => [e.code, e.parent]));
const parCode = new Map(entites.map((e) => [e.code, e]));
const population = new Map(brut.map((l) => [l["code"]!, Number(l["population"])]));
const rang = new Map(niveaux.map((n) => [n.code, n.rang]));
const duNiveau = (code: string) => entites.filter((e) => e.niveau === code);
const chaine = (code: string) => [code, ...ancetresDe(code, parents)];

describe("découpage : lecture et contrôles purs", () => {
  it("CSV : guillemets, virgules et guillemets doublés dans un champ", () => {
    expect(lireCsv('a,b\n"x, y","il dit ""oui"""\n\n1,2\r\n')).toEqual([{ a: "x, y", b: 'il dit "oui"' }, { a: "1", b: "2" }]);
  });
  it("CSV : numéro de ligne physique du fichier (en-tête, lignes vides, champ sur deux lignes, CRLF, BOM)", () => {
    const l = lireCsvLignes('﻿\na,b\r\n1,2\r\n\r\n"x\ny",3\n\n4,5');
    expect(l.map((e) => [e.ligneFichier, e.valeurs["a"]])).toEqual([[3, "1"], [5, "x\ny"], [8, "4"]]);
  });
  it("incohérences refusées : niveau inconnu, parent absent, parent pas plus global, doublon", () => {
    const n = lireNiveaux("pays,code,rang,singulier,pluriel\nZZ,haut,1,Haut,Hauts\nZZ,bas,2,Bas,Bas\n");
    const e = (code: string, niveau: string, parent: string | null): EntiteAdministrative => ({ pays: "ZZ", code, niveau, parent, nom: code, nomAr: null, type: null });
    expect(validerDecoupage(n, [e("1", "haut", null), e("11", "bas", "1")])).toEqual([]);
    expect(validerDecoupage(n, [e("1", "haut", null), e("11", "milieu", "1")]).join()).toMatch(/niveau « milieu »/);
    expect(validerDecoupage(n, [e("11", "bas", "9")]).join()).toMatch(/parent 9 absent/);
    expect(validerDecoupage(n, [e("1", "bas", null), e("11", "haut", "1")]).join()).toMatch(/pas plus global/);
    expect(validerDecoupage(n, [e("1", "haut", null), e("1", "haut", null)]).join()).toMatch(/en double/);
    expect(sansParent(n, [e("1", "haut", null), e("11", "bas", null)])).toEqual(["11"]);
  });
  it("bilan d'un nouvel import : ajoutées, modifiées, retirées, par code (aucun doublon)", () => {
    const n = lireNiveaux("pays,code,rang,singulier,pluriel\nZZ,haut,1,Haut,Hauts\nZZ,bas,2,Bas,Bas\n");
    const a: EntiteAdministrative = { pays: "ZZ", code: "1", niveau: "haut", parent: null, nom: "Un", nomAr: null, type: null };
    const b: EntiteAdministrative = { ...a, code: "11", niveau: "bas", parent: "1", nom: "Onze" };
    expect(bilanDecoupage([a, b], [a, b], n)).toEqual({ ajoutees: [], modifiees: [], retirees: [], sansParent: [] });
    expect(bilanDecoupage([a, b], [{ ...a, nom: "Un bis" }, { ...b, code: "12" }], n)).toEqual({ ajoutees: ["12"], modifiees: ["1"], retirees: ["11"], sansParent: [] });
  });
});

describe("découpage HCP RGPH 2024 livré (contrôle, D-GD-42)", () => {
  it("découpage cohérent : aucune incohérence, aucune entité sans parent hors des régions", () => {
    expect(validerDecoupage(niveaux, entites)).toEqual([]);
    expect(sansParent(niveaux, entites)).toEqual([]);
  });
  it("totaux inchangés : 12 régions, 75 provinces et préfectures", () => {
    expect(duNiveau("region")).toHaveLength(12);
    expect(duNiveau("province")).toHaveLength(75);
  });
  it("chaque parent a pour population la somme de celles de ses enfants (dont chaque commune à arrondissements)", () => {
    const sommes = new Map<string, number>();
    for (const e of entites) if (e.parent) sommes.set(e.parent, (sommes.get(e.parent) ?? 0) + population.get(e.code)!);
    for (const [p, s] of sommes) expect(s, p).toBe(population.get(p));
    const villes = new Set(duNiveau("arrondissement").flatMap((a) => chaine(a.code).filter((c) => parCode.get(c)!.niveau === "commune")));
    for (const v of villes) {
      const arr = duNiveau("arrondissement").filter((a) => descendDe(a.code, v, parents));
      expect(arr.reduce((s, a) => s + population.get(a.code)!, 0), v).toBe(population.get(v));
    }
  });
  it("Casablanca : 8 préfectures d'arrondissements, 16 arrondissements, regroupés comme la liste de contrôle", () => {
    const casa = duNiveau("commune").find((c) => /^Commune de Casablanca$/.test(c.nom))!;
    const prefs = entites.filter((e) => e.parent === casa.code);
    expect(prefs.every((p) => p.niveau === "prefecture-arrondissements")).toBe(true);
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]+/g, " ").trim();
    const groupes = new Map(prefs.map((p) => [norm(p.nom), entites.filter((a) => a.parent === p.code).map((a) => norm(a.nom)).sort()]));
    const attendu: [string, string[]][] = [
      ["sidi bernoussi", ["sidi bernoussi", "sidi moumen"]],
      ["casablanca anfa", ["anfa", "maarif", "sidi belyout"]],
      ["ain sebaa hay mohammadi", ["ain sebaa", "asoukhour assawda", "hay mohammadi"]], // « Asoukhour Assawda » = Roches Noires
      ["hay hassani", ["hay hassani"]],
      ["ain chock", ["ain chock"]],
      ["al fida mers sultan", ["al fida", "mers sultan"]],
      ["ben m sick", ["ben m sick", "sbata"]],
      ["moulay rachid", ["moulay rachid", "sidi othmane"]],
    ];
    expect(prefs).toHaveLength(8);
    expect(entites.filter((a) => a.niveau === "arrondissement" && descendDe(a.code, casa.code, parents))).toHaveLength(16);
    for (const [pref, arr] of attendu) {
      const cle = [...groupes.keys()].find((k) => k.endsWith(pref))!;
      expect(cle, pref).toBeTruthy();
      expect(groupes.get(cle)!.map((a) => a.replace(/^arrondissement (d |de |du )?/, "")), pref).toEqual(arr.sort());
    }
  });
  it("sélection par clics : 5 niveaux à Casablanca, 4 dans les autres communes à arrondissements, 3 ailleurs", () => {
    const rangs = (code: string) => chaine(code).map((c) => rang.get(parCode.get(c)!.niveau)!);
    const arr = (ville: string) => duNiveau("arrondissement").find((a) => descendDe(a.code, duNiveau("commune").find((c) => c.nom === `Commune de ${ville}`)!.code, parents))!;
    expect(niveauxDuPoint(rangs(arr("Casablanca").code), [])).toHaveLength(5);
    expect(niveauxDuPoint(rangs(arr("Tanger").code), [])).toHaveLength(4);
    expect(niveauxDuPoint(rangs(arr("Rabat").code), [])).toHaveLength(4);
    expect(niveauxDuPoint(rangs(arr("Marrakech").code), [])).toHaveLength(4);
    const ordinaire = duNiveau("commune").find((c) => c.nom === "Commune d'Assilah")!;
    expect(niveauxDuPoint(rangs(ordinaire.code), [])).toHaveLength(3);
    // Couches chargées : seuls leurs niveaux (communes et régions → 2 clics à Casablanca comme ailleurs).
    expect(niveauxDuPoint(rangs(arr("Casablanca").code), [rang.get("commune")!, rang.get("region")!])).toHaveLength(2);
  });
});

describe("aucune liste de territoires ni de niveaux dans le code (D-GD-29, D-GD-42)", () => {
  // Noms propres du découpage et codes de niveau : ils ne doivent apparaître que dans les données et les tests.
  const interdits = [/Casablanca/, /Sidi Bernoussi/, /Ben M'?sick/i, /Moulay Rachid/, /Hay Hassani/, /Marrakech/, /Tanger/, /["']prefecture-arrondissements["']/, /["']arrondissement["']/];
  const racines = ["../../../packages/geodata-model/src", "../../../apps/api/src/lib/geodata", "../../../apps/api/src/routes/geodata", "../../../apps/web/src/modules/geodata"];
  const fichiers = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []; });
  it("ni villes, ni arrondissements, ni préfectures d'arrondissements, ni codes de niveau dans le code GeoData", () => {
    const trouves: string[] = [];
    for (const r of racines) for (const f of fichiers(fileURLToPath(new URL(`${r}/`, import.meta.url)))) {
      const t = readFileSync(f, "utf8");
      for (const i of interdits) if (i.test(t)) trouves.push(`${f.split("/").slice(-3).join("/")} : ${i}`);
    }
    expect(trouves).toEqual([]);
  });
});
