/**
 * ARC-03 (ADR-STUDIO-PILOTE-01, P-12) : `StudioShell` obtient l'authentification et la résolution du projet par la façade
 * publique de Studio (`facade-contexte.ts`), sans dépendance à `ProjectShell`. Décision pure de la façade, puis contrôle
 * de frontière sur les sources réelles (complété par la règle `modules/studio/StudioShell` de `scripts/frontieres.json`,
 * jouée par `npm run typecheck`).
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApiError, type Project } from "../../../lib/api";
import { estRefusStudio, relancerSaufRefus, resoudreProjetStudio } from "./facade-contexte";

const ICI = dirname(fileURLToPath(import.meta.url));
const STUDIO = resolve(ICI, "..");
const RACINE = resolve(ICI, "../../../../../..");
const projet = (extra: Partial<Project> = {}) => ({ id: "p1", code: "P.1", name: "Projet", ...extra }) as Project;
const futur = new Date(Date.now() + 3_600_000).toISOString();

/** Imports (spécificateurs) d'un fichier TypeScript. */
const imports = (texte: string) => [...texte.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)].map((m) => m[1]!);
/** Dépendances interdites à l'enveloppe Studio pour l'authentification et le projet. */
export function ecartsEnveloppe(texte: string): string[] {
  const out = imports(texte).filter((s) => /routes\/ProjectShell|lib\/auth-context|lib\/access|modules\/parcours|modules\/atelier/.test(s));
  if (/\bapi\.getProject\s*\(/.test(texte)) out.push("api.getProject");
  if (/queryKey:\s*\[\s*["']project["']/.test(texte)) out.push('queryKey ["project"]');
  if (/\buseAuth\s*\(/.test(texte)) out.push("useAuth");
  return out;
}

describe("ARC-03 — façade publique d'authentification et de résolution du projet pour StudioShell", () => {
  it("ARC-03 [+] la façade résout le projet tel que le serveur le décrit : rôle, lecture seule, réservation d'édition", () => {
    expect(resoudreProjetStudio({ isPending: true }, "u1")).toEqual({ etat: "chargement", projet: null });
    expect(resoudreProjetStudio({ data: projet({ role: "editeur" }), isPending: false }, "u1"))
      .toEqual({ etat: "pret", projet: { id: "p1", code: "P.1", name: "Projet", role: "editeur", lecteur: false, ecriture: true, verrou: null } });
    expect(resoudreProjetStudio({ data: projet({ role: "lecteur" }), isPending: false }, "u1").projet).toMatchObject({ lecteur: true, ecriture: false });
    const verrou = { userId: "u2", email: "b@example.com", expiresAt: futur } as Project["editingLock"];
    expect(resoudreProjetStudio({ data: projet({ role: "proprietaire", editingLock: verrou }), isPending: false }, "u1").projet).toMatchObject({ ecriture: false, verrou });
    expect(resoudreProjetStudio({ data: projet({ role: "proprietaire", editingLock: verrou }), isPending: false }, "u2").projet).toMatchObject({ ecriture: true });
    const expire = { userId: "u2", email: "b@example.com", expiresAt: new Date(Date.now() - 1000).toISOString() } as Project["editingLock"];
    expect(resoudreProjetStudio({ data: projet({ role: "editeur", editingLock: expire }), isPending: false }, "u1").projet).toMatchObject({ ecriture: true, verrou: null });
  });

  it("ARC-03 [−] un refus (401, 403, 404) ne divulgue rien et prime sur un projet encore en cache ; une panne reste « indisponible »", () => {
    for (const status of [401, 403, 404]) {
      const e = new ApiError(status, "refus");
      expect(resoudreProjetStudio({ data: projet({ role: "proprietaire" }), error: e, isPending: false }, "u1")).toEqual({ etat: "refuse", projet: null });
      expect(estRefusStudio(e)).toBe(true);
      expect(relancerSaufRefus(0, e)).toBe(false);
    }
    const panne = new ApiError(503, "panne");
    expect(resoudreProjetStudio({ error: panne, isPending: false }, "u1")).toEqual({ etat: "indisponible", projet: null });
    expect(relancerSaufRefus(0, panne)).toBe(true);
    expect(relancerSaufRefus(1, panne)).toBe(false);
  });

  it("ARC-03 [+] frontière : StudioShell passe par la façade seule, et la façade ne dépend ni de ProjectShell, ni du Parcours, ni de l'Atelier", () => {
    const shell = readFileSync(join(STUDIO, "StudioShell.tsx"), "utf8");
    expect(ecartsEnveloppe(shell)).toEqual([]);
    expect(imports(shell)).toContain("./contexte/facade-contexte");
    const facade = readFileSync(join(ICI, "facade-contexte.ts"), "utf8");
    expect(imports(facade).filter((s) => /ProjectShell|modules\/parcours|modules\/atelier|use-immersive/.test(s))).toEqual([]);
    const frontieres = JSON.parse(readFileSync(join(RACINE, "scripts/frontieres.json"), "utf8")) as { web: { regles: { de: string; interdits: string[] }[] } };
    expect(frontieres.web.regles.find((r) => r.de === "modules/studio/StudioShell")?.interdits).toEqual(expect.arrayContaining(["routes/ProjectShell", "lib/auth-context", "lib/access"]));
  });

  it("ARC-03 [−] garde construite : un retour de StudioShell à ProjectShell, à useAuth ou à une lecture directe du projet est détecté", () => {
    expect(ecartsEnveloppe('import { ProjectShell } from "../../routes/ProjectShell";')).toEqual(["../../routes/ProjectShell"]);
    expect(ecartsEnveloppe('import { useAuth } from "../../lib/auth-context";\nconst { user } = useAuth();')).toEqual(["../../lib/auth-context", "useAuth"]);
    expect(ecartsEnveloppe('const q = useQuery({ queryKey: ["project", id], queryFn: () => api.getProject(id) });')).toEqual(["api.getProject", 'queryKey ["project"]']);
    expect(ecartsEnveloppe('import { useProjectAccess } from "../../lib/access";')).toEqual(["../../lib/access"]);
  });
});
