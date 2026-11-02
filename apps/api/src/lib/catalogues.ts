/**
 * BD-9.6 (constat B8, décision D-BD-6, règle D-GD-29 « interface ≠ base de données ») : lecture des catalogues de données
 * du Parcours depuis la base — bibliothèque des bâtiments, profils et moteur Harmonie, répartition programmatique.
 *
 * Les catalogues sont chargés en base par `db/catalogues-charger.ts` (au moment de la migration, ou
 * `npm run db:catalogues:charger`) depuis les fichiers qualifiés du dépôt, archivés tels quels. L'API ne lit jamais ces
 * fichiers : un catalogue absent de la base est l'état « catalogue non chargé » (`CatalogueNonCharge`, réponse 503
 * `catalogue_non_charge`), jamais un repli sur une copie embarquée.
 *
 * Cache en mémoire par version publiée : le contenu analysé est gardé tant que la version publiée ne change pas ; la
 * version publiée est relue au plus toutes les `revalidationMs` (une requête sur clé primaire). Ce module est pur : la
 * base lui est passée (`Requeteur`), ce qui permet de l'essayer sans PostgreSQL.
 */
import type { BuildingLibraryData, HarmonieProfilesData, HarmonyEngineData, ProgrammeRepartitionData } from "@parcours/domain-model";

/** Types des catalogues de données, par clé (`catalogues.cle`). */
export interface TypesCatalogues {
  "bibliotheque-batiments": BuildingLibraryData;
  "harmonie-profils": HarmonieProfilesData;
  "harmonie-moteur": HarmonyEngineData;
  "programme-repartition": ProgrammeRepartitionData;
}
export type CleCatalogue = keyof TypesCatalogues;

/** Titres lisibles (messages d'erreur, table `catalogues`). */
export const TITRES_CATALOGUES: Readonly<Record<CleCatalogue, string>> = Object.freeze({
  "bibliotheque-batiments": "Bibliothèque des bâtiments",
  "harmonie-profils": "Profils Harmonie",
  "harmonie-moteur": "Moteur Harmony",
  "programme-repartition": "Répartition programmatique",
});
export const CLES_CATALOGUES = Object.freeze(Object.keys(TITRES_CATALOGUES) as CleCatalogue[]);

/** Aucune version publiée de ce catalogue en base : l'exploitant doit lancer le chargement. */
export class CatalogueNonCharge extends Error {
  readonly code = "catalogue_non_charge";
  readonly status = 503;
  constructor(readonly cle: CleCatalogue) {
    super(`Catalogue « ${TITRES_CATALOGUES[cle]} » (${cle}) non chargé en base : lancer le chargement des catalogues (npm run db:catalogues:charger, ou la migration).`);
    this.name = "CatalogueNonCharge";
  }
}

export function estCatalogueNonCharge(err: unknown): err is CatalogueNonCharge {
  return err instanceof CatalogueNonCharge;
}

/** Le strict nécessaire de `pg` (Pool ou client) : une requête paramétrée. */
export interface Requeteur {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

interface Entree {
  versionId: number;
  empreinte: string;
  contenu: unknown;
  verifieLe: number;
}

export interface OptionsLecteur {
  /** Délai entre deux relectures de la version publiée (défaut 30 s ; 0 = à chaque lecture). */
  revalidationMs?: number;
  maintenant?: () => number;
}

export class LecteurCatalogues {
  readonly #q: () => Requeteur;
  readonly #cache = new Map<CleCatalogue, Entree>();
  readonly #revalidationMs: number;
  readonly #maintenant: () => number;

  /** `q` est une fonction pour que le pool ne soit ouvert qu'à la première lecture. */
  constructor(q: () => Requeteur, o: OptionsLecteur = {}) {
    this.#q = q;
    this.#revalidationMs = o.revalidationMs ?? 30_000;
    this.#maintenant = o.maintenant ?? Date.now;
  }

  /** Le contenu de la version publiée ; `CatalogueNonCharge` si aucune n'est publiée. */
  async lire<K extends CleCatalogue>(cle: K): Promise<TypesCatalogues[K]> {
    const t = this.#maintenant();
    const enCache = this.#cache.get(cle);
    if (enCache && t - enCache.verifieLe < this.#revalidationMs) return enCache.contenu as TypesCatalogues[K];
    const { rows } = await this.#q().query(
      "SELECT v.id::text AS id, v.empreinte FROM catalogues c JOIN catalogue_versions v ON v.id = c.version_publiee_id WHERE c.cle = $1",
      [cle],
    );
    const publiee = rows[0] as { id: string; empreinte: string } | undefined;
    if (!publiee) {
      this.#cache.delete(cle);
      throw new CatalogueNonCharge(cle);
    }
    const versionId = Number(publiee.id);
    if (enCache && enCache.versionId === versionId && enCache.empreinte === publiee.empreinte) {
      enCache.verifieLe = t;
      return enCache.contenu as TypesCatalogues[K];
    }
    // Le fichier archivé, tel quel : l'ordre des clés et l'écriture des nombres sont ceux de la source (le `jsonb`
    // les normalise). Son empreinte est garantie par la contrainte `catalogue_versions_empreinte_ck`.
    const r = await this.#q().query("SELECT convert_from(fichier, 'UTF8') AS texte FROM catalogue_versions WHERE id = $1", [versionId]);
    const texte = r.rows[0]?.["texte"];
    if (typeof texte !== "string") throw new CatalogueNonCharge(cle);
    const contenu = JSON.parse(texte) as TypesCatalogues[K];
    this.#cache.set(cle, { versionId, empreinte: publiee.empreinte, contenu, verifieLe: t });
    return contenu;
  }

  /** Version publiée en cache (diagnostic, essais). */
  versionEnCache(cle: CleCatalogue): number | null {
    return this.#cache.get(cle)?.versionId ?? null;
  }

  vider(): void {
    this.#cache.clear();
  }
}
