/**
 * Import du découpage administratif en base (D-GD-35) — opération **unique** sur le serveur, lancée par l'exploitant
 * (`geodata-reference.js --decoupage`), jamais au démarrage de l'API. Les niveaux et les entités viennent des fichiers de
 * données qualifiés déclarés par `decoupage/<pays>.json` (empreintes contrôlées, fichier source du HCP compris) :
 *   - même fichier déjà importé (empreinte consignée dans `geodata_decoupage_imports`) : rien n'est fait (« déjà importé ») ;
 *   - nouveau fichier : niveaux et entités mis à jour **par leur code** (aucun doublon), entités absentes du fichier
 *     marquées retirées (jamais effacées), bilan consigné (ajoutées, modifiées, retirées, sans parent) ;
 *   - les parents des unités du découpage territorial (`geodata_territoires`) sont relus des liens en base.
 * Tout se fait dans une transaction : en cas d'erreur, la base reste dans son état précédent. Ce module n'ouvre aucun pool.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { bilanDecoupage, lireEntites, lireNiveaux, validerDecoupage, type BilanDecoupage, type EntiteAdministrative } from "@parcours/geodata-model";
import type { PoolClient } from "pg";
import { majParentsDuPays } from "./territoires.js";

export interface FichierDeclare { readonly fichier: string; readonly empreinte: string }
export interface DeclarationDecoupage {
  readonly pays: string; readonly nomPays: string; readonly source: string; readonly url?: string; readonly periode?: string;
  readonly original: FichierDeclare; readonly niveaux: FichierDeclare; readonly entites: FichierDeclare;
}
export interface BilanImportDecoupage extends BilanDecoupage {
  readonly pays: string; readonly deja: boolean; readonly empreinte: string; readonly niveaux: number; readonly entites: number;
}

const CHEMIN = /^decoupage\/[A-Za-z0-9._/-]{1,160}$/;

function lireDeclare(dossier: string, f: FichierDeclare): Buffer {
  if (!CHEMIN.test(f.fichier) || f.fichier.includes("..")) throw new Error(`Fichier du découpage refusé : ${f.fichier}`);
  const chemin = join(dossier, f.fichier);
  if (!existsSync(chemin)) throw new Error(`Fichier du découpage absent : ${f.fichier}`);
  const octets = readFileSync(chemin);
  const h = createHash("sha256").update(octets).digest("hex");
  if (h !== f.empreinte.toLowerCase()) throw new Error(`Empreinte inattendue pour ${f.fichier} : ${h} (attendue ${f.empreinte})`);
  return octets;
}

/** Lit et contrôle la déclaration et ses fichiers ; aucune écriture. */
export function lireDecoupage(dossier: string, declaration: string) {
  const d = JSON.parse(readFileSync(join(dossier, declaration), "utf8")) as DeclarationDecoupage;
  if (!/^[A-Z]{2}$/.test(d.pays ?? "")) throw new Error(`${declaration} : pays ISO 3166-1 alpha-2 attendu`);
  lireDeclare(dossier, d.original);
  const niveaux = lireNiveaux(lireDeclare(dossier, d.niveaux).toString("utf8")).filter((n) => n.pays === d.pays);
  const entites = lireEntites(lireDeclare(dossier, d.entites).toString("utf8")).filter((e) => e.pays === d.pays);
  const erreurs = validerDecoupage(niveaux, entites);
  if (erreurs.length) throw new Error(`Découpage ${d.pays} refusé (${erreurs.length} erreur(s)) : ${erreurs.slice(0, 5).join(" ; ")}`);
  const empreinte = createHash("sha256").update(`${d.niveaux.empreinte}:${d.entites.empreinte}`).digest("hex");
  return { declaration: d, niveaux, entites, empreinte };
}

/** Import (ou constat « déjà importé ») d'un découpage déclaré ; transaction sur la connexion fournie. */
export async function importerDecoupage(client: Pick<PoolClient, "query">, dossier: string, declaration: string): Promise<BilanImportDecoupage> {
  const { declaration: d, niveaux, entites, empreinte } = lireDecoupage(dossier, declaration);
  const [deja] = (await client.query("SELECT bilan FROM geodata_decoupage_imports WHERE pays = $1 AND empreinte = $2", [d.pays, empreinte])).rows;
  if (deja) return { pays: d.pays, deja: true, empreinte, niveaux: niveaux.length, entites: entites.length, ajoutees: [], modifiees: [], retirees: [], sansParent: (deja.bilan?.sansParent as string[]) ?? [] };
  await client.query("BEGIN");
  try {
    await client.query(
      `INSERT INTO geodata_pays (code, nom) VALUES ($1, $2) ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, mis_a_jour_le = now()`, [d.pays, d.nomPays]);
    // Rangs écartés le temps de la mise à jour (contrainte d'unicité par rang) : un niveau peut changer de rang.
    await client.query("UPDATE geodata_niveaux_administratifs SET rang = rang + 10000 WHERE pays = $1", [d.pays]);
    for (const n of niveaux) {
      await client.query(
        `INSERT INTO geodata_niveaux_administratifs (pays, code, rang, singulier, pluriel, fiche_cle) VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (pays, code) DO UPDATE SET rang = EXCLUDED.rang, singulier = EXCLUDED.singulier, pluriel = EXCLUDED.pluriel,
           fiche_cle = EXCLUDED.fiche_cle, mis_a_jour_le = now()`,
        [n.pays, n.code, n.rang, n.singulier, n.pluriel, n.fiche]);
    }
    const restants = (await client.query("SELECT code FROM geodata_niveaux_administratifs WHERE pays = $1 AND rang > 10000", [d.pays])).rows.map((r) => r.code as string);
    if (restants.length) throw new Error(`Niveau(x) en base absent(s) du fichier, encore utilisé(s) : ${restants.join(", ")} (retrait d'un niveau : décision explicite).`);
    const avant = (await client.query(
      "SELECT pays, code, niveau, parent_code AS parent, nom, nom_ar AS \"nomAr\", type FROM geodata_entites_administratives WHERE pays = $1 AND retire_le IS NULL", [d.pays])).rows as EntiteAdministrative[];
    const bilan = bilanDecoupage(avant, entites, niveaux);
    const col = <K extends keyof EntiteAdministrative>(k: K) => entites.map((e) => e[k]);
    await client.query(
      `INSERT INTO geodata_entites_administratives (pays, code, niveau, parent_code, nom, nom_ar, type, source, periode)
       SELECT $1, x.code, x.niveau, x.parent, x.nom, x.nom_ar, x.type, $8, $9
         FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[]) AS x(code, niveau, parent, nom, nom_ar, type)
       ON CONFLICT (pays, code) DO UPDATE SET niveau = EXCLUDED.niveau, parent_code = EXCLUDED.parent_code, nom = EXCLUDED.nom, nom_ar = EXCLUDED.nom_ar,
         type = EXCLUDED.type, source = EXCLUDED.source, periode = EXCLUDED.periode, retire_le = NULL, mis_a_jour_le = now()
       WHERE (geodata_entites_administratives.niveau, geodata_entites_administratives.parent_code, geodata_entites_administratives.nom,
              geodata_entites_administratives.nom_ar, geodata_entites_administratives.type, geodata_entites_administratives.source,
              geodata_entites_administratives.periode, geodata_entites_administratives.retire_le)
         IS DISTINCT FROM (EXCLUDED.niveau, EXCLUDED.parent_code, EXCLUDED.nom, EXCLUDED.nom_ar, EXCLUDED.type, EXCLUDED.source, EXCLUDED.periode, NULL::timestamptz)`,
      [d.pays, col("code"), col("niveau"), col("parent"), col("nom"), col("nomAr"), col("type"), d.source, d.periode ?? null]);
    await client.query(
      "UPDATE geodata_entites_administratives SET retire_le = now() WHERE pays = $1 AND retire_le IS NULL AND NOT (code = ANY($2::text[]))", [d.pays, col("code")]);
    const resume = { ...bilan, niveaux: niveaux.length, entites: entites.length };
    await client.query(
      "INSERT INTO geodata_decoupage_imports (pays, fichier, empreinte, source, bilan) VALUES ($1, $2, $3, $4, $5)",
      [d.pays, d.entites.fichier, empreinte, `${d.source}${d.url ? ` (${d.url})` : ""} ; original ${d.original.fichier} (SHA-256 ${d.original.empreinte})`, JSON.stringify(resume)]);
    await majParentsDuPays(client, d.pays);
    await client.query("COMMIT");
    return { pays: d.pays, deja: false, empreinte, ...resume };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  }
}

/** Ligne de journal lisible du bilan d'un import. */
export const ligneBilanDecoupage = (b: BilanImportDecoupage): string => b.deja
  ? `Découpage ${b.pays} déjà importé (empreinte ${b.empreinte.slice(0, 12)}…) : rien n'est fait.`
  : `Découpage ${b.pays} importé : ${b.niveaux} niveau(x), ${b.entites} entité(s) ; ajoutées ${b.ajoutees.length}, modifiées ${b.modifiees.length}, `
    + `retirées ${b.retirees.length}, sans parent ${b.sansParent.length}${b.sansParent.length ? ` (${b.sansParent.slice(0, 20).join(", ")})` : ""}.`;
