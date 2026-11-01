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
 *
 * Catalogue autorisé (B.2-01, B.2-06) : filtres par barre, contexte, nature, regroupement personnel, favoris et droit
 * réel ; chaque entrée montre ses contextes, le droit qu'elle requiert et, si elle ne peut être lancée, sa raison
 * (droit refusé par le serveur, révision historique, enregistrement, contexte — `variante/droits.ts`). Regroupements
 * personnels (B.2-02) : créés, composés et supprimés ici, enregistrés avec les préférences du compte.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../../../components/Icon";
import { api, ApiError, type StudioConflitRaccourci } from "../../../lib/api";
import { useAuth } from "../../../lib/auth-context";
import { lireRouteStudio } from "../routes-studio";
import { STUDIO_CONTEXTES_OUTILS, STUDIO_MANIFESTE_OUTILS_VERSION, type StudioContexteOutil } from "@parcours/atelier-model";
import { LIBELLES_RAISON, estRefusDeDroit, type RaisonIndisponible } from "../variante/droits";
import { CATALOGUE, filtrerCatalogue, groupesCatalogue, rechercher, separerFavoris, type EntreeCatalogue, type FiltresCatalogue } from "./catalogue";
import {
  basculerDansGroupe, basculerFavori, basculerPersonnel, CHOIX_PROFILS, choisirProfil, conflitsRaccourcisPersonnels, corpsPreferences, creerGroupe, filtreBarres, LIMITES_GROUPES, normaliserPreferences,
  OUTIL_TOUJOURS_VISIBLE, PREFERENCES_DEFAUT, refusNomGroupe, supprimerGroupe,
  type IdProfil, type PreferencesOutils,
} from "./profils";
import { ariaRaccourci, BARRES_STUDIO, libelleRaccourci, type BarreStudio, type StudioToolId } from "./raccourcis";
import { PanneauRessources } from "../chargement/PanneauRessources";
import { useEtatsRessources } from "../chargement/useRessources";
import { etatOutilCatalogue, LIBELLES_ETAT_OUTIL, type EtatOutilCatalogue } from "./etats-outils";

export interface CatalogueProps {
  disponible: (e: EntreeCatalogue) => boolean;
  /**
   * Raison d'une entrée non lançable (droit réel, révision, enregistrement, contexte), ou null ; absente : seule la
   * disponibilité est connue (« Indisponible »).
   */
  raison?: (e: EntreeCatalogue) => RaisonIndisponible | null;
  surExecuter: (e: EntreeCatalogue) => void;
  surFermer: () => void;
  /** Projet de l'adresse des préférences ; lu dans l'adresse Studio courante s'il n'est pas donné. */
  projectId?: string;
}

/*
 * Préférences d'outils du compte (favoris, profil des barres), partagées par la barre d'outils, le gestionnaire et la
 * palette : un état en mémoire **par compte**, relu du serveur, enregistré sur le serveur à chaque changement (PUT
 * complet). Changer de compte (déconnexion, autre connexion dans le même onglet) remet l'état à zéro et écarte toute
 * réponse tardive de l'ancien compte. Visibilité seulement (B.2-06) : ni disponibilité, ni raccourcis, ni droits.
 */
type EtatChargement = "initial" | "chargement" | "pret" | "erreur";
type EtatEnregistrement = "aucun" | "en-cours" | "enregistre" | "echec";
export interface EtatPreferences {
  /** Compte auquel appartiennent ces préférences ; null = aucun compte (rien n'est lu ni écrit). */
  compte: string | null;
  prefs: PreferencesOutils;
  etat: EtatChargement;
  enregistrement: EtatEnregistrement;
  erreur: string | null;
}
export interface ApiPreferencesOutils {
  studioToolPreferences: (projectId: string) => Promise<unknown>;
  setStudioToolPreferences: (projectId: string, corps: ReturnType<typeof corpsPreferences>) => Promise<unknown>;
}
const etatVierge = (compte: string | null): EtatPreferences => ({ compte, prefs: PREFERENCES_DEFAUT, etat: "initial", enregistrement: "aucun", erreur: null });
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** État montré à un compte : celui du magasin s'il lui appartient, sinon l'état vierge (jamais celui d'un autre). */
export const etatPourCompte = (etat: EtatPreferences, compte: string | null): EtatPreferences => (etat.compte === compte ? etat : etatVierge(compte));

/** Magasin des préférences d'outils, rattaché à un compte ; `api` injectée (essais). */
export function creerMagasinPreferences(source: ApiPreferencesOutils) {
  let etat = etatVierge(null);
  /** Génération du compte : toute réponse d'une génération passée est ignorée. */
  let generation = 0;
  /** Enregistrements en cours : une relecture du serveur n'écrase pas un changement pas encore enregistré. */
  let enVol = 0;
  let file: Promise<unknown> = Promise.resolve();
  const abonnes = new Set<() => void>();
  const publier = (suivant: Partial<EtatPreferences>) => { etat = { ...etat, ...suivant }; for (const f of abonnes) f(); };

  /** Rattache le magasin au compte ; un autre compte (ou la déconnexion) remet tout à zéro. */
  function adopterCompte(compte: string | null) {
    if (etat.compte === compte) return;
    generation += 1;
    enVol = 0;
    file = Promise.resolve();
    etat = etatVierge(compte);
    for (const f of abonnes) f();
  }

  function charger(compte: string, projectId: string) {
    adopterCompte(compte);
    if (etat.etat === "chargement" || enVol > 0) return;
    const g = generation;
    if (etat.etat !== "pret") publier({ etat: "chargement" });
    source.studioToolPreferences(projectId)
      .then((r) => { if (g === generation && enVol === 0) publier({ prefs: normaliserPreferences(r as Parameters<typeof normaliserPreferences>[0]), etat: "pret", erreur: null }); })
      .catch((e: unknown) => { if (g === generation) publier(etat.etat === "pret" ? { erreur: message(e) } : { etat: "erreur", erreur: message(e) }); });
  }

  function enregistrer(compte: string, projectId: string, f: (p: PreferencesOutils) => PreferencesOutils) {
    if (etat.compte !== compte || etat.etat !== "pret") return;
    const g = generation;
    const suivant = f(etat.prefs);
    publier({ prefs: suivant, enregistrement: "en-cours", erreur: null });
    enVol += 1;
    const corps = corpsPreferences(suivant);
    file = file.then(() => (g === generation ? source.setStudioToolPreferences(projectId, corps) : null))
      .then((r) => {
        if (g !== generation) return;
        enVol -= 1;
        if (enVol === 0) publier({ prefs: normaliserPreferences(r as Parameters<typeof normaliserPreferences>[0]), enregistrement: "enregistre" });
      })
      .catch((e: unknown) => {
        if (g !== generation) return;
        enVol -= 1;
        // Refus ou réseau : relire l'état du serveur plutôt que de garder une préférence non enregistrée.
        publier({ enregistrement: "echec", erreur: message(e) });
        if (enVol === 0) charger(compte, projectId);
      });
  }

  return {
    lire: () => etat,
    abonner: (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; },
    adopterCompte, charger, enregistrer,
  };
}

const magasin = creerMagasinPreferences(api);

const projetDeLAdresse = (): string | null => {
  if (typeof window === "undefined") return null;
  const r = lireRouteStudio(window.location.pathname, "");
  return "projectId" in r ? r.projectId : null;
};

/** Compte connecté ; hors du fournisseur d'authentification (rendu isolé, essais) : aucun compte. */
function useCompte(): string | null {
  try {
    return useAuth().user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Préférences d'outils du compte pour la barre d'outils, le gestionnaire et la palette. `visible(toolId)` ne règle
 * que la présence dans les barres : un outil masqué reste au catalogue, à la palette et à son raccourci clavier.
 * Avant la lecture du serveur (ou en cas d'échec, ou sans compte), tout est visible (profil Standard) et aucun favori
 * n'est montré ; les préférences d'un autre compte ne sont jamais montrées, même un instant.
 */
export function useProfilOutils(projectId?: string | null) {
  const projet = projectId ?? projetDeLAdresse();
  const compte = useCompte();
  const brut = useSyncExternalStore(magasin.abonner, magasin.lire, magasin.lire);
  const etat = etatPourCompte(brut, compte);
  useEffect(() => {
    magasin.adopterCompte(compte);
    if (compte && projet) magasin.charger(compte, projet);
  }, [compte, projet]);
  const visible = useMemo(() => filtreBarres(etat.prefs), [etat.prefs]);
  const modifiable = compte !== null && projet !== null && etat.etat === "pret";
  const modifier = (f: (p: PreferencesOutils) => PreferencesOutils) => { if (compte && projet && modifiable) magasin.enregistrer(compte, projet, f); };
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
    groupes: etat.prefs.groupes,
    creerGroupe: (nom: string) => modifier((p) => creerGroupe(p, nom)),
    supprimerGroupe: (id: string) => modifier((p) => supprimerGroupe(p, id)),
    basculerDansGroupe: (id: string, outil: StudioToolId) => modifier((p) => basculerDansGroupe(p, id, outil)),
    projet,
    /** Relit les préférences du serveur (après un import de profil). */
    recharger: () => { if (compte && projet) magasin.charger(compte, projet); },
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

const TYPE_CONFLIT: Record<StudioConflitRaccourci["type"], string> = {
  doublon: "déjà donné à", registre: "raccourci de l’outil", editeur: "raccourci de la commande", navigateur: "réservé au navigateur",
};

type EtatImport =
  | { etape: "repos" }
  | { etape: "conflits"; fichier: Record<string, unknown>; conflits: StudioConflitRaccourci[] }
  | { etape: "refus"; message: string; capacites: string[] }
  | { etape: "importe"; ecartes: number };

/**
 * Exporter / importer le profil du compte (EX-033, EX-034) : un import ne confère aucun droit (refus nommé), et ses
 * conflits de raccourcis sont montrés avant toute écriture ; « Importer sans les raccourcis en conflit » importe le
 * reste, sans modifier le fichier choisi.
 */
function ImportExportProfil({ profil }: { profil: ReturnType<typeof useProfilOutils> }) {
  const [etat, setEtat] = useState<EtatImport>({ etape: "repos" });
  const champ = useRef<HTMLInputElement>(null);
  const p = profil.preferences;
  const exporter = async () => {
    if (!profil.projet) return;
    const f = await api.exportStudioProfil(profil.projet);
    const lien = document.createElement("a");
    lien.href = URL.createObjectURL(new Blob([JSON.stringify(f, null, 2)], { type: "application/json" }));
    lien.download = `profil-studio-${f.profileId}-v${f.version}.json`;
    lien.click();
    URL.revokeObjectURL(lien.href);
  };
  const envoyer = async (fichier: Record<string, unknown>, ecarter: boolean) => {
    if (!profil.projet) return;
    // Conflits connus de l'interface seule (commandes de l'éditeur, navigateur) : retirés d'une COPIE du fichier.
    const raccourcis = { ...((fichier["raccourcis"] as Record<string, string> | undefined) ?? {}) };
    const locaux = conflitsRaccourcisPersonnels(raccourcis);
    if (locaux.length && !ecarter) { setEtat({ etape: "conflits", fichier, conflits: locaux }); return; }
    for (const c of locaux) delete raccourcis[c.capacite];
    try {
      const r = await api.importStudioProfil(profil.projet, { ...fichier, raccourcis }, ecarter ? "ecarter" : undefined);
      setEtat({ etape: "importe", ecartes: r.ecartes.length + locaux.length });
      profil.recharger();
    } catch (e) {
      const corps = e instanceof ApiError ? (e.body as { conflits?: StudioConflitRaccourci[]; capacites?: string[] } | null) : null;
      if (e instanceof ApiError && e.status === 409 && corps?.conflits) setEtat({ etape: "conflits", fichier, conflits: corps.conflits });
      else if (e instanceof ApiError && e.status === 403) setEtat({ etape: "refus", message: "Un profil ne confère aucun droit : ce profil place une capacité que votre compte ne peut pas exécuter dans ce projet. Rien n’a été importé.", capacites: corps?.capacites ?? [] });
      else setEtat({ etape: "refus", message: "Fichier de profil illisible ou refusé : rien n’a été importé.", capacites: [] });
    }
  };
  const choisir = async (f: File | undefined) => {
    if (!f) return;
    let fichier: unknown;
    try { fichier = JSON.parse(await f.text()); } catch { setEtat({ etape: "refus", message: "Fichier de profil illisible ou refusé : rien n’a été importé.", capacites: [] }); return; }
    if (!fichier || typeof fichier !== "object" || Array.isArray(fichier)) { setEtat({ etape: "refus", message: "Fichier de profil illisible ou refusé : rien n’a été importé.", capacites: [] }); return; }
    await envoyer(fichier as Record<string, unknown>, false);
    if (champ.current) champ.current.value = "";
  };
  return (
    <div className="studio-profil-echange" data-studio-profil-echange data-studio-profil-id={p.profileId ?? ""} data-studio-profil-version={p.version}>
      <p className="studio-dialogue-aide" data-studio-profil-identite>
        <span>{p.profileId ? `Profil ${p.profileId} · version ${p.version}` : "Aucun profil enregistré pour l’instant."}</span>
        {p.importeDe && <span>{` · importé depuis ${p.importeDe}`}</span>}
      </p>
      {Object.keys(p.raccourcis).length > 0 && (
        <ul className="studio-profil-raccourcis" data-studio-raccourcis-personnels>
          {Object.entries(p.raccourcis).map(([capacite, r]) => <li key={capacite} data-studio-raccourci-personnel={capacite}><span translate="no">{capacite}</span> <kbd>{libelleRaccourci(r)}</kbd></li>)}
        </ul>
      )}
      <button type="button" disabled={!profil.modifiable || !p.profileId} onClick={() => void exporter()} data-studio-exporter-profil>Exporter le profil</button>
      <label className="studio-profil-importer">Importer un profil
        <input ref={champ} type="file" accept="application/json,.json" disabled={!profil.modifiable} onChange={(e) => void choisir(e.target.files?.[0])} data-studio-importer-profil />
      </label>
      {etat.etape === "conflits" && (
        <div role="alert" data-studio-import-conflits={etat.conflits.length}>
          <p>Raccourcis en conflit : rien n’a été importé.</p>
          <ul>{etat.conflits.map((c) => <li key={`${c.capacite}-${c.raccourci}`} data-studio-conflit-raccourci={c.capacite}><kbd>{libelleRaccourci(c.raccourci)}</kbd> <span translate="no">{c.capacite}</span> <span>{TYPE_CONFLIT[c.type]}</span> <span translate="no">{c.avec}</span></li>)}</ul>
          <button type="button" onClick={() => void envoyer(etat.fichier, true)} data-studio-import-ecarter>Importer sans les raccourcis en conflit</button>
          <button type="button" onClick={() => setEtat({ etape: "repos" })}>Annuler l’import</button>
        </div>
      )}
      {etat.etape === "refus" && (
        <p role="alert" data-studio-import-refus={etat.capacites.join(" ")}><span>{etat.message}</span>{etat.capacites.length > 0 && <span translate="no">{` (${etat.capacites.join(", ")})`}</span>}</p>
      )}
      {etat.etape === "importe" && <p role="status" data-studio-import-ok={etat.ecartes}>{etat.ecartes ? `Profil importé ; ${etat.ecartes} raccourci(s) en conflit écarté(s).` : "Profil importé."}</p>}
    </div>
  );
}

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
      <ImportExportProfil profil={profil} />
    </fieldset>
  );
}

const LIBELLE_CONTEXTE: Record<StudioContexteOutil, string> = { "planche-2d": "Planche 2D", "vue-3d": "Vue 3D", feuille: "Feuille" };
const REFUS_NOM: Record<NonNullable<ReturnType<typeof refusNomGroupe>>, string> = {
  vide: "Donnez un nom au regroupement.",
  long: `Nom trop long (${LIMITES_GROUPES.nom} caractères au plus).`,
  pris: "Un regroupement porte déjà ce nom.",
  nombre: `${LIMITES_GROUPES.groupes} regroupements au plus.`,
};

/** Filtres du catalogue (B.2-01) : barre, contexte, nature, regroupement, favoris, exécutables par le compte. */
function FiltresOutils({ filtres, surFiltres, groupes }: { filtres: FiltresCatalogue; surFiltres: (f: FiltresCatalogue) => void; groupes: readonly { id: string; nom: string }[] }) {
  const poser = <K extends keyof FiltresCatalogue>(k: K, v: FiltresCatalogue[K] | "") => {
    const suivant = { ...filtres };
    if (v === "" || v === false) delete suivant[k]; else suivant[k] = v as FiltresCatalogue[K];
    surFiltres(suivant);
  };
  return (
    <fieldset className="studio-filtres-outils" data-studio-filtres-outils>
      <legend>Filtres</legend>
      <label>Barre
        <select value={filtres.barre ?? ""} onChange={(e) => poser("barre", e.target.value as BarreStudio | "")} data-studio-filtre="barre">
          <option value="">Toutes les barres</option>
          {BARRES_STUDIO.map((b) => <option key={b.id} value={b.id}>{b.libelleFR}</option>)}
        </select>
      </label>
      <label>Contexte
        <select value={filtres.contexte ?? ""} onChange={(e) => poser("contexte", e.target.value as StudioContexteOutil | "")} data-studio-filtre="contexte">
          <option value="">Tous les contextes</option>
          {STUDIO_CONTEXTES_OUTILS.map((c) => <option key={c} value={c}>{LIBELLE_CONTEXTE[c]}</option>)}
        </select>
      </label>
      <label>Nature
        <select value={filtres.nature ?? ""} onChange={(e) => poser("nature", e.target.value as EntreeCatalogue["nature"] | "")} data-studio-filtre="nature">
          <option value="">Toutes les natures</option>
          {(Object.keys(NATURE) as EntreeCatalogue["nature"][]).map((n) => <option key={n} value={n}>{NATURE[n]}</option>)}
        </select>
      </label>
      <label>Regroupement
        <select value={filtres.groupe ?? ""} onChange={(e) => poser("groupe", e.target.value)} data-studio-filtre="groupe">
          <option value="">Tous les outils</option>
          {groupes.map((g) => <option key={g.id} value={g.id}>{g.nom}</option>)}
        </select>
      </label>
      <label><input type="checkbox" checked={!!filtres.favoris} onChange={(e) => poser("favoris", e.target.checked)} data-studio-filtre="favoris" />Favoris seulement</label>
      <label><input type="checkbox" checked={!!filtres.executables} onChange={(e) => poser("executables", e.target.checked)} data-studio-filtre="executables" />Autorisés pour moi seulement</label>
    </fieldset>
  );
}

/** Regroupements personnels (B.2-02) : création, suppression ; l'appartenance se règle sur chaque outil. */
function Regroupements({ profil, compose, surComposer }: { profil: ReturnType<typeof useProfilOutils>; compose: string | null; surComposer: (id: string | null) => void }) {
  const [nom, setNom] = useState("");
  const refus = refusNomGroupe(profil.preferences, nom);
  const creer = () => { if (refus === null) { profil.creerGroupe(nom); setNom(""); } };
  return (
    <fieldset className="studio-regroupements" data-studio-regroupements>
      <legend>Mes regroupements</legend>
      <p className="studio-dialogue-aide">Listes d’outils à vous, enregistrées sur le serveur ; elles filtrent ce catalogue sans changer les barres.</p>
      <label>Nom du regroupement
        <input type="text" value={nom} maxLength={LIMITES_GROUPES.nom + 1} disabled={!profil.modifiable} onChange={(e) => setNom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); creer(); } }} data-studio-nom-groupe />
      </label>
      <button type="button" disabled={!profil.modifiable || refus !== null} onClick={creer} data-studio-creer-groupe>Créer le regroupement</button>
      {nom.trim() !== "" && refus !== null && <p className="studio-dialogue-aide" role="status" data-studio-refus-groupe={refus}>{REFUS_NOM[refus]}</p>}
      {profil.groupes.length === 0
        ? <p className="studio-dialogue-aide">Aucun regroupement.</p>
        : (
          <ul className="studio-regroupements-liste">
            {profil.groupes.map((g) => (
              <li key={g.id} data-studio-groupe={g.id}>
                <span>{g.nom}</span>
                <span className="studio-catalogue-meta" data-studio-groupe-taille={g.outils.length}>{`${g.outils.length} outil(s)`}</span>
                <button type="button" aria-pressed={compose === g.id} disabled={!profil.modifiable} aria-label={`Composer le regroupement : ${g.nom}`}
                  onClick={() => surComposer(compose === g.id ? null : g.id)} data-studio-composer-groupe={g.id}>{compose === g.id ? "Terminer" : "Composer"}</button>
                <button type="button" disabled={!profil.modifiable} aria-label={`Supprimer le regroupement : ${g.nom}`} onClick={() => profil.supprimerGroupe(g.id)} data-studio-supprimer-groupe={g.id}>Supprimer</button>
              </li>
            ))}
          </ul>
        )}
    </fieldset>
  );
}

export function GestionnaireOutils({ disponible, raison, surExecuter, surFermer, projectId }: CatalogueProps) {
  const [recherche, setRecherche] = useState("");
  const [filtres, setFiltres] = useState<FiltresCatalogue>({});
  const champ = useFocusDialogue();
  const noms = useNomsAffiches();
  const profil = useProfilOutils(projectId);
  const personnel = profil.preferences.profil === "personnel";
  const raisonDe = (e: EntreeCatalogue): RaisonIndisponible | null => (raison ? raison(e) : disponible(e) ? null : "contexte");
  // Un regroupement supprimé ne filtre plus (filtre retiré à l'affichage).
  const { groupe: groupeChoisi, ...sansGroupe } = filtres;
  const filtresActifs: FiltresCatalogue = groupeChoisi !== undefined && !profil.groupes.some((g) => g.id === groupeChoisi) ? sansGroupe : filtres;
  // Regroupement en cours de composition : une case « Dans ce regroupement » sur chaque outil du registre.
  const [compose, setCompose] = useState<string | null>(null);
  const groupeCompose = profil.groupes.find((g) => g.id === compose) ?? null;
  const trouvees = filtrerCatalogue(rechercher(recherche, noms.autres), filtresActifs, {
    favoris: profil.favoris, groupes: profil.groupes, autorise: (e) => !estRefusDeDroit(raisonDe(e)),
  });
  const retenues = new Set(trouvees);
  // Le gestionnaire garde l'ordre du catalogue, rangé par barre ; la recherche et les filtres ne font que filtrer.
  const groupes = groupesCatalogue(CATALOGUE.filter((e) => retenues.has(e)));
  // EX-029 : état de chaque outil, lu dans le gestionnaire des ressources sans rien charger.
  const moteurs = useEtatsRessources();
  const enLigne = typeof navigator === "undefined" || navigator.onLine !== false;
  const etatDe = (e: EntreeCatalogue, r: RaisonIndisponible | null): EtatOutilCatalogue => etatOutilCatalogue(e, { raison: r, moteurs, enLigne });
  return (
    <Dialogue titre="Outils" id="studio-outils-titre" classe="studio-gestionnaire" surFermer={surFermer}>
      <div data-studio-gestionnaire-outils data-studio-manifeste={STUDIO_MANIFESTE_OUTILS_VERSION}>
        <p className="studio-dialogue-aide">Catalogue des outils et des commandes de la planche, lu dans le registre de Studio.</p>
        <p className="studio-dialogue-aide">Manifeste du catalogue : <code translate="no">{STUDIO_MANIFESTE_OUTILS_VERSION}</code></p>
        <ChoixProfil profil={profil} />
        <Regroupements profil={profil} compose={groupeCompose?.id ?? null} surComposer={setCompose} />
        <PanneauRessources />
        <label>Rechercher un outil<input ref={champ} type="search" value={recherche} placeholder="Nom, synonyme, famille, domaine, raccourci ou identifiant" onChange={(e) => setRecherche(e.target.value)} data-studio-recherche-outils /></label>
        <FiltresOutils filtres={filtresActifs} surFiltres={setFiltres} groupes={profil.groupes} />
        <p role="status" className="studio-dialogue-aide" data-studio-nombre-entrees={trouvees.length}>{`${trouvees.length} entrée(s)`}</p>
        {!trouvees.length && <p>Aucun outil ne correspond à la recherche.</p>}
        {groupes.map((g) => (
          <section key={g.barre.id} aria-labelledby={`studio-outils-${g.barre.id}`} data-studio-catalogue-barre={g.barre.id}>
            <h3 id={`studio-outils-${g.barre.id}`}>{g.barre.libelleFR}</h3>
            <ul className="studio-catalogue">
              {g.entrees.map((e) => {
                const ok = disponible(e);
                const r = ok ? null : raisonDe(e) ?? "contexte";
                const outil = e.outil?.toolId ?? null;
                const favori = outil !== null && profil.favoris.includes(outil);
                const dansLesBarres = outil === null || profil.visible(outil);
                const etatOutil = etatDe(e, r);
                return (
                  <li key={e.identifiant} data-studio-catalogue-entree={e.identifiant} data-studio-disponible={ok ? "oui" : "non"}
                    data-studio-autorise={estRefusDeDroit(r) ? "non" : "oui"} data-studio-raison={r ?? undefined} data-studio-etat-outil={etatOutil}>
                    <Icon name={e.icone} size={20} />
                    <span className="studio-catalogue-nom" ref={noms.poser(e.identifiant)}>{e.libelleFR}</span>
                    <Raccourcis e={e} />
                    <code translate="no">{e.identifiant}</code>
                    <span className="studio-catalogue-meta">{NATURE[e.nature]}</span>
                    <span className="studio-catalogue-meta" data-studio-contextes={e.contextes.join(" ")}>{e.contextes.map((c) => LIBELLE_CONTEXTE[c]).join(" · ")}</span>
                    <span className="studio-catalogue-meta" data-studio-droit={e.droit}>{e.droit === "ecriture" ? "Droit requis : écriture" : "Droit requis : lecture"}</span>
                    {e.chargeur !== null && <span className="studio-catalogue-meta" data-studio-chargeur={e.chargeur}>Chargeur : <code translate="no">{e.chargeur}</code></span>}
                    {e.outil !== null && (
                      <span className="studio-catalogue-meta" data-studio-prerequis={e.prerequis.join(" ")}>
                        {e.prerequis.length ? <>Prérequis : <code translate="no">{e.prerequis.join(", ")}</code></> : "Aucun prérequis"}
                      </span>
                    )}
                    <span className="studio-catalogue-meta" data-studio-disponibilite>{r === null ? "Disponible" : raison ? LIBELLES_RAISON[r] : "Indisponible"}</span>
                    <span className="studio-catalogue-meta" data-studio-etat-libelle>{LIBELLES_ETAT_OUTIL[etatOutil]}</span>
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
                    {outil !== null && groupeCompose !== null && (
                      <label className="studio-catalogue-meta">
                        <input type="checkbox" checked={groupeCompose.outils.includes(outil)} disabled={!profil.modifiable}
                          onChange={() => profil.basculerDansGroupe(groupeCompose.id, outil)} data-studio-groupe-membre={outil} />
                        Dans ce regroupement
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

export function PaletteCommandes({ disponible, raison, surExecuter, surFermer, projectId }: CatalogueProps) {
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
    const r = ok ? null : raison?.(e) ?? null;
    return (
      <li key={e.identifiant} id={idOption(e)} role="option" aria-selected={i === index} aria-disabled={ok ? undefined : true}
        data-studio-palette-entree={e.identifiant} data-studio-disponible={ok ? "oui" : "non"} data-studio-raison={r ?? undefined} onMouseEnter={() => setActif(i)} onClick={() => lancer(e)}>
        <Icon name={e.icone} size={20} />
        <span className="studio-catalogue-nom" ref={noms.poser(e.identifiant)}>{e.libelleFR}</span>
        <Raccourcis e={e} />
        {!ok && <span className="studio-catalogue-meta">{r ? LIBELLES_RAISON[r] : "Indisponible"}</span>}
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
