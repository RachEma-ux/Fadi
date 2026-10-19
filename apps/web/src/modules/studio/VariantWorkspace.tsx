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
 *
 * Composition : outils au pointeur (`planche2d/outils/`, un module par famille, table `OUTILS_PLANCHE`), gestes et vue
 * (`planche2d/outils/gestes.ts`), saisie numérique (`planche2d/outils/formulaire.ts`), enregistrement
 * (`variante/useEnregistrement.ts`), clavier (`variante/useClavierStudio.ts`), garde de navigation
 * (`variante/useGardeNavigation.ts`), panneaux (`variante/`).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { STUDIO_DEFAULT_LAYER_ID, STUDIO_TOOLS, studioVersionProjection, type StudioCommand, type StudioDocument, type StudioLayer, type StudioPoint, type StudioWall } from "@parcours/atelier-model";
import { api, studioExportUrl, type StudioContext } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";
import { LOCALE } from "../../lib/i18n";
import { StudioRefus } from "./studio-ecrans";
import { BarreOutils } from "./planche2d/BarreOutils";
import { annulerBrouillon, apercuBrouillon, appliquerBrouillon, commandesEnAttente, creerBrouillon, documentBrouillon, messageRefus, peutAnnuler, peutRetablir, retablirBrouillon, type Brouillon } from "./planche2d/brouillon";
import { commandeDisponible, outilDisponible } from "./variante/disponibilite";
import { calqueActifOuPremier, commandeReglage, estVisible, layerIdPour, listeCalques, prochainNomCalque } from "./planche2d/calques";
import { ListeElements } from "./planche2d/ListeElements";
import { AvisRevision } from "./variante/AvisRevision";
import { useFocusConserve } from "./variante/useFocusConserve";
import { CATALOGUE, type EntreeCatalogue } from "./planche2d/catalogue";
import { raisonEntree, type EtatDroit } from "./variante/droits";
import { Dessin2D, type PointPose } from "./planche2d/Dessin2D";
import { cadrer, emprise } from "./planche2d/geometrie-2d";
import { PanneauCalques } from "./planche2d/PanneauCalques";
import { COMMANDES_EDITEUR, OUTILS_MODES, OUTILS_VOLUME_LIBRE, OUTILS_TRACE, type CibleRaccourci, type CommandeEditeur, type IdCommandeEditeur, type StudioToolEntry, type StudioToolId } from "./planche2d/raccourcis";
import { basculer, commandesDeplacement, elements, estForme, selectionValide, toutSelectionnable, type Element2D } from "./planche2d/selection";
import { zoomerAuCentre } from "./planche2d/vue";
import { aidePlanche, apercuPlanche, outilPlanche } from "./planche2d/outils";
import { CONTENU_INITIAL, formulaireInactif, SOMMETS_INITIAUX, soumettre, VALEURS_INITIALES, valeursObjet, type Valeurs } from "./planche2d/outils/formulaire";
import { useGestesPlanche } from "./planche2d/outils/gestes";
import { ChampMesures } from "./planche2d/accrochage/ChampMesures";
import { estTransformation, optionsDeSaisie } from "./planche2d/outils/modification";
import { commandePolyligne } from "./planche2d/outils/courbes";
import type { ContexteCreation, ModeArc } from "./planche2d/outils/type";
import { commandesAplatir, commandesExtrusion, formesSelectionnees, valeursDe, VALEURS_VIDES, type ValeursExtrusion } from "./vue3d/extrusion";
import { cartoucheInitial } from "./feuille/feuille-ui";
import { revisionDocument } from "./taches/empreinte";
import { PanneauCommentaires } from "./commentaires/PanneauCommentaires";
import { PanneauQuantites } from "./quantites/PanneauQuantites";
import { PanneauExigences } from "./exigences/PanneauExigences";
import { cibleSelection } from "./exigences/exigences-ui";
import { PanneauArchitecture } from "./planche2d/architecture/PanneauArchitecture";
import { elementArchitectural, PARAMETRES_ARCHITECTURE_VIDES, type ParametresArchitecture } from "./planche2d/architecture/architecture-ui";
import { AlerteStudio, BandeauVariante, EnTeteStudio } from "./variante/BandeauVariante";
import { DialoguesStudio, type DialogueStudio } from "./variante/DialoguesStudio";
import { refused } from "./variante/etat-variante";
import { FormulaireValeurs } from "./variante/FormulaireValeurs";
import { PanneauProprietes } from "./variante/PanneauProprietes";
import { RevisionsPanel } from "./variante/PanneauRevisions";
import { useClavierStudio } from "./variante/useClavierStudio";
import { useEnregistrement } from "./variante/useEnregistrement";
import { lectureApplicable } from "./variante/revision-courante";
import { useChargementVariante } from "./hors-ligne/useChargementVariante";
import { useGardeNavigation } from "./variante/useGardeNavigation";
import { Vue3D } from "./variante/Vue3D";
import { RapportExport } from "./variante/RapportExport";
import { FORMATS_RAPPORT } from "./variante/rapport-export";
import { OUTILS_VISUALISATION, type DemandeVue3d } from "./vue3d/scenes/scenes-ui";
import "./studio.css";
import "./planche2d/planche2d.css";

/** Clé de version de la projection du plan 2D du brouillon (lot C.2) : révision de session et empreinte du contenu lu (les aperçus de geste, transitoires, ne sont pas versionnés). */
function versionPlan(doc: StudioDocument): string {
  const v = studioVersionProjection(doc, "plan-2d", String(revisionDocument(doc)));
  return `${v.revision}:${v.contenu}`;
}

/** `commentairesOuverts` : panneau des commentaires ouvert à l'arrivée (adresse `?commentaires=ouverts`, lien de notification). */
export interface VariantWorkspaceProps { projectId: string; studyId: string; variantId: string; revisionId: string | null; commentairesOuverts?: boolean }

export function VariantWorkspace({ projectId, studyId, variantId, revisionId, commentairesOuverts = false }: VariantWorkspaceProps) {
  const [context, setContext] = useState<StudioContext | null>(null);
  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [tool, setTool] = useState<StudioToolId>("studio.dessin.selection");
  const [selection, setSelection] = useState<string[]>([]);
  const [trace, setTrace] = useState<PointPose | null>(null);
  // Points posés après le premier : passage ou début d'un arc, sommets suivants d'une polyligne.
  const [suite, setSuite] = useState<StudioPoint[]>([]);
  const [modeArc, setModeArc] = useState<ModeArc>("trois-points");
  const [sommetsTexte, setSommetsTexte] = useState(SOMMETS_INITIAUX);
  const [fermee, setFermee] = useState(false);
  // Texte saisi pour l'outil Texte (contenu du projet, jamais traduit) et sa justification.
  const [texteSaisi, setTexteSaisi] = useState(CONTENU_INITIAL);
  const [accrocheSommets, setAccrocheSommets] = useState(true);
  const [accrocheGrille, setAccrocheGrille] = useState(false);
  const [dialogue, setDialogue] = useState<DialogueStudio>(null);
  // Rapport de fidélité du dernier export lancé (E.6-03) : boîte non modale, fermée à la demande.
  const [rapportExport, setRapportExport] = useState<"exporter-svg" | "exporter-dxf" | "exporter-ifc" | null>(null);
  // Compteur des lancements d'export : chaque export a son propre rapport (jamais celui d'une révision précédente).
  const [exportsLances, setExportsLances] = useState(0);
  const { user } = useAuth();
  const [calqueActif, setCalqueActif] = useState<string>(STUDIO_DEFAULT_LAYER_ID);
  const [nomCalque, setNomCalque] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Valeurs>(VALEURS_INITIALES);
  const [extrusion, setExtrusion] = useState<ValeursExtrusion>(VALEURS_VIDES);
  const [vue3d, setVue3d] = useState(false);
  // Vue 3D : navigation (orbite ou plan), coupe horizontale affichée, solide libre sélectionné.
  const [navigation3d, setNavigation3d] = useState<"orbite" | "plan">("orbite");
  const [coupe3d, setCoupe3d] = useState(false);
  const [solide3d, setSolide3d] = useState<string | null>(null);
  // Visualisation (lot E.5) : outil de scène / d'apparence ou export PNG demandé à la vue 3D, qui l'ouvre.
  const [demande3d, setDemande3d] = useState<DemandeVue3d | null>(null);
  const demander3d = (action: string) => { setVue3d(true); setDemande3d(d => ({ action, n: (d?.n ?? 0) + 1 })); };
  const [commentaires, setCommentaires] = useState(commentairesOuverts);
  // Architecture (A.4) : paramètres saisis des outils Mur / Ouverture et objet architectural sélectionné (2D ou 3D).
  const [parametresArchi, setParametresArchi] = useState<ParametresArchitecture>(PARAMETRES_ARCHITECTURE_VIDES);
  const [selectionArchi, setSelectionArchi] = useState<string | null>(null);
  const alive = useRef(true), dirty = useRef(false);
  /** Contexte et brouillon du dernier rendu (comparés par les lectures asynchrones avant de s'appliquer, A.5-10). */
  const affiche = useRef({ context, brouillon });
  affiche.current = { context, brouillon };
  const shell = useRef<HTMLElement>(null), nomRef = useRef<HTMLInputElement>(null);
  const historical = revisionId !== null;
  const drawing = brouillon ? documentBrouillon(brouillon) : null;
  const commands = brouillon ? commandesEnAttente(brouillon) : [];
  const enr = useEnregistrement({
    projectId, studyId, variantId, historical, context, brouillon, alive, setError, setInfo,
    surVersionServeur: (current) => {
      setContext(current); setBrouillon(creerBrouillon(current.revision.document)); cancelTrace();
      const doc = current.revision.document;
      const restants = selectionIds.filter(id => elements(doc).some(e => e.id === id));
      setSelection(restants);
      const seul = restants.length === 1 ? elements(doc).find(e => e.id === restants[0]) : undefined;
      if (seul) properties(seul);
    },
    surRebase: (accuse, rebase) => { setContext(accuse); setBrouillon(rebase); cancelTrace(); },
  });
  const { pending, uncertain, blocked } = enr;
  useFocusConserve(pending);
  dirty.current = commands.length > 0 || !!trace || pending || uncertain;
  // Hors ligne, derrière une enveloppe en attente, le dessin reste permis (`enr.dessinHorsLigne`).
  const writable = !historical && !!context?.canWrite && !pending && (!uncertain || enr.dessinHorsLigne) && !blocked;
  // Données réelles du cartouche de la feuille (mêmes clés que le fil d'Ariane et l'historique : cache partagé).
  const projet = useQuery({ queryKey: ["project", projectId], queryFn: () => api.getProject(projectId), staleTime: 30_000, retry: (n, e) => !refused(e) && n < 1, enabled: !!context });
  // Catalogue autorisé (B.2-06) : motif réel d'un refus d'écriture (rôle, référence protégée, verrou), lecture seule.
  const catalogueAutorise = useQuery({ queryKey: ["studio-catalogue-outils", projectId], queryFn: () => api.studioCatalogueOutils(projectId), staleTime: 30_000, retry: (n, e) => !refused(e) && n < 1, enabled: !!context });
  const revisionsFeuille = useQuery({ queryKey: ["studio-revisions", projectId, studyId, variantId], queryFn: () => api.studioRevisions(projectId, studyId, variantId), retry: (n, e) => !refused(e) && n < 1, enabled: dialogue === "feuille" });
  const revisionAffichee = revisionsFeuille.data?.revisions.find(r => r.id === context?.revision.id);

  // Lecture de la variante, avec reprise du brouillon hors ligne conservé sur l'appareil (`hors-ligne/`).
  useChargementVariante({ projectId, studyId, variantId, revisionId, alive, setContext, setBrouillon, setLoadError, setError, setLoading, reprendre: enr.reprendre });
  useGardeNavigation(dirty);

  // ——— Sélection et calques (lectures dérivées du brouillon) ———
  const selectionIds = drawing ? selectionValide(drawing, selection) : [];
  const selectionSet = new Set(selectionIds);
  const itemDe = (id: string | undefined) => (id && drawing ? elements(drawing).find(e => e.id === id) ?? null : null);
  // Calque d'un élément choisi, murs (A.4) compris : `elements` ne parcourt pas `architecture`.
  const calqueDe = (id: string): string => itemDe(id)?.layerId ?? drawing?.architecture?.find((a): a is StudioWall => a.id === id && a.type === "wall")?.layerId ?? STUDIO_DEFAULT_LAYER_ID;
  const selected = selectionIds.length === 1 ? itemDe(selectionIds[0]) : null;
  // Objet du panneau Architecture : l'ouverture ou le mur désigné, ou le seul mur de la sélection.
  const panneauArchi = elementArchitectural(drawing, selectionArchi) ? selectionArchi
    : selectionIds.length === 1 && elementArchitectural(drawing, selectionIds[0]!)?.type === "wall" ? selectionIds[0]! : null;
  const calques = drawing ? listeCalques(drawing) : [];
  const { calque: actif, repli: calqueReplie } = calqueActifOuPremier(calques, calqueActif);
  // Le calque actif a disparu : le premier calque devient réellement actif (il ne reviendra pas seul après un rétablir).
  useEffect(() => { if (calqueReplie && actif) setCalqueActif(actif.id); }, [calqueReplie, actif?.id]);
  // Le champ de renommage reprend le nom du calque actif quand celui-ci change (choix, création, annulation).
  useEffect(() => { if (actif) setNomCalque(actif.name); }, [actif?.id, actif?.name]);

  // ——— Planche : outil au pointeur, gestes et vue ———
  const moveWithPointer = (tool === "studio.dessin.deplacer" || estTransformation(tool)) && selectionIds.length > 0;
  const pointsActifs = OUTILS_TRACE.has(tool) || moveWithPointer;
  const outil = outilPlanche(tool);
  const gestes = useGestesPlanche({
    drawing, outil: tool, writable, selectionIds, selectionSet, accrocheSommets, accrocheGrille, pointsActifs,
    exclureAuSurvol: outil?.horsSelection && trace ? selectionSet : undefined, select, moveSelection,
    base: suite[suite.length - 1] ?? trace?.point ?? null,
  });
  const { cadre, pas, survol, poserCadre, cadreRef } = gestes;
  // Aperçu du glisser : le document tel que le relâchement le donnerait (les cotes liées suivent).
  const apercuDoc = useMemo(() => {
    if (!drawing || !gestes.apercu) return null;
    return apercuBrouillon(drawing, commandesDeplacement(drawing, gestes.apercu.ids, gestes.apercu.dx, gestes.apercu.dy).commandes);
  }, [drawing, gestes.apercu]);

  function properties(o: Element2D) {
    // Les valeurs d'extrusion affichées sont celles que l'utilisateur a saisies pour cet objet, jamais une proposition.
    const saisies = estForme(o) ? valeursDe(o) : null;
    setExtrusion(saisies ?? VALEURS_VIDES);
    const r = valeursObjet(o);
    if (r.maj) setValues(r.maj);
    if (r.sommets) { setSommetsTexte(r.sommets.texte); setFermee(r.sommets.fermee); }
    if (r.texte) setTexteSaisi(r.texte);
  }
  function select(ids: string[]) {
    setSelection(ids);
    setSelectionArchi(null);
    const o = ids.length === 1 ? itemDe(ids[0]) : null;
    if (o) properties(o);
    else if (ids.length > 1) {
      // Sélection multiple : des valeurs d'extrusion ne s'affichent que si tous les objets ont exactement les mêmes.
      const valeurs = ids.map((id) => { const x = itemDe(id); return x && estForme(x) ? JSON.stringify(valeursDe(x)) : "null"; });
      setExtrusion(new Set(valeurs).size === 1 && valeurs[0] !== "null" ? JSON.parse(valeurs[0]!) as ValeursExtrusion : VALEURS_VIDES);
    }
  }

  /**
   * Désignation d'un mur ou d'une ouverture (planche, vue 3D, panneau) : un mur entre dans la sélection de la planche
   * (transformations, suppression, calque) ; une ouverture, qui suit son mur, n'est désignée que pour être modifiée.
   */
  function choisirArchitecture(id: string, ajouter: boolean) {
    const it = elementArchitectural(drawing, id);
    if (!it) return;
    if (it.type === "wall") select(ajouter ? basculer(selectionIds, id) : [id]);
    else select([]);
    if (!ajouter) setSelectionArchi(id);
  }

  /** Applique un lot localement (un pas d'historique) ; rien n'est envoyé avant « Enregistrer ». */
  function apply(cs: StudioCommand[]): boolean {
    if (!brouillon || !writable) return false;
    try {
      const next = appliquerBrouillon(brouillon, cs);
      setBrouillon(next);
      const doc = documentBrouillon(next);
      const seul = selectionIds.length === 1 ? selectionIds[0] : undefined;
      const updated = seul ? elements(doc).find(e => e.id === seul) : undefined;
      if (updated) properties(updated);
      enr.setSaved(false); setError(""); setInfo("");
      return true;
    } catch (e) { setError(messageRefus(e)); return false; }
  }
  const layerId = () => layerIdPour(actif?.id ?? STUDIO_DEFAULT_LAYER_ID);
  const creation = (): ContexteCreation => ({
    nouvelId: () => crypto.randomUUID(), layerId: layerId(), decalageCote: values.offset, rayonAngulaire: values.ra,
    texte: { contenu: texteSaisi.contenu, hauteur: values.h, rotation: values.rot, justification: texteSaisi.justification },
    architecture: parametresArchi,
  });
  const contexteClic = () => ({ ...creation(), tolerance: gestes.tolerance(), selection: selectionIds, options: optionsDeSaisie(values), document: drawing });
  /** Termine la polyligne en cours (ouverte, ou fermée sur son premier sommet). */
  function finishPolyline(closed: boolean) {
    if (tool !== "studio.dessin.polyligne" || !trace) return;
    const points = [trace.point, ...suite];
    if (points.length < (closed ? 3 : 2)) { setError(closed ? "Une polyligne fermée a trois sommets au moins." : "Une polyligne a deux sommets au moins."); return; }
    const r = commandePolyligne(creation(), points, closed);
    if (r.type === "commandes" && apply(r.commandes)) cancelTrace();
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
  /** Déplacement de toute la sélection : une commande par objet, un seul pas d'historique. */
  function moveSelection(ids: readonly string[], dx: number, dy: number): boolean {
    if (!drawing) return false;
    const { commandes, cotesLiees } = commandesDeplacement(drawing, ids, dx, dy);
    if (!commandes.length) { if (cotesLiees.length) setInfo("Les cotes liées suivent leurs objets : elles ne se déplacent pas seules."); return cotesLiees.length === 0; }
    const ok = apply(commandes);
    if (ok && cotesLiees.length) setInfo("Les cotes liées suivent leurs objets : elles ne se déplacent pas seules.");
    return ok;
  }
  /** Clic sur la planche : le premier pose le point de départ, les suivants sont interprétés par l'outil actif. */
  function board(e: MouseEvent<SVGSVGElement>) {
    if (!pointsActifs) { if (tool === "studio.dessin.selection" && !e.shiftKey) { select([]); setSelectionArchi(null); } return; }
    if (!writable || !outil) return;
    const p = gestes.pose(e, outil.horsSelection && trace ? selectionSet : undefined); if (!p) return;
    poser(p);
  }
  /** Point posé (clic ou saisie directe du champ « Mesures ») : premier point, ou point interprété par l'outil actif. */
  function poser(p: PointPose) {
    if (!writable || !outil) return;
    const contexte = contexteClic();
    // Outil à un clic (Texte) : le premier clic agit aussitôt.
    if (!trace && !outil.premierClic) { setTrace(p); setSuite([]); return; }
    const action = !trace ? outil.premierClic!(p, contexte) : outil.clic({ outil: tool, trace, suite, modeArc }, p, contexte);
    switch (action.type) {
      case "deplacer": if (moveSelection(selectionIds, action.dx, action.dy)) { setTrace(null); gestes.setSurvol(null); } return;
      case "sommet": setSuite(action.suite); setError(""); return;
      case "terminer-polyligne": return finishPolyline(action.fermee);
      case "erreur": setError(action.message); return;
      case "commandes": if (apply(action.commandes)) { if (action.apres === "annuler-trace") cancelTrace(); else setTrace(null); } return;
    }
  }
  /** Saisie numérique : mêmes commandes que le pointeur. */
  function numeric(e: FormEvent) {
    e.preventDefault();
    const a = soumettre({ tool, values, sommetsTexte, fermee, selected, selectionIds, drawing, creation: creation(), texte: texteSaisi });
    if (a.type === "erreur") setError(a.message);
    else if (a.type === "deplacer") moveSelection(selectionIds, a.dx, a.dy);
    else if (a.type === "decaler") offsetSelection(a.distance);
    else if (a.type === "commandes") apply(a.commandes);
  }

  // ——— Outils et commandes ———
  function cancelTrace() { setTrace(null); setSuite([]); gestes.setSurvol(null); }
  function runTool(toolId: StudioToolId) {
    // Les outils du volume libre agissent dans la vue 3D : ils l'ouvrent.
    if (OUTILS_VOLUME_LIBRE.has(toolId)) setVue3d(true);
    if (OUTILS_VISUALISATION.has(toolId)) { demander3d(toolId); return; }
    if (OUTILS_MODES.has(toolId)) { setTool(toolId); cancelTrace(); setInfo(""); return; }
    if (!writable || !drawing) return;
    // Propriétés BIM (E.1) : le formulaire du panneau « Propriétés et exigences » porte la saisie.
    if (toolId === "studio.propriete.definir" || toolId === "studio.propriete.retirer") {
      const b = shell.current?.querySelector<HTMLButtonElement>(`[data-studio-propriete-action="${toolId}"]`);
      if (b) b.click(); else setInfo("Sélectionnez d’abord un mur, une ouverture ou un objet extrudé.");
      return;
    }
    if (toolId === "studio.solide.supprimer") {
      if (!solide3d || !drawing.solides?.some(s => s.id === solide3d)) { setInfo("Sélectionnez d’abord, dans la vue 3D, le solide à supprimer."); return; }
      if (apply([{ toolId: "studio.solide.supprimer", params: { ids: [solide3d] } }])) setSolide3d(null);
      return;
    }
    if (toolId === "studio.architecture.modifier") {
      if (!panneauArchi) { setInfo("Sélectionnez d’abord, sur la planche ou dans la vue 3D, le mur ou l’ouverture à modifier."); return; }
      shell.current?.querySelector<HTMLButtonElement>("[data-studio-modifier-architecture]")?.click();
      return;
    }
    if (toolId === "studio.architecture.supprimer") {
      const ids = [...new Set([...selectionIds, ...(panneauArchi ? [panneauArchi] : [])])].filter((id) => elementArchitectural(drawing, id)?.type === "wall");
      if (!ids.length) { setInfo("Sélectionnez d’abord le mur à supprimer avec ses ouvertures."); return; }
      if (apply([{ toolId: "studio.architecture.supprimer", params: { ids, cascade: true } }])) select([]);
      return;
    }
    if (toolId === "studio.dessin.supprimer" && !selectionIds.length && elementArchitectural(drawing, selectionArchi)) {
      if (apply([{ toolId: "studio.dessin.supprimer", params: { ids: [selectionArchi!] } }])) setSelectionArchi(null);
      return;
    }
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
      const ids = selectionIds.filter(id => calqueDe(id) !== actif.id);
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
        if (gestes.enGeste()) gestes.annulerGeste();
        else if (trace) cancelTrace();
        else if (selectionIds.length) select([]);
        else setTool("studio.dessin.selection");
        return;
      case "enregistrer": if (canSave) void enr.save(); return;
      case "tout-selectionner": if (drawing) select(toutSelectionnable(drawing)); return;
      case "terminer-polyligne": return finishPolyline(false);
      case "fermer-polyligne": return finishPolyline(true);
      case "zoom-avant": return poserCadre(zoomerAuCentre(cadreRef.current, true));
      case "zoom-arriere": return poserCadre(zoomerAuCentre(cadreRef.current, false));
      case "cadrer": if (drawing) poserCadre(cadrer(emprise(drawing, l => estVisible(drawing, l)))); return;
      case "plein-ecran": return fullscreen();
      case "vue-3d": return setVue3d(v => !v);
      case "navigation-3d": setVue3d(true); return setNavigation3d(n => (vue3d && n === "plan" ? "orbite" : "plan"));
      case "coupe-3d": setVue3d(true); return setCoupe3d(v => !(vue3d && v));
      case "accrochage-sommets": return setAccrocheSommets(v => !v);
      case "accrochage-grille": return setAccrocheGrille(v => !v);
      case "exporter-svg": case "exporter-dxf": case "exporter-ifc":
        // Le lien de la barre télécharge (même origine, cookie de session) : le raccourci le suit.
        shell.current?.querySelector<HTMLAnchorElement>(`a[data-studio-commande="${id}"][href]`)?.click();
        return;
      case "exporter-png": return demander3d("exporter-png");
      case "importer-dxf": return setDialogue("import-dxf");
      case "feuille": return setDialogue("feuille");
      case "outils": return setDialogue("outils");
      case "palette": return setDialogue("palette");
      case "exigences": { const s = shell.current?.querySelector<HTMLElement>("[data-studio-exigences]"); s?.scrollIntoView({ block: "start" }); s?.focus(); return; }
      // Modes d'accrochage et repérage (orthogonal, polaire, pas) : état de la planche (`planche2d/accrochage/`).
      default: gestes.commandeAccrochage(id); return;
    }
  }
  function surLien(id: IdCommandeEditeur) {
    if (id !== "exporter-svg" && id !== "exporter-dxf" && id !== "exporter-ifc") return;
    if (commands.length) setInfo("L’export porte sur la révision enregistrée affichée, pas sur les modifications non enregistrées.");
    setExportsLances((n) => n + 1);
    setRapportExport(id);
  }
  const formesChoisies = drawing ? formesSelectionnees(drawing, selectionIds) : [];
  const toolAvailable = (t: StudioToolEntry) => outilDisponible(t, { writable, selectionIds, formesChoisies });
  const commandAvailable = (c: CommandeEditeur) => commandeDisponible(c, { writable, brouillon, drawing, trace, suite, selectionIds, tool, canSave, largeurVue: cadre.w });
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
  // Visibilité (profil), disponibilité (contexte) et droit réel (serveur) restent trois choses : la raison d'un refus
  // ne lit jamais les préférences d'outils (`variante/droits.ts`).
  const etatDroit: EtatDroit = {
    canWrite: context ? context.canWrite : null, historique: historical, suspendue: pending || blocked || (uncertain && !enr.dessinHorsLigne),
    ...(catalogueAutorise.data ? { motif: catalogueAutorise.data.droits.motif } : {}),
  };
  const raisonDe = (e: EntreeCatalogue) => raisonEntree(e.droit, entreeDisponible(e), etatDroit);
  const raisonCible = (c: CibleRaccourci) => {
    const e = CATALOGUE.find(x => (c.type === "outil" ? x.outil?.toolId === c.toolId : x.commande?.id === c.id));
    return e ? raisonDe(e) : null;
  };
  function executerEntree(e: EntreeCatalogue) {
    setDialogue(null);
    executer(e.cible, true);
  }
  useClavierStudio({ dialogue: !!dialogue, pret: !!context && !!drawing, commandeDisponible: commandAvailable, executer, espace: gestes.espace });

  if (!loading && refused(loadError)) return <StudioRefus quoi={historical ? "revision" : "variante"} />;
  const toolEntry = STUDIO_TOOLS.find(t => t.toolId === tool);
  const toResolve = drawing?.dimensions?.filter(d => d.toResolve).length ?? 0;
  const angulairesAResoudre = drawing?.annotations?.filter(a => a.type === "angular-dimension" && a.toResolve).length ?? 0;
  const etatTrace = { outil: tool, trace, suite, modeArc };
  const apercuForme = apercuPlanche(etatTrace, survol?.point);
  // Aperçu d'une transformation (Copier, Rotation, Symétrie, Échelle) : le brouillon tel que le clic le donnerait.
  const apercuTransformation = (() => {
    const cs = drawing && trace && survol && writable ? outil?.apercuCommandes?.({ ...etatTrace, trace }, survol.point, contexteClic()) : null;
    return cs ? apercuBrouillon(drawing!, cs) : null;
  })();
  const hint = aidePlanche({ ...etatTrace, moveWithPointer, lectureSeule: !writable && !historical && context?.canWrite === false });
  const pasAffiche = pas.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
  const etat = historical ? "Révision historique" : pending ? "Sauvegarde en cours…" : uncertain ? "Sauvegarde non confirmée" : commands.length ? "Brouillon non enregistré" : enr.saved ? "Enregistré sur le serveur" : "Version serveur chargée";
  return <section className="studio-workspace" ref={shell} aria-label="Studio" data-studio-variante={variantId} data-studio-revision-vue={historical ? revisionId : undefined}>
    <EnTeteStudio context={context} />
    <AlerteStudio error={error} blocked={blocked && !enr.horsLigne.conflit} surRecharger={() => void enr.rechargerServeur()} />
    {loading && <p role="status">Chargement de la planche…</p>}
    {context && drawing && !historical && <AvisRevision projectId={projectId} studyId={studyId} variantId={variantId} teteAffichee={context.variant.headRevisionId} actif={!pending && !blocked && !uncertain && !enr.horsLigne.conflit} nonEnregistre={commands.length > 0}
      surRecharger={async () => {
        const depart = context.revision.id, brouillonDepart = brouillon;
        const c = await api.studioContext(projectId, studyId, variantId);
        // A.5-10 : une lecture dépassée par un enregistrement ou un rechargement survenu entre-temps n'est pas appliquée.
        if (!alive.current) return;
        if (!lectureApplicable(depart, affiche.current.context, affiche.current.brouillon, brouillonDepart)) throw new Error("lecture dépassée");
        setContext(c); setBrouillon(creerBrouillon(c.revision.document)); cancelTrace(); enr.setSaved(false); setError(""); }} />}
    {context && drawing && <><BandeauVariante projectId={projectId} studyId={studyId} variantId={variantId} context={context} historical={historical} etat={etat} commentaires={commentaires} surCommentaires={() => setCommentaires(v => !v)}
      connexion={{ etat: enr.horsLigne, surRecharger: () => void enr.rechargerServeur(), surReporter: () => void enr.reporter() }} />
    <BarreOutils outil={tool} outilDisponible={toolAvailable} commandeDisponible={commandAvailable} raison={raisonCible} libelleCommande={uncertain ? { enregistrer: "Réessayer la sauvegarde" } : undefined}
      basculeActive={{ ...gestes.basculesActives, "accrochage-sommets": accrocheSommets, "accrochage-grille": accrocheGrille, "vue-3d": vue3d, "navigation-3d": vue3d && navigation3d === "plan", "coupe-3d": vue3d && coupe3d }} lienCommande={liens} surOutil={runTool} surCommande={runCommand} surLien={surLien} />
    <p className="studio-undo-scope" data-studio-annuler-portee>{`Annuler et Rétablir ne portent que sur les modifications non enregistrées (${commands.length} commande(s) en attente) ; une révision enregistrée ne s’annule pas ici.`}</p>
    <div className="studio-editor"><div className="studio-sheet" data-studio-projection-plan={!vue3d ? versionPlan(drawing) : undefined}><div className="studio-sheet-caption"><span>Dessin et modélisation</span><span data-studio-pas-grille={pas}>{`Grille ${pasAffiche} m`}</span><span>1 unité = 1 m</span></div>
      {vue3d && <Vue3D doc={drawing} outil={tool} modifiable={writable} navigation={navigation3d} coupe={coupe3d} selection={solide3d} layerId={actif?.id ?? STUDIO_DEFAULT_LAYER_ID}
        surSelection={setSolide3d} surCommandes={apply} selectionArchitecture={panneauArchi} surSelectionArchitecture={(id) => (id ? choisirArchitecture(id, false) : setSelectionArchi(null))}
        demande={demande3d} surDemandeTraitee={() => setDemande3d(null)} surNavigation={setNavigation3d}
        provenance={{ etude: { id: context.study.id, nom: context.study.name }, variante: { id: context.variant.id, nom: context.variant.name }, revisionId: context.revision.id, nonEnregistre: commands.length > 0 }} />}
      {!vue3d && <Dessin2D svgRef={gestes.refPlanche} doc={apercuDoc ?? apercuTransformation ?? drawing} cadre={cadre} pas={pas} outil={tool} selection={selectionSet} trace={trace} survol={survol} rectangle={gestes.rectangle} glissement={!!gestes.apercu}
        apercuForme={apercuForme} sommetsPoses={suite}
        clicsVersPlanche={o => OUTILS_TRACE.has(tool) || (moveWithPointer && (!!trace || selectionSet.has(o.id)))}
        surPlanche={board} surSurvol={gestes.pointerMove} surPointeurBas={gestes.pointerDown} surPointeurHaut={gestes.pointerUp} surClicCapture={gestes.clickCapture} surSelection={(id, plus) => select(plus ? basculer(selectionIds, id) : [id])}
        architecture={{ selection: new Set([...selectionIds, ...(selectionArchi ? [selectionArchi] : [])]), surSelection: choisirArchitecture, versPlanche: OUTILS_TRACE.has(tool) }} />}
      {!vue3d && trace && pointsActifs && <ChampMesures base={suite[suite.length - 1] ?? trace.point} survol={survol?.point ?? null} direction={gestes.directionCourante()} verrou={gestes.verrouAngle}
        pasPolaire={gestes.bascules.pasPolaire} surPasPolaire={gestes.poserPasPolaire} desactive={!writable}
        surSaisie={(texte) => { const r = gestes.saisir(texte); if (r.type === "erreur") return r.message; if (r.type === "point") poser({ point: r.point, accroche: null }); return null; }} />}
      <p className="studio-hint">{hint}</p>
      <p className="studio-hint" data-studio-aide-vue>Molette : zoom sur le pointeur ; bouton du milieu, Espace + glisser ou deux doigts : déplacer la vue.</p>
      {toResolve > 0 && <p className="studio-alert" role="status" data-studio-cotes-a-resoudre={toResolve}>{`${toResolve} cote(s) à résoudre : un objet coté a été supprimé.`}</p>}
      {angulairesAResoudre > 0 && <p className="studio-alert" role="status" data-studio-cotes-angulaires-a-resoudre={angulairesAResoudre}>{`${angulairesAResoudre} cote(s) angulaire(s) à résoudre : un segment lié a été supprimé.`}</p>}
      {info && <p className="studio-info" role="status">{info}</p>}
      {actif && !actif.visible && OUTILS_TRACE.has(tool) && <p className="studio-info">Le calque actif est masqué : ce que vous dessinez n’apparaîtra pas.</p>}
    </div>
    <PanneauProprietes titre={toolEntry?.libelleFR} drawing={drawing} selectionIds={selectionIds} selected={selected} writable={writable} formesChoisies={formesChoisies} extrusion={extrusion}
      surExtrusion={setExtrusion} surExtruder={extrude} surAplatir={() => runTool("studio.objet.aplatir")} surSupprimer={() => runTool("studio.dessin.supprimer")}
      architecture={<PanneauArchitecture doc={drawing} outil={tool} selection={panneauArchi} modifiable={writable} parametres={parametresArchi} surParametres={setParametresArchi}
        contexte={() => ({ nouvelId: () => crypto.randomUUID(), layerId: layerId() })} surCommandes={apply} surErreur={setError} surSelection={(id) => (id ? choisirArchitecture(id, false) : select([]))} />}
      formulaire={tool !== "studio.dessin.selection" && !OUTILS_VOLUME_LIBRE.has(tool) && !tool.startsWith("studio.architecture.") && <FormulaireValeurs tool={tool} selected={selected} desactive={!writable || formulaireInactif(tool, selectionIds, selected) || (tool === "studio.dessin.modifier" && (selected?.type === "dimension" || selected?.type === "angular-dimension") && selected.toResolve)}
        values={values} surValeur={(k, v) => setValues(x => ({ ...x, [k]: v }))} modeArc={modeArc} surModeArc={m => { setModeArc(m); cancelTrace(); }}
        sommetsTexte={sommetsTexte} surSommets={setSommetsTexte} fermee={fermee} surFermee={setFermee} surSoumettre={numeric} texte={texteSaisi} surTexte={setTexteSaisi} />}
      calques={<PanneauCalques doc={drawing} actif={actif?.id ?? STUDIO_DEFAULT_LAYER_ID} modifiable={writable} nom={nomCalque} nomRef={nomRef} surActif={id => setCalqueActif(id)} surNom={setNomCalque} surReglage={setLayer} surRenommer={renameLayer} />} /></div>
    <ListeElements doc={drawing} selection={selectionIds} modifiable={writable} surSelection={select} surSupprimer={() => runTool("studio.dessin.supprimer")} />
    {commentaires && <div id="studio-commentaires"><PanneauCommentaires projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} revision={context.revision.document} dessin={drawing}
      selection={selectionIds} canWrite={!historical && context.canWrite} surSelection={ids => { setTool("studio.dessin.selection"); cancelTrace(); select(ids); }} /></div>}
    <RevisionsPanel projectId={projectId} studyId={studyId} variantId={variantId} headRevisionId={context.variant.headRevisionId} shownRevisionId={context.revision.id} />
    {drawing && <PanneauQuantites projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} doc={drawing} lectureSeule={!writable || historical} nonEnregistre={commands.length > 0} />}
    {drawing && <PanneauExigences projectId={projectId} studyId={studyId} variantId={variantId} revisionId={context.revision.id} doc={drawing} cibleId={cibleSelection(drawing, selectionArchi, selectionIds)}
      modifiable={writable} ecriture={!historical && context.canWrite} nonEnregistre={commands.length > 0} surCommandes={apply} surErreur={setError} />}
    <DialoguesStudio dialogue={dialogue} surFermer={() => setDialogue(null)} disponible={entreeDisponible} raison={raisonDe} surExecuter={executerEntree} drawing={drawing} modifiable={writable}
      surImporter={(cs, r) => { if (!apply(cs)) return false; setDialogue(null); setInfo(`Import DXF ajouté au brouillon : ${r.rapport.entites.total} objet(s). Enregistrez pour l’envoyer au serveur.`); return true; }}
      revision={context.revision.document} brouillonNonEnregistre={commands.length > 0}
      cartouche={() => cartoucheInitial({ projet: projet.data, etude: context.study, variante: context.variant, revision: { id: context.revision.id, ...revisionAffichee }, utilisateur: user })} />
    {rapportExport && liens[rapportExport] && <RapportExport format={FORMATS_RAPPORT[rapportExport]!} urlExport={liens[rapportExport]!} exportId={`${context?.revision.id ?? ""}#${exportsLances}`} surFermer={() => setRapportExport(null)} />}</>}
  </section>;
}
