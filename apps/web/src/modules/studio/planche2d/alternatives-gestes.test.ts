/**
 * TR-EX-036 (ADR-STUDIO-PILOTE-01, P-12) : chaque geste a une alternative au clavier ou par saisie numérique — contrôle
 * automatisé sur le manifeste des outils (`STUDIO_MANIFESTE_OUTILS`). Pour chaque geste au pointeur, le chemin déclaré
 * est EXÉCUTÉ sans aucun événement de pointeur (fonctions pures des formulaires et panneaux) et doit produire la
 * commande de l'outil, acceptée par le modèle ; chaque commande a un raccourci ; chaque geste de vue a sa commande au
 * clavier. La bascule Planche 2D ⇄ 3D déplace le focus vers la planche qui apparaît (`variante/focus-bascule.ts`).
 */
import { describe, expect, it } from "vitest";
import { applyStudioCommands, newStudioDocument, STUDIO_MANIFESTE_OUTILS, STUDIO_TOOLS, type StudioCommand, type StudioDocument, type StudioSurfaceLibre } from "@parcours/atelier-model";
import { commandeEchelle, commandeModifierArchitecture, commandeMur, commandeOuverture, editionDe } from "./architecture/architecture-ui";
import { appliquerSaisie } from "./accrochage";
import { ALTERNATIVES_GESTES, ALTERNATIVES_GESTES_VUE, controlerAlternatives } from "./alternatives-gestes";
import { lireSommets } from "./geometrie-2d";
import { deplacer, groupesElements, ordreElements } from "./liste-elements";
import { COMMANDES_EDITEUR } from "./raccourcis";
import { commandesDeplacement, toutSelectionnable } from "./selection";
import { soumettre, VALEURS_INITIALES, type Valeurs } from "./outils/formulaire";
import type { ContexteCreation } from "./outils/type";
import { panoramiqueClavier, TOUCHES_PANORAMIQUE } from "./vue-clavier";
import { commandesExtrusion, VALEURS_VIDES } from "../vue3d/extrusion";
import { commandeBoite, commandeDeplacementSolide, commandeDivision, commandeFace, commandePivot, commandePrisme, BOITE_VIDE, PRISME_VIDE } from "../vue3d/volume-libre";
import { cibleFocusBascule, SELECTEURS_FOCUS_BASCULE } from "../variante/focus-bascule";
import { commandeModifierPole, commandeSurfacePlane, valeursPole } from "../vue3d/surfaces-ui";

let n = 0;
const creation: ContexteCreation = { nouvelId: () => `k${++n}`, layerId: undefined, decalageCote: 0.5, texte: { contenu: "Repère", hauteur: 0.25, rotation: 0, justification: "left" } };
/** Document d'essai : une ligne, une polyligne fermée, un mur, une boîte. */
const fixture = (): StudioDocument => applyStudioCommands(newStudioDocument("alt"), [
  { toolId: "studio.dessin.ligne", params: { id: "l1", type: "line", start: { x: 0, y: 0 }, end: { x: 4, y: 0 } } },
  { toolId: "studio.dessin.polyligne", params: { id: "p1", type: "polyline", points: [{ x: 10, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 2 }, { x: 10, y: 2 }], closed: true } },
  { toolId: "studio.architecture.mur", params: { id: "m1", type: "wall", axis: [{ x: 0, y: 5 }, { x: 6, y: 5 }], thickness: 0.2, height: 3, base: 0, justification: "center" } },
  { toolId: "studio.solide.boite", params: { id: "b1", type: "box", placement: { origin: { x: 20, y: 0, z: 0 }, rotation: 0 }, width: 1, depth: 1, height: 1 } },
]);
const valeurs = (v: Partial<Valeurs>): Valeurs => ({ ...VALEURS_INITIALES, ...v });
/** Chemin du formulaire « Valeurs en mètres » (aucun pointeur). */
function formulaire(doc: StudioDocument, tool: string, v: Partial<Valeurs> = {}, selection: string[] = [], extra: { sommetsTexte?: string; fermee?: boolean } = {}): StudioCommand[] {
  const selected = selection.length === 1 ? [...doc.objects, ...(doc.dimensions ?? []), ...(doc.annotations ?? [])].find((o) => o.id === selection[0]) ?? null : null;
  const a = soumettre({ tool: tool as never, values: valeurs(v), sommetsTexte: extra.sommetsTexte ?? "", fermee: extra.fermee ?? false, selected, selectionIds: selection, drawing: doc, creation, texte: { contenu: "Repère", justification: "left" } });
  if (a.type === "commandes") return a.commandes;
  if (a.type === "deplacer") return commandesDeplacement(doc, selection, a.dx, a.dy).commandes;
  // Décaler : la distance saisie produit une commande par objet sélectionné, comme l'espace de travail.
  if (a.type === "decaler") return selection.map((id, i) => ({ toolId: "studio.dessin.decaler", params: { id, newId: `dec-${i}`, distance: a.distance } }) as StudioCommand);
  throw new Error(`${tool} : ${a.type === "erreur" ? a.message : a.type}`);
}
const ok = (r: { commandes: StudioCommand[] } | { erreur: string }): StudioCommand[] => { if ("erreur" in r) throw new Error(r.erreur); return r.commandes; };
const mur = { epaisseur: 0.2, hauteur: 3, base: 0, justification: "center" as const };

/** Essais sans pointeur, par outil géré au pointeur : chaque essai rend les commandes que produit le chemin alternatif. */
const ESSAIS: Record<string, (d: StudioDocument) => StudioCommand[]> = {
  "studio.dessin.ligne": (d) => formulaire(d, "studio.dessin.ligne", { x: 1, y: 1, a: 3, b: 2 }),
  "studio.dessin.rectangle": (d) => formulaire(d, "studio.dessin.rectangle", { x: 1, y: 1, a: 3, b: 2 }),
  "studio.dessin.cercle": (d) => formulaire(d, "studio.dessin.cercle", { x: 1, y: 1, r: 2 }),
  "studio.dessin.arc": (d) => formulaire(d, "studio.dessin.arc", { x: 1, y: 1, r: 2, a0: 0, a1: 90 }),
  "studio.dessin.polyligne": (d) => formulaire(d, "studio.dessin.polyligne", {}, [], { sommetsTexte: "0 0; 4 0; 4 3" }),
  "studio.dessin.cote": (d) => formulaire(d, "studio.dessin.cote", { x: 0, y: 0, a: 4, b: 0, offset: 0.5 }),
  "studio.dessin.cote-angulaire": (d) => formulaire(d, "studio.dessin.cote-angulaire", { x: 0, y: 0, a: 4, b: 0, c: 0, d: 4, ra: 1 }),
  "studio.dessin.texte": (d) => formulaire(d, "studio.dessin.texte", { x: 1, y: 1, h: 0.25, rot: 0 }),
  "studio.dessin.deplacer": (d) => formulaire(d, "studio.dessin.deplacer", { dx: 1, dy: 0 }, ["l1"]),
  "studio.dessin.modifier": (d) => formulaire(d, "studio.dessin.modifier", { x: 0, y: 0, a: 5, b: 0 }, ["l1"]),
  "studio.dessin.decaler": (d) => formulaire(d, "studio.dessin.decaler", { distance: 0.5 }, ["l1"]),
  "studio.dessin.copier": (d) => formulaire(d, "studio.dessin.copier", { dx: 0, dy: 2, copies: 1 }, ["l1"]),
  "studio.dessin.rotation": (d) => formulaire(d, "studio.dessin.rotation", { x: 0, y: 0, angle: 90 }, ["l1"]),
  "studio.dessin.symetrie": (d) => formulaire(d, "studio.dessin.symetrie", { x: 0, y: -1, a: 4, b: -1, garder: 1 }, ["l1"]),
  "studio.dessin.echelle": (d) => formulaire(d, "studio.dessin.echelle", { x: 0, y: 0, facteur: 2, volumes: 0 }, ["l1"]),
  "studio.objet.extruder": (d) => ok(commandesExtrusion(d, ["l1"], { ...VALEURS_VIDES, base: 0, hauteur: 2.5, epaisseur: 0.2, direction: "+z" })),
  "studio.solide.boite": () => ok(commandeBoite({ ...BOITE_VIDE, x: 30, y: 0, z: 0, largeur: 1, profondeur: 2, hauteur: 3 }, "b2")),
  "studio.solide.prisme": (d) => ok(commandePrisme(d, { ...PRISME_VIDE, profil: "p1", cote: 0, hauteur: 3, relation: "copie-independante", direction: "+z" }, "pr1")),
  "studio.solide.deplacer": () => ok(commandeDeplacementSolide("b1", { dx: 1, dy: 0, dz: 0 })),
  "studio.solide.face-decaler": () => ok(commandeFace("b1", { face: "sommet", distance: 0.5 })),
  "studio.solide.face-diviser": () => ok(commandeDivision("b1", { face: "lateral-0", distance: 0.4 })),
  "studio.solide.pivoter": () => ok(commandePivot("b1", 30)),
  // X.1-05 : grille de pôles saisie ; pôle modifié saisi (ligne, colonne, position, poids), sans pointeur.
  "studio.surface.nurbs": () => ok(commandeSurfacePlane({ x: 40, y: 0, z: 0, largeur: 2, profondeur: 1, lignes: 3, colonnes: 2, degreU: 2, degreV: 1 }, "sf1")),
  "studio.surface.modifier": () => {
    const c = ok(commandeSurfacePlane({ x: 40, y: 0, z: 0, largeur: 2, profondeur: 1, lignes: 3, colonnes: 2, degreU: 2, degreV: 1 }, "sf2"));
    const s = c[0]!.params as StudioSurfaceLibre;
    return [...c, ...ok(commandeModifierPole(s, { ...valeursPole(s, 1, 0), z: 0.8, poids: 0.7 }))];
  },
  "studio.architecture.mur": () => ok(commandeMur(creation, lireSommets("0 8; 5 8")!, mur)),
  "studio.architecture.ouverture": () => ok(commandeOuverture(creation, "m1", 2, { largeur: 1, hauteur: 2.1, allege: 0, type: "porte" })),
  "studio.architecture.echelle-acces": () => ok(commandeEchelle(creation, { x: 1, y: 9 }, { largeur: 0.5, hauteur: 3, base: 0, echelons: 9, section: 0.04, orientation: 0 })),
  "studio.architecture.modifier": (d) => { const m = d.architecture![0]!; return ok(commandeModifierArchitecture(m, { ...editionDe(m), hauteur: 2.8 } as never, lireSommets)); },
};

describe("TR-EX-036 — chaque geste a une alternative au clavier ou par saisie numérique (contrôle sur le manifeste)", () => {
  const outils = STUDIO_MANIFESTE_OUTILS.entrees.map((e) => e.toolId);

  it("TR-EX-036 [+] chaque outil du manifeste a exactement une alternative déclarée ; chaque geste au pointeur a son essai sans pointeur", () => {
    expect(controlerAlternatives(outils)).toEqual([]);
    const gestes = outils.filter((id) => ALTERNATIVES_GESTES[id]!.type === "saisie-numerique");
    expect(gestes.filter((id) => !ESSAIS[id])).toEqual([]);
    expect(Object.keys(ESSAIS).filter((id) => ALTERNATIVES_GESTES[id]?.type !== "saisie-numerique")).toEqual([]);
  });

  it("TR-EX-036 [+] chaque saisie numérique déclarée produit, sans pointeur, la commande de l'outil, acceptée par le modèle", () => {
    for (const [id, essai] of Object.entries(ESSAIS)) {
      const doc = fixture();
      const commandes = essai(doc);
      expect(commandes.map((c) => c.toolId), id).toContain(id);
      expect(() => applyStudioCommands(doc, commandes), id).not.toThrow();
    }
  });

  it("TR-EX-036 [+] la sélection a son chemin clavier (liste des éléments, Ctrl+A) ; ligne et polyligne acceptent la saisie directe de longueur et d'angle", () => {
    const doc = fixture();
    const ordre = ordreElements(groupesElements(doc));
    expect(deplacer(ordre, null, "premier")).toBe(ordre[0]);
    expect(deplacer(ordre, ordre[0]!, "suivant")).toBe(ordre[1]);
    expect(toutSelectionnable(doc)).toEqual(expect.arrayContaining(["l1", "p1"]));
    expect(COMMANDES_EDITEUR.find((c) => c.id === "tout-selectionner")?.raccourci).toBe("Ctrl+A");
    expect(appliquerSaisie("3<90", { x: 1, y: 1 }, null, null)).toEqual({ type: "point", point: { x: 1, y: 4 } });
  });

  it("TR-EX-036 [+] chaque commande (non-geste) a un raccourci clavier ; chaque geste de vue a sa commande clavier ; les flèches déplacent la planche", () => {
    const parId = new Map(STUDIO_TOOLS.map((t) => [t.toolId, t]));
    for (const id of outils.filter((x) => ALTERNATIVES_GESTES[x]!.type === "commande")) expect(parId.get(id)?.raccourci, id).toMatch(/\S/);
    const editeur = new Map(COMMANDES_EDITEUR.map((c) => [c.id as string, c]));
    for (const [geste, ids] of Object.entries(ALTERNATIVES_GESTES_VUE)) {
      for (const id of ids) {
        if (id === "fleches-planche") continue;
        expect(editeur.get(id)?.raccourci, `${geste} → ${id}`).toMatch(/\S/);
      }
    }
    const c = { x: 0, y: 0, w: 20, h: 10 };
    expect(TOUCHES_PANORAMIQUE.map((t) => panoramiqueClavier(c, t))).toEqual([{ ...c, x: -2 }, { ...c, x: 2 }, { ...c, y: -1 }, { ...c, y: 1 }]);
    expect(panoramiqueClavier(c, "ArrowRight", true)).toEqual({ ...c, x: 10 });
    expect(panoramiqueClavier(c, "a")).toBeNull();
  });

  it("TR-EX-036 [+] la bascule Planche 2D ⇄ 3D déplace le focus vers la planche qui apparaît (aucun déplacement sans bascule)", () => {
    expect(cibleFocusBascule("2d", "3d")).toBe("3d");
    expect(cibleFocusBascule("3d", "2d")).toBe("2d");
    expect(cibleFocusBascule("2d", "double")).toBe("3d");
    expect(cibleFocusBascule("3d", "double")).toBe("2d");
    expect(cibleFocusBascule("double", "2d")).toBe("2d");
    expect(cibleFocusBascule("2d", "2d")).toBeNull();
    expect(SELECTEURS_FOCUS_BASCULE).toEqual({ "2d": 'svg[aria-label="Planche de dessin 2D"]', "3d": "section[data-studio-vue3d]" });
  });

  it("TR-EX-036 [−] garde construite : un outil sans alternative, une déclaration hors registre ou sans moyen est détecté ; un essai cassé échoue", () => {
    const { ["studio.dessin.cercle"]: _retire, ...sansCercle } = ALTERNATIVES_GESTES;
    expect(controlerAlternatives(outils, sansCercle)).toEqual(["sans alternative : studio.dessin.cercle"]);
    expect(controlerAlternatives(outils, { ...ALTERNATIVES_GESTES, "studio.hors": { type: "commande", moyens: [] } })).toEqual(["hors registre : studio.hors", "aucun moyen : studio.hors"]);
    expect(() => formulaire(fixture(), "studio.dessin.cercle", { x: 1, y: 1, r: 0 })).toThrow(/rayon/);
  });
});
