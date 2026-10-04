/**
 * Vue 3D de la zone de travail (L3b.1, cahier §7 lot 3b) : modes volume / éclaté / coupe (plan de coupe réglable),
 * tous les niveaux ou le niveau actif, orbite (glisser), panoramique (clic droit, Maj+glisser ou deux doigts),
 * zoom (molette, pincer), sélection au clic (Maj : basculer), manipulateur (glisser un objet sélectionné →
 * `transformer.deplacer`, DA-02-17), clavier (flèches : orbite, Maj+flèches : panoramique, + / − : zoom,
 * Échap : vider la sélection). Moteur WebGL2 ; WebGPU sur réglage, avec repli (D-004). Outils Pousser / tirer et
 * Extruder (L3b.2) : glisser verticalement propose la valeur, le volume est montré par essai à blanc avant validation.
 *
 * N'écrit le modèle que par `ctx.valider` (R-commandes). L'état du rendu (triangles, objets, moteur, mode) est
 * exposé en attributs `data-*` de `atl-3d-etat` pour le scénario de bout en bout.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { pointLocal, type EtatModele, type IdObjet } from "@parcours/atelier-model";
import type { ContexteAtelier, ErreurLisible, EtatInterface, PiloteOutils } from "../socle";
import { Erreurs } from "../ui/Erreurs";
import { libelleClasse } from "../ui/navigateur";
import { commandesDeplacement3d, contraindre } from "./manipulateur";
import { CHAMP_GLISSER, ID_EXTRUDER, ID_POUSSER } from "./outils";
import { arrondirGlisser, ciblePoussee, commandesExtrusion, commandesPoussee, contourExtrudable, etatApercu, PAS_GLISSER } from "./pousser";
import { MesuresTrames } from "./mesures";
import { creerRendu, type InfoRendu, type Moteur, type Rendu3d } from "./rendu";
import { hauteurCoupeParDefaut, LIBELLES_MODE, MODES_3D, niveauxDuModele, sceneDuModele, type Mode3d } from "./scene";
import "./vue3d.css";

const CLE_MOTEUR = "fadi.atelier.3d.moteur";
const lireMoteur = (): Moteur => {
  try {
    return localStorage.getItem(CLE_MOTEUR) === "webgpu" ? "webgpu" : "webgl2";
  } catch {
    return "webgl2";
  }
};

interface Geste {
  readonly id: number;
  readonly x0: number;
  readonly y0: number;
  x: number;
  y: number;
  bouge: boolean;
  readonly type: "orbite" | "pan" | "deplacer" | "pousser";
  /** Valeur de départ de la grandeur poussée (pousser / tirer, extruder). */
  readonly base?: number;
  /** Point de départ du manipulateur sur le plan horizontal. */
  readonly sol?: [number, number];
  readonly zSol: number;
}

export function Vue3d({ ctx, vue, pilote }: { ctx: ContexteAtelier; vue: EtatInterface; pilote: PiloteOutils }) {
  const etatServeur = useSyncExternalStore(ctx.abonnerEtat, ctx.etat, ctx.etat);
  const outilId = useSyncExternalStore(pilote.abonner, () => pilote.outilActif()?.id ?? null, () => null);
  const [apercuEtat, setApercuEtat] = useState<EtatModele | null>(null);
  // Aperçu (essai à blanc) pendant un glisser de pousser / tirer ou d'extrusion ; jamais écrit.
  const etat = apercuEtat ?? etatServeur;
  const sel = useSyncExternalStore(ctx.selection.abonner, ctx.selection.lire, ctx.selection.lire);
  const etatVue = useSyncExternalStore(vue.abonner, vue.lire, vue.lire);
  const canevas = useRef<HTMLCanvasElement>(null);
  const cadre = useRef<HTMLDivElement>(null);
  const rendu = useRef<Rendu3d | null>(null);
  const [pret, setPret] = useState(0);
  const [moteur, setMoteur] = useState<Moteur>(lireMoteur);
  const [echec, setEchec] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode3d>("volume");
  const [portee, setPortee] = useState<"tous" | "actif">("tous");
  const [coupe, setCoupe] = useState<number | null>(null);
  const [info, setInfo] = useState<InfoRendu | null>(null);
  const [erreurs, setErreurs] = useState<readonly ErreurLisible[]>([]);
  const [annonce, setAnnonce] = useState("");
  const gestes = useRef(new Map<number, Geste>());
  const pincer = useRef<number | null>(null);
  const cadree = useRef(false);
  // Mesures (L3b.3) : durée de chaque trame rendue, durée de construction de la scène, ouverture.
  const trames = useRef(new MesuresTrames());
  const debut = useRef(performance.now());
  const [mesures, setMesures] = useState<{ p95: number | null; n: number; sceneMs: number | null; ouvertureMs: number | null }>({ p95: null, n: 0, sceneMs: null, ouvertureMs: null });

  const niveauActif = etatVue.niveauActifId;
  const niveaux = useMemo(() => (etat ? niveauxDuModele(etat) : []), [etat]);
  const ids = useMemo(() => (portee === "actif" ? (niveauActif ? [niveauActif] : []) : niveaux.map((n) => n.id)), [portee, niveauActif, niveaux]);
  const scene = useMemo(() => (etat ? sceneDuModele(etat, { niveaux: ids, mode }) : null), [etat, ids, mode]);
  const hCoupe = mode === "coupe" ? (coupe ?? (etat ? hauteurCoupeParDefaut(etat, niveauActif, scene?.decalages) : 1.2)) : null;
  const selection = useMemo(() => new Set(sel.ids), [sel]);
  const zSol = useMemo(() => {
    const n = niveaux.find((x) => x.id === niveauActif);
    return (n?.params.elevation.value ?? 0) + (scene?.decalages[niveauActif ?? ""] ?? 0);
  }, [niveaux, niveauActif, scene]);

  // Rendu coalescé à l'image suivante.
  const demande = useRef<number | null>(null);
  const redessiner = useCallback(() => {
    if (demande.current !== null) return;
    demande.current = requestAnimationFrame(() => {
      demande.current = null;
      const r = rendu.current;
      if (!r) return;
      const t0 = performance.now();
      const i = r.rendre();
      trames.current.ajouter(performance.now() - t0);
      setInfo(i);
      setMesures((m) => ({ ...m, p95: trames.current.quantile(0.95), n: trames.current.nombre, ouvertureMs: m.ouvertureMs ?? (i.triangles > 0 ? Math.round(performance.now() - debut.current) : null) }));
    });
  }, []);

  // Création du moteur (et recréation au changement de réglage).
  useEffect(() => {
    const c = canevas.current;
    if (!c) return;
    let actif = true;
    let r: Rendu3d | null = null;
    setEchec(null);
    creerRendu(c, moteur).then(
      (x) => {
        if (!actif) return x.liberer();
        r = x;
        rendu.current = x;
        cadree.current = false;
        setPret((n) => n + 1);
      },
      (e: unknown) => actif && setEchec(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      actif = false;
      r?.liberer();
      rendu.current = null;
    };
  }, [moteur]);

  // Taille du canevas suivie (redimensionnement, téléphone).
  useEffect(() => {
    const el = cadre.current;
    if (!el || !pret) return;
    const ajuster = () => {
      rendu.current?.dimensionner(el.clientWidth, el.clientHeight, Math.min(2, window.devicePixelRatio || 1));
      redessiner();
    };
    ajuster();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(ajuster) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [pret, redessiner]);

  // Scène reconstruite quand l'état, les niveaux ou le mode changent.
  useEffect(() => {
    const r = rendu.current;
    if (!r || !scene) return;
    const t0 = performance.now();
    r.afficher(scene, { selection, coupe: hCoupe });
    const sceneMs = performance.now() - t0;
    setMesures((m) => ({ ...m, sceneMs: Math.round(sceneMs) }));
    if (!cadree.current) {
      r.cadrer(scene.bornes);
      cadree.current = true;
    }
    redessiner();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la sélection et la coupe ont leurs propres effets
  }, [scene, pret, redessiner]);

  useEffect(() => {
    rendu.current?.selectionner(selection);
    redessiner();
  }, [selection, redessiner]);

  useEffect(() => {
    if (!rendu.current || !scene) return;
    rendu.current.afficher(scene, { selection, coupe: hCoupe });
    redessiner();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hCoupe]);

  // L'aperçu disparaît quand l'outil se ferme (validation, Échap, changement d'outil).
  useEffect(() => {
    if (outilId !== ID_POUSSER && outilId !== ID_EXTRUDER) setApercuEtat(null);
  }, [outilId]);

  /** Valeur proposée par le glisser → saisie de l'outil, et état d'aperçu par les mêmes commandes. */
  const proposer = (v: number) => {
    void pilote.traiter({ type: "saisie", champ: CHAMP_GLISSER, valeur: v });
    const courant = ctx.etat();
    const o = courant?.objets[sel.principal ?? ""];
    let cmds: ReturnType<typeof commandesPoussee> | ReturnType<typeof commandesExtrusion> = { motif: "" };
    if (outilId === ID_POUSSER) {
      const c = ciblePoussee(o);
      if (!("motif" in c)) cmds = commandesPoussee(c, v);
    } else {
      const s = contourExtrudable(o);
      const decalage = Number(pilote.apercu().champs.find((c) => c.champ === "decalageBase")?.valeur ?? 0);
      const conserver = pilote.apercu().champs.find((c) => c.champ === "conserver")?.valeurChoisie !== "non";
      if (!("motif" in s)) cmds = commandesExtrusion(s, { id: "solide-apercu", hauteur: v, decalageBase: decalage, conserverSource: conserver });
    }
    setApercuEtat(etatApercu(ctx.essayer, cmds as never));
  };

  const recentrer = () => {
    rendu.current?.cadrer(scene?.bornes ?? null);
    redessiner();
  };

  const nomObjet = (id: IdObjet) => {
    const o = etat?.objets[id];
    return o ? `${libelleClasse(o.classe)} ${id}` : id;
  };

  // --- Pointeur -----------------------------------------------------------------------------------------------
  const position = (e: React.PointerEvent | React.WheelEvent) => {
    const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };

  const appui = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = rendu.current;
    if (!r) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const { x, y } = position(e);
    if (gestes.current.size === 1 && e.pointerType === "touch") {
      // Deuxième doigt : le geste devient pincer + panoramique.
      const [autre] = [...gestes.current.values()];
      if (autre) pincer.current = Math.hypot(autre.x - x, autre.y - y);
    }
    if (e.button === 0 && !e.shiftKey && (outilId === ID_POUSSER || outilId === ID_EXTRUDER)) {
      const champ = pilote.apercu().champs.find((c) => c.champ === "hauteur" || c.champ === "epaisseur");
      gestes.current.set(e.pointerId, { id: e.pointerId, x0: x, y0: y, x, y, bouge: false, type: "pousser", base: typeof champ?.valeur === "number" ? champ.valeur : 0, zSol });
      return;
    }
    const sousPointeur = e.button === 0 && !e.shiftKey && !pilote.outilActif() ? r.viser(x, y) : null;
    const deplacer = sousPointeur !== null && selection.has(sousPointeur) && ctx.ecriture.permise;
    const type: Geste["type"] = deplacer ? "deplacer" : e.button === 2 || e.shiftKey || e.button === 1 ? "pan" : "orbite";
    const sol = deplacer ? (r.pointPlan(x, y, zSol) ?? undefined) : undefined;
    gestes.current.set(e.pointerId, { id: e.pointerId, x0: x, y0: y, x, y, bouge: false, type, sol, zSol });
  };

  const glisse = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestes.current.get(e.pointerId);
    const r = rendu.current;
    if (!g || !r) return;
    const { x, y } = position(e);
    const dx = x - g.x;
    const dy = y - g.y;
    g.x = x;
    g.y = y;
    if (Math.hypot(x - g.x0, y - g.y0) > 4) g.bouge = true;
    if (!g.bouge) return;
    if (gestes.current.size >= 2) {
      // Deux doigts : écartement = zoom, déplacement moyen = panoramique.
      const [a, b] = [...gestes.current.values()];
      if (a && b) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pincer.current) r.zoomer(d / pincer.current);
        pincer.current = d;
        r.panoramique(dx / 2, dy / 2);
      }
    } else if (g.type === "orbite") r.orbiter(dx, dy);
    else if (g.type === "pan") r.panoramique(dx, dy);
    else if (g.type === "pousser") {
      // Vers le haut = plus haut ; un pixel vaut la taille d'un pixel à la distance de la cible.
      proposer(Math.max(PAS_GLISSER, arrondirGlisser((g.base ?? 0) - (y - g.y0) * r.metresParPixel())));
    }
    else if (g.sol) {
      const p = r.pointPlan(x, y, g.zSol);
      if (p) {
        const [vx, vy] = contraindre(p[0] - g.sol[0], p[1] - g.sol[1], e.shiftKey);
        r.decalerSelection(vx, vy);
      }
    }
    redessiner();
  };

  const relache = async (e: React.PointerEvent<HTMLCanvasElement>) => {
    const g = gestes.current.get(e.pointerId);
    gestes.current.delete(e.pointerId);
    if (gestes.current.size < 2) pincer.current = null;
    const r = rendu.current;
    if (!g || !r) return;
    const { x, y } = position(e);
    if (!g.bouge) {
      // Clic : outil actif (accord, ex. Supprimer) ou sélection.
      if (pilote.outilActif()) {
        const p = r.pointPlan(x, y, g.zSol) ?? [0, 0];
        await pilote.traiter({ type: "appui", point: pointLocal(p[0], p[1]), accrochage: { type: "aucun", libelle: "" }, modificateurs: { maj: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey }, objetSousPointeur: r.viser(x, y) });
        return;
      }
      const id = r.viser(x, y);
      if (id) {
        ctx.selection.choisir([id], e.shiftKey ? "basculer" : "remplacer");
        setAnnonce(`Sélection : ${nomObjet(id)}.`);
      } else if (!e.shiftKey) {
        ctx.selection.vider();
        setAnnonce("Sélection vide.");
      }
      return;
    }
    if (g.type === "pousser") {
      setApercuEtat(null);
      await pilote.traiter({ type: "touche", touche: "Enter", modificateurs: { maj: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey } });
      return;
    }
    if (g.type === "deplacer" && g.sol && etat) {
      const p = r.pointPlan(x, y, g.zSol);
      r.decalerSelection(0, 0);
      redessiner();
      if (!p) return;
      const [vx, vy] = contraindre(p[0] - g.sol[0], p[1] - g.sol[1], e.shiftKey);
      const res = commandesDeplacement3d(etat, sel.ids, vx, vy);
      if ("rien" in res) return;
      if ("erreur" in res) return setErreurs([res.erreur]);
      const essai = ctx.essayer(res.commandes);
      if (!essai.ok) return setErreurs(essai.erreurs);
      const v = await ctx.valider(res.libelle, res.commandes);
      setErreurs(v.ok ? [] : v.erreurs);
      if (v.ok) setAnnonce(`${res.libelle} : ${vx.toFixed(2).replace(".", ",")} m ; ${vy.toFixed(2).replace(".", ",")} m.`);
    }
  };

  const molette = (e: React.WheelEvent<HTMLCanvasElement>) => {
    rendu.current?.zoomer(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    redessiner();
  };

  // Molette sans défilement de la page (écouteur non passif).
  useEffect(() => {
    const c = canevas.current;
    if (!c) return;
    const bloquer = (e: WheelEvent) => e.preventDefault();
    c.addEventListener("wheel", bloquer, { passive: false });
    return () => c.removeEventListener("wheel", bloquer);
  }, []);

  const clavier = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const r = rendu.current;
    if (!r) return;
    const pas = 40;
    const fleches: Record<string, [number, number]> = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    const f = fleches[e.key];
    if (f) {
      e.preventDefault();
      if (e.shiftKey) r.panoramique(f[0], f[1]);
      else r.orbiter(f[0], f[1]);
      return redessiner();
    }
    if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      r.zoomer(e.key === "-" ? 1 / 1.25 : 1.25);
      return redessiner();
    }
    if (pilote.outilActif() && (e.key === "Enter" || e.key === "Escape")) {
      e.preventDefault();
      if (e.key === "Escape") pilote.abandonner();
      else void pilote.traiter({ type: "touche", touche: "Enter", modificateurs: { maj: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey } });
      return;
    }
    if (e.key === "Escape" && sel.ids.length > 0) {
      e.preventDefault();
      ctx.selection.vider();
      setAnnonce("Sélection vide.");
    }
  };

  const choisirMoteur = (m: Moteur) => {
    try {
      localStorage.setItem(CLE_MOTEUR, m);
    } catch {
      /* réglage de confort : sans stockage, il vaut pour la session */
    }
    setMoteur(m);
  };

  const bas = niveaux.find((n) => n.id === niveauActif);
  const zMin = scene?.bornes?.min[2] ?? 0;
  const zMax = scene?.bornes?.max[2] ?? 10;
  const libelleNiveaux = portee === "actif" ? (bas ? bas.params.nom : "aucun niveau actif") : `${niveaux.length} niveau(x)`;

  return (
    <div className="atl-3d" data-testid="atl-3d">
      <div className="atl-3d-barre" role="toolbar" aria-label="Réglages de la vue 3D">
        <span className="atl-segment atl-clair" role="radiogroup" aria-label="Mode de la vue 3D">
          {MODES_3D.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} data-testid={`atl-3d-mode-${m}`}>
              {LIBELLES_MODE[m]}
            </button>
          ))}
        </span>
        <span className="atl-segment atl-clair" role="radiogroup" aria-label="Niveaux affichés">
          <button type="button" role="radio" aria-checked={portee === "tous"} onClick={() => setPortee("tous")} data-testid="atl-3d-niveaux-tous">
            Tous les niveaux
          </button>
          <button type="button" role="radio" aria-checked={portee === "actif"} onClick={() => setPortee("actif")} data-testid="atl-3d-niveaux-actif">
            Niveau actif
          </button>
        </span>
        {mode === "coupe" && hCoupe !== null && (
          <label className="atl-3d-coupe">
            Plan de coupe {hCoupe.toFixed(2).replace(".", ",")} m
            <input type="range" min={Math.floor(zMin)} max={Math.ceil(zMax)} step={0.1} value={hCoupe} onChange={(e) => setCoupe(Number(e.target.value))} data-testid="atl-3d-coupe" />
          </label>
        )}
        <button type="button" className="atl-petit-bouton" onClick={recentrer} data-testid="atl-3d-recentrer">
          Recentrer
        </button>
        <label className="atl-3d-moteur">
          Moteur
          <select value={moteur} onChange={(e) => choisirMoteur(e.target.value as Moteur)} data-testid="atl-3d-moteur">
            <option value="webgl2">WebGL2</option>
            <option value="webgpu">WebGPU (essai, repli WebGL2)</option>
          </select>
        </label>
      </div>
      {echec ? (
        <p role="alert" className="atl-message atl-erreur" data-testid="atl-3d-echec">
          Vue 3D indisponible : {echec}. Le plan 2D reste utilisable (bouton « Plan 2D »).
        </p>
      ) : null}
      {rendu.current?.repli && <p className="atl-3d-repli atl-petit" data-testid="atl-3d-repli">{rendu.current.repli} : rendu WebGL2.</p>}
      <Erreurs erreurs={erreurs} titre="Déplacement refusé — rien n'a été modifié" testId="atl-3d-erreurs" />
      <div className="atl-3d-cadre" ref={cadre}>
        <canvas
          ref={canevas}
          className="atl-3d-toile"
          tabIndex={0}
          role="application"
          aria-roledescription="vue 3D"
          aria-label={`Vue 3D, mode ${LIBELLES_MODE[mode]}, ${libelleNiveaux}. Glisser : orbite ; Maj ou clic droit : panoramique ; molette : zoom ; clic : sélection ; glisser un objet sélectionné : déplacer. Clavier : flèches, Maj+flèches, + et −.`}
          onPointerDown={appui}
          onPointerMove={glisse}
          onPointerUp={(e) => void relache(e)}
          onPointerCancel={(e) => gestes.current.delete(e.pointerId)}
          onWheel={molette}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={clavier}
          data-testid="atl-3d-toile"
        />
      </div>
      <p
        className="atl-3d-etat atl-petit"
        data-testid="atl-3d-etat"
        data-mode={mode}
        data-portee={portee}
        data-moteur={info?.moteur ?? ""}
        data-triangles={info?.triangles ?? 0}
        data-objets={info?.objets ?? 0}
        data-niveaux={ids.join(",")}
        data-revision={etat?.revision ?? ""}
        data-selection={sel.ids.length}
        data-azimut={rendu.current ? Math.round((rendu.current.lireOrbite().azimut * 180) / Math.PI) : ""}
        data-distance={rendu.current ? rendu.current.lireOrbite().distance.toFixed(2) : ""}
        data-trame-p95={mesures.p95 === null ? "" : mesures.p95.toFixed(2)}
        data-trames={mesures.n}
        data-scene-ms={mesures.sceneMs ?? ""}
        data-ouverture-ms={mesures.ouvertureMs ?? ""}
      >
        {info ? `${info.moteur === "webgpu" ? "WebGPU" : "WebGL2"} · ${info.objets} objet(s) · ${info.triangles} triangle(s)` : "Préparation de la vue 3D…"}
        {scene && scene.diagnostics.length > 0 ? ` · ${scene.diagnostics.length} élément(s) signalé(s)` : ""}
      </p>
      {scene && scene.diagnostics.length > 0 && (
        <details className="atl-3d-diagnostics">
          <summary>Éléments signalés par la géométrie ({scene.diagnostics.length})</summary>
          <ul>
            {scene.diagnostics.slice(0, 50).map((d, i) => (
              <li key={i}>{d.message}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="atl-sr" role="status" aria-live="polite">
        {annonce}
      </p>
    </div>
  );
}
