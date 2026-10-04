/**
 * Compléments de l'inspecteur (lot 5) : phase de projet, blocs et composants (créer depuis la sélection, propriétés
 * héritées d'une occurrence), contraintes d'esquisse (ajout typé, diagnostic des degrés de liberté, suppression).
 * Chaque action est une commande ; rien n'est appliqué sans validation.
 */
import { useState } from "react";
import {
  bibliotheques,
  CLASSES_BLOC,
  contraintesDe,
  diagnosticContraintes,
  ELEMENTS_CONTRAINTE,
  FORMES_CONTRAIGNABLES,
  LIBELLES_CONTRAINTE,
  proprietesEffectives,
  pt,
  rectangleEnglobant,
  type Commande,
  type ModeleAtelier,
  type OccurrenceQuelconque,
  type ParamsContrainte,
  type TypeContrainte,
} from "@parcours/atelier-model";

type OnCommandes = (commandes: Commande[], label: string) => void;
const PHASES = [
  ["", "Sans phase"],
  ["existant", "Existant"],
  ["nouveau", "Nouveau"],
  ["a-demolir", "À démolir"],
] as const;

export function ChoixPhase({ sel, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; readOnly: boolean; onCommandes: OnCommandes }) {
  const phases = new Set(sel.map((o) => o.phase ?? ""));
  const valeur = phases.size === 1 ? [...phases][0]! : "*";
  return (
    <div className="champ">
      <dt><label htmlFor="phase-objet">Phase</label></dt>
      <dd>
        <select id="phase-objet" value={valeur} disabled={readOnly} onChange={(e) => e.target.value !== "*" && onCommandes([{ type: "phase.affecter", params: { cibles: sel.map((o) => o.id), phase: e.target.value || null } }], `Phase : ${PHASES.find((p) => p[0] === e.target.value)?.[1] ?? ""}`)}>
          {valeur === "*" && <option value="*">Phases mélangées</option>}
          {PHASES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </dd>
    </div>
  );
}

/** Verrou des objets sélectionnés (D-052) : un objet verrouillé n'est ni modifié, ni déplacé, ni supprimé. */
export function ChoixVerrou({ sel, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; readOnly: boolean; onCommandes: OnCommandes }) {
  const n = sel.filter((o) => o.verrouille).length;
  return (
    <div className="champ">
      <dt><label htmlFor="verrou-objet">Verrouillé</label></dt>
      <dd>
        <input
          id="verrou-objet"
          type="checkbox"
          checked={n === sel.length}
          ref={(el) => { if (el) el.indeterminate = n > 0 && n < sel.length; }}
          disabled={readOnly}
          onChange={(e) => onCommandes([{ type: "objet.verrouiller", params: { ids: sel.map((o) => o.id), verrouille: e.target.checked } }], e.target.checked ? `Verrouiller ${sel.length > 1 ? `${sel.length} objets` : sel[0]!.id}` : `Déverrouiller ${sel.length > 1 ? `${sel.length} objets` : sel[0]!.id}`)}
        />
      </dd>
    </div>
  );
}

/** Créer un bloc ou un composant depuis la sélection (point de base : coin bas gauche de la sélection). */
export function CreerBloc({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: OnCommandes }) {
  const [nom, setNom] = useState("");
  const [nature, setNature] = useState<"bloc" | "composant">("bloc");
  const [biblio, setBiblio] = useState("");
  const [classification, setClassification] = useState("");
  const [remplacer, setRemplacer] = useState(true);
  const refusees = sel.filter((o) => !(CLASSES_BLOC as readonly string[]).includes(o.classe));
  const points = sel.flatMap((o) => {
    const p = o.params as unknown as Record<string, unknown>;
    return [...((p["points"] as { x: number; y: number }[] | undefined) ?? []), ...((p["contour"] as { x: number; y: number }[] | undefined) ?? []), ...(p["position"] ? [p["position"] as { x: number; y: number }] : []), ...(p["centre"] ? [p["centre"] as { x: number; y: number }] : [])];
  });
  const base = points.length ? rectangleEnglobant(points).min : { x: 0, y: 0 };
  const existantes = bibliotheques(etat).map((b) => b.nom).filter((n) => n !== "Sans bibliothèque");
  return (
    <details className="inspecteur-bloc">
      <summary>Créer un bloc ou un composant</summary>
      {refusees.length > 0 ? (
        <p className="inspecteur-alerte" role="note">Un bloc ne contient que des esquisses, textes et solides : retirez {refusees.map((o) => o.id).slice(0, 3).join(", ")}{refusees.length > 3 ? "…" : ""} de la sélection.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!nom.trim()) return;
            onCommandes([{ type: "bloc.definir", params: { nom: nom.trim(), nature, cibles: sel.map((o) => o.id), pointDeBase: pt(base.x, base.y), bibliotheque: biblio.trim() || null, classification: nature === "composant" ? classification.trim() || null : null, remplacer } }], `${nature === "composant" ? "Composant" : "Bloc"} « ${nom.trim()} »`);
            setNom("");
          }}
        >
          <label>Nom<input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} required /></label>
          <label>Nature
            <select value={nature} onChange={(e) => setNature(e.target.value as "bloc" | "composant")}>
              <option value="bloc">Bloc (dessin réutilisable)</option>
              <option value="composant">Composant (objet compté, propriétés)</option>
            </select>
          </label>
          <label>Bibliothèque<input list="bibliotheques-existantes" value={biblio} onChange={(e) => setBiblio(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="Sans bibliothèque" /></label>
          <datalist id="bibliotheques-existantes">{existantes.map((b) => <option key={b} value={b} />)}</datalist>
          {nature === "composant" && <label>Classification<input value={classification} onChange={(e) => setClassification(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="non classé" /></label>}
          <label className="case"><input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} /> Remplacer la sélection par une occurrence</label>
          <p className="inspecteur-aide">Point de base : coin bas gauche de la sélection ({base.x.toFixed(2).replace(".", ",")} ; {base.y.toFixed(2).replace(".", ",")}).</p>
          <button type="submit" disabled={readOnly || !nom.trim()}>Créer</button>
        </form>
      )}
    </details>
  );
}

/** Occurrence de bloc / composant : définition, version, propriétés effectives (héritées ou surchargées). */
export function FicheOccurrenceBloc({ o, etat }: { o: OccurrenceQuelconque; etat: ModeleAtelier }) {
  const def = o.definitionId ? etat.definitions[o.definitionId] : undefined;
  if (!def) return <p className="inspecteur-alerte" role="note">Définition absente : occurrence à réparer ou à supprimer.</p>;
  const props = proprietesEffectives(etat, o);
  return (
    <div className="inspecteur-bloc-info">
      <p>{def.classe === "composant" ? "Composant" : "Bloc"} <strong>{def.nom}</strong> · version {def.version}{(def.params["bibliotheque"] as string | null) ? ` · bibliothèque ${def.params["bibliotheque"] as string}` : ""}{def.classe === "composant" ? ` · ${(def.params["classification"] as string | null) ?? "non classé"}` : ""}</p>
      {Object.keys(props).length > 0 && (
        <dl>
          {Object.entries(props).map(([k, p]) => (
            <div key={k} className="champ">
              <dt>{k}</dt>
              <dd>{String(p.valeur)}{p.unite ? ` ${p.unite}` : ""} <span className="statut">{p.source === "definition" ? "héritée" : "surchargée sur l'occurrence"}</span></dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// Dans l'inspecteur, la distance porte sur la longueur d'un segment ; les autres types suivent le modèle (D-051).
const ELEMENTS: Record<TypeContrainte, readonly ["sommet" | "segment", "sommet" | "segment" | null]> = { ...ELEMENTS_CONTRAINTE, distance: ["segment", null] };
const nombre = (v: string) => Number(v.trim().replace(",", "."));

/** Contraintes d'une ou deux esquisses sélectionnées : ajout, diagnostic, suppression. */
export function Contraintes({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: OnCommandes }) {
  const esquisses = sel.filter((o) => o.classe === "esquisse" && (FORMES_CONTRAIGNABLES as readonly string[]).includes(o.params.forme)) as (OccurrenceQuelconque & { classe: "esquisse" })[];
  const [type, setType] = useState<TypeContrainte>("horizontal");
  const [a, setA] = useState(0);
  const [b, setB] = useState(0);
  const [c, setC] = useState(1);
  const [valeur, setValeur] = useState("");
  const [angle, setAngle] = useState("");
  const [pilotante, setPilotante] = useState(true);
  if (esquisses.length === 0 || esquisses.length > 2 || esquisses.length !== sel.length) return null;
  const A = esquisses[0]!;
  const B = esquisses[1] ?? A;
  const ids = esquisses.map((e) => e.id);
  const liste = contraintesDe(etat).filter((r) => ids.includes(r.sourceId) || ids.includes(r.targetId));
  const diag = diagnosticContraintes(etat, ids);
  const [ka, kb] = ELEMENTS[type];
  const nbSeg = (o: typeof A) => o.params.points.length - (o.params.ferme || o.params.forme === "polygone" ? 0 : 1);
  const options = (o: typeof A, k: "sommet" | "segment") => Array.from({ length: k === "sommet" ? o.params.points.length : nbSeg(o) }, (_, i) => i);
  const ajouter = () => {
    const params: Record<string, unknown> = { type, objetA: A.id, a: `${ka}[${a}]`, pilotante };
    if (kb) {
      params["objetB"] = B.id;
      params["b"] = `${kb}[${b}]`;
    }
    if (type === "distance") {
      const v = nombre(valeur);
      if (!Number.isFinite(v) || v <= 0) return;
      params["valeur"] = { value: v, unit: "m" };
    }
    if (type === "angle") {
      const v = nombre(angle);
      if (!angle.trim() || !Number.isFinite(v)) return;
      params["angle"] = { value: v, unit: "deg" };
    }
    if (type === "symetrie") params["c"] = `sommet[${c}]`;
    onCommandes([{ type: "contrainte.ajouter", params }], `Contrainte : ${LIBELLES_CONTRAINTE[type]}`);
  };
  return (
    <details className="inspecteur-contraintes" open={liste.length > 0}>
      <summary>Contraintes ({liste.length}) · {diag.degresDeLiberte} degré(s) de liberté</summary>
      <p className="inspecteur-aide">
        {diag.ecart > 1e-6 ? "Contraintes non respectées : à réparer." : diag.degresDeLiberte === 0 ? "Esquisse entièrement contrainte." : `Sous-contrainte : ${diag.degresDeLiberte} degré(s) de liberté restant(s).`}
        {diag.aReparer ? ` ${diag.aReparer} contrainte(s) à réparer.` : ""}
      </p>
      {liste.length > 0 && (
        <ul className="liste-contraintes">
          {liste.map((r) => {
            const p = r.params as ParamsContrainte;
            return (
              <li key={r.id} className={p.etat === "a-reparer" ? "a-reparer" : undefined}>
                <span>{LIBELLES_CONTRAINTE[p.type]} · {p.a}{p.b ? ` ↔ ${p.b}` : ""}{p.c ? ` et ${p.c}` : ""}{p.valeur ? ` = ${p.valeur.value.toString().replace(".", ",")} m` : ""}{p.angle ? ` = ${p.angle.value.toString().replace(".", ",")}°` : ""}{p.position ? ` en (${p.position.x.toFixed(3).replace(".", ",")} ; ${p.position.y.toFixed(3).replace(".", ",")})` : ""}{!p.pilotante ? " (contrôle)" : ""}{p.etat === "a-reparer" ? " · à réparer" : ""}</span>
                {p.type === "distance" && p.etat === "ok" && !readOnly && (
                  <input aria-label="Nouvelle valeur (m)" inputMode="decimal" defaultValue={p.valeur?.value.toString().replace(".", ",")} onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      const v = Number(e.currentTarget.value.replace(",", "."));
                      if (Number.isFinite(v) && v > 0) onCommandes([{ type: "contrainte.modifier", params: { id: r.id, valeur: { value: v, unit: "m" } } }], "Cote modifiée");
                    }
                  }} />
                )}
                {p.type === "angle" && p.etat === "ok" && !readOnly && (
                  <input aria-label="Nouvel angle (°)" inputMode="decimal" defaultValue={p.angle?.value.toString().replace(".", ",")} onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      const v = nombre(e.currentTarget.value);
                      if (e.currentTarget.value.trim() && Number.isFinite(v)) onCommandes([{ type: "contrainte.modifier", params: { id: r.id, angle: { value: v, unit: "deg" } } }], "Angle modifié");
                    }
                  }} />
                )}
                {!readOnly && <button type="button" onClick={() => onCommandes([{ type: "contrainte.supprimer", params: { id: r.id } }], "Contrainte supprimée")}>Supprimer</button>}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly && (
        <div className="ajout-contrainte">
          <label>Type
            <select value={type} onChange={(e) => { setType(e.target.value as TypeContrainte); setA(0); setB(0); setC(1); }}>
              {(Object.keys(ELEMENTS) as TypeContrainte[]).filter((t) => esquisses.length === 2 || ELEMENTS[t][1] !== "sommet" || A.params.points.length > 1).map((t) => <option key={t} value={t}>{LIBELLES_CONTRAINTE[t]}</option>)}
            </select>
          </label>
          <label>{type === "symetrie" ? "Axe (segment)" : ka === "sommet" ? "Sommet" : "Segment"} de {A.id}
            <select value={a} onChange={(e) => setA(Number(e.target.value))}>{options(A, ka).map((i) => <option key={i} value={i}>{i + 1}</option>)}</select>
          </label>
          {kb && (
            <label>{kb === "sommet" ? "Sommet" : "Segment"} de {B.id}
              <select value={b} onChange={(e) => setB(Number(e.target.value))}>{options(B, kb).map((i) => <option key={i} value={i}>{i + 1}</option>)}</select>
            </label>
          )}
          {type === "symetrie" && (
            <label>Symétrique : sommet de {B.id}
              <select value={c} onChange={(e) => setC(Number(e.target.value))}>{options(B, "sommet").map((i) => <option key={i} value={i}>{i + 1}</option>)}</select>
            </label>
          )}
          {type === "angle" && <label>Angle de a vers b (°)<input inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>}
          {type === "distance" && (
            <>
              <label>Valeur (m)<input inputMode="decimal" value={valeur} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>
              <label className="case"><input type="checkbox" checked={pilotante} onChange={(e) => setPilotante(e.target.checked)} /> Cote pilotante</label>
            </>
          )}
          <button type="button" onClick={ajouter}>Ajouter la contrainte</button>
        </div>
      )}
    </details>
  );
}
