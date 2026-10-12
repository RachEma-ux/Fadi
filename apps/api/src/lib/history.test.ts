import { describe, expect, it } from "vitest";
import { historyEvent, latestHistory, type RevisionEvent } from "./history.js";

const project = { id: "p-a", code: "P.A", name: "Projet A" };
const event: RevisionEvent = { at: "2026-10-12T14:30:00+02:00", kind: "harmonie", label: "Décision conservée", detail: "Responsable : personne déclarée", stepNumber: 2, revision: 1 };

describe("normalisation de l'historique", () => {
  it("normalise le fuseau et ne transforme ni un responsable, ni un libellé d'auteur isolé en auteur enregistré", () => {
    expect(historyEvent({ ...event, authorLabel: "Propriétaire actuel" }, project)).toMatchObject({ at: "2026-10-12T12:30:00.000Z", authorId: null, authorLabel: null, source: "snapshot" });
    expect(historyEvent({ ...event, authorId: "editor-a", authorLabel: "editor@example.com", source: "ledger" }, project)).toMatchObject({ authorId: "editor-a", authorLabel: "editor@example.com", source: "ledger" });
  });

  it("écarte les dates inutilisables et garde des identifiants stables, distincts par dossier", () => {
    expect(historyEvent({ ...event, at: "date inconnue" }, project)).toBeNull();
    expect(historyEvent(event, project)?.id).toBe(historyEvent({ ...event }, project)?.id);
    expect(historyEvent(event, { ...project, id: "p-b" })?.id).not.toBe(historyEvent(event, project)?.id);
  });

  it("dédoublonne une entrée conservée et borne les plus récentes après comparaison de dates normalisées", () => {
    const first = historyEvent(event, project)!;
    const later = historyEvent({ ...event, id: "later", at: "2026-10-12T13:00:00Z" }, project)!;
    const last = historyEvent({ ...event, id: "last", at: "2026-10-12T16:00:00+02:00" }, project)!;
    expect(latestHistory([first, later, first, last], 2)).toEqual({ events: [last, later], truncated: true });
    expect(latestHistory([first, first], 2)).toEqual({ events: [first], truncated: false });
  });
});
