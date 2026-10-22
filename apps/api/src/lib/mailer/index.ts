/**
 * Service de courriel (D-1). Le code métier ne connaît que `Mailer.send` (via la file `outbox.ts`) ; le transport est
 * choisi par `MAIL_TRANSPORT` :
 *   - `smtp`    : nodemailer, configuré uniquement par variables d'environnement (SMTP Infomaniak provisoire, Mailpit en
 *                 dev / CI) ; l'adresse de `MAIL_FROM` doit être `SMTP_USER` (exigence Infomaniak) ;
 *   - `console` : écrit le courriel dans le journal du serveur — **interdit en production** (refus de démarrer) ;
 *   - absent    : aucun envoi ; chaque courriel est « non envoyé » et l'interface affiche le lien à copier (limite
 *                 déclarée, jamais simulée).
 * Bascule vers un fournisseur transactionnel UE : changement de variables seulement.
 */
import nodemailer from "nodemailer";
import { renderMail, type MailLocale, type MailTemplate, type RenderedMail } from "./templates.js";

export interface MailMessage { to: string; template: MailTemplate; data: Record<string, string | undefined>; locale: MailLocale }
export interface Mailer { readonly transport: "smtp" | "console" | "disabled"; send(message: MailMessage): Promise<void> }

export class MailConfigError extends Error {
  constructor(message: string) { super(message); this.name = "MailConfigError"; }
}

const addressOf = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim().toLowerCase();

export interface MailConfig {
  transport: "smtp" | "console" | "disabled";
  smtp?: { host: string; port: number; secure: boolean; user: string; pass: string | undefined };
  from: string;
  dailyLimit: number;
  perRecipientHourly: number;
  publicUrl: string;
}

/** Lit et valide la configuration ; lève `MailConfigError` (l'API refuse alors de démarrer). */
export function readMailConfig(env: Record<string, string | undefined> = process.env): MailConfig {
  const production = env["NODE_ENV"] === "production";
  const raw = (env["MAIL_TRANSPORT"] ?? "").trim();
  const transport = raw === "" ? "disabled" : raw;
  if (transport !== "smtp" && transport !== "console" && transport !== "disabled") throw new MailConfigError(`MAIL_TRANSPORT inconnu : ${raw} (smtp | console)`);
  if (transport === "console" && production) throw new MailConfigError("MAIL_TRANSPORT=console est interdit en production");
  const dailyLimit = Number(env["MAIL_DAILY_LIMIT"] ?? 150);
  const perRecipientHourly = Number(env["MAIL_RECIPIENT_HOURLY_LIMIT"] ?? 5);
  if (!Number.isInteger(dailyLimit) || dailyLimit < 0) throw new MailConfigError("MAIL_DAILY_LIMIT invalide");
  if (!Number.isInteger(perRecipientHourly) || perRecipientHourly < 1) throw new MailConfigError("MAIL_RECIPIENT_HOURLY_LIMIT invalide");
  const publicUrl = (env["APP_PUBLIC_URL"] ?? env["WEB_ORIGIN"]?.split(",")[0] ?? "http://localhost:5173").trim().replace(/\/$/, "");
  const from = (env["MAIL_FROM"] ?? "").trim();
  if (transport !== "smtp") return { transport, from: from || "Fadi <noreply@localhost>", dailyLimit, perRecipientHourly, publicUrl };
  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "MAIL_FROM", ...(production ? ["SMTP_PASS", "APP_PUBLIC_URL"] : [])].filter((k) => !env[k]);
  if (missing.length) throw new MailConfigError(`MAIL_TRANSPORT=smtp : variable(s) manquante(s) : ${missing.join(", ")}`);
  const user = env["SMTP_USER"]!.trim();
  if (addressOf(from) !== user.toLowerCase()) throw new MailConfigError("L'adresse de MAIL_FROM doit être identique à SMTP_USER (exigence du fournisseur SMTP)");
  const port = Number(env["SMTP_PORT"]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new MailConfigError("SMTP_PORT invalide");
  return {
    transport, from, dailyLimit, perRecipientHourly, publicUrl,
    smtp: { host: env["SMTP_HOST"]!, port, secure: (env["SMTP_SECURE"] ?? "true") === "true", user, pass: env["SMTP_PASS"] || undefined },
  };
}

export function createMailer(config: MailConfig, log: (line: string) => void = (l) => console.log(l)): Mailer {
  if (config.transport === "disabled") {
    return { transport: "disabled", async send() { throw new Error("mail_disabled"); } };
  }
  if (config.transport === "console") {
    return {
      transport: "console",
      async send(m) {
        const r: RenderedMail = renderMail(m.template, m.data, m.locale);
        log(JSON.stringify({ level: "info", message: "mail (console)", to: m.to, subject: r.subject, text: r.text }));
      },
    };
  }
  const smtp = config.smtp!;
  const transporter = nodemailer.createTransport({
    host: smtp.host, port: smtp.port, secure: smtp.secure,
    ...(smtp.pass ? { auth: { user: smtp.user, pass: smtp.pass } } : {}),
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  });
  return {
    transport: "smtp",
    async send(m) {
      const r = renderMail(m.template, m.data, m.locale);
      await transporter.sendMail({ from: config.from, to: m.to, subject: r.subject, text: r.text, html: r.html });
    },
  };
}

let current: { config: MailConfig; mailer: Mailer } | null = null;
/** Configuration et transport du processus (lus une fois). */
export function mailRuntime(): { config: MailConfig; mailer: Mailer } {
  if (!current) {
    const config = readMailConfig();
    current = { config, mailer: createMailer(config) };
  }
  return current;
}

export { renderMail, type MailLocale, type MailTemplate };
