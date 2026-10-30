/**
 * Page GeoData (`/geodata`, 9ᵉ module, ADR-GEODATA-01/02) : la carte EST la page d'entrée — aucun tableau de bord, aucun
 * sélecteur de projet. Organisation inspirée de Kharita (recherche, Catalogue / Couches / Légende, fonds, fiche, table),
 * identité de Fadi. Le bandeau général de Fadi reste au-dessus ; aucune navigation de projet ici.
 *
 * Moteur MapLibre chargé à la demande ; sans WebGL (ou contexte perdu), la recherche, la table, les fiches, les cartes et
 * les études restent utilisables (GEO 11). Enregistrement explicite avec révision attendue ; conflit → recharger ou
 * enregistrer sa version comme copie (GEO 13). Téléphone : un seul panneau ouvert à la fois (GEO 12).
 *
 * Disposition (comme Kharita) : la carte occupe tout l'espace ; barre d'outils verticale à gauche ; bouton « Données »
 * qui ouvre en surimpression le catalogue rangé par catégorie (Catalogue / Couches / Légende) ; menu hamburger en haut à
 * droite (Données, Mes cartes, Études, Importer, Exporter).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { cheminOnglet, ongletDeChemin, ONGLETS_GEODATA, type OngletGeoData, type PaysTerritorial, type CleIndicateur, cleIndicateur, indicateurPourCle, unionIndicateurs, niveauxDeSelection, rangPourClics, DELAI_CLICS_MS, combinerFiltres, COMPOSITION_INITIALE, couleurCategorie, estCodeHcp, filtresNiveaux, parentHcp, rangAdministratif, type CoucheNiveau, type EtapeNiveau, type RangAdministratif, lireValeur, valeursEtiquettes, lireAdresseVue, ecrireAdresseVue, syntheseCouche, type Composition, type FiltreCouche, type StyleCouche, type ValeurIndicateur } from "@parcours/geodata-model";
import { api, ErreurGeoData, type IndicateurRecu, type ValeurRasterRecue, type CarteRecue, type RangementRecu, type Fond, type CoucheRecue, type EspaceRecu, type FicheRecue, type ResultatRecherche, type ZoneRecue, type ExportRecu } from "./client";
import { sansColorationThematique, ajouterCouche, basculerRegroupement, basculerTousRegroupements, regroupementsTousActifs, basculerEtiquettes, basculerToutesEtiquettes, basculerVisibilite, etiquettesToutesAffichees, definirFiltre, definirOpacite, definirStyle, deplacerCouche, etatDepuis, LIBELLES_ENREGISTREMENT, entreesCategories, entreesRaster, retirerCouche, type Categorie, type EtatEnregistrement } from "./composition-ops";
import { webglDisponible, type MoteurCarte, type ObjetDesigne, type OutilCarte } from "./carte/moteur";
import { FicheValeur, PanneauCatalogue, PanneauCouches, PanneauLegende, TableAttributs } from "./panneaux/consultation";
import { Etudes, Export, Import, MesCartes, type TraceEnCours } from "./panneaux/travail";
import { BarreOutilsCarte } from "./panneaux/BarreOutilsCarte";
import { BarreRecherche, type ChoixFond, type PlacementOutils } from "./panneaux/BarreRecherche";
import { PanneauCollection, useCollection, type ModeCollection } from "./panneaux/collection";
import { BarreTerritoriale } from "./panneaux/BarreTerritoriale";
import { AVIS_IMPRESSION_BLOQUEE, FicheObjet, imprimerFiche } from "./panneaux/FicheTerritoriale";
import { GestionDonnees, rangementDepuis } from "./panneaux/donnees";
import { TableauDeBord, type ZoneCarte } from "./panneaux/TableauDeBord";
import { SyntheseVue, type LigneSynthese } from "./panneaux/SyntheseVue";
import { lireFondsNavigateur } from "./fonds-navigateur";
import { composerPng, ouvrirFenetreImpression, telecharger } from "./export-png";
import "./geodata.css";

type Onglet = "catalogue" | "couches" | "legende";
type Volet = "fiche" | "valeur" | "donnees" | "cartes" | "collection" | "etudes" | "import" | "export";

const CLE_DERNIERE_CARTE = "geodata.derniere-carte";
const lireLocal = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const ecrireLocal = (k: string, v: string | null) => { try { if (v === null) window.localStorage.removeItem(k); else window.localStorage.setItem(k, v); } catch { /* stockage indisponible : simple confort perdu */ } };
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const estTelephone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches;
const empriseDe = (coords: number[][][] | undefined): [number, number, number, number] | null => {
  const ps = coords?.[0];
  if (!ps?.length) return null;
  const xs = ps.map((p) => p[0]!), ys = ps.map((p) => p[1]!);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
function empriseGeometrie(g: { type: string; coordinates: unknown }): [number, number, number, number] | null {
  const pts: number[][] = [];
  const parcourir = (x: unknown) => { if (Array.isArray(x) && typeof x[0] === "number") pts.push(x as number[]); else if (Array.isArray(x)) x.forEach(parcourir); };
  parcourir(g.coordinates);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]!), ys = pts.map((p) => p[1]!);
  return [Math.min(...xs) - 0.001, Math.min(...ys) - 0.001, Math.max(...xs) + 0.001, Math.max(...ys) + 0.001];
}

export function PageGeoData() {
  const racine = useRef<HTMLDivElement>(null);
  // Onglets de GeoData (D-GD-37) : une adresse par onglet (/geodata, /geodata/chiffres-cles…) ; la carte reste montée
  // derrière les autres onglets : couches, sélection, indicateur actif et zoom sont conservés au retour.
  const ongletPage: OngletGeoData = ongletDeChemin(useLocation().pathname);
  const [bordVisite, setBordVisite] = useState(ongletPage !== "cartes");
  useEffect(() => { if (ongletPage !== "cartes") setBordVisite(true); }, [ongletPage]);
  const conteneurCarte = useRef<HTMLDivElement>(null);
  const moteur = useRef<MoteurCarte | null>(null);
  // Composition courante lue par le moteur à sa création (chargé de façon asynchrone, après une éventuelle réouverture).
  const compositionCourante = useRef<Composition>(COMPOSITION_INITIALE);
  const [hauteurHaut, setHauteurHaut] = useState(62);
  const [espace, setEspace] = useState<EspaceRecu | null>(null);
  const [erreurEspace, setErreurEspace] = useState<string | null>(null);
  const [catalogue, setCatalogue] = useState<CoucheRecue[] | null>(null);
  const [erreurCatalogue, setErreurCatalogue] = useState<string | null>(null);
  const [couchesConnues, setCouchesConnues] = useState<Map<string, CoucheRecue>>(new Map());
  // Indicateur actif du catalogue (D-GD-31) : une clé commune à toutes les couches qui le portent ; couches où il est masqué.
  const [indicateurActif, setIndicateurActif] = useState<CleIndicateur | null>(null);
  const [indicateursMasques, setIndicateursMasques] = useState<ReadonlySet<string>>(new Set());
  const [composition, setComposition] = useState<Composition>(COMPOSITION_INITIALE);
  const [carte, setCarte] = useState<CarteRecue | null>(null);
  const [etatForce, setEtatForce] = useState<EtatEnregistrement | null>(null);
  const [valeurs, setValeurs] = useState<Map<string, Map<string, ValeurIndicateur>>>(new Map());
  const [filtres, setFiltres] = useState<Map<string, string[]>>(new Map());
  const [categories, setCategories] = useState<Map<string, Categorie[]>>(new Map());
  const [valeurPoint, setValeurPoint] = useState<{ titre: string; etat: "chargement" | "erreur" | "ok"; recue?: ValeurRasterRecue; erreur?: string } | null>(null);
  const [selection, setSelection] = useState<{ coucheId: string; code: string } | null>(null);
  // Sélection par nombre de clics (D-GD-34) : niveau sélectionné (recette) et contour d'une entité sans couche chargée.
  const [entite, setEntite] = useState<{ rang: RangAdministratif; code: string; nom: string; coucheId?: string } | null>(null);
  const [entiteContour, setEntiteContour] = useState<unknown | null>(null);
  const [fiche, setFiche] = useState<FicheRecue | null>(null);
  const [ficheEtat, setFicheEtat] = useState<{ chargement: boolean; erreur: string | null }>({ chargement: false, erreur: null });
  const [coucheTable, setCoucheTable] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("catalogue");
  const [panneauOuvert, setPanneauOuvert] = useState(() => !estTelephone());
  const [volet, setVolet] = useState<Volet | null>(null);
  const [outil, setOutil] = useState<OutilCarte>("navigation");
  const [trace, setTrace] = useState<TraceEnCours | null>(null);
  const [tracePret, setTracePret] = useState<TraceEnCours | null>(null);
  const [zones, setZones] = useState<ZoneRecue[]>([]);
  // Zone d'étude qui filtre la carte, la table et la synthèse (D-GD-41) ; codes des objets qui la recoupent, par couche.
  const [zonesLues, setZonesLues] = useState(false);
  const [zoneFiltre, setZoneFiltre] = useState<string | null>(null);
  const derniereZone = useRef<string | null>(null);
  const [codesZone, setCodesZone] = useState<{ zone: string; couches: Map<string, { codes: string[]; tronque: boolean }> } | null>(null);
  const [analysesIds, setAnalysesIds] = useState<string[]>([]);
  const [webgl] = useState(webglDisponible);
  const [erreurCarte, setErreurCarte] = useState<string | null>(webgl ? null : "WebGL n'est pas disponible dans ce navigateur : la carte ne peut pas s'afficher. La recherche, le catalogue, la table et les fiches restent utilisables.");
  const [chargementMoteur, setChargementMoteur] = useState(webgl);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [avisRecherche, setAvisRecherche] = useState<string | null>(null);
  // Recherche de la carte : barre flottante ouverte par la loupe de sa mini-barre (Alt+R) ; le texte saisi est gardé fermé.
  // Panneaux de la mini-barre (D-GD-38) : recherche (loupe), fil de navigation administrative (≡) et fonds — un seul
  // ouvert à la fois ; en ouvrir un referme l'autre sans perdre son état (texte de recherche, fil à jour). État de la page :
  // conservé quand on change d'onglet (la carte reste montée).
  const [panneauMini, setPanneauMini] = useState<"recherche" | "navigation" | "fonds" | null>(null);
  const rechercheOuverte = panneauMini === "recherche";
  const [placementOutils, setPlacementOutils] = useState<PlacementOutils | null>(null);
  const basculerPanneauMini = (q: "recherche" | "navigation" | "fonds", ouvert: boolean) => setPanneauMini((a) => (ouvert ? q : a === q ? null : a));
  const basculerRecherche = (ouverte: boolean) => { basculerPanneauMini("recherche", ouverte); if (!ouverte) { setResultats(null); setAvisRecherche(null); } };
  const [annonce, setAnnonce] = useState("");
  const [menuOuvert, setMenuOuvert] = useState(false);
  // Menu ☰ : rubrique « Cartes » dépliée (Mes cartes, Collection, Fournisseurs) ; panneau Collection et son mode ;
  // « Enregistrer sous » de Mes cartes (D-GD-36).
  const [menuCartes, setMenuCartes] = useState(false);
  const [modeCollection, setModeCollection] = useState<ModeCollection>("ouverte");
  const [enregistrerSousCarte, setEnregistrerSousCarte] = useState(false);
  const collection = useCollection();
  // Menu ☰ borné à l'écran : sa hauteur maximale suit la place restante sous son haut (téléphone, rubrique dépliée).
  const listeMenu = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const m = listeMenu.current;
    if (m) m.style.maxHeight = `${Math.max(160, window.innerHeight - m.getBoundingClientRect().top - 8)}px`;
  }, [menuOuvert, menuCartes]);
  const [rangement, setRangement] = useState<RangementRecu | null>(null);
  // Fonds des fournisseurs réglés dans Paramètres (D-GD-15), relus au retour sur la page ou après un réglage d'un autre onglet.
  const [fondsNav, setFondsNav] = useState(lireFondsNavigateur);
  const [avisFond, setAvisFond] = useState<string | null>(null);
  useEffect(() => {
    const relire = () => setFondsNav(lireFondsNavigateur());
    window.addEventListener("storage", relire);
    window.addEventListener("focus", relire);
    return () => { window.removeEventListener("storage", relire); window.removeEventListener("focus", relire); };
  }, []);
  /** Composition d'une nouvelle carte : fond du fournisseur par défaut quand il est utilisable, sinon fond neutre. */
  const compositionNeuve = (camera = COMPOSITION_INITIALE.camera): Composition => ({ ...COMPOSITION_INITIALE, camera, fond: lireFondsNavigateur().defaut ?? COMPOSITION_INITIALE.fond });
  const [erreurRangement, setErreurRangement] = useState<string | null>(null);
  // Chemin dans le découpage territorial lu en base (lot H) : pays → niveau 1 → … (aucun référentiel dans le code).
  const [chemin, setChemin] = useState<EtapeNiveau[]>([]);
  // Découpage territorial en base (lot H, D-GD-28) : pays chargés, pays courant (confort local), contour de l'unité choisie.
  const [paysListe, setPaysListe] = useState<PaysTerritorial[] | null>(null);
  const [erreurTerritoires, setErreurTerritoires] = useState<string | null>(null);
  const [paysCourant, setPaysCourant] = useState<string | null>(null);
  const [contourTerritoire, setContourTerritoire] = useState<{ contour: unknown; attribution: string } | null>(null);
  const [unitesNiveaux, setUnitesNiveaux] = useState<Map<string, { code: string; nom: string | null }[]>>(new Map());
  const [pleinEcran, setPleinEcran] = useState(false);
  // Mini-carte de situation (lot G) : confort mémorisé dans ce navigateur seulement.
  const [miniCarte, setMiniCarte] = useState(() => lireLocal("geodata.mini-carte") === "1");
  // Synthèse de la vue (D-GD-40) : ouverte ou fermée, mémorisée dans ce navigateur ; objets lus en base par couche.
  const [syntheseOuverte, setSyntheseOuverte] = useState(() => lireLocal("geodata.synthese") === "1");
  // Emprise changée sans changement de caméra (carte prête, redimensionnement) : relance la lecture de la vue.
  const [versionEmprise, setVersionEmprise] = useState(0);
  const [vues, setVues] = useState<Map<string, { cle: string; etat: "chargement" | "ok" | "erreur"; codes: string[]; total: number; tronque: boolean; erreur?: string }>>(new Map());
  const conteneurMini = useRef<HTMLDivElement>(null);

  // Plein écran de toute la page GeoData (carte, barre, panneaux) ; le canevas suit la nouvelle taille.
  useEffect(() => {
    const suivre = () => { setPleinEcran(document.fullscreenElement === racine.current); setTimeout(() => moteur.current?.redimensionner(), 50); };
    document.addEventListener("fullscreenchange", suivre);
    return () => document.removeEventListener("fullscreenchange", suivre);
  }, []);

  // Hauteur disponible sous le bandeau général de Fadi (pleine largeur, petites marges).
  useLayoutEffect(() => {
    const mesurer = () => { const t = racine.current?.getBoundingClientRect().top ?? 62; setHauteurHaut(Math.max(0, Math.round(t + window.scrollY))); };
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  }, []);

  const connaitre = useCallback((cs: CoucheRecue[]) => setCouchesConnues((m) => { const n = new Map(m); for (const c of cs) n.set(c.id, c); return n; }), []);
  const chargerCatalogue = useCallback(() => {
    setErreurCatalogue(null);
    api.catalogue().then((r) => { setCatalogue(r.couches); connaitre(r.couches); }).catch((e) => setErreurCatalogue(message(e)));
  }, [connaitre]);
  const chargerRangement = useCallback(async () => {
    try { setRangement(await api.rangement()); setErreurRangement(null); } catch (e) { setErreurRangement(message(e)); }
  }, []);
  const rangementCatalogue = useMemo(() => rangementDepuis(rangement), [rangement]);
  const chargerZones = useCallback(() => { api.zones().then((r) => { setZones(r.zones); setZonesLues(true); }).catch(() => undefined); api.analyses().then((r) => setAnalysesIds(r.analyses.map((a) => a.id))).catch(() => undefined); }, []);

  useEffect(() => {
    api.espace().then(setEspace).catch((e) => setErreurEspace(message(e)));
    chargerCatalogue();
    void chargerRangement();
    chargerZones();
    // Adresse d'une vue (D-GD-40) : elle prime sur la dernière carte ouverte dans ce navigateur.
    const adresse = lireAdresseVue(window.location.hash);
    if (adresse) void ouvrirAdresse(adresse);
    else {
      const derniere = lireLocal(CLE_DERNIERE_CARTE);
      if (derniere) void ouvrirCarte(derniere, true);
      else setComposition((c) => (c === COMPOSITION_INITIALE ? compositionNeuve() : c));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valeursDe = useCallback(async (indicateurId: string): Promise<ValeurIndicateur[]> => {
    const connu = valeurs.get(indicateurId);
    if (connu) return [...connu.values()];
    const r = await api.valeurs(indicateurId);
    const m = new Map(r.valeurs.map((v) => [v.code, lireValeur(v.valeur, v.motifAbsence)]));
    setValeurs((x) => new Map(x).set(indicateurId, m));
    return [...m.values()];
  }, [valeurs]);

  // Indicateur actif (D-GD-31, D-GD-32) : sur chaque couche chargée, l'indicateur qui porte la clé active (null si elle ne le porte pas).
  const indicateursParCouche = useMemo(() => {
    const m = new Map<string, IndicateurRecu>();
    if (!indicateurActif) return m;
    for (const k of composition.couches) {
      const c = couchesConnues.get(k.coucheId) ?? catalogue?.find((x) => x.id === k.coucheId);
      const i = c ? indicateurPourCle(c.indicateurs, indicateurActif) : null;
      if (i) m.set(k.coucheId, i);
    }
    return m;
  }, [composition, indicateurActif, couchesConnues, catalogue]);
  // Valeurs de l'indicateur actif (chargées une fois par indicateur, mémorisées par identifiant : une réponse tardive ne nuit pas).
  useEffect(() => {
    for (const i of indicateursParCouche.values()) if (!valeurs.has(i.id)) void valeursDe(i.id).catch(() => undefined);
  }, [indicateursParCouche, valeurs, valeursDe]);
  // Une couleur par entité : rangs de couleur de chaque couche concernée (chargés une fois par couche, contenu figé).
  useEffect(() => {
    for (const k of composition.couches) {
      if (k.style.mode !== "categories" || categories.has(k.coucheId)) continue;
      const id = k.coucheId;
      api.categories(id).then((r) => setCategories((m) => new Map(m).set(id, r.categories))).catch(() => undefined);
    }
  }, [composition, categories]);
  const couleursCategories = useMemo(() => new Map([...categories].map(([id, cs]) => [id, new Map(cs.map((c) => [c.code, couleurCategorie(c.rang)]))])), [categories]);
  // Filtres : codes retenus par couche (filtre appliqué à la carte comme à la table).
  useEffect(() => {
    for (const k of composition.couches) {
      if (!k.filtre) { if (filtres.has(k.coucheId)) setFiltres((f) => { const n = new Map(f); n.delete(k.coucheId); return n; }); continue; }
      api.codesFiltres(k.coucheId, k.filtre).then((r) => setFiltres((f) => new Map(f).set(k.coucheId, r.codes))).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(composition.couches.map((k) => [k.coucheId, k.filtre]))]);
  // Métadonnées des couches d'une carte ouverte qui ne seraient plus au catalogue (retirées : référence conservée).
  useEffect(() => {
    for (const k of composition.couches) if (!couchesConnues.has(k.coucheId) && carte?.disponibilite[k.coucheId]?.etat === "disponible") api.couche(k.coucheId).then((c) => connaitre([c])).catch(() => undefined);
  }, [composition, couchesConnues, carte, connaitre]);

  const fondsDisponibles = useMemo<Fond[]>(() => [...(espace?.fonds ?? []), ...fondsNav.fonds.map((f) => ({ ...f, tuiles: [...f.tuiles] }))], [espace, fondsNav]);
  const fondTrouve = fondsDisponibles.find((f) => f.id === composition.fond);
  const fond = useMemo(() => fondTrouve ?? espace?.fonds[0] ?? { id: "neutre", libelle: "Fond neutre", type: "neutre" as const, tuiles: null, attribution: "", export: true, zoomMax: null }, [fondTrouve, espace]);
  /** Choix de fonds : une seule liste, pour le sélecteur « Fond » de la barre et la liste « Fond de carte » de la mini-barre. */
  const choixFonds = useMemo<ChoixFond[]>(() => [
    ...(espace ? fondsDisponibles : [fond]).map((f) => ({ valeur: f.id, cle: f.id, libelle: f.libelle, desactive: false })),
    ...(!fondTrouve && composition.fond !== fond.id ? [{ valeur: composition.fond, cle: `indisponible:${composition.fond}`, libelle: "Fond enregistré indisponible dans ce navigateur", desactive: true }] : []),
    ...fondsNav.sansCle.map((f) => ({ valeur: "", cle: `sans-cle:${f.fournisseurId}`, libelle: `${f.nom} — clé absente (Paramètres)`, desactive: true })),
  ], [espace, fondsDisponibles, fond, fondTrouve, composition.fond, fondsNav]);
  const choisirFond = (id: string) => setComposition((c) => ({ ...c, fond: id }));
  useEffect(() => setAvisFond(null), [fond.id]);
  const disponibilite = carte?.disponibilite ?? {};
  const compositionAffichee = useMemo(() => ({ ...composition, couches: composition.couches.filter((k) => !disponibilite[k.coucheId] || disponibilite[k.coucheId]!.etat === "disponible") }), [composition, disponibilite]);
  const attributions = useMemo(() => [...new Set([...compositionAffichee.couches.filter((k) => k.visible).map((k) => couchesConnues.get(k.coucheId)?.version.attribution), contourTerritoire?.attribution].filter((x): x is string => !!x))], [compositionAffichee, couchesConnues, contourTerritoire]);
  // Couches raster (D-GD-13) connues ; référence lue par le moteur (créé une fois) au moment d'un clic.
  const rasters = useMemo(() => new Set([...couchesConnues.values()].filter((c) => c.typeGeometrie === "raster").map((c) => c.id)), [couchesConnues]);
  // Rang administratif des couches de limites (D-GD-16), lu de leur niveau ou du niveau OpenStreetMap de leur titre.
  const rangs = useMemo(() => new Map([...couchesConnues.values()].flatMap((c) => { const r = rangAdministratif(c); return r ? [[c.id, r] as const] : []; })), [couchesConnues]);
  // Codes et noms des couches de limites de la composition (lus une fois par couche ; contenu d'une version figé).
  useEffect(() => {
    for (const k of composition.couches) {
      const id = k.coucheId;
      // Couche indisponible (retirée, inaccessible) : jamais demandée ; un échec reste consigné (liste vide), sans relance.
      if (!rangs.has(id) || unitesNiveaux.has(id) || (disponibilite[id] && disponibilite[id]!.etat !== "disponible")) continue;
      const connues = categories.get(id);
      if (connues) { setUnitesNiveaux((m) => new Map(m).set(id, connues)); continue; }
      setUnitesNiveaux((m) => new Map(m).set(id, []));
      api.categories(id).then((r) => setUnitesNiveaux((m) => new Map(m).set(id, r.categories))).catch(() => undefined);
    }
  }, [composition, rangs, unitesNiveaux, categories, disponibilite]);
  const couchesNiveau = useMemo<CoucheNiveau[]>(() => composition.couches.flatMap((k) => {
    const rang = rangs.get(k.coucheId), u = unitesNiveaux.get(k.coucheId);
    return rang && u?.length ? [{ coucheId: k.coucheId, rang, codes: u.map((x) => x.code) }] : [];
  }), [composition, rangs, unitesNiveaux]);
  // Découpage territorial : lu une fois en base ; pays courant = celui mémorisé s'il est chargé, sinon le premier.
  useEffect(() => {
    api.territoires().then((r) => {
      setPaysListe(r.pays);
      const memo = lireLocal("geodata.pays");
      setPaysCourant(r.pays.find((x) => x.code === memo)?.code ?? r.pays[0]?.code ?? null);
    }).catch((e: unknown) => setErreurTerritoires(`Découpage territorial indisponible (${message(e)}).`));
  }, []);
  // Libellés (lot C, D-GD-24) : couches vectorielles admises (le nom de l'entité, indépendant de l'indicateur).
  const vectorielles = useMemo(() => new Set(composition.couches.map((k) => k.coucheId).filter((id) => !rasters.has(id))), [composition, rasters]);
  // Regroupement des points (D-GD-40) : couches de points ou mixtes de la composition.
  const couchesPoints = useMemo(() => new Set(composition.couches.map((k) => k.coucheId).filter((id) => { const t = couchesConnues.get(id)?.typeGeometrie; return t === "point" || t === "mixte"; })), [composition, couchesConnues]);
  // Valeurs affichées (D-GD-32) : la valeur abrégée de l'indicateur actif, par couche où « Afficher l'indicateur » est coché.
  const valeursAffichees = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const k of compositionAffichee.couches) {
      const i = indicateursParCouche.get(k.coucheId);
      if (!i || indicateursMasques.has(k.coucheId)) continue;
      const vs = valeurs.get(i.id);
      if (vs) m.set(k.coucheId, valeursEtiquettes(vs, i.unite));
    }
    return m;
  }, [compositionAffichee, indicateursParCouche, indicateursMasques, valeurs]);
  // Chemin venu du découpage en base (étapes sans coucheId) : il ne s'applique qu'aux couches dont la version forme ce
  // découpage — jamais à une couche d'un autre pays ou d'une autre source aux codes semblables. Chemin lu dans les couches
  // (repli, étapes avec coucheId) : comme au lot B.
  const couchesDuChemin = useMemo(() => {
    if (!chemin.length || chemin.some((e) => e.coucheId)) return couchesNiveau;
    const versions = new Set(paysListe?.find((x) => x.code === paysCourant)?.versions ?? []);
    return couchesNiveau.filter((c) => versions.has(couchesConnues.get(c.coucheId)?.version.id ?? ""));
  }, [chemin, couchesNiveau, paysListe, paysCourant, couchesConnues]);
  const zoneActive = useMemo(() => zones.find((z) => z.id === zoneFiltre && z.nature === "zone") ?? null, [zones, zoneFiltre]);
  // Zone archivée ou inconnue (adresse d'un autre espace) : le filtre est retiré une fois les zones lues.
  useEffect(() => { if (zoneFiltre && zonesLues && !zoneActive) { setZoneFiltre(null); setAnnonce("Zone d'étude introuvable : filtre de zone retiré."); } }, [zoneFiltre, zonesLues, zoneActive]);
  const cleCouchesVectorielles = [...vectorielles].sort().join(",");
  useEffect(() => {
    if (!zoneActive) { setCodesZone(null); return; }
    const zone = zoneActive.id;
    setCodesZone((c) => (c?.zone === zone ? c : { zone, couches: new Map() }));
    for (const id of vectorielles) {
      api.codesZone(id, zone)
        .then((r) => setCodesZone((c) => (c?.zone === zone ? { zone, couches: new Map(c.couches).set(id, { codes: r.codes, tronque: r.tronque }) } : c)))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneActive?.id, cleCouchesVectorielles]);
  const filtresAffiches = useMemo(() => {
    const base = combinerFiltres(filtres, filtresNiveaux(chemin, couchesDuChemin));
    if (!zoneActive || codesZone?.zone !== zoneActive.id) return base;
    return combinerFiltres(base, new Map([...codesZone.couches].map(([id, v]) => [id, v.codes])));
  }, [filtres, chemin, couchesDuChemin, zoneActive, codesZone]);
  const zonePartielle = !!codesZone && [...codesZone.couches.values()].some((v) => v.tronque);
  const filtrerZone = (id: string | null) => {
    if (id) derniereZone.current = id;
    setZoneFiltre(id);
    const z = zones.find((x) => x.id === id);
    setAnnonce(id ? `Filtre de zone d'étude : ${z?.nom ?? id}` : "Filtre de zone d'étude retiré");
  };
  /** Alt+Z : retire le filtre de zone, ou rétablit la dernière zone filtrée (sinon la zone d'étude la plus récente). */
  const basculerFiltreZone = () => {
    if (zoneFiltre) return filtrerZone(null);
    const candidates = zones.filter((z) => z.nature === "zone");
    const cible = candidates.find((z) => z.id === derniereZone.current) ?? candidates[0];
    if (!cible) return setAnnonce("Aucune zone d'étude : tracez-en une avec « Tracer une zone d'étude ».");
    filtrerZone(cible.id);
  };
  // Synthèse de la vue (D-GD-40) : couches d'objets visibles ; à chaque arrêt de la carte, objets de la vue lus en base
  // (une requête par couche, la réponse d'une vue dépassée est ignorée). Rien n'est demandé quand la synthèse est fermée.
  const couchesSynthese = useMemo(() => compositionAffichee.couches.filter((k) => k.visible && vectorielles.has(k.coucheId)), [compositionAffichee, vectorielles]);
  const jetonVue = useRef(0);
  const cleCouchesSynthese = couchesSynthese.map((k) => `${k.coucheId}@${k.versionId}`).join(",");
  useEffect(() => {
    if (!syntheseOuverte || chargementMoteur) return;
    const jeton = ++jetonVue.current;
    const minuterie = window.setTimeout(() => {
      const emprise = moteur.current?.emprise();
      if (!emprise) return;
      const cle = emprise.map((v) => v.toFixed(5)).join(",");
      setVues((m) => new Map(couchesSynthese.map((k) => [k.coucheId, { ...(m.get(k.coucheId) ?? { codes: [], total: 0, tronque: false }), cle, etat: "chargement" as const }])));
      for (const k of couchesSynthese) {
        api.vue(k.coucheId, emprise)
          .then((r) => { if (jeton === jetonVue.current) setVues((m) => new Map(m).set(k.coucheId, { cle, etat: "ok", codes: r.codes, total: r.total, tronque: r.tronque })); })
          .catch((e: unknown) => { if (jeton === jetonVue.current) setVues((m) => new Map(m).set(k.coucheId, { cle, etat: "erreur", codes: [], total: 0, tronque: false, erreur: message(e) })); });
      }
    }, 250);
    return () => window.clearTimeout(minuterie);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syntheseOuverte, chargementMoteur, composition.camera, cleCouchesSynthese, versionEmprise]);
  const lignesSynthese = useMemo<LigneSynthese[]>(() => couchesSynthese.map((k) => {
    const titre = couchesConnues.get(k.coucheId)?.titre ?? k.coucheId;
    const v = vues.get(k.coucheId);
    if (!v || v.etat !== "ok") return { coucheId: k.coucheId, titre, etat: v?.etat ?? "chargement", ...(v?.erreur ? { erreur: v.erreur } : {}) };
    const i = indicateursParCouche.get(k.coucheId) ?? null;
    const retenus = filtresAffiches.get(k.coucheId);
    const valeursI = i ? valeurs.get(i.id) : undefined;
    return {
      coucheId: k.coucheId, titre, etat: "ok", tronque: v.tronque,
      synthese: syntheseCouche({ codes: v.codes, total: v.total, retenus: retenus ? new Set(retenus) : null, valeurs: i ? valeursI ?? new Map() : null }),
      indicateur: i ? { titre: i.titre, unite: i.unite } : null,
    };
  }), [couchesSynthese, couchesConnues, vues, indicateursParCouche, filtresAffiches, valeurs]);
  const rastersCourants = useRef<{ rasters: Set<string>; couches: Map<string, CoucheRecue> }>({ rasters, couches: couchesConnues });
  rastersCourants.current = { rasters, couches: couchesConnues };
  /**
   * Sélection par nombre de clics (D-GD-34) : 1 clic → le niveau le plus élémentaire, chaque clic rapide suivant → le
   * niveau au-dessus. Couches de limites visibles : seuls leurs niveaux comptent, l'entité du premier clic est celle
   * touchée dans la couche du plus petit niveau, ses parents viennent de la hiérarchie des codes HCP lue en base
   * (`ancetres`), jamais d'un test géométrique. Carte vierge (aucune couche de limites) : les unités du découpage en base
   * qui contiennent le point, affichées seules (contour et mise en évidence), sans ajouter de couche. Un clic hors de
   * toute entité efface la sélection. Les clics d'un outil actif ne passent jamais ici (moteur).
   */
  interface SerieSelection { niveaux: RangAdministratif[]; unites: Map<number, { code: string; nom: string; coucheId: string; pays: string | null; enCouche: boolean }>; attendu: number; jeton: number }
  const serie = useRef<SerieSelection | null>(null);
  const jetons = useRef(0);
  // Téléphone : la fiche recouvre la carte ; elle n'est ouverte qu'une fois la série de clics terminée, pour que les clics
  // suivants atteignent encore la carte. La sélection (mise en évidence) reste immédiate.
  const ficheDifferee = useRef<number | null>(null);
  const annulerFicheDifferee = () => { if (ficheDifferee.current !== null) { window.clearTimeout(ficheDifferee.current); ficheDifferee.current = null; } };
  const contexteClic = useRef({ rangs, paysListe, paysCourant });
  contexteClic.current = { rangs, paysListe, paysCourant };
  const effacerSelection = () => { annulerFicheDifferee(); serie.current = null; setSelection(null); setEntite(null); setEntiteContour(null); };
  const appliquerNiveau = (s: SerieSelection, rang: RangAdministratif) => {
    const u = s.unites.get(rang);
    if (!u) return;
    setEntite({ rang, code: u.code, nom: u.nom, coucheId: u.coucheId });
    setAnnonce(`Sélection : ${u.nom || u.code}`);
    if (u.enCouche) { setSelection({ coucheId: u.coucheId, code: u.code }); setEntiteContour(null); }
    else {
      setSelection(null);
      if (u.pays) api.uniteTerritoriale(u.pays, u.code, rang).then((r) => { if (serie.current === s && s.unites.get(rangPourClics(s.niveaux, s.attendu) ?? rang) === u) setEntiteContour(r.contour); }).catch(() => undefined);
    }
    annulerFicheDifferee();
    if (estTelephone()) ficheDifferee.current = window.setTimeout(() => { ficheDifferee.current = null; if (serie.current === s) void ouvrirFiche(u.coucheId, u.code); }, DELAI_CLICS_MS + 50);
    else void ouvrirFiche(u.coucheId, u.code);
  };
  const clicCarte = (objets: readonly ObjetDesigne[], p: { lon: number; lat: number }, nbClics: number) => {
    const { rangs: rangsConnus, paysListe: pays, paysCourant: paysClic } = contexteClic.current;
    const composition = compositionCourante.current;
    const { rasters: rs, couches } = rastersCourants.current;
    const visibles = composition.couches.filter((k) => k.visible);
    const admin = visibles.flatMap((k) => { const r = rangsConnus.get(k.coucheId); return r && r <= 3 ? [{ k, rang: r }] : []; });
    if (nbClics > 1) {
      // Clic suivant d'une série : le niveau au-dessus, dès que ses parents sont connus (sinon à leur arrivée).
      const s = serie.current;
      if (!s) return;
      s.attendu = nbClics;
      const rang = rangPourClics(s.niveaux, nbClics);
      if (rang && s.unites.has(rang)) appliquerNiveau(s, rang);
      return;
    }
    // Premier clic : toute fiche différée d'une série précédente est abandonnée.
    annulerFicheDifferee();
    // Un objet d'une couche qui n'est pas une limite administrative (point d'intérêt, ligne…) garde la sélection simple.
    const autre = objets.find((o) => !admin.some((a) => a.k.coucheId === o.coucheId));
    if (autre) { serie.current = null; setEntite(null); setEntiteContour(null); setSelection(autre); void ouvrirFiche(autre.coucheId, autre.code); return; }
    const jeton = ++jetons.current;
    if (admin.length) {
      const niveaux = niveauxDeSelection(admin.map((a) => a.rang), []);
      const rang0 = niveaux[0]!;
      const o = objets.find((x) => admin.some((a) => a.rang === rang0 && a.k.coucheId === x.coucheId));
      if (!o) { effacerSelection(); return; }
      const s: SerieSelection = { niveaux, unites: new Map([[rang0, { code: o.code, nom: "", coucheId: o.coucheId, pays: null, enCouche: true }]]), attendu: 1, jeton };
      serie.current = s;
      appliquerNiveau(s, rang0);
      if (niveaux.length < 2) return;
      const versionId = composition.couches.find((k) => k.coucheId === o.coucheId)?.versionId;
      if (!versionId) return;
      api.uniteTerritorialeDeVersion(versionId, o.code, rang0).then((u) => {
        if (serie.current !== s) return;
        s.unites.set(rang0, { ...s.unites.get(rang0)!, nom: u.nom });
        for (const a of u.ancetres) {
          const couche = admin.find((x) => x.rang === a.rang);
          if (couche) s.unites.set(a.rang, { code: a.code, nom: a.nom, coucheId: couche.k.coucheId, pays: null, enCouche: true });
        }
        const rang = rangPourClics(niveaux, s.attendu);
        if (s.attendu > 1 && rang && rang !== rang0) appliquerNiveau(s, rang);
      }).catch(() => undefined);
      return;
    }
    // Aucune couche de limites : une couche raster visible garde la lecture de sa valeur au point (D-GD-13).
    const haut = [...composition.couches].reverse().find((k) => k.visible && rs.has(k.coucheId));
    if (haut) { effacerSelection(); void ouvrirValeur(haut.coucheId, couches.get(haut.coucheId)?.titre ?? haut.coucheId, p); return; }
    // Carte vierge : les unités du pays courant (barre territoriale) qui contiennent le point ; hors du pays, aucune sélection.
    const niveauxBase = (pays ?? []).filter((x) => x.code === paysClic).flatMap((x) => x.niveaux.map((n) => n.rang as RangAdministratif));
    if (!paysClic || !niveauxDeSelection([], niveauxBase).length) { effacerSelection(); return; }
    const s: SerieSelection = { niveaux: [], unites: new Map(), attendu: 1, jeton };
    serie.current = s;
    api.unitesAuPoint(paysClic, p.lon, p.lat).then((r) => {
      if (serie.current !== s) return;
      const us = r.unites.filter((u) => u.rang <= 3);
      if (!us.length) { effacerSelection(); return; }
      s.niveaux = niveauxDeSelection([], us.map((u) => u.rang as RangAdministratif));
      for (const u of us) if (!s.unites.has(u.rang)) s.unites.set(u.rang, { code: u.code, nom: u.nom, coucheId: u.coucheId, pays: u.pays, enCouche: false });
      const rang = rangPourClics(s.niveaux, s.attendu);
      if (rang) appliquerNiveau(s, rang);
    }).catch(() => { if (serie.current === s) effacerSelection(); });
  };
  const clicRef = useRef(clicCarte);
  clicRef.current = clicCarte;
  const zonesGeo = useMemo(() => ({ type: "FeatureCollection" as const, features: zones.map((z) => ({ type: "Feature", properties: { id: z.id, nom: z.nom }, geometry: z.geometrie })) }), [zones]);

  // Moteur : créé une fois, à la demande (import dynamique).
  useEffect(() => {
    if (!webgl || !conteneurCarte.current) return;
    let detruit = false;
    import("./carte/moteur-maplibre").then(({ creerMoteur }) => {
      if (detruit || !conteneurCarte.current) return;
      try {
        moteur.current = creerMoteur(conteneurCarte.current, compositionCourante.current, {
          surEmprise: () => setVersionEmprise((n) => n + 1),
          surDeplacement: (camera) => setComposition((c) => (c.camera.lon === camera.lon && c.camera.lat === camera.lat && c.camera.zoom === camera.zoom && c.camera.cap === camera.cap ? c : { ...c, camera })),
          surClic: (objets, p, nbClics) => clicRef.current(objets, p, nbClics),
          surTrace: (o, s) => setTrace({ outil: o, sommets: [...s] }),
          surTraceTermine: (o, s) => { setTrace({ outil: o, sommets: [...s] }); if (o === "zone" || o === "annotation") setTracePret({ outil: o, sommets: [...s] }); },
          surErreur: (m) => setErreurCarte(m),
          surErreurFond: (m) => setAvisFond(m),
        });
        setChargementMoteur(false);
      } catch (e) {
        setErreurCarte(`La carte n'a pas pu démarrer (${message(e)}). La recherche, la table et les fiches restent utilisables.`);
        setChargementMoteur(false);
      }
    }).catch(() => { setErreurCarte("Le moteur cartographique n'a pas pu être chargé (réseau ?). La recherche, la table et les fiches restent utilisables."); setChargementMoteur(false); });
    // Une animation de chargement ne reste jamais affichée indéfiniment.
    const garde = setTimeout(() => setChargementMoteur(false), 15_000);
    return () => { detruit = true; clearTimeout(garde); moteur.current?.detruire(); moteur.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [webgl]);

  useEffect(() => {
    moteur.current?.appliquer(compositionAffichee, fond, { valeurs, categories: couleursCategories, rangs, rasters, filtres: filtresAffiches, selection, zones: zonesGeo, attributions, valeursAffichees });
  }, [compositionAffichee, fond, valeurs, couleursCategories, rangs, rasters, filtresAffiches, selection, zonesGeo, attributions, valeursAffichees, chargementMoteur]);
  useEffect(() => { moteur.current?.definirOutil(outil); setTrace(null); setTracePret(null); }, [outil, chargementMoteur]);

  compositionCourante.current = composition;
  const etat: EtatEnregistrement = etatForce ?? etatDepuis(composition, carte?.composition ?? null);
  // État de la carte dans l'adresse (D-GD-40) : caméra, carte ouverte, couches et indicateur actif, réécrits sans ajouter
  // d'entrée à l'historique ; seulement sur l'onglet de la carte, une fois la page initialisée (le fragment d'arrivée
  // est lu d'abord).
  const adresseLue = useRef(false);
  useEffect(() => {
    if (ongletPage !== "cartes") return;
    if (!adresseLue.current) { adresseLue.current = true; if (window.location.hash && composition === COMPOSITION_INITIALE) return; }
    const fragment = ecrireAdresseVue({
      camera: composition.camera, carteId: carte?.id ?? null, indicateur: indicateurActif, zoneId: zoneFiltre,
      couches: carte ? [] : composition.couches.map((k) => ({ coucheId: k.coucheId, versionId: k.versionId, visible: k.visible, regrouper: !!k.regrouper })),
    });
    const adresse = `${window.location.pathname}${window.location.search}#${fragment}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== adresse) window.history.replaceState(window.history.state, "", adresse);
  }, [ongletPage, composition, carte?.id, indicateurActif, zoneFiltre]);

  async function ouvrirValeur(coucheId: string, titre: string, p: { lon: number; lat: number }) {
    setVolet("valeur");
    setValeurPoint({ titre, etat: "chargement" });
    try { setValeurPoint({ titre, etat: "ok", recue: await api.valeurRaster(coucheId, Number(p.lon.toFixed(6)), Number(p.lat.toFixed(6))) }); }
    catch (e) { setValeurPoint({ titre, etat: "erreur", erreur: message(e) }); }
  }

  async function ouvrirFiche(coucheId: string, code: string) {
    setVolet("fiche");
    if (estTelephone()) setPanneauOuvert(false);
    setFicheEtat({ chargement: true, erreur: null });
    try { setFiche(await api.fiche(coucheId, code)); setFicheEtat({ chargement: false, erreur: null }); }
    catch (e) { setFiche(null); setFicheEtat({ chargement: false, erreur: message(e) }); }
  }

  async function ouvrirCarte(id: string, silencieux = false) {
    try {
      const recue = await api.carte(id);
      // Une carte enregistrée avant D-GD-32 peut porter une coloration thématique : elle n'est plus rendue (couleur unie).
      const c = { ...recue, composition: sansColorationThematique(recue.composition) };
      setCarte(c); setComposition(c.composition); setEtatForce(null);
      ecrireLocal(CLE_DERNIERE_CARTE, c.id);
      moteur.current?.allerA({ lon: c.composition.camera.lon, lat: c.composition.camera.lat, zoom: c.composition.camera.zoom, cap: c.composition.camera.cap });
      setAnnonce(`Carte « ${c.nom} » ouverte.`);
    } catch (e) {
      if (silencieux && e instanceof ErreurGeoData && e.statut === 404) ecrireLocal(CLE_DERNIERE_CARTE, null);
      else if (!silencieux) setAnnonce(message(e));
    }
  }

  /**
   * Vue rouverte depuis son adresse (D-GD-40) : carte enregistrée (ses couches et styles font foi, la caméra du lien
   * s'applique), sinon couches du lien avec leur version figée et le style par défaut de la couche ; caméra et indicateur
   * actif. Une couche refusée par le serveur (privée d'un autre espace, retirée) est écartée et signalée.
   */
  async function ouvrirAdresse(a: NonNullable<ReturnType<typeof lireAdresseVue>>) {
    const camera = a.camera;
    const placer = () => { if (camera) { setComposition((c) => ({ ...c, camera })); moteur.current?.allerA({ lon: camera.lon, lat: camera.lat, zoom: camera.zoom, cap: camera.cap }); } };
    if (a.indicateur) setIndicateurActif(a.indicateur);
    if (a.zoneId) { derniereZone.current = a.zoneId; setZoneFiltre(a.zoneId); }
    if (a.carteId) { await ouvrirCarte(a.carteId); placer(); return; }
    let c = compositionNeuve(camera ?? undefined);
    const recues = await Promise.all(a.couches.map((k) => api.couche(k.coucheId).catch(() => null)));
    const refusees = a.couches.filter((_, i) => !recues[i]).length;
    recues.forEach((r, i) => {
      const k = a.couches[i]!;
      if (!r) return;
      connaitre([r]);
      c = ajouterCouche(c, r.id, k.versionId, r.styleDefaut);
      if (!k.visible) c = basculerVisibilite(c, r.id);
      if (k.regrouper) c = basculerRegroupement(c, r.id);
    });
    setCarte(null); setComposition(c); setEtatForce(null);
    placer();
    setAnnonce(refusees ? `Vue ouverte depuis son adresse ; ${refusees} couche(s) inaccessible(s) écartée(s).` : "Vue ouverte depuis son adresse.");
  }

  /** Enregistrer impossible (enregistrement en cours, ou rien à enregistrer) : même condition partout (barre, mini-barre, menu). */
  const enregistrementImpossible = etat.etat === "enregistrement" || etat.etat === "enregistree";
  /** Nouvelle carte : composition neuve (caméra gardée), plus de carte ouverte ; même fonction pour Mes cartes et le menu. */
  function nouvelleCarte() { setCarte(null); setComposition(compositionNeuve(composition.camera)); setEtatForce(null); ecrireLocal(CLE_DERNIERE_CARTE, null); }

  async function enregistrer() {
    // Carte jamais enregistrée : la saisie du titre s'ouvre et referme le panneau de la mini-barre ouvert.
    if (!carte) { setPanneauMini(null); setResultats(null); setAvisRecherche(null); setVolet("cartes"); if (estTelephone()) setPanneauOuvert(false); return; }
    setEtatForce({ etat: "enregistrement" });
    try {
      const c = await api.reviserCarte(carte.id, { revisionAttendue: carte.revision, composition });
      setCarte(c); setComposition(c.composition); setEtatForce(null);
      setAnnonce("Carte enregistrée.");
    } catch (e) {
      if (e instanceof ErreurGeoData && e.code === "revision_conflict") setEtatForce({ etat: "conflit", revisionCourante: Number(e.corps["revisionCourante"]) });
      else setEtatForce({ etat: "erreur", message: message(e) });
    }
  }

  async function lancerRecherche() {
    const q = recherche.trim();
    if (q.length < 2) return;
    setAvisRecherche(null);
    try {
      const r = await api.rechercher(q);
      setResultats(r.resultats);
      if (r.avertissement) setAvisRecherche(r.avertissement.message);
      else if (!r.resultats.length) setAvisRecherche("Aucun résultat dans les couches consultables. Pour des coordonnées, écrivez « lon -7.6 lat 33.5 ».");
    } catch (e) { setAvisRecherche(message(e)); setResultats([]); }
  }

  function choisirResultat(r: ResultatRecherche) {
    setResultats(null);
    if (r.type === "coordonnees") { moteur.current?.allerA({ lon: r.point.lon, lat: r.point.lat, zoom: 12 }); setAnnonce(`Carte centrée sur ${r.libelle}.`); return; }
    const e = empriseDe(r.emprise.coordinates);
    if (e) moteur.current?.allerA({ emprise: e });
    const c = couchesConnues.get(r.coucheId);
    if (c && !composition.couches.some((k) => k.coucheId === c.id)) setComposition((x) => ajouterCouche(x, c.id, c.version.id, c.styleDefaut));
    setSelection({ coucheId: r.coucheId, code: r.code });
    void ouvrirFiche(r.coucheId, r.code);
  }

  /**
   * Barre territoriale (lot H) : une unité du découpage en base devient le niveau courant — chemin = ses ancêtres puis
   * elle, carte cadrée sur son emprise, contour tracé ; les couches à codes du même découpage sont filtrées (lot B).
   */
  async function allerUnite(code: string, rang?: number, versionId?: string): Promise<boolean> {
    if (!versionId && !paysCourant) return false;
    try {
      // Depuis une fiche, l'unité est retrouvée par la version de sa couche : son pays peut différer du pays affiché.
      const u = versionId ? await api.uniteTerritorialeDeVersion(versionId, code, rang) : await api.uniteTerritoriale(paysCourant!, code, rang);
      if (u.pays !== paysCourant) { setPaysCourant(u.pays); ecrireLocal("geodata.pays", u.pays); }
      setChemin([...u.ancetres, u].map((e) => ({ coucheId: "", rang: e.rang as RangAdministratif, code: e.code, nom: e.nom })));
      setContourTerritoire({ contour: u.contour, attribution: u.attribution });
      moteur.current?.allerA({ emprise: u.emprise as [number, number, number, number] });
      setAnnonce(`Niveau : ${u.nom}`);
      return true;
    } catch (e) {
      setAnnonce(message(e));
      return false;
    }
  }
  /** Retour au pays entier : chemin vide, contour retiré, carte cadrée sur l'ensemble du premier niveau. */
  async function allerAuPays() {
    setChemin([]);
    setContourTerritoire(null);
    const p = paysListe?.find((x) => x.code === paysCourant);
    setAnnonce(`Niveau : ${p?.nom ?? ""}`);
    if (!paysCourant) return;
    try {
      const { unites } = await api.unitesTerritoriales(paysCourant, null);
      if (!unites.length) return;
      const e = unites.reduce<[number, number, number, number]>((m, u) => [Math.min(m[0], u.emprise[0]), Math.min(m[1], u.emprise[1]), Math.max(m[2], u.emprise[2]), Math.max(m[3], u.emprise[3])], [...unites[0]!.emprise] as [number, number, number, number]);
      moteur.current?.allerA({ emprise: e });
    } catch { /* cadrage seulement */ }
  }
  /**
   * Remonter à une longueur de chemin donnée. Une étape venue du découpage en base est rejouée par la base (contour,
   * emprise) ; une étape lue dans les couches (repli du lot B), ou une base qui ne répond plus, ramène au chemin tronqué,
   * cadré sur l'emprise de l'entité : « Retour » a toujours un effet.
   */
  async function remonterA(longueur: number) {
    if (longueur <= 0) { await allerAuPays(); return; }
    const cible = chemin[longueur - 1]!;
    if (!cible.coucheId && (await allerUnite(cible.code, cible.rang))) return;
    setChemin(chemin.slice(0, longueur));
    setContourTerritoire(null);
    setAnnonce(`Niveau : ${cible.nom}`);
    if (cible.coucheId) {
      try { const f = await api.fiche(cible.coucheId, cible.code); const em = empriseDe(f.emprise.coordinates); if (em) moteur.current?.allerA({ emprise: em }); } catch { /* cadrage seulement */ }
    }
  }
  /** Choix dans la barre : `index` = niveau (0 = premier) ; code null = revenir au niveau au-dessus de ce rang. */
  function choisirTerritoire(index: number, code: string | null) {
    if (code) { void allerUnite(code, paysListe?.find((x) => x.code === paysCourant)?.niveaux[index]?.rang); return; }
    void remonterA(index);
  }
  function changerPays(code: string) {
    setPaysCourant(code);
    ecrireLocal("geodata.pays", code);
    setChemin([]);
    setContourTerritoire(null);
  }
  // Producteur des valeurs (avant « ; contours : … ») : les couches HCP d'un niveau à l'autre ont des contours différents.
  const producteurPrincipal = (c: CoucheRecue) => c.version.source.producteur.split(";")[0]!.trim();
  /** Couche du rang inférieur : dans la composition, sinon au catalogue, du même producteur (ajoutée alors à la carte). */
  function coucheEnfant(f: FicheRecue, rang: RangAdministratif): { id: string; aAjouter: CoucheRecue | null } | null {
    // Couche de la carte au rang inférieur, du même producteur des valeurs (une couche geoBoundaries n'est pas la suite
    // d'une couche du HCP : ses codes ne sont pas ceux du HCP).
    const dans = composition.couches.find((k) => { const c = couchesConnues.get(k.coucheId); return rangs.get(k.coucheId) === rang + 1 && !!c && producteurPrincipal(c) === producteurPrincipal(f.couche); });
    if (dans) return { id: dans.coucheId, aAjouter: null };
    const c = catalogue?.find((x) => x.typeGeometrie !== "raster" && rangAdministratif(x) === rang + 1 && producteurPrincipal(x) === producteurPrincipal(f.couche));
    return c ? { id: c.id, aAjouter: c } : null;
  }
  /** Couche des arrondissements du même producteur (fiche d'une commune : chiffres de ses arrondissements). */
  const coucheArrondissementsDe = (f: FicheRecue) => catalogue?.find((x) => x.typeGeometrie !== "raster" && rangAdministratif(x) === 4 && producteurPrincipal(x) === producteurPrincipal(f.couche)) ?? null;
  const rangDe = (f: FicheRecue | null) => (f ? rangs.get(f.couche.id) ?? rangAdministratif(f.couche) : null);
  /** Nom (pluriel) du niveau sous celui de l'entité, lu dans le découpage en base du pays dont la version fait partie — jamais dans le code. */
  const nomNiveauEnfant = (f: FicheRecue, rang: RangAdministratif): string | null => {
    const pays = paysListe?.find((x) => x.versions.includes(f.couche.version.id)) ?? paysListe?.find((x) => x.code === paysCourant);
    const n = pays?.niveaux.find((x) => x.rang === rang + 1)?.pluriel;
    return n ? n.charAt(0).toLowerCase() + n.slice(1) : null;
  };
  const descentePossible = (f: FicheRecue | null): RangAdministratif | null => {
    const r = rangDe(f);
    return f && r && r < 4 && estCodeHcp(f.code) && coucheEnfant(f, r) ? r : null;
  };
  /** Chemin complet jusqu'à une entité : ses ancêtres sont retrouvés par les codes HCP des couches de la carte. */
  function cheminVers(e: EtapeNiveau): EtapeNiveau[] {
    const etapes = [e];
    let courant = e;
    while (courant.rang > 1) {
      const rang = (courant.rang - 1) as RangAdministratif;
      const couche = couchesNiveau.find((c) => c.rang === rang);
      if (!couche) break;
      const p = parentHcp(courant.code, courant.rang, new Set(couche.codes));
      if (!p) break;
      const nom = unitesNiveaux.get(couche.coucheId)?.find((u) => u.code === p)?.nom ?? p;
      courant = { coucheId: couche.coucheId, rang, code: p, nom };
      etapes.unshift(courant);
    }
    return etapes;
  }
  function descendre(f: FicheRecue) {
    const r = descentePossible(f);
    if (!r) return;
    const enfant = coucheEnfant(f, r)!;
    if (enfant.aAjouter) { const c = enfant.aAjouter; connaitre([c]); setComposition((x) => ajouterCouche(x, c.id, c.version.id, c.styleDefaut)); }
    if (!composition.couches.some((k) => k.coucheId === f.couche.id)) setComposition((x) => ajouterCouche(x, f.couche.id, f.couche.version.id, f.couche.styleDefaut));
    // L'entité est cherchée dans le découpage en base (barre territoriale) ; à défaut, le chemin se lit des couches.
    void allerUnite(f.code, r, f.couche.version.id).then((trouvee) => {
      if (trouvee) return;
      const e: EtapeNiveau = { coucheId: f.couche.id, rang: r, code: f.code, nom: f.nom ?? f.code };
      setChemin(cheminVers(e));
      const em = empriseDe(f.emprise.coordinates);
      if (em) moteur.current?.allerA({ emprise: em });
      setAnnonce(`Niveau : ${e.nom}`);
    });
  }
  const remonter = () => { if (chemin.length) void remonterA(chemin.length - 1); };
  // Raccourcis de la navigation par niveaux, sur toute la page (le focus peut être sur le corps après un clic) :
  // Alt+↑ remonte, Alt+↓ descend dans l'entité de la fiche ouverte ; jamais pendant une saisie.
  const raccourcisNiveaux = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);
  raccourcisNiveaux.current = (e) => {
    if (e.altKey && (e.key === "p" || e.key === "P" || e.code === "KeyP") && volet === "fiche" && fiche) { e.preventDefault(); if (!imprimerFiche()) setAnnonce(AVIS_IMPRESSION_BLOQUEE); return; }
    const cible = e.target as HTMLElement | null;
    const saisie = !!cible?.closest("input, select, textarea, [contenteditable='true']");
    // Alt+M : mini-carte de situation ; Alt+I : impression directe de la carte (boutons de la barre d'outils).
    if (e.altKey && (e.key === "m" || e.key === "M" || e.code === "KeyM") && !saisie && !erreurCarte) { e.preventDefault(); basculerMiniCarte(); return; }
    if (e.altKey && (e.key === "i" || e.key === "I" || e.code === "KeyI") && !saisie && !erreurCarte) { e.preventDefault(); imprimerCarte(); return; }
    // Alt+R : barre de recherche de la carte ouverte ou fermée (loupe de la mini-barre) ; aussi depuis son propre champ.
    if (e.altKey && (e.key === "r" || e.key === "R" || e.code === "KeyR") && (!saisie || !!cible?.closest("[data-gd-recherche-flottante]"))) { e.preventDefault(); basculerRecherche(!rechercheOuverte); return; }
    // Alt+L : libellés de la carte affichés ou masqués (bouton « Libellés » de la barre d'outils).
    if (e.altKey && (e.key === "l" || e.key === "L" || e.code === "KeyL") && !cible?.closest("input, select, textarea, [contenteditable='true']")) { e.preventDefault(); basculerLibelles(); return; }
    // Lecture de l'emprise (D-GD-40) : Alt+V synthèse de la vue, Alt+G regroupement des points, Alt+K adresse de la vue.
    if (e.altKey && (e.key === "v" || e.key === "V" || e.code === "KeyV") && !saisie && !erreurCarte) { e.preventDefault(); basculerSynthese(); return; }
    if (e.altKey && (e.key === "g" || e.key === "G" || e.code === "KeyG") && !saisie && !erreurCarte) { e.preventDefault(); basculerRegroupements(); return; }
    if (e.altKey && (e.key === "k" || e.key === "K" || e.code === "KeyK") && !saisie) { e.preventDefault(); void copierLien(); return; }
    // Alt+Z : filtre de zone d'étude retiré ou rétabli (D-GD-41).
    if (e.altKey && (e.key === "z" || e.key === "Z" || e.code === "KeyZ") && !saisie) { e.preventDefault(); basculerFiltreZone(); return; }
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    if (cible?.closest("input, select, textarea, [contenteditable='true']")) return;
    if (e.key === "ArrowUp" && chemin.length) { e.preventDefault(); remonter(); }
    if (e.key === "ArrowDown" && volet === "fiche" && fiche && descentePossible(fiche)) { e.preventDefault(); descendre(fiche); }
  };
  useEffect(() => {
    const ecouter = (e: globalThis.KeyboardEvent) => raccourcisNiveaux.current(e);
    window.addEventListener("keydown", ecouter);
    return () => window.removeEventListener("keydown", ecouter);
  }, []);

  const changerStyle = (id: string, s: StyleCouche) => setComposition((c) => definirStyle(c, id, s));
  /** Réunion des indicateurs des couches vectorielles du catalogue (rubrique « Indicateurs », D-GD-31). */
  const indicateursCatalogue = useMemo(() => unionIndicateurs((catalogue ?? []).filter((c) => c.typeGeometrie !== "raster")), [catalogue]);
  /**
   * Choix d'un indicateur dans la rubrique du catalogue (D-GD-31, D-GD-32) : il devient actif sur toutes les couches chargées
   * qui le portent, valeurs affichées (case « Afficher l'indicateur » cochée) ; la coloration des couches ne change jamais.
   */
  const choisirIndicateur = (i: IndicateurRecu) => {
    setIndicateurActif(cleIndicateur(i));
    setIndicateursMasques(new Set());
    setAnnonce(`Indicateur « ${i.titre} » actif : ses valeurs s'affichent sur les couches qui le portent.`);
  };
  /** Case « Afficher l'indicateur » d'une couche : décochée, les valeurs sont masquées, l'indicateur reste mémorisé. */
  const afficherIndicateur = (id: string, afficher: boolean) => setIndicateursMasques((m) => { const n = new Set(m); if (afficher) n.delete(id); else n.add(id); return n; });
  // Une couche retirée (ou une nouvelle carte) oublie son masquage : rechargée, elle repart avec la case cochée.
  useEffect(() => {
    const presentes = new Set(composition.couches.map((k) => k.coucheId));
    if ([...indicateursMasques].some((id) => !presentes.has(id))) setIndicateursMasques(new Set([...indicateursMasques].filter((id) => presentes.has(id))));
  }, [composition, indicateursMasques]);
  const ouvrirVolet = (v: Volet) => { setVolet(volet === v ? null : v); if (estTelephone()) setPanneauOuvert(false); };
  const ouvrirOnglet = (o: Onglet) => { setOnglet(o); setPanneauOuvert(true); if (estTelephone()) setVolet(null); };
  // Bouton « Données » (sur la carte et dans le menu) : ouvre le catalogue rangé par catégorie, ou referme le panneau.
  const basculerDonnees = () => { if (panneauOuvert && onglet === "catalogue") setPanneauOuvert(false); else ouvrirOnglet("catalogue"); };
  const basculerLibelles = () => {
    const avant = etiquettesToutesAffichees(composition, vectorielles);
    if (!composition.couches.some((k) => k.visible && vectorielles.has(k.coucheId))) return;
    setComposition((c) => basculerToutesEtiquettes(c, vectorielles));
    setAnnonce(avant ? "Libellés masqués" : "Libellés affichés");
  };
  const basculerLegende = () => { if (panneauOuvert && onglet === "legende") setPanneauOuvert(false); else ouvrirOnglet("legende"); };
  const choisirOutil = (o: OutilCarte) => { setOutil(o); if (o !== "navigation") { setVolet("etudes"); if (estTelephone()) setPanneauOuvert(false); } };
  const localiser = () => {
    if (!navigator.geolocation) return setAnnonce("Localisation indisponible dans ce navigateur.");
    navigator.geolocation.getCurrentPosition((pos) => moteur.current?.allerA({ lon: pos.coords.longitude, lat: pos.coords.latitude, zoom: 13 }), () => setAnnonce("Localisation refusée ou indisponible."), { timeout: 10_000 });
  };
  const basculerPleinEcran = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else if (racine.current?.requestFullscreen) racine.current.requestFullscreen().catch(() => setAnnonce("Le plein écran est refusé par ce navigateur."));
    else setAnnonce("Le plein écran est indisponible dans ce navigateur.");
  };
  const LIBELLES_VOLETS: Record<"donnees" | "cartes" | "etudes" | "import" | "export", string> = { donnees: "Données", cartes: "Mes cartes", etudes: "Études", import: "Importer", export: "Exporter" };
  /** Ouvre un volet (sans bascule) ; sur téléphone, un seul panneau à la fois. */
  const afficherVolet = (v: Volet) => { setVolet(v); if (estTelephone()) setPanneauOuvert(false); };
  const ouvrirCollection = (m: ModeCollection) => { setModeCollection(m); afficherVolet("collection"); };
  const enregistrerCollection = async () => { try { await collection.enregistrer(); setAnnonce("Collection enregistrée."); } catch (e) { setAnnonce(message(e)); } };
  /**
   * Rubrique « Cartes » du menu ☰ (D-GD-36) : chaque entrée appelle une fonction existante ; une entrée sans fonction
   * existante est affichée désactivée, « bientôt » (aucun comportement inventé).
   */
  const MENU_CARTES: { cle: string; titre: string; entrees: { cle: string; libelle: string; action?: () => void; desactive?: boolean; volet?: string }[] }[] = [
    { cle: "mes-cartes", titre: "Mes cartes", entrees: [
      { cle: "nouveau", libelle: "Nouveau", action: () => { nouvelleCarte(); setAnnonce("Nouvelle carte."); } },
      { cle: "ouvrir", libelle: "Ouvrir", action: () => { setEnregistrerSousCarte(false); afficherVolet("cartes"); }, volet: "cartes" },
      { cle: "partager", libelle: "Partager" },
      { cle: "enregistrer", libelle: "Enregistrer", action: () => void enregistrer(), desactive: enregistrementImpossible },
      { cle: "enregistrer-sous", libelle: "Enregistrer sous", action: () => { setEnregistrerSousCarte(!!carte); afficherVolet("cartes"); } },
    ] },
    { cle: "collection", titre: "Collection", entrees: [
      { cle: "nouveau", libelle: "Nouveau", action: () => ouvrirCollection("nouveau") },
      { cle: "ouvrir", libelle: "Ouvrir", action: () => ouvrirCollection("ouvrir") },
      { cle: "enregistrer", libelle: "Enregistrer", action: () => void enregistrerCollection(), desactive: !collection.ouverte || collection.enCours },
      { cle: "enregistrer-sous", libelle: "Enregistrer sous", action: () => ouvrirCollection("enregistrer-sous"), desactive: !collection.ouverte || collection.enCours },
    ] },
    { cle: "fournisseurs", titre: "Fournisseurs", entrees: [
      { cle: "nouveau", libelle: "Nouveau (ajouter un fournisseur)", action: () => window.location.assign("/parametres#settings-fournisseurs-ajouter") },
      { cle: "gerer", libelle: "Gérer", action: () => window.location.assign("/parametres#settings-fournisseurs") },
    ] },
  ];
  const coucheDeTable = coucheTable ? couchesConnues.get(coucheTable) : undefined;
  const couchesPolygones = composition.couches.map((k) => couchesConnues.get(k.coucheId)).filter((c): c is CoucheRecue => !!c && c.typeGeometrie === "polygone");

  /** Image autorisée de la carte (export et impression : même verdict du serveur, D-GD-07). */
  const imageAutorisee = async (analyseIds: string[]) => {
    const r = await api.exporter(carte!.id, carte!.revision, analyseIds);
    if (r.etat !== "autorise") return { r, png: null };
    if (!moteur.current) throw new Error("Export autorisé, mais la carte n'est pas affichée (WebGL indisponible) : seule la fiche de sources est produite.");
    // Le contour de la barre territoriale est une aide de navigation, hors de la carte enregistrée : il n'entre ni dans
    // l'image ni dans ses attributions (l'export n'autorise que les couches de la carte).
    const m = moteur.current;
    await m.masquerTerritoire(true);
    try {
      return await composer(m, r);
    } finally {
      await m.masquerTerritoire(false);
    }
  };
  const composer = async (m: MoteurCarte, r: ExportRecu) => {
    const complet = await m.attendreChargement(10_000);
    if (!complet) throw new Error("Toutes les tuiles ne sont pas chargées : export interrompu pour ne pas produire une image incomplète. Réessayez.");
    const legendes = [...compositionAffichee.couches].reverse().filter((k) => k.visible).map((k) => {
      const c = couchesConnues.get(k.coucheId);
      // Valeurs de l'indicateur actif affichées sur la couche (D-GD-32) : la légende exportée nomme ce que sont ces nombres.
      const i = valeursAffichees.has(k.coucheId) ? indicateursParCouche.get(k.coucheId) : undefined;
      const titre = `${c?.titre ?? k.coucheId}${i ? ` — valeurs affichées : ${i.titre} (${i.unite})${i.periode ? `, ${i.periode}` : ""}` : ""}`;
      if (k.style.mode === "simple") return { titre, entrees: null, couleur: k.style.couleur };
      if (k.style.mode === "categories") return { titre, entrees: entreesCategories(categories.get(k.coucheId) ?? []), sansEffectif: true };
      if (k.style.mode === "raster") return { titre: `${c?.titre ?? k.coucheId}${c?.raster ? ` — ${c.raster.grandeur}${c.raster.unite ? ` (${c.raster.unite})` : ""}` : ""}`, entrees: c?.raster ? entreesRaster(c.raster) : null, sansEffectif: true };
      // Ancien style thématique (avant D-GD-32) : plus rendu, la couche est en couleur unie par défaut.
      return { titre, entrees: null, couleur: "#2b8cbe" };
    });
    const png = await composerPng({ carte: m.canevas(), titre: carte!.nom, date: new Date(), metresParPixel: m.metresParPixel(), legendes, attributions: r.attributions, revision: r.carteRevision, miniCarte: miniCarte ? m.canevasMiniCarte() : null });
    return { r, png };
  };
  const exporter = async (analyseIds: string[]) => {
    const { r, png } = await imageAutorisee(analyseIds);
    if (png) telecharger(png, `geodata-${carte!.nom.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60)}-r${r.carteRevision}.png`);
    return r;
  };
  /**
   * Impression directe (lot G, D-GD-27) : carte enregistrée seulement (on imprime exactement ce qui est enregistré), même
   * autorisation que l'export ; titre, légende, échelle, attributions et mini-carte si elle est affichée.
   */
  const imprimerCarte = () => {
    if (!carte || etat.etat !== "enregistree") { setAnnonce("Enregistrez la carte pour l'imprimer : l'impression suit les mêmes droits que l'export."); return; }
    const fenetre = ouvrirFenetreImpression(carte.nom);
    if (!fenetre) { setAnnonce(AVIS_IMPRESSION_BLOQUEE); return; }
    setAnnonce("Impression de la carte en préparation.");
    void imageAutorisee([]).then(({ r, png }) => {
      if (png) fenetre.poser(png);
      else fenetre.erreur(`Impression refusée : ${r.refus.map((x) => `${x.titre} — ${x.motif}`).join(" ; ") || "export non autorisé."}`);
    }).catch((e: unknown) => fenetre.erreur(message(e)));
  };
  const basculerSynthese = () => setSyntheseOuverte((v) => { ecrireLocal("geodata.synthese", v ? null : "1"); setAnnonce(v ? "Synthèse de la vue fermée" : "Synthèse de la vue ouverte"); return !v; });
  const basculerRegroupements = () => {
    if (!composition.couches.some((k) => k.visible && couchesPoints.has(k.coucheId))) return;
    const avant = regroupementsTousActifs(composition, couchesPoints);
    setComposition((c) => basculerTousRegroupements(c, couchesPoints));
    setAnnonce(avant ? "Chaque point est affiché seul" : "Points regroupés");
  };
  /** Copie l'adresse de la vue (D-GD-40) ; si le presse-papiers est refusé, l'adresse est annoncée pour être copiée à la main. */
  const copierLien = async () => {
    const adresse = window.location.href;
    try { await navigator.clipboard.writeText(adresse); setAnnonce("Adresse de la vue copiée. Elle ne donne accès qu'aux couches que son destinataire peut déjà consulter."); }
    catch { setAnnonce(`Copiez l'adresse de la vue : ${adresse}`); }
  };
  const basculerMiniCarte = () => setMiniCarte((v) => { ecrireLocal("geodata.mini-carte", v ? null : "1"); setAnnonce(v ? "Mini-carte masquée" : "Mini-carte affichée"); return !v; });
  // Couche des contours de la mini-carte : la limite administrative la plus haute (région) visible, sinon la première
  // couche vectorielle visible ; sans couche, le fond seul.
  const coucheSituation = useMemo(() => {
    const vecteurs = compositionAffichee.couches.filter((k) => k.visible && !rasters.has(k.coucheId));
    const parRang = vecteurs.filter((k) => rangs.has(k.coucheId)).sort((a, b) => rangs.get(a.coucheId)! - rangs.get(b.coucheId)!);
    return (parRang[0] ?? vecteurs[0])?.coucheId ?? null;
  }, [compositionAffichee, rasters, rangs]);
  useEffect(() => { moteur.current?.afficherTerritoire(contourTerritoire?.contour ?? null); }, [contourTerritoire, chargementMoteur]);
  useEffect(() => { moteur.current?.afficherEntite(entiteContour); }, [entiteContour, chargementMoteur]);
  useEffect(() => { moteur.current?.afficherMiniCarte(miniCarte ? conteneurMini.current : null, coucheSituation); }, [miniCarte, coucheSituation, chargementMoteur]);

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (outil !== "navigation" && trace) { moteur.current?.annulerTrace(); setTrace(null); e.stopPropagation(); }
      else if (menuOuvert) setMenuOuvert(false);
      else if (resultats) setResultats(null);
      else if (panneauMini) setPanneauMini(null);
      else if (volet && estTelephone()) setVolet(null);
    }
    if (e.key === "Enter" && outil !== "navigation" && outil !== "annotation" && (e.target as HTMLElement).classList.contains("maplibregl-canvas")) moteur.current?.terminerTrace();
  };

  // Zone des onglets du tableau de bord : l'entité sélectionnée sur la carte, sinon le niveau courant de la barre
  // territoriale, sinon rien (zone nationale de la définition en base).
  const dernierNiveau = chemin[chemin.length - 1];
  const zoneCarte = useMemo<ZoneCarte | null>(() => (entite ? { pays: paysCourant, rang: entite.rang, code: entite.code, nom: entite.nom, coucheId: entite.coucheId ?? null }
    : dernierNiveau ? { pays: paysCourant, rang: dernierNiveau.rang, code: dernierNiveau.code, nom: dernierNiveau.nom, coucheId: dernierNiveau.coucheId || null } : null), [entite, dernierNiveau, paysCourant]);

  return (
    <div ref={racine} className="geodata-page" style={{ height: `calc(100dvh - ${hauteurHaut}px)` }} onKeyDown={clavier} data-geodata-page data-gd-valeurs-affichees={[...valeursAffichees.keys()].join(" ")} data-gd-selection={entite ? `${entite.rang}:${entite.code}` : ""} data-gd-onglet-actif={ongletPage}>
      <p className="sr-only" role="status" aria-live="polite">{annonce}</p>
      <header className="gd-barre" aria-label="Barre de GeoData">
        {/* Barre d'onglets (D-GD-37) : Fond et Enregistrer vivent dans la mini-barre de la carte, Fournisseurs et
            Enregistrer dans ☰ › Cartes ; l'état d'enregistrement est la pastille de l'icône Enregistrer. ☰ à droite. */}
        <nav className="gd-barre-onglets" aria-label="Onglets de GeoData" data-gd-barre-onglets>
          {ONGLETS_GEODATA.map((o) => (
            <Link key={o.cle} to={cheminOnglet(o.cle)} className="gd-onglet-page" aria-current={ongletPage === o.cle ? "page" : undefined} data-gd-onglet-page={o.cle}>{o.libelle}</Link>
          ))}
        </nav>
        <div className="gd-menu">
          <button type="button" className="gd-hamburger" aria-label="Menu GeoData" title="Menu GeoData" aria-expanded={menuOuvert} aria-controls="gd-menu-liste" onClick={() => setMenuOuvert(!menuOuvert)} data-gd-menu>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d={menuOuvert ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
          </button>
          {menuOuvert && (
            <ul ref={listeMenu} id="gd-menu-liste" className="gd-menu-liste" aria-label="Espaces de travail GeoData">
              {(["donnees"] as const).map((v) => <li key={v}><button type="button" aria-pressed={volet === v} onClick={() => { setMenuOuvert(false); ouvrirVolet(v); }} data-gd-volet={v}>{LIBELLES_VOLETS[v]}</button></li>)}
              <li className="gd-menu-groupe">
                <button type="button" aria-expanded={menuCartes} aria-controls="gd-menu-cartes" onClick={() => setMenuCartes(!menuCartes)} data-gd-menu-cartes>Cartes</button>
                {menuCartes && (
                  <div id="gd-menu-cartes" className="gd-sous-menu">
                    {MENU_CARTES.map((g) => (
                      <section key={g.cle} aria-labelledby={`gd-menu-${g.cle}`} data-gd-menu-groupe={g.cle}>
                        <h3 id={`gd-menu-${g.cle}`} className="gd-sous-menu-titre">{g.titre}</h3>
                        <ul>
                          {g.entrees.map((e) => (
                            <li key={e.cle}>
                              <button type="button" disabled={!e.action || e.desactive} onClick={() => { setMenuOuvert(false); e.action?.(); }} data-gd-menu-entree={`${g.cle}:${e.cle}`} {...(e.volet ? { "data-gd-volet": e.volet } : {})}>
                                {e.libelle}{!e.action && <span className="gd-bientot">{" — bientôt"}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </li>
              {(["etudes", "import", "export"] as const).map((v) => <li key={v}><button type="button" aria-pressed={volet === v} onClick={() => { setMenuOuvert(false); ouvrirVolet(v); }} data-gd-volet={v}>{LIBELLES_VOLETS[v]}</button></li>)}
            </ul>
          )}
        </div>
      </header>
      {etat.etat === "conflit" && (
        <div role="alert" className="gd-bandeau gd-alerte" data-gd-conflit>
          <p>{`La carte a été modifiée ailleurs (révision ${etat.revisionCourante}). Votre version n'est pas perdue :`}</p>
          <button type="button" onClick={() => carte && void ouvrirCarte(carte.id)}>Recharger la version enregistrée</button>
          <button type="button" onClick={async () => { if (!carte) return; try { const c = await api.dupliquerCarte(carte.id, { nom: `${carte.nom.slice(0, 100)} (ma version)`, composition }); setCarte(c); setComposition(c.composition); setEtatForce(null); ecrireLocal(CLE_DERNIERE_CARTE, c.id); setAnnonce("Votre version est enregistrée comme une nouvelle carte."); } catch (e) { setEtatForce({ etat: "erreur", message: message(e) }); } }} data-gd-copie-conflit>Enregistrer ma version comme copie</button>
        </div>
      )}
      {etat.etat === "erreur" && <div role="alert" className="gd-bandeau gd-alerte"><p>{etat.message}</p><button type="button" onClick={() => void enregistrer()}>Réessayer</button></div>}
      {erreurEspace && <div role="alert" className="gd-bandeau gd-alerte"><p>{erreurEspace}</p></div>}
      <div className="gd-corps">
        {bordVisite && <TableauDeBord onglet={ongletPage === "cartes" ? "chiffres-cles" : ongletPage} visible={ongletPage !== "cartes"} paysCourant={paysCourant} paysPret={paysListe !== null || erreurTerritoires !== null} zoneCarte={zoneCarte} zoneEtude={zoneActive?.nom ?? null} />}
        {panneauOuvert && <aside className="gd-panneau gd-ouvert" aria-label="Catalogue, couches et légende" data-gd-panneau>
          <div className="gd-onglets">
            <div role="tablist" aria-label="Panneau GeoData" className="gd-liste-onglets">
              {(["catalogue", "couches", "legende"] as const).map((o) => <button key={o} type="button" role="tab" id={`gd-onglet-${o}`} aria-selected={onglet === o} aria-controls="gd-panneau-contenu" onClick={() => ouvrirOnglet(o)} data-gd-onglet={o}>{({ catalogue: "Catalogue", couches: `Couches (${composition.couches.length})`, legende: "Légende" })[o]}</button>)}
            </div>
            <button type="button" className="gd-replier" onClick={() => setPanneauOuvert(false)} data-gd-fermer-panneau>Fermer</button>
          </div>
          <div id="gd-panneau-contenu" role="tabpanel" aria-labelledby={`gd-onglet-${onglet}`} className="gd-contenu">
              {onglet === "catalogue" && <PanneauCatalogue rangement={rangementCatalogue} couches={catalogue} erreur={erreurCatalogue} composition={composition} onRecharger={chargerCatalogue} indicateurs={{ liste: indicateursCatalogue, actif: indicateurActif, onChoix: choisirIndicateur }} onAjouter={(c) => { setComposition((x) => ajouterCouche(x, c.id, c.version.id, c.styleDefaut)); setAnnonce(`Couche « ${c.titre} » ajoutée.`); const e = empriseDe(c.emprise?.coordinates); if (e && !composition.couches.length) moteur.current?.allerA({ emprise: e }); }} />}
              {onglet === "couches" && <PanneauCouches composition={composition} couches={couchesConnues} disponibilite={disponibilite} indicateurs={indicateursParCouche} masques={indicateursMasques} onAfficherIndicateur={afficherIndicateur}
                onVisibilite={(id) => setComposition((c) => basculerVisibilite(c, id))} onOpacite={(id, o) => setComposition((c) => definirOpacite(c, id, o))}
                onEtiquettes={(id) => setComposition((c) => basculerEtiquettes(c, id))} onRegrouper={(id) => setComposition((c) => basculerRegroupement(c, id))}
                onDeplacer={(id, s) => setComposition((c) => deplacerCouche(c, id, s))} onRetirer={(id) => setComposition((c) => retirerCouche(c, id))} onStyle={changerStyle} onTable={setCoucheTable} />}
              {onglet === "legende" && <PanneauLegende composition={composition} couches={couchesConnues} categories={categories} />}
          </div>
        </aside>}
        <main className="gd-carte" aria-label="Carte" data-gd-zoom={composition.camera.zoom.toFixed(2)}>
          <div ref={conteneurCarte} className="gd-moteur" data-gd-moteur />
          <button type="button" className="gd-bouton-donnees" aria-pressed={panneauOuvert && onglet === "catalogue"} onClick={basculerDonnees} data-gd-donnees>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg>
            <span>Données</span>
          </button>
          <BarreOutilsCarte outil={outil} pleinEcran={pleinEcran} legendeOuverte={panneauOuvert && onglet === "legende"} carteDisponible={!erreurCarte}
            etiquettes={composition.couches.some((k) => k.visible && vectorielles.has(k.coucheId)) ? etiquettesToutesAffichees(composition, vectorielles) : null} onEtiquettes={basculerLibelles}
            miniCarte={miniCarte} onMiniCarte={basculerMiniCarte} onImprimer={imprimerCarte}
            synthese={syntheseOuverte} onSynthese={basculerSynthese} onCopierLien={() => void copierLien()}
            regroupement={composition.couches.some((k) => k.visible && couchesPoints.has(k.coucheId)) ? regroupementsTousActifs(composition, couchesPoints) : null} onRegroupement={basculerRegroupements}
            onZoom={(d) => moteur.current?.zoomer(d)} onNord={() => moteur.current?.orienterNord()} onPosition={localiser} onPleinEcran={basculerPleinEcran} onOutil={choisirOutil} onLegende={basculerLegende}
            onPlacement={(r) => setPlacementOutils((a) => (a && a.droite === r.droite && a.haut === r.haut && a.largeur === r.largeur && a.hauteur === r.hauteur ? a : r))} />
          <BarreRecherche outils={placementOutils} ouverte={rechercheOuverte} onBasculer={basculerRecherche} texte={recherche} onTexte={setRecherche} onLancer={() => void lancerRecherche()}
            resultats={resultats} avis={avisRecherche} onChoisir={choisirResultat} onFermerResultats={() => { setResultats(null); setAvisRecherche(null); }}
            enregistrement={{ libelle: "Enregistrer", desactive: enregistrementImpossible, onEnregistrer: () => void enregistrer(), etat: etat.etat, etatLibelle: LIBELLES_ENREGISTREMENT[etat.etat], carteNom: carte?.nom ?? null }}
            fonds={{ choix: choixFonds, actif: composition.fond, onChoisir: choisirFond, ouverts: panneauMini === "fonds", onBasculer: (o) => basculerPanneauMini("fonds", o) }}
            navigation={{ ouverte: panneauMini === "navigation", onBasculer: (o) => basculerPanneauMini("navigation", o),
              contenu: <BarreTerritoriale pays={paysListe} erreur={erreurTerritoires} paysCourant={paysCourant} chemin={chemin} onPays={changerPays} onChoisir={choisirTerritoire} onRetour={remonter} /> }} />
          {miniCarte && !erreurCarte && <div ref={conteneurMini} className={`gd-mini-carte${panneauOuvert ? " gd-mini-decalee" : ""}`} title="Carte de situation : touchez pour recentrer la carte" aria-label="Carte de situation" role="img" data-gd-mini-carte />}
          {syntheseOuverte && !erreurCarte && <SyntheseVue lignes={lignesSynthese} zoom={composition.camera.zoom} zone={zoneActive?.nom ?? null} decalee={panneauOuvert} haute={miniCarte} onFermer={basculerSynthese} />}
          {zoneActive && <div className="gd-puce-zone" role="status" data-gd-puce-zone={zoneActive.id}>
            <span>Zone d'étude :</span> <span translate="no">{zoneActive.nom}</span>{zonePartielle && <span> (partiel)</span>}
            <button type="button" onClick={() => filtrerZone(null)} aria-label="Retirer le filtre de zone (Alt+Z)" title="Retirer le filtre de zone (Alt+Z)" aria-keyshortcuts="Alt+Z" data-gd-retirer-zone>×</button>
          </div>}
          {!erreurCarte && <p className="gd-zoom-affiche" aria-label={`Zoom ${composition.camera.zoom.toFixed(1)}`} data-gd-zoom-affiche><span>Zoom</span> <span>{composition.camera.zoom.toFixed(1).replace(".", ",")}</span></p>}
          {chargementMoteur && <p role="status" className="gd-sur-carte">Chargement de la carte…</p>}
          {avisFond && <div role="status" className="gd-sur-carte gd-alerte" data-gd-avis-fond><p>{avisFond}</p><div className="gd-actions"><button type="button" onClick={() => setComposition((c) => ({ ...c, fond: "neutre" }))}>Fond neutre</button><button type="button" onClick={() => setAvisFond(null)}>Fermer</button></div></div>}
          {erreurCarte && <div role="alert" className="gd-sur-carte gd-alerte" data-gd-erreur-carte><p>{erreurCarte}</p></div>}
          {trace && outil !== "navigation" && <p className="gd-sur-carte gd-mesure-carte" role="status">{trace.sommets.length < 2 ? "Cliquez sur la carte pour commencer." : (outil === "distance" || outil === "surface" || outil === "zone") ? "Tracé en cours — détails dans Études." : ""}</p>}
        </main>
        {volet && (
          <aside className="gd-volet gd-ouvert" aria-label={({ fiche: "Fiche d'information", valeur: "Valeur au point", donnees: "Données", cartes: "Mes cartes", collection: "Collection", etudes: "Études", import: "Importer", export: "Exporter" })[volet]} data-gd-volet-ouvert={volet}>
            <div className="gd-ligne-titre"><h2>{({ fiche: "Fiche d'information", valeur: "Valeur au point", donnees: "Données : catégories et couches", cartes: "Mes cartes", collection: "Collection", etudes: "Études", import: "Importer des données", export: "Exporter" })[volet]}</h2><button type="button" onClick={() => setVolet(null)}>Fermer</button></div>
            {volet === "valeur" && valeurPoint && <FicheValeur {...valeurPoint} onFermer={() => { setVolet(null); setValeurPoint(null); }} />}
            {volet === "fiche" && <FicheObjet coucheArrondissements={fiche && rangDe(fiche) === 3 ? coucheArrondissementsDe(fiche) : null} onFiche={(id, code) => { setSelection({ coucheId: id, code }); void ouvrirFiche(id, code); }} descendre={(() => { const r = descentePossible(fiche); if (!r || !fiche) return null; const n = nomNiveauEnfant(fiche, r); return { libelle: n ? `Voir ses ${n}` : "Voir le niveau inférieur", onDescendre: () => descendre(fiche) }; })()} fiche={fiche} chargement={ficheEtat.chargement} erreur={ficheEtat.erreur} onFermer={() => { setVolet(null); effacerSelection(); }} onCentrer={(f) => { const e = empriseDe(f.emprise.coordinates); if (e) moteur.current?.allerA({ emprise: e }); }} />}
            {volet === "donnees" && <GestionDonnees rangement={rangement} erreur={erreurRangement} couches={catalogue} onChange={chargerRangement} />}
            {volet === "cartes" && <MesCartes carte={carte} nouvelle={!carte} enregistrerSous={enregistrerSousCarte} onFinEnregistrerSous={() => setEnregistrerSousCarte(false)} onOuvrir={(id) => void ouvrirCarte(id)} onCarteModifiee={(c) => { setCarte(c); setEtatForce(null); }}
              onNouvelle={nouvelleCarte}
              onEnregistrerSous={async (nom, collectionId) => { const c = await api.creerCarte(nom, composition, collectionId); setCarte(c); setComposition(c.composition); setEtatForce(null); ecrireLocal(CLE_DERNIERE_CARTE, c.id); setAnnonce(`Carte « ${c.nom} » enregistrée.`); if (collectionId) await collection.rafraichir(collectionId).catch(() => undefined); }} />}
            {volet === "collection" && <PanneauCollection etat={collection} mode={modeCollection} onMode={setModeCollection} carte={carte} onOuvrirCarte={(id) => void ouvrirCarte(id)} onAnnonce={setAnnonce} />}
            {volet === "etudes" && <Etudes outil={outil} trace={trace} tracePret={tracePret} couchesPolygones={couchesPolygones} zones={zones} onOutil={setOutil} zoneFiltre={zoneFiltre} onFiltrerZone={filtrerZone}
              onTerminer={() => moteur.current?.terminerTrace()} onAnnulerTrace={() => { moteur.current?.annulerTrace(); setTrace(null); setTracePret(null); }} onZonesChangees={chargerZones}
              onCentrer={(g) => { const e = empriseGeometrie(g); if (e) moteur.current?.allerA({ emprise: e }); }} />}
            {volet === "import" && <Import onCoucheImportee={async (id) => { const c = await api.couche(id); connaitre([c]); chargerCatalogue(); setComposition((x) => ajouterCouche(x, c.id, c.version.id, c.styleDefaut)); const e = empriseDe(c.emprise?.coordinates); if (e) moteur.current?.allerA({ emprise: e }); }} />}
            {volet === "export" && <Export carte={carte} enregistree={etat.etat === "enregistree"} analyses={analysesIds} onExporter={exporter} />}
          </aside>
        )}
      </div>
      {coucheDeTable && ongletPage === "cartes" && <div className="gd-tiroir"><TableAttributs couche={coucheDeTable} zone={zoneActive ? { id: zoneActive.id, nom: zoneActive.nom } : null} filtreActif={composition.couches.find((k) => k.coucheId === coucheDeTable.id)?.filtre ?? null}
        onFiltre={(f: FiltreCouche | null) => setComposition((c) => definirFiltre(c, coucheDeTable.id, f))} onFermer={() => setCoucheTable(null)}
        onSelection={(code) => { setSelection({ coucheId: coucheDeTable.id, code }); void ouvrirFiche(coucheDeTable.id, code).then(() => undefined); }} /></div>}
    </div>
  );
}

export default PageGeoData;
