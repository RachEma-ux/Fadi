/**
 * Ontologie mécanique (P2-2, T01) : les outils Pièce, Assemblage et Liaison vivent dans l'inspecteur comme les autres
 * outils (sélection → paramètres → validation), les fiches des objets mécaniques dans la fiche d'objet ; aucun écran,
 * aucun ruban. Le solveur tourne dans le réducteur (navigateur et serveur) : la fiche montre son diagnostic.
 */
import { useState } from "react";
import { DDL_LIAISON, LIBELLES_LIAISON, liaisonsDe, PILOTAGE, piecesDe, TYPES_LIAISON, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type TypeLiaison } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
const SOURCES = ["solide-exact", "solide", "poteau", "bloc-occurrence", "piece-mecanique"];
const nomDe = (o: OccurrenceQuelconque) => ((o.params as unknown as { nom?: string | null }).nom ?? null) || o.id;
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;

function assemblagesDuNiveau(etat: ModeleAtelier, niveauId: string | null): Occurrence<"assemblage">[] {
  return (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((o): o is Occurrence<"assemblage"> => o.classe === "assemblage" && (!niveauId || o.niveauId === niveauId)).sort((a, b) => a.params.nom.localeCompare(b.params.nom, "fr"));
}

/** Outil Pièce mécanique (DA-10-01) : chaque solide sélectionné devient une pièce, posée dans l'assemblage choisi. */
export function OutilPieceMecanique({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sources = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o && SOURCES.includes(o.classe));
  const assemblages = assemblagesDuNiveau(etat, ui.niveauId);
  const poser = (k: string, v: unknown) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, [k]: v } }));
  const assemblageId = (ui.parametresOutil["assemblagePiece"] as string | undefined) ?? "";
  const materiau = (ui.parametresOutil["materiauPiece"] as string | undefined) ?? "";
  const fixe = ui.parametresOutil["pieceFixe"] === true;
  const creer = () => {
    if (!onCommandes || !sources.length) return;
    const commandes: Commande[] = sources.map((o) => ({ type: "pieceMecanique.creer", params: { sourceId: o.id, nom: nomDe(o), ...(assemblageId ? { assemblageId } : {}), ...(materiau.trim() ? { materiau: materiau.trim() } : {}), fixe } }));
    onCommandes(commandes, sources.length === 1 ? `Pièce ${nomDe(sources[0]!)}` : `${sources.length} pièces mécaniques`);
  };
  return (
    <section className="outil-mecanique" aria-label="Pièce mécanique" data-outil-piece>
      <p className="inspecteur-aide">Sélectionnez un ou plusieurs solides (exacts, extrudés, poteaux) : chacun devient une pièce dont la géométrie est copiée de sa source (la source reste un objet du dessin).</p>
      {sources.length === 0 ? <p className="inspecteur-alerte" role="note" data-piece-message>Aucune source dans la sélection : choisissez un solide exact, un solide, un poteau ou une pièce.</p> : <p className="inspecteur-meta" data-piece-pret>{sources.length} source(s) : {sources.map(nomDe).join(", ")}</p>}
      <div className="champ">
        <label htmlFor="outil-assemblagePiece">Assemblage</label>
        <select id="outil-assemblagePiece" value={assemblageId} onChange={(e) => poser("assemblagePiece", e.target.value)}>
          <option value="">Aucun (pièce libre)</option>
          {assemblages.map((a) => <option key={a.id} value={a.id}>{a.params.nom}</option>)}
        </select>
      </div>
      <div className="champ">
        <label htmlFor="outil-materiauPiece">Matériau (déclaré)</label>
        <input id="outil-materiauPiece" value={materiau} maxLength={80} placeholder="nom seulement, aucune propriété inventée" onChange={(e) => poser("materiauPiece", e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      </div>
      <label className="case"><input type="checkbox" checked={fixe} data-piece-fixe onChange={(e) => poser("pieceFixe", e.target.checked)} /> Pièce fixe (bâti de l'assemblage)</label>
      <div className="boutons">
        <button type="button" data-piece-creer disabled={readOnly || !onCommandes || !sources.length} onClick={creer}>Créer la pièce</button>
      </div>
    </section>
  );
}

/** Outil Assemblage (DA-10-06 / 07) : un assemblage au centre de la sélection (ou de la vue), avec les pièces sélectionnées. */
export function OutilAssemblage({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [nom, setNom] = useState("");
  const [numero, setNumero] = useState("");
  const pieces = ui.selection.filter((id) => etat.objets[id]?.classe === "piece-mecanique" && !(etat.objets[id] as Occurrence<"piece-mecanique">).params.assemblageId);
  const creer = () => {
    if (!onCommandes || !ui.niveauId) return;
    const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
    const pts = sel.flatMap((o) => (o.classe === "piece-mecanique" || o.classe === "solide-exact" ? o.params.emprise : o.classe === "assemblage" ? [o.params.position] : []));
    const position = pts.length ? { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length, frame: "local" as const, unit: "m" as const } : { x: Math.round(ui.vue.cx * 100) / 100, y: Math.round(ui.vue.cy * 100) / 100, frame: "local" as const, unit: "m" as const };
    onCommandes([{ type: "assemblage.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || "Assemblage", numero: numero.trim() || null, position, pieces } }], `Assemblage ${nom.trim() || "Assemblage"}`);
    setNom(""); setNumero("");
  };
  return (
    <section className="outil-mecanique" aria-label="Assemblage" data-outil-assemblage>
      <p className="inspecteur-aide">Un assemblage porte un repère (position, angle), ses pièces et leurs liaisons ; les pièces sélectionnées y entrent, posées là où elles sont.</p>
      <div className="champ"><label htmlFor="outil-nomAssemblage">Nom</label><input id="outil-nomAssemblage" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-assemblage-nom /></div>
      <div className="champ"><label htmlFor="outil-numeroAssemblage">Numéro</label><input id="outil-numeroAssemblage" value={numero} maxLength={40} placeholder="préfixe de numérotation" onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <p className="inspecteur-meta">{pieces.length} pièce(s) libre(s) sélectionnée(s)</p>
      <div className="boutons"><button type="button" data-assemblage-creer disabled={readOnly || !onCommandes || !ui.niveauId} onClick={creer}>Créer l'assemblage</button></div>
    </section>
  );
}

const V = ({ id, libelle, valeur, onChange }: { id: string; libelle: string; valeur: { x: number; y: number; z: number }; onChange: (v: { x: number; y: number; z: number }) => void }) => (
  <div className="champ champ-vecteur">
    <label htmlFor={`${id}-x`}>{libelle}</label>
    <span className="vecteur">
      {(["x", "y", "z"] as const).map((k) => (
        <input key={k} id={`${id}-${k}`} type="number" step="any" aria-label={`${libelle} ${k}`} value={valeur[k]} onChange={(e) => onChange({ ...valeur, [k]: Number(e.target.value) })} onKeyDown={(e) => e.stopPropagation()} />
      ))}
    </span>
  </div>
);

/** Outil Liaison (DA-10-08 / 09) : deux pièces du même assemblage, un type, les références locales, la valeur pilotée. */
export function OutilLiaison({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const pieces = ui.selection.map((id) => etat.objets[id]).filter((o): o is Occurrence<"piece-mecanique"> => o?.classe === "piece-mecanique");
  const type = (ui.parametresOutil["typeLiaison"] as TypeLiaison | undefined) ?? "pivot";
  const poser = (k: string, v: unknown) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, [k]: v } }));
  const vec = (k: string, d: { x: number; y: number; z: number }) => (ui.parametresOutil[k] as { x: number; y: number; z: number } | undefined) ?? d;
  const refs = { pa: vec("liaisonPa", { x: 0, y: 0, z: 0 }), da: vec("liaisonDa", { x: 0, y: 0, z: 1 }), ea: vec("liaisonEa", { x: 1, y: 0, z: 0 }), pb: vec("liaisonPb", { x: 0, y: 0, z: 0 }), db: vec("liaisonDb", { x: 0, y: 0, z: 1 }), eb: vec("liaisonEb", { x: 1, y: 0, z: 0 }) };
  const valeur = (ui.parametresOutil["valeurLiaison"] as number | undefined) ?? 0;
  const pilotage = PILOTAGE[type];
  let message: string | null = null;
  if (pieces.length !== 2) message = "Sélectionnez exactement deux pièces mécaniques (Maj + clic).";
  else if (!pieces[0]!.params.assemblageId || pieces[0]!.params.assemblageId !== pieces[1]!.params.assemblageId) message = "Les deux pièces doivent appartenir au même assemblage.";
  const creer = () => {
    if (!onCommandes || message) return;
    const [a, b] = pieces as [Occurrence<"piece-mecanique">, Occurrence<"piece-mecanique">];
    onCommandes([{ type: "liaison.creer", params: { type, a: a.id, b: b.id, ...refs, ...(pilotage ? { valeur } : {}) } }], `${LIBELLES_LIAISON[type]} ${a.params.nom} / ${b.params.nom}`);
  };
  return (
    <section className="outil-mecanique" aria-label="Liaison" data-outil-liaison>
      <div className="champ">
        <label htmlFor="outil-typeLiaison">Liaison</label>
        <select id="outil-typeLiaison" value={type} onChange={(e) => poser("typeLiaison", e.target.value)}>
          {TYPES_LIAISON.map((t) => <option key={t} value={t}>{LIBELLES_LIAISON[t]} ({DDL_LIAISON[t]} ddl)</option>)}
        </select>
      </div>
      <p className="inspecteur-aide">Références dans le repère de chaque pièce : point, axe (direction principale), direction secondaire (angle ou guidage). La première pièce sélectionnée est A, la seconde B.</p>
      {message ? <p className="inspecteur-alerte" role="note" data-liaison-message>{message}</p> : <p className="inspecteur-meta" data-liaison-pret>A : {pieces[0]!.params.nom} · B : {pieces[1]!.params.nom}</p>}
      <details className="inspecteur-proprietes">
        <summary>Références géométriques</summary>
        <V id="outil-liaisonPa" libelle="Point A" valeur={refs.pa} onChange={(v) => poser("liaisonPa", v)} />
        <V id="outil-liaisonDa" libelle="Axe A" valeur={refs.da} onChange={(v) => poser("liaisonDa", v)} />
        <V id="outil-liaisonEa" libelle="Direction A" valeur={refs.ea} onChange={(v) => poser("liaisonEa", v)} />
        <V id="outil-liaisonPb" libelle="Point B" valeur={refs.pb} onChange={(v) => poser("liaisonPb", v)} />
        <V id="outil-liaisonDb" libelle="Axe B" valeur={refs.db} onChange={(v) => poser("liaisonDb", v)} />
        <V id="outil-liaisonEb" libelle="Direction B" valeur={refs.eb} onChange={(v) => poser("liaisonEb", v)} />
      </details>
      {pilotage && (
        <div className="champ">
          <label htmlFor="outil-valeurLiaison">{pilotage.libelle} ({pilotage.unite === "deg" ? "°" : "m"})</label>
          <input id="outil-valeurLiaison" type="number" step="any" value={valeur} onChange={(e) => poser("valeurLiaison", Number(e.target.value))} onKeyDown={(e) => e.stopPropagation()} data-liaison-valeur />
        </div>
      )}
      <div className="boutons"><button type="button" data-liaison-creer disabled={readOnly || !onCommandes || !!message} onClick={creer}>Créer la liaison</button></div>
    </section>
  );
}

export function FichePieceMecanique({ o, etat }: { o: Occurrence<"piece-mecanique">; etat: ModeleAtelier }) {
  const asm = o.params.assemblageId ? etat.objets[o.params.assemblageId] : undefined;
  const liaisons = (Object.values(etat.objets) as OccurrenceQuelconque[]).filter((l): l is Occurrence<"liaison"> => l.classe === "liaison" && (l.params.a === o.id || l.params.b === o.id));
  const p = o.params.pose;
  const angle = (Math.hypot(p.rx, p.ry, p.rz) * 180) / Math.PI;
  return (
    <div className="fiche-mecanique" data-fiche-piece>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Référence</dt><dd data-piece-reference>{o.params.reference ?? "non numérotée"}{o.params.numero !== null ? ` (n° ${o.params.numero})` : ""}</dd></div>
        <div className="champ"><dt>Assemblage</dt><dd>{asm && asm.classe === "assemblage" ? asm.params.nom : "aucun (pièce libre)"}{o.params.fixe ? " · fixe" : ""}</dd></div>
        <div className="champ"><dt>Matériau</dt><dd>{o.params.materiau ?? "non évalué"}</dd></div>
        <div className="champ"><dt>Volume</dt><dd data-piece-volume>{o.params.volume === null ? "non évalué" : `${fmt(o.params.volume)} m³`}</dd></div>
        <div className="champ"><dt>Masse</dt><dd>non évaluée (aucune densité sourcée)</dd></div>
        <div className="champ"><dt>Pose</dt><dd data-piece-pose>({fmt(p.x)} ; {fmt(p.y)} ; {fmt(p.z)}) m · {fmt(angle, 1)}°</dd></div>
        <div className="champ"><dt>Source</dt><dd>{o.params.sourceId ?? "—"}{o.params.empreinteBrep ? <> · brep <code>{o.params.empreinteBrep}</code></> : null}</dd></div>
        <div className="champ"><dt>Liaisons</dt><dd>{liaisons.length ? liaisons.map((l) => `${LIBELLES_LIAISON[l.params.type]} (${l.id})`).join(", ") : "aucune"}</dd></div>
      </dl>
      <p className="inspecteur-aide">Géométrie copiée de sa source : elle se refait par une nouvelle pièce, jamais par un paramètre ; la pose vient du solveur quand une liaison la tient.</p>
    </div>
  );
}

export function FicheAssemblage({ o, etat, readOnly, onCommandes }: { o: Occurrence<"assemblage">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const pieces = piecesDe(etat, o.id);
  const liaisons = liaisonsDe(etat, o.id);
  return (
    <div className="fiche-mecanique" data-fiche-assemblage>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Pièces</dt><dd data-assemblage-pieces>{pieces.length}{pieces.length ? ` : ${pieces.map((p) => `${p.params.numero !== null ? `${p.params.numero}. ` : ""}${p.params.nom}`).join(", ")}` : ""}</dd></div>
        <div className="champ"><dt>Liaisons</dt><dd>{liaisons.length}</dd></div>
        <div className="champ"><dt>Diagnostic du solveur</dt><dd data-assemblage-diagnostic>{o.params.diagnostic ?? "aucune liaison"}</dd></div>
        <div className="champ"><dt>Repère</dt><dd>({fmt(o.params.position.x)} ; {fmt(o.params.position.y)}) m · {fmt(o.params.angle.value, 2)}° · z {fmt(o.params.z)} m</dd></div>
      </dl>
      {liaisons.map((l) => <PilotageLiaison key={l.id} l={l} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />)}
      <div className="boutons">
        <button type="button" data-assemblage-numeroter disabled={readOnly || !onCommandes || !pieces.length} onClick={() => onCommandes?.([{ type: "assemblage.numeroter", params: { id: o.id } }], `Numéroter ${o.params.nom}`)}>Numéroter les pièces</button>
      </div>
      <p className="inspecteur-aide">Nomenclature : mode Documents → tableau « Nomenclature des assemblages » ; éclaté : vue axonométrique avec l'option « éclaté » sur cet assemblage.</p>
    </div>
  );
}

function PilotageLiaison({ l, etat, readOnly, onCommandes }: { l: Occurrence<"liaison">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const pilotage = PILOTAGE[l.params.type];
  const [valeur, setValeur] = useState(String(l.params.valeur ?? 0));
  const a = etat.objets[l.params.a], b = etat.objets[l.params.b];
  const appliquer = () => {
    const v = Number(valeur.replace(",", "."));
    if (!Number.isFinite(v) || !onCommandes) return;
    onCommandes([{ type: "liaison.piloter", params: { id: l.id, valeur: v } }], `${LIBELLES_LIAISON[l.params.type]} : ${pilotage?.libelle.toLowerCase() ?? "valeur"} ${v}`);
  };
  return (
    <div className="champ" data-liaison={l.id}>
      <dt>{LIBELLES_LIAISON[l.params.type]} {a ? nomDe(a) : l.params.a} / {b ? nomDe(b) : l.params.b}</dt>
      <dd>
        {pilotage ? (
          <>
            <input type="number" step="any" aria-label={`${pilotage.libelle} de la liaison ${l.id}`} value={valeur} disabled={readOnly || !onCommandes} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") appliquer(); }} data-liaison-pilotage />
            <span> {pilotage.unite === "deg" ? "°" : "m"} </span>
            <button type="button" disabled={readOnly || !onCommandes} data-liaison-appliquer onClick={appliquer}>Appliquer</button>
          </>
        ) : <span>{l.params.ddl} ddl</span>}
        <span className="nav-detail"> · {l.params.etat ?? "non résolue"}</span>
      </dd>
    </div>
  );
}

export function FicheLiaison({ o, etat, readOnly, onCommandes }: { o: Occurrence<"liaison">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  return (
    <div className="fiche-mecanique" data-fiche-liaison>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Type</dt><dd>{LIBELLES_LIAISON[o.params.type]} · {o.params.ddl} ddl restant(s)</dd></div>
        <div className="champ"><dt>État</dt><dd data-liaison-etat>{o.params.etat ?? "non résolue"}</dd></div>
        <PilotageLiaison l={o} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      </dl>
    </div>
  );
}
