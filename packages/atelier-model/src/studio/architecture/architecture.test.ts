import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, validateStudioDocument, type StudioCommand, type StudioDocument } from "../document-2d.js";
import { exportStudioDxf, exportStudioSvg } from "../export.js";
import { exportStudioIfc, studioIfcSummary } from "../ifc.js";
import { studioMesh3d } from "../mesh-3d.js";
import { quantitesStudio } from "../quantites.js";
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_TOOLS } from "../registry.js";
import type { StudioOpening, StudioWall } from "./types.js";

/**
 * Murs et ouvertures (A.4) : création explicite, même identité en 2D et en 3D, refus atomique d'une ouverture devenue
 * incompatible, suppression avec cascade explicite, transformations qui emportent les ouvertures, exports et métré.
 *
 * REC-A-03 — dimensions **synthétiques sources** du registre (`docs/workstreams/studio/task-register.json`, test murRT001 :
 * « 6×3×0,2 m, ouverture 1×2,1 m → 3,600 brut / 0,420 déduction / 3,180 net ; ouverture 1,2 m → 0,504 déduction /
 * 3,096 net »), pas des valeurs de projet ni des règles : aucune autre déduction (jonction) dans ce cas.
 */

const mur = (over: Partial<StudioWall> = {}): StudioWall => ({ id: "m1", type: "wall", axis: [{ x: 0, y: 0 }, { x: 6, y: 0 }], thickness: 0.2, height: 3, base: 0, justification: "center", ...over });
const ouverture = (over: Partial<StudioOpening> = {}): StudioOpening => ({ id: "o1", type: "opening", hostId: "m1", position: 2.5, width: 1, height: 2.1, sill: 0, ...over });
const cmd = (c: unknown) => c as StudioCommand;
const avec = (doc: StudioDocument, ...cs: unknown[]) => applyStudioCommands(doc, cs.map(cmd));
const base = () => avec(newStudioDocument("rec-a-03"), { toolId: "studio.architecture.mur", params: mur() }, { toolId: "studio.architecture.ouverture", params: ouverture() });
const valeur = (doc: StudioDocument, id: string, g: string) => quantitesStudio(doc).objets.find((o) => o.objetId === id)?.valeurs.find((v) => v.grandeur === g)?.valeur;
const refus = (f: () => unknown): string => { try { f(); } catch (e) { return (e as Error).message; } return "accepté"; };

/** Volume d'un maillage fermé orienté (théorème de la divergence). */
function volumeMaillage(m: { vertices: { x: number; y: number; z: number }[]; triangles: [number, number, number][] }): number {
  let v = 0;
  for (const [a, b, c] of m.triangles) {
    const p = m.vertices[a]!, q = m.vertices[b]!, r = m.vertices[c]!;
    v += (p.x * (q.y * r.z - q.z * r.y) - p.y * (q.x * r.z - q.z * r.x) + p.z * (q.x * r.y - q.y * r.x)) / 6;
  }
  return v;
}

describe("REC-A-03 : mur 6 × 3 × 0,2 m, ouverture déclarée 1 × 2,1 m puis 1,2 × 2,1 m", () => {
  it("brut 3,600 m³, déduction 0,420 m³, net 3,180 m³ ; élargie à 1,20 m : déduction 0,504 m³, net 3,096 m³, mêmes identités", () => {
    const d1 = base();
    expect(valeur(d1, "m1", "volume")).toBeCloseTo(3.6, 12);
    expect(valeur(d1, "m1", "volume-deduit")).toBeCloseTo(0.42, 12);
    expect(valeur(d1, "m1", "volume-net")).toBeCloseTo(3.18, 12);
    expect(quantitesStudio(d1).deductions).toBe("ouvertures-declarees");
    // Élargissement « depuis l'autre planche » : même commande Modifier, même identifiant d'ouverture et de mur.
    const d2 = avec(d1, { toolId: "studio.architecture.modifier", params: ouverture({ width: 1.2 }) });
    expect(valeur(d2, "m1", "volume")).toBeCloseTo(3.6, 12);
    expect(valeur(d2, "m1", "volume-deduit")).toBeCloseTo(0.504, 12);
    expect(valeur(d2, "m1", "volume-net")).toBeCloseTo(3.096, 12);
    expect(d2.architecture?.map((x) => x.id)).toEqual(["m1", "o1"]);
    // La révision précédente est intacte (application sur copie privée).
    expect(valeur(d1, "m1", "volume-net")).toBeCloseTo(3.18, 12);
    // Le maillage 3D porte les mêmes identifiants et son volume est le volume net.
    const m = studioMesh3d(d2).architecture!;
    expect(m.map((x) => [x.id, x.type])).toEqual([["m1", "wall"], ["o1", "opening"]]);
    expect(volumeMaillage(m[0]!)).toBeCloseTo(3.096, 9);
    expect(volumeMaillage(m[1]!)).toBeCloseTo(0.504, 9);
  });

  it("sans ouverture déclarée, aucune déduction : un prisme posé sur une ligne extrudée n'est jamais une baie", () => {
    const d = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur() });
    expect(quantitesStudio(d).deductions).toBe("non-declarees");
    expect(valeur(d, "m1", "volume-net")).toBeCloseTo(3.6, 12);
    expect(valeur(d, "m1", "volume-deduit")).toBe(0);
  });
});

describe("Ouverture incompatible avec son mur : refus atomique, motif clair, rien n'est rogné", () => {
  const cas: [string, unknown[], RegExp][] = [
    ["hors du mur", [{ toolId: "studio.architecture.modifier", params: ouverture({ position: 5.5 }) }], /hors du mur hôte m1 \(position \+ largeur = 6\.5 m, au-delà de la longueur de l’axe 6 m\)/],
    ["plus haute que le mur", [{ toolId: "studio.architecture.modifier", params: ouverture({ sill: 1, height: 2.1 }) }], /plus haute que le mur hôte m1 \(allège \+ hauteur = 3\.1 m/],
    ["mur raccourci sous l'ouverture", [{ toolId: "studio.architecture.modifier", params: mur({ axis: [{ x: 0, y: 0 }, { x: 3, y: 0 }] }) }], /ouverture o1 incompatible avec son mur : hors du mur hôte m1/],
    ["mur abaissé sous l'ouverture", [{ toolId: "studio.architecture.modifier", params: mur({ height: 2 }) }], /ouverture o1 incompatible avec son mur : plus haute que le mur hôte m1/],
    ["chevauchement", [{ toolId: "studio.architecture.ouverture", params: ouverture({ id: "o2", position: 3 }) }], /ouvertures o1 et o2 : elles se chevauchent sur le mur hôte m1/],
    ["hôte qui n'est pas un mur", [{ toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 1, y: 0 } } }, { toolId: "studio.architecture.ouverture", params: ouverture({ id: "o2", hostId: "l1" }) }], /l’hôte l1 n’est pas un mur/],
  ];
  it.each(cas)("%s", (_nom, commandes, motif) => {
    const d = base();
    const avant = JSON.stringify(d);
    // Lot de deux commandes : la première, valable, est abandonnée avec la seconde (tout ou rien).
    const message = refus(() => avec(d, { toolId: "studio.dessin.ligne", params: { id: "temoin", type: "line", start: { x: 9, y: 9 }, end: { x: 10, y: 9 } } }, ...commandes));
    expect(message).toMatch(motif);
    expect(JSON.stringify(d)).toBe(avant);
  });

  it("deux ouvertures superposées en hauteur sans recouvrement sont admises (fenêtre au-dessus d'une porte)", () => {
    const d = avec(base(), { toolId: "studio.architecture.ouverture", params: ouverture({ id: "o2", sill: 2.3, height: 0.5, kind: "fenetre" }) });
    expect(valeur(d, "m1", "volume-deduit")).toBeCloseTo(0.42 + 0.1, 12);
  });

  it("un document enregistré incompatible est refusé à la validation", () => {
    const d = { ...newStudioDocument("x"), architecture: [mur(), ouverture({ width: 9 })] };
    expect(refus(() => validateStudioDocument(d))).toMatch(/studioDocument\.architecture : ouverture o1 incompatible avec son mur : hors du mur hôte m1/);
    expect(refus(() => validateStudioDocument({ ...newStudioDocument("x"), architecture: [{ ...mur(), extra: 1 }] }))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => validateStudioDocument({ ...newStudioDocument("x"), architecture: [ouverture()] }))).toMatch(/mur hôte m1 introuvable/);
  });

  it("aucune dimension par défaut : épaisseur, hauteur et justification sont exigées", () => {
    const { thickness: _e, ...sansEpaisseur } = mur();
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: sansEpaisseur }))).toMatch(/champs absents ou inconnus/);
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ thickness: 0 }) }))).toMatch(/épaisseur strictement positive attendue/);
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: { ...mur(), justification: "milieu" } }))).toMatch(/justification left, center ou right attendue/);
    expect(refus(() => avec(base(), { toolId: "studio.architecture.modifier", params: { ...ouverture(), kind: "garage" } }))).toMatch(/type déclaré porte, fenetre ou baie/);
  });
});

describe("Mur à axe polyligne : onglets, angle et jonctions", () => {
  const coude = mur({ id: "c", axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], justification: "left", thickness: 0.2, height: 2.5 });
  it("emprise exacte avec onglet (justification gauche) et volume brut", () => {
    const d = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: coude });
    // Corps à gauche d'un axe qui tourne à gauche : faces intérieures 3,8 et 2,8 m, extérieures 4 et 3 m.
    const aire = (4 * 0.2 - 0.2 * 0.2 / 2) + (3 * 0.2 - 0.2 * 0.2 / 2);
    expect(valeur(d, "c", "volume")).toBeCloseTo(aire * 2.5, 12);
    expect(valeur(d, "c", "longueur")).toBe(7);
  });
  it("une ouverture tient dans un seul segment, hors de la jonction d'angle", () => {
    const d = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: coude });
    const o = (position: number) => ({ toolId: "studio.architecture.ouverture", params: ouverture({ hostId: "c", position, width: 1, height: 2 }) });
    expect(refus(() => avec(d, o(3.5)))).toMatch(/à cheval sur le sommet 2 de l’axe du mur hôte c/);
    expect(refus(() => avec(d, o(2.9)))).toMatch(/empiète sur une jonction d’angle du mur hôte c \(partie courante du segment 1 : de 0 m à 3\.8 m/);
    const ok = avec(d, o(2.8), { toolId: "studio.architecture.ouverture", params: ouverture({ id: "o2", hostId: "c", position: 4.2, width: 1, height: 2 }) });
    expect(valeur(ok, "c", "volume-deduit")).toBeCloseTo(2 * 1 * 2 * 0.2, 12);
    expect(volumeMaillage(studioMesh3d(ok).architecture![0]!)).toBeCloseTo(valeur(ok, "c", "volume-net")!, 9);
  });
  it("demi-tour ou emprise qui se recoupe : mur refusé", () => {
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 0 }] }) }))).toMatch(/angle trop aigu au sommet 2 de l’axe : l’onglet dépasserait 4 fois l’épaisseur/);
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2 }, { x: 2, y: 2 }, { x: 2, y: -2 }] }) }))).toMatch(/se recoupe/);
  });
});

describe("Suppression : cascade explicite ou refus", () => {
  it("Supprimer (général) refuse un mur porteur d'ouvertures, la cascade explicite l'accepte", () => {
    const d = base();
    expect(refus(() => avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["m1"] } }))).toMatch(/le mur m1 porte 1 ouverture\(s\) \(o1\) : supprimez-les d’abord, ou utilisez « Supprimer le mur et ses ouvertures »/);
    expect(refus(() => avec(d, { toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: false } }))).toMatch(/le mur m1 porte 1 ouverture/);
    expect(avec(d, { toolId: "studio.architecture.supprimer", params: { ids: ["m1"], cascade: true } }).architecture).toBeUndefined();
    // Mur et ouverture choisis ensemble, ou ouverture d'abord : pas de cascade nécessaire.
    expect(avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["o1", "m1"] } }).architecture).toBeUndefined();
    expect(avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["o1"] } }).architecture?.map((x) => x.id)).toEqual(["m1"]);
  });
  it("sélection mixte : les formes sont supprimées par la commande générale, inchangée", () => {
    const d = avec(base(), { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 5 }, end: { x: 1, y: 5 } } });
    const r = avec(d, { toolId: "studio.dessin.supprimer", params: { ids: ["l1", "o1"] } });
    expect(r.objects).toEqual([]);
    expect(r.architecture?.map((x) => x.id)).toEqual(["m1"]);
  });
});

describe("Transformations : les ouvertures suivent leur mur", () => {
  it("Rotation : même identité, position le long de l'axe inchangée, volume net inchangé", () => {
    const r = avec(base(), { toolId: "studio.dessin.rotation", params: { ids: ["m1"], center: { x: 0, y: 0 }, angle: Math.PI / 2 } });
    const [w, o] = r.architecture as [StudioWall, StudioOpening];
    expect(w.axis).toEqual([{ x: 0, y: 0 }, { x: 0, y: 6 }]);
    expect(o).toEqual(ouverture());
    expect(valeur(r, "m1", "volume-net")).toBeCloseTo(3.18, 12);
  });
  it("Copier : le mur et ses ouvertures sont copiés (identifiants neufs), la source ne change pas", () => {
    const r = avec(base(), { toolId: "studio.dessin.copier", params: { ids: ["m1"], dx: 0, dy: 3, copies: 2, prefix: "k" } });
    expect(r.architecture?.map((x) => [x.id, x.type === "opening" ? x.hostId : null])).toEqual([["m1", null], ["o1", "m1"], ["k-1-0", null], ["k-1-0-o0", "k-1-0"], ["k-2-0", null], ["k-2-0-o0", "k-2-0"]]);
    expect(valeur(r, "k-2-0", "volume-net")).toBeCloseTo(3.18, 12);
  });
  it("Symétrie : la justification gauche devient droite (le corps reste du même côté de l'image)", () => {
    const d = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ justification: "left" }) });
    const r = avec(d, { toolId: "studio.dessin.symetrie", params: { ids: ["m1"], axisStart: { x: 0, y: -1 }, axisEnd: { x: 1, y: -1 }, keepSource: false } });
    expect((r.architecture![0] as StudioWall).justification).toBe("right");
  });
  it("Échelle : position et largeur suivent le facteur ; une ouverture devenue incompatible refuse la commande", () => {
    const r = avec(base(), { toolId: "studio.dessin.echelle", params: { ids: ["m1"], center: { x: 0, y: 0 }, factor: 2, includeVolumes: false } });
    expect(r.architecture![1]).toMatchObject({ position: 5, width: 2, height: 2.1, sill: 0 });
    // Mur coudé, épaisseur gardée : la jonction d'angle ne rétrécit pas avec l'axe, l'ouverture y empiéterait.
    const coude = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }], justification: "left" }) },
      { toolId: "studio.architecture.ouverture", params: ouverture({ position: 2.8, width: 1, height: 2 }) });
    const avant = JSON.stringify(coude);
    expect(refus(() => avec(coude, { toolId: "studio.dessin.echelle", params: { ids: ["m1"], center: { x: 0, y: 0 }, factor: 0.5, includeVolumes: false } }))).toMatch(/ouverture o1 incompatible avec son mur : empiète sur une jonction d’angle du mur hôte m1/);
    expect(JSON.stringify(coude)).toBe(avant);
  });
  it("Déplacer : le mur emporte ses ouvertures ; une ouverture seule ne se déplace pas hors de son mur", () => {
    const r = avec(base(), { toolId: "studio.dessin.deplacer", params: { id: "m1", dx: 1, dy: 2 } });
    expect((r.architecture![0] as StudioWall).axis[0]).toEqual({ x: 1, y: 2 });
    expect(refus(() => avec(base(), { toolId: "studio.dessin.deplacer", params: { id: "o1", dx: 1, dy: 0 } }))).toMatch(/l’ouverture o1 suit son mur m1/);
    expect(refus(() => avec(base(), { toolId: "studio.dessin.rotation", params: { ids: ["o1"], center: { x: 0, y: 0 }, angle: 1 } }))).toMatch(/l’ouverture o1 suit son mur m1/);
  });
  it("calque verrouillé : l'ouverture suit le verrou de son mur", () => {
    const d = avec(newStudioDocument("d"), { toolId: "studio.calque.creer", params: { id: "a", name: "A", visible: true, locked: false } }, { toolId: "studio.architecture.mur", params: mur({ layerId: "a" }) },
      { toolId: "studio.calque.modifier", params: { id: "a", name: "A", visible: true, locked: true } });
    expect(refus(() => avec(d, { toolId: "studio.architecture.ouverture", params: ouverture() }))).toMatch(/calque verrouillé/);
  });
});

describe("Exports : plan avec vides, IFC mur + ouverture", () => {
  it("SVG : deux parties pleines de part et d'autre de l'ouverture, montants ; DXF : deux POLYLINE et deux LINE", () => {
    const svg = exportStudioSvg(base());
    expect(svg.match(/<g data-architecture="wall" data-id="m1">/g)).toHaveLength(1);
    expect(svg.match(/<polygon /g)).toHaveLength(2);
    expect(svg).toContain('<g data-architecture="opening" data-id="o1" data-host="m1">');
    expect(svg).toContain('points="0,0.1 2.5,0.1 2.5,-0.1 0,-0.1"');
    const dxf = exportStudioDxf(base());
    expect(dxf.match(/\r\nPOLYLINE\r\n/g)).toHaveLength(2);
    expect(dxf.match(/\r\nLINE\r\n/g)).toHaveLength(2);
  });
  it("IFC : IfcWall, IfcOpeningElement relié par IfcRelVoidsElement ; IfcDoor / IfcWindow seulement si le type est déclaré", () => {
    const meta = { studyName: "É", variantName: "V", timestamp: "2026-10-19T00:00:00" };
    const sans = exportStudioIfc(base(), meta);
    expect(sans.match(/=IFCWALL\(/g)).toHaveLength(1);
    expect(sans.match(/=IFCOPENINGELEMENT\(/g)).toHaveLength(1);
    expect(sans.match(/=IFCRELVOIDSELEMENT\(/g)).toHaveLength(1);
    expect(sans).not.toMatch(/IFCDOOR|IFCWINDOW|IFCRELFILLSELEMENT/);
    const porte = avec(base(), { toolId: "studio.architecture.modifier", params: ouverture({ kind: "porte" }) }, { toolId: "studio.architecture.ouverture", params: ouverture({ id: "f1", position: 4.5, width: 1, sill: 1, height: 1.2, kind: "fenetre" }) },
      { toolId: "studio.architecture.ouverture", params: ouverture({ id: "b1", position: 0.5, width: 1, height: 2, kind: "baie" }) });
    const ifc = exportStudioIfc(porte, meta);
    expect(ifc.match(/=IFCDOOR\(/g)).toHaveLength(1);
    expect(ifc.match(/=IFCWINDOW\(/g)).toHaveLength(1);
    expect(ifc.match(/=IFCOPENINGELEMENT\(/g)).toHaveLength(3);
    expect(ifc.match(/=IFCRELFILLSELEMENT\(/g)).toHaveLength(2);
    expect(studioIfcSummary(porte).architecture).toEqual({ walls: 1, openings: 3, doors: 1, windows: 1 });
    expect(exportStudioIfc(porte, meta)).toBe(ifc);
  });
  it("un document sans architecture garde des sorties sans aucune trace de l'extension", () => {
    const d = newStudioDocument("vide");
    expect(studioMesh3d(d)).not.toHaveProperty("architecture");
    expect(studioIfcSummary(d)).not.toHaveProperty("architecture");
    expect(quantitesStudio(d).deductions).toBe("non-declarees");
  });
});

describe("Registre : une icône, une barre, un raccourci par outil architectural", () => {
  it("quatre mutations de la barre architecture, acceptées par l'API", () => {
    const outils = STUDIO_TOOLS.filter((t) => t.groupe === "architecture");
    expect(outils.map((t) => [t.toolId, t.raccourci, t.iconeSymbolique])).toEqual([
      ["studio.architecture.mur", "W", "studio-wall"], ["studio.architecture.ouverture", "H", "studio-opening"],
      ["studio.architecture.modifier", "J", "studio-architecture-edit"], ["studio.architecture.supprimer", "Ctrl+Delete", "studio-architecture-delete"],
    ]);
    for (const t of outils) expect(STUDIO_COMMAND_TOOL_IDS).toContain(t.toolId);
  });
});

describe("Limite d'onglet et borne de l'axe (bornes techniques déclarées, aucune norme)", () => {
  const virage = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return mur({ axis: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4 + 4 * Math.cos(a), y: 4 * Math.sin(a) }] });
  };
  it("déviation de l'axe jusqu'à 2·acos(1/4) ≈ 151° admise, au-delà refusée (pointe d'onglet > 4 × épaisseur)", () => {
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: virage(150) }))).toBe("accepté");
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: virage(152) }))).toMatch(/angle trop aigu au sommet 2/);
  });
  it("axe de 1024 points au plus", () => {
    const axe = (n: number) => Array.from({ length: n }, (_, i) => ({ x: i, y: (i % 2) * 0.5 }));
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ axis: axe(1024) }) }))).toBe("accepté");
    expect(refus(() => avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ axis: axe(1025) }) }))).toMatch(/mur m1 : axe de 1024 points au plus/);
  });
});

describe("Coût du contrôle : seuls les murs touchés sont recontrôlés (bornes larges, machine de CI)", () => {
  it("4 000 murs et 4 000 ouvertures en un lot : moins de 4 s", () => {
    const cs: unknown[] = [];
    for (let i = 0; i < 4000; i++) {
      cs.push({ toolId: "studio.architecture.mur", params: mur({ id: `m${i}`, axis: [{ x: 0, y: i }, { x: 6, y: i }] }) });
      cs.push({ toolId: "studio.architecture.ouverture", params: ouverture({ id: `o${i}`, hostId: `m${i}` }) });
    }
    const t0 = performance.now();
    const d = avec(newStudioDocument("d"), ...cs);
    const t = performance.now() - t0;
    expect(d.architecture).toHaveLength(8000);
    expect(t).toBeLessThan(4000);
  }, 30_000);
  it("mur de 1 024 points d'axe : création, puis vingt commandes et un export, chacun en moins de 500 ms", () => {
    const axis = Array.from({ length: 1024 }, (_, i) => ({ x: i, y: (i % 2) * 0.5 }));
    let t0 = performance.now();
    let d = avec(newStudioDocument("d"), { toolId: "studio.architecture.mur", params: mur({ axis }) }, { toolId: "studio.architecture.mur", params: mur({ id: "m2", axis: [{ x: 0, y: -5 }, { x: 6, y: -5 }] }) });
    expect(performance.now() - t0).toBeLessThan(500);
    for (let i = 0; i < 20; i++) {
      t0 = performance.now();
      d = avec(d, { toolId: "studio.dessin.ligne", params: { id: `l${i}`, type: "line", start: { x: 0, y: 9 + i }, end: { x: 1, y: 9 + i } } });
      expect(performance.now() - t0).toBeLessThan(500);
    }
    t0 = performance.now();
    exportStudioSvg(d);
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
