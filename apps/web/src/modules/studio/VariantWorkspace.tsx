/**
 * Espace de travail d'une variante (Studio V1) : planche 2D construite depuis `STUDIO_TOOLS`, brouillon local
 * (commandes appliquées aussitôt par `applyStudioCommands`, annuler / rétablir sur instantanés locaux), enregistrement
 * explicite par enveloppe de commandes (`studio-commands/1`) sur la révision de tête, garde de navigation, plein écran.
 * Vue : zoom à la molette centré sur le pointeur, boutons et touches de zoom, panoramique (bouton du milieu, Espace +
 * glisser, deux doigts). Sélection multiple : clic, Maj + clic, rectangle fenêtre / capture, Ctrl+A, Échap ; glisser la
 * sélection produit une commande `studio.dessin.deplacer` par objet au relâchement (aperçu pendant le geste), accrochage
 * aux sommets et à la grille. Catalogue « Outils » et palette (Ctrl+K) lus dans le registre ; exports SVG / DXF / IFC par
 * lien de téléchargement. Monté par `StudioShell` ; une révision historique (`?revision=`) s'ouvre en lecture seule.
 * Le serveur reste seul juge du droit d'écriture (`canWrite`). Annuler ne porte que sur les modifications non
 * enregistrées : aucune annulation côté serveur n'est simulée. La vue n'est jamais une donnée du document.
 * Volume : extrusion déclarée de la sélection (`studio.objet.extruder` / `studio.objet.aplatir`, valeurs saisies
 * seulement) et « Vue 3D » (Maj+D), chargée à la demande, du brouillon courant.
 * Présentation : « Feuille » (Maj+P) compose la révision affichée sur une feuille ISO (format, échelle, cartouche
 * prérempli par les données réelles), l'imprime à sa taille réelle ou la télécharge en SVG / PDF ; lecture seule admise.
 * Import : « Importer DXF » (Maj+U) ajoute au brouillon, en un lot annulable, les commandes lues par `lireDxfStudio` ;
 * l'enregistrement découpe les commandes en attente en enveloppes de 500 commandes au plus (`import/envoi.ts`).
 * Courbes : Cercle (C : centre puis un point du cercle), Arc (A : trois points, ou centre, début et fin selon le mode
 * choisi dans le panneau), Polyligne (P : sommets successifs ; Entrée la termine, Maj+Entrée ou un clic sur le premier
 * sommet la ferme) ; Décaler (O) crée, pour chaque objet sélectionné, son décalé à la distance saisie (`studio.dessin.decaler`).
 * Les constructions par points sont pures (`studioArcFromThreePoints`, `studioArcFromCenter`) ; l'aperçu n'est jamais
 * une donnée du document.
 */
import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type PointerEvent } from "react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyStudioCommands, STUDIO_DEFAULT_LAYER_ID, STUDIO_TOOLS, studioAngleNormal, studioArcFromCenter, studioArcFromThreePoints,
  type StudioArcGeometry, type StudioCommand, type StudioDimension, type StudioLayer, type StudioPoint, type StudioShape,
} from "@parcours/atelier-model";
import { Icon } from "../../components/Icon";
import { api, ApiError, studioExportUrl, type StudioContext } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { LANGUE, LOCALE } from "../../lib/i18n";
import { cheminComparaisonStudio, cheminProjetStudio, cheminVarianteStudio } from "./routes-studio";
import { StudioRefus } from "./studio-ecrans";
import { BarreOutils } from "./planche2d/BarreOutils";
import {
  annulerBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, messageRefus,
  peutAnnuler, peutRetablir, retablirBrouillon, type Brouillon,
} from "./planche2d/brouillon";
import { commandeReglage, estVisible, layerIdPour, listeCalques, prochainNomCalque } from "./planche2d/calques";
import type { EntreeCatalogue } from "./planche2d/catalogue";
import { GestionnaireOutils, PaletteCommandes } from "./planche2d/CatalogueOutils";
import { Dessin2D, type PointPose, type RectangleSelection } from "./planche2d/Dessin2D";
import {
  accrocher, auCentimetre, CADRE_INITIAL, cadrer, ecrireSommets, emprise, formaterMetres, lireSommets, nouvelleCote, pointsAccroche, sommetExact, valeurCote, type Cadre,
} from "./planche2d/geometrie-2d";
import { PanneauCalques } from "./planche2d/PanneauCalques";
import {
  actifDansUnChamp, cibleRaccourci, combinaison, COMMANDES_EDITEUR, OUTILS_MODES, OUTILS_TRACE,
  type CibleRaccourci, type CommandeEditeur, type IdCommandeEditeur, type StudioToolEntry, type StudioToolId,
} from "./planche2d/raccourcis";
import { ajouter, basculer, commandesDeplacement, modeRectangle, selectionParRectangle, selectionValide, toutSelectionnable } from "./planche2d/selection";
import { ecranVersPlanche, facteurMolette, glisserVue, LARGEUR_VUE, pasGrille, pincer, surGrille, zoomer, zoomerAuCentre, type Rect } from "./planche2d/vue";
import { commandesAplatir, commandesExtrusion, formesSelectionnees, valeursDe, VALEURS_VIDES, type ValeursExtrusion } from "./vue3d/extrusion";
import { FormulaireExtrusion } from "./vue3d/FormulaireExtrusion";
import { cartoucheInitial } from "./feuille/feuille-ui";
import { PanneauFeuille } from "./feuille/PanneauFeuille";
import { PanneauCommentaires } from "./commentaires/PanneauCommentaires";
import { DialogueImportDxf } from "./import/DialogueImportDxf";
import { accuserLot, commandesNonEnvoyees, enveloppeSuivante, envoiPartiel, planEnvoi, type PlanEnvoi } from "./import/envoi";
import "./studio.css";
import "./planche2d/planche2d.css";

/** Vue 3D (three.js) chargée à la demande : le code 3D n'alourdit pas l'éditeur 2D. */
const chargerVue3D = () => import("./vue3d/Vue3DStudio").then((m) => ({ default: m.Vue3DStudio }));
let Vue3DStudio = lazy(chargerVue3D);

/** Un échec de la vue 3D (chargement, rendu) reste local : le brouillon 2D non enregistré est conservé. */
class LimiteVue3D extends Component<{ children: ReactNode }, { erreur: boolean }> {
  state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  // Refermer puis rouvrir la vue 3D relance un chargement neuf (React.lazy garderait l’échec).
  componentDidCatch() { Vue3DStudio = lazy(chargerVue3D); }
  render() { return this.state.erreur ? <p role="alert">Vue 3D indisponible. Le dessin et ses modifications non enregistrées sont conservés ; refermez puis rouvrez la vue 3D pour réessayer.</p> : this.props.children; }
}

const warning = () => LANGUE === "en" ? "Unsaved or unconfirmed changes. Leave this study?" : "Modifications non enregistrées ou non confirmées. Quitter cette étude ?";
const refused = (e: unknown) => e instanceof ApiError && [401, 403, 404].includes(e.status);
/** Tolérance d'accrochage, en pixels d'écran. */
const ACCROCHE_PX = 12;
/** Au-delà de ce déplacement du pointeur (pixels), un appui devient un geste (rectangle, glisser) et non un clic. */
const SEUIL_GESTE_PX = 4;
/** Écart arrondi au micromètre : le pointeur et les sommets ne produisent pas de bruit flottant dans les commandes. */
const ecart = (a: number, b: number) => Math.round((b - a) * 1e6) / 1e6;

type Valeurs = { x: number; y: number; a: number; b: number; dx: number; dy: number; offset: number; r: number; a0: number; a1: number; distance: number };
/** Mode de construction de l'arc : trois points (début, passage, fin) ou centre, début et fin (sens trigonométrique). */
type ModeArc = "trois-points" | "centre";
/** Arrondi au micromètre (rayons, coordonnées issues d'une construction) : pas de bruit flottant dans les commandes. */
const micro = (v: number) => Math.round(v * 1e6) / 1e6;
const enDegres = (a: number) => Math.round(((a * 180) / Math.PI) * 1e6) / 1e6;
const enRadians = (d: number) => studioAngleNormal((d * Math.PI) / 180);
type Ecran = { x: number; y: number };
type Geste =
  | { type: "vue"; cadre0: Cadre; rect0: Rect; depart: Map<number, StudioPoint> }
  | { type: "rectangle"; id: number; debut: StudioPoint; ecran: Ecran; ajouter: boolean; actif: boolean }
  | { type: "glisser"; id: number; base: PointPose; ids: string[]; ecran: Ecran; actif: boolean };

/** Zone de contenu du `<svg>` à l'écran (sans sa bordure). */
function rectContenu(svg: SVGSVGElement): Rect {
  const b = svg.getBoundingClientRect();
  return { left: b.left + svg.clientLeft, top: b.top + svg.clientTop, width: svg.clientWidth || b.width, height: svg.clientHeight || b.height };
}

/** `commentairesOuverts` : panneau des commentaires ouvert à l'arrivée (adresse `?commentaires=ouverts`, lien de notification). */
export interface VariantWorkspaceProps { projectId: string; studyId: string; variantId: string; revisionId: string | null; commentairesOuverts?: boolean }

export function VariantWorkspace({ projectId, studyId, variantId, revisionId, commentairesOuverts = false }: VariantWorkspaceProps) {
  const client = useQueryClient();
  const [context, setContext] = useState<StudioContext | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [tool, setTool] = useState<StudioToolId>("studio.dessin.selection");
  const [selection, setSelection] = useState<string[]>([]);
  const [trace, setTrace] = useState<PointPose | null>(null);
  // Points posés après le premier : passage ou début d'un arc, sommets suivants d'une polyligne.
  const [suite, setSuite] = useState<StudioPoint[]>([]);
  const [modeArc, setModeArc] = useState<ModeArc>("trois-points");
  const [sommetsTexte, setSommetsTexte] = useState("0 0; 4 0; 4 3");
  const [fermee, setFermee] = useState(false);
  const [survol, setSurvol] = useState<PointPose | null>(null);
  const [cadre, setCadre] = useState<Cadre>(CADRE_INITIAL);
  const [accrocheSommets, setAccrocheSommets] = useState(true);
  const [accrocheGrille, setAccrocheGrille] = useState(false);
  const [rectangle, setRectangle] = useState<RectangleSelection | null>(null);
  const [apercu, setApercu] = useState<{ ids: string[]; dx: number; dy: number } | null>(null);
  const [dialogue, setDialogue] = useState<"outils" | "palette" | "feuille" | "import-dxf" | null>(null);
  const { user } = useAuth();
  const [calqueActif, setCalqueActif] = useState<string>(STUDIO_DEFAULT_LAYER_ID);
  const [nomCalque, setNomCalque] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Valeurs>({ x: 0, y: 0, a: 4, b: 3, dx: 1, dy: 0, offset: 0.5, r: 1, a0: 0, a1: 90, distance: 0.5 });
  const [extrusion, setExtrusion] = useState<ValeursExtrusion>(VALEURS_VIDES);
  const [vue3d, setVue3d] = useState(false);
  const [commentaires, setCommentaires] = useState(commentairesOuverts);
  const envelope = useRef<PlanEnvoi | null>(null);
  // Contexte rendu par le dernier lot confirmé : base du brouillon si un lot suivant est refusé.
  const dernierAccuse = useRef<StudioContext | null>(null);
  const alive = useRef(true), dirty = useRef(false), saving = useRef(false);
  const clavier = useRef<(e: KeyboardEvent) => void>(() => {});
  const relacher = useRef<(e: KeyboardEvent) => void>(() => {});
  const molette = useRef<(e: WheelEvent) => void>(() => {});
  const sheet = useRef<SVGSVGElement | null>(null), shell = useRef<HTMLElement>(null), nomRef = useRef<HTMLInputElement>(null);
  const cadreRef = useRef<Cadre>(CADRE_INITIAL);
  const geste = useRef<Geste | null>(null);
  const pointeurs = useRef(new Map<number, Ecran>());
  const clicSupprime = useRef(false);
  const espace = useRef({ tenu: false, panoramique: false });
  const historical = revisionId !== null;
  const drawing = brouillon ? documentBrouillon(brouillon) : null;
  const commands = brouillon ? commandesEnAttente(brouillon) : [];
  dirty.current = commands.length > 0 || !!trace || pending || uncertain;
  const writable = !historical && !!context?.canWrite && !pending && !uncertain && !blocked;
  // Données réelles du cartouche de la feuille (mêmes clés que le fil d'Ariane et l'historique : cache partagé).
  const projet = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry: (n, e) => !refused(e) && n < 1, enabled: !!context });
  const revisionsFeuille = useQuery({ queryKey: ["studio-revisions", projectId, studyId, variantId], queryFn: () => api.studioRevisions(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1, enabled: dialogue === "feuille" });
  const revisionAffichee = revisionsFeuille.data?.revisions.find(r => r.id === context?.revision.id);

  useEffect(() => {
    alive.current = true;
    let active = true;
    const read = revisionId === null ? api.studioContext(projectId, studyId, variantId) : api.studioRevision(projectId, studyId, variantId, revisionId);
    void read.then(c => { if (active) { setContext(c); setBrouillon(creerBrouillon(c.revision.document)); } }).catch((e: unknown) => { if (active) { setLoadError(e); setError(refused(e) ? "" : "Étude indisponible ou accès refusé."); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; alive.current = false; };
  }, [projectId, studyId, variantId, revisionId]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    // Un lien de téléchargement (export) ne quitte pas l'étude : aucune confirmation.
    const click = (e: globalThis.MouseEvent) => { const link = (e.target as Element).closest?.("a[href]"); if (dirty.current && link && !link.hasAttribute("download") && !link.getAttribute("href")?.startsWith("#") && !window.confirm(warning())) { e.preventDefault(); e.stopPropagation(); } };
    let currentIndex = Number(history.state?.idx ?? 0), restoring = false;
    const back = (e: PopStateEvent) => {
      const target = Number(e.state?.idx ?? currentIndex);
      if (restoring) { restoring = false; e.stopImmediatePropagation(); return; }
      if (dirty.current && !window.confirm(warning())) { e.stopImmediatePropagation(); restoring = true; history.go(currentIndex - target || 1); }
      else currentIndex = target;
    };
    const keys = (e: KeyboardEvent) => clavier.current(e);
    const keysUp = (e: KeyboardEvent) => relacher.current(e);
    const blur = () => { espace.current = { tenu: false, panoramique: false }; };
    window.addEventListener("popstate", back, true); window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true); window.addEventListener("keydown", keys); window.addEventListener("keyup", keysUp); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("popstate", back, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); window.removeEventListener("keydown", keys); window.removeEventListener("keyup", keysUp); window.removeEventListener("blur", blur); };
  }, []);
  // La molette doit empêcher le défilement de la page : écouteur natif non passif.
  const ecouteMolette = useRef((e: WheelEvent) => molette.current(e)).current;
  const refPlanche = useCallback((el: SVGSVGElement | null) => {
    sheet.current?.removeEventListener("wheel", ecouteMolette);
    sheet.current = el;
    el?.addEventListener("wheel", ecouteMolette, { passive: false });
  }, [ecouteMolette]);

  // ——— Sélection et calques (lectures dérivées du brouillon) ———
  const selectionIds = drawing ? selectionValide(drawing, selection) : [];
  const selectionSet = new Set(selectionIds);
  const itemDe = (id: string | undefined) => (id && drawing ? drawing.objects.find(o => o.id === id) ?? drawing.dimensions?.find(d => d.id === id) ?? null : null);
  const selected = selectionIds.length === 1 ? itemDe(selectionIds[0]) : null;
  const calques = drawing ? listeCalques(drawing) : [];
  const actif = calques.find(c => c.id === calqueActif) ?? calques[0];
  // Le champ de renommage reprend le nom du calque actif quand celui-ci change (choix, création, annulation).
  useEffect(() => { if (actif) setNomCalque(actif.name); }, [actif?.id, actif?.name]);
  // Aperçu du glisser : le document tel que le relâchement le donnerait (les cotes liées suivent).
  const apercuDoc = useMemo(() => {
    if (!drawing || !apercu) return null;
    const { commandes } = commandesDeplacement(drawing, apercu.ids, apercu.dx, apercu.dy);
    if (!commandes.length) return null;
    try { return applyStudioCommands(drawing, commandes); } catch { return null; }
  }, [drawing, apercu]);

  function properties(o: StudioShape | StudioDimension) {
    // Les valeurs d'extrusion affichées sont celles que l'utilisateur a saisies pour cet objet, jamais une proposition.
    const saisies = o.type === "dimension" ? null : valeursDe(o);
    setExtrusion(saisies ?? VALEURS_VIDES);
    switch (o.type) {
      case "rectangle": setValues(v => ({ ...v, x: o.origin.x, y: o.origin.y, a: o.width, b: o.height })); return;
      case "circle": setValues(v => ({ ...v, x: o.center.x, y: o.center.y, r: o.radius })); return;
      case "arc": setValues(v => ({ ...v, x: o.center.x, y: o.center.y, r: o.radius, a0: enDegres(o.startAngle), a1: enDegres(o.endAngle) })); return;
      case "polyline": setSommetsTexte(ecrireSommets(o.points)); setFermee(o.closed); return;
      default: setValues(v => ({ ...v, x: o.start.x, y: o.start.y, a: o.end.x, b: o.end.y, ...(o.type === "dimension" ? { offset: o.offset } : {}) }));
    }
  }
  function select(ids: string[]) {
    setSelection(ids);
    const o = ids.length === 1 ? itemDe(ids[0]) : null;
    if (o) properties(o);
    else if (ids.length > 1) {
      // Sélection multiple : des valeurs d'extrusion ne s'affichent que si tous les objets ont exactement les mêmes.
      const valeurs = ids.map((id) => { const x = itemDe(id); return x && x.type !== "dimension" ? JSON.stringify(valeursDe(x)) : "null"; });
      setExtrusion(new Set(valeurs).size === 1 && valeurs[0] !== "null" ? JSON.parse(valeurs[0]!) as ValeursExtrusion : VALEURS_VIDES);
    }
  }

  /** Applique un lot localement (un pas d'historique) ; rien n'est envoyé avant « Enregistrer ». */
  function apply(cs: StudioCommand[]): boolean {
    if (!brouillon || !writable) return false;
    try {
      const next = appliquerBrouillon(brouillon, cs);
      setBrouillon(next);
      const doc = documentBrouillon(next);
      const seul = selectionIds.length === 1 ? selectionIds[0] : undefined;
      const updated = seul ? doc.objects.find(o => o.id === seul) ?? doc.dimensions?.find(d => d.id === seul) : undefined;
      if (updated) properties(updated);
      setSaved(false); setError(""); setInfo("");
      return true;
    } catch (e) { setError(messageRefus(e)); return false; }
  }
  const layerId = () => layerIdPour(actif?.id ?? STUDIO_DEFAULT_LAYER_ID);
  function addShape(start: StudioPoint, end: StudioPoint) {
    if (tool === "studio.dessin.rectangle") {
      const shape: StudioShape = { id: crypto.randomUUID(), type: "rectangle", ...(layerId() ? { layerId: layerId() } : {}), origin: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }, width: Math.abs(ecart(start.x, end.x)), height: Math.abs(ecart(start.y, end.y)) };
      return apply([{ toolId: "studio.dessin.rectangle", params: shape }]);
    }
    return apply([{ toolId: "studio.dessin.ligne", params: { id: crypto.randomUUID(), type: "line", ...(layerId() ? { layerId: layerId() } : {}), start, end } }]);
  }
  const calque = () => (layerId() ? { layerId: layerId() } : {});
  function addCircle(center: StudioPoint, radius: number) {
    if (!(radius > 0)) { setError("Le rayon doit être strictement positif."); return false; }
    return apply([{ toolId: "studio.dessin.cercle", params: { id: crypto.randomUUID(), type: "circle", ...calque(), center: { ...center }, radius: micro(radius) } }]);
  }
  function addArc(g: StudioArcGeometry | null) {
    if (!g) { setError("Arc impossible : points alignés ou confondus."); return false; }
    return apply([{ toolId: "studio.dessin.arc", params: { id: crypto.randomUUID(), type: "arc", ...calque(), center: { x: micro(g.center.x), y: micro(g.center.y) }, radius: micro(g.radius), startAngle: g.startAngle, endAngle: g.endAngle } }]);
  }
  function addPolyline(points: readonly StudioPoint[], closed: boolean) {
    return apply([{ toolId: "studio.dessin.polyligne", params: { id: crypto.randomUUID(), type: "polyline", ...calque(), points: points.map(p => ({ ...p })), closed } }]);
  }
  /** Termine la polyligne en cours (ouverte, ou fermée sur son premier sommet). */
  function finishPolyline(closed: boolean) {
    if (tool !== "studio.dessin.polyligne" || !trace) return;
    const points = [trace.point, ...suite];
    if (points.length < (closed ? 3 : 2)) { setError(closed ? "Une polyligne fermée a trois sommets au moins." : "Une polyligne a deux sommets au moins."); return; }
    if (addPolyline(points, closed)) cancelTrace();
  }
  /** Décalage de chaque objet sélectionné (les cotes ne se décalent pas) ; les nouveaux objets deviennent la sélection. */
  function offsetSelection(distance: number) {
    if (!drawing) return;
    const formes = formesSelectionnees(drawing, selectionIds);
    if (!formes.length) { setInfo("Sélectionnez d’abord l’objet à décaler."); return; }
    if (!(Number.isFinite(distance) && distance !== 0)) { setError("Saisissez une distance non nulle, en mètres."); return; }
    const nouveaux = formes.map(() => crypto.randomUUID());
    if (apply(formes.map((o, i) => ({ toolId: "studio.dessin.decaler", params: { id: o.id, newId: nouveaux[i]!, distance } })))) setSelection(nouveaux);
  }
  function addDimension(debut: PointPose, fin: PointPose) {
    return apply([{ toolId: "studio.dessin.cote", params: nouvelleCote(crypto.randomUUID(), debut, fin, Number.isFinite(values.offset) ? values.offset : 0.5, layerId()) }]);
  }
  /** Déplacement de toute la sélection : une commande par objet, un seul pas d'historique. */
  function moveSelection(ids: readonly string[], dx: number, dy: number): boolean {
    if (!drawing) return false;
    const { commandes, cotesLiees } = commandesDeplacement(drawing, ids, dx, dy);
    if (!commandes.length) { if (cotesLiees.length) setInfo("Les cotes liées suivent leurs objets : elles ne se déplacent pas seules."); return cotesLiees.length === 0; }
    const ok = apply(commandes);
    if (ok && cotesLiees.length) setInfo("Les cotes liées suivent leurs objets : elles ne se déplacent pas seules.");
    return ok;
  }

  // ——— Vue : zoom et panoramique (jamais une commande) ———
  function poserCadre(c: Cadre) { cadreRef.current = c; setCadre(c); }
  molette.current = (e: WheelEvent) => {
    const svg = sheet.current; if (!svg) return;
    e.preventDefault();
    const c = cadreRef.current;
    poserCadre(zoomer(c, ecranVersPlanche(c, rectContenu(svg), { x: e.clientX, y: e.clientY }), facteurMolette(e.deltaY, e.deltaMode)));
  };
  function demarrerVue(svg: SVGSVGElement) {
    const cadre0 = cadreRef.current, rect0 = rectContenu(svg);
    geste.current = { type: "vue", cadre0, rect0, depart: new Map([...pointeurs.current].map(([id, s]) => [id, ecranVersPlanche(cadre0, rect0, s)])) };
  }
  function annulerGeste() { geste.current = null; setRectangle(null); setApercu(null); setSurvol(null); }

  // ——— Planche : pointeur, accrochage ———
  const moveWithPointer = tool === "studio.dessin.deplacer" && selectionIds.length > 0;
  const pointsActifs = OUTILS_TRACE.has(tool) || moveWithPointer;
  const pas = pasGrille(cadre);
  function brut(e: { clientX: number; clientY: number }): StudioPoint | null {
    const matrix = sheet.current?.getScreenCTM(); if (!matrix) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    return { x: p.x, y: p.y };
  }
  /** Point posé : sommet accroché (hors `exclure`), sinon nœud de grille, sinon arrondi au centimètre. */
  function pose(e: { clientX: number; clientY: number }, exclure?: ReadonlySet<string>): PointPose | null {
    const matrix = sheet.current?.getScreenCTM(); if (!matrix || !drawing) return null;
    const raw = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const tolerance = ACCROCHE_PX / Math.max(Math.abs(matrix.a), 1e-9);
    const visible = (l: string | undefined) => estVisible(drawing, l);
    const sources = exclure ? drawing.objects.filter(o => !exclure.has(o.id)) : drawing.objects;
    const accroche = accrocheSommets ? accrocher(pointsAccroche(sources, visible), raw, tolerance) : null;
    return { point: accroche ? { ...accroche.point } : accrocheGrille ? surGrille(raw, pas) : auCentimetre(raw), accroche };
  }
  function board(e: MouseEvent<SVGSVGElement>) {
    if (!pointsActifs) { if (tool === "studio.dessin.selection" && !e.shiftKey) select([]); return; }
    if (!writable) return;
    const p = pose(e, tool === "studio.dessin.deplacer" && trace ? selectionSet : undefined); if (!p) return;
    if (!trace) { setTrace(p); setSuite([]); return; }
    const a = trace.point, b = p.point;
    if (tool === "studio.dessin.deplacer") {
      if (moveSelection(selectionIds, ecart(a.x, b.x), ecart(a.y, b.y))) { setTrace(null); setSurvol(null); }
      return;
    }
    if (tool === "studio.dessin.polyligne") {
      // Un clic sur le premier sommet (à la tolérance d'accrochage) ferme la polyligne.
      const matrix = sheet.current?.getScreenCTM();
      const tolerance = matrix ? ACCROCHE_PX / Math.max(Math.abs(matrix.a), 1e-9) : 0;
      if (suite.length >= 2 && Math.hypot(b.x - a.x, b.y - a.y) <= tolerance) { finishPolyline(true); return; }
      const dernier = suite[suite.length - 1] ?? a;
      if (dernier.x === b.x && dernier.y === b.y) { setError("Deux sommets consécutifs doivent être distincts."); return; }
      setSuite(s => [...s, b]); setError("");
      return;
    }
    if (a.x === b.x && a.y === b.y) { setError("Les deux points doivent être distincts."); return; }
    if (tool === "studio.dessin.cercle") { if (addCircle(a, Math.hypot(b.x - a.x, b.y - a.y))) cancelTrace(); return; }
    if (tool === "studio.dessin.arc") {
      const second = suite[0];
      if (!second) { setSuite([b]); setError(""); return; }
      if (second.x === b.x && second.y === b.y) { setError("Les deux points doivent être distincts."); return; }
      if (addArc(modeArc === "centre" ? studioArcFromCenter(a, second, b) : studioArcFromThreePoints(a, second, b))) cancelTrace();
      return;
    }
    if (tool === "studio.dessin.rectangle" && (a.x === b.x || a.y === b.y)) { setError("La largeur et la hauteur doivent être strictement positives."); return; }
    const ok = tool === "studio.dessin.cote" ? addDimension(trace, p) : addShape(a, b);
    if (ok) setTrace(null);
  }
  function hover(e: PointerEvent<SVGSVGElement>) {
    if (!pointsActifs) { if (survol) setSurvol(null); return; }
    setSurvol(pose(e, tool === "studio.dessin.deplacer" && trace ? selectionSet : undefined));
  }
  function pointerDown(e: PointerEvent<SVGSVGElement>) {
    clicSupprime.current = false;
    const svg = e.currentTarget;
    pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Deux doigts : panoramique et zoom ; le geste d'un doigt en cours est abandonné.
    if (e.pointerType === "touch" && pointeurs.current.size >= 2) { annulerGeste(); demarrerVue(svg); e.preventDefault(); return; }
    if (e.button === 1 || (e.button === 0 && espace.current.tenu)) {
      if (e.button === 0) espace.current.panoramique = true;
      demarrerVue(svg); svg.setPointerCapture?.(e.pointerId); e.preventDefault(); return;
    }
    if (e.button !== 0 || tool !== "studio.dessin.selection" || !drawing) return;
    const cible = (e.target as Element).closest?.("[data-studio-objet]");
    const id = cible?.getAttribute("data-studio-objet");
    const ecran = { x: e.clientX, y: e.clientY };
    if (id && cible?.hasAttribute("data-studio-selectionnable")) {
      // Maj + clic bascule l'objet ; en lecture seule, un objet se sélectionne mais ne se déplace pas.
      if (e.shiftKey || !writable) return;
      const base = pose(e); if (!base) return;
      geste.current = { type: "glisser", id: e.pointerId, base, ids: selectionSet.has(id) ? selectionIds : [id], ecran, actif: false };
      return;
    }
    const debut = brut(e); if (!debut) return;
    geste.current = { type: "rectangle", id: e.pointerId, debut, ecran, ajouter: e.shiftKey, actif: false };
  }
  function pointerMove(e: PointerEvent<SVGSVGElement>) {
    // Bouton relâché hors de la planche avant le seuil : le geste en attente et son pointeur sont oubliés (jamais de cadre fantôme).
    if (e.pointerType !== "touch" && e.buttons === 0) {
      pointeurs.current.delete(e.pointerId);
      if (geste.current && "id" in geste.current && geste.current.id === e.pointerId && !("actif" in geste.current && geste.current.actif)) geste.current = null;
      return;
    }
    if (pointeurs.current.has(e.pointerId)) pointeurs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = geste.current;
    if (g?.type === "vue") {
      const ids = [...g.depart.keys()].filter(id => pointeurs.current.has(id));
      const lire = (id: number) => ecranVersPlanche(g.cadre0, g.rect0, pointeurs.current.get(id)!);
      if (ids.length >= 2) poserCadre(pincer(g.cadre0, [g.depart.get(ids[0]!)!, g.depart.get(ids[1]!)!], [lire(ids[0]!), lire(ids[1]!)]));
      else if (ids.length === 1) poserCadre(glisserVue(g.cadre0, g.depart.get(ids[0]!)!, lire(ids[0]!)));
      return;
    }
    if (g && e.pointerId === g.id) {
      if (!g.actif && Math.hypot(e.clientX - g.ecran.x, e.clientY - g.ecran.y) > SEUIL_GESTE_PX) {
        g.actif = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (g.type === "glisser") select(g.ids);
      }
      if (!g.actif) return;
      if (g.type === "rectangle") { const fin = brut(e); if (fin) setRectangle({ debut: g.debut, fin, mode: modeRectangle(g.debut, fin) }); }
      else {
        const dest = pose(e, new Set(g.ids)); if (!dest) return;
        setApercu({ ids: g.ids, dx: ecart(g.base.point.x, dest.point.x), dy: ecart(g.base.point.y, dest.point.y) });
        setSurvol(dest);
      }
      return;
    }
    hover(e);
  }
  function pointerUp(e: PointerEvent<SVGSVGElement>) {
    pointeurs.current.delete(e.pointerId);
    const g = geste.current;
    if (!g) return;
    if (g.type === "vue") {
      // Un panoramique n'est jamais un clic ; un doigt restant reprend le panoramique.
      clicSupprime.current = true;
      if (e.type !== "pointercancel" && e.pointerType === "touch" && pointeurs.current.size > 0) demarrerVue(e.currentTarget);
      else geste.current = null;
      return;
    }
    if (e.pointerId !== g.id) return;
    geste.current = null;
    if (!g.actif) return;
    clicSupprime.current = true;
    if (e.type === "pointercancel" || !drawing) { annulerGeste(); return; }
    if (g.type === "rectangle") {
      const fin = brut(e) ?? g.debut;
      const ids = selectionParRectangle(drawing, g.debut, fin);
      select(g.ajouter ? ajouter(selectionIds, ids) : ids);
      setRectangle(null);
      return;
    }
    const dest = pose(e, new Set(g.ids));
    setApercu(null); setSurvol(null);
    if (dest) moveSelection(g.ids, ecart(g.base.point.x, dest.point.x), ecart(g.base.point.y, dest.point.y));
  }
  function clickCapture(e: MouseEvent<SVGSVGElement>) {
    if (!clicSupprime.current) return;
    clicSupprime.current = false;
    e.stopPropagation(); e.preventDefault();
  }

  // ——— Formulaire numérique ———
  /** Sommets saisis pour une polyligne ; message d'erreur et null si la saisie ne suffit pas. */
  function sommetsSaisis(): StudioPoint[] | null {
    const points = lireSommets(sommetsTexte);
    if (!points || points.length < (fermee ? 3 : 2)) { setError(`Saisissez ${fermee ? "trois" : "deux"} sommets au moins, « x y » séparés par des points-virgules.`); return null; }
    return points;
  }
  function numeric(e: FormEvent) {
    e.preventDefault();
    const entered = fields.map(k => values[k]);
    if (!entered.every(Number.isFinite)) { setError("Saisissez des nombres finis dans tous les champs."); return; }
    const rectangleSaisi = tool === "studio.dessin.rectangle" || tool === "studio.dessin.modifier" && selected?.type === "rectangle";
    if (rectangleSaisi && (values.a <= 0 || values.b <= 0)) { setError("La largeur et la hauteur doivent être strictement positives."); return; }
    if (fields.includes("r") && values.r <= 0) { setError("Le rayon doit être strictement positif."); return; }
    if (fields.includes("a0") && enRadians(values.a0) === enRadians(values.a1)) { setError("Les angles de début et de fin doivent être différents."); return; }
    if (tool === "studio.dessin.deplacer" && selectionIds.length) { moveSelection(selectionIds, values.dx, values.dy); return; }
    if (tool === "studio.dessin.decaler") { offsetSelection(values.distance); return; }
    if (tool === "studio.dessin.modifier" && selected) {
      if (selected.type === "dimension") { apply([{ toolId: "studio.dessin.modifier", params: { ...selected, offset: values.offset } }]); return; }
      let modifie: StudioShape;
      switch (selected.type) {
        case "line": modifie = { ...selected, start: { x: values.x, y: values.y }, end: { x: values.a, y: values.b } }; break;
        case "rectangle": modifie = { ...selected, origin: { x: values.x, y: values.y }, width: values.a, height: values.b }; break;
        case "circle": modifie = { ...selected, center: { x: values.x, y: values.y }, radius: values.r }; break;
        case "arc": modifie = { ...selected, center: { x: values.x, y: values.y }, radius: values.r, startAngle: enRadians(values.a0), endAngle: enRadians(values.a1) }; break;
        case "polyline": {
          const points = sommetsSaisis(); if (!points) return;
          // Les renflements ne se gardent que si le nombre de segments est inchangé.
          const { bulges, ...reste } = selected;
          const garde = bulges && bulges.length === (fermee ? points.length : points.length - 1) ? { bulges } : {};
          modifie = { ...reste, points, closed: fermee, ...garde };
        }
      }
      apply([{ toolId: "studio.dessin.modifier", params: modifie }]);
      return;
    }
    if (tool === "studio.dessin.cercle") { addCircle({ x: values.x, y: values.y }, values.r); return; }
    if (tool === "studio.dessin.arc") {
      addArc({ center: { x: values.x, y: values.y }, radius: values.r, startAngle: enRadians(values.a0), endAngle: enRadians(values.a1) });
      return;
    }
    if (tool === "studio.dessin.polyligne") { const points = sommetsSaisis(); if (points) addPolyline(points, fermee); return; }
    if (tool === "studio.dessin.cote" && drawing) {
      const sommets = pointsAccroche(drawing.objects, l => estVisible(drawing, l));
      const debut = { x: values.x, y: values.y }, fin = { x: values.a, y: values.b };
      addDimension({ point: debut, accroche: sommetExact(sommets, debut) }, { point: fin, accroche: sommetExact(sommets, fin) });
      return;
    }
    addShape({ x: values.x, y: values.y }, tool === "studio.dessin.rectangle" ? { x: values.x + values.a, y: values.y + values.b } : { x: values.a, y: values.b });
  }

  // ——— Outils et commandes ———
  function cancelTrace() { setTrace(null); setSuite([]); setSurvol(null); }
  function runTool(toolId: StudioToolId) {
    if (OUTILS_MODES.has(toolId)) { setTool(toolId); cancelTrace(); setInfo(""); return; }
    if (!writable || !drawing) return;
    if (toolId === "studio.dessin.supprimer") {
      if (!selectionIds.length) { setInfo("Sélectionnez d’abord l’objet à supprimer."); return; }
      if (apply([{ toolId: "studio.dessin.supprimer", params: { ids: selectionIds } }])) setSelection([]);
      return;
    }
    if (toolId === "studio.calque.creer") {
      const layer: StudioLayer = { id: crypto.randomUUID(), name: prochainNomCalque(drawing), visible: true, locked: false };
      if (apply([{ toolId: "studio.calque.creer", params: layer }])) { setCalqueActif(layer.id); setNomCalque(layer.name); }
      return;
    }
    if (toolId === "studio.calque.modifier") { renameLayer(); return; }
    if (toolId === "studio.objet.extruder") { extrude(); return; }
    if (toolId === "studio.objet.aplatir") {
      const cs = commandesAplatir(drawing, selectionIds);
      if (!cs.length) { setInfo("Aucun objet extrudé dans la sélection."); return; }
      apply(cs);
      return;
    }
    if (toolId === "studio.objet.calque") {
      if (!selectionIds.length || !actif) { setInfo("Sélectionnez d’abord l’objet à placer sur le calque actif."); return; }
      const ids = selectionIds.filter(id => (itemDe(id)?.layerId ?? STUDIO_DEFAULT_LAYER_ID) !== actif.id);
      if (!ids.length) { setInfo("L’objet est déjà sur le calque actif."); return; }
      apply([{ toolId: "studio.objet.calque", params: { ids, layerId: actif.id } }]);
    }
  }
  function extrude() {
    if (!drawing || !writable) return;
    const r = commandesExtrusion(drawing, selectionIds, extrusion);
    if ("erreur" in r) { setError(r.erreur); return; }
    if (apply(r.commandes) && r.info) setInfo(r.info);
  }
  function setLayer(layer: StudioLayer) {
    if (!drawing) return;
    apply([commandeReglage(drawing, layer)]);
  }
  function renameLayer() {
    if (!drawing || !actif || !writable) return;
    const name = nomCalque.trim();
    if (!name || name === actif.name) { setInfo("Saisissez le nouveau nom du calque actif, puis validez."); nomRef.current?.focus(); return; }
    setLayer({ ...actif, name });
  }
  function undo() { if (brouillon && peutAnnuler(brouillon) && writable) { cancelTrace(); setBrouillon(annulerBrouillon(brouillon)); setError(""); } }
  function redo() { if (brouillon && peutRetablir(brouillon) && writable) { cancelTrace(); setBrouillon(retablirBrouillon(brouillon)); setError(""); } }
  function fullscreen() { if (!document.fullscreenElement) void shell.current?.requestFullscreen().catch(() => setError("Plein écran indisponible. La planche reste accessible.")); else void document.exitFullscreen(); }
  const canSave = !historical && !!context?.canWrite && !pending && (uncertain || (commands.length > 0 && !blocked));
  const liens: Partial<Record<IdCommandeEditeur, string>> = {
    "exporter-svg": studioExportUrl(projectId, studyId, variantId, "svg", revisionId),
    "exporter-dxf": studioExportUrl(projectId, studyId, variantId, "dxf", revisionId),
    "exporter-ifc": studioExportUrl(projectId, studyId, variantId, "ifc", revisionId),
  };
  function runCommand(id: CommandeEditeur["id"]) {
    switch (id) {
      case "annuler": return undo();
      case "retablir": return redo();
      case "annuler-trace":
        if (geste.current) annulerGeste();
        else if (trace) cancelTrace();
        else if (selectionIds.length) select([]);
        else setTool("studio.dessin.selection");
        return;
      case "enregistrer": if (canSave) void save(); return;
      case "tout-selectionner": if (drawing) select(toutSelectionnable(drawing)); return;
      case "terminer-polyligne": return finishPolyline(false);
      case "fermer-polyligne": return finishPolyline(true);
      case "zoom-avant": return poserCadre(zoomerAuCentre(cadreRef.current, true));
      case "zoom-arriere": return poserCadre(zoomerAuCentre(cadreRef.current, false));
      case "cadrer": if (drawing) poserCadre(cadrer(emprise(drawing, l => estVisible(drawing, l)))); return;
      case "plein-ecran": return fullscreen();
      case "vue-3d": return setVue3d(v => !v);
      case "accrochage-sommets": return setAccrocheSommets(v => !v);
      case "accrochage-grille": return setAccrocheGrille(v => !v);
      case "exporter-svg": case "exporter-dxf": case "exporter-ifc":
        // Le lien de la barre télécharge (même origine, cookie de session) : le raccourci le suit.
        shell.current?.querySelector<HTMLAnchorElement>(`a[data-studio-commande="${id}"][href]`)?.click();
        return;
      case "importer-dxf": return setDialogue("import-dxf");
      case "feuille": return setDialogue("feuille");
      case "outils": return setDialogue("outils");
      case "palette": return setDialogue("palette");
    }
  }
  function surLien(id: IdCommandeEditeur) {
    if ((id === "exporter-svg" || id === "exporter-dxf" || id === "exporter-ifc") && commands.length) setInfo("L’export porte sur la révision enregistrée affichée, pas sur les modifications non enregistrées.");
  }
  const formesChoisies = drawing ? formesSelectionnees(drawing, selectionIds) : [];
  const toolAvailable = (t: StudioToolEntry) => {
    if (t.nature === "lecture" || OUTILS_MODES.has(t.toolId)) return t.nature === "lecture" || writable;
    if (!writable) return false;
    if (t.toolId === "studio.dessin.supprimer" || t.toolId === "studio.objet.calque") return selectionIds.length > 0;
    if (t.toolId === "studio.objet.extruder") return formesChoisies.length > 0;
    if (t.toolId === "studio.objet.aplatir") return formesChoisies.some(o => o.extrusion);
    return true;
  };
  const commandAvailable = (c: CommandeEditeur) => {
    switch (c.id) {
      case "annuler": return writable && !!brouillon && peutAnnuler(brouillon);
      case "retablir": return writable && !!brouillon && peutRetablir(brouillon);
      case "annuler-trace": return !!trace || selectionIds.length > 0 || tool !== "studio.dessin.selection";
      case "enregistrer": return canSave;
      case "tout-selectionner": return !!drawing && toutSelectionnable(drawing).length > 0;
      case "terminer-polyligne": return writable && tool === "studio.dessin.polyligne" && !!trace && suite.length >= 1;
      case "fermer-polyligne": return writable && tool === "studio.dessin.polyligne" && !!trace && suite.length >= 2;
      case "zoom-avant": return cadre.w > LARGEUR_VUE.min;
      case "zoom-arriere": return cadre.w < LARGEUR_VUE.max;
      default: return c.ecrit ? writable : true;
    }
  };
  /** Lance un outil ou une commande (raccourci, palette, gestionnaire) ; `verifier` : refuse une commande indisponible. */
  function executer(cible: CibleRaccourci, verifier: boolean) {
    if (cible.type === "outil") {
      const t = STUDIO_TOOLS.find(x => x.toolId === cible.toolId);
      if (t && toolAvailable(t)) runTool(cible.toolId);
      return;
    }
    const c = COMMANDES_EDITEUR.find(x => x.id === cible.id);
    if (c && (!verifier || commandAvailable(c))) runCommand(cible.id);
  }
  const entreeDisponible = (e: EntreeCatalogue) => (e.outil ? toolAvailable(e.outil) : e.commande ? commandAvailable(e.commande) : false);
  function executerEntree(e: EntreeCatalogue) {
    setDialogue(null);
    executer(e.cible, true);
  }
  clavier.current = (e: KeyboardEvent) => {
    const c = combinaison(e);
    // Une boîte de dialogue ouverte (Outils, palette) garde le clavier pour elle ; Ctrl+S / Ctrl+K n'atteignent pas le navigateur.
    if (dialogue) { if (c === "Ctrl+S" || c === "Ctrl+K") e.preventDefault(); return; }
    const field = (e.target as Element | null)?.closest?.("input,textarea,select,[contenteditable=true]");
    if (field && !actifDansUnChamp(c)) return;
    const cible = cibleRaccourci(c);
    if (!cible || !context || !drawing) return;
    // Entrée / Maj+Entrée ne sont prises que pendant le tracé d'une polyligne : ailleurs, elles activent le bouton focalisé.
    if (cible.type === "commande" && (cible.id === "terminer-polyligne" || cible.id === "fermer-polyligne")) {
      const c2 = COMMANDES_EDITEUR.find(x => x.id === cible.id);
      if (!c2 || !commandAvailable(c2)) return;
    }
    e.preventDefault();
    // Espace : tenue, elle sert au panoramique (Espace + glisser) ; relâchée sans glisser, elle choisit la Sélection.
    if (cible.type === "outil" && cible.toolId === "studio.dessin.selection") { if (!e.repeat && !espace.current.tenu) espace.current = { tenu: true, panoramique: false }; return; }
    executer(cible, false);
  };
  relacher.current = (e: KeyboardEvent) => {
    if (e.key !== " " || !espace.current.tenu) return;
    const panoramique = espace.current.panoramique;
    espace.current = { tenu: false, panoramique: false };
    if (!panoramique && !dialogue && context && drawing) executer({ type: "outil", toolId: "studio.dessin.selection" }, false);
  };

  async function save() {
    if (!context || !brouillon || historical || saving.current) return;
    saving.current = true;
    // Un nouvel essai après une erreur réseau rejoue le même lot (même requestId) : jamais de double effet. Au-delà de
    // 500 commandes, les lots partent dans l'ordre, chacun sur la révision produite par le précédent.
    if (!envelope.current) { envelope.current = planEnvoi(commandesEnAttente(brouillon), context.revision.id, () => crypto.randomUUID()); dernierAccuse.current = null; }
    setPending(true); setError(""); setInfo("");
    try {
      for (let lot = enveloppeSuivante(envelope.current); lot; lot = enveloppeSuivante(envelope.current)) {
        const accuse = await api.studioCommands(projectId, studyId, variantId, lot);
        envelope.current = accuserLot(envelope.current, accuse.revision.id);
        dernierAccuse.current = accuse;
        if (!alive.current) return;
      }
      // L'historique et la tête ont changé côté serveur : les listes affichées sont relues.
      void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
      void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
      // A replay acknowledges its original revision, which may no longer be the head.
      let current: StudioContext;
      try { current = await api.studioContext(projectId, studyId, variantId); }
      catch {
        if (alive.current) { setUncertain(true); setError("Sauvegarde reçue, mais version courante indisponible. Réessayez la même sauvegarde."); }
        return;
      }
      if (!alive.current) return;
      setContext(current); setBrouillon(creerBrouillon(current.revision.document)); cancelTrace();
      const doc = current.revision.document;
      const restants = selectionIds.filter(id => doc.objects.some(o => o.id === id) || doc.dimensions?.some(d => d.id === id));
      setSelection(restants);
      const seul = restants.length === 1 ? doc.objects.find(o => o.id === restants[0]) ?? doc.dimensions?.find(d => d.id === restants[0]) : undefined;
      if (seul) properties(seul);
      setUncertain(false); envelope.current = null; setSaved(true);
    }
    catch (e) {
      if (!alive.current) return;
      if (e instanceof ApiError && e.status < 500 && e.status !== 408) {
        const plan = envelope.current, accuse = dernierAccuse.current;
        setUncertain(false); envelope.current = null; dernierAccuse.current = null;
        if (plan && accuse && envoiPartiel(plan)) {
          // Les premiers lots sont enregistrés : le brouillon repart de la dernière révision confirmée, avec les seules
          // commandes non envoyées en attente (un pas annulable). Rien n'est envoyé de nouveau sans « Enregistrer ».
          const reste = commandesNonEnvoyees(plan);
          let rebase = creerBrouillon(accuse.revision.document);
          try { rebase = appliquerBrouillon(rebase, reste); } catch { /* impossible en pratique : mêmes commandes, même ordre */ }
          setContext(accuse); setBrouillon(rebase); cancelTrace();
          void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, studyId, variantId] });
          void client.invalidateQueries({ queryKey: ["studio-study", projectId, studyId] });
          const conflit = e.status === 409;
          setBlocked(conflit || e.status === 403 || e.status === 401);
          setError(conflit
            ? `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), puis une autre révision est devenue la version courante. Les ${reste.length} commande(s) non envoyée(s) restent dans ce brouillon, sur votre dernière révision enregistrée ; recharger la version serveur les perdra.`
            : `Enregistrement partiel : ${plan.envoyes} lot(s) sur ${plan.lots.length} enregistré(s), la suite est refusée. Les ${reste.length} commande(s) non envoyée(s) restent en attente dans le brouillon, sur la dernière révision enregistrée.`);
          return;
        }
        setBlocked(e.status === 409 || e.status === 403 || e.status === 401);
        setError(e.status === 409
          ? (e.code === "stale_revision" ? "Conflit de révision : une autre révision est devenue la version courante. Votre brouillon est conservé et n’a rien écrasé." : "Conflit de révision. Le brouillon est conservé.")
          : "Enregistrement refusé. Le brouillon reste non enregistré.");
      } else { setUncertain(true); setError("Confirmation serveur indisponible. Réessayez la même sauvegarde avant de continuer."); }
    }
    finally { saving.current = false; if (alive.current) setPending(false); }
  }

  if (!loading && refused(loadError)) return <StudioRefus quoi={historical ? "revision" : "variante"} />;
  const toolEntry = STUDIO_TOOLS.find(t => t.toolId === tool);
  const toResolve = drawing?.dimensions?.filter(d => d.toResolve).length ?? 0;
  const form = tool !== "studio.dessin.selection";
  const formDisabled = tool === "studio.dessin.deplacer" || tool === "studio.dessin.decaler" ? selectionIds.length === 0 : tool === "studio.dessin.modifier" ? !selected : false;
  const typeSaisi = tool === "studio.dessin.modifier" ? selected?.type : ({ "studio.dessin.cercle": "circle", "studio.dessin.arc": "arc", "studio.dessin.polyligne": "polyline" } as const)[tool as string];
  const centreEtAngles: (keyof Valeurs)[] = ["x", "y", "r", "a0", "a1"];
  const fields: (keyof Valeurs)[] = tool === "studio.dessin.deplacer" ? ["dx", "dy"] : tool === "studio.dessin.decaler" ? ["distance"]
    : typeSaisi === "dimension" ? ["offset"] : typeSaisi === "circle" ? ["x", "y", "r"] : typeSaisi === "arc" ? centreEtAngles : typeSaisi === "polyline" ? []
    : tool === "studio.dessin.cote" ? ["x", "y", "a", "b", "offset"] : ["x", "y", "a", "b"];
  const saisiePolyligne = typeSaisi === "polyline";
  const sized = selected?.type === "rectangle" && tool === "studio.dessin.modifier" || tool === "studio.dessin.rectangle";
  const centre = typeSaisi === "circle" || typeSaisi === "arc";
  const label = (k: keyof Valeurs) => ({ x: centre ? "Centre X" : "X", y: centre ? "Centre Y" : "Y", a: sized ? "Largeur" : "X final", b: sized ? "Hauteur" : "Y final", dx: "Déplacement X", dy: "Déplacement Y", offset: "Décalage", r: "Rayon", a0: "Angle de début (°)", a1: "Angle de fin (°)", distance: "Distance" })[k];
  // Aperçu d'une courbe en cours de tracé (jamais une donnée du document).
  const fin = survol?.point;
  const apercuForme: StudioShape | null = (() => {
    if (!trace || !fin) return null;
    const a = trace.point;
    if (tool === "studio.dessin.cercle") { const radius = Math.hypot(fin.x - a.x, fin.y - a.y); return radius > 0 ? { id: "apercu", type: "circle", center: a, radius } : null; }
    if (tool === "studio.dessin.arc" && suite[0]) {
      const g = modeArc === "centre" ? studioArcFromCenter(a, suite[0], fin) : studioArcFromThreePoints(a, suite[0], fin);
      return g ? { id: "apercu", type: "arc", ...g } : null;
    }
    if (tool === "studio.dessin.polyligne") return { id: "apercu", type: "polyline", points: [a, ...suite, fin], closed: false };
    return null;
  })();
  const hint = !writable && !historical && context?.canWrite === false ? "Lecture seule : la planche se consulte sans modification."
    : trace && tool === "studio.dessin.polyligne" ? "Cliquez les sommets suivants ; Entrée termine, Maj+Entrée ou un clic sur le premier sommet ferme. Échap pour annuler."
    : trace && tool === "studio.dessin.arc" ? (suite.length === 0 ? (modeArc === "centre" ? "Centre placé. Cliquez le début de l’arc (il fixe le rayon)." : "Début placé. Cliquez un point de passage de l’arc.") : (modeArc === "centre" ? "Cliquez la direction de la fin de l’arc (sens trigonométrique)." : "Cliquez la fin de l’arc."))
    : trace && tool === "studio.dessin.cercle" ? "Centre placé. Cliquez un point du cercle. Échap pour annuler."
    : trace ? (tool === "studio.dessin.deplacer" ? "Point de base placé. Cliquez la destination. Échap pour annuler." : "Premier point placé. Cliquez le second point. Échap pour annuler.")
    : tool === "studio.dessin.decaler" ? "Sélectionnez un objet, saisissez la distance (positive : à gauche d’une ligne, vers l’extérieur d’une forme fermée, d’un cercle ou d’un arc), puis décalez."
    : tool === "studio.dessin.selection" ? "Cliquez un objet, Maj + clic pour l’ajouter ou le retirer ; glissez vers la droite pour une fenêtre, vers la gauche pour une capture ; glissez la sélection pour la déplacer."
    : tool === "studio.dessin.cote" ? "Cote : cliquez deux points ; près d’un sommet, le point s’y accroche et la cote suit l’objet."
    : moveWithPointer ? "Cliquez un point de base puis sa destination, ou saisissez le déplacement."
    : "Deux clics pour dessiner, ou utilisez les valeurs numériques.";
  const pasAffiche = pas.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
  return <section className="studio-workspace" ref={shell} aria-label="Studio" data-studio-variante={variantId} data-studio-revision-vue={historical ? revisionId : undefined}>
    <header className="studio-heading"><div><p className="studio-eyebrow">FADI / STUDIO</p><h1>{context ? <span translate="no">{context.study.name}</span> : "Votre espace de dessin"}</h1><p>Dessin 2D · Repère local · Mètres</p></div><span className="studio-badge">Planche 2D</span></header>
    {error && <div className="studio-alert" role="alert" data-studio-erreur-planche>{error}{blocked && <button onClick={() => { if (window.confirm(warning())) window.location.reload(); }}>Recharger la version serveur</button>}</div>}
    {loading && <p role="status">Chargement de la planche…</p>}
    {context && drawing && <>{historical && <div className="studio-alert studio-history-banner" data-studio-lecture-seule-revision><span>Révision historique en lecture seule. Aucune modification n’est possible ici.</span><Link to={cheminVarianteStudio(projectId, studyId, variantId)}>Revenir à la version courante</Link></div>}<div className="studio-context"><Link to={cheminProjetStudio(projectId)}>Études</Link><span translate="no">{context.variant.name}</span><span>Révision <span translate="no" title={context.revision.id}>{context.revision.id.slice(-8)}</span></span><span role="status" data-studio-etat>{historical ? "Révision historique" : pending ? "Sauvegarde en cours…" : uncertain ? "Sauvegarde non confirmée" : commands.length ? "Brouillon non enregistré" : saved ? "Enregistré sur le serveur" : "Version serveur chargée"}</span><button type="button" aria-pressed={commentaires} onClick={() => setCommentaires(v => !v)} data-studio-basculer-commentaires>Commentaires</button></div>{!context.canWrite && <p role="status" data-studio-lecture-seule>Lecture seule</p>}
    <BarreOutils outil={tool} outilDisponible={toolAvailable} commandeDisponible={commandAvailable} libelleCommande={uncertain ? { enregistrer: "Réessayer la sauvegarde" } : undefined}
      basculeActive={{ "accrochage-sommets": accrocheSommets, "accrochage-grille": accrocheGrille, "vue-3d": vue3d }} lienCommande={liens} surOutil={runTool} surCommande={runCommand} surLien={surLien} />
    <p className="studio-undo-scope" data-studio-annuler-portee>{`Annuler et Rétablir ne portent que sur les modifications non enregistrées (${commands.length} commande(s) en attente) ; une révision enregistrée ne s’annule pas ici.`}</p>
    <div className="studio-editor"><div className="studio-sheet"><div className="studio-sheet-caption"><span>Dessin et modélisation</span><span data-studio-pas-grille={pas}>{`Grille ${pasAffiche} m`}</span><span>1 unité = 1 m</span></div>
      {vue3d && <LimiteVue3D><Suspense fallback={<p role="status">Chargement de la vue 3D…</p>}><Vue3DStudio doc={drawing} /></Suspense></LimiteVue3D>}
      {!vue3d && <Dessin2D svgRef={refPlanche} doc={apercuDoc ?? drawing} cadre={cadre} pas={pas} outil={tool} selection={selectionSet} trace={trace} survol={survol} rectangle={rectangle} glissement={!!apercu}
        apercuForme={apercuForme} sommetsPoses={suite}
        clicsVersPlanche={o => OUTILS_TRACE.has(tool) || (tool === "studio.dessin.deplacer" && (!!trace || selectionSet.has(o.id)))}
        surPlanche={board} surSurvol={pointerMove} surPointeurBas={pointerDown} surPointeurHaut={pointerUp} surClicCapture={clickCapture} surSelection={(id, plus) => select(plus ? basculer(selectionIds, id) : [id])} />}
      <p className="studio-hint">{hint}</p>
      <p className="studio-hint" data-studio-aide-vue>Molette : zoom sur le pointeur ; bouton du milieu, Espace + glisser ou deux doigts : déplacer la vue.</p>
      {toResolve > 0 && <p className="studio-alert" role="status" data-studio-cotes-a-resoudre={toResolve}>{`${toResolve} cote(s) à résoudre : un objet coté a été supprimé.`}</p>}
      {info && <p className="studio-info" role="status">{info}</p>}
      {actif && !actif.visible && OUTILS_TRACE.has(tool) && <p className="studio-info">Le calque actif est masqué : ce que vous dessinez n’apparaîtra pas.</p>}
    </div>
    <aside className="studio-properties" aria-label="Propriétés du dessin"><h2>{toolEntry?.libelleFR}</h2><p>{`${drawing.objects.length} objets · ${drawing.dimensions?.length ?? 0} cotes`}</p>
      {selectionIds.length > 0 && <div className="studio-selection" data-studio-selection={selected?.id} data-studio-selection-compte={selectionIds.length}>
        {selected ? <p>Objet sélectionné : <span translate="no">{selected.id.slice(0, 8)}</span></p> : <p>{`${selectionIds.length} objets sélectionnés`}</p>}
        {selected?.type === "dimension" && (selected.toResolve
          ? <p data-studio-cote-statut="a-resoudre">À résoudre : un objet coté a été supprimé.</p>
          : <p data-studio-cote-statut={selected.links.start || selected.links.end ? "liee" : "libre"}>Valeur mesurée : <span translate="no">{formaterMetres(valeurCote(selected) ?? 0, LOCALE)}</span> · {selected.links.start || selected.links.end ? "Associée : suit l’objet coté." : "Libre."}</p>)}
        <button type="button" disabled={!writable} onClick={() => runTool("studio.dessin.supprimer")} data-studio-supprimer-selection><Icon name="studio-delete" size={18} /> Supprimer la sélection</button>
      </div>}
      {formesChoisies.length > 0 && <FormulaireExtrusion valeurs={extrusion} modifiable={writable} formes={formesChoisies.length} extrudes={formesChoisies.filter(o => o.extrusion).length}
        surValeurs={setExtrusion} surExtruder={extrude} surAplatir={() => runTool("studio.objet.aplatir")} />}
      {form && <form onSubmit={numeric} data-studio-formulaire={tool}><fieldset disabled={!writable || formDisabled || (tool === "studio.dessin.modifier" && selected?.type === "dimension" && selected.toResolve)}><legend>Valeurs en mètres</legend>
        {tool === "studio.dessin.arc" && <label>Construction de l’arc<select value={modeArc} onChange={e => { setModeArc(e.target.value as ModeArc); cancelTrace(); }} data-studio-mode-arc><option value="trois-points">Trois points (début, passage, fin)</option><option value="centre">Centre, début, fin</option></select></label>}
        {fields.map(k => <label key={k}>{label(k)}<input type="number" step="any" required value={Number.isFinite(values[k]) ? values[k] : ""} onChange={e => setValues(v => ({ ...v, [k]: e.target.valueAsNumber }))} data-studio-champ={k} /></label>)}
        {saisiePolyligne && <><label>Sommets (x y ; …)<input type="text" required value={sommetsTexte} onChange={e => setSommetsTexte(e.target.value)} data-studio-champ="sommets" /></label><label className="studio-case"><input type="checkbox" checked={fermee} onChange={e => setFermee(e.target.checked)} data-studio-champ="fermee" /> Fermée</label></>}
        <button type="submit">{tool === "studio.dessin.deplacer" ? "Déplacer la sélection" : tool === "studio.dessin.decaler" ? "Décaler la sélection" : tool === "studio.dessin.modifier" ? "Modifier la sélection" : "Ajouter au dessin"}</button></fieldset></form>}
      <PanneauCalques doc={drawing} actif={actif?.id ?? STUDIO_DEFAULT_LAYER_ID} modifiable={writable} nom={nomCalque} nomRef={nomRef} surActif={id => setCalqueActif(id)} surNom={setNomCalque} surReglage={setLayer} surRenommer={renameLayer} />
      <div className="studio-note"><strong>Une planche autonome</strong><p>Les tracés restent en brouillon jusqu’à la confirmation du serveur. Aucun modèle 3D n’est nécessaire.</p></div></aside></div>
    {commentaires && <div id="studio-commentaires"><PanneauCommentaires projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} revision={context.revision.document} dessin={drawing}
      selection={selectionIds} canWrite={!historical && context.canWrite} surSelection={ids => { setTool("studio.dessin.selection"); cancelTrace(); select(ids); }} /></div>}
    <RevisionsPanel projectId={projectId} studyId={studyId} variantId={variantId} headRevisionId={context.variant.headRevisionId} shownRevisionId={context.revision.id} />
    {dialogue === "outils" && <GestionnaireOutils disponible={entreeDisponible} surExecuter={executerEntree} surFermer={() => setDialogue(null)} />}
    {dialogue === "palette" && <PaletteCommandes disponible={entreeDisponible} surExecuter={executerEntree} surFermer={() => setDialogue(null)} />}
    {dialogue === "import-dxf" && <DialogueImportDxf doc={drawing} modifiable={writable} surFermer={() => setDialogue(null)}
      surAjouter={(cs, r) => { if (!apply(cs)) return false; setDialogue(null); setInfo(`Import DXF ajouté au brouillon : ${r.rapport.entites.total} objet(s). Enregistrez pour l’envoyer au serveur.`); return true; }} />}
    {dialogue === "feuille" && <PanneauFeuille doc={context.revision.document} brouillonNonEnregistre={commands.length > 0} surFermer={() => setDialogue(null)}
      cartouche={cartoucheInitial({ projet: projet.data, etude: context.study, variante: context.variant, revision: { id: context.revision.id, ...revisionAffichee }, utilisateur: user })} />}</>}
  </section>;
}

const SOURCES: Record<string, string> = { "study-initialization": "Création de l’étude", "variant-initialization": "Création de la variante", "authenticated-session": "Enregistrement" };

/** Historique de la variante, de la plus récente à la plus ancienne ; chaque révision s'ouvre en lecture seule. */
function RevisionsPanel({ projectId, studyId, variantId, headRevisionId, shownRevisionId }: { projectId: string; studyId: string; variantId: string; headRevisionId: string; shownRevisionId: string }) {
  const { user } = useAuth();
  const revisions = useQuery({ queryKey: ["studio-revisions", projectId, studyId, variantId], queryFn: () => api.studioRevisions(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1 });
  const date = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(LOCALE, { dateStyle: "medium", timeStyle: "short" }); };
  return <section className="studio-revisions" aria-labelledby="studio-revisions-titre" data-studio-revisions>
    <h2 id="studio-revisions-titre">Historique des révisions</h2>
    <p className="studio-revisions-sub">De la plus récente à la plus ancienne. Une révision passée s’ouvre en lecture seule.</p>
    {revisions.isPending && <p role="status">Chargement de l’historique…</p>}
    {revisions.isError && <p role="alert">Historique indisponible. <button type="button" onClick={() => void revisions.refetch()}>Réessayer</button></p>}
    {revisions.data?.revisions.length === 0 && <p>Aucune révision.</p>}
    {!!revisions.data?.revisions.length && <ol className="studio-revisions-list">{revisions.data.revisions.map(r => {
      const head = r.id === headRevisionId, shown = r.id === shownRevisionId;
      return <li key={r.id} data-studio-revision={r.id} data-studio-revision-tete={head || undefined} aria-current={shown ? "true" : undefined}>
        <Link to={cheminVarianteStudio(projectId, studyId, variantId, head ? null : r.id)}><span>Révision</span> <span translate="no" title={r.id}>{r.id.slice(-8)}</span></Link>
        <span translate="no">{date(r.createdAt)}</span>
        {SOURCES[r.source] ? <span>{SOURCES[r.source]}</span> : <span translate="no">{r.source}</span>}
        <span>{user && r.authorId === user.id ? "par vous" : "par un autre membre"}</span>
        {head && <strong className="studio-revision-tag">Version courante</strong>}
        {shown && !head && <strong className="studio-revision-tag">Affichée</strong>}
        {!head && <Link to={cheminComparaisonStudio(projectId, studyId, { variantId, revisionId: r.id }, { variantId, revisionId: null })} data-studio-comparer-tete>Comparer avec la tête</Link>}
      </li>;
    })}</ol>}
  </section>;
}
