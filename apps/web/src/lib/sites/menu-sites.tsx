/**
 * Menu « Sites » partagé (27 novembre 2026, maquettes validées par le maître d'ouvrage) : la Planche du Sandbox et GeoData
 * offrent les mêmes articles — Nouveau site de projet…, Ouvrir un site de projet…, Sauvegarder, Sauvegarder sous… |
 * Importer un site…, Exporter le site… — sur la même base dédiée (`/sites/api`). Chaque module garde son propre bouton ou
 * menu ; ce fichier porte l'état du site ouvert, les actions et les fenêtres « Nouveau », « Ouvrir » et « Sauvegarder sous ».
 *
 * Le module fournit ce qu'il sait du lieu (Planche : son Emplacement ; GeoData : le centre de la carte) par `etatModule`,
 * et reçoit le site ouvert par `onOuvert`. Rien n'est inventé : ce que le module ne connaît pas reste « non évalué ».
 */
import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { NATURES_TRAVAUX, type ContenuSite, type FicheSite, type LienSite, type NatureTravaux, type ObservationsSite } from "@parcours/domain-model";
import { adresseExport, contenuDe, creerSite, ErreurSites, importerSite, lierSite, lireSite, listerSites, sauvegarderSite, sauvegarderSiteSous, type ResumeSite, type SiteOuvert } from "./client";
import "./sites.css";

/** Pour la Planche, qui ne lit pas le modèle du domaine directement : l'Emplacement tiré d'un site. */
export { emplacementDepuisSite } from "@parcours/domain-model";

/** Libellés des articles, dans l'ordre de la maquette (le séparateur vient après « Sauvegarder sous… »). */
export const ARTICLES_SITES = {
  nouveau: "Nouveau site de projet…",
  ouvrir: "Ouvrir un site de projet…",
  sauvegarder: "Sauvegarder",
  sauvegarderSous: "Sauvegarder sous…",
  importer: "Importer un site…",
  exporter: "Exporter le site…",
} as const;

export type ArticleSites = keyof typeof ARTICLES_SITES;
export const ORDRE_ARTICLES: readonly (ArticleSites | "separateur")[] = ["nouveau", "ouvrir", "sauvegarder", "sauvegarderSous", "separateur", "importer", "exporter"];

const NATURES: Record<NatureTravaux, string> = { construction: "Construction neuve", renovation: "Rénovation" };

/** Ce que le module sait du lieu : position déclarée, nord, altitude, nom du lieu (champs absents = rien d'écrit). */
export interface EtatModuleSite {
  readonly observations?: Partial<Pick<ObservationsSite, "geographic" | "nord" | "altitudeReference">>;
  readonly lieu?: string;
}

export interface OptionsSitesProjet {
  /** Lien du module vers le site (la Planche courante) ; `null` = aucun lien enregistré (GeoData). */
  readonly lien: LienSite | null;
  readonly etatModule: () => EtatModuleSite;
  /** Site ouvert (Ouvrir, Importer) : le module en reprend la position. */
  readonly onOuvert: (site: SiteOuvert) => void;
}

type Dialogue = null | "nouveau" | "ouvrir" | "sauvegarder-sous";

const message = (e: unknown) => (e instanceof ErreurSites ? e.message : "Opération impossible.");

function fusionner(c: ContenuSite, etat: EtatModuleSite): ContenuSite {
  const o = etat.observations ?? {};
  return {
    ...c,
    fiche: { ...c.fiche, ...(etat.lieu !== undefined && !c.fiche.lieu ? { lieu: etat.lieu } : {}) },
    observations: {
      ...c.observations,
      ...(o.geographic !== undefined ? { geographic: o.geographic } : {}),
      ...(o.nord !== undefined ? { nord: o.nord } : {}),
      ...(o.altitudeReference !== undefined ? { altitudeReference: o.altitudeReference } : {}),
    },
  };
}

const VIDE: Omit<ContenuSite, "fiche"> = { parcelle: null, observations: { frontageEdge: null, approachStatus: "hypothesis", priority: "balanced", frontContext: "unknown", backContext: "unknown", source: "", note: "", geographic: null, observedAt: null, nord: null, altitudeReference: null }, altimetrie: null, zone: null };

export function useSitesProjet({ lien, etatModule, onOuvert }: OptionsSitesProjet) {
  const [site, setSite] = useState<SiteOuvert | null>(null);
  const [dialogue, setDialogue] = useState<Dialogue>(null);
  const [note, setNote] = useState<{ texte: string; erreur: boolean } | null>(null);
  const [occupe, setOccupe] = useState(false);
  const fichier = useRef<HTMLInputElement | null>(null);
  const rappels = useRef({ etatModule, onOuvert });
  rappels.current = { etatModule, onOuvert };
  const cleLien = lien ? `${lien.genre}:${lien.cible}` : "";

  // Le site déjà rattaché (Planche rouverte) est retrouvé dans la base, sans toucher à la Planche.
  useEffect(() => {
    setSite(null);
    if (!lien) return;
    let actif = true;
    listerSites(lien)
      .then((l) => (l[0] ? lireSite(l[0].id) : null))
      .then((s) => actif && setSite(s), () => undefined);
    return () => {
      actif = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleLien]);

  const executer = useCallback(async (f: () => Promise<string | null>) => {
    setOccupe(true);
    setNote(null);
    try {
      const texte = await f();
      if (texte) setNote({ texte, erreur: false });
      return true;
    } catch (e) {
      setNote({ texte: message(e), erreur: true });
      return false;
    } finally {
      setOccupe(false);
    }
  }, []);

  const ouvert = (s: SiteOuvert, texte: string) => {
    setSite(s);
    rappels.current.onOuvert(s);
    return texte;
  };

  const actions: Record<ArticleSites, () => void> = {
    nouveau: () => setDialogue("nouveau"),
    ouvrir: () => setDialogue("ouvrir"),
    sauvegarder: () => {
      if (!site) return setDialogue("nouveau");
      void executer(async () => {
        const s = await sauvegarderSite(site, fusionner(contenuDe(site), rappels.current.etatModule()), lien ?? undefined);
        setSite(s);
        return `Site « ${s.fiche.nom} » sauvegardé (révision ${s.revision}).`;
      });
    },
    sauvegarderSous: () => setDialogue("sauvegarder-sous"),
    importer: () => fichier.current?.click(),
    exporter: () => {
      if (!site) return;
      const a = document.createElement("a");
      a.href = adresseExport(site.id);
      a.download = "";
      document.body.append(a);
      a.click();
      a.remove();
      setNote({ texte: `Fichier du site « ${site.fiche.nom} » téléchargé.`, erreur: false });
    },
  };

  const disponible: Record<ArticleSites, boolean> = { nouveau: true, ouvrir: true, sauvegarder: true, sauvegarderSous: site !== null, importer: true, exporter: site !== null };

  const valider = (fiche: FicheSite) =>
    executer(async () => {
      if (dialogue === "sauvegarder-sous" && site) {
        const s = await sauvegarderSiteSous(site, fusionner({ ...contenuDe(site), fiche }, rappels.current.etatModule()), lien ?? undefined);
        setSite(s);
        return `Site enregistré sous « ${s.fiche.nom} ».`;
      }
      const s = await creerSite(fusionner({ ...VIDE, fiche }, rappels.current.etatModule()), lien ?? undefined);
      setSite(s);
      return `Site « ${s.fiche.nom} » créé.`;
    }).then((ok) => ok && setDialogue(null));

  const ouvrirId = (id: string) =>
    // Ouvert depuis un module lié (la Planche), le site est aussi rattaché en base : la réouverture le retrouve.
    executer(async () => ouvert(lien ? await lierSite(id, lien) : await lireSite(id), "")).then((ok) => {
      if (ok) setDialogue(null);
    });

  const lireFichier = (f: File | undefined) => {
    if (!f) return;
    void executer(async () => {
      const s = await importerSite(f.name, await f.text(), lien ?? undefined);
      return ouvert(s, `Site « ${s.fiche.nom} » importé.`);
    });
  };

  const fenetres = (
    <>
      <input ref={fichier} type="file" accept=".json,application/json" hidden onChange={(e) => { lireFichier(e.target.files?.[0]); e.target.value = ""; }} data-sites-fichier />
      {dialogue === "ouvrir" && <DialogueOuvrir occupe={occupe} erreur={note?.erreur ? note.texte : null} onOuvrir={ouvrirId} onFermer={() => setDialogue(null)} />}
      {(dialogue === "nouveau" || dialogue === "sauvegarder-sous") && (
        <DialogueFiche
          titre={dialogue === "nouveau" ? "Nouveau site de projet" : "Sauvegarder le site sous"}
          initiale={dialogue === "sauvegarder-sous" && site ? { ...site.fiche, nom: "" } : { nom: "", nature: null, lieu: rappels.current.etatModule().lieu ?? "" }}
          occupe={occupe}
          erreur={note?.erreur ? note.texte : null}
          onValider={valider}
          onFermer={() => { setDialogue(null); setNote(null); }}
        />
      )}
    </>
  );

  return { site, actions, disponible, fenetres, note: dialogue ? null : note, effacerNote: () => setNote(null), occupe };
}

function Fenetre({ titre, children, onFermer }: { titre: string; children: React.ReactNode; onFermer: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, []);
  return (
    <div className="sites-fond" onPointerDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div ref={ref} className="sites-fenetre" role="dialog" aria-modal="true" aria-label={titre} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onFermer(); } }} data-sites-fenetre>
        <h2>{titre}</h2>
        {children}
      </div>
    </div>
  );
}

function DialogueFiche({ titre, initiale, occupe, erreur, onValider, onFermer }: { titre: string; initiale: FicheSite; occupe: boolean; erreur: string | null; onValider: (f: FicheSite) => void; onFermer: () => void }) {
  const [nom, setNom] = useState(initiale.nom);
  const [nature, setNature] = useState<NatureTravaux | "">(initiale.nature ?? "");
  const [lieu, setLieu] = useState(initiale.lieu);
  const soumettre = (e: FormEvent) => {
    e.preventDefault();
    onValider({ nom: nom.trim(), nature: nature || null, lieu: lieu.trim() });
  };
  return (
    <Fenetre titre={titre} onFermer={onFermer}>
      <form onSubmit={soumettre}>
        <label>
          Nom du site
          <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} required data-sites-nom />
        </label>
        <label>
          Nature des travaux
          <select value={nature} onChange={(e) => setNature(e.target.value as NatureTravaux | "")} data-sites-nature>
            <option value="">Non renseignée</option>
            {NATURES_TRAVAUX.map((n) => <option key={n} value={n}>{NATURES[n]}</option>)}
          </select>
        </label>
        <label>
          Lieu
          <input value={lieu} onChange={(e) => setLieu(e.target.value)} maxLength={120} data-sites-lieu />
        </label>
        {erreur && <p className="sites-erreur" role="alert">{erreur}</p>}
        <div className="sites-boutons">
          <button type="button" onClick={onFermer}>Annuler</button>
          <button type="submit" className="sites-principal" disabled={occupe || !nom.trim()} data-sites-valider>Enregistrer</button>
        </div>
      </form>
    </Fenetre>
  );
}

function DialogueOuvrir({ occupe, erreur, onOuvrir, onFermer }: { occupe: boolean; erreur: string | null; onOuvrir: (id: string) => void; onFermer: () => void }) {
  const [liste, setListe] = useState<readonly ResumeSite[] | null>(null);
  const [echec, setEchec] = useState<string | null>(null);
  const [choisi, setChoisi] = useState<string | null>(null);
  useEffect(() => {
    listerSites().then(setListe, (e: unknown) => setEchec(message(e)));
  }, []);
  return (
    <Fenetre titre="Ouvrir un site de projet" onFermer={onFermer}>
      {liste === null && !echec && <p>Chargement des sites…</p>}
      {liste !== null && liste.length === 0 && <p>Aucun site de projet enregistré pour ce compte.</p>}
      {liste !== null && liste.length > 0 && (
        <ul className="sites-liste" role="listbox" aria-label="Sites de projet">
          {liste.map((s) => (
            <li key={s.id} role="option" aria-selected={choisi === s.id} tabIndex={0} onClick={() => setChoisi(s.id)} onDoubleClick={() => onOuvrir(s.id)} onKeyDown={(e) => { if (e.key === "Enter") onOuvrir(s.id); if (e.key === " ") { e.preventDefault(); setChoisi(s.id); } }} data-sites-ligne={s.id}>
              <strong translate="no">{s.nom}</strong>
              <span translate="no">{[s.nature ? NATURES[s.nature as NatureTravaux] : null, s.lieu || null].filter(Boolean).join(" · ")}</span>
              <span>{new Date(s.modifieLe).toLocaleDateString()}</span>
            </li>
          ))}
        </ul>
      )}
      {(echec ?? erreur) && <p className="sites-erreur" role="alert">{echec ?? erreur}</p>}
      <div className="sites-boutons">
        <button type="button" onClick={onFermer}>Annuler</button>
        <button type="button" className="sites-principal" disabled={occupe || !choisi} onClick={() => choisi && onOuvrir(choisi)} data-sites-ouvrir>Ouvrir</button>
      </div>
    </Fenetre>
  );
}
