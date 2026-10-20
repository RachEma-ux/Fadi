/**
 * Page du Sandbox (`/sandbox`) : la Planche — géométrie libre 3D — à soi seule, hors du Studio (lot 1).
 *
 * L'apparence est celle de l'ancienne page de la Console (`/studio/console/sandbox`) : même marge de page, même fil
 * d'Ariane « Studio / Console / Sandbox » (de simples liens d'adresse, sans import du Studio), même titre accessible.
 * La Planche est chargée à la demande (three.js, Manifold) ; aucune donnée de projet, aucun appel serveur.
 */
import { lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import "./page-sandbox.css";

const SandboxPlanche = lazy(() => import("./SandboxPlanche"));

/** Libellé de la page, tel que demandé (carte « 00 Sandbox »). */
export const LIBELLE_SANDBOX = "Sandbox";

export function PageSandbox() {
  return (
    <div className="sandbox-page" data-sandbox-page>
      <nav className="sandbox-page-fil" aria-label="Fil d’Ariane Studio">
        <Link to="/studio" data-sandbox-fil-studio>Studio</Link>
        <span> / <Link to="/studio/console" translate="no" data-sandbox-fil-console>Console</Link> / <span aria-current="page">{LIBELLE_SANDBOX}</span></span>
      </nav>
      <section className="sandbox-page-contenu" data-sandbox-contenu>
        <h1 className="sr-only"><span translate="no">00 {LIBELLE_SANDBOX}</span></h1>
        <Suspense fallback={<p role="status" data-sandbox-chargement>Chargement de la Planche de Sandbox…</p>}>
          <SandboxPlanche />
        </Suspense>
      </section>
    </div>
  );
}
