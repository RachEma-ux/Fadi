/**
 * Aide des suites DB-3 (Issue #425) : l'inscription ne crée plus de session — `POST /auth/register` répond 202 pour toute
 * adresse et envoie un lien de création de compte. `inscrire` passe par les vraies routes : demande d'inscription (202),
 * puis activation de l'invitation créée (`POST /auth/activate`, mot de passe et conditions), qui ouvre la session dans
 * l'agent. Le courriel n'étant pas lisible dans les suites (transport absent : la file ne garde pas le lien), le jeton
 * de l'invitation en attente est remplacé en base par un jeton connu de la suite — seul raccourci. Le résultat reprend
 * la forme de l'ancienne inscription : 201 et la vue du compte. Jamais importé par le serveur.
 */
import { createHash, randomBytes } from "node:crypto";
import { pool } from "../db/client.js";

interface Agent {
  post(url: string): { send(body: unknown): PromiseLike<{ status: number; body: any }> };
}

export async function inscrire(client: Agent, email: string, password: string): Promise<{ status: number; body: any }> {
  const demande = await client.post("/auth/register").send({ email, password });
  if (demande.status !== 202) return demande;
  const token = `inscription-${randomBytes(18).toString("hex")}`;
  const { rowCount } = await pool.query(
    "UPDATE auth.invitations SET token_hash = $1 WHERE lower(email) = lower($2) AND purpose = 'platform_account' AND invited_by IS NULL AND status = 'pending'",
    [createHash("sha256").update(token).digest("hex"), email.trim()],
  );
  // Adresse déjà inscrite : aucune invitation, la réponse de l'activation le dira (404).
  if (!rowCount) return { status: 409, body: { error: "registration_failed" } };
  const activation = await client.post("/auth/activate").send({ token, password, acceptTerms: true });
  return { status: activation.status, body: activation.status === 201 ? activation.body.user : activation.body };
}
