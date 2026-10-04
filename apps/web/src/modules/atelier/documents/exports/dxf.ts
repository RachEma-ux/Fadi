/**
 * Export DXF du plan du niveau (D-019, complément de DA-14-01) : DXF ASCII, en-tête AC1015 (comme le prototype),
 * `$INSUNITS` = 6 (mètres), `$MEASUREMENT` = 1 (métrique), coordonnées du **repère local du projet** en mètres,
 * sans conversion (déclaré en commentaire `999`). Un calque DXF par calque du modèle (table `LAYER`, couleur
 * vraie `420` du calque) ; objet sans calque → calque `0`.
 *
 * Entités : `LINE` (polyligne de deux points), `LWPOLYLINE` (polyligne, polygone fermé), `CIRCLE`, `ARC` (angles
 * en degrés, sens trigonométrique, comme `FormeDessin.arc`), `TEXT` (une entité par ligne de texte, hauteur du
 * dessin). Chaque entité porte une poignée (`5`) et ses marqueurs de sous-classe (`100`). Caractères hors ASCII
 * écrits `\U+XXXX` (règle du prototype). Fichier minimal : ni blocs, ni objets ; lu par les lecteurs usuels
 * (à vérifier avec un logiciel de DAO à l'intégration). Module pur.
 */
import type { FormeDessin } from "../../socle";
import { INTERLIGNE, lignesTexte } from "../annotations";
import { parCalque } from "./svg";
import type { VueExport } from "./vue";

/** Texte DXF sûr : ASCII imprimable, le reste en `\U+XXXX`. */
export const texteDxf = (s: string): string => [...s].map((c) => (/^[\x20-\x7e]$/.test(c) ? c : `\\U+${(c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`)).join("");

/** Nom de calque DXF : caractères interdits (`<>/\":;?*|=,` et contrôles) remplacés par `_`. */
export const nomCalqueDxf = (s: string): string => texteDxf(s.replace(/[<>/\\":;?*|=,`\u0000-\u001f]/g, "_")).trim() || "0";

/** Couleur vraie DXF (code 420) d'un `#rrggbb`. */
const couleurVraie = (c: string | null): number | null => (c && /^#[0-9a-f]{6}$/i.test(c) ? parseInt(c.slice(1), 16) : null);

type Paire = readonly [number, string | number];

function versTexte(paires: readonly Paire[]): string {
  return paires.map(([code, val]) => `${code}\n${val}`).join("\n") + "\n";
}

export function construireDxf(v: VueExport): string {
  let poignee = 0x100;
  const suivante = () => (poignee++).toString(16).toUpperCase();
  const groupes = parCalque(v);
  // Noms de calques DXF uniques (deux calques du modèle peuvent avoir des noms qui se confondent une fois nettoyés).
  const noms = new Map<string, string>();
  const pris = new Set<string>();
  for (const { calque } of groupes) {
    const base = calque.id === null ? "0" : nomCalqueDxf(calque.nom);
    let nom = base;
    for (let i = 2; pris.has(nom.toUpperCase()); i++) nom = `${base}_${i}`;
    pris.add(nom.toUpperCase());
    noms.set(calque.id ?? "", nom);
  }

  const entites: Paire[] = [];
  const entite = (type: string, calque: string, sousClasse: string, corps: readonly Paire[]) => {
    entites.push([0, type], [5, suivante()], [100, "AcDbEntity"], [8, calque], [100, sousClasse], ...corps);
  };
  const ecrire = (f: FormeDessin, calque: string) => {
    switch (f.forme) {
      case "polyligne":
      case "polygone": {
        const pts = f.points;
        const ferme = f.forme === "polygone" || f.fermee;
        if (pts.length === 2 && !ferme) {
          const [a, b] = pts as [(typeof pts)[0], (typeof pts)[0]];
          entite("LINE", calque, "AcDbLine", [
            [10, a.x],
            [20, a.y],
            [30, 0],
            [11, b.x],
            [21, b.y],
            [31, 0],
          ]);
        } else if (pts.length >= 2) {
          entite("LWPOLYLINE", calque, "AcDbPolyline", [[90, pts.length], [70, ferme ? 1 : 0], ...pts.flatMap((p): Paire[] => [[10, p.x], [20, p.y]])]);
        }
        return;
      }
      case "cercle":
        entite("CIRCLE", calque, "AcDbCircle", [
          [10, f.centre.x],
          [20, f.centre.y],
          [30, 0],
          [40, f.rayon],
        ]);
        return;
      case "arc":
        entites.push([0, "ARC"], [5, suivante()], [100, "AcDbEntity"], [8, calque], [100, "AcDbCircle"], [10, f.centre.x], [20, f.centre.y], [30, 0], [40, f.rayon], [100, "AcDbArc"], [50, f.debut], [51, f.fin]);
        return;
      case "texte":
        lignesTexte(f.texte).forEach((ligne, i) => {
          if (ligne === "") return;
          entite("TEXT", calque, "AcDbText", [
            [10, f.position.x],
            [20, f.position.y - i * f.hauteur * INTERLIGNE],
            [30, 0],
            [40, f.hauteur],
            [1, texteDxf(ligne)],
            [100, "AcDbText"],
          ]);
        });
        return;
    }
  };
  for (const { calque, dessins } of groupes) {
    const nom = noms.get(calque.id ?? "") ?? "0";
    for (const d of dessins) for (const f of d.formes) ecrire(f, nom);
  }

  const m = v.meta;
  const calques: Paire[] = groupes.flatMap(({ calque }): Paire[] => {
    const vraie = couleurVraie(calque.couleur);
    return [[0, "LAYER"], [5, suivante()], [100, "AcDbSymbolTableRecord"], [100, "AcDbLayerTableRecord"], [2, noms.get(calque.id ?? "") ?? "0"], [70, 0], [62, 7], ...(vraie === null ? [] : ([[420, vraie]] as Paire[])), [6, "CONTINUOUS"]];
  });
  const tableCalques = suivante();
  const paires: Paire[] = [
    [999, texteDxf(`Fadi Atelier - plan du niveau ${m.niveauNom} - projet ${m.projetId} - revision ${m.revision} - empreinte ${m.empreinte}`)],
    [999, texteDxf(`Unites : metres (INSUNITS 6), repere local du projet, sans conversion - ${m.date.toISOString()}`)],
    [0, "SECTION"],
    [2, "HEADER"],
    [9, "$ACADVER"],
    [1, "AC1015"],
    [9, "$INSUNITS"],
    [70, 6],
    [9, "$MEASUREMENT"],
    [70, 1],
    [9, "$EXTMIN"],
    [10, v.emprise.minX],
    [20, v.emprise.minY],
    [30, 0],
    [9, "$EXTMAX"],
    [10, v.emprise.maxX],
    [20, v.emprise.maxY],
    [30, 0],
    [9, "$HANDSEED"],
    [5, (poignee + 0x10).toString(16).toUpperCase()],
    [0, "ENDSEC"],
    [0, "SECTION"],
    [2, "TABLES"],
    [0, "TABLE"],
    [2, "LAYER"],
    [5, tableCalques],
    [100, "AcDbSymbolTable"],
    [70, groupes.length],
    ...calques,
    [0, "ENDTAB"],
    [0, "ENDSEC"],
    [0, "SECTION"],
    [2, "ENTITIES"],
    ...entites,
    [0, "ENDSEC"],
    [0, "EOF"],
  ];
  return versTexte(paires);
}

/** Relecture d'un DXF ASCII en paires (code, valeur) — sert aux tests et au contrôle avant téléchargement. */
export function lireDxf(texte: string): { code: number; valeur: string }[] {
  const l = texte.replace(/\r\n/g, "\n").split("\n");
  if (l.at(-1) === "") l.pop();
  if (l.length % 2 !== 0) throw new Error("DXF : nombre impair de lignes");
  const r: { code: number; valeur: string }[] = [];
  for (let i = 0; i < l.length; i += 2) {
    const code = Number((l[i] ?? "").trim());
    if (!Number.isInteger(code)) throw new Error(`DXF : code de groupe illisible ligne ${i + 1}`);
    r.push({ code, valeur: l[i + 1] ?? "" });
  }
  return r;
}
