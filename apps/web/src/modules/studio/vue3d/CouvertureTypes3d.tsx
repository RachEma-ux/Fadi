/**
 * Inventaire de couverture des types 3D (A.3-08), lu du modèle (`STUDIO_COUVERTURE_3D`, jamais recopié) : chaque type
 * avec son état. Un type avancé non disponible est affiché « Non disponible » avec ce qui manque, sans aucun bouton ni
 * champ : il n'est jamais proposé comme disponible. Lecture seule, aucune commande.
 */
import { STUDIO_COUVERTURE_3D } from "@parcours/atelier-model";

export function CouvertureTypes3d() {
  return (
    <details className="studio-vue3d-couverture" data-studio-couverture-3d>
      <summary>Types 3D : inventaire de couverture</summary>
      <ul>
        {STUDIO_COUVERTURE_3D.map((t) => (
          <li key={t.id} data-studio-type-3d={t.id} data-studio-type-3d-etat={t.etat}>
            <strong>{t.libelle}</strong>{" — "}<span>{t.etat === "disponible" ? "Disponible" : "Non disponible"}</span>
            {t.manque && <>{" : "}<span>{t.manque}</span></>}
          </li>
        ))}
      </ul>
    </details>
  );
}
