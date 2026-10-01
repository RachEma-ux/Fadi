import { Router } from "express";
import { serialize } from "cookie";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { createSession, destroySession, hashPassword, SESSION_COOKIE, verifyPassword } from "../lib/auth.js";
import { newId } from "../lib/ids.js";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  // Longueur minimale seulement : imposer une "complexité" force souvent des
  // mots de passe plus faibles et prévisibles (NIST SP 800-63B).
  password: z.string().min(8).max(256),
});

function setSessionCookie(res: import("express").Response, sessionId: string, expiresAt: Date): void {
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env["NODE_ENV"] === "production",
      path: "/",
      expires: expiresAt,
    }),
  );
}

authRouter.post("/register", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    // Message volontairement générique : ne pas confirmer qu'un e-mail existe déjà (A07 OWASP).
    res.status(409).json({ error: "registration_failed" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = newId("user");
  await db.insert(users).values({ id, email, passwordHash });

  const session = await createSession(id);
  setSessionCookie(res, session.id, session.expiresAt);
  res.status(201).json({ id, email });
});

authRouter.post("/login", async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const { email, password } = parsed.data;

  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];
  // Message identique que l'utilisateur existe ou non, pour ne pas révéler
  // quels e-mails sont enregistrés (OWASP A07 — authentication failures).
  const invalid = () => res.status(401).json({ error: "invalid_credentials" });
  if (!user) {
    invalid();
    return;
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    invalid();
    return;
  }

  const session = await createSession(user.id);
  setSessionCookie(res, session.id, session.expiresAt);
  res.status(200).json({ id: user.id, email: user.email });
});

authRouter.post("/logout", async (req, res) => {
  const header = req.headers.cookie;
  const { parse } = await import("cookie");
  const cookies = header ? parse(header) : {};
  const sessionId = cookies[SESSION_COOKIE];
  if (sessionId) {
    await destroySession(sessionId);
  }
  res.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", expires: new Date(0) }),
  );
  res.status(204).end();
});

authRouter.get("/me", (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  res.status(200).json(req.user);
});
