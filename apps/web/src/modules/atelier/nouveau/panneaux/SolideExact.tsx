/**
 * Outil « Solide exact » (P2-1, D-177) : sélection → paramètres → aperçu (volume, faces, empreinte calculés par le
 * noyau dans un Worker) → validation (commande `solideExact.creer` que le serveur recalcule). Fiche d'un solide exact
 * sélectionné : provenance, volume, export STEP.
 */
import { useEffect, useState } from "react";
import type { Commande, ModeleAtelier, Occurrence } from "@parcours/atelier-model";
import type { SolideExact } from "@parcours/geometry-exact";
import { etatUi, type EtatUi } from "../etat-ui";
import { apercuExact, chargerNoyauExact, etatNoyauExact, surNoyauExact } from "../exact/moteur-exact";
import { construireOperation, OPERATIONS_EXACTES, type TypeOperationExacte } from "../exact/operations";
import { api } from "../../../../lib/api";
import { LOCALE } from "../../../../lib/i18n";

const fmt = (v: number, d = 3) => v.toLocaleString(LOCALE, { maximumFractionDigits: d });

export function OutilSolideExact({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: (commandes: Commande[], label: string) => void }) {
  const [noyau, setNoyau] = useState(etatNoyauExact());
  const [apercu, setApercu] = useState<{ cle: string; solide: SolideExact } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => surNoyauExact(setNoyau), []);
  useEffect(() => { void chargerNoyauExact().catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e))); }, []);
  const type = (ui.parametresOutil["operationExacte"] as TypeOperationExacte | undefined) ?? "revolution";
  const r = construireOperation(etat, type, ui.selection, ui.parametresOutil);
  const cle = r.ok ? JSON.stringify(r.operation.entrees) : "";
  const apercuValide = apercu && apercu.cle === cle ? apercu.solide : null;
  const info = OPERATIONS_EXACTES.find((o) => o.id === type)!;
  const poser = (k: string, v: unknown) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, [k]: v } }));

  const calculerApercu = async () => {
    if (!r.ok) return;
    setEnCours(true); setErreur(null);
    try {
      const s = await apercuExact(r.operation.entrees);
      setApercu({ cle, solide: s });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally { setEnCours(false); }
  };
  // Créer : l'aperçu est calculé s'il ne l'est pas déjà (le réducteur local exige une géométrie complète), puis la
  // commande part avec les résultats du navigateur ET l'opération ; le serveur recalcule, compare l'empreinte et écrit
  // ses propres résultats (R9, D-177).
  const creer = async () => {
    if (!r.ok || !onCommandes) return;
    const { entrees, sources, libelle, niveauId } = r.operation;
    let s = apercuValide;
    if (!s) {
      setEnCours(true); setErreur(null);
      try { s = await apercuExact(entrees); setApercu({ cle, solide: s }); } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); setEnCours(false); return; }
      setEnCours(false);
    }
    onCommandes([{ type: "solideExact.creer", params: { niveauId, nom: libelle, brep: s.brep, maillage: s.maillage, volume: s.volume, aire: s.aire, faces: s.faces, moteur: s.moteur, versionMoteur: s.versionMoteur, empreinteBrep: s.empreinte, operation: { type: entrees.type, sources, libelle, entrees } } }], libelle);
    setApercu(null);
  };
  return (
    <section className="outil-solide-exact" aria-label="Solide exact" data-outil-solide-exact>
      <p className="inspecteur-meta" data-noyau-exact={noyau}>
        Noyau exact (OCCT, chargé à la demande) : {noyau === "ok" ? "prêt" : noyau === "chargement" ? "chargement…" : noyau === "echec" ? "indisponible" : "non chargé"}
      </p>
      <div className="champ">
        <label htmlFor="outil-operationExacte">Opération</label>
        <select id="outil-operationExacte" value={type} onChange={(e) => { poser("operationExacte", e.target.value); setApercu(null); }}>
          {OPERATIONS_EXACTES.map((o) => <option key={o.id} value={o.id}>{o.libelle}</option>)}
        </select>
      </div>
      <p className="inspecteur-aide">{info.aide}</p>
      {type === "booleen" && (
        <div className="champ">
          <label htmlFor="outil-booleenExact">Booléen</label>
          <select id="outil-booleenExact" value={(ui.parametresOutil["booleenExact"] as string | undefined) ?? "soustraction"} onChange={(e) => poser("booleenExact", e.target.value)}>
            <option value="soustraction">Soustraction (premier − second)</option>
            <option value="union">Union</option>
            <option value="intersection">Intersection</option>
          </select>
        </div>
      )}
      {type === "lissage" && (
        <label className="case"><input type="checkbox" checked={ui.parametresOutil["lissageRegle"] === true} onChange={(e) => poser("lissageRegle", e.target.checked)} /> Surfaces réglées (arêtes droites)</label>
      )}
      {type === "coque" && (
        <label className="case"><input type="checkbox" checked={ui.parametresOutil["ouvrirDessusExacte"] === true} data-ouvrir-dessus onChange={(e) => poser("ouvrirDessusExacte", e.target.checked)} /> Dessus ouvert</label>
      )}
      {!r.ok && <p className="inspecteur-alerte" role="note" data-exact-message>{r.message}</p>}
      {r.ok && (
        <p className="inspecteur-meta" data-exact-pret>
          {r.operation.libelle} — niveau {etat.niveaux[r.operation.niveauId]?.nom ?? r.operation.niveauId}
        </p>
      )}
      <div className="boutons">
        <button type="button" data-exact-apercu disabled={!r.ok || enCours || noyau !== "ok"} onClick={() => void calculerApercu()}>{enCours ? "Calcul…" : "Aperçu (volume, faces)"}</button>
        <button type="button" data-exact-creer disabled={!r.ok || readOnly || !onCommandes || enCours || noyau !== "ok"} onClick={() => void creer()} title="Le serveur recalcule l'opération avec le même noyau et vérifie l'empreinte de l'aperçu">Créer le solide exact</button>
      </div>
      {apercuValide && (
        <dl className="inspecteur-champs" data-exact-resultat>
          <div className="champ"><dt>Volume</dt><dd>{fmt(apercuValide.volume)} m³</dd></div>
          <div className="champ"><dt>Aire</dt><dd>{fmt(apercuValide.aire)} m²</dd></div>
          <div className="champ"><dt>Faces / solides</dt><dd>{apercuValide.faces} / {apercuValide.solides}</dd></div>
          <div className="champ"><dt>Empreinte du brep</dt><dd><code>{apercuValide.empreinte}</code></dd></div>
        </dl>
      )}
      {erreur && <p className="inspecteur-alerte" role="alert" data-exact-erreur>{erreur}</p>}
    </section>
  );
}

export function FicheSolideExact({ o, projectId }: { o: Occurrence<"solide-exact">; projectId: string }) {
  const [erreur, setErreur] = useState<string | null>(null);
  const telecharger = async () => {
    try {
      const { blob, nom } = await api.getSolideExactStep(projectId, o.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
  };
  return (
    <div className="fiche-solide-exact" data-fiche-solide-exact>
      <dl className="inspecteur-champs">
        <div className="champ"><dt>Volume</dt><dd data-exact-volume>{fmt(o.params.volume)} m³</dd></div>
        <div className="champ"><dt>Aire</dt><dd>{fmt(o.params.aire)} m²</dd></div>
        <div className="champ"><dt>Faces</dt><dd>{o.params.faces}</dd></div>
        <div className="champ"><dt>Opération</dt><dd>{o.params.operation.libelle || o.params.operation.type}</dd></div>
        <div className="champ"><dt>Moteur</dt><dd>{o.params.moteur} {o.params.versionMoteur} · empreinte <code>{o.params.empreinteBrep}</code></dd></div>
        <div className="champ"><dt>Pose</dt><dd>({fmt(o.params.position.x, 3)} ; {fmt(o.params.position.y, 3)}) m · {fmt(o.params.angle.value, 2)}°</dd></div>
      </dl>
      <p className="inspecteur-aide">Géométrie B-rep exacte : elle se modifie par une nouvelle opération exacte (trou, coque, booléen), jamais par un paramètre.</p>
      <button type="button" data-exact-step onClick={() => void telecharger()}>Télécharger en STEP (AP242)</button>
      {erreur && <p className="inspecteur-alerte" role="alert">{erreur}</p>}
    </div>
  );
}
