import type { StudioDocument } from "./document-2d.js";

/**
 * Concurrence des écritures Studio (A.5-06, A.5-08) : quels éléments d'un document ont changé entre deux révisions, et
 * lesquels ont été changés À LA FOIS par un brouillon (base → local) et par une autre écriture (base → tête), avec des
 * résultats différents. Sert au serveur (corps du refus `stale_revision`) et à l'éditeur (report d'un brouillon sur la
 * nouvelle tête) : un chevauchement n'est jamais résolu en silence, la dernière écriture n'écrase rien d'elle-même.
 *
 * Clé d'un élément : `famille:identifiant` pour chaque liste du document (`objects`, `layers`, `dimensions`, `solides`,
 * `annotations`, `architecture`, `scenes`…), `proprietes:cible#nom` pour une propriété déclarée ; une liste dont les
 * éléments n'ont pas d'identité vaut un seul élément (`famille`), comme toute autre valeur de premier niveau. Égalité
 * exacte des valeurs (JSON à clés triées), aucune tolérance. Pur et déterministe : les entrées ne sont jamais modifiées.
 */

/** Champs d'en-tête du document : jamais un élément modifiable par une commande. */
const ENTETE = new Set(["id", "schemaVersion", "units", "frame"]);

function stable(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : stable(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
}

function identite(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o.id === "string") return o.id;
  if (typeof o.cibleId === "string" && typeof o.nom === "string") return `${o.cibleId}#${o.nom}`;
  return null;
}

/** Empreinte de chaque élément du document, par clé `famille:identifiant`. Une liste vide équivaut à une liste absente. */
function elements(doc: StudioDocument): Map<string, string> {
  const out = new Map<string, string>();
  for (const [famille, valeur] of Object.entries(doc as unknown as Record<string, unknown>)) {
    if (ENTETE.has(famille) || valeur === undefined) continue;
    if (Array.isArray(valeur)) {
      const cles = valeur.map(identite);
      if (cles.every((c) => c !== null) && new Set(cles).size === cles.length) {
        valeur.forEach((item, i) => out.set(`${famille}:${cles[i]}`, stable(item)));
      } else if (valeur.length) out.set(famille, stable(valeur));
    } else out.set(famille, stable(valeur));
  }
  return out;
}

/** Clés des éléments ajoutés, supprimés ou modifiés de `avant` à `apres`, triées. */
export function studioElementsModifies(avant: StudioDocument, apres: StudioDocument): string[] {
  const a = elements(avant), b = elements(apres);
  const cles = new Set([...a.keys(), ...b.keys()]);
  return [...cles].filter((k) => a.get(k) !== b.get(k)).sort();
}

/**
 * Éléments changés à la fois par le brouillon (`base` → `local`) et par une autre écriture (`base` → `tete`), quand les
 * deux résultats diffèrent : reporter le brouillon sur la tête remplacerait alors le changement d'autrui. Un même
 * changement fait des deux côtés n'est pas un chevauchement. Triés.
 */
export function studioChevauchements(base: StudioDocument, local: StudioDocument, tete: StudioDocument): string[] {
  const b = elements(base), l = elements(local), t = elements(tete);
  return studioElementsModifies(base, local).filter((k) => b.get(k) !== t.get(k) && l.get(k) !== t.get(k));
}
