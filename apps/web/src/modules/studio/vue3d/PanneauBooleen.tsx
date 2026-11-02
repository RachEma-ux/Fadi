/**
 * Panneau de l'outil « Booléen exact » de la vue 3D (lot F2, IF-003, TR-EX-058, TEST-014, TEST-015, TR-EX-062). Les
 * deux solides et l'opération sont choisis (rien d'office) ; « Calculer » capture la demande et la soumet à
 * l'ordonnanceur des tâches exactes ; le noyau exact (Worker OCCT, `.wasm` séparé) a été chargé à l'activation de
 * l'outil, jamais à l'ouverture de Studio. Pendant le calcul, un aperçu **provisoire** (estimation par emprises) est
 * montré comme tel ; au retour, il est confirmé ou **refusé** face au résultat exact ; un résultat d'une révision
 * dépassée est **périmé** ; une panne du Worker est annoncée et la relance est explicite. Seul « Engager le résultat
 * exact » modifie le brouillon (commande `studio.solide.booleen`) ; le serveur recalcule à l'enregistrement.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { studioEmpreinteContenu, type StudioCommand, type StudioDocument, type StudioOperandeExact } from "@parcours/atelier-model";
import { Icon } from "../../../components/Icon";
import { LOCALE } from "../../../lib/i18n";
import { demandeBooleen, engagement, etatApresIssue, etatCourant, MESSAGES_BOOLEEN, tacheBooleen, type EtatBooleen } from "../exact/booleen-session";
import { noyauExactStudio, ordonnanceurExact } from "../exact/noyau-studio";
import { NOTICE_LICENCE_OCCT, VERSION_OCCT_DISTRIBUEE } from "../exact/client-exact";
import type { PoigneeTache } from "../taches/ordonnanceur";
import { descriptionSolide } from "./volume-libre";

const nombre = (v: number) => v.toLocaleString(LOCALE, { maximumFractionDigits: 3 });
const OPERATIONS = [
  { valeur: "union", libelle: "Union (A ∪ B)" },
  { valeur: "difference", libelle: "Différence (A − B)" },
  { valeur: "intersection", libelle: "Intersection (A ∩ B)" },
] as const;
const LIBELLES_OPERATION: Record<string, string> = { union: "union", difference: "différence", intersection: "intersection" };
const LIBELLES_NOYAU: Record<string, string> = { absent: "non chargé", chargement: "chargement en cours", pret: "prêt", echec: "en échec" };

/** Description d'un opérande possible (solide libre ou solide exact, booléen ou surface épaissie). */
export function descriptionOperande(s: StudioOperandeExact): string {
  if (s.type === "exact" && s.operation === "solidification") return `Solide exact (subdivision solidifiée, niveau ${s.subdivision.niveau}) · ${nombre(s.resultat.volume)} m³`;
  if (s.type === "exact" && s.operation === "epaississement") return `Solide exact (surface épaissie de ${nombre(s.epaisseur)} m) · ${nombre(s.resultat.volume)} m³`;
  if (s.type === "exact") return `Solide exact (${LIBELLES_OPERATION[s.operation]}) · ${nombre(s.resultat.volume)} m³`;
  return descriptionSolide(s, nombre);
}

export function PanneauBooleen({ doc, revision, modifiable, surCommandes, surSelection }: {
  doc: StudioDocument;
  /** Révision de session du brouillon affiché. */
  revision: string;
  modifiable: boolean;
  surCommandes?: (cs: StudioCommand[]) => boolean;
  surSelection?: (id: string | null) => void;
}) {
  const [operation, setOperation] = useState("");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [erreur, setErreur] = useState("");
  const [brut, setEtat] = useState<EtatBooleen>({ etape: "inactif" });
  const noyau = useSyncExternalStore(noyauExactStudio.abonner, noyauExactStudio.metriques, noyauExactStudio.metriques);
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const poignee = useRef<PoigneeTache<unknown> | null>(null);
  // Démontage (outil quitté) : la tâche en cours est abandonnée, son résultat éventuel sera périmé.
  useEffect(() => () => { poignee.current?.abandonner(); }, []);
  const etat = etatCourant(brut, revision);
  const operandes: StudioOperandeExact[] = [...(doc.solides ?? []), ...(doc.exacts ?? [])];

  function calculer(e: FormEvent) {
    e.preventDefault();
    setErreur("");
    const r = demandeBooleen(doc, revision, { operation, a, b }, crypto.randomUUID());
    if (!r.ok) { setErreur(r.message); return; }
    const d = r.demande;
    const p = ordonnanceurExact().soumettre(tacheBooleen(d));
    poignee.current = p;
    setEtat({ etape: "calcul", demande: d });
    void p.issue.then((i) => { if (poignee.current === p) setEtat(etatApresIssue(d, i, revisionRef.current)); });
  }
  function engager() {
    const r = engagement(etat, { doc, revision, modifiable });
    if (!r.ok) { setEtat(r.etat); setErreur(r.message); return; }
    if (surCommandes?.(r.commandes)) {
      const id = etat.etape === "pret" ? etat.demande.id : null;
      setEtat(id ? { etape: "engage", id } : { etape: "inactif" });
      setOperation(""); setA(""); setB("");
      surSelection?.(id);
    }
  }
  function relancer() {
    setErreur("");
    setEtat({ etape: "inactif" });
    void noyauExactStudio.relancer().catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
  }

  const apercu = etat.etape === "calcul" || etat.etape === "pret" || etat.etape === "perime" || etat.etape === "echec" ? etat.demande.capture.apercu : null;
  const verdict = etat.etape === "pret" ? (etat.comparaison.conforme ? "confirme" : "refuse") : "";
  return (
    <form className="studio-vue3d-formulaire" onSubmit={calculer} data-studio-booleen data-studio-exact-etat={etat.etape} data-studio-exact-noyau={noyau.etat}
      data-studio-exact-workers={noyau.workersVivants} data-studio-exact-instances={noyau.suivi?.instances ?? ""} data-studio-exact-document={studioEmpreinteContenu(doc)} aria-labelledby="studio-booleen-titre">
      <h3 id="studio-booleen-titre"><Icon name="studio-solid-boolean" size={18} /> Booléen exact</h3>
      <p className="studio-hint">Union, différence ou intersection de deux solides, calculée par le noyau exact (OCCT). Les deux solides sont conservés dans le résultat ; rien n’est engagé sans votre accord.</p>
      <p role="status" data-studio-exact-statut-noyau>{noyau.suivi?.wasm
        ? `Noyau exact : ${LIBELLES_NOYAU[noyau.etat]} · ${noyau.suivi.instances} instance(s) · ${nombre(noyau.suivi.wasm.encode / 1_048_576)} Mo reçus`
        : `Noyau exact : ${LIBELLES_NOYAU[noyau.etat]}`}</p>
      <fieldset disabled={!modifiable || etat.etape === "calcul"}>
        <legend>Opération et solides</legend>
        <label>Opération
          <select name="booleen-operation" required value={operation} onChange={(e) => setOperation(e.target.value)} data-studio-booleen-operation>
            <option value="">Choisir l’opération…</option>
            {OPERATIONS.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
          </select>
        </label>
        {(["A", "B"] as const).map((n) => (
          <label key={n}>{`Solide ${n}`}
            <select name={`booleen-${n}`} required value={n === "A" ? a : b} onChange={(e) => (n === "A" ? setA : setB)(e.target.value)} data-studio-booleen-operande={n}>
              <option value="">Choisir le solide…</option>
              {operandes.map((s) => <option key={s.id} value={s.id}>{`${descriptionOperande(s)} · ${s.id.slice(0, 8)}`}</option>)}
            </select>
          </label>
        ))}
        {operandes.length < 2 && <p className="studio-hint">Il faut au moins deux solides (boîtes, prismes ou solides exacts).</p>}
        <button type="submit" data-studio-booleen-calculer><Icon name="studio-solid-boolean" size={18} /> Calculer (noyau exact)</button>
      </fieldset>
      {erreur && <p className="studio-alert" role="alert" data-studio-booleen-erreur>{erreur}</p>}
      {apercu && <p className="studio-hint" data-studio-exact-apercu="provisoire" data-studio-exact-apercu-volume={apercu.volume} data-studio-exact-apercu-verdict={verdict}>
        {`Aperçu provisoire, jamais engagé : volume estimé ${nombre(apercu.volume)} m³ (emprises englobantes).`}
      </p>}
      {etat.etape === "calcul" && <p role="status" data-studio-exact-calcul>Calcul exact en cours…</p>}
      {etat.etape === "pret" && <div data-studio-exact-resultat data-studio-exact-volume={etat.resultat.volume} data-studio-exact-empreinte={etat.resultat.empreinte}>
        <p role="status">{`Résultat exact : volume ${nombre(etat.resultat.volume)} m³, ${etat.resultat.faces} face(s), ${etat.resultat.solides} solide(s).`}</p>
        <p className={etat.comparaison.conforme ? "studio-info" : "studio-alert"} data-studio-exact-verdict={verdict}>{etat.comparaison.conforme
          ? MESSAGES_BOOLEEN.apercuConfirme
          : `${MESSAGES_BOOLEEN.apercuRefuse} Écart : ${nombre(etat.comparaison.ecart)} m³ (tolérance ${nombre(etat.comparaison.limite)} m³).`}</p>
        <button type="button" onClick={engager} disabled={!modifiable} data-studio-exact-engager><Icon name="studio-solid-boolean" size={18} /> Engager le résultat exact</button>
      </div>}
      {etat.etape === "perime" && <p className="studio-alert" role="alert" data-studio-exact-perime>{etat.message}</p>}
      {etat.etape === "echec" && <div role="alert" className="studio-alert" data-studio-exact-echec>
        <p>{etat.message}</p>
        {etat.relancer && <button type="button" onClick={relancer} data-studio-exact-relancer>Relancer le noyau exact</button>}
      </div>}
      {etat.etape !== "echec" && noyau.etat === "echec" && <div role="alert" className="studio-alert" data-studio-exact-echec-noyau>
        <p>{noyau.erreur ?? "Noyau exact en échec."}</p>
        <button type="button" onClick={relancer} data-studio-exact-relancer>Relancer le noyau exact</button>
      </div>}
      {etat.etape === "engage" && <p className="studio-info" role="status" data-studio-exact-engage={etat.id}>Résultat exact engagé dans le brouillon : enregistrez pour que le serveur le recalcule et le conserve.</p>}
      <p className="studio-hint" data-studio-exact-licence>{`Noyau exact : OCCT (occt-wasm ${VERSION_OCCT_DISTRIBUEE}), composant sous licence LGPL-2.1 chargé séparément et remplaçable.`} <a href={NOTICE_LICENCE_OCCT} target="_blank" rel="noreferrer">Licence et provenance</a></p>
    </form>
  );
}
