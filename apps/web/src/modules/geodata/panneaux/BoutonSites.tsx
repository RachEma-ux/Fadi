/**
 * Bouton « Sites » de la carte (27 novembre 2026, maquette validée par le maître d'ouvrage) : à côté de « Thèmes », il
 * ouvre les mêmes articles que le menu « Sites » de la Planche, sur la même base dédiée (module partagé `lib/sites`).
 * GeoData y apporte le centre de la carte (position déclarée, source « Centre de la carte GeoData ») et, à l'ouverture
 * d'un site, recentre la carte sur son contour ou sa position. Aucune notion de dossier ni de rôle n'entre ici.
 */
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { ARTICLES_SITES, ORDRE_ARTICLES, useSitesProjet, type ArticleSites } from "../../../lib/sites/menu-sites";

const ICONE = "M12 21s-6-5.4-6-10a6 6 0 0 1 12 0c0 4.6-6 10-6 10zM12 13.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4";
const SOURCE = "Centre de la carte GeoData";

export function BoutonSites(p: {
  centre(): { lon: number; lat: number } | null;
  allerA(cible: { emprise: readonly [number, number, number, number] } | { lon: number; lat: number; zoom?: number }): void;
  onAnnonce(texte: string): void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const racine = useRef<HTMLDivElement | null>(null);
  const sites = useSitesProjet({
    lien: null,
    etatModule: () => {
      const c = p.centre();
      // Six décimales (~0,1 m) : la précision du centre d'une vue, sans chiffres qui n'ont pas de sens.
      const arrondi = (v: number) => Math.round(v * 1e6) / 1e6;
      return c ? { observations: { geographic: { longitude: arrondi(c.lon), latitude: arrondi(c.lat), source: SOURCE } } } : {};
    },
    onOuvert: (s) => {
      const anneau = s.zone?.anneau;
      if (anneau && anneau.length >= 3 && !s.parcelle) {
        const lons = anneau.map((q) => q[0]);
        const lats = anneau.map((q) => q[1]);
        p.allerA({ emprise: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] });
      } else if (s.position) p.allerA({ lon: s.position.longitude, lat: s.position.latitude, zoom: 17 });
      p.onAnnonce(s.position ? `Site « ${s.fiche.nom} » ouvert : carte centrée sur sa position.` : `Site « ${s.fiche.nom} » ouvert : position non évaluée, la carte ne bouge pas.`);
    },
  });
  useEffect(() => {
    if (sites.note) p.onAnnonce(sites.note.texte);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.note]);
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: PointerEvent) => racine.current && !racine.current.contains(e.target as Node) && setOuvert(false);
    document.addEventListener("pointerdown", dehors, true);
    return () => document.removeEventListener("pointerdown", dehors, true);
  }, [ouvert]);
  useEffect(() => {
    if (ouvert) racine.current?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [ouvert]);

  const touche = (e: KeyboardEvent<HTMLDivElement>) => {
    const items = [...(racine.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); setOuvert(false); racine.current?.querySelector<HTMLButtonElement>("[data-gd-sites]")?.focus(); }
    if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length]?.focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length]?.focus(); }
  };
  const choisir = (a: ArticleSites) => {
    if (!sites.disponible[a] || sites.occupe) return;
    setOuvert(false);
    sites.actions[a]();
  };

  return (
    <div className="gd-sites" ref={racine} onKeyDown={touche}>
      <button type="button" className={`gd-sites-bouton${ouvert ? " gd-sites-ouvert" : ""}`} aria-haspopup="menu" aria-expanded={ouvert} title={sites.site ? `Site ouvert : ${sites.site.fiche.nom}` : "Sites"} onClick={() => setOuvert((v) => !v)} data-gd-sites>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d={ICONE} /></svg>
        <span>Sites</span>
        <span aria-hidden="true" className="gd-sites-chevron">▾</span>
      </button>
      {ouvert && (
        <div className="gd-sites-menu" role="menu" aria-label="Sites" data-gd-sites-menu>
          {ORDRE_ARTICLES.map((a, i) =>
            a === "separateur" ? <div key={`s${i}`} role="separator" className="gd-sites-separateur" /> : (
              <div key={a} role="menuitem" tabIndex={-1} aria-disabled={!sites.disponible[a] || sites.occupe} onClick={() => choisir(a)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choisir(a); } }} data-gd-sites-article={a}>
                {ARTICLES_SITES[a]}
              </div>
            ),
          )}
        </div>
      )}
      {sites.fenetres}
    </div>
  );
}
