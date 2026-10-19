/**
 * Barre « Outils de dessin » de la planche 2D : **une seule rangée** compacte (`barre-compacte.ts`). Les outils de la
 * famille active et des familles prioritaires sont dans la rangée ; chaque famille se replie dans son bouton « ▾ »
 * (icône propre, `aria-haspopup` / `aria-expanded`) ; les familles qui ne tiennent pas passent dans « Plus ». La place
 * disponible est suivie par un `ResizeObserver`, les largeurs réelles des boutons sont mesurées.
 *
 * Règle d'or : chaque bouton porte son icône propre, son nom (visible dans les menus et, sur écran tactile, dans la
 * rangée) et son raccourci (`aria-keyshortcuts`, touche affichée). Une bascule (accrochage) est un bouton enfoncé ou
 * non ; un export est un lien de téléchargement (même origine). Chaque élément n'existe qu'une fois dans le document :
 * un menu fermé garde ses boutons (masqués), un menu ouvert les montre.
 *
 * Clavier : flèches gauche / droite (Début, Fin) d'un bouton de la rangée à l'autre ; sur un bouton « ▾ », Entrée,
 * Espace ou flèche bas ouvrent le menu sur son premier élément (flèche haut : le dernier) ; dans un menu, flèches
 * haut / bas, Début, Fin ; Échap referme et rend le focus au bouton ; Tab referme.
 *
 * Profil d'outils (#166, B.2-06) : `useProfilOutils` règle seulement les boutons montrés — jamais les raccourcis, le
 * catalogue ni la palette. L'outil actif reste toujours montré.
 *
 * Palette d'un domaine (espace de travail, un domaine affiché à la fois) : `filtre` ne garde que les éléments du domaine
 * actif (`dansPaletteDuDomaine`) ; `orientation="verticale"` range la palette en colonne à gauche du canevas, comme un
 * logiciel de CAO : icônes seules (nom et raccourci en infobulle et en nom accessible), menus de famille ouverts à
 * droite de leur bouton, flèches haut / bas d'un bouton à l'autre et flèche droite pour ouvrir un menu. La disposition
 * suit alors la hauteur disponible au lieu de la largeur (même `disposerBarre`).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ClavierReact, type ReactNode } from "react";
import { STUDIO_TOOLS } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { useProfilOutils } from "./CatalogueOutils";
import {
  disposerBarre, ELEMENTS_FAMILLE, familleDeOutil, FAMILLES_STUDIO, indexNavigation, placementMenu, placementMenuLateral, TRACE_PLUS,
  type ElementBarre, type IdFamille, type MesureFamille,
} from "./barre-compacte";
import {
  ariaRaccourci, COMMANDES_EDITEUR, libelleRaccourci, OUTILS_MODES,
  type CibleRaccourci, type CommandeEditeur, type IdCommandeEditeur, type StudioToolEntry, type StudioToolId,
} from "./raccourcis";
import { LIBELLES_RAISON, type RaisonIndisponible } from "../variante/droits";

export interface BarreOutilsProps {
  outil: StudioToolId;
  /** Disponibilité de chaque outil ou commande (lecture seule, sélection, historique…). */
  outilDisponible: (t: StudioToolEntry) => boolean;
  commandeDisponible: (c: CommandeEditeur) => boolean;
  /**
   * Raison d'un bouton désactivé (droit réel refusé, révision historique, enregistrement, contexte) : le bouton reste
   * montré — la visibilité est l'affaire du profil — et l'infobulle dit pourquoi il ne peut pas être lancé (B.2-06).
   */
  raison?: (cible: CibleRaccourci) => RaisonIndisponible | null;
  /** Libellé courant d'une commande quand il change (« Réessayer la sauvegarde »). */
  libelleCommande?: Partial<Record<IdCommandeEditeur, string>>;
  /** État des bascules (accrochages). */
  basculeActive?: Partial<Record<IdCommandeEditeur, boolean>>;
  /** Adresse des commandes de téléchargement (exports). */
  lienCommande?: Partial<Record<IdCommandeEditeur, string>>;
  surOutil: (toolId: StudioToolId) => void;
  surCommande: (id: IdCommandeEditeur) => void;
  /** Un lien de téléchargement vient d'être suivi (le navigateur télécharge ; la page peut seulement informer). */
  surLien?: (id: IdCommandeEditeur) => void;
  /** Projet des préférences d'outils (profil) ; lu dans l'adresse Studio sinon. */
  projectId?: string;
  /** Largeur supposée avant la première mesure (rendu serveur, essais) ; tout en rangée par défaut. */
  largeurInitiale?: number;
  /** Éléments montrés (palette d'un domaine) ; tous par défaut. Les raccourcis restent ceux de la table clavier. */
  filtre?: (e: ElementBarre) => boolean;
  /** Rangée horizontale (défaut) ou palette verticale. */
  orientation?: "horizontale" | "verticale";
  /** Nom accessible de la barre (« Outils de dessin » par défaut). */
  libelle?: string;
}

type NomIcone = Parameters<typeof Icon>[0]["name"];
type Mode = "souris" | "tactile";

/** Largeurs supposées avant mesure (écart de 4 px compris). */
const ECART = 4;
const LARGEUR_MENU = 52 + ECART;
const LARGEUR_PLUS = 48 + ECART;
const SEPARATEUR = 9 + ECART;
/** Palette verticale : boutons carrés de 40 px (écart compris). */
const HAUTEUR_VERTICALE = 40 + ECART;
const estimer = (mode: Mode, libelle: string) => (mode === "tactile" ? Math.ceil(46 + libelle.length * 7.6) : 42) + ECART;

const OUTILS = new Map(STUDIO_TOOLS.map((t) => [t.toolId as string, t]));
const COMMANDES = new Map(COMMANDES_EDITEUR.map((c) => [c.id as string, c]));
const LIBELLE_FAMILLE = new Map(FAMILLES_STUDIO.map((f) => [f.id, f.libelleFR]));
const cle = (e: ElementBarre) => `${e.type}:${e.id}`;

function IconeTrace({ d }: { d: string }) {
  return <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}

function Contenu({ libelle, icone, raccourci }: { libelle: string; icone: NomIcone; raccourci: string }): ReactNode {
  return <>
    <Icon name={icone} size={20} />
    <span>{libelle}</span>
    <kbd aria-hidden="true">{libelleRaccourci(raccourci)}</kbd>
  </>;
}

interface PropsElement { libelle: string; icone: NomIcone; raccourci: string; disponible: boolean; onClick: () => void; data: Record<string, string | undefined>; raison?: RaisonIndisponible | null }

/** Infobulle : nom, raccourci et, pour un bouton désactivé, sa raison (droit refusé, contexte…). */
const bulle = (libelle: string, raccourci: string, raison: RaisonIndisponible | null | undefined) =>
  `${libelle} — ${libelleRaccourci(raccourci)}${raison ? ` — ${LIBELLES_RAISON[raison]}` : ""}`;

function Bouton({ libelle, icone, raccourci, presse, disponible, onClick, data, raison }: PropsElement & { presse?: boolean }) {
  const r = disponible ? null : raison ?? null;
  return (
    <button type="button" aria-label={libelle} title={bulle(libelle, raccourci, r)} aria-keyshortcuts={ariaRaccourci(raccourci)} aria-pressed={presse} disabled={!disponible} onClick={onClick}
      data-studio-raison={r ?? undefined} {...data}>
      <Contenu libelle={libelle} icone={icone} raccourci={raccourci} />
    </button>
  );
}

/** Lien de téléchargement présenté comme un bouton ; indisponible, il n'a pas d'adresse (`aria-disabled`). */
function Lien({ libelle, icone, raccourci, href, disponible, onClick, data, raison }: PropsElement & { href: string | undefined }) {
  const actif = disponible && !!href;
  return (
    <a className="studio-lien-bouton" aria-label={libelle} title={bulle(libelle, raccourci, disponible ? null : raison)} aria-keyshortcuts={ariaRaccourci(raccourci)}
      aria-disabled={actif ? undefined : true} href={actif ? href : undefined} download={actif ? "" : undefined} onClick={(e) => { if (!actif) e.preventDefault(); else onClick(); }} {...data}>
      <Contenu libelle={libelle} icone={icone} raccourci={raccourci} />
    </a>
  );
}

/** Mode tactile (pointeur grossier ou écran étroit) : noms visibles dans la rangée. */
function useModeTactile(): Mode {
  const requete = "(pointer: coarse), (max-width: 540px)";
  const lire = (): Mode => (typeof window !== "undefined" && window.matchMedia?.(requete).matches ? "tactile" : "souris");
  const [mode, setMode] = useState<Mode>(lire);
  useEffect(() => {
    const m = window.matchMedia?.(requete);
    if (!m) return;
    const suivre = () => setMode(m.matches ? "tactile" : "souris");
    suivre();
    m.addEventListener("change", suivre);
    return () => m.removeEventListener("change", suivre);
  }, []);
  return mode;
}

/** Éléments focalisables d'un conteneur, dans l'ordre (les désactivés sont sautés). */
const navigables = (racine: Element | null, attribut: string) =>
  Array.from(racine?.querySelectorAll<HTMLElement>(`[${attribut}]`) ?? []).filter((e) => !(e as HTMLButtonElement).disabled && e.getAttribute("aria-disabled") !== "true" && e.offsetParent !== null);

export function BarreOutils({ outil, outilDisponible, commandeDisponible, raison, libelleCommande, basculeActive, lienCommande, surOutil, surCommande, surLien, projectId, largeurInitiale, filtre, orientation = "horizontale", libelle = "Outils de dessin" }: BarreOutilsProps) {
  const { visible } = useProfilOutils(projectId);
  const verticale = orientation === "verticale";
  // Palette verticale : icônes seules, quel que soit le pointeur (les noms restent dans les infobulles et les menus).
  const modeEcran = useModeTactile();
  const mode: Mode = verticale ? "souris" : modeEcran;
  const racine = useRef<HTMLDivElement | null>(null);
  const [largeur, setLargeur] = useState<number>(largeurInitiale ?? Number.POSITIVE_INFINITY);
  const mesures = useRef(new Map<string, number>());
  const [, setVersion] = useState(0);
  const [ouvert, setOuvert] = useState<IdFamille | "plus" | null>(null);
  const [placement, setPlacement] = useState<{ left: number; top: number; hauteurMax: number } | null>(null);
  const base = useId();
  const idMenu = (f: string) => `${base}-menu-${f}`;

  const active = familleDeOutil(outil);
  // Profil : seuls les boutons montrés changent ; l'outil actif reste montré.
  const elements = useMemo(() => new Map(FAMILLES_STUDIO.map((f) => [f.id, (ELEMENTS_FAMILLE.get(f.id) ?? []).filter((e) => (!filtre || filtre(e)) && (e.type === "commande" || e.id === outil || visible(e.id)))])), [visible, outil, filtre]);
  const presentes = FAMILLES_STUDIO.filter((f) => (elements.get(f.id)?.length ?? 0) > 0);

  const sens = verticale ? "v" : mode;
  const largeurDe = (k: string, nom: string) => mesures.current.get(`${sens}:${k}`) ?? (verticale ? HAUTEUR_VERTICALE : estimer(mode, nom));
  const libelleDe = (e: ElementBarre) => (e.type === "outil" ? OUTILS.get(e.id)?.libelleFR ?? e.id : libelleCommande?.[e.id] ?? COMMANDES.get(e.id)?.libelleFR ?? e.id);
  const familles: MesureFamille[] = presentes.map((f) => ({
    id: f.id,
    menu: mesures.current.get(`${sens}:menu:${f.id}`) ?? (verticale ? HAUTEUR_VERTICALE : LARGEUR_MENU),
    elements: (elements.get(f.id) ?? []).map((e) => largeurDe(cle(e), libelleDe(e))),
  }));
  const disposition = disposerBarre({ largeur: largeur - 2, familles, active, plus: mesures.current.get(`${sens}:plus`) ?? (verticale ? HAUTEUR_VERTICALE : LARGEUR_PLUS), separateur: SEPARATEUR });

  // Largeur disponible suivie en continu.
  useLayoutEffect(() => {
    const el = racine.current;
    if (!el) return;
    const lire = () => {
      const s = getComputedStyle(el);
      setLargeur(verticale
        ? el.clientHeight - parseFloat(s.paddingTop || "0") - parseFloat(s.paddingBottom || "0")
        : el.clientWidth - parseFloat(s.paddingLeft || "0") - parseFloat(s.paddingRight || "0"));
    };
    lire();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(lire);
    ro.observe(el);
    return () => ro.disconnect();
  }, [verticale]);

  // Largeurs réelles des boutons de la rangée (une passe de plus si une estimation était fausse).
  useLayoutEffect(() => {
    let change = false;
    for (const el of Array.from(racine.current?.querySelectorAll<HTMLElement>("[data-studio-mesure]") ?? [])) {
      const taille = verticale ? el.offsetHeight : el.offsetWidth;
      if (!taille) continue;
      const k = `${sens}:${el.dataset.studioMesure}`;
      const w = taille + ECART;
      if (Math.abs((mesures.current.get(k) ?? -1) - w) > 0.5) { mesures.current.set(k, w); change = true; }
    }
    if (change) setVersion((v) => v + 1);
  });

  const fermer = (rendreFocus: boolean) => {
    const f = ouvert;
    setOuvert(null);
    setPlacement(null);
    if (rendreFocus && f) racine.current?.querySelector<HTMLElement>(`[aria-controls="${idMenu(f)}"]`)?.focus();
  };

  // Menu ouvert : clic ailleurs, Échap (avant le clavier de la planche), changement de taille.
  useEffect(() => {
    if (!ouvert) return;
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const surClic = (e: PointerEvent) => { const c = e.target as Node | null; if (racine.current && c && !racine.current.contains(c)) fermer(false); };
    const surTouche = (e: KeyboardEvent) => { if (e.key !== "Escape") return; e.stopImmediatePropagation(); e.preventDefault(); fermer(true); };
    const surTaille = () => fermer(false);
    w.addEventListener("pointerdown", surClic, true);
    w.addEventListener("keydown", surTouche, true);
    w.addEventListener("resize", surTaille);
    return () => { w.removeEventListener("pointerdown", surClic, true); w.removeEventListener("keydown", surTouche, true); w.removeEventListener("resize", surTaille); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  // Position du menu ouvert (fenêtre), recalculée au défilement, y compris d'un conteneur interne.
  useLayoutEffect(() => {
    if (!ouvert) return;
    const w = racine.current?.ownerDocument.defaultView ?? window;
    const placer = () => {
      const b = racine.current?.querySelector<HTMLElement>(`[aria-controls="${idMenu(ouvert)}"]`)?.getBoundingClientRect();
      const m = racine.current?.ownerDocument.getElementById(idMenu(ouvert));
      if (b && m) setPlacement(verticale ? placementMenuLateral(b, m.offsetWidth, m.offsetHeight, { largeur: w.innerWidth, hauteur: w.innerHeight }) : placementMenu(b, m.offsetWidth, { largeur: w.innerWidth, hauteur: w.innerHeight }));
    };
    placer();
    w.document.addEventListener("scroll", placer, { capture: true, passive: true });
    return () => w.document.removeEventListener("scroll", placer, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  const ouvrir = (f: IdFamille | "plus", focus: "premier" | "dernier" | null) => {
    setOuvert(f);
    if (focus) requestAnimationFrame(() => {
      const items = navigables(racine.current?.ownerDocument.getElementById(idMenu(f)) ?? null, "data-studio-nav");
      (focus === "premier" ? items[0] : items[items.length - 1])?.focus();
    });
  };

  const element = (e: ElementBarre, ou: "rangee" | "menu") => {
    const data: Record<string, string | undefined> = ou === "rangee" ? { "data-studio-ligne": "", "data-studio-mesure": cle(e) } : { "data-studio-nav": "" };
    const apres = (f: () => void) => () => { f(); if (ou === "menu") fermer(true); };
    if (e.type === "outil") {
      const t = OUTILS.get(e.id)!;
      return <Bouton key={cle(e)} libelle={t.libelleFR} icone={t.iconeSymbolique} raccourci={t.raccourci} presse={OUTILS_MODES.has(t.toolId) ? outil === t.toolId : undefined} disponible={outilDisponible(t)} onClick={apres(() => surOutil(t.toolId))} data={{ ...data, "data-studio-outil": t.toolId }} raison={raison?.({ type: "outil", toolId: t.toolId })} />;
    }
    const c = COMMANDES.get(e.id)!;
    const libelle = libelleCommande?.[c.id] ?? c.libelleFR;
    const r = raison?.({ type: "commande", id: c.id });
    return c.telechargement
      ? <Lien key={cle(e)} libelle={libelle} icone={c.iconeSymbolique} raccourci={c.raccourci} href={lienCommande?.[c.id]} disponible={commandeDisponible(c)} onClick={apres(() => surLien?.(c.id))} data={{ ...data, "data-studio-commande": c.id }} raison={r} />
      : <Bouton key={cle(e)} libelle={libelle} icone={c.iconeSymbolique} raccourci={c.raccourci} presse={c.bascule ? basculeActive?.[c.id] === true : undefined} disponible={commandeDisponible(c)} onClick={apres(() => surCommande(c.id))} data={{ ...data, "data-studio-commande": c.id }} raison={r} />;
  };

  const surClavierMenu = (e: ClavierReact<HTMLDivElement>) => {
    // Rien de ce qu'on tape dans un menu n'atteint le clavier de la planche.
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); fermer(true); return; }
    if (e.key === "Tab") { fermer(false); return; }
    const items = navigables(e.currentTarget, "data-studio-nav");
    const j = indexNavigation(e.key === "ArrowLeft" || e.key === "ArrowRight" ? "" : e.key, items.indexOf(e.target as HTMLElement), items.length);
    if (j !== null) { e.preventDefault(); items[j]?.focus(); }
  };

  // Palette verticale : flèche droite ouvre le menu (haut / bas restent la navigation de la colonne).
  const touchesOuverture = verticale ? ["Enter", " ", "ArrowRight"] : ["Enter", " ", "ArrowDown", "ArrowUp"];
  const surClavierBouton = (f: IdFamille | "plus") => (e: ClavierReact<HTMLButtonElement>) => {
    if (touchesOuverture.includes(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      if (ouvert === f && (e.key === "Enter" || e.key === " ")) fermer(true);
      else ouvrir(f, e.key === "ArrowUp" ? "dernier" : "premier");
    }
  };

  // Flèches gauche / droite (haut / bas en palette verticale) d'un bouton de la rangée à l'autre.
  const touchesRangee = verticale ? ["ArrowUp", "ArrowDown", "Home", "End"] : ["ArrowLeft", "ArrowRight", "Home", "End"];
  const surClavierRangee = (e: ClavierReact<HTMLDivElement>) => {
    const cible = e.target as HTMLElement;
    if (!cible.hasAttribute("data-studio-ligne") || !touchesRangee.includes(e.key)) return;
    const items = navigables(racine.current, "data-studio-ligne");
    const j = indexNavigation(e.key, items.indexOf(cible), items.length);
    if (j !== null) { e.preventDefault(); e.stopPropagation(); items[j]?.focus(); }
  };

  const styleMenu = (f: IdFamille | "plus") => (ouvert === f && placement ? { left: placement.left, top: placement.top, maxHeight: placement.hauteurMax } : undefined);

  const boutonMenu = (f: IdFamille | "plus", libelle: string, trace: string) => (
    <button type="button" className={f === "plus" ? "studio-famille-bouton studio-plus" : "studio-famille-bouton"} aria-haspopup="true" aria-expanded={ouvert === f} aria-controls={idMenu(f)}
      aria-label={f === "plus" ? "Plus d’outils" : `Menu ${libelle}`} title={f === "plus" ? "Plus d’outils" : `Menu ${libelle}`} data-studio-ligne="" data-studio-mesure={f === "plus" ? "plus" : `menu:${f}`} data-studio-menu={f}
      onClick={() => (ouvert === f ? fermer(false) : ouvrir(f, null))} onKeyDown={surClavierBouton(f)}>
      <IconeTrace d={trace} />
      <span className="studio-chevron" aria-hidden="true">▾</span>
    </button>
  );

  return (
    <div className={verticale ? "studio-tools studio-tools-verticale" : "studio-tools"} role="toolbar" aria-label={libelle} aria-orientation={verticale ? "vertical" : undefined} ref={racine} onKeyDown={surClavierRangee} data-studio-mode={mode} data-studio-orientation={orientation}>
      {disposition.rangee.map((d) => {
        const f = FAMILLES_STUDIO.find((x) => x.id === d.id)!;
        const liste = elements.get(f.id) ?? [];
        const dansMenu = liste.slice(d.enLigne);
        return (
          <div key={f.id} className="studio-famille" role="group" aria-label={f.libelleFR} data-studio-famille={f.id} data-studio-famille-active={f.id === active ? "" : undefined}>
            {d.menu ? boutonMenu(f.id, f.libelleFR, f.trace) : <span className="studio-famille-sep" aria-hidden="true" />}
            {liste.slice(0, d.enLigne).map((e) => element(e, "rangee"))}
            {d.menu && (
              <div id={idMenu(f.id)} className="studio-menu" role="group" aria-label={f.libelleFR} hidden={ouvert !== f.id} style={styleMenu(f.id)} onKeyDown={surClavierMenu} data-studio-menu-liste={f.id}>
                <p className="studio-menu-titre" aria-hidden="true">{f.libelleFR}</p>
                {dansMenu.map((e) => element(e, "menu"))}
              </div>
            )}
          </div>
        );
      })}
      {disposition.plus.length > 0 && (
        <div className="studio-famille" data-studio-famille-plus="">
          {boutonMenu("plus", "Plus", TRACE_PLUS)}
          <div id={idMenu("plus")} className="studio-menu" role="group" aria-label="Plus d’outils" hidden={ouvert !== "plus"} style={styleMenu("plus")} onKeyDown={surClavierMenu} data-studio-menu-liste="plus">
            {disposition.plus.map((id) => (
              <div key={id} className="studio-menu-section" role="group" aria-label={LIBELLE_FAMILLE.get(id)} data-studio-famille={id}>
                <p className="studio-menu-titre" aria-hidden="true">{LIBELLE_FAMILLE.get(id)}</p>
                {(elements.get(id) ?? []).map((e) => element(e, "menu"))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
