import { describe, expect, it } from "vitest";
/**
 * G1-03 — « une source de vérité et un contrat vérifiable existent pour chaque fonction du lot à engager » (lots du
 * pilote A, B, C, D, E, I, R, X, F hors DEC-15), revue **fonction par fonction** et établie à partir du code
 * (`revue-g1.ts`) : chaque outil du registre Studio (`STUDIO_TOOLS`, manifeste `studio-tool-manifest/1`), chaque route
 * déclarée par `apps/api/src/routes/studio*.ts`, chaque format **livré** de la matrice d'échanges.
 *
 * - Inventaire complet : 1 fonction par outil du registre, par route déclarée (recoupée avec la matrice des droits
 *   X.2-02), par entrée livrée de la matrice d'échanges ; les formats non livrés sont nommés hors revue.
 * - Chaque libellé de test retenu est écrit dans son fichier (règle de `registre-libelles.ts`) ; chaque champ cité est
 *   un champ du document `studio-document/1` ; chaque table citée est créée par `db/init.sql`.
 * - Écarts : les manques calculés sont **exactement** la liste `ECARTS` ci-dessous (aucun écart fantôme, aucun caché) ;
 *   une fonction livrée sans source, sans contrat ou sans test qui n'y figure pas fait échouer la revue.
 * - Rapport `docs/workstreams/studio/REVUE-G1-03.md` : généré par ce test (`STUDIO_REVUE_G1_ECRIRE=1` le réécrit),
 *   comparé à l'octet près sinon.
 * Pur : lecture de fichiers du dépôt, sans base ni réseau.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STUDIO_MATRICE_ECHANGES, STUDIO_TOOLS } from "@parcours/atelier-model";
import { RevueG1, CHAMPS_DOCUMENT, type Fonction, type Manque } from "./revue-g1.js";
import { verifierLibelles } from "./registre-libelles.js";

const RACINE = fileURLToPath(new URL("../../../../", import.meta.url));
const RAPPORT = "docs/workstreams/studio/REVUE-G1-03.md";

/**
 * Écarts réels connus, relevés par la revue et vérifiés à la main dans le dépôt (25 octobre 2026). Une entrée par
 * manque ; la revue échoue si le calcul en trouve un de plus ou un de moins. `justifie` : manque admis par nature de la
 * fonction (raison donnée), publié à part des écarts à lever. Réserve G1 (P-11) levée : les 48 routes et le relevé de
 * performances sans contrat versionné en ont reçu un (`lib/studio-contrats-routes.ts`, `studio-releve-perf/1`) ; aucun
 * écart « contrat non versionné » n'est plus admis — une route ou un format nouveau sans version fait échouer la revue.
 */
const ECARTS: readonly { manque: Manque; raison: string; ids: readonly string[]; justifie?: true }[] = [
  {
    manque: "source",
    justifie: true,
    raison: "Sans source de modèle, justifié : le relevé de performances (`ReleveurPerf`, appelé nulle part ailleurs que dans son module) ne lit qu'une horloge et les mesures du navigateur (PERF-01 à PERF-10) ; c'est un diagnostic d'exploitation, pas une donnée de conception — aucun champ du document ni aucune table n'en est, ni n'a à en être, la source.",
    ids: ["diagnostic-releve-perf"],
  },
];

const revue = new RevueG1(RACINE);
const fonctions = revue.toutes();
const cle = (id: string, m: Manque) => `${id} — ${m}`;

describe("G1-03 — revue fonction par fonction : inventaire", () => {
  it("une fonction par outil du registre, par route Studio déclarée (recoupée avec la matrice des droits X.2-02), par format livré", () => {
    const outils = fonctions.filter((f) => f.categorie === "outil").map((f) => f.id);
    expect(outils).toEqual(STUDIO_TOOLS.map((t) => t.toolId));
    const routes = new Set(fonctions.filter((f) => f.categorie === "route").map((f) => f.id));
    const permissions = readFileSync(`${RACINE}docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`, "utf8");
    expect(routes).toEqual(new Set([...permissions.matchAll(/^\| `([A-Z]+ [^`]+)` \|/gm)].map((m) => m[1]!)));
    expect(routes.size).toBe(fonctions.filter((f) => f.categorie === "route").length);
    expect(fonctions.filter((f) => f.categorie === "format").map((f) => f.id)).toEqual(STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut === "livre").map((e) => e.id));
  });
});

describe("G1-03 — revue fonction par fonction : preuves relues", () => {
  it("chaque libellé de test retenu est écrit dans son fichier (exact, gabarit admis ou nom complet Vitest)", () => {
    const avecTest = fonctions.filter((f) => f.test);
    const verifies = verifierLibelles([{ id: "G1-03", preuves: avecTest.map((f) => ({ type: "test_automatise", fichier: f.test!.fichier, controle: f.test!.libelle })) }], RACINE);
    expect(verifies.filter((v) => v.resultat === "introuvable" || v.resultat === "fichier-absent").map((v) => `${v.fichier} : ${v.libelle}`)).toEqual([]);
  });
  it("chaque champ cité est un champ du document studio-document/1 ; chaque table citée est créée par db/init.sql", () => {
    const init = readFileSync(`${RACINE}apps/api/src/db/init.sql`, "utf8").toLowerCase();
    const pbs: string[] = [];
    for (const f of fonctions) {
      for (const s of f.source) {
        for (const m of s.matchAll(/StudioDocument\.(\w+)/g)) if (!CHAMPS_DOCUMENT.has(m[1]!)) pbs.push(`${f.id} : champ inconnu ${m[1]}`);
        for (const m of s.matchAll(/\b(studio_\w+)\b/g)) if (!new RegExp(`create table (if not exists )?(public\\.)?${m[1]}\\b`).test(init)) pbs.push(`${f.id} : table absente d'init.sql ${m[1]}`);
      }
    }
    expect(pbs).toEqual([]);
  });
});

describe("G1-03 — revue fonction par fonction : écarts", () => {
  it("les manques calculés sont exactement les écarts connus : aucun écart fantôme, aucun écart caché", () => {
    const calcules = fonctions.flatMap((f) => f.manques.map((m) => cle(f.id, m))).sort();
    const declares = ECARTS.flatMap((e) => e.ids.map((id) => cle(id, e.manque))).sort();
    expect(new Set(declares).size).toBe(declares.length);
    expect(calcules).toEqual(declares);
  });
  it("aucune fonction livrée sans source, sans contrat ou sans test hors des écarts connus", () => {
    const connus = new Set(ECARTS.flatMap((e) => e.ids.map((id) => cle(id, e.manque))));
    const caches = fonctions.filter((f) => f.manques.some((m) => !connus.has(cle(f.id, m))));
    expect(caches.map((f) => f.id)).toEqual([]);
    // Aucune fonction sans test du tout : le manque « test » n'est admis pour aucune.
    expect(fonctions.filter((f) => !f.test).map((f) => f.id)).toEqual([]);
  });
});

describe("G1-03 — rapport publié", () => {
  it("docs/workstreams/studio/REVUE-G1-03.md est celui que ce test calcule (régénéré, comparé à l'octet près)", () => {
    const md = rapport(fonctions);
    if (process.env["STUDIO_REVUE_G1_ECRIRE"] === "1") writeFileSync(`${RACINE}${RAPPORT}`, md);
    expect(readFileSync(`${RACINE}${RAPPORT}`, "utf8")).toBe(md);
  });
});

// --- Rapport ----------------------------------------------------------------------------------------------------------

const cellule = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const TITRES: Record<Fonction["categorie"], string> = { outil: "Outils du registre Studio", route: "Routes de l'API Studio", format: "Formats d'échange livrés" };
const LIBELLE_MANQUE: Record<Manque, string> = {
  source: "source de vérité non établie", contrat: "contrat non vérifiable", "contrat-non-versionne": "contrat non versionné",
  test: "aucun test", "test-fonctionnel": "aucun test fonctionnel (matrice des droits seulement)",
};

function rapport(fs: readonly Fonction[]): string {
  const n = (c: Fonction["categorie"]) => fs.filter((f) => f.categorie === c).length;
  const nonLivres = STUDIO_MATRICE_ECHANGES.entrees.filter((e) => e.statut !== "livre");
  const avecEcart = new Set(fs.filter((f) => f.manques.length).map((f) => f.id));
  const lignes = [
    "# Revue G1-03 — source de vérité, contrat et test, fonction par fonction",
    "",
    "Fichier **généré et vérifié** par `apps/api/src/testing/revue-g1.test.ts` (ne pas éditer à la main : le test échoue si",
    "ce fichier diffère de la revue qu'il calcule ; `STUDIO_REVUE_G1_ECRIRE=1` le régénère). Chaque ligne est établie à partir",
    "du code du dépôt par lecture statique (analyseur de TypeScript, `apps/api/src/testing/revue-g1-analyse.ts`) ; aucune",
    "valeur n'est saisie à la main, hormis la liste des écarts connus, que le test compare au calcul dans les deux sens.",
    "",
    "Périmètre : lot du pilote (A, B, C, D, E, I, R, X, F hors DEC-15 ; P-05), fonctions **réellement livrées** :",
    `${n("outil")} outils du registre \`STUDIO_TOOLS\`, ${n("route")} routes déclarées par \`apps/api/src/routes/studio*.ts\` (sous`,
    `\`/projects/:projectId/studio\`), ${n("format")} formats livrés de la matrice d'échanges (\`${STUDIO_MATRICE_ECHANGES.schema}\`, révision`,
    `${STUDIO_MATRICE_ECHANGES.revision}). ${nonLivres.length} formats non livrés de la matrice sont hors revue : ${nonLivres.map((e) => `\`${e.id}\``).join(", ")}.`,
    "",
    "Méthode, par colonne :",
    "",
    "- **Source de vérité** — outil : champs du document `studio-document/1` écrits par le gestionnaire de la commande",
    "  (`composition/commandes.ts`, de proche en proche ; sur-approximation : une branche jamais prise compte), lus pour",
    "  l'outil de lecture ; le document est persisté par révision (`studio_revisions`, route `POST …/commands`). Route :",
    "  tables `studio_*` écrites par le gestionnaire (lues pour un `GET`), à travers `lib/` et le modèle. Format : champs du",
    "  document lus dans le fichier du code cité par la matrice, tables atteintes, commandes produites (import) et entrées",
    "  typées par une donnée du dépôt ; si ce code ne lit que des octets ou une horloge, ses appelants du dépôt (déclaration",
    "  qui l'appelle, champs du document qu'elle lit, entrées typées).",
    "- **Contrat** — outil : version de contrat, schéma de paramètres, sortie, codes de refus et entrée du manifeste",
    "  `studio-tool-manifest/1`. Route : besoin de droit de la matrice X.2-02 (`docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md`,",
    "  épinglée par son test), schémas zod d'entrée atteints, identifiants de contrats versionnés atteints. Format : version",
    "  du format déclarée par la matrice, révision de la matrice, contrats versionnés atteints par son code.",
    "- **Test** — un contrôle qui exerce la fonction, fichier et libellé exact (relu dans le fichier par la règle des",
    "  libellés du registre, X.3-02) : pour un outil, une commande appliquée (`toolId: \"…\"`) de préférence ; pour une route,",
    "  un appel dont l'adresse résolue (constantes du fichier substituées) ne désigne qu'elle, sinon les preuves de test",
    "  que la matrice d'échanges associe à sa route, sinon la matrice des droits (écart « test fonctionnel ») ; pour un",
    "  format, la preuve de test citée par la matrice. Un test Vitest est préféré à une recette ; nom complet « bloc > test ».",
    "",
    "## Synthèse",
    "",
    "| Catégorie | Fonctions revues | Source établie | Contrat vérifiable | Contrat versionné | Test qui l'exerce | Fonctions avec écart |",
    "|---|---|---|---|---|---|---|",
    ...(["outil", "route", "format"] as const).map((c) => {
      const x = fs.filter((f) => f.categorie === c);
      const sans = (m: Manque) => x.filter((f) => !f.manques.includes(m)).length;
      return `| ${TITRES[c]} | ${x.length} | ${sans("source")} | ${sans("contrat")} | ${x.filter((f) => !f.manques.includes("contrat") && !f.manques.includes("contrat-non-versionne")).length} | ${x.filter((f) => !f.manques.includes("test") && !f.manques.includes("test-fonctionnel")).length} | ${x.filter((f) => avecEcart.has(f.id)).length} |`;
    }),
    "",
    "## Écarts connus",
    "",
    "Liste **exacte** (le test échoue sur un écart de plus ou de moins) ; la revue constate, elle ne corrige rien.",
    "",
    ...(ECARTS.some((e) => !e.justifie) ? [] : ["Aucun écart à lever : toute fonction livrée a une source, un contrat versionné et un test (les manques justifiés suivent).", ""]),
    ...ECARTS.filter((e) => !e.justifie).flatMap((e) => [`### ${LIBELLE_MANQUE[e.manque]} (${e.ids.length})`, "", e.raison, "", ...e.ids.map((id) => `- \`${id}\``), ""]),
    "## Manques justifiés",
    "",
    "Manques admis par la nature de la fonction, avec leur raison (comptés dans la liste exacte ci-dessus par le test).",
    "",
    ...ECARTS.filter((e) => e.justifie).flatMap((e) => [`### ${LIBELLE_MANQUE[e.manque]} — justifié (${e.ids.length})`, "", e.raison, "", ...e.ids.map((id) => `- \`${id}\``), ""]),
  ];
  for (const c of ["outil", "route", "format"] as const) {
    lignes.push(`## ${TITRES[c]} (${n(c)})`, "", "| Fonction | Groupe | Source de vérité | Contrat | Test (fichier — libellé) | Écart |", "|---|---|---|---|---|---|");
    for (const f of fs.filter((x) => x.categorie === c)) {
      lignes.push(`| \`${f.id}\` | ${f.groupe} | ${cellule(f.source.join(" ; ") || "—")} | ${cellule(f.contrat.join(" ; "))} | ${f.test ? `\`${f.test.fichier}\` — « ${cellule(f.test.libelle)} »` : "—"} | ${f.manques.map((m) => LIBELLE_MANQUE[m]).join(" ; ") || "—"} |`);
    }
    lignes.push("");
  }
  return `${lignes.join("\n").trimEnd()}\n`;
}
