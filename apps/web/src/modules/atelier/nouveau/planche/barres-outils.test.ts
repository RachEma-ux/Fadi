import { describe, expect, it } from "vitest";
import { OUTILS, normaliserRaccourci, outilParId } from "@parcours/planche-model";
import { BARRES, FAMILLES, OBJET_DE, SECTIONS, barreDe, groupesOutils, libelleOperation, premierOutil } from "./barres-outils";
import { CATALOGUE } from "../messages";
import { RACCOURCIS_FADI, afficherRaccourci, commenceSaisie, nomOutil, outilDuClavier, outilsBarre, pictoOutil, raccourciClavier, raccourciOutil, sectionsGrille, titreOutil, type Cle } from "./outils-planche";

/** Outils présents dans la Planche : rail de gauche, grille « … » (y compris le menu contextuel offert dans la grille). */
const outilsPlanche = () => {
  const ids = new Set<string>([...outilsBarre().map((o) => o.id), ...sectionsGrille(OUTILS, () => true).flatMap((s) => s.outils.map((o) => o.id))]);
  return OUTILS.filter((o) => ids.has(o.id));
};

/** Événement clavier d'un raccourci canonique (« Alt+Maj+P ») : Maj met la lettre en capitale, comme le navigateur. */
function evenement(r: string, options: { mac?: boolean } = {}): Cle {
  const morceaux = r.split("+");
  const touche = morceaux[morceaux.length - 1]!;
  const shiftKey = morceaux.includes("Maj");
  const altKey = morceaux.includes("Alt");
  const ctrlKey = morceaux.includes("Ctrl");
  const lettre = /^[A-Z]$/.test(touche);
  let key = touche === "Espace" ? " " : shiftKey ? touche.toUpperCase() : touche.toLowerCase();
  // macOS : Option change le caractère produit (Alt + Maj + P → « ∏ ») ; seule la touche physique dit la lettre.
  if (options.mac && altKey && lettre) key = "∏";
  return { key, code: lettre ? `Key${touche}` : undefined, ctrlKey, shiftKey, altKey };
}

/** Raccourcis propres à la Planche (Planche.tsx), hors catalogue : ils ne doivent jamais être repris. */
const RESERVES_PLANCHE = ["G", "K", "Ctrl+Z", "Ctrl+Maj+Z", "Ctrl+Y", "Ctrl+G", "Ctrl+A", "Ctrl+Maj+I", "Ctrl+C", "Ctrl+X", "Ctrl+V", "Ctrl+S", "Ctrl+K", "Maj+-", "Maj+_"].map(normaliserRaccourci);

describe("Barres d'opérations (D-198) — correspondance outil → ① Créer · ② Modifier · ③ Mesurer / annoter", () => {
  it("couvre chaque outil de la Planche, et seulement des identifiants du catalogue", () => {
    const planche = outilsPlanche();
    expect(planche.length).toBe(OUTILS.length);
    for (const o of planche) expect(OBJET_DE[o.id], o.id).toBeDefined();
    for (const id of Object.keys(OBJET_DE)) expect(outilParId(id), id).not.toBeNull();
    for (const [objet, b] of Object.entries(BARRES)) for (const s of SECTIONS) for (const id of b[s.cle]) expect(outilParId(id), `${objet}.${s.cle}: ${id}`).not.toBeNull();
  });

  it("trois sections, toujours dans le même ordre, aucune vide ; l'outil figure dans sa propre barre", () => {
    expect(SECTIONS.map((s) => s.cle)).toEqual(["creer", "modifier", "mesurer"]);
    for (const o of OUTILS) {
      const b = barreDe(o.id)!;
      expect(b.map((s) => s.cle)).toEqual(["creer", "modifier", "mesurer"]);
      for (const s of b) expect(s.outils.length, `${o.id}.${s.cle}`).toBeGreaterThan(0);
      expect(b.flatMap((s) => s.outils.map((x) => x.id)), o.id).toContain(o.id);
      // Une opération n'apparaît qu'une fois dans une barre.
      const ids = b.flatMap((s) => s.outils.map((x) => x.id));
      expect(new Set(ids).size, o.id).toBe(ids.length);
    }
    expect(barreDe("inconnu")).toBeNull();
  });

  it("exemple de la demande : Ligne", () => {
    const [creer, modifier, mesurer] = barreDe("ligne")!.map((s) => s.outils.map((o) => o.id));
    expect(creer).toEqual(expect.arrayContaining(["ligne", "main-levee", "arc-2-points"]));
    expect(modifier).toEqual(expect.arrayContaining(["deplacer", "pousser-tirer", "decalage", "diviser", "faire-pivoter", "echelle", "gomme"]));
    expect(mesurer).toEqual(expect.arrayContaining(["metre", "cotation", "rapporteur"]));
  });

  it("chaque élément a son propre pictogramme et un raccourci ; libellé « Nom — raccourci »", () => {
    const pictos = new Map<string, string>();
    for (const o of OUTILS) {
      const p = pictoOutil(o.id);
      expect(p, o.id).not.toBe("•");
      expect(pictos.has(p), `${o.id} partage le pictogramme ${p} avec ${pictos.get(p)}`).toBe(false);
      pictos.set(p, o.id);
      expect(raccourciOutil(o), o.id).not.toBeNull();
    }
    expect(libelleOperation(outilParId("ligne")!)).toBe("Ligne — L");
    expect(libelleOperation(outilParId("main-levee")!)).toBe("Main levée — Maj+L");
    expect(titreOutil(outilParId("polygone")!, null)).toBe("Polygone (Maj+P)");
  });

  it("groupes par famille dans l'ordre du catalogue ; recherche ; Entrée prend le meilleur résultat", () => {
    const g = groupesOutils();
    expect(g.map((x) => x.famille)).toEqual(FAMILLES.map((f) => f.id));
    expect(g.flatMap((x) => x.outils).length).toBe(OUTILS.length);
    expect(groupesOutils("rect").flatMap((x) => x.outils.map((o) => o.id))).toEqual(["rectangle", "rectangle-pivote"]);
    expect(groupesOutils("zzz")).toEqual([]);
    expect(premierOutil("ligne")?.id).toBe("ligne");
    expect(premierOutil("pivot")?.id).toBe("rectangle-pivote");
    expect(premierOutil("freehand")?.id).toBe("main-levee");
    expect(premierOutil("  ")).toBeNull();
  });
});

describe("Couche de raccourcis Fadi (écart déclaré, D-198)", () => {
  it("le relevé n'est pas touché : la couche Fadi ne vise que les outils sans raccourci relevé, et tous", () => {
    for (const [id] of Object.entries(RACCOURCIS_FADI)) expect(outilParId(id)?.raccourci, id).toBeNull();
    for (const o of OUTILS.filter((x) => x.raccourci === null)) expect(RACCOURCIS_FADI[o.id], o.id).toBeDefined();
  });

  it("aucune collision : entre outils, avec les touches de la Planche, avec la frappe au champ Mesures", () => {
    const vus = new Map<string, string>();
    for (const o of OUTILS) {
      const r = normaliserRaccourci(raccourciOutil(o)!);
      expect(vus.has(r), `${o.id} et ${vus.get(r)} : ${r}`).toBe(false);
      vus.set(r, o.id);
      expect(RESERVES_PLANCHE, `${o.id} : ${r}`).not.toContain(r);
    }
    for (const [id, r] of Object.entries(RACCOURCIS_FADI)) {
      const e = evenement(r);
      expect(commenceSaisie(e.key), `${id} : ${r} commencerait une saisie`).toBe(false);
      // Forme : Maj + lettre ou Alt + Maj + lettre.
      expect(/^(Alt\+)?Maj\+[A-Z]$/.test(r), r).toBe(true);
    }
  });

  it("chaque raccourci active son outil au clavier (catalogue et couche Fadi), y compris Option sur macOS", () => {
    for (const o of OUTILS) {
      const r = raccourciOutil(o)!;
      expect(outilDuClavier(evenement(r))?.id, `${o.id} : ${r}`).toBe(o.id);
    }
    expect(raccourciClavier(evenement("Alt+Maj+P", { mac: true }))).toBe("Alt+Maj+P");
    expect(outilDuClavier(evenement("Alt+Maj+M", { mac: true }))?.id).toBe("marcher");
    // Comportement relevé inchangé : L reste Ligne, Maj + Espace reste Lasso, Maj + W reste Zoom fenêtre.
    expect(outilDuClavier(evenement("L"))?.id).toBe("ligne");
    expect(outilDuClavier(evenement("Maj+Espace"))?.id).toBe("lasso");
    expect(outilDuClavier(evenement("Maj+W"))?.id).toBe("zoom-fenetre");
    expect(outilDuClavier(evenement("Maj+Q"))).toBeNull();
  });
});

describe("Barres d'outils — langue de l'interface écrite par le code (Planche détachée, D-163)", () => {
  it("noms d'outils et raccourcis : français du catalogue, anglais de référence", () => {
    expect(nomOutil(outilParId("main-levee")!, "fr")).toBe("Main levée");
    expect(nomOutil(outilParId("main-levee")!, "en")).toBe("Freehand");
    expect(afficherRaccourci("Maj+L", "fr")).toBe("Maj+L");
    expect(afficherRaccourci("Maj+L", "en")).toBe("Shift+L");
    expect(afficherRaccourci("Alt+Maj+P", "en")).toBe("Alt+Shift+P");
    expect(afficherRaccourci("Maj+Espace", "en")).toBe("Shift+Space");
    expect(afficherRaccourci("Ctrl+Maj+E", "en")).toBe("Ctrl+Shift+E");
  });
  it("familles et sections ont leur libellé dans les deux langues du catalogue de messages", () => {
    for (const cle of [...FAMILLES.map((f) => f.cle), ...SECTIONS.map((s) => s.message)]) {
      expect(CATALOGUE.fr[cle], cle).toBeTruthy();
      expect(CATALOGUE.en[cle], cle).toBeTruthy();
    }
    expect(CATALOGUE.en["outils.famille.dessin"]).toBe("Draw");
    expect(CATALOGUE.en["outils.section.mesurer"]).toBe("Measure / annotate");
  });
});

describe("Règle d'or de la Planche (D-202, AGENTS.md) — icône propre, barre appropriée, raccourci clavier", () => {
  it("chaque outil a sa propre icône, figure dans sa famille d'« Outils ▾ » et dans sa barre d'opérations, et a un raccourci", () => {
    const familles = new Map(groupesOutils().flatMap((g) => g.outils.map((o) => [o.id, g.famille] as const)));
    const icones = new Map<string, string>();
    const raccourcis = new Map<string, string>();
    for (const o of OUTILS) {
      // 1. Icône propre, jamais partagée.
      const icone = pictoOutil(o.id);
      expect(icone, `${o.id} : icône manquante`).not.toBe("•");
      expect(icones.get(icone), `${o.id} partage son icône ${icone}`).toBeUndefined();
      icones.set(icone, o.id);
      // 2. Barre appropriée : sa famille dans « Outils ▾ » et sa barre d'opérations, où il figure lui-même.
      expect(familles.get(o.id), `${o.id} : absent d'« Outils ▾ »`).toBe(o.famille);
      expect(barreDe(o.id)?.flatMap((s) => s.outils.map((x) => x.id)), `${o.id} : absent de sa barre d'opérations`).toContain(o.id);
      // 3. Raccourci clavier, unique.
      const r = raccourciOutil(o);
      expect(r, `${o.id} : aucun raccourci clavier`).not.toBeNull();
      const n = normaliserRaccourci(r as string);
      expect(raccourcis.get(n), `${o.id} partage le raccourci ${r}`).toBeUndefined();
      raccourcis.set(n, o.id);
    }
  });
});
