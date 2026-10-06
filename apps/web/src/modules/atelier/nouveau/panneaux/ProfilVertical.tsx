/**
 * Profil vertical (D-154, DA-01-09) : esquisse dans le plan vertical d'une ligne tracée ou d'une face de mur, puis
 * extrusion horizontale. Petit éditeur en élévation : s le long de la ligne (depuis son début), z au-dessus du niveau ;
 * clic = point (pas de 5 cm), saisie « s;z » par ligne au choix. Rien n'est supposé : profondeur et côté sont saisis.
 */
import { useState } from "react";
import { facesMur, longueurSaisie, nombreSaisi, type Commande, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque, type PointProfil, type ProfilVertical as Profil } from "@parcours/atelier-model";

type Ligne = { a: { x: number; y: number }; b: { x: number; y: number } };

/** Lignes de plan proposées pour un objet : la ligne elle-même, ou les deux faces d'un mur droit. */
export function lignesDuPlan(o: OccurrenceQuelconque): { libelle: string; ligne: Ligne; cote: "gauche" | "droite" }[] {
  if (o.classe === "esquisse" && (o.params.forme === "ligne" || o.params.forme === "construction") && o.params.points.length === 2) {
    return [{ libelle: "la ligne", ligne: { a: o.params.points[0]!, b: o.params.points[1]! }, cote: "gauche" }];
  }
  if (o.classe === "mur" && !o.params.renflement) {
    const f = facesMur(o.params.a, o.params.b, o.params.epaisseur.value, o.params.alignement);
    return [
      { libelle: "la face gauche du mur", ligne: { a: f.gauche[0], b: f.gauche[1] }, cote: "gauche" },
      { libelle: "la face droite du mur", ligne: { a: f.droite[0], b: f.droite[1] }, cote: "droite" },
    ];
  }
  return [];
}

const versTexte = (p: readonly PointProfil[]) => p.map((q) => `${String(q.s).replace(".", ",")} ; ${String(q.z).replace(".", ",")}`).join("\n");

function lireTexte(t: string): PointProfil[] | null {
  const lignes = t.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: PointProfil[] = [];
  for (const l of lignes) {
    const [s, z] = l.split(";").map((x) => nombreSaisi(x.trim()));
    if (s === null || z === null || s === undefined || z === undefined) return null;
    out.push({ s, z });
  }
  return out;
}

export function EditeurProfilVertical({ etat, o, desactive, onCommandes }: { etat: ModeleAtelier; o: OccurrenceQuelconque; desactive: boolean; onCommandes: (c: Commande[], label: string) => void }) {
  const existant = o.classe === "solide" ? ((o as Occurrence<"solide">).params.profilVertical ?? null) : null;
  const choix = existant ? [{ libelle: "son plan", ligne: { a: existant.a, b: existant.b }, cote: existant.cote }] : lignesDuPlan(o);
  const [indice, setIndice] = useState(0);
  const [texte, setTexte] = useState(existant ? versTexte(existant.profil) : "");
  const [profondeur, setProfondeur] = useState(existant ? String(existant.profondeur.value).replace(".", ",") : "");
  const [cote, setCote] = useState<"gauche" | "droite">(existant?.cote ?? choix[0]?.cote ?? "gauche");
  if (!choix.length) return null;
  const plan = choix[Math.min(indice, choix.length - 1)]!;
  const L = Math.hypot(plan.ligne.b.x - plan.ligne.a.x, plan.ligne.b.y - plan.ligne.a.y);
  const points = lireTexte(texte);
  const zMax = Math.max(3, ...(points ?? []).map((q) => q.z + 0.5));
  const W = 260;
  const H = Math.max(120, Math.min(220, (W * zMax) / Math.max(L, 0.5)));
  const kx = W / Math.max(L, 0.5);
  const kz = H / zMax;
  const prof = longueurSaisie(profondeur);
  const valide = !!points && points.length >= 3 && prof !== null && prof > 0;
  const ajouter = (e: React.MouseEvent<SVGSVGElement>) => {
    if (desactive) return;
    const r = e.currentTarget.getBoundingClientRect();
    const s = Math.round(((e.clientX - r.left) / kx) * 20) / 20;
    const z = Math.round(((r.bottom - e.clientY) / kz) * 20) / 20;
    setTexte((t) => `${t.trim() ? `${t.trim()}\n` : ""}${String(s).replace(".", ",")} ; ${String(z).replace(".", ",")}`);
  };
  const appliquer = () => {
    if (!valide) return;
    const pv: Profil = { a: { ...plan.ligne.a, frame: "local", unit: "m" } as Profil["a"], b: { ...plan.ligne.b, frame: "local", unit: "m" } as Profil["b"], profil: points!, profondeur: { value: prof!, unit: "m" }, cote };
    if (existant) onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { profilVertical: pv } } }], `Profil vertical de ${o.id}`);
    else onCommandes([{ type: "objet.creer", params: { classe: "solide", niveauId: o.niveauId, calqueId: o.calqueId, params: { profilVertical: pv, role: "solid" } } }], `Profil vertical extrudé sur ${plan.libelle}`);
  };
  void etat;
  return (
    <details className="inspecteur-profil" data-profil-vertical>
      <summary>{existant ? "Profil vertical" : "Profil vertical et extrusion"}</summary>
      <div className="nav-formulaire-altimetrie">
        {choix.length > 1 && (
          <label>Plan
            <select value={indice} disabled={desactive} onChange={(e) => { const i = Number(e.target.value); setIndice(i); setCote(choix[i]!.cote); }} data-profil-plan>
              {choix.map((c, i) => <option key={i} value={i}>{c.libelle}</option>)}
            </select>
          </label>
        )}
        <p className="inspecteur-aide">Cliquez dans l'élévation pour ajouter un point (pas de 5 cm) ou saisissez « s ; z » par ligne : s le long du plan depuis son début, z au-dessus du niveau.</p>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="profil-vertical-editeur" onClick={ajouter} role="img" aria-label="Élévation du plan vertical" data-profil-editeur style={{ border: "1px solid var(--bordure, #bbb)", cursor: desactive ? "default" : "crosshair", background: "var(--fond-champ, #fff)" }}>
          <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="#888" />
          {points && points.length >= 2 && <polygon points={points.map((q) => `${q.s * kx},${H - q.z * kz}`).join(" ")} fill="#cfd8e6" fillOpacity={0.6} stroke="#355e8a" />}
          {(points ?? []).map((q, i) => <circle key={i} cx={q.s * kx} cy={H - q.z * kz} r={3} fill="#355e8a" />)}
        </svg>
        <label>Points (s ; z)<textarea rows={4} value={texte} disabled={desactive} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-profil-points /></label>
        {!points && <p className="inspecteur-aide">Une ligne n'est pas lisible : « s ; z » en mètres.</p>}
        <label>Profondeur d'extrusion (m)<input inputMode="decimal" value={profondeur} disabled={desactive} onChange={(e) => setProfondeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-profil-profondeur /></label>
        <label>Côté
          <select value={cote} disabled={desactive} onChange={(e) => setCote(e.target.value as "gauche" | "droite")} data-profil-cote>
            <option value="gauche">gauche (sens du tracé)</option>
            <option value="droite">droite (sens du tracé)</option>
          </select>
        </label>
        {!desactive && (
          <span className="ver-actions">
            <button type="button" disabled={!valide} onClick={appliquer} data-profil-appliquer>{existant ? "Appliquer le profil" : "Extruder le profil"}</button>
            <button type="button" className="lien" onClick={() => setTexte("")}>Effacer les points</button>
          </span>
        )}
      </div>
    </details>
  );
}
