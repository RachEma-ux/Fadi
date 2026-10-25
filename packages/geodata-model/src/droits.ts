/**
 * Rôles, capacités et droits par usage de GeoData (INV-08, concept § 3 et § 7.2). Les autorisations dépendent des espaces
 * et des rôles **GeoData**, jamais des rôles d'un projet : un administrateur de projet n'en reçoit aucune.
 */

/** Usages d'une version de données, chacun décidé séparément (concept § 7.2). */
export const USAGES = ["consultation", "stockage", "calcul", "tuiles", "commercial", "partage", "telechargement", "export"] as const;
export type Usage = (typeof USAGES)[number];

/** Un droit inconnu reste à qualifier : il bloque l'usage concerné, comme un refus, mais avec un motif distinct. */
export type EtatDroit = "autorise" | "refuse" | "inconnu";
export type DroitsVersion = Readonly<Record<Usage, EtatDroit>>;

export const LIBELLES_USAGES: Readonly<Record<Usage, string>> = {
  consultation: "Consultation",
  stockage: "Stockage",
  calcul: "Calcul",
  tuiles: "Production de tuiles",
  commercial: "Usage commercial",
  partage: "Partage",
  telechargement: "Téléchargement des données",
  export: "Export de composition",
};

const ETATS = new Set<EtatDroit>(["autorise", "refuse", "inconnu"]);

/** Lit des droits reçus ; tout usage absent ou illisible vaut `inconnu` (jamais `autorise` par défaut). */
export function lireDroits(x: unknown): DroitsVersion {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  return Object.fromEntries(USAGES.map((u) => [u, ETATS.has(o[u] as EtatDroit) ? (o[u] as EtatDroit) : "inconnu"])) as DroitsVersion;
}

/** Droits d'une couche importée par l'utilisateur dans son propre espace : ses données, tous usages privés autorisés ; partage refusé (V1 privée, D-GD-09). */
export const DROITS_IMPORT_PERSONNEL: DroitsVersion = Object.freeze({
  consultation: "autorise", stockage: "autorise", calcul: "autorise", tuiles: "autorise", commercial: "inconnu",
  partage: "refuse", telechargement: "autorise", export: "autorise",
});

export type VerdictUsage = { readonly ok: true } | { readonly ok: false; readonly etat: "refuse" | "inconnu"; readonly motif: string };

export function verifierUsage(droits: DroitsVersion, usage: Usage): VerdictUsage {
  const etat = droits[usage];
  if (etat === "autorise") return { ok: true };
  return {
    ok: false,
    etat,
    motif: etat === "refuse" ? `${LIBELLES_USAGES[usage]} : refusé par les conditions de la source` : `${LIBELLES_USAGES[usage]} : droit non qualifié pour cette source`,
  };
}

/** Rôles attribués à l'échelle de GeoData (table `geodata_roles`), indépendants des projets et des organisations. */
export const ROLES_GEODATA = ["gestionnaire-donnees", "responsable-publication", "administrateur"] as const;
export type RoleGeoData = (typeof ROLES_GEODATA)[number];
export const estRoleGeoData = (x: unknown): x is RoleGeoData => typeof x === "string" && (ROLES_GEODATA as readonly string[]).includes(x);

export const CAPACITES = ["consulter", "composer", "importer", "exporter", "preparer-version", "publier-version", "gerer-roles"] as const;
export type Capacite = (typeof CAPACITES)[number];

/**
 * Capacités d'un compte : tout compte connecté consulte, compose, importe et exporte dans son espace personnel (sous
 * réserve des droits de chaque source) ; préparer, publier et gérer les rôles demandent chacun leur rôle — la gestion des
 * données ne donne pas la publication, l'administration ne donne ni l'une ni l'autre.
 */
export function capacitesDe(roles: readonly RoleGeoData[]): ReadonlySet<Capacite> {
  const c = new Set<Capacite>(["consulter", "composer", "importer", "exporter"]);
  if (roles.includes("gestionnaire-donnees")) c.add("preparer-version");
  if (roles.includes("responsable-publication")) c.add("publier-version");
  if (roles.includes("administrateur")) c.add("gerer-roles");
  return c;
}
