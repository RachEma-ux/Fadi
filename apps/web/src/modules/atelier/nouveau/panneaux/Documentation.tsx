/**
 * Documentation et relevé P2 (P2-7) : annotations de fabrication (tolérance géométrique, soudure, état de surface,
 * symbole spécialiste) dans l'inspecteur, cote mécanique (préfixe, tolérance) et étiquette intelligente (gabarit)
 * dans les fiches, nuage de points (LAS / XYZ / PTS lu par le serveur, origine déclarée) avec sa tranche de relevé.
 * Aucune valeur de tolérance, de rugosité ni de repère n'est supposée.
 */
import { useState } from "react";
import { champObjet, LIBELLES_CARACTERISTIQUE, LIBELLES_CORDON, texteAnnotation, texteCotation, texteEtiquette, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { type EtatUi } from "../etat-ui";
import { api, ApiError } from "../../../../lib/api";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
const nomDe = (o: OccurrenceQuelconque) => ((o.params as unknown as { nom?: string | null }).nom ?? null) || o.id;
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;
type Props = { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes };
const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, frame: "local", unit: "m" });
const nombre = (v: string): number | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const mmVers = (v: string): { value: number; unit: "m" } | null => { const n = nombre(v); return n !== null && n > 0 ? { value: n / 1000, unit: "m" } : null; };
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const Champ = ({ id, libelle, valeur, onChange, data, desactive }: { id: string; libelle: string; valeur: string; onChange: (v: string) => void; data?: string; desactive?: boolean }) => (
  <div className="champ"><label htmlFor={id}>{libelle}</label><input id={id} value={valeur} disabled={desactive} onChange={(e) => onChange(e.target.value)} onKeyDown={stop} {...(data ? { [data]: "" } : {})} /></div>
);

/** Point de référence d'un objet sélectionné (attache de la flèche) : position, centre d'un axe, premier sommet d'un contour. */
function pointDe(o: OccurrenceQuelconque): Point2 | null {
  const p = o.params as unknown as Record<string, unknown>;
  if (p["position"] && typeof p["position"] === "object") return p["position"] as Point2;
  if (p["a"] && p["b"] && typeof p["a"] === "object") { const a = p["a"] as Point2, b = p["b"] as Point2; return P((a.x + b.x) / 2, (a.y + b.y) / 2); }
  if (Array.isArray(p["contour"]) && (p["contour"] as Point2[]).length) { const c = p["contour"] as Point2[]; return P(c.reduce((s, q) => s + q.x, 0) / c.length, c.reduce((s, q) => s + q.y, 0) / c.length); }
  if (p["point"] && typeof p["point"] === "object") return p["point"] as Point2;
  return null;
}

export function OutilAnnotationFabrication({ etat, ui, readOnly, onCommandes }: Props) {
  const cible = ui.selection.map((id) => etat.objets[id]).find((o): o is OccurrenceQuelconque => !!o) ?? null;
  const attache = cible ? pointDe(cible) : null;
  const [type, setType] = useState("tolerance-geometrique");
  const [carac, setCarac] = useState("planeite"); const [valeur, setValeur] = useState("0,05"); const [refs, setRefs] = useState("A");
  const [cordon, setCordon] = useState("angle"); const [taille, setTaille] = useState("5"); const [longueur, setLongueur] = useState(""); const [cote, setCote] = useState("fleche"); const [peri, setPeri] = useState(false); const [chantier, setChantier] = useState(false); const [procede, setProcede] = useState("");
  const [parametre, setParametre] = useState("Ra"); const [rugosite, setRugosite] = useState("3,2"); const [stries, setStries] = useState("");
  const [famille, setFamille] = useState(""); const [texte, setTexte] = useState("");
  const [z, setZ] = useState("");
  const position = attache ? P(attache.x + 0.6, attache.y + 0.6) : P(ui.vue.cx, ui.vue.cy);
  const params = (): Record<string, unknown> | null => {
    const commun = { niveauId: cible?.niveauId ?? ui.niveauId, objetId: cible?.id ?? null, position, attache, z: z.trim() ? nombre(z) : null };
    if (type === "tolerance-geometrique") { const v = mmVers(valeur); return v ? { ...commun, type, caracteristique: carac, valeur: v, references: refs.split(/[\s,;]+/).map((r) => r.trim().toUpperCase()).filter(Boolean) } : null; }
    if (type === "soudure") return { ...commun, type, cordon, taille: taille.trim() ? mmVers(taille) : null, longueur: longueur.trim() ? mmVers(longueur) : null, cote, peripherique: peri, chantier, procede: procede.trim() || null };
    if (type === "etat-de-surface") { const r = nombre(rugosite); return r !== null && r > 0 ? { ...commun, type, parametre, valeur: r, procede: procede.trim() || null, stries: stries.trim() || null } : null; }
    return famille.trim() && texte.trim() ? { ...commun, type, famille: famille.trim(), texte: texte.trim() } : null;
  };
  const pret = params();
  const apercu = pret ? texteAnnotation(pret as never) : null;
  return (
    <section className="outil-structure" aria-label="Annotation de fabrication" data-outil-annotation-fabrication>
      <p className="inspecteur-aide">Sélectionnez l'objet annoté (la flèche s'y attache) ; le symbole est dessiné dans les vues à partir des seules valeurs saisies ; aucune tolérance ni rugosité n'est supposée.</p>
      <p className="inspecteur-meta" data-annotation-cible>Objet : {cible ? nomDe(cible) : "aucun (annotation libre, posée au centre de la vue)"}</p>
      <div className="champ"><label htmlFor="outil-afType">Type</label><select id="outil-afType" value={type} onChange={(e) => setType(e.target.value)} data-annotation-type><option value="tolerance-geometrique">Tolérance géométrique (cadre)</option><option value="soudure">Symbole de soudure</option><option value="etat-de-surface">État de surface</option><option value="specialiste">Symbole spécialiste</option></select></div>
      {type === "tolerance-geometrique" && (
        <>
          <div className="champ"><label htmlFor="outil-afCarac">Caractéristique</label><select id="outil-afCarac" value={carac} onChange={(e) => setCarac(e.target.value)} data-annotation-caracteristique>{Object.entries(LIBELLES_CARACTERISTIQUE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <Champ id="outil-afValeur" libelle="Valeur de tolérance (mm)" valeur={valeur} onChange={setValeur} data="data-annotation-valeur" />
          <Champ id="outil-afRefs" libelle="Références (lettres, séparées par des espaces)" valeur={refs} onChange={setRefs} data="data-annotation-references" />
        </>
      )}
      {type === "soudure" && (
        <>
          <div className="champ"><label htmlFor="outil-afCordon">Cordon</label><select id="outil-afCordon" value={cordon} onChange={(e) => setCordon(e.target.value)} data-annotation-cordon>{Object.entries(LIBELLES_CORDON).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <Champ id="outil-afTaille" libelle="Gorge ou taille a (mm ; vide : non évaluée)" valeur={taille} onChange={setTaille} data="data-annotation-taille" />
          <Champ id="outil-afLongueur" libelle="Longueur du cordon (mm ; vide : continue)" valeur={longueur} onChange={setLongueur} />
          <div className="champ"><label htmlFor="outil-afCote">Côté</label><select id="outil-afCote" value={cote} onChange={(e) => setCote(e.target.value)}><option value="fleche">Côté flèche</option><option value="oppose">Côté opposé</option><option value="deux-cotes">Deux côtés</option></select></div>
          <label className="case"><input type="checkbox" checked={peri} onChange={(e) => setPeri(e.target.checked)} /> Soudure périphérique</label>
          <label className="case"><input type="checkbox" checked={chantier} onChange={(e) => setChantier(e.target.checked)} /> Soudure de chantier</label>
          <Champ id="outil-afProcede" libelle="Procédé (déclaré, facultatif)" valeur={procede} onChange={setProcede} />
        </>
      )}
      {type === "etat-de-surface" && (
        <>
          <div className="champ"><label htmlFor="outil-afParam">Paramètre</label><select id="outil-afParam" value={parametre} onChange={(e) => setParametre(e.target.value)}><option value="Ra">Ra</option><option value="Rz">Rz</option><option value="Rt">Rt</option></select></div>
          <Champ id="outil-afRugosite" libelle="Valeur (µm)" valeur={rugosite} onChange={setRugosite} data="data-annotation-rugosite" />
          <Champ id="outil-afProcede2" libelle="Procédé (déclaré, facultatif)" valeur={procede} onChange={setProcede} />
          <Champ id="outil-afStries" libelle="Direction des stries (facultatif)" valeur={stries} onChange={setStries} />
        </>
      )}
      {type === "specialiste" && (
        <>
          <Champ id="outil-afFamille" libelle="Famille (contrôle, marquage, traitement…)" valeur={famille} onChange={setFamille} data="data-annotation-famille" />
          <Champ id="outil-afTexte" libelle="Texte" valeur={texte} onChange={setTexte} data="data-annotation-texte" />
        </>
      )}
      <Champ id="outil-afZ" libelle="Altitude (m ; vide : annotation de plan ; renseignée : dessinée aussi en axonométrie)" valeur={z} onChange={setZ} />
      {apercu && <p className="inspecteur-meta" data-annotation-apercu>{apercu}</p>}
      <div className="boutons"><button type="button" data-annotation-creer disabled={readOnly || !onCommandes || !pret} onClick={() => pret && onCommandes?.([{ type: "annotationFabrication.creer", params: pret }], `Annotation ${type}`)}>Créer l'annotation</button></div>
    </section>
  );
}

export function FicheAnnotationFabrication({ o, etat }: { o: Occurrence<"annotation-fabrication">; etat: ModeleAtelier }) {
  const cible = o.params.objetId ? etat.objets[o.params.objetId] : undefined;
  const t = o.params;
  return (
    <div className="fiche-mecanique" data-fiche-annotation-fabrication={t.type}>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Texte dérivé</dt><dd data-annotation-texte-derive>{texteAnnotation(t)}</dd></div>
        <div className="champ"><dt>Type</dt><dd>{t.type === "tolerance-geometrique" ? `Tolérance géométrique · ${LIBELLES_CARACTERISTIQUE[t.caracteristique]}` : t.type === "soudure" ? `Soudure · ${LIBELLES_CORDON[t.cordon]}` : t.type === "etat-de-surface" ? `État de surface · ${t.parametre}` : `Symbole spécialiste · ${t.famille}`}</dd></div>
        <div className="champ"><dt>Objet annoté</dt><dd>{cible ? nomDe(cible) : "aucun"}</dd></div>
        <div className="champ"><dt>Altitude</dt><dd>{t.z === null ? "annotation de plan" : `${fmt(t.z)} m (dessinée aussi en axonométrie)`}</dd></div>
      </dl>
      <p className="inspecteur-aide">Symbole tracé en primitives dans les vues (cadre, flèche, ligne de référence) ; texte porté en IFC (IfcAnnotation .SYMBOL.) et en DXF.</p>
    </div>
  );
}

/** Cote mécanique (DA-15-03, 12) : préfixe et tolérance saisis dans la fiche de la cotation. */
export function FicheCotationMecanique({ o, readOnly, onCommandes }: { o: Occurrence<"cotation">; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [prefixe, setPrefixe] = useState(o.params.prefixe ?? "");
  const [plus, setPlus] = useState(o.params.tolerance ? String(o.params.tolerance.plus * 1000).replace(".", ",") : "");
  const [moins, setMoins] = useState(o.params.tolerance ? String(o.params.tolerance.moins * 1000).replace(".", ",") : "");
  const L = Math.hypot(o.params.b.x - o.params.a.x, o.params.b.y - o.params.a.y);
  const p = nombre(plus), mo = nombre(moins);
  const tol = plus.trim() || moins.trim() ? (p !== null && mo !== null && p >= 0 && mo >= 0 ? { plus: p / 1000, moins: mo / 1000 } : undefined) : null;
  const apercu = tol === undefined ? null : texteCotation({ prefixe: (prefixe || null) as never, tolerance: tol }, L);
  return (
    <fieldset className="editeur-section" data-cotation-mecanique>
      <legend>Cote mécanique (préfixe, tolérance en mm)</legend>
      <div className="champ"><label htmlFor={`cm-p-${o.id}`}>Préfixe</label><select id={`cm-p-${o.id}`} value={prefixe} disabled={readOnly || !onCommandes} onChange={(e) => setPrefixe(e.target.value)} data-cotation-prefixe><option value="">aucun</option><option value="Ø">Ø diamètre</option><option value="R">R rayon</option><option value="□">□ carré</option><option value="M">M filetage</option></select></div>
      <Champ id={`cm-plus-${o.id}`} libelle="Écart supérieur (mm, ≥ 0)" valeur={plus} onChange={setPlus} data="data-cotation-plus" desactive={readOnly || !onCommandes} />
      <Champ id={`cm-moins-${o.id}`} libelle="Écart inférieur (mm, ≥ 0)" valeur={moins} onChange={setMoins} data="data-cotation-moins" desactive={readOnly || !onCommandes} />
      {apercu && <p className="inspecteur-meta" data-cotation-apercu>{apercu}</p>}
      <div className="boutons"><button type="button" data-cotation-appliquer disabled={readOnly || !onCommandes || tol === undefined} onClick={() => onCommandes?.([{ type: "objet.modifier", params: { id: o.id, params: { prefixe: prefixe || null, tolerance: tol } } }], "Cote mécanique")}>Appliquer</button></div>
    </fieldset>
  );
}

const CHAMPS = [["nom", "{nom}"], ["repere", "{repere}"], ["numero", "{numero}"], ["classe", "{classe}"], ["niveau", "{niveau}"], ["section", "{section}"], ["longueur", "{longueur}"], ["volume", "{volume}"]] as const;

/** Étiquette intelligente (DA-15-08) : gabarit lu sur l'objet visé ; aperçu du texte dérivé. */
export function FicheEtiquetteIntelligente({ o, etat, readOnly, onCommandes }: { o: Occurrence<"etiquette">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [champ, setChamp] = useState(o.params.champ ?? "");
  const cible = o.params.objetId ? etat.objets[o.params.objetId] : undefined;
  const apercu = cible && champ.trim() ? texteEtiquette(etat, { ...o, params: { ...o.params, champ } }) : null;
  return (
    <fieldset className="editeur-section" data-etiquette-intelligente>
      <legend>Étiquette intelligente (gabarit lu sur l'objet)</legend>
      {!cible && <p className="inspecteur-aide">Étiquette libre : rattachez-la à un objet pour lire ses champs.</p>}
      <div className="champ"><label htmlFor={`ei-${o.id}`}>Gabarit</label><input id={`ei-${o.id}`} value={champ} disabled={readOnly || !onCommandes || !cible} placeholder="{nom} · {section} · {longueur}" onChange={(e) => setChamp(e.target.value)} onKeyDown={stop} data-etiquette-champ /></div>
      {cible && <p className="inspecteur-aide">Champs : {CHAMPS.map(([k, g]) => `${g}${champObjet(etat, cible, k) === null ? " (non évalué)" : ""}`).join(" ")}</p>}
      {apercu && <p className="inspecteur-meta" data-etiquette-apercu>{apercu}</p>}
      <div className="boutons"><button type="button" data-etiquette-appliquer disabled={readOnly || !onCommandes || !cible} onClick={() => onCommandes?.([{ type: "objet.modifier", params: { id: o.id, params: { champ: champ.trim() || null } } }], "Étiquette intelligente")}>Appliquer</button></div>
    </fieldset>
  );
}

export function OutilNuageDePoints({ etat, ui, readOnly, projectId, onRelire }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; projectId: string | null; onRelire?: (revision: number) => Promise<void> | void }) {
  const [fichier, setFichier] = useState<File | null>(null);
  const [nom, setNom] = useState(""); const [ox, setOx] = useState("0"); const [oy, setOy] = useState("0"); const [oz, setOz] = useState("0"); const [coupe, setCoupe] = useState("1.2"); const [plafond, setPlafond] = useState("20000");
  const [message, setMessage] = useState<string | null>(null); const [erreur, setErreur] = useState<string | null>(null); const [enCours, setEnCours] = useState(false);
  const niveau = ui.niveauId ? etat.niveaux[ui.niveauId] : null;
  const pret = !!fichier && !!niveau && nombre(ox) !== null && nombre(oy) !== null && nombre(oz) !== null && !!projectId;
  const importer = async () => {
    if (!pret || !fichier || !projectId || !ui.niveauId) return;
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const r = await api.importAtelierNuage(projectId, fichier, fichier.name, { niveauId: ui.niveauId, origine: { x: nombre(ox)!, y: nombre(oy)!, z: nombre(oz)! }, nom: nom.trim() || undefined, coupeZ: coupe.trim() ? nombre(coupe) : null, points: nombre(plafond) ?? undefined });
      await onRelire?.(r.revision);
      setMessage(`${r.lecture.format.toUpperCase()}${r.lecture.version ? ` ${r.lecture.version}` : ""} : ${r.lecture.nombrePoints} points lus, ${r.lecture.retenus} retenus (un sur ${r.lecture.pas}).${r.lecture.avertissements.length ? ` ${r.lecture.avertissements.join(" ")}` : ""}`);
      setFichier(null);
    } catch (e) { setErreur(e instanceof ApiError ? (e.serverMessage ?? e.code) : e instanceof Error ? e.message : String(e)); }
    setEnCours(false);
  };
  return (
    <section className="outil-structure" aria-label="Nuage de points" data-outil-nuage>
      <p className="inspecteur-aide">Fichier LAS (non compressé) ou XYZ / PTS texte, lu par le serveur et décimé ; l'origine déclarée ramène le repère du relevé dans le repère local du niveau (jamais devinée). E57 et LAZ ne sont pas lus (déclaré). Le nuage s'affiche derrière le modèle ; sa tranche sert à relever les plans.</p>
      <div className="champ"><label htmlFor="outil-nuageFichier">Fichier (.las, .xyz, .pts)</label><input id="outil-nuageFichier" type="file" accept=".las,.xyz,.pts,.txt" disabled={readOnly} data-nuage-fichier onChange={(e) => setFichier(e.currentTarget.files?.[0] ?? null)} /></div>
      <Champ id="outil-nuageNom" libelle="Nom" valeur={nom} onChange={setNom} data="data-nuage-nom" />
      <Champ id="outil-nuageOx" libelle="Origine x du relevé (m, soustraite)" valeur={ox} onChange={setOx} data="data-nuage-ox" />
      <Champ id="outil-nuageOy" libelle="Origine y du relevé (m, soustraite)" valeur={oy} onChange={setOy} data="data-nuage-oy" />
      <Champ id="outil-nuageOz" libelle="Origine z du relevé (m, soustraite)" valeur={oz} onChange={setOz} />
      <Champ id="outil-nuageCoupe" libelle="Tranche de relevé : altitude z (m ; vide : tout l'échantillon)" valeur={coupe} onChange={setCoupe} data="data-nuage-coupe" />
      <Champ id="outil-nuagePlafond" libelle="Points retenus au plus (100 à 20 000)" valeur={plafond} onChange={setPlafond} />
      <div className="boutons"><button type="button" data-nuage-importer disabled={readOnly || !pret || enCours} onClick={() => void importer()}>{enCours ? "Lecture…" : "Lire et poser le nuage"}</button></div>
      {message && <p className="inspecteur-meta" data-nuage-message>{message}</p>}
      {erreur && <p className="inspecteur-alerte" role="alert" data-nuage-erreur>{erreur}</p>}
    </section>
  );
}

export function FicheNuageDePoints({ o, readOnly, onCommandes }: { o: Occurrence<"nuage-de-points">; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [coupe, setCoupe] = useState(o.params.coupeZ === null ? "" : String(o.params.coupeZ).replace(".", ","));
  const [ep, setEp] = useState(String(o.params.epaisseurCoupe.value * 1000).replace(".", ","));
  const p = o.params;
  return (
    <div className="fiche-mecanique" data-fiche-nuage>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Source</dt><dd data-nuage-source>{p.source} ({p.format.toUpperCase()}) · {p.nombrePoints} points · échantillon {p.points.length} (un sur {p.pas})</dd></div>
        <div className="champ"><dt>Origine soustraite</dt><dd>({fmt(p.origine.x)} ; {fmt(p.origine.y)} ; {fmt(p.origine.z)}) m — déclarée</dd></div>
        <div className="champ"><dt>Bornes (local)</dt><dd>x {fmt(p.bornes.min.x, 2)} → {fmt(p.bornes.max.x, 2)} · y {fmt(p.bornes.min.y, 2)} → {fmt(p.bornes.max.y, 2)} · z {fmt(p.bornes.min.z, 2)} → {fmt(p.bornes.max.z, 2)} m</dd></div>
        <div className="champ"><dt>Tranche</dt><dd data-nuage-tranche>{p.coupeZ === null ? "tout l'échantillon" : `z ${fmt(p.coupeZ)} m ± ${fmt(p.epaisseurCoupe.value * 500, 0)} mm`}</dd></div>
      </dl>
      <Champ id={`nu-z-${o.id}`} libelle="Tranche : altitude z (m ; vide : tout)" valeur={coupe} onChange={setCoupe} data="data-nuage-coupe-fiche" desactive={readOnly || !onCommandes} />
      <Champ id={`nu-e-${o.id}`} libelle="Épaisseur de la tranche (mm)" valeur={ep} onChange={setEp} desactive={readOnly || !onCommandes} />
      <div className="boutons"><button type="button" data-nuage-trancher disabled={readOnly || !onCommandes || (!!coupe.trim() && nombre(coupe) === null) || !mmVers(ep)} onClick={() => onCommandes?.([{ type: "objet.modifier", params: { id: o.id, params: { coupeZ: coupe.trim() ? nombre(coupe) : null, epaisseurCoupe: mmVers(ep) } } }], "Tranche du nuage")}>Appliquer la tranche</button></div>
      <p className="inspecteur-aide">Relevé de plans : les points de la tranche servent à l'accrochage des outils de tracé ; aucune surface ni aucun mur n'en est déduit automatiquement.</p>
    </div>
  );
}
