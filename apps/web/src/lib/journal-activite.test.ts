/**
 * Journal d'activité (phase 3 bis) : chaque action que l'API journalise (`AuditAction`, apps/api/src/lib/audit.ts) a un
 * libellé lisible, et chaque libellé a sa traduction anglaise (D-163). Une action future reste lisible par son code.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTION_LABEL, actionLabel, actorLabel, DETAIL_LABEL, detailValue, FAMILY_LABEL, SUBJECT_LABEL } from "./journal-activite";
import en from "./i18n/en.json";

const auditSource = readFileSync(new URL("../../../api/src/lib/audit.ts", import.meta.url), "utf8");
const union = auditSource.slice(auditSource.indexOf("export type AuditAction"), auditSource.indexOf("export interface AuditEntry"));
const API_ACTIONS = [...union.matchAll(/\|\s*"([a-z_.]+)"/g)].map((m) => m[1]!);
const familiesSource = readFileSync(new URL("../../../api/src/lib/journal-audience.ts", import.meta.url), "utf8");
const API_FAMILIES = [...(familiesSource.match(/JOURNAL_FAMILIES = \[([\s\S]*?)\]/)?.[1] ?? "").matchAll(/"([a-z]+)"/g)].map((m) => m[1]!);
const dico = en as Record<string, string>;

describe("journal d'activité — libellés", () => {
  it("chaque action journalisée par l'API a un libellé, et rien n'est libellé qui n'existe pas", () => {
    expect(API_ACTIONS.length).toBeGreaterThan(40);
    // Les familles des phases suivantes (participation, person, review) restent lisibles par leur code tant que leur
    // libellé n'est pas ajouté ; toute autre action nouvelle doit recevoir le sien ici (et sa traduction dans en.json).
    const sansLibelle = API_ACTIONS.filter((a) => !ACTION_LABEL[a] && !/^(participation|person|review)\./.test(a));
    expect(sansLibelle).toEqual([]);
    for (const a of Object.keys(ACTION_LABEL)) expect(API_ACTIONS, a).toContain(a);
  });

  it("chaque famille de l'API a un libellé", () => {
    expect(API_FAMILIES.length).toBeGreaterThan(5);
    for (const f of API_FAMILIES) expect(FAMILY_LABEL[f], f).toBeTruthy();
  });

  it("chaque libellé a sa traduction anglaise", () => {
    const labels = [...Object.values(ACTION_LABEL), ...Object.values(FAMILY_LABEL), ...Object.values(DETAIL_LABEL), ...Object.values(SUBJECT_LABEL),
      "Vous", "Système (aucun compte connecté)", "Un administrateur de la plateforme", "Un autre compte", "Compte supprimé", "oui", "non", "Action non répertoriée : {0}"];
    for (const l of labels) expect(dico[l], l).toBeTruthy();
  });

  it("action future lisible par son code ; identité d'un compte ; valeurs", () => {
    expect(actionLabel("participation.started")).toBe("Action non répertoriée : participation.started");
    expect(actorLabel({ kind: "compte", id: "u", email: "a@example.test", displayName: "Alice" })).toBe("Alice (a@example.test)");
    expect(actorLabel({ kind: "compte", id: "u", email: null, displayName: null })).toBe("Compte supprimé");
    expect(detailValue(true)).toEqual({ text: "oui", raw: false });
    expect(detailValue("editeur")).toEqual({ text: "éditeur", raw: false });
    expect(detailValue("unknown_account")).toEqual({ text: "unknown_account", raw: true });
  });
});
