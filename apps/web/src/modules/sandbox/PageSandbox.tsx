/**
 * Page du Sandbox (`/sandbox`) : la Planche — géométrie libre 3D — à soi seule, hors du Studio (lot 1).
 *
 * L'apparence est celle de l'ancienne page de la Console (`/studio/console/sandbox`) : même marge de page, même fil
 * d'Ariane « Studio / Console / Sandbox » (de simples liens d'adresse, sans import du Studio), même titre accessible ;
 * depuis le 26 novembre 2026, le nom de la Planche ouverte termine le fil (« … / Sandbox / Brouillon Sandbox »).
 * La Planche est chargée à la demande (three.js, Manifold) ; aucune donnée de projet, aucun appel serveur. Une limite
 * d'erreur propre (comme celle du Studio avant le lot 1) garde la navigation de Fadi si le chargement échoue ou si la
 * Planche lève une erreur ; « Réessayer » recharge la page (le navigateur garde en échec un import dynamique raté ; le
 * brouillon du Sandbox est local et survit au rechargement).
 */
import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { FilArianePlanche } from "./fil-ariane-planche";
import "./page-sandbox.css";

const SandboxPlanche = lazy(() => import("./SandboxPlanche"));

class LimiteErreurSandbox extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() {
    return { erreur: true };
  }
  render() {
    if (!this.state.erreur) return this.props.children;
    return (
      <div className="sandbox-page-erreur" role="alert" data-sandbox-erreur>
        <h2>Le Sandbox n’a pas pu s’afficher.</h2>
        <p>La navigation de Fadi reste disponible ; aucune donnée n’a été modifiée.</p>
        <button type="button" onClick={() => window.location.reload()} data-sandbox-reessayer>Réessayer</button>
      </div>
    );
  }
}

/** Libellé de la page, tel que demandé (carte « 00 Sandbox »). */
export const LIBELLE_SANDBOX = "Sandbox";

export function PageSandbox() {
  // Nom de la Planche ouverte, signalé par la Planche tant qu'elle est rattachée à la page (maquette du 26 novembre 2026).
  const [nomPlanche, setNomPlanche] = useState<string | null>(null);
  return (
    <div className="sandbox-page" data-sandbox-page>
      <nav className="sandbox-page-fil" aria-label="Fil d’Ariane Studio">
        <Link to="/studio" data-sandbox-fil-studio>Studio</Link>
        <span> / <Link to="/studio/console" translate="no" data-sandbox-fil-console>Console</Link> / {nomPlanche === null ? <span aria-current="page">{LIBELLE_SANDBOX}</span> : <><Link to="/sandbox" data-sandbox-fil-sandbox>{LIBELLE_SANDBOX}</Link> / <span className="sandbox-page-fil-planche" aria-current="page" title={nomPlanche} data-sandbox-fil-planche>{nomPlanche}</span></>}</span>
      </nav>
      <section className="sandbox-page-contenu" data-sandbox-contenu>
        <h1 className="sr-only"><span translate="no">00 {LIBELLE_SANDBOX}</span></h1>
        <LimiteErreurSandbox>
          <FilArianePlanche.Provider value={setNomPlanche}>
            <Suspense fallback={<p role="status" data-sandbox-chargement>Chargement de la Planche de Sandbox…</p>}>
              <SandboxPlanche />
            </Suspense>
          </FilArianePlanche.Provider>
        </LimiteErreurSandbox>
      </section>
    </div>
  );
}
