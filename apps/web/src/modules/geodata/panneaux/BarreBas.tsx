/**
 * Barre du bas sur téléphone (D-GD-52) : Carte · Chercher · Couches · Enregistrer, sous la carte et les panneaux, toujours
 * à portée du pouce. Chaque bouton appelle la fonction existante de la page (même condition que la mini-barre et le menu) ;
 * raccourcis : Alt+X (carte seule : panneaux fermés), Alt+R (recherche), Alt+C (Couches), Alt+E (Enregistrer). Masquée au
 * bureau (la barre d'outils et la mini-barre y suffisent).
 */
export interface ActionsBarreBas {
  carteSeule: boolean;
  rechercheOuverte: boolean;
  couchesOuvertes: boolean;
  enregistrementImpossible: boolean;
  enregistrementLibelle: string;
  onCarte(): void;
  onChercher(): void;
  onCouches(): void;
  onEnregistrer(): void;
}

const ICONES = {
  carte: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14",
  chercher: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8",
  couches: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5",
  enregistrer: "M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7",
} as const;

export function BarreBas(p: ActionsBarreBas) {
  const bouton = (cle: keyof typeof ICONES, libelle: string, raccourci: string, action: () => void, extra: { pressed?: boolean; disabled?: boolean } = {}) => (
    <button type="button" className="gd-barre-bas-bouton" onClick={action} aria-pressed={extra.pressed} disabled={extra.disabled} title={`${libelle} (${raccourci})`} aria-keyshortcuts={raccourci} data-gd-barre-bas={cle}>
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={ICONES[cle]} /></svg>
      <span>{libelle}</span>
    </button>
  );
  return (
    <nav className="gd-barre-bas" aria-label="Barre du bas" data-gd-barre-bas-nav>
      {bouton("carte", "Carte", "Alt+X", p.onCarte, { pressed: p.carteSeule })}
      {bouton("chercher", "Chercher", "Alt+R", p.onChercher, { pressed: p.rechercheOuverte })}
      {bouton("couches", "Couches", "Alt+C", p.onCouches, { pressed: p.couchesOuvertes })}
      {bouton("enregistrer", p.enregistrementLibelle, "Alt+E", p.onEnregistrer, { disabled: p.enregistrementImpossible })}
    </nav>
  );
}

/** Raccourcis de la barre du bas, contrôlés par test : une commande, une touche, une icône. */
export const RACCOURCIS_BARRE_BAS = { carte: "Alt+X", chercher: "Alt+R", couches: "Alt+C", enregistrer: "Alt+E" } as const;
export const ICONES_BARRE_BAS = ICONES;
