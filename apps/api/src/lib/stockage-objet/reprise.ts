/**
 * BD-9.1 : reprise des fichiers `bytea` vers le stockage objet, et balayage des objets orphelins.
 *
 * Reprise (`reprendreFichiers`) : par lots bornés, ligne par ligne, idempotente (seules les lignes qui ont encore un
 * contenu et pas de clé sont visées) :
 *   1. lecture du contenu d'une ligne, contrôle de sa taille (`size`) et de l'empreinte déjà connue (identifiant d'un
 *      volume, `empreinte`) ; une ligne incohérente est signalée et laissée telle quelle ;
 *   2. dépôt de l'objet (clé adressée par le contenu) ;
 *   3. relecture **complète** de l'objet déposé : taille et SHA-256 recalculés ; un écart laisse la ligne intacte ;
 *   4. `UPDATE … SET objet_cle, empreinte, content = NULL` conditionné à la même taille et au même SHA-256 du contenu en
 *      base (`sha256(content)`), et à l'absence de clé : une ligne modifiée entre-temps n'est pas touchée.
 * Sans `appliquer` : bilan seulement (lignes et octets restant à déplacer), rien n'est lu ni écrit ailleurs.
 *
 * Balayage (`nettoyerObjetsOrphelins`) : un objet qu'aucune ligne ne cite, plus ancien que `ageMinHeures` (un dépôt
 * récent peut précéder l'insertion de sa ligne), est supprimé ; sans `appliquer`, il est seulement compté.
 */
import { cleObjet, ESPACES_FICHIERS, type EspaceFichiers } from "./index.js";
import { sha256Hex, type PiloteObjet } from "./pilote.js";

/** Ce que la reprise utilise d'un client `pg` (Pool ou Client). */
export interface Requeteur {
  query<R extends Record<string, unknown> = Record<string, unknown>>(texte: string, valeurs?: unknown[]): Promise<{ rows: R[]; rowCount: number | null }>;
}

interface DescriptionTable {
  /** Expression SQL du type de contenu. */
  mime: string;
  /** Expression SQL de l'empreinte déjà connue (peut être NULL). */
  empreinte: string;
  /** La table a une colonne `empreinte` à renseigner lors du déplacement. */
  ecrireEmpreinte: boolean;
}

/** Noms de tables et de colonnes fixes (jamais tirés d'une saisie). */
export const TABLES_FICHIERS: Readonly<Record<EspaceFichiers, DescriptionTable>> = Object.freeze({
  step_files: { mime: "type", empreinte: "empreinte", ecrireEmpreinte: true },
  drawing_exports: { mime: "mime", empreinte: "empreinte", ecrireEmpreinte: true },
  volumes: { mime: "mime", empreinte: "id", ecrireEmpreinte: false },
  com_pieces: { mime: "mime", empreinte: "empreinte", ecrireEmpreinte: false },
});

export interface BilanTable {
  table: EspaceFichiers;
  /** Lignes encore en base (contenu présent, aucune clé). */
  restantes: number;
  octetsRestants: number;
  deplacees: number;
  octetsDeplaces: number;
  ignorees: { id: string; motif: string }[];
}

export interface OptionsReprise {
  appliquer: boolean;
  /** Lignes lues par lot (identifiants), 50 par défaut. */
  lot?: number | undefined;
  /** Nombre maximal de lignes déplacées par table pendant cette exécution. */
  max?: number | undefined;
  tables?: readonly EspaceFichiers[] | undefined;
  journal?: (ligne: string) => void;
}

/** Garde des interpolations SQL : seules les quatre tables de la liste blanche sont admises. */
function tableAdmise(t: string): EspaceFichiers {
  if (!Object.prototype.hasOwnProperty.call(TABLES_FICHIERS, t)) throw new Error(`table de fichiers inconnue : ${t}`);
  return t as EspaceFichiers;
}

async function compter(q: Requeteur, t: EspaceFichiers): Promise<{ restantes: number; octets: number }> {
  const { rows } = await q.query<{ n: string; o: string | null }>(`SELECT count(*) AS n, sum(octet_length(content)) AS o FROM ${t} WHERE content IS NOT NULL AND objet_cle IS NULL`);
  return { restantes: Number(rows[0]?.n ?? 0), octets: Number(rows[0]?.o ?? 0) };
}

export async function reprendreFichiers(q: Requeteur, pilote: PiloteObjet | null, o: OptionsReprise): Promise<BilanTable[]> {
  const lot = Math.max(1, Math.min(1000, o.lot ?? 50));
  const max = o.max ?? Number.POSITIVE_INFINITY;
  const journal = o.journal ?? (() => undefined);
  if (o.appliquer && !pilote) throw new Error("reprise : stockage objet non configuré (FADI_S3_*).");
  const bilans: BilanTable[] = [];
  for (const t of (o.tables ?? ESPACES_FICHIERS).map(tableAdmise)) {
    const d = TABLES_FICHIERS[t];
    const avant = await compter(q, t);
    const bilan: BilanTable = { table: t, restantes: avant.restantes, octetsRestants: avant.octets, deplacees: 0, octetsDeplaces: 0, ignorees: [] };
    bilans.push(bilan);
    if (!o.appliquer || !pilote) continue;
    let apres = "";
    while (bilan.deplacees < max) {
      const ids = (await q.query<{ id: string }>(`SELECT id FROM ${t} WHERE content IS NOT NULL AND objet_cle IS NULL AND id > $1 ORDER BY id LIMIT $2`, [apres, lot])).rows.map((r) => r.id);
      if (!ids.length) break;
      apres = ids[ids.length - 1]!;
      for (const id of ids) {
        if (bilan.deplacees >= max) break;
        const r = (await q.query<{ content: Buffer; size: number; mime: string; empreinte: string | null }>(
          `SELECT content, size, ${d.mime} AS mime, ${d.empreinte} AS empreinte FROM ${t} WHERE id = $1 AND content IS NOT NULL AND objet_cle IS NULL`, [id])).rows[0];
        if (!r) continue; // déplacée ou supprimée entre-temps
        const sha = sha256Hex(r.content);
        if (r.content.length !== Number(r.size)) { bilan.ignorees.push({ id, motif: `taille en base ${r.content.length} ≠ colonne size ${r.size}` }); continue; }
        if (r.empreinte && r.empreinte !== sha) { bilan.ignorees.push({ id, motif: "contenu différent de l'empreinte enregistrée" }); continue; }
        const cle = cleObjet(t, sha);
        await pilote.deposer(cle, r.content, { mime: r.mime || "application/octet-stream", sha256: sha });
        const relu = await pilote.lire(cle);
        if (relu.length !== r.content.length || sha256Hex(relu) !== sha) { bilan.ignorees.push({ id, motif: "objet relu différent du contenu déposé : ligne laissée en base" }); continue; }
        const maj = d.ecrireEmpreinte
          ? await q.query(`UPDATE ${t} SET objet_cle = $2, empreinte = $3, content = NULL WHERE id = $1 AND objet_cle IS NULL AND content IS NOT NULL AND octet_length(content) = $4 AND sha256(content) = decode($3, 'hex')`, [id, cle, sha, r.content.length])
          : await q.query(`UPDATE ${t} SET objet_cle = $2, content = NULL WHERE id = $1 AND objet_cle IS NULL AND content IS NOT NULL AND octet_length(content) = $4 AND sha256(content) = decode($3, 'hex')`, [id, cle, sha, r.content.length]);
        if (maj.rowCount === 1) {
          bilan.deplacees += 1;
          bilan.octetsDeplaces += r.content.length;
        } else bilan.ignorees.push({ id, motif: "ligne modifiée pendant la reprise : laissée telle quelle" });
      }
      journal(`${t} : ${bilan.deplacees} ligne(s) déplacée(s)`);
    }
    const reste = await compter(q, t);
    bilan.restantes = reste.restantes;
    bilan.octetsRestants = reste.octets;
  }
  return bilans;
}

export interface BilanOrphelins {
  table: EspaceFichiers;
  examines: number;
  orphelins: number;
  octetsOrphelins: number;
  supprimes: number;
  /** Orphelins trop récents (dépôt possiblement en cours), laissés. */
  recents: number;
}

export async function nettoyerObjetsOrphelins(q: Requeteur, pilote: PiloteObjet, o: { appliquer: boolean; ageMinHeures?: number | undefined; maintenant?: Date; tables?: readonly EspaceFichiers[] | undefined }): Promise<BilanOrphelins[]> {
  const ageMin = Math.max(1, o.ageMinHeures ?? 24) * 3_600_000;
  const limite = (o.maintenant ?? new Date()).getTime() - ageMin;
  const ancien = (d: Date | null) => d !== null && d.getTime() <= limite;
  const bilans: BilanOrphelins[] = [];
  for (const t of (o.tables ?? ESPACES_FICHIERS).map(tableAdmise)) {
    const b: BilanOrphelins = { table: t, examines: 0, orphelins: 0, octetsOrphelins: 0, supprimes: 0, recents: 0 };
    bilans.push(b);
    let paquet: { cle: string; taille: number; modifieLe: Date | null }[] = [];
    const traiter = async () => {
      if (!paquet.length) return;
      const cites = new Set((await q.query<{ c: string }>(`SELECT DISTINCT objet_cle AS c FROM ${t} WHERE objet_cle = ANY($1::text[])`, [paquet.map((x) => x.cle)])).rows.map((r) => r.c));
      for (const x of paquet) {
        if (cites.has(x.cle)) continue;
        if (!ancien(x.modifieLe)) { b.recents += 1; continue; }
        b.orphelins += 1;
        b.octetsOrphelins += x.taille;
        if (!o.appliquer) continue;
        // Revérification juste avant la suppression : redéposé depuis la liste (date récente) ou cité entre-temps.
        const d = await pilote.decrire(x.cle);
        if (!d || !ancien(d.modifieLe)) continue;
        const encore = await q.query(`SELECT 1 FROM ${t} WHERE objet_cle = $1 LIMIT 1`, [x.cle]);
        if (encore.rows.length) continue;
        await pilote.supprimer(x.cle);
        b.supprimes += 1;
      }
      paquet = [];
    };
    for await (const x of pilote.lister(`${t}/`)) {
      b.examines += 1;
      paquet.push(x);
      if (paquet.length >= 500) await traiter();
    }
    await traiter();
  }
  return bilans;
}
