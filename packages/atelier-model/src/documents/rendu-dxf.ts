/**
 * DXF R12 ASCII des documents dérivés : une vue (repère de la vue, mètres) ou une feuille (millimètres). Un calque
 * DXF par nature de trait (COUPE, VUE, FIN, CACHE…) ; les pochés deviennent des faces SOLID triangulées (R12 n'a
 * pas de hachures). La classe `Dxf` sert aussi à l'export de travail d'un niveau (`echanges/plan.ts`).
 */
import type { Vec } from "../geometrie.js";
import { trianguler } from "../projection/maillage.js";
import { grisRemplissage, type Primitive, type Trait } from "./dessin.js";
import type { FeuilleComposee } from "./feuilles.js";
import type { VueGeneree } from "./vues.js";

const nb = (v: number) => (Math.abs(v) < 1e-12 ? "0" : String(Math.round(v * 1e6) / 1e6));

export class Dxf {
  lignes: string[] = [];
  paire(code: number, valeur: string | number): void {
    this.lignes.push(String(code), typeof valeur === "number" ? nb(valeur) : valeur);
  }
  ligne(calque: string, a: Vec, b: Vec): void {
    this.paire(0, "LINE");
    this.paire(8, calque);
    this.paire(10, a.x);
    this.paire(20, a.y);
    this.paire(30, 0);
    this.paire(11, b.x);
    this.paire(21, b.y);
    this.paire(31, 0);
  }
  polyligne(calque: string, pts: readonly Vec[], fermee: boolean, renflements?: readonly number[]): void {
    if (pts.length < 2) return;
    this.paire(0, "POLYLINE");
    this.paire(8, calque);
    this.paire(66, 1);
    this.paire(70, fermee ? 1 : 0);
    pts.forEach((p, i) => {
      this.paire(0, "VERTEX");
      this.paire(8, calque);
      this.paire(10, p.x);
      this.paire(20, p.y);
      this.paire(30, 0);
      // Segment en arc (D-063) : renflement porté par le sommet de départ du segment (code 42).
      if (renflements?.[i]) this.paire(42, renflements[i]!);
    });
    this.paire(0, "SEQEND");
    this.paire(8, calque);
  }
  cercle(calque: string, c: Vec, r: number): void {
    this.paire(0, "CIRCLE");
    this.paire(8, calque);
    this.paire(10, c.x);
    this.paire(20, c.y);
    this.paire(30, 0);
    this.paire(40, r);
  }
  texte(calque: string, p: Vec, hauteur: number, texte: string, angle = 0): void {
    this.paire(0, "TEXT");
    this.paire(8, calque);
    this.paire(10, p.x);
    this.paire(20, p.y);
    this.paire(30, 0);
    this.paire(40, hauteur);
    this.paire(1, texte.replace(/[\r\n]+/g, " ").slice(0, 250));
    if (angle) this.paire(50, angle); // orientation (D-146), degrés
  }
}


const CALQUES: Record<Trait, { nom: string; couleur: number; type: string }> = {
  coupe: { nom: "COUPE", couleur: 7, type: "CONTINUOUS" },
  vue: { nom: "VUE", couleur: 8, type: "CONTINUOUS" },
  fin: { nom: "FIN", couleur: 9, type: "CONTINUOUS" },
  cache: { nom: "CACHE", couleur: 8, type: "DASHED" },
  annotation: { nom: "ANNOTATION", couleur: 5, type: "CONTINUOUS" },
  site: { nom: "SITE", couleur: 3, type: "DASHDOT" },
  demoli: { nom: "DEMOLI", couleur: 1, type: "DASHED" },
  "a-reparer": { nom: "A_REPARER", couleur: 1, type: "CONTINUOUS" },
};

/** Gris AutoCAD (ACI 250 à 255) le plus proche d'un gris 0 (noir) à 1 (blanc). */
const GRIS_ACI: [number, number][] = [[250, 0.2], [251, 0.31], [252, 0.51], [253, 0.71], [254, 0.86], [255, 1]];
export const couleurGris = (g: number): number => GRIS_ACI.reduce((m, c) => (Math.abs(c[1] - g) < Math.abs(m[1] - g) ? c : m))[0];

function entete(d: Dxf, commentaires: string[], unites: 4 | 6): void {
  for (const c of commentaires) d.paire(999, c.replace(/[\r\n]+/g, " "));
  d.paire(0, "SECTION");
  d.paire(2, "HEADER");
  d.paire(9, "$ACADVER");
  d.paire(1, "AC1009");
  d.paire(9, "$INSUNITS");
  d.paire(70, unites);
  d.paire(0, "ENDSEC");
  d.paire(0, "SECTION");
  d.paire(2, "TABLES");
  d.paire(0, "TABLE");
  d.paire(2, "LTYPE");
  d.paire(70, 3);
  const ltype = (nom: string, desc: string, motif: number[]) => {
    d.paire(0, "LTYPE");
    d.paire(2, nom);
    d.paire(70, 0);
    d.paire(3, desc);
    d.paire(72, 65);
    d.paire(73, motif.length);
    d.paire(40, motif.reduce((s, v) => s + Math.abs(v), 0));
    for (const m of motif) d.paire(49, m);
  };
  ltype("CONTINUOUS", "Continu", []);
  ltype("DASHED", "Tirets", [0.5, -0.25]);
  ltype("DASHDOT", "Tiret point", [0.5, -0.25, 0, -0.25]);
  d.paire(0, "ENDTAB");
  d.paire(0, "TABLE");
  d.paire(2, "LAYER");
  d.paire(70, Object.keys(CALQUES).length);
  for (const c of Object.values(CALQUES)) {
    d.paire(0, "LAYER");
    d.paire(2, c.nom);
    d.paire(70, 0);
    d.paire(62, c.couleur);
    d.paire(6, c.type);
  }
  d.paire(0, "ENDTAB");
  d.paire(0, "ENDSEC");
}

/** Écrit les primitives ; `hauteurTexte` convertit une hauteur de caractères (mm sur la feuille) dans l'unité du fichier. */
function entites(d: Dxf, primitives: readonly Primitive[], hauteurTexte: (mm: number) => number): void {
  d.paire(0, "SECTION");
  d.paire(2, "ENTITIES");
  for (const p of primitives) {
    if (p.type === "poly" && (p.remplissage === "poche" || p.remplissage === "degrade") && p.points.length >= 3) {
      const tri = trianguler(p.points);
      for (let k = 0; k < tri.length; k += 3) {
        const [a, b, c] = [p.points[tri[k]!]!, p.points[tri[k + 1]!]!, p.points[tri[k + 2]!]!];
        d.paire(0, "SOLID");
        d.paire(8, p.remplissage === "degrade" ? CALQUES.fin.nom : CALQUES.coupe.nom);
        // Bande de dégradé (D-120) : gris de la palette AutoCAD (250 à 255) le plus proche.
        if (p.remplissage === "degrade") d.paire(62, couleurGris(grisRemplissage(p)));
        const sommets: Vec[] = [a, b, c, c];
        sommets.forEach((q, i) => {
          d.paire(10 + i, q.x);
          d.paire(20 + i, q.y);
          d.paire(30 + i, 0);
        });
      }
    }
  }
  for (const p of primitives) {
    switch (p.type) {
      case "ligne":
        d.ligne(CALQUES[p.trait].nom, p.a, p.b);
        break;
      case "poly":
        if (p.trait) d.polyligne(CALQUES[p.trait].nom, p.points, p.ferme);
        break;
      case "cercle":
        d.cercle(CALQUES[p.trait].nom, p.centre, p.rayon);
        break;
      case "texte": {
        const h = hauteurTexte(p.hauteurMm);
        d.paire(0, "TEXT");
        d.paire(8, CALQUES[p.trait].nom);
        d.paire(10, p.position.x);
        d.paire(20, p.position.y);
        d.paire(30, 0);
        d.paire(40, h);
        d.paire(1, p.texte.replace(/[\r\n]+/g, " ").slice(0, 250));
        if (p.angle) d.paire(50, p.angle);
        if (p.ancre !== "debut") {
          d.paire(72, p.ancre === "milieu" ? 1 : 2);
          d.paire(11, p.position.x);
          d.paire(21, p.position.y);
          d.paire(31, 0);
        }
        break;
      }
    }
  }
  d.paire(0, "ENDSEC");
  d.paire(0, "EOF");
}

/** Une vue en DXF, dans son propre repère (mètres) : plan = repère local du projet ; coupe, façade = abscisse, altitude. */
export function dxfVue(vue: VueGeneree, revision: number, origineCadastrale: { x: number; y: number; crs: string } | null): string {
  const d = new Dxf();
  const repere =
    vue.params.type === "plan" || vue.params.type === "detail" || vue.params.type === "masse"
      ? origineCadastrale
        ? `repère local du projet, mètres ; cadastral (${origineCadastrale.crs}) = local + (${nb(origineCadastrale.x)} ; ${nb(origineCadastrale.y)})`
        : "repère local du projet, mètres (non rattaché au cadastre)"
      : "repère de la vue, mètres : abscisse le long du plan de vue, ordonnée = altitude";
  entete(d, [`Fadi · Atelier · ${vue.params.titre} · 1:${vue.params.echelle}`, `Révision du modèle ${revision} · empreinte ${vue.empreinte}`, repere], 6);
  entites(d, vue.primitives, (mm) => (mm * vue.params.echelle) / 1000);
  return d.lignes.join("\r\n") + "\r\n";
}

/** Une feuille en DXF (millimètres, espace objet). */
export function dxfFeuille(f: FeuilleComposee, revision: number): string {
  const d = new Dxf();
  entete(d, [`Fadi · Atelier · feuille ${f.params.numero} · ${f.params.titre}`, `Révision du modèle ${revision} · empreinte ${f.empreinte}`, `Feuille ${f.params.format} ${f.params.orientation}, millimètres`], 4);
  entites(d, f.primitives, (mm) => mm);
  return d.lignes.join("\r\n") + "\r\n";
}
