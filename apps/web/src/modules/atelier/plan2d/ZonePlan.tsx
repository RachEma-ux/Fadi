/**
 * Zone de travail 2D du nouvel Atelier (L3a.2, cahier §5.7–5.8) : composant mince au-dessus de `ControleurPlan`.
 * SVG en mètres (y vers le haut) sous une transformation de vue ; couche des objets mémorisée (aucun re-rendu au
 * pan ni au survol), aperçu dans une couche séparée rafraîchie par `requestAnimationFrame` ; pointer events
 * unifiés ; clavier : chiffres = saisie de précision, flèches = curseur d'un pas de grille, Entrée = poser,
 * Échap = abandonner ou vider la sélection.
 */
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as KE, type PointerEvent as PE } from "react";
import type { EtatModele, IdObjet, PointLocal } from "@parcours/atelier-model";
import type { Apercu, ContexteAtelier, DessinPlan, EtatInterface, FormeApercu, FormeDessin, Modificateurs, PiloteOutils, Registres } from "../socle";
import { LIBELLES_MODE, MODES_ACCROCHAGE } from "./accrochage";
import { LIBELLES_CLASSE } from "./choix";
import { ControleurPlan, type EntreePointeur, type TypePointeur } from "./controleur";
import { transformerDessin } from "./dessinateurs";
import { indicateurProfil } from "./profil";
import { formaterValeur } from "./saisie";
import { lignesGrille, transformationSvg } from "./vue";
import "./plan2d.css";

export interface ProprietesZonePlan {
  readonly registres: Registres;
  readonly pilote: PiloteOutils;
  readonly ctx: ContexteAtelier;
  readonly vue: EtatInterface;
}

const APERCU_VIDE: Apercu = { formes: [], champs: [], consigne: "", erreurs: [] };

const mods = (e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): Modificateurs => ({ maj: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey });

const pts = (p: readonly PointLocal[]): string => p.map((q) => `${q.x},${q.y}`).join(" ");

/** Aperçu du pilote, publié au plus une fois par image. */
function useApercu(pilote: PiloteOutils): Apercu {
  const [apercu, setApercu] = useState<Apercu>(() => pilote.apercu());
  useEffect(() => {
    let image = 0;
    const tirer = () => {
      if (image) return;
      image = requestAnimationFrame(() => {
        image = 0;
        setApercu(pilote.apercu());
      });
    };
    const fin = pilote.abonner(tirer);
    tirer();
    return () => {
      fin();
      if (image) cancelAnimationFrame(image);
    };
  }, [pilote]);
  return apercu ?? APERCU_VIDE;
}

// ---------------------------------------------------------------------------------------------------------------
// Rendu des formes (en mètres)
// ---------------------------------------------------------------------------------------------------------------

function Forme({ f }: { readonly f: FormeDessin }) {
  const cls = `p2-${f.style}`;
  switch (f.forme) {
    case "polygone":
      return <polygon className={cls} points={pts(f.points)} />;
    case "polyligne":
      return f.fermee ? <polygon className={`${cls} p2-ouvert`} points={pts(f.points)} /> : <polyline className={cls} points={pts(f.points)} />;
    case "cercle":
      return <circle className={`${cls} p2-ouvert`} cx={f.centre.x} cy={f.centre.y} r={f.rayon} />;
    case "arc": {
      const balayage = (((f.fin - f.debut) % 360) + 360) % 360 || 360;
      const a = { x: f.centre.x + f.rayon * Math.cos((f.debut * Math.PI) / 180), y: f.centre.y + f.rayon * Math.sin((f.debut * Math.PI) / 180) };
      const b = { x: f.centre.x + f.rayon * Math.cos((f.fin * Math.PI) / 180), y: f.centre.y + f.rayon * Math.sin((f.fin * Math.PI) / 180) };
      // Repère y vers le haut sous `scale(1,-1)` : le sens trigonométrique devient le drapeau de balayage 1.
      return <path className={`${cls} p2-ouvert`} d={`M ${a.x} ${a.y} A ${f.rayon} ${f.rayon} 0 ${balayage > 180 ? 1 : 0} 1 ${b.x} ${b.y}`} />;
    }
    case "texte":
      return (
        <text className={cls} transform={`translate(${f.position.x} ${f.position.y}) scale(1 -1)`} fontSize={f.hauteur}>
          {f.texte}
        </text>
      );
  }
}

const Dessin = memo(function Dessin({ d, etat }: { readonly d: DessinPlan; readonly etat: "normal" | "selectionne" | "survole" }) {
  return (
    <g className={`p2-objet p2-${d.couche} p2-etat-${etat}`} data-objet={d.objetId}>
      {d.formes.map((f, i) => (
        <Forme key={i} f={f} />
      ))}
    </g>
  );
});

/** Couche des objets du niveau : ne se redessine que si les dessins, la sélection ou le survol changent. */
const CoucheObjets = memo(function CoucheObjets({ dessins, selection, survole }: { readonly dessins: readonly DessinPlan[]; readonly selection: readonly IdObjet[]; readonly survole: IdObjet | null }) {
  const sel = new Set(selection);
  return (
    <g className="p2-couche-objets">
      {dessins.map((d) => (
        <Dessin key={d.objetId} d={d} etat={sel.has(d.objetId) ? "selectionne" : d.objetId === survole ? "survole" : "normal"} />
      ))}
    </g>
  );
});

function FormeAp({ f, zoom, parId }: { readonly f: FormeApercu; readonly zoom: number; readonly parId: ReadonlyMap<IdObjet, DessinPlan> }) {
  switch (f.forme) {
    case "segment":
      return <line className={`p2a-${f.style}`} x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} />;
    case "polyligne":
      return f.fermee ? <polygon className={`p2a-${f.style} p2-ouvert`} points={pts(f.points)} /> : <polyline className={`p2a-${f.style}`} points={pts(f.points)} />;
    case "polygone":
      return <polygon className={`p2a-${f.style}`} points={pts(f.points)} />;
    case "cercle":
      // Rayon 0 : poignée de point de contrôle, de taille fixe à l'écran (cible ≥ 24 px).
      return f.rayon === 0 ? <circle className={`p2a-poignee p2a-${f.style}`} cx={f.centre.x} cy={f.centre.y} r={6 / zoom} /> : <circle className={`p2a-${f.style} p2-ouvert`} cx={f.centre.x} cy={f.centre.y} r={f.rayon} />;
    case "cote": {
      const m = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
      return (
        <g className="p2a-cote">
          <line x1={f.a.x} y1={f.a.y} x2={f.b.x} y2={f.b.y} />
          <text transform={`translate(${m.x} ${m.y}) scale(${1 / zoom} ${-1 / zoom}) translate(6 -6)`}>{f.texte}</text>
        </g>
      );
    }
    case "texte":
      return (
        <text className={`p2a-texte p2a-${f.style}`} transform={`translate(${f.position.x} ${f.position.y}) scale(${1 / zoom} ${-1 / zoom}) translate(8 -8)`}>
          {f.texte}
        </text>
      );
    case "surligner":
      return (
        <g className={`p2a-surligner p2a-${f.style}`}>
          {f.ids.map((id) => {
            const d = parId.get(id);
            return d ? d.formes.map((x, i) => <Forme key={`${id}-${i}`} f={x} />) : null;
          })}
        </g>
      );
  }
}

// ---------------------------------------------------------------------------------------------------------------

export function ZonePlan({ registres, pilote, ctx, vue }: ProprietesZonePlan) {
  const controleur = useMemo(() => new ControleurPlan({ registres, pilote, ctx, vue }), [registres, pilote, ctx, vue]);
  const aff = useSyncExternalStore(controleur.abonner, controleur.lire);
  const etat: EtatModele | null = useSyncExternalStore(ctx.abonnerEtat, ctx.etat);
  const etatVue = useSyncExternalStore(vue.abonner, vue.lire);
  const selection = useSyncExternalStore(ctx.selection.abonner, ctx.selection.lire);
  const apercu = useApercu(pilote);
  const toile = useRef<HTMLDivElement>(null);
  const champSaisie = useRef<HTMLInputElement>(null);

  // Dessins du niveau : recalculés quand l'état, le niveau ou les calques masqués changent.
  const dessins = useMemo(() => controleur.dessins(), [controleur, etat, etatVue.niveauActifId, etatVue.calquesMasques]);
  const parId = useMemo(() => new Map(dessins.map((d) => [d.objetId, d])), [dessins]);
  const groupes = useMemo(() => controleur.groupes(), [controleur, dessins]);
  const outil = pilote.outilActif();

  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    const mesurer = () => controleur.redimensionner(el.clientWidth, el.clientHeight);
    mesurer();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [controleur]);

  // Ajuste la vue à l'emprise au premier dessin d'un niveau.
  const niveauAjuste = useRef<IdObjet | null>(null);
  useEffect(() => {
    if (dessins.length > 0 && niveauAjuste.current !== etatVue.niveauActifId) {
      niveauAjuste.current = etatVue.niveauActifId;
      controleur.ajuster();
    }
  }, [controleur, dessins, etatVue.niveauActifId]);

  // La molette doit pouvoir empêcher le défilement de la page : écouteur non passif.
  useEffect(() => {
    const el = toile.current;
    if (!el) return;
    const roue = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      controleur.molette(e.clientX - r.left, e.clientY - r.top, e.deltaY);
    };
    el.addEventListener("wheel", roue, { passive: false });
    return () => el.removeEventListener("wheel", roue);
  }, [controleur]);

  useEffect(() => {
    if (aff.saisie) champSaisie.current?.focus();
  }, [aff.saisie]);

  const entree = (e: PE<HTMLDivElement>): EntreePointeur => {
    const r = e.currentTarget.getBoundingClientRect();
    return { id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, type: (["mouse", "pen", "touch"].includes(e.pointerType) ? e.pointerType : "mouse") as TypePointeur, bouton: e.button, modificateurs: mods(e) };
  };

  const toucheZone = (e: KE<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (controleur.touche(e.key, mods(e))) e.preventDefault();
  };

  const toucheSaisie = (e: KE<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      controleur.validerSaisie("entree");
      toile.current?.focus();
    } else if (e.key === "Tab") {
      e.preventDefault();
      controleur.validerSaisie(e.shiftKey ? "precedent" : "suivant");
    } else if (e.key === "Escape") {
      e.preventDefault();
      controleur.fermerSaisie();
      toile.current?.focus();
    }
  };

  const { cadre } = aff;
  const grille = etatVue.vue === "plan" ? lignesGrille(cadre, aff.reglages.pasGrille) : null;
  const champActif = aff.saisie ? controleur.champActif() : null;
  const fantomes =
    aff.manipulation === null
      ? []
      : selection.ids
          .map((id) => parId.get(id))
          .filter((d): d is DessinPlan => d !== undefined)
          .slice(0, 400)
          .map((d) => transformerDessin(d, (p) => ({ x: p.x + (aff.manipulation?.dx ?? 0), y: p.y + (aff.manipulation?.dy ?? 0) })));
  const profil = indicateurProfil(etat, selection.ids, dessins);
  const niveau = etatVue.niveauActifId ? etat?.objets[etatVue.niveauActifId] : undefined;
  const nomNiveau = niveau?.classe === "niveau" ? niveau.params.nom : "aucun niveau";
  const erreurs = [...apercu.erreurs, ...pilote.derniereErreur(), ...aff.erreurs, ...(aff.saisie?.erreur ? [aff.saisie.erreur] : [])];

  return (
    <div className="plan2d" data-testid="plan2d-zone">
      <div className="p2-barre" role="toolbar" aria-label="Accrochages et vue du plan">
        <div className="p2-groupe" role="group" aria-label="Accrochages" data-testid="plan2d-accrochages">
          <button type="button" className="p2-puce" aria-pressed={aff.reglages.actif} onClick={() => controleur.basculerAccrochage()} data-testid="plan2d-accrochage-actif">
            Accrochages
          </button>
          {MODES_ACCROCHAGE.map((m) => (
            <button key={m} type="button" className={`p2-puce${aff.accrochage?.type === m ? " p2-maintenant" : ""}`} aria-pressed={aff.reglages.actif && aff.reglages.modes[m]} disabled={!aff.reglages.actif} onClick={() => controleur.basculerMode(m)} data-testid={`plan2d-mode-${m}`}>
              {LIBELLES_MODE[m]}
            </button>
          ))}
        </div>
        <div className="p2-groupe" role="group" aria-label="Navigation de la vue (ne modifie pas le modèle)">
          <button type="button" className="p2-puce" aria-pressed={aff.modePan} onClick={() => controleur.basculerPan()} data-testid="plan2d-pan">
            Pan
          </button>
          <button type="button" className="p2-puce" onClick={() => controleur.zoomer(1.25)} aria-label="Zoom avant" data-testid="plan2d-zoom-avant">
            Zoom +
          </button>
          <button type="button" className="p2-puce" onClick={() => controleur.zoomer(0.8)} aria-label="Zoom arrière" data-testid="plan2d-zoom-arriere">
            Zoom −
          </button>
          <button type="button" className="p2-puce" onClick={() => controleur.ajuster()} data-testid="plan2d-ajuster">
            Ajuster
          </button>
        </div>
        {groupes.length > 1 ? (
          <div className="p2-groupe" role="group" aria-label="Filtre de sélection par classe" data-testid="plan2d-filtre-classe">
            <button type="button" className="p2-puce" aria-pressed={aff.filtre === null} onClick={() => controleur.toutesClasses()}>
              Toutes
            </button>
            {groupes.map((g) => (
              <button key={g} type="button" className="p2-puce" aria-pressed={aff.filtre === null || aff.filtre.has(g)} onClick={() => controleur.basculerFiltre(g)} data-testid={`plan2d-filtre-${g}`}>
                {LIBELLES_CLASSE[g] ?? g}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={toile}
        className={`p2-toile${aff.modePan ? " p2-mode-pan" : ""}${outil ? " p2-avec-outil" : ""}`}
        tabIndex={0}
        role="application"
        aria-roledescription="plan 2D"
        aria-label={`Plan du niveau ${nomNiveau}. ${outil ? `Outil ${outil.libelle} : ${apercu.consigne}` : "Sélection : clic, Maj pour ajouter, glisser pour un lasso"}. Flèches : déplacer le curseur, Entrée : poser ou choisir, Échap : annuler.`}
        aria-describedby="plan2d-annonce"
        data-testid="plan2d-toile"
        onPointerDown={(e) => {
          e.currentTarget.focus();
          e.currentTarget.setPointerCapture?.(e.pointerId);
          controleur.pointeurBas(entree(e));
        }}
        onPointerMove={(e) => controleur.pointeurDeplace(entree(e))}
        onPointerUp={(e) => controleur.pointeurHaut(entree(e))}
        onPointerCancel={(e) => controleur.pointeurAnnule(entree(e))}
        onPointerLeave={() => controleur.pointeurSorti()}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={toucheZone}
      >
        <svg className="p2-svg" data-testid="plan2d-svg" width={cadre.largeur} height={cadre.hauteur} aria-hidden="true">
          {grille ? (
            <g className="p2-grille" data-pas={grille.pas}>
              {grille.verticales.map((x) => (
                <line key={`v${x}`} x1={x} y1={0} x2={x} y2={cadre.hauteur} />
              ))}
              {grille.horizontales.map((y) => (
                <line key={`h${y}`} x1={0} y1={y} x2={cadre.largeur} y2={y} />
              ))}
            </g>
          ) : null}
          <g transform={transformationSvg(cadre)}>
            <CoucheObjets dessins={dessins} selection={selection.ids} survole={aff.survole} />
            <g className="p2-couche-apercu" data-testid="plan2d-apercu">
              {fantomes.map((d) => (
                <g key={d.objetId} className="p2a-fantome-groupe">
                  {d.formes.map((f, i) => (
                    <Forme key={i} f={f} />
                  ))}
                </g>
              ))}
              {apercu.formes.map((f, i) => (
                <FormeAp key={i} f={f} zoom={cadre.zoom} parId={parId} />
              ))}
            </g>
          </g>
          {aff.lasso ? <rect className={`p2-lasso p2-lasso-${aff.lasso.sens}`} data-testid="plan2d-lasso" x={aff.lasso.rect.minX} y={aff.lasso.rect.minY} width={aff.lasso.rect.maxX - aff.lasso.rect.minX} height={aff.lasso.rect.maxY - aff.lasso.rect.minY} /> : null}
          {aff.curseur && (outil || aff.manipulation) ? (
            <g className="p2-curseur" transform={`translate(${aff.curseur.x} ${aff.curseur.y})`}>
              <line x1={-10} y1={0} x2={10} y2={0} />
              <line x1={0} y1={-10} x2={0} y2={10} />
              {aff.accrochage ? <rect className="p2-marque" x={-6} y={-6} width={12} height={12} /> : null}
            </g>
          ) : null}
        </svg>
        {aff.curseur && aff.accrochage && (outil || aff.manipulation) ? (
          <span className="p2-etiquette" data-testid="plan2d-accrochage" data-type={aff.accrochage.type} style={{ left: aff.curseur.x + 14, top: aff.curseur.y + 14 }}>
            {aff.accrochage.libelle}
          </span>
        ) : null}

        {outil && (apercu.champs.length > 0 || aff.saisie) ? (
          <div className="p2-precision" role="group" aria-label="Saisie de précision" data-testid="plan2d-precision" style={aff.curseur ? { left: Math.min(aff.curseur.x + 18, cadre.largeur - 260), top: Math.min(aff.curseur.y + 36, cadre.hauteur - 80) } : undefined}>
            {(apercu.champs.length > 0 ? apercu.champs : champActif ? [champActif] : []).map((c, i) => {
              const actif = aff.saisie !== null && champActif?.champ === c.champ;
              return (
                <label key={c.champ}>
                  {c.libelle}
                  {actif ? (
                    <input
                      ref={champSaisie}
                      data-testid={`plan2d-saisie-${c.champ}`}
                      inputMode="decimal"
                      aria-invalid={aff.saisie?.erreur ? true : undefined}
                      value={aff.saisie?.texte ?? ""}
                      placeholder={formaterValeur(c.valeur, c.unite)}
                      onChange={(e) => controleur.ecrireSaisie(e.target.value)}
                      onKeyDown={toucheSaisie}
                    />
                  ) : (
                    <input data-testid={`plan2d-saisie-${c.champ}`} readOnly value={formaterValeur(c.valeur, c.unite)} onFocus={() => controleur.ouvrirSaisie(i)} />
                  )}
                </label>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="p2-etat" data-testid="plan2d-selection">
        {outil ? (
          <span>
            <b>{outil.libelle}</b> — {apercu.consigne}
          </span>
        ) : (
          <span>
            {selection.ids.length === 0 ? "Aucune sélection" : `${selection.ids.length} objet${selection.ids.length > 1 ? "s" : ""} sélectionné${selection.ids.length > 1 ? "s" : ""}`}
            {profil ? ` · profil ${profil}` : ""}
          </span>
        )}
        {aff.curseurMetres ? <span className="p2-coordonnees" data-testid="plan2d-coordonnees">{coordonnees(aff.curseurMetres)}</span> : null}
      </div>
      {erreurs.length > 0 ? (
        <ul className="p2-erreurs" role="alert" data-testid="plan2d-erreurs">
          {erreurs.slice(0, 4).map((e, i) => (
            <li key={i}>
              <b>{e.objet}</b> : {e.cause} — {e.action}
            </li>
          ))}
        </ul>
      ) : null}
      <p id="plan2d-annonce" className="sr-only" aria-live="polite" data-testid="plan2d-annonce">
        {[aff.annonce, apercu.consigne].filter(Boolean).join(". ")}
      </p>
    </div>
  );
}

const coordonnees = (m: { x: number; y: number }): string => `x ${formaterValeur(m.x, "m")} · y ${formaterValeur(m.y, "m")}`;

export default ZonePlan;
