/**
 * Console de Studio (`/studio/console`) : cinq cartes.
 *
 * - « 00 Sandbox » : la Planche de Sandbox, copie indépendante de celle de l'étape 10 (`/studio/console/sandbox`).
 * - « 01 » à « 04 » : l'outil du domaine, ouvert SANS CHARGER DE PROJET (`/studio/console/:domaine`) — aucune lecture
 *   de projet, d'étude ni de variante, aucune création côté serveur, aucun projet fictif. Ce qui est dessiné reste dans
 *   la page : rien n'est enregistré (`ConsoleOutil`).
 */
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { CARTES_CONSOLE, LIBELLE_SANDBOX } from "./cartes";
import "./console.css";

export function ConsoleStudio() {
  return (
    <section className="studio-welcome studio-page studio-console" data-studio-console>
      <header className="studio-page-entete">
        {/* « Console » est aussi le nom anglais du menu : le dictionnaire le traduit ailleurs (support « Console » des réseaux), d'où translate="no". */}
        <h1 translate="no">Console</h1>
      </header>
      <p className="studio-console-intro">Ouvrez un outil de Studio, sans projet : rien n’est lu ni enregistré tant que vous ne choisissez pas « Enregistrer dans un projet ».</p>
      <ul className="studio-console-cartes" aria-label="Outils de la Console">
        {CARTES_CONSOLE.map((c) => (
          <li key={c.id}>
            <Link to={c.chemin} className="studio-console-carte" data-studio-console-carte={c.id}>
              <span className="studio-console-numero">{c.numero}</span>
              <strong>{c.libelleFR}</strong>
              <small>{c.descriptionFR}</small>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Carte « 00 Sandbox » : la Planche de Sandbox, chargée à la demande (three.js, Manifold : jamais dans la coquille de
 * Studio). Aucune donnée de projet, aucun appel serveur ; voir `sandbox/SandboxPlanche.tsx`.
 */
const SandboxPlanche = lazy(() => import("./sandbox/SandboxPlanche"));

export function ConsoleSandbox() {
  return (
    <section className="studio-page studio-console studio-console-sandbox" data-studio-console-sandbox>
      <h1 className="sr-only"><span translate="no">00 {LIBELLE_SANDBOX}</span></h1>
      <Suspense fallback={<p role="status" data-studio-sandbox-chargement>Chargement de la Planche de Sandbox…</p>}>
        <SandboxPlanche />
      </Suspense>
    </section>
  );
}
