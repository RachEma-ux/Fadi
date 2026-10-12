import { describe, expect, it } from "vitest";
import type { HistoryEvent } from "../../lib/api";
import { EMPTY_HISTORY_FILTERS, UNKNOWN_HISTORY_AUTHOR, filterHistory, historyDestination, historyMinuteKey, invalidHistoryPeriod } from "./history-view-model";

const event = (id: string, extra: Partial<HistoryEvent> = {}): HistoryEvent => ({ id, at: "2026-10-12T12:30:42Z", kind: "programme", label: "Programme créé", detail: "École et capacités", stepNumber: 7, revision: 1, authorId: null, authorLabel: null, source: "snapshot", project: { id: "dossier-a", code: "P.A", name: "Dossier A" }, ...extra });

describe("filtres et destinations de l'historique", () => {
  it("combine les colonnes sans confondre un auteur inconnu avec l'utilisateur courant", () => {
    const unknown = event("a");
    const known = event("b", { authorId: "writer", authorLabel: "writer@example.com" });
    const other = event("c", { project: { id: "dossier-b", code: "P.B", name: "Dossier B" } });
    expect(filterHistory([unknown, known, other], { ...EMPTY_HISTORY_FILTERS, author: UNKNOWN_HISTORY_AUTHOR, area: "programme", project: "dossier-a", change: "ecole" })).toEqual([unknown]);
    expect(filterHistory([unknown, known], { ...EMPTY_HISTORY_FILTERS, author: "writer" })).toEqual([known]);
  });

  it("inclut les deux minutes bornes à Zurich, refuse une période inversée et conserve les données originales", () => {
    const row = event("a");
    const before = event("before", { at: "2026-10-12T12:29:59.999Z" });
    const start = event("start", { at: "2026-10-12T12:30:00Z" });
    const end = event("end", { at: "2026-10-12T12:30:59.999Z" });
    const after = event("after", { at: "2026-10-12T12:31:00Z" });
    expect(historyMinuteKey(row.at)).toBe("2026-10-12T14:30");
    expect(filterHistory([before, start, row, end, after], { ...EMPTY_HISTORY_FILTERS, from: "2026-10-12T14:30", to: "2026-10-12T14:30" })).toEqual([start, row, end]);
    expect(historyMinuteKey("2026-10-11T22:00:00Z")).toBe("2026-10-12T00:00");
    const reversed = { ...EMPTY_HISTORY_FILTERS, from: "2026-10-13T12:00", to: "2026-10-12T12:00" };
    expect(invalidHistoryPeriod(reversed)).toBe(true);
    expect(filterHistory([row], reversed)).toEqual([]);
    expect(row.at).toBe("2026-10-12T12:30:42Z");
  });

  it("ne décale pas les bornes au passage à l'heure d'été et inclut les deux occurrences de l'heure d'hiver", () => {
    const springBefore = event("spring-before", { at: "2026-03-29T00:59:59.999Z" });
    const springAfter = event("spring-after", { at: "2026-03-29T01:00:00Z" });
    expect(historyMinuteKey(springBefore.at)).toBe("2026-03-29T01:59");
    expect(historyMinuteKey(springAfter.at)).toBe("2026-03-29T03:00");
    expect(filterHistory([springBefore, springAfter], { ...EMPTY_HISTORY_FILTERS, from: "2026-03-29T02:00", to: "2026-03-29T02:59" })).toEqual([]);
    expect(filterHistory([springBefore, springAfter], { ...EMPTY_HISTORY_FILTERS, from: "2026-03-29T01:59", to: "2026-03-29T03:00" })).toEqual([springBefore, springAfter]);
    const summerOccurrence = event("summer", { at: "2026-10-25T00:30:00Z" });
    const winterOccurrence = event("winter", { at: "2026-10-25T01:30:59.999Z" });
    expect(filterHistory([summerOccurrence, winterOccurrence], { ...EMPTY_HISTORY_FILTERS, from: "2026-10-25T02:30", to: "2026-10-25T02:30" })).toEqual([summerOccurrence, winterOccurrence]);
  });

  it("ouvre le module courant du même dossier, sans route historique ou restauration inventée", () => {
    expect(historyDestination(event("a"))).toEqual({ to: "/projets/dossier-a?module=programmation", label: "Ouvrir le programme du dossier" });
    expect(historyDestination(event("b", { kind: "modele", revision: 99 })).to).toBe("/projets/dossier-a?module=atelier");
    expect(historyDestination(event("c", { kind: "harmonie", stepNumber: 2 })).to).toBe("/projets/dossier-a?module=parcours&etape=2");
    expect(historyDestination(event("review", { kind: "revue", stepNumber: 10 })).to).toBe("/projets/dossier-a?module=parcours&etape=11&bilan=1");
    expect(historyDestination(event("d", { kind: "projet", stepNumber: 99 })).to).toBe("/projets/dossier-a");
    expect(historyDestination(event("e", { project: { id: "one/two", code: "X", name: "X" } })).to).toBe("/projets/one%2Ftwo?module=programmation");
  });
});
