/**
 * Fichiers des références verrouillées de la Planche du Sandbox (cas 4 du catalogue, lot C4, étape 3 : D10-F14-024,
 * D10-F23a-011). Une référence (maquette reçue OBJ, STL ou IFC) n'est jamais fusionnée au dessin : le fichier reçu est
 * rangé ici tel quel, avec son empreinte SHA-256, au nom du compte ; la Planche le relit à l'ouverture.
 *
 * Routes montées sous `/sandbox/references` (compte connecté exigé, 401 sinon) :
 *
 *   POST /      corps brut (en-têtes X-Fadi-Nom : nom du fichier encodé URI ; X-Fadi-Format : obj, stl ou ifc)
 *               → 201 { fichier: { id, nom, format, taille, empreinte, ajouteLe } } (200 si ce même fichier était déjà
 *               rangé pour ce compte) ; contenu qui ne ressemble pas au format annoncé → 415 ; nom illisible → 400 ;
 *               plus de 60 Mo → 413.
 *   GET  /:id   → les octets tels qu'ils ont été rangés ; 404 s'ils ne sont pas au compte.
 *
 * Jamais effacé par l'application ; jamais mis en cache.
 */
import { createHash } from "node:crypto";
import express, { Router, type Response } from "express";
import { pool } from "../db/client.js";
import { newId } from "../lib/ids.js";
import { requireAuth } from "../middleware/require-auth.js";

/** Taille maximale d'un fichier de référence (choix Fadi : maquette d'un bâtiment courant, relevé décimé). */
export const LIMITE_FICHIER_REFERENCE = 60 * 1024 * 1024;
const FORMATS = ["obj", "stl", "ifc", "pdf"] as const;
type FormatReference = (typeof FORMATS)[number];

/** Le contenu ressemble-t-il au format annoncé ? (signature, jamais d'après le seul nom). */
export function contenuConforme(format: FormatReference, o: Buffer): boolean {
  if (o.length === 0) return false;
  const tete = o.subarray(0, 65536).toString("latin1");
  if (format === "ifc") return /^\s*ISO-10303-21\s*;/.test(tete);
  // PDF reçu (lot C4, étape 4) : signature « %PDF- » dans le premier kilo-octet.
  if (format === "pdf") return tete.slice(0, 1024).includes("%PDF-");
  if (format === "stl") {
    if (/^\s*solid\b/.test(tete) && /facet\s+normal/.test(tete)) return true;
    return o.length >= 84 && o.length === 84 + 50 * o.readUInt32LE(80);
  }
  return !tete.includes("\u0000") && /^\s*v\s+[-+0-9.eE]+\s+[-+0-9.eE]+\s+[-+0-9.eE]+/m.test(tete);
}

interface Ligne {
  id: string;
  nom: string;
  format: FormatReference;
  taille: number;
  empreinte: string;
  ajoute_le: Date;
}
const COLONNES = "id, nom, format, taille, empreinte, ajoute_le";
const fichier = (l: Ligne) => ({ id: l.id, nom: l.nom, format: l.format, taille: l.taille, empreinte: l.empreinte, ajouteLe: l.ajoute_le.toISOString() });

const prive = (_req: unknown, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
};

export const sandboxReferencesRouter = Router();
sandboxReferencesRouter.use(requireAuth);
sandboxReferencesRouter.use(prive);

sandboxReferencesRouter.post("/", express.raw({ type: () => true, limit: LIMITE_FICHIER_REFERENCE }), async (req, res) => {
  const format = String(req.headers["x-fadi-format"] ?? "").trim().toLowerCase() as FormatReference;
  const octets = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!FORMATS.includes(format) || !contenuConforme(format, octets)) return void res.status(415).json({ error: "unsupported_media_type", message: "Fichier OBJ, STL, IFC ou PDF attendu, conforme au format annoncé." });
  let nom: string;
  try {
    nom = decodeURIComponent(String(req.headers["x-fadi-nom"] ?? "")).trim();
  } catch {
    nom = "";
  }
  if (nom.length < 1 || nom.length > 200 || /[\\/\u0000-\u001f]/.test(nom)) return void res.status(400).json({ error: "invalid_input", message: "Nom de fichier : 1 à 200 caractères, sans chemin.", champs: ["nom"] });
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const insere = await pool.query<Ligne>(
    `INSERT INTO sandbox_references_fichiers (id, proprietaire_id, nom, format, taille, empreinte, contenu) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (proprietaire_id, empreinte) DO NOTHING RETURNING ${COLONNES}`,
    [newId("sbxref"), req.user!.id, nom, format, octets.length, empreinte, octets],
  );
  if (insere.rows[0]) return void res.status(201).json({ fichier: fichier(insere.rows[0]) });
  const deja = await pool.query<Ligne>(`SELECT ${COLONNES} FROM sandbox_references_fichiers WHERE proprietaire_id = $1 AND empreinte = $2`, [req.user!.id, empreinte]);
  res.status(200).json({ fichier: fichier(deja.rows[0]!) });
});

sandboxReferencesRouter.get("/:id", async (req, res) => {
  const r = await pool.query<Ligne & { contenu: Buffer }>(`SELECT ${COLONNES}, contenu FROM sandbox_references_fichiers WHERE id = $1 AND proprietaire_id = $2`, [String(req.params["id"]), req.user!.id]);
  const l = r.rows[0];
  if (!l) return void res.status(404).json({ error: "not_found" });
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("X-Fadi-Empreinte", l.empreinte);
  res.setHeader("X-Fadi-Format", l.format);
  res.send(l.contenu);
});
