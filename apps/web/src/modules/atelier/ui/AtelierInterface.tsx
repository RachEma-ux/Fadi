/**
 * Interface du nouvel Atelier (tâche L3a.1, cahier §5.8, maquette validée D-022) : les cinq repères permanents —
 * navigateur du projet, zone de travail, commandes, inspecteur, panneau des modifications et problèmes —, les
 * niveaux d'affichage Essentiel / Contextuel / Complet, les favoris, la palette `Ctrl/⌘ K`, les raccourcis, et la
 * disposition téléphone (cartes et feuilles, cinq onglets).
 *
 * Monté par le chef de projet (L3a.4) ; `zoneTravail` est fourni par l'équipier « 2D ». Exige les contextes de
 * l'application : `QueryClientProvider` (journal, problèmes, bilan Harmonie, `ConflictPanel`) et le routeur
 * (`Link`). N'écrit jamais le modèle : outils et inspecteur rendent des commandes validées par `ctx.valider` ;
 * annuler / rétablir passent par `ctx.annuler()` / `ctx.retablir()` (serveur).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { IdObjet } from "@parcours/atelier-model";
import type { ClientAtelierCommandes } from "../../../lib/api/atelier-commandes";
import type { BusAtelier } from "../bus";
import { NIVEAUX_AFFICHAGE, type ContexteAtelier, type DefinitionOutil, type ErreurLisible, type EtatInterface, type FamilleOutil, type PiloteOutils, type Registres } from "../socle";
import "./atelier-interface.css";
import { BarreCommandes } from "./BarreCommandes";
import { Erreurs } from "./Erreurs";
import { lisible } from "./format";
import { useNotifications, usePilote, useSelection, useVue } from "./hooks";
import { Inspecteur } from "./Inspecteur";
import { Navigateur } from "./Navigateur";
import { niveaux, vueValide } from "./navigateur";
import { activationOutil, LIBELLES_NIVEAU, type ActionPalette, type ResultatPalette } from "./palette";
import { Palette } from "./Palette";
import { PanneauProblemes } from "./PanneauProblemes";
import { resoudreTouche, tableRaccourcis } from "./raccourcis";
import { basculerFavori, ecrireVue, lireVue, stockageNavigateur } from "./vue-persistante";
import { ZoneTravail } from "./ZoneTravail";

export type OngletTelephone = "projet" | "outils" | "inspecteur" | "problemes" | "affichage";

export interface ProprietesAtelierInterface {
  readonly registres: Registres;
  readonly pilote: PiloteOutils;
  readonly ctx: ContexteAtelier;
  readonly vue: EtatInterface;
  readonly bus: BusAtelier;
  readonly client: Pick<ClientAtelierCommandes, "lireJournal" | "lireProblemes">;
  readonly projet: { readonly id: string; readonly code: string; readonly nom: string };
  readonly zoneTravail: ReactNode;
  /**
   * Panneaux ajoutés sous le navigateur (onglet Projet), rendus à chaque rendu de l'interface pour suivre le niveau
   * actif : le métré du niveau (`documents/PanneauMetre.tsx`, D-045).
   */
  readonly panneauxProjet?: () => ReactNode;
}

/** Outil ouvert par la touche Suppr hors outil actif, sélection non vide (D-045). */
export const OUTIL_SUPPRIMER = "modifier.supprimer";

const REQUETE_TELEPHONE = "(max-width: 760px)";

/** Disposition téléphone (≤ 760 px) : les repères deviennent des feuilles ouvertes par les onglets du bas. */
function useTelephone(): boolean {
  const lire = () => {
    try {
      return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REQUETE_TELEPHONE).matches;
    } catch {
      return false;
    }
  };
  const [tel, setTel] = useState(lire);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(REQUETE_TELEPHONE);
    const suivre = () => setTel(m.matches);
    m.addEventListener("change", suivre);
    return () => m.removeEventListener("change", suivre);
  }, []);
  return tel;
}

const estChamp = (cible: EventTarget | null): boolean => {
  if (!(cible instanceof HTMLElement)) return false;
  return cible.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName);
};

const ONGLETS: readonly { readonly onglet: OngletTelephone; readonly libelle: string; readonly icone: string }[] = [
  { onglet: "projet", libelle: "Projet", icone: "☰" },
  { onglet: "outils", libelle: "Outils", icone: "✎" },
  { onglet: "inspecteur", libelle: "Inspecteur", icone: "ⓘ" },
  { onglet: "problemes", libelle: "Problèmes", icone: "⚠" },
  { onglet: "affichage", libelle: "Affichage", icone: "◐" },
];

const CIBLES_REPERE: Readonly<Record<Extract<ActionPalette, { type: "repere" }>["repere"], { onglet: OngletTelephone; focus: string }>> = {
  niveaux: { onglet: "projet", focus: "atl-niveaux-titre" },
  calques: { onglet: "projet", focus: "atl-calques-titre" },
  objets: { onglet: "projet", focus: "atl-objets-titre" },
  documents: { onglet: "projet", focus: "atl-documents-titre" },
  problemes: { onglet: "problemes", focus: "atl-panneau-titre" },
  inspecteur: { onglet: "inspecteur", focus: "atl-inspecteur-titre" },
};

export function AtelierInterface({ registres, pilote, ctx, vue, bus, client, projet, zoneTravail, panneauxProjet }: ProprietesAtelierInterface) {
  const etatVue = useVue(vue);
  const sel = useSelection(ctx.selection);
  usePilote(pilote);
  // Révisions distantes, annulations et conflits résolus (D-036).
  useNotifications(ctx.abonnerEtat);
  const etat = ctx.etat();
  const telephone = useTelephone();

  const [paletteOuverte, setPaletteOuverte] = useState(false);
  const [onglet, setOnglet] = useState<OngletTelephone | null>(null);
  const [panneauOuvert, setPanneauOuvert] = useState(false);
  const [famille, setFamille] = useState<FamilleOutil>("creer");
  const [annonce, setAnnonce] = useState("");
  const [refusOutil, setRefusOutil] = useState<readonly ErreurLisible[]>([]);
  const [erreursHistorique, setErreursHistorique] = useState<readonly ErreurLisible[]>([]);
  const [enCoursHistorique, setEnCoursHistorique] = useState(false);

  const outils = registres.outils.lister();
  const signature = outils.map((o) => `${o.id}=${o.raccourci ?? ""}`).join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recalculée quand les identifiants ou raccourcis changent
  const table = useMemo(() => tableRaccourcis(outils), [signature]);
  // Les raccourcis en conflit sont ignorés (jamais appliqués au hasard) et signalés en développement.
  useEffect(() => {
    if (import.meta.env?.DEV && table.conflits.length > 0) console.warn("[atelier] raccourcis ignorés", table.conflits);
  }, [table]);

  // Vue enregistrée pour ce projet (confort par navigateur, R10), puis enregistrement à chaque changement.
  useEffect(() => {
    const stockage = stockageNavigateur();
    const lue = lireVue(stockage, projet.id);
    if (Object.keys(lue).length > 0) vue.modifier(lue);
    return vue.abonner(() => void ecrireVue(stockage, projet.id, vue.lire()));
  }, [projet.id, vue]);

  // Niveau et calque actifs toujours valides pour le modèle chargé (un outil ne crée rien sans calque).
  useEffect(() => {
    if (!etat) return;
    const changement = vueValide(etat, vue.lire());
    if (Object.keys(changement).length > 0) vue.modifier(changement);
  }, [etat, vue, etatVue.niveauActifId, etatVue.calqueActifId]);

  // Objets disparus (suppression, annulation d'une création, révision distante) retirés de la sélection.
  useEffect(() => {
    if (!etat) return;
    const restants = sel.ids.filter((id) => etat.objets[id] !== undefined);
    if (restants.length !== sel.ids.length) ctx.selection.choisir(restants);
  }, [ctx.selection, etat, sel]);

  const activation = useCallback((o: DefinitionOutil) => activationOutil(o, ctx), [ctx]);

  const activer = useCallback(
    (id: string | null) => {
      const r = pilote.activer(id);
      const def = id ? registres.outils.trouver(id) : null;
      if (r.ok) {
        setRefusOutil([]);
        setAnnonce(def ? `Outil ${def.libelle} actif.` : "Sélection active.");
      } else {
        setRefusOutil([lisible(`Outil « ${def?.libelle ?? id} »`, r.motif, "remplir la condition indiquée, ou choisir un autre outil")]);
      }
    },
    [pilote, registres.outils],
  );

  const historique = useCallback(
    async (sens: "annuler" | "retablir") => {
      if (enCoursHistorique) return;
      pilote.abandonner();
      setEnCoursHistorique(true);
      const r = await (sens === "annuler" ? ctx.annuler() : ctx.retablir());
      setEnCoursHistorique(false);
      if (r.ok) {
        setErreursHistorique([]);
        setAnnonce(`${sens === "annuler" ? "Modification annulée" : "Modification rétablie"} — révision ${r.etat.revision}.`);
      } else {
        setErreursHistorique(r.erreurs);
        setAnnonce(`${sens === "annuler" ? "Annulation" : "Rétablissement"} refusé : ${r.erreurs.map((e) => e.cause).join(" ; ")}.`);
        if (!telephone) setPanneauOuvert(true);
      }
    },
    [ctx, enCoursHistorique, pilote, telephone],
  );

  const allerA = useCallback(
    (repere: keyof typeof CIBLES_REPERE) => {
      const c = CIBLES_REPERE[repere];
      if (etatVue.immersif) vue.modifier({ immersif: false });
      if (telephone) setOnglet(c.onglet);
      if (repere === "problemes") setPanneauOuvert(true);
      requestAnimationFrame(() => document.getElementById(c.focus)?.focus());
    },
    [etatVue.immersif, telephone, vue],
  );

  const allerObjets = useCallback(
    (ids: readonly IdObjet[]) => {
      const premier = ids[0] ? etat?.objets[ids[0]] : undefined;
      if (premier?.niveauId && premier.niveauId !== vue.lire().niveauActifId) vue.modifier({ niveauActifId: premier.niveauId });
      ctx.selection.choisir(ids);
      if (telephone) setOnglet("inspecteur");
    },
    [ctx.selection, etat, telephone, vue],
  );

  const choisirPalette = useCallback(
    (r: ResultatPalette) => {
      if (r.motif) {
        setAnnonce(`${r.nom} indisponible : ${r.motif}.`);
        return;
      }
      setPaletteOuverte(false);
      const a = r.action;
      switch (a.type) {
        case "outil":
          activer(a.id);
          if (telephone) setOnglet(null);
          break;
        case "objet":
          allerObjets([a.id]);
          break;
        case "niveau-affichage":
          vue.modifier({ niveauAffichage: a.niveau });
          setAnnonce(`Niveau d'affichage ${LIBELLES_NIVEAU[a.niveau]}.`);
          break;
        case "repere":
          allerA(a.repere);
          break;
        case "annuler":
          void historique("annuler");
          break;
        case "retablir":
          void historique("retablir");
          break;
        case "immersif":
          vue.modifier({ immersif: !vue.lire().immersif });
          break;
      }
    },
    [activer, allerA, allerObjets, historique, telephone, vue],
  );

  // Clavier global de l'Atelier (palette, annuler, rétablir, Échap, raccourcis d'outil).
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      // Suppr hors outil actif et hors champ, sélection non vide : outil « Supprimer » (accord avant écriture).
      if (e.key === "Delete" && !e.ctrlKey && !e.metaKey && !e.altKey && !paletteOuverte && !estChamp(e.target) && !pilote.outilActif() && ctx.selection.lire().ids.length > 0 && registres.outils.trouver(OUTIL_SUPPRIMER)) {
        e.preventDefault();
        activer(OUTIL_SUPPRIMER);
        return;
      }
      const action = resoudreTouche({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, dansChamp: estChamp(e.target) }, table);
      if (!action) return;
      if (paletteOuverte && action.type !== "palette") return;
      switch (action.type) {
        case "palette":
          e.preventDefault();
          setPaletteOuverte((o) => !o);
          return;
        case "annuler":
        case "retablir":
          e.preventDefault();
          void historique(action.type);
          return;
        case "echap":
          if (telephone && onglet) {
            setOnglet(null);
            return;
          }
          if (pilote.outilActif()) {
            e.preventDefault();
            pilote.abandonner();
            setAnnonce("Geste abandonné, rien n'a été modifié.");
          }
          return;
        case "outil":
          e.preventDefault();
          activer(action.id);
          return;
      }
    };
    document.addEventListener("keydown", surTouche);
    return () => document.removeEventListener("keydown", surTouche);
  }, [activer, ctx.selection, historique, onglet, paletteOuverte, pilote, registres.outils, table, telephone]);

  // Une feuille ouverte au téléphone reçoit le focus (son titre).
  useEffect(() => {
    if (telephone && onglet) requestAnimationFrame(() => document.getElementById(`atl-feuille-${onglet}`)?.focus());
  }, [onglet, telephone]);

  const lNiveaux = etat ? niveaux(etat) : [];
  const niveauActif = lNiveaux.find((n) => n.id === etatVue.niveauActifId) ?? null;
  const visible = (o: OngletTelephone) => (telephone ? onglet === o : !etatVue.immersif || o === "outils");

  const teteFeuille = (o: OngletTelephone, titre: string) =>
    telephone ? (
      <div className="atl-feuille-tete">
        <h2 id={`atl-feuille-${o}`} tabIndex={-1}>
          {titre}
        </h2>
        <button type="button" aria-label={`Fermer ${titre}`} onClick={() => setOnglet(null)}>
          ✕
        </button>
      </div>
    ) : null;

  const segmentNiveaux = (
    <span className="atl-segment" role="radiogroup" aria-label="Niveau d'affichage">
      {NIVEAUX_AFFICHAGE.map((n) => (
        <button key={n} type="button" role="radio" aria-checked={etatVue.niveauAffichage === n} onClick={() => vue.modifier({ niveauAffichage: n })} data-testid={`atl-affichage-${n}`}>
          {LIBELLES_NIVEAU[n]}
        </button>
      ))}
    </span>
  );

  const barre = (disposition: "barre" | "grille") => (
    <BarreCommandes
      outils={outils}
      niveau={etatVue.niveauAffichage}
      favoris={etatVue.favoris}
      famille={famille}
      onFamille={setFamille}
      outilActif={etatVue.outilActif}
      activation={activation}
      onActiver={(id) => {
        activer(id);
        if (telephone) setOnglet(null);
      }}
      onPalette={() => setPaletteOuverte(true)}
      disposition={disposition}
    />
  );

  return (
    <div className={`atl${telephone ? " atl-tel" : ""}`} data-immersif={etatVue.immersif ? "true" : "false"} data-niveau={etatVue.niveauAffichage} data-testid="atelier-interface">
      <a className="atl-evitement" href="#atl-zone-travail">
        Aller à la zone de travail
      </a>
      <header className="atl-strip">
        <div className="atl-titre">
          <span className="atl-sous">Atelier · nouvel Atelier</span>
          <h1>
            {projet.code ? `${projet.code} — ` : ""}
            {projet.nom}
          </h1>
        </div>
        <div className="atl-actions">
          <button type="button" className="atl-recherche" aria-haspopup="dialog" onClick={() => setPaletteOuverte(true)} data-testid="atl-ouvrir-palette">
            <span aria-hidden="true">⌕</span>
            <span className="atl-txt">Rechercher une commande, un objet, une aide…</span>
            <kbd className="atl-kbd">Ctrl</kbd>
            <kbd className="atl-kbd">K</kbd>
          </button>
          {!telephone && segmentNiveaux}
          <button type="button" className="atl-sur-fonce" onClick={() => void historique("annuler")} disabled={enCoursHistorique} aria-label="Annuler (Ctrl/⌘ Z)" title="Annuler (Ctrl/⌘ Z)" data-testid="atl-annuler">
            <span aria-hidden="true">↶</span>
          </button>
          <button type="button" className="atl-sur-fonce" onClick={() => void historique("retablir")} disabled={enCoursHistorique} aria-label="Rétablir (Ctrl/⌘ Maj Z)" title="Rétablir (Ctrl/⌘ Maj Z)" data-testid="atl-retablir">
            <span aria-hidden="true">↷</span>
          </button>
          {!telephone && (
            <button type="button" className="atl-sur-fonce atl-texte" aria-pressed={etatVue.immersif} onClick={() => vue.modifier({ immersif: !etatVue.immersif })} data-testid="atl-immersif">
              Plein cadre
            </button>
          )}
        </div>
      </header>

      {telephone ? (
        <div className="atl-tel-outils">
          <button type="button" aria-pressed={etatVue.outilActif === null} onClick={() => activer(null)} aria-label="Sélection" data-testid="atl-tel-selection">
            <span aria-hidden="true">↖</span>
          </button>
          <button type="button" onClick={() => setOnglet("outils")} aria-label="Tous les outils" aria-expanded={onglet === "outils"}>
            <span aria-hidden="true">✎</span>
          </button>
        </div>
      ) : (
        <section className="atl-r-commandes" aria-label="Commandes">
          {barre("barre")}
        </section>
      )}
      <Erreurs erreurs={refusOutil} titre="Outil indisponible" testId="atl-refus-outil" />

      <div className="atl-corps">
        <section className="atl-navigateur atl-feuille" aria-label="Navigateur du projet" hidden={!visible("projet")} data-testid="atl-repere-navigateur">
          {teteFeuille("projet", "Projet") ?? <h2>Projet</h2>}
          <div className="atl-feuille-corps">
            <Navigateur etat={etat} vue={vue} etatVue={etatVue} selection={ctx.selection} sel={sel} projetId={projet.id} />
            {panneauxProjet?.()}
          </div>
        </section>

        <section className="atl-zone" aria-label="Zone de travail" data-testid="atl-repere-zone">
          <ZoneTravail pilote={pilote} vue={vue} vueTravail={etatVue.vue} niveauActif={niveauActif} enfant={zoneTravail} />
        </section>

        <section className="atl-inspecteur atl-feuille" aria-label="Inspecteur" hidden={!visible("inspecteur")} data-testid="atl-repere-inspecteur">
          {teteFeuille("inspecteur", "Inspecteur") ?? (
            <h2 id="atl-inspecteur-titre" tabIndex={-1}>
              Inspecteur
            </h2>
          )}
          <div className="atl-feuille-corps">
            <Inspecteur registre={registres.inspecteur} ctx={ctx} etat={etat} sel={sel} />
          </div>
        </section>
      </div>

      <section className="atl-panneau atl-feuille" aria-label="Modifications et problèmes" hidden={!visible("problemes")} data-ouvert={telephone || panneauOuvert ? "true" : "false"} data-testid="atl-repere-panneau">
        {teteFeuille("problemes", "Modifications et problèmes")}
        <div className="atl-feuille-corps">
          <PanneauProblemes
            projetId={projet.id}
            bus={bus}
            client={client}
            etat={etat}
            ouvert={telephone || panneauOuvert}
            onBasculer={() => setPanneauOuvert((o) => !o)}
            onAllerObjets={allerObjets}
            onAnnuler={() => void historique("annuler")}
            onRetablir={() => void historique("retablir")}
            erreursHistorique={erreursHistorique}
            enCoursHistorique={enCoursHistorique}
          />
        </div>
      </section>

      {telephone && (
        <>
          <section className="atl-feuille" aria-label="Outils" hidden={onglet !== "outils"}>
            {teteFeuille("outils", "Outils")}
            <div className="atl-feuille-corps">{barre("grille")}</div>
          </section>
          <section className="atl-feuille" aria-label="Affichage" hidden={onglet !== "affichage"}>
            {teteFeuille("affichage", "Affichage")}
            <div className="atl-feuille-corps">
              <h3>Niveau d'affichage</h3>
              {segmentNiveaux}
              <h3>Vue</h3>
              <p className="atl-muet">Plan 2D. La vue 3D arrive au lot 3b.</p>
              <h3>Niveau actif</h3>
              <p>{niveauActif ? `${niveauActif.nom} · ${niveauActif.detail}` : "Aucun niveau actif"}</p>
            </div>
          </section>
          <nav className="atl-onglets-bas" aria-label="Repères de l'Atelier">
            {ONGLETS.map((o) => {
              const badge = o.onglet === "problemes" ? bus.resume().conflits : 0;
              return (
                <button key={o.onglet} type="button" aria-expanded={onglet === o.onglet} onClick={() => setOnglet(onglet === o.onglet ? null : o.onglet)} data-testid={`atl-onglet-${o.onglet}`}>
                  <span className="atl-ico" aria-hidden="true">
                    {o.icone}
                  </span>
                  {o.libelle}
                  {badge > 0 && (
                    <span className="atl-badge">
                      {badge}
                      <span className="atl-sr"> conflit(s)</span>
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </>
      )}

      <p className="atl-sr" role="status" aria-live="polite" data-testid="atl-annonce">
        {annonce}
      </p>

      {paletteOuverte && (
        <Palette
          outils={registres.outils}
          ctx={ctx}
          etat={etat}
          favoris={etatVue.favoris}
          onChoisir={choisirPalette}
          onFavori={(id) => vue.modifier({ favoris: basculerFavori(vue.lire().favoris, id) })}
          onFermer={() => setPaletteOuverte(false)}
        />
      )}
    </div>
  );
}
