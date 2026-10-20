/**
 * Sandbox de la Console de Studio (`/studio/console/sandbox`) : la Planche — géométrie libre 3D — à soi seule.
 *
 * Copie INDÉPENDANTE de la Planche de l'étape 10 (Atelier), faite à la demande du maître d'ouvrage du 20 octobre 2026 :
 * aucun import de l'Atelier ni de son modèle (`@parcours/planche-model`, `@parcours/atelier-model`), aucun appel serveur,
 * aucun projet, brouillon, préférences et feuille de style propres (`sandbox.css`, limitée à `.sandbox-planche`).
 * Chargée à la demande (three.js, Manifold) : jamais dans la coquille de Studio.
 */
import { Planche } from "./planche/Planche";

export default function SandboxPlanche() {
  return (
    <div className="sandbox-planche" data-sandbox-planche>
      <div className="sandbox-planche-travail">
        <Planche />
      </div>
    </div>
  );
}
