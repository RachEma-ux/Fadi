import { describe, expect, it } from "vitest";
import { EXAMPLE_REPORT_FILE_NAME, exampleBudget, exampleBudgetHtml, exampleBudgetMissing, exampleReportHtml, exampleTraceHtml, type ExampleReportInput } from "./example-report";

// Réponses des étapes 14 et 15 de l'exemple P.118 (p118-exemple-complet.json, `business`).
const b14 = { f1: 3200000, f2: 13500000, f3: 1600000, f4: 1200000, f5: 2000000, f6: 2500000, f7: 1400000, f8: 3600000, f9: 10000000, f10: 14000000 };
const b15 = { f1: 10, f2: 10, f3: 15, f4: 10, f5: 2, f6: 6 };

describe("exampleBudget — `money(p)` de l'exemple résolu (étapes 14 / 15)", () => {
  it("retrouve les montants que l'exemple énonce lui-même dans son scénario défavorable (étape 15, f8)", () => {
    // « CAPEX +10 % = 26,40 M, besoin additionnel 2,40 M si financement inchangé. Recettes 3,60 M × 0,85 × 0,90 = 2,754 M ;
    //   OPEX ×1,10 = 1,540 M ; solde opérationnel-test 1,214 M avant dette/impôt. Choc de taux +2 points sur 14 M : +0,280 M/an »
    const m = exampleBudget(b14, b15)!;
    expect(m).toMatchObject({ capex: 24000000, fund: 24000000, gap: 0, income: 3600000, opex: 1400000, margin: 2200000, interestShock: 280000 });
    // Arithmétique flottante (× 1,1) : le prototype arrondit à l'affichage (`num`), les valeurs sont comparées à 10⁻⁶ près.
    expect(m.stressCapex).toBeCloseTo(26400000, 6);
    expect(m.stressGap).toBeCloseTo(-2400000, 6);
    expect(m.stressOpex).toBeCloseTo(1540000, 6);
    expect(m.stressIncome).toBeCloseTo(2754000, 6);
    expect(m.stressMargin).toBeCloseTo(1214000, 6);
  });

  it("ne calcule rien tant qu'un poste manque — une valeur inconnue n'est pas zéro — et nomme les postes manquants", () => {
    expect(exampleBudget({ ...b14, f7: "" }, b15)).toBeNull();
    expect(exampleBudget(b14, { ...b15, f5: "deux" })).toBeNull();
    expect(exampleBudgetMissing({ ...b14, f7: "" }, { ...b15, f5: "deux" })).toEqual([
      { step: 14, key: "f7" },
      { step: 15, key: "f5" },
    ]);
    expect(exampleBudgetMissing(b14, b15)).toEqual([]);
  });

  it("compose le tableau Référence / Scénario défavorable et la décision du cas (`budgetHTML`)", () => {
    const html = exampleBudgetHtml(exampleBudget(b14, b15)!);
    expect(html).toContain('<p class="ex81-note">Calculs sur hypothèses fictives, en MAD ; ni devis, ni offre de crédit, ni engagement.</p>');
    expect(html).toContain("<th scope=\"col\">Scénario défavorable</th>");
    // Séparateur de milliers français (espace fine insécable) : `.` dans l'expression.
    expect(html).toMatch(/<tr><td>Investissement<\/td><td>24.000.000 MAD<\/td><td>26.400.000 MAD<\/td><\/tr>/);
    expect(html).toContain("Solde opérationnel avant dette / impôt");
    expect(html).toMatch(/Décision du cas :<\/b> le stress de CAPEX crée 2.400.000 MAD de besoin additionnel ; pas de GO travaux sans nouvelle décision\./);
  });
});

function minimalInput(): ExampleReportInput {
  const trace = (stage: number) => ({ stage, incoming: stage === 1 ? [] : [{ origin: 1, originLabel: "01 · Parcelle / Site existant", ref: "H01-A", text: "Accueil extérieur lisible", originStale: false }], chosen: [{ ref: `H${String(stage).padStart(2, "0")}-A`, text: "Choix retenu", targets: ["03 · Besoins"] }] });
  return {
    projectName: "P.118 — Escalier B et mezzanine",
    criteria: ["Préserver le contour S01 et l’emprise dessinée de 673 m²."],
    audit: { fields: 150, filled: 150, linkedSpaces: 74, stageCount: 21, areaDelta: 0.000001 },
    steps: Array.from({ length: 21 }, (_, i) => ({
      number: i + 1,
      title: `Étape ${i + 1}`,
      headline: `Titre ${i + 1}`,
      decision: `Décision ${i + 1}`,
      why: "Parce que <source>",
      alternatives: "Autre option",
      answers: [{ label: "Synthèse / réponse de l’exemple", value: "Réponse" }],
      trace: trace(i + 1),
      retained: 1,
      stale: i === 4,
    })),
    budget: exampleBudget(b14, b15),
    building: {
      headline: "Bâtiment conçu",
      decision: "Décision 10",
      footprint: 673.0000000000751,
      roomCount: 74,
      roomArea: 2932.2573458814772,
      layout: { choice: "Escalier B", scope: "Mezzanine", status: "Statut", detailSvg: "<svg id='layout'></svg>", areas: { mezzNetBefore: 100, mezzNetAfter: 120.5, mezzNetGain: 20.5 }, assumptions: ["A1"], roomChanges: [{ level: "Mezzanine", name: "Bureau", before: 10, after: 12 }], issues: ["I1"], sourceFiles: ["RezRDC2.png"] },
      stair: { choice: "Escalier A", status: "OK", rows: [{ from: "RDC", to: "R+1", rise: 3.4, riser: 0.1478 }], assumptions: [], issues: [], sources: [{ id: "S1", url: "https://example.org/s1", use: "Giron" }] },
      services: { pause: "Pause", issues: ["MC-01 à coordonner"] },
      sanitary: { status: "Revue", choice: "Choix", populationNote: "Pop", capacityNote: "Cap", surfacesNote: "Surf", rows: [{ name: "RDC", occupancy: { people: 60 }, blocks: [{ wc: 3, basins: 2 }, { wc: 2, basins: 2 }], net: 24.5 }], detailPlans: [{ svg: "<svg id='san'></svg>" }], issues: [], roomChanges: [], sources: [{ file: "ZONE-I-5.pdf", use: "Référence" }] },
      trace: trace(10),
      issues: [{ id: "HEIGHT", title: "Hauteur", body: "16,60 m" }, { id: "AUTRE", title: "Autre", body: "Sans réponse" }],
      issueAnswers: { HEIGHT: "Reprise de coupe" },
      floors: [{ name: "RDC", rooms: 600.5, planSvg: "<svg id='plan-rdc'></svg>", roomsHtml: "<p>fiches</p><details><summary>Ambiance choisie</summary><p>Bois</p></details>" }],
    },
    assumptions: [{ id: "H-CONTEXTE", title: "Contexte", value: "Scénario A", status: "Hypothèse" }],
    css: ".ex81{color:#214c42}",
  };
}

describe("exampleReportHtml — « Dossier complet de l’exemple » (`fullReport`)", () => {
  it("assemble les rubriques du prototype dans l'ordre, plis ouverts, boutons figés, textes échappés", () => {
    const html = exampleReportHtml(minimalInput());
    expect(EXAMPLE_REPORT_FILE_NAME).toBe("P118_Exemple_Resolu_V8_19.html");
    expect(html.startsWith("<!doctype html><html lang=\"fr\">")).toBe(true);
    expect(html).toContain("<title>P.118 — Exemple résolu V8.1</title>");
    expect(html).toContain(".ex81{color:#214c42}");
    const order = ["PARCOURS V8.19 · EXEMPLE ENTIÈREMENT RENSEIGNÉ", "<h1>P.118 — Escalier B et mezzanine</h1>", "<h2>Critères de choix</h2>", "<h2>Complétude et transmission</h2>", "150/150 champs métier renseignés ; 74 fiches liées ; 21 étapes ; écart programme/polygones 0,000001 m²", "<h2>Réponses aux 21 étapes</h2>", "<h2>01 · Étape 1</h2>", "<h2>21 · Étape 21</h2>", "<h2>Budget du scénario</h2>", "BILAN HARMONIE · BÂTIMENT DESSINÉ", "Escalier B, mezzanine et porte X · V8.19", "Escalier A autour de l’ascenseur · V8.18", "Sanitaires redessinés · revue V8.17", "Réserves du modèle : une réponse pour chacune", "Lecture par niveau — géométrie réelle du modèle", "<h2>Registre des hypothèses et non-applicabilités décidées</h2>", "aucun chantier ni usage autorisé."];
    let at = -1;
    for (const marker of order) {
      const next = html.indexOf(marker, at + 1);
      expect(next, marker).toBeGreaterThan(at);
      at = next;
    }
    // 21 sections d'étape, chacune avec choix, justification, compromis, réponses et trace.
    expect(html.match(/<section class="ex81-report-step">/g)).toHaveLength(21);
    expect(html.match(/<b>Choix :<\/b>/g)).toHaveLength(21);
    expect(html.match(/<h3>Intentions reçues et utilisées<\/h3>/g)).toHaveLength(22); // 21 étapes + bilan du bâtiment (trace de l'étape 10)
    expect(html).toContain("Point de départ : le choix du site ne reçoit pas une intention");
    expect(html).toContain("<td>05 · Étape 5</td><td>1</td><td>1</td><td>À réexaminer</td>");
    expect(html).toContain("<td>06 · Étape 6</td><td>1</td><td>1</td><td>Scénario cohérent avec ses entrées</td>");
    // Échappement : le texte du récit n'injecte pas de balise.
    expect(html).toContain("Parce que &lt;source&gt;");
    // Boutons figés en liens de dossier, plis tous ouverts (`exportBody`), y compris ceux des fiches.
    expect(html).not.toContain("<button");
    expect(html).toContain('<span class="ex81-report-link">01 · Parcelle / Site existant</span>');
    expect(html.match(/<details\b/g)!.length).toBe(html.match(/<details open/g)!.length);
    // Bilan : KPI, blocs du modèle V8.19, réserve avec réponse retenue et réserve sans réponse (texte de repli du prototype), plan et fiches par niveau.
    expect(html).toContain("<b>673 m²</b>Emprise du modèle");
    expect(html).toContain("<b>74 zones</b>Liées au programme");
    expect(html).toContain("<svg id='layout'></svg>");
    expect(html).toContain("<td>Surface nette géométrique</td><td>100 m²</td><td>120,5 m²</td><td>+20,5 m²</td>");
    expect(html).toContain("<td>RDC → R+1</td><td>3,4 m</td><td>7 + 9 + 7</td><td>14,78 cm</td>");
    expect(html).toContain('<a href="https://example.org/s1" target="_blank" rel="noopener">S1</a>');
    expect(html).toContain("<td>RDC</td><td>60</td><td>3 / 2</td><td>2</td><td>1</td><td>4</td><td>24.50 m²</td>");
    expect(html).toContain("<td>Reprise de coupe</td>");
    expect(html).toContain("Revue ciblée par le concepteur ; consigner l’écart, tester une correction et ne pas conclure à une conformité automatique.");
    expect(html).toContain("<summary>RDC · 600,5 m² de zones</summary>");
    expect(html).toContain("<svg id='plan-rdc'></svg>");
    expect(html).toContain("<td><b>H-CONTEXTE</b><br>Contexte</td><td>Scénario A</td><td>Hypothèse</td>");
  });

  it("dit l'absence de budget ou de modèle plutôt que d'afficher des zéros", () => {
    const html = exampleReportHtml({ ...minimalInput(), budget: null, building: null });
    expect(html).toContain("Budget non calculé : des postes des étapes 14 / 15 ne sont pas renseignés. Une valeur inconnue n’est pas zéro.");
    expect(html).toContain("Aucun modèle natif lisible : le bilan du bâtiment dessiné n’est pas établi.");
    expect(html).not.toContain("BILAN HARMONIE · BÂTIMENT DESSINÉ");
  });

  it("trace : sans intention reçue, le message dépend de l'étape ; sans destination, « Équipe de conception détaillée »", () => {
    const html = exampleTraceHtml({ stage: 12, incoming: [], chosen: [{ ref: "H12-B", text: "Choix", targets: [] }] });
    expect(html).toContain("Aucune transmission ciblée pour cet état de votre adaptation");
    expect(html).toContain("<td>H12-B</td><td>Choix</td><td>Équipe de conception détaillée — dossier préparé</td>");
  });
});
