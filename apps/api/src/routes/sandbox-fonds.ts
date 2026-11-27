/**
 * Originaux des fonds calés de la Planche du Sandbox (cas 4 du catalogue, lot C4, étape 1 : D10-F23a-002 ; décision du
 * maître d'ouvrage du 27 novembre 2026 : « archiver l'original en base »). L'image affichée dans la Planche n'est
 * qu'une copie réduite ; le fichier reçu est rangé ici tel quel, avec son empreinte SHA-256, au nom du compte.
 *
 * Routes montées sous `/sandbox/fonds` (compte connecté exigé, 401 sinon) :
 *
 *   POST /      corps brut (Content-Type image/png ou image/jpeg, en-tête X-Fadi-Nom : nom du fichier encodé URI)
 *               → 201 { original: { id, nom, type, taille, empreinte, ajouteLe } } (200 si ce même fichier était déjà
 *               rangé pour ce compte) ; type annoncé ou signature des octets autres que PNG / JPEG → 415 ; nom illisible
 *               → 400 ; plus de 25 Mo → 413.
 *   GET  /:id   → les octets tels qu'ils ont été rangés (Content-Type d'origine) ; 404 s'il n'est pas au compte.
 *
 * Jamais effacé par l'application ; jamais mis en cache.
 */
import { createHash } from "node:crypto";
import express, { Router, type Response } from "express";
import { pool } from "../db/client.js";
import { newId } from "../lib/ids.js";
import { requireAuth } from "../middleware/require-auth.js";

/** Taille maximale d'un original (choix Fadi : un scan A0 en JPEG ou une orthophoto PNG courante). */
export const LIMITE_ORIGINAL_FOND = 25 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "text/plain"] as const;
type TypeFond = (typeof TYPES)[number];
/** Fichier de calage d'une orthophoto (world file, .prj : D-GD-29, archivé tel quel) : texte court. */
export const LIMITE_PIECE_CALAGE = 64 * 1024;

/** Type d'après la signature des octets (jamais d'après le seul en-tête). */
export function typeDesOctets(o: Buffer): TypeFond | null {
  if (o.length >= 8 && o.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return "image/jpeg";
  // Pièce de calage : six nombres (world file) ou un système en WKT (.prj), texte sans octet nul.
  if (o.length > 0 && o.length <= LIMITE_PIECE_CALAGE && !o.includes(0)) {
    const t = o.toString("latin1").trim();
    const nombres = t.split(/\s+/);
    if (nombres.length === 6 && nombres.every((x) => /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(x))) return "text/plain";
    if (/^(PROJCS|GEOGCS|GEOCCS|COMPD_CS|PROJCRS|GEOGCRS|GEODCRS|COMPOUNDCRS)\s*\[/i.test(t)) return "text/plain";
  }
  return null;
}

interface Ligne {
  id: string;
  nom: string;
  type: TypeFond;
  taille: number;
  empreinte: string;
  ajoute_le: Date;
}
const COLONNES = "id, nom, type, taille, empreinte, ajoute_le";
const original = (l: Ligne) => ({ id: l.id, nom: l.nom, type: l.type, taille: l.taille, empreinte: l.empreinte, ajouteLe: l.ajoute_le.toISOString() });

const prive = (_req: unknown, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
};

export const sandboxFondsRouter = Router();
sandboxFondsRouter.use(requireAuth);
sandboxFondsRouter.use(prive);

sandboxFondsRouter.post("/", express.raw({ type: () => true, limit: LIMITE_ORIGINAL_FOND }), async (req, res) => {
  const annonce = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const octets = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const type = typeDesOctets(octets);
  if (!TYPES.includes(annonce as TypeFond) || type !== annonce) return void res.status(415).json({ error: "unsupported_media_type", message: "Image PNG ou JPEG, ou fichier de calage (world file, .prj) attendu." });
  let nom: string;
  try {
    nom = decodeURIComponent(String(req.headers["x-fadi-nom"] ?? "")).trim();
  } catch {
    nom = "";
  }
  if (nom.length < 1 || nom.length > 120 || /[\\/\u0000-\u001f]/.test(nom)) return void res.status(400).json({ error: "invalid_input", message: "Nom de fichier : 1 à 120 caractères, sans chemin.", champs: ["nom"] });
  const empreinte = createHash("sha256").update(octets).digest("hex");
  const insere = await pool.query<Ligne>(
    `INSERT INTO sandbox_fonds_originaux (id, proprietaire_id, nom, type, taille, empreinte, contenu) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (proprietaire_id, empreinte) DO NOTHING RETURNING ${COLONNES}`,
    [newId("sbxfond"), req.user!.id, nom, type, octets.length, empreinte, octets],
  );
  if (insere.rows[0]) return void res.status(201).json({ original: original(insere.rows[0]) });
  const deja = await pool.query<Ligne>(`SELECT ${COLONNES} FROM sandbox_fonds_originaux WHERE proprietaire_id = $1 AND empreinte = $2`, [req.user!.id, empreinte]);
  res.status(200).json({ original: original(deja.rows[0]!) });
});

sandboxFondsRouter.get("/:id", async (req, res) => {
  const r = await pool.query<Ligne & { contenu: Buffer }>(`SELECT ${COLONNES}, contenu FROM sandbox_fonds_originaux WHERE id = $1 AND proprietaire_id = $2`, [String(req.params["id"]), req.user!.id]);
  const l = r.rows[0];
  if (!l) return void res.status(404).json({ error: "not_found" });
  res.setHeader("Content-Type", l.type);
  res.setHeader("X-Fadi-Empreinte", l.empreinte);
  res.send(l.contenu);
});
