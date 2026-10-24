/**
 * Authentification et compte (docs/workstreams/users-management, phases 2 et 4).
 *
 *   POST   /auth/register                  inscription libre (UM-7), politique de mot de passe D-6
 *   POST   /auth/login                     mot de passe → session, ou 202 { mfaRequired } (étape « code attendu », 5 min)
 *   POST   /auth/login/mfa                 { code } ou { recoveryCode } → session
 *   POST   /auth/logout                    révoque la session courante
 *   GET    /auth/me · PATCH /auth/me       profil
 *   POST   /auth/me/password               { currentPassword, newPassword } → révoque les autres sessions
 *   GET    /auth/me/sessions               sessions ouvertes ; DELETE /auth/me/sessions/:id ; DELETE /auth/me/sessions (les autres)
 *   POST   /auth/me/mfa/setup|enable|disable|recovery-codes   double authentification TOTP (D-6)
 *   GET    /auth/me/history                « Mon historique » (journal d'activité filtré, phase 3 bis), curseur `before`
 *   GET    /auth/me/export                 export JSON des données personnelles (D-5)
 *   DELETE /auth/me                        { password, confirm } → suppression programmée à 30 jours (D-5)
 *   POST   /auth/verify-email/request|confirm
 *   POST   /auth/forgot-password           réponse identique que le compte existe ou non
 *   POST   /auth/reset-password            { token, password } → révoque toutes les sessions
 *   POST   /auth/cancel-deletion           { token } (même voie que « Restaurer » de la corbeille, `cancelScheduledDeletion`)
 *   POST   /auth/invitations/lookup|accept|decline ; POST /auth/activate   (UM-3)
 *
 * Aucun mot de passe, jeton ou code n'est journalisé ni stocké en clair. Les refus de connexion répondent toujours
 * « identifiants invalides » (compte inconnu, mauvais mot de passe, compte verrouillé), avec une vérification factice
 * pour un temps de réponse constant ; seul le titulaire du bon mot de passe apprend qu'un compte est suspendu.
 */
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import QRCode from "qrcode";
import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import {
  accountTokens, auditLog, invitations, projectComments, projectMembers, projects, sessions, studioComments, userRecoveryCodes, users,
} from "../db/schema.js";
import {
  clearSessionCookies, createSession, hashPassword, needsRehash, requestContext, resolvePendingMfa, revokeSessionById,
  revokeUserSessions, sessionTokenFrom, setSessionCookie, toSessionUser, verifyDummyPassword, verifyPassword,
} from "../lib/auth.js";
import { audit, clientIp, emailHash } from "../lib/audit.js";
import {
  consumeAccountToken, DELETION_GRACE_MS, formatDate, issueAccountToken, mailLocale, PUBLIC_PATHS, publicLink, sendAccountMail,
} from "../lib/account.js";
import { ReviewActivationRefused, reviewInvitationContext } from "../lib/reviews-core.js";
import {
  activateInvitation, findInvitationByToken, INVITATION_REFUSAL_MESSAGE, invitationRefusal, invitationView, inviterStillAuthorized,
} from "../lib/invitations.js";
import { organizationNameOf } from "../lib/organizations.js";
import { newId } from "../lib/ids.js";
import { userHistory } from "../lib/journal.js";
import { JOURNAL_PAGE_DEFAULT, JOURNAL_PAGE_MAX } from "../lib/journal-audience.js";
import { adminEnabled, removesLastAdmin } from "../lib/platform-access.js";
import { lockAdminEligibility, type Tx } from "../lib/admin-eligibility.js";
import { checkPassword, PASSWORD_MAX, PASSWORD_REFUSAL_MESSAGE } from "../lib/security/password-policy.js";
import { lockDurationMs, loginBlock } from "../lib/security/auth-policy.js";
import { EncryptionUnavailable, openSecret, sealSecret } from "../lib/security/secret-box.js";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../lib/security/totp.js";
import { normalizeRecoveryCode, RECOVERY_CODE_COUNT, recoveryCode, sha256Hex } from "../lib/security/tokens.js";
import { parse } from "cookie";

export const authRouter = Router();

const emailSchema = z.string().trim().toLowerCase().email().max(254);
// La politique (longueur 12–128, liste compromise) est appliquée par `checkPassword` ; ici seulement une borne de taille.
const passwordInput = z.string().min(1).max(PASSWORD_MAX * 4);
const credentialsSchema = z.object({ email: emailSchema, password: passwordInput });

/** Limite par identifiant (en plus de la limite par IP de `app.ts`) : 10 tentatives par 15 min et par adresse. */
const perIdentifier = (limit: number) => rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env["AUTH_IDENTIFIER_RATE_LIMIT"] ?? limit),
  standardHeaders: true,
  legacyHeaders: false,
  // Clé = l'adresse visée ; sans adresse dans le corps (activation d'invitation), l'empreinte du jeton présenté.
  keyGenerator: (req) => {
    const body = req.body as { email?: unknown; token?: unknown } | undefined;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : "";
    if (email) return `id:${email}`;
    return `tok:${sha256Hex(typeof body?.token === "string" ? body.token : String(req.ip ?? ""))}`;
  },
  message: { error: "too_many_attempts", message: "Trop de tentatives pour cette adresse : réessayez dans quelques minutes." },
});
/** Saisie du code de double authentification : 10 essais par 15 min et par étape de connexion. */
const mfaLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env["AUTH_IDENTIFIER_RATE_LIMIT"] ?? 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `mfa:${sha256Hex(sessionTokenFrom(parse(req.headers.cookie ?? ""))?.token ?? req.ip ?? "")}`,
  message: { error: "too_many_attempts", message: "Trop de codes essayés : recommencez la connexion dans quelques minutes." },
});

function passwordRefused(res: Response, password: string, email?: string | null): boolean {
  const refusal = checkPassword(password, { email });
  if (!refusal) return false;
  res.status(400).json({ error: "weak_password", reason: refusal, message: PASSWORD_REFUSAL_MESSAGE[refusal] });
  return true;
}

function requireUser(req: Request, res: Response): req is Request & { user: NonNullable<Request["user"]> } {
  if (req.user) return true;
  res.status(401).json({ error: "authentication_required" });
  return false;
}

/**
 * Ouvre une session complète. `mfaVerifiedAt` : seulement quand CETTE connexion a prouvé un code de double
 * authentification (TOTP ou de secours) ; sinon la session reste « mot de passe seul » et n'ouvre jamais l'administration.
 */
async function openFullSession(req: Request, res: Response, user: typeof users.$inferSelect, mfaVerifiedAt: Date | null = null) {
  const session = await createSession(user.id, user.platformRole, { ...requestContext(req), mfaVerifiedAt });
  setSessionCookie(res, session.token, session.absoluteExpiresAt);
  await db.update(users).set({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
  return toSessionUser(user, session.id, { mfaVerifiedAt });
}

const publicUser = (u: ReturnType<typeof toSessionUser>) => {
  const { sessionId: _sessionId, ...rest } = u;
  return rest;
};

// ---------------------------------------------------------------------------------------------------------------------
// Inscription, connexion, déconnexion
// ---------------------------------------------------------------------------------------------------------------------

authRouter.post("/register", perIdentifier(10), async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const { email, password } = parsed.data;
  if (passwordRefused(res, password, email)) return;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    // Message volontairement générique : ne pas confirmer qu'un e-mail existe déjà (A07 OWASP).
    res.status(409).json({ error: "registration_failed" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = newId("user");
  const locale = mailLocale(req);
  const created = await db.transaction(async (tx) => {
    const [row] = await tx.insert(users).values({ id, email, passwordHash, passwordChangedAt: new Date() }).returning();
    await audit(tx, { actorId: id, action: "auth.register", target: { type: "user", id }, ip: clientIp(req) });
    const token = await issueAccountToken(id, "verify_email", tx);
    await sendAccountMail(email, "verify_email", { link: publicLink(PUBLIC_PATHS.verify_email, token) }, locale, tx);
    return row!;
  });
  const user = await openFullSession(req, res, created);
  res.status(201).json(publicUser(user));
});

authRouter.post("/login", perIdentifier(10), async (req, res) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const { email, password } = parsed.data;
  const now = new Date();
  // Message identique que l'utilisateur existe ou non, pour ne pas révéler
  // quels e-mails sont enregistrés (OWASP A07 — authentication failures).
  const invalid = () => res.status(401).json({ error: "invalid_credentials" });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user || user.status === "closed") {
    await verifyDummyPassword(password);
    await audit(db, { actorId: null, action: "auth.login.failed", metadata: { reason: "unknown_account", emailHash: emailHash(email) }, ip: clientIp(req) });
    invalid();
    return;
  }
  const block = loginBlock(user, now);
  if (block === "locked") {
    await verifyDummyPassword(password);
    await audit(db, { actorId: user.id, action: "auth.login.failed", target: { type: "user", id: user.id }, metadata: { reason: "locked" }, ip: clientIp(req) });
    invalid();
    return;
  }
  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    // Incrément atomique (revue Codex de la PR #255) : des échecs simultanés ne s'écrasent pas ; la durée du verrouillage
    // se calcule sur la valeur renvoyée par la base, sous le verrou de ligne de cette même transaction.
    await db.transaction(async (tx) => {
      const [row] = await tx.update(users).set({ failedLoginCount: sql`${users.failedLoginCount} + 1` }).where(eq(users.id, user.id))
        .returning({ failures: users.failedLoginCount });
      const failures = row?.failures ?? user.failedLoginCount + 1;
      const lockMs = lockDurationMs(failures);
      if (lockMs) await tx.update(users).set({ lockedUntil: new Date(now.getTime() + lockMs) }).where(eq(users.id, user.id));
      await audit(tx, { actorId: user.id, action: lockMs ? "auth.login.locked" : "auth.login.failed", target: { type: "user", id: user.id }, metadata: { reason: "bad_password", failures, lockSeconds: lockMs / 1000 }, ip: clientIp(req) });
    });
    invalid();
    return;
  }
  if (block === "suspended") {
    res.status(403).json({ error: "account_suspended", message: "Ce compte est suspendu : contactez l'administrateur de la plateforme." });
    return;
  }
  if (block === "deletion_pending") {
    res.status(403).json({ error: "deletion_pending", message: "La suppression de ce compte est programmée : utilisez le lien d'annulation reçu par courriel pour la révoquer." });
    return;
  }
  // Réhachage transparent si les paramètres stockés ne sont plus les paramètres courants.
  if (needsRehash(user.passwordHash)) await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, user.id));

  if (user.totpEnabledAt) {
    await db.update(users).set({ failedLoginCount: 0, lockedUntil: null }).where(eq(users.id, user.id));
    const pending = await createSession(user.id, user.platformRole, { ...requestContext(req), mfaPending: true });
    setSessionCookie(res, pending.token, pending.absoluteExpiresAt);
    res.status(202).json({ mfaRequired: true, expiresAt: pending.absoluteExpiresAt.toISOString() });
    return;
  }
  const sessionUser = await openFullSession(req, res, user);
  await audit(db, { actorId: user.id, action: "auth.login.succeeded", target: { type: "user", id: user.id }, metadata: { mfa: false }, ip: clientIp(req) });
  res.status(200).json(publicUser(sessionUser));
});

const mfaLoginSchema = z.object({ code: z.string().trim().max(12).optional(), recoveryCode: z.string().trim().max(32).optional() })
  .refine((v) => !!v.code !== !!v.recoveryCode, "code ou recoveryCode");

authRouter.post("/login/mfa", mfaLimiter, async (req, res) => {
  const parsed = mfaLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const pending = await resolvePendingMfa(sessionTokenFrom(parse(req.headers.cookie ?? ""))?.token);
  if (!pending) {
    res.status(401).json({ error: "mfa_session_expired", message: "L'étape de connexion a expiré : saisissez de nouveau votre mot de passe." });
    return;
  }
  const { user, session } = pending;
  const ok = parsed.data.code ? await acceptTotp(user, parsed.data.code) : await consumeRecoveryCode(user.id, parsed.data.recoveryCode!, req);
  if (!ok) {
    await audit(db, { actorId: user.id, action: "auth.login.mfa_failed", target: { type: "user", id: user.id }, ip: clientIp(req) });
    res.status(401).json({ error: "invalid_code", message: "Code incorrect ou déjà utilisé." });
    return;
  }
  await revokeSessionById(session.id);
  // La preuve est liée à la session qui vient de la fournir, et à elle seule.
  const sessionUser = await openFullSession(req, res, user, new Date());
  await audit(db, { actorId: user.id, action: "auth.login.succeeded", target: { type: "user", id: user.id }, metadata: { mfa: parsed.data.code ? "totp" : "recovery_code" }, ip: clientIp(req) });
  res.status(200).json(publicUser(sessionUser));
});

/** Code TOTP valide et jamais utilisé : enregistre le pas (anti-rejeu) de façon atomique. */
async function acceptTotp(user: typeof users.$inferSelect, code: string, secretEnc = user.totpSecretEnc): Promise<boolean> {
  if (!secretEnc) return false;
  let secret: string;
  try { secret = openSecret(secretEnc); } catch { return false; }
  const step = verifyTotp(secret, code, Date.now(), user.totpLastStep ?? null);
  if (step === null) return false;
  const updated = await db.update(users).set({ totpLastStep: step })
    .where(and(eq(users.id, user.id), or(isNull(users.totpLastStep), sql`${users.totpLastStep} < ${step}`)))
    .returning({ id: users.id });
  return updated.length === 1;
}

async function consumeRecoveryCode(userId: string, code: string, req: Request): Promise<boolean> {
  const hashValue = sha256Hex(normalizeRecoveryCode(code));
  const used = await db.update(userRecoveryCodes).set({ usedAt: new Date() })
    .where(and(eq(userRecoveryCodes.userId, userId), eq(userRecoveryCodes.codeHash, hashValue), isNull(userRecoveryCodes.usedAt)))
    .returning({ id: userRecoveryCodes.id });
  if (used.length !== 1) return false;
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(userRecoveryCodes).where(and(eq(userRecoveryCodes.userId, userId), isNull(userRecoveryCodes.usedAt)));
  await audit(db, { actorId: userId, action: "auth.mfa.recovery_used", target: { type: "user", id: userId }, metadata: { remaining: left?.n ?? 0 }, ip: clientIp(req) });
  return true;
}

authRouter.post("/logout", async (req, res) => {
  if (req.user) {
    await revokeSessionById(req.user.sessionId);
    await audit(db, { actorId: req.user.id, action: "auth.logout", target: { type: "session", id: req.user.sessionId }, ip: clientIp(req) });
  } else {
    // Étape « code attendu » abandonnée : la session partielle est révoquée aussi.
    const pending = await resolvePendingMfa(req.sessionToken);
    if (pending) await revokeSessionById(pending.session.id);
  }
  clearSessionCookies(res);
  res.status(204).end();
});

// ---------------------------------------------------------------------------------------------------------------------
// Profil, mot de passe, sessions
// ---------------------------------------------------------------------------------------------------------------------

authRouter.get("/me", (req, res) => {
  if (!requireUser(req, res)) return;
  // `adminEnabled` : drapeau FADI_ADMIN_ENABLED, pour masquer l'entrée « Administration » (la protection reste serveur).
  res.status(200).json({ ...publicUser(req.user), adminEnabled: req.user.platformRole === "admin" && adminEnabled() });
});

/** Nom affiché (Paramètres → Compte) : 1 à 60 caractères, ou vide pour l'effacer ; jamais déduit de l'adresse côté serveur. */
const profileSchema = z.object({ displayName: z.string().trim().max(60).nullable() });

authRouter.patch("/me", async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", details: parsed.error.flatten() });
    return;
  }
  const displayName = parsed.data.displayName || null;
  await db.update(users).set({ displayName }).where(eq(users.id, req.user.id));
  res.status(200).json(publicUser({ ...req.user, displayName }));
});

const changePasswordSchema = z.object({ currentPassword: passwordInput, newPassword: passwordInput });

authRouter.post("/me/password", async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    res.status(403).json({ error: "invalid_password", message: "Mot de passe actuel incorrect." });
    return;
  }
  if (passwordRefused(res, parsed.data.newPassword, user.email)) return;
  const passwordHash = await hashPassword(parsed.data.newPassword);
  const locale = mailLocale(req);
  const revoked = await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, passwordChangedAt: new Date() }).where(eq(users.id, user.id));
    const n = await revokeUserSessions(user.id, req.user!.sessionId, tx);
    await audit(tx, { actorId: user.id, action: "auth.password.changed", target: { type: "user", id: user.id }, metadata: { revokedSessions: n }, ip: clientIp(req) });
    await sendAccountMail(user.email, "password_changed", {}, locale, tx);
    return n;
  });
  res.status(200).json({ changed: true, revokedSessions: revoked });
});

authRouter.get("/me/sessions", async (req, res) => {
  if (!requireUser(req, res)) return;
  const rows = await db.select().from(sessions)
    .where(and(eq(sessions.userId, req.user.id), isNull(sessions.revokedAt), eq(sessions.mfaPending, false), gt(sessions.expiresAt, new Date())))
    .orderBy(desc(sessions.lastSeenAt));
  res.json({
    sessions: rows.map((s) => ({
      id: s.id, current: s.id === req.user!.sessionId, createdAt: s.createdAt.toISOString(), lastSeenAt: (s.lastSeenAt ?? s.createdAt).toISOString(),
      expiresAt: s.expiresAt.toISOString(), absoluteExpiresAt: s.absoluteExpiresAt?.toISOString() ?? null, userAgent: s.userAgent, ip: s.ip,
    })),
  });
});

/**
 * « Mon historique » (phase 3 bis, tâche 2) : connexions, changements de sécurité, invitations envoyées ou acceptées,
 * accès support accordés ou utilisés sur ses projets — filtré côté serveur (`lib/journal-audience.ts`, audience
 * `utilisateur`) : ses propres actions, celles qui visent son compte, les accès support sur les projets dont il est
 * propriétaire. Pagination par curseur `before`, récent d'abord ; jamais d'adresse IP ni d'identité d'un autre compte,
 * sauf l'administrateur d'un accès support sur son propre projet (déjà nommé dans « Accès support »).
 */
const historySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(JOURNAL_PAGE_MAX).default(JOURNAL_PAGE_DEFAULT),
});

authRouter.get("/me/history", async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = historySchema.safeParse(req.query);
  if (!parsed.success) return void res.status(400).json({ error: "invalid_input" });
  res.json(await userHistory(req.user.id, parsed.data.before, parsed.data.limit));
});

authRouter.delete("/me/sessions/:sessionId", async (req, res) => {
  if (!requireUser(req, res)) return;
  const rows = await db.update(sessions).set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, req.params["sessionId"] as string), eq(sessions.userId, req.user.id), isNull(sessions.revokedAt)))
    .returning({ id: sessions.id });
  if (!rows.length) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  await audit(db, { actorId: req.user.id, action: "auth.sessions.revoked", target: { type: "session", id: rows[0]!.id }, ip: clientIp(req) });
  if (rows[0]!.id === req.user.sessionId) clearSessionCookies(res);
  res.status(204).end();
});

authRouter.delete("/me/sessions", async (req, res) => {
  if (!requireUser(req, res)) return;
  const n = await revokeUserSessions(req.user.id, req.user.sessionId);
  await audit(db, { actorId: req.user.id, action: "auth.sessions.revoked", target: { type: "user", id: req.user.id }, metadata: { count: n, exceptCurrent: true }, ip: clientIp(req) });
  res.json({ revoked: n });
});

// ---------------------------------------------------------------------------------------------------------------------
// Double authentification (D-6)
// ---------------------------------------------------------------------------------------------------------------------

function encryptionMissing(res: Response) {
  res.status(503).json({ error: "mfa_unavailable", message: "La double authentification n'est pas configurée sur ce serveur (clé de chiffrement absente) : contactez l'administrateur." });
}

authRouter.post("/me/mfa/setup", async (req, res) => {
  if (!requireUser(req, res)) return;
  if (req.user.mfaEnabled) {
    res.status(409).json({ error: "mfa_already_enabled" });
    return;
  }
  const secret = generateTotpSecret();
  let sealed: string;
  try { sealed = sealSecret(secret); } catch (err) {
    if (err instanceof EncryptionUnavailable) return encryptionMissing(res);
    throw err;
  }
  await db.update(users).set({ totpSecretEnc: sealed, totpLastStep: null }).where(eq(users.id, req.user.id));
  const uri = otpauthUri(secret, req.user.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  res.json({ otpauthUri: uri, secret, qrSvg });
});

const codeSchema = z.object({ code: z.string().trim().regex(/^\d{6}$/) });

async function newRecoveryCodes(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], userId: string): Promise<string[]> {
  await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, userId));
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, recoveryCode);
  await tx.insert(userRecoveryCodes).values(codes.map((c) => ({ id: newId("rec"), userId, codeHash: sha256Hex(normalizeRecoveryCode(c)) })));
  return codes;
}

authRouter.post("/me/mfa/enable", mfaLimiter, async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = codeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
  if (!user?.totpSecretEnc || user.totpEnabledAt) {
    res.status(409).json({ error: user?.totpEnabledAt ? "mfa_already_enabled" : "mfa_setup_required" });
    return;
  }
  try { openSecret(user.totpSecretEnc); } catch { return encryptionMissing(res); }
  if (!(await acceptTotp(user, parsed.data.code))) {
    res.status(400).json({ error: "invalid_code", message: "Code incorrect : vérifiez l'heure de votre téléphone et saisissez le code affiché." });
    return;
  }
  const locale = mailLocale(req);
  const sessionId = req.user.sessionId;
  /*
   * Une seule transaction, compte verrouillé : l'activation vaut preuve pour CETTE session seulement (mfa_verified_at),
   * toutes les autres sessions du compte (ouvertes au mot de passe seul, ou « code attendu ») sont révoquées. Le secret
   * vérifié doit être celui qui est encore enregistré (une nouvelle préparation entre-temps fait échouer l'activation).
   */
  const outcome = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(users).where(eq(users.id, user.id)).limit(1).for("update");
    if (!locked || locked.totpEnabledAt || locked.totpSecretEnc !== user.totpSecretEnc) return "conflict" as const;
    const now = new Date();
    const current = await tx.update(sessions).set({ mfaVerifiedAt: now })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id), isNull(sessions.revokedAt), eq(sessions.mfaPending, false)))
      .returning({ id: sessions.id });
    if (current.length !== 1) return "session" as const;
    await tx.update(users).set({ totpEnabledAt: now }).where(eq(users.id, user.id));
    const revokedSessions = await revokeUserSessions(user.id, sessionId, tx);
    const c = await newRecoveryCodes(tx, user.id);
    await audit(tx, { actorId: user.id, action: "auth.mfa.enabled", target: { type: "user", id: user.id }, metadata: { revokedSessions }, ip: clientIp(req) });
    await sendAccountMail(user.email, "mfa_enabled", {}, locale, tx);
    return { codes: c, revokedSessions };
  });
  if (outcome === "conflict") {
    res.status(409).json({ error: "mfa_setup_required", message: "La préparation de la double authentification a changé : recommencez." });
    return;
  }
  if (outcome === "session") {
    res.status(401).json({ error: "authentication_required" });
    return;
  }
  res.json({ enabled: true, recoveryCodes: outcome.codes, revokedSessions: outcome.revokedSessions });
});

const confirmWithCodeSchema = z.object({ password: passwordInput, code: z.string().trim().max(32) });

/** Mot de passe + code (TOTP ou de secours) : désactivation ou régénération des codes de secours. */
async function confirmPasswordAndCode(req: Request, res: Response): Promise<typeof users.$inferSelect | null> {
  const parsed = confirmWithCodeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  if (!user?.totpEnabledAt) {
    res.status(409).json({ error: "mfa_not_enabled" });
    return null;
  }
  if (!(await verifyPassword(user.passwordHash, parsed.data.password))) {
    res.status(403).json({ error: "invalid_password", message: "Mot de passe incorrect." });
    return null;
  }
  const code = parsed.data.code;
  const ok = /^\d{6}$/.test(code) ? await acceptTotp(user, code) : await consumeRecoveryCode(user.id, code, req);
  if (!ok) {
    res.status(400).json({ error: "invalid_code", message: "Code incorrect ou déjà utilisé." });
    return null;
  }
  return user;
}

authRouter.post("/me/mfa/disable", mfaLimiter, async (req, res) => {
  if (!requireUser(req, res)) return;
  const user = await confirmPasswordAndCode(req, res);
  if (!user) return;
  const locale = mailLocale(req);
  const sessionId = req.user.sessionId;
  const revokedSessions = await db.transaction(async (tx) => {
    await tx.update(users).set({ totpEnabledAt: null, totpSecretEnc: null, totpLastStep: null }).where(eq(users.id, user.id));
    await tx.delete(userRecoveryCodes).where(eq(userRecoveryCodes.userId, user.id));
    // Aucune preuve ne survit à la désactivation : une réactivation ultérieure exige une nouvelle preuve, session par session.
    await tx.update(sessions).set({ mfaVerifiedAt: null }).where(eq(sessions.userId, user.id));
    const n = await revokeUserSessions(user.id, sessionId, tx);
    await audit(tx, { actorId: user.id, action: "auth.mfa.disabled", target: { type: "user", id: user.id }, metadata: { revokedSessions: n }, ip: clientIp(req) });
    await sendAccountMail(user.email, "mfa_disabled", {}, locale, tx);
    return n;
  });
  res.json({ enabled: false, revokedSessions });
});

authRouter.post("/me/mfa/recovery-codes", mfaLimiter, async (req, res) => {
  if (!requireUser(req, res)) return;
  const user = await confirmPasswordAndCode(req, res);
  if (!user) return;
  const codes = await db.transaction(async (tx) => newRecoveryCodes(tx, user.id));
  res.json({ recoveryCodes: codes });
});

authRouter.get("/me/mfa", async (req, res) => {
  if (!requireUser(req, res)) return;
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(userRecoveryCodes).where(and(eq(userRecoveryCodes.userId, req.user.id), isNull(userRecoveryCodes.usedAt)));
  res.json({ enabled: req.user.mfaEnabled, recoveryCodesRemaining: left?.n ?? 0, required: req.user.platformRole === "admin" });
});

// ---------------------------------------------------------------------------------------------------------------------
// Vérification d'e-mail, mot de passe oublié
// ---------------------------------------------------------------------------------------------------------------------

authRouter.post("/verify-email/request", async (req, res) => {
  if (!requireUser(req, res)) return;
  if (req.user.emailVerified) {
    res.json({ verified: true });
    return;
  }
  const token = await issueAccountToken(req.user.id, "verify_email");
  const mail = await sendAccountMail(req.user.email, "verify_email", { link: publicLink(PUBLIC_PATHS.verify_email, token) }, mailLocale(req));
  res.json({ verified: false, mail: { queued: mail.queued, reason: mail.reason } });
});

const tokenSchema = z.object({ token: z.string().min(20).max(100) });

authRouter.post("/verify-email/confirm", async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  const userId = parsed.success ? await consumeAccountToken(parsed.data.token, "verify_email") : null;
  if (!userId) {
    res.status(400).json({ error: "invalid_token", message: "Lien invalide, expiré ou déjà utilisé." });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
    await audit(tx, { actorId: userId, action: "auth.email.verified", target: { type: "user", id: userId }, ip: clientIp(req) });
  });
  res.json({ verified: true });
});

authRouter.post("/forgot-password", perIdentifier(5), async (req, res) => {
  const parsed = z.object({ email: emailSchema, locale: z.enum(["fr", "en"]).optional() }).safeParse(req.body);
  // Réponse identique dans tous les cas (compte inconnu, suspendu, quota atteint) : rien n'est révélé.
  const answer = () => res.status(202).json({ accepted: true, message: "Si un compte actif correspond à cette adresse, un lien de réinitialisation vient d'être envoyé." });
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (!user || user.status !== "active" || user.deletionRequestedAt) {
    await audit(db, { actorId: null, action: "auth.password.reset_requested", metadata: { emailHash: emailHash(parsed.data.email), sent: false }, ip: clientIp(req) });
    answer();
    return;
  }
  const locale = mailLocale(req, parsed.data.locale);
  await db.transaction(async (tx) => {
    const token = await issueAccountToken(user.id, "reset_password", tx);
    const mail = await sendAccountMail(user.email, "reset_password", { link: publicLink(PUBLIC_PATHS.reset_password, token) }, locale, tx);
    await audit(tx, { actorId: null, action: "auth.password.reset_requested", target: { type: "user", id: user.id }, metadata: { sent: mail.queued, reason: mail.reason }, ip: clientIp(req) });
  });
  answer();
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20).max(100), password: passwordInput }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  // La politique est vérifiée avant de consommer le jeton : un mot de passe refusé ne brûle pas le lien.
  const [peek] = await db.select({ email: users.email }).from(accountTokens)
    .innerJoin(users, eq(users.id, accountTokens.userId)).where(eq(accountTokens.tokenHash, sha256Hex(parsed.data.token))).limit(1);
  if (passwordRefused(res, parsed.data.password, peek?.email ?? null)) return;
  const passwordHash = await hashPassword(parsed.data.password);
  const userId = await db.transaction(async (tx) => {
    const id = await consumeAccountToken(parsed.data.token, "reset_password", tx);
    if (!id) return null;
    const [user] = await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null }).where(and(eq(users.id, id), eq(users.status, "active"))).returning();
    if (!user) return null;
    const n = await revokeUserSessions(id, null, tx);
    await audit(tx, { actorId: id, action: "auth.password.reset", target: { type: "user", id }, metadata: { revokedSessions: n }, ip: clientIp(req) });
    await sendAccountMail(user.email, "password_changed", {}, mailLocale(req), tx);
    return id;
  });
  if (!userId) {
    res.status(400).json({ error: "invalid_token", message: "Lien invalide, expiré ou déjà utilisé : demandez un nouveau lien." });
    return;
  }
  res.json({ reset: true });
});

// ---------------------------------------------------------------------------------------------------------------------
// Invitations (UM-3)
// ---------------------------------------------------------------------------------------------------------------------

async function describeInvitation(inv: typeof invitations.$inferSelect) {
  const [project] = inv.projectId ? await db.select({ name: projects.name, code: projects.code }).from(projects).where(eq(projects.id, inv.projectId)).limit(1) : [];
  const [inviter] = inv.invitedBy ? await db.select({ email: users.email, displayName: users.displayName }).from(users).where(eq(users.id, inv.invitedBy)).limit(1) : [];
  return invitationView(inv, {
    projectName: project ? `${project.code} — ${project.name}` : null, inviterName: inviter?.displayName || inviter?.email || (inv.invitedBy ? "" : "Exploitation de la plateforme"),
    organizationName: await organizationNameOf(inv.organizationId),
    reviewPackage: await reviewInvitationContext(inv.reviewAssignmentId ?? null).then((r) => (r ? { id: r.packageId, title: r.title, version: r.version, projectLabel: r.projectLabel, responsibility: r.responsibility } : null)),
  });
}

authRouter.post("/invitations/lookup", async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  const inv = parsed.success ? await findInvitationByToken(parsed.data.token) : null;
  if (!inv) {
    res.status(404).json({ error: "not_found", message: INVITATION_REFUSAL_MESSAGE.not_found });
    return;
  }
  const [account] = await db.select({ id: users.id }).from(users).where(eq(users.email, inv.email)).limit(1);
  const view = await describeInvitation(inv);
  const refusal = invitationRefusal(inv, req.user ? { email: req.user.email, status: req.user.status } : null, await inviterStillAuthorized(inv), new Date());
  res.json({ invitation: view, accountExists: !!account, signedInAs: req.user?.email ?? null, refusal, message: refusal ? INVITATION_REFUSAL_MESSAGE[refusal] : null });
});

/** Compte existant, connecté avec l'adresse invitée : acceptation. */
authRouter.post("/invitations/accept", async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = tokenSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input" });
    return;
  }
  const result = await db.transaction(async (tx) => {
    const [inv] = await tx.select().from(invitations).where(eq(invitations.tokenHash, sha256Hex(parsed.data.token))).limit(1).for("update");
    if (!inv) return { ok: false as const, refusal: "not_found" as const };
    const refusal = invitationRefusal(inv ?? null, { email: req.user!.email, status: req.user!.status }, inv ? await inviterStillAuthorized(inv, tx) : false, new Date());
    if (refusal || !inv) {
      // Idempotence : la même personne qui rejoue une acceptation déjà faite obtient le même résultat.
      if (refusal === "already_accepted" && inv?.acceptedUserId === req.user!.id) return { ok: true as const, inv };
      if (inv) await audit(tx, { actorId: req.user!.id, action: "invitation.refused", target: { type: "invitation", id: inv.id }, metadata: { reason: refusal }, ip: clientIp(req) });
      return { ok: false as const, refusal: refusal ?? "not_found" };
    }
    // Revue externe (phase 4) : une fiche déjà liée à un autre compte refuse l'activation (rien n'est écrit).
    try { await tx.transaction(async (inner) => { await activateInvitation(inner, inv, req.user!.id, clientIp(req)); }); }
    catch (error) {
      if (!(error instanceof ReviewActivationRefused)) throw error;
      await audit(tx, { actorId: req.user!.id, action: "invitation.refused", target: { type: "invitation", id: inv.id }, metadata: { reason: "identity_conflict" }, ip: clientIp(req) });
      return { ok: false as const, refusal: "identity_conflict" as const };
    }
    if (!req.user!.emailVerified) await tx.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, req.user!.id));
    return { ok: true as const, inv };
  });
  if (!result.ok) {
    res.status(result.refusal === "wrong_account" ? 403 : 409).json({ error: result.refusal, message: INVITATION_REFUSAL_MESSAGE[result.refusal] });
    return;
  }
  res.json({ accepted: true, projectId: result.inv.projectId, organizationId: result.inv.organizationId ?? null, reviewPackageId: (await reviewInvitationContext(result.inv.reviewAssignmentId ?? null))?.packageId ?? null });
});

authRouter.post("/invitations/decline", async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  const inv = parsed.success ? await findInvitationByToken(parsed.data.token) : null;
  if (!inv || inv.status !== "pending") {
    res.status(404).json({ error: "not_found", message: INVITATION_REFUSAL_MESSAGE.not_found });
    return;
  }
  if (req.user && req.user.email !== inv.email) {
    res.status(403).json({ error: "wrong_account", message: INVITATION_REFUSAL_MESSAGE.wrong_account });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.update(invitations).set({ status: "declined", respondedAt: new Date() }).where(and(eq(invitations.id, inv.id), eq(invitations.status, "pending")));
    await audit(tx, { actorId: req.user?.id ?? null, action: "invitation.declined", target: { type: "invitation", id: inv.id }, ip: clientIp(req) });
  });
  res.json({ declined: true });
});

/** Nouveau compte depuis une invitation : l'adresse est celle de l'invitation (prouvée par le courriel), vérifiée d'office. */
authRouter.post("/activate", perIdentifier(10), async (req, res) => {
  const parsed = z.object({ token: z.string().min(20).max(100), password: passwordInput, acceptTerms: z.literal(true), displayName: z.string().trim().max(60).optional() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", message: "Le mot de passe et l'acceptation des conditions d'utilisation sont requis." });
    return;
  }
  const inv = await findInvitationByToken(parsed.data.token);
  if (inv && passwordRefused(res, parsed.data.password, inv.email)) return;
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await db.transaction(async (tx) => {
    const [locked] = inv ? await tx.select().from(invitations).where(eq(invitations.id, inv.id)).limit(1).for("update") : [];
    const refusal = invitationRefusal(locked ?? null, null, locked ? await inviterStillAuthorized(locked, tx) : false, new Date());
    if (refusal || !locked) return { refusal: refusal ?? ("not_found" as const) };
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, locked.email)).limit(1);
    if (existing) return { refusal: "account_exists" as const };
    const id = newId("user");
    const now = new Date();
    const [user] = await tx.insert(users).values({
      id, email: locked.email, passwordHash, passwordChangedAt: now, emailVerifiedAt: now, termsAcceptedAt: now, displayName: parsed.data.displayName || null,
      platformRole: locked.grantPlatformRole === "admin" ? "admin" : "user",
    }).returning();
    await audit(tx, { actorId: id, action: "account.activated", target: { type: "user", id }, metadata: { invitationId: locked.id }, ip: clientIp(req) });
    // Revue externe (phase 4) : un refus d'identité annule toute la transaction (aucun compte créé), rendu ci-dessous.
    await activateInvitation(tx, locked, id, clientIp(req));
    return { user: user!, projectId: locked.projectId, organizationId: locked.organizationId ?? null, reviewPackageId: (await reviewInvitationContext(locked.reviewAssignmentId ?? null, tx))?.packageId ?? null };
  }).catch((error: unknown) => {
    if (error instanceof ReviewActivationRefused) return { refusal: "identity_conflict" as const };
    throw error;
  });
  if ("refusal" in result) {
    const message = result.refusal === "account_exists"
      ? "Un compte existe déjà pour cette adresse : connectez-vous, puis acceptez l'invitation."
      : INVITATION_REFUSAL_MESSAGE[result.refusal];
    res.status(result.refusal === "not_found" ? 404 : 409).json({ error: result.refusal, message });
    return;
  }
  const sessionUser = await openFullSession(req, res, result.user);
  res.status(201).json({ user: publicUser(sessionUser), projectId: result.projectId, organizationId: result.organizationId, reviewPackageId: result.reviewPackageId });
});

// ---------------------------------------------------------------------------------------------------------------------
// Export et suppression des données personnelles (D-5)
// ---------------------------------------------------------------------------------------------------------------------

authRouter.get("/me/export", async (req, res) => {
  if (!requireUser(req, res)) return;
  const uid = req.user.id;
  const [user] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  const owned = await db.select({ id: projects.id, code: projects.code, name: projects.name, createdAt: projects.createdAt }).from(projects).where(eq(projects.ownerId, uid)).orderBy(asc(projects.createdAt));
  const memberships = await db.select({ projectId: projectMembers.projectId, role: projectMembers.role, since: projectMembers.createdAt, code: projects.code, name: projects.name })
    .from(projectMembers).innerJoin(projects, eq(projects.id, projectMembers.projectId)).where(eq(projectMembers.userId, uid));
  const comments = await db.select().from(projectComments).where(eq(projectComments.authorId, uid)).orderBy(asc(projectComments.createdAt));
  const studio = await db.select().from(studioComments).where(eq(studioComments.authorId, uid)).orderBy(asc(studioComments.createdAt));
  const auditRows = await db.select().from(auditLog).where(or(eq(auditLog.actorId, uid), and(eq(auditLog.targetType, "user"), eq(auditLog.targetId, uid)))).orderBy(asc(auditLog.id)).limit(5000);
  const sessionRows = await db.select({ id: sessions.id, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt, userAgent: sessions.userAgent, ip: sessions.ip, revokedAt: sessions.revokedAt })
    .from(sessions).where(eq(sessions.userId, uid));
  await audit(db, { actorId: uid, action: "account.export", target: { type: "user", id: uid }, ip: clientIp(req) });
  res.setHeader("Content-Disposition", `attachment; filename="fadi-mes-donnees-${new Date().toISOString().slice(0, 10)}.json"`);
  res.json({
    format: "fadi-export-donnees-personnelles/1",
    exportedAt: new Date().toISOString(),
    profile: {
      id: user!.id, email: user!.email, displayName: user!.displayName, createdAt: user!.createdAt, status: user!.status, platformRole: user!.platformRole,
      emailVerifiedAt: user!.emailVerifiedAt, lastLoginAt: user!.lastLoginAt, passwordChangedAt: user!.passwordChangedAt, mfaEnabled: !!user!.totpEnabledAt,
      notificationPreferences: user!.notificationPreferences,
    },
    projectsOwned: owned,
    memberships,
    comments,
    studioComments: studio,
    sessions: sessionRows,
    auditLog: auditRows,
  });
});

/** Projets possédés et partagés (au moins un membre) : à transférer avant toute suppression (D-5). */
export async function sharedOwnedProjects(userId: string, executor: Pick<typeof db, "selectDistinct"> = db): Promise<{ id: string; code: string; name: string }[]> {
  return executor.selectDistinct({ id: projects.id, code: projects.code, name: projects.name }).from(projects)
    .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
    .where(eq(projects.ownerId, userId));
}

/** Réponse « courriel » d'une suppression programmée : le lien d'annulation seulement s'il n'a pas pu être mis en file. */
export function deletionMail(s: { mail: { queued: boolean; reason?: string | null | undefined }; cancelLink: string }) {
  return { queued: s.mail.queued, ...(s.mail.reason ? { reason: s.mail.reason } : {}), ...(s.mail.queued ? {} : { link: s.cancelLink }) };
}

export type DeletionRefusal =
  | { refusal: "not_found" }
  | { refusal: "deletion_already_requested" }
  | { refusal: "owns_shared_projects"; projects: { id: string; code: string; name: string }[] }
  | { refusal: "last_admin" };

/**
 * Programme la suppression : sessions révoquées, connexion bloquée, courriel avec lien d'annulation (30 jours). Une seule
 * transaction, sous le verrou d'éligibilité des administrateurs (`lockAdminEligibility`) : état du compte relu et
 * verrouillé, projets partagés et garde du dernier administrateur vérifiés, puis mutation, révocation et journal. Une
 * demande refusée n'écrit rien.
 */
export async function scheduleDeletion(userId: string, actorId: string, req: Request, action: "account.deletion.requested" | "admin.user.deletion_requested"): Promise<DeletionRefusal | { deletionAt: Date; mail: { queued: boolean; reason?: string | null | undefined }; cancelLink: string }> {
  const locale = mailLocale(req);
  return db.transaction(async (tx) => {
    const admins = await lockAdminEligibility(tx);
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1).for("update");
    if (!user || user.status === "closed") return { refusal: "not_found" as const };
    if (user.deletionRequestedAt) return { refusal: "deletion_already_requested" as const };
    const shared = await sharedOwnedProjects(userId, tx);
    if (shared.length) return { refusal: "owns_shared_projects" as const, projects: shared };
    if (removesLastAdmin(admins, userId)) return { refusal: "last_admin" as const };
    const now = new Date();
    await tx.update(users).set({ deletionRequestedAt: now }).where(eq(users.id, userId));
    const n = await revokeUserSessions(userId, null, tx);
    await audit(tx, { actorId, action, target: { type: "user", id: userId }, metadata: { revokedSessions: n }, ip: clientIp(req) });
    const token = await issueAccountToken(userId, "cancel_deletion", tx);
    const deletionAt = new Date(now.getTime() + DELETION_GRACE_MS);
    const cancelLink = publicLink(PUBLIC_PATHS.cancel_deletion, token);
    const mail = await sendAccountMail(user.email, "deletion_scheduled", { link: cancelLink, deletionAt: formatDate(deletionAt, locale) }, locale, tx);
    return { deletionAt, mail, cancelLink };
  });
}

authRouter.delete("/me", async (req, res) => {
  if (!requireUser(req, res)) return;
  const parsed = z.object({ password: passwordInput, confirm: z.literal("SUPPRIMER") }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_input", message: "Saisissez votre mot de passe et le mot SUPPRIMER pour confirmer." });
    return;
  }
  const [user] = await db.select().from(users).where(eq(users.id, req.user.id)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
    res.status(403).json({ error: "invalid_password", message: "Mot de passe incorrect." });
    return;
  }
  const scheduled = await scheduleDeletion(user.id, user.id, req, "account.deletion.requested");
  if ("refusal" in scheduled) {
    if (scheduled.refusal === "owns_shared_projects") {
      res.status(409).json({ error: "owns_shared_projects", message: "Transférez d'abord la propriété de vos projets partagés à un de leurs membres.", projects: scheduled.projects });
    } else if (scheduled.refusal === "last_admin") {
      res.status(409).json({ error: "last_admin", message: "Vous êtes le dernier administrateur actif : désignez-en un autre avant de supprimer votre compte." });
    } else {
      res.status(409).json({ error: scheduled.refusal });
    }
    return;
  }
  clearSessionCookies(res);
  // Repli déclaré (D-1, revue Codex de la PR #255) : sans courriel en file (transport absent, quota), le lien d'annulation
  // est rendu à la personne authentifiée qui vient de le demander — jamais de suppression sans voie d'annulation.
  res.status(202).json({ deletionAt: scheduled.deletionAt.toISOString(), mail: deletionMail(scheduled) });
});

/**
 * Annule une suppression programmée : la voie unique du lien d'annulation (`/auth/cancel-deletion`) et de « Restaurer »
 * dans la corbeille de l'administration (UM-27). Le statut stocké (actif ou suspendu) n'a pas été touché par la
 * programmation : il est rétabli tel quel. Les liens d'annulation encore valides sont consommés (sans objet désormais).
 * Renvoie false si le compte n'est pas (ou plus) en suppression programmée — anonymisé compris.
 */
export async function cancelScheduledDeletion(tx: Tx, userId: string): Promise<boolean> {
  const rows = await tx.update(users).set({ deletionRequestedAt: null })
    .where(and(eq(users.id, userId), inArray(users.status, ["active", "suspended"]), sql`${users.deletionRequestedAt} IS NOT NULL`)).returning({ id: users.id });
  if (!rows.length) return false;
  await tx.update(accountTokens).set({ usedAt: new Date() })
    .where(and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, "cancel_deletion"), isNull(accountTokens.usedAt)));
  return true;
}

authRouter.post("/cancel-deletion", async (req, res) => {
  const parsed = tokenSchema.safeParse(req.body);
  const result = parsed.success ? await db.transaction(async (tx) => {
    // Ordre des verrous commun à « Restaurer » et à l'anonymisation : la ligne du compte d'abord, puis ses jetons
    // (sinon le lien et la corbeille, simultanés, s'interbloquent). Le jeton n'est que lu ici avant le verrou.
    const [owner] = await tx.select({ userId: accountTokens.userId }).from(accountTokens)
      .where(and(eq(accountTokens.tokenHash, sha256Hex(parsed.data.token)), eq(accountTokens.purpose, "cancel_deletion"))).limit(1);
    if (!owner) return null;
    await tx.select({ id: users.id }).from(users).where(eq(users.id, owner.userId)).limit(1).for("update");
    const id = await consumeAccountToken(parsed.data.token, "cancel_deletion", tx);
    if (!id) return null;
    if (!(await cancelScheduledDeletion(tx, id))) return null;
    await audit(tx, { actorId: id, action: "account.deletion.cancelled", target: { type: "user", id }, ip: clientIp(req) });
    return id;
  }) : null;
  if (!result) {
    res.status(400).json({ error: "invalid_token", message: "Lien invalide, expiré ou déjà utilisé : la suppression n'a pas pu être annulée." });
    return;
  }
  res.json({ cancelled: true });
});
