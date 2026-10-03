import { readFileSync, writeFileSync } from "node:fs";
import { analyseModel, type NativeFloorDesignLike, type NativeLevelLike } from "@parcours/domain-model";
import { describe, expect, it } from "vitest";
import type { JeuDonneesP118 } from "../contrats/import.js";
import type { EtatModele } from "../contrats/etat.js";
import type { ObjetDe, ObjetModele } from "../ontologie/classes.js";
import { REPERE_LOCAL_PROJET } from "../ontologie/reperes.js";
import { validerObjet } from "../ontologie/validation.js";
import { projeterDomainesNatifs, projeterEntreeAnalyse } from "../projection/projeter.js";
import { empreinteModele, jsonCanonique } from "./empreinte.js";
import { FAMILLES_NIVEAU, importerP118, REPERE_PIECES_SOURCE } from "./importer-p118.js";
import { rapportImportMarkdown } from "./rapport-markdown.js";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const URL_JSON = new URL("../../../../apps/api/src/data/examples/p118-native-model.json", import.meta.url);
const URL_RAPPORT = new URL("../../../../docs/atelier/lots/lot-1-rapport-import.md", import.meta.url);
const charger = (): Json => JSON.parse(readFileSync(URL_JSON, "utf8")) as Json;
const SOURCE = charger();
const { modele, rapport } = importerP118(SOURCE as JeuDonneesP118);
const objets = Object.values(modele.objets);
const deClasse = <C extends ObjetModele["classe"]>(c: C) => objets.filter((o): o is Extract<ObjetModele, { classe: C }> => o.classe === c);
const prop = (o: ObjetModele, nom: string) => o.proprietes.find((p) => p.nom === nom);
const ligne = (f: string) => rapport.lignes.find((l) => l.famille === f)!;
const niveauxSource = Object.entries(SOURCE.domains.floorDesign.levels as Record<string, Json>);

describe("importerP118 — effectifs (R7)", () => {
  it("importe chaque famille avec les effectifs de R7, sans perte", () => {
    const attendus: Record<string, number> = { niveaux: 6, murs: 220, poteaux: 120, portes: 84, fenetres: 126, escaliers: 32, traces: 967, cotations: 64, textes: 95, pieces: 45, parcelle: 1, emprise: 1, calques: 22, hypotheses: 17, sources: 9 };
    for (const [f, n] of Object.entries(attendus)) {
      expect(ligne(f).effectifSource, f).toBe(n);
      expect(ligne(f).effectifCible, f).toBe(n);
    }
    expect(ligne("structure")).toMatchObject({ effectifSource: 1, effectifCible: 2, parClasseCible: { structureDeclaree: 1, hypothese: 1 } });
    expect(ligne("traces").parClasseCible).toEqual({ solide: 871, "piece.polygones": 41, espace: 33, zone: 13, dalle: 6, toiture: 1, "reference-plan": 2 });
    for (const l of rapport.lignes) expect(l.effectifCible, l.famille).toBeGreaterThanOrEqual(l.effectifSource);
  });

  it("donne les effectifs par niveau égaux à la source", () => {
    for (const f of FAMILLES_NIVEAU) {
      const famille = { walls: "murs", columns: "poteaux", doors: "portes", windows: "fenetres", stairs: "escaliers", paths: "traces", dims: "cotations", texts: "textes", rooms: "pieces" }[f];
      for (const [lid, lv] of niveauxSource) {
        const n = (lv[f] as unknown[]).length;
        if (n === 0) continue;
        expect(ligne(famille).parNiveau?.[lid], `${famille} ${lid}`).toEqual({ source: n, cible: n });
      }
    }
    // Calques : 16 à 20 par niveau (R7 « 20 calques » = au plus 20 par niveau), 22 au total (D-021).
    const parNiveau = ligne("calques").parNiveau!;
    expect(Object.values(parNiveau).map((e) => e.cible)).toEqual([16, 20, 19, 19, 19, 20]);
    expect(Math.max(...Object.values(parNiveau).map((e) => e.source))).toBe(20);
  });

  it("crée les objets typés attendus, tous valides au regard de l'ontologie", () => {
    const parClasse: Record<string, number> = {};
    for (const o of objets) parClasse[o.classe] = (parClasse[o.classe] ?? 0) + 1;
    expect(parClasse).toEqual({
      niveau: 6,
      calque: 22,
      mur: 220,
      poteau: 120,
      porte: 84,
      fenetre: 126,
      escalier: 32,
      dalle: 6,
      toiture: 1,
      espace: 33,
      zone: 13,
      "reference-plan": 2,
      solide: 871,
      piece: 45,
      cotation: 64,
      texte: 95,
      parcelle: 1,
      emprise: 1,
      structureDeclaree: 1,
      hypothese: 18,
      source: 9,
    });
    for (const o of objets) expect(validerObjet(o), o.id).toEqual([]);
    expect(rapport.problemes.filter((p) => p.code === "parametre-invalide")).toEqual([]);
    for (const o of objets) expect(o.provenance).toBe("import");
  });
});

describe("importerP118 — valeurs bit à bit, repères, relations", () => {
  it("conserve coordonnées et altitudes sans arrondi", () => {
    const niveaux = deClasse("niveau").sort((a, b) => a.params.ordre - b.params.ordre);
    expect(niveaux.map((n) => [n.id, n.params.elevation.value, n.params.hauteur.value])).toEqual((SOURCE.domains.levels as Json[]).map((l) => [l.id, l.elevation, l.height]));
    for (const [, lv] of niveauxSource) {
      for (const w of lv.walls as Json[]) {
        const m = modele.objets[w.id] as ObjetDe<"mur">;
        expect(Object.is(m.params.axe.a.x, w.a[0]) && Object.is(m.params.axe.a.y, w.a[1]) && Object.is(m.params.axe.b.x, w.b[0]) && Object.is(m.params.axe.b.y, w.b[1])).toBe(true);
        expect(m.params.epaisseur.value).toBe(w.thickness);
      }
      for (const p of lv.paths as Json[]) {
        const o = modele.objets[p.id];
        if (!o) continue; // tracé rattaché à une pièce : vérifié plus bas
        const contour = "contour" in o.params ? (o.params.contour as { contour?: unknown }) : (o.params as { polygones: { contour: unknown }[] }).polygones[0]!.contour;
        const pts = (Array.isArray(contour) ? contour : (contour as { contour: { x: number; y: number }[] }).contour) as { x: number; y: number }[];
        expect(pts.map((q) => [q.x, q.y])).toEqual(p.points);
      }
    }
    const parcelle = deClasse("parcelle")[0]!;
    expect(parcelle.params.sommetsCadastraux.map((q) => [q.x, q.y])).toEqual(SOURCE.domains.nativeParcel.vertices);
    expect(parcelle.params.sommetsCadastraux.every((q) => q.frame === "cadastral" && q.crs === "EPSG:26191")).toBe(true);
    expect(parcelle.params.aire?.value).toBe(1345.5475500009647);
    expect(parcelle.params.aireOfficielle?.value).toBe(1346);
    expect(parcelle.params.aireCorrigeeImprimee?.value).toBe(1346.4787);
    expect(parcelle.params.sommetsLocaux).toBeUndefined();
  });

  it("héberge les 84 portes et 126 fenêtres sur leur mur (relations complètes)", () => {
    const heb = modele.relations.filter((r) => r.type === "heberge-par");
    expect(heb).toHaveLength(210);
    expect(modele.relations.filter((r) => r.type === "heberge")).toHaveLength(210);
    for (const b of [...deClasse("porte"), ...deClasse("fenetre")]) {
      expect(heb.filter((r) => r.sourceId === b.id).map((r) => r.cibleId)).toEqual([b.params.murHoteId]);
      expect(b.params.position.distance).toBeDefined();
    }
    expect(rapport.problemes.filter((p) => p.code === "hote-introuvable")).toEqual([]);
  });

  it("escaliers : 32 occurrences, relations « relie » seulement si les niveaux sont déclarés", () => {
    const esc = deClasse("escalier");
    expect(esc).toHaveLength(32);
    const relie = modele.relations.filter((r) => r.type === "relie");
    expect(relie.filter((r) => r.role === "depart")).toHaveLength(24);
    expect(relie.filter((r) => r.role === "arrivee")).toHaveLength(18);
    const sansNiveaux = esc.filter((e) => !e.params.niveauDepartId && !e.params.niveauArriveeId).map((e) => e.id).sort();
    expect(sansNiveaux).toHaveLength(8);
    expect(rapport.problemes.filter((p) => p.code === "niveaux-relies-absents" && p.gravite === "avertissement").flatMap((p) => p.objetIds).sort()).toEqual(sansNiveaux);
    const b1 = modele.objets["EX118-mezz-S-003"] as ObjetDe<"escalier">;
    expect(b1.params.contremarches).toEqual({ nonEvaluee: true, motif: "« risers » absent de la source" });
    expect(b1.params.epaisseurPaillasse).toMatchObject({ nonEvaluee: true });
    expect(b1.annotations?.referencePlanSeulement?.statut).toBe("a-verifier");
  });

  it("dalles : épaisseur 0,25 m « à vérifier », thickness 0,10 m conservé en propriété (D-021)", () => {
    const dalles = deClasse("dalle");
    expect(dalles).toHaveLength(6);
    for (const d of dalles) {
      expect(d.params.epaisseur).toEqual({ value: 0.25, unit: "m" });
      expect(d.annotations?.epaisseur).toMatchObject({ provenance: "import", statut: "a-verifier" });
      expect(prop(d, "import.thickness")).toMatchObject({ valeur: 0.1, unite: "m", provenance: "import", statut: "declaree" });
    }
    expect(deClasse("toiture").map((t) => [t.id, t.params.type, t.params.epaisseur.value])).toEqual([
      ["EX118-roof", "plate", 0.25],
    ]);
    // D-025 : l'acrotère (roof-slab annulaire) est un solide, géométrie et rôle conservés.
    const acrotere = deClasse("solide").find((o) => o.id === "EX118-parapet");
    expect(acrotere?.params).toMatchObject({ role: "roof-slab", hauteur: { value: 0.9, unit: "m" }, decalageBase: { value: 3.4, unit: "m" } });
    expect(acrotere?.params.trous).toHaveLength(1);
  });

  it("pièces : 41 tracés rattachés, 7 pièces sans tracé, 33 espaces, repères jamais mélangés (D-021, R5)", () => {
    const pieces = deClasse("piece");
    expect(pieces).toHaveLength(45);
    expect(pieces.reduce((n, p) => n + p.params.polygones.length, 0)).toBe(41);
    expect(pieces.filter((p) => p.params.polygones.length === 0).map((p) => p.id)).toEqual(["piece-rdc-R05", "piece-rdc-R07", "piece-mezz-M04", "piece-mezz-M06", "piece-r1-E07", "piece-r2-E07", "piece-r3-E07"]);
    expect(rapport.problemes.filter((p) => p.code === "piece-sans-trace")).toHaveLength(7);
    expect(deClasse("espace")).toHaveLength(33);
    for (const p of pieces) {
      for (const poly of p.params.polygones) for (const q of [...poly.contour, ...poly.trous.flatMap((t) => t.polygone)]) expect(q.repereLocal ?? REPERE_LOCAL_PROJET).toBe(REPERE_LOCAL_PROJET);
      for (const poly of p.params.polygonesSource ?? []) for (const q of poly.contour) expect(q.repereLocal).toBe(REPERE_PIECES_SOURCE);
      expect(p.params.etiquette?.repereLocal).toBe(REPERE_PIECES_SOURCE);
      expect(p.annotations?.aireDeclaree).toMatchObject({ provenance: "prototype", statut: "a-verifier" });
    }
    const s01 = modele.objets["piece-ss-S01"] as ObjetDe<"piece">;
    const roomS01 = (SOURCE.domains.floorDesign.levels.ss.rooms as Json[]).find((r) => r.code === "S01")!;
    expect(s01.params.aireDeclaree?.value).toBe(roomS01.area);
    expect(s01.params.polygonesSource?.[0]?.contour.map((q) => [q.x, q.y])).toEqual(roomS01.polygons[0].points);
    expect((prop(s01, "importeur.traces")?.valeur as Json[])[0]!.champs.id).toBe("EX118-ss-P-007");
    // Libellé divergent R04 (« 1,94 m » / « 2 m ») listé, les deux conservés.
    expect(rapport.problemes.some((p) => p.code === "piece-libelle-divergent" && p.objetIds.includes("piece-rdc-R04"))).toBe(true);
  });

  it("calques : union des 22 noms dans l'ordre de première apparition, présence par niveau", () => {
    const calques = deClasse("calque").sort((a, b) => a.params.ordre - b.params.ordre);
    expect(calques).toHaveLength(22);
    expect(calques.slice(0, 3).map((c) => c.params.nom)).toEqual(["Murs", "Cloisons", "Ouvertures"]);
    const gab = calques.find((c) => c.params.nom === "Gabarits accès")!;
    expect(gab.params).toMatchObject({ couleur: "#619b99", visible: false, verrouille: false, niveauxPresence: ["rdc", "mezz", "r1", "r2", "r3"] });
    expect(gab.params.remplissage).toBeUndefined();
    expect(calques.find((c) => c.params.nom === "Rampe sous-sol")!.params.niveauxPresence).toEqual(["ss"]);
    expect(rapport.problemes.filter((p) => p.code === "calque-non-declare" || p.code === "calque-divergent")).toEqual([]);
  });

  it("conserve bit à bit vertexOffsets, topOffsets, areas, meta et les hauteurs nulles", () => {
    const tous = niveauxSource.flatMap(([, lv]) => lv.paths as Json[]);
    const avec = (k: string) => tous.filter((p) => p[k] !== undefined && modele.objets[p.id]);
    expect(avec("vertexOffsets")).toHaveLength(104);
    expect(avec("topOffsets")).toHaveLength(19);
    for (const p of avec("vertexOffsets")) expect(prop(modele.objets[p.id]!, "import.vertexOffsets")?.valeur).toEqual(p.vertexOffsets);
    for (const p of avec("topOffsets")) expect(prop(modele.objets[p.id]!, "import.topOffsets")?.valeur).toEqual(p.topOffsets);
    expect(tous.filter((p) => p.height === 0)).toHaveLength(124);
    for (const [lid, lv] of niveauxSource) {
      expect(prop(modele.objets[lid]!, "import.areas")?.valeur).toEqual(lv.areas);
      expect(prop(modele.objets[lid]!, "import.meta")?.valeur).toEqual(lv.meta);
    }
    expect(modele.proprietesProjet.find((p) => p.nom === "import.meta.layoutV819")?.valeur).toEqual(SOURCE.domains.floorDesign.meta.layoutV819);
  });

  it("hypothèses et structure « à confirmer », jamais des exigences (R4)", () => {
    expect(deClasse("structureDeclaree")[0]).toMatchObject({ statut: "a-confirmer", params: { porteeRequise: { value: 20, unit: "m" }, charges: [{ value: 500, unit: "kg/m²" }, { value: 4.903325, unit: "kN/m²" }] } });
    expect(deClasse("hypothese").every((h) => h.statut === "a-confirmer")).toBe(true);
    expect(deClasse("hypothese").find((h) => h.params.code === "H01")?.params.theme).toBe("Implantation");
    expect(deClasse("source").map((s) => s.params.code)).toEqual(["CAD-S01", "S01", "S02", "S03", "REQ-PT", "RAMPE-REF", "REF-ESC-A", "ANN-RDC-V819", "REF-MEZZ-V819"]);
  });

  it("laisse ui et activeLayer hors du modèle et les liste (R10) ; aucun rôle inconnu", () => {
    expect(rapport.nonImporte.map((d) => d.chemin)).toEqual(["domains.ui.activeLevel", "domains.ui.showLegends", ...niveauxSource.map(([lid]) => `floorDesign.levels.${lid}.activeLayer`)]);
    expect(JSON.stringify(modele)).not.toContain("showLegends");
    expect(rapport.rolesInconnus).toEqual([]);
  });
});

describe("importerP118 — déterminisme et cas d'erreur", () => {
  it("est idempotent : deux imports → même modèle, même empreinte, indépendante de l'ordre d'insertion", () => {
    const b = importerP118(charger() as JeuDonneesP118);
    expect(b.modele).toEqual(modele);
    expect(b.rapport).toEqual(rapport);
    expect(b.modele.empreinte).toBe(modele.empreinte);
    expect(modele.empreinte).toMatch(/^sha256-[0-9a-f]{64}$/);
    const inverse: EtatModele = { ...modele, objets: Object.fromEntries(Object.entries(modele.objets).reverse()), relations: [...modele.relations].reverse() };
    expect(empreinteModele(inverse)).toBe(modele.empreinte);
    expect(rapport.empreinte).toBe(modele.empreinte);
  });

  it("préfixe les identifiants stables par le projet", () => {
    const { modele: m } = importerP118(SOURCE as JeuDonneesP118, { projetId: "p" });
    expect(m.objets["p_EX118-rdc-W-009"]?.niveauId).toBe("p_rdc");
    expect(m.objets["p_EX118-rdc-W-009"]?.calqueId).toBe("p_calque-Noyaux");
    expect(m.relations.every((r) => r.sourceId.startsWith("p_") && r.cibleId.startsWith("p_"))).toBe(true);
    expect(m.projetId).toBe("p");
  });

  it("liste un rôle inconnu, un hôte introuvable, un élément inconvertible — sans rien supprimer", () => {
    const d = charger();
    const rdc = d.domains.floorDesign.levels.rdc;
    rdc.paths[0].role = "pergola";
    rdc.doors[0].hostWallId = "MUR-ABSENT";
    rdc.texts.push({ id: "T-casse", kind: "text", text: "sans position", layer: "Cotations" });
    const { modele: m, rapport: r } = importerP118(d as JeuDonneesP118);
    expect(r.rolesInconnus).toEqual([{ role: "pergola", effectif: 1, objetIds: [rdc.paths[0].id] }]);
    expect((m.objets[rdc.paths[0].id] as ObjetDe<"solide">).params.role).toBe("pergola");
    expect(m.objets[rdc.doors[0].id]).toBeDefined();
    expect(r.problemes.some((p) => p.code === "hote-introuvable" && p.objetIds.includes(rdc.doors[0].id))).toBe(true);
    expect(r.problemes.some((p) => p.code === "parametre-invalide" && p.chemin === "floorDesign.levels.rdc.texts[18]")).toBe(true);
    const textes = r.lignes.find((l) => l.famille === "textes")!;
    expect([textes.effectifSource, textes.effectifCible]).toEqual([96, 95]);
    // L'élément inconvertible revient à son rang par la projection.
    const proj = projeterDomainesNatifs(m);
    expect(proj.domains.floorDesign.levels.rdc!.texts).toEqual(rdc.texts);
  });
});

// ---------------------------------------------------------------------------
// Rapport lisible (docs/atelier/lots/lot-1-rapport-import.md) avec les écarts de la projection.

function sansAffichage(domains: Json): Json {
  const { ui: _ui, ...reste } = domains;
  void _ui;
  const levels: Json = {};
  for (const [lid, lv] of Object.entries(reste.floorDesign.levels as Json)) {
    const { activeLayer: _a, ...l } = lv as Json;
    void _a;
    levels[lid] = l;
  }
  return { ...reste, floorDesign: { ...reste.floorDesign, levels } };
}

/** Écarts entre deux valeurs JSON, chemin par chemin (au plus `max`). */
function ecarts(a: unknown, b: unknown, chemin = "", max = 50, out: string[] = []): string[] {
  if (out.length >= max) return out;
  if (jsonCanonique(a) === jsonCanonique(b)) return out;
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) a.forEach((x, i) => ecarts(x, b[i], `${chemin}[${i}]`, max, out));
  else if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) ecarts((a as Json)[k], (b as Json)[k], chemin ? `${chemin}.${k}` : k, max, out);
  } else out.push(`${chemin} : ${JSON.stringify(a)?.slice(0, 80)} ≠ ${JSON.stringify(b)?.slice(0, 80)}`);
  return out;
}

function comparerAnalyses() {
  const avant = analyseModel({
    nativeId: SOURCE.nativeId,
    levels: SOURCE.domains.levels as NativeLevelLike[],
    floor: SOURCE.domains.floorDesign as NativeFloorDesignLike,
    parcel: SOURCE.domains.nativeParcel,
    footprint: SOURCE.domains.buildingFootprint.vertices,
  });
  const apres = analyseModel(projeterEntreeAnalyse(modele));
  return { avant, apres };
}

describe("rapport d'import lisible", () => {
  it("est à jour dans docs/atelier/lots/lot-1-rapport-import.md", () => {
    const proj = projeterDomainesNatifs(modele);
    const ecartsDomaines = ecarts(proj.domains, sansAffichage(SOURCE.domains));
    const { avant, apres } = comparerAnalyses();
    const racine = Object.fromEntries(Object.entries(SOURCE).filter(([k]) => k !== "domains"));
    const md = rapportImportMarkdown(rapport, [
      {
        titre: "Projection modèle typé → entrée d'analyse (§5.6)",
        lignes: [
          "`projeterDomainesNatifs(modele)` reconstruit `levels`, `floorDesign`, `nativeParcel`, `buildingFootprint` et la racine ; `projeterEntreeAnalyse` donne l'entrée de `analyseModel` (forme de `apps/api/src/lib/model-context.ts`).",
          "",
          `- Domaines projetés comparés à la source (sans \`ui\` ni \`activeLayer\`, valeurs canoniques) : **${ecartsDomaines.length === 0 ? "identiques" : `${ecartsDomaines.length} écart(s)`}**.`,
          `- Racine (\`sourceVersion\`, \`exampleId\`, \`nativeId\`, \`registry\`…) : **${jsonCanonique(proj.racine) === jsonCanonique(racine) ? "identique" : "différente"}**.`,
          `- Objets non représentables dans la forme native : ${proj.omis.length === 0 ? "aucun" : proj.omis.map((o) => `${o.objetId} (${o.motif})`).join(" ; ")}.`,
          `- \`analyseModel\` : \`floors\` (${apres.floors.length}) **${jsonCanonique(apres.floors) === jsonCanonique(avant.floors) ? "identiques" : "différents"}** ; \`rooms\` (${apres.rooms.length}) **${jsonCanonique(apres.rooms) === jsonCanonique(avant.rooms) ? "identiques" : "différents"}** (aires, usages, ouvertures, mobilier, contours, centres, ordre).`,
          `- \`nativeHash\` : ${avant.nativeHash === apres.nativeHash ? "identique" : `**différent** (${avant.nativeHash} → ${apres.nativeHash})`} — empreinte FNV-1a de la sérialisation JSON : l'ordre des clés des objets n'est pas conservé par le modèle typé et \`activeLayer\` (état d'affichage, R10) n'est plus présent. Conséquence au lot 4 : les documents et étapes datés par \`nativeHash\` seront marqués « à recalculer » une fois, à la bascule.`,
          ...ecartsDomaines.map((e) => `  - ${e}`),
        ],
      },
    ]);
    if (process.env.ECRIRE_RAPPORT === "1") writeFileSync(URL_RAPPORT, md);
    expect(readFileSync(URL_RAPPORT, "utf8")).toBe(md);
  });
});
