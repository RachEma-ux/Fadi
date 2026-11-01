// EX-008 — trace horodatée d'un geste : intention → commande → mutation canonique → scène invalidée. Pur.
import { describe, expect, it } from "vitest";
import { gesteOrdonne, TraceGeste } from "./trace-geste";

describe("EX-008 — sens de dépendance observé dans un seul geste", () => {
  it("EX-008 [+] : geste confirmé — intention, commande, mutation canonique puis scène invalidée, dans cet ordre", () => {
    let t = 0;
    const tr = new TraceGeste(() => ++t);
    tr.noter("intention", { outil: "rectangle" });
    tr.noter("commande", { outil: "studio.dessin.rectangle" });
    tr.noter("mutation", { revision: "R13" });
    tr.noter("scene", { revision: "R13" });
    expect(gesteOrdonne(tr.entrees())?.map((e) => e.etape)).toEqual(["intention", "commande", "mutation", "scene"]);
  });
  it("EX-008 [−] : scène sans mutation canonique préalable, ou d'une autre révision — l'ordre n'est pas établi", () => {
    let t = 0;
    const tr = new TraceGeste(() => ++t);
    tr.noter("intention"); tr.noter("commande"); tr.noter("scene", { revision: "R12" });
    expect(gesteOrdonne(tr.entrees())).toBeNull();
    tr.noter("mutation", { revision: "R13" }); tr.noter("scene", { revision: "R12" });
    expect(gesteOrdonne(tr.entrees())).toBeNull();
  });
});
