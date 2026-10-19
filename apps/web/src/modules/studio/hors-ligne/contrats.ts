/**
 * Contrats de la file locale de Studio et leur migration (B.3-11, REF-02 EX-044).
 *
 * Une file locale (brouillon hors ligne : pas de commandes, enveloppes non confirmées) a été écrite par un build ; le
 * build qui la relit peut porter d'autres contrats. La correspondance tenue ici : format du brouillon
 * (`VERSION_BROUILLON_HORS_LIGNE`) ↔ contrat des commandes (`STUDIO_CONTRACT`) ↔ schéma du document
 * (`studio-document/1`) ; le build est noté par la page (`__FADI_BUILD__`).
 *
 * - format **à jour** : relu tel quel ;
 * - format **antérieur** avec une migration déclarée (`MIGRATIONS_BROUILLON`, chaînées version par version) : migré
 *   en mémoire seulement — la ligne d'origine reste intacte jusqu'à la prochaine écriture confirmée du brouillon ;
 * - sinon **incompatible** (format inconnu ou futur, schéma du document ou outil hors contrat) : rien n'est envoyé,
 *   réinterprété ni effacé ; l'interface propose une résolution explicite (exporter la file, puis l'abandonner sur
 *   confirmation). Aucune migration n'est déclarée aujourd'hui : le format 1 est le seul jamais écrit.
 *
 * Pur : ni React, ni DOM, ni IndexedDB.
 */
import { STUDIO_COMMAND_TOOL_IDS, STUDIO_CONTRACT } from "@parcours/atelier-model";
import { VERSION_BROUILLON_HORS_LIGNE } from "./persistance";

export const SCHEMA_DOCUMENT_LOCAL = "studio-document/1";

export const CONTRATS_LOCAUX = Object.freeze({ brouillon: VERSION_BROUILLON_HORS_LIGNE, commandes: STUDIO_CONTRACT, document: SCHEMA_DOCUMENT_LOCAL });

export interface MigrationBrouillon {
  readonly de: number;
  readonly vers: number;
  readonly migrer: (v: Record<string, unknown>) => Record<string, unknown>;
}

/** Migrations déclarées (aucune : le format 1 est le seul écrit à ce jour). */
export const MIGRATIONS_BROUILLON: readonly MigrationBrouillon[] = Object.freeze([]);

export type RaisonIncompatible = "illisible" | "version-inconnue" | "version-future" | "migration-echouee" | "schema-document" | "outil-hors-contrat" | "ne-s-applique-plus";

export type ResultatMigration =
  | { readonly type: "a-jour"; readonly json: string }
  | { readonly type: "migre"; readonly json: string; readonly de: number; readonly vers: number }
  | { readonly type: "incompatible"; readonly raison: RaisonIncompatible; readonly version: unknown };

const estObjet = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const OUTILS: ReadonlySet<string> = new Set(STUDIO_COMMAND_TOOL_IDS);

/** Contrôle des contrats d'un brouillon au format courant : schéma du document de base, outils des commandes. */
function controlerContrats(v: Record<string, unknown>): RaisonIncompatible | null {
  const base = v.base;
  const doc = estObjet(base) && estObjet(base.revision) ? base.revision.document : null;
  if (!estObjet(doc) || doc.schemaVersion !== SCHEMA_DOCUMENT_LOCAL) return "schema-document";
  const lots = [v.pas, v.refaire, estObjet(v.plan) ? v.plan.lots : []];
  for (const l of lots) {
    if (!Array.isArray(l)) continue;
    for (const pas of l) {
      if (!Array.isArray(pas)) continue;
      for (const c of pas) if (estObjet(c) && typeof c.toolId === "string" && !OUTILS.has(c.toolId)) return "outil-hors-contrat";
    }
  }
  return null;
}

/**
 * Amène un brouillon sérialisé au format courant ; ne lève jamais. `migrations` et `cible` sont injectables (tests).
 */
export function migrerBrouillon(json: string, migrations: readonly MigrationBrouillon[] = MIGRATIONS_BROUILLON, cible: number = VERSION_BROUILLON_HORS_LIGNE): ResultatMigration {
  let v: unknown;
  try { v = JSON.parse(json); } catch { return { type: "incompatible", raison: "illisible", version: null }; }
  if (!estObjet(v)) return { type: "incompatible", raison: "illisible", version: null };
  const depart = v.version;
  if (typeof depart !== "number" || !Number.isInteger(depart)) return { type: "incompatible", raison: "version-inconnue", version: depart ?? null };
  if (depart > cible) return { type: "incompatible", raison: "version-future", version: depart };
  let courant: Record<string, unknown> = v;
  let version = depart;
  while (version < cible) {
    const m = migrations.find((x) => x.de === version);
    if (!m || m.vers <= version) return { type: "incompatible", raison: "version-inconnue", version: depart };
    try { courant = m.migrer(structuredClone(courant)); } catch { return { type: "incompatible", raison: "migration-echouee", version: depart }; }
    if (courant.version !== m.vers) return { type: "incompatible", raison: "migration-echouee", version: depart };
    version = m.vers;
  }
  const contrat = controlerContrats(courant);
  if (contrat) return { type: "incompatible", raison: contrat, version: depart };
  return depart === cible ? { type: "a-jour", json } : { type: "migre", json: JSON.stringify(courant), de: depart, vers: cible };
}

/** Explication de l'incompatibilité (français source, traduite dans en.json). */
export const RAISONS_INCOMPATIBLE: Readonly<Record<RaisonIncompatible, string>> = Object.freeze({
  illisible: "La file locale conservée sur cet appareil est illisible.",
  "version-inconnue": "La file locale a été écrite dans un format que cette version de l’application ne sait pas migrer.",
  "version-future": "La file locale a été écrite par une version plus récente de l’application.",
  "migration-echouee": "La migration de la file locale vers le format courant a échoué.",
  "schema-document": "La file locale repose sur un schéma de document que cette version ne prend pas en charge.",
  "outil-hors-contrat": "La file locale contient une commande d’un outil absent du contrat de cette version.",
  "ne-s-applique-plus": "Les commandes de la file locale ne s’appliquent plus à leur révision de base.",
});
