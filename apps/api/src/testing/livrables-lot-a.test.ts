/**
 * REC-A-01 — livrable du lot A (`docs/studio/LIVRABLES-LOT-A.md`), calculé et contrôlé par ce test : schémas
 * versionnés, contrats versionnés, API et adaptateurs, éditeurs, journal des révisions et corpus de migration (P-12),
 * chacun avec ses preuves (fichier et libellé exact de test, vérifié présent mot pour mot). Le fichier publié doit être
 * exactement celui que ce test calcule (`STUDIO_LIVRABLES_ECRIRE=1` le régénère). Pur : lecture de fichiers seulement.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STUDIO_CONTRACT } from "@parcours/atelier-model";
import { STUDIO_DOMAINES_DERIVES, STUDIO_ETATS_DERIVES, STUDIO_MIGRATIONS_DOCUMENT, STUDIO_SCHEMA_DOCUMENT_V1, STUDIO_SCHEMA_DOCUMENT_V2 } from "@parcours/atelier-model/studio-cmd";
import { rapportCorpusMigration, type SourcesCorpusMigration } from "@parcours/atelier-model/studio-cmd-corpus";
import * as C from "../lib/studio-contrats-routes.js";
import type { StudioContratRoute } from "../lib/studio-contrats.js";

const RACINE = new URL("../../../../", import.meta.url);
const FICHIER = new URL("docs/studio/LIVRABLES-LOT-A.md", RACINE);
type Preuve = [fichier: string, libelle: string];
interface Section { titre: string; lignes: string[]; preuves: Preuve[] }

const contrats = (Object.values(C) as StudioContratRoute[]).filter((c) => c && typeof c === "object" && typeof c.id === "string").sort((a, b) => a.id.localeCompare(b.id));
const routes = contrats.flatMap((c) => c.routes);

/** Lecture des sources du corpus de migration (fichiers JSON de `src/studio/`, exemple P.118). */
function lireSourcesCorpus(): SourcesCorpusMigration {
  const racine = new URL("../../../../packages/atelier-model/src/studio/", import.meta.url);
  const fichiersJson: { chemin: string; contenu: string }[] = [];
  const parcourir = (dir: URL, rel: string) => {
    for (const nom of readdirSync(dir).sort()) {
      const u = new URL(nom, dir);
      if (statSync(u).isDirectory()) { if (nom !== "node_modules") parcourir(new URL(`${nom}/`, dir), `${rel}${nom}/`); continue; }
      if (nom.endsWith(".json")) fichiersJson.push({ chemin: `src/studio/${rel}${nom}`, contenu: readFileSync(u, "utf8") });
    }
  };
  parcourir(racine, "");
  return { fichiersJson, exempleP118: JSON.parse(readFileSync(new URL("../data/examples/p118-native-model.json", import.meta.url), "utf8")) };
}

function sections(): Section[] {
  const corpus = rapportCorpusMigration(lireSourcesCorpus());
  return [
    {
      titre: "Schémas versionnés",
      lignes: [
        `- \`${STUDIO_SCHEMA_DOCUMENT_V1}\` : document persistant de chaque révision (validateur \`validateStudioDocument\`, contrainte \`studio_revisions.document\` de \`init.sql\`).`,
        `- \`${STUDIO_SCHEMA_DOCUMENT_V2}\` : version suivante déclarée (\`packages/atelier-model/src/studio/cmd/migration-document.ts\`), contenu /1 plus données conservées (\`conserves\`) ; migrations déclarées : ${STUDIO_MIGRATIONS_DOCUMENT.map((m) => `${m.de} → ${m.vers}`).join(", ")}.`,
        "- `studio-effets/1` : événement d'effets d'une commande acceptée (EX-010) ; domaines dérivés : " + STUDIO_DOMAINES_DERIVES.map((d) => `\`${d}\``).join(", ") + ".",
        "- États des contenus dérivés (EX-016) : " + STUDIO_ETATS_DERIVES.map((d) => `\`${d}\``).join(", ") + ".",
        "- `studio-essai/1` (essai à portée de révision), `studio-simulation-migration/1` (rapport de migration), `studio-contexte-etude/1` (contrat d'étude, IF-001).",
        "- Brouillon hors ligne : version 1, contrat des enveloppes enregistré avec la file (EX-049).",
      ],
      preuves: [
        ["packages/atelier-model/src/studio/cmd/migration.test.ts", "EX-019 : la migration déclarée documente transformation, inverse, récupération et cas impossible"],
        ["packages/atelier-model/src/studio/cmd/cmd.test.ts", "EX-010 [+] : créer, modifier, supprimer — identifiants, relations, domaines dérivés, révision et origine cohérents"],
        ["packages/atelier-model/src/studio/cmd/cmd.test.ts", "EX-016 [−] : ancienne image R12 présentée « à jour R13 » après échec — l'oracle rejette ce statut"],
        ["apps/web/src/modules/studio/hors-ligne/reprise.test.ts", "EX-049 [−] : file d'un contrat incompatible jamais rejouée ; une enveloppe rejetée ne disparaît pas sans état explicite"],
      ],
    },
    {
      titre: "Contrats versionnés",
      lignes: [
        `- Enveloppe de commandes \`${STUDIO_CONTRACT}\` (contrat de l'orchestrateur commun).`,
        `- ${contrats.length} contrats de route \`studio-api-<nom>/<n>\` (\`apps/api/src/lib/studio-contrats-routes.ts\`, en-tête \`X-Studio-Contrat\`), catalogue \`docs/studio/CONTRATS-API.md\`.`,
      ],
      preuves: [
        ["apps/api/src/routes/studio-contrats.test.ts", "chaque contrat déclaré a au moins un cas ; chaque route qu'il sert a son cas"],
        ["apps/api/src/routes/studio-contrats.test.ts", "studio-api-journal-revisions/1 — GET …/journal : réponse conforme, en-tête X-Studio-Contrat"],
      ],
    },
    {
      titre: "API et adaptateurs",
      lignes: [
        `- ${routes.length} routes Studio sous \`/projects/:projectId/studio\`, chacune sous contrat ; matrice des droits \`docs/ai-team/reports/claude-v9-x2/PERMISSIONS.md\`.`,
        "- Essais et jobs serveur (EX-045, EX-088), contrat d'étude (IF-001), migrations de schéma (EX-091), bascule Atelier → Studio à chemin d'écriture unique (MIG-COEX-06).",
        "- Adaptateurs d'échange : exports SVG, DXF, IFC ; imports DXF, IFC (matrice d'échanges `packages/atelier-model/src/studio/echanges/matrice-echanges.ts`).",
      ],
      preuves: [
        ["apps/api/src/routes/studio-permissions.test.ts", "chaque route déclarée par les routeurs Studio figure dans la matrice, et réciproquement"],
        ["apps/api/src/routes/studio-cmd.test.ts", "EX-045 [+] : prévisualisation sur R1 sans mutation permanente, puis confirmation sur base valide (journal relié au job)"],
        ["apps/api/src/routes/studio-cmd.test.ts", "MIG-COEX-06 : préparée, l'étude n'écrit pas ; basculée, elle écrit ; retour arrière, elle n'écrit plus — lecture toujours ouverte"],
        ["apps/web/e2e/studio-cmd.mjs", "MIG-COEX-06 : basculé — l'Atelier refuse toute écriture (chemin_ecriture) mais reste consultable ; Studio écrit ; point de retour figé"],
      ],
    },
    {
      titre: "Éditeurs",
      lignes: [
        "- Planche 2D et vue 3D d'une même variante : la vue 3D affiche sa révision source serveur, son état dérivé et les données périmées (EX-051, INV-006) ; même révision dans les deux planches (INV-002).",
        "- Trace horodatée d'un geste : intention → commande → mutation canonique → scène invalidée (EX-008).",
      ],
      preuves: [
        ["apps/web/src/modules/studio/vue3d/etat-projection.test.ts", "EX-051 [+] : après la commande R13, la scène affiche sa révision source et les données périmées, puis se recalcule"],
        ["apps/web/e2e/studio-cmd.mjs", "INV-002 : même révision serveur affichée par la planche 2D (barre d'état) et par la vue 3D"],
        ["apps/web/e2e/studio-cmd.mjs", "EX-008 : un seul geste horodaté — intention → commande → mutation canonique → scène invalidée, dans cet ordre"],
      ],
    },
    {
      titre: "Journal",
      lignes: [
        "- `studio_revision_events` : un événement par révision engagée, écrit dans la même transaction (eventId, transaction applicative et PostgreSQL, auteur, étude, variante, révisions de base et d'issue, effets, horodatage du serveur, job éventuel) ; notification temps réel après l'engagement seulement (IF-011).",
      ],
      preuves: [
        ["apps/api/src/routes/studio-cmd.test.ts", "IF-011 [+] : après engagement durable, l'événement garde eventId, transaction, auteur, étude, variante, base, issue, effets, horodatage serveur"],
        ["apps/api/src/routes/studio-cmd.test.ts", "IF-011 [−] : transaction échouée — aucun événement, aucune révision, aucune notification ; la notification suit l'engagement"],
      ],
    },
    {
      titre: "Corpus de migration (P-12)",
      lignes: [
        `- ${corpus.documents} documents \`${STUDIO_SCHEMA_DOCUMENT_V1}\` du dépôt : ${Object.entries(corpus.parFamille).sort(([a], [b]) => a.localeCompare(b)).map(([f, n]) => `${f} ${n}`).join(", ")}.`,
        `- Migrés vers \`${STUDIO_SCHEMA_DOCUMENT_V2}\` : ${corpus.migres} ; refusés explicitement (source rendue intacte) : ${corpus.refusesExplicitement} ; aller-retour exact : ${corpus.allerRetourExacts}.`,
        `- Avec données inconnues ajoutées : ${corpus.documentsAvecInconnues} documents, ${corpus.donneesConservees} données conservées, ${corpus.donneesRapportees} rapportées au retour arrière, ${corpus.recuperationsExactes} récupérations exactes.`,
      ],
      preuves: [
        ["packages/atelier-model/src/studio/cmd/migration.test.ts", "REC-A-01 : tout le corpus studio-document/1 du dépôt migré vers /2, aller-retour exact, données inconnues conservées et rapportées"],
        ["packages/atelier-model/src/studio/cmd/migration.test.ts", "EX-091 [+] : simulation compare identifiants, propriétés, cotes, associations, historique et accès avant / après — sans perte"],
      ],
    },
  ];
}

function markdown(ss: Section[]): string {
  const out = [
    "# Livrables du lot A — Studio",
    "",
    "> Fichier calculé par `apps/api/src/testing/livrables-lot-a.test.ts` (REC-A-01) ; ne pas l'éditer à la main.",
    "> `STUDIO_LIVRABLES_ECRIRE=1` le régénère. Chaque preuve est un libellé de test présent mot pour mot dans son fichier.",
    "",
  ];
  for (const s of ss) {
    out.push(`## ${s.titre}`, "", ...s.lignes, "", "Preuves :", "", ...s.preuves.map(([f, l]) => `- \`${f}\` — « ${l} »`), "");
  }
  return out.join("\n");
}

describe("REC-A-01 — livrable du lot A", () => {
  const ss = sections();
  it("REC-A-01 : chaque preuve citée par le livrable est un libellé présent mot pour mot dans son fichier", () => {
    const absentes = ss.flatMap((s) => s.preuves).filter(([f, l]) => !readFileSync(new URL(f, RACINE), "utf8").includes(l));
    expect(absentes).toEqual([]);
  });
  it("REC-A-01 : docs/studio/LIVRABLES-LOT-A.md est celui que ce test calcule (schémas, contrats, API, éditeurs, journal, corpus de migration)", () => {
    const md = markdown(ss);
    if (process.env["STUDIO_LIVRABLES_ECRIRE"] === "1") writeFileSync(FICHIER, md);
    expect(readFileSync(FICHIER, "utf8")).toBe(md);
  });
});
