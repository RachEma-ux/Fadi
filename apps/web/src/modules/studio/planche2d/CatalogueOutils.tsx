/**
 * Gestionnaire « Outils » et palette de commandes (Ctrl+K) de la planche 2D (#166, « Registry ») : le catalogue est lu
 * dans le registre `STUDIO_TOOLS` et les commandes de l'éditeur (`catalogue.ts`), jamais recopié. Le gestionnaire
 * range chaque entrée par barre avec son icône, ses raccourcis, son identifiant, sa disponibilité (la lecture seule
 * désactive les mutations) et son exposition aux agents (affichage seulement) ; la palette lance l'entrée choisie par
 * le même chemin que son raccourci. La recherche porte aussi sur le nom affiché (traduit en anglais).
 */
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { CATALOGUE, groupesCatalogue, rechercher, type EntreeCatalogue } from "./catalogue";
import { ariaRaccourci, libelleRaccourci } from "./raccourcis";

export interface CatalogueProps {
  disponible: (e: EntreeCatalogue) => boolean;
  surExecuter: (e: EntreeCatalogue) => void;
  surFermer: () => void;
}

/** Noms affichés (traduits par la couche de langue) gardés pour la recherche. */
function useNomsAffiches() {
  const noeuds = useRef(new Map<string, HTMLElement>());
  const poser = (id: string) => (el: HTMLElement | null) => { if (el) noeuds.current.set(id, el); };
  const autres = (e: EntreeCatalogue) => { const t = noeuds.current.get(e.identifiant)?.textContent; return t ? [t] : []; };
  return { poser, autres };
}

/** Focus sur le champ à l'ouverture, rendu à l'élément d'origine à la fermeture. */
function useFocusDialogue() {
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const origine = document.activeElement as HTMLElement | null;
    champ.current?.focus();
    return () => { if (origine?.isConnected) origine.focus(); };
  }, []);
  return champ;
}

/** Boîte de dialogue modale de la planche (Échap ou clic sur le fond la ferme). */
export function Dialogue({ titre, id, classe, surFermer, children }: { titre: string; id: string; classe: string; surFermer: () => void; children: ReactNode }) {
  const touche = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); surFermer(); } };
  return (
    <div className="studio-dialogue-fond" onMouseDown={(e) => { if (e.target === e.currentTarget) surFermer(); }}>
      <div className={`studio-dialogue ${classe}`} role="dialog" aria-modal="true" aria-labelledby={id} onKeyDown={touche}>
        <header className="studio-dialogue-tete">
          <h2 id={id}>{titre}</h2>
          <button type="button" onClick={surFermer} data-studio-fermer-dialogue>Fermer</button>
        </header>
        {children}
      </div>
    </div>
  );
}

const NATURE: Record<EntreeCatalogue["nature"], string> = { lecture: "Lecture", mutation: "Commande de document", editeur: "Commande de l’éditeur" };

const Raccourcis = ({ e }: { e: EntreeCatalogue }) => <span className="studio-catalogue-touches">{e.raccourcis.map((r) => <kbd key={r} aria-keyshortcuts={ariaRaccourci(r)}>{libelleRaccourci(r)}</kbd>)}</span>;

export function GestionnaireOutils({ disponible, surExecuter, surFermer }: CatalogueProps) {
  const [recherche, setRecherche] = useState("");
  const champ = useFocusDialogue();
  const noms = useNomsAffiches();
  const trouvees = rechercher(recherche, noms.autres);
  const retenues = new Set(trouvees);
  // Le gestionnaire garde l'ordre du catalogue, rangé par barre ; la recherche ne fait que filtrer.
  const groupes = groupesCatalogue(CATALOGUE.filter((e) => retenues.has(e)));
  return (
    <Dialogue titre="Outils" id="studio-outils-titre" classe="studio-gestionnaire" surFermer={surFermer}>
      <div data-studio-gestionnaire-outils>
        <p className="studio-dialogue-aide">Catalogue des outils et des commandes de la planche, lu dans le registre de Studio.</p>
        <label>Rechercher un outil<input ref={champ} type="search" value={recherche} placeholder="Nom, raccourci ou identifiant" onChange={(e) => setRecherche(e.target.value)} data-studio-recherche-outils /></label>
        <p role="status" className="studio-dialogue-aide">{`${trouvees.length} entrée(s)`}</p>
        {!trouvees.length && <p>Aucun outil ne correspond à la recherche.</p>}
        {groupes.map((g) => (
          <section key={g.barre.id} aria-labelledby={`studio-outils-${g.barre.id}`} data-studio-catalogue-barre={g.barre.id}>
            <h3 id={`studio-outils-${g.barre.id}`}>{g.barre.libelleFR}</h3>
            <ul className="studio-catalogue">
              {g.entrees.map((e) => {
                const ok = disponible(e);
                return (
                  <li key={e.identifiant} data-studio-catalogue-entree={e.identifiant} data-studio-disponible={ok ? "oui" : "non"}>
                    <Icon name={e.icone} size={20} />
                    <span className="studio-catalogue-nom" ref={noms.poser(e.identifiant)}>{e.libelleFR}</span>
                    <Raccourcis e={e} />
                    <code translate="no">{e.identifiant}</code>
                    <span className="studio-catalogue-meta">{NATURE[e.nature]}</span>
                    <span className="studio-catalogue-meta" data-studio-disponibilite>{ok ? "Disponible" : "Indisponible"}</span>
                    {e.agentExposure === null
                      ? <span className="studio-catalogue-meta" data-studio-exposition="hors-registre">Hors registre (commande locale)</span>
                      : <span className="studio-catalogue-meta" data-studio-exposition={e.agentExposure}>Exposition aux agents : <code translate="no">{e.agentExposure}</code></span>}
                    <button type="button" disabled={!ok} aria-label={`Utiliser : ${e.libelleFR}`} onClick={() => surExecuter(e)}>Utiliser</button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Dialogue>
  );
}

export function PaletteCommandes({ disponible, surExecuter, surFermer }: CatalogueProps) {
  const [recherche, setRecherche] = useState("");
  const [actif, setActif] = useState(0);
  const champ = useFocusDialogue();
  const noms = useNomsAffiches();
  const trouvees = rechercher(recherche, noms.autres);
  const index = Math.min(actif, Math.max(trouvees.length - 1, 0));
  const lancer = (e: EntreeCatalogue | undefined) => { if (e && disponible(e)) surExecuter(e); };
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActif(Math.min(index + 1, trouvees.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif(Math.max(index - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); lancer(trouvees[index]); }
  };
  const idOption = (e: EntreeCatalogue) => `studio-palette-${e.identifiant.replace(/[^a-z0-9-]/gi, "-")}`;
  return (
    <Dialogue titre="Palette de commandes" id="studio-palette-titre" classe="studio-palette" surFermer={surFermer}>
      <div data-studio-palette>
        <label>Commande à lancer<input ref={champ} role="combobox" aria-expanded="true" aria-controls="studio-palette-liste" aria-activedescendant={trouvees[index] ? idOption(trouvees[index]) : undefined}
          value={recherche} placeholder="Nom, raccourci ou identifiant" onChange={(e) => { setRecherche(e.target.value); setActif(0); }} onKeyDown={touche} data-studio-recherche-palette /></label>
        <p className="studio-dialogue-aide">Entrée lance la commande choisie ; flèches pour choisir ; Échap ferme.</p>
        {!trouvees.length && <p role="status">Aucune commande ne correspond à la recherche.</p>}
        <ul id="studio-palette-liste" role="listbox" aria-label="Commandes" className="studio-catalogue">
          {trouvees.map((e, i) => {
            const ok = disponible(e);
            return (
              <li key={e.identifiant} id={idOption(e)} role="option" aria-selected={i === index} aria-disabled={ok ? undefined : true}
                data-studio-palette-entree={e.identifiant} data-studio-disponible={ok ? "oui" : "non"} onMouseEnter={() => setActif(i)} onClick={() => lancer(e)}>
                <Icon name={e.icone} size={20} />
                <span className="studio-catalogue-nom" ref={noms.poser(e.identifiant)}>{e.libelleFR}</span>
                <Raccourcis e={e} />
                {!ok && <span className="studio-catalogue-meta">Indisponible</span>}
              </li>
            );
          })}
        </ul>
      </div>
    </Dialogue>
  );
}
