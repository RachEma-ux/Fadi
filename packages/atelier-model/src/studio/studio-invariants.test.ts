import { describe, expect, it } from "vitest";
import { applyStudioCommands, measureStudioDimension, measureStudioAngularDimension, newStudioDocument, StudioValidationError, validateStudioDocument, type StudioCommand, type StudioDocument } from "./document-2d.js";
import { applyToStudioHistory, createStudioHistory, undoStudioHistory } from "./history.js";
import { studioChevauchements, studioElementsModifies } from "./concurrence.js";
import { studioMesh3d } from "./mesh-3d.js";
import { projectionsAInvalider, studioAssemblerMaillage, studioMaillerObjets, studioMesh3dIncremental, studioVersionProjection, type StudioMorceauMaillage } from "./projections.js";
import { quantitesStudio } from "./quantites.js";
import { appliquerAjustementsEnregistres, etatCibleQuantite, evaluerAjustementsQuantites, type AjustementQuantiteEnregistre } from "./quantites-ajustements.js";
import { controlerExigences, preparerVersion, validerExigences, type ExigenceStudio } from "./facade-exigences.js";
import { studioPlanArchitecture } from "./architecture/index.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "./registry.js";

/**
 * Suite `studio-invariants` — modèle pur (X.2-01, X.2-03, X.2-04). Invariants du référentiel technique (REF-02,
 * STUDIO-RT-001 §2.4, INV-001 à INV-015) et défauts éliminatoires (Plan §7.3 ; Checklist BLOC-01, BLOC-04) qui se
 * prouvent au niveau le plus bas : `packages/atelier-model`, sans React, DOM, base ni réseau. Côté serveur :
 * `apps/api/src/routes/studio-invariants.test.ts` ; interface : `apps/web/src/modules/studio/studio-invariants.test.ts`.
 *
 * Convention de titre, lue par `apps/api/src/testing/studio-tracabilite.test.ts` (génère et vérifie
 * `docs/ai-team/reports/claude-v9-x2/INVARIANTS.md`) : `INV-xxx [+]` scénario positif, `INV-xxx [−]` scénario d'échec
 * (la violation est tentée : elle est refusée, ou ne se produit pas) ; `X.2-03 [−]` validation centrale à l'exécution.
 * Les dimensions du mur reprennent le cas d'essai géométrique de REF-02 §4.5 (6 × 3 × 0,2 m, baie 1 × 2,1 m), qui n'est
 * pas une méthode de métré.
 */

const c = (x: unknown) => x as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(c));
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return e instanceof StudioValidationError ? e.message : `autre erreur : ${String(e)}`; } return "accepté"; };
const mur = { id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center" };
const baie = { id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0 };
const murEtBaie = () => avec(newStudioDocument("inv"), { toolId: "studio.architecture.mur", params: mur }, { toolId: "studio.architecture.ouverture", params: baie });
const valeur = (doc: StudioDocument, id: string, g: string) => quantitesStudio(doc).objets.find((o) => o.objetId === id)?.valeurs.find((v) => v.grandeur === g)?.valeur;
const ligne = (id: string, y: number) => ({ toolId: "studio.dessin.ligne", params: { id, type: "line", start: { x: 0, y }, end: { x: 4, y } } });
const gele = <T>(v: T): T => { if (v && typeof v === "object") { for (const x of Object.values(v)) gele(x); Object.freeze(v); } return v; };

describe("INV-002 / BLOC-01 — une définition architecturale associée possède une autorité unique", () => {
  it("INV-002 BLOC-01 [+] le plan 2D et le maillage 3D se dérivent du seul objet du document : une commande les change ensemble", () => {
    const d1 = murEtBaie();
    const d2 = avec(d1, { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } });
    for (const d of [d1, d2]) {
      expect(studioMesh3d(d).architecture!.map((m) => m.id)).toEqual(d.architecture!.map((a) => a.id));
      expect(studioPlanArchitecture(d.architecture).ouvertures.map((o) => [o.id, o.hostId])).toEqual([["o1", "m1"]]);
    }
    // Même identité, même définition : le plan (montants écartés de la largeur), la 3D et le métré suivent ensemble.
    const ecart = (d: StudioDocument) => {
      const m = studioPlanArchitecture(d.architecture).ouvertures[0]!.montants;
      const a = m[0]![0], b = m[1]![0];
      return Math.hypot(b.x - a.x, b.y - a.y);
    };
    expect(ecart(d1)).toBeCloseTo(1, 12);
    expect(ecart(d2)).toBeCloseTo(1.2, 12);
    expect(valeur(d2, "m1", "volume-net")).toBeCloseTo(3.096, 12);
    // Le document ne porte aucune projection : le maillage n'est jamais une seconde copie stockée.
    expect(Object.keys(d2).sort()).toEqual(["architecture", "frame", "id", "objects", "schemaVersion", "units"]);
  });
  it("INV-002 BLOC-01 [−] une seconde copie autoritaire est refusée : identifiant réemployé, projection stockée dans le document", () => {
    const d = murEtBaie();
    expect(refus(() => avec(d, { toolId: "studio.architecture.mur", params: { ...mur, axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }] } }))).toMatch(/identifiant déjà utilisé|déjà/);
    expect(refus(() => avec(d, ligne("m1", 9)))).toMatch(/identifiant déjà utilisé|déjà/);
    expect(refus(() => validateStudioDocument({ ...d, maillage3d: studioMesh3d(d) }))).not.toBe("accepté");
    expect(refus(() => validateStudioDocument({ ...d, architecture: [...d.architecture!, { ...mur }] }))).not.toBe("accepté");
  });
});

describe("INV-003 — une copie indépendante ne propage pas vers son origine", () => {
  const copier = { toolId: "studio.dessin.copier", params: { ids: ["m1"], dx: 0, dy: 3, copies: 1, prefix: "k" } };
  it("INV-003 [+] copier : nouvelles identités ; modifier la copie ne touche pas la source, modifier la source ne touche pas la copie", () => {
    const d = avec(murEtBaie(), copier);
    const ids = d.architecture!.map((a) => a.id);
    expect(ids).toEqual(["m1", "o1", "k-1-0", "k-1-0-o0"]);
    const source = structuredClone(d.architecture!.filter((a) => a.id === "m1" || a.id === "o1"));
    const copie = structuredClone(d.architecture!.filter((a) => a.id.startsWith("k-")));
    const copieModifiee = avec(d, { toolId: "studio.architecture.modifier", params: { ...copie[1], width: 0.8 } });
    expect(copieModifiee.architecture!.filter((a) => a.id === "m1" || a.id === "o1")).toEqual(source);
    const sourceModifiee = avec(d, { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } }, { toolId: "studio.dessin.rotation", params: { ids: ["m1"], center: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    expect(sourceModifiee.architecture!.filter((a) => a.id.startsWith("k-"))).toEqual(copie);
    expect(valeur(sourceModifiee, "k-1-0", "volume-net")).toBeCloseTo(3.18, 12);
  });
  it("INV-003 [−] une copie qui réemploierait une identité existante est refusée en entier (aucune copie partielle)", () => {
    const d = avec(murEtBaie(), ligne("k-1-0", 9));
    const avant = structuredClone(d);
    expect(refus(() => avec(d, copier))).toMatch(/identifiant déjà utilisé|déjà/);
    expect(d).toEqual(avant);
  });
});

describe("INV-004 — une exigence approuvée reste distincte du résultat de conception", () => {
  const exigence: ExigenceStudio = { id: "e1", libelle: "Volume net des murs", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 3.1, unite: "m3", source: "Programme saisi (essai)" };
  it("INV-004 [+] le contrôle mesure le document et rend un écart ; ni l'exigence ni le document ne sont réécrits", () => {
    const jeu = gele({ version: 1, exigences: [exigence] });
    const d1 = gele(murEtBaie());
    const r1 = controlerExigences("s", "r1", d1, jeu);
    expect(r1.ecarts[0]).toMatchObject({ exigenceId: "e1", statut: "non-satisfaite" });
    const d2 = avec(d1, { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } });
    expect(controlerExigences("s", "r2", d2, jeu).ecarts[0]).toMatchObject({ statut: "satisfaite" });
    // Le résultat de conception a changé, l'exigence non (objets gelés : toute écriture aurait levé une erreur).
    expect(jeu.exigences[0]).toEqual(exigence);
    expect(d1.architecture![1]).toMatchObject({ width: 1 });
  });
  it("INV-004 [−] une exigence ne s'écrit pas dans le document, et une acceptation ne vient jamais du client", () => {
    const d = murEtBaie();
    expect(refus(() => validateStudioDocument({ ...d, exigences: [exigence] }))).not.toBe("accepté");
    expect(refus(() => avec(d, { toolId: "studio.exigence.definir", params: exigence }))).not.toBe("accepté");
    const partenaire = { ...exigence, origine: { reference: "Référence partenaire R-1", acceptation: { par: "client", le: "2026-10-19T08:00:00.000Z" } } };
    expect(preparerVersion([], [partenaire])).toEqual({ refus: "acceptation-forgee", exigenceId: "e1" });
  });
});

describe("INV-005 — une opération rejetée ne modifie pas partiellement les données canoniques", () => {
  it("INV-005 [+] un lot valide s'applique en entier, comme un seul pas d'historique", () => {
    const h = applyToStudioHistory(createStudioHistory(newStudioDocument("d")), [c(ligne("a", 0)), c(ligne("b", 1))]);
    expect(h.present.objects.map((o) => o.id)).toEqual(["a", "b"]);
    expect(h.past).toHaveLength(1);
  });
  it("INV-005 [−] un lot dont une commande échoue ne laisse rien : document d'entrée et historique intacts", () => {
    const base = gele(murEtBaie());
    const avant = structuredClone(base);
    expect(refus(() => avec(base, ligne("a", 0), ligne("b", 1), { toolId: "studio.architecture.modifier", params: { ...baie, position: 5.8 } }))).toMatch(/commands\[2\]/);
    expect(base).toEqual(avant);
    const h = createStudioHistory(base);
    expect(() => applyToStudioHistory(h, [c(ligne("a", 0)), c({ toolId: "studio.dessin.deplacer", params: { id: "inconnu", dx: 1, dy: 0 } })])).toThrow(StudioValidationError);
    expect(h.present).toEqual(avant);
    expect(h.past).toHaveLength(0);
  });
});

describe("INV-006 / BLOC-04 — un résultat dérivé ancien est identifiable et n'écrase pas le résultat courant", () => {
  /** Ajustement enregistré sur la révision `revisionId` du document `doc` (état de la cible posé comme le serveur). */
  function ajustement(doc: StudioDocument, revisionId: string, valeurAjustee: number): AjustementQuantiteEnregistre {
    const cible = { type: "objet" as const, id: "m1" };
    const e = etatCibleQuantite(doc, quantitesStudio(doc), cible, "volume-net");
    if ("refus" in e) throw new Error(e.refus);
    return { id: "aj1", sequence: 1, revisionId, cible, grandeur: "volume-net", unite: "m3", valeur: valeurAjustee, motif: "Relevé (essai)", derivee: e.derivee, etatCible: e.etat, auteur: "u", date: "2026-10-19T08:00:00.000Z" };
  }
  it("INV-006 BLOC-04 [+] un ajustement saisi sur la révision courante s'applique ; la clé de projection nomme sa révision", () => {
    const d = murEtBaie();
    const q = quantitesStudio(d);
    const ev = evaluerAjustementsQuantites(d, q, [ajustement(d, "r1", 3.2)]);
    expect(ev.objets.map((a) => a.id)).toEqual(["aj1"]);
    const applique = appliquerAjustementsEnregistres(q, ev, { calques: true });
    expect(applique.objets.find((o) => o.objetId === "m1")!.valeurs.find((v) => v.grandeur === "volume-net")).toMatchObject({ derivee: expect.closeTo(3.18, 12), retenue: 3.2 });
    expect(studioVersionProjection(d, "maillage-3d", "r1")).toMatchObject({ projection: "maillage-3d", revision: "r1" });
  });
  it("INV-006 BLOC-04 [−] la cible a changé depuis : l'ajustement ancien est « à revoir », jamais appliqué ; la valeur courante reste la brute", () => {
    const d1 = murEtBaie();
    const d2 = avec(d1, { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } });
    const q2 = quantitesStudio(d2);
    const ev = evaluerAjustementsQuantites(d2, q2, [ajustement(d1, "r1", 3.2)]);
    expect(ev.objets).toEqual([]);
    expect(ev.journal[0]).toMatchObject({ statut: "a-revoir", revue: "cible-modifiee" });
    const v = appliquerAjustementsEnregistres(q2, ev, { calques: true }).objets.find((o) => o.objetId === "m1")!.valeurs.find((x) => x.grandeur === "volume-net")!;
    expect(v.retenue).toBeCloseTo(3.096, 12);
    expect(v.aRevoir?.id).toBe("aj1");
    // Une projection calculée pour l'ancienne révision ne se confond pas avec la courante.
    expect(studioVersionProjection(d1, "maillage-3d", "r1")).not.toEqual(studioVersionProjection(d2, "maillage-3d", "r2"));
  });
});

describe("INV-007 — une optimisation préserve les résultats métier dans les tolérances déclarées", () => {
  /** Suite de documents : chaque pas est une commande ordinaire. */
  function suite(): StudioDocument[] {
    const docs = [murEtBaie()];
    const pas = [
      ligne("l1", 5), { toolId: "studio.dessin.rectangle", params: { id: "r1", type: "rectangle", origin: { x: 0, y: 8 }, width: 2, height: 1 } },
      { toolId: "studio.objet.extruder", params: { ids: ["r1"], base: 0, height: 3 } }, { toolId: "studio.architecture.modifier", params: { ...baie, width: 1.2 } },
      { toolId: "studio.dessin.deplacer", params: { id: "l1", dx: 1, dy: 0 } }, { toolId: "studio.dessin.supprimer", params: { ids: ["l1"] } },
    ];
    for (const p of pas) docs.push(avec(docs.at(-1)!, p));
    return docs;
  }
  it("INV-007 [+] le maillage incrémental (seuls les objets invalidés sont remaillés) est identique au maillage complet à chaque pas", () => {
    let cache = null as Parameters<typeof studioMesh3dIncremental>[1];
    for (const d of suite()) {
      const r = studioMesh3dIncremental(d, cache);
      expect(r.mesh).toEqual(studioMesh3d(d));
      if (cache) expect(r.remailles.length).toBeLessThanOrEqual(r.invalidation.complet ? Infinity : r.invalidation.ids.length);
      cache = r.cache;
    }
  });
  it("INV-007 [−] un cache d'un autre document ou d'une autre version n'est jamais réutilisé tel quel : reconstruction, même résultat", () => {
    const docs = suite();
    const autre = studioMesh3dIncremental(avec(newStudioDocument("autre"), ligne("l1", 0)), null).cache;
    const r = studioMesh3dIncremental(docs.at(-1)!, autre);
    expect(r.invalidation).toMatchObject({ complet: true, raison: "document" });
    expect(r.mesh).toEqual(studioMesh3d(docs.at(-1)!));
    // Cache du premier document présenté au dernier : seuls les objets dont la clé change sont repris, résultat exact.
    const ancien = studioMesh3dIncremental(docs[0]!, null).cache;
    expect(studioMesh3dIncremental(docs.at(-1)!, ancien).mesh).toEqual(studioMesh3d(docs.at(-1)!));
  });
});

describe("INV-008 — un cache, un index ou une projection est reconstruisible depuis la donnée de référence", () => {
  it("INV-008 [+] sans aucun cache, la projection se reconstruit entièrement depuis le document (premier calcul)", () => {
    const d = avec(murEtBaie(), ligne("l1", 5));
    expect(projectionsAInvalider(null, d)).toMatchObject({ complet: true, raison: "premier" });
    expect(studioAssemblerMaillage(d, new Map())).toEqual(studioMesh3d(d));
    expect(studioMesh3dIncremental(d, null).mesh).toEqual(studioMesh3d(d));
  });
  it("INV-008 [−] des morceaux altérés (clé périmée, objet disparu) ne sont pas crus : ils sont remaillés depuis le document", () => {
    const d = avec(murEtBaie(), ligne("l1", 5));
    const vrais = new Map(studioMaillerObjets(d, null).map((m) => [m.id, m]));
    const faux = new Map<string, StudioMorceauMaillage>([...vrais].map(([id, m]): [string, StudioMorceauMaillage] => [id, { id: m.id, cle: `${m.cle}-perimee`, hidden: true }]));
    faux.set("fantome", { id: "fantome", cle: "x", hidden: true });
    expect(studioAssemblerMaillage(d, faux)).toEqual(studioMesh3d(d));
  });
});

describe("INV-010 — une requête IA ou extension passe par les mêmes validations centrales qu'une action humaine", () => {
  it("INV-010 [+] le registre n'ouvre aucun point d'entrée d'agent : toute mutation est une commande du même noyau", () => {
    expect(STUDIO_TOOLS.every((t) => t.agentExposure === "none")).toBe(true);
    expect([...STUDIO_COMMAND_TOOL_IDS].sort()).toEqual(STUDIO_TOOLS.filter((t) => t.nature === "mutation").map((t) => t.toolId).sort());
    // Une commande produite par un agent est une commande : même résultat que celle de l'interface.
    expect(avec(newStudioDocument("d"), structuredClone(ligne("a", 0)))).toEqual(avec(newStudioDocument("d"), ligne("a", 0)));
  });
  it("INV-010 [−] le noyau refuse, sans l'API, une commande forgée (outil inconnu, paramètre en plus, outil de lecture)", () => {
    const d = newStudioDocument("d");
    expect(refus(() => avec(d, { toolId: "studio.agent.ecrire", params: {} }))).not.toBe("accepté");
    expect(refus(() => avec(d, { ...ligne("a", 0), params: { ...ligne("a", 0).params, auteur: "agent" } }))).not.toBe("accepté");
    expect(refus(() => avec(d, { toolId: "studio.dessin.selection", params: {} }))).not.toBe("accepté");
  });
});

describe("INV-011 — les annulations concurrentes ne détruisent pas silencieusement le travail d'un autre acteur", () => {
  const base = avec(newStudioDocument("d"), ligne("a", 0));
  const teteB = avec(base, { toolId: "studio.dessin.deplacer", params: { id: "a", dx: 0, dy: 2 } });
  it("INV-011 [+] A annule son propre pas (élément distinct) : aucun chevauchement, le report garde le changement de B", () => {
    const h = undoStudioHistory(applyToStudioHistory(createStudioHistory(base), [c(ligne("b", 5))]));
    expect(studioChevauchements(base, h.present, teteB)).toEqual([]);
    const reporte = avec(teteB, ligne("b", 5), { toolId: "studio.dessin.supprimer", params: { ids: ["b"] } });
    expect(reporte).toEqual(teteB);
  });
  it("INV-011 [−] l'annulation de A retirerait l'objet modifié par B : chevauchement signalé, jamais résolu en silence", () => {
    // A avait créé `a` (base) ; son annulation le retire, alors que B l'a déplacé sur la tête.
    const h = undoStudioHistory(applyToStudioHistory(createStudioHistory(newStudioDocument("d")), [c(ligne("a", 0))]));
    expect(studioChevauchements(base, h.present, teteB)).toEqual(["objects:a"]);
    expect(studioElementsModifies(base, teteB)).toEqual(["objects:a"]);
  });
});

describe("INV-013 / BLOC-01 — une annotation référencée à une face modifiée est conservée avec correspondance vérifiée ou marquée « à résoudre »", () => {
  const poly = { id: "p", type: "polyline", points: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], closed: false };
  const cote = { id: "k", type: "dimension", start: { x: 4, y: 0 }, end: { x: 4, y: 3 }, offset: 0.5, links: { start: { objectId: "p", anchor: "vertex-1" }, end: { objectId: "p", anchor: "vertex-2" } }, toResolve: false };
  const ligneH = { toolId: "studio.dessin.ligne", params: { id: "h", type: "line", start: { x: 6, y: 0 }, end: { x: 9, y: 0 } } };
  const angle = { id: "ang", type: "angular-dimension", vertex: { x: 4, y: 0 }, first: { x: 4, y: 3 }, second: { x: 9, y: 0 }, radius: 1, links: { first: { objectId: "p", segment: 1 }, second: { objectId: "h", segment: 0 } }, toResolve: false };
  const base = () => avec(newStudioDocument("d"), { toolId: "studio.dessin.polyligne", params: poly }, ligneH, { toolId: "studio.dessin.cote", params: cote }, { toolId: "studio.dessin.cote-angulaire", params: angle });
  const modifier = (d: StudioDocument, points: { x: number; y: number }[]) => avec(d, { toolId: "studio.dessin.modifier", params: { ...poly, points } });

  it("INV-013 BLOC-01 [+] sommet déplacé (même topologie) : la cote suit le même sommet ; sommet ajouté en fin : correspondance vérifiée, liens gardés", () => {
    const d = modifier(base(), [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }]);
    expect(d.dimensions![0]).toMatchObject({ end: { x: 4, y: 5 }, toResolve: false, links: cote.links });
    expect(measureStudioDimension(d, "k")?.value).toBeCloseTo(5, 12);
    const e = modifier(base(), [...poly.points, { x: 8, y: 3 }]);
    expect(e.dimensions![0]).toMatchObject({ start: cote.start, end: cote.end, toResolve: false, links: cote.links });
    expect(e.annotations![0]).toMatchObject({ toResolve: false, links: angle.links });
  });
  it("INV-013 BLOC-01 [−] segment coté divisé (sommet inséré) : liens rompus, cotes « à résoudre », géométrie gardée, valeur non évaluée", () => {
    const d = modifier(base(), [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }]);
    // Avant correctif, la cote suivait en silence les sommets de même rang : (2, 0)–(4, 0), 2 m au lieu de 3 m.
    expect(d.dimensions![0]).toMatchObject({ start: cote.start, end: cote.end, links: { start: null, end: null }, toResolve: true });
    expect(measureStudioDimension(d, "k")?.value ?? null).toBeNull();
    expect(d.annotations![0]).toMatchObject({ vertex: angle.vertex, first: angle.first, links: { first: null, second: angle.links.second }, toResolve: true });
    expect(measureStudioAngularDimension(d, "ang")?.value ?? null).toBeNull();
    expect(validateStudioDocument(d)).toEqual(d);
    // Sommet coté retiré : la commande reste refusée en entier, la cote n'est jamais rattachée ailleurs.
    expect(refus(() => modifier(base(), [{ x: 0, y: 0 }, { x: 4, y: 3 }]))).toMatch(/introuvable/);
  });
});

describe("X.2-03 — les validations centrales s'exécutent à l'exécution, même pour des entrées que les types interdisent", () => {
  const d = () => avec(newStudioDocument("d"), ligne("a", 0));
  it.each([
    ["coordonnée NaN", (x: StudioDocument) => ({ ...x, objects: [{ ...x.objects[0], start: { x: Number.NaN, y: 0 } }] })],
    ["coordonnée infinie", (x: StudioDocument) => ({ ...x, objects: [{ ...x.objects[0], end: { x: Infinity, y: 0 } }] })],
    ["coordonnée en texte", (x: StudioDocument) => ({ ...x, objects: [{ ...x.objects[0], end: { x: "4", y: 0 } }] })],
    ["unité autre que le mètre", (x: StudioDocument) => ({ ...x, units: "mm" })],
    ["repère géographique mêlé au repère local", (x: StudioDocument) => ({ ...x, frame: "geographic" })],
    ["version de schéma inconnue", (x: StudioDocument) => ({ ...x, schemaVersion: "studio-document/9" })],
    ["identifiants en double", (x: StudioDocument) => ({ ...x, objects: [x.objects[0], x.objects[0]] })],
    ["champ hors schéma", (x: StudioDocument) => ({ ...x, auteur: "agent" })],
    ["clé __proto__", (x: StudioDocument) => JSON.parse(JSON.stringify(x).replace('"id":"a"', '"id":"a","__proto__":{"admin":true}'))],
    ["objets qui ne sont pas une liste", (x: StudioDocument) => ({ ...x, objects: { 0: x.objects[0] } })],
    ["type d'objet inconnu", (x: StudioDocument) => ({ ...x, objects: [{ ...x.objects[0], type: "mesh" }] })],
  ])("X.2-03 [−] validateStudioDocument refuse un document malformé : %s", (_cas, alterer) => {
    expect(() => validateStudioDocument(alterer(d()))).toThrow(StudioValidationError);
  });
  it.each([
    ["document nul", null], ["document en texte", "{}"], ["liste", []],
  ])("X.2-03 [−] validateStudioDocument refuse une entrée qui n'est pas un document : %s", (_cas, v) => {
    expect(() => validateStudioDocument(v)).toThrow(StudioValidationError);
  });
  it("X.2-03 [−] applyStudioCommands revalide ses entrées : lot qui n'est pas une liste, commande nulle, paramètres en liste, document altéré", () => {
    expect(() => applyStudioCommands(d(), null as never)).toThrow(StudioValidationError);
    expect(() => applyStudioCommands(d(), [null as never])).toThrow(StudioValidationError);
    expect(() => applyStudioCommands(d(), [c({ toolId: "studio.dessin.ligne", params: [] })])).toThrow(StudioValidationError);
    expect(() => applyStudioCommands({ ...d(), units: "ft" } as never, [c(ligne("b", 1))])).toThrow(StudioValidationError);
  });
  it("X.2-03 [−] les exigences sont revalidées à l'exécution : unité étrangère à la métrique, valeur non finie, source absente", () => {
    const e = { id: "e1", libelle: "L", metrique: { type: "total", grandeur: "volume-net" }, comparaison: "<=", valeur: 1, unite: "m3", source: "S" };
    expect(validerExigences([e], "x")).toHaveLength(1);
    for (const mauvaise of [{ ...e, unite: "l" }, { ...e, valeur: Number.NaN }, { ...e, source: "" }, { ...e, comparaison: "≈" }, { ...e, metrique: { type: "total", grandeur: "masse" } }]) {
      expect(() => validerExigences([mauvaise], "x")).toThrow(StudioValidationError);
    }
  });
});
