/**
 * Ontologie réseaux (P2-5, T01) : outils Segment de réseau (routage le long d'une polyligne), Raccord, Vanne, Équipement,
 * Support, Connexion et Spécification dans l'inspecteur ; fiches avec les ports et leur état. Aucun écran, aucun ruban.
 * Rien n'est supposé : sections, fluides, matériaux viennent du projet, d'une spécification ou d'un catalogue sourcé (D-180).
 */
import { useState } from "react";
import { connexionDuPort, designationReseau, incompatibilites, longueurSegment, portsDe, specifications, supportsDe, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2, type PortAbsolu } from "@parcours/atelier-model";
import { type EtatUi } from "../etat-ui";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
const nomDe = (o: OccurrenceQuelconque) => ((o.params as unknown as { nom?: string | null }).nom ?? null) || o.id;
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;
const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, frame: "local", unit: "m" });
const mm = (v: string): { value: number; unit: "m" } | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? { value: n / 1000, unit: "m" } : null; };
const nombre = (v: string): number | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
export const SYSTEMES = [["tuyau", "Tuyau"], ["gaine", "Gaine"], ["chemin-de-cables", "Chemin de câbles"], ["conduit", "Conduit"]] as const;
const TYPES_RACCORD = [["coude", "Coude"], ["te", "Té"], ["croix", "Croix"], ["reduction", "Réduction"], ["manchon", "Manchon"], ["bouchon", "Bouchon"]] as const;
const TYPES_VANNE = [["arret", "Vanne d'arrêt"], ["reglage", "Vanne de réglage"], ["anti-retour", "Clapet anti-retour"], ["securite", "Soupape de sécurité"], ["trois-voies", "Vanne trois voies"]] as const;
const CATEGORIES = [["terminal", "Terminal (bouche, radiateur, appareil)"], ["mouvement", "Mise en mouvement (pompe, ventilateur)"], ["conversion", "Conversion d'énergie (chaudière, échangeur)"], ["stockage", "Stockage (ballon, réservoir)"], ["traitement", "Traitement (centrale, filtre)"], ["controle", "Contrôle (régulateur, compteur)"]] as const;
const TYPES_SUPPORT = [["collier", "Collier"], ["suspente", "Suspente"], ["rail", "Rail"], ["console", "Console"]] as const;
const SENS = [["indifferent", "Indifférent"], ["entree", "Entrée"], ["sortie", "Sortie"]] as const;
const RESEAU = ["segment-reseau", "raccord-reseau", "vanne", "equipement-reseau"];
const libelle = (liste: readonly (readonly [string, string])[], v: string) => liste.find(([k]) => k === v)?.[1] ?? v;

function catalogues(etat: ModeleAtelier) {
  return Object.values(etat.definitions).filter((d) => d.classe === ("catalogue" as typeof d.classe)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Éditeur de section de réseau : circulaire (Ø, épaisseur) ou rectangulaire (l × h) en mm, ou désignation d'un catalogue sourcé. */
export type SectionReseauSaisie = { mode: "circulaire"; diametre: string; epaisseur: string } | { mode: "rectangulaire"; largeur: string; hauteur: string } | { mode: "catalogue"; catalogueId: string; designation: string };
export const SECTION_RESEAU_DEFAUT: SectionReseauSaisie = { mode: "circulaire", diametre: "", epaisseur: "" };
export function sectionReseauCommande(s: SectionReseauSaisie): Record<string, unknown> | null {
  if (s.mode === "catalogue") return s.catalogueId && s.designation.trim() ? { catalogueId: s.catalogueId, designation: s.designation.trim() } : null;
  if (s.mode === "circulaire") { const d = mm(s.diametre); if (!d) return null; const e = mm(s.epaisseur); return { forme: "circulaire", diametre: d, ...(e ? { epaisseur: e } : {}) }; }
  const l = mm(s.largeur), h = mm(s.hauteur);
  return l && h ? { forme: "rectangulaire", largeur: l, hauteur: h } : null;
}
export function EditeurSectionReseau({ id, etat, legende, systeme, valeur, onChange }: { id: string; etat: ModeleAtelier; legende: string; systeme: string; valeur: SectionReseauSaisie; onChange: (s: SectionReseauSaisie) => void }) {
  const cats = catalogues(etat);
  return (
    <fieldset className="editeur-section" data-editeur-section-reseau={id}>
      <legend>{legende}</legend>
      <div className="champ">
        <label htmlFor={`${id}-mode`}>Origine</label>
        <select id={`${id}-mode`} value={valeur.mode} onChange={(e) => onChange(e.target.value === "catalogue" ? { mode: "catalogue", catalogueId: cats[0]?.id ?? "", designation: "" } : e.target.value === "rectangulaire" ? { mode: "rectangulaire", largeur: "", hauteur: "" } : { ...SECTION_RESEAU_DEFAUT })} data-section-mode>
          <option value="circulaire">Circulaire saisie (Ø extérieur, épaisseur)</option>
          <option value="rectangulaire" disabled={systeme === "tuyau"}>Rectangulaire saisie (largeur × hauteur)</option>
          <option value="catalogue" disabled={!cats.length}>Catalogue sourcé du projet{cats.length ? "" : " (aucun importé)"}</option>
        </select>
      </div>
      {valeur.mode === "catalogue" ? (
        <>
          <div className="champ"><label htmlFor={`${id}-cat`}>Catalogue</label><select id={`${id}-cat`} value={valeur.catalogueId} onChange={(e) => onChange({ ...valeur, catalogueId: e.target.value })}>{cats.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
          <div className="champ"><label htmlFor={`${id}-des`}>Désignation</label><input id={`${id}-des`} value={valeur.designation} placeholder="telle qu'écrite dans le catalogue" data-section-designation onChange={(e) => onChange({ ...valeur, designation: e.target.value })} onKeyDown={stop} /></div>
        </>
      ) : valeur.mode === "circulaire" ? (
        <>
          <div className="champ"><label htmlFor={`${id}-d`}>Diamètre extérieur (mm)</label><input id={`${id}-d`} inputMode="decimal" value={valeur.diametre} data-section-diametre onChange={(e) => onChange({ ...valeur, diametre: e.target.value })} onKeyDown={stop} /></div>
          <div className="champ"><label htmlFor={`${id}-e`}>Épaisseur (mm, facultative)</label><input id={`${id}-e`} inputMode="decimal" value={valeur.epaisseur} data-section-epaisseur onChange={(e) => onChange({ ...valeur, epaisseur: e.target.value })} onKeyDown={stop} /></div>
        </>
      ) : (
        <>
          <div className="champ"><label htmlFor={`${id}-l`}>Largeur (mm)</label><input id={`${id}-l`} inputMode="decimal" value={valeur.largeur} data-section-largeur onChange={(e) => onChange({ ...valeur, largeur: e.target.value })} onKeyDown={stop} /></div>
          <div className="champ"><label htmlFor={`${id}-h`}>Hauteur (mm)</label><input id={`${id}-h`} inputMode="decimal" value={valeur.hauteur} data-section-hauteur onChange={(e) => onChange({ ...valeur, hauteur: e.target.value })} onKeyDown={stop} /></div>
        </>
      )}
    </fieldset>
  );
}

function ChoixSpecification({ id, etat, systeme, valeur, onChange }: { id: string; etat: ModeleAtelier; systeme: string; valeur: string; onChange: (v: string) => void }) {
  const specs = specifications(etat).filter((d) => d.params["systeme"] === systeme);
  return (
    <div className="champ"><label htmlFor={id}>Spécification</label>
      <select id={id} value={valeur} onChange={(e) => onChange(e.target.value)} data-choix-specification>
        <option value="">Aucune</option>
        {specs.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
      </select>
    </div>
  );
}

const champsCommuns = (fluide: string, materiau: string, spec: string) => ({ fluide: fluide.trim() || null, materiau: materiau.trim() || null, specificationId: spec || null });

/** Outil Segment de réseau (DA-12-02, 04, 06, 13, 14) : polyligne 3D depuis une esquisse sélectionnée ou saisie, routage avec coudes. */
export function OutilSegmentReseau({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const ligne = ui.selection.map((id) => etat.objets[id]).find((o): o is Occurrence<"esquisse"> => !!o && o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "polyligne") && o.params.points.length >= 2);
  const [systeme, setSysteme] = useState("tuyau");
  const [nom, setNom] = useState("");
  const [section, setSection] = useState<SectionReseauSaisie>(SECTION_RESEAU_DEFAUT);
  const [fluide, setFluide] = useState(""); const [materiau, setMateriau] = useState("");
  const [sens, setSens] = useState("indifferent");
  const [spec, setSpec] = useState("");
  const [z, setZ] = useState("2.5");
  const [texte, setTexte] = useState(ligne ? "" : `${fmt(ui.vue.cx - 2)} ; ${fmt(ui.vue.cy)}\n${fmt(ui.vue.cx + 2)} ; ${fmt(ui.vue.cy)}`);
  const [coude, setCoude] = useState("");
  const sec = sectionReseauCommande(section);
  const zz = nombre(z) ?? 0;
  const sommets = ligne
    ? ligne.params.points.map((q) => ({ x: q.x, y: q.y, z: zz }))
    : texte.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const c = l.split(/\s*;\s*/).map((v) => nombre(v)); return c.length >= 2 && c[0] !== null && c[1] !== null && (c.length < 3 || c[2] !== null) ? { x: c[0]!, y: c[1]!, z: c.length >= 3 ? c[2]! : zz } : null; });
  const ok = sommets.every((s) => !!s) && sommets.length >= 2;
  const c = coude.trim() ? mm(coude) : null;
  const pret = !!sec && ok && (!coude.trim() || !!c);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    const pts = sommets as { x: number; y: number; z: number }[];
    const commun = { niveauId: ui.niveauId, systeme, section: sec, sens, ...champsCommuns(fluide, materiau, spec) };
    if (pts.length === 2 && !c) onCommandes([{ type: "segmentReseau.creer", params: { ...commun, nom: nom.trim() || null, sommets: pts } }], `Segment ${nom.trim() || libelle(SYSTEMES, systeme)}`);
    else onCommandes([{ type: "reseau.router", params: { ...commun, prefixe: nom.trim() || libelle(SYSTEMES, systeme), sommets: pts, ...(c ? { coude: { longueur: c } } : {}) } }], `Router ${nom.trim() || libelle(SYSTEMES, systeme)} (${pts.length} sommets)`);
  };
  return (
    <section className="outil-structure" aria-label="Segment de réseau" data-outil-segment-reseau>
      <p className="inspecteur-aide">Sélectionnez une ligne ou une polyligne d'esquisse (son tracé devient l'axe, à l'altitude saisie) ou saisissez les sommets « x ; y ; z » ligne par ligne ; plusieurs sommets sont routés en tronçons connectés, avec un coude à chaque angle si une longueur de bras est donnée.</p>
      {ligne ? <p className="inspecteur-meta" data-segment-source>Axe : {nomDe(ligne)} ({ligne.params.points.length} sommets)</p> : <div className="champ"><label htmlFor="outil-sommetsReseau">Sommets (x ; y ; z en m, un par ligne)</label><textarea id="outil-sommetsReseau" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={stop} data-segment-sommets /></div>}
      <div className="champ"><label htmlFor="outil-zReseau">Altitude de l'axe (m, depuis le niveau ; utilisée si le sommet n'en donne pas)</label><input id="outil-zReseau" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={stop} data-segment-z /></div>
      <div className="champ"><label htmlFor="outil-systemeReseau">Système</label><select id="outil-systemeReseau" value={systeme} onChange={(e) => { setSysteme(e.target.value); if (e.target.value === "tuyau" && section.mode === "rectangulaire") setSection({ ...SECTION_RESEAU_DEFAUT }); }} data-segment-systeme>{SYSTEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomReseau">Nom (ou préfixe des tronçons)</label><input id="outil-nomReseau" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} data-segment-nom /></div>
      <EditeurSectionReseau id="outil-sectionReseau" etat={etat} legende="Section" systeme={systeme} valeur={section} onChange={setSection} />
      <div className="champ"><label htmlFor="outil-fluideReseau">Fluide (déclaré)</label><input id="outil-fluideReseau" value={fluide} maxLength={60} onChange={(e) => setFluide(e.target.value)} onKeyDown={stop} data-segment-fluide /></div>
      <div className="champ"><label htmlFor="outil-materiauReseau">Matériau (déclaré)</label><input id="outil-materiauReseau" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ"><label htmlFor="outil-sensReseau">Sens d'écoulement</label><select id="outil-sensReseau" value={sens} onChange={(e) => setSens(e.target.value)} data-segment-sens><option value="indifferent">Indifférent</option><option value="a-vers-b">Du premier sommet vers le dernier</option><option value="b-vers-a">Du dernier sommet vers le premier</option></select></div>
      <ChoixSpecification id="outil-specReseau" etat={etat} systeme={systeme} valeur={spec} onChange={setSpec} />
      <div className="champ"><label htmlFor="outil-coudeReseau">Bras des coudes aux angles (mm ; vide : tronçons bout à bout)</label><input id="outil-coudeReseau" inputMode="decimal" value={coude} onChange={(e) => setCoude(e.target.value)} onKeyDown={stop} data-segment-coude /></div>
      {!sec && <p className="inspecteur-alerte" role="note">Section incomplète : indiquez le diamètre, la largeur et la hauteur, ou une désignation du catalogue.</p>}
      {!ok && <p className="inspecteur-alerte" role="note" data-segment-message>Sommets incomplets : au moins deux lignes « x ; y ; z ».</p>}
      <div className="boutons"><button type="button" data-segment-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>{sommets.length > 2 || c ? "Router le réseau" : "Créer le segment"}</button></div>
    </section>
  );
}

/** Ports d'un raccord selon son type, bras L (m) : géométrie seulement. */
function portsRaccord(type: string, L: number, section2: Record<string, unknown> | null) {
  const p = (id: string, dx: number, dy: number, section: Record<string, unknown> | null = null) => ({ id, dx, dy, dz: 0, sens: "indifferent", ...(section ? { section } : {}) });
  switch (type) {
    case "coude": return [p("1", -L, 0), p("2", 0, L)];
    case "te": return [p("1", -L, 0), p("2", L, 0), p("3", 0, L)];
    case "croix": return [p("1", -L, 0), p("2", L, 0), p("3", 0, L), p("4", 0, -L)];
    case "reduction": return [p("1", -L, 0), p("2", L, 0, section2)];
    case "manchon": return [p("1", -L, 0), p("2", L, 0)];
    default: return [p("1", -L, 0)];
  }
}

/** Outil Raccord (DA-12-08) : type, système, section, longueur des bras, pose (position, altitude, angle). */
export function OutilRaccordReseau({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [type, setType] = useState("coude");
  const [systeme, setSysteme] = useState("tuyau");
  const [nom, setNom] = useState("");
  const [section, setSection] = useState<SectionReseauSaisie>(SECTION_RESEAU_DEFAUT);
  const [section2, setSection2] = useState<SectionReseauSaisie>(SECTION_RESEAU_DEFAUT);
  const [bras, setBras] = useState("");
  const [x, setX] = useState(fmt(ui.vue.cx)); const [y, setY] = useState(fmt(ui.vue.cy)); const [z, setZ] = useState("2.5"); const [angle, setAngle] = useState("0");
  const [fluide, setFluide] = useState(""); const [materiau, setMateriau] = useState(""); const [spec, setSpec] = useState("");
  const sec = sectionReseauCommande(section), sec2 = type === "reduction" ? sectionReseauCommande(section2) : null;
  const L = mm(bras);
  const pret = !!sec && !!L && nombre(x) !== null && nombre(y) !== null && (type !== "reduction" || !!sec2);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret || !L) return;
    onCommandes([{ type: "raccordReseau.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, type, systeme, position: P(nombre(x)!, nombre(y)!), z: nombre(z) ?? 0, angle: { value: nombre(angle) ?? 0, unit: "deg" }, section: sec, ports: portsRaccord(type, L.value, sec2), ...champsCommuns(fluide, materiau, spec) } }], `Raccord ${libelle(TYPES_RACCORD, type)}`);
  };
  return (
    <section className="outil-structure" aria-label="Raccord" data-outil-raccord-reseau>
      <p className="inspecteur-aide">Un raccord porte des ports au bout de ses bras (coude : deux à 90°, té : trois, croix : quatre, réduction : deux sections, manchon, bouchon) ; longueur des bras saisie ; l'angle tourne le raccord dans le plan.</p>
      <div className="champ"><label htmlFor="outil-typeRaccord">Type</label><select id="outil-typeRaccord" value={type} onChange={(e) => setType(e.target.value)} data-raccord-type>{TYPES_RACCORD.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-systemeRaccord">Système</label><select id="outil-systemeRaccord" value={systeme} onChange={(e) => setSysteme(e.target.value)}>{SYSTEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomRaccord">Nom</label><input id="outil-nomRaccord" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <EditeurSectionReseau id="outil-sectionRaccord" etat={etat} legende="Section" systeme={systeme} valeur={section} onChange={setSection} />
      {type === "reduction" && <EditeurSectionReseau id="outil-sectionRaccord2" etat={etat} legende="Section réduite (port 2)" systeme={systeme} valeur={section2} onChange={setSection2} />}
      <div className="champ"><label htmlFor="outil-brasRaccord">Longueur des bras (mm)</label><input id="outil-brasRaccord" inputMode="decimal" value={bras} onChange={(e) => setBras(e.target.value)} onKeyDown={stop} data-raccord-bras /></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-raccord-x">Position (x ; y) m</label><span className="vecteur"><input id="outil-raccord-x" aria-label="x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={stop} data-raccord-x /><input aria-label="y" value={y} onChange={(e) => setY(e.target.value)} onKeyDown={stop} data-raccord-y /></span></div>
      <div className="champ"><label htmlFor="outil-zRaccord">Altitude (m, depuis le niveau)</label><input id="outil-zRaccord" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={stop} data-raccord-z /></div>
      <div className="champ"><label htmlFor="outil-angleRaccord">Angle (°)</label><input id="outil-angleRaccord" inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={stop} data-raccord-angle /></div>
      <div className="champ"><label htmlFor="outil-fluideRaccord">Fluide (déclaré)</label><input id="outil-fluideRaccord" value={fluide} maxLength={60} onChange={(e) => setFluide(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ"><label htmlFor="outil-materiauRaccord">Matériau (déclaré)</label><input id="outil-materiauRaccord" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={stop} /></div>
      <ChoixSpecification id="outil-specRaccord" etat={etat} systeme={systeme} valeur={spec} onChange={setSpec} />
      <div className="boutons"><button type="button" data-raccord-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer le raccord</button></div>
    </section>
  );
}

/** Outil Vanne (DA-12-09) : type, section, longueur face à face, pose. */
export function OutilVanne({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [type, setType] = useState("arret");
  const [nom, setNom] = useState(""); const [repere, setRepere] = useState("");
  const [section, setSection] = useState<SectionReseauSaisie>(SECTION_RESEAU_DEFAUT);
  const [longueur, setLongueur] = useState("");
  const [x, setX] = useState(fmt(ui.vue.cx)); const [y, setY] = useState(fmt(ui.vue.cy)); const [z, setZ] = useState("2.5"); const [angle, setAngle] = useState("0");
  const [fluide, setFluide] = useState(""); const [materiau, setMateriau] = useState(""); const [spec, setSpec] = useState("");
  const sec = sectionReseauCommande(section), L = mm(longueur);
  const pret = !!sec && !!L && nombre(x) !== null && nombre(y) !== null;
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    onCommandes([{ type: "vanne.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, repere: repere.trim() || null, type, position: P(nombre(x)!, nombre(y)!), z: nombre(z) ?? 0, angle: { value: nombre(angle) ?? 0, unit: "deg" }, section: sec, longueur: L, ...champsCommuns(fluide, materiau, spec) } }], `Vanne ${nom.trim() || repere.trim() || libelle(TYPES_VANNE, type)}`);
  };
  return (
    <section className="outil-structure" aria-label="Vanne" data-outil-vanne>
      <p className="inspecteur-aide">Vanne sur un tuyau : ses deux faces (ports 1 et 2) sont aux bouts de la longueur face à face, le long de l'angle ; un clapet anti-retour entre par 1 et sort par 2 ; une trois voies ajoute le port 3 perpendiculaire.</p>
      <div className="champ"><label htmlFor="outil-typeVanne">Type</label><select id="outil-typeVanne" value={type} onChange={(e) => setType(e.target.value)} data-vanne-type>{TYPES_VANNE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomVanne">Nom</label><input id="outil-nomVanne" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} data-vanne-nom /></div>
      <div className="champ"><label htmlFor="outil-repereVanne">Repère</label><input id="outil-repereVanne" value={repere} maxLength={40} onChange={(e) => setRepere(e.target.value)} onKeyDown={stop} /></div>
      <EditeurSectionReseau id="outil-sectionVanne" etat={etat} legende="Section" systeme="tuyau" valeur={section} onChange={setSection} />
      <div className="champ"><label htmlFor="outil-longueurVanne">Longueur face à face (mm)</label><input id="outil-longueurVanne" inputMode="decimal" value={longueur} onChange={(e) => setLongueur(e.target.value)} onKeyDown={stop} data-vanne-longueur /></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-vanne-x">Position (x ; y) m</label><span className="vecteur"><input id="outil-vanne-x" aria-label="x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={stop} data-vanne-x /><input aria-label="y" value={y} onChange={(e) => setY(e.target.value)} onKeyDown={stop} data-vanne-y /></span></div>
      <div className="champ"><label htmlFor="outil-zVanne">Altitude (m, depuis le niveau)</label><input id="outil-zVanne" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={stop} data-vanne-z /></div>
      <div className="champ"><label htmlFor="outil-angleVanne">Angle (°)</label><input id="outil-angleVanne" inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={stop} data-vanne-angle /></div>
      <div className="champ"><label htmlFor="outil-fluideVanne">Fluide (déclaré)</label><input id="outil-fluideVanne" value={fluide} maxLength={60} onChange={(e) => setFluide(e.target.value)} onKeyDown={stop} data-vanne-fluide /></div>
      <div className="champ"><label htmlFor="outil-materiauVanne">Matériau (déclaré)</label><input id="outil-materiauVanne" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={stop} /></div>
      <ChoixSpecification id="outil-specVanne" etat={etat} systeme="tuyau" valeur={spec} onChange={setSpec} />
      <div className="boutons"><button type="button" data-vanne-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer la vanne</button></div>
    </section>
  );
}

type PortSaisi = { id: string; dx: string; dy: string; dz: string; sens: string; systeme: string; forme: "circulaire" | "rectangulaire"; d: string; l: string; h: string; fluide: string };
const PORT_VIDE = (i: number): PortSaisi => ({ id: String(i), dx: "", dy: "", dz: "", sens: "indifferent", systeme: "tuyau", forme: "circulaire", d: "", l: "", h: "", fluide: "" });
const portCommande = (p: PortSaisi) => {
  const section = p.forme === "circulaire" ? (mm(p.d) ? { forme: "circulaire", diametre: mm(p.d) } : null) : (mm(p.l) && mm(p.h) ? { forme: "rectangulaire", largeur: mm(p.l), hauteur: mm(p.h) } : null);
  if (!section || !p.id.trim()) return null;
  return { id: p.id.trim(), dx: nombre(p.dx) ?? 0, dy: nombre(p.dy) ?? 0, dz: nombre(p.dz) ?? 0, sens: p.sens, systeme: p.systeme, section, fluide: p.fluide.trim() || null };
};

/** Outil Équipement (DA-12-10, 11) : boîte posée, type déclaré, catégorie IFC, ports un par un. */
export function OutilEquipementReseau({ ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [nom, setNom] = useState(""); const [repere, setRepere] = useState(""); const [type, setType] = useState(""); const [categorie, setCategorie] = useState("terminal");
  const [x, setX] = useState(fmt(ui.vue.cx)); const [y, setY] = useState(fmt(ui.vue.cy)); const [z, setZ] = useState("0"); const [angle, setAngle] = useState("0");
  const [L, setL] = useState(""); const [W, setW] = useState(""); const [H, setH] = useState("");
  const [ports, setPorts] = useState<PortSaisi[]>([PORT_VIDE(1)]);
  const cmdPorts = ports.map(portCommande);
  const pret = !!nom.trim() && !!type.trim() && !!mm(L) && !!mm(W) && !!mm(H) && nombre(x) !== null && nombre(y) !== null && cmdPorts.length >= 1 && cmdPorts.every((p) => !!p) && new Set(cmdPorts.map((p) => p?.id)).size === cmdPorts.length;
  const maj = (i: number, patch: Partial<PortSaisi>) => setPorts(ports.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    onCommandes([{ type: "equipementReseau.creer", params: { niveauId: ui.niveauId, nom: nom.trim(), repere: repere.trim() || null, type: type.trim(), categorie, position: P(nombre(x)!, nombre(y)!), z: nombre(z) ?? 0, angle: { value: nombre(angle) ?? 0, unit: "deg" }, longueur: mm(L), largeur: mm(W), hauteur: mm(H), ports: cmdPorts } }], `Équipement ${nom.trim()}`);
  };
  return (
    <section className="outil-structure" aria-label="Équipement de réseau" data-outil-equipement-reseau>
      <p className="inspecteur-aide">Boîte longueur × largeur × hauteur posée à l'altitude saisie et tournée de l'angle ; chaque port est décalé du centre (dx le long de la longueur, dy en travers, dz depuis la base) avec son système, sa section, son sens et son fluide. Aucune performance n'est connue : le type est un nom déclaré.</p>
      <div className="champ"><label htmlFor="outil-nomEquip">Nom</label><input id="outil-nomEquip" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} data-equipement-nom /></div>
      <div className="champ"><label htmlFor="outil-repereEquip">Repère</label><input id="outil-repereEquip" value={repere} maxLength={40} onChange={(e) => setRepere(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ"><label htmlFor="outil-typeEquip">Type (déclaré : pompe, ventilateur, centrale…)</label><input id="outil-typeEquip" value={type} maxLength={60} onChange={(e) => setType(e.target.value)} onKeyDown={stop} data-equipement-type /></div>
      <div className="champ"><label htmlFor="outil-catEquip">Catégorie (classe IFC)</label><select id="outil-catEquip" value={categorie} onChange={(e) => setCategorie(e.target.value)} data-equipement-categorie>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-equip-x">Position (x ; y) m</label><span className="vecteur"><input id="outil-equip-x" aria-label="x" value={x} onChange={(e) => setX(e.target.value)} onKeyDown={stop} data-equipement-x /><input aria-label="y" value={y} onChange={(e) => setY(e.target.value)} onKeyDown={stop} data-equipement-y /></span></div>
      <div className="champ"><label htmlFor="outil-zEquip">Base (m, depuis le niveau)</label><input id="outil-zEquip" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={stop} data-equipement-z /></div>
      <div className="champ"><label htmlFor="outil-angleEquip">Angle (°)</label><input id="outil-angleEquip" inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-equip-L">Encombrement L × l × h (mm)</label><span className="vecteur"><input id="outil-equip-L" aria-label="Longueur (mm)" inputMode="decimal" value={L} onChange={(e) => setL(e.target.value)} onKeyDown={stop} data-equipement-longueur /><input aria-label="Largeur (mm)" inputMode="decimal" value={W} onChange={(e) => setW(e.target.value)} onKeyDown={stop} data-equipement-largeur /><input aria-label="Hauteur (mm)" inputMode="decimal" value={H} onChange={(e) => setH(e.target.value)} onKeyDown={stop} data-equipement-hauteur /></span></div>
      <fieldset className="editeur-section">
        <legend>Ports</legend>
        {ports.map((p, i) => (
          <div className="port-saisi" key={i} data-port-saisi={i}>
            <div className="champ champ-vecteur"><label htmlFor={`port-${i}-id`}>Port {i + 1} : identifiant, dx, dy, dz (m)</label><span className="vecteur"><input id={`port-${i}-id`} aria-label="Identifiant du port" value={p.id} onChange={(e) => maj(i, { id: e.target.value })} onKeyDown={stop} data-port-id /><input aria-label="dx (m)" inputMode="decimal" placeholder="dx" value={p.dx} onChange={(e) => maj(i, { dx: e.target.value })} onKeyDown={stop} data-port-dx /><input aria-label="dy (m)" inputMode="decimal" placeholder="dy" value={p.dy} onChange={(e) => maj(i, { dy: e.target.value })} onKeyDown={stop} data-port-dy /><input aria-label="dz (m)" inputMode="decimal" placeholder="dz" value={p.dz} onChange={(e) => maj(i, { dz: e.target.value })} onKeyDown={stop} data-port-dz /></span></div>
            <div className="champ champ-vecteur"><label htmlFor={`port-${i}-sys`}>Système, sens, forme</label><span className="vecteur">
              <select id={`port-${i}-sys`} aria-label="Système" value={p.systeme} onChange={(e) => maj(i, { systeme: e.target.value, forme: e.target.value === "tuyau" ? "circulaire" : p.forme })} data-port-systeme>{SYSTEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select aria-label="Sens" value={p.sens} onChange={(e) => maj(i, { sens: e.target.value })} data-port-sens>{SENS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <select aria-label="Forme de la section" value={p.forme} onChange={(e) => maj(i, { forme: e.target.value as "circulaire" | "rectangulaire" })}><option value="circulaire">Circulaire</option><option value="rectangulaire" disabled={p.systeme === "tuyau"}>Rectangulaire</option></select>
            </span></div>
            <div className="champ champ-vecteur"><label htmlFor={`port-${i}-d`}>{p.forme === "circulaire" ? "Diamètre (mm), fluide" : "Largeur × hauteur (mm), fluide"}</label><span className="vecteur">
              {p.forme === "circulaire" ? <input id={`port-${i}-d`} aria-label="Diamètre (mm)" inputMode="decimal" value={p.d} onChange={(e) => maj(i, { d: e.target.value })} onKeyDown={stop} data-port-diametre /> : <><input id={`port-${i}-d`} aria-label="Largeur (mm)" inputMode="decimal" value={p.l} onChange={(e) => maj(i, { l: e.target.value })} onKeyDown={stop} data-port-largeur /><input aria-label="Hauteur (mm)" inputMode="decimal" value={p.h} onChange={(e) => maj(i, { h: e.target.value })} onKeyDown={stop} data-port-hauteur /></>}
              <input aria-label="Fluide (déclaré)" placeholder="fluide" value={p.fluide} onChange={(e) => maj(i, { fluide: e.target.value })} onKeyDown={stop} data-port-fluide />
            </span></div>
          </div>
        ))}
        <div className="boutons"><button type="button" disabled={ports.length >= 8} onClick={() => setPorts([...ports, PORT_VIDE(ports.length + 1)])} data-port-ajouter>Ajouter un port</button>{ports.length > 1 && <button type="button" onClick={() => setPorts(ports.slice(0, -1))}>Retirer le dernier port</button>}</div>
      </fieldset>
      {!pret && <p className="inspecteur-alerte" role="note">Nom, type, encombrement et au moins un port complet (identifiant unique, section) sont requis.</p>}
      <div className="boutons"><button type="button" data-equipement-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer l'équipement</button></div>
    </section>
  );
}

/** Outil Support (DA-12-12) : attaché au segment sélectionné, à une fraction de sa longueur. */
export function OutilSupportReseau({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const seg = ui.selection.map((id) => etat.objets[id]).find((o): o is Occurrence<"segment-reseau"> => !!o && o.classe === "segment-reseau");
  const [type, setType] = useState("collier");
  const [t, setT] = useState("0.5");
  const [longueur, setLongueur] = useState("");
  const [nom, setNom] = useState("");
  const f = nombre(t);
  const pret = !!seg && f !== null && f >= 0 && f <= 1 && (type !== "suspente" || !!mm(longueur));
  const creer = () => {
    if (!onCommandes || !pret || !seg) return;
    // Point à la fraction f de la longueur développée du tracé.
    const s = seg.params.sommets;
    const Ltot = longueurSegment(seg.params);
    let reste = f! * Ltot;
    let q = { x: s[0]!.x, y: s[0]!.y, z: s[0]!.z };
    for (let i = 1; i < s.length; i++) {
      const d = Math.hypot(s[i]!.x - s[i - 1]!.x, s[i]!.y - s[i - 1]!.y, s[i]!.z - s[i - 1]!.z);
      if (reste <= d || i === s.length - 1) { const k = d ? Math.min(1, reste / d) : 0; q = { x: s[i - 1]!.x + (s[i]!.x - s[i - 1]!.x) * k, y: s[i - 1]!.y + (s[i]!.y - s[i - 1]!.y) * k, z: s[i - 1]!.z + (s[i]!.z - s[i - 1]!.z) * k }; break; }
      reste -= d;
    }
    onCommandes([{ type: "supportReseau.creer", params: { nom: nom.trim() || null, type, porteId: seg.id, position: P(q.x, q.y), z: Math.round(q.z * 1000) / 1000, ...(mm(longueur) ? { longueur: mm(longueur) } : {}) } }], `Support ${libelle(TYPES_SUPPORT, type)} sur ${nomDe(seg)}`);
  };
  return (
    <section className="outil-structure" aria-label="Support de réseau" data-outil-support-reseau>
      <p className="inspecteur-aide">Sélectionnez un segment de réseau : le support (collier, suspente, rail, console) est posé sur son tracé à la fraction saisie ; une suspente déclare sa longueur.</p>
      {seg ? <p className="inspecteur-meta" data-support-porte>Segment : {nomDe(seg)}</p> : <p className="inspecteur-alerte" role="note" data-support-message>Aucun segment de réseau dans la sélection.</p>}
      <div className="champ"><label htmlFor="outil-typeSupport">Type</label><select id="outil-typeSupport" value={type} onChange={(e) => setType(e.target.value)} data-support-type>{TYPES_SUPPORT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomSupport">Nom</label><input id="outil-nomSupport" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ"><label htmlFor="outil-tSupport">Position sur le tracé (0 = début, 1 = fin)</label><input id="outil-tSupport" inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onKeyDown={stop} data-support-fraction /></div>
      {type === "suspente" && <div className="champ"><label htmlFor="outil-lSupport">Longueur de la suspente (mm)</label><input id="outil-lSupport" inputMode="decimal" value={longueur} onChange={(e) => setLongueur(e.target.value)} onKeyDown={stop} data-support-longueur /></div>}
      <div className="boutons"><button type="button" data-support-creer disabled={readOnly || !onCommandes || !pret} onClick={creer}>Créer le support</button></div>
    </section>
  );
}

/** Outil Connexion (DA-12-01, cahier P2 §4) : deux objets de réseau sélectionnés, ports choisis, compatibilité lue avant d'agir. */
export function OutilConnexionReseau({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const objets = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o && RESEAU.includes(o.classe));
  const [pa, setPa] = useState(""); const [pb, setPb] = useState("");
  const message = objets.length !== 2 ? "Sélectionnez exactement deux objets de réseau (Maj + clic) : segments, raccords, vannes ou équipements." : null;
  const [a, b] = objets;
  const libresDe = (o: OccurrenceQuelconque) => portsDe(o).filter((p) => !connexionDuPort(etat, o.id, p.id));
  const portA = a ? (libresDe(a).find((p) => p.id === pa) ?? libresDe(a)[0]) : undefined;
  const portB = b ? (libresDe(b).find((p) => p.id === pb) ?? libresDe(b)[0]) : undefined;
  const motifs = portA && portB ? incompatibilites(portA, portB) : [];
  const connecter = () => { if (!onCommandes || !a || !b || !portA || !portB) return; onCommandes([{ type: "reseau.connecter", params: { a: a.id, portA: portA.id, b: b.id, portB: portB.id } }], `Connecter ${nomDe(a)}:${portA.id} — ${nomDe(b)}:${portB.id}`); };
  return (
    <section className="outil-structure" aria-label="Connexion de réseau" data-outil-connexion-reseau>
      <p className="inspecteur-aide">Une connexion relie deux ports libres ; elle est vérifiée sans table de valeurs : même système, même section, fluides déclarés égaux, sens non contradictoires, ports coïncidents (5 mm). « Connecter les ports coïncidents » relie d'un coup tout ce qui se touche et s'accorde.</p>
      {message ? <p className="inspecteur-alerte" role="note" data-connexion-message>{message}</p> : (
        <>
          <div className="champ"><label htmlFor="outil-portA">{nomDe(a!)} : port</label><select id="outil-portA" value={portA?.id ?? ""} onChange={(e) => setPa(e.target.value)} data-connexion-port-a>{libresDe(a!).map((p) => <option key={p.id} value={p.id}>{p.id} · {libelle(SENS, p.sens)} · {designationReseau(p.section)}</option>)}</select></div>
          <div className="champ"><label htmlFor="outil-portB">{nomDe(b!)} : port</label><select id="outil-portB" value={portB?.id ?? ""} onChange={(e) => setPb(e.target.value)} data-connexion-port-b>{libresDe(b!).map((p) => <option key={p.id} value={p.id}>{p.id} · {libelle(SENS, p.sens)} · {designationReseau(p.section)}</option>)}</select></div>
          {!portA || !portB ? <p className="inspecteur-alerte" role="note" data-connexion-message>Un des deux objets n'a plus de port libre.</p> : motifs.length ? <p className="inspecteur-alerte" role="note" data-connexion-motifs>Incompatible : {motifs.join(" ; ")}</p> : <p className="inspecteur-meta" data-connexion-pret>Ports compatibles.</p>}
          <div className="boutons"><button type="button" data-connexion-creer disabled={readOnly || !onCommandes || !portA || !portB || motifs.length > 0} onClick={connecter}>Connecter</button></div>
        </>
      )}
      <div className="boutons"><button type="button" data-connexion-proches disabled={readOnly || !onCommandes} onClick={() => onCommandes?.([{ type: "reseau.connecterProches", params: objets.length ? { ids: objets.map((o) => o.id) } : {} }], "Connecter les ports coïncidents")}>Connecter les ports coïncidents{objets.length ? " de la sélection" : " du projet"}</button></div>
    </section>
  );
}

/** Outil Spécification (DA-12-07, 17, 18, 20, 21) : système, fluide, matériau, catalogue sourcé, désignations admises. */
export function OutilSpecificationReseau({ etat, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [nom, setNom] = useState(""); const [systeme, setSysteme] = useState("tuyau"); const [fluide, setFluide] = useState(""); const [materiau, setMateriau] = useState("");
  const [catalogueId, setCatalogueId] = useState(""); const [designations, setDesignations] = useState(""); const [note, setNote] = useState("");
  const cats = catalogues(etat);
  const specs = specifications(etat);
  const pret = !!nom.trim();
  const definir = () => {
    if (!onCommandes || !pret) return;
    onCommandes([{ type: "specification.definir", params: { nom: nom.trim(), systeme, fluide: fluide.trim() || null, materiau: materiau.trim() || null, catalogueId: catalogueId || null, designations: designations.split(/[;\n,]/).map((x) => x.trim()).filter(Boolean), note: note.trim() || null } }], `Spécification ${nom.trim()}`);
    setNom("");
  };
  return (
    <section className="outil-structure" aria-label="Spécification de réseau" data-outil-specification-reseau>
      <p className="inspecteur-aide">Une spécification fixe le système, le fluide et le matériau d'une famille d'objets ; avec un catalogue sourcé, leur section se prend dans ce catalogue, parmi les désignations admises. Les catalogues sont livrés vides : importez le vôtre (gabarit tubes-raccords.csv).</p>
      <div className="champ"><label htmlFor="outil-nomSpec">Nom</label><input id="outil-nomSpec" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} data-spec-nom /></div>
      <div className="champ"><label htmlFor="outil-systemeSpec">Système</label><select id="outil-systemeSpec" value={systeme} onChange={(e) => setSysteme(e.target.value)} data-spec-systeme>{SYSTEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-fluideSpec">Fluide (déclaré)</label><input id="outil-fluideSpec" value={fluide} maxLength={60} onChange={(e) => setFluide(e.target.value)} onKeyDown={stop} data-spec-fluide /></div>
      <div className="champ"><label htmlFor="outil-materiauSpec">Matériau (déclaré)</label><input id="outil-materiauSpec" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ"><label htmlFor="outil-catSpec">Catalogue sourcé</label><select id="outil-catSpec" value={catalogueId} onChange={(e) => setCatalogueId(e.target.value)} data-spec-catalogue><option value="">Aucun (sections saisies)</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
      {catalogueId && <div className="champ"><label htmlFor="outil-desSpec">Désignations admises (séparées par « ; », vide : toutes)</label><input id="outil-desSpec" value={designations} onChange={(e) => setDesignations(e.target.value)} onKeyDown={stop} data-spec-designations /></div>}
      <div className="champ"><label htmlFor="outil-noteSpec">Note</label><input id="outil-noteSpec" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} onKeyDown={stop} /></div>
      <div className="boutons"><button type="button" data-spec-definir disabled={readOnly || !onCommandes || !pret} onClick={definir}>Définir la spécification</button></div>
      {specs.length > 0 && (
        <ul className="nav-liste" data-spec-liste>
          {specs.map((d) => <li key={d.id}><span>{d.nom} · {libelle(SYSTEMES, String(d.params["systeme"]))}{d.params["fluide"] ? ` · ${String(d.params["fluide"])}` : ""}{d.params["catalogueId"] ? ` · ${etat.definitions[String(d.params["catalogueId"])]?.nom ?? ""}` : ""}</span> <button type="button" disabled={readOnly || !onCommandes} onClick={() => onCommandes?.([{ type: "specification.supprimer", params: { id: d.id } }], `Supprimer la spécification ${d.nom}`)}>Supprimer</button></li>)}
        </ul>
      )}
    </section>
  );
}

function Ports({ o, etat, readOnly, onCommandes }: { o: OccurrenceQuelconque; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const ports: PortAbsolu[] = portsDe(o);
  return (
    <table className="tableau-ports" data-fiche-ports>
      <thead><tr><th>Port</th><th>Position (x ; y ; z)</th><th>Sens</th><th>Section</th><th>État</th></tr></thead>
      <tbody>
        {ports.map((p) => {
          const cx = connexionDuPort(etat, o.id, p.id);
          const autre = cx ? (cx.sourceId === o.id ? `${nomDe(etat.objets[cx.targetId]!)}:${String(cx.params["portB"])}` : `${nomDe(etat.objets[cx.sourceId]!)}:${String(cx.params["portA"])}`) : null;
          return (
            <tr key={p.id} data-port={p.id} data-port-etat={cx ? "connecte" : "libre"}>
              <td>{p.id}</td><td>{fmt(p.position.x)} ; {fmt(p.position.y)} ; {fmt(p.position.z)}</td><td>{libelle(SENS, p.sens)}</td><td>{designationReseau(p.section)}{p.fluide ? ` · ${p.fluide}` : ""}</td>
              <td>{cx ? <>connecté à {autre} <button type="button" disabled={readOnly || !onCommandes} onClick={() => onCommandes?.([{ type: "reseau.deconnecter", params: { id: cx.id } }], `Déconnecter ${nomDe(o)}:${p.id}`)}>Déconnecter</button></> : "libre"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Fiche d'un objet de réseau : paramètres, ports et connexions, problèmes de connectivité. */
export function FicheReseau({ o, etat, readOnly, onCommandes }: { o: Occurrence<"segment-reseau"> | Occurrence<"raccord-reseau"> | Occurrence<"vanne"> | Occurrence<"equipement-reseau">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const spec = (id: string | null) => (id ? (etat.definitions[id]?.nom ?? id) : "aucune");
  const problemes = Object.values(etat.problemes).filter((p) => p.type === "reseau" && (p.objetId === o.id || p.message.includes(`${o.id}:`)));
  return (
    <div className="fiche-structure" data-fiche-reseau={o.classe}>
      <dl className="inspecteur-champs">
        {o.classe === "segment-reseau" && (
          <>
            <div className="champ"><dt>Système</dt><dd>{libelle(SYSTEMES, o.params.systeme)}</dd></div>
            <div className="champ"><dt>Section</dt><dd data-reseau-section>{designationReseau(o.params.section, o.params.profil)}</dd></div>
            {o.params.profil && <div className="champ"><dt>Source de la section</dt><dd data-reseau-source translate="no">{o.params.profil.source}</dd></div>}
            <div className="champ"><dt>Longueur</dt><dd data-reseau-longueur>{fmt(longueurSegment(o.params))} m ({o.params.sommets.length} sommets)</dd></div>
            <div className="champ"><dt>Fluide</dt><dd>{o.params.fluide ?? "non évalué"}</dd></div>
            <div className="champ"><dt>Matériau</dt><dd>{o.params.materiau ?? "non évalué"}</dd></div>
            <div className="champ"><dt>Sens</dt><dd>{o.params.sens === "a-vers-b" ? "du premier sommet vers le dernier" : o.params.sens === "b-vers-a" ? "du dernier sommet vers le premier" : "indifférent"}</dd></div>
            <div className="champ"><dt>Spécification</dt><dd>{spec(o.params.specificationId)}</dd></div>
            <div className="champ"><dt>Supports</dt><dd data-reseau-supports>{supportsDe(etat, o.id).length ? supportsDe(etat, o.id).map((s) => `${s.params.type} (${s.id})`).join(", ") : "aucun"}</dd></div>
          </>
        )}
        {o.classe === "raccord-reseau" && (
          <>
            <div className="champ"><dt>Type</dt><dd>{libelle(TYPES_RACCORD, o.params.type)} · {libelle(SYSTEMES, o.params.systeme)}</dd></div>
            <div className="champ"><dt>Section</dt><dd data-reseau-section>{designationReseau(o.params.section, o.params.profil)}</dd></div>
            <div className="champ"><dt>Fluide</dt><dd>{o.params.fluide ?? "non évalué"}</dd></div>
            <div className="champ"><dt>Spécification</dt><dd>{spec(o.params.specificationId)}</dd></div>
          </>
        )}
        {o.classe === "vanne" && (
          <>
            <div className="champ"><dt>Type</dt><dd>{libelle(TYPES_VANNE, o.params.type)}</dd></div>
            <div className="champ"><dt>Section</dt><dd data-reseau-section>{designationReseau(o.params.section, o.params.profil)} · face à face {Math.round(o.params.longueur.value * 1000)} mm</dd></div>
            <div className="champ"><dt>Fluide</dt><dd>{o.params.fluide ?? "non évalué"}</dd></div>
            <div className="champ"><dt>Spécification</dt><dd>{spec(o.params.specificationId)}</dd></div>
          </>
        )}
        {o.classe === "equipement-reseau" && (
          <>
            <div className="champ"><dt>Type</dt><dd>{o.params.type} · {libelle(CATEGORIES, o.params.categorie)}</dd></div>
            <div className="champ"><dt>Encombrement</dt><dd>{Math.round(o.params.longueur.value * 1000)} × {Math.round(o.params.largeur.value * 1000)} × {Math.round(o.params.hauteur.value * 1000)} mm</dd></div>
            <div className="champ"><dt>Performances</dt><dd>non évaluées (aucune donnée de débit ni de puissance)</dd></div>
          </>
        )}
      </dl>
      <Ports o={o} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      {problemes.length > 0 && <ul className="inspecteur-problemes" data-reseau-problemes>{problemes.map((p) => <li key={p.id}>{p.message}</li>)}</ul>}
      <p className="inspecteur-aide">Nomenclature et schéma : mode Documents → « Nomenclature de réseau » et « Schéma de principe (P&ID) ».</p>
    </div>
  );
}

export function FicheSupportReseau({ o, etat }: { o: Occurrence<"support-reseau">; etat: ModeleAtelier }) {
  const porte = etat.objets[o.params.porteId];
  return (
    <div className="fiche-structure" data-fiche-support-reseau>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Type</dt><dd>{libelle(TYPES_SUPPORT, o.params.type)}</dd></div>
        <div className="champ"><dt>Segment porté</dt><dd>{porte ? nomDe(porte) : `${o.params.porteId} (absent)`}</dd></div>
        <div className="champ"><dt>Altitude</dt><dd>{fmt(o.params.z)} m{o.params.longueur ? ` · suspente ${Math.round(o.params.longueur.value * 1000)} mm` : ""}</dd></div>
      </dl>
    </div>
  );
}
