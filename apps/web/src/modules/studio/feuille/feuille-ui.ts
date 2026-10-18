/**
 * Préparation de la feuille de présentation (Studio) : champs du cartouche préremplis par les seules données réelles
 * (projet, étude, variante, révision affichée, auteur quand c'est vous et que vous avez choisi un nom affiché),
 * réglages par défaut, nom de fichier. Rien n'est inventé : une donnée absente reste vide (« — » sur la feuille).
 * Pur : ni React ni DOM.
 */
import type { StudioSheetFormat, StudioSheetOrientation, StudioSheetScaleChoice, StudioSheetTitleBlock } from "@parcours/atelier-model";

export type ChampCartouche = keyof StudioSheetTitleBlock;
export const CHAMPS_CARTOUCHE: readonly { id: ChampCartouche; libelleFR: string }[] = Object.freeze([
  { id: "projectCode", libelleFR: "Code projet" },
  { id: "projectName", libelleFR: "Projet" },
  { id: "study", libelleFR: "Étude" },
  { id: "variant", libelleFR: "Variante" },
  { id: "title", libelleFR: "Titre de la feuille" },
  { id: "revisionId", libelleFR: "Révision" },
  { id: "revisionDate", libelleFR: "Date de révision" },
  { id: "author", libelleFR: "Auteur" },
]);

export interface SourcesCartouche {
  projet?: { code: string; name: string } | null;
  etude?: { name: string } | null;
  variante?: { name: string } | null;
  revision?: { id: string; createdAt?: string | null; authorId?: string | null } | null;
  utilisateur?: { id: string; displayName: string | null } | null;
}

/** Date de révision au format ISO (AAAA-MM-JJ, heure locale) ; chaîne vide si la date est illisible. */
export function dateRevision(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Champs préremplis : chaque valeur vient d'une donnée lue ; le titre n'est jamais proposé. */
export function cartoucheInitial(s: SourcesCartouche): StudioSheetTitleBlock {
  const auteur = s.revision?.authorId && s.utilisateur && s.revision.authorId === s.utilisateur.id ? s.utilisateur.displayName?.trim() ?? "" : "";
  return {
    projectCode: s.projet?.code ?? "",
    projectName: s.projet?.name ?? "",
    study: s.etude?.name ?? "",
    variant: s.variante?.name ?? "",
    title: "",
    // Forme courte (8 derniers caractères, comme l'historique) : la partie qui distingue les révisions reste lisible.
    revisionId: s.revision?.id ? s.revision.id.slice(-8) : "",
    revisionDate: dateRevision(s.revision?.createdAt),
    author: auteur,
  };
}

/** Valeurs affichées : la saisie de l'utilisateur l'emporte, sinon la donnée lue (qui peut arriver plus tard). */
export function cartoucheCourant(initial: StudioSheetTitleBlock, saisies: Partial<StudioSheetTitleBlock>): StudioSheetTitleBlock {
  return Object.fromEntries(CHAMPS_CARTOUCHE.map(({ id }) => [id, saisies[id] ?? initial[id] ?? ""])) as StudioSheetTitleBlock;
}

export interface ReglagesFeuille {
  format: StudioSheetFormat;
  orientation: StudioSheetOrientation;
  scale: StudioSheetScaleChoice;
  scaleBar: boolean;
  nord: boolean;
  /** Saisie libre de l'angle du nord ; vide tant que l'utilisateur ne l'a pas déclaré. */
  angleNord: string;
}
export const REGLAGES_INITIAUX: ReglagesFeuille = Object.freeze({ format: "A3", orientation: "paysage", scale: "ajuster", scaleBar: false, nord: false, angleNord: "" });

/** Angle du nord déclaré (degrés), ou null : flèche demandée sans angle valide → aucune flèche. */
export function angleNord(r: ReglagesFeuille): number | null {
  if (!r.nord || r.angleNord.trim() === "") return null;
  const v = Number(r.angleNord.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

/** Nom de fichier sûr : « feuille-<code>-<étude>-A3-paysage.svg ». */
export function nomFichierFeuille(c: StudioSheetTitleBlock, r: Pick<ReglagesFeuille, "format" | "orientation">, extension: "svg" | "pdf"): string {
  const morceaux = [c.projectCode, c.title?.trim() ? c.title : c.study].map((v) => (v ?? "").normalize("NFD").replace(/\p{M}+/gu, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)).filter(Boolean);
  return ["feuille", ...morceaux, r.format, r.orientation].join("-") + `.${extension}`;
}

/** SVG d'aperçu : sans prologue XML (insertion dans la page). */
export const svgSansProlog = (svg: string): string => svg.replace(/^<\?xml[^>]*\?>\s*/, "");
