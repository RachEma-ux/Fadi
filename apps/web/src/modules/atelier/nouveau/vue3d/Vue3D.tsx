/**
 * Zone de travail 3D (lot 3b) : orbite / panoramique / zoom (souris et toucher, deux doigts), sélection au clic
 * synchronisée avec le plan, présentations bâtiment / niveau / éclaté, coupe horizontale réglable, vues
 * techniques de travail (dessus, coupes N–S et E–O réglables, quatre façades), pousser / tirer avec aperçu
 * (DA-04-07) émis comme une seule commande au relâchement.
 */
import type { Vector3 } from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { etendueMur, maillageObjet, vues3D, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { Scene3D, type OptionsScene, type Presentation, type VueTechnique } from "./scene3d";

export interface PropsVue3D {
  etat: ModeleAtelier;
  ui: EtatUi;
  readOnly: boolean;
  onCommandes: (commandes: Commande[], label: string) => void;
  /** Références externes : traits dans le repère du projet, par niveau (DA-05-11). */
  externes?: readonly { niveauId: string; traits: readonly { a: { x: number; y: number }; b: { x: number; y: number } }[] }[];
}

const VUES: { id: VueTechnique; libelle: string }[] = [
  { id: "perspective", libelle: "Perspective" },
  { id: "dessus", libelle: "Plan (dessus)" },
  { id: "coupe-ns", libelle: "Coupe nord–sud" },
  { id: "coupe-eo", libelle: "Coupe est–ouest" },
  { id: "facade-sud", libelle: "Façade sud" },
  { id: "facade-nord", libelle: "Façade nord" },
  { id: "facade-est", libelle: "Façade est" },
  { id: "facade-ouest", libelle: "Façade ouest" },
];

const PRESENTATIONS: { id: Presentation; libelle: string }[] = [
  { id: "batiment", libelle: "Bâtiment" },
  { id: "niveau", libelle: "Niveau actif" },
  { id: "eclate", libelle: "Éclaté" },
  { id: "eclate-horizontal", libelle: "Éclaté horizontal" },
  { id: "eclate-classes", libelle: "Éclaté par classe" },
  { id: "eclate-groupes", libelle: "Éclaté par groupe" },
];

const fmt = (v: number) => v.toFixed(2).replace(".", ",");

/** Grandeur poussée / tirée pour une classe, et la valeur de départ. */
function grandeurPoussee(etat: ModeleAtelier, o: OccurrenceQuelconque): { cle: "hauteur" | "epaisseur"; depart: number } | null {
  switch (o.classe) {
    case "mur": {
      const e = etendueMur(etat, o);
      return e ? { cle: "hauteur", depart: e[1] - e[0] } : null;
    }
    case "poteau":
    case "solide":
      return o.params.hauteur ? { cle: "hauteur", depart: o.params.hauteur.value } : null;
    case "dalle":
    case "toiture":
      return { cle: "epaisseur", depart: o.params.epaisseur.value };
    default:
      return null;
  }
}

function avecValeur(o: OccurrenceQuelconque, cle: "hauteur" | "epaisseur", v: number): OccurrenceQuelconque {
  const params = { ...(o.params as unknown as Record<string, unknown>), [cle]: { value: v, unit: "m" } };
  if (o.classe === "mur") params["niveauHautId"] = null;
  return { ...o, params } as unknown as OccurrenceQuelconque;
}

const SANS_EXTERNES: NonNullable<PropsVue3D["externes"]> = [];

export function Vue3D({ etat, ui, readOnly, onCommandes, externes = SANS_EXTERNES }: PropsVue3D) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const conteneur = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const [pret, setPret] = useState(false);
  const [moteur, setMoteur] = useState<"webgl2" | "webgpu" | null>(null);
  const [webgpu, setWebgpu] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Le niveau actif vient toujours de l'état d'affichage partagé (jamais d'une copie locale qui pourrait retarder).
  // Visite à hauteur d'œil (D-075) : hauteur saisie au-dessus du niveau actif (1,60 m proposé, convention de vue).
  const [hauteurOeil, setHauteurOeil] = useState("1,60");
  const [visite, setVisite] = useState<number | null>(null);
  const commencerVisite = () => {
    const h = Number(hauteurOeil.replace(",", "."));
    const n = ui.niveauId ? etat.niveaux[ui.niveauId] : null;
    if (!n || !(h > 0)) return;
    sceneRef.current?.commencerVisite(n.elevation + h);
    setVisite(n.elevation + h);
    etatUi.set({ aide: "Visite : glissez pour regarder autour ; ↑ ↓ (ou Z S) pour avancer, ← → (ou Q D) pour tourner ; Maj : pas plus grands." });
  };
  const bouger = (avance: number, tour: number) => {
    if (avance) sceneRef.current?.avancerVisite(avance);
    if (tour) sceneRef.current?.tournerVisite(tour);
  };
  useEffect(() => {
    if (visite === null) return;
    const touche = (e: KeyboardEvent) => {
      const cible = e.target as HTMLElement | null;
      if (cible && (cible.tagName === "INPUT" || cible.tagName === "TEXTAREA" || cible.tagName === "SELECT" || cible.isContentEditable)) return;
      const k = e.key.toLowerCase();
      const pas = e.shiftKey ? 2 : 0.5;
      const angle = e.shiftKey ? 45 : 15;
      if (k === "arrowup" || k === "z" || k === "w") bouger(pas, 0);
      else if (k === "arrowdown" || k === "s") bouger(-pas, 0);
      else if (k === "arrowleft" || k === "q" || k === "a") bouger(0, angle);
      else if (k === "arrowright" || k === "d") bouger(0, -angle);
      else if (k === "escape") {
        sceneRef.current?.quitterVisite();
        setVisite(null);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  }, [visite]);
  const [reglages, setReglages] = useState<Omit<OptionsScene, "niveauActif">>({ vue: "perspective", presentation: "batiment", coupeHorizontale: null, positionCoupe: 0.5, aretes: true });
  const options: OptionsScene = useMemo(() => ({ ...reglages, niveauActif: ui.niveauId }), [reglages, ui.niveauId]);
  const setOptions = (patch: Partial<Omit<OptionsScene, "niveauActif">>) => setReglages((r) => ({ ...r, ...patch }));
  const [pousse, setPousse] = useState<{ valeur: number; cle: string } | null>(null);
  // Mesure 3D (D-048) : outil Mesurer, deux points relevés sur les surfaces visibles.
  const [mesure, setMesure] = useState<Vector3[]>([]);
  // Annotations 3D (D-090) : points annotés, enregistrés avec la vue ; mode « Annoter » ; positions à l'écran.
  const [annotations, setAnnotations] = useState<{ position: { x: number; y: number; z: number }; texte: string }[]>([]);
  const [annoter, setAnnoter] = useState(false);
  const [pointAnnote, setPointAnnote] = useState<{ x: number; y: number; z: number } | null>(null);
  const [texteAnnote, setTexteAnnote] = useState("");
  const [, setTic] = useState(0);
  useEffect(() => {
    const sc = sceneRef.current;
    if (!sc || !pret) return;
    sc.onRendu = annotations.length ? () => setTic((n) => (n + 1) % 1e6) : null;
    return () => {
      sc.onRendu = null;
    };
  }, [annotations.length, pret]);
  useEffect(() => {
    if (ui.outil !== "mesurer" && mesure.length) setMesure([]);
  }, [ui.outil, mesure.length]);
  useEffect(() => {
    if (pret) sceneRef.current?.majMesure(mesure);
  }, [mesure, pret]);
  const geste = useRef<{ x: number; y: number; bouge: boolean; pousser: null | { o: OccurrenceQuelconque; cle: "hauteur" | "epaisseur"; depart: number; ppm: number; valeur: number }; poignee?: { axe: "x" | "y" | "z"; t0: number; d: number }; rotation?: { a0: number; angle: number; centre: { x: number; y: number } } } | null>(null);
  const [deplace, setDeplace] = useState<{ axe: "x" | "y" | "z" | "r"; d: number } | null>(null);
  const webgpuDisponible = typeof navigator !== "undefined" && "gpu" in navigator;

  // Création / recréation du moteur.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let annule = false;
    const s = new Scene3D(canvas);
    sceneRef.current = s;
    setPret(false);
    s.initialiser(webgpu)
      .then((m) => {
        if (annule) return;
        setMoteur(m);
        const r = conteneur.current?.getBoundingClientRect();
        s.redimensionner(r?.width ?? 800, r?.height ?? 600);
        setPret(true);
      })
      .catch((err: unknown) => setErreur(err instanceof Error ? err.message : String(err)));
    return () => {
      annule = true;
      s.liberer();
      sceneRef.current = null;
    };
  }, [webgpu]);

  useEffect(() => {
    const el = conteneur.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      if (e && sceneRef.current && pret) sceneRef.current.redimensionner(e.contentRect.width, e.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pret]);

  useEffect(() => {
    if (pret) sceneRef.current?.majModele(etat);
  }, [etat, pret]);

  useEffect(() => {
    if (pret) sceneRef.current?.majExternes(externes);
  }, [externes, pret]);

  // Vue 3D enregistrée à rejouer (D-053) : son point de vue est posé après l'application de ses réglages.
  const [rejeu, setRejeu] = useState(0);
  const pointDeVueEnAttente = useRef<{ position: { x: number; y: number; z: number }; cible: { x: number; y: number; z: number } } | null>(null);
  useEffect(() => {
    if (!pret) return;
    sceneRef.current?.appliquerOptions(options, false);
    if (pointDeVueEnAttente.current) {
      sceneRef.current?.placerPointDeVue(pointDeVueEnAttente.current);
      pointDeVueEnAttente.current = null;
    }
  }, [options, pret, etat, rejeu]);
  const enregistrees = useMemo(() => vues3D(etat), [etat]);
  const [vueChoisie, setVueChoisie] = useState("");
  const [nomVue, setNomVue] = useState("");
  const rejouer = (id: string) => {
    const v = enregistrees.find((x) => x.id === id);
    if (!v) return;
    pointDeVueEnAttente.current = v.params.camera;
    if (v.params.niveauId && etat.niveaux[v.params.niveauId] && v.params.niveauId !== ui.niveauId) etatUi.set({ niveauId: v.params.niveauId });
    setRejeu((n) => n + 1);
    setReglages({ vue: v.params.vue, presentation: v.params.presentation, coupeHorizontale: v.params.coupeHorizontale, positionCoupe: v.params.positionCoupe, aretes: v.params.aretes, boiteCoupe: v.params.boiteCoupe ?? null });
    setAnnotations(v.params.annotations ?? []);
  };
  const enregistrer = () => {
    const s = sceneRef.current;
    const nom = nomVue.trim();
    if (!s || !nom) return;
    const existante = enregistrees.find((x) => x.nom === nom);
    onCommandes([{ type: "vue3d.enregistrer", params: { ...(existante ? { id: existante.id } : {}), nom, camera: s.pointDeVue(), vue: options.vue, presentation: options.presentation, coupeHorizontale: options.coupeHorizontale, positionCoupe: options.positionCoupe, aretes: options.aretes, niveauId: ui.niveauId, ...(options.boiteCoupe ? { boiteCoupe: options.boiteCoupe } : {}), ...(annotations.length ? { annotations } : {}) } }], `${existante ? "Mettre à jour" : "Enregistrer"} la vue 3D « ${nom} »`);
    setNomVue("");
  };

  useEffect(() => {
    if (pret) sceneRef.current?.majSelection(ui.selection);
  }, [ui.selection, pret, etat, options]);

  const pousserActif = ui.outil === "pousser";
  // Manipulateur à poignées : outil Sélection, sélection modifiable (calques non verrouillés).
  const poigneesActives = pret && ui.outil === "selection" && !readOnly && ui.selection.length > 0 && ui.selection.every((id) => { const o = etat.objets[id]; return o && !(o.calqueId && etat.calques[o.calqueId]?.verrouille); });
  // Flèche verticale : seulement si chaque objet sélectionné porte un décalage de base (sinon il suit son niveau).
  const avecZ = poigneesActives && ui.selection.every((id) => { const p = etat.objets[id]?.params as { decalageBase?: { value: number } } | undefined; return typeof p?.decalageBase?.value === "number"; });
  useEffect(() => {
    if (pret) sceneRef.current?.majPoignees(poigneesActives, avecZ);
  }, [poigneesActives, avecZ, ui.selection, pret, etat, options]);

  function relatif(e: React.PointerEvent): { x: number; y: number } {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function surAppui(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = sceneRef.current;
    if (!s || e.button !== 0) return;
    const p = relatif(e);
    geste.current = { x: p.x, y: p.y, bouge: false, pousser: null };
    if (poigneesActives && !pousserActif) {
      const axe = s.poigneeSous(p.x, p.y);
      if (axe === "r") {
        const a0 = s.angleAutourDuCentre(p.x, p.y);
        const centre = s.centreEnPlan();
        if (a0 !== null && centre) {
          s.activerControles(false);
          canvasRef.current?.setPointerCapture(e.pointerId);
          geste.current.rotation = { a0, angle: 0, centre };
          return;
        }
      }
      const t0 = axe && axe !== "r" ? s.abscisseSurAxe(axe, p.x, p.y) : null;
      if (axe && axe !== "r" && t0 !== null) {
        s.activerControles(false);
        canvasRef.current?.setPointerCapture(e.pointerId);
        geste.current.poignee = { axe, t0, d: 0 };
        return;
      }
    }
    if (!pousserActif || readOnly) return;
    const hit = s.pointer(p.x, p.y);
    const o = hit ? etat.objets[hit.objetId] : undefined;
    const g = o ? grandeurPoussee(etat, o) : null;
    if (!o || !g || !hit) {
      etatUi.set({ aide: "Pousser / tirer : cliquez un mur, un poteau, un solide, une dalle ou une toiture, puis glissez vers le haut ou le bas." });
      return;
    }
    const calque = o.calqueId ? etat.calques[o.calqueId] : null;
    if (calque?.verrouille) {
      etatUi.set({ aide: `Calque « ${calque.nom} » verrouillé.` });
      return;
    }
    s.activerControles(false);
    canvasRef.current?.setPointerCapture(e.pointerId);
    const surface = hit.point.clone();
    geste.current.pousser = { o, cle: g.cle, depart: g.depart, ppm: s.pixelsParMetreVertical(surface), valeur: g.depart };
    etatUi.selectionner([o.id]);
  }

  function surMouvement(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = geste.current;
    if (!g) return;
    const p = relatif(e);
    if (Math.hypot(p.x - g.x, p.y - g.y) > 4) g.bouge = true;
    if (g.rotation) {
      const a = sceneRef.current?.angleAutourDuCentre(p.x, p.y);
      if (a === null || a === undefined) return;
      let d = a - g.rotation.a0;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      // Pas d'un degré ; Maj : pas de 15°.
      const pas = e.shiftKey ? 15 : 1;
      g.rotation.angle = Math.round(d / pas) * pas;
      setDeplace({ axe: "r", d: g.rotation.angle });
      sceneRef.current?.apercuRotation(g.rotation.angle);
      return;
    }
    if (g.poignee) {
      const t = sceneRef.current?.abscisseSurAxe(g.poignee.axe, p.x, p.y);
      if (t === null || t === undefined) return;
      // Pas d'un centimètre ; Maj : pas de 10 cm.
      const pas = e.shiftKey ? 0.1 : 0.01;
      const d = Math.round((t - g.poignee.t0) / pas) * pas;
      g.poignee.d = Math.round(d * 1000) / 1000;
      setDeplace({ axe: g.poignee.axe, d: g.poignee.d });
      sceneRef.current?.apercuDeplacement(g.poignee.axe === "x" ? g.poignee.d : 0, g.poignee.axe === "y" ? g.poignee.d : 0, g.poignee.axe === "z" ? g.poignee.d : 0);
      return;
    }
    if (!g.pousser) return;
    const delta = -(p.y - g.y) / g.pousser.ppm;
    const valeur = Math.max(0.01, Math.round((g.pousser.depart + delta) * 100) / 100);
    g.pousser.valeur = valeur;
    setPousse({ valeur, cle: g.pousser.cle });
    sceneRef.current?.majApercu(maillageObjet(etat, avecValeur(g.pousser.o, g.pousser.cle, valeur)));
  }

  function surRelache(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = sceneRef.current;
    const g = geste.current;
    geste.current = null;
    if (!s || !g) return;
    if (g.rotation) {
      s.activerControles(true);
      s.apercuDeplacement(0, 0);
      setDeplace(null);
      const { angle, centre } = g.rotation;
      if (Math.abs(angle) >= 0.5) {
        const n = ui.selection.length;
        onCommandes([{ type: "transformer.tourner", params: { centre: { x: Math.round(centre.x * 1e6) / 1e6, y: Math.round(centre.y * 1e6) / 1e6, frame: "local", unit: "m" }, angle: { value: angle, unit: "deg" } }, cibles: ui.selection }], `Tourner ${n} objet${n > 1 ? "s" : ""} de ${fmt(angle)}° (manipulateur 3D)`);
      }
      return;
    }
    if (g.poignee) {
      s.activerControles(true);
      s.apercuDeplacement(0, 0);
      setDeplace(null);
      const { axe, d } = g.poignee;
      if (Math.abs(d) >= 0.005) {
        const n = ui.selection.length;
        if (axe === "z") {
          // Translation verticale : le décalage de base de chaque objet, modifié dans un seul lot.
          const commandes = ui.selection.map((id) => {
            const actuel = (etat.objets[id]!.params as unknown as { decalageBase: { value: number } }).decalageBase.value;
            return { type: "objet.modifier", params: { id, params: { decalageBase: { value: Math.round((actuel + d) * 1000) / 1000, unit: "m" } } } };
          });
          onCommandes(commandes, `Élever ${n} objet${n > 1 ? "s" : ""} de ${fmt(d)} m (Z, manipulateur 3D)`);
        } else onCommandes([{ type: "transformer.deplacer", params: { dx: axe === "x" ? d : 0, dy: axe === "y" ? d : 0 }, cibles: ui.selection }], `Déplacer ${n} objet${n > 1 ? "s" : ""} de ${fmt(d)} m (${axe.toUpperCase()}, manipulateur 3D)`);
      }
      return;
    }
    if (g.pousser) {
      s.activerControles(true);
      s.majApercu(null);
      setPousse(null);
      const { o, cle, depart, valeur } = g.pousser;
      if (Math.abs(valeur - depart) >= 0.01) {
        const params: Record<string, unknown> = { [cle]: { value: valeur, unit: "m" } };
        if (o.classe === "mur") params["niveauHautId"] = null;
        onCommandes([{ type: "objet.modifier", params: { id: o.id, params } }], `${cle === "hauteur" ? "Hauteur" : "Épaisseur"} ${fmt(valeur)} m (pousser / tirer)`);
      }
      return;
    }
    if (g.bouge) return;
    const p = relatif(e);
    const hit = s.pointer(p.x, p.y);
    if (annoter) {
      if (!hit) return void etatUi.set({ aide: "Annoter : cliquez un point sur une surface visible." });
      setPointAnnote({ x: Math.round(hit.point.x * 1000) / 1000, y: Math.round(hit.point.y * 1000) / 1000, z: Math.round(hit.point.z * 1000) / 1000 });
      return;
    }
    if (ui.outil === "mesurer") {
      if (!hit) return void etatUi.set({ aide: "Mesurer en 3D : cliquez un point sur une surface visible." });
      const point = hit.point.clone();
      setMesure((m) => (m.length >= 2 ? [point] : [...m, point]));
      return;
    }
    if (hit) {
      const o = etat.objets[hit.objetId];
      if (e.shiftKey) etatUi.set((u) => ({ selection: u.selection.includes(hit.objetId) ? u.selection.filter((x) => x !== hit.objetId) : [...u.selection, hit.objetId] }));
      else etatUi.selectionner([hit.objetId]);
      if (o?.niveauId && o.niveauId !== ui.niveauId && options.presentation !== "niveau") etatUi.set({ niveauId: o.niveauId });
    } else if (!e.shiftKey) etatUi.selectionner([]);
  }

  const verticale = options.vue === "coupe-ns" || options.vue === "coupe-eo";

  return (
    <div className="vue3d" ref={conteneur}>
      <canvas
        ref={canvasRef}
        className={`vue3d-canevas${pousserActif ? " outil-pousser" : ""}`}
        aria-label="Vue 3D du modèle : glisser pour tourner, clic droit ou deux doigts pour déplacer, molette ou pincement pour zoomer"
        role="img"
        onPointerDown={surAppui}
        onPointerMove={surMouvement}
        onPointerUp={surRelache}
        onPointerCancel={() => {
          geste.current = null;
          sceneRef.current?.activerControles(true);
          sceneRef.current?.majApercu(null);
          sceneRef.current?.apercuDeplacement(0, 0);
          setPousse(null);
          setDeplace(null);
        }}
      />
      <div className="vue3d-commandes" role="group" aria-label="Réglages de la vue 3D">
        <label>
          <span className="sr-only">Vue</span>
          <select aria-label="Vue" value={options.vue} onChange={(e) => setOptions({ vue: e.target.value as VueTechnique })}>
            {VUES.map((v) => <option key={v.id} value={v.id}>{v.libelle}</option>)}
          </select>
        </label>
        {options.vue === "perspective" && (
          <label>
            <span className="sr-only">Présentation</span>
            <select aria-label="Présentation" value={options.presentation} onChange={(e) => setOptions({ presentation: e.target.value as Presentation })}>
              {PRESENTATIONS.map((v) => <option key={v.id} value={v.id}>{v.libelle}</option>)}
            </select>
          </label>
        )}
        {options.vue === "perspective" && (options.presentation === "eclate" || options.presentation === "eclate-horizontal" || options.presentation === "eclate-classes" || options.presentation === "eclate-groupes") && (
          <label className="vue3d-curseur">
            Écart {fmt(options.ecartEclate ?? 4)} m
            <input type="range" data-ecart-eclate min={0} max={20} step={0.5} value={options.ecartEclate ?? 4} onChange={(e) => setOptions({ ecartEclate: e.target.valueAsNumber })} />
          </label>
        )}
        {ui.isolement ? (
          <button type="button" data-isolement="quitter" onClick={() => etatUi.set({ isolement: null, aide: "Isolement quitté : tout l'affichage revient." })}>
            Quitter l'isolement ({ui.isolement.length})
          </button>
        ) : (
          ui.selection.length > 0 && (
            <button type="button" data-isolement="isoler" title="N'afficher que la sélection (pour vous seulement ; le modèle n'est pas modifié)" onClick={() => etatUi.set({ isolement: [...ui.selection], aide: "Sélection isolée : seuls ces objets sont affichés, pour vous seulement." })}>
              Isoler la sélection
            </button>
          )
        )}
        {options.vue === "perspective" && options.presentation !== "eclate" && options.presentation !== "eclate-horizontal" && options.presentation !== "eclate-classes" && options.presentation !== "eclate-groupes" && (
          <label className="vue3d-case">
            <input type="checkbox" checked={options.coupeHorizontale !== null} onChange={(e) => setOptions({ coupeHorizontale: e.target.checked ? 1.2 : null })} />
            Coupe horizontale
          </label>
        )}
        {(options.vue === "dessus" || (options.vue === "perspective" && options.coupeHorizontale !== null)) && (
          <label className="vue3d-curseur">
            Hauteur de coupe {fmt(options.coupeHorizontale ?? 1.2)} m
            <input type="range" min={0.1} max={Math.max(1, (ui.niveauId ? etat.niveaux[ui.niveauId]?.hauteur : null) ?? 3.5)} step={0.05} value={options.coupeHorizontale ?? 1.2} onChange={(e) => setOptions({ coupeHorizontale: e.target.valueAsNumber })} />
          </label>
        )}
        {verticale && (
          <label className="vue3d-curseur">
            Position de la coupe
            <input type="range" min={0.02} max={0.98} step={0.01} value={options.positionCoupe} onChange={(e) => setOptions({ positionCoupe: e.target.valueAsNumber })} />
          </label>
        )}
        {options.vue === "perspective" && !(options.presentation ?? "").startsWith("eclate") && (
          <label className="vue3d-case">
            <input type="checkbox" checked={!!options.boiteCoupe} data-boite-coupe onChange={(e) => setOptions({ boiteCoupe: e.target.checked ? { x0: 0.1, x1: 0.9, y0: 0.1, y1: 0.9 } : null })} />
            Boîte de coupe
          </label>
        )}
        {options.vue === "perspective" && options.boiteCoupe && !(options.presentation ?? "").startsWith("eclate") && (
          <span className="vue3d-ligne" data-boite-coupe-reglages>
            {(["x0", "x1", "y0", "y1"] as const).map((k) => (
              <label key={k} className="vue3d-curseur">
                {k === "x0" ? "Ouest" : k === "x1" ? "Est" : k === "y0" ? "Sud" : "Nord"}
                <input type="range" min={0} max={1} step={0.01} value={options.boiteCoupe![k]} data-boite={k} onChange={(e) => { const v = e.target.valueAsNumber; const b = { ...options.boiteCoupe!, [k]: v }; if (b.x0 < b.x1 - 0.01 && b.y0 < b.y1 - 0.01) setOptions({ boiteCoupe: b }); }} />
              </label>
            ))}
          </span>
        )}
        <label className="vue3d-case">
          <input type="checkbox" checked={options.aretes} onChange={(e) => setOptions({ aretes: e.target.checked })} />
          Arêtes
        </label>
        <button type="button" onClick={() => sceneRef.current?.cadrer()} disabled={visite !== null}>Cadrer</button>
        <button type="button" aria-pressed={annoter} data-annoter onClick={() => { setAnnoter(!annoter); setPointAnnote(null); }}>{annoter ? "Fin des annotations" : "Annoter"}</button>
        {annotations.length > 0 && <button type="button" onClick={() => setAnnotations([])}>Effacer les annotations ({annotations.length})</button>}
        {options.vue === "perspective" && (visite === null ? (
          <span className="vue3d-ligne">
            <label className="vue3d-curseur">
              Œil à (m)
              <input inputMode="decimal" size={4} aria-label="Hauteur de l'œil au-dessus du niveau (m)" value={hauteurOeil} onChange={(e) => setHauteurOeil(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-visite-oeil />
            </label>
            <button type="button" data-visite="commencer" disabled={!ui.niveauId || !(Number(hauteurOeil.replace(",", ".")) > 0)} onClick={commencerVisite}>Visite à hauteur d'œil</button>
          </span>
        ) : (
          <span className="vue3d-ligne" data-visite-active={visite.toFixed(2)}>
            <button type="button" title="Avancer (↑ ou Z)" onClick={() => bouger(0.5, 0)}>↑<span className="sr-only">Avancer</span></button>
            <button type="button" title="Reculer (↓ ou S)" onClick={() => bouger(-0.5, 0)}>↓<span className="sr-only">Reculer</span></button>
            <button type="button" title="Tourner à gauche (← ou Q)" onClick={() => bouger(0, 15)}>↺<span className="sr-only">Tourner à gauche</span></button>
            <button type="button" title="Tourner à droite (→ ou D)" onClick={() => bouger(0, -15)}>↻<span className="sr-only">Tourner à droite</span></button>
            <button type="button" data-visite="quitter" onClick={() => { sceneRef.current?.quitterVisite(); setVisite(null); }}>Quitter la visite</button>
          </span>
        ))}
        <details className="vue3d-enregistrees" data-vues-3d>
          <summary>Vues enregistrées ({enregistrees.length})</summary>
          {enregistrees.length > 0 && (
            <span className="vue3d-ligne">
              <select aria-label="Vue enregistrée" value={vueChoisie} onChange={(e) => { setVueChoisie(e.target.value); rejouer(e.target.value); }}>
                <option value="">Choisir une vue…</option>
                {enregistrees.map((v) => <option key={v.id} value={v.id}>{v.nom}</option>)}
              </select>
              {vueChoisie && !readOnly && (
                <button type="button" onClick={() => { const v = enregistrees.find((x) => x.id === vueChoisie); if (v) onCommandes([{ type: "vue3d.supprimer", params: { id: v.id } }], `Supprimer la vue 3D « ${v.nom} »`); setVueChoisie(""); }}>
                  Supprimer
                </button>
              )}
            </span>
          )}
          {!readOnly && (
            <form className="vue3d-ligne" onSubmit={(e) => { e.preventDefault(); enregistrer(); }}>
              <input aria-label="Nom de la vue 3D" placeholder="Nom de la vue" value={nomVue} maxLength={120} onChange={(e) => setNomVue(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
              <button type="submit" disabled={!nomVue.trim()}>Enregistrer la vue</button>
            </form>
          )}
        </details>
        <label className="vue3d-case" title={webgpuDisponible ? "Moteur WebGPU (essai), repli WebGL2 en cas d'échec" : "WebGPU indisponible dans ce navigateur : WebGL2"}>
          <input type="checkbox" checked={webgpu} disabled={!webgpuDisponible} onChange={(e) => setWebgpu(e.target.checked)} />
          WebGPU
        </label>
      </div>
      {annotations.map((a, i) => {
        const q = pret ? sceneRef.current?.versEcran(a.position) : null;
        return q ? <span key={i} className="vue3d-annotation" style={{ left: q.x, top: q.y }} data-annotation={i}>{a.texte}</span> : null;
      })}
      {pointAnnote && (
        <form className="vue3d-annotation-saisie" onSubmit={(e) => { e.preventDefault(); const t = texteAnnote.trim(); if (t) { setAnnotations((l) => [...l, { position: pointAnnote, texte: t }]); setPointAnnote(null); setTexteAnnote(""); } }}>
          <input autoFocus aria-label="Texte de l'annotation" value={texteAnnote} maxLength={500} onChange={(e) => setTexteAnnote(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-annotation-texte />
          <button type="submit" disabled={!texteAnnote.trim()}>Ajouter</button>
          <button type="button" onClick={() => setPointAnnote(null)}>Annuler</button>
        </form>
      )}
      <p className="vue3d-etat" aria-live="polite">
        {erreur ? `Rendu 3D indisponible : ${erreur}` : !pret ? "Préparation de la vue 3D…" : deplace ? (deplace.axe === "r" ? `Rotation : ${fmt(deplace.d)}°` : `Déplacement ${deplace.axe.toUpperCase()} : ${fmt(deplace.d)} m`) : pousse ? `${pousse.cle === "hauteur" ? "Hauteur" : "Épaisseur"} : ${fmt(pousse.valeur)} m` : mesure.length === 2 ? `Distance : ${fmt(mesure[0]!.distanceTo(mesure[1]!))} m (Δx ${fmt(mesure[1]!.x - mesure[0]!.x)} · Δy ${fmt(mesure[1]!.y - mesure[0]!.y)} · Δz ${fmt(mesure[1]!.z - mesure[0]!.z)})` : mesure.length === 1 ? "Mesure : cliquez le second point." : `${moteur === "webgpu" ? "WebGPU" : "WebGL2"}${webgpu && moteur !== "webgpu" ? " (WebGPU indisponible, repli)" : ""}`}
      </p>
    </div>
  );
}
