/**
 * Graphes visuels de génération contrôlée (P2-8 ; DA-19-03, DA-19-04) — panneau d'automatisation.
 *
 * Un graphe (intégré ou du projet) est **dessiné** : nœuds (paramètres, calculs, séries, règles, commandes) reliés par
 * les liens qui disent qui lit quoi. Ses paramètres saisis, « Proposer » le compile en script et le soumet à la même
 * boucle contrôlée que l'assistant (serveur) : la proposition (essais, hypothèses, aperçu) s'affiche dans le bloc de
 * l'assistant et n'écrit rien sans « Accepter et exécuter ». L'éditeur visuel compose un graphe nœud par nœud, le valide
 * à mesure par le même code que le serveur (`validerGraphe`, `compilerGraphe`), le dépose dans le projet par la
 * commande `graphe.definir` (définition versionnée avec le modèle, hors ligne comme en ligne).
 */
import { useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import {
  compilerGraphe,
  developperScript,
  ErreurScript,
  GRAPHES_INTEGRES,
  graphesDuProjet,
  LIBELLES_NOEUD,
  niveauxOrdonnes,
  ordonner,
  validerGraphe,
  type Commande,
  type GrapheGeneration,
  type ModeleAtelier,
  type NoeudGraphe,
  type TypeNoeud,
  type TypeParametre,
} from "@parcours/atelier-model";
import { api, type AtelierGraphe, type AtelierProposition } from "../../../../lib/api";
import { messageErreur } from "./Versions";

export type PropositionGraphe = AtelierProposition & { documentsARecalculer?: { kind: string; label: string }[]; graphe?: { id: string; nom: string; version: number } };

export interface PropsGraphes {
  projectId: string;
  etat: ModeleAtelier;
  niveauId: string | null;
  readOnly: boolean;
  /** Synchronisation avant une proposition (lots locaux envoyés) ; renvoie la révision du serveur. */
  synchroniser: () => Promise<number>;
  onProposition: (p: PropositionGraphe) => void;
  onCommandes: (commandes: Commande[], label: string) => void;
  onErreur: (message: string | null) => void;
}

const COL = 150;
const LIGNE = 54;
const LARGEUR = 132;
const HAUTEUR = 40;
const COULEURS: Record<TypeNoeud, string> = { parametre: "#e8f1fb", calcul: "#fbf4e4", serie: "#eef7ea", niveaux: "#eef7ea", regle: "#fde8e3", commande: "#ece8f7" };

function titreNoeud(n: NoeudGraphe): string {
  switch (n.type) {
    case "parametre":
      return `${n.nom} : ${n.typeParametre}`;
    case "calcul":
      return `${n.nom} = ${n.expression}`;
    case "serie":
      return `${n.variable} de ${n.de} à ${n.a}`;
    case "niveaux":
      return `${n.variable} : chaque niveau`;
    case "regle":
      return n.expression;
    case "commande":
      return n.commande.type;
  }
}

/** Positions dessinées : celles du graphe ; les nœuds sans position (tous à 0) sont rangés par rang topologique. */
function positions(g: Pick<GrapheGeneration, "noeuds" | "liens">): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const tousZero = g.noeuds.every((n) => !n.x && !n.y);
  if (!tousZero) {
    for (const n of g.noeuds) out.set(n.id, { x: n.x, y: n.y });
    return out;
  }
  let ordre: NoeudGraphe[];
  try {
    ordre = ordonner(g);
  } catch {
    ordre = g.noeuds;
  }
  const parents = new Map<string, string[]>();
  for (const l of g.liens) parents.set(l.a, [...(parents.get(l.a) ?? []), l.de]);
  const rang = new Map<string, number>();
  const parRang = new Map<number, number>();
  for (const n of ordre) {
    const r = Math.max(-1, ...(parents.get(n.id) ?? []).map((p) => rang.get(p) ?? 0)) + 1;
    rang.set(n.id, r);
    const k = parRang.get(r) ?? 0;
    parRang.set(r, k + 1);
    out.set(n.id, { x: r, y: k });
  }
  return out;
}

/** Dessin SVG du graphe : nœuds positionnés, liens en courbes ; sélection et déplacement optionnels. */
export function VueGraphe({ graphe, selection, onSelection, onDeplacer, erreurs }: { graphe: Pick<GrapheGeneration, "noeuds" | "liens">; selection?: string | null; onSelection?: (id: string) => void; onDeplacer?: (id: string, x: number, y: number) => void; erreurs?: Set<string> }) {
  const pos = useMemo(() => positions(graphe), [graphe]);
  const maxX = Math.max(0, ...[...pos.values()].map((p) => p.x));
  const maxY = Math.max(0, ...[...pos.values()].map((p) => p.y));
  const largeur = (maxX + 1) * COL + 20;
  const hauteur = (maxY + 1) * LIGNE + 20;
  const centre = (id: string) => {
    const p = pos.get(id) ?? { x: 0, y: 0 };
    return { x: 10 + p.x * COL, y: 10 + p.y * LIGNE };
  };
  const [glisse, setGlisse] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const coord = (e: ReactPointerEvent<SVGElement>) => {
    const svg = (e.currentTarget as SVGElement).ownerSVGElement ?? (e.currentTarget as unknown as SVGSVGElement);
    const r = svg.getBoundingClientRect();
    const echelle = svg.viewBox.baseVal.width ? svg.viewBox.baseVal.width / r.width : 1;
    return { x: (e.clientX - r.left) * echelle, y: (e.clientY - r.top) * echelle };
  };
  return (
    <svg className="graphe-vue" viewBox={`0 0 ${largeur} ${hauteur}`} role="group" aria-label={`Graphe : ${graphe.noeuds.length} nœud(s), ${graphe.liens.length} lien(s)`} style={{ aspectRatio: `${largeur} / ${hauteur}` }}
      onPointerMove={(e) => {
        if (!glisse || !onDeplacer) return;
        const c = coord(e);
        onDeplacer(glisse.id, Math.max(0, Math.round(((c.x - glisse.dx - 10) / COL) * 4) / 4), Math.max(0, Math.round(((c.y - glisse.dy - 10) / LIGNE) * 4) / 4));
      }}
      onPointerUp={() => setGlisse(null)}
      onPointerLeave={() => setGlisse(null)}>
      <defs>
        <marker id="graphe-fleche" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#5a6470" />
        </marker>
      </defs>
      {graphe.liens.map((l, i) => {
        const a = centre(l.de), b = centre(l.a);
        const x1 = a.x + LARGEUR, y1 = a.y + HAUTEUR / 2, x2 = b.x, y2 = b.y + HAUTEUR / 2;
        const dx = Math.max(30, Math.abs(x2 - x1) / 2);
        return <path key={i} className="graphe-lien" d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`} fill="none" stroke="#5a6470" strokeWidth={1.4} markerEnd="url(#graphe-fleche)" data-graphe-lien={`${l.de}>${l.a}`} />;
      })}
      {graphe.noeuds.map((n) => {
        const c = centre(n.id);
        const choisi = selection === n.id;
        return (
          <g key={n.id} className="graphe-noeud" data-graphe-noeud={n.id} data-type={n.type} transform={`translate(${c.x} ${c.y})`} tabIndex={onSelection ? 0 : -1} role={onSelection ? "button" : undefined}
            aria-label={`${LIBELLES_NOEUD[n.type]} ${titreNoeud(n)}`}
            onClick={() => onSelection?.(n.id)}
            onKeyDown={(e) => { if (onSelection && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelection(n.id); } }}
            onPointerDown={(e) => { if (!onDeplacer) return; const p = coord(e); setGlisse({ id: n.id, dx: p.x - c.x, dy: p.y - c.y }); (e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId); }}
            style={{ cursor: onDeplacer ? "grab" : onSelection ? "pointer" : "default" }}>
            <rect width={LARGEUR} height={HAUTEUR} rx={6} fill={COULEURS[n.type]} stroke={erreurs?.has(n.id) ? "#b4432b" : choisi ? "#1f2a37" : "#8a93a0"} strokeWidth={choisi || erreurs?.has(n.id) ? 2.2 : 1} />
            <text x={8} y={15} fontSize={10} fill="#5a6470">{LIBELLES_NOEUD[n.type]}</text>
            <text x={8} y={31} fontSize={11.5} fill="#1f2a37" fontWeight={600}>{titreNoeud(n).length > 22 ? `${titreNoeud(n).slice(0, 21)}…` : titreNoeud(n)}</text>
            <title>{titreNoeud(n)}</title>
          </g>
        );
      })}
    </svg>
  );
}

export function Graphes({ projectId, etat, niveauId, readOnly, synchroniser, onProposition, onCommandes, onErreur }: PropsGraphes) {
  // Graphes intégrés (bibliothèque du paquet) + graphes du projet lus dans le modèle local : à jour hors ligne comme après
  // un dépôt, sans attendre le serveur (la route GET /graphes sert les clients de l'API).
  const tous: AtelierGraphe[] = useMemo(() => [...GRAPHES_INTEGRES.map((g) => ({ ...g, origine: "integre" as const })), ...graphesDuProjet(etat).map((g) => ({ ...g, origine: "projet" as const }))], [etat.definitions]);
  const [grapheId, setGrapheId] = useState("trame-poteaux-controlee");
  const graphe = tous.find((g) => g.id === grapheId) ?? null;
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const script = useMemo(() => (graphe ? compilerGraphe(graphe) : null), [graphe]);
  const valeurDe = (p: { nom: string; type: TypeParametre; defaut?: number | string }) => valeurs[p.nom] ?? (p.type === "niveau" ? (niveauId ?? "") : p.defaut !== undefined ? String(p.defaut) : "");
  const parametres = () => Object.fromEntries((script?.parametres ?? []).map((p) => [p.nom, p.type === "chaine" || p.type === "niveau" ? valeurDe(p) : valeurDe(p) === "" ? undefined : Number(valeurDe(p).replace(",", "."))]));
  const noeudChoisi = graphe?.noeuds.find((n) => n.id === selection) ?? null;

  return (
    <div className="graphes" data-graphes>
      <h3>Graphes de génération contrôlée</h3>
      <p className="nav-detail">Paramètres → calculs → règles → séries → commandes, reliés par des liens qui disent qui lit quoi. Le graphe est compilé en script, ses règles contrôlées, puis la même boucle que l'assistant propose : rien n'est écrit sans votre accord.</p>
      {(
        <>
          <label className="auto-champ">
            Graphe
            <select value={grapheId} onChange={(e) => { setGrapheId(e.target.value); setValeurs({}); setSelection(null); }} data-graphe="choix">
              {tous.map((g) => (
                <option key={`${g.origine}-${g.id}`} value={g.id}>
                  {g.nom} · v{g.version}{g.origine === "projet" ? " (projet)" : ""}
                </option>
              ))}
            </select>
          </label>
          {graphe && script && (
            <form
              className="auto-script graphe-form"
              onSubmit={(e) => {
                e.preventDefault();
                onErreur(null);
                setOccupe(true);
                void (async () => {
                  try {
                    await synchroniser();
                    onProposition(await api.proposerAtelierGraphe(projectId, graphe.id, { parametres: parametres(), niveauId }));
                  } catch (err) {
                    onErreur(messageErreur(err));
                  } finally {
                    setOccupe(false);
                  }
                })();
              }}
            >
              <p className="nav-detail">{graphe.description}</p>
              <VueGraphe graphe={graphe} selection={selection} onSelection={(id) => setSelection(id === selection ? null : id)} />
              {noeudChoisi && (
                <p className="graphe-detail" data-graphe-detail={noeudChoisi.id}>
                  <strong>{LIBELLES_NOEUD[noeudChoisi.type]}</strong> · {titreNoeud(noeudChoisi)}
                  {noeudChoisi.type === "regle" && <> — {noeudChoisi.message}</>}
                  {noeudChoisi.type === "commande" && <> — <code>{JSON.stringify(noeudChoisi.commande.params).slice(0, 160)}</code></>}
                  {noeudChoisi.type === "parametre" && noeudChoisi.aide && <> — {noeudChoisi.aide}</>}
                </p>
              )}
              {script.parametres.map((p) => (
                <label key={p.nom} className="auto-champ" title={p.aide}>
                  {p.libelle}
                  {p.type === "niveau" ? (
                    <select value={valeurDe(p)} onChange={(e) => setValeurs({ ...valeurs, [p.nom]: e.target.value })} data-graphe-parametre={p.nom}>
                      {niveauxOrdonnes(etat).map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.nom}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input value={valeurDe(p)} inputMode={p.type === "chaine" ? "text" : "decimal"} onChange={(e) => setValeurs({ ...valeurs, [p.nom]: e.target.value })} data-graphe-parametre={p.nom} placeholder={p.aide ?? ""} />
                  )}
                </label>
              ))}
              <span className="ver-actions">
                <button type="submit" disabled={occupe || readOnly} data-graphe="proposer">Proposer (aperçu à blanc)</button>
              </span>
            </form>
          )}
          {!readOnly && <EditeurGraphe etat={etat} graphes={tous} onCommandes={onCommandes} onEnregistre={(id) => { setGrapheId(id); setValeurs({}); }} />}
        </>
      )}
    </div>
  );
}

// --- Éditeur visuel ----------------------------------------------------------------------------------------------

type Brouillon = { id: string; nom: string; description: string; noeuds: NoeudGraphe[]; liens: { de: string; a: string }[] };
const VIDE: Brouillon = { id: "", nom: "", description: "", noeuds: [], liens: [] };
const TYPES_PARAMETRE: [TypeParametre, string][] = [["nombre", "nombre"], ["entier", "entier"], ["longueur", "longueur (m)"], ["chaine", "texte"], ["niveau", "niveau"]];
const TYPES_NOEUD: TypeNoeud[] = ["parametre", "calcul", "serie", "niveaux", "regle", "commande"];

function nouveauNoeud(type: TypeNoeud, k: number, x: number): NoeudGraphe {
  const id = `${type}-${k}`;
  switch (type) {
    case "parametre":
      return { id, type, nom: `p${k}`, libelle: "", typeParametre: "nombre", x, y: k };
    case "calcul":
      return { id, type, nom: `c${k}`, expression: "", x, y: k };
    case "serie":
      return { id, type, variable: "i", de: 0, a: 1, x, y: k };
    case "niveaux":
      return { id, type, variable: "n", x, y: k };
    case "regle":
      return { id, type, expression: "", message: "", x, y: k };
    case "commande":
      return { id, type, commande: { type: "texte.creer", params: { niveauId: "$niveauId", position: { x: 0, y: 0, frame: "local", unit: "m" }, texte: "Repère {i}" } }, x, y: k };
  }
}

export function EditeurGraphe({ etat, graphes, onCommandes, onEnregistre }: { etat: ModeleAtelier; graphes: GrapheGeneration[]; onCommandes: (commandes: Commande[], label: string) => void; onEnregistre: (id: string) => void }) {
  const [b, setB] = useState<Brouillon>(VIDE);
  const [selection, setSelection] = useState<string | null>(null);
  const [lien, setLien] = useState<{ de: string; a: string }>({ de: "", a: "" });
  const [jsonCommande, setJsonCommande] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const niveaux = niveauxOrdonnes(etat);

  const verdict = useMemo(() => {
    try {
      const g = validerGraphe({ ...b, version: 1 });
      const script = compilerGraphe(g);
      const valeurs = Object.fromEntries(script.parametres.map((p) => [p.nom, p.defaut ?? (p.type === "niveau" ? niveaux[0]?.id : undefined)]));
      try {
        const n = developperScript(script, etat, valeurs).length;
        return { graphe: g, texte: `Graphe valide : ${g.noeuds.length} nœud(s), ${g.liens.length} lien(s) ; ${n} commande(s) avec les valeurs par défaut.`, erreur: false, noeud: null as string | null };
      } catch (err) {
        return { graphe: g, texte: `Graphe valide ; essai avec les valeurs par défaut impossible : ${err instanceof ErreurScript ? `${err.chemin} — ${err.message}` : String(err)}`, erreur: false, noeud: null as string | null };
      }
    } catch (err) {
      const chemin = err instanceof ErreurScript ? err.chemin : "";
      const noeud = /^noeuds\.([^.]+)/.exec(chemin)?.[1] ?? (/^noeuds\[(\d+)\]/.exec(chemin) ? b.noeuds[Number(/^noeuds\[(\d+)\]/.exec(chemin)![1])]?.id ?? null : null);
      return { graphe: null, texte: err instanceof ErreurScript ? `${err.chemin} : ${err.message}` : String(err), erreur: true, noeud };
    }
  }, [b, etat, niveaux]);

  const maj = (id: string, patch: Partial<NoeudGraphe>) => setB({ ...b, noeuds: b.noeuds.map((n) => (n.id === id ? ({ ...n, ...patch } as NoeudGraphe) : n)) });
  const retirer = (id: string) => { setB({ ...b, noeuds: b.noeuds.filter((n) => n.id !== id), liens: b.liens.filter((l) => l.de !== id && l.a !== id) }); if (selection === id) setSelection(null); };
  const ajouter = (type: TypeNoeud) => {
    const k = b.noeuds.length + 1;
    const x = type === "parametre" ? 0 : type === "calcul" ? 1 : type === "regle" || type === "serie" || type === "niveaux" ? 2 : 3;
    const n = nouveauNoeud(type, k, x);
    setB({ ...b, noeuds: [...b.noeuds, n] });
    setSelection(n.id);
  };
  const choisi = b.noeuds.find((n) => n.id === selection) ?? null;
  const nombreOuVide = (t: string) => (t.trim() === "" ? undefined : Number(t.replace(",", ".")));
  const borne = (t: string) => (/^-?\d+$/.test(t.trim()) ? Number(t) : t);

  return (
    <details className="graphe-editeur" data-editeur-graphe>
      <summary>Composer un graphe (éditeur visuel)</summary>
      <label className="auto-champ">
        Partir de
        <select defaultValue="" data-gediteur="depart" onChange={(e) => { const g = graphes.find((x) => x.id === e.target.value); setB(g ? { id: GRAPHES_INTEGRES.some((x) => x.id === g.id) ? `${g.id}-copie` : g.id, nom: g.nom, description: g.description, noeuds: g.noeuds.map((n) => ({ ...n })), liens: g.liens.map((l) => ({ ...l })) } : VIDE); setSelection(null); setMessage(null); }}>
          <option value="">un graphe vide</option>
          {graphes.map((g) => <option key={`${g.id}-${g.version}`} value={g.id}>{g.nom} · v{g.version}</option>)}
        </select>
      </label>
      <div className="editeur-identite">
        <label className="auto-champ">Identifiant<input value={b.id} onChange={(e) => setB({ ...b, id: e.target.value })} placeholder="mon-graphe" data-gediteur="id" /></label>
        <label className="auto-champ">Nom<input value={b.nom} onChange={(e) => setB({ ...b, nom: e.target.value })} data-gediteur="nom" /></label>
      </div>
      <label className="auto-champ">Description<textarea rows={2} value={b.description} onChange={(e) => setB({ ...b, description: e.target.value })} /></label>
      <span className="editeur-ligne graphe-ajouts">
        {TYPES_NOEUD.map((t) => (
          <button key={t} type="button" className="bouton-mini" onClick={() => ajouter(t)} data-gediteur-ajouter={t}>+ {LIBELLES_NOEUD[t]}</button>
        ))}
      </span>
      {b.noeuds.length > 0 && <VueGraphe graphe={b} selection={selection} onSelection={(id) => setSelection(id)} onDeplacer={(id, x, y) => maj(id, { x, y } as Partial<NoeudGraphe>)} erreurs={verdict.noeud ? new Set([verdict.noeud]) : undefined} />}
      {b.noeuds.length === 0 && <p className="nav-detail">Ajoutez des nœuds (paramètres, calculs, règles, séries, commandes), puis reliez-les : un nœud ne lit que ce que ses ancêtres fournissent.</p>}
      {choisi && (
        <fieldset className="reprise-choix graphe-noeud-form" data-gediteur-noeud={choisi.id}>
          <legend>{LIBELLES_NOEUD[choisi.type]} « {choisi.id} »</legend>
          {choisi.type === "parametre" && (
            <div className="editeur-ligne">
              <input aria-label="Nom de la variable" value={choisi.nom} placeholder="nom" onChange={(e) => maj(choisi.id, { nom: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="nom" />
              <input aria-label="Libellé" value={choisi.libelle} placeholder="libellé" onChange={(e) => maj(choisi.id, { libelle: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="libelle" />
              <select aria-label="Type du paramètre" value={choisi.typeParametre} onChange={(e) => maj(choisi.id, { typeParametre: e.target.value as TypeParametre } as Partial<NoeudGraphe>)} data-gediteur-champ="typeParametre">
                {TYPES_PARAMETRE.map(([t, l]) => <option key={t} value={t}>{l}</option>)}
              </select>
              <input aria-label="Valeur par défaut" value={choisi.defaut === undefined ? "" : String(choisi.defaut)} placeholder="défaut" onChange={(e) => maj(choisi.id, { defaut: choisi.typeParametre === "chaine" || choisi.typeParametre === "niveau" ? (e.target.value || undefined) : nombreOuVide(e.target.value) } as Partial<NoeudGraphe>)} data-gediteur-champ="defaut" />
              {(choisi.typeParametre === "nombre" || choisi.typeParametre === "entier" || choisi.typeParametre === "longueur") && (
                <>
                  <input aria-label="Minimum" value={choisi.min ?? ""} placeholder="min" size={4} onChange={(e) => maj(choisi.id, { min: nombreOuVide(e.target.value) } as Partial<NoeudGraphe>)} />
                  <input aria-label="Maximum" value={choisi.max ?? ""} placeholder="max" size={4} onChange={(e) => maj(choisi.id, { max: nombreOuVide(e.target.value) } as Partial<NoeudGraphe>)} />
                </>
              )}
            </div>
          )}
          {choisi.type === "calcul" && (
            <div className="editeur-ligne">
              <input aria-label="Nom du calcul" value={choisi.nom} placeholder="nom" onChange={(e) => maj(choisi.id, { nom: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="nom" />
              <input aria-label="Expression" value={choisi.expression} placeholder="nx * px" onChange={(e) => maj(choisi.id, { expression: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="expression" />
            </div>
          )}
          {choisi.type === "serie" && (
            <div className="editeur-ligne">
              <input aria-label="Variable de la série" value={choisi.variable} size={6} onChange={(e) => maj(choisi.id, { variable: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="variable" />
              <input aria-label="Début" value={String(choisi.de)} size={6} onChange={(e) => maj(choisi.id, { de: borne(e.target.value) } as Partial<NoeudGraphe>)} data-gediteur-champ="de" />
              <input aria-label="Fin" value={String(choisi.a)} size={8} onChange={(e) => maj(choisi.id, { a: borne(e.target.value) } as Partial<NoeudGraphe>)} data-gediteur-champ="a" />
            </div>
          )}
          {choisi.type === "niveaux" && <div className="editeur-ligne"><input aria-label="Variable de la série" value={choisi.variable} size={6} onChange={(e) => maj(choisi.id, { variable: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="variable" /></div>}
          {choisi.type === "regle" && (
            <div className="editeur-ligne">
              <input aria-label="Comparaison" value={choisi.expression} placeholder="section < px" onChange={(e) => maj(choisi.id, { expression: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="expression" />
              <input aria-label="Message si la règle n'est pas tenue" value={choisi.message} placeholder="message, avec sa source" onChange={(e) => maj(choisi.id, { message: e.target.value } as Partial<NoeudGraphe>)} data-gediteur-champ="message" />
            </div>
          )}
          {choisi.type === "commande" && (
            <>
              <p className="nav-detail">Gabarit de commande du contrat : « $nom » reprend une variable reliée, « =expression » calcule, « {"{i}"} » s'interpole dans un texte.</p>
              <textarea aria-label="Commande (JSON)" rows={5} value={jsonCommande[choisi.id] ?? JSON.stringify(choisi.commande, null, 1)} data-gediteur-champ="commande"
                onChange={(e) => {
                  setJsonCommande({ ...jsonCommande, [choisi.id]: e.target.value });
                  try {
                    const c = JSON.parse(e.target.value) as Commande;
                    if (c && typeof c.type === "string" && c.params && typeof c.params === "object") maj(choisi.id, { commande: c } as Partial<NoeudGraphe>);
                  } catch {
                    /* JSON incomplet : le dernier gabarit lisible reste */
                  }
                }} />
            </>
          )}
          <span className="ver-actions">
            <button type="button" className="bouton-mini" onClick={() => retirer(choisi.id)} data-gediteur="retirer">Retirer ce nœud</button>
          </span>
        </fieldset>
      )}
      {b.noeuds.length > 1 && (
        <fieldset className="reprise-choix">
          <legend>Liens (qui lit quoi)</legend>
          <span className="editeur-ligne">
            <select aria-label="Nœud d'origine" value={lien.de} onChange={(e) => setLien({ ...lien, de: e.target.value })} data-gediteur="lien-de">
              <option value="">origine…</option>
              {b.noeuds.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <span aria-hidden="true">→</span>
            <select aria-label="Nœud d'arrivée" value={lien.a} onChange={(e) => setLien({ ...lien, a: e.target.value })} data-gediteur="lien-a">
              <option value="">arrivée…</option>
              {b.noeuds.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
            </select>
            <button type="button" className="bouton-mini" disabled={!lien.de || !lien.a || lien.de === lien.a || b.liens.some((l) => l.de === lien.de && l.a === lien.a)} onClick={() => { setB({ ...b, liens: [...b.liens, lien] }); setLien({ de: "", a: "" }); }} data-gediteur="relier">Relier</button>
          </span>
          <ul className="graphe-liens">
            {b.liens.map((l, i) => (
              <li key={`${l.de}-${l.a}`}>
                <code>{l.de}</code> → <code>{l.a}</code>{" "}
                <button type="button" className="bouton-mini" onClick={() => setB({ ...b, liens: b.liens.filter((_, k) => k !== i) })}>×<span className="sr-only">Retirer le lien {l.de} → {l.a}</span></button>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
      <p className={verdict.erreur ? "ver-erreur" : "ver-info"} role="status" data-gediteur-verdict={verdict.erreur ? "erreur" : "valide"}>{b.noeuds.length ? verdict.texte : "Aucun nœud."}</p>
      <span className="ver-actions">
        <button type="button" className="primaire" disabled={!verdict.graphe} data-gediteur="enregistrer"
          onClick={() => {
            if (!verdict.graphe) return;
            const g = verdict.graphe;
            onCommandes([{ type: "graphe.definir", params: { id: g.id, nom: g.nom, description: g.description, noeuds: g.noeuds, liens: g.liens } }], `Graphe « ${g.nom} »`);
            setMessage(`Graphe « ${g.nom} » déposé dans le projet (définition versionnée avec le modèle).`);
            onEnregistre(g.id);
          }}>
          Enregistrer dans le projet
        </button>
      </span>
      {message && <p className="ver-info" role="status">{message}</p>}
    </details>
  );
}
