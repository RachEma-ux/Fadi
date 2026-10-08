/**
 * Ontologie bois (P2-4, T01) : outils Élément bois, Ossature (mur ou charpente, génération contrôlée depuis la fiche),
 * Panneau CLT et Assemblage bois dans l'inspecteur ; fiches dans la fiche d'objet. Aucun écran, aucun ruban. Rien n'est
 * supposé : sections, essences et classes sont saisies ou tirées d'un catalogue sourcé du projet (D-180).
 */
import { useState } from "react";
import { designationBois, elementsDeOssature, longueurElementBois, planOssature, volumePanneauClt, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { type EtatUi } from "../etat-ui";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
const nomDe = (o: OccurrenceQuelconque) => ((o.params as unknown as { nom?: string | null }).nom ?? null) || o.id;
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;
const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, frame: "local", unit: "m" });
const mm = (v: string): { value: number; unit: "m" } | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) && n > 0 ? { value: n / 1000, unit: "m" } : null; };
const nombre = (v: string): number | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const ROLES_BOIS = [["montant", "Montant"], ["lisse", "Lisse"], ["sabliere", "Sablière"], ["traverse", "Traverse"], ["linteau", "Linteau"], ["appui", "Appui"], ["poteau", "Poteau"], ["poutre", "Poutre"], ["solive", "Solive"], ["entretoise", "Entretoise"], ["panne", "Panne"], ["chevron", "Chevron"], ["faitiere", "Faîtière"], ["diagonale", "Diagonale"], ["autre", "Autre"]] as const;
const TYPES_ASSEMBLAGE_BOIS = [["tenon-mortaise", "Tenon-mortaise (bois–bois)"], ["mi-bois", "Mi-bois (bois–bois)"], ["embrevement", "Embrèvement (bois–bois)"], ["queue-d-aronde", "Queue d'aronde (bois–bois)"], ["enture", "Enture (bois–bois)"], ["equerre", "Équerre (bois–métal)"], ["sabot", "Sabot (bois–métal)"], ["plaque", "Plaque (bois–métal)"], ["ferrure", "Ferrure (bois–métal)"], ["boulon-broche", "Boulon ou broche (bois–métal)"], ["vis", "Vis (bois–métal)"]] as const;
const PIECES = ["element-bois", "panneau-clt", "poteau", "poutre"];

function catalogues(etat: ModeleAtelier) {
  return Object.values(etat.definitions).filter((d) => d.classe === ("catalogue" as typeof d.classe)).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/** Éditeur de section bois : largeur × hauteur en mm (essence et classe déclarées) ou désignation d'un catalogue sourcé. */
export type SectionBoisSaisie = { mode: "saisie"; largeur: string; hauteur: string; essence: string; classe: string } | { mode: "catalogue"; catalogueId: string; designation: string };
export const SECTION_BOIS_DEFAUT: SectionBoisSaisie = { mode: "saisie", largeur: "", hauteur: "", essence: "", classe: "" };
export function sectionBoisCommande(s: SectionBoisSaisie): Record<string, unknown> | null {
  if (s.mode === "catalogue") return s.catalogueId && s.designation.trim() ? { catalogueId: s.catalogueId, designation: s.designation.trim() } : null;
  const largeur = mm(s.largeur), hauteur = mm(s.hauteur);
  if (!largeur || !hauteur) return null;
  return { largeur, hauteur, essence: s.essence.trim() || null, classe: s.classe.trim() || null };
}
export function EditeurSectionBois({ id, etat, legende, valeur, onChange }: { id: string; etat: ModeleAtelier; legende: string; valeur: SectionBoisSaisie; onChange: (s: SectionBoisSaisie) => void }) {
  const cats = catalogues(etat);
  return (
    <fieldset className="editeur-section" data-editeur-section-bois={id}>
      <legend>{legende}</legend>
      <div className="champ">
        <label htmlFor={`${id}-mode`}>Origine</label>
        <select id={`${id}-mode`} value={valeur.mode} onChange={(e) => onChange(e.target.value === "catalogue" ? { mode: "catalogue", catalogueId: cats[0]?.id ?? "", designation: "" } : { ...SECTION_BOIS_DEFAUT })}>
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
          <div className="champ"><label htmlFor={`${id}-l`}>Largeur (mm)</label><input id={`${id}-l`} inputMode="decimal" value={valeur.largeur} data-section-largeur onChange={(e) => onChange({ ...valeur, largeur: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="champ"><label htmlFor={`${id}-h`}>Hauteur (mm)</label><input id={`${id}-h`} inputMode="decimal" value={valeur.hauteur} data-section-hauteur onChange={(e) => onChange({ ...valeur, hauteur: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="champ"><label htmlFor={`${id}-es`}>Essence (déclarée)</label><input id={`${id}-es`} value={valeur.essence} maxLength={60} onChange={(e) => onChange({ ...valeur, essence: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="champ"><label htmlFor={`${id}-cl`}>Classe de résistance (déclarée)</label><input id={`${id}-cl`} value={valeur.classe} maxLength={40} onChange={(e) => onChange({ ...valeur, classe: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
        </>
      )}
    </fieldset>
  );
}

/** Outil Élément bois (DA-09-01) : deux poteaux, une ligne d'esquisse ou des extrémités saisies ; section saisie ou de catalogue. */
export function OutilElementBois({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const ligne = sel.find((o): o is Occurrence<"esquisse"> => o.classe === "esquisse" && o.params.points.length >= 2);
  const poteaux = sel.filter((o): o is Occurrence<"poteau"> => o.classe === "poteau");
  const defaut = poteaux.length >= 2 ? [poteaux[0]!.params.point, poteaux[1]!.params.point] : ligne ? [ligne.params.points[0]!, ligne.params.points[ligne.params.points.length - 1]!] : [P(ui.vue.cx - 2, ui.vue.cy), P(ui.vue.cx + 2, ui.vue.cy)];
  const [ax, setAx] = useState(String(defaut[0]!.x)); const [ay, setAy] = useState(String(defaut[0]!.y));
  const [bx, setBx] = useState(String(defaut[1]!.x)); const [by, setBy] = useState(String(defaut[1]!.y));
  const [za, setZa] = useState("0"); const [zb, setZb] = useState("");
  const [role, setRole] = useState("poutre");
  const [nom, setNom] = useState("");
  const [section, setSection] = useState<SectionBoisSaisie>(SECTION_BOIS_DEFAUT);
  const sec = sectionBoisCommande(section);
  const a = nombre(ax) !== null && nombre(ay) !== null ? P(nombre(ax)!, nombre(ay)!) : null;
  const b = nombre(bx) !== null && nombre(by) !== null ? P(nombre(bx)!, nombre(by)!) : null;
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !sec || !a || !b) return;
    const z1 = nombre(za) ?? 0;
    onCommandes([{ type: "elementBois.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, role, a, b, za: z1, zb: zb.trim() ? (nombre(zb) ?? z1) : z1, section: sec } }], `Pièce de bois ${nom.trim() || role}`);
  };
  return (
    <section className="outil-structure" aria-label="Élément bois" data-outil-element-bois>
      <p className="inspecteur-aide">Sélectionnez deux poteaux ou une ligne d'esquisse, ou saisissez les extrémités ; section en millimètres (essence et classe déclarées) ou désignation d'un catalogue sourcé du projet.</p>
      <div className="champ"><label htmlFor="outil-nomBois">Nom</label><input id="outil-nomBois" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-roleBois">Rôle</label><select id="outil-roleBois" value={role} onChange={(e) => setRole(e.target.value)}>{ROLES_BOIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-bois-ax">Début (x ; y) m</label><span className="vecteur"><input id="outil-bois-ax" aria-label="Début x" value={ax} onChange={(e) => setAx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /><input aria-label="Début y" value={ay} onChange={(e) => setAy(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></span></div>
      <div className="champ champ-vecteur"><label htmlFor="outil-bois-bx">Fin (x ; y) m</label><span className="vecteur"><input id="outil-bois-bx" aria-label="Fin x" value={bx} onChange={(e) => setBx(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /><input aria-label="Fin y" value={by} onChange={(e) => setBy(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></span></div>
      <div className="champ"><label htmlFor="outil-bois-za">Altitude de l'axe au début (m, depuis le niveau)</label><input id="outil-bois-za" inputMode="decimal" value={za} onChange={(e) => setZa(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-bois-zb">Altitude à la fin (vide : horizontal)</label><input id="outil-bois-zb" inputMode="decimal" value={zb} onChange={(e) => setZb(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <EditeurSectionBois id="outil-sectionBois" etat={etat} legende="Section" valeur={section} onChange={setSection} />
      {!sec && <p className="inspecteur-alerte" role="note">Section incomplète : indiquez largeur et hauteur, ou une désignation du catalogue.</p>}
      <div className="boutons"><button type="button" data-element-bois-creer disabled={readOnly || !onCommandes || !ui.niveauId || !sec || !a || !b} onClick={creer}>Créer la pièce</button></div>
    </section>
  );
}

/** Outil Ossature (DA-09-02 / 07 / 08) : depuis le mur ou la toiture sélectionné ; la génération se demande dans la fiche après aperçu. */
export function OutilOssature({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const hote = ui.selection.map((id) => etat.objets[id]).find((o): o is Occurrence<"mur"> | Occurrence<"toiture"> => !!o && (o.classe === "mur" || o.classe === "toiture"));
  const genre = hote?.classe === "toiture" ? "toit" : "mur";
  const [nom, setNom] = useState("");
  const [entraxe, setEntraxe] = useState("");
  const [montant, setMontant] = useState<SectionBoisSaisie>(SECTION_BOIS_DEFAUT);
  const [lisse, setLisse] = useState<SectionBoisSaisie | null>(null);
  const sm = sectionBoisCommande(montant);
  const sl = lisse ? sectionBoisCommande(lisse) : null;
  const ex = mm(entraxe);
  const pret = !!hote && !!sm && !!ex && (!lisse || !!sl);
  const creer = () => {
    if (!onCommandes || !pret || !hote) return;
    onCommandes([{ type: "ossature.creer", params: { nom: nom.trim() || (genre === "mur" ? "Ossature" : "Charpente"), genre, hoteId: hote.id, entraxe: ex, sectionMontant: sm, sectionLisse: sl } }], `${genre === "mur" ? "Ossature" : "Charpente"} ${nom.trim()}`.trim());
  };
  return (
    <section className="outil-structure" aria-label="Ossature bois" data-outil-ossature>
      <p className="inspecteur-aide">Sélectionnez un mur (mur à ossature : lisses, montants à l'entraxe, montants de rive, linteaux et appuis des baies) ou une toiture en pente (charpente : sablières, faîtière, chevrons). L'ossature ne crée rien d'elle-même : l'aperçu puis l'accord sont dans sa fiche.</p>
      {hote ? <p className="inspecteur-meta" data-ossature-hote>{genre === "mur" ? "Mur" : "Toiture"} : {nomDe(hote)}</p> : <p className="inspecteur-alerte" role="note" data-ossature-message>Aucun mur ni toiture dans la sélection.</p>}
      <div className="champ"><label htmlFor="outil-nomOssature">Nom</label><input id="outil-nomOssature" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-ossature-nom /></div>
      <div className="champ"><label htmlFor="outil-entraxe">Entraxe (mm)</label><input id="outil-entraxe" inputMode="decimal" value={entraxe} onChange={(e) => setEntraxe(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-ossature-entraxe /></div>
      <EditeurSectionBois id="outil-sectionMontant" etat={etat} legende={genre === "mur" ? "Section des montants" : "Section des chevrons"} valeur={montant} onChange={setMontant} />
      <label className="case"><input type="checkbox" checked={!!lisse} onChange={(e) => setLisse(e.target.checked ? { ...SECTION_BOIS_DEFAUT } : null)} /> {genre === "mur" ? "Section différente pour lisses, linteaux et appuis" : "Section différente pour les pannes"}</label>
      {lisse && <EditeurSectionBois id="outil-sectionLisse" etat={etat} legende={genre === "mur" ? "Section des lisses" : "Section des pannes"} valeur={lisse} onChange={setLisse} />}
      <div className="boutons"><button type="button" data-ossature-creer disabled={readOnly || !onCommandes || !pret} onClick={creer}>Créer l'ossature</button></div>
    </section>
  );
}

/** Fiche d'une ossature : aperçu de la génération (comptes par rôle), hauteur si le mur n'en a pas, accord. */
export function FicheOssature({ o, etat, readOnly, onCommandes }: { o: Occurrence<"ossature">; etat: ModeleAtelier; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [hauteur, setHauteur] = useState("");
  const h = hauteur.trim() ? nombre(hauteur) : null;
  let plan: ReturnType<typeof planOssature> | null = null;
  let message: string | null = null;
  try { plan = planOssature(etat, o, h && h > 0 ? h : null); } catch (e) { message = e instanceof Error ? e.message : String(e); }
  const parRole = plan ? [...plan.reduce((m2, e) => m2.set(e.role, (m2.get(e.role) ?? 0) + 1), new Map<string, number>())].map(([r, c]) => `${c} ${r}`).join(", ") : "";
  const generes = elementsDeOssature(etat, o.id);
  const hote = etat.objets[o.params.hoteId];
  return (
    <div className="fiche-structure" data-fiche-ossature>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>{o.params.genre === "mur" ? "Mur hôte" : "Toiture hôte"}</dt><dd>{hote ? nomDe(hote) : `${o.params.hoteId} (absent)`}</dd></div>
        <div className="champ"><dt>Entraxe</dt><dd>{Math.round(o.params.entraxe.value * 1000)} mm · {designationBois(o.params.sectionMontant)}{o.params.sectionLisse ? ` / ${designationBois(o.params.sectionLisse)}` : ""}</dd></div>
        <div className="champ"><dt>Déjà généré</dt><dd data-ossature-generes>{generes.length ? `${generes.length} pièce(s)` : "rien"}</dd></div>
      </dl>
      <fieldset className="generation-trame">
        <legend>Génération contrôlée</legend>
        {o.params.genre === "mur" && <div className="champ"><label htmlFor={`oss-h-${o.id}`}>Hauteur de l'ossature (m ; vide : celle du mur)</label><input id={`oss-h-${o.id}`} inputMode="decimal" value={hauteur} onChange={(e) => setHauteur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-ossature-hauteur /></div>}
        {message ? <p className="inspecteur-alerte" role="note" data-ossature-apercu>{message}</p> : <p className="inspecteur-meta" data-ossature-apercu>Aperçu : {plan!.length} pièce(s) seront créées ({parRole}) ; ce qui existe déjà à la même place n'est pas recréé.</p>}
        <div className="boutons"><button type="button" data-ossature-generer disabled={readOnly || !onCommandes || !plan} onClick={() => onCommandes?.([{ type: "ossature.generer", params: { id: o.id, ...(h && h > 0 ? { hauteur: { value: h, unit: "m" } } : {}) } }], `Générer ${o.params.nom}`)}>Générer (accord)</button></div>
      </fieldset>
      <p className="inspecteur-aide">Liste des pièces : mode Documents → tableau « Liste des pièces de bois ».</p>
    </div>
  );
}

/** Outil Panneau CLT (DA-09-03) : vertical depuis un mur ou une ligne sélectionnés, horizontal depuis une esquisse fermée ou une dalle. */
export function OutilPanneauClt({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const mur = sel.find((o): o is Occurrence<"mur"> => o.classe === "mur");
  const ligne = sel.find((o): o is Occurrence<"esquisse"> => o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "polyligne") && o.params.points.length >= 2);
  const surface = sel.find((o) => (o.classe === "esquisse" && ["polygone", "rectangle"].includes(o.params.forme) && o.params.points.length >= 2) || o.classe === "dalle");
  const axe = mur ? [mur.params.a, mur.params.b] : ligne ? [ligne.params.points[0]!, ligne.params.points[1]!] : null;
  const contour: Point2[] = surface ? (surface.classe === "esquisse" ? (surface.params.forme === "rectangle" && surface.params.points.length === 2 ? [surface.params.points[0]!, P(surface.params.points[1]!.x, surface.params.points[0]!.y), surface.params.points[1]!, P(surface.params.points[0]!.x, surface.params.points[1]!.y)] : surface.params.points) : (surface as Occurrence<"dalle">).params.contour) : [];
  const pose = axe ? "mur" : "plancher";
  const [nom, setNom] = useState("");
  const [epaisseur, setEpaisseur] = useState("");
  const [couches, setCouches] = useState("5");
  const [hauteur, setHauteur] = useState(mur?.params.hauteur ? String(mur.params.hauteur.value) : "");
  const [z, setZ] = useState("0");
  const [essence, setEssence] = useState("");
  const [classe, setClasse] = useState("");
  const ep = mm(epaisseur);
  const nc = Math.round(nombre(couches) ?? 0);
  const pret = !!ep && nc >= 1 && (axe ? !!hauteur.trim() && (nombre(hauteur) ?? 0) > 0 : contour.length >= 3);
  const creer = () => {
    if (!onCommandes || !ui.niveauId || !pret) return;
    const params = axe ? { pose, a: axe[0], b: axe[1], hauteur: { value: nombre(hauteur), unit: "m" } } : { pose, contour };
    onCommandes([{ type: "panneauClt.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, ...params, z: nombre(z) ?? 0, epaisseur: ep, couches: nc, essence: essence.trim() || null, classe: classe.trim() || null } }], `Panneau CLT ${nom.trim()}`.trim());
  };
  return (
    <section className="outil-structure" aria-label="Panneau CLT" data-outil-clt>
      <p className="inspecteur-aide">Sélectionnez un mur ou une ligne (panneau vertical sur cet axe) ou une esquisse fermée / une dalle (panneau de plancher) ; épaisseur et nombre de couches saisis.</p>
      {axe ? <p className="inspecteur-meta" data-clt-pret>Panneau vertical sur {mur ? nomDe(mur) : nomDe(ligne!)}</p> : contour.length >= 3 ? <p className="inspecteur-meta" data-clt-pret>Panneau de plancher : {contour.length} sommets</p> : <p className="inspecteur-alerte" role="note" data-clt-message>Aucun mur, ligne, esquisse fermée ni dalle dans la sélection.</p>}
      <div className="champ"><label htmlFor="outil-nomClt">Nom</label><input id="outil-nomClt" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-epClt">Épaisseur (mm)</label><input id="outil-epClt" inputMode="decimal" value={epaisseur} onChange={(e) => setEpaisseur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-clt-epaisseur /></div>
      <div className="champ"><label htmlFor="outil-couchesClt">Nombre de couches</label><input id="outil-couchesClt" inputMode="numeric" value={couches} onChange={(e) => setCouches(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      {axe && <div className="champ"><label htmlFor="outil-hClt">Hauteur (m)</label><input id="outil-hClt" inputMode="decimal" value={hauteur} onChange={(e) => setHauteur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-clt-hauteur /></div>}
      <div className="champ"><label htmlFor="outil-zClt">Base (m, depuis le niveau)</label><input id="outil-zClt" inputMode="decimal" value={z} onChange={(e) => setZ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-essenceClt">Essence (déclarée)</label><input id="outil-essenceClt" value={essence} maxLength={60} onChange={(e) => setEssence(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="champ"><label htmlFor="outil-classeClt">Classe (déclarée)</label><input id="outil-classeClt" value={classe} maxLength={40} onChange={(e) => setClasse(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      <div className="boutons"><button type="button" data-clt-creer disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={creer}>Créer le panneau</button></div>
    </section>
  );
}

/** Outil Assemblage bois (DA-09-04 / 05 / 06) : deux pièces sélectionnées, type, quincaillerie déclarée avec sa source. */
export function OutilAssemblageBois({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes }) {
  const pieces = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o && PIECES.includes(o.classe));
  const [type, setType] = useState("tenon-mortaise");
  const [nom, setNom] = useState("");
  const [quinc, setQuinc] = useState<{ designation: string; nombre: string; source: string }[]>([]);
  const [pl, setPl] = useState({ l: "", h: "", e: "" });
  const metal = !["tenon-mortaise", "mi-bois", "embrevement", "queue-d-aronde", "enture"].includes(type);
  const message = pieces.length !== 2 ? "Sélectionnez exactement deux pièces (Maj + clic) : pièces de bois, panneaux CLT, poteaux ou poutres." : null;
  const platine = metal && mm(pl.l) && mm(pl.h) && mm(pl.e) ? { largeur: mm(pl.l), hauteur: mm(pl.h), epaisseur: mm(pl.e) } : null;
  const quincaillerie = quinc.filter((q) => q.designation.trim() && (nombre(q.nombre) ?? 0) >= 1).map((q) => ({ designation: q.designation.trim(), nombre: Math.round(nombre(q.nombre)!), source: q.source.trim() || null }));
  const centre = (o: OccurrenceQuelconque): Point2 => (o.classe === "element-bois" || o.classe === "poutre" ? P((o.params.a.x + o.params.b.x) / 2, (o.params.a.y + o.params.b.y) / 2) : o.classe === "poteau" ? o.params.point : o.classe === "panneau-clt" && o.params.a && o.params.b ? P((o.params.a.x + o.params.b.x) / 2, (o.params.a.y + o.params.b.y) / 2) : P(ui.vue.cx, ui.vue.cy));
  const creer = () => {
    if (!onCommandes || message) return;
    const [a, b] = pieces as [OccurrenceQuelconque, OccurrenceQuelconque];
    const ca = centre(a), cb = centre(b);
    onCommandes([{ type: "assemblageBois.creer", params: { nom: nom.trim() || null, type, a: a.id, b: b.id, position: P((ca.x + cb.x) / 2, (ca.y + cb.y) / 2), z: a.classe === "element-bois" ? a.params.za : 0, quincaillerie, platine } }], `Assemblage bois ${nomDe(a)} / ${nomDe(b)}`);
  };
  return (
    <section className="outil-structure" aria-label="Assemblage bois" data-outil-assemblage-bois>
      {message ? <p className="inspecteur-alerte" role="note" data-assemblage-bois-message>{message}</p> : <p className="inspecteur-meta" data-assemblage-bois-pret>{nomDe(pieces[0]!)} / {nomDe(pieces[1]!)}</p>}
      <div className="champ"><label htmlFor="outil-typeAssemblageBois">Type</label><select id="outil-typeAssemblageBois" value={type} onChange={(e) => setType(e.target.value)}>{TYPES_ASSEMBLAGE_BOIS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <div className="champ"><label htmlFor="outil-nomAssemblageBois">Nom</label><input id="outil-nomAssemblageBois" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></div>
      {metal && (
        <>
          <div className="champ"><label htmlFor="outil-plb-l">Platine ou ferrure : largeur (mm)</label><input id="outil-plb-l" inputMode="decimal" value={pl.l} onChange={(e) => setPl({ ...pl, l: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="champ"><label htmlFor="outil-plb-h">Platine ou ferrure : hauteur (mm)</label><input id="outil-plb-h" inputMode="decimal" value={pl.h} onChange={(e) => setPl({ ...pl, h: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
          <div className="champ"><label htmlFor="outil-plb-e">Platine ou ferrure : épaisseur (mm)</label><input id="outil-plb-e" inputMode="decimal" value={pl.e} onChange={(e) => setPl({ ...pl, e: e.target.value })} onKeyDown={(e) => e.stopPropagation()} /></div>
        </>
      )}
      <fieldset className="editeur-section">
        <legend>Quincaillerie (déclarée)</legend>
        {quinc.map((q, i) => (
          <div className="champ champ-vecteur" key={i}>
            <label htmlFor={`quinc-${i}`}>Article {i + 1}</label>
            <span className="vecteur">
              <input id={`quinc-${i}`} aria-label="Désignation" placeholder="désignation" value={q.designation} onChange={(e) => setQuinc(quinc.map((x, j) => (j === i ? { ...x, designation: e.target.value } : x)))} onKeyDown={(e) => e.stopPropagation()} />
              <input aria-label="Nombre" inputMode="numeric" placeholder="nombre" value={q.nombre} onChange={(e) => setQuinc(quinc.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} onKeyDown={(e) => e.stopPropagation()} />
              <input aria-label="Source" placeholder="source (catalogue, page)" value={q.source} onChange={(e) => setQuinc(quinc.map((x, j) => (j === i ? { ...x, source: e.target.value } : x)))} onKeyDown={(e) => e.stopPropagation()} />
            </span>
          </div>
        ))}
        <div className="boutons"><button type="button" onClick={() => setQuinc([...quinc, { designation: "", nombre: "1", source: "" }])} data-quincaillerie-ajouter>Ajouter un article</button></div>
      </fieldset>
      <div className="boutons"><button type="button" data-assemblage-bois-creer disabled={readOnly || !onCommandes || !!message} onClick={creer}>Créer l'assemblage</button></div>
    </section>
  );
}

const NON_EVALUEE = "non évaluée";

export function FicheElementBois({ o, etat }: { o: Occurrence<"element-bois">; etat: ModeleAtelier }) {
  const L = longueurElementBois(o.params);
  const sec = o.params.section;
  const oss = o.params.ossatureId ? etat.objets[o.params.ossatureId] : undefined;
  return (
    <div className="fiche-structure" data-fiche-element-bois>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Rôle</dt><dd>{ROLES_BOIS.find(([v]) => v === o.params.role)?.[1] ?? o.params.role}{o.params.repere ? ` · repère ${o.params.repere}` : ""}</dd></div>
        <div className="champ"><dt>Section</dt><dd data-bois-section>{designationBois(sec)}</dd></div>
        <div className="champ"><dt>Essence</dt><dd>{sec.essence ?? NON_EVALUEE}{sec.classe ? ` · ${sec.classe}` : ""}</dd></div>
        {sec.profil && <div className="champ"><dt>Source</dt><dd translate="no">{sec.profil.source}</dd></div>}
        <div className="champ"><dt>Longueur</dt><dd data-bois-longueur>{fmt(L)} m</dd></div>
        <div className="champ"><dt>Volume</dt><dd>{fmt(sec.largeur.value * sec.hauteur.value * L, 4)} m³</dd></div>
        <div className="champ"><dt>Masse</dt><dd>{NON_EVALUEE} (aucune densité sourcée)</dd></div>
        {oss && <div className="champ"><dt>Ossature</dt><dd>{nomDe(oss)}</dd></div>}
      </dl>
    </div>
  );
}

export function FichePanneauClt({ o }: { o: Occurrence<"panneau-clt"> }) {
  return (
    <div className="fiche-structure" data-fiche-clt>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Pose</dt><dd>{o.params.pose === "mur" ? "vertical" : "plancher"} · {o.params.couches} couches · e {Math.round(o.params.epaisseur.value * 1000)} mm</dd></div>
        <div className="champ"><dt>Essence</dt><dd>{o.params.essence ?? NON_EVALUEE}{o.params.classe ? ` · ${o.params.classe}` : ""}</dd></div>
        <div className="champ"><dt>Volume</dt><dd data-clt-volume>{fmt(volumePanneauClt(o.params))} m³</dd></div>
        <div className="champ"><dt>Masse</dt><dd>{NON_EVALUEE} (aucune densité sourcée)</dd></div>
      </dl>
    </div>
  );
}

export function FicheAssemblageBois({ o, etat }: { o: Occurrence<"assemblage-bois">; etat: ModeleAtelier }) {
  return (
    <div className="fiche-structure" data-fiche-assemblage-bois>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Type</dt><dd>{TYPES_ASSEMBLAGE_BOIS.find(([v]) => v === o.params.type)?.[1] ?? o.params.type}</dd></div>
        <div className="champ"><dt>Pièces</dt><dd>{[o.params.a, o.params.b].map((id) => (etat.objets[id] ? nomDe(etat.objets[id]!) : `${id} (absent)`)).join(" / ")}</dd></div>
        {o.params.platine && <div className="champ"><dt>Platine ou ferrure</dt><dd>{Math.round(o.params.platine.largeur.value * 1000)} × {Math.round(o.params.platine.hauteur.value * 1000)} × {Math.round(o.params.platine.epaisseur.value * 1000)} mm</dd></div>}
        <div className="champ"><dt>Quincaillerie</dt><dd data-assemblage-bois-quincaillerie>{o.params.quincaillerie.length ? o.params.quincaillerie.map((q) => `${q.designation} × ${q.nombre}${q.source ? ` (${q.source})` : ""}`).join(" ; ") : "aucune déclarée"}</dd></div>
      </dl>
      <p className="inspecteur-aide">Géométrie et nomenclature seulement : la résistance de l'assemblage n'est pas évaluée.</p>
    </div>
  );
}
