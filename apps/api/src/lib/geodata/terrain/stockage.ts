/**
 * Stockage des fichiers de terrain (lot TER-02, décision TER-D5 du 2 novembre 2026) : un volume nommé, jamais la base ni
 * un montage de l'hôte. Arborescence sous la racine (`GEODATA_TERRAIN_DIR`) :
 *   depot/      fichiers déposés par l'exploitant ou par la commande de téléchargement (TER-D10), en attente d'import ;
 *   travail/    copies temporaires (écriture puis renommage atomique) ;
 *   originaux/  originaux adressés par leur empreinte SHA-256 (`originaux/<sha256>`), en lecture seule, jamais réécrits ;
 *   derives/    produits du traitement (TER-03).
 * La base garde l'empreinte, la taille et la clé de stockage ; chaque archivage relit l'empreinte. Aucune URL n'est lue ici.
 */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { join, resolve, sep } from "node:path";

export const DOSSIERS_TERRAIN = ["depot", "travail", "originaux", "derives"] as const;
const NOM_DEPOT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,150}$/;
const CLE_STOCKAGE = /^(originaux|derives)\/[A-Za-z0-9._/-]{1,200}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export class ErreurStockage extends Error {}

/** Empreinte SHA-256 et taille d'un fichier, lues en flux (jamais chargé en mémoire). */
export async function empreinteFichier(chemin: string): Promise<{ empreinte: string; taille: number }> {
  const h = createHash("sha256");
  let taille = 0;
  for await (const morceau of createReadStream(chemin)) {
    h.update(morceau as Buffer);
    taille += (morceau as Buffer).length;
  }
  return { empreinte: h.digest("hex"), taille };
}

async function tailleDossier(d: string): Promise<number> {
  let total = 0;
  let noms: string[];
  try { noms = await readdir(d); } catch { return 0; }
  for (const nom of noms) {
    const p = join(d, nom);
    const s = await stat(p);
    total += s.isDirectory() ? await tailleDossier(p) : s.size;
  }
  return total;
}

export class StockageTerrain {
  readonly racine: string;
  constructor(racine: string) {
    if (!racine) throw new ErreurStockage("Racine du stockage terrain absente (GEODATA_TERRAIN_DIR).");
    this.racine = resolve(racine);
  }

  /** Stockage configuré par l'environnement, ou null (fonction terrain indisponible, rien n'est deviné). */
  static depuisEnvironnement(env: NodeJS.ProcessEnv = process.env): StockageTerrain | null {
    const r = env["GEODATA_TERRAIN_DIR"];
    return r ? new StockageTerrain(r) : null;
  }

  async preparer(): Promise<void> {
    for (const d of DOSSIERS_TERRAIN) await mkdir(join(this.racine, d), { recursive: true });
  }

  /** Chemin d'un fichier du dépôt : un nom simple, jamais un chemin (aucune traversée). */
  cheminDepot(nom: string): string {
    if (!NOM_DEPOT.test(nom) || nom.includes("..")) throw new ErreurStockage(`Nom de fichier de dépôt refusé : ${JSON.stringify(nom)}.`);
    return join(this.racine, "depot", nom);
  }

  /** Chemin absolu d'une clé de stockage relue en base, contrôlée (préfixe, aucune traversée). */
  chemin(cle: string): string {
    if (!CLE_STOCKAGE.test(cle) || cle.includes("..")) throw new ErreurStockage(`Clé de stockage refusée : ${JSON.stringify(cle)}.`);
    const p = resolve(this.racine, cle);
    if (!p.startsWith(this.racine + sep)) throw new ErreurStockage("Clé de stockage hors du volume terrain.");
    return p;
  }

  /** Octets occupés par tout le volume terrain (dépôt, travail, originaux, dérivés) : base du quota (TER-D7). */
  utilisation(): Promise<number> {
    return tailleDossier(this.racine);
  }

  /**
   * Archive un original sous `originaux/<empreinte>` : copie dans `travail/`, empreinte relue, renommage atomique, lecture
   * seule. Un original déjà présent (même empreinte, relue) n'est pas réécrit. Le fichier du dépôt est laissé en place :
   * l'appelant le retire après l'enregistrement en base (`retirerDuDepot`), pour qu'un import interrompu puisse reprendre.
   */
  async archiverOriginal(source: string, empreinte: string): Promise<{ cle: string; deja: boolean }> {
    if (!SHA256.test(empreinte)) throw new ErreurStockage("Empreinte invalide.");
    await this.preparer();
    const cle = `originaux/${empreinte}`;
    const cible = this.chemin(cle);
    const present = await stat(cible).then(() => true, () => false);
    if (present) {
      if ((await empreinteFichier(cible)).empreinte !== empreinte) throw new ErreurStockage(`Original ${cle} altéré : empreinte relue différente. Rien n'est remplacé.`);
      return { cle, deja: true };
    }
    const temporaire = join(this.racine, "travail", `${empreinte}.${process.pid}.${Date.now()}.part`);
    await copyFile(source, temporaire);
    try {
      if ((await empreinteFichier(temporaire)).empreinte !== empreinte) throw new ErreurStockage("Copie de l'original altérée : empreinte différente.");
      await chmod(temporaire, 0o444);
      await rename(temporaire, cible);
    } catch (e) {
      await rm(temporaire, { force: true });
      throw e;
    }
    return { cle, deja: false };
  }

  /** Retire un fichier du dépôt, une fois son original archivé et enregistré en base. */
  async retirerDuDepot(nom: string): Promise<void> {
    await rm(this.cheminDepot(nom), { force: true });
  }
}
