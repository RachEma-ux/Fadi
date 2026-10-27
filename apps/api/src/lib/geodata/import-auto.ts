/**
 * Import automatique des données GeoData au démarrage de l'API (D-GD-23, D-GD-29) : la chaîne d'import
 * (`geodata-reference.js --archiver --fiche toutes …`) tourne en arrière-plan, l'API répond pendant ce temps :
 *   1. chaque fichier de données livré avec le code est copié tel quel en base (`geodata_fichiers`) ;
 *   2. chaque fiche qualifiée est préparée puis publiée si elle n'est pas déjà en base (même empreinte : rien n'est
 *      recréé), les retraits déclarés (`donnees/retraits-sources.json`) sont appliqués, le découpage territorial est écrit.
 * Sans réglage, tout est fait **par la livraison** (`--livraison`, aucun compte : l'interface et ses outils ne portent
 * aucune donnée, la base les reçoit toutes au premier démarrage). `GEODATA_IMPORT_AUTO_PAR=<courriel>` fait la même
 * chose au nom de ce compte GeoData (rôles « gestionnaire-donnees » et « responsable-publication »).
 * `GEODATA_IMPORT_AUTO=non` ne lance rien (recettes de la CI, tests). L'état est lu par `GET /version/donnees`.
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

let etat: EtatImportAuto = { etat: "desactive", debut: null, fin: null, message: "Import automatique non lancé." };

export const etatImportAuto = (): EtatImportAuto => ({ ...etat });

let enfantCourant: import("node:child_process").ChildProcess | null = null;

/** Arrêt de l'API (SIGTERM) : l'import en cours est arrêté avec elle, jamais laissé tourner seul. */
export function arreterImportAuto(): void {
  if (!enfantCourant || enfantCourant.exitCode !== null) return;
  etat = { ...etat, etat: "echec", fin: new Date().toISOString(), message: "Import interrompu par l'arrêt de l'API ; il reprend au prochain démarrage." };
  enfantCourant.kill("SIGTERM");
}

const COURRIEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Bilan d'une sortie de `geodata-reference.js --fiche toutes` (lignes de journal de la chaîne d'import). */
export function bilanImport(sortie: string): string {
  const n = (re: RegExp) => (sortie.match(re) ?? []).length;
  const archive = sortie.match(/^Archive des fichiers : .*$/m)?.[0];
  return `${archive ? `${archive} ` : ""}${n(/^Version préparée/gm)} version(s) préparée(s), ${n(/^Version \S+ publiée/gm)} publiée(s), ${n(/^Retrait :/gm)} retirée(s), ${n(/^Version déjà présente/gm)} fiche(s) déjà en base.`;
}

export function lancerImportAuto(env: Record<string, string | undefined> = process.env, script = fileURLToPath(new URL("./geodata-reference.js", import.meta.url))): void {
  if (env["GEODATA_ENABLED"] === "false") return;
  if (env["GEODATA_IMPORT_AUTO"]?.trim() === "non") { etat = { etat: "desactive", debut: null, fin: null, message: "GEODATA_IMPORT_AUTO=non : import automatique désactivé." }; return; }
  const par = env["GEODATA_IMPORT_AUTO_PAR"]?.trim();
  const debut = new Date().toISOString();
  if (!existsSync(script)) { etat = { etat: "echec", debut, fin: debut, message: "Outil d'import absent de cette construction (geodata-reference.js)." }; return; }
  // Un réglage qui n'est pas une adresse de courriel (vide, texte d'exemple…) n'empêche jamais les données d'arriver en
  // base : il est ignoré, signalé dans la quittance, et la livraison fait l'import.
  const compte = par && COURRIEL.test(par) ? par : null;
  const note = par && !compte ? " GEODATA_IMPORT_AUTO_PAR ignoré (pas une adresse de courriel) : import par la livraison." : "";
  const acteur = compte ? ["--preparateur", compte, "--publier-par", compte] : ["--livraison"];
  executer(script, ["--archiver", "--fiche", "toutes", ...acteur], env, debut, `Archive des fichiers et import des fiches livrées en cours (${compte ? `par ${compte}` : "par la livraison"}).${note}`, note);
}

function executer(script: string, args: string[], env: Record<string, string | undefined>, debut: string, enCours: string, note = ""): void {
  etat = { etat: "en-cours", debut, fin: null, message: enCours };
  let sortie = "";
  let erreurs = "";
  const enfant = spawn(process.execPath, [script, ...args], { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
  enfantCourant = enfant;
  enfant.stdout.on("data", (b: Buffer) => { sortie += b.toString(); if (sortie.length > 2_000_000) sortie = sortie.slice(-1_000_000); });
  enfant.stderr.on("data", (b: Buffer) => { erreurs = (erreurs + b.toString()).slice(-4000); });
  enfant.on("close", (code) => {
    if (enfantCourant === enfant) enfantCourant = null;
    if (etat.etat !== "en-cours") return; // interrompu par l'arrêt de l'API : état déjà consigné
    const fin = new Date().toISOString();
    const bilan = bilanImport(sortie) + note;
    etat = code === 0
      ? { etat: "termine", debut, fin, message: bilan }
      : { etat: "echec", debut, fin, message: `${bilan} Dernière erreur : ${erreurs.trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 600) || `code ${code}`}` };
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ level: code === 0 ? "info" : "error", message: "geodata_import_auto", etat: etat.etat, detail: etat.message }));
  });
  enfant.on("error", (e) => { etat = { etat: "echec", debut, fin: new Date().toISOString(), message: `Lancement impossible : ${e.message}` }; });
}
