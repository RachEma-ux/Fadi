/**
 * BD-9.1 (chantier base-donnees, décision D-BD-8, constats Q6 / S13) : configuration du stockage des fichiers.
 *
 * `FADI_STOCKAGE` choisit où sont **écrits** les nouveaux fichiers :
 * - `base` (défaut) : dans la colonne `bytea` de leur table, comme avant ;
 * - `s3` : dans un stockage objet compatible S3 ; la base ne garde que la clé, l'empreinte SHA-256 et la taille.
 *
 * La lecture suit l'emplacement réel de chaque fichier : une ligne déjà déplacée (clé d'objet) se lit dans le stockage
 * objet, même si l'écriture est revenue à `base` ; il faut alors que la configuration S3 reste complète.
 *
 * Aucun hébergeur, compartiment ni identifiant n'est fourni par le dépôt : tout vient de l'environnement. Une
 * configuration incomplète ou incohérente est refusée au démarrage, avec le nom des variables en cause (jamais leur
 * valeur).
 */

export type PiloteEcriture = "base" | "s3";

export interface ConfigS3 {
  /** Adresse du service compatible S3 (https en production). */
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Adressage « chemin » (`https://hote/compartiment/cle`) plutôt que sous-domaine ; défaut : oui. */
  forcePathStyle: boolean;
}

export interface ConfigStockage {
  ecriture: PiloteEcriture;
  /** Présente dès que les variables S3 sont renseignées (obligatoire avec `FADI_STOCKAGE=s3`). */
  s3: ConfigS3 | null;
}

export class ConfigStockageInvalide extends Error {
  constructor(message: string) {
    super(`Stockage des fichiers (BD-9.1) : ${message}`);
    this.name = "ConfigStockageInvalide";
  }
}

/** Variables S3 obligatoires, dans l'ordre où elles sont signalées. */
export const VARIABLES_S3 = ["FADI_S3_ENDPOINT", "FADI_S3_REGION", "FADI_S3_BUCKET", "FADI_S3_ACCESS_KEY_ID", "FADI_S3_SECRET_ACCESS_KEY"] as const;

type Env = Readonly<Record<string, string | undefined>>;

const valeur = (env: Env, nom: string) => (env[nom] ?? "").trim();

/** Lit et valide la configuration ; lève `ConfigStockageInvalide` (message sans aucune valeur secrète). */
export function lireConfigStockage(env: Env = process.env): ConfigStockage {
  const brut = valeur(env, "FADI_STOCKAGE").toLowerCase();
  if (brut !== "" && brut !== "base" && brut !== "s3") throw new ConfigStockageInvalide(`FADI_STOCKAGE doit valoir « base » ou « s3 » (reçu : « ${brut.slice(0, 20)} »).`);
  const ecriture: PiloteEcriture = brut === "s3" ? "s3" : "base";

  const renseignees = VARIABLES_S3.filter((n) => valeur(env, n) !== "");
  if (ecriture === "base" && renseignees.length === 0) return { ecriture, s3: null };
  const manquantes = VARIABLES_S3.filter((n) => valeur(env, n) === "");
  if (manquantes.length) {
    const pourquoi = ecriture === "s3" ? "FADI_STOCKAGE=s3 exige" : "configuration S3 partielle (renseigner tout ou rien) ; il manque";
    throw new ConfigStockageInvalide(`${pourquoi} ${manquantes.join(", ")}.`);
  }

  const endpoint = valeur(env, "FADI_S3_ENDPOINT");
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ConfigStockageInvalide("FADI_S3_ENDPOINT n'est pas une adresse valide (attendu : https://hote[:port]).");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ConfigStockageInvalide("FADI_S3_ENDPOINT doit commencer par https:// (ou http:// hors production).");
  if (url.protocol === "http:" && env["NODE_ENV"] === "production") throw new ConfigStockageInvalide("FADI_S3_ENDPOINT doit être en https:// en production.");
  if (url.username || url.password) throw new ConfigStockageInvalide("FADI_S3_ENDPOINT ne doit pas contenir d'identifiants : utiliser FADI_S3_ACCESS_KEY_ID et FADI_S3_SECRET_ACCESS_KEY.");

  const bucket = valeur(env, "FADI_S3_BUCKET");
  // Règles de nommage S3 : 3 à 63 caractères, minuscules, chiffres, points et tirets.
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new ConfigStockageInvalide("FADI_S3_BUCKET : nom de compartiment invalide (3 à 63 caractères : minuscules, chiffres, points, tirets).");

  const style = valeur(env, "FADI_S3_FORCE_PATH_STYLE");
  if (style !== "" && style !== "0" && style !== "1") throw new ConfigStockageInvalide("FADI_S3_FORCE_PATH_STYLE doit valoir 0 ou 1.");

  return {
    ecriture,
    s3: {
      endpoint,
      region: valeur(env, "FADI_S3_REGION"),
      bucket,
      accessKeyId: valeur(env, "FADI_S3_ACCESS_KEY_ID"),
      secretAccessKey: valeur(env, "FADI_S3_SECRET_ACCESS_KEY"),
      forcePathStyle: style !== "0",
    },
  };
}

/** Résumé journalisable (aucun identifiant). */
export function decrireConfigStockage(c: ConfigStockage): string {
  if (c.ecriture === "base" && !c.s3) return "fichiers écrits en base (bytea)";
  const ou = c.s3 ? `${new URL(c.s3.endpoint).host}, compartiment ${c.s3.bucket}` : "";
  return c.ecriture === "s3" ? `fichiers écrits dans le stockage objet (${ou})` : `fichiers écrits en base ; lecture des fichiers déjà déplacés dans le stockage objet (${ou})`;
}
