import { describe, expect, it } from "vitest";
/**
 * X.3-02 — chaque libellé de contrôle cité par une preuve du registre Studio (`controle`, `controles`, `libelle` d'une
 * preuve dont le `fichier` est un test ou une recette) est écrit dans ce fichier : littéral exact, gabarit de recette
 * admis, ou nom complet Vitest « bloc > test » dont chaque maillon est écrit (règle de `libelles-sources.ts`).
 *
 * Registre lu : `docs/workstreams/studio/task-register.json`, ou le fichier désigné par `STUDIO_REGISTRE_LIBELLES`
 * (chemin absolu ; sert à valider des corrections sur une copie avant de les appliquer au registre).
 * Pur : lecture de fichiers du dépôt, sans base ni réseau.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { libellesDuFichier, trouverLibelle } from "./libelles-sources.js";
import { libellesCites, verifierLibelles, type TacheRegistre } from "./registre-libelles.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const REGISTRE = process.env.STUDIO_REGISTRE_LIBELLES ?? `${RACINE}docs/workstreams/studio/task-register.json`;

describe("X.3-02 — règle de lecture des libellés", () => {
  const src = [
    `check("NAV-002 : aucune lecture de l'Atelier", true);`,
    `check('A.4 : aucun refus n\\'a créé de révision', true);`,
    "// check(\"commenté : jamais un libellé\")",
    "check(`MIG-07 : ${n} correspondances ancienne → nouvelle identité`, true);",
    "check(`${qui}`, true);",
    `describe("Bloc de cas", () => { it.each(cas)("%s", () => {}); it("cas nommé", () => {}); });`,
  ].join("\n");
  const l = libellesDuFichier("x.test.ts", src);
  it("littéral exact décodé ; apostrophe typographique ou commentaire jamais confondus", () => {
    expect(trouverLibelle(l, "NAV-002 : aucune lecture de l'Atelier")).toEqual({ mode: "exact" });
    expect(trouverLibelle(l, "A.4 : aucun refus n'a créé de révision")).toEqual({ mode: "exact" });
    expect(trouverLibelle(l, "NAV-002 : aucune lecture de l’Atelier")).toBeNull();
    expect(trouverLibelle(l, "NAV-002 : aucune lecture")).toBeNull();
    expect(l.exacts.has("commenté : jamais un libellé")).toBe(false);
  });
  it("gabarit : parties fixes dans l'ordre, chaque substitution non vide ; un gabarit sans partie fixe suffisante n'est pas admis", () => {
    expect(trouverLibelle(l, "MIG-07 : 12 correspondances ancienne → nouvelle identité")?.mode).toBe("gabarit");
    expect(trouverLibelle(l, "MIG-07 :  correspondances ancienne → nouvelle identité")).toBeNull();
    expect(trouverLibelle(l, "MIG-07 : 12 correspondances")).toBeNull();
    expect(trouverLibelle(l, "n'importe quoi")).toBeNull();
  });
  it("nom complet Vitest (bloc, puis test) : chaque maillon doit être écrit", () => {
    // Noms composés à l'exécution : écrits en un seul littéral, ils se trouveraient eux-mêmes dans ce fichier.
    const bloc = "X.3-02 — règle de lecture des libellés";
    const complet = [bloc, "nom complet Vitest (bloc, puis test) : chaque maillon doit être écrit"].join(" > ");
    const absent = [bloc, ["maillon", "jamais", "écrit"].join(" ")].join(" > ");
    const taches: TacheRegistre[] = [{ id: "T", preuves: [{ type: "test_automatise", fichier: "apps/api/src/testing/registre-libelles.test.ts", controles: [complet, absent] }] }];
    expect(verifierLibelles(taches, RACINE).map((v) => v.resultat)).toEqual(["exact", "introuvable"]);
  });
  it("seules les preuves de test ou de recette sont lues ; un fichier absent est signalé", () => {
    const taches: TacheRegistre[] = [{ id: "T", preuves: [
      { type: "document", fichier: "docs/x.md", controle: "ignoré" },
      { type: "test_automatise", fichier: "apps/api/src/testing/absent.test.ts", controle: "x" },
    ] }];
    expect(libellesCites(taches)).toHaveLength(1);
    expect(verifierLibelles(taches, RACINE)[0]?.resultat).toBe("fichier-absent");
  });
});

describe("X.3-02 — libellés cités par le registre Studio", () => {
  const taches = (JSON.parse(readFileSync(REGISTRE, "utf8")) as { tasks: TacheRegistre[] }).tasks;
  const verifies = verifierLibelles(taches, RACINE);
  it("le registre cite des libellés de tests et de recettes", () => {
    expect(verifies.length).toBeGreaterThan(1000);
  });
  it("chaque libellé cité est écrit dans son fichier (exact, gabarit admis ou nom complet Vitest)", () => {
    const manquants = verifies.filter((v) => v.resultat === "introuvable" || v.resultat === "fichier-absent")
      .map((v) => `${v.id} preuves[${v.index_preuve}] ${v.fichier} (${v.resultat}) : ${v.libelle}`);
    expect(manquants).toEqual([]);
  });
});
