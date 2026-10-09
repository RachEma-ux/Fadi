/**
 * Bâtiment P2 et surfaces libres (P2-6, cahier P2 §5 lot P2-6 ; DA-07-08, 09, 11, 13, 14, 18, 19, 21, 23 ; DA-03-03, 05, 06,
 * 07, 20) : plafond, coque, rampe, échelle, mur-rideau, terrain, réservation, installation de chantier et surface libre
 * dans l'inspecteur, comme tout outil (sélection → paramètres → validation). Rien n'est supposé : hauteurs, épaisseurs,
 * entraxes, flèches, dates, altitudes du semis sont saisis ; une grandeur dérivée (pente, triangles, profils) est
 * affichée sans être confrontée à une règle.
 */
import { useState } from "react";
import { altitudeTerrain, facesSubdivisees, longueurRampe, nombreProfilsMurRideau, penteRampe, trianglesTerrain, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type Point2 } from "@parcours/atelier-model";
import { type EtatUi } from "../etat-ui";
import { contourEsquisse } from "../actions";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });
const nomDe = (o: OccurrenceQuelconque) => ((o.params as unknown as { nom?: string | null }).nom ?? null) || o.id;
type OnCommandes = ((commandes: Commande[], label: string) => void) | undefined;
type Props = { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: OnCommandes };
const P = (x: number, y: number): Point2 => ({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000, frame: "local", unit: "m" });
const nombre = (v: string): number | null => { const n = Number(v.replace(",", ".")); return Number.isFinite(n) ? n : null; };
const metres = (v: string): { value: number; unit: "m" } | null => { const n = nombre(v); return n !== null && n > 0 ? { value: n, unit: "m" } : null; };
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const Champ = ({ id, libelle, valeur, onChange, aide, data }: { id: string; libelle: string; valeur: string; onChange: (v: string) => void; aide?: string; data?: string }) => (
  <div className="champ"><label htmlFor={id}>{libelle}</label><input id={id} inputMode="decimal" value={valeur} title={aide} onChange={(e) => onChange(e.target.value)} onKeyDown={stop} {...(data ? { [data]: "" } : {})} /></div>
);

/** Contour en plan : esquisse fermée, dalle, pièce ou plafond sélectionnés ; sinon un rectangle L × l centré sur la vue. */
function useContour(etat: ModeleAtelier, ui: EtatUi) {
  const [L, setL] = useState("4"); const [l, setl] = useState("3");
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  let contour: Point2[] | null = null, trous: Point2[][] = [], source: OccurrenceQuelconque | null = null;
  for (const o of sel) {
    const c = contourEsquisse(etat, o.id);
    if (c && c.length >= 3) { contour = c; source = o; break; }
    if ((o.classe === "dalle" || o.classe === "plafond" || o.classe === "toiture") && o.params.contour.length >= 3) { contour = o.params.contour; trous = o.classe === "toiture" ? [] : o.params.trous; source = o; break; }
    if (o.classe === "piece" && o.params.contour.length >= 3) { contour = o.params.contour; source = o; break; }
  }
  if (!contour) {
    const a = nombre(L), b = nombre(l);
    if (a && b && a > 0 && b > 0) contour = [P(ui.vue.cx - a / 2, ui.vue.cy - b / 2), P(ui.vue.cx + a / 2, ui.vue.cy - b / 2), P(ui.vue.cx + a / 2, ui.vue.cy + b / 2), P(ui.vue.cx - a / 2, ui.vue.cy + b / 2)];
  }
  const champs = source ? <p className="inspecteur-meta" data-contour-source>Contour : {nomDe(source)} ({contour?.length ?? 0} sommets)</p> : (
    <>
      <p className="inspecteur-aide">Aucune esquisse fermée, dalle ou pièce sélectionnée : rectangle centré sur la vue.</p>
      <Champ id="outil-p2L" libelle="Longueur (m)" valeur={L} onChange={setL} data="data-contour-longueur" />
      <Champ id="outil-p2l" libelle="Largeur (m)" valeur={l} onChange={setl} data="data-contour-largeur" />
    </>
  );
  return { contour, trous, source, champs };
}

/** Axe a → b : ligne d'esquisse ou mur sélectionnés ; sinon saisi. */
function useAxe(etat: ModeleAtelier, ui: EtatUi, longueurDefaut = 4) {
  const [texte, setTexte] = useState(`${fmt(ui.vue.cx - longueurDefaut / 2)} ; ${fmt(ui.vue.cy)}\n${fmt(ui.vue.cx + longueurDefaut / 2)} ; ${fmt(ui.vue.cy)}`);
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  let a: Point2 | null = null, b: Point2 | null = null, source: OccurrenceQuelconque | null = null;
  for (const o of sel) {
    if (o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "construction" || o.params.forme === "polyligne") && o.params.points.length >= 2) { a = o.params.points[0]!; b = o.params.points[o.params.points.length - 1]!; source = o; break; }
    if (o.classe === "mur") { a = o.params.a; b = o.params.b; source = o; break; }
  }
  if (!a || !b) {
    const l = texte.split("\n").map((x) => x.trim()).filter(Boolean).map((x) => x.split(/\s*;\s*/).map(nombre));
    if (l.length >= 2 && l[0]!.length >= 2 && l[1]!.length >= 2 && l[0]!.every((v) => v !== null) && l[1]!.every((v) => v !== null)) { a = P(l[0]![0]!, l[0]![1]!); b = P(l[1]![0]!, l[1]![1]!); }
  }
  const champs = source ? <p className="inspecteur-meta" data-axe-source>Axe : {nomDe(source)}</p> : (
    <div className="champ"><label htmlFor="outil-p2axe">Axe a → b (x ; y, une extrémité par ligne)</label><textarea id="outil-p2axe" rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={stop} data-axe-saisi /></div>
  );
  return { a, b, source, champs };
}

const Bouton = ({ data, pret, readOnly, onCommandes, ui, onClick, children }: { data: string; pret: boolean; readOnly: boolean; onCommandes?: OnCommandes; ui: EtatUi; onClick: () => void; children: string }) => (
  <div className="boutons"><button type="button" {...{ [data]: "" }} disabled={readOnly || !onCommandes || !ui.niveauId || !pret} onClick={onClick}>{children}</button></div>
);

export function OutilPlafond({ etat, ui, readOnly, onCommandes }: Props) {
  const { contour, trous, champs } = useContour(etat, ui);
  const [nom, setNom] = useState(""); const [hauteur, setHauteur] = useState("2.5"); const [epaisseur, setEpaisseur] = useState("0.05"); const [suspendu, setSuspendu] = useState(false); const [materiau, setMateriau] = useState("");
  const h = metres(hauteur), e = metres(epaisseur);
  const pret = !!contour && !!h && !!e;
  return (
    <section className="outil-structure" aria-label="Plafond" data-outil-plafond>
      <p className="inspecteur-aide">Sélectionnez une esquisse fermée, une dalle ou une pièce (son contour), ou laissez le rectangle ; hauteur sous plafond et épaisseur saisies.</p>
      {champs}
      <div className="champ"><label htmlFor="outil-plafondNom">Nom</label><input id="outil-plafondNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-plafondHauteur" libelle="Hauteur sous plafond (m)" valeur={hauteur} onChange={setHauteur} data="data-plafond-hauteur" />
      <Champ id="outil-plafondEpaisseur" libelle="Épaisseur (m)" valeur={epaisseur} onChange={setEpaisseur} />
      <label className="case"><input type="checkbox" checked={suspendu} onChange={(e) => setSuspendu(e.target.checked)} /> Plafond suspendu</label>
      <div className="champ"><label htmlFor="outil-plafondMateriau">Matériau (déclaré)</label><input id="outil-plafondMateriau" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={stop} /></div>
      <Bouton data="data-plafond-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "plafond.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, contour, trous, hauteur: h, epaisseur: e, suspendu, materiau: materiau.trim() || null } }], `Plafond ${nom.trim() || ""}`.trim())}>Créer le plafond</Bouton>
    </section>
  );
}

export function OutilCoque({ etat, ui, readOnly, onCommandes }: Props) {
  const { contour, trous, champs } = useContour(etat, ui);
  const [nom, setNom] = useState(""); const [fleche, setFleche] = useState("1.5"); const [epaisseur, setEpaisseur] = useState("0.12"); const [base, setBase] = useState("3"); const [materiau, setMateriau] = useState("");
  const f = metres(fleche), e = metres(epaisseur), z = nombre(base);
  const pret = !!contour && !!f && !!e && z !== null;
  return (
    <section className="outil-structure" aria-label="Coque" data-outil-coque>
      <p className="inspecteur-aide">Dôme paraboloïdal déclaré sur le contour choisi : flèche au centre, épaisseur, base depuis le niveau. Géométrie seulement, aucune vérification.</p>
      {champs}
      <div className="champ"><label htmlFor="outil-coqueNom">Nom</label><input id="outil-coqueNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-coqueFleche" libelle="Flèche au centre (m)" valeur={fleche} onChange={setFleche} data="data-coque-fleche" />
      <Champ id="outil-coqueEpaisseur" libelle="Épaisseur (m)" valeur={epaisseur} onChange={setEpaisseur} />
      <Champ id="outil-coqueBase" libelle="Base (m, depuis le niveau)" valeur={base} onChange={setBase} />
      <div className="champ"><label htmlFor="outil-coqueMateriau">Matériau (déclaré)</label><input id="outil-coqueMateriau" value={materiau} maxLength={60} onChange={(e) => setMateriau(e.target.value)} onKeyDown={stop} /></div>
      <Bouton data="data-coque-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "coque.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, contour, trous, fleche: f, epaisseur: e, decalageBase: { value: z, unit: "m" }, materiau: materiau.trim() || null } }], `Coque ${nom.trim() || ""}`.trim())}>Créer la coque</Bouton>
    </section>
  );
}

export function OutilRampe({ etat, ui, readOnly, onCommandes }: Props) {
  const { a, b, champs } = useAxe(etat, ui, 6);
  const [nom, setNom] = useState(""); const [largeur, setLargeur] = useState("1.4"); const [hauteur, setHauteur] = useState("0.5"); const [epaisseur, setEpaisseur] = useState("0.15"); const [base, setBase] = useState("0");
  const l = metres(largeur), h = metres(hauteur), e = metres(epaisseur), z = nombre(base);
  const pente = a && b && h ? penteRampe({ a, b, hauteurAFranchir: h }) : null;
  const pret = !!a && !!b && !!l && !!h && !!e && z !== null;
  return (
    <section className="outil-structure" aria-label="Rampe" data-outil-rampe>
      <p className="inspecteur-aide">Sélectionnez une ligne d'esquisse ou un mur (l'axe, montée de a vers b) ou saisissez l'axe ; largeur, hauteur à franchir, épaisseur de paillasse. La pente est dérivée, jamais comparée à une règle.</p>
      {champs}
      <div className="champ"><label htmlFor="outil-rampeNom">Nom</label><input id="outil-rampeNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-rampeLargeur" libelle="Largeur (m)" valeur={largeur} onChange={setLargeur} />
      <Champ id="outil-rampeHauteur" libelle="Hauteur à franchir (m)" valeur={hauteur} onChange={setHauteur} data="data-rampe-hauteur" />
      <Champ id="outil-rampeEpaisseur" libelle="Épaisseur de la paillasse (m)" valeur={epaisseur} onChange={setEpaisseur} />
      <Champ id="outil-rampeBase" libelle="Base (m, depuis le niveau)" valeur={base} onChange={setBase} />
      {a && b && <p className="inspecteur-meta" data-rampe-pente>Longueur {fmt(longueurRampe({ a, b }), 2)} m · pente dérivée {pente === null ? "non évaluée" : `${fmt(pente, 1)} %`}</p>}
      <Bouton data="data-rampe-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "rampe.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, a, b, largeur: l, hauteurAFranchir: h, epaisseur: e, decalageBase: { value: z, unit: "m" } } }], `Rampe ${nom.trim() || ""}`.trim())}>Créer la rampe</Bouton>
    </section>
  );
}

export function OutilEchelle({ etat, ui, readOnly, onCommandes }: Props) {
  const { a, b, champs } = useAxe(etat, ui, 1);
  const [nom, setNom] = useState(""); const [hauteur, setHauteur] = useState("3"); const [largeur, setLargeur] = useState("0.5"); const [entraxe, setEntraxe] = useState("0.3"); const [crinoline, setCrinoline] = useState(""); const [base, setBase] = useState("0");
  const h = metres(hauteur), l = metres(largeur), en = metres(entraxe), z = nombre(base), cr = crinoline.trim() ? metres(crinoline) : null;
  const pret = !!a && !!b && !!h && !!l && !!en && en.value < h.value && z !== null && (!crinoline.trim() || (!!cr && cr.value < h.value));
  return (
    <section className="outil-structure" aria-label="Échelle" data-outil-echelle>
      <p className="inspecteur-aide">Pied en a, appui vers b (ligne d'esquisse sélectionnée ou saisie) ; hauteur, largeur, entraxe des barreaux déclaré ; crinoline (cage) à partir d'une hauteur si déclarée.</p>
      {champs}
      <div className="champ"><label htmlFor="outil-echelleNom">Nom</label><input id="outil-echelleNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-echelleHauteur" libelle="Hauteur (m)" valeur={hauteur} onChange={setHauteur} data="data-echelle-hauteur" />
      <Champ id="outil-echelleLargeur" libelle="Largeur (m)" valeur={largeur} onChange={setLargeur} />
      <Champ id="outil-echelleEntraxe" libelle="Entraxe des barreaux (m)" valeur={entraxe} onChange={setEntraxe} />
      <Champ id="outil-echelleCrinoline" libelle="Crinoline à partir de (m ; vide : aucune)" valeur={crinoline} onChange={setCrinoline} />
      <Champ id="outil-echelleBase" libelle="Base (m, depuis le niveau)" valeur={base} onChange={setBase} />
      <Bouton data="data-echelle-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "echelle.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, a, b, hauteur: h, largeur: l, entraxeBarreaux: en, decalageBase: { value: z, unit: "m" }, crinolineDepuis: cr } }], `Échelle ${nom.trim() || ""}`.trim())}>Créer l'échelle</Bouton>
    </section>
  );
}

export function OutilMurRideau({ etat, ui, readOnly, onCommandes }: Props) {
  const { a, b, champs } = useAxe(etat, ui, 6);
  const [nom, setNom] = useState(""); const [hauteur, setHauteur] = useState("3"); const [em, setEm] = useState("1.5"); const [et, setEt] = useState("1.5"); const [lp, setLp] = useState("0.05"); const [pp, setPp] = useState("0.1"); const [ev, setEv] = useState("0.028"); const [base, setBase] = useState("0"); const [remplissage, setRemplissage] = useState("vitre");
  const h = metres(hauteur), EM = metres(em), ET = metres(et), LP = metres(lp), PP = metres(pp), EV = metres(ev), z = nombre(base);
  const pret = !!a && !!b && !!h && !!EM && !!ET && !!LP && !!PP && !!EV && z !== null;
  const comptes = pret ? nombreProfilsMurRideau({ a: a!, b: b!, hauteur: h!, entraxeMontants: EM!, entraxeTraverses: ET! } as never) : null;
  return (
    <section className="outil-structure" aria-label="Mur-rideau" data-outil-mur-rideau>
      <p className="inspecteur-aide">Axe a → b (ligne, mur ou saisie), hauteur, trame des montants et des traverses, profils, vitrage : la façade est dessinée depuis ces seules valeurs.</p>
      {champs}
      <div className="champ"><label htmlFor="outil-mrNom">Nom</label><input id="outil-mrNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-mrHauteur" libelle="Hauteur (m)" valeur={hauteur} onChange={setHauteur} data="data-mur-rideau-hauteur" />
      <Champ id="outil-mrEm" libelle="Entraxe des montants (m)" valeur={em} onChange={setEm} />
      <Champ id="outil-mrEt" libelle="Entraxe des traverses (m)" valeur={et} onChange={setEt} />
      <Champ id="outil-mrLp" libelle="Largeur des profils (m)" valeur={lp} onChange={setLp} />
      <Champ id="outil-mrPp" libelle="Profondeur des profils (m)" valeur={pp} onChange={setPp} />
      <Champ id="outil-mrEv" libelle="Épaisseur du vitrage (m)" valeur={ev} onChange={setEv} />
      <Champ id="outil-mrBase" libelle="Base (m, depuis le niveau)" valeur={base} onChange={setBase} />
      <div className="champ"><label htmlFor="outil-mrRemplissage">Remplissage</label><select id="outil-mrRemplissage" value={remplissage} onChange={(e) => setRemplissage(e.target.value)}><option value="vitre">Vitré</option><option value="opaque">Opaque</option></select></div>
      {comptes && <p className="inspecteur-meta" data-mur-rideau-comptes>{comptes.montants} montants · {comptes.traverses} traverses · {comptes.panneaux} panneaux</p>}
      <Bouton data="data-mur-rideau-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "murRideau.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, a, b, hauteur: h, entraxeMontants: EM, entraxeTraverses: ET, largeurProfil: LP, profondeurProfil: PP, epaisseurVitrage: EV, decalageBase: { value: z, unit: "m" }, remplissage } }], `Mur-rideau ${nom.trim() || ""}`.trim())}>Créer le mur-rideau</Bouton>
    </section>
  );
}

const lirePoints3 = (texte: string) => texte.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const c = l.split(/\s*;\s*/).map(nombre); return c.length >= 3 && c[0] !== null && c[1] !== null && c[2] !== null ? { x: c[0], y: c[1], z: c[2] } : null; });

export function OutilTerrain({ ui, readOnly, onCommandes }: Props) {
  const [nom, setNom] = useState(""); const [source, setSource] = useState(""); const [epaisseur, setEpaisseur] = useState("0");
  const [texte, setTexte] = useState(`${fmt(ui.vue.cx - 10)} ; ${fmt(ui.vue.cy - 10)} ; 0\n${fmt(ui.vue.cx + 10)} ; ${fmt(ui.vue.cy - 10)} ; 0\n${fmt(ui.vue.cx + 10)} ; ${fmt(ui.vue.cy + 10)} ; 0\n${fmt(ui.vue.cx - 10)} ; ${fmt(ui.vue.cy + 10)} ; 0`);
  const pts = lirePoints3(texte);
  const ok = pts.length >= 3 && pts.every((p) => !!p);
  const points = ok ? (pts as { x: number; y: number; z: number }[]) : [];
  const ep = nombre(epaisseur);
  const triangles = ok ? trianglesTerrain({ points }).length : 0;
  return (
    <section className="outil-structure" aria-label="Terrain" data-outil-terrain>
      <p className="inspecteur-aide">Semis de points relevés « x ; y ; z » (z depuis le niveau), un par ligne, trois au moins ; triangulé (Delaunay) ; aucune altitude n'est inventée hors du semis. Source du relevé déclarée.</p>
      <div className="champ"><label htmlFor="outil-terrainNom">Nom</label><input id="outil-terrainNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <div className="champ"><label htmlFor="outil-terrainPoints">Points (x ; y ; z)</label><textarea id="outil-terrainPoints" rows={5} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={stop} data-terrain-points /></div>
      <div className="champ"><label htmlFor="outil-terrainSource">Source du relevé (déclarée)</label><input id="outil-terrainSource" value={source} maxLength={120} onChange={(e) => setSource(e.target.value)} onKeyDown={stop} data-terrain-source /></div>
      <Champ id="outil-terrainEpaisseur" libelle="Épaisseur de représentation sous la surface (m ; 0 : surface seule)" valeur={epaisseur} onChange={setEpaisseur} />
      {ok ? <p className="inspecteur-meta" data-terrain-triangles>{points.length} points · {triangles} triangles</p> : <p className="inspecteur-alerte" role="note">Trois points « x ; y ; z » au moins.</p>}
      <Bouton data="data-terrain-creer" pret={ok && ep !== null && ep >= 0} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "terrain.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, points, epaisseur: { value: ep ?? 0, unit: "m" }, source: source.trim() || null } }], `Terrain ${nom.trim() || ""}`.trim())}>Créer le terrain</Bouton>
    </section>
  );
}

const HOTES = ["mur", "dalle", "poteau", "poutre", "plaque", "panneau-clt", "toiture"];
const RESEAU = ["segment-reseau", "raccord-reseau", "vanne", "equipement-reseau"];

export function OutilReservation({ etat, ui, readOnly, onCommandes }: Props) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const hote = sel.find((o) => HOTES.includes(o.classe)) ?? null;
  const pour = sel.find((o) => RESEAU.includes(o.classe)) ?? null;
  const [nom, setNom] = useState(""); const [cx, setCx] = useState(fmt(ui.vue.cx)); const [cy, setCy] = useState(fmt(ui.vue.cy)); const [largeur, setLargeur] = useState("0.6"); const [profondeur, setProfondeur] = useState("0.6"); const [z, setZ] = useState("1"); const [hauteur, setHauteur] = useState("0.4"); const [statut, setStatut] = useState("demandee");
  const X = nombre(cx), Y = nombre(cy), L = nombre(largeur), Pf = nombre(profondeur), Z = nombre(z), H = metres(hauteur);
  const pret = X !== null && Y !== null && !!L && L > 0 && !!Pf && Pf > 0 && Z !== null && !!H;
  const contour = pret ? [P(X - L / 2, Y - Pf / 2), P(X + L / 2, Y - Pf / 2), P(X + L / 2, Y + Pf / 2), P(X - L / 2, Y + Pf / 2)] : null;
  return (
    <section className="outil-structure" aria-label="Réservation" data-outil-reservation>
      <p className="inspecteur-aide">Volume réservé dans un mur, une dalle ou un poteau pour un passage de réseau : sélectionnez l'hôte (et le réseau concerné), placez l'emprise et l'altitude. Une réservation accordée exempte la collision qu'elle couvre ; demandée ou refusée, non.</p>
      <p className="inspecteur-meta" data-reservation-hote>Hôte : {hote ? `${nomDe(hote)} (${hote.classe})` : "aucun sélectionné (réservation libre)"} · pour : {pour ? nomDe(pour) : "—"}</p>
      <div className="champ"><label htmlFor="outil-resNom">Nom</label><input id="outil-resNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-resX" libelle="Centre x (m)" valeur={cx} onChange={setCx} data="data-reservation-x" />
      <Champ id="outil-resY" libelle="Centre y (m)" valeur={cy} onChange={setCy} data="data-reservation-y" />
      <Champ id="outil-resL" libelle="Largeur de l'emprise (m)" valeur={largeur} onChange={setLargeur} />
      <Champ id="outil-resP" libelle="Profondeur de l'emprise (m)" valeur={profondeur} onChange={setProfondeur} />
      <Champ id="outil-resZ" libelle="Altitude du bas (m, depuis le niveau)" valeur={z} onChange={setZ} data="data-reservation-z" />
      <Champ id="outil-resH" libelle="Hauteur (m)" valeur={hauteur} onChange={setHauteur} />
      <div className="champ"><label htmlFor="outil-resStatut">Statut</label><select id="outil-resStatut" value={statut} onChange={(e) => setStatut(e.target.value)} data-reservation-statut><option value="demandee">Demandée</option><option value="accordee">Accordée</option><option value="refusee">Refusée</option></select></div>
      <Bouton data="data-reservation-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "reservation.creer", params: { niveauId: hote?.niveauId ?? ui.niveauId, nom: nom.trim() || null, contour, trous: [], hoteId: hote?.id ?? null, pourId: pour?.id ?? null, z: Z, hauteur: H, statut } }], `Réservation ${nom.trim() || ""}`.trim())}>Créer la réservation</Bouton>
    </section>
  );
}

const TYPES_CHANTIER = [["grue", "Grue"], ["base-vie", "Base vie"], ["stockage", "Aire de stockage"], ["cloture", "Clôture"], ["acces", "Accès"], ["levage", "Aire de levage"], ["autre", "Autre"]] as const;

export function OutilInstallationChantier({ etat, ui, readOnly, onCommandes }: Props) {
  const { contour, trous, champs } = useContour(etat, ui);
  const [nom, setNom] = useState(""); const [type, setType] = useState("grue"); const [hauteur, setHauteur] = useState(""); const [debut, setDebut] = useState(""); const [fin, setFin] = useState(""); const [phase, setPhase] = useState("");
  const h = hauteur.trim() ? metres(hauteur) : null;
  const dateOk = (v: string) => !v.trim() || /^\d{4}-\d{2}-\d{2}$/.test(v.trim());
  const pret = !!contour && !!nom.trim() && (!hauteur.trim() || !!h) && dateOk(debut) && dateOk(fin) && (!debut.trim() || !fin.trim() || fin.trim() >= debut.trim());
  return (
    <section className="outil-structure" aria-label="Installation de chantier" data-outil-installation-chantier>
      <p className="inspecteur-aide">Emprise (esquisse fermée sélectionnée ou rectangle), type, hauteur, période (dates AAAA-MM-JJ) et phase de chantier déclarées ; hors métrés de l'ouvrage.</p>
      {champs}
      <div className="champ"><label htmlFor="outil-chantierNom">Nom</label><input id="outil-chantierNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} data-chantier-nom /></div>
      <div className="champ"><label htmlFor="outil-chantierType">Type</label><select id="outil-chantierType" value={type} onChange={(e) => setType(e.target.value)} data-chantier-type>{TYPES_CHANTIER.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
      <Champ id="outil-chantierHauteur" libelle="Hauteur (m ; vide : non évaluée)" valeur={hauteur} onChange={setHauteur} />
      <div className="champ"><label htmlFor="outil-chantierDebut">Début (AAAA-MM-JJ)</label><input id="outil-chantierDebut" value={debut} onChange={(e) => setDebut(e.target.value)} onKeyDown={stop} data-chantier-debut /></div>
      <div className="champ"><label htmlFor="outil-chantierFin">Fin (AAAA-MM-JJ)</label><input id="outil-chantierFin" value={fin} onChange={(e) => setFin(e.target.value)} onKeyDown={stop} data-chantier-fin /></div>
      <div className="champ"><label htmlFor="outil-chantierPhase">Phase de chantier</label><input id="outil-chantierPhase" value={phase} maxLength={80} onChange={(e) => setPhase(e.target.value)} onKeyDown={stop} /></div>
      {!!debut.trim() && !!fin.trim() && fin.trim() < debut.trim() && <p className="inspecteur-alerte" role="note">Fin avant le début.</p>}
      <Bouton data="data-chantier-creer" pret={pret} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "installationChantier.creer", params: { niveauId: ui.niveauId, nom: nom.trim(), type, contour, trous, hauteur: h, debut: debut.trim() || null, fin: fin.trim() || null, phaseChantier: phase.trim() || null } }], `Installation ${nom.trim()}`)}>Créer l'installation</Bouton>
    </section>
  );
}

const CONVERTIBLES = ["solide", "solide-exact", "dalle", "toiture", "mur", "poteau", "coque", "plafond", "rampe", "piece-mecanique", "terrain", "panneau-clt", "tole", "escalier"];

export function OutilSurfaceLibre({ etat, ui, readOnly, onCommandes }: Props) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  const source = sel.find((o) => CONVERTIBLES.includes(o.classe)) ?? null;
  const [nom, setNom] = useState(""); const [niveaux, setNiveaux] = useState("1"); const [ferme, setFerme] = useState(true);
  const [texte, setTexte] = useState(`${fmt(ui.vue.cx - 1)} ; ${fmt(ui.vue.cy - 1)} ; 0\n${fmt(ui.vue.cx + 1)} ; ${fmt(ui.vue.cy - 1)} ; 0\n${fmt(ui.vue.cx + 1)} ; ${fmt(ui.vue.cy + 1)} ; 0\n${fmt(ui.vue.cx - 1)} ; ${fmt(ui.vue.cy + 1)} ; 0\n${fmt(ui.vue.cx)} ; ${fmt(ui.vue.cy)} ; 2`);
  const [faces, setFaces] = useState("0 1 2 3\n0 4 1\n1 4 2\n2 4 3\n3 4 0");
  const n = nombre(niveaux);
  const nOk = n !== null && Number.isInteger(n) && n >= 0 && n <= 4;
  const pts = lirePoints3(texte);
  const sommets = pts.every((p) => !!p) ? (pts as { x: number; y: number; z: number }[]) : null;
  const fs = faces.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(/[\s,;]+/).map(nombre));
  const facesOk = !!sommets && fs.length > 0 && fs.every((f) => f.length >= 3 && f.length <= 4 && f.every((i) => i !== null && Number.isInteger(i) && i >= 0 && i < sommets.length));
  const nb = facesOk ? facesSubdivisees({ faces: fs as number[][], niveaux: n ?? 0 }) : 0;
  return (
    <section className="outil-structure" aria-label="Surface libre" data-outil-surface-libre>
      <p className="inspecteur-aide">Maillage de contrôle subdivisé (Loop) ; les sommets de contrôle se déplacent ensuite dans la fiche (morphing). Sélectionnez un objet pour le convertir explicitement (son maillage devient le maillage de contrôle, l'objet reste), ou saisissez sommets et faces.</p>
      <div className="champ"><label htmlFor="outil-slNom">Nom</label><input id="outil-slNom" value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={stop} /></div>
      <Champ id="outil-slNiveaux" libelle="Niveaux de subdivision (0 à 4)" valeur={niveaux} onChange={setNiveaux} data="data-surface-niveaux" />
      {source ? (
        <>
          <p className="inspecteur-meta" data-surface-source>Convertir : {nomDe(source)} ({source.classe})</p>
          <Bouton data="data-surface-convertir" pret={nOk} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "surfaceLibre.depuisObjet", params: { sourceId: source.id, niveaux: n, ...(nom.trim() ? { nom: nom.trim() } : {}) } }], `Surface libre depuis ${nomDe(source)}`)}>Convertir en surface libre</Bouton>
        </>
      ) : (
        <>
          <div className="champ"><label htmlFor="outil-slSommets">Sommets de contrôle (x ; y ; z)</label><textarea id="outil-slSommets" rows={5} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={stop} data-surface-sommets /></div>
          <div className="champ"><label htmlFor="outil-slFaces">Faces (3 ou 4 indices par ligne)</label><textarea id="outil-slFaces" rows={5} value={faces} onChange={(e) => setFaces(e.target.value)} onKeyDown={stop} data-surface-faces /></div>
          <label className="case"><input type="checkbox" checked={ferme} onChange={(e) => setFerme(e.target.checked)} /> Surface fermée (volume)</label>
          {facesOk ? <p className="inspecteur-meta" data-surface-comptes>{sommets!.length} sommets · {fs.length} faces de contrôle → {nb} faces subdivisées</p> : <p className="inspecteur-alerte" role="note">Sommets « x ; y ; z » et faces d'indices valides requis.</p>}
          <Bouton data="data-surface-creer" pret={nOk && facesOk} readOnly={readOnly} onCommandes={onCommandes} ui={ui} onClick={() => onCommandes?.([{ type: "surfaceLibre.creer", params: { niveauId: ui.niveauId, nom: nom.trim() || null, sommets, faces: fs, niveaux: n, ferme, origine: null } }], `Surface libre ${nom.trim() || ""}`.trim())}>Créer la surface libre</Bouton>
        </>
      )}
    </section>
  );
}

// --- Fiches ---------------------------------------------------------------------------------------------------------

export function FicheBatimentP2({ o, etat }: { o: OccurrenceQuelconque; etat: ModeleAtelier }) {
  const lignes: [string, string][] = [];
  switch (o.classe) {
    case "plafond": lignes.push(["Hauteur sous plafond", `${fmt(o.params.hauteur.value)} m`], ["Épaisseur", `${fmt(o.params.epaisseur.value)} m`], ["Suspendu", o.params.suspendu ? "oui" : "non"], ["Matériau", o.params.materiau ?? "non évalué"]); break;
    case "coque": lignes.push(["Flèche au centre", `${fmt(o.params.fleche.value)} m`], ["Épaisseur", `${fmt(o.params.epaisseur.value)} m`], ["Base", `${fmt(o.params.decalageBase.value)} m`], ["Forme", "paraboloïde déclaré"]); break;
    case "rampe": { const pente = penteRampe(o.params); lignes.push(["Longueur en plan", `${fmt(longueurRampe(o.params), 2)} m`], ["Hauteur à franchir", `${fmt(o.params.hauteurAFranchir.value)} m`], ["Pente dérivée", pente === null ? "non évaluée" : `${fmt(pente, 1)} % (jamais comparée à une règle)`], ["Largeur", `${fmt(o.params.largeur.value)} m`]); break; }
    case "echelle": lignes.push(["Hauteur", `${fmt(o.params.hauteur.value)} m`], ["Largeur", `${fmt(o.params.largeur.value)} m`], ["Entraxe des barreaux", `${fmt(o.params.entraxeBarreaux.value)} m`], ["Crinoline", o.params.crinolineDepuis ? `à partir de ${fmt(o.params.crinolineDepuis.value)} m` : "aucune"]); break;
    case "mur-rideau": { const c = nombreProfilsMurRideau(o.params); lignes.push(["Hauteur", `${fmt(o.params.hauteur.value)} m`], ["Trame", `montants ${fmt(o.params.entraxeMontants.value)} m · traverses ${fmt(o.params.entraxeTraverses.value)} m`], ["Profils", `${c.montants} montants · ${c.traverses} traverses · ${c.panneaux} panneaux`], ["Remplissage", `${o.params.remplissage === "vitre" ? "vitré" : "opaque"} · ${fmt(o.params.epaisseurVitrage.value * 1000, 0)} mm`]); break; }
    case "terrain": { const z = altitudeTerrain(o.params, { x: o.params.points.reduce((s, p) => s + p.x, 0) / o.params.points.length, y: o.params.points.reduce((s, p) => s + p.y, 0) / o.params.points.length }); lignes.push(["Semis", `${o.params.points.length} points · ${trianglesTerrain(o.params).length} triangles`], ["Altitude au centre du semis", z === null ? "non évaluée (hors du semis)" : `${fmt(z, 2)} m`], ["Source du relevé", o.params.source ?? "non déclarée"]); break; }
    case "reservation": { const h = o.params.hoteId ? etat.objets[o.params.hoteId] : undefined; const p = o.params.pourId ? etat.objets[o.params.pourId] : undefined; lignes.push(["Statut", o.params.statut === "accordee" ? "accordée" : o.params.statut === "refusee" ? "refusée" : "demandée"], ["Hôte", h ? `${nomDe(h)} (${h.classe})` : "aucun"], ["Pour", p ? nomDe(p) : "—"], ["Altitude", `${fmt(o.params.z)} m → ${fmt(o.params.z + o.params.hauteur.value)} m`]); break; }
    case "installation-chantier": lignes.push(["Type", o.params.type], ["Hauteur", o.params.hauteur ? `${fmt(o.params.hauteur.value)} m` : "non évaluée"], ["Période", o.params.debut || o.params.fin ? `${o.params.debut ?? "…"} → ${o.params.fin ?? "…"}` : "non déclarée"], ["Phase de chantier", o.params.phaseChantier ?? "—"]); break;
    default: return null;
  }
  return (
    <div className="fiche-mecanique" data-fiche-batiment-p2={o.classe}>
      <dl className="inspecteur-champs">{lignes.map(([k, v]) => <div key={k} className="champ"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

export function FicheSurfaceLibre({ o, readOnly, onCommandes }: { o: Occurrence<"surface-libre">; readOnly: boolean; onCommandes?: OnCommandes }) {
  const [index, setIndex] = useState("0"); const [dx, setDx] = useState("0"); const [dy, setDy] = useState("0"); const [dz, setDz] = useState("0.5");
  const i = nombre(index), X = nombre(dx), Y = nombre(dy), Z = nombre(dz);
  const iOk = i !== null && Number.isInteger(i) && i >= 0 && i < o.params.sommets.length;
  const s = iOk ? o.params.sommets[i!]! : null;
  return (
    <div className="fiche-mecanique" data-fiche-surface-libre>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Maillage de contrôle</dt><dd data-surface-controle>{o.params.sommets.length} sommets · {o.params.faces.length} faces</dd></div>
        <div className="champ"><dt>Subdivision</dt><dd data-surface-subdivision>{o.params.niveaux} niveau(x) → {facesSubdivisees(o.params)} faces</dd></div>
        <div className="champ"><dt>Origine</dt><dd>{o.params.origine ? `${o.params.origine.classe} ${o.params.origine.id} (conversion explicite)` : "dessinée"} · {o.params.ferme ? "fermée" : "ouverte"}</dd></div>
      </dl>
      <div className="champ"><label htmlFor={`sl-niv-${o.id}`}>Niveaux de subdivision</label>
        <input id={`sl-niv-${o.id}`} type="range" min={0} max={4} step={1} value={o.params.niveaux} disabled={readOnly || !onCommandes} data-surface-niveaux-fiche onChange={(e) => onCommandes?.([{ type: "surfaceLibre.subdiviser", params: { id: o.id, niveaux: Number(e.target.value) } }], `Subdivision ${e.target.value}`)} />
      </div>
      <fieldset className="editeur-section"><legend>Déplacer un sommet de contrôle (morphing)</legend>
        <Champ id={`sl-i-${o.id}`} libelle={`Indice (0 à ${o.params.sommets.length - 1})`} valeur={index} onChange={setIndex} data="data-surface-indice" />
        {s && <p className="inspecteur-meta" data-surface-sommet>({fmt(s.x)} ; {fmt(s.y)} ; {fmt(s.z)}) m</p>}
        <Champ id={`sl-dx-${o.id}`} libelle="dx (m)" valeur={dx} onChange={setDx} />
        <Champ id={`sl-dy-${o.id}`} libelle="dy (m)" valeur={dy} onChange={setDy} />
        <Champ id={`sl-dz-${o.id}`} libelle="dz (m)" valeur={dz} onChange={setDz} data="data-surface-dz" />
        <div className="boutons"><button type="button" data-surface-deplacer disabled={readOnly || !onCommandes || !iOk || X === null || Y === null || Z === null} onClick={() => onCommandes?.([{ type: "surfaceLibre.deplacerSommet", params: { id: o.id, index: i, dx: X, dy: Y, dz: Z } }], `Sommet ${i} déplacé`)}>Déplacer le sommet</button></div>
      </fieldset>
    </div>
  );
}
