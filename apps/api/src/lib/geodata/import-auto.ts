/**
 * Import automatique des données GeoData au déploiement (D-GD-23) : au démarrage de l'API, si
 * `GEODATA_IMPORT_AUTO_PAR` désigne un compte GeoData (rôles « gestionnaire-donnees » et « responsable-publication »),
 * la chaîne administrative d'import (`geodata-reference.js --fiche toutes`) tourne en arrière-plan : chaque fiche
 * qualifiée livrée avec le code est préparée puis publiée si elle n'est pas déjà en base (même empreinte : rien n'est
 * recréé), et les retraits déclarés (`donnees/retraits-sources.json`) sont appliqués. L'API répond pendant l'import.
 * Dans tous les cas, l'outil d'import copie d'abord en base les fichiers de données livrés (`--archiver`, D-GD-29) : sans
 * `GEODATA_IMPORT_AUTO_PAR`, seule cette archive est faite. Outil absent et variable absente : rien n'est fait
 * (« désactivé »). L'état est lu par `GET /version/donnees` (quittance du serveur).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export interface EtatImportAuto {
  etat: "desactive" | "en-cours" | "termine" | "echec";
  debut: string | null;
  fin: string | null;
  /** Bilan lisible : versions préparées, publiées, retirées, fiches déjà présentes ; ou motif de l'échec. */
  message: string | null;
}

let etat: EtatImportAuto = { etat: "desactive", debut: null, fin: null, message: "GEODATA_IMPORT_AUTO_PAR absent : import automatique désactivé." };

export const etatImportAuto = (): EtatImportAuto => ({ ...etat });

const COURRIEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Bilan d'une sortie de `geodata-reference.js --fiche toutes` (lignes de journal de la chaîne d'import). */
export function bilanImport(sortie: string): string {
  const n = (re: RegExp) => (sortie.match(re) ?? []).length;
  const archive = sortie.match(/^Archive des fichiers : .*$/m)?.[0];
  return `${archive ? `${archive} ` : ""}${n(/^Version préparée/gm)} version(s) préparée(s), ${n(/^Version \S+ publiée/gm)} publiée(s), ${n(/^Retrait :/gm)} retirée(s), ${n(/^Version déjà présente/gm)} fiche(s) déjà en base.`;
}

export function lancerImportAuto(env: Record<string, string | undefined> = process.env, script = fileURLToPath(new URL("./geodata-reference.js", import.meta.url))): void {
  if (env["GEODATA_ENABLED"] === "false") return;
  const par = env["GEODATA_IMPORT_AUTO_PAR"]?.trim();
  const debut = new Date().toISOString();
  if (!par) {
    if (existsSync(script)) executer(script, ["--archiver"], env, debut, "Archive des fichiers de données en cours (import automatique désactivé : GEODATA_IMPORT_AUTO_PAR absent).", true);
    return;
  }
  if (!COURRIEL.test(par)) { etat = { etat: "echec", debut, fin: debut, message: "GEODATA_IMPORT_AUTO_PAR n'est pas une adresse de courriel." }; return; }
  if (!existsSync(script)) { etat = { etat: "echec", debut, fin: debut, message: "Outil d'import absent de cette construction (geodata-reference.js)." }; return; }
  executer(script, ["--archiver", "--fiche", "toutes", "--preparateur", par, "--publier-par", par], env, debut, "Archive des fichiers et import des fiches livrées en cours.", false);
}

function executer(script: string, args: string[], env: Record<string, string | undefined>, debut: string, enCours: string, archiveSeule: boolean): void {
  etat = { etat: "en-cours", debut, fin: null, message: enCours };
  let sortie = "";
  let erreurs = "";
  const enfant = spawn(process.execPath, [script, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  enfant.stdout.on("data", (b: Buffer) => { sortie += b.toString(); if (sortie.length > 2_000_000) sortie = sortie.slice(-1_000_000); });
  enfant.stderr.on("data", (b: Buffer) => { erreurs = (erreurs + b.toString()).slice(-4000); });
  enfant.on("close", (code) => {
    const fin = new Date().toISOString();
    const bilan = archiveSeule
      ? `${sortie.match(/^Archive des fichiers : .*$/m)?.[0] ?? "Archive des fichiers : aucun bilan."} Import automatique désactivé (GEODATA_IMPORT_AUTO_PAR absent).`
      : bilanImport(sortie);
    etat = code === 0
      ? { etat: "termine", debut, fin, message: bilan }
      : { etat: "echec", debut, fin, message: `${bilan} Dernière erreur : ${erreurs.trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 600) || `code ${code}`}` };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: code === 0 ? "info" : "error", message: "geodata_import_auto", etat: etat.etat, detail: etat.message }));
  });
  enfant.on("error", (e) => { etat = { etat: "echec", debut, fin: new Date().toISOString(), message: `Lancement impossible : ${e.message}` }; });
}
