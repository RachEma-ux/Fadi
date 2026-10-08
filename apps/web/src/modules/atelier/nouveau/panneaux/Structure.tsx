/**
 * Ontologie structure (P2-3, T01) : outils Élément, Trame, Plaque, Assemblage structurel, Soudure, Armature et
 * Coulage dans l'inspecteur (sélection → paramètres → aperçu → accord), fiches des objets de structure dans la fiche
 * d'objet ; aucun écran, aucun ruban. Rien n'est supposé : chaque dimension est saisie ou vient d'un catalogue sourcé
 * du projet (D-180) ; la masse n'existe que si la masse linéique est sourcée (R3).
 */
import { useState } from "react";
import { aireSection, designationSection, FORMES_SECTION, LIBELLES_FORME, longueurBarre, longueurPoutre, maillageObjet, nommerAxes, objetsDeTrame, planGeneration, volumeMaillage, type Commande, type FormeSection, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
const nomDe = (o: OccurrenceQuelconque) => ((o.params as unknown as { nom?: string | null }).nom ?? null) || o.id;
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;
const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, frame: "local", unit: "m" });
const mm = (v: string): { value: number; unit: "m" } | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? { value: n / 1000, unit: "m" } : null; };
const nombre = (v: string): number | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const MATERIAUX = [["acier", "Acier"], ["beton", "Béton"], ["bois", "Bois"], ["autre", "Autre (déclaré)"]] as const;
const ROLES = [["poutre", "Poutre"], ["longrine", "Longrine"], ["contreventement", "Contreventement"], ["tirant", "Tirant"], ["lisse", "Lisse"], ["panne", "Panne"], ["chevron", "Chevron"], ["diagonale", "Diagonale"]] as const;
const TYPES_ASSEMBLAGE = [["platine-about", "Platine d'about"], ["platine-pied", "Platine de pied"], ["gousset", "Gousset"], ["cornieres", "Cornières"], ["eclisse", "Éclisse"]] as const;
const TYPES_SOUDURE = [["angle", "Soudure d'angle"], ["bout-a-bout", "Bout à bout"], ["bouchon", "Bouchon"]] as const;
const FORMES_ARMATURE = [["droite", "Barre droite"], ["cadre", "Cadre"], ["etrier", "Étrier"], ["epingle", "Épingle"], ["u", "U"]] as const;
const ELEMENTS = ["poutre", "poteau", "plaque"];
const BETON = ["poutre", "poteau", "plaque", "dalle"];

const centreDe = (o: OccurrenceQuelconque): Point2 | null => {
  switch (o.classe) {
    case "poutre": return P((o.params.a.x + o.params.b.x) / 2, (o.params.a.y + o.params.b.y) / 2);
    case "poteau": return o.params.point;
    case "plaque": case "dalle": { const c = o.params.contour; return P(c.reduce((s, q) => s + q.x, 0) / c.length, c.reduce((s, q) => s + q.y, 0) / c.length); }
    default: return null;
  }
};
const zDe = (o: OccurrenceQuelconque): number => (o.classe === "poutre" ? o.params.za : o.classe === "plaque" ? o.params.z : 0);

function catalogues(etat: ModeleAtelier) {
  return Object.values(etat.definitions).filter((d) => d.classe === ("catalogue" as typeof d.classe)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Éditeur de section : saisie (forme et dimensions en mm) ou désignation d'un catalogue sourcé du projet. */
export type SectionSaisie = { mode: "saisie"; forme: FormeSection; largeur: string; hauteur: string; epaisseur: string; epaisseurAile: string } | { mode: "catalogue"; catalogueId: string; designation: string };
export const SECTION_DEFAUT: SectionSaisie = { mode: "saisie", forme: "rectangle", largeur: "", hauteur: "", epaisseur: "", epaisseurAile: "" };
export function sectionCommande(s: SectionSaisie): Record<string, unknown> | null {
  if (s.mode === "catalogue") return s.catalogueId && s.designation.trim() ? { catalogueId: s.catalogueId, designation: s.designation.trim() } : null;
  const largeur = mm(s.largeur), hauteur = s.forme === "cercle" ? largeur : mm(s.hauteur);
  if (!largeur || !hauteur) return null;
  const out: Record<string, unknown> = { forme: s.forme, largeur, hauteur };
  const ep = mm(s.epaisseur), ea = mm(s.epaisseurAile);
  if (ep) out["epaisseur"] = ep;
  if (ea) out["epaisseurAile"] = ea;
  return out;
}
export function EditeurSection({ id, etat, valeur, onChange }: { id: string; etat: ModeleAtelier; valeur: SectionSaisie; onChange: (s: SectionSaisie) => void }) {
  const cats = catalogues(etat);
  const avecEp = valeur.mode === "saisie" && ["I", "H", "T", "L", "U", "tube"].includes(valeur.forme);
  const avecAile = valeur.mode === "saisie" && ["I", "H", "T", "U"].includes(valeur.forme);
  return (
    <fieldset className="editeur-section" data-editeur-section={id}>
      <legend>Section</legend>
      <div className="champ">
        <label htmlFor={`${id}-mode`}>Origine</label>
        <select id={`${id}-mode`} value={valeur.mode} onChange={(e) => onChange(e.target.value === "catalogue" ? { mode: "catalogue", catalogueId: cats[0]?.id ?? "", designation: "" } : { ...SECTION_DEFAUT })}>
          <option value="saisie">Dimensions saisies</option>
          <option value="catalogue" disabled={!cats.length}>Catalogue sourcé du projet{cats.length ? "" : " (aucun importé)"}</option>
        </select>
      </div>
      {valeur.mode === "catalogue" ? (
        <>
          <div className="champ"><label htmlFor={`${id}-cat`}>Catalogue</label><select id={`${id}-cat`} value={valeur.catalogueId} onChange={(e) => onChange({ ...valeur, catalogueId: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
          <div className="champ"><label htmlFor={`${id}-des`}>Désignation</label><input id={`${id}-des`} value={valeur.designation} placeholder="telle qu'écrite dans le catalogue" data-section-designation onChange={(e) => onChange({ ...valeur, designation: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
        </>
      ) : (
        <>
          <div className="champ"><label htmlFor={`${id}-forme`}>Forme</label><select id={`${id}-forme`} value={valeur.forme} onChange={(e) => onChange({ ...valeur, forme: e.target.value as FormeSection })}>{FORMES_SECTION.map((f) => <option key={f} value={f}>{LIBELLES_FORME[f]}</option>)}</select></div>
          <div className="champ"><label htmlFor={`${id}-l`}>{valeur.forme === "cercle" ? "Diamètre (mm)" : "Largeur (mm)"}</label><input id={`${id}-l`} inputMode="decimal" value={valeur.largeur} data-section-largeur onChange={(e) => onChange({ ...valeur, largeur: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
          {valeur.forme !== "cercle" && <div className="champ"><label htmlFor={`${id}-h`}>Hauteur (mm)</label><input id={`${id}-h`} inputMode="decimal" value={valeur.hauteur} data-section-hauteur onChange={(e) => onChange({ ...valeur, hauteur: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>}
          {avecEp && <div className="champ"><label htmlFor={`${id}-e`}>Épaisseur d'âme ou de paroi (mm)</label><input id={`${id}-e`} inputMode="decimal" value={valeur.epaisseur} onChange={(e) => onChange({ ...valeur, epaisseur: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>}
          {avecAile && <div className="champ"><label htmlFor={`${id}-a`}>Épaisseur d'aile (mm)</label><input id={`${id}-a`} inputMode="decimal" value={valeur.epaisseurAile} onChange={(e) => onChange({ ...valeur, epaisseurAile: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>}
        </>
      )}
    </fieldset>
  );
}

function ChoixMateriau({ id, materiau, materiauNom, onChange }: { id: string; materiau: string; materiauNom: string; onChange: (m: string, n: string) => void }) {
  return (
    <>
      <div className="champ"><label htmlFor={`${id}-mat`}>Matériau</label><select id={`${id}-mat`} value={materiau} onChange={(e) => onChange(e.target.value, materiauNom)}>{MATERIAUX.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor={`${id}-nom`}>Nuance ou classe (déclarée)</label><input id={`${id}-nom`} value={materiauNom} maxLength={80} placeholder="nom seulement, aucune propriété inventée" onChange={(e) => onChange(materiau, e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
    </>
  );
}

/** Outil Élément de structure (DA-08-01 / 03) : axe entre deux poteaux sélectionnés, une ligne d'esquisse, ou deux points saisis. */
export function OutilPoutre({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const poteaux = sel.filter((o): o is Occurrence<"poteau"> => o.classe === "poteau");
  const ligne = sel.find((o): o is Occurrence<"esquisse"> => o.classe === "esquisse" && o.params.points.length >= 2);
  const defaut = poteaux.length >= 2 ? [poteaux[0]!.params.point, poteaux[1]!.params.point] : ligne ? [ligne.params.points[0]!, ligne.params.points[ligne.params.points.length - 1]!] : [P(ui.vue.cx - 3, ui.vue.cy), P(ui.vue.cx + 3, ui.vue.cy)];
  const [ax, setAx] = useState(String(defaut[0]!.x)); const [ay, setAy] = useState(String(defaut[0]!.y));
  const [bx, setBx] = useState(String(defaut[1]!.x)); const [by, setBy] = useState(String(defaut[1]!.y));
  const [za, setZa] = useState(poteaux[0]?.params.hauteur ? String(poteaux[0].params.hauteur.value) : "0");
  const [zb, setZb] = useState("");
  const [role, setRole] = useState("poutre");
  const [section, setSection] = useState<SectionSaisie>(SECTION_DEFAUT);
  const [materiau, setMateriau] = useState("acier");
  const [materiauNom, setMateriauNom] = useState("");
  const [nom, setNom] = useState("");
  const sec = sectionCommande(section);
  const a = nombre(ax) !== null && nombre(ay) !== null ? P(nombre(ax)!, nombre(ay)!) : null;
  const b = nombre(bx) !== null && nombre(by) !== null ? P(nombre(bx)!, nombre(by)!) : null;
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !sec || !a || !b) return;
    const z1 = nombre(za) ?? 0;
    onCommandes([{ type: "poutre.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, role, a, b, za: z1, zb: zb.trim() ? (nombre(zb) ?? z1) : z1, section: sec, materiau, materiauNom: materiauNom.trim() || null } }], `Élément de structure ${nom.trim() || role}`);
  };
  return (
    <section className="outil-structure" aria-label="Élément de structure" data-outil-poutre>
      <p className="inspecteur-aide">Sélectionnez deux poteaux (l'axe relie leurs têtes) ou une ligne d'esquisse, ou saisissez les deux extrémités ; la section est saisie en millimètres ou prise dans un catalogue sourcé du projet.</p>
      <div className="champ"><label htmlFor="outil-nomPoutre">Nom</label><input id="outil-nomPoutre" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-rolePoutre">Rôle</label><select id="outil-rolePoutre" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-poutre-ax">Début (x ; y) m</label><span className="vecteur"><input id="outil-poutre-ax" aria-label="Début x" value={ax} onChange={(e) => setAx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /><input aria-label="Début y" value={ay} onChange={(e) => setAy(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></span></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-poutre-bx">Fin (x ; y) m</label><span className="vecteur"><input id="outil-poutre-bx" aria-label="Fin x" value={bx} onChange={(e) => setBx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /><input aria-label="Fin y" value={by} onChange={(e) => setBy(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></span></div>
      <div className="champ"><label htmlFor="outil-poutre-za">Altitude de l'axe au début (m, depuis le niveau)</label><input id="outil-poutre-za" inputMode="decimal" value={za} onChange={(e) => setZa(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-poutre-zb">Altitude à la fin (vide : horizontal)</label><input id="outil-poutre-zb" inputMode="decimal" value={zb} onChange={(e) => setZb(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <EditeurSection id="outil-sectionPoutre" etat={etat} valeur={section} onChange={setSection} />
      <ChoixMateriau id="outil-poutre" materiau={materiau} materiauNom={materiauNom} onChange={(m, n) => { setMateriau(m); setMateriauNom(n); }} />
      {!sec && <p className="inspecteur-alerte" role="note" data-poutre-message>Section incomplète : indiquez la forme et ses dimensions, ou une désignation du catalogue.</p>}
      <div className="boutons"><button type="button" data-poutre-creer disabled={readOnly || !onCommandes || !ui.niveauId || !sec || !a || !b} onClick={creer}>Créer l'élément</button></div>
    </section>
  );
}

const lireAxes = (texte: string): number[] => texte.split(/\s*;\s*|\s+/).filter((x) => x.trim()).map((x) => Number(x.replace(",", "."))).filter((x) => Number.isFinite(x)); // « ; » ou espace sépare ; la virgule reste décimale

/** Outil Trame (DA-08-04 / 05) : origine, orientation, files et rangs ; la génération se fait depuis la fiche de la trame, après aperçu. */
export function OutilTrame({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const c = sel.map(centreDe).find((q): q is Point2 => !!q) ?? P(ui.vue.cx, ui.vue.cy);
  const [nom, setNom] = useState("");
  const [ox, setOx] = useState(String(c.x)); const [oy, setOy] = useState(String(c.y));
  const [angle, setAngle] = useState("0");
  const [files, setFiles] = useState("0 ; 6 ; 12");
  const [rangs, setRangs] = useState("0 ; 5");
  const f = lireAxes(files), r = lireAxes(rangs);
  const ok = f.length >= 1 && r.length >= 1 && nombre(ox) !== null && nombre(oy) !== null;
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !ok) return;
    onCommandes([{ type: "trame.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || "Trame", origine: P(nombre(ox)!, nombre(oy)!), angle: { value: nombre(angle) ?? 0, unit: "deg" }, files: nommerAxes(f, "file"), rangs: nommerAxes(r, "rang") } }], `Trame ${nom.trim() || "Trame"}`);
  };
  return (
    <section className="outil-structure" aria-label="Trame" data-outil-trame>
      <p className="inspecteur-aide">Files (A, B, C…) et rangs (1, 2, 3…) : positions en mètres depuis l'origine, séparées par « ; ». La trame ne crée rien d'elle-même : la génération des poteaux et des poutres se demande dans sa fiche, après aperçu.</p>
      <div className="champ"><label htmlFor="outil-nomTrame">Nom</label><input id="outil-nomTrame" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-trame-nom /></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-trame-ox">Origine (x ; y) m</label><span className="vecteur"><input id="outil-trame-ox" aria-label="Origine x" value={ox} onChange={(e) => setOx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /><input aria-label="Origine y" value={oy} onChange={(e) => setOy(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></span></div>
      <div className="champ"><label htmlFor="outil-trame-angle">Orientation (°)</label><input id="outil-trame-angle" inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-trame-files">Files (m)</label><input id="outil-trame-files" value={files} onChange={(e) => setFiles(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-trame-files /></div>
      <div className="champ"><label htmlFor="outil-trame-rangs">Rangs (m)</label><input id="outil-trame-rangs" value={rangs} onChange={(e) => setRangs(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-trame-rangs /></div>
      <p className="inspecteur-meta">{f.length} file(s) × {r.length} rang(s) = {f.length * r.length} intersection(s)</p>
      <div className="boutons"><button type="button" data-trame-creer disabled={readOnly || !onCommandes || !ui.niveauId || !ok} onClick={creer}>Créer la trame</button></div>
    </section>
  );
}

/** Fiche d'une trame : aperçu de la génération (comptes), paramètres, accord. */
export function FicheTrame({ o, etat, readOnly, onCommandes }: { o: Occurrence<"trame">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [poteaux, setPoteaux] = useState(true);
  const [poutres, setPoutres] = useState(true);
  const [hauteur, setHauteur] = useState("");
  const [formePoteau, setFormePoteau] = useState("rectangle");
  const [lPoteau, setLPoteau] = useState(""); const [pPoteau, setPPoteau] = useState(""); const [ePoteau, setEPoteau] = useState("");
  const [section, setSection] = useState<SectionSaisie>(SECTION_DEFAUT);
  const [materiau, setMateriau] = useState("acier");
  const [materiauNom, setMateriauNom] = useState("");
  const plan = planGeneration(o.params, { poteaux, poutres });
  const generes = objetsDeTrame(etat, o.id);
  const h = mm(hauteur) ? { value: Number(hauteur.replace(",", ".")), unit: "m" as const } : null;
  const sp = mm(lPoteau) && mm(pPoteau) ? { formeId: formePoteau, largeur: mm(lPoteau), profondeur: mm(pPoteau), ...(mm(ePoteau) ? { epaisseurProfil: mm(ePoteau) } : {}) } : null;
  const sec = sectionCommande(section);
  const pret = !!h && (!poteaux || !!sp) && (!poutres || !!sec) && (poteaux || poutres);
  const generer = () => {
    if (!onCommandes || !pret) return;
    onCommandes([{ type: "trame.generer", params: { id: o.id, poteaux, poutres, hauteur: h, materiau, materiauNom: materiauNom.trim() || null, ...(poteaux ? { sectionPoteau: sp } : {}), ...(poutres ? { sectionPoutre: sec } : {}) } }], `Générer la trame ${o.params.nom}`);
  };
  return (
    <div className="fiche-structure" data-fiche-trame>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Files</dt><dd>{o.params.files.map((f) => `${f.nom} (${fmt(f.position)})`).join(", ")}</dd></div>
        <div className="champ"><dt>Rangs</dt><dd>{o.params.rangs.map((r) => `${r.nom} (${fmt(r.position)})`).join(", ")}</dd></div>
        <div className="champ"><dt>Déjà généré</dt><dd data-trame-generes>{generes.length ? `${generes.filter((x) => x.classe === "poteau").length} poteau(x), ${generes.filter((x) => x.classe === "poutre").length} poutre(s)` : "rien"}</dd></div>
      </dl>
      <fieldset className="generation-trame">
        <legend>Génération contrôlée</legend>
        <label className="case"><input type="checkbox" checked={poteaux} onChange={(e) => setPoteaux(e.target.checked)} data-trame-poteaux /> Poteaux aux intersections</label>
        <label className="case"><input type="checkbox" checked={poutres} onChange={(e) => setPoutres(e.target.checked)} data-trame-poutres /> Poutres entre intersections voisines</label>
        <div className="champ"><label htmlFor={`trame-h-${o.id}`}>Hauteur des poteaux / altitude des poutres (m)</label><input id={`trame-h-${o.id}`} inputMode="decimal" value={hauteur} onChange={(e) => setHauteur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-trame-hauteur /></div>
        {poteaux && (
          <>
            <div className="champ"><label htmlFor={`trame-fp-${o.id}`}>Section des poteaux</label><select id={`trame-fp-${o.id}`} value={formePoteau} onChange={(e) => setFormePoteau(e.target.value)}><option value="rectangle">Rectangle</option><option value="cercle">Cercle</option><option value="I">Profilé I</option><option value="T">Profilé T</option><option value="L">Cornière L</option><option value="U">Profilé U</option></select></div>
            <div className="champ"><label htmlFor={`trame-lp-${o.id}`}>Largeur des poteaux (mm)</label><input id={`trame-lp-${o.id}`} inputMode="decimal" value={lPoteau} onChange={(e) => setLPoteau(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-trame-poteau-largeur /></div>
            <div className="champ"><label htmlFor={`trame-pp-${o.id}`}>Profondeur des poteaux (mm)</label><input id={`trame-pp-${o.id}`} inputMode="decimal" value={pPoteau} onChange={(e) => setPPoteau(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-trame-poteau-profondeur /></div>
            {formePoteau !== "rectangle" && formePoteau !== "cercle" && <div className="champ"><label htmlFor={`trame-ep-${o.id}`}>Épaisseur du profilé (mm)</label><input id={`trame-ep-${o.id}`} inputMode="decimal" value={ePoteau} onChange={(e) => setEPoteau(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>}
          </>
        )}
        {poutres && <EditeurSection id={`trame-sec-${o.id}`} etat={etat} valeur={section} onChange={setSection} />}
        <ChoixMateriau id={`trame-${o.id}`} materiau={materiau} materiauNom={materiauNom} onChange={(m, n) => { setMateriau(m); setMateriauNom(n); }} />
        <p className="inspecteur-meta" data-trame-apercu>Aperçu : {plan.poteaux.length} poteau(x), {plan.poutres.length} poutre(s) seront créés (ce qui existe déjà à la même place n'est pas recréé).</p>
        <div className="boutons"><button type="button" data-trame-generer disabled={readOnly || !onCommandes || !pret} onClick={generer}>Générer (accord)</button></div>
      </fieldset>
    </div>
  );
}

/** Outil Plaque (DA-08-09) : contour d'une esquisse fermée ou d'une dalle sélectionnée, épaisseur et base saisies. */
export function OutilPlaque({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const source = sel.find((o) => (o.classe === "esquisse" && ["polygone", "rectangle", "polyligne"].includes(o.params.forme) && o.params.points.length >= 3) || o.classe === "dalle" || o.classe === "plaque");
  const contour: Point2[] = source ? (source.classe === "esquisse" ? (source.params.forme === "rectangle" && source.params.points.length === 2 ? [source.params.points[0]!, P(source.params.points[1]!.x, source.params.points[0]!.y), source.params.points[1]!, P(source.params.points[0]!.x, source.params.points[1]!.y)] : source.params.points) : (source as Occurrence<"dalle" | "plaque">).params.contour) : [];
  const [nom, setNom] = useState("");
  const [epaisseur, setEpaisseur] = useState("");
  const [z, setZ] = useState("0");
  const [materiau, setMateriau] = useState("acier");
  const [materiauNom, setMateriauNom] = useState("");
  const ep = mm(epaisseur);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !ep || contour.length < 3) return;
    onCommandes([{ type: "plaque.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, contour, epaisseur: ep, z: nombre(z) ?? 0, materiau, materiauNom: materiauNom.trim() || null } }], `Plaque ${nom.trim() || ""}`.trim());
  };
  return (
    <section className="outil-structure" aria-label="Plaque" data-outil-plaque>
      <p className="inspecteur-aide">Sélectionnez une esquisse fermée (polygone, rectangle) ou une dalle : son contour devient la plaque, à l'épaisseur et à la base saisies.</p>
      {contour.length < 3 ? <p className="inspecteur-alerte" role="note" data-plaque-message>Aucun contour dans la sélection.</p> : <p className="inspecteur-meta" data-plaque-pret>Contour : {contour.length} sommets ({nomDe(source!)})</p>}
      <div className="champ"><label htmlFor="outil-nomPlaque">Nom</label><input id="outil-nomPlaque" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-epPlaque">Épaisseur (mm)</label><input id="outil-epPlaque" inputMode="decimal" value={epaisseur} onChange={(e) => setEpaisseur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-plaque-epaisseur /></div>
      <div className="champ"><label htmlFor="outil-zPlaque">Base (m, depuis le niveau)</label><input id="outil-zPlaque" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <ChoixMateriau id="outil-plaque" materiau={materiau} materiauNom={materiauNom} onChange={(m, n) => { setMateriau(m); setMateriauNom(n); }} />
      <div className="boutons"><button type="button" data-plaque-creer disabled={readOnly || !onCommandes || !ui.niveauId || !ep || contour.length < 3} onClick={creer}>Créer la plaque</button></div>
    </section>
  );
}

/** Outil Assemblage structurel (DA-08-10 / 12 / 13) : platine et boulons paramétriques entre les éléments sélectionnés — géométrie seulement. */
export function OutilAssemblageStructurel({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const elements = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o && ELEMENTS.includes(o.classe)).slice(0, 4);
  const poutre = elements.find((o): o is Occurrence<"poutre"> => o.classe === "poutre");
  const autre = elements.find((o) => o !== poutre);
  // Position par défaut : extrémité de la poutre la plus proche de l'autre élément, sinon centre du premier élément.
  let position = elements.length ? (centreDe(elements[0]!) ?? P(ui.vue.cx, ui.vue.cy)) : P(ui.vue.cx, ui.vue.cy);
  let angle = 0;
  if (poutre) {
    const c = autre ? centreDe(autre) : null;
    const dA = c ? Math.hypot(poutre.params.a.x - c.x, poutre.params.a.y - c.y) : 0, dB = c ? Math.hypot(poutre.params.b.x - c.x, poutre.params.b.y - c.y) : 1;
    position = dA <= dB ? poutre.params.a : poutre.params.b;
    angle = Math.round((Math.atan2(poutre.params.b.y - poutre.params.a.y, poutre.params.b.x - poutre.params.a.x) * 180) / Math.PI * 100) / 100;
  }
  const [type, setType] = useState("platine-about");
  const [nom, setNom] = useState("");
  const [l, setL] = useState(""); const [h, setH] = useState(""); const [e, setE] = useState("");
  const [avecBoulons, setAvecBoulons] = useState(true);
  const [rangees, setRangees] = useState("2"); const [parRangee, setParRangee] = useState("2"); const [diam, setDiam] = useState(""); const [entraxe, setEntraxe] = useState(""); const [longueur, setLongueur] = useState("");
  const platine = mm(l) && mm(h) && mm(e) ? { largeur: mm(l), hauteur: mm(h), epaisseur: mm(e) } : null;
  const boulons = avecBoulons ? (mm(diam) && mm(entraxe) && mm(longueur) && nombre(rangees) && nombre(parRangee) ? { rangees: Math.round(nombre(rangees)!), parRangee: Math.round(nombre(parRangee)!), diametre: mm(diam), entraxe: mm(entraxe), longueur: mm(longueur) } : null) : null;
  const pret = !!elements.length && !!platine && (!avecBoulons || !!boulons);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    onCommandes([{ type: "assemblageStructurel.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, type, elements: elements.map((o) => o.id), position, z: poutre ? poutre.params.za : zDe(elements[0]!), angle: { value: angle, unit: "deg" }, platine, boulons } }], `Assemblage ${nom.trim() || type}`);
  };
  return (
    <section className="outil-structure" aria-label="Assemblage structurel" data-outil-assemblage-structurel>
      <p className="inspecteur-aide">Sélectionnez un à quatre éléments (poutres, poteaux, plaques) : la platine et les boulons sont dessinés à l'extrémité de la poutre la plus proche de l'autre élément. Géométrie seulement : aucune vérification de résistance.</p>
      {elements.length ? <p className="inspecteur-meta" data-assemblage-structurel-pret>{elements.map(nomDe).join(", ")} · position ({fmt(position.x)} ; {fmt(position.y)})</p> : <p className="inspecteur-alerte" role="note">Aucun élément de structure dans la sélection.</p>}
      <div className="champ"><label htmlFor="outil-typeAssemblage">Type</label><select id="outil-typeAssemblage" value={type} onChange={(ev) => setType(ev.target.value)}>{TYPES_ASSEMBLAGE.map(([v, lb]) => <option key={v} value={v}>{lb}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomAssemblageS">Nom</label><input id="outil-nomAssemblageS" value={nom} maxLength={80} onChange={(ev) => setNom(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-platine-l">Platine : largeur (mm)</label><input id="outil-platine-l" inputMode="decimal" value={l} onChange={(ev) => setL(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-platine-largeur /></div>
      <div className="champ"><label htmlFor="outil-platine-h">Platine : hauteur (mm)</label><input id="outil-platine-h" inputMode="decimal" value={h} onChange={(ev) => setH(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-platine-hauteur /></div>
      <div className="champ"><label htmlFor="outil-platine-e">Platine : épaisseur (mm)</label><input id="outil-platine-e" inputMode="decimal" value={e} onChange={(ev) => setE(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-platine-epaisseur /></div>
      <label className="case"><input type="checkbox" checked={avecBoulons} onChange={(ev) => setAvecBoulons(ev.target.checked)} /> Boulons</label>
      {avecBoulons && (
        <>
          <div className="champ"><label htmlFor="outil-boulons-r">Rangées</label><input id="outil-boulons-r" inputMode="numeric" value={rangees} onChange={(ev) => setRangees(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} /></div>
          <div className="champ"><label htmlFor="outil-boulons-p">Boulons par rangée</label><input id="outil-boulons-p" inputMode="numeric" value={parRangee} onChange={(ev) => setParRangee(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} /></div>
          <div className="champ"><label htmlFor="outil-boulons-d">Diamètre (mm)</label><input id="outil-boulons-d" inputMode="decimal" value={diam} onChange={(ev) => setDiam(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-boulons-diametre /></div>
          <div className="champ"><label htmlFor="outil-boulons-x">Entraxe (mm)</label><input id="outil-boulons-x" inputMode="decimal" value={entraxe} onChange={(ev) => setEntraxe(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-boulons-entraxe /></div>
          <div className="champ"><label htmlFor="outil-boulons-L">Longueur (mm)</label><input id="outil-boulons-L" inputMode="decimal" value={longueur} onChange={(ev) => setLongueur(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-boulons-longueur /></div>
        </>
      )}
      <div className="boutons"><button type="button" data-assemblage-structurel-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer l'assemblage</button></div>
    </section>
  );
}

/** Outil Soudure (DA-08-11) : deux éléments sélectionnés, type, gorge et longueur saisies. */
export function OutilSoudure({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const elements = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o && ELEMENTS.includes(o.classe));
  const [type, setType] = useState("angle");
  const [gorge, setGorge] = useState("");
  const [longueur, setLongueur] = useState("");
  const [intermittente, setIntermittente] = useState(false);
  const message = elements.length !== 2 ? "Sélectionnez exactement deux éléments de structure (Maj + clic)." : null;
  const g = mm(gorge), L = longueur.trim() ? nombre(longueur) : null;
  const creer = () => {
    if (!onCommandes || message || !g || !L || L <= 0) return;
    const [a, b] = elements as [OccurrenceQuelconque, OccurrenceQuelconque];
    const ca = centreDe(a) ?? P(ui.vue.cx, ui.vue.cy), cb = centreDe(b) ?? ca;
    onCommandes([{ type: "soudure.creer", params: { type, a: a.id, b: b.id, gorge: g, longueur: { value: L, unit: "m" }, position: P((ca.x + cb.x) / 2, (ca.y + cb.y) / 2), z: zDe(a), intermittente } }], `Soudure ${nomDe(a)} / ${nomDe(b)}`);
  };
  return (
    <section className="outil-structure" aria-label="Soudure" data-outil-soudure>
      {message ? <p className="inspecteur-alerte" role="note" data-soudure-message>{message}</p> : <p className="inspecteur-meta" data-soudure-pret>{nomDe(elements[0]!)} / {nomDe(elements[1]!)}</p>}
      <div className="champ"><label htmlFor="outil-typeSoudure">Type</label><select id="outil-typeSoudure" value={type} onChange={(e) => setType(e.target.value)}>{TYPES_SOUDURE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-gorge">Gorge (mm)</label><input id="outil-gorge" inputMode="decimal" value={gorge} onChange={(e) => setGorge(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-soudure-gorge /></div>
      <div className="champ"><label htmlFor="outil-longueurSoudure">Longueur de cordon (m)</label><input id="outil-longueurSoudure" inputMode="decimal" value={longueur} onChange={(e) => setLongueur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-soudure-longueur /></div>
      <label className="case"><input type="checkbox" checked={intermittente} onChange={(e) => setIntermittente(e.target.checked)} /> Cordon intermittent</label>
      <div className="boutons"><button type="button" data-soudure-creer disabled={readOnly || !onCommandes || !!message || !g || !L} onClick={creer}>Créer la soudure</button></div>
    </section>
  );
}

/** Outil Armature (DA-08-14) : barres dans l'hôte sélectionné (poutre : le long de l'axe ; dalle ou plaque : son contour) ou tracé libre d'une esquisse. */
export function OutilArmature({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const hote = sel.find((o) => BETON.includes(o.classe));
  const ligne = sel.find((o): o is Occurrence<"esquisse"> => o.classe === "esquisse" && o.params.points.length >= 2);
  const points: Point2[] = ligne ? ligne.params.points : hote?.classe === "poutre" ? [hote.params.a, hote.params.b] : hote?.classe === "dalle" || hote?.classe === "plaque" ? hote.params.contour : hote?.classe === "poteau" ? [P(hote.params.point.x - hote.params.largeur.value / 2, hote.params.point.y - hote.params.profondeur.value / 2), P(hote.params.point.x + hote.params.largeur.value / 2, hote.params.point.y - hote.params.profondeur.value / 2), P(hote.params.point.x + hote.params.largeur.value / 2, hote.params.point.y + hote.params.profondeur.value / 2), P(hote.params.point.x - hote.params.largeur.value / 2, hote.params.point.y + hote.params.profondeur.value / 2)] : [];
  const [forme, setForme] = useState(hote?.classe === "poteau" ? "cadre" : "droite");
  const [nom, setNom] = useState("");
  const [diametre, setDiametre] = useState("");
  const [nombreB, setNombreB] = useState("1");
  const [espacement, setEspacement] = useState("");
  const [z, setZ] = useState(hote ? String(zDe(hote)) : "0");
  const [nuance, setNuance] = useState("");
  const d = mm(diametre), n = Math.round(nombre(nombreB) ?? 0), esp = mm(espacement);
  const pret = points.length >= 2 && !!d && n >= 1 && (n === 1 || !!esp);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    onCommandes([{ type: "armature.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, hoteId: hote?.id ?? null, forme, diametre: d, points, z: nombre(z) ?? 0, nombre: n, espacement: n > 1 ? esp : null, nuance: nuance.trim() || null } }], `Armature ${nom.trim() || forme}`);
  };
  return (
    <section className="outil-structure" aria-label="Armature" data-outil-armature>
      <p className="inspecteur-aide">Sélectionnez l'hôte (poutre, dalle, plaque, poteau) ou une esquisse pour le tracé ; diamètre, nombre, espacement et nuance sont saisis, jamais supposés.</p>
      {points.length < 2 ? <p className="inspecteur-alerte" role="note" data-armature-message>Aucun hôte ni tracé dans la sélection.</p> : <p className="inspecteur-meta" data-armature-pret>{hote ? `Hôte : ${nomDe(hote)} · ` : ""}{points.length} point(s)</p>}
      <div className="champ"><label htmlFor="outil-formeArmature">Forme</label><select id="outil-formeArmature" value={forme} onChange={(e) => setForme(e.target.value)}>{FORMES_ARMATURE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomArmature">Nom</label><input id="outil-nomArmature" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-diametreArmature">Diamètre (mm)</label><input id="outil-diametreArmature" inputMode="decimal" value={diametre} onChange={(e) => setDiametre(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-armature-diametre /></div>
      <div className="champ"><label htmlFor="outil-nombreArmature">Nombre de barres</label><input id="outil-nombreArmature" inputMode="numeric" value={nombreB} onChange={(e) => setNombreB(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-armature-nombre /></div>
      {n > 1 && <div className="champ"><label htmlFor="outil-espacementArmature">Espacement (mm)</label><input id="outil-espacementArmature" inputMode="decimal" value={espacement} onChange={(e) => setEspacement(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-armature-espacement /></div>}
      <div className="champ"><label htmlFor="outil-zArmature">Altitude (m, depuis le niveau)</label><input id="outil-zArmature" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-nuanceArmature">Nuance (déclarée)</label><input id="outil-nuanceArmature" value={nuance} maxLength={40} onChange={(e) => setNuance(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="boutons"><button type="button" data-armature-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer l'armature</button></div>
    </section>
  );
}

/** Outil Coulage (DA-08-15 / 16) : les éléments en béton sélectionnés forment un coulage ou un lot préfabriqué. */
export function OutilCoulage({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const elements = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o && BETON.includes(o.classe));
  const [nom, setNom] = useState("");
  const [numero, setNumero] = useState("");
  const [prefabrique, setPrefabrique] = useState(false);
  const creer = () => {
    if (!onCommandes || !ui.niveauId) return;
    onCommandes([{ type: "coulage.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || "Coulage", numero: numero.trim() || null, elements: elements.map((o) => o.id), prefabrique } }], `Coulage ${nom.trim() || ""}`.trim());
  };
  return (
    <section className="outil-structure" aria-label="Coulage" data-outil-coulage>
      <p className="inspecteur-aide">Un coulage groupe des poutres, poteaux, plaques et dalles ; un lot préfabriqué est un coulage marqué comme tel. Les quantités viennent des éléments.</p>
      <p className="inspecteur-meta" data-coulage-elements>{elements.length} élément(s) sélectionné(s)</p>
      <div className="champ"><label htmlFor="outil-nomCoulage">Nom</label><input id="outil-nomCoulage" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-coulage-nom /></div>
      <div className="champ"><label htmlFor="outil-numeroCoulage">Numéro</label><input id="outil-numeroCoulage" value={numero} maxLength={40} onChange={(e) => setNumero(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <label className="case"><input type="checkbox" checked={prefabrique} onChange={(e) => setPrefabrique(e.target.checked)} /> Lot préfabriqué</label>
      <div className="boutons"><button type="button" data-coulage-creer disabled={readOnly || !onCommandes || !ui.niveauId} onClick={creer}>Créer le coulage</button></div>
    </section>
  );
}

const NON_EVALUEE = "non évaluée";

export function FichePoutre({ o, etat }: { o: Occurrence<"poutre">; etat: ModeleAtelier }) {
  const L = longueurPoutre(o.params);
  const sec = o.params.section;
  const coulage = Object.values(etat.objets).find((c): c is Occurrence<"coulage"> => c.classe === "coulage" && c.params.elements.includes(o.id));
  return (
    <div className="fiche-structure" data-fiche-poutre>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Rôle</dt><dd>{ROLES.find(([v]) => v === o.params.role)?.[1] ?? o.params.role}</dd></div>
        <div className="champ"><dt>Section</dt><dd data-poutre-section>{designationSection(sec)}</dd></div>
        {sec.profil && <div className="champ"><dt>Source du profil</dt><dd data-poutre-source translate="no">{sec.profil.source}</dd></div>}
        <div className="champ"><dt>Longueur</dt><dd data-poutre-longueur>{fmt(L)} m{Math.abs(o.params.za - o.params.zb) > 1e-9 ? " (incliné)" : ""}</dd></div>
        <div className="champ"><dt>Volume</dt><dd>{fmt(aireSection(sec) * L)} m³</dd></div>
        <div className="champ"><dt>Masse</dt><dd data-poutre-masse>{sec.masseLineique === null ? `${NON_EVALUEE} (aucune masse linéique sourcée)` : `${fmt(sec.masseLineique * L, 1)} kg`}</dd></div>
        <div className="champ"><dt>Matériau</dt><dd>{MATERIAUX.find(([v]) => v === o.params.materiau)?.[1]}{o.params.materiauNom ? ` · ${o.params.materiauNom}` : ""}{o.params.prefabrique ? " · préfabriqué" : ""}</dd></div>
        {o.params.trameId && <div className="champ"><dt>Trame</dt><dd>{o.params.trameId}</dd></div>}
        {coulage && <div className="champ"><dt>Coulage</dt><dd>{coulage.params.nom}</dd></div>}
      </dl>
    </div>
  );
}

export function FichePlaque({ o }: { o: Occurrence<"plaque"> }) {
  return (
    <div className="fiche-structure" data-fiche-plaque>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Épaisseur</dt><dd>{Math.round(o.params.epaisseur.value * 1000)} mm · base {fmt(o.params.z)} m</dd></div>
        <div className="champ"><dt>Matériau</dt><dd>{MATERIAUX.find(([v]) => v === o.params.materiau)?.[1]}{o.params.materiauNom ? ` · ${o.params.materiauNom}` : ""}{o.params.prefabrique ? " · préfabriqué" : ""}</dd></div>
        <div className="champ"><dt>Masse</dt><dd>{NON_EVALUEE} (aucune densité sourcée)</dd></div>
      </dl>
    </div>
  );
}

export function FicheAssemblageStructurel({ o, etat }: { o: Occurrence<"assemblage-structurel">; etat: ModeleAtelier }) {
  const b = o.params.boulons;
  return (
    <div className="fiche-structure" data-fiche-assemblage-structurel>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Type</dt><dd>{TYPES_ASSEMBLAGE.find(([v]) => v === o.params.type)?.[1]}</dd></div>
        <div className="champ"><dt>Éléments reliés</dt><dd data-assemblage-structurel-elements>{o.params.elements.map((id) => (etat.objets[id] ? nomDe(etat.objets[id]!) : `${id} (absent)`)).join(", ")}</dd></div>
        <div className="champ"><dt>Platine</dt><dd>{Math.round(o.params.platine.largeur.value * 1000)} × {Math.round(o.params.platine.hauteur.value * 1000)} × {Math.round(o.params.platine.epaisseur.value * 1000)} mm</dd></div>
        <div className="champ"><dt>Boulons</dt><dd data-assemblage-structurel-boulons>{b ? `${b.rangees * b.parRangee} × Ø ${Math.round(b.diametre.value * 1000)} mm, entraxe ${Math.round(b.entraxe.value * 1000)} mm` : "aucun"}</dd></div>
      </dl>
      <p className="inspecteur-aide">Géométrie seulement : la résistance de l'assemblage n'est pas évaluée.</p>
    </div>
  );
}

export function FicheSoudure({ o, etat }: { o: Occurrence<"soudure">; etat: ModeleAtelier }) {
  return (
    <div className="fiche-structure" data-fiche-soudure>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Type</dt><dd>{TYPES_SOUDURE.find(([v]) => v === o.params.type)?.[1]}{o.params.intermittente ? " · intermittente" : ""}</dd></div>
        <div className="champ"><dt>Éléments</dt><dd>{[o.params.a, o.params.b].map((id) => (etat.objets[id] ? nomDe(etat.objets[id]!) : `${id} (absent)`)).join(" / ")}</dd></div>
        <div className="champ"><dt>Gorge</dt><dd>{Math.round(o.params.gorge.value * 1000)} mm</dd></div>
        <div className="champ"><dt>Longueur de cordon</dt><dd>{fmt(o.params.longueur.value)} m</dd></div>
      </dl>
    </div>
  );
}

export function FicheArmature({ o, etat }: { o: Occurrence<"armature">; etat: ModeleAtelier }) {
  const Lu = longueurBarre(o.params);
  return (
    <div className="fiche-structure" data-fiche-armature>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Forme</dt><dd>{FORMES_ARMATURE.find(([v]) => v === o.params.forme)?.[1]} · Ø {Math.round(o.params.diametre.value * 1000)} mm</dd></div>
        <div className="champ"><dt>Hôte</dt><dd>{o.params.hoteId ? (etat.objets[o.params.hoteId] ? nomDe(etat.objets[o.params.hoteId]!) : `${o.params.hoteId} (absent)`) : "aucun"}</dd></div>
        <div className="champ"><dt>Barres</dt><dd data-armature-longueur>{o.params.nombre} × {fmt(Lu)} m = {fmt(Lu * o.params.nombre)} m{o.params.espacement ? ` · espacement ${Math.round(o.params.espacement.value * 1000)} mm` : ""}</dd></div>
        <div className="champ"><dt>Nuance</dt><dd>{o.params.nuance ?? NON_EVALUEE}</dd></div>
        <div className="champ"><dt>Masse</dt><dd>{NON_EVALUEE} (aucune densité sourcée)</dd></div>
      </dl>
    </div>
  );
}

export function FicheCoulage({ o, etat, readOnly, onCommandes }: { o: Occurrence<"coulage">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const elements = o.params.elements.map((id) => etat.objets[id]).filter((x): x is OccurrenceQuelconque => !!x);
  const volume = elements.reduce((s, e) => { const m = maillageObjet(etat, e); return s + (m ? volumeMaillage(m) : 0); }, 0);
  const ui = etatUi.get();
  const ajoutables = ui.selection.filter((id) => etat.objets[id] && BETON.includes(etat.objets[id]!.classe) && !o.params.elements.includes(id));
  return (
    <div className="fiche-structure" data-fiche-coulage>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Numéro</dt><dd>{o.params.numero ?? "—"}{o.params.prefabrique ? " · lot préfabriqué" : ""}</dd></div>
        <div className="champ"><dt>Éléments</dt><dd data-coulage-liste>{elements.length ? elements.map(nomDe).join(", ") : "aucun"}</dd></div>
        <div className="champ"><dt>Volume des éléments</dt><dd data-coulage-volume>{fmt(volume)} m³</dd></div>
      </dl>
      <div className="boutons"><button type="button" data-coulage-ajouter disabled={readOnly || !onCommandes || !ajoutables.length} onClick={() => onCommandes?.([{ type: "coulage.affecter", params: { id: o.id, elements: [...o.params.elements, ...ajoutables] } }], `Affecter au coulage ${o.params.nom}`)}>Ajouter la sélection ({ajoutables.length})</button></div>
    </div>
  );
}
