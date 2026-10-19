/**
 * Gestionnaire « Outils » et palette de commandes (Ctrl+K) de la planche 2D (#166, « Registry ») : le catalogue est lu
 * dans le registre `STUDIO_TOOLS` et les commandes de l'éditeur (`catalogue.ts`), jamais recopié. Le gestionnaire
 * range chaque entrée par barre avec son icône, ses raccourcis, son identifiant, sa disponibilité (la lecture seule
 * désactive les mutations) et son exposition aux agents (affichage seulement) ; la palette lance l'entrée choisie par
 * le même chemin que son raccourci. La recherche porte aussi sur le nom affiché (traduit en anglais).
 *
 * Favoris et profils (B.2-02, B.2-04, B.2-06) : une étoile par outil du registre dans le gestionnaire, un groupe
 * « Favoris » en tête de la palette, et le choix du profil des barres d'outils (Standard, Métier, Personnel —
 * `profils.ts`), enregistrés sur le serveur pour le compte. Le profil ne règle que la visibilité dans les barres :
 * le catalogue, la palette et les raccourcis clavier gardent tous les outils, et le serveur reste seul juge du droit
 * d'exécution.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { api } from "../../../lib/api";
import { lireRouteStudio } from "../routes-studio";
import { CATALOGUE, groupesCatalogue, rechercher, separerFavoris, type EntreeCatalogue } from "./catalogue";
import {
  basculerFavori, basculerPersonnel, CHOIX_PROFILS, choisirProfil, filtreBarres, normaliserPreferences, OUTIL_TOUJOURS_VISIBLE, PREFERENCES_DEFAUT,
  type IdProfil, type PreferencesOutils,
} from "./profils";
import { ariaRaccourci, libelleRaccourci, type StudioToolId } from "./raccourcis";

export interface CatalogueProps {
  disponible: (e: EntreeCatalogue) => boolean;
  surExecuter: (e: EntreeCatalogue) => void;
  surFermer: () => void;
  /** Projet de l'adresse des préférences ; lu dans l'adresse Studio courante s'il n'est pas donné. */
  projectId?: string;
}

/*
 * Préférences d'outils du compte (favoris, profil des barres), partagées par la barre d'outils, le gestionnaire et la
 * palette : un seul état en mémoire, relu du serveur, enregistré sur le serveur à chaque changement (PUT complet).
 * Visibilité seulement (B.2-06) : ni la disponibilité, ni les raccourcis, ni le droit d'exécution n'en dépendent.
 */
type EtatChargement = "initial" | "chargement" | "pret" | "erreur";
type EtatEnregistrement = "aucun" | "en-cours" | "enregistre" | "echec";
interface EtatPreferences { prefs: PreferencesOutils; etat: EtatChargement; enregistrement: EtatEnregistrement; erreur: string | null }
let etatPreferences: EtatPreferences = { prefs: PREFERENCES_DEFAUT, etat: "initial", enregistrement: "aucun", erreur: null };
const abonnes = new Set<() => void>();
const publier = (suivant: Partial<EtatPreferences>) => { etatPreferences = { ...etatPreferences, ...suivant }; for (const f of abonnes) f(); };
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };
const lireEtat = () => etatPreferences;
/** Enregistrements en cours : une relecture du serveur n'écrase pas un changement pas encore enregistré. */
let enVol = 0;
let file: Promise<unknown> = Promise.resolve();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function charger(projectId: string) {
  if (etatPreferences.etat === "chargement" || enVol > 0) return;
  if (etatPreferences.etat !== "pret") publier({ etat: "chargement" });
  api.studioToolPreferences(projectId)
    .then((r) => { if (enVol === 0) publier({ prefs: normaliserPreferences(r), etat: "pret", erreur: null }); })
    .catch((e: unknown) => { publier(etatPreferences.etat === "pret" ? { erreur: message(e) } : { etat: "erreur", erreur: message(e) }); });
}

function enregistrer(projectId: string, suivant: PreferencesOutils) {
  publier({ prefs: suivant, enregistrement: "en-cours", erreur: null });
  enVol += 1;
  const corps = { profil: suivant.profil, favoris: [...suivant.favoris], personnel: [...suivant.personnel] };
  file = file.then(() => api.setStudioToolPreferences(projectId, corps))
    .then((r) => { enVol -= 1; if (enVol === 0) publier({ prefs: normaliserPreferences(r), enregistrement: "enregistre" }); })
    .catch((e: unknown) => {
      enVol -= 1;
      // Refus ou réseau : relire l'état du serveur plutôt que de garder une préférence non enregistrée.
      publier({ enregistrement: "echec", erreur: message(e) });
      if (enVol === 0) charger(projectId);
    });
}

const projetDeLAdresse = (): string | null => {
  if (typeof window === "undefined") return null;
  const r = lireRouteStudio(window.location.pathname, "");
  return "projectId" in r ? r.projectId : null;
};

/**
 * Préférences d'outils du compte pour la barre d'outils, le gestionnaire et la palette. `visible(toolId)` ne règle
 * que la présence dans les barres : un outil masqué reste au catalogue, à la palette et à son raccourci clavier.
 * Avant la lecture du serveur (ou en cas d'échec), tout est visible (profil Standard) et aucun favori n'est montré.
 */
export function useProfilOutils(projectId?: string | null) {
  const projet = projectId ?? projetDeLAdresse();
  const etat = useSyncExternalStore(abonner, lireEtat, lireEtat);
  useEffect(() => { if (projet) charger(projet); }, [projet]);
  const visible = useMemo(() => filtreBarres(etat.prefs), [etat.prefs]);
  const modifiable = projet !== null && etat.etat === "pret";
  const modifier = (f: (p: PreferencesOutils) => PreferencesOutils) => { if (projet && modifiable) enregistrer(projet, f(etatPreferences.prefs)); };
  return {
    visible,
    favoris: etat.prefs.favoris as readonly string[],
    preferences: etat.prefs,
    etat: etat.etat,
    enregistrement: etat.enregistrement,
    erreur: etat.erreur,
    modifiable,
    choisirProfil: (profil: IdProfil) => modifier((p) => choisirProfil(p, profil)),
    basculerFavori: (id: StudioToolId) => modifier((p) => basculerFavori(p, id)),
    basculerPersonnel: (id: StudioToolId) => modifier((p) => basculerPersonnel(p, id)),
  };
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

const ETAT_PREFERENCES: Record<EtatChargement, string> = {
  initial: "Préférences d’outils non chargées : tous les outils sont dans les barres.",
  chargement: "Lecture des préférences d’outils…",
  pret: "Préférences d’outils de votre compte, enregistrées sur le serveur.",
  erreur: "Préférences d’outils illisibles : tous les outils restent dans les barres.",
};
const ENREGISTREMENT: Record<EtatEnregistrement, string | null> = {
  aucun: null, "en-cours": "Enregistrement des préférences…", enregistre: "Préférences enregistrées.", echec: "Préférences non enregistrées : état du serveur relu.",
};

/** Choix du profil des barres d'outils, avec l'avertissement sur ce qu'il ne change pas. */
function ChoixProfil({ profil }: { profil: ReturnType<typeof useProfilOutils> }) {
  const enregistrement = ENREGISTREMENT[profil.enregistrement];
  return (
    <fieldset className="studio-profil-outils" data-studio-profil-outils={profil.preferences.profil} data-studio-preferences-etat={profil.etat}>
      <legend>Profil des barres d’outils</legend>
      <label>Profil
        <select value={profil.preferences.profil} disabled={!profil.modifiable} onChange={(e) => profil.choisirProfil(e.target.value as IdProfil)} data-studio-choix-profil>
          {CHOIX_PROFILS.map((c) => <option key={c.id} value={c.id}>{c.libelleFR}</option>)}
        </select>
      </label>
      <p className="studio-dialogue-aide">Le profil choisit seulement les outils montrés dans les barres d’outils. Un outil masqué reste dans ce catalogue et dans la palette, et son raccourci clavier fonctionne toujours.</p>
      <p className="studio-dialogue-aide">Le profil ne change ni le dessin, ni les révisions, ni vos droits : chaque commande reste vérifiée par le serveur.</p>
      <p className="studio-dialogue-aide" role="status" data-studio-preferences-enregistrement={profil.enregistrement}>
        {enregistrement ?? ETAT_PREFERENCES[profil.etat]}
      </p>
    </fieldset>
  );
}

export function GestionnaireOutils({ disponible, surExecuter, surFermer, projectId }: CatalogueProps) {
  const [recherche, setRecherche] = useState("");
  const champ = useFocusDialogue();
  const noms = useNomsAffiches();
  const profil = useProfilOutils(projectId);
  const personnel = profil.preferences.profil === "personnel";
  const trouvees = rechercher(recherche, noms.autres);
  const retenues = new Set(trouvees);
  // Le gestionnaire garde l'ordre du catalogue, rangé par barre ; la recherche ne fait que filtrer.
  const groupes = groupesCatalogue(CATALOGUE.filter((e) => retenues.has(e)));
  return (
    <Dialogue titre="Outils" id="studio-outils-titre" classe="studio-gestionnaire" surFermer={surFermer}>
      <div data-studio-gestionnaire-outils>
        <p className="studio-dialogue-aide">Catalogue des outils et des commandes de la planche, lu dans le registre de Studio.</p>
        <ChoixProfil profil={profil} />
        <label>Rechercher un outil<input ref={champ} type="search" value={recherche} placeholder="Nom, raccourci ou identifiant" onChange={(e) => setRecherche(e.target.value)} data-studio-recherche-outils /></label>
        <p role="status" className="studio-dialogue-aide">{`${trouvees.length} entrée(s)`}</p>
        {!trouvees.length && <p>Aucun outil ne correspond à la recherche.</p>}
        {groupes.map((g) => (
          <section key={g.barre.id} aria-labelledby={`studio-outils-${g.barre.id}`} data-studio-catalogue-barre={g.barre.id}>
            <h3 id={`studio-outils-${g.barre.id}`}>{g.barre.libelleFR}</h3>
            <ul className="studio-catalogue">
              {g.entrees.map((e) => {
                const ok = disponible(e);
                const outil = e.outil?.toolId ?? null;
                const favori = outil !== null && profil.favoris.includes(outil);
                const dansLesBarres = outil === null || profil.visible(outil);
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
                    {outil !== null && (
                      <span className="studio-catalogue-meta" data-studio-barres={dansLesBarres ? "visible" : "masque"}>
                        {dansLesBarres ? "Dans les barres" : "Masqué des barres (raccourci actif)"}
                      </span>
                    )}
                    {outil !== null && personnel && (
                      <label className="studio-catalogue-meta">
                        <input type="checkbox" checked={dansLesBarres} disabled={!profil.modifiable || outil === OUTIL_TOUJOURS_VISIBLE}
                          onChange={() => profil.basculerPersonnel(outil)} data-studio-personnel={outil} />
                        Dans mon profil
                      </label>
                    )}
                    {outil !== null && (
                      <button type="button" aria-pressed={favori} disabled={!profil.modifiable} aria-label={`Favori : ${e.libelleFR}`}
                        title={favori ? "Retirer des favoris" : "Ajouter aux favoris"} onClick={() => profil.basculerFavori(outil)} data-studio-favori={outil}>
                        <span aria-hidden="true">{favori ? "★" : "☆"}</span>
                      </button>
                    )}
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

const GROUPE_STYLE = { display: "block", border: 0, padding: 0 } as const;

export function PaletteCommandes({ disponible, surExecuter, surFermer, projectId }: CatalogueProps) {
  const [recherche, setRecherche] = useState("");
  const [actif, setActif] = useState(0);
  const champ = useFocusDialogue();
  const noms = useNomsAffiches();
  const { favoris } = useProfilOutils(projectId);
  // Groupe « Favoris » en tête (filtré par la recherche comme le reste), puis les autres entrées.
  const groupes = separerFavoris(rechercher(recherche, noms.autres), favoris);
  const trouvees = [...groupes.favoris, ...groupes.autres];
  const index = Math.min(actif, Math.max(trouvees.length - 1, 0));
  const lancer = (e: EntreeCatalogue | undefined) => { if (e && disponible(e)) surExecuter(e); };
  const touche = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActif(Math.min(index + 1, trouvees.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif(Math.max(index - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); lancer(trouvees[index]); }
  };
  const idOption = (e: EntreeCatalogue) => `studio-palette-${e.identifiant.replace(/[^a-z0-9-]/gi, "-")}`;
  const option = (e: EntreeCatalogue, i: number) => {
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
  };
  const nFavoris = groupes.favoris.length;
  return (
    <Dialogue titre="Palette de commandes" id="studio-palette-titre" classe="studio-palette" surFermer={surFermer}>
      <div data-studio-palette>
        <label>Commande à lancer<input ref={champ} role="combobox" aria-expanded="true" aria-controls="studio-palette-liste" aria-activedescendant={trouvees[index] ? idOption(trouvees[index]) : undefined}
          value={recherche} placeholder="Nom, raccourci ou identifiant" onChange={(e) => { setRecherche(e.target.value); setActif(0); }} onKeyDown={touche} data-studio-recherche-palette /></label>
        <p className="studio-dialogue-aide">Entrée lance la commande choisie ; flèches pour choisir ; Échap ferme.</p>
        {!trouvees.length && <p role="status">Aucune commande ne correspond à la recherche.</p>}
        <ul id="studio-palette-liste" role="listbox" aria-label="Commandes" className="studio-catalogue">
          {nFavoris === 0
            ? trouvees.map(option)
            : (["favoris", "autres"] as const).map((g) => (
              groupes[g].length > 0 && (
                <li key={g} role="group" aria-labelledby={`studio-palette-groupe-${g}`} style={GROUPE_STYLE} data-studio-palette-groupe={g}>
                  <strong id={`studio-palette-groupe-${g}`} className="studio-catalogue-meta">{g === "favoris" ? "Favoris" : "Autres commandes"}</strong>
                  <ul role="presentation" className="studio-catalogue">{groupes[g].map((e, j) => option(e, g === "favoris" ? j : nFavoris + j))}</ul>
                </li>
              )
            ))}
        </ul>
      </div>
    </Dialogue>
  );
}
