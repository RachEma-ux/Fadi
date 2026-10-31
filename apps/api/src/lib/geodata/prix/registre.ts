/**
 * Registre des sources de prix immobiliers (lot P2, PRIX-SOURCES.md) : `prix/prix-sources.json` du dossier des sources
 * qualifiées, archivé tel quel (`geodata_fichiers`, rôle `prix`) et chargé dans `geodata_prix_sources` (D-GD-29 : le
 * code ne contient aucune source ni aucun statut).
 *
 * Chargement idempotent : si chaque source du fichier porte déjà l'empreinte de ce fichier en base, rien n'est réécrit.
 * Sinon chaque source est insérée ou mise à jour ; tout changement de statut est journalisé (`prix.source.statut`,
 * avant / après / origine). Un statut posé par l'administration (suspension…) n'est pas levé par un rechargement : il
 * est conservé et le désaccord journalisé (`prix.source.statut_conserve`). Une source qui disparaît du registre passe
 * `retiree` (jamais effacée). Quand une source quitte l'état autorisé, ses sorties publiées sont retirées (PRX13).
 * Ce module n'ouvre ni pool ni transaction : l'appelant les fournit.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { estDateIso } from "@parcours/geodata-model";
import type { Executeur } from "../archive-fichiers.js";
import { retirerSortiesDeSource, sourceAutorisee } from "./pipeline.js";

/** Chemin du registre dans le dossier des sources livrées (et dans `geodata_fichiers`). */
export const CHEMIN_REGISTRE_PRIX = "prix/prix-sources.json";

export const STATUTS_REGISTRE = ["candidate", "qualifiee", "autorisee", "active", "bloquee", "suspendue", "retiree"] as const;
export type StatutRegistre = (typeof STATUTS_REGISTRE)[number];
export const COUCHES_REGISTRE = ["officielle", "annonces"] as const;
export const PRODUITS_REGISTRE = ["agregat-publie", "observations", "valeurs-officielles", "contexte-indice", "contexte-transactions"] as const;

export interface SourceRegistre {
  readonly cle: string;
  readonly titre: string;
  readonly couche: (typeof COUCHES_REGISTRE)[number];
  readonly produit: (typeof PRODUITS_REGISTRE)[number];
  readonly statut: StatutRegistre;
  readonly editeur: string;
  readonly url: string | null;
  readonly licence: string | null;
  readonly motif: string | null;
  readonly prochaineAction: string | null;
  readonly derivee: boolean;
  readonly ficheGeodata: string | null;
}

export interface RegistrePrix {
  readonly version: string;
  readonly revueLe: string;
  readonly revueAvant: string;
  readonly responsable: string;
  readonly dossier: string;
  readonly sources: readonly SourceRegistre[];
}

const texte = (x: unknown, max = 2000): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= max;
const texteOuNul = (x: unknown, max = 2000): boolean => x === null || texte(x, max);
const dans = <T extends string>(liste: readonly T[], x: unknown): x is T => typeof x === "string" && (liste as readonly string[]).includes(x);

/** Valide le contenu du registre ; une erreur cite le champ fautif (le registre entier est alors refusé). */
export function lireRegistrePrix(contenu: unknown): RegistrePrix {
  const r = contenu as Record<string, unknown> | null;
  const erreurs: string[] = [];
  if (!r || typeof r !== "object") throw new Error("Registre des sources de prix : objet attendu.");
  if (!texte(r["version"], 120)) erreurs.push("version");
  if (!estDateIso(r["revueLe"])) erreurs.push("revueLe");
  if (!estDateIso(r["revueAvant"])) erreurs.push("revueAvant");
  if (!texte(r["responsable"], 300)) erreurs.push("responsable");
  if (!texte(r["dossier"], 300)) erreurs.push("dossier");
  if (!Array.isArray(r["sources"]) || !r["sources"].length) erreurs.push("sources");
  const vues = new Set<string>();
  for (const [i, s] of ((Array.isArray(r["sources"]) ? r["sources"] : []) as Record<string, unknown>[]).entries()) {
    const e = (champ: string) => erreurs.push(`sources[${i}].${champ}`);
    if (!s || typeof s !== "object") { e("(objet)"); continue; }
    if (typeof s["cle"] !== "string" || !/^[a-z0-9][a-z0-9-]{1,79}$/.test(s["cle"])) e("cle");
    else if (vues.has(s["cle"])) e("cle (en double)");
    else vues.add(s["cle"]);
    if (!texte(s["titre"], 300)) e("titre");
    if (!dans(COUCHES_REGISTRE, s["couche"])) e("couche");
    if (!dans(PRODUITS_REGISTRE, s["produit"])) e("produit");
    if (!dans(STATUTS_REGISTRE, s["statut"])) e("statut");
    if (!texte(s["editeur"], 300)) e("editeur");
    if (!texteOuNul(s["url"], 500) || (typeof s["url"] === "string" && !/^https:\/\//.test(s["url"]))) e("url");
    for (const k of ["licence", "motif", "prochaineAction", "ficheGeodata"]) if (!texteOuNul(s[k])) e(k);
    if (typeof s["derivee"] !== "boolean") e("derivee");
    // Une source qui n'est ni autorisée ni active porte le motif de son état (Concept §2 : jamais un blocage muet).
    if (dans(STATUTS_REGISTRE, s["statut"]) && !["autorisee", "active"].includes(s["statut"]) && !texte(s["motif"])) e("motif (obligatoire hors autorisation)");
  }
  if (erreurs.length) throw new Error(`Registre des sources de prix invalide : ${erreurs.slice(0, 10).join(", ")}.`);
  return {
    version: r["version"] as string, revueLe: r["revueLe"] as string, revueAvant: r["revueAvant"] as string,
    responsable: r["responsable"] as string, dossier: r["dossier"] as string,
    sources: (r["sources"] as Record<string, unknown>[]).map((s) => ({
      cle: s["cle"] as string, titre: s["titre"] as string, couche: s["couche"] as SourceRegistre["couche"], produit: s["produit"] as SourceRegistre["produit"],
      statut: s["statut"] as StatutRegistre, editeur: s["editeur"] as string, url: (s["url"] as string | null) ?? null, licence: (s["licence"] as string | null) ?? null,
      motif: (s["motif"] as string | null) ?? null, prochaineAction: (s["prochaineAction"] as string | null) ?? null, derivee: s["derivee"] as boolean,
      ficheGeodata: (s["ficheGeodata"] as string | null) ?? null,
    })),
  };
}

export interface BilanRegistre {
  readonly etat: "absent" | "inchange" | "charge";
  readonly sources: number;
  readonly ajoutees: number;
  readonly modifiees: number;
  readonly statutsChanges: number;
  readonly retirees: number;
}

/** Ligne lue par le bilan de l'import automatique. */
export const ligneBilanRegistre = (b: BilanRegistre): string =>
  b.etat === "absent" ? "Registre des sources de prix : absent du dossier livré."
    : b.etat === "inchange" ? `Registre des sources de prix : inchangé (${b.sources} source(s)).`
      : `Registre des sources de prix : ${b.sources} source(s), ${b.ajoutees} ajoutée(s), ${b.modifiees} mise(s) à jour, ${b.statutsChanges} changement(s) de statut, ${b.retirees} retirée(s).`;

const journal = (ex: Executeur, action: string, cle: string, details: Record<string, unknown>) =>
  ex.query("INSERT INTO geodata_journal (acteur_id, action, ressource, resultat, details) VALUES (NULL, $1, $2, 'succes', $3)", [action, cle, JSON.stringify({ par: "registre", ...details })]);

/** Charge le registre du dossier des sources (voir l'en-tête) ; à exécuter dans une transaction de l'appelant. */
export async function chargerRegistrePrix(ex: Executeur, dossier: string): Promise<BilanRegistre> {
  const plein = join(dossier, CHEMIN_REGISTRE_PRIX);
  if (!existsSync(plein)) return { etat: "absent", sources: 0, ajoutees: 0, modifiees: 0, statutsChanges: 0, retirees: 0 };
  const octets = readFileSync(plein);
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const registre = lireRegistrePrix(JSON.parse(octets.toString("utf8")));
  // Le fichier est archivé tel quel (normalement déjà fait par l'archive des fichiers livrés, qui précède).
  await ex.query(
    `INSERT INTO geodata_fichiers (chemin, role, source_cle, type_media, taille, empreinte, contenu, archive_le, retire_le)
     VALUES ($1, 'prix', NULL, 'application/json', $2, $3, $4, now(), NULL)
     ON CONFLICT (chemin) DO UPDATE SET role = 'prix', taille = EXCLUDED.taille, empreinte = EXCLUDED.empreinte, contenu = EXCLUDED.contenu, archive_le = now(), retire_le = NULL
      WHERE geodata_fichiers.empreinte <> EXCLUDED.empreinte OR geodata_fichiers.retire_le IS NOT NULL`,
    [CHEMIN_REGISTRE_PRIX, octets.length, empreinte, octets],
  );
  const cles = registre.sources.map((s) => s.cle);
  const [n] = (await ex.query<{ deja: string; autres: string }>(
    `SELECT count(*) FILTER (WHERE cle = ANY($1) AND empreinte_registre = $2) AS deja,
            count(*) FILTER (WHERE NOT (cle = ANY($1)) AND statut <> 'retiree') AS autres FROM geodata_prix_sources`,
    [cles, empreinte],
  )).rows;
  if (Number(n?.deja) === cles.length && Number(n?.autres) === 0) {
    return { etat: "inchange", sources: cles.length, ajoutees: 0, modifiees: 0, statutsChanges: 0, retirees: 0 };
  }
  let ajoutees = 0, modifiees = 0, statutsChanges = 0, retirees = 0;
  for (const s of registre.sources) {
    const [avant] = (await ex.query<{ statut: string; statut_origine: string; empreinte_registre: string | null }>(
      "SELECT statut, statut_origine, empreinte_registre FROM geodata_prix_sources WHERE cle = $1 FOR UPDATE", [s.cle],
    )).rows;
    const conserve = !!avant && avant.statut_origine === "administration" && avant.statut !== s.statut;
    const statut = conserve ? avant!.statut : s.statut;
    const valeurs = [s.cle, s.titre, s.couche, s.produit, statut, conserve ? "administration" : "registre", s.editeur, s.url, s.licence, s.motif, s.prochaineAction,
      s.derivee, s.ficheGeodata, registre.revueLe, registre.revueAvant, registre.responsable, registre.dossier, CHEMIN_REGISTRE_PRIX, empreinte, registre.version];
    if (!avant) {
      await ex.query(
        `INSERT INTO geodata_prix_sources (cle, titre, couche, produit, statut, statut_origine, editeur, url, licence, motif, prochaine_action, derivee, fiche_geodata,
           revue_le, revue_avant, responsable, dossier, fichier_chemin, empreinte_registre, version_registre)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
        valeurs,
      );
      await journal(ex, "prix.source.ajoutee", s.cle, { statut });
      ajoutees++;
      continue;
    }
    if (avant.empreinte_registre === empreinte && !conserve) continue;
    await ex.query(
      `UPDATE geodata_prix_sources SET titre = $2, couche = $3, produit = $4, statut = $5, statut_origine = $6, editeur = $7, url = $8, licence = $9, motif = $10,
         prochaine_action = $11, derivee = $12, fiche_geodata = $13, revue_le = $14, revue_avant = $15, responsable = $16, dossier = $17, fichier_chemin = $18,
         empreinte_registre = $19, version_registre = $20, charge_le = now()
       WHERE cle = $1`,
      valeurs,
    );
    modifiees++;
    if (conserve) await journal(ex, "prix.source.statut_conserve", s.cle, { statut: avant.statut, registre: s.statut });
    if (statut !== avant.statut) {
      await journal(ex, "prix.source.statut", s.cle, { avant: avant.statut, apres: statut, origine: "registre", version: registre.version });
      statutsChanges++;
      if (sourceAutorisee(avant.statut) && !sourceAutorisee(statut)) await retirerSortiesDeSource(ex, s.cle, `Source « ${s.cle} » : statut ${statut} (registre ${registre.version})`, null);
    }
  }
  // Sources absentes du registre : retirées, jamais effacées (historique et lignée conservés).
  const parties = (await ex.query<{ cle: string; statut: string }>(
    "SELECT cle, statut FROM geodata_prix_sources WHERE NOT (cle = ANY($1)) AND statut <> 'retiree' FOR UPDATE", [cles],
  )).rows;
  for (const p of parties) {
    await ex.query("UPDATE geodata_prix_sources SET statut = 'retiree', statut_origine = 'registre', charge_le = now() WHERE cle = $1", [p.cle]);
    await journal(ex, "prix.source.statut", p.cle, { avant: p.statut, apres: "retiree", origine: "registre", motif: "absente du registre", version: registre.version });
    if (sourceAutorisee(p.statut)) await retirerSortiesDeSource(ex, p.cle, `Source « ${p.cle} » retirée du registre ${registre.version}`, null);
    retirees++;
  }
  return { etat: "charge", sources: cles.length, ajoutees, modifiees, statutsChanges, retirees };
}
