/**
 * Liens de consultation de la Planche du Sandbox (cas 4 du catalogue des extensions, étape 7d : D11-F18-018 ; maquette
 * `analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7d).
 *
 * Routes du compte, montées sous `/sandbox/consultations` (compte connecté exigé, 401 sinon) :
 *
 *   GET  /                 → { liens: [{ jeton, nom, creeLe, echeance, mesure, revoqueLe }] } — liens du compte, du plus
 *                            récent au plus ancien (sans le dessin) ;
 *   POST /                 { nom, modele, echeance: "AAAA-MM-JJ" | null, mesure: booléen } → 201 { lien } — copie figée
 *                            du dessin (relu par `lireModelePlanche` : jamais cru sur parole), jeton aléatoire ;
 *                            forme fautive → 400 invalid_input (champ nommé) ; dessin de plus de 8 Mo → 413 ;
 *   POST /:jeton/revoquer  → { lien } — révoque (définitif) ; lien d'un autre compte ou inconnu → 404.
 *
 * Route publique, montée sous `/consultation/api` (sans compte) :
 *
 *   GET  /:jeton           → { nom, creeLe, mesure, modele } ; révoqué, échu (la veille de l'échéance passée, heure
 *                            suisse) ou inconnu → 404 { error: "indisponible" } — sans dire lequel.
 *
 * Réponses jamais mises en cache ; aucune écriture n'est possible par le lien.
 */
import { randomBytes } from "node:crypto";
import express, { Router, type Response } from "express";
import { lireModelePlanche } from "@parcours/sandbox-planche-model";
import { pool } from "../db/client.js";
import { requireAuth } from "../middleware/require-auth.js";

/** Taille maximale du dessin figé (le corps JSON entier). */
export const LIMITE_CONSULTATION = "8mb";
const JOUR = /^(\d{4})-(\d{2})-(\d{2})$/;

const prive = (_req: unknown, res: Response, next: () => void) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
};

interface LigneConsultation {
  jeton: string;
  nom: string;
  cree_le: Date;
  echeance: string | null;
  mesure: boolean;
  revoque_le: Date | null;
}
const lien = (l: LigneConsultation) => ({ jeton: l.jeton, nom: l.nom, creeLe: l.cree_le.toISOString(), echeance: l.echeance, mesure: l.mesure, revoqueLe: l.revoque_le ? l.revoque_le.toISOString() : null });
const COLONNES = "jeton, nom, cree_le, to_char(echeance, 'YYYY-MM-DD') AS echeance, mesure, revoque_le";

/** Date « AAAA-MM-JJ » réelle (pas de 31 février). */
function jourValide(v: string): boolean {
  const m = JOUR.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

export const sandboxConsultationsRouter = Router();
sandboxConsultationsRouter.use(requireAuth);
sandboxConsultationsRouter.use(prive);
sandboxConsultationsRouter.use(express.json({ limit: LIMITE_CONSULTATION }));

sandboxConsultationsRouter.get("/", async (req, res) => {
  const r = await pool.query<LigneConsultation>(`SELECT ${COLONNES} FROM sandbox_consultations WHERE proprietaire_id = $1 ORDER BY cree_le DESC LIMIT 200`, [req.user!.id]);
  res.json({ liens: r.rows.map(lien) });
});

sandboxConsultationsRouter.post("/", async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const invalide = (champ: string, message: string) => void res.status(400).json({ error: "invalid_input", message, champs: [champ] });
  const nom = typeof b["nom"] === "string" ? b["nom"].trim() : "";
  if (nom.length < 1 || nom.length > 120) return invalide("nom", "Nom : 1 à 120 caractères.");
  if (typeof b["mesure"] !== "boolean") return invalide("mesure", "Mesure : permise ou non.");
  const echeance = b["echeance"] ?? null;
  if (echeance !== null && (typeof echeance !== "string" || !jourValide(echeance))) return invalide("echeance", "Échéance : une date AAAA-MM-JJ, ou aucune.");
  const modele = lireModelePlanche(b["modele"]);
  if (!modele) return invalide("modele", "Dessin illisible.");
  const jeton = randomBytes(24).toString("base64url");
  const r = await pool.query<LigneConsultation>(
    `INSERT INTO sandbox_consultations (jeton, proprietaire_id, nom, modele, mesure, echeance) VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLONNES}`,
    [jeton, req.user!.id, nom, JSON.stringify(modele), b["mesure"], echeance],
  );
  res.status(201).json({ lien: lien(r.rows[0]!) });
});

sandboxConsultationsRouter.post("/:jeton/revoquer", async (req, res) => {
  const r = await pool.query<LigneConsultation>(
    `UPDATE sandbox_consultations SET revoque_le = COALESCE(revoque_le, now()) WHERE jeton = $1 AND proprietaire_id = $2 RETURNING ${COLONNES}`,
    [String(req.params["jeton"]), req.user!.id],
  );
  if (!r.rows[0]) return void res.status(404).json({ error: "not_found", message: "Lien introuvable." });
  res.json({ lien: lien(r.rows[0]) });
});

/** Route publique : un lien révoqué, échu ou inconnu répond de la même façon. */
export const consultationPubliqueRouter = Router();
consultationPubliqueRouter.use(prive);
consultationPubliqueRouter.get("/:jeton", async (req, res) => {
  const jeton = String(req.params["jeton"]);
  const indisponible = () => void res.status(404).json({ error: "indisponible", message: "Lien indisponible." });
  if (!/^[A-Za-z0-9_-]{32}$/.test(jeton)) return indisponible();
  const r = await pool.query<{ nom: string; cree_le: Date; mesure: boolean; modele: unknown }>(
    `SELECT nom, cree_le, mesure, modele FROM sandbox_consultations
      WHERE jeton = $1 AND revoque_le IS NULL AND (echeance IS NULL OR echeance >= (now() AT TIME ZONE 'Europe/Zurich')::date)`,
    [jeton],
  );
  const l = r.rows[0];
  if (!l) return indisponible();
  res.setHeader("X-Robots-Tag", "noindex");
  res.json({ nom: l.nom, creeLe: l.cree_le.toISOString(), mesure: l.mesure, modele: l.modele });
});
