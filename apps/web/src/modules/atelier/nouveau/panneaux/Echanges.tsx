/**
 * Échanges de l'Atelier (lot 6) : export de la maquette IFC 4.3 (produite par le serveur, inscrite au catalogue),
 * import IFC (lu par le serveur avec web-ifc, produits en représentations importées), import DXF 2D (lu ici, en
 * commandes d'esquisse), et le rapport de fidélité de chaque échange : conservé, transformé, omis, à réparer.
 */
import { useEffect, useRef, useState } from "react";
import { commandesImportDxf, commandesProprietesCsv, modeleDepuisBibliotheque, planifierReprise, exporterIfc, ErreurCommande, type ModeleAtelier, type RapportEchange, type RapportImportDxf, type UniteDxf } from "@parcours/atelier-model";
import { api, ApiError } from "../../../../lib/api";
import type { AtelierClient } from "../../bus/atelier-client";

export type RapportAffiche = { titre: string; fichier: string | null; ifc?: RapportEchange; dxf?: RapportImportDxf };

declare global {
  interface Window {
    /** Derniers rapports d'échange (contrôles de recette). */
    __fadiEchanges?: RapportAffiche[];
  }
}

const nomFichier = (base: string) => base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");

function telecharger(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function memoriser(r: RapportAffiche): RapportAffiche {
  window.__fadiEchanges = [...(window.__fadiEchanges ?? []), r];
  return r;
}

/** Les lots locaux partent d'abord : l'échange porte sur la révision du serveur, qui doit être celle de l'écran. */
async function synchroniser(client: AtelierClient): Promise<void> {
  await client.demarrage;
  await client.envoyer();
  const reste = client.getSnapshot().lots.length;
  if (reste) throw new Error(`${reste} modification(s) pas encore enregistrée(s) sur le serveur : synchronisez avant l'échange.`);
}

/** Export IFC : fichier produit par le serveur (même code que l'aperçu), rapport calculé ici sur le même modèle. */
export async function exporterMaquetteIfc(client: AtelierClient, contexte: { projectId: string; code: string; nomProjet: string }): Promise<RapportAffiche> {
  await synchroniser(client);
  const res = await fetch(`/projects/${contexte.projectId}/documents/atelier/modele.ifc`, { credentials: "include" });
  if (!res.ok) throw new Error(`Maquette IFC non produite (${res.status}).`);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const nom = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `${nomFichier(contexte.code)}.ifc`;
  telecharger(blob, nom);
  const { rapport } = exporterIfc(client.getSnapshot().etat, { projet: { id: contexte.projectId, nom: contexte.nomProjet, code: contexte.code }, revision: Number(res.headers.get("X-Model-Revision") ?? 0), horodatage: "" });
  return memoriser({ titre: "Export IFC 4.3", fichier: nom, ifc: rapport });
}

export function MenuImport({ client, projectId, etat, niveauId, desactive, motif, onRapport, onErreur, onAide }: {
  client: AtelierClient;
  projectId: string;
  etat: ModeleAtelier;
  niveauId: string | null;
  desactive: boolean;
  motif: string | undefined;
  onRapport: (r: RapportAffiche) => void;
  onErreur: (m: string) => void;
  onAide: (m: string) => void;
}) {
  const entreeIfc = useRef<HTMLInputElement | null>(null);
  const entreeCsv = useRef<HTMLInputElement | null>(null);
  const entreeBib = useRef<HTMLInputElement | null>(null);
  // Fichier de bibliothèque (D-050) : repris comme une bibliothèque partagée (homonymes réutilisés, provenance fichier).
  const importerBibliotheque = async (f: File) => {
    try {
      const { modele, nom } = modeleDepuisBibliotheque(await f.text());
      const plan = planifierReprise(modele, client.getSnapshot().etat, { familles: ["definitions"], origine: { projet: "fichier", nom: `${nom} (${f.name})`, revision: 0 }, homonymes: "reutiliser" });
      if (!plan.commande) return void onAide("Rien à reprendre de ce fichier : toutes ses définitions existent déjà sous le même nom.");
      await client.executer([plan.commande], `Bibliothèque « ${nom} » importée`);
      const n = Object.keys((plan.commande.params["ajouts"] as { definitions: Record<string, unknown> }).definitions).length;
      const reutilises = plan.rapport.homonymes.filter((h) => h.action === "reutilise").length;
      onAide(`${n} définition(s) ajoutée(s) depuis « ${nom} »${reutilises ? ` ; ${reutilises} homonyme(s) réutilisé(s)` : ""}.`);
    } catch (err) {
      onErreur(err instanceof Error ? err.message : String(err));
    }
  };
  // Propriétés en tableau (D-045) : une commande propriete.definir par ligne valide, refus nominatifs.
  const importerProprietes = async (f: File) => {
    try {
      const { commandes, rapport } = commandesProprietesCsv(client.getSnapshot().etat, await f.text());
      if (commandes.length) await client.executer(commandes, `Propriétés importées de ${f.name} (${commandes.length})`);
      onAide(`${rapport.retenues} propriété(s) importée(s) de ${f.name} sur ${rapport.lignes} ligne(s)${rapport.refus.length ? ` ; ${rapport.refus.length} refusée(s)` : ""}.`);
      if (rapport.refus.length) onErreur(`Lignes refusées : ${rapport.refus.slice(0, 6).map((r) => `ligne ${r.ligne} (${r.motif})`).join(" ; ")}${rapport.refus.length > 6 ? " ; …" : ""}`);
    } catch (err) {
      onErreur(err instanceof Error ? err.message : String(err));
    }
  };
  const [dxfOuvert, setDxfOuvert] = useState(false);
  const fermerMenu = (e: React.MouseEvent) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");

  const importerIfc = async (f: File) => {
    try {
      await synchroniser(client);
      onAide(`Lecture de ${f.name}…`);
      const r = await api.importAtelierIfc(projectId, f, f.name);
      await client.relireServeur(r.revision);
      const n = r.rapport.classes.reduce((s, l) => s + l.cible, 0);
      onAide(`${n} objet(s) importé(s) de ${r.source} en représentations (${r.lots} lot(s)).`);
      onRapport(memoriser({ titre: "Import IFC", fichier: r.source, ifc: r.rapport }));
    } catch (err) {
      onAide("");
      onErreur(err instanceof ApiError ? `Import IFC refusé : ${err.serverMessage ?? err.code}` : err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <>
      <details
        className="barre-imports"
        onToggle={(e) => {
          const d = e.currentTarget;
          const boite = d.closest(".atelier-n")?.getBoundingClientRect();
          const r = d.getBoundingClientRect();
          d.dataset["cote"] = boite && r.left - boite.left < boite.width / 2 ? "gauche" : "droite";
        }}
      >
        <summary>Importer</summary>
        <div className="exports-liste">
          <button type="button" data-import="ifc" disabled={desactive} title={motif} onClick={(e) => { fermerMenu(e); entreeIfc.current?.click(); }}>
            Maquette IFC…
          </button>
          <button type="button" data-import="dxf" disabled={desactive || !niveauId} title={motif ?? (!niveauId ? "Créez d'abord un niveau" : undefined)} onClick={(e) => { fermerMenu(e); setDxfOuvert(true); }}>
            Plan DXF (2D)…
          </button>
          <button type="button" data-import="proprietes" disabled={desactive} title={motif ?? "CSV : id ; propriete ; valeur ; unite"} onClick={(e) => { fermerMenu(e); entreeCsv.current?.click(); }}>
            Propriétés (CSV)…
          </button>
          <button type="button" data-import="bibliotheque" disabled={desactive} title={motif ?? "Fichier .fadi-bibliotheque.json exporté d'un autre projet"} onClick={(e) => { fermerMenu(e); entreeBib.current?.click(); }}>
            Bibliothèque de définitions…
          </button>
        </div>
      </details>
      <input
        ref={entreeIfc}
        type="file"
        accept=".ifc"
        hidden
        aria-label="Fichier IFC à importer"
        data-entree="ifc"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) void importerIfc(f);
        }}
      />
      <input
        ref={entreeCsv}
        type="file"
        accept=".csv,text/csv"
        hidden
        aria-label="Fichier CSV de propriétés à importer"
        data-entree="proprietes-csv"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) void importerProprietes(f);
        }}
      />
      <input
        ref={entreeBib}
        type="file"
        accept=".json,application/json"
        hidden
        aria-label="Fichier de bibliothèque à importer"
        data-entree="bibliotheque"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (f) void importerBibliotheque(f);
        }}
      />
      {dxfOuvert && niveauId && (
        <ImportDxf
          client={client}
          etat={etat}
          niveauId={niveauId}
          onFermer={() => setDxfOuvert(false)}
          onRapport={(r) => {
            setDxfOuvert(false);
            onRapport(memoriser(r));
          }}
          onAide={onAide}
        />
      )}
    </>
  );
}

function ImportDxf({ client, etat, niveauId, onFermer, onRapport, onAide }: { client: AtelierClient; etat: ModeleAtelier; niveauId: string; onFermer: () => void; onRapport: (r: RapportAffiche) => void; onAide: (m: string) => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const [niveau, setNiveau] = useState(niveauId);
  const [unite, setUnite] = useState<UniteDxf>("m");
  const [repere, setRepere] = useState<"local" | "cadastral">("local");
  const [fichier, setFichier] = useState<File | null>(null);
  const [joints, setJoints] = useState<File[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const parcelle = etat.site.parcelle;

  const importer = async () => {
    if (!fichier) return;
    setEnCours(true);
    setErreur(null);
    try {
      const texte = await fichier.text();
      // Références externes (XREF) : fichiers DXF joints, appariés par leur nom (D-036).
      const xrefs = Object.fromEntries(await Promise.all(joints.map(async (j) => [j.name, await j.text()] as const)));
      const { lots, rapport } = commandesImportDxf(client.getSnapshot().etat, texte, { source: fichier.name, niveauId: niveau, repere, uniteSiAbsente: unite, xrefs });
      for (const l of lots) await client.executer(l.commands, l.label);
      const n = rapport.entites.reduce((s, x) => s + x.importees, 0);
      onAide(`${n} entité(s) importée(s) de ${fichier.name} sur ${etat.niveaux[niveau]?.nom ?? niveau}.`);
      onRapport({ titre: "Import DXF 2D", fichier: fichier.name, dxf: rapport });
    } catch (err) {
      setErreur(err instanceof ErreurCommande ? `Import refusé : ${err.message}` : err instanceof Error ? err.message : String(err));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <dialog ref={ref} className="atelier-dialogue echanges-dxf" aria-labelledby="dxf-titre" onClose={onFermer}>
      <h2 id="dxf-titre">Importer un plan DXF (2D)</h2>
      <p className="dialogue-note">Lignes, polylignes, cercles, arcs et textes deviennent des esquisses sur un calque « DXF · … » par calque du fichier, regroupées. Blocs décomposés, hachures et cotes repris ; une référence externe (XREF) est résolue si son fichier DXF est joint, sinon signalée.</p>
      <label>
        Fichier DXF (ASCII)
        <input type="file" accept=".dxf" data-entree="dxf" onChange={(e) => setFichier(e.currentTarget.files?.[0] ?? null)} />
      </label>
      <label>
        Références externes (XREF) jointes, facultatif — un DXF par référence, même nom que le fichier référencé
        <input type="file" accept=".dxf" multiple data-entree="dxf-xref" onChange={(e) => setJoints([...(e.currentTarget.files ?? [])])} />
      </label>
      <label>
        Niveau d'accueil
        <select value={niveau} onChange={(e) => setNiveau(e.target.value)}>
          {Object.values(etat.niveaux)
            .sort((a, b) => a.elevation - b.elevation)
            .map((n) => (
              <option key={n.id} value={n.id}>
                {n.nom}
              </option>
            ))}
        </select>
      </label>
      <label>
        Unité si le fichier ne la déclare pas
        <select value={unite} onChange={(e) => setUnite(e.target.value as UniteDxf)}>
          <option value="m">mètre</option>
          <option value="cm">centimètre</option>
          <option value="mm">millimètre</option>
          <option value="in">pouce</option>
          <option value="ft">pied</option>
        </select>
      </label>
      <fieldset>
        <legend>Repère des coordonnées du fichier</legend>
        <label>
          <input type="radio" name="dxf-repere" checked={repere === "local"} onChange={() => setRepere("local")} /> Repère local du projet
        </label>
        <label title={parcelle ? undefined : "Le projet n'a pas de parcelle"}>
          <input type="radio" name="dxf-repere" disabled={!parcelle} checked={repere === "cadastral"} onChange={() => setRepere("cadastral")} /> Cadastral {parcelle ? `(${parcelle.crs}, converti en local)` : "(aucune parcelle)"}
        </label>
      </fieldset>
      {erreur && (
        <p className="dialogue-erreur" role="alert">
          {erreur}
        </p>
      )}
      <div className="dialogue-actions">
        <button type="button" onClick={() => ref.current?.close()}>
          Annuler
        </button>
        <button type="button" className="primaire" disabled={!fichier || enCours} onClick={() => void importer()}>
          {enCours ? "Import…" : "Importer"}
        </button>
      </div>
    </dialog>
  );
}

/** Rapport de fidélité d'un échange : par classe, source → cible, représentation, remarques ; pertes déclarées. */
export function RapportEchangeDialogue({ rapport, onFermer }: { rapport: RapportAffiche; onFermer: () => void }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const ifc = rapport.ifc;
  const dxf = rapport.dxf;
  return (
    <dialog ref={ref} className="atelier-dialogue echanges-rapport" aria-labelledby="rapport-echange-titre" onClose={onFermer}>
      <h2 id="rapport-echange-titre">
        Rapport · {rapport.titre}
        {rapport.fichier ? ` · ${rapport.fichier}` : ""}
      </h2>
      {ifc && (
        <>
          <p className="dialogue-note">
            Schéma {ifc.format} · {ifc.sens === "export" ? "classes du modèle → entités IFC" : "entités IFC → représentations importées"}. Conformité testée en CI avec IfcOpenShell, non certifiée.
          </p>
          <div className="rapport-table" tabIndex={0} role="region" aria-label="Tableau du rapport">
            <table>
              <thead>
                <tr>
                  <th scope="col">Classe</th>
                  <th scope="col">Lus</th>
                  <th scope="col">{ifc.sens === "export" ? "Écrits" : "Importés"}</th>
                  <th scope="col">{ifc.sens === "export" ? "Entité IFC" : "Représentation"}</th>
                  <th scope="col">Remarques</th>
                </tr>
              </thead>
              <tbody>
                {ifc.classes.map((l) => (
                  <tr key={l.classe} className={l.cible < l.source ? "rapport-perte" : undefined}>
                    <th scope="row">{l.classe}</th>
                    <td>{l.source}</td>
                    <td>{l.cible}</td>
                    <td>{ifc.sens === "export" ? `${l.ifc}${l.representation !== "—" ? ` (${l.representation})` : ""}` : l.representation}</td>
                    <td>{l.remarques.join(" ; ") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ifc.aReparer > 0 && <p>{ifc.aReparer} référence(s) à réparer au moment de l'échange.</p>}
          <ul className="rapport-remarques">
            {ifc.remarques.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {dxf && (
        <>
          <p className="dialogue-note">
            Unité : {dxf.unite.valeur} ({dxf.unite.origine === "fichier" ? "déclarée par le fichier" : "choisie, hypothèse"}) · repère {dxf.repere} · calques : {dxf.calques.join(", ") || "—"}
          </p>
          <div className="rapport-table" tabIndex={0} role="region" aria-label="Tableau du rapport">
            <table>
              <thead>
                <tr>
                  <th scope="col">Entité</th>
                  <th scope="col">Lues</th>
                  <th scope="col">Importées</th>
                  <th scope="col">Remarque</th>
                </tr>
              </thead>
              <tbody>
                {dxf.entites.map((x) => (
                  <tr key={x.type} className={x.importees < x.lues ? "rapport-perte" : undefined}>
                    <th scope="row">{x.type}</th>
                    <td>{x.lues}</td>
                    <td>{x.importees}</td>
                    <td>{x.remarque ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="rapport-remarques">
            {dxf.remarques.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
      <div className="dialogue-actions">
        <button type="button" className="primaire" onClick={() => ref.current?.close()}>
          Fermer
        </button>
      </div>
    </dialog>
  );
}
