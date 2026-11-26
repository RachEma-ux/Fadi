import { useState, type FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { describeAuthError, useAuth } from "../lib/auth-context";
import { ChoixLangue } from "../components/ChoixLangue";

/**
 * Inscription (Issue #425) : seule l'adresse est demandée ici, et la réponse est la même que l'adresse ait déjà un compte
 * ou non (aucune énumération). Le compte naît sur la page du lien reçu par courriel, où la personne choisit son mot de
 * passe et accepte les conditions d'utilisation.
 */
export function RegisterPage() {
  const { user, register } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (user) {
    return <Navigate to="/accueil" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Saisissez votre adresse e-mail.");
      return;
    }
    setSubmitting(true);
    try {
      await register(email.trim());
      setSentTo(email.trim());
    } catch (err) {
      setError(describeAuthError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <ChoixLangue className="choix-langue choix-langue-auth" />
      <h1>Créer un compte</h1>
      {sentTo ? (
        <div data-register-sent>
          <p role="status">
            Si l’adresse <span translate="no">{sentTo}</span> peut recevoir un nouveau compte, un courriel vient de lui être envoyé. Suivez son lien pour choisir votre mot de passe et créer votre compte.
          </p>
          <p className="h7-muted">Rien reçu après quelques minutes ? Vérifiez les indésirables, ou recommencez : un nouveau lien remplace le précédent.</p>
          <button type="button" className="button-secondary" onClick={() => setSentTo(null)}>Saisir une autre adresse</button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <label htmlFor="register-email">E-mail</label>
          <input
            id="register-email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="h7-muted">Vous recevrez un lien pour choisir votre mot de passe.</p>

          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Envoi…" : "Recevoir le lien"}
          </button>
        </form>
      )}
      <p>
        Déjà un compte ? <Link to="/connexion">Se connecter</Link>
      </p>
    </main>
  );
}
