import { describe, expect, it } from "vitest";
/**
 * Réserve G1 (ADR-STUDIO-PILOTE-01 P-11) — inventaire statique des contrats versionnés de l'API Studio et document
 * `docs/studio/CONTRATS-API.md` (généré par ce test, comparé à l'octet près ; `STUDIO_CONTRATS_ECRIRE=1` le réécrit).
 *
 * - Chaque contrat de `lib/studio-contrats-routes.ts` a un identifiant `studio-api-<nom>/<n>` unique ; ensemble, les
 *   contrats servent **exactement** les routes déclarées par `routes/studio*.ts` (recoupées avec la matrice des droits
 *   X.2-02), chacune par un seul contrat.
 * - Chaque déclaration de route porte `avecContrat(CONTRAT_…)` et ce contrat sert bien cette route : une nouvelle route
 *   Studio sans contrat versionné fait échouer ce test (et la revue G1-03, qui n'admet plus aucun écart de contrat).
 * - L'identifiant versionné est atteint par la route dans la lecture statique de la revue G1-03.
 * - Chaque schéma zod nommé dans l'entrée d'un contrat est bien un schéma atteint par sa route.
 * - Chaque contrat a son cas dans le test de contrat de bout en bout (`routes/studio-contrats.test.ts`).
 * Pur : lecture de fichiers du dépôt, sans base ni réseau.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import type { z } from "zod";
import { STUDIO_CONTRAT_ENTETE, STUDIO_CONTRAT_FORME, type StudioContratRoute } from "../lib/studio-contrats.js";
import * as CONTRATS from "../lib/studio-contrats-routes.js";
import { RevueG1 } from "./revue-g1.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const DOC = "docs/studio/CONTRATS-API.md";
const contrats = Object.entries(CONTRATS) as [string, StudioContratRoute][];
const revue = new RevueG1(RACINE);
const inventaire = revue.inventaireRoutes();
const routesRevue = new Map(revue.routes().map((f) => [f.id, f]));
/** Schémas zod d'entrée atteints par la route, relevés par la revue G1-03. */
const zodDe = (route: string): string[] => {
  const e = routesRevue.get(route)?.contrat.find((x) => x.startsWith("entrée : "));
  return !e || /aucun schéma/.test(e) ? [] : e.slice("entrée : ".length).split(", ");
};

describe("Contrats versionnés des routes Studio — inventaire statique (réserve G1, P-11)", () => {
  it("identifiants studio-api-<nom>/<n> uniques ; les contrats servent exactement les routes Studio déclarées, chacune une fois", () => {
    const ids = contrats.map(([, c]) => c.id);
    expect(ids.filter((id) => !STUDIO_CONTRAT_FORME.test(id))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
    const servies = contrats.flatMap(([, c]) => c.routes);
    expect(new Set(servies).size).toBe(servies.length);
    const declarees = [...new Set(inventaire.map((r) => r.route))];
    expect([...servies].sort()).toEqual([...declarees].sort());
    const permissions = readFileSync(`${RACINE}docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`, "utf8");
    expect(new Set(servies)).toEqual(new Set([...permissions.matchAll(/^\| `([A-Z]+ [^`]+)` \|/gm)].map((m) => m[1]!)));
  });

  it("chaque déclaration de route porte avecContrat(CONTRAT_…) et ce contrat sert cette route : une route sans contrat versionné échoue", () => {
    const parNom = new Map(contrats);
    const ecarts: string[] = [];
    for (const r of inventaire) {
      const poses = r.noeud.arguments.filter((a): a is ts.CallExpression => ts.isCallExpression(a) && ts.isIdentifier(a.expression) && a.expression.text === "avecContrat");
      if (poses.length !== 1) { ecarts.push(`${r.route} (${r.fichier}) : ${poses.length} avecContrat(…)`); continue; }
      const arg = poses[0]!.arguments[0];
      const c = arg && ts.isIdentifier(arg) ? parNom.get(arg.text) : undefined;
      if (!c) ecarts.push(`${r.route} : avecContrat(${arg?.getText() ?? ""}) ne nomme pas un contrat de lib/studio-contrats-routes.ts`);
      else if (!c.routes.includes(r.route)) ecarts.push(`${r.route} : ${c.id} ne sert pas cette route`);
    }
    expect(ecarts).toEqual([]);
  });

  it("la revue G1-03 lit l'identifiant versionné de son contrat sur chaque route", () => {
    const ecarts = contrats.flatMap(([, c]) => c.routes.filter((r) => !(routesRevue.get(r)?.contrat ?? []).some((x) => x.startsWith("versions : ") && x.split(/[ ,]+/).includes(c.id))).map((r) => `${r} : ${c.id} non atteint`));
    expect(ecarts).toEqual([]);
  });

  it("chaque schéma zod nommé dans l'entrée d'un contrat est un schéma d'entrée atteint par sa route", () => {
    const ecarts: string[] = [];
    for (const [, c] of contrats) {
      for (const nom of [...c.entree.matchAll(/`(\w+Schema)`/g)].map((m) => m[1]!)) {
        for (const r of c.routes) if (!zodDe(r).includes(nom)) ecarts.push(`${c.id} : ${nom} non atteint par ${r} (${zodDe(r).join(", ") || "aucun"})`);
      }
    }
    expect(ecarts).toEqual([]);
  });

  it("chaque contrat a son cas dans le test de contrat de bout en bout (routes/studio-contrats.test.ts)", () => {
    const source = readFileSync(`${RACINE}apps/api/src/routes/studio-contrats.test.ts`, "utf8");
    expect(contrats.filter(([nom]) => !new RegExp(`contrat: C\\.${nom}\\b`).test(source)).map(([nom]) => nom)).toEqual([]);
  });

  it("docs/studio/CONTRATS-API.md est celui que ce test calcule (régénéré, comparé à l'octet près)", () => {
    const md = documentContrats();
    if (process.env["STUDIO_CONTRATS_ECRIRE"] === "1") { mkdirSync(`${RACINE}docs/studio`, { recursive: true }); writeFileSync(`${RACINE}${DOC}`, md); }
    expect(readFileSync(`${RACINE}${DOC}`, "utf8")).toBe(md);
  });
});

// --- Document -----------------------------------------------------------------------------------------------------------

const cellule = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
/** Champs de premier niveau d'un schéma objet (`?` : facultatif). */
function champs(s: z.ZodType | null): string {
  const forme = (s as unknown as { shape?: Record<string, z.ZodType> } | null)?.shape;
  if (!forme) return s ? "objet (champs non énumérés)" : "—";
  return Object.entries(forme).map(([k, v]) => `\`${k}${v.safeParse(undefined).success ? "?" : ""}\``).join(", ");
}

function documentContrats(): string {
  const groupes = new Map<string, [string, StudioContratRoute][]>();
  for (const e of contrats) {
    const fichier = inventaire.find((r) => r.route === e[1].routes[0])?.fichier ?? "?";
    groupes.set(fichier, [...(groupes.get(fichier) ?? []), e]);
  }
  const lignes = [
    "# Contrats versionnés de l'API Studio",
    "",
    "Fichier **généré et vérifié** par `apps/api/src/testing/studio-contrats.test.ts` (ne pas éditer à la main : le test",
    "échoue si ce fichier diffère des contrats déclarés ; `STUDIO_CONTRATS_ECRIRE=1` le régénère). Source :",
    "`apps/api/src/lib/studio-contrats-routes.ts` (un contrat par constante) et `apps/api/src/lib/studio-contrats.ts`",
    "(mécanisme). Réserve G1 de l'ADR-STUDIO-PILOTE-01 (P-11) : chaque route de l'API Studio a un contrat versionné.",
    "",
    `${contrats.length} contrats servent les ${contrats.reduce((n, [, c]) => n + c.routes.length, 0)} routes déclarées par \`apps/api/src/routes/studio*.ts\` (sous \`/projects/:projectId/studio\`).`,
    "",
    "## Règles",
    "",
    `- **Identifiant** : \`studio-api-<nom>/<version>\`, un par contrat ; il couvre l'entrée (adresse, requête, corps validé par`,
    "  le schéma zod de la route) et la réponse (statuts de succès, nature du corps, schéma zod de la réponse JSON).",
    `- **Exposition** : en-tête \`${STUDIO_CONTRAT_ENTETE}\` sur toute réponse de la route, succès comme refus (même convention`,
    "  que `X-Studio-Revision` et `X-Studio-Package`) ; le corps n'est pas modifié, le client web existant est inchangé.",
    `- **Version demandée** : un client peut envoyer \`${STUDIO_CONTRAT_ENTETE}: <identifiant>\` ; un identifiant autre que celui`,
    "  que la route sert est refusé avant tout accès : `400 { error: \"contrat_incompatible\", attendu, recu, message }`,",
    "  rien n'est lu ni écrit. Sans en-tête, la version courante est servie.",
    "- **Réponse** : schéma strict au premier niveau (un champ ajouté ou retiré fait échouer le test de contrat de la",
    "  route), typé en profondeur là où le client lit ; un document Studio est relu par le validateur de",
    "  `studio-document/1`. Un refus (4xx) porte au moins `{ error, message? }`.",
    "- **Évolution** : un champ facultatif ajouté, un statut de refus ou un paramètre facultatif nouveau gardent la version",
    "  (le schéma est mis à jour) ; retirer ou renommer un champ, en changer le type ou le sens, rendre obligatoire une",
    "  entrée facultative exigent une nouvelle version (`/2`), déclarée par un nouveau contrat.",
    "- **Nouvelle route Studio** : un contrat dans `lib/studio-contrats-routes.ts`, `avecContrat(CONTRAT_…)` sur la",
    "  déclaration (avant le gestionnaire), un cas dans `apps/api/src/routes/studio-contrats.test.ts`, puis ce document",
    "  régénéré. Sinon `testing/studio-contrats.test.ts` et la revue G1-03 (`testing/revue-g1.test.ts`) échouent.",
    "",
    "Contrôles : `apps/api/src/routes/studio-contrats.test.ts` (réponse conforme au schéma, statut, en-tête, refus d'une",
    "version incompatible sans écriture, inventaire à l'exécution) et `apps/api/src/testing/studio-contrats.test.ts`",
    "(inventaire statique, entrée, présent document).",
    "",
  ];
  for (const [fichier, liste] of groupes) {
    lignes.push(`## \`${fichier}\``, "", "| Contrat | Route(s) | Objet | Entrée | Schémas zod d'entrée atteints | Succès | Réponse |", "|---|---|---|---|---|---|---|");
    for (const [, c] of liste) {
      const zod = [...new Set(c.routes.flatMap(zodDe))].map((n) => `\`${n}\``).join(", ") || "—";
      const reponse = c.corps === "json" ? `JSON : ${champs(c.reponse)}` : c.corps === "fichier" ? `fichier (${c.typeFichier ?? "type déclaré par la réponse"})` : "aucun corps";
      lignes.push(`| \`${c.id}\` | ${c.routes.map((r) => `\`${r}\``).join("<br>")} | ${cellule(c.objet)} | ${cellule(c.entree)} | ${zod} | ${c.statuts.join(", ")} | ${cellule(reponse)} |`);
    }
    lignes.push("");
  }
  lignes.push(
    "## Format de diagnostic",
    "",
    "Le relevé de performances exporté par le Tool Manager (`studio-releve-perf.json`, entrée `diagnostic-releve-perf` de la",
    "matrice d'échanges) porte `schema: \"studio-releve-perf/1\"` ; `controlerRelevePerf`",
    "(`apps/web/src/modules/studio/chargement/perf.ts`) le relit et nomme chaque écart (test :",
    "`apps/web/src/modules/studio/chargement/perf.test.ts`).",
    "",
  );
  return lignes.join("\n");
}
