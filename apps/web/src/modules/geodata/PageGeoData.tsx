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
import { cheminValide, combinerFiltres, COMPOSITION_INITIALE, couleurCategorie, estCodeHcp, filtresNiveaux, LIBELLES_ENFANTS, parentHcp, rangAdministratif, type CoucheNiveau, type EtapeNiveau, type RangAdministratif, formatNombre, legende, lireValeur, type Composition, type FiltreCouche, type StyleCouche, type ValeurIndicateur } from "@parcours/geodata-model";
import { api, ErreurGeoData, type ValeurRasterRecue, type CarteRecue, type RangementRecu, type Fond, type CoucheRecue, type EspaceRecu, type FicheRecue, type ResultatRecherche, type ZoneRecue } from "./client";
import { ajouterCouche, basculerVisibilite, definirFiltre, definirOpacite, definirStyle, deplacerCouche, etatDepuis, LIBELLES_ENREGISTREMENT, entreesCategories, entreesRaster, retirerCouche, type Categorie, type EtatEnregistrement } from "./composition-ops";
import { webglDisponible, type MoteurCarte, type OutilCarte } from "./carte/moteur";
import { FicheObjet, FicheValeur, PanneauCatalogue, PanneauCouches, PanneauLegende, TableAttributs } from "./panneaux/consultation";
import { Etudes, Export, Import, MesCartes, type TraceEnCours } from "./panneaux/travail";
import { BarreOutilsCarte } from "./panneaux/BarreOutilsCarte";
import { FilNiveaux } from "./panneaux/FilNiveaux";
import { GestionDonnees, rangementDepuis } from "./panneaux/donnees";
import { lireFondsNavigateur } from "./fonds-navigateur";
import { composerPng, telecharger } from "./export-png";
import "./geodata.css";

type Onglet = "catalogue" | "couches" | "legende";
type Volet = "fiche" | "valeur" | "donnees" | "cartes" | "etudes" | "import" | "export";

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
  const [composition, setComposition] = useState<Composition>(COMPOSITION_INITIALE);
  const [carte, setCarte] = useState<CarteRecue | null>(null);
  const [etatForce, setEtatForce] = useState<EtatEnregistrement | null>(null);
  const [valeurs, setValeurs] = useState<Map<string, Map<string, ValeurIndicateur>>>(new Map());
  const [filtres, setFiltres] = useState<Map<string, string[]>>(new Map());
  const [categories, setCategories] = useState<Map<string, Categorie[]>>(new Map());
  const [valeurPoint, setValeurPoint] = useState<{ titre: string; etat: "chargement" | "erreur" | "ok"; recue?: ValeurRasterRecue; erreur?: string } | null>(null);
  const [selection, setSelection] = useState<{ coucheId: string; code: string } | null>(null);
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
  const [analysesIds, setAnalysesIds] = useState<string[]>([]);
  const [webgl] = useState(webglDisponible);
  const [erreurCarte, setErreurCarte] = useState<string | null>(webgl ? null : "WebGL n'est pas disponible dans ce navigateur : la carte ne peut pas s'afficher. La recherche, le catalogue, la table et les fiches restent utilisables.");
  const [chargementMoteur, setChargementMoteur] = useState(webgl);
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[] | null>(null);
  const [avisRecherche, setAvisRecherche] = useState<string | null>(null);
  const [annonce, setAnnonce] = useState("");
  const [menuOuvert, setMenuOuvert] = useState(false);
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
  // Navigation par niveaux (lot B) : chemin Maroc → région → province → commune, et codes / noms des couches de limites.
  const [chemin, setChemin] = useState<EtapeNiveau[]>([]);
  const [unitesNiveaux, setUnitesNiveaux] = useState<Map<string, { code: string; nom: string | null }[]>>(new Map());
  const [pleinEcran, setPleinEcran] = useState(false);

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
  const chargerZones = useCallback(() => { api.zones().then((r) => setZones(r.zones)).catch(() => undefined); api.analyses().then((r) => setAnalysesIds(r.analyses.map((a) => a.id))).catch(() => undefined); }, []);

  useEffect(() => {
    api.espace().then(setEspace).catch((e) => setErreurEspace(message(e)));
    chargerCatalogue();
    void chargerRangement();
    chargerZones();
    const derniere = lireLocal(CLE_DERNIERE_CARTE);
    if (derniere) void ouvrirCarte(derniere, true);
    else setComposition((c) => (c === COMPOSITION_INITIALE ? compositionNeuve() : c));
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

  // Valeurs des indicateurs thématiques de la composition (chargées une fois par indicateur).
  useEffect(() => {
    for (const k of composition.couches) if (k.style.mode === "thematique" && !valeurs.has(k.style.indicateurId)) void valeursDe(k.style.indicateurId).catch(() => undefined);
  }, [composition, valeurs, valeursDe]);
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
  useEffect(() => setAvisFond(null), [fond.id]);
  const disponibilite = carte?.disponibilite ?? {};
  const compositionAffichee = useMemo(() => ({ ...composition, couches: composition.couches.filter((k) => !disponibilite[k.coucheId] || disponibilite[k.coucheId]!.etat === "disponible") }), [composition, disponibilite]);
  const attributions = useMemo(() => [...new Set(compositionAffichee.couches.filter((k) => k.visible).map((k) => couchesConnues.get(k.coucheId)?.version.attribution).filter((x): x is string => !!x))], [compositionAffichee, couchesConnues]);
  // Couches raster (D-GD-13) connues ; référence lue par le moteur (créé une fois) au moment d'un clic.
  const rasters = useMemo(() => new Set([...couchesConnues.values()].filter((c) => c.typeGeometrie === "raster").map((c) => c.id)), [couchesConnues]);
  // Rang administratif des couches de limites (D-GD-16), lu de leur niveau ou du niveau OpenStreetMap de leur titre.
  const rangs = useMemo(() => new Map([...couchesConnues.values()].flatMap((c) => { const r = rangAdministratif(c); return r ? [[c.id, r] as const] : []; })), [couchesConnues]);
  // Codes et noms des couches de limites de la composition (lus une fois par couche ; contenu d'une version figé).
  useEffect(() => {
    for (const k of composition.couches) {
      const id = k.coucheId;
      if (!rangs.has(id) || unitesNiveaux.has(id)) continue;
      const connues = categories.get(id);
      if (connues) { setUnitesNiveaux((m) => new Map(m).set(id, connues)); continue; }
      setUnitesNiveaux((m) => new Map(m).set(id, []));
      api.categories(id).then((r) => setUnitesNiveaux((m) => new Map(m).set(id, r.categories))).catch(() => setUnitesNiveaux((m) => { const n = new Map(m); n.delete(id); return n; }));
    }
  }, [composition, rangs, unitesNiveaux, categories]);
  const couchesNiveau = useMemo<CoucheNiveau[]>(() => composition.couches.flatMap((k) => {
    const rang = rangs.get(k.coucheId), u = unitesNiveaux.get(k.coucheId);
    return rang && u?.length ? [{ coucheId: k.coucheId, rang, codes: u.map((x) => x.code) }] : [];
  }), [composition, rangs, unitesNiveaux]);
  // Une couche retirée de la composition coupe le chemin à l'étape qui l'utilisait.
  useEffect(() => {
    const presentes = new Set(composition.couches.map((k) => k.coucheId));
    setChemin((c) => { const v = cheminValide(c, presentes); return v.length === c.length ? c : v; });
  }, [composition]);
  const filtresAffiches = useMemo(() => combinerFiltres(filtres, filtresNiveaux(chemin, couchesNiveau)), [filtres, chemin, couchesNiveau]);
  const navigationPossible = couchesNiveau.some((c) => c.codes.some(estCodeHcp));
  const rastersCourants = useRef<{ rasters: Set<string>; couches: Map<string, CoucheRecue> }>({ rasters, couches: couchesConnues });
  rastersCourants.current = { rasters, couches: couchesConnues };
  const zonesGeo = useMemo(() => ({ type: "FeatureCollection" as const, features: zones.map((z) => ({ type: "Feature", properties: { id: z.id, nom: z.nom }, geometry: z.geometrie })) }), [zones]);

  // Moteur : créé une fois, à la demande (import dynamique).
  useEffect(() => {
    if (!webgl || !conteneurCarte.current) return;
    let detruit = false;
    import("./carte/moteur-maplibre").then(({ creerMoteur }) => {
      if (detruit || !conteneurCarte.current) return;
      try {
        moteur.current = creerMoteur(conteneurCarte.current, compositionCourante.current, {
          surDeplacement: (camera) => setComposition((c) => (c.camera.lon === camera.lon && c.camera.lat === camera.lat && c.camera.zoom === camera.zoom && c.camera.cap === camera.cap ? c : { ...c, camera })),
          surClic: (o, p) => {
            setSelection(o);
            if (o) return void ouvrirFiche(o.coucheId, o.code);
            // Aucun objet touché : valeur de la couche raster visible la plus haute, s'il y en a une.
            const { rasters: rs, couches } = rastersCourants.current;
            const haut = [...compositionCourante.current.couches].reverse().find((k) => k.visible && rs.has(k.coucheId));
            if (haut) void ouvrirValeur(haut.coucheId, couches.get(haut.coucheId)?.titre ?? haut.coucheId, p);
          },
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
    moteur.current?.appliquer(compositionAffichee, fond, { valeurs, categories: couleursCategories, rangs, rasters, filtres: filtresAffiches, selection, zones: zonesGeo, attributions });
  }, [compositionAffichee, fond, valeurs, couleursCategories, rangs, rasters, filtresAffiches, selection, zonesGeo, attributions, chargementMoteur]);
  useEffect(() => { moteur.current?.definirOutil(outil); setTrace(null); setTracePret(null); }, [outil, chargementMoteur]);

  compositionCourante.current = composition;
  const etat: EtatEnregistrement = etatForce ?? etatDepuis(composition, carte?.composition ?? null);

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
      const c = await api.carte(id);
      setCarte(c); setComposition(c.composition); setEtatForce(null);
      ecrireLocal(CLE_DERNIERE_CARTE, c.id);
      moteur.current?.allerA({ lon: c.composition.camera.lon, lat: c.composition.camera.lat, zoom: c.composition.camera.zoom, cap: c.composition.camera.cap });
      setAnnonce(`Carte « ${c.nom} » ouverte.`);
    } catch (e) {
      if (silencieux && e instanceof ErreurGeoData && e.statut === 404) ecrireLocal(CLE_DERNIERE_CARTE, null);
      else if (!silencieux) setAnnonce(message(e));
    }
  }

  async function enregistrer() {
    if (!carte) { setVolet("cartes"); if (estTelephone()) setPanneauOuvert(false); return; }
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

  /** Cadre la carte sur une entité (emprise de sa fiche) ; le pays entier pour la racine. */
  async function cadrerSur(e: EtapeNiveau | undefined) {
    if (!e) {
      const racineCouche = couchesNiveau.reduce<CoucheNiveau | null>((m, c) => (!m || c.rang < m.rang ? c : m), null);
      const em = empriseDe(racineCouche ? couchesConnues.get(racineCouche.coucheId)?.emprise?.coordinates : undefined);
      if (em) moteur.current?.allerA({ emprise: em });
      return;
    }
    try { const f = await api.fiche(e.coucheId, e.code); const em = empriseDe(f.emprise.coordinates); if (em) moteur.current?.allerA({ emprise: em }); } catch { /* cadrage seulement */ }
  }
  // Producteur des valeurs (avant « ; contours : … ») : les couches HCP d'un niveau à l'autre ont des contours différents.
  const producteurPrincipal = (c: CoucheRecue) => c.version.source.producteur.split(";")[0]!.trim();
  /** Couche du rang inférieur : dans la composition, sinon au catalogue, du même producteur (ajoutée alors à la carte). */
  function coucheEnfant(f: FicheRecue, rang: RangAdministratif): { id: string; aAjouter: CoucheRecue | null } | null {
    const dans = composition.couches.find((k) => rangs.get(k.coucheId) === rang + 1);
    if (dans) return { id: dans.coucheId, aAjouter: null };
    const c = catalogue?.find((x) => x.typeGeometrie !== "raster" && rangAdministratif(x) === rang + 1 && producteurPrincipal(x) === producteurPrincipal(f.couche));
    return c ? { id: c.id, aAjouter: c } : null;
  }
  const rangDe = (f: FicheRecue | null) => (f ? rangs.get(f.couche.id) ?? rangAdministratif(f.couche) : null);
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
    const e: EtapeNiveau = { coucheId: f.couche.id, rang: r, code: f.code, nom: f.nom ?? f.code };
    setChemin(cheminVers(e));
    const em = empriseDe(f.emprise.coordinates);
    if (em) moteur.current?.allerA({ emprise: em });
    setAnnonce(`Niveau : ${e.nom}`);
  }
  function allerAuNiveau(longueur: number) {
    const c = chemin.slice(0, longueur);
    setChemin(c);
    void cadrerSur(c[c.length - 1]);
    setAnnonce(`Niveau : ${c[c.length - 1]?.nom ?? "Maroc"}`);
  }
  const remonter = () => { if (chemin.length) allerAuNiveau(chemin.length - 1); };
  // Raccourcis de la navigation par niveaux, sur toute la page (le focus peut être sur le corps après un clic) :
  // Alt+↑ remonte, Alt+↓ descend dans l'entité de la fiche ouverte ; jamais pendant une saisie.
  const raccourcisNiveaux = useRef<(e: globalThis.KeyboardEvent) => void>(() => undefined);
  raccourcisNiveaux.current = (e) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    const cible = e.target as HTMLElement | null;
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
  const ouvrirVolet = (v: Volet) => { setVolet(volet === v ? null : v); if (estTelephone()) setPanneauOuvert(false); };
  const ouvrirOnglet = (o: Onglet) => { setOnglet(o); setPanneauOuvert(true); if (estTelephone()) setVolet(null); };
  // Bouton « Données » (sur la carte et dans le menu) : ouvre le catalogue rangé par catégorie, ou referme le panneau.
  const basculerDonnees = () => { if (panneauOuvert && onglet === "catalogue") setPanneauOuvert(false); else ouvrirOnglet("catalogue"); };
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
  const coucheDeTable = coucheTable ? couchesConnues.get(coucheTable) : undefined;
  const couchesPolygones = composition.couches.map((k) => couchesConnues.get(k.coucheId)).filter((c): c is CoucheRecue => !!c && c.typeGeometrie === "polygone");

  const exporter = async (analyseIds: string[]) => {
    const r = await api.exporter(carte!.id, carte!.revision, analyseIds);
    if (r.etat !== "autorise") return r;
    if (!moteur.current) throw new Error("Export autorisé, mais la carte n'est pas affichée (WebGL indisponible) : seule la fiche de sources est produite.");
    const complet = await moteur.current.attendreChargement(10_000);
    if (!complet) throw new Error("Toutes les tuiles ne sont pas chargées : export interrompu pour ne pas produire une image incomplète. Réessayez.");
    const legendes = [...compositionAffichee.couches].reverse().filter((k) => k.visible).map((k) => {
      const c = couchesConnues.get(k.coucheId);
      if (k.style.mode === "simple") return { titre: c?.titre ?? k.coucheId, entrees: null, couleur: k.style.couleur };
      if (k.style.mode === "categories") return { titre: c?.titre ?? k.coucheId, entrees: entreesCategories(categories.get(k.coucheId) ?? []), sansEffectif: true };
      if (k.style.mode === "raster") return { titre: `${c?.titre ?? k.coucheId}${c?.raster ? ` — ${c.raster.grandeur}${c.raster.unite ? ` (${c.raster.unite})` : ""}` : ""}`, entrees: c?.raster ? entreesRaster(c.raster) : null, sansEffectif: true };
      const vs = [...(valeurs.get(k.style.indicateurId)?.values() ?? [])];
      const ind = c?.indicateurs.find((i) => i.id === (k.style.mode === "thematique" ? k.style.indicateurId : ""));
      return { titre: `${c?.titre ?? k.coucheId}${ind ? ` — ${ind.titre} (${ind.unite})` : ""}`, entrees: legende(vs, k.style.seuils, k.style.couleurs, (x) => formatNombre(x, Math.abs(x) >= 100 ? 0 : 2)) };
    });
    const png = await composerPng({ carte: moteur.current.canevas(), titre: carte!.nom, date: new Date(), metresParPixel: moteur.current.metresParPixel(), legendes, attributions: r.attributions, revision: r.carteRevision });
    telecharger(png, `geodata-${carte!.nom.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 60)}-r${r.carteRevision}.png`);
    return r;
  };

  const clavier = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      if (outil !== "navigation" && trace) { moteur.current?.annulerTrace(); setTrace(null); e.stopPropagation(); }
      else if (menuOuvert) setMenuOuvert(false);
      else if (resultats) setResultats(null);
      else if (volet && estTelephone()) setVolet(null);
    }
    if (e.key === "Enter" && outil !== "navigation" && outil !== "annotation" && (e.target as HTMLElement).classList.contains("maplibregl-canvas")) moteur.current?.terminerTrace();
  };

  return (
    <div ref={racine} className="geodata-page" style={{ height: `calc(100dvh - ${hauteurHaut}px)` }} onKeyDown={clavier} data-geodata-page>
      <p className="sr-only" role="status" aria-live="polite">{annonce}</p>
      <header className="gd-barre" aria-label="Barre de GeoData">
        <form className="gd-recherche" role="search" onSubmit={(e) => { e.preventDefault(); void lancerRecherche(); }}>
          <label className="sr-only" htmlFor="gd-recherche">Rechercher un territoire</label>
          <input id="gd-recherche" type="search" placeholder="Commune, région, code, ou lon … lat …" value={recherche} onChange={(e) => setRecherche(e.target.value)} autoComplete="off" data-gd-recherche />
          <button type="submit">Rechercher</button>
          {(resultats || avisRecherche) && (
            <div className="gd-resultats" role="region" aria-label="Résultats de la recherche">
              {avisRecherche && <p className="gd-discret">{avisRecherche}</p>}
              <ul>{resultats?.map((r, i) => <li key={i}><button type="button" onClick={() => choisirResultat(r)} data-gd-resultat={r.type === "unite" ? r.code : "coordonnees"}><strong translate="no">{r.libelle}</strong><span className="gd-discret" translate="no">{r.type === "unite" ? `${r.coucheTitre}${r.niveau ? ` · ${r.niveau}` : ""}` : r.provenance}</span></button></li>)}</ul>
              <button type="button" onClick={() => { setResultats(null); setAvisRecherche(null); }}>Fermer les résultats</button>
            </div>
          )}
        </form>
        <label className="gd-champ gd-fond">Fond
          <select value={composition.fond} onChange={(e) => setComposition((c) => ({ ...c, fond: e.target.value }))} data-gd-fond>
            {(espace ? fondsDisponibles : [fond]).map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
            {!fondTrouve && composition.fond !== fond.id && <option value={composition.fond} disabled>Fond enregistré indisponible dans ce navigateur</option>}
            {fondsNav.sansCle.map((f) => <option key={f.fournisseurId} value="" disabled>{`${f.nom} — clé absente (Paramètres)`}</option>)}
          </select>
        </label>
        <a className="gd-lien-fonds" href="/parametres#settings-fournisseurs" title="Saisir ou modifier les fournisseurs de fonds de carte (Paramètres)" data-gd-fournisseurs>Fournisseurs</a>
        <div className="gd-enregistrement" data-gd-etat-enregistrement={etat.etat}>
          <span role="status" translate="no">{carte ? <strong>{carte.nom}</strong> : null}</span>
          <span role="status">{LIBELLES_ENREGISTREMENT[etat.etat]}</span>
          <button type="button" onClick={() => void enregistrer()} disabled={etat.etat === "enregistrement" || etat.etat === "enregistree"} data-gd-enregistrer>Enregistrer</button>
        </div>
        <div className="gd-menu">
          <button type="button" className="gd-hamburger" aria-label="Menu GeoData" title="Menu GeoData" aria-expanded={menuOuvert} aria-controls="gd-menu-liste" onClick={() => setMenuOuvert(!menuOuvert)} data-gd-menu>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false"><path d={menuOuvert ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} /></svg>
          </button>
          {menuOuvert && (
            <ul id="gd-menu-liste" className="gd-menu-liste" aria-label="Espaces de travail GeoData">
              {(["donnees", "cartes", "etudes", "import", "export"] as const).map((v) => <li key={v}><button type="button" aria-pressed={volet === v} onClick={() => { setMenuOuvert(false); ouvrirVolet(v); }} data-gd-volet={v}>{LIBELLES_VOLETS[v]}</button></li>)}
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
        {panneauOuvert && <aside className="gd-panneau gd-ouvert" aria-label="Catalogue, couches et légende" data-gd-panneau>
          <div className="gd-onglets">
            <div role="tablist" aria-label="Panneau GeoData" className="gd-liste-onglets">
              {(["catalogue", "couches", "legende"] as const).map((o) => <button key={o} type="button" role="tab" id={`gd-onglet-${o}`} aria-selected={onglet === o} aria-controls="gd-panneau-contenu" onClick={() => ouvrirOnglet(o)} data-gd-onglet={o}>{({ catalogue: "Catalogue", couches: `Couches (${composition.couches.length})`, legende: "Légende" })[o]}</button>)}
            </div>
            <button type="button" className="gd-replier" onClick={() => setPanneauOuvert(false)} data-gd-fermer-panneau>Fermer</button>
          </div>
          <div id="gd-panneau-contenu" role="tabpanel" aria-labelledby={`gd-onglet-${onglet}`} className="gd-contenu">
              {onglet === "catalogue" && <PanneauCatalogue rangement={rangementCatalogue} couches={catalogue} erreur={erreurCatalogue} composition={composition} onRecharger={chargerCatalogue} onAjouter={(c) => { setComposition((x) => ajouterCouche(x, c.id, c.version.id, c.styleDefaut)); setAnnonce(`Couche « ${c.titre} » ajoutée.`); const e = empriseDe(c.emprise?.coordinates); if (e && !composition.couches.length) moteur.current?.allerA({ emprise: e }); }} />}
              {onglet === "couches" && <PanneauCouches composition={composition} couches={couchesConnues} disponibilite={disponibilite} valeursDe={valeursDe}
                onVisibilite={(id) => setComposition((c) => basculerVisibilite(c, id))} onOpacite={(id, o) => setComposition((c) => definirOpacite(c, id, o))}
                onDeplacer={(id, s) => setComposition((c) => deplacerCouche(c, id, s))} onRetirer={(id) => setComposition((c) => retirerCouche(c, id))} onStyle={changerStyle} onTable={setCoucheTable} />}
              {onglet === "legende" && <PanneauLegende composition={composition} couches={couchesConnues} valeurs={valeurs} categories={categories} onStyle={changerStyle} />}
          </div>
        </aside>}
        <main className="gd-carte" aria-label="Carte" data-gd-zoom={composition.camera.zoom.toFixed(2)}>
          <div ref={conteneurCarte} className="gd-moteur" data-gd-moteur />
          <button type="button" className="gd-bouton-donnees" aria-pressed={panneauOuvert && onglet === "catalogue"} onClick={basculerDonnees} data-gd-donnees>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M12 3 3 8l9 5 9-5-9-5ZM3 12l9 5 9-5M3 16l9 5 9-5" /></svg>
            <span>Données</span>
          </button>
          {(navigationPossible || chemin.length > 0) && <FilNiveaux chemin={chemin} onAller={allerAuNiveau} onRetour={remonter} />}
          <BarreOutilsCarte outil={outil} pleinEcran={pleinEcran} legendeOuverte={panneauOuvert && onglet === "legende"} carteDisponible={!erreurCarte}
            onZoom={(d) => moteur.current?.zoomer(d)} onNord={() => moteur.current?.orienterNord()} onPosition={localiser} onPleinEcran={basculerPleinEcran} onOutil={choisirOutil} onLegende={basculerLegende} />
          {chargementMoteur && <p role="status" className="gd-sur-carte">Chargement de la carte…</p>}
          {avisFond && <div role="status" className="gd-sur-carte gd-alerte" data-gd-avis-fond><p>{avisFond}</p><div className="gd-actions"><button type="button" onClick={() => setComposition((c) => ({ ...c, fond: "neutre" }))}>Fond neutre</button><button type="button" onClick={() => setAvisFond(null)}>Fermer</button></div></div>}
          {erreurCarte && <div role="alert" className="gd-sur-carte gd-alerte" data-gd-erreur-carte><p>{erreurCarte}</p></div>}
          {trace && outil !== "navigation" && <p className="gd-sur-carte gd-mesure-carte" role="status">{trace.sommets.length < 2 ? "Cliquez sur la carte pour commencer." : (outil === "distance" || outil === "surface" || outil === "zone") ? "Tracé en cours — détails dans Études." : ""}</p>}
        </main>
        {volet && (
          <aside className="gd-volet gd-ouvert" aria-label={({ fiche: "Fiche d'information", valeur: "Valeur au point", donnees: "Données", cartes: "Mes cartes", etudes: "Études", import: "Importer", export: "Exporter" })[volet]} data-gd-volet-ouvert={volet}>
            <div className="gd-ligne-titre"><h2>{({ fiche: "Fiche d'information", valeur: "Valeur au point", donnees: "Données : catégories et couches", cartes: "Mes cartes", etudes: "Études", import: "Importer des données", export: "Exporter" })[volet]}</h2><button type="button" onClick={() => setVolet(null)}>Fermer</button></div>
            {volet === "valeur" && valeurPoint && <FicheValeur {...valeurPoint} onFermer={() => { setVolet(null); setValeurPoint(null); }} />}
            {volet === "fiche" && <FicheObjet descendre={(() => { const r = descentePossible(fiche); return r && fiche ? { libelle: `Voir ses ${LIBELLES_ENFANTS[(r + 1) as RangAdministratif]}`, onDescendre: () => descendre(fiche) } : null; })()} fiche={fiche} chargement={ficheEtat.chargement} erreur={ficheEtat.erreur} onFermer={() => { setVolet(null); setSelection(null); }} onCentrer={(f) => { const e = empriseDe(f.emprise.coordinates); if (e) moteur.current?.allerA({ emprise: e }); }} />}
            {volet === "donnees" && <GestionDonnees rangement={rangement} erreur={erreurRangement} couches={catalogue} onChange={chargerRangement} />}
            {volet === "cartes" && <MesCartes carte={carte} nouvelle={!carte} onOuvrir={(id) => void ouvrirCarte(id)} onCarteModifiee={(c) => { setCarte(c); setEtatForce(null); }}
              onNouvelle={() => { setCarte(null); setComposition(compositionNeuve(composition.camera)); setEtatForce(null); ecrireLocal(CLE_DERNIERE_CARTE, null); }}
              onEnregistrerSous={async (nom, collectionId) => { const c = await api.creerCarte(nom, composition, collectionId); setCarte(c); setComposition(c.composition); setEtatForce(null); ecrireLocal(CLE_DERNIERE_CARTE, c.id); setAnnonce(`Carte « ${c.nom} » enregistrée.`); }} />}
            {volet === "etudes" && <Etudes outil={outil} trace={trace} tracePret={tracePret} couchesPolygones={couchesPolygones} zones={zones} onOutil={setOutil}
              onTerminer={() => moteur.current?.terminerTrace()} onAnnulerTrace={() => { moteur.current?.annulerTrace(); setTrace(null); setTracePret(null); }} onZonesChangees={chargerZones}
              onCentrer={(g) => { const e = empriseGeometrie(g); if (e) moteur.current?.allerA({ emprise: e }); }} />}
            {volet === "import" && <Import onCoucheImportee={async (id) => { const c = await api.couche(id); connaitre([c]); chargerCatalogue(); setComposition((x) => ajouterCouche(x, c.id, c.version.id, c.styleDefaut)); const e = empriseDe(c.emprise?.coordinates); if (e) moteur.current?.allerA({ emprise: e }); }} />}
            {volet === "export" && <Export carte={carte} enregistree={etat.etat === "enregistree"} analyses={analysesIds} onExporter={exporter} />}
          </aside>
        )}
      </div>
      {coucheDeTable && <div className="gd-tiroir"><TableAttributs couche={coucheDeTable} filtreActif={composition.couches.find((k) => k.coucheId === coucheDeTable.id)?.filtre ?? null}
        onFiltre={(f: FiltreCouche | null) => setComposition((c) => definirFiltre(c, coucheDeTable.id, f))} onFermer={() => setCoucheTable(null)}
        onSelection={(code) => { setSelection({ coucheId: coucheDeTable.id, code }); void ouvrirFiche(coucheDeTable.id, code).then(() => undefined); }} /></div>}
    </div>
  );
}

export default PageGeoData;
