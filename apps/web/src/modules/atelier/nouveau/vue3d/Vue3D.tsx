/**
 * Zone de travail 3D (lot 3b) : orbite / panoramique / zoom (souris et toucher, deux doigts), sélection au clic
 * synchronisée avec le plan, présentations bâtiment / niveau / éclaté, coupe horizontale réglable, vues
 * techniques de travail (dessus, coupes N–S et E–O réglables, quatre façades), pousser / tirer avec aperçu
 * (DA-04-07) émis comme une seule commande au relâchement.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { etendueMur, maillageObjet, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
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
  const [reglages, setReglages] = useState<Omit<OptionsScene, "niveauActif">>({ vue: "perspective", presentation: "batiment", coupeHorizontale: null, positionCoupe: 0.5, aretes: true });
  const options: OptionsScene = useMemo(() => ({ ...reglages, niveauActif: ui.niveauId }), [reglages, ui.niveauId]);
  const setOptions = (patch: Partial<Omit<OptionsScene, "niveauActif">>) => setReglages((r) => ({ ...r, ...patch }));
  const [pousse, setPousse] = useState<{ valeur: number; cle: string } | null>(null);
  const geste = useRef<{ x: number; y: number; bouge: boolean; pousser: null | { o: OccurrenceQuelconque; cle: "hauteur" | "epaisseur"; depart: number; ppm: number; valeur: number }; poignee?: { axe: "x" | "y"; t0: number; d: number }; rotation?: { a0: number; angle: number; centre: { x: number; y: number } } } | null>(null);
  const [deplace, setDeplace] = useState<{ axe: "x" | "y" | "r"; d: number } | null>(null);
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

  useEffect(() => {
    if (pret) sceneRef.current?.appliquerOptions(options, false);
  }, [options, pret, etat]);

  useEffect(() => {
    if (pret) sceneRef.current?.majSelection(ui.selection);
  }, [ui.selection, pret, etat, options]);

  const pousserActif = ui.outil === "pousser";
  // Manipulateur à poignées : outil Sélection, sélection modifiable (calques non verrouillés).
  const poigneesActives = pret && ui.outil === "selection" && !readOnly && ui.selection.length > 0 && ui.selection.every((id) => { const o = etat.objets[id]; return o && !(o.calqueId && etat.calques[o.calqueId]?.verrouille); });
  useEffect(() => {
    if (pret) sceneRef.current?.majPoignees(poigneesActives);
  }, [poigneesActives, ui.selection, pret, etat, options]);

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
      sceneRef.current?.apercuDeplacement(g.poignee.axe === "x" ? g.poignee.d : 0, g.poignee.axe === "y" ? g.poignee.d : 0);
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
        onCommandes([{ type: "transformer.deplacer", params: { dx: axe === "x" ? d : 0, dy: axe === "y" ? d : 0 }, cibles: ui.selection }], `Déplacer ${n} objet${n > 1 ? "s" : ""} de ${fmt(d)} m (${axe.toUpperCase()}, manipulateur 3D)`);
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
        {options.vue === "perspective" && options.presentation !== "eclate" && (
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
        <label className="vue3d-case">
          <input type="checkbox" checked={options.aretes} onChange={(e) => setOptions({ aretes: e.target.checked })} />
          Arêtes
        </label>
        <button type="button" onClick={() => sceneRef.current?.cadrer()}>Cadrer</button>
        <label className="vue3d-case" title={webgpuDisponible ? "Moteur WebGPU (essai), repli WebGL2 en cas d'échec" : "WebGPU indisponible dans ce navigateur : WebGL2"}>
          <input type="checkbox" checked={webgpu} disabled={!webgpuDisponible} onChange={(e) => setWebgpu(e.target.checked)} />
          WebGPU
        </label>
      </div>
      <p className="vue3d-etat" aria-live="polite">
        {erreur ? `Rendu 3D indisponible : ${erreur}` : !pret ? "Préparation de la vue 3D…" : deplace ? (deplace.axe === "r" ? `Rotation : ${fmt(deplace.d)}°` : `Déplacement ${deplace.axe.toUpperCase()} : ${fmt(deplace.d)} m`) : pousse ? `${pousse.cle === "hauteur" ? "Hauteur" : "Épaisseur"} : ${fmt(pousse.valeur)} m` : `${moteur === "webgpu" ? "WebGPU" : "WebGL2"}${webgpu && moteur !== "webgpu" ? " (WebGPU indisponible, repli)" : ""}`}
      </p>
    </div>
  );
}
