import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ACCESS_ROLE_MIRROR } from "./participations.js";
import { archivedShareRole, mergedShareRole, shareBusinessRole, shareExportFlag, shareExports, shareRoleFromRoles } from "./project-access.js";

const SRC = fileURLToPath(new URL("..", import.meta.url));
const initSql = readFileSync(join(SRC, "db/init.sql"), "utf8");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
  });
}

describe("lot OP-PONT — partage écrit dans les participations (règles pures)", () => {
  it("même rôle métier que l'ancien miroir : lecteur → Lecteur, editeur → Concepteur", () => {
    expect(shareBusinessRole("lecteur")).toBe("lecteur");
    expect(shareBusinessRole("editeur")).toBe("concepteur");
    expect(ACCESS_ROLE_MIRROR).toEqual({ proprietaire: null, editeur: "concepteur", lecteur: "lecteur" });
    expect(shareRoleFromRoles([])).toBeNull();
    expect(shareRoleFromRoles(["lecteur"])).toBe("lecteur");
    expect(shareRoleFromRoles(["lecteur", "concepteur"])).toBe("editeur");
  });

  it("export : un éditeur n'a pas d'export accordé (il exporte toujours) ; NULL d'archive = TRUE ; inchangé si absent", () => {
    expect(shareExportFlag("editeur", true)).toBe(false);
    expect(shareExportFlag("lecteur", null)).toBe(true);
    expect(shareExportFlag("lecteur", false)).toBe(false);
    expect(shareExportFlag("lecteur", undefined, true)).toBe(true);
    expect(shareExportFlag("lecteur", undefined)).toBe(false);
    expect(shareExports("editeur", false)).toBe(true);
    expect(shareExports("lecteur", false)).toBe(false);
    expect(shareExports("lecteur", null)).toBe(true);
  });

  it("invitation acceptée par un membre : le rôle le plus large est conservé ; archive : rôle reconnu seulement", () => {
    expect(mergedShareRole("editeur", "lecteur")).toBe("editeur");
    expect(mergedShareRole("lecteur", "editeur")).toBe("editeur");
    expect(mergedShareRole(null, "lecteur")).toBe("lecteur");
    expect(archivedShareRole("lecteur")).toBe("lecteur");
    expect(archivedShareRole("owner")).toBeNull();
    expect(archivedShareRole(undefined)).toBeNull();
  });

  it("plus aucune écriture applicative dans `project_members` (vue de compatibilité en lecture)", () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      if (file.includes(`${join("src", "test-helpers")}`)) continue;
      const text = readFileSync(file, "utf8");
      if (/\.(insert|update|delete)\(projectMembers\)/.test(text)) offenders.push(`${file} : écriture drizzle`);
      if (/(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(public\.)?project_members\b/i.test(text)) offenders.push(`${file} : écriture SQL`);
      if (/insertRows\([^)]*"project_members"/.test(text)) offenders.push(`${file} : restauration directe`);
    }
    expect(offenders).toEqual([]);
  });

  it("init.sql : pont retiré (fonction et déclencheurs supprimés), vue de compatibilité, droits D-7 en lecture seule", () => {
    expect(initSql).not.toMatch(/CREATE OR REPLACE FUNCTION op_sync_access/);
    expect(initSql).not.toMatch(/CREATE (OR REPLACE )?TRIGGER (project_members_op_mirror|projects_op_owner_mirror)/);
    expect(initSql).toContain("DROP FUNCTION IF EXISTS op_sync_access(text, text, date);");
    expect(initSql).toContain("DROP TRIGGER IF EXISTS projects_op_owner_mirror ON projects;");
    const view = initSql.slice(initSql.indexOf("CREATE OR REPLACE VIEW project_members AS"));
    expect(view.slice(0, view.indexOf(";"))).toMatch(/SELECT pp\.project_id, pe\.user_id,[\s\S]*AS role,[\s\S]*AS invited_by,[\s\S]*AS created_at,[\s\S]*pp\.can_export/);
    expect(view.slice(0, view.indexOf(";"))).toContain("pp.status <> 'terminee'");
    expect(view.slice(0, view.indexOf(";"))).toContain("ra.origin = 'acces'");
    expect(initSql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.project_members FROM fadi_app;");
    // La reprise d'une base antérieure garde la règle de l'ancien miroir et prouve l'égalité avant de supprimer.
    expect(initSql).toContain("RAISE EXCEPTION 'OP-PONT : % accès effectif(s) perdu(s) ou modifié(s)");
    expect(initSql).toContain("RAISE EXCEPTION 'OP-PONT : % partage(s) différent(s) dans la vue de compatibilité");
  });
});
