/**
 * Gabarits des courriels de compte (D-1), français et anglais : version texte et HTML simple, sans image distante ni
 * pixel de suivi. Ils ne contiennent aucune donnée de projet hormis le nom du projet d'une invitation.
 */
export type MailTemplate =
  | "invitation"
  | "verify_email"
  | "reset_password"
  | "password_changed"
  | "mfa_enabled"
  | "mfa_disabled"
  | "account_suspended"
  | "deletion_scheduled";

export type MailLocale = "fr" | "en";
export interface RenderedMail { subject: string; text: string; html: string }

type Data = Record<string, string | undefined>;
type Copy = { subject: string; lines: (d: Data) => string[]; action?: string; link?: (d: Data) => string | undefined };

const COPY: Record<MailLocale, Record<MailTemplate, Copy>> = {
  fr: {
    invitation: {
      subject: "Invitation à rejoindre Fadi",
      lines: (d) => [
        d["reviewPackage"] ? `Vous êtes invité·e à examiner le paquet de revue « ${d["reviewPackage"]} » du projet « ${d["projectName"] ?? ""} » sur Fadi (responsabilité : ${d["role"] ?? "relecture"}). Cette invitation donne accès à ce paquet seulement, jusqu'au ${d["accessExpiresAt"] ?? ""} ; elle ne vous fait pas membre du projet ni de l'organisation.`
          : d["organizationName"] ? `Vous êtes invité·e à rejoindre l'organisation « ${d["organizationName"]} » sur Fadi (rôle : ${d["role"] ?? "membre"}). Une adhésion n'ouvre aucun projet.`
          : d["projectName"] ? `Vous êtes invité·e à rejoindre le projet « ${d["projectName"]} » sur Fadi (rôle : ${d["role"] ?? "lecteur"}).` : "Vous êtes invité·e à créer votre compte Fadi.",
        `Cette invitation est nominative et expire le ${d["expiresAt"]}. Elle ne peut être acceptée qu'avec l'adresse à laquelle ce courriel a été envoyé.`,
        "Si vous n'attendiez pas cette invitation, ignorez ce message : aucun compte n'est créé sans votre action.",
      ],
      action: "Accepter l'invitation",
      link: (d) => d["link"],
    },
    verify_email: {
      subject: "Confirmez votre adresse e-mail",
      lines: () => ["Confirmez votre adresse pour sécuriser votre compte Fadi. Le lien est valable 24 heures."],
      action: "Confirmer mon adresse",
      link: (d) => d["link"],
    },
    reset_password: {
      subject: "Réinitialisation de votre mot de passe",
      lines: () => [
        "Une réinitialisation du mot de passe de votre compte Fadi a été demandée. Le lien est valable 1 heure et ne sert qu'une fois.",
        "Toutes vos sessions ouvertes seront fermées. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message.",
      ],
      action: "Choisir un nouveau mot de passe",
      link: (d) => d["link"],
    },
    password_changed: {
      subject: "Votre mot de passe a été modifié",
      lines: () => ["Le mot de passe de votre compte Fadi vient d'être modifié ; vos autres sessions ont été fermées.", "Si vous n'êtes pas à l'origine de ce changement, utilisez « Mot de passe oublié » immédiatement et prévenez l'administrateur."],
    },
    mfa_enabled: {
      subject: "Double authentification activée",
      lines: () => ["La double authentification est désormais active sur votre compte Fadi. Conservez vos codes de secours en lieu sûr."],
    },
    mfa_disabled: {
      subject: "Double authentification désactivée",
      lines: () => ["La double authentification a été désactivée sur votre compte Fadi.", "Si vous n'êtes pas à l'origine de ce changement, changez votre mot de passe et prévenez l'administrateur."],
    },
    account_suspended: {
      subject: "Votre compte Fadi est suspendu",
      lines: () => ["Votre compte Fadi a été suspendu par un administrateur : vos sessions sont fermées et la connexion est bloquée.", "Contactez l'administrateur de la plateforme pour en connaître le motif."],
    },
    deletion_scheduled: {
      subject: "Suppression de votre compte programmée",
      lines: (d) => [
        `La suppression de votre compte Fadi est programmée pour le ${d["deletionAt"]}. D'ici là, la connexion est bloquée.`,
        "À cette date, vos données personnelles seront anonymisées de façon irréversible ; vos commentaires et révisions resteront attribués à « Compte supprimé ».",
        "Vous pouvez annuler cette suppression pendant 30 jours avec le lien ci-dessous.",
      ],
      action: "Annuler la suppression",
      link: (d) => d["link"],
    },
  },
  en: {
    invitation: {
      subject: "Invitation to join Fadi",
      lines: (d) => [
        d["reviewPackage"] ? `You are invited to review the package “${d["reviewPackage"]}” of the project “${d["projectName"] ?? ""}” on Fadi (responsibility: ${d["role"] ?? "review"}). This invitation gives access to this package only, until ${d["accessExpiresAt"] ?? ""}; it does not make you a member of the project or of the organisation.`
          : d["organizationName"] ? `You are invited to join the organisation “${d["organizationName"]}” on Fadi (role: ${d["role"] ?? "member"}). A membership opens no project.`
          : d["projectName"] ? `You are invited to join the project “${d["projectName"]}” on Fadi (role: ${d["role"] ?? "reader"}).` : "You are invited to create your Fadi account.",
        `This invitation is personal and expires on ${d["expiresAt"]}. It can only be accepted with the address this email was sent to.`,
        "If you did not expect this invitation, ignore this message: no account is created without your action.",
      ],
      action: "Accept the invitation",
      link: (d) => d["link"],
    },
    verify_email: {
      subject: "Confirm your email address",
      lines: () => ["Confirm your address to secure your Fadi account. The link is valid for 24 hours."],
      action: "Confirm my address",
      link: (d) => d["link"],
    },
    reset_password: {
      subject: "Reset your password",
      lines: () => [
        "A password reset was requested for your Fadi account. The link is valid for 1 hour and works only once.",
        "All your open sessions will be closed. If you did not request this, ignore this message.",
      ],
      action: "Choose a new password",
      link: (d) => d["link"],
    },
    password_changed: {
      subject: "Your password was changed",
      lines: () => ["The password of your Fadi account has just been changed; your other sessions were closed.", "If you did not make this change, use “Forgot password” immediately and notify the administrator."],
    },
    mfa_enabled: {
      subject: "Two-factor authentication enabled",
      lines: () => ["Two-factor authentication is now active on your Fadi account. Keep your recovery codes somewhere safe."],
    },
    mfa_disabled: {
      subject: "Two-factor authentication disabled",
      lines: () => ["Two-factor authentication was disabled on your Fadi account.", "If you did not make this change, change your password and notify the administrator."],
    },
    account_suspended: {
      subject: "Your Fadi account is suspended",
      lines: () => ["Your Fadi account was suspended by an administrator: your sessions are closed and sign-in is blocked.", "Contact the platform administrator to learn why."],
    },
    deletion_scheduled: {
      subject: "Your account deletion is scheduled",
      lines: (d) => [
        `The deletion of your Fadi account is scheduled for ${d["deletionAt"]}. Until then, sign-in is blocked.`,
        "On that date your personal data will be irreversibly anonymised; your comments and revisions will remain attributed to “Deleted account”.",
        "You can cancel this deletion within 30 days using the link below.",
      ],
      action: "Cancel the deletion",
      link: (d) => d["link"],
    },
  },
};

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderMail(template: MailTemplate, data: Data, locale: MailLocale): RenderedMail {
  const copy = COPY[locale][template];
  const lines = copy.lines(data);
  const link = copy.link?.(data);
  const footer = locale === "fr" ? "— Fadi (message automatique, ne pas répondre)" : "— Fadi (automated message, do not reply)";
  const text = [...lines, ...(link ? ["", `${copy.action} : ${link}`] : []), "", footer].join("\n");
  const html = [
    '<!doctype html><html><body style="font-family:system-ui,sans-serif;line-height:1.5;color:#1a1a1a">',
    ...lines.map((l) => `<p>${escapeHtml(l)}</p>`),
    link ? `<p><a href="${escapeHtml(link)}">${escapeHtml(copy.action ?? link)}</a></p><p style="font-size:12px;color:#555">${escapeHtml(link)}</p>` : "",
    `<p style="font-size:12px;color:#555">${escapeHtml(footer)}</p></body></html>`,
  ].join("");
  return { subject: copy.subject, text, html };
}

export const MAIL_TEMPLATES = Object.keys(COPY.fr) as MailTemplate[];
