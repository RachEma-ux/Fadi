/**
 * D.2-04 — la spécification versionnée du redémarrage du worker exact (`docs/studio/SPEC-REDEMARRAGE-NOYAU-EXACT.md`)
 * reste reliée au code et aux tests : chaque clause S1…S6 cite au moins un test, chaque test cité existe avec son libellé
 * exact, chaque constante citée a la valeur du code. Une spécification qui dérive du code fait échouer ce contrôle.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as studio from "./client-exact";

const RACINE = fileURLToPath(new URL("../../../../../../", import.meta.url));
const SPEC = "docs/studio/SPEC-REDEMARRAGE-NOYAU-EXACT.md";

interface Clause { id: string; tests: { fichier: string; libelle: string }[]; constantes: { nom: string; valeur: number; fichier: string }[] }

/** Lecture des clauses : « ## Sn — … », lignes « - Test : `fichier` — « libellé » » et « - Constante : `NOM` = valeur (`fichier`) ». */
export function lireSpecification(texte: string): { identifiant: string | null; clauses: Clause[] } {
  const clauses: Clause[] = [];
  let c: Clause | null = null;
  for (const ligne of texte.split("\n")) {
    const t = /^## (S\d+) — /.exec(ligne);
    if (t) { c = { id: t[1]!, tests: [], constantes: [] }; clauses.push(c); continue; }
    if (/^## /.test(ligne)) { c = null; continue; }
    if (!c) continue;
    const test = /^- Test : `([^`]+)` — « (.+) »$/.exec(ligne);
    if (test) c.tests.push({ fichier: test[1]!, libelle: test[2]! });
    const k = /^- Constante : `(\w+)` = (\d+) \(`([^`]+)`\)/.exec(ligne);
    if (k) c.constantes.push({ nom: k[1]!, valeur: Number(k[2]), fichier: k[3]! });
  }
  return { identifiant: /`(studio-spec-redemarrage-noyau-exact\/\d+)`/.exec(texte)?.[1] ?? null, clauses };
}

/**
 * Valeur d'une constante numérique exportée, relue dans le source (`export const NOM = 120_000;`) : Studio n'importe pas
 * l'Atelier (frontière ADR-STUDIO-NAV-01), le client de l'Atelier est donc lu comme texte.
 */
export function constanteDuSource(source: string, nom: string): number | null {
  const m = new RegExp(`^export const ${nom} = ([\\d_]+);`, "m").exec(source);
  return m ? Number(m[1]!.replace(/_/g, "")) : null;
}

/** Problèmes de la spécification face au dépôt (vide = reliée). */
export function controlerSpecification(texte: string, lire: (f: string) => string | null): string[] {
  const { identifiant, clauses } = lireSpecification(texte);
  const out: string[] = [];
  if (!identifiant) out.push("identifiant versionné absent");
  const ids = clauses.map((c) => c.id);
  for (const attendu of ["S1", "S2", "S3", "S4", "S5", "S6"]) if (!ids.includes(attendu)) out.push(`clause ${attendu} absente`);
  for (const c of clauses) {
    if (!c.tests.length) out.push(`${c.id} : aucun test cité`);
    for (const t of c.tests) {
      const contenu = lire(t.fichier);
      if (contenu === null) out.push(`${c.id} : fichier absent ${t.fichier}`);
      else if (!contenu.includes(t.libelle)) out.push(`${c.id} : libellé absent de ${t.fichier} : ${t.libelle}`);
    }
    for (const k of c.constantes) {
      const source = lire(k.fichier);
      const v = source === null ? null : constanteDuSource(source, k.nom);
      if (v !== k.valeur) out.push(`${c.id} : ${k.nom} vaut ${String(v)} dans ${k.fichier}, la spécification dit ${k.valeur}`);
    }
  }
  return out;
}

const lireDepot = (f: string) => (existsSync(join(RACINE, f)) ? readFileSync(join(RACINE, f), "utf8") : null);
const texte = readFileSync(join(RACINE, SPEC), "utf8");

describe("D.2-04 — spécification du redémarrage du worker exact, reliée aux tests", () => {
  it("D.2-04 [+] chaque clause S1 à S6 cite des tests existants avec leur libellé exact ; chaque constante citée a la valeur du code", () => {
    expect(controlerSpecification(texte, lireDepot)).toEqual([]);
    const { clauses } = lireSpecification(texte);
    expect(clauses.flatMap((c) => c.tests).length).toBeGreaterThanOrEqual(20);
    expect(clauses.flatMap((c) => c.constantes).map((k) => k.nom).sort()).toEqual(["DELAI_CHARGEMENT_EXACT_MS", "DELAI_CHARGEMENT_MS", "DELAI_OPERATION_EXACT_MS", "DELAI_OPERATION_MS", "ECHECS_MAX"]);
  });

  it("D.2-04 [−] une spécification qui dérive du code est refusée : libellé modifié, test retiré d'une clause, constante changée, clause absente", () => {
    const libelle = "aucune relance silencieuse : la demande suivante est refusée (indisponible) ; relancer crée un nouveau Worker qui calcule";
    expect(controlerSpecification(texte.replace(libelle, `${libelle} automatiquement`), lireDepot).join()).toMatch(/S3 : libellé absent/);
    expect(controlerSpecification(texte.replace("`ECHECS_MAX` = 3", "`ECHECS_MAX` = 5"), lireDepot).join()).toMatch(/ECHECS_MAX vaut 3/);
    const sansS6 = texte.replace(/## S6 — [\s\S]*?(?=\n## Limites)/, "");
    expect(controlerSpecification(sansS6, lireDepot)).toContain("clause S6 absente");
    const s6SansTest = texte.replace(/(## S6 — [\s\S]*?)\n- Test : [^\n]+/, "$1");
    expect(controlerSpecification(s6SansTest, lireDepot)).toContain("S6 : aucun test cité");
    expect(controlerSpecification(texte.replace("`apps/web/e2e/studio-exact.mjs`", "`apps/web/e2e/studio-exact-absent.mjs`"), lireDepot).join()).toMatch(/fichier absent/);
  });

  it("D.2-04 : la politique écrite est celle du code — Studio sans reprise automatique, Atelier borné à trois échecs consécutifs", () => {
    expect(texte).toContain("Relance **explicite** seulement");
    expect(constanteDuSource(readFileSync(join(RACINE, "apps/web/src/modules/atelier/nouveau/exact/moteur-exact.ts"), "utf8"), "ECHECS_MAX")).toBe(3);
    expect(constanteDuSource(readFileSync(join(RACINE, "apps/web/src/modules/studio/exact/client-exact.ts"), "utf8"), "DELAI_OPERATION_EXACT_MS")).toBe(studio.DELAI_OPERATION_EXACT_MS);
    const ordonnanceur = readFileSync(join(RACINE, "apps/web/src/modules/studio/exact/noyau-studio.ts"), "utf8");
    expect(ordonnanceur).toMatch(/concurrence: 1, reprisesMax: 0/);
    expect(studio.MESSAGES_NOYAU_EXACT.aRelancer).toBe("Noyau exact en échec : relancez-le avant un nouveau calcul.");
    expect(texte).toContain(`« ${studio.MESSAGES_NOYAU_EXACT.aRelancer} »`);
  });
});
