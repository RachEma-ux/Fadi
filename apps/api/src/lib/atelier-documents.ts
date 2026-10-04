/**
 * Documents dérivés de l'Atelier au catalogue (lot 5, cahier §5.9) : vues (PDF, DXF, SVG), feuilles (PDF, DXF, SVG),
 * tableaux (CSV) et rapport des quantités (HTML), produits par le serveur depuis le modèle typé à la révision
 * courante, avec le code pur de `@parcours/atelier-model` — le même que l'aperçu du navigateur. Chaque document
 * porte l'empreinte de ses entrées : il est « à jour » tant que la révision et l'empreinte n'ont pas bougé.
 */
import {
  composerFeuille,
  csvTableau,
  dxfFeuille,
  dxfVue,
  empreinteFeuille,
  empreinteVue,
  genererTableau,
  genererVue,
  paramsDeDefinition,
  pdfFeuille,
  pdfVue,
  rapportQuantitesHtml,
  svgFeuille,
  svgVue,
  TABLEAUX,
  type Definition,
  type ModeleAtelier,
  type ParamsFeuille,
  type TypeTableau,
} from "@parcours/atelier-model";
import type { DocumentDescriptor } from "./documents.js";
import type { OwnedProject } from "./owned-project.js";

type Descripteur = Omit<DocumentDescriptor, "produced" | "freshness">;

export const FORMATS_VUE = ["pdf", "dxf", "svg"] as const;
export type FormatDocument = (typeof FORMATS_VUE)[number];

const TYPES_LIBELLES: Record<string, string> = { plan: "plan", coupe: "coupe", facade: "façade", masse: "plan de masse", detail: "détail" };
const FORMAT_LIBELLE: Record<FormatDocument, string> = { pdf: "PDF", dxf: "DXF", svg: "SVG" };

/** Nom de fichier sûr : lettres sans accents, chiffres, tirets. */
export const slug = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9.]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "document";

const vuesDe = (etat: ModeleAtelier) => Object.values(etat.definitions).filter((d) => d.classe === ("vue" as Definition["classe"])).sort((a, b) => (a.id < b.id ? -1 : 1));
const feuillesDe = (etat: ModeleAtelier) => Object.values(etat.definitions).filter((d) => d.classe === ("feuille" as Definition["classe"])).sort((a, b) => (a.id < b.id ? -1 : 1));
const projetDe = (p: OwnedProject) => ({ nom: p.name, code: p.code });

export function atelierDocumentDescriptors(project: OwnedProject, etat: ModeleAtelier | null): Descripteur[] {
  if (!etat) return [];
  const rev = project.modelRevision;
  const base = `/projects/${project.id}/documents/atelier`;
  const code = slug(project.code);
  const out: Descripteur[] = [];
  for (const d of vuesDe(etat)) {
    const params = paramsDeDefinition(d);
    const empreinte = empreinteVue(etat, params);
    for (const f of FORMATS_VUE)
      out.push({
        kind: `atelier-vue-${d.id}-${f}`,
        group: "atelier",
        label: `${FORMAT_LIBELLE[f]} · ${params.titre} (${TYPES_LIBELLES[params.type] ?? params.type}, 1:${params.echelle})`,
        fileName: `${code}_${slug(params.titre)}.${f}`,
        href: `${base}/vues/${encodeURIComponent(d.id)}.${f}`,
        stepNumber: 10,
        current: { modelRevision: rev, inputHash: empreinte },
      });
  }
  for (const d of feuillesDe(etat)) {
    const params = d.params as unknown as ParamsFeuille;
    const empreinte = empreinteFeuille(etat, params, projetDe(project));
    for (const f of FORMATS_VUE)
      out.push({
        kind: `atelier-feuille-${d.id}-${f}`,
        group: "atelier",
        label: `${FORMAT_LIBELLE[f]} · Feuille ${params.numero} · ${params.titre}${params.jeu ? ` (jeu ${params.jeu})` : ""}`,
        fileName: `${code}_${slug(params.numero)}_${slug(params.titre)}.${f}`,
        href: `${base}/feuilles/${encodeURIComponent(d.id)}.${f}`,
        stepNumber: 10,
        current: { modelRevision: rev, inputHash: empreinte },
      });
  }
  for (const t of Object.keys(TABLEAUX) as TypeTableau[]) {
    out.push({
      kind: `atelier-tableau-${t}`,
      group: "atelier",
      label: `CSV · ${TABLEAUX[t]}`,
      fileName: `${code}_${slug(TABLEAUX[t])}.csv`,
      href: `${base}/tableaux/${t}.csv`,
      stepNumber: 10,
      current: { modelRevision: rev, inputHash: genererTableau(etat, t).empreinte },
    });
  }
  out.push({
    kind: "atelier-quantites",
    group: "atelier",
    label: "Rapport des quantités du modèle (HTML)",
    fileName: `${code}_quantites.html`,
    href: `${base}/quantites.html`,
    stepNumber: 10,
    current: { modelRevision: rev, inputHash: (Object.keys(TABLEAUX) as TypeTableau[]).map((t) => genererTableau(etat, t).empreinte).join("") },
  });
  return out;
}

export interface Rendu {
  body: string | Buffer;
  type: string;
}

const TYPES_MIME: Record<FormatDocument, string> = { pdf: "application/pdf", dxf: "application/dxf; charset=utf-8", svg: "image/svg+xml; charset=utf-8" };

/** Rendu d'un document de l'Atelier par son genre (`atelier-vue-<id>-pdf`…), à la révision courante. */
export function rendreDocumentAtelier(kind: string, project: OwnedProject, etat: ModeleAtelier): Rendu | null {
  const rev = project.modelRevision;
  let m = /^atelier-vue-(.+)-(pdf|dxf|svg)$/.exec(kind);
  if (m) {
    const d = etat.definitions[m[1]!];
    if (!d || d.classe !== ("vue" as Definition["classe"])) return null;
    const vue = genererVue(etat, paramsDeDefinition(d), d.id);
    const f = m[2] as FormatDocument;
    const body = f === "pdf" ? Buffer.from(pdfVue(vue, rev)) : f === "dxf" ? dxfVue(vue, rev, etat.site.parcelle?.origineLocale ?? null) : svgVue(vue, rev);
    return { body, type: TYPES_MIME[f] };
  }
  m = /^atelier-feuille-(.+)-(pdf|dxf|svg)$/.exec(kind);
  if (m) {
    const d = etat.definitions[m[1]!];
    if (!d || d.classe !== ("feuille" as Definition["classe"])) return null;
    const feuille = composerFeuille(etat, d.params as unknown as ParamsFeuille, rev, projetDe(project), d.id);
    const f = m[2] as FormatDocument;
    const body = f === "pdf" ? Buffer.from(pdfFeuille(feuille)) : f === "dxf" ? dxfFeuille(feuille, rev) : svgFeuille(feuille);
    return { body, type: TYPES_MIME[f] };
  }
  m = /^atelier-tableau-(\w+)$/.exec(kind);
  if (m && m[1]! in TABLEAUX) return { body: csvTableau(genererTableau(etat, m[1] as TypeTableau)), type: "text/csv; charset=utf-8" };
  if (kind === "atelier-quantites") return { body: rapportQuantitesHtml(etat, projetDe(project), rev), type: "text/html; charset=utf-8" };
  return null;
}
