/**
 * Validation HTTP des tuiles vectorielles (BD-8.4 partiel, constat B2). Le contenu d'une couche est figé dès que sa
 * version sort de préparation (déclencheur `geodata_contenu_fige`) : pour une version commune publiée, la tuile ne
 * dépend que de la version (identifiant et empreinte), de la tuile demandée, de sa variante et du code qui la calcule.
 * L'ETag en est l'empreinte ; une requête `If-None-Match` qui correspond reçoit 304 **après** le contrôle d'accès
 * (couche consultable, droit « tuiles »), sans recalcul. `Cache-Control` reste `private, max-age=300` : une version
 * retirée ou une source suspendue cesse d'être servie au plus tard 5 minutes après, jamais « immutable ».
 * Versions privées : `no-store`, sans ETag (inchangé). Logique pure.
 */
import { createHash, randomBytes } from "node:crypto";

/**
 * Construction qui calcule la tuile : commit de l'image (`FADI_COMMIT`), sinon une valeur propre au processus — un
 * changement de code ne réutilise jamais un ETag calculé par une autre construction.
 */
export function constructionTuiles(env: NodeJS.ProcessEnv = process.env): string {
  const commit = env["FADI_COMMIT"]?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{7,40}$/.test(commit) ? commit : PROCESSUS;
}
const PROCESSUS = `processus-${randomBytes(8).toString("hex")}`;

export interface CleTuile {
  readonly genre: "objets" | "etiquettes";
  readonly versionId: string;
  readonly empreinte: string;
  readonly coucheId: string;
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly variante: string;
}

/** ETag fort d'une tuile d'une version commune publiée. */
export function etagTuile(c: CleTuile, construction = constructionTuiles()): string {
  const h = createHash("sha256").update(JSON.stringify([construction, c.genre, c.versionId, c.empreinte, c.coucheId, c.z, c.x, c.y, c.variante])).digest("base64url");
  return `"${h.slice(0, 32)}"`;
}

/** `If-None-Match` correspond-il à l'ETag (liste, `*`, préfixe faible `W/` admis) ? */
export function correspond(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const nu = etag.replace(/^W\//, "");
  return ifNoneMatch.split(",").map((x) => x.trim()).some((x) => x === "*" || x.replace(/^W\//, "") === nu);
}
