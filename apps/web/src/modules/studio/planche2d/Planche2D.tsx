/**
 * Planche 2D de Studio (lot A.1/A.2) : document 2D autonome d'une variante — dessiner, coter, calques, annuler,
 * enregistrer en révision immuable, fermer, rouvrir. Aucun modèle 3D, aucun Atelier, aucun Parcours lu. Le document
 * canonique est `studio2d.ContenuDocument2D` ; le SVG n'en est qu'une projection. Enregistrer est une commande :
 * `baseRevisionId` (tête chargée) et `requestId` (rejeu sans double effet) ; un conflit n'écrase jamais.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent as PointerEventReact, type ReactElement, type WheelEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { studio2d } from "@parcours/domain-model";
import { api, ApiError, type RevisionStudio } from "../../../lib/api";
import { LOCALE } from "../../../lib/i18n";
import { cheminVarianteStudio } from "../routes-studio";
import { combinaison, COMMANDES_2D, entreeParRaccourci, OUTILS_2D, type Entree2D, type IdCommande2D, type IdOutil2D } from "./outils-2d";
import { auMillimetre, cadrer, decalageSigne, deplacerVue, versEcran, versMonde, VUE_INITIALE, zoomer, type Vue2D } from "./vue-2d";
import "./planche2d.css";

type Doc = studio2d.ContenuDocument2D;
type Point = studio2d.Point;
type Geste =
  | { type: "ligne"; a: Point }
  | { type: "cote"; a: Point; lienA: studio2d.LienCote; b?: Point; lienB?: studio2d.LienCote }
  | { type: "pan"; x: number; y: number };

const TOLERANCE_PX = 8;
const nouvelId = (prefixe: string) => `${prefixe}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
const metres = (v: number) => `${v.toLocaleString(LOCALE, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} m`;
const lienDe = (a: studio2d.Accroche | null): studio2d.LienCote => (a?.type === "extremite" ? { primitiveId: a.primitiveId, extremite: a.extremite } : null);

interface Props {
  projectId: string;
  etudeId: string;
  variantId: string;
  /** Révision passée demandée par l'adresse : lecture seule. */
  revision: string | null;
  peutEcrire: boolean;
}

export function Planche2D(props: Props) {
  const { projectId, etudeId, variantId, revision } = props;
  // L'éditeur de la tête n'est remonté que sur demande (conflit) : son propre enregistrement ne lui fait rien perdre.
  const [generation, setGeneration] = useState(0);
  const revisions = useQuery({ queryKey: ["studio-revisions", projectId, etudeId, variantId], queryFn: () => api.listRevisionsStudio(projectId, etudeId, variantId), staleTime: 0 });
  const tete = revisions.data?.at(-1) ?? null;
  const cible = revision ?? tete?.id ?? null;
  const chargee = useQuery({ queryKey: ["studio-revision", projectId, etudeId, variantId, cible], queryFn: () => api.getRevisionStudio(projectId, etudeId, variantId, cible!), enabled: !!cible, staleTime: Infinity });

  // La tête n'est jamais déduite d'une liste restaurée du cache local (possiblement périmée) : relecture serveur exigée.
  const listeFraiche = revisions.isFetchedAfterMount && !revisions.isError;
  if (!revisions.isError && !listeFraiche && revisions.fetchStatus === "paused") return <p role="status" data-studio-2d-hors-ligne>Le dessin s’ouvre avec une connexion au serveur : en attente de connexion.</p>;
  if ((!listeFraiche && !revisions.isError) || (cible && chargee.isPending)) return <p role="status">Chargement du dessin…</p>;
  if (revisions.isError || chargee.isError) {
    return (
      <p role="alert" data-studio-2d-erreur>
        Impossible de charger le dessin. <button type="button" className="link-button" onClick={() => void (revisions.isError ? revisions.refetch() : chargee.refetch())}>Réessayer</button>
      </p>
    );
  }
  const source = cible ? chargee.data! : null;
  const validation = source ? studio2d.validerDocument2D(source.contenu) : ({ ok: true, contenu: studio2d.documentVide() } as const);
  if (!validation.ok) return <p role="alert" data-studio-2d-erreur>Cette révision ne peut pas être lue : son contenu n’est pas conforme.</p>;
  const historique = !!revision;
  const rechargerTete = async () => {
    await revisions.refetch();
    setGeneration((g) => g + 1);
  };
  return (
    <Editeur
      // Une autre révision ouverte, ou la tête rechargée après conflit : éditeur neuf, aucun état d'une autre révision ne survit.
      key={historique ? `revision-${revision}` : `tete-${generation}`}
      {...props}
      rechargerTete={rechargerTete}
      initial={validation.contenu}
      source={source}
      tete={tete}
      revisions={revisions.data ?? []}
      lectureSeule={historique || !props.peutEcrire}
      historique={historique}
    />
  );
}

function Editeur({ projectId, etudeId, variantId, initial, source, tete, revisions, lectureSeule, historique, peutEcrire, rechargerTete }: Props & { initial: Doc; source: RevisionStudio | null; tete: RevisionStudio | null; revisions: RevisionStudio[]; lectureSeule: boolean; historique: boolean; rechargerTete: () => Promise<void> }) {
  const client = useQueryClient();
  const [hist, setHist] = useState(() => studio2d.historique(initial));
  const [enregistre, setEnregistre] = useState<{ contenu: Doc; revision: RevisionStudio | null }>({ contenu: initial, revision: source });
  const [outil, setOutil] = useState<IdOutil2D>("selection");
  const [calqueActif, setCalqueActif] = useState(initial.calques[0]!.id);
  const [selection, setSelection] = useState<string[]>([]);
  const [geste, setGeste] = useState<Geste | null>(null);
  const [curseur, setCurseur] = useState<Point | null>(null);
  const [accroche, setAccroche] = useState<studio2d.Accroche | null>(null);
  const [vue, setVue] = useState<Vue2D>(VUE_INITIALE);
  const [taille, setTaille] = useState({ l: 800, h: 500, mesuree: false });
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState<{ etat: "repos" | "envoi" | "erreur" | "conflit"; requestId?: string; texte?: string }>({ etat: "repos" });
  const zone = useRef<HTMLDivElement>(null);
  const doc = hist.present;
  const modifie = doc !== enregistre.contenu;

  // Taille de la zone de dessin (la vue en dépend ; le document jamais).
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const mesurer = () => setTaille({ l: Math.max(200, el.clientWidth), h: Math.max(200, el.clientHeight), mesuree: true });
    mesurer();
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const cadre = useRef(false);
  useEffect(() => {
    if (cadre.current || !taille.mesuree) return;
    cadre.current = true;
    if (doc.primitives.length) setVue(cadrer(studio2d.emprise(doc), taille.l, taille.h));
  }, [taille, doc]);

  // Quitter la page avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!modifie) return;
    const avertir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);

  const executer = useCallback(
    (r: studio2d.Resultat): boolean => {
      if (!r.ok) {
        setMessage(r.erreur);
        return false;
      }
      setMessage(null);
      setHist((h) => studio2d.appliquer(h, r.contenu));
      return true;
    },
    [],
  );

  const enregistrer = useCallback(async () => {
    if (lectureSeule || envoi.etat === "envoi" || envoi.etat === "conflit") return;
    if (!modifie && envoi.etat !== "erreur") return;
    // Un nouvel essai après une erreur réseau rejoue la même requête : le serveur ne crée jamais deux révisions.
    const requestId = envoi.etat === "erreur" && envoi.requestId ? envoi.requestId : nouvelId("req");
    const contenu = doc;
    setEnvoi({ etat: "envoi", requestId });
    try {
      const r = await api.enregistrerRevisionStudio(projectId, etudeId, variantId, { requestId, baseRevisionId: enregistre.revision?.id ?? null, contenu });
      setEnregistre({ contenu, revision: r });
      setEnvoi({ etat: "repos" });
      client.setQueryData(["studio-revision", projectId, etudeId, variantId, r.id], r);
      void client.invalidateQueries({ queryKey: ["studio-revisions", projectId, etudeId, variantId] });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.code === "conflit_revision") setEnvoi({ etat: "conflit", texte: e.serverMessage ?? undefined });
      else if (e instanceof ApiError && e.status >= 400 && e.status < 500) setEnvoi({ etat: "repos", texte: e.serverMessage ?? "Enregistrement refusé." });
      else setEnvoi({ etat: "erreur", requestId, texte: "L’enregistrement n’a pas abouti ; rien n’est perdu localement." });
    }
  }, [lectureSeule, envoi, modifie, doc, projectId, etudeId, variantId, enregistre.revision, client]);

  const supprimerSelection = useCallback(() => {
    if (selection.length && executer(studio2d.supprimer(doc, selection))) setSelection([]);
  }, [selection, doc, executer]);

  const commande = useCallback(
    (id: IdCommande2D) => {
      if (id === "cadrer") return setVue(cadrer(studio2d.emprise(doc), taille.l, taille.h));
      if (lectureSeule) return;
      if (id === "annuler") return setHist(studio2d.annuler);
      if (id === "retablir") return setHist(studio2d.retablir);
      if (id === "supprimer") return supprimerSelection();
      if (id === "enregistrer") return void enregistrer();
    },
    [doc, taille, lectureSeule, supprimerSelection, enregistrer],
  );

  const choisirOutil = useCallback(
    (id: IdOutil2D) => {
      if (lectureSeule && id !== "selection") return;
      setOutil(id);
      setGeste(null);
    },
    [lectureSeule],
  );

  // Raccourcis : jamais pendant une saisie dans un champ.
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const cibleSaisie = e.target instanceof HTMLElement && (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName) || e.target.isContentEditable);
      const c = combinaison(e);
      if (!c || cibleSaisie) return;
      if (c === "Échap") {
        setGeste(null);
        return;
      }
      const entree = entreeParRaccourci(c);
      if (!entree) return;
      e.preventDefault();
      if (entree.type === "outil") choisirOutil(entree.id);
      else commande(entree.id);
    };
    window.addEventListener("keydown", touche);
    return () => window.removeEventListener("keydown", touche);
  }, [choisirOutil, commande]);

  const pointEcran = (e: { clientX: number; clientY: number }) => {
    const r = zone.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const viser = (s: { x: number; y: number }) => {
    const brut = versMonde(vue, taille.l, taille.h, s);
    const a = outil === "selection" ? null : studio2d.accrocher(doc, brut, TOLERANCE_PX / vue.echelle);
    return { point: a ? a.point : auMillimetre(brut), accroche: a };
  };

  /** Pose un point de l'outil courant (clic ou saisie numérique). */
  const poser = useCallback(
    (p: Point, a: studio2d.Accroche | null) => {
      if (lectureSeule) return;
      if (outil === "ligne") {
        if (!geste || geste.type !== "ligne") return setGeste({ type: "ligne", a: p });
        // Lignes enchaînées : la suivante part de la fin de celle-ci (Échap arrête).
        if (executer(studio2d.ajouterLigne(doc, { id: nouvelId("l"), calqueId: calqueActif, a: geste.a, b: p }))) setGeste({ type: "ligne", a: p });
        return;
      }
      if (outil === "cote") {
        if (!geste || geste.type !== "cote") return setGeste({ type: "cote", a: p, lienA: lienDe(a) });
        if (!geste.b) return setGeste({ ...geste, b: p, lienB: lienDe(a) });
        if (executer(studio2d.ajouterCote(doc, { id: nouvelId("c"), calqueId: calqueActif, a: geste.a, b: geste.b, decalage: decalageSigne(geste.a, geste.b, p), liens: { a: geste.lienA, b: geste.lienB ?? null } }))) setGeste(null);
      }
    },
    [lectureSeule, outil, geste, doc, calqueActif, executer],
  );

  const toucher = (s: { x: number; y: number }, ajouter: boolean) => {
    const visibles = new Set(doc.calques.filter((c) => c.visible).map((c) => c.id));
    const p = versMonde(vue, taille.l, taille.h, s);
    let meilleure: { id: string; d: number } | null = null;
    for (const x of doc.primitives) {
      if (!visibles.has(x.calqueId)) continue;
      const [a, b] = x.type === "cote" ? lignesCote(x).trait : [x.a, x.b];
      const d = studio2d.distanceSegment(p, a, b) * vue.echelle;
      if (d <= TOLERANCE_PX && (!meilleure || d < meilleure.d)) meilleure = { id: x.id, d };
    }
    if (!meilleure) return false;
    const id = meilleure.id;
    setSelection((sel) => (ajouter ? (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]) : [id]));
    return true;
  };

  const surAppui = (e: PointerEventReact<SVGSVGElement>) => {
    const s = pointEcran(e);
    if (e.button === 1 || (e.button === 0 && outil === "selection" && !toucher(s, e.shiftKey))) {
      if (e.button === 0 && !e.shiftKey) setSelection([]);
      setGeste({ type: "pan", x: s.x, y: s.y });
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    if (e.button !== 0 || outil === "selection") return;
    const v = viser(s);
    poser(v.point, v.accroche);
  };
  const surMouvement = (e: PointerEventReact<SVGSVGElement>) => {
    const s = pointEcran(e);
    if (geste?.type === "pan") {
      setVue((v) => deplacerVue(v, s.x - geste.x, s.y - geste.y));
      setGeste({ type: "pan", x: s.x, y: s.y });
      return;
    }
    const v = viser(s);
    setCurseur(v.point);
    setAccroche(v.accroche);
  };
  const surRelache = () => {
    if (geste?.type === "pan") setGeste(null);
  };
  const surMolette = (e: WheelEvent<SVGSVGElement>) => setVue((v) => zoomer(v, taille.l, taille.h, pointEcran(e), e.deltaY < 0 ? 1.15 : 1 / 1.15));

  const selectionnee = selection.length === 1 ? doc.primitives.find((p) => p.id === selection[0]) ?? null : null;
  const aResoudre = doc.primitives.filter((p) => p.type === "cote" && p.aResoudre).length;
  const etat = historique
    ? `Révision n° ${source?.numero} — lecture seule`
    : envoi.etat === "envoi"
      ? "Enregistrement…"
      : modifie
        ? "Modifications non enregistrées"
        : enregistre.revision
          ? `Enregistré — révision n° ${enregistre.revision.numero}`
          : "Aucune révision enregistrée";

  return (
    <div className="studio-2d" data-studio-2d data-studio-2d-lecture={lectureSeule ? "oui" : "non"}>
      {historique && (
        <p className="studio-2d-bandeau" role="status" data-studio-2d-historique>
          {`Révision n° ${source?.numero} (lecture seule).`} <Link to={cheminVarianteStudio(projectId, etudeId, variantId, "dessin", "2d")}>Revenir à la dernière révision</Link>
        </p>
      )}
      {!historique && !peutEcrire && <p className="studio-2d-bandeau" role="status" data-studio-2d-lecteur>Ce projet vous est partagé en lecture : le dessin se consulte sans être modifié.</p>}
      {envoi.etat === "conflit" && (
        <div className="studio-2d-bandeau" role="alert" data-studio-2d-conflit>
          <p>{envoi.texte ?? "Une révision plus récente existe : rien n’a été enregistré."}</p>
          <button type="button" onClick={() => void rechargerTete()}>Charger la dernière révision (vos modifications locales seront abandonnées)</button>
        </div>
      )}
      <div className="studio-2d-barres">
        <Barre titre="Outils" entrees={OUTILS_2D} actif={outil} desactive={(x) => lectureSeule && x.ecrit} surChoix={(id) => choisirOutil(id as IdOutil2D)} />
        <Barre
          titre="Édition"
          entrees={COMMANDES_2D.filter((x) => x.barre === "edition")}
          desactive={(x) => lectureSeule || (x.id === "annuler" && !hist.passe.length) || (x.id === "retablir" && !hist.futur.length) || (x.id === "supprimer" && !selection.length) || (x.id === "enregistrer" && (!modifie && envoi.etat !== "erreur"))}
          surChoix={(id) => commande(id as IdCommande2D)}
        />
        <Barre titre="Vue" entrees={COMMANDES_2D.filter((x) => x.barre === "vue")} surChoix={(id) => commande(id as IdCommande2D)} />
        <span className="studio-2d-etat" role="status" data-studio-2d-etat={modifie ? "modifie" : "enregistre"}>{etat}</span>
      </div>
      {(message || envoi.texte) && envoi.etat !== "conflit" && (
        <p className="form-error" role="alert" data-studio-2d-message>
          {message ?? envoi.texte}
          {envoi.etat === "erreur" && <> <button type="button" className="link-button" onClick={() => void enregistrer()}>Réessayer</button></>}
        </p>
      )}
      <div className="studio-2d-corps">
        <div className="studio-2d-zone" ref={zone}>
          <svg
            width={taille.l}
            height={taille.h}
            role="img"
            aria-label="Dessin de la variante"
            data-studio-2d-svg
            data-outil={outil}
            onPointerDown={surAppui}
            onPointerMove={surMouvement}
            onPointerUp={surRelache}
            onPointerLeave={() => setCurseur(null)}
            onWheel={surMolette}
            onContextMenu={(e) => e.preventDefault()}
          >
            <Grille vue={vue} l={taille.l} h={taille.h} />
            <Dessin doc={doc} vue={vue} l={taille.l} h={taille.h} selection={selection} />
            <Apercu geste={geste} curseur={curseur} accroche={accroche} vue={vue} l={taille.l} h={taille.h} />
          </svg>
          <p className="studio-2d-coordonnees" aria-live="off" data-studio-2d-curseur>
            {curseur ? `x ${metres(curseur.x)} · y ${metres(curseur.y)}${accroche ? (accroche.type === "extremite" ? " · extrémité" : " · milieu") : ""}` : "Unité : mètre"}
          </p>
        </div>
        <aside className="studio-2d-panneaux">
          {!lectureSeule && (outil === "ligne" || outil === "cote") && <SaisiePoint outil={outil} geste={geste} surPoint={(p) => poser(p, null)} />}
          {selectionnee && <Inspecteur primitive={selectionnee} lectureSeule={lectureSeule} surLigne={(id, pts) => executer(studio2d.modifierLigne(doc, id, pts))} surDecalage={(id, d) => executer(studio2d.modifierDecalage(doc, id, d))} />}
          {aResoudre > 0 && <p className="studio-2d-alerte" data-studio-2d-a-resoudre={aResoudre}>{aResoudre === 1 ? "1 cote à résoudre : sa ligne a été supprimée." : `${aResoudre} cotes à résoudre : leur ligne a été supprimée.`}</p>}
          <Calques doc={doc} actif={calqueActif} lectureSeule={lectureSeule} surActif={setCalqueActif} executer={executer} />
          <Revisions revisions={revisions} tete={tete} courante={historique ? source : enregistre.revision} projectId={projectId} etudeId={etudeId} variantId={variantId} />
        </aside>
      </div>
    </div>
  );
}

function Barre({ titre, entrees, actif, desactive, surChoix }: { titre: string; entrees: readonly Entree2D<string>[]; actif?: string; desactive?: (x: Entree2D<string>) => boolean; surChoix: (id: string) => void }) {
  return (
    <div className="studio-2d-barre" role="toolbar" aria-label={titre}>
      {entrees.map((x) => (
        <button
          key={x.id}
          type="button"
          className="studio-2d-bouton"
          aria-pressed={actif === undefined ? undefined : actif === x.id}
          disabled={desactive?.(x) ?? false}
          title={`${x.libelle} — ${x.raccourci}`}
          data-studio-2d-entree={x.id}
          onClick={() => surChoix(x.id)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={x.icone} />
          </svg>
          <span>{x.libelle}</span>
        </button>
      ))}
    </div>
  );
}

function Grille({ vue, l, h }: { vue: Vue2D; l: number; h: number }) {
  // Pas de grille de 1 m, 10 m ou 100 m selon le zoom : repère visuel seulement, jamais une contrainte de saisie.
  const pas = vue.echelle >= 20 ? 1 : vue.echelle >= 2 ? 10 : 100;
  const min = versMonde(vue, l, h, { x: 0, y: h });
  const max = versMonde(vue, l, h, { x: l, y: 0 });
  const traits: ReactElement[] = [];
  for (let x = Math.ceil(min.x / pas) * pas; x <= max.x && traits.length < 400; x += pas) {
    const sx = versEcran(vue, l, h, { x, y: 0 }).x;
    traits.push(<line key={`x${x}`} x1={sx} y1={0} x2={sx} y2={h} className={x === 0 ? "studio-2d-axe" : "studio-2d-grille"} />);
  }
  for (let y = Math.ceil(min.y / pas) * pas; y <= max.y && traits.length < 800; y += pas) {
    const sy = versEcran(vue, l, h, { x: 0, y }).y;
    traits.push(<line key={`y${y}`} x1={0} y1={sy} x2={l} y2={sy} className={y === 0 ? "studio-2d-axe" : "studio-2d-grille"} />);
  }
  return <g aria-hidden="true">{traits}</g>;
}

/** Géométrie affichée d'une cote : traits d'attache, ligne de cote décalée, position du texte. */
function lignesCote(c: studio2d.Cote) {
  const l = studio2d.distance(c.a, c.b);
  const n = { x: -(c.b.y - c.a.y) / l, y: (c.b.x - c.a.x) / l };
  const a2 = { x: c.a.x + n.x * c.decalage, y: c.a.y + n.y * c.decalage };
  const b2 = { x: c.b.x + n.x * c.decalage, y: c.b.y + n.y * c.decalage };
  return { trait: [a2, b2] as const, attaches: [[c.a, a2], [c.b, b2]] as const, texte: studio2d.milieu(a2, b2), valeur: l };
}

function Dessin({ doc, vue, l, h, selection }: { doc: Doc; vue: Vue2D; l: number; h: number; selection: string[] }) {
  const e = (p: Point) => versEcran(vue, l, h, p);
  const visibles = new Set(doc.calques.filter((c) => c.visible).map((c) => c.id));
  return (
    <g>
      {doc.primitives
        .filter((p) => visibles.has(p.calqueId))
        .map((p) => {
          const choisie = selection.includes(p.id);
          if (p.type === "ligne") {
            const [a, b] = [e(p.a), e(p.b)];
            return <line key={p.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={choisie ? "studio-2d-ligne studio-2d-choisie" : "studio-2d-ligne"} data-primitive={p.id} data-type="ligne" />;
          }
          const g = lignesCote(p);
          const [a, b] = [e(g.trait[0]), e(g.trait[1])];
          const t = e(g.texte);
          return (
            <g key={p.id} className={`studio-2d-cote${choisie ? " studio-2d-choisie" : ""}${p.aResoudre ? " studio-2d-cote-a-resoudre" : ""}`} data-primitive={p.id} data-type="cote" data-valeur={g.valeur.toFixed(3)}>
              {g.attaches.map(([x, y], i) => {
                const [s1, s2] = [e(x), e(y)];
                return <line key={i} x1={s1.x} y1={s1.y} x2={s2.x} y2={s2.y} className="studio-2d-attache" />;
              })}
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
              <circle cx={a.x} cy={a.y} r={2.5} />
              <circle cx={b.x} cy={b.y} r={2.5} />
              <text x={t.x} y={t.y - 6} textAnchor="middle">{metres(g.valeur)}</text>
            </g>
          );
        })}
    </g>
  );
}

function Apercu({ geste, curseur, accroche, vue, l, h }: { geste: Geste | null; curseur: Point | null; accroche: studio2d.Accroche | null; vue: Vue2D; l: number; h: number }) {
  if (!curseur) return null;
  const e = (p: Point) => versEcran(vue, l, h, p);
  const c = e(curseur);
  return (
    <g className="studio-2d-apercu" aria-hidden="true">
      {geste?.type === "ligne" && <line x1={e(geste.a).x} y1={e(geste.a).y} x2={c.x} y2={c.y} />}
      {geste?.type === "cote" && <line x1={e(geste.a).x} y1={e(geste.a).y} x2={e(geste.b ?? curseur).x} y2={e(geste.b ?? curseur).y} />}
      {accroche && <rect x={c.x - 5} y={c.y - 5} width={10} height={10} className={accroche.type === "extremite" ? "studio-2d-accroche" : "studio-2d-accroche-milieu"} />}
    </g>
  );
}

function SaisiePoint({ outil, geste, surPoint }: { outil: "ligne" | "cote"; geste: Geste | null; surPoint: (p: Point) => void }) {
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const etape = outil === "ligne" ? (geste?.type === "ligne" ? "Point suivant" : "Premier point") : geste?.type === "cote" ? (geste.b ? "Position de la cote" : "Second point") : "Premier point";
  function valider(e: FormEvent) {
    e.preventDefault();
    const p = { x: Number(x.replace(",", ".")), y: Number(y.replace(",", ".")) };
    if (x.trim() === "" || y.trim() === "" || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    surPoint(p);
  }
  return (
    <form className="panel studio-2d-saisie" onSubmit={valider} data-studio-2d-saisie>
      <h3>Saisie numérique</h3>
      <p className="panel-sub">{etape}</p>
      <label htmlFor="studio-2d-x">X (m)</label>
      <input id="studio-2d-x" inputMode="decimal" value={x} onChange={(e) => setX(e.target.value)} />
      <label htmlFor="studio-2d-y">Y (m)</label>
      <input id="studio-2d-y" inputMode="decimal" value={y} onChange={(e) => setY(e.target.value)} />
      <button type="submit">Placer le point</button>
    </form>
  );
}

function Inspecteur({ primitive, lectureSeule, surLigne, surDecalage }: { primitive: studio2d.Primitive; lectureSeule: boolean; surLigne: (id: string, p: { a: Point; b: Point }) => boolean; surDecalage: (id: string, d: number) => boolean }) {
  const valeurs = useMemo(() => (primitive.type === "ligne" ? [primitive.a.x, primitive.a.y, primitive.b.x, primitive.b.y] : [primitive.decalage]).map(String), [primitive]);
  const [champs, setChamps] = useState(valeurs);
  useEffect(() => setChamps(valeurs), [valeurs]);
  const nombres = champs.map((v) => Number(v.replace(",", ".")));
  function appliquer(e: FormEvent) {
    e.preventDefault();
    if (nombres.some((n) => !Number.isFinite(n))) return;
    if (primitive.type === "ligne") surLigne(primitive.id, { a: { x: nombres[0]!, y: nombres[1]! }, b: { x: nombres[2]!, y: nombres[3]! } });
    else surDecalage(primitive.id, nombres[0]!);
  }
  const libelles = primitive.type === "ligne" ? ["A · X (m)", "A · Y (m)", "B · X (m)", "B · Y (m)"] : ["Décalage (m)"];
  return (
    <form className="panel studio-2d-inspecteur" onSubmit={appliquer} data-studio-2d-inspecteur={primitive.type}>
      <h3>{primitive.type === "ligne" ? "Ligne" : "Cote"}</h3>
      <p className="panel-sub" data-studio-2d-mesure>
        {primitive.type === "ligne" ? `Longueur : ${metres(studio2d.distance(primitive.a, primitive.b))}` : `Valeur : ${metres(studio2d.distance(primitive.a, primitive.b))}`}
      </p>
      {primitive.type === "cote" && <p className="panel-sub">{primitive.aResoudre ? "À résoudre : une ligne cotée a été supprimée." : primitive.liens.a || primitive.liens.b ? "Associée : suit la ligne cotée." : "Libre."}</p>}
      {libelles.map((libelle, i) => (
        <span key={libelle}>
          <label htmlFor={`studio-2d-champ-${i}`}>{libelle}</label>
          <input id={`studio-2d-champ-${i}`} inputMode="decimal" disabled={lectureSeule} value={champs[i] ?? ""} onChange={(e) => setChamps((c) => c.map((v, j) => (j === i ? e.target.value : v)))} />
        </span>
      ))}
      {!lectureSeule && <button type="submit">Appliquer</button>}
    </form>
  );
}

function Calques({ doc, actif, lectureSeule, surActif, executer }: { doc: Doc; actif: string; lectureSeule: boolean; surActif: (id: string) => void; executer: (r: studio2d.Resultat) => boolean }) {
  const [nom, setNom] = useState("");
  function ajouter(e: FormEvent) {
    e.preventDefault();
    const id = nouvelId("calque");
    if (executer(studio2d.ajouterCalque(doc, { id, nom }))) {
      setNom("");
      surActif(id);
    }
  }
  return (
    <section className="panel studio-2d-calques" aria-labelledby="studio-2d-calques" data-studio-2d-calques>
      <h3 id="studio-2d-calques">Calques</h3>
      <ul>
        {doc.calques.map((c) => (
          <li key={c.id} data-calque={c.id}>
            <label>
              <input type="radio" name="studio-2d-calque-actif" checked={actif === c.id} disabled={lectureSeule} onChange={() => surActif(c.id)} />
              <span translate="no">{c.nom}</span>
            </label>
            <label>
              <input type="checkbox" checked={c.visible} onChange={() => executer(studio2d.reglerCalque(doc, c.id, { visible: !c.visible }))} disabled={lectureSeule} /> Visible
            </label>
            <label>
              <input type="checkbox" checked={c.verrouille} onChange={() => executer(studio2d.reglerCalque(doc, c.id, { verrouille: !c.verrouille }))} disabled={lectureSeule} /> Verrouillé
            </label>
          </li>
        ))}
      </ul>
      {!lectureSeule && (
        <form onSubmit={ajouter} className="studio-2d-calque-nouveau">
          <label htmlFor="studio-2d-calque-nom">Nouveau calque</label>
          <input id="studio-2d-calque-nom" maxLength={studio2d.LIMITES_DOCUMENT2D.nom} value={nom} onChange={(e) => setNom(e.target.value)} />
          <button type="submit" disabled={!nom.trim()}>Ajouter le calque</button>
        </form>
      )}
    </section>
  );
}

function Revisions({ revisions, tete, courante, projectId, etudeId, variantId }: { revisions: RevisionStudio[]; tete: RevisionStudio | null; courante: RevisionStudio | null; projectId: string; etudeId: string; variantId: string }) {
  return (
    <section className="panel studio-2d-revisions" aria-labelledby="studio-2d-revisions" data-studio-2d-revisions>
      <h3 id="studio-2d-revisions">Révisions</h3>
      {revisions.length === 0 ? (
        <p className="panel-sub">Aucune révision : le premier enregistrement crée la révision n° 1.</p>
      ) : (
        <ol reversed>
          {[...revisions].reverse().map((r) => (
            <li key={r.id} data-revision={r.numero}>
              <Link to={r.id === tete?.id ? cheminVarianteStudio(projectId, etudeId, variantId, "dessin", "2d") : cheminVarianteStudio(projectId, etudeId, variantId, "dessin", "2d", r.id)} aria-current={r.id === courante?.id ? "true" : undefined}>
                {`Révision n° ${r.numero}`}
              </Link>{" "}
              <small translate="no">{new Date(r.createdAt).toLocaleString(LOCALE)}</small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
