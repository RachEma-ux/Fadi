/**
 * Barre d'opérations flottante de la Planche (D-198) : la barre d'un outil (① Créer, ② Modifier, ③ Mesurer / annoter)
 * affichée sur le dessin par la case « afficher » de la liste « Outils ▾ ». Comme la barre d'actions (D-195) : position
 * fixe — elle flotte au-dessus du dessin sans le redimensionner —, déplaçable par sa poignée (souris, doigt — capture du
 * pointeur —, flèches au clavier, Maj : plus vite), toujours entière dans la zone visible (ramenée au relâchement, au
 * redimensionnement, à la rotation, sous le clavier virtuel), position mémorisée sur l'appareil (`etat-ui.ts`). ✕ la
 * masque (décoche « afficher »). L'outil actif y est surligné. Au téléphone (≤ 760 px), elle se range en bas, au-dessus
 * du volet, une seule à la fois (la Planche ne rend que la dernière affichée).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Outil } from "@parcours/planche-model";
import { etatUi, useEtatUi } from "../etat-ui";
import { pasClavier } from "../panneaux/barre-actions-position";
import { barreDe } from "./barres-outils";
import { borner, placerBarre, positionDefautBarre, positionDocquee, type Position, type Taille, type Zone } from "./barres-outils-disposition";
import { titreOperation } from "./BoutonOutils";
import { t } from "../messages";
import { nomOutil, pictoOutil } from "./outils-planche";

export interface PropsBarreOutilsFlottante {
  outil: Outil;
  /** Rang d'affichage (empilement des positions par défaut au bureau). */
  rang: number;
  outilId: string;
  telephone: boolean;
  raison: (o: Outil) => string | null;
  onChoisir: (id: string) => void;
  onFermer: () => void;
  /** Racine de la Planche : zone de référence (barre du haut, rail d'outils, volet). */
  reference: React.RefObject<HTMLElement | null>;
  /** Change quand la Planche change de fenêtre (détachée) : les écouteurs sont reposés. */
  fenetreCle?: string;
  /** Téléphone : haut (px) de la barre rangée en bas, ou null quand elle disparaît (la barre d'actions s'en écarte). */
  onDocquee?: (haut: number | null) => void;
}

function zoneDe(el: Element): Zone {
  const w = el.ownerDocument.defaultView ?? window;
  const vv = w.visualViewport;
  return vv ? { largeur: vv.width, hauteur: vv.height, gauche: vv.offsetLeft, haut: vv.offsetTop } : { largeur: w.innerWidth, hauteur: w.innerHeight };
}

function tailleDe(el: HTMLElement): Taille {
  const r = el.getBoundingClientRect();
  return { largeur: r.width, hauteur: r.height };
}

export function BarreOutilsFlottante({ outil, rang, outilId, telephone, raison, onChoisir, onFermer, reference, fenetreCle = "", onDocquee }: PropsBarreOutilsFlottante) {
  const ui = useEtatUi();
  const racine = useRef<HTMLDivElement | null>(null);
  const [glisser, setGlisser] = useState<Position | null>(null);
  const [defaut, setDefaut] = useState<{ pos: Position; largeur?: number } | null>(null);
  const depart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const id = outil.id;
  const memorisee = telephone ? null : (ui.barresOutils.positions[id] ?? null);

  const memoriser = useCallback(
    (p: Position) => {
      const e = etatUi.get().barresOutils;
      const n = placerBarre(e, id, p);
      if (n !== e) etatUi.set({ barresOutils: n });
    },
    [id],
  );

  /** Position par défaut (bureau : empilée sous la barre du haut, à droite du rail ; téléphone : rangée en bas). */
  const calculerDefaut = useCallback((): { pos: Position; largeur?: number } | null => {
    const el = racine.current;
    const ref = reference.current;
    if (!el) return null;
    const fenetre = zoneDe(el);
    const r = ref?.getBoundingClientRect();
    const zone: Zone = r && r.width > 0 && r.height > 0 ? { gauche: r.left, haut: r.top, largeur: r.width, hauteur: r.height } : fenetre;
    const visible = (sel: string) => {
      const q = ref?.querySelector(sel)?.getBoundingClientRect();
      return q && q.width > 0 && q.height > 0 ? q : null;
    };
    if (telephone) {
      // Rangée en bas, au-dessus du volet (outils, consigne, Mesures), sur toute la largeur.
      const volet = visible("[data-planche-volet]") ?? visible("[data-planche-pied]");
      const bas = r && volet ? Math.max(0, r.bottom - volet.top) : 0;
      const largeur = Math.max(0, Math.min(zone.largeur, fenetre.largeur) - 8);
      const taille = { largeur, hauteur: tailleDe(el).hauteur };
      return { pos: borner(positionDocquee(taille, zone, bas), taille, fenetre), largeur };
    }
    const taille = tailleDe(el);
    const haut = visible(".planche-haut");
    const rail = visible(".planche-outils");
    const reserves = { haut: haut && r ? haut.bottom - r.top + 8 : 64, gauche: rail && r ? rail.right - r.left + 8 : 72 };
    return { pos: borner(positionDefautBarre(rang, taille, zone, reserves), taille, fenetre) };
  }, [reference, telephone, rang]);

  const replacer = useCallback(() => {
    const el = racine.current;
    if (!el) return;
    const m = telephone ? null : etatUi.get().barresOutils.positions[id];
    if (m) {
      const b = borner(m, tailleDe(el), zoneDe(el));
      if (b.x !== m.x || b.y !== m.y) memoriser(b);
    } else {
      const d = calculerDefaut();
      if (d) setDefaut((prev) => (prev && prev.pos.x === d.pos.x && prev.pos.y === d.pos.y && prev.largeur === d.largeur ? prev : d));
    }
  }, [calculerDefaut, id, memoriser, telephone]);

  useLayoutEffect(() => {
    replacer();
  }, [replacer, fenetreCle, memorisee === null]);

  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const w = el.ownerDocument.defaultView ?? window;
    const vv = w.visualViewport;
    w.addEventListener("resize", replacer);
    w.addEventListener("orientationchange", replacer);
    vv?.addEventListener("resize", replacer);
    vv?.addEventListener("scroll", replacer);
    const ref = reference.current;
    const obs = ref && typeof w.ResizeObserver === "function" ? new w.ResizeObserver(() => replacer()) : null;
    if (ref) {
      obs?.observe(ref);
      for (const sel of ["[data-planche-volet]", ".planche-haut", ".planche-outils"]) {
        const x = ref.querySelector(sel);
        if (x) obs?.observe(x);
      }
    }
    return () => {
      w.removeEventListener("resize", replacer);
      w.removeEventListener("orientationchange", replacer);
      vv?.removeEventListener("resize", replacer);
      vv?.removeEventListener("scroll", replacer);
      obs?.disconnect();
    };
  }, [replacer, reference, fenetreCle]);

  const positionCourante = (): Position => {
    const m = etatUi.get().barresOutils.positions[id];
    if (m) return m;
    const r = racine.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  };
  const surPointeur = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (telephone || (e.button !== 0 && e.pointerType === "mouse")) return;
    const p = positionCourante();
    depart.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlisser(p);
    e.preventDefault();
  };
  const surDeplacement = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = depart.current;
    const el = racine.current;
    if (!d || !el) return;
    setGlisser(borner({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, tailleDe(el), zoneDe(el)));
  };
  const surRelachement = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = depart.current;
    const el = racine.current;
    depart.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setGlisser(null);
    if (!d || !el) return;
    memoriser(borner({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, tailleDe(el), zoneDe(el)));
  };
  const surClavier = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const pas = pasClavier(e.key, e.shiftKey);
    const el = racine.current;
    if (!pas || !el || telephone) return;
    e.preventDefault();
    // La flèche déplace la barre, rien d'autre : le clavier de la Planche ne la reçoit pas.
    e.stopPropagation();
    const p = positionCourante();
    memoriser(borner({ x: p.x + pas.x, y: p.y + pas.y }, tailleDe(el), zoneDe(el)));
  };

  const pos = glisser ?? memorisee ?? defaut?.pos ?? null;
  const hautDocquee = telephone && pos ? pos.y : null;
  useEffect(() => {
    onDocquee?.(hautDocquee);
  }, [hautDocquee, onDocquee]);
  useEffect(() => () => onDocquee?.(null), [onDocquee]);

  const sections = barreDe(id);
  if (!sections) return null;
  const style: React.CSSProperties | undefined = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, ...(telephone && defaut?.largeur ? { width: `${defaut.largeur}px` } : {}) } : { visibility: "hidden" };
  return (
    <div
      ref={racine}
      className={`planche-barre-outils${glisser ? " en-glisser" : ""}${telephone ? " est-docquee" : ""}`}
      role="toolbar"
      aria-label={t("outils.barre", { outil: nomOutil(outil) })}
      style={style}
      data-barre-outils={id}
      data-barre-outils-docquee={telephone ? "" : undefined}
      data-position={telephone ? "docquee" : memorisee ? "memorisee" : "defaut"}
    >
      <button
        type="button"
        className="planche-barre-outils-poignee"
        aria-label={t("outils.barre.deplacer", { outil: nomOutil(outil) })}
        title={telephone ? t("outils.barre.docquee", { outil: nomOutil(outil) }) : t("outils.barre.deplacer.aide")}
        disabled={telephone}
        data-barre-outils-poignee
        onPointerDown={surPointeur}
        onPointerMove={surDeplacement}
        onPointerUp={surRelachement}
        onPointerCancel={surRelachement}
        onKeyDown={surClavier}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <span className="planche-barre-outils-titre" aria-hidden="true">
        {pictoOutil(id)} {nomOutil(outil)}
      </span>
      <div className="planche-barre-outils-corps">
        {sections.map((s, i) => (
          <div key={s.cle} className="planche-barre-outils-section" role="group" aria-label={`${s.numero} ${s.libelle}`} data-barre-outils-section={s.cle}>
            {i > 0 && <span className="planche-barre-outils-separateur" aria-hidden="true" />}
            <span className="planche-barre-outils-numero" aria-hidden="true" title={s.libelle}>
              {s.numero}
            </span>
            {s.outils.map((o) => {
              const r = raison(o);
              const actif = o.id === outilId;
              return (
                <button
                  key={o.id}
                  type="button"
                  className={`planche-barre-outils-op${actif ? " est-actif" : ""}${r ? " est-indisponible" : ""}`}
                  aria-pressed={actif}
                  aria-disabled={r ? true : undefined}
                  title={titreOperation(o, r)}
                  aria-label={titreOperation(o, r)}
                  data-barre-outils-operation={o.id}
                  onClick={() => onChoisir(o.id)}
                >
                  <span aria-hidden="true">{pictoOutil(o.id)}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <button type="button" className="planche-barre-outils-fermer" aria-label={t("outils.barre.masquer", { outil: nomOutil(outil) })} title={t("outils.barre.masquer", { outil: nomOutil(outil) })} data-barre-outils-fermer onClick={onFermer}>
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
