import { useAuth } from "../lib/auth-context";

export function ParametresPage() {
  const { user } = useAuth();
  return (
    <main className="stub-page">
      <h1>Paramètres</h1>
      <p className="eyebrow">Bientôt disponible</p>
      <p>
        Aujourd'hui, un compte n'a qu'un e-mail et un mot de passe : {user?.email}. Les réglages de projet
        (unités, droits d'accès partagés, préférences d'affichage) arriveront avec les lots de collaboration
        décrits dans <code>docs/architecture.md</code>.
      </p>
    </main>
  );
}
