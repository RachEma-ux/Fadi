import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { applyStudioCommands, STUDIO_TOOLS, type StudioCommand, type StudioDocument, type StudioEnvelope, type StudioShape } from "@parcours/atelier-model";
import { api, ApiError, type StudioContext } from "../../lib/api";
import { LANGUE } from "../../lib/i18n";
import "./studio.css";
const warning = () => LANGUE === "en" ? "Unsaved or unconfirmed changes. Leave this study?" : "Modifications non enregistrées ou non confirmées. Quitter cette étude ?";
const route = (p: string, s: string, v: string) => `/studio/projets/${encodeURIComponent(p)}/etudes/${encodeURIComponent(s)}/variantes/${encodeURIComponent(v)}`;
export function StudioPage() { const params = useParams(); return <Workspace key={`${params.projectId}/${params.studyId}/${params.variantId}`} {...params} />; }
function Workspace({ projectId, studyId, variantId }: { projectId?: string; studyId?: string; variantId?: string }) {
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.listProjects });
  const studies = useQuery({ queryKey: ["studio-studies", projectId], queryFn: () => api.studioStudies(projectId!), enabled: !!projectId && !variantId, retry: false });
  const [context, setContext] = useState<StudioContext | null>(null);
  const [drawing, setDrawing] = useState<StudioDocument | null>(null);
  const [commands, setCommands] = useState<StudioCommand[]>([]);
  const [tool, setTool] = useState("studio.dessin.selection");
  const [selection, setSelection] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!variantId);
  const [values, setValues] = useState({ x: 0, y: 0, a: 4, b: 3, dx: 1, dy: 0 });
  const envelope = useRef<StudioEnvelope | null>(null);
  const alive = useRef(true), dirty = useRef(false), saving = useRef(false), creatingNow = useRef(false);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const sheet = useRef<SVGSVGElement>(null), shell = useRef<HTMLElement>(null);
  dirty.current = commands.length > 0 || !!anchor || pending || uncertain;
  const writable = !!context?.canWrite && !pending && !uncertain && !blocked;
  useEffect(() => {
    alive.current = true;
    let active = true;
    if (projectId && studyId && variantId) void api.studioContext(projectId, studyId, variantId).then(c => { if (active) { setContext(c); setDrawing(c.revision.document); } }).catch(() => { if (active) setError("Étude indisponible ou accès refusé."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; alive.current = false; };
  }, [projectId, studyId, variantId]);
  useEffect(() => {
    const unload = (e: BeforeUnloadEvent) => { if (dirty.current) { e.preventDefault(); e.returnValue = ""; } };
    const click = (e: globalThis.MouseEvent) => { const link = (e.target as Element).closest?.("a[href]"); if (dirty.current && link && !link.getAttribute("href")?.startsWith("#") && !window.confirm(warning())) { e.preventDefault(); e.stopPropagation(); } };
    let currentIndex = Number(history.state?.idx ?? 0), restoring = false;
    const back = (e: PopStateEvent) => {
      const target = Number(e.state?.idx ?? currentIndex);
      if (restoring) { restoring = false; e.stopImmediatePropagation(); return; }
      if (dirty.current && !window.confirm(warning())) { e.stopImmediatePropagation(); restoring = true; history.go(currentIndex - target || 1); }
      else currentIndex = target;
    };
    const keys = (e: KeyboardEvent) => {
      if ((e.target as Element).closest("input,textarea,select,[contenteditable=true]") || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Escape") { setAnchor(null); setTool("studio.dessin.selection"); }
      const t = STUDIO_TOOLS.find(t => (t.raccourci === "Space" ? " " : t.raccourci).toLowerCase() === e.key.toLowerCase());
      if (t) { e.preventDefault(); setTool(t.toolId); setAnchor(null); }
    };
    window.addEventListener("popstate", back, true); window.addEventListener("beforeunload", unload); document.addEventListener("click", click, true); window.addEventListener("keydown", keys);
    return () => { window.removeEventListener("popstate", back, true); window.removeEventListener("beforeunload", unload); document.removeEventListener("click", click, true); window.removeEventListener("keydown", keys); };
  }, []);
  function apply(c: StudioCommand) {
    if (!drawing || !writable) return;
    try { setDrawing(applyStudioCommands(drawing, [c])); setCommands(cs => [...cs, c]); setSaved(false); setError(""); }
    catch { setError("Géométrie invalide. Vérifiez les valeurs saisies."); }
  }
  function add(start: { x: number; y: number }, end: { x: number; y: number }) {
    const shape: StudioShape = tool === "studio.dessin.rectangle" ? { id: crypto.randomUUID(), type: "rectangle", origin: { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y) }, width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) } : { id: crypto.randomUUID(), type: "line", start, end };
    if (shape.type === "line") apply({ toolId: "studio.dessin.ligne", params: shape }); else apply({ toolId: "studio.dessin.rectangle", params: shape });
  }
  function draw(e: MouseEvent<SVGSVGElement>) {
    if (!writable || !["studio.dessin.ligne", "studio.dessin.rectangle"].includes(tool)) return;
    const matrix = sheet.current?.getScreenCTM(); if (!matrix) return;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    const p = { x: Math.round(pt.x * 100) / 100, y: Math.round(pt.y * 100) / 100 };
    if (!anchor) setAnchor(p); else { add(anchor, p); setAnchor(null); }
  }
  const selected = drawing?.objects.find(o => o.id === selection);
  function select(o: StudioShape) { setSelection(o.id); setValues(v => ({ ...v, x: o.type === "line" ? o.start.x : o.origin.x, y: o.type === "line" ? o.start.y : o.origin.y, a: o.type === "line" ? o.end.x : o.width, b: o.type === "line" ? o.end.y : o.height })); }
  function numeric(e: FormEvent) {
    e.preventDefault();
    if (tool === "studio.dessin.deplacer" && selected) { apply({ toolId: "studio.dessin.deplacer", params: { id: selected.id, dx: values.dx, dy: values.dy } }); return; }
    if (tool === "studio.dessin.modifier" && selected) { apply({ toolId: "studio.dessin.modifier", params: selected.type === "line" ? { ...selected, start: { x: values.x, y: values.y }, end: { x: values.a, y: values.b } } : { ...selected, origin: { x: values.x, y: values.y }, width: values.a, height: values.b } }); return; }
    add({ x: values.x, y: values.y }, tool === "studio.dessin.rectangle" ? { x: values.x + values.a, y: values.y + values.b } : { x: values.a, y: values.b });
  }
  async function save() {
    if (!context || !projectId || !studyId || !variantId || saving.current) return;
    saving.current = true;
    envelope.current ??= { contractVersion: "studio-commands/1", requestId: crypto.randomUUID(), baseRevisionId: context.revision.id, commands: [...commands] };
    setPending(true); setError("");
    try { const c = await api.studioCommands(projectId, studyId, variantId, envelope.current); if (!alive.current) return; setContext(c); setDrawing(c.revision.document); setCommands([]); setUncertain(false); envelope.current = null; setSaved(true); }
    catch (e) { if (!alive.current) return; if (e instanceof ApiError && e.status < 500 && e.status !== 408) { setBlocked(e.status === 409 || e.status === 403 || e.status === 401); setUncertain(false); envelope.current = null; setError(e.status === 409 ? "Conflit de révision. Le brouillon est conservé." : "Enregistrement refusé. Le brouillon reste non enregistré."); } else { setUncertain(true); setError("Confirmation serveur indisponible. Réessayez la même sauvegarde avant de continuer."); } }
    finally { saving.current = false; if (alive.current) setPending(false); }
  }
  async function create(e: FormEvent) { e.preventDefault(); if (!projectId || !name.trim() || creatingNow.current) return; creatingNow.current = true; setCreating(true); setError(""); try { const c = await api.createStudioStudy(projectId, name.trim()); if (alive.current) navigate(route(projectId, c.study.id, c.variant.id)); } catch { if (alive.current) setError("Création non confirmée. Actualisez la liste avant de réessayer."); } finally { creatingNow.current = false; if (alive.current) { setCreating(false); void studies.refetch(); } } }
  return <section className="studio-workspace" ref={shell} aria-label="Studio">
    <header className="studio-heading"><div><p className="studio-eyebrow">FADI / STUDIO</p><h1>{context ? <span translate="no">{context.study.name}</span> : "Votre espace de dessin"}</h1><p>Dessin 2D · Repère local · Mètres</p></div><span className="studio-badge">Planche 2D</span></header>
    {error && <div className="studio-alert" role="alert">{error}{blocked && <button onClick={() => { if (window.confirm(warning())) window.location.reload(); }}>Recharger la version serveur</button>}</div>}
    {!projectId && <div className="studio-welcome"><h2>Choisir un projet</h2><p>Ouvrez une étude ou créez une nouvelle planche indépendante du Parcours.</p>{projects.isPending && <p role="status">Chargement des projets…</p>}{projects.isError && <button onClick={() => void projects.refetch()}>Réessayer</button>}<div className="studio-projects">{projects.data?.map(p => <Link key={p.id} to={`/studio/projets/${encodeURIComponent(p.id)}`}><span className="studio-project-icon" aria-hidden="true">▱</span><strong translate="no">{p.name}</strong><span translate="no">{p.code}</span><span>Ouvrir les études →</span></Link>)}</div>{projects.data?.length === 0 && <p>Aucun projet disponible. Créez un projet dans Projets.</p>}</div>}
    {projectId && !variantId && <div className="studio-welcome"><Link to="/studio">← Choisir un autre projet</Link><h2>Études du projet</h2>{studies.isPending && <p role="status">Chargement des études…</p>}{studies.isError && <><p role="alert">Études indisponibles ou accès refusé.</p><button onClick={() => void studies.refetch()}>Réessayer</button></>}<div className="studio-projects">{studies.data?.studies.map(s => <Link key={s.id} to={route(projectId, s.id, s.initialVariantId)}><strong translate="no">{s.name}</strong><span>Ouvrir la planche →</span></Link>)}</div><form className="studio-create" onSubmit={e => void create(e)}><h3>Nouvelle étude</h3><label>Nom de l’étude<input required maxLength={160} value={name} onChange={e => setName(e.target.value)} /></label><button disabled={creating || !name.trim() || studies.isError}>Créer l’étude et sa variante initiale</button><p>Une action explicite crée une étude vide et sa première variante.</p></form></div>}
    {loading && <p role="status">Chargement de la planche…</p>}
    {context && drawing && <><div className="studio-context"><Link to={`/studio/projets/${encodeURIComponent(projectId!)}`}>Études</Link><span translate="no">{context.variant.name}</span><span>Révision <span translate="no">{context.revision.id.slice(0, 8)}</span></span><span role="status">{pending ? "Sauvegarde en cours…" : uncertain ? "Sauvegarde non confirmée" : commands.length ? "Brouillon non enregistré" : saved ? "Enregistré sur le serveur" : "Version serveur chargée"}</span></div>{!context.canWrite && <p role="status">Lecture seule</p>}
    <div className="studio-tools" role="toolbar" aria-label="Outils de dessin">{STUDIO_TOOLS.map(t => <button type="button" key={t.toolId} aria-pressed={tool === t.toolId} title={`${t.libelleFR} (${t.raccourci})`} onClick={() => { setTool(t.toolId); setAnchor(null); }}><ToolIcon id={t.iconeSymbolique} /><span>{t.libelleFR}</span><kbd>{t.raccourci}</kbd></button>)}<div className="studio-tools-spacer" /><button disabled={!context.canWrite || pending || (!uncertain && (!commands.length || blocked))} onClick={() => void save()}>{uncertain ? "Réessayer la sauvegarde" : "Enregistrer"}</button><button onClick={() => { if (!document.fullscreenElement) void shell.current?.requestFullscreen().catch(() => setError("Plein écran indisponible. La planche reste accessible.")); else void document.exitFullscreen(); }}>Plein écran / Quitter</button></div>
    <div className="studio-editor"><div className="studio-sheet"><div className="studio-sheet-caption"><span>Dessin et modélisation</span><span>1 unité = 1 m</span></div><svg ref={sheet} viewBox="-2 -2 24 18" role="group" aria-label="Planche de dessin 2D" onPointerMove={e => { if (!anchor) return; const m = sheet.current?.getScreenCTM(); if (m) { const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()); setHover({ x: p.x, y: p.y }); } }} onClick={draw}><defs><pattern id="studio-grid" width="1" height="1" patternUnits="userSpaceOnUse"><path d="M 1 0 L 0 0 0 1" fill="none" stroke="#dbe5eb" strokeWidth="0.025" /></pattern></defs><rect x="-2" y="-2" width="24" height="18" fill="url(#studio-grid)" />{drawing.objects.map(o => <g key={o.id} role="button" tabIndex={0} aria-label={`${o.type === "line" ? "Ligne" : "Rectangle"} ${o.id}`} aria-pressed={selection === o.id} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(o); } }} onClick={e => { if (!["studio.dessin.ligne", "studio.dessin.rectangle"].includes(tool)) { e.stopPropagation(); select(o); } }} className={selection === o.id ? "studio-shape selected" : "studio-shape"}>{o.type === "line" ? <line x1={o.start.x} y1={o.start.y} x2={o.end.x} y2={o.end.y} /> : <rect x={o.origin.x} y={o.origin.y} width={o.width} height={o.height} />}</g>)}{anchor && hover && (tool === "studio.dessin.rectangle" ? <rect x={Math.min(anchor.x, hover.x)} y={Math.min(anchor.y, hover.y)} width={Math.abs(hover.x-anchor.x)} height={Math.abs(hover.y-anchor.y)} fill="none" stroke="#c3722f" strokeWidth=".06" strokeDasharray=".2 .15" pointerEvents="none" /> : <line x1={anchor.x} y1={anchor.y} x2={hover.x} y2={hover.y} stroke="#c3722f" strokeWidth=".06" strokeDasharray=".2 .15" pointerEvents="none" />)}{anchor && <circle cx={anchor.x} cy={anchor.y} r="0.15" fill="#d58635" />}</svg><p className="studio-hint">{anchor ? "Premier point placé. Cliquez le second point. Échap pour annuler." : "Deux clics pour dessiner, ou utilisez les valeurs numériques."}</p>{anchor && <button onClick={() => setAnchor(null)}>Annuler le tracé</button>}</div>
    <aside className="studio-properties" aria-label="Propriétés du dessin"><h2>{STUDIO_TOOLS.find(t => t.toolId === tool)?.libelleFR}</h2><p>{drawing.objects.length} objets</p>{selected && <p>Objet sélectionné : <span translate="no">{selected.id.slice(0, 8)}</span></p>}{tool !== "studio.dessin.selection" && <form onSubmit={numeric}><fieldset disabled={!writable || (["studio.dessin.modifier", "studio.dessin.deplacer"].includes(tool) && !selected)}><legend>Valeurs en mètres</legend>{(tool === "studio.dessin.deplacer" ? ["dx", "dy"] as const : ["x", "y", "a", "b"] as const).map(k => <label key={k}>{({ x: "X", y: "Y", a: (selected?.type === "rectangle" || tool === "studio.dessin.rectangle") ? "Largeur" : "X final", b: (selected?.type === "rectangle" || tool === "studio.dessin.rectangle") ? "Hauteur" : "Y final", dx: "Déplacement X", dy: "Déplacement Y" })[k]}<input type="number" step="any" required value={values[k]} onChange={e => setValues(v => ({ ...v, [k]: e.target.valueAsNumber }))} /></label>)}<button type="submit">{tool === "studio.dessin.deplacer" ? "Déplacer la sélection" : tool === "studio.dessin.modifier" ? "Modifier la sélection" : "Ajouter au dessin"}</button></fieldset></form>}<div className="studio-note"><strong>Une planche autonome</strong><p>Les tracés restent en brouillon jusqu’à la confirmation du serveur. Aucun modèle 3D n’est nécessaire.</p></div></aside></div></>}
  </section>;
}
function ToolIcon({ id }: { id: string }) {
 const paths: Record<string, string> = { "studio-pointer": "M5 3 19 12 12 13 9 20Z", "studio-line": "M4 20 20 4M3 19h2v2H3ZM19 3h2v2h-2Z", "studio-rectangle": "M4 5h16v14H4Z", "studio-move": "M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4", "studio-edit": "M4 18 16 6l3 3L7 21H4ZM15 7l3 3M3 3h6M3 3v6" };
 return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={paths[id]} /></svg>;
}
