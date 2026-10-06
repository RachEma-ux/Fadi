/**
 * Compléments de l'inspecteur (lot 5) : phase de projet, blocs et composants (créer depuis la sélection, propriétés
 * héritées d'une occurrence), contraintes d'esquisse (ajout typé, diagnostic des degrés de liberté, suppression).
 * Chaque action est une commande ; rien n'est appliqué sans validation.
 */
import { useState } from "react";
import {
  commeEsquisse,
  etatsCalques,
  bibliotheques,
  CLASSES,
  CLASSES_BLOC,
  proposerClassification,
  type Classe,
  contraintesDe,
  CLASSE_REFERENTIEL,
  lireReferentielCsv,
  diagnosticContraintes,
  ELEMENTS_CONTRAINTE,
  type GenreElement,
  FORMES_CONTRAIGNABLES,
  LIBELLES_CONTRAINTE,
  proprietesEffectives,
  pt,
  rectangleEnglobant,
  type Commande,
  type ModeleAtelier,
  type OccurrenceQuelconque,
  type ParamsContrainte,
  type ParamsReferentiel,
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

/**
 * Classification (D-065, DA-06-08) : système et code déclarés par l'utilisateur ; quand un référentiel du système
 * est chargé, le code est vérifié (liste proposée) et son libellé noté. Référentiels chargés depuis un CSV.
 */
export function Classification({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: OnCommandes }) {
  const referentiels = Object.values(etat.definitions).filter((d) => d.classe === CLASSE_REFERENTIEL).map((d) => ({ id: d.id, nom: d.nom, p: d.params as unknown as ParamsReferentiel }));
  const [systeme, setSysteme] = useState(referentiels[0]?.p.systeme ?? "");
  const [code, setCode] = useState("");
  const [charge, setCharge] = useState({ systeme: "", edition: "" });
  const [message, setMessage] = useState<string | null>(null);
  const ref = referentiels.find((r) => r.p.systeme === systeme.trim()) ?? null;
  const actuels = sel.length === 1 ? Object.entries(sel[0]!.proprietes).filter(([k]) => k.startsWith("classification:") && !k.endsWith(":libelle")).map(([k, v]) => ({ systeme: k.slice("classification:".length), code: String(v.valeur), statut: v.statut, libelle: sel[0]!.proprietes[`${k}:libelle`]?.valeur as string | undefined })) : [];
  const codes = ref ? Object.keys(ref.p.codes).filter((c) => !code || c.startsWith(code)).slice(0, 200) : [];
  return (
    <details className="inspecteur-classification" data-classification>
      <summary>Classification{actuels.length ? ` (${actuels.length})` : ""}</summary>
      {actuels.length > 0 && (
        <ul>
          {actuels.map((a) => (
            <li key={a.systeme}>
              {a.systeme} : <strong>{a.code}</strong>{a.libelle ? ` — ${a.libelle}` : ""} <span className="nav-detail">{a.statut === "verifiee" ? "vérifié au référentiel" : "déclaré"}</span>
              {!readOnly && <button type="button" className="lien" onClick={() => onCommandes([{ type: "classification.affecter", params: { id: sel[0]!.id, systeme: a.systeme, code: null } }], `Retirer la classification ${a.systeme}`)}>Retirer</button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form className="classif-formulaire" onSubmit={(e) => { e.preventDefault(); if (systeme.trim() && code.trim()) onCommandes(sel.map((o) => ({ type: "classification.affecter", params: { id: o.id, systeme: systeme.trim(), code: code.trim() } })), `Classer ${sel.length > 1 ? `${sel.length} objets` : sel[0]!.id} : ${systeme.trim()} ${code.trim()}`); }}>
          <label>Système<input list="classif-systemes" value={systeme} maxLength={80} onChange={(e) => setSysteme(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-classif="systeme" /></label>
          <datalist id="classif-systemes">{referentiels.map((r) => <option key={r.id} value={r.p.systeme} />)}</datalist>
          <label>Code<input list="classif-codes" value={code} maxLength={60} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-classif="code" /></label>
          <datalist id="classif-codes">{codes.map((c) => <option key={c} value={c}>{ref!.p.codes[c]}</option>)}</datalist>
          <p className="inspecteur-aide">{ref ? `Référentiel ${ref.nom} chargé (${Object.keys(ref.p.codes).length} codes, source : ${ref.p.source}) : le code est vérifié.` : "Aucun référentiel chargé pour ce système : le code est enregistré tel quel (« déclaré »)."}</p>
          <button type="submit" disabled={!systeme.trim() || !code.trim()}>Classer</button>
        </form>
      )}
      <details className="classif-referentiels">
        <summary>Référentiels chargés ({referentiels.length})</summary>
        <ul>
          {referentiels.map((r) => (
            <li key={r.id}>
              {r.nom} · {Object.keys(r.p.codes).length} codes · {r.p.source}
              {!readOnly && <button type="button" className="lien" onClick={() => onCommandes([{ type: "referentiel.retirer", params: { id: r.id } }], `Retirer le référentiel ${r.nom}`)}>Retirer</button>}
            </li>
          ))}
        </ul>
        {!readOnly && (
          <div className="classif-formulaire">
            <label>Système<input value={charge.systeme} maxLength={80} onChange={(e) => setCharge({ ...charge, systeme: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-referentiel="systeme" /></label>
            <label>Édition<input value={charge.edition} maxLength={40} onChange={(e) => setCharge({ ...charge, edition: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-referentiel="edition" /></label>
            <label>Fichier CSV (code ; libellé)
              <input type="file" accept=".csv,.txt,text/csv" disabled={!charge.systeme.trim()} data-referentiel="fichier" onChange={(e) => {
                const f = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (!f) return;
                void f.text().then((t) => {
                  const r = lireReferentielCsv(t);
                  if (!r.codes.length) return setMessage(`${f.name} : aucun code lu.`);
                  onCommandes([{ type: "referentiel.charger", params: { systeme: charge.systeme.trim(), edition: charge.edition.trim() || null, source: f.name, codes: r.codes } }], `Référentiel ${charge.systeme.trim()} chargé (${r.codes.length} codes)`);
                  setMessage(`${r.codes.length} code(s) lu(s) dans ${f.name}${r.refus.length ? ` ; ${r.refus.length} ligne(s) refusée(s) (code vide)` : ""}.`);
                });
              }} />
            </label>
            {message && <p className="inspecteur-aide" role="status">{message}</p>}
          </div>
        )}
      </details>
    </details>
  );
}

/**
 * Classer par règle (D-112, DA-06-08) : classe Fadi, type et niveau facultatifs, système et code ; la proposition
 * (objets visés, déjà classés écartés, verrouillés) s'affiche avant toute commande ; « Appliquer » envoie un seul lot.
 */
export function ClasserParRegle({ etat, niveauId, onCommandes }: { etat: ModeleAtelier; niveauId: string | null; onCommandes: OnCommandes }) {
  const referentiels = Object.values(etat.definitions).filter((d) => d.classe === CLASSE_REFERENTIEL).map((d) => d.params as unknown as ParamsReferentiel);
  const presentes = [...new Set(Object.values(etat.objets).map((o) => o.classe))].sort() as Classe[];
  const [classe, setClasse] = useState<Classe | "">("");
  const [type, setType] = useState("");
  const [niveauSeul, setNiveauSeul] = useState(false);
  const [systeme, setSysteme] = useState(referentiels[0]?.systeme ?? "");
  const [code, setCode] = useState("");
  const [remplacer, setRemplacer] = useState(false);
  const types = classe ? [...new Set(Object.values(etat.objets).filter((o) => o.classe === classe && o.definitionId).map((o) => o.definitionId!))] : [];
  const p = classe ? proposerClassification(etat, { classe, systeme, code, definitionId: type || null, niveauId: niveauSeul ? niveauId : null, remplacer }) : null;
  const ref = referentiels.find((r) => r.systeme === systeme.trim()) ?? null;
  const codeConnu = !ref || !code.trim() || code.trim() in ref.codes;
  return (
    <details className="inspecteur-classification" data-classer-regle>
      <summary>Classer par règle</summary>
      <div className="classif-formulaire">
        <label>Classe<select value={classe} onChange={(e) => { setClasse(e.target.value as Classe | ""); setType(""); }} data-regle="classe"><option value="">—</option>{presentes.map((c) => <option key={c} value={c}>{CLASSES[c].libelle}</option>)}</select></label>
        {types.length > 0 && <label>Type<select value={type} onChange={(e) => setType(e.target.value)} data-regle="type"><option value="">tous</option>{types.map((t) => <option key={t} value={t}>{etat.definitions[t]?.nom ?? t}</option>)}</select></label>}
        <label className="case"><input type="checkbox" checked={niveauSeul} onChange={(e) => setNiveauSeul(e.target.checked)} /> Niveau actif seulement</label>
        <label>Système<input list="regle-systemes" value={systeme} maxLength={80} onChange={(e) => setSysteme(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-regle="systeme" /></label>
        <datalist id="regle-systemes">{referentiels.map((r) => <option key={r.systeme} value={r.systeme} />)}</datalist>
        <label>Code<input value={code} maxLength={60} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-regle="code" /></label>
        <label className="case"><input type="checkbox" checked={remplacer} onChange={(e) => setRemplacer(e.target.checked)} /> Remplacer un code déjà posé</label>
        {p && (
          <p className="inspecteur-aide" data-regle-proposition={p.cibles.length}>
            Proposition : {p.cibles.length} objet(s) à classer{p.dejaClasses.length ? ` ; ${p.dejaClasses.length} déjà classé(s) dans ce système, écarté(s)` : ""}{p.verrouilles.length ? ` ; ${p.verrouilles.length} verrouillé(s), écarté(s)` : ""}.{!codeConnu ? " Code absent du référentiel chargé : il serait refusé." : ""}
          </p>
        )}
        <button type="button" disabled={!p || !p.commandes.length || !codeConnu} data-regle-appliquer onClick={() => p && onCommandes(p.commandes, p.label)}>Appliquer la proposition</button>
      </div>
    </details>
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
    return [...((p["points"] as { x: number; y: number }[] | undefined) ?? []), ...((p["contour"] as { x: number; y: number }[] | undefined) ?? []), ...(p["position"] ? [p["position"] as { x: number; y: number }] : []), ...(p["centre"] ? [p["centre"] as { x: number; y: number }] : []), ...(p["point"] ? [p["point"] as { x: number; y: number }] : [])];
  });
  const base = points.length ? rectangleEnglobant(points).min : { x: 0, y: 0 };
  const existantes = bibliotheques(etat).map((b) => b.nom).filter((n) => n !== "Sans bibliothèque");
  return (
    <details className="inspecteur-bloc">
      <summary>Créer un bloc ou un composant</summary>
      {refusees.length > 0 ? (
        <p className="inspecteur-alerte" role="note">Un bloc ne contient que des esquisses, textes, solides, poteaux, dalles et occurrences de blocs : retirez {refusees.map((o) => o.id).slice(0, 3).join(", ")}{refusees.length > 3 ? "…" : ""} de la sélection.</p>
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
const ELEMENTS: Record<TypeContrainte, readonly [GenreElement, GenreElement | null]> = { ...ELEMENTS_CONTRAINTE, distance: ["segment", null] };

/** Caractéristiques d'une esquisse d'un genre donné (D-074 : centre et cercle des cercles et arcs), avec libellés. */
function caracteristiques(o: OccurrenceQuelconque & { classe: "esquisse" }, genre: GenreElement, tangence = false): { cle: string; libelle: string }[] {
  const rond = (o.params.forme === "cercle" || o.params.forme === "arc") && !!o.params.centre && !!o.params.rayon;
  const n = o.params.points.length;
  const nbSeg = n - (o.params.ferme || o.params.forme === "polygone" ? 0 : 1);
  if (genre === "sommet") return [...Array.from({ length: n }, (_, i) => ({ cle: `sommet[${i}]`, libelle: `${i + 1}` })), ...(rond ? [{ cle: "centre", libelle: "centre" }] : [])];
  if (genre === "segment") return [...Array.from({ length: Math.max(0, nbSeg) }, (_, i) => ({ cle: `segment[${i}]`, libelle: `${i + 1}` })), ...(tangence && rond ? [{ cle: "cercle", libelle: "cercle" }] : [])];
  return rond ? [{ cle: "cercle", libelle: o.params.forme === "arc" ? "arc" : "cercle" }] : [];
}
const nombre = (v: string) => Number(v.trim().replace(",", "."));

/** Contraintes d'une ou deux esquisses sélectionnées : ajout, diagnostic, suppression. */
export function Contraintes({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: OnCommandes }) {
  // Murs droits (D-129) : contraignables comme une ligne de leur axe.
  const esquisses = sel.map((o) => commeEsquisse(o)).filter((o): o is NonNullable<typeof o> => !!o && (FORMES_CONTRAIGNABLES as readonly string[]).includes(o.params.forme)) as (OccurrenceQuelconque & { classe: "esquisse" })[];
  const [type, setType] = useState<TypeContrainte>("horizontal");
  const [aChoisi, setA] = useState("");
  const [bChoisi, setB] = useState("");
  const [cChoisi, setC] = useState("");
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
  const optA = caracteristiques(A, ka, type === "tangence");
  const optB = kb ? caracteristiques(B, kb) : [];
  const optC = caracteristiques(B, "sommet").filter((x) => x.cle !== "centre");
  const a = optA.some((x) => x.cle === aChoisi) ? aChoisi : (optA[0]?.cle ?? "");
  const b = optB.some((x) => x.cle === bChoisi) ? bChoisi : (optB[0]?.cle ?? "");
  const c = optC.some((x) => x.cle === cChoisi) ? cChoisi : (optC[1]?.cle ?? optC[0]?.cle ?? "");
  const possible = (t: TypeContrainte) => {
    const [ga, gb] = ELEMENTS[t];
    if (!caracteristiques(A, ga, t === "tangence").length) return false;
    if (gb && !caracteristiques(B, gb).length) return false;
    return esquisses.length === 2 || gb !== "sommet" || caracteristiques(A, "sommet").length > 1;
  };
  const ajouter = () => {
    if (!a || (kb && !b)) return;
    const params: Record<string, unknown> = { type, objetA: A.id, a, pilotante };
    if (kb) {
      params["objetB"] = B.id;
      params["b"] = b;
    }
    if (type === "rayon" || type === "diametre") {
      const v = nombre(valeur);
      if (!Number.isFinite(v) || v <= 0) return;
      params["valeur"] = { value: v, unit: "m" };
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
    if (type === "symetrie") params["c"] = c;
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
                {(p.type === "distance" || p.type === "rayon" || p.type === "diametre") && p.etat === "ok" && !readOnly && (
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
            <select value={type} data-contrainte-type onChange={(e) => { setType(e.target.value as TypeContrainte); setA(""); setB(""); setC(""); }}>
              {(Object.keys(ELEMENTS) as TypeContrainte[]).filter(possible).map((t) => <option key={t} value={t}>{LIBELLES_CONTRAINTE[t]}</option>)}
            </select>
          </label>
          <label>{type === "symetrie" ? "Axe (segment)" : ka === "sommet" ? "Sommet" : ka === "cercle" ? "Cercle" : type === "tangence" ? "Segment ou cercle" : "Segment"} de {A.id}
            <select value={a} onChange={(e) => setA(e.target.value)}>{optA.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}</select>
          </label>
          {kb && (
            <label>{kb === "sommet" ? "Sommet" : kb === "cercle" ? "Cercle" : "Segment"} de {B.id}
              <select value={b} onChange={(e) => setB(e.target.value)}>{optB.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}</select>
            </label>
          )}
          {type === "symetrie" && (
            <label>Symétrique : sommet de {B.id}
              <select value={c} onChange={(e) => setC(e.target.value)}>{optC.map((x) => <option key={x.cle} value={x.cle}>{x.libelle}</option>)}</select>
            </label>
          )}
          {(type === "rayon" || type === "diametre") && <label>{type === "rayon" ? "Rayon" : "Diamètre"} (m)<input inputMode="decimal" data-contrainte-valeur value={valeur} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>}
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

/**
 * États de calques (D-119, DA-05-03) : instantanés nommés de la visibilité, du verrouillage et du gel des calques,
 * enregistrés dans le modèle (versionnés avec lui) ; « Restaurer » remet les calques dans l'état enregistré.
 */
export function EtatsCalques({ etat, onCommandes }: { etat: ModeleAtelier; onCommandes: OnCommandes }) {
  const [nom, setNom] = useState("");
  const liste = etatsCalques(etat);
  if (Object.keys(etat.calques).length === 0) return null;
  return (
    <details data-etats-calques>
      <summary>États de calques</summary>
      {liste.length > 0 && (
        <ul className="nav-liste">
          {liste.map((d) => (
            <li key={d.id} data-etat-calques={d.id}>
              <button type="button" data-etat-calques-restaurer={d.id} onClick={() => onCommandes([{ type: "etatCalques.restaurer", params: { id: d.id } }], `Restaurer l'état de calques « ${d.nom} »`)}>{d.nom}</button>
              <span className="nav-detail">version {d.version} · {Object.keys(d.params.calques).length} calque(s)</span>
              <button type="button" className="lien" data-etat-calques-maj={d.id} onClick={() => onCommandes([{ type: "etatCalques.enregistrer", params: { id: d.id } }], `Mettre à jour l'état de calques « ${d.nom} »`)}>Mettre à jour</button>
              <button type="button" className="lien" onClick={() => onCommandes([{ type: "etatCalques.supprimer", params: { id: d.id } }], `Supprimer l'état de calques « ${d.nom} »`)}>Supprimer</button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="nav-formulaire-ensemble nav-formulaire-etat-calques"
        onSubmit={(e) => {
          e.preventDefault();
          const n = nom.trim();
          if (!n) return;
          onCommandes([{ type: "etatCalques.enregistrer", params: { nom: n } }], `Enregistrer l'état de calques « ${n} »`);
          setNom("");
        }}
      >
        <input value={nom} maxLength={80} placeholder="Nom de l'état" aria-label="Nom de l'état de calques" onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-etat-calques-nom />
        <button type="submit" disabled={!nom.trim()}>Enregistrer l'état actuel</button>
      </form>
    </details>
  );
}
