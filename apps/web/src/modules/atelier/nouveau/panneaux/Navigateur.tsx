/**
 * Navigateur du projet (cahier §5.7, UX3) : niveaux (choix du niveau actif, création), calques (visibilité et
 * verrouillage = commandes `calque.modifier`, car ils sont dans le modèle), objets du niveau regroupés par classe
 * (clic = sélection, la vue se recentre).
 */
import { useMemo, useState } from "react";
import { CLASSES, ensemblesPartages, niveauxOrdonnes, type Classe, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
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
  const [filtre, setFiltre] = useState("");
  const [nouveauNiveau, setNouveauNiveau] = useState<{ nom: string; elevation: string; source: string } | null>(null);
  const calques = Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre);
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
                <span className="nav-detail">{fmt(n.elevation)} m</span>
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
      </section>

      <section aria-labelledby="nav-calques">
        <h3 id="nav-calques">Calques</h3>
        {calques.length === 0 ? (
          <p className="nav-vide">Aucun calque.</p>
        ) : (
          <ul className="nav-liste nav-calques">
            {calques.map((c) => (
              <li key={c.id}>
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
              </li>
            ))}
          </ul>
        )}
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
 * Ensembles d'affichage (DA-05-03, D-066) : filtres locaux de classes et de calques, enregistrés sur cet appareil ou
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
              <span className="nav-detail">sur cet appareil{e.niveauId && etat.niveaux[e.niveauId] ? ` · ${etat.niveaux[e.niveauId]!.nom}` : ""}</span>
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
