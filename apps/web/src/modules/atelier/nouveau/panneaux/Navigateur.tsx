/**
 * Navigateur du projet (cahier §5.7, UX3) : niveaux (choix du niveau actif, création), calques (visibilité et
 * verrouillage = commandes `calque.modifier`, car ils sont dans le modèle), objets du niveau regroupés par classe
 * (clic = sélection, la vue se recentre).
 */
import { ProprietesCible } from "./Inspecteur";
import { ClasserParRegle, EtatsCalques } from "./Complements";
import { Arborescence } from "./Affichage";
import { useMemo, useState } from "react";
import { altimetrieDu, descendantsCalque, CLASSES, ensemblesPartages, niveauxOrdonnes, type Classe, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { etatUi, type EtatUi, type FiltresAffichage } from "../etat-ui";
import { normaliser } from "../outils";

export interface PropsNavigateur {
  etat: ModeleAtelier;
  ui: EtatUi;
  readOnly: boolean;
  onCommandes: (commandes: Commande[], label: string) => void;
  onCentrer: (objetId: string) => void;
}

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ","));

function nomObjet(o: OccurrenceQuelconque): string {
  const p = o.params as unknown as Record<string, unknown>;
  for (const k of ["nom", "repere", "texte", "code"]) if (typeof p[k] === "string" && p[k]) return p[k] as string;
  return o.id;
}

export function Navigateur({ etat, ui, readOnly, onCommandes, onCentrer }: PropsNavigateur) {
  const niveaux = niveauxOrdonnes(etat);
  const altimetrie = altimetrieDu(etat);
  const [filtre, setFiltre] = useState("");
  const [nouveauNiveau, setNouveauNiveau] = useState<{ nom: string; elevation: string; source: string } | null>(null);
  const calques = arbreCalques(etat);
  const parClasse = useMemo(() => {
    const m = new Map<Classe, OccurrenceQuelconque[]>();
    const f = normaliser(filtre);
    for (const o of Object.values(etat.objets) as OccurrenceQuelconque[]) {
      if (o.niveauId !== ui.niveauId) continue;
      if (f && !normaliser(`${nomObjet(o)} ${o.id} ${CLASSES[o.classe].libelle}`).includes(f)) continue;
      const l = m.get(o.classe) ?? [];
      l.push(o);
      m.set(o.classe, l);
    }
    return [...m].sort((a, b) => CLASSES[a[0]].libelle.localeCompare(CLASSES[b[0]].libelle, "fr"));
  }, [etat.objets, ui.niveauId, filtre]);
  const selection = new Set(ui.selection);
  const basculerClasse = (classe: string) =>
    etatUi.set((u) => ({ filtres: { ...u.filtres, classesMasquees: u.filtres.classesMasquees.includes(classe) ? u.filtres.classesMasquees.filter((c) => c !== classe) : [...u.filtres.classesMasquees, classe] }, selection: u.selection.filter((id) => etat.objets[id]?.classe !== classe) }));

  return (
    <nav className="navigateur" aria-label="Navigateur du projet">
      <section aria-labelledby="nav-niveaux">
        <h3 id="nav-niveaux">Niveaux</h3>
        <ul className="nav-liste nav-niveaux" aria-label="Niveau actif">
          {niveaux.map((n) => (
            <li key={n.id}>
              <button type="button" aria-pressed={n.id === ui.niveauId} className={n.id === ui.niveauId ? "est-actif" : ""} onClick={() => etatUi.set({ niveauId: n.id, selection: [], pointsEnCours: [] })}>
                <span>{n.nom}</span>
                <span className="nav-detail">{fmt(n.elevation)} m{altimetrie ? ` · ${fmt(Math.round((altimetrie.altitude + n.elevation) * 1000) / 1000)} m ${altimetrie.systeme}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {!readOnly && ui.niveauId && etat.niveaux[ui.niveauId] && <GererNiveau key={ui.niveauId} etat={etat} niveauId={ui.niveauId} onCommandes={onCommandes} />}
        {!readOnly && !nouveauNiveau && (
          <button type="button" className="nav-ajout" onClick={() => setNouveauNiveau({ nom: `Niveau ${niveaux.length + 1}`, elevation: "", source: "" })}>
            Ajouter un niveau
          </button>
        )}
        {nouveauNiveau && (
          <form
            className="nav-formulaire"
            onSubmit={(e) => {
              e.preventDefault();
              const elevation = Number(nouveauNiveau.elevation.replace(",", "."));
              if (!nouveauNiveau.nom.trim() || nouveauNiveau.elevation.trim() === "" || !Number.isFinite(elevation)) return;
              // Avec « copier le contenu de » : niveau.dupliquer (D-040), une seule révision.
              if (nouveauNiveau.source) onCommandes([{ type: "niveau.dupliquer", params: { source: nouveauNiveau.source, nom: nouveauNiveau.nom.trim(), elevation } }], `Niveau ${nouveauNiveau.nom.trim()} (copie de ${etat.niveaux[nouveauNiveau.source]?.nom ?? nouveauNiveau.source})`);
              else onCommandes([{ type: "niveau.creer", params: { nom: nouveauNiveau.nom.trim(), elevation, ordre: niveaux.length } }], `Niveau ${nouveauNiveau.nom.trim()}`);
              setNouveauNiveau(null);
            }}
          >
            <label>
              Nom
              <input value={nouveauNiveau.nom} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, nom: e.target.value })} onKeyDown={(e) => e.stopPropagation()} required />
            </label>
            <label>
              Altitude (m)
              <input inputMode="decimal" value={nouveauNiveau.elevation} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, elevation: e.target.value })} onKeyDown={(e) => e.stopPropagation()} required placeholder="à renseigner" />
            </label>
            <label>
              Copier le contenu de
              <select value={nouveauNiveau.source} onChange={(e) => setNouveauNiveau({ ...nouveauNiveau, source: e.target.value })} data-niveau="source">
                <option value="">aucun (niveau vide)</option>
                {niveaux.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nom}
                  </option>
                ))}
              </select>
            </label>
            <div className="nav-actions">
              <button type="submit">Créer</button>
              <button type="button" onClick={() => setNouveauNiveau(null)}>Annuler</button>
            </div>
          </form>
        )}
      </section>

      <section aria-labelledby="nav-site">
        <h3 id="nav-site">Site</h3>
        <p className="nav-site" id="atelier-site-info">
          {etat.site.parcelle
            ? `${etat.site.parcelle.crs}${etat.site.parcelle.aire ? ` · parcelle ${etat.site.parcelle.aire.value.toFixed(2).replace(".", ",")} m²` : ""} · origine locale ${etat.site.parcelle.origineLocale.x.toFixed(2).replace(".", ",")} ; ${etat.site.parcelle.origineLocale.y.toFixed(2).replace(".", ",")}`
            : "Aucune parcelle transmise : repère local libre (étape 01 pour la rattacher au cadastre)."}
        </p>
        <RepereAltimetrique etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      </section>

      <section aria-labelledby="nav-calques">
        <h3 id="nav-calques">Calques</h3>
        {calques.length === 0 ? (
          <p className="nav-vide">Aucun calque.</p>
        ) : (
          <ul className="nav-liste nav-calques">
            {calques.map((c) => (
              <li key={c.id} style={c.profondeur ? { paddingLeft: `${c.profondeur * 0.9}rem` } : undefined} data-calque-profondeur={c.profondeur}>
                <span className="nav-pastille" style={{ background: c.couleur ?? "transparent" }} aria-hidden="true" />
                <span className="nav-nom">{c.nom}</span>
                <button type="button" className="nav-bascule" aria-pressed={c.visible} title={c.visible ? "Masquer" : "Afficher"} disabled={readOnly} onClick={() => onCommandes([{ type: "calque.modifier", params: { id: c.id, visible: !c.visible } }], `${c.visible ? "Masquer" : "Afficher"} ${c.nom}`)}>
                  {c.visible ? "◉" : "○"}
                  <span className="sr-only">{c.visible ? `Masquer ${c.nom}` : `Afficher ${c.nom}`}</span>
                </button>
                <button type="button" className="nav-bascule" aria-pressed={c.verrouille} title={c.verrouille ? "Déverrouiller" : "Verrouiller"} disabled={readOnly} onClick={() => onCommandes([{ type: "calque.modifier", params: { id: c.id, verrouille: !c.verrouille } }], `${c.verrouille ? "Déverrouiller" : "Verrouiller"} ${c.nom}`)}>
                  {c.verrouille ? "🔒" : "🔓"}
                  <span className="sr-only">{c.verrouille ? `Déverrouiller ${c.nom}` : `Verrouiller ${c.nom}`}</span>
                </button>
                {/* Gel (D-103) : hors de tout l'affichage (plan, 3D, accrochage), des vues et des exports ; objets figés. */}
                <button type="button" className="nav-bascule" aria-pressed={!!c.gele} data-calque-geler={c.id} title={c.gele ? "Dégeler" : "Geler (masqué partout, objets figés)"} disabled={readOnly} onClick={() => onCommandes([{ type: "calque.modifier", params: { id: c.id, gele: !c.gele } }], `${c.gele ? "Dégeler" : "Geler"} ${c.nom}`)}>
                  {c.gele ? "❄" : "∗"}
                  <span className="sr-only">{c.gele ? `Dégeler ${c.nom}` : `Geler ${c.nom}`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!readOnly && <GererCalques etat={etat} onCommandes={onCommandes} />}
        {!readOnly && <EtatsCalques etat={etat} onCommandes={onCommandes} />}
        {!readOnly && <ClasserParRegle etat={etat} niveauId={ui.niveauId} onCommandes={onCommandes} />}
      </section>

      <section aria-labelledby="nav-objets" className="nav-objets">
        <h3 id="nav-objets">Objets du niveau</h3>
        <input type="search" className="nav-filtre" placeholder="Filtrer (nom, classe, identifiant)" aria-label="Filtrer les objets" value={filtre} onChange={(e) => setFiltre(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        {parClasse.length === 0 && <p className="nav-vide">{filtre ? "Aucun objet ne correspond." : "Aucun objet sur ce niveau : choisissez un outil de création."}</p>}
        {parClasse.map(([classe, liste]) => {
          const masquee = ui.filtres.classesMasquees.includes(classe);
          return (
          <div key={classe} className="nav-classe">
          {/* Filtre d'affichage local par classe (DA-05-02, D-066) et sélection de toute la classe sur le niveau ; hors du
              résumé (un bouton dans un résumé est un contrôle imbriqué). */}
          <span className="nav-classe-actions">
            <button type="button" className="nav-bascule" aria-pressed={!masquee} data-classe-bascule={classe} title={masquee ? "Afficher cette classe (pour vous)" : "Masquer cette classe (pour vous)"} onClick={() => basculerClasse(classe)}>
              {masquee ? "○" : "◉"}
              <span className="sr-only">{masquee ? `Afficher ${CLASSES[classe].libelle}` : `Masquer ${CLASSES[classe].libelle}`}</span>
            </button>
            {!masquee && (
              <button type="button" className="nav-bascule" data-classe-selection={classe} title="Sélectionner toute la classe sur ce niveau" onClick={() => etatUi.selectionner(liste.filter((o) => !(o.calqueId && ui.filtres.calquesMasques.includes(o.calqueId))).map((o) => o.id))}>
                ⊞<span className="sr-only">Sélectionner toute la classe {CLASSES[classe].libelle}</span>
              </button>
            )}
          </span>
          <details open={liste.length <= 12 || liste.some((o) => selection.has(o.id))} className={masquee ? "classe-masquee" : undefined}>
            <summary>
              {CLASSES[classe].libelle} <span className="nav-detail">{liste.length}{masquee ? " · masquée pour vous" : ""}</span>
            </summary>
            <ul className="nav-liste">
              {liste.slice(0, 300).map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    data-objet={o.id}
                    className={selection.has(o.id) ? "est-actif" : ""}
                    onClick={(e) => {
                      etatUi.selectionner([o.id], e.shiftKey);
                      onCentrer(o.id);
                    }}
                  >
                    {nomObjet(o)}
                  </button>
                </li>
              ))}
              {liste.length > 300 && <li className="nav-vide">… {liste.length - 300} de plus : filtrez pour les trouver.</li>}
            </ul>
          </details>
          </div>
          );
        })}
      </section>
      <Arborescence etat={etat} ui={ui} />
      <EnsemblesAffichage etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />
    </nav>
  );
}

/**
 * Niveau actif : renommer, changer l'altitude (niveau.modifier) ; supprimer — vide, avec ses objets, ou en les
 * réaffectant à un autre niveau (D-044). Aucune valeur supposée : l'altitude est saisie.
 */
function GererNiveau({ etat, niveauId, onCommandes }: { etat: ModeleAtelier; niveauId: string; onCommandes: PropsNavigateur["onCommandes"] }) {
  const n = etat.niveaux[niveauId]!;
  const [nom, setNom] = useState(n.nom);
  const [alt, setAlt] = useState(String(n.elevation));
  const [mode, setMode] = useState("");
  const nbObjets = Object.values(etat.objets).filter((o) => o.niveauId === niveauId).length;
  const autres = niveauxOrdonnes(etat).filter((x) => x.id !== niveauId);
  return (
    <details className="nav-gerer-niveau">
      <summary>Gérer « {n.nom} »</summary>
      <form
        className="nav-formulaire-gerer"
        onSubmit={(e) => {
          e.preventDefault();
          const elevation = Number(alt.replace(",", "."));
          if (!nom.trim() || !Number.isFinite(elevation)) return;
          onCommandes([{ type: "niveau.modifier", params: { id: niveauId, nom: nom.trim(), elevation } }], `Niveau ${nom.trim()}`);
        }}
      >
        <label>
          Nom
          <input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} required />
        </label>
        <label>
          Altitude (m)
          <input inputMode="decimal" value={alt} onChange={(e) => setAlt(e.target.value)} onKeyDown={(e) => e.stopPropagation()} required />
        </label>
        <div className="nav-actions">
          <button type="submit">Enregistrer</button>
        </div>
      </form>
      <label>
        Supprimer le niveau
        <select value={mode} onChange={(e) => setMode(e.target.value)} data-niveau="suppression">
          <option value="">Choisir…</option>
          {nbObjets === 0 && <option value="vide">supprimer (niveau vide)</option>}
          {nbObjets > 0 && <option value="avec">supprimer avec ses {nbObjets} objet(s)</option>}
          {nbObjets > 0 && autres.map((x) => <option key={x.id} value={`vers:${x.id}`}>réaffecter ses {nbObjets} objet(s) à « {x.nom} »</option>)}
        </select>
      </label>
      <button
        type="button"
        className="danger"
        disabled={!mode}
        data-niveau="supprimer"
        onClick={() => {
          const params = mode === "avec" ? { id: niveauId, avecObjets: true } : mode.startsWith("vers:") ? { id: niveauId, reaffecterA: mode.slice(5) } : { id: niveauId };
          const autre = autres[0];
          onCommandes([{ type: "niveau.supprimer", params }], `Supprimer le niveau « ${n.nom} »`);
          if (autre) etatUi.set({ niveauId: mode.startsWith("vers:") ? mode.slice(5) : autre.id, selection: [], pointsEnCours: [] });
        }}
      >
        Supprimer
      </button>
    </details>
  );
}


/**
 * Ensembles d'affichage (DA-05-03, D-066) : filtres locaux de classes et de calques, personnels (synchronisés entre
 * vos appareils, D-118) ou
 * partagés avec l'équipe (`ensemble.enregistrer`), associés au choix à un étage. Ils ne révèlent jamais un calque
 * masqué dans le modèle et ne changent rien au projet.
 */
function EnsemblesAffichage({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes: (commandes: Commande[], label: string) => void }) {
  const [nom, setNom] = useState("");
  const [niveauId, setNiveauId] = useState("");
  const [partager, setPartager] = useState(false);
  const f = ui.filtres;
  const actifs = f.classesMasquees.length + f.calquesMasques.length;
  const partages = ensemblesPartages(etat);
  const appliquer = (x: FiltresAffichage, libelle: string) => etatUi.set({ filtres: { classesMasquees: [...x.classesMasquees], calquesMasques: [...x.calquesMasques] }, selection: [], aide: `Ensemble d'affichage « ${libelle} » appliqué.` });
  const calques = Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre);
  const niveaux = niveauxOrdonnes(etat);
  return (
    <section aria-labelledby="nav-ensembles" className="nav-ensembles" data-ensembles>
      <h3 id="nav-ensembles">Ensembles d'affichage</h3>
      {ui.isolement && (
        <p className="nav-detail" data-isolement-actif={ui.isolement.length}>
          Isolement actif : {ui.isolement.length} objet(s) seulement.{" "}
          <button type="button" className="lien" data-isolement-quitter onClick={() => etatUi.set({ isolement: null })}>Quitter l'isolement</button>
        </p>
      )}
      <p className="nav-detail" data-filtres-actifs={actifs}>
        {actifs ? `Filtres pour vous : ${f.classesMasquees.length} classe(s), ${f.calquesMasques.length} calque(s) masqués.` : "Tout est affiché (filtres locaux vides)."}
        {actifs > 0 && <button type="button" className="lien" data-ensemble-tout onClick={() => etatUi.set({ filtres: { classesMasquees: [], calquesMasques: [] } })}>Tout afficher</button>}
      </p>
      {calques.length > 0 && (
        <details>
          <summary>Calques masqués pour vous</summary>
          <ul className="nav-liste">
            {calques.map((c) => (
              <li key={c.id}>
                <label className="case">
                  <input type="checkbox" data-calque-local={c.id} checked={f.calquesMasques.includes(c.id)} onChange={(e) => etatUi.set((u) => ({ filtres: { ...u.filtres, calquesMasques: e.target.checked ? [...u.filtres.calquesMasques, c.id] : u.filtres.calquesMasques.filter((x) => x !== c.id) } }))} />
                  {c.nom}{!c.visible ? " (masqué dans le projet)" : ""}
                </label>
              </li>
            ))}
          </ul>
        </details>
      )}
      {(ui.ensembles.length > 0 || partages.length > 0) && (
        <ul className="nav-liste">
          {partages.map((e) => (
            <li key={e.id} data-ensemble-partage={e.id}>
              <button type="button" onClick={() => appliquer(e.params, e.nom)}>{e.nom}</button>
              <span className="nav-detail">partagé{e.params.niveauId && etat.niveaux[e.params.niveauId] ? ` · ${etat.niveaux[e.params.niveauId]!.nom}` : ""}</span>
              {!readOnly && <button type="button" className="lien" onClick={() => onCommandes([{ type: "ensemble.supprimer", params: { id: e.id } }], `Supprimer l'ensemble « ${e.nom} »`)}>Supprimer</button>}
            </li>
          ))}
          {ui.ensembles.map((e, i) => (
            <li key={`${e.nom}-${i}`} data-ensemble-local={e.nom}>
              <button type="button" onClick={() => appliquer(e, e.nom)}>{e.nom}</button>
              <span className="nav-detail" title="Personnel : suit votre compte sur vos autres appareils">pour vous{e.niveauId && etat.niveaux[e.niveauId] ? ` · ${etat.niveaux[e.niveauId]!.nom}` : ""}</span>
              <button type="button" className="lien" onClick={() => etatUi.set((u) => ({ ensembles: u.ensembles.filter((_, k) => k !== i) }))}>Supprimer</button>
            </li>
          ))}
        </ul>
      )}
      <form className="nav-formulaire-ensemble" onSubmit={(e) => {
        e.preventDefault();
        const n = nom.trim();
        if (!n) return;
        if (partager) onCommandes([{ type: "ensemble.enregistrer", params: { nom: n, classesMasquees: f.classesMasquees, calquesMasques: f.calquesMasques.filter((c) => etat.calques[c]), niveauId: niveauId || null } }], `Partager l'ensemble d'affichage « ${n} »`);
        else etatUi.set((u) => ({ ensembles: [...u.ensembles.filter((x) => x.nom !== n), { nom: n, classesMasquees: [...f.classesMasquees], calquesMasques: [...f.calquesMasques], niveauId: niveauId || null }] }));
        setNom("");
      }}>
        <input value={nom} maxLength={80} placeholder="Nom de l'ensemble" aria-label="Nom de l'ensemble d'affichage" onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-ensemble-nom />
        <select value={niveauId} aria-label="Étage associé" onChange={(e) => setNiveauId(e.target.value)}>
          <option value="">Aucun étage associé</option>
          {niveaux.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
        </select>
        <label className="case"><input type="checkbox" checked={partager} disabled={readOnly} onChange={(e) => setPartager(e.target.checked)} data-ensemble-partager /> Partager avec l'équipe</label>
        <button type="submit" disabled={!nom.trim()}>Enregistrer l'affichage actuel</button>
      </form>
    </section>
  );
}

/** Repère altimétrique (D-067, R5) : altitude absolue de la cote locale 0, déclarée avec son système et sa source. */
function RepereAltimetrique({ etat, readOnly, onCommandes }: { etat: ModeleAtelier; readOnly: boolean; onCommandes: (commandes: Commande[], label: string) => void }) {
  const a = altimetrieDu(etat);
  const [form, setForm] = useState({ altitude: a ? String(a.altitude).replace(".", ",") : "", systeme: a?.systeme ?? "", source: a?.source ?? "" });
  const v = Number(form.altitude.trim().replace(",", "."));
  const pret = form.altitude.trim() !== "" && Number.isFinite(v) && form.systeme.trim() && form.source.trim();
  return (
    <details className="nav-altimetrie" data-altimetrie={a ? "declaree" : "non-declaree"}>
      <summary>{a ? `Cote 0 = ${String(a.altitude).replace(".", ",")} m ${a.systeme}` : "Altitude de référence non déclarée"}</summary>
      {a && <p className="nav-detail">Source : {a.source} (déclarée, non vérifiée par Fadi).</p>}
      {!readOnly && (
        <form className="nav-formulaire-altimetrie" onSubmit={(e) => { e.preventDefault(); if (pret) onCommandes([{ type: "site.altimetrie.definir", params: { altitude: { value: v, unit: "m" }, systeme: form.systeme.trim(), source: form.source.trim() } }], `Repère altimétrique : cote 0 = ${form.altitude} m ${form.systeme.trim()}`); }}>
          <input aria-label="Altitude de la cote 0 (m)" placeholder="Altitude de la cote 0 (m)" inputMode="decimal" value={form.altitude} onChange={(e) => setForm({ ...form, altitude: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-altimetrie-champ="altitude" />
          <input aria-label="Système altimétrique" placeholder="Système (ex. NGF-IGN69)" value={form.systeme} maxLength={60} onChange={(e) => setForm({ ...form, systeme: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-altimetrie-champ="systeme" />
          <input aria-label="Source" placeholder="Source (relevé, plan…)" value={form.source} maxLength={200} onChange={(e) => setForm({ ...form, source: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-altimetrie-champ="source" />
          <button type="submit" disabled={!pret}>Déclarer</button>
          {a && <button type="button" className="lien" onClick={() => onCommandes([{ type: "site.altimetrie.definir", params: { altitude: null } }], "Retirer le repère altimétrique")}>Retirer</button>}
        </form>
      )}
    </details>
  );
}

/**
 * Gestion des calques (D-068, DA-05-01 -a, -b, -f) : créer, renommer, changer la couleur, monter ou descendre,
 * supprimer (un calque qui porte des objets est refusé par la commande : les réaffecter d'abord).
 */
function GererCalques({ etat, onCommandes }: { etat: ModeleAtelier; onCommandes: (commandes: Commande[], label: string) => void }) {
  const calques = Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre);
  const [choixBrut, setChoix] = useState(calques[0]?.id ?? "");
  const [nom, setNom] = useState("");
  const [nouveau, setNouveau] = useState("");
  const choix = etat.calques[choixBrut] ? choixBrut : (calques[0]?.id ?? "");
  const c = etat.calques[choix] ?? null;
  const objets = c ? Object.values(etat.objets).filter((o) => o.calqueId === c.id).length : 0;
  const echanger = (d: -1 | 1) => {
    if (!c) return;
    const i = calques.findIndex((x) => x.id === c.id);
    const autre = calques[i + d];
    if (!autre) return;
    onCommandes([{ type: "calque.modifier", params: { id: c.id, ordre: autre.ordre } }, { type: "calque.modifier", params: { id: autre.id, ordre: c.ordre } }], `Calque ${c.nom} ${d < 0 ? "monté" : "descendu"}`);
  };
  return (
    <details className="nav-gerer-calques" data-gerer-calques>
      <summary>Gérer les calques</summary>
      <form className="nav-formulaire-altimetrie nav-formulaire-calques" onSubmit={(e) => { e.preventDefault(); const n = nouveau.trim(); if (n) { onCommandes([{ type: "calque.creer", params: { nom: n, ordre: calques.reduce((mx, x) => Math.max(mx, x.ordre + 1), 0) } }], `Créer le calque ${n}`); setNouveau(""); } }}>
        <input aria-label="Nom du nouveau calque" placeholder="Nouveau calque" value={nouveau} maxLength={80} onChange={(e) => setNouveau(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-calque-nouveau />
        <button type="submit" disabled={!nouveau.trim()}>Créer</button>
      </form>
      {calques.length > 0 && (
        <div className="nav-formulaire-altimetrie nav-formulaire-calques">
          <select aria-label="Calque à modifier" value={choix} onChange={(e) => { setChoix(e.target.value); setNom(""); }} data-calque-choix>
            {calques.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
          {c && (
            <>
              <input aria-label="Nouveau nom" placeholder={c.nom} value={nom} maxLength={80} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-calque-nom />
              <button type="button" disabled={!nom.trim() || nom.trim() === c.nom} onClick={() => { onCommandes([{ type: "calque.modifier", params: { id: c.id, nom: nom.trim() } }], `Renommer le calque ${c.nom}`); setNom(""); }}>Renommer</button>
              <select aria-label={`Ranger ${c.nom} sous`} value={c.parentId ?? ""} data-calque-parent onChange={(e) => onCommandes([{ type: "calque.modifier", params: { id: c.id, parentId: e.target.value || null } }], e.target.value ? `Ranger le calque ${c.nom} sous ${etat.calques[e.target.value]?.nom ?? e.target.value}` : `Calque ${c.nom} à la racine`)}>
                <option value="">à la racine</option>
                {calques.filter((x) => x.id !== c.id && !descendantsCalque(etat, c.id).includes(x.id)).map((x) => <option key={x.id} value={x.id}>sous {x.nom}</option>)}
              </select>
              <input type="color" aria-label={`Couleur de ${c.nom}`} value={/^#[0-9a-f]{6}$/i.test(c.couleur ?? "") ? c.couleur! : "#355e52"} onChange={(e) => onCommandes([{ type: "calque.modifier", params: { id: c.id, couleur: e.target.value } }], `Couleur du calque ${c.nom}`)} />
              <button type="button" title="Monter" onClick={() => echanger(-1)} disabled={calques[0]?.id === c.id}>↑<span className="sr-only">Monter {c.nom}</span></button>
              <button type="button" title="Descendre" onClick={() => echanger(1)} disabled={calques[calques.length - 1]?.id === c.id}>↓<span className="sr-only">Descendre {c.nom}</span></button>
              <ProprietesCible cible={{ calqueCible: c.id }} proprietes={c.proprietes} readOnly={false} onCommandes={onCommandes} libelle={`calque « ${c.nom} »`} />
              <button type="button" data-calque-supprimer disabled={objets > 0} title={objets ? `${objets} objet(s) sur ce calque : les réaffecter d'abord` : "Supprimer le calque"} onClick={() => onCommandes([{ type: "calque.supprimer", params: { id: c.id } }], `Supprimer le calque ${c.nom}`)}>
                Supprimer{objets ? ` (${objets} objet(s))` : ""}
              </button>
            </>
          )}
        </div>
      )}
    </details>
  );
}

/** Calques en arbre (D-080) : chaque parent suivi de ses sous-calques, dans l'ordre ; profondeur pour l'indentation. */
function arbreCalques(etat: ModeleAtelier): (ModeleAtelier["calques"][string] & { profondeur: number })[] {
  const tous = Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre || (a.id < b.id ? -1 : 1));
  const out: (ModeleAtelier["calques"][string] & { profondeur: number })[] = [];
  const vus = new Set<string>();
  const poser = (parent: string | undefined, profondeur: number) => {
    for (const c of tous) {
      if ((c.parentId && etat.calques[c.parentId] ? c.parentId : undefined) !== parent || vus.has(c.id)) continue;
      vus.add(c.id);
      out.push({ ...c, profondeur });
      poser(c.id, profondeur + 1);
    }
  };
  poser(undefined, 0);
  for (const c of tous) if (!vus.has(c.id)) out.push({ ...c, profondeur: 0 });
  return out;
}
