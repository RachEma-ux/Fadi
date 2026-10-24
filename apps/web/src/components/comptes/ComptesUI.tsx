/**
 * Éléments partagés des écrans de comptes (gestion des comptes, phase 5) : champ de mot de passe avec indicateur de
 * robustesse (sans règle de composition), boîte de confirmation qui nomme la conséquence, lien à copier quand un
 * courriel n'a pas pu partir (D-1), lecture du jeton d'un lien reçu (fragment `#jeton=…`, jamais envoyé ailleurs qu'au
 * corps d'une requête POST).
 */
import { useState, type ReactNode } from "react";
import { Dialog } from "../../modules/accueil/Dialog";
import { ApiError } from "../../lib/api";
import { passwordStrength, PASSWORD_MAX, STRENGTH_LABEL } from "../../lib/password-strength";
import "./comptes.css";

export function PasswordField({ id, label, value, onChange, autoComplete = "new-password", showStrength = true, name = "password" }: {
  id: string; label: string; value: string; onChange: (v: string) => void; autoComplete?: string; showStrength?: boolean; name?: string;
}) {
  const strength = passwordStrength(value);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type="password" autoComplete={autoComplete} required maxLength={PASSWORD_MAX * 2} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={showStrength ? `${id}-strength` : undefined} />
      {showStrength && (
        <>
          <span className="pw-meter" data-strength={strength} aria-hidden="true"><span /></span>
          <small id={`${id}-strength`} className="pw-hint" aria-live="polite">{value ? STRENGTH_LABEL[strength] : "12 caractères au moins ; aucune règle de composition. Une phrase de plusieurs mots est un bon choix."}</small>
        </>
      )}
    </>
  );
}

export function ConfirmDialog({ title, children, confirmLabel, danger = false, busy = false, confirmDisabled = false, onConfirm, onClose }: {
  title: string; children: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean;
  /** Confirmation incomplète (ex. adresse à ressaisir) : le bouton reste inactif. */
  confirmDisabled?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Dialog title={title} onClose={onClose} className="confirm-dialog">
      <div>{children}</div>
      <div className="h7-actions">
        <button type="button" className="button-secondary" onClick={onClose}>Annuler</button>
        <button type="button" className={danger ? "danger-button" : "button-primary"} disabled={busy || confirmDisabled} onClick={onConfirm} data-confirm>
          {busy ? "En cours…" : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

/** Repli D-1 : le courriel n'est pas parti (quota, transport absent) — le lien est transmis par la personne elle-même. */
export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-link" role="status" data-copy-link>
      <strong>Le courriel n’a pas pu être envoyé, transmettez ce lien.</strong>
      <small>Il est nominatif : seule l’adresse invitée peut l’accepter.</small>
      <code translate="no">{link}</code>
      <div className="copy-link-row">
        <button type="button" className="button-secondary" onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false))}>
          Copier le lien
        </button>
        {copied && <span>Lien copié.</span>}
      </div>
    </div>
  );
}

/** Jeton d'un lien reçu par courriel : `#jeton=…` (le fragment n'est jamais envoyé au serveur ni journalisé). */
export function tokenFromHash(hash: string = typeof window === "undefined" ? "" : window.location.hash): string | null {
  const v = new URLSearchParams(hash.replace(/^#/, "")).get("jeton");
  return v && v.length >= 20 && v.length <= 100 ? v : null;
}

/** Message lisible d'un refus du serveur (message serveur s'il existe). */
export function apiMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Trop de tentatives : réessayez dans quelques minutes.";
    if (err.serverMessage) return err.serverMessage;
  }
  if (err instanceof TypeError) return "Serveur injoignable : vérifiez la connexion et réessayez.";
  return fallback;
}
