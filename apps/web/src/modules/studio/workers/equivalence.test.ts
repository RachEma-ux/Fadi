/**
 * Mêmes résultats avec ou sans Worker : un banc d'essai exécute le code du Worker de Studio dans le processus de test
 * (protocole, traitements, copie structurée des messages dans les deux sens, transfert du PDF) et ses réponses sont
 * comparées à l'appel direct des fonctions pures, sur des DXF et des feuilles de référence.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  applyStudioCommands, composerFeuilleStudio, newStudioDocument, studioSheetPdf, studioSheetSvg,
  type StudioDocument, type StudioDxfUnite, type StudioSheetOptions,
} from "@parcours/atelier-model";
import { lireDxf } from "../import/import-dxf-ui";
import type { DemandeWorker, ReponseWorker } from "./hote-worker";
import { brancher, type PorteeWorker } from "./protocole";
import { TRAITEMENTS_STUDIO } from "./traitements";

/** Worker exécuté dans le processus : le vrai code du Worker derrière une frontière de copie structurée. */
class BancWorker {
  static instances: BancWorker[] = [];
  termine = false;
  readonly progressions: string[] = [];
  private ecouteurs = new Map<string, ((e: unknown) => void)[]>();
  private readonly portee: PorteeWorker;
  constructor(_url?: unknown, _o?: unknown) {
    BancWorker.instances.push(this);
    this.portee = {
      onmessage: null,
      postMessage: (m: ReponseWorker, transfert?: Transferable[]) => {
        const copie = structuredClone(m, { transfer: transfert ?? [] });
        if ("progression" in copie) this.progressions.push(copie.progression.etape);
        setTimeout(() => { if (!this.termine) for (const f of this.ecouteurs.get("message") ?? []) f({ data: copie }); });
      },
    };
    brancher(this.portee, TRAITEMENTS_STUDIO);
  }
  addEventListener(type: string, f: (e: unknown) => void) { this.ecouteurs.set(type, [...(this.ecouteurs.get(type) ?? []), f]); }
  postMessage(m: DemandeWorker, transfert: Transferable[] = []) {
    const copie = structuredClone(m, { transfer: transfert });
    setTimeout(() => { if (!this.termine) void this.portee.onmessage?.({ data: copie } as MessageEvent<DemandeWorker>); });
  }
  terminate() { this.termine = true; }
}

type Client = typeof import("./client-studio");
let client: Client;
beforeAll(async () => {
  vi.stubGlobal("Worker", BancWorker);
  vi.resetModules();
  client = await import("./client-studio");
});
afterAll(() => { vi.unstubAllGlobals(); });

const crlf = (l: string[]) => l.join("\r\n") + "\r\n";
function dxf(o: { insunits?: number; tables?: string[]; entites: string[] }): string {
  return crlf([
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", ...(o.insunits === undefined ? [] : ["9", "$INSUNITS", "70", String(o.insunits)]), "0", "ENDSEC",
    ...(o.tables ?? []),
    "0", "SECTION", "2", "ENTITIES", ...o.entites, "0", "ENDSEC", "0", "EOF",
  ]);
}
const ligne = (x1: number, y1: number, x2: number, y2: number, calque = "0") => ["0", "LINE", "8", calque, "10", String(x1), "20", String(y1), "11", String(x2), "21", String(y2)];
const tables = (calques: { nom: string; flags?: number }[]) => [
  "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER",
  ...calques.flatMap((c) => ["0", "LAYER", "2", c.nom, "70", String(c.flags ?? 0), "62", "7"]),
  "0", "ENDTAB", "0", "ENDSEC",
];
const melange = dxf({
  insunits: 4,
  tables: tables([{ nom: "MURS" }, { nom: "COTES", flags: 4 }]),
  entites: [
    ...ligne(0, 0, 4000, 0), ...ligne(0, 0, 0, 3000, "MURS"),
    "0", "LWPOLYLINE", "8", "MURS", "90", "4", "70", "1", "10", "1000", "20", "1000", "10", "3000", "20", "1000", "10", "3000", "20", "2500", "10", "1000", "20", "2500",
    "0", "LWPOLYLINE", "8", "0", "90", "3", "70", "0", "10", "0", "20", "0", "42", "0.5", "10", "500", "20", "0", "10", "500", "20", "500",
    "0", "CIRCLE", "8", "COTES", "10", "500", "20", "500", "30", "0", "40", "250",
    "0", "ARC", "8", "0", "10", "2000", "20", "2000", "30", "0", "40", "500", "50", "0", "51", "90",
    "0", "TEXT", "8", "0", "10", "0", "20", "0", "40", "100", "1", "Salle",
    "0", "LINE", "8", "0", "10", "0", "20", "0", "30", "50", "11", "100", "21", "0", "31", "50",
  ],
});
const sansUnite = dxf({ entites: [...ligne(0, 0, 400, 0), ...ligne(0, 0, 0, 300, "PLAN")] });
/** Environ 1,5 Mo : 6 000 LINE au format R2000 (sous-classes, poignées), sur 40 calques. */
const grand = dxf({
  insunits: 6,
  entites: Array.from({ length: 6000 }, (_, i) => ["0", "LINE", "5", (0x100 + i).toString(16), "100", "AcDbEntity", "8", `A-MURS-${i % 40}`, "6", "CONTINUOUS", "100", "AcDbLine",
    "10", (i * 1.5).toFixed(9), "20", (i * 0.75).toFixed(9), "30", "0.0", "11", (i * 1.5 + 12.345).toFixed(9), "21", (i * 0.75 + 9.876).toFixed(9), "31", "0.0"]).flat(),
});
const verrou = { ...newStudioDocument("doc-verrou"), layers: [{ id: "murs", name: "MURS", visible: true, locked: true }] } as StudioDocument;
const vide = newStudioDocument("doc-vide");
const existant = applyStudioCommands(vide, [{ toolId: "studio.dessin.ligne", params: { id: "dxf-1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }]);

const CAS_DXF: { nom: string; texte: string; document: StudioDocument; unite: StudioDxfUnite | null }[] = [
  { nom: "mélange en millimètres (lignes, polylignes, courbes, texte non pris, Z ignoré, calques)", texte: melange, document: vide, unite: null },
  { nom: "même fichier dans un brouillon où « dxf-1 » est déjà pris", texte: melange, document: existant, unite: null },
  { nom: "sans unité : aucune commande", texte: sansUnite, document: vide, unite: null },
  { nom: "sans unité, centimètres choisis", texte: sansUnite, document: vide, unite: "cm" },
  { nom: "calque verrouillé dans le document : refus", texte: melange, document: verrou, unite: null },
  { nom: "DXF binaire : refus", texte: "AutoCAD Binary DXF\r\n\u001a\u0000", document: vide, unite: null },
  { nom: "texte illisible : refus", texte: "pas un DXF", document: vide, unite: null },
  { nom: "grand fichier (≈ 1,5 Mo, 6 000 lignes)", texte: grand, document: vide, unite: null },
];

describe("lecture DXF : Worker (banc d'essai) et appel direct donnent le même résultat", () => {
  it("le grand fichier de référence est bien de l'ordre du mégaoctet", () => {
    expect(grand.length).toBeGreaterThan(1_000_000);
    // Les références couvrent un import prêt, une unité inconnue et des refus.
    const m = lireDxf(melange, vide, null);
    expect("resultat" in m && m.resultat.statut === "pret" && m.resultat.commandes.length > 5 && m.resultat.rapport.nonPris.length > 0).toBe(true);
    const s = lireDxf(sansUnite, vide, null);
    expect("resultat" in s && s.resultat.statut === "unite-inconnue").toBe(true);
    expect("erreur" in lireDxf(melange, verrou, null)).toBe(true);
    const g = lireDxf(grand, vide, null);
    expect("resultat" in g && g.resultat.commandes.length).toBeGreaterThanOrEqual(6000);
  });

  for (const c of CAS_DXF) {
    it(c.nom, async () => {
      const direct = lireDxf(c.texte, c.document, c.unite);
      const parFichier = await client.lireDxfHorsFil({ source: new Blob([c.texte]), document: c.document, unite: c.unite });
      const parTexte = await client.lireDxfHorsFil({ source: c.texte, document: c.document, unite: c.unite });
      expect(parFichier).toEqual(direct);
      expect(parTexte).toEqual(direct);
    });
  }

  it("étapes annoncées : lecture du fichier puis analyse ; le calcul est bien passé par le Worker", async () => {
    const etapes: string[] = [];
    const avant = BancWorker.instances.length;
    await client.lireDxfHorsFil({ source: new Blob([melange]), document: vide, unite: null }, { surProgression: (p) => etapes.push(p.etape) });
    expect(etapes).toEqual(["lecture", "analyse"]);
    expect(BancWorker.instances.length).toBe(Math.max(avant, 1));
  });

  it("appel direct : usage du moteur calcul déclaré pendant le calcul, retiré après (succès comme échec)", async () => {
    const { ressourcesStudio } = await import("../chargement/ressources-studio");
    const usages = () => ressourcesStudio.instantaneEtats().find((e) => e.id === "calcul")!.usages.filter((u) => u.startsWith("client:"));
    const p = client.lireDxfHorsFil({ source: sansUnite, document: vide, unite: "m" });
    expect(usages()).toHaveLength(1);
    expect(usages()[0]).toMatch(/^client:dxf\.lire:/);
    expect(ressourcesStudio.peutLiberer("calcul")).toBe(false);
    await p;
    expect(usages()).toEqual([]);
    const f = client.composerFeuilleHorsFil(docFeuille, { format: "A9" as never, orientation: "paysage", scale: 100 });
    expect(usages()[0]).toMatch(/^client:feuille\.composer:/);
    await f;
    const c = new AbortController();
    const annulee = client.lireDxfHorsFil({ source: grand, document: vide, unite: null }, { signal: c.signal });
    c.abort();
    await expect(annulee).rejects.toMatchObject({ code: "annulee" });
    expect(usages()).toEqual([]);
    // Le Worker annulé est remplacé à la demande suivante (laissé prêt pour les cas qui suivent).
    await client.lireDxfHorsFil({ source: sansUnite, document: vide, unite: "m" });
  });

  it("annulation d'une lecture : rejet « annulee », la lecture suivante réussit sur un nouveau Worker", async () => {
    const c = new AbortController();
    const avant = BancWorker.instances.length;
    const p = client.lireDxfHorsFil({ source: grand, document: vide, unite: null }, { signal: c.signal });
    c.abort();
    await expect(p).rejects.toMatchObject({ code: "annulee" });
    await expect(client.lireDxfHorsFil({ source: sansUnite, document: vide, unite: "m" })).resolves.toEqual(lireDxf(sansUnite, vide, "m"));
    expect(BancWorker.instances.length).toBe(avant + 1);
  });
});

const docFeuille = (() => {
  const r = lireDxf(melange, vide, null);
  if (!("resultat" in r)) throw new Error("fixture");
  return applyStudioCommands(vide, r.resultat.commandes);
})();
const titre = { projectCode: "P.STU.A", projectName: "Projet A", study: "Implantation nord", variant: "V1", title: "", revisionId: "abcd1234", revisionDate: "2026-10-19", author: "" };
const CAS_FEUILLE: { nom: string; document: StudioDocument; options: StudioSheetOptions }[] = [
  { nom: "A3 paysage ajustée, une ligne", document: { id: "d1", schemaVersion: "studio-document/1", units: "m", frame: "local-2d", objects: [{ id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } }] }, options: { format: "A3", orientation: "paysage", scale: "ajuster", titleBlock: titre } },
  { nom: "A4 portrait 1:100, calques, courbes, échelle graphique et nord déclaré", document: docFeuille, options: { format: "A4", orientation: "portrait", scale: 100, titleBlock: titre, scaleBar: true, north: { angle: 30 } } },
  { nom: "A1 paysage 1:20 découpée au cadre", document: docFeuille, options: { format: "A1", orientation: "paysage", scale: 20, titleBlock: titre } },
];

describe("feuille : Worker (banc d'essai) et appel direct donnent le même SVG et le même PDF", () => {
  for (const c of CAS_FEUILLE) {
    it(c.nom, async () => {
      const feuille = composerFeuilleStudio(c.document, c.options);
      const r = await client.composerFeuilleHorsFil(c.document, c.options);
      expect(r.erreur).toBe("");
      expect(r.feuille).toEqual(feuille);
      expect(r.svg).toBe(studioSheetSvg(feuille));
      expect(r.pdf).toBeInstanceOf(Uint8Array);
      expect(Array.from(r.pdf!)).toEqual(Array.from(studioSheetPdf(feuille)));
    });
  }

  it("réglages refusés : même message, ni feuille ni fichier", async () => {
    const r = await client.composerFeuilleHorsFil(docFeuille, { format: "A9" as never, orientation: "paysage", scale: 100 });
    expect(r).toEqual({ feuille: null, svg: null, pdf: null, erreur: "La feuille n’a pas pu être composée avec ces réglages." });
  });

  it("réglages successifs sur le même canal : seul le dernier résultat est rendu", async () => {
    const a = client.composerFeuilleHorsFil(docFeuille, { format: "A3", orientation: "paysage", scale: 100 }, { canal: "feuille" });
    const b = client.composerFeuilleHorsFil(docFeuille, { format: "A4", orientation: "portrait", scale: 50 }, { canal: "feuille" });
    await expect(a).rejects.toMatchObject({ code: "remplacee" });
    expect((await b).feuille?.format).toBe("A4");
  });
});

describe("point d'entrée du Worker", () => {
  it("studio.worker.ts branche les traitements de Studio sur la portée du Worker", async () => {
    const recus: ReponseWorker[] = [];
    const portee: PorteeWorker = { onmessage: null, postMessage: (m) => { recus.push(m); } };
    vi.stubGlobal("self", portee);
    vi.resetModules();
    await import("./studio.worker");
    expect(typeof portee.onmessage).toBe("function");
    await portee.onmessage!({ data: { id: 7, nature: "dxf.lire", charge: { source: sansUnite, document: vide, unite: "mm" } } } as MessageEvent<DemandeWorker>);
    expect(recus.at(-1)).toEqual({ id: 7, valeur: lireDxf(sansUnite, vide, "mm") });
    await portee.onmessage!({ data: { id: 8, nature: "inconnu", charge: null } } as MessageEvent<DemandeWorker>);
    expect(recus.at(-1)).toEqual({ id: 8, erreur: "Traitement inconnu : inconnu" });
  });
});
