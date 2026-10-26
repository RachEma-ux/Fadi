/**
 * Rapport de fidélité d'un export (E.6-03), affiché dans une petite boîte non modale après le lancement du
 * téléchargement : ce que le fichier porte exactement, approché ou pas, par type et par raison, et le traitement des
 * calques masqués. Le rapport vient du serveur (`…/export/rapport`), pour la révision exportée ; il ne prend pas le
 * focus et n'interrompt rien.
 */
import { useQuery } from "@tanstack/react-query";
import type { StudioFormatEchange, StudioRapportFidelite } from "@parcours/atelier-model";
import "./rapport-export.css";
import { LIBELLES_RAISON_FIDELITE, LIBELLES_STATUT_FIDELITE, LIBELLES_TRAITEMENT_MASQUES, libelleType, lignesTriees, urlRapportExport } from "./rapport-export";

type Rapport = StudioRapportFidelite & { revisionId: string };

async function lireRapport(url: string): Promise<Rapport> {
  const res = await fetch(url, { credentials: "include", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as Rapport;
}

/**
 * `exportId` identifie un lancement d'export (révision affichée + compteur) : une adresse de tête ne porte pas la révision,
 * le rapport d'un nouvel export n'est donc jamais servi depuis le cache d'un export précédent.
 */
export function RapportExport({ format, urlExport, exportId, surFermer }: { format: StudioFormatEchange; urlExport: string; exportId: string; surFermer: () => void }) {
  const url = urlRapportExport(urlExport);
  const q = useQuery({ queryKey: ["studio-rapport-export", url, exportId], queryFn: () => lireRapport(url), retry: false, staleTime: 30_000 });
  const r = q.data;
  return <section className="studio-rapport-export" role="dialog" aria-modal="false" aria-labelledby="studio-rapport-export-titre" data-studio-rapport-export={format}>
    <header>
      <h2 id="studio-rapport-export-titre">Rapport de fidélité</h2>
      <span className="studio-rapport-export-format">{format.toUpperCase()}</span>
      <button type="button" onClick={surFermer} data-studio-rapport-fermer>Fermer</button>
    </header>
    <p>Téléchargement lancé. Voici ce que le fichier porte exactement, approché ou pas.</p>
    {q.isPending && <p role="status">Calcul du rapport…</p>}
    {q.isError && <p role="alert">Rapport indisponible.</p>}
    {r && <>
      <dl className="studio-rapport-export-totaux" data-studio-rapport-totaux>
        <div><dt>Éléments</dt><dd data-total="elements">{r.totaux.elements}</dd></div>
        <div><dt>{LIBELLES_STATUT_FIDELITE.exact}</dt><dd data-total="exact">{r.totaux.exact}</dd></div>
        <div><dt>{LIBELLES_STATUT_FIDELITE.approche}</dt><dd data-total="approche">{r.totaux.approche}</dd></div>
        <div><dt>{LIBELLES_STATUT_FIDELITE["non-couvert"]}</dt><dd data-total="non-couvert">{r.totaux.nonCouvert}</dd></div>
      </dl>
      {r.lignes.length > 0 && <table className="studio-rapport-export-lignes">
        <thead><tr><th scope="col">Type</th><th scope="col">Sort</th><th scope="col">Raison</th><th scope="col">Nombre</th></tr></thead>
        <tbody>
          {lignesTriees(r).map((l) => <tr key={`${l.categorie}|${l.type}|${l.statut}|${l.raison}`} data-statut={l.statut} data-raison={l.raison} data-type={l.type}>
            <td>{libelleType(l.type)}</td>
            <td>{LIBELLES_STATUT_FIDELITE[l.statut]}</td>
            <td>{LIBELLES_RAISON_FIDELITE[l.raison] ?? l.raison}</td>
            <td>{l.nombre}</td>
          </tr>)}
        </tbody>
      </table>}
      <p data-studio-rapport-reperes={`${r.reperes.source.repere}>${r.reperes.cible.repere}`}>{`Repères : local-2d (m) → ${r.reperes.cible.repere}, aucun géoréférencement.`} <span translate="no">{`${r.reperes.cible.declaration} · ${r.reperes.conversion}`}</span></p>
      <dl className="studio-rapport-export-calques" data-studio-rapport-calques>
        <div><dt>Calques masqués</dt><dd>{r.calques.masques}</dd></div>
        <div><dt>Éléments sur calques masqués</dt><dd>{r.calques.elementsSurCalquesMasques}</dd></div>
        {r.calques.masques > 0 && <div><dt>Traitement</dt><dd>{LIBELLES_TRAITEMENT_MASQUES[r.calques.traitementMasques]}</dd></div>}
        {r.calques.renommes.length > 0 && <div><dt>Calques renommés</dt><dd><ul>{r.calques.renommes.map((c) => <li key={c.id} translate="no">{c.nom} → {c.nomExporte}</li>)}</ul></dd></div>}
      </dl>
    </>}
  </section>;
}
