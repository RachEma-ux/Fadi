/**
 * Consigne de la carte d'arrivée (feuille de route équipe A, PR P1 ; brief E-01) : une seule consigne, sur la carte vide.
 * Elle ne crée aucune commande nouvelle : « Ouvrir le catalogue » est le bouton « Données », « Chercher un lieu » la
 * loupe de la mini-barre (Alt+R) ; chacune garde son icône. Le contour affiché (pays, niveau) est lu en base et n'est
 * jamais traduit (donnée).
 */
const ICONE_DONNEES = "M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5";
const ICONE_LOUPE = "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM20 20l-4.8-4.8";

export function ConsigneAccueil(p: {
  /** Pays courant et niveau dont le contour est dessiné ; null : aucun contour (découpage absent ou non publié). */
  contour: { pays: string; niveau: string } | null;
  decalee: boolean;
  onCatalogue(): void;
  onChercher(): void;
  onFermer(): void;
}) {
  // Échap ferme la consigne quand le focus y est (la page garde Échap pour ses propres panneaux ailleurs).
  return (
    <section className={`gd-accueil${p.decalee ? " gd-accueil-decalee" : ""}`} aria-labelledby="gd-accueil-titre" data-gd-accueil
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); p.onFermer(); } }}>
      <div className="gd-accueil-tete">
        <h2 id="gd-accueil-titre">Bienvenue dans GeoData</h2>
        <button type="button" className="gd-accueil-fermer" aria-label="Fermer la consigne" title="Fermer la consigne" onClick={p.onFermer} data-gd-accueil-fermer>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>
      <p data-gd-accueil-consigne>Touchez la carte pour lire la fiche d'un territoire, cherchez un lieu, ou ouvrez le catalogue pour ajouter des données.</p>
      {p.contour && (
        <p className="gd-accueil-contour" data-gd-accueil-contour>
          <span>Contour affiché :</span> <span translate="no">{p.contour.niveau}</span> <span aria-hidden="true">·</span> <span translate="no">{p.contour.pays}</span>
        </p>
      )}
      <div className="gd-actions">
        <button type="button" onClick={p.onCatalogue} data-gd-accueil-catalogue>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICONE_DONNEES} /></svg>
          <span>Ouvrir le catalogue</span>
        </button>
        <button type="button" onClick={p.onChercher} aria-keyshortcuts="Alt+R" title="Chercher un lieu (Alt+R)" data-gd-accueil-chercher>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true" focusable="false"><path d={ICONE_LOUPE} /></svg>
          <span>Chercher un lieu</span>
        </button>
      </div>
    </section>
  );
}
