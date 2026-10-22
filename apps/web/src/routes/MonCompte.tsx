/**
 * « Mon compte » (Paramètres, gestion des comptes, phase 5) : mot de passe, double authentification (TOTP, codes de
 * secours), sessions ouvertes, vérification de l'adresse, export des données personnelles et suppression du compte
 * (30 jours de grâce, D-5). Chaque action exige le réseau : rien n'est mis en file hors ligne.
 */
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { accountApi, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { LOCALE } from "../lib/i18n";
import { useOnline } from "../components/SyncIndicator";
import { apiMessage, ConfirmDialog, PasswordField } from "../components/comptes/ComptesUI";
import { PASSWORD_MIN } from "../lib/password-strength";

const OFFLINE = "Hors connexion : cette action exige le réseau.";
const when = (iso: string) => new Date(iso).toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" });

function Status({ ok, children }: { ok: boolean; children: string }) {
  return <p role={ok ? "status" : "alert"} className={ok ? "h7-muted" : "form-error"}>{children}</p>;
}

function PasswordChange() {
  const online = useOnline();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const m = useMutation({
    mutationFn: () => accountApi.changePassword(current, next),
    onSuccess: (r) => { setCurrent(""); setNext(""); setMsg({ ok: true, text: `Mot de passe modifié. ${r.revokedSessions} autre(s) session(s) fermée(s).` }); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Le mot de passe n’a pas pu être modifié.") }),
  });
  return (
    <div className="account-subsection" data-account-password>
      <h3>Mot de passe</h3>
      <form className="account-form" onSubmit={(e: FormEvent) => {
        e.preventDefault();
        if ([...next].length < PASSWORD_MIN) { setMsg({ ok: false, text: "Le mot de passe doit contenir au moins 12 caractères." }); return; }
        m.mutate();
      }}>
        <label htmlFor="pw-current">Mot de passe actuel</label>
        <input id="pw-current" name="currentPassword" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField id="pw-new" name="newPassword" label="Nouveau mot de passe" value={next} onChange={setNext} />
        <button type="submit" className="button-primary" disabled={!online || m.isPending || !current || !next}>{m.isPending ? "Enregistrement…" : "Changer le mot de passe"}</button>
        {!online && <small>{OFFLINE}</small>}
      </form>
      {msg && <Status ok={msg.ok}>{msg.text}</Status>}
    </div>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div data-recovery-codes>
      <p><strong>Codes de secours : notez-les maintenant, ils ne seront plus affichés.</strong> Chacun ne sert qu’une fois, si vous perdez l’accès à votre application.</p>
      <ul className="recovery-codes" translate="no">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
      <button type="button" className="button-secondary" onClick={() => void navigator.clipboard?.writeText(codes.join("\n")).catch(() => undefined)}>Copier les codes</button>
    </div>
  );
}

function MfaSection() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const { user, adoptSession } = useAuth();
  const status = useQuery({ queryKey: ["account", "mfa"], queryFn: accountApi.mfaStatus });
  const [setup, setSetup] = useState<{ qrSvg: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<"disable" | "regenerate" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = async (enabled: boolean) => {
    await queryClient.invalidateQueries({ queryKey: ["account", "mfa"] });
    if (user) await adoptSession({ ...user, mfaEnabled: enabled });
  };
  const start = useMutation({ mutationFn: accountApi.mfaSetup, onSuccess: (s) => { setSetup(s); setMsg(null); }, onError: (err) => setMsg({ ok: false, text: apiMessage(err, "L’enrôlement n’a pas pu commencer.") }) });
  const enable = useMutation({
    mutationFn: () => accountApi.mfaEnable(code.replace(/\s/g, "")),
    onSuccess: (r) => { setCodes(r.recoveryCodes); setSetup(null); setCode(""); setMsg({ ok: true, text: "Double authentification activée." }); void refresh(true); },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Code refusé.") }),
  });
  const confirm = useMutation({
    mutationFn: () => mode === "disable" ? accountApi.mfaDisable(password, code.trim()).then(() => null) : accountApi.mfaRecoveryCodes(password, code.trim()).then((r) => r.recoveryCodes),
    onSuccess: (r) => {
      setPassword(""); setCode("");
      if (r) { setCodes(r); setMsg({ ok: true, text: "Nouveaux codes de secours générés ; les anciens ne valent plus." }); }
      else { setMsg({ ok: true, text: "Double authentification désactivée." }); void refresh(false); }
      setMode(null);
    },
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Action refusée.") }),
  });
  const s = status.data;
  const qrSrc = setup ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(setup.qrSvg)}` : null;
  return (
    <div className="account-subsection" data-account-mfa>
      <h3>Double authentification</h3>
      {status.isLoading && <p role="status">Chargement…</p>}
      {status.isError && <p role="alert">État non disponible sans réseau.</p>}
      {s && (
        <p data-mfa-state={s.enabled ? "on" : "off"}>
          {s.enabled ? `Active · ${s.recoveryCodesRemaining} code(s) de secours restant(s).` : s.required ? "Inactive — obligatoire pour accéder à l’administration de la plateforme." : "Inactive (facultative) : un code de votre téléphone sera demandé à chaque connexion."}
        </p>
      )}
      {codes && <RecoveryCodes codes={codes} />}
      {s && !s.enabled && !setup && (
        <button type="button" className="button-primary" disabled={!online || start.isPending} onClick={() => start.mutate()}>Activer la double authentification</button>
      )}
      {setup && qrSrc && (
        <form className="account-form" onSubmit={(e: FormEvent) => { e.preventDefault(); enable.mutate(); }} data-mfa-setup>
          <p>1. Scannez ce code avec une application d’authentification (TOTP), ou saisissez la clé à la main.</p>
          <img className="mfa-qr" src={qrSrc} alt="Code QR d’enrôlement de la double authentification" />
          <p>Clé : <code translate="no" data-mfa-secret>{setup.secret}</code></p>
          <label htmlFor="mfa-code">2. Code à 6 chiffres affiché par l’application</label>
          <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} required value={code} onChange={(e) => setCode(e.target.value)} />
          <button type="submit" className="button-primary" disabled={!online || enable.isPending || !code.trim()}>Confirmer l’activation</button>
        </form>
      )}
      {s?.enabled && !mode && (
        <div className="h7-actions">
          <button type="button" className="button-secondary" disabled={!online} onClick={() => setMode("regenerate")}>Générer de nouveaux codes de secours</button>
          <button type="button" className="button-secondary" disabled={!online} onClick={() => setMode("disable")}>Désactiver</button>
        </div>
      )}
      {mode && (
        <form className="account-form" onSubmit={(e: FormEvent) => { e.preventDefault(); confirm.mutate(); }}>
          <p>{mode === "disable" ? "Pour désactiver, confirmez avec votre mot de passe et un code (application ou secours)." : "Pour générer de nouveaux codes, confirmez avec votre mot de passe et un code."}</p>
          <label htmlFor="mfa-confirm-password">Mot de passe</label>
          <input id="mfa-confirm-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <label htmlFor="mfa-confirm-code">Code</label>
          <input id="mfa-confirm-code" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} />
          <div className="h7-actions">
            <button type="button" className="button-secondary" onClick={() => { setMode(null); setPassword(""); setCode(""); }}>Annuler</button>
            <button type="submit" className={mode === "disable" ? "danger-button" : "button-primary"} disabled={!online || confirm.isPending || !password || !code}>{mode === "disable" ? "Désactiver" : "Générer"}</button>
          </div>
        </form>
      )}
      {!online && <small>{OFFLINE}</small>}
      {msg && <Status ok={msg.ok}>{msg.text}</Status>}
    </div>
  );
}

function SessionsSection() {
  const online = useOnline();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["account", "sessions"], queryFn: accountApi.sessions });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const done = (text: string) => { setMsg({ ok: true, text }); void queryClient.invalidateQueries({ queryKey: ["account", "sessions"] }); };
  const one = useMutation({ mutationFn: accountApi.revokeSession, onSuccess: () => done("Session fermée."), onError: (err) => setMsg({ ok: false, text: apiMessage(err, "La session n’a pas pu être fermée.") }) });
  const others = useMutation({ mutationFn: accountApi.revokeOtherSessions, onSuccess: (r) => done(`${r.revoked} autre(s) session(s) fermée(s).`), onError: (err) => setMsg({ ok: false, text: apiMessage(err, "Les sessions n’ont pas pu être fermées.") }) });
  return (
    <div className="account-subsection" data-account-sessions>
      <h3>Sessions ouvertes</h3>
      {q.isLoading && <p role="status">Chargement…</p>}
      {q.isError && <p role="alert">Sessions non disponibles sans réseau.</p>}
      {q.data && (
        <ul className="sessions-list">
          {q.data.sessions.map((s) => (
            <li key={s.id} data-session={s.current ? "current" : "other"}>
              <span>
                <strong>{s.current ? "Cette session" : (s.userAgent?.slice(0, 60) || "Autre appareil")}</strong>
                <br /><small>{`Ouverte le ${when(s.createdAt)} · dernière activité ${when(s.lastSeenAt)}`}{s.ip ? <span translate="no">{` · ${s.ip}`}</span> : null}</small>
              </span>
              {!s.current && <button type="button" className="button-secondary" disabled={!online || one.isPending} onClick={() => one.mutate(s.id)}>Déconnecter</button>}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="button-secondary" disabled={!online || others.isPending || (q.data?.sessions.length ?? 0) < 2} onClick={() => others.mutate()}>Déconnecter les autres sessions</button>
      {msg && <Status ok={msg.ok}>{msg.text}</Status>}
    </div>
  );
}

function EmailAndExport() {
  const { user } = useAuth();
  const online = useOnline();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const verify = useMutation({
    mutationFn: accountApi.requestEmailVerification,
    onSuccess: (r) => setMsg(r.verified ? { ok: true, text: "Adresse déjà confirmée." } : r.mail?.queued ? { ok: true, text: "Un lien de confirmation vient d’être envoyé (valable 24 heures)." } : { ok: false, text: "Le courriel n’a pas pu être envoyé pour le moment : réessayez plus tard." }),
    onError: (err) => setMsg({ ok: false, text: apiMessage(err, "La demande a échoué.") }),
  });
  return (
    <div className="account-subsection" data-account-data>
      <h3>Adresse et données personnelles</h3>
      <p>
        Adresse : <span translate="no">{user?.email}</span> — {user?.emailVerified ? "confirmée" : "non confirmée"}{" "}
        {!user?.emailVerified && <button type="button" className="button-secondary" disabled={!online || verify.isPending} onClick={() => verify.mutate()}>Recevoir un lien de confirmation</button>}
      </p>
      <p>
        <a className="button-secondary" href={accountApi.exportUrl} download data-account-export>Exporter mes données (JSON)</a>{" "}
        <small>Profil, projets, appartenances, commentaires rédigés, sessions et journal d’audit vous concernant.</small>
      </p>
      {msg && <Status ok={msg.ok}>{msg.text}</Status>}
    </div>
  );
}

function DeleteAccount() {
  const online = useOnline();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [projects, setProjects] = useState<{ id: string; code: string; name: string }[]>([]);
  const m = useMutation({
    mutationFn: () => accountApi.deleteAccount(password),
    onSuccess: async () => { setOpen(false); await logout(); navigate("/connexion", { replace: true }); },
    onError: (err) => {
      setOpen(false);
      if (err instanceof ApiError && err.code === "owns_shared_projects") setProjects(((err.body as { projects?: { id: string; code: string; name: string }[] })?.projects) ?? []);
      setMsg({ ok: false, text: apiMessage(err, "La suppression n’a pas pu être programmée.") });
    },
  });
  return (
    <div className="account-subsection" data-account-delete>
      <h3>Supprimer mon compte</h3>
      <p>La suppression est programmée à 30 jours : la connexion est bloquée aussitôt, un lien d’annulation vous est envoyé. Ensuite, vos données personnelles sont anonymisées de façon irréversible ; vos commentaires et révisions restent attribués à « Compte supprimé ». Exportez vos données avant.</p>
      <form className="account-form" onSubmit={(e: FormEvent) => { e.preventDefault(); setOpen(true); }}>
        <label htmlFor="delete-password">Mot de passe</label>
        <input id="delete-password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button type="submit" className="danger-button" disabled={!online || !password}>Supprimer mon compte…</button>
      </form>
      {projects.length > 0 && (
        <ul data-owned-shared>{projects.map((p) => <li key={p.id}><a href={`/projets/${p.id}?module=collaboration`} translate="no">{p.code} — {p.name}</a></li>)}</ul>
      )}
      {msg && <Status ok={msg.ok}>{msg.text}</Status>}
      {open && (
        <ConfirmDialog title="Supprimer votre compte ?" confirmLabel="Programmer la suppression" danger busy={m.isPending} onClose={() => setOpen(false)} onConfirm={() => m.mutate()}>
          <p>Votre compte sera bloqué dès maintenant et anonymisé dans 30 jours, sauf annulation par le lien reçu par courriel.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

export function MonCompte() {
  return (
    <section className="panel settings-section" aria-labelledby="settings-security" data-mon-compte>
      <h2 id="settings-security">Sécurité du compte</h2>
      <PasswordChange />
      <MfaSection />
      <SessionsSection />
      <EmailAndExport />
      <DeleteAccount />
    </section>
  );
}
