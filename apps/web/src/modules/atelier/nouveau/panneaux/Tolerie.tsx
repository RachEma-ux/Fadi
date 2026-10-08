/**
 * Ontologie tôlerie (P2-4, T01) : outil Tôle pliée dans l'inspecteur (face de base, épaisseur, rayon, matériau, plis,
 * paramètres de pliage : table sourcée du projet ou facteur K déclaré avec sa source), fiche avec le développé dessiné
 * (lignes de pli) et ses dimensions ; « non évalué » sans paramètre de pliage (R3).
 */
import { useState } from "react";
import { developpeTole, type Commande, type ModeleAtelier, type Occurrence, type Point2 } from "@parcours/atelier-model";
import { type EtatUi } from "../etat-ui";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 1) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;
const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, frame: "local", unit: "m" });
const mm = (v: string): { value: number; unit: "m" } | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? { value: n / 1000, unit: "m" } : null; };
const nombre = (v: string): number | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const BORDS = [["x1", "Bord x+ (fin de longueur)"], ["x0", "Bord x− (début de longueur)"], ["y1", "Bord y+"], ["y0", "Bord y−"]] as const;
type PliSaisi = { bord: string; angle: string; longueur: string; rayon: string };

function tables(etat: ModeleAtelier) {
  return Object.values(etat.definitions).filter((d) => d.classe === ("catalogue" as typeof d.classe)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

export function OutilTole({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [nom, setNom] = useState("");
  const [repere, setRepere] = useState("");
  const [L, setL] = useState(""); const [W, setW] = useState(""); const [t, setT] = useState(""); const [r, setR] = useState("");
  const [materiau, setMateriau] = useState("");
  const [plis, setPlis] = useState<PliSaisi[]>([{ bord: "x1", angle: "90", longueur: "", rayon: "" }]);
  const [modePliage, setModePliage] = useState<"aucun" | "table" | "k">(tables(etat).length ? "table" : "aucun");
  const [tableId, setTableId] = useState(tables(etat)[0]?.id ?? "");
  const [k, setK] = useState(""); const [kSource, setKSource] = useState("");
  const plisCmd = plis.filter((p) => p.longueur.trim()).map((p) => ({ bord: p.bord, angle: { value: nombre(p.angle) ?? 0, unit: "deg" }, longueur: mm(p.longueur), ...(mm(p.rayon) ? { rayon: mm(p.rayon) } : {}) }));
  const plisOk = plisCmd.every((p) => p.longueur && p.angle.value !== 0 && Math.abs(p.angle.value) <= 180) && new Set(plisCmd.map((p) => p.bord)).size === plisCmd.length;
  const pliage = modePliage === "table" && tableId ? { catalogueId: tableId } : modePliage === "k" && nombre(k) !== null && kSource.trim() ? { facteurK: nombre(k), source: kSource.trim() } : null;
  const pret = !!mm(L) && !!mm(W) && !!mm(t) && !!mm(r) && plisOk && (modePliage === "aucun" || !!pliage);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    onCommandes([{ type: "tole.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, repere: repere.trim() || null, position: P(ui.vue.cx, ui.vue.cy), longueur: mm(L), largeur: mm(W), epaisseur: mm(t), rayonInterieur: mm(r), materiau: materiau.trim() || null, plis: plisCmd, pliage } }], `Tôle ${nom.trim() || repere.trim()}`.trim());
  };
  return (
    <section className="outil-structure" aria-label="Tôle pliée" data-outil-tole>
      <p className="inspecteur-aide">Face de base posée au centre de la vue ; un pli par bord (angle signé, aile au-delà de la zone pliée) ; les paramètres de pliage viennent d'une table sourcée du projet ou d'un facteur K déclaré avec sa source — sans eux, le développé est « non évalué ».</p>
      <div className="champ"><label htmlFor="outil-nomTole">Nom</label><input id="outil-nomTole" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-nom /></div>
      <div className="champ"><label htmlFor="outil-repereTole">Repère</label><input id="outil-repereTole" value={repere} maxLength={40} onChange={(e) => setRepere(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-toleL">Longueur de la face (mm)</label><input id="outil-toleL" inputMode="decimal" value={L} onChange={(e) => setL(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-longueur /></div>
      <div className="champ"><label htmlFor="outil-toleW">Largeur de la face (mm)</label><input id="outil-toleW" inputMode="decimal" value={W} onChange={(e) => setW(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-largeur /></div>
      <div className="champ"><label htmlFor="outil-toleT">Épaisseur (mm)</label><input id="outil-toleT" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-epaisseur /></div>
      <div className="champ"><label htmlFor="outil-toleR">Rayon intérieur (mm)</label><input id="outil-toleR" inputMode="decimal" value={r} onChange={(e) => setR(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-rayon /></div>
      <div className="champ"><label htmlFor="outil-toleMat">Matériau (déclaré, tel que dans la table)</label><input id="outil-toleMat" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-materiau /></div>
      <fieldset className="editeur-section">
        <legend>Plis</legend>
        {plis.map((p, i) => (
          <div className="champ champ-vecteur" key={i}>
            <label htmlFor={`pli-${i}`}>Pli {i + 1}</label>
            <span className="vecteur">
              <select id={`pli-${i}`} aria-label="Bord" value={p.bord} onChange={(e) => setPlis(plis.map((x, j) => (j === i ? { ...x, bord: e.target.value } : x)))}>{BORDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <input aria-label="Angle (°)" inputMode="decimal" placeholder="angle °" value={p.angle} onChange={(e) => setPlis(plis.map((x, j) => (j === i ? { ...x, angle: e.target.value } : x)))} onKeyDown={(e) => e.stopPropagation()} data-pli-angle />
              <input aria-label="Aile (mm)" inputMode="decimal" placeholder="aile mm" value={p.longueur} onChange={(e) => setPlis(plis.map((x, j) => (j === i ? { ...x, longueur: e.target.value } : x)))} onKeyDown={(e) => e.stopPropagation()} data-pli-aile />
              <input aria-label="Rayon propre (mm)" inputMode="decimal" placeholder="rayon mm" value={p.rayon} onChange={(e) => setPlis(plis.map((x, j) => (j === i ? { ...x, rayon: e.target.value } : x)))} onKeyDown={(e) => e.stopPropagation()} />
            </span>
          </div>
        ))}
        <div className="boutons"><button type="button" disabled={plis.length >= 4} onClick={() => setPlis([...plis, { bord: BORDS.map(([v]) => v).find((v) => !plis.some((p) => p.bord === v)) ?? "y1", angle: "90", longueur: "", rayon: "" }])} data-pli-ajouter>Ajouter un pli</button></div>
      </fieldset>
      <fieldset className="editeur-section">
        <legend>Paramètres de pliage</legend>
        <div className="champ"><label htmlFor="outil-modePliage">Origine</label>
          <select id="outil-modePliage" value={modePliage} onChange={(e) => setModePliage(e.target.value as "aucun" | "table" | "k")} data-tole-mode-pliage>
            <option value="table" disabled={!tables(etat).length}>Table de pliage du projet{tables(etat).length ? "" : " (aucune importée)"}</option>
            <option value="k">Facteur K déclaré (avec sa source)</option>
            <option value="aucun">Aucun : développé non évalué</option>
          </select>
        </div>
        {modePliage === "table" && <div className="champ"><label htmlFor="outil-tablePliage">Table</label><select id="outil-tablePliage" value={tableId} onChange={(e) => setTableId(e.target.value)}>{tables(etat).map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>}
        {modePliage === "k" && (
          <>
            <div className="champ"><label htmlFor="outil-k">Facteur K (0 à 1)</label><input id="outil-k" inputMode="decimal" value={k} onChange={(e) => setK(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-k /></div>
            <div className="champ"><label htmlFor="outil-kSource">Source du facteur</label><input id="outil-kSource" value={kSource} maxLength={120} placeholder="essai, fiche atelier, édition" onChange={(e) => setKSource(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tole-k-source /></div>
          </>
        )}
      </fieldset>
      <div className="boutons"><button type="button" data-tole-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer la tôle</button></div>
    </section>
  );
}

/** Développé dessiné : contour à plat et lignes de pli, cotes d'encombrement. */
function DessinDeveloppe({ dev }: { dev: ReturnType<typeof developpeTole> }) {
  const xs = dev.contour.map((p) => p.x), ys = dev.contour.map((p) => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = Math.max(1e-6, x1 - x0), h = Math.max(1e-6, y1 - y0);
  const S = 220 / Math.max(w, h);
  const X = (x: number) => (x - x0) * S + 10, Y = (y: number) => (y1 - y) * S + 10;
  return (
    <svg className="developpe" viewBox={`0 0 ${w * S + 20} ${h * S + 20}`} width="100%" role="img" aria-label="Développé de la tôle" data-developpe>
      <path d={`${dev.contour.map((p, i) => `${i ? "L" : "M"}${X(p.x)},${Y(p.y)}`).join(" ")} Z`} fill="#dfe4e8" stroke="#3f4a55" strokeWidth={1} />
      {dev.lignesPli.map((l, i) => <line key={i} x1={X(l.a.x)} y1={Y(l.a.y)} x2={X(l.b.x)} y2={Y(l.b.y)} stroke="#8a5a00" strokeWidth={0.8} strokeDasharray="4 2" data-ligne-pli />)}
    </svg>
  );
}

export function FicheTole({ o, etat, readOnly, onCommandes }: { o: Occurrence<"tole">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const dev = developpeTole(etat, o);
  const evalue = dev.nonEvalues.length === 0;
  const pliage = o.params.pliage ? ("catalogueId" in o.params.pliage ? `table ${etat.definitions[o.params.pliage.catalogueId]?.nom ?? o.params.pliage.catalogueId}` : `K = ${o.params.pliage.facteurK} (${o.params.pliage.source})`) : "aucun";
  return (
    <div className="fiche-structure" data-fiche-tole>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Face de base</dt><dd>{Math.round(o.params.longueur.value * 1000)} × {Math.round(o.params.largeur.value * 1000)} mm · e {fmt(o.params.epaisseur.value * 1000)} mm · r {fmt(o.params.rayonInterieur.value * 1000)} mm</dd></div>
        <div className="champ"><dt>Matériau</dt><dd>{o.params.materiau ?? "non évalué"}</dd></div>
        <div className="champ"><dt>Plis</dt><dd data-tole-plis>{o.params.plis.length ? o.params.plis.map((p) => `${p.bord} : ${fmt(p.angle.value)}°, aile ${Math.round(p.longueur.value * 1000)} mm`).join(" ; ") : "aucun"}</dd></div>
        <div className="champ"><dt>Paramètres de pliage</dt><dd>{pliage}</dd></div>
        <div className="champ"><dt>Développé</dt><dd data-tole-developpe>{evalue ? `${fmt(dev.encombrement.longueur * 1000)} × ${fmt(dev.encombrement.largeur * 1000)} mm · ${fmt(dev.aire, 4)} m²` : `non évalué (paramètres de pliage absents pour ${dev.nonEvalues.join(", ")})`}</dd></div>
      </dl>
      {evalue && o.params.plis.length > 0 && <DessinDeveloppe dev={dev} />}
      <div className="boutons">
        {o.params.plis.map((p) => <button key={p.bord} type="button" disabled={readOnly || !onCommandes} data-tole-deplier={p.bord} onClick={() => onCommandes?.([{ type: "tole.deplier", params: { id: o.id, bord: p.bord } }], `Retirer le pli ${p.bord}`)}>Retirer le pli {p.bord}</button>)}
      </div>
      <p className="inspecteur-aide">Table de pliage et développés : mode Documents → tableau « Table de pliage et développés ».</p>
    </div>
  );
}
