/**
 * Barre « Axes et repères » (chantier Axes, lot AX-2 ; concept Axes 1.0, § 4). Compacte et flottante — jamais une
 * bande pleine largeur —, déplaçable par sa poignée (souris, doigt, flèches au clavier), position mémorisée sur
 * l'appareil, ramenée dans la zone visible ; au téléphone, rangée en bas avec le sélecteur et Placer visibles, le reste
 * dans « Plus ». Ordre : sélecteur du repère actif, Placer, Aligner, Plan, Précédent, Modèle, Plus (Pivoter, Verrouiller,
 * Vue normale, Affichage des axes, Inspecteur). L'inspecteur porte les valeurs exactes : origine, orientation, rotation
 * par axe NOMMÉ et angle signé, plan de travail, verrou. Aucune de ces commandes ne modifie le document (AX-D3).
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { BaseAxe, ContexteTravail, NomAxe, PlanRepere, Vec3 } from "@parcours/sandbox-planche-model";
import { PLANS_REPERE, entreeOutil, repereDuContexte } from "@parcours/sandbox-planche-model";
import { etatUi, useEtatUi } from "../etat-ui";
import { t } from "../messages";
import { useNavigationBarre } from "../navigation-barre";
import { pasClavier } from "../panneaux/barre-actions-position";
import { IconeSandbox, Pictogramme } from "../pictogrammes/Pictogramme";
import { borner, positionDefautBarre, positionDocquee, type Position, type Taille, type Zone } from "./barres-outils-disposition";
import { COMMANDES_REPERES, type CommandeRepere, type IdCommandeRepere, cleNomRepere, disponibiliteRepere } from "./commandes-reperes";
import { afficherRaccourci, pictoOutil } from "./outils-planche";

const RACCOURCI_PLACER = entreeOutil("axes").raccourci ?? "";

export interface PropsBarreReperes {
  contexte: ContexteTravail;
  precedents: number;
  /** Une face est sélectionnée (Aligner). */
  face: boolean;
  outilId: string;
  telephone: boolean;
  separateurDecimal: "." | ",";
  reference: React.RefObject<HTMLElement | null>;
  fenetreCle?: string;
  /** Change pour ouvrir la liste des repères (raccourci Alt + Maj + 1). */
  demandeListe: number;
  /** Change pour ouvrir l'inspecteur sur la rotation (raccourci Alt + Maj + 3). */
  demandeInspecteur: number;
  onCommande: (id: IdCommandeRepere) => void;
  onPlacer: () => void;
  onOrigine: (o: Vec3) => string | null;
  onPivoter: (axe: NomAxe, base: BaseAxe, angleDegres: number) => string | null;
  onPlan: (p: PlanRepere) => void;
  onVerrou: (v: boolean) => void;
  onFermer: () => void;
}

const zoneDe = (el: Element): Zone => {
  const w = el.ownerDocument.defaultView ?? window;
  const vv = w.visualViewport;
  return vv ? { largeur: vv.width, hauteur: vv.height, gauche: vv.offsetLeft, haut: vv.offsetTop } : { largeur: w.innerWidth, hauteur: w.innerHeight };
};
const tailleDe = (el: HTMLElement): Taille => {
  const r = el.getBoundingClientRect();
  return { largeur: r.width, hauteur: r.height };
};

/** Nombre lu selon la locale (virgule ou point) ; `null` si ce n'est pas un nombre fini. */
export function lireNombre(texte: string): number | null {
  const v = Number(texte.trim().replace(",", "."));
  return texte.trim() !== "" && Number.isFinite(v) ? v : null;
}
const ecrire = (v: number, sep: "." | ",", decimales = 3): string => {
  const s = (Math.abs(v) < 0.5 * 10 ** -decimales ? 0 : v).toFixed(decimales);
  return sep === "," ? s.replace(".", ",") : s;
};

/** Libellé du plan courant (« XY local », « XZ du modèle (verrouillé) »). */
export function libellePlan(c: ContexteTravail): string {
  const base = t(`planche.reperes.plan.${c.plan}.${c.source.genre === "modele" ? "modele" : "local"}`);
  return c.verrou ? t("planche.reperes.plan.verrouille", { plan: base }) : base;
}

export function BarreReperes(p: PropsBarreReperes) {
  const ui = useEtatUi();
  const racine = useRef<HTMLDivElement | null>(null);
  const naviguer = useNavigationBarre(racine);
  const [glisser, setGlisser] = useState<Position | null>(null);
  const [defaut, setDefaut] = useState<{ pos: Position; largeur?: number } | null>(null);
  const [ouvert, setOuvert] = useState<"liste" | "plus" | null>(null);
  const [inspecteur, setInspecteur] = useState(false);
  const depart = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const memorisee = p.telephone ? null : ui.barreReperes.position;

  const memoriser = useCallback((pos: Position) => {
    const e = etatUi.get().barreReperes;
    if (e.position && e.position.x === pos.x && e.position.y === pos.y) return;
    etatUi.set({ barreReperes: { ...e, position: pos } });
  }, []);

  const calculerDefaut = useCallback((): { pos: Position; largeur?: number } | null => {
    const el = racine.current;
    if (!el) return null;
    const fenetre = zoneDe(el);
    const r = p.reference.current?.getBoundingClientRect();
    const zone: Zone = r && r.width > 0 && r.height > 0 ? { gauche: r.left, haut: r.top, largeur: r.width, hauteur: r.height } : fenetre;
    const visible = (sel: string) => {
      const q = p.reference.current?.querySelector(sel)?.getBoundingClientRect();
      return q && q.width > 0 && q.height > 0 ? q : null;
    };
    if (p.telephone) {
      const volet = visible("[data-planche-volet]") ?? visible("[data-planche-pied]");
      const bas = r && volet ? Math.max(0, r.bottom - volet.top) : 0;
      const largeur = Math.max(0, Math.min(zone.largeur, fenetre.largeur) - 8);
      const taille = { largeur, hauteur: tailleDe(el).hauteur };
      return { pos: borner(positionDocquee(taille, zone, bas), taille, fenetre), largeur };
    }
    const taille = tailleDe(el);
    const rail = visible(".planche-outils");
    // Sous le menu ☰ et à droite du rail d'outils, sans bande pleine largeur.
    const reserves = { haut: 64, gauche: rail && r ? rail.right - r.left + 8 : 72 };
    return { pos: borner(positionDefautBarre(0, taille, zone, reserves), taille, fenetre) };
  }, [p.reference, p.telephone]);

  const replacer = useCallback(() => {
    const el = racine.current;
    if (!el) return;
    const m = p.telephone ? null : etatUi.get().barreReperes.position;
    if (m) {
      const b = borner(m, tailleDe(el), zoneDe(el));
      if (b.x !== m.x || b.y !== m.y) memoriser(b);
    } else {
      const d = calculerDefaut();
      if (d) setDefaut((prev) => (prev && prev.pos.x === d.pos.x && prev.pos.y === d.pos.y && prev.largeur === d.largeur ? prev : d));
    }
  }, [calculerDefaut, memoriser, p.telephone]);

  useLayoutEffect(() => {
    replacer();
  }, [replacer, p.fenetreCle, memorisee === null, inspecteur]);
  useEffect(() => {
    const el = racine.current;
    if (!el) return;
    const w = el.ownerDocument.defaultView ?? window;
    w.addEventListener("resize", replacer);
    w.visualViewport?.addEventListener("resize", replacer);
    return () => {
      w.removeEventListener("resize", replacer);
      w.visualViewport?.removeEventListener("resize", replacer);
    };
  }, [replacer]);
  useEffect(() => {
    if (p.demandeListe > 0) setOuvert("liste");
  }, [p.demandeListe]);
  useEffect(() => {
    if (p.demandeInspecteur > 0) {
      setInspecteur(true);
      setOuvert(null);
    }
  }, [p.demandeInspecteur]);
  // Échap ferme le menu ouvert et rend le focus au bouton qui l'a ouvert (§ 10).
  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOuvert(null);
      racine.current?.querySelector<HTMLButtonElement>(ouvert === "liste" ? "[data-reperes-commande='choisir-repere']" : "[data-reperes-plus]")?.focus();
    };
    window.addEventListener("keydown", fermer, true);
    return () => window.removeEventListener("keydown", fermer, true);
  }, [ouvert]);

  const positionCourante = (): Position => etatUi.get().barreReperes.position ?? (() => {
    const r = racine.current?.getBoundingClientRect();
    return { x: r?.left ?? 0, y: r?.top ?? 0 };
  })();
  const surPointeur = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (p.telephone || (e.button !== 0 && e.pointerType === "mouse")) return;
    const pos = positionCourante();
    depart.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlisser(pos);
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
    if (d && el) memoriser(borner({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }, tailleDe(el), zoneDe(el)));
  };
  const surClavier = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const pas = pasClavier(e.key, e.shiftKey);
    const el = racine.current;
    if (!pas || !el || p.telephone) return;
    e.preventDefault();
    e.stopPropagation();
    const pos = positionCourante();
    memoriser(borner({ x: pos.x + pas.x, y: pos.y + pas.y }, tailleDe(el), zoneDe(el)));
  };

  const etat = { contexte: p.contexte, precedents: p.precedents, face: p.face };
  const titre = (c: CommandeRepere, motif: string | null) => `${t(c.libelle)} (${afficherRaccourci(c.raccourci)})${motif ? ` — ${motif}` : ""}`;
  const bouton = (c: CommandeRepere, avecNom = false) => {
    const d = disponibiliteRepere(c.id, etat);
    const motif = d.motif ? t(d.motif) : null;
    const actif = (c.id === "verrouiller-plan" && p.contexte.verrou) || (c.id === "choisir-repere" && ouvert === "liste");
    const nom = c.id === "plan-de-travail" ? libellePlan(p.contexte) : c.id === "choisir-repere" ? t(cleNomRepere(p.contexte)) : t(c.court);
    return (
      <button
        key={c.id}
        type="button"
        className={`planche-barre-outils-op planche-reperes-op${actif ? " est-actif" : ""}${motif ? " est-indisponible" : ""}`}
        title={titre(c, motif)}
        aria-label={titre(c, motif)}
        aria-disabled={motif ? true : undefined}
        {...(c.id === "verrouiller-plan" ? { "aria-pressed": p.contexte.verrou } : {})}
        {...(c.id === "choisir-repere" ? { "aria-expanded": ouvert === "liste", "aria-haspopup": "menu" as const } : {})}
        data-reperes-commande={c.id}
        onClick={() => {
          if (motif) return;
          if (c.id === "choisir-repere") setOuvert((o) => (o === "liste" ? null : "liste"));
          else if (c.id === "pivoter-repere") {
            setInspecteur(true);
            setOuvert(null);
          } else {
            setOuvert(null);
            p.onCommande(c.id);
          }
        }}
      >
        <Pictogramme picto={c.picto} />
        {(avecNom || c.id === "choisir-repere" || c.id === "plan-de-travail") && <span className="planche-reperes-nom">{nom}</span>}
      </button>
    );
  };
  const placer = (
    <button
      type="button"
      className={`planche-barre-outils-op planche-reperes-op${p.outilId === "axes" ? " est-actif" : ""}`}
      aria-pressed={p.outilId === "axes"}
      title={`${t("planche.reperes.placer")} (${afficherRaccourci(RACCOURCI_PLACER)})`}
      aria-label={`${t("planche.reperes.placer")} (${afficherRaccourci(RACCOURCI_PLACER)})`}
      data-reperes-commande="placer"
      onClick={p.onPlacer}
    >
      <Pictogramme picto={pictoOutil("axes")} />
    </button>
  );
  const principales = COMMANDES_REPERES.filter((c) => c.principale && c.id !== "choisir-repere");
  const secondaires = COMMANDES_REPERES.filter((c) => !c.principale);
  const dansPlus = p.telephone ? [...principales, ...secondaires] : secondaires;

  const pos = glisser ?? memorisee ?? defaut?.pos ?? null;
  const style: React.CSSProperties = pos ? { left: `${pos.x}px`, top: `${pos.y}px`, ...(p.telephone && defaut?.largeur ? { width: `${defaut.largeur}px` } : {}) } : { visibility: "hidden" };
  return (
    <div
      ref={racine}
      className={`planche-barre-outils planche-barre-reperes${glisser ? " en-glisser" : ""}${p.telephone ? " est-docquee" : ""}`}
      role="toolbar"
      aria-label={t("planche.reperes.barre")}
      onKeyDown={naviguer}
      style={style}
      data-barre-reperes
      data-position={p.telephone ? "docquee" : memorisee ? "memorisee" : "defaut"}
    >
      <div className="planche-reperes-rangee">
        <button
          type="button"
          className="planche-barre-outils-poignee"
          aria-label={t("planche.reperes.deplacer")}
          title={t("planche.reperes.deplacer")}
          disabled={p.telephone}
          data-reperes-poignee
          onPointerDown={surPointeur}
          onPointerMove={surDeplacement}
          onPointerUp={surRelachement}
          onPointerCancel={surRelachement}
          onKeyDown={surClavier}
        >
          <IconeSandbox nom="poignee" />
        </button>
        {bouton(COMMANDES_REPERES[0]!)}
        {placer}
        {!p.telephone && principales.map((c) => bouton(c))}
        <button
          type="button"
          className={`planche-barre-outils-op planche-reperes-op${ouvert === "plus" ? " est-actif" : ""}`}
          aria-expanded={ouvert === "plus"}
          aria-haspopup="menu"
          aria-label={t("planche.reperes.plus")}
          title={t("planche.reperes.plus")}
          data-reperes-plus
          onClick={() => setOuvert((o) => (o === "plus" ? null : "plus"))}
        >
          <IconeSandbox nom="menu" />
        </button>
        <button type="button" className="planche-barre-outils-fermer" aria-label={t("planche.reperes.masquer")} title={t("planche.reperes.masquer")} data-reperes-fermer onClick={p.onFermer}>
          <IconeSandbox nom="fermer" />
        </button>
      </div>
      {ouvert === "liste" && (
        <div className="planche-reperes-menu" role="menu" aria-label={t("planche.reperes.liste")} data-reperes-liste>
          <button type="button" role="menuitemradio" aria-checked={p.contexte.source.genre === "modele"} data-reperes-choix="modele" onClick={() => { setOuvert(null); p.onCommande("repere-modele"); }}>
            {t("planche.reperes.liste.modele")}
          </button>
          {p.contexte.source.genre === "temporaire" && (
            <button type="button" role="menuitemradio" aria-checked data-reperes-choix="temporaire" onClick={() => setOuvert(null)}>
              {t("planche.reperes.liste.courant")}
            </button>
          )}
        </div>
      )}
      {ouvert === "plus" && (
        <div className="planche-reperes-menu" role="menu" aria-label={t("planche.reperes.plus")} data-reperes-menu-plus>
          {dansPlus.map((c) => {
            const d = disponibiliteRepere(c.id, etat);
            const motif = d.motif ? t(d.motif) : null;
            return (
              <button
                key={c.id}
                type="button"
                role="menuitem"
                aria-disabled={motif ? true : undefined}
                className={motif ? "est-indisponible" : undefined}
                title={titre(c, motif)}
                data-reperes-commande={c.id}
                onClick={() => {
                  if (motif) return;
                  setOuvert(null);
                  if (c.id === "pivoter-repere") setInspecteur(true);
                  else p.onCommande(c.id);
                }}
              >
                <Pictogramme picto={c.picto} /> {t(c.libelle)} <span className="planche-reperes-raccourci">{afficherRaccourci(c.raccourci)}</span>
              </button>
            );
          })}
          <button type="button" role="menuitemcheckbox" aria-checked={inspecteur} data-reperes-inspecteur-bascule onClick={() => { setOuvert(null); setInspecteur((v) => !v); }}>
            {t("planche.reperes.inspecteur")}
          </button>
        </div>
      )}
      {inspecteur && <Inspecteur {...p} onFermerInspecteur={() => setInspecteur(false)} />}
    </div>
  );
}

function Inspecteur(p: PropsBarreReperes & { onFermerInspecteur: () => void }) {
  const r = repereDuContexte(p.contexte);
  const sep = p.separateurDecimal;
  const [origine, setOrigine] = useState<[string, string, string]>([ecrire(r.origine.x, sep), ecrire(r.origine.y, sep), ecrire(r.origine.z, sep)]);
  const [axe, setAxe] = useState<NomAxe>("z");
  const [base, setBase] = useState<BaseAxe>("local");
  const [angle, setAngle] = useState("90");
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = `${r.origine.x}|${r.origine.y}|${r.origine.z}`;
  useEffect(() => {
    setOrigine([ecrire(r.origine.x, sep), ecrire(r.origine.y, sep), ecrire(r.origine.z, sep)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, sep]);
  const appliquerOrigine = () => {
    const v = origine.map(lireNombre);
    if (v.some((x) => x === null)) return setErreur(t("planche.reperes.invalide"));
    setErreur(p.onOrigine({ x: v[0]!, y: v[1]!, z: v[2]! }));
  };
  const pivoter = () => {
    const a = lireNombre(angle);
    if (a === null) return setErreur(t("planche.reperes.invalide"));
    setErreur(p.onPivoter(axe, base, a));
  };
  const vecteur = (v: Vec3) => `(${ecrire(v.x, sep)} ; ${ecrire(v.y, sep)} ; ${ecrire(v.z, sep)})`;
  return (
    <section className="planche-reperes-inspecteur" aria-label={t("planche.reperes.inspecteur")} data-reperes-inspecteur>
      <fieldset>
        <legend>{t("planche.reperes.origine")}</legend>
        {(["x", "y", "z"] as const).map((k, i) => (
          <label key={k}>
            {k.toUpperCase()}
            <input
              inputMode="decimal"
              value={origine[i]}
              onChange={(e) => setOrigine((o) => o.map((x, j) => (j === i ? e.target.value : x)) as [string, string, string])}
              onKeyDown={(e) => e.key === "Enter" && appliquerOrigine()}
              data-reperes-origine={k}
            />
          </label>
        ))}
        <button type="button" onClick={appliquerOrigine} data-reperes-origine-appliquer>
          {t("planche.reperes.origine.appliquer")}
        </button>
      </fieldset>
      <fieldset>
        <legend>{t("planche.reperes.orientation")}</legend>
        <dl className="planche-reperes-orientation">
          {(["x", "y", "z"] as const).map((k) => (
            <div key={k} data-reperes-axe={k}>
              <dt>{k.toUpperCase()}</dt>
              <dd>{vecteur(r[k])}</dd>
            </div>
          ))}
        </dl>
      </fieldset>
      <fieldset>
        <legend>{t("planche.reperes.cmd.pivoter-repere")}</legend>
        <label>
          {t("planche.reperes.pivoter.axe")}
          <select value={axe} onChange={(e) => setAxe(e.target.value as NomAxe)} data-reperes-pivoter-axe>
            <option value="x">X</option>
            <option value="y">Y</option>
            <option value="z">Z</option>
          </select>
        </label>
        <label>
          {t("planche.reperes.pivoter.base")}
          <select value={base} onChange={(e) => setBase(e.target.value as BaseAxe)} data-reperes-pivoter-base>
            <option value="local">{t("planche.reperes.pivoter.local")}</option>
            <option value="modele">{t("planche.reperes.pivoter.modele")}</option>
          </select>
        </label>
        <label>
          {t("planche.reperes.pivoter.angle")}
          <input inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && pivoter()} data-reperes-pivoter-angle />
        </label>
        <button type="button" onClick={pivoter} data-reperes-pivoter>
          {t("planche.reperes.pivoter.appliquer")}
        </button>
      </fieldset>
      <fieldset>
        <legend>{t("planche.reperes.plan")}</legend>
        <select value={p.contexte.plan} onChange={(e) => p.onPlan(e.target.value as PlanRepere)} aria-label={t("planche.reperes.plan")} data-reperes-plan>
          {PLANS_REPERE.map((pl) => (
            <option key={pl} value={pl}>
              {t(`planche.reperes.plan.${pl}.${p.contexte.source.genre === "modele" ? "modele" : "local"}`)}
            </option>
          ))}
        </select>
        <label>
          <input type="checkbox" checked={p.contexte.verrou} onChange={(e) => p.onVerrou(e.target.checked)} data-reperes-verrou />
          {t("planche.reperes.verrou")}
        </label>
      </fieldset>
      {erreur && (
        <p className="planche-reperes-erreur" role="alert" data-reperes-erreur>
          {erreur}
        </p>
      )}
      <button type="button" className="planche-reperes-inspecteur-fermer" aria-label={t("panneau.fermer", { titre: t("planche.reperes.inspecteur") })} onClick={p.onFermerInspecteur} data-reperes-inspecteur-fermer>
        <IconeSandbox nom="fermer" />
      </button>
    </section>
  );
}
