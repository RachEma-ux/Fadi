import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import { decide, forgetProject, isAudienceQuery, missingProjects, refreshAudience, touchesProject } from "./project-cache-guard";

const e404 = new ApiError(404, "not_found", null);
const e403 = new ApiError(403, "forbidden", null);

describe("cache hors ligne après retrait ou changement d'audience (E7, CR-D5 (a))", () => {
  it("un refus 404 du projet fait oublier le projet ; 403 (rôle insuffisant) ou panne : rien", () => {
    const seen = new Map<string, string>();
    expect(decide({ status: "error", key: ["project", "p1"], error: e404 }, seen)).toEqual({ kind: "forget", projectId: "p1" });
    expect(decide({ status: "error", key: ["project", "p1"], error: e403 }, seen)).toBeNull();
    expect(decide({ status: "error", key: ["project", "p1"], error: new Error("réseau") }, seen)).toBeNull();
    expect(decide({ status: "error", key: ["steps", "p1"], error: e404 }, seen)).toBeNull();
  });

  it("une lecture d'éléments à audience refusée (404) retire sa copie", () => {
    const key = ["studio-observations", "p1", "s", "v"];
    expect(decide({ status: "error", key, error: e404 }, new Map())).toEqual({ kind: "drop", key });
  });

  it("Communication : une conversation devenue illisible (404) retire sa copie ; ses requêtes sont relues au changement de rôle", () => {
    const key = ["com", "p1", "conversation", "c1"];
    expect(decide({ status: "error", key, error: e404 }, new Map())).toEqual({ kind: "drop", key });
    expect(isAudienceQuery(["com", "p1", "conversations", "tout"], "p1")).toBe(true);
    expect(isAudienceQuery(["com", "p1", "activite", "tout", "", "", ""], "p1")).toBe(true);
  });

  it("rôle hors de l'équipe : relecture à la première lecture de la session, puis à chaque changement de rôle", () => {
    const seen = new Map<string, string>();
    const lu = (role: string) => decide({ status: "success", key: ["project", "p1"], data: { id: "p1", role } }, seen);
    expect(lu("lecteur")).toEqual({ kind: "refresh", projectId: "p1" });
    expect(lu("lecteur")).toBeNull();
    expect(lu("editeur")).toBeNull();
    expect(lu("lecteur")).toEqual({ kind: "refresh", projectId: "p1" });
    expect(lu("support")).toEqual({ kind: "refresh", projectId: "p1" });
    expect(decide({ status: "success", key: ["project", "p2"], data: { role: "proprietaire" } }, seen)).toBeNull();
  });

  it("projets en cache absents de la liste relue : à oublier", () => {
    expect(missingProjects(["p1", "p2", "p3"], [{ id: "p1" }, { id: "p3" }])).toEqual(["p2"]);
    expect(missingProjects(["p1"], null)).toEqual([]);
  });

  it("clés : un projet est reconnu dans n'importe quelle position, et seules les requêtes à audience sont relues", () => {
    expect(touchesProject(["comments", "p1", 4], "p1")).toBe(true);
    expect(touchesProject(["comments", "p10"], "p1")).toBe(false);
    expect(isAudienceQuery(["studio-comments", "p1", "s", "v"], "p1")).toBe(true);
    expect(isAudienceQuery(["steps", "p1"], "p1")).toBe(false);
  });

  it("oublier un projet retire ses requêtes, garde celles des autres ; la relecture vise les éléments à audience", async () => {
    const qc = new QueryClient();
    qc.setQueryData(["comments", "p1", 3], [{ id: "c" }]);
    qc.setQueryData(["steps", "p1"], [1]);
    qc.setQueryData(["comments", "p2", 3], [{ id: "d" }]);
    await forgetProject(qc, "p1");
    expect(qc.getQueryData(["comments", "p1", 3])).toBeUndefined();
    expect(qc.getQueryData(["steps", "p1"])).toBeUndefined();
    expect(qc.getQueryData(["comments", "p2", 3])).toEqual([{ id: "d" }]);
    qc.setQueryData(["collaboration", "p2"], {});
    refreshAudience(qc, "p2");
    expect(qc.getQueryState(["collaboration", "p2"])?.isInvalidated).toBe(true);
    expect(qc.getQueryState(["comments", "p2", 3])?.isInvalidated).toBe(true);
  });
});
