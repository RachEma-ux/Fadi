/**
 * A.5-01 — garde d'architecture côté serveur (lecture statique du code, aucune base) : le document d'une variante
 * Studio ne s'écrit que par le contrat de commandes. Une révision n'est insérée que par `lib/studio-commands.ts`
 * (enveloppes de commandes, initialisation et dérivation de variantes) — ou réinsérée telle quelle par la restauration
 * signée d'un projet (`lib/studio-archive.ts`) ; aucune révision n'est modifiée ni supprimée ; seule l'orchestration
 * des commandes avance la tête ; une seule route appelle `submitStudioCommands`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("..", import.meta.url));
function sources(dossier: string): { chemin: string; texte: string }[] {
  const out: { chemin: string; texte: string }[] = [];
  for (const nom of readdirSync(dossier)) {
    const p = join(dossier, nom);
    if (statSync(p).isDirectory()) out.push(...sources(p));
    else if (nom.endsWith(".ts") && !nom.endsWith(".test.ts")) out.push({ chemin: relative(SRC, p).replaceAll("\\", "/"), texte: readFileSync(p, "utf8") });
  }
  return out;
}
const API = sources(SRC);
const fichiersAvec = (motif: RegExp) => API.filter((f) => motif.test(f.texte)).map((f) => f.chemin).sort();

describe("A.5-01 — écritures du document Studio par le seul contrat de commandes", () => {
  it("révisions insérées seulement par l'orchestration des commandes (et la restauration signée, telle quelle)", () => {
    expect(fichiersAvec(/insert\(studioRevisions\)/)).toEqual(["lib/studio-commands.ts"]);
    expect(fichiersAvec(/INSERT INTO[^;]*\$\{table\(t\)\}/)).toEqual(["lib/studio-archive.ts"]);
  });
  it("aucune révision modifiée ni supprimée (append-only) ; le déclencheur de la base reste en place", () => {
    expect(fichiersAvec(/(?:update|delete)\(studioRevisions\)/)).toEqual([]);
    expect(fichiersAvec(/UPDATE\s+studio_revisions|DELETE\s+FROM\s+studio_revisions/i)).toEqual([]);
    const init = readFileSync(join(SRC, "db/init.sql"), "utf8");
    expect(init).toMatch(/studio_revisions_no_update/);
  });
  it("seule l'orchestration des commandes avance la tête d'une variante", () => {
    const avancees = API.flatMap((f) => [...f.texte.matchAll(/update\(studioVariants\)\.set\(\{([^}]*)\}/g)].map((m) => ({ chemin: f.chemin, champs: m[1]! })));
    expect(avancees.filter((a) => a.champs.includes("headRevisionId")).map((a) => a.chemin)).toEqual(["lib/studio-commands.ts"]);
  });
  it("une seule route, POST …/commands, soumet des enveloppes ; elle passe par l'orchestrateur commun", () => {
    const appels = API.flatMap((f) => [...f.texte.matchAll(/submitStudioCommands\(/g)].map(() => f.chemin)).filter((c) => c.startsWith("routes/"));
    expect(appels).toEqual(["routes/studio.ts"]);
    const route = API.find((f) => f.chemin === "routes/studio.ts")!.texte;
    expect(route).toMatch(/studioRouter\.post\("\/studies\/:studyId\/variants\/:variantId\/commands", endpoint\(async \(req, res\) => \{\s*res\.json\(await submitStudioCommands\(scope\(req\), req\.user!\.id, req\.body\)\)/);
    const lib = API.find((f) => f.chemin === "lib/studio-commands.ts")!.texte;
    expect(lib).toMatch(/orchestrerCommandesDansTransaction<[^>]*>\(tx, \{ kind: "studio"/);
    // L'identité vient de la session (`req.user`), jamais du corps de la requête.
    expect(route).not.toMatch(/req\.body\.(?:authorId|actorId|userId)/);
  });
});
