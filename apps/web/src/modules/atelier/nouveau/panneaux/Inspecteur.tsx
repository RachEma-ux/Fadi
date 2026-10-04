/**
 * Inspecteur typé (cahier §5.7, UX3) : paramètres canoniques de l'objet sélectionné, éditables champ par champ ;
 * chaque validation émet une seule commande `<classe>.modifier` (ou `objet.modifier`). Une valeur absente
 * s'affiche « non évaluée » et n'est jamais remplacée par une valeur par défaut. Sans sélection : paramètres de
 * l'outil courant (épaisseur, hauteur…) et informations du niveau.
 */
import { useEffect, useState } from "react";
import { bibliotheques, CLASSES, type Commande, type ModeleAtelier, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { OUTILS_PAR_ID } from "../outils";
import { ChoixPhase, Contraintes, CreerBloc, FicheOccurrenceBloc } from "./Complements";

export interface PropsInspecteur {
  etat: ModeleAtelier;
  ui: EtatUi;
  readOnly: boolean;
  onCommandes: (commandes: Commande[], label: string) => void;
}

/** Libellés des paramètres canoniques (ceux qui ne figurent pas ici gardent leur nom technique). */
const LIBELLES: Record<string, string> = {
  epaisseur: "Épaisseur",
  hauteur: "Hauteur",
  largeur: "Largeur",
  profondeur: "Profondeur",
  allege: "Allège",
  position: "Position sur le mur (0–1)",
  alignement: "Alignement",
  exterieur: "Mur extérieur",
  nom: "Nom",
  code: "Code",
  categorie: "Catégorie",
  contremarches: "Contremarches",
  hauteurAFranchir: "Hauteur à franchir",
  niveauArriveeId: "Niveau d'arrivée",
  niveauDepartId: "Niveau de départ",
  niveauHautId: "Niveau haut",
  texte: "Texte",
  taille: "Taille",
  type: "Type",
  pente: "Pente",
  role: "Rôle",
  forme: "Forme",
  ferme: "Fermé",
  murHoteId: "Mur hôte",
  sens: "Sens d'ouverture",
  rayon: "Rayon",
  angle: "Angle",
  couleur: "Couleur",
  referencePlanSeulement: "Référence de plan seulement",
  remplissage: "Remplissage",
  decalageBase: "Décalage de base",
  echelle: "Échelle",
};

/** Paramètres géométriques édités au plan, pas dans l'inspecteur (on les résume). */
const GEOMETRIQUES = new Set(["a", "b", "contour", "trous", "points", "polygones", "point", "centre", "positionTexte"]);

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(".", ","));

export function Inspecteur({ etat, ui, readOnly, onCommandes }: PropsInspecteur) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  if (sel.length === 0) return <ParametresOutil etat={etat} ui={ui} />;
  if (sel.length > 1) return <SelectionMultiple sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />;
  return <FicheObjet o={sel[0]!} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />;
}

function FicheObjet({ o, etat, readOnly, onCommandes }: { o: OccurrenceQuelconque; etat: ModeleAtelier; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const description = CLASSES[o.classe];
  const calque = o.calqueId ? etat.calques[o.calqueId] : null;
  const verrouille = !!calque?.verrouille;
  const params = o.params as unknown as Record<string, unknown>;
  const problemes = Object.values(etat.problemes).filter((p) => p.objetId === o.id);
  const references = Object.values(etat.references).filter((r) => r.proprietaireId === o.id && r.etat === "a-reparer");
  const modifier = (cle: string, valeur: unknown) => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { [cle]: valeur } } }], `${description.libelle} : ${LIBELLES[cle] ?? cle}`);
  const desactive = readOnly || verrouille;

  return (
    <section className="inspecteur" aria-label={`Inspecteur : ${description.libelle}`}>
      <header className="inspecteur-tete">
        <h3>{description.libelle}{typeof params["nom"] === "string" && params["nom"] ? ` — ${params["nom"] as string}` : ""}</h3>
        <p className="inspecteur-meta">
          <span title="Identifiant stable">{o.id}</span> · IFC <span>{description.ifc}</span>
          {o.niveauId && etat.niveaux[o.niveauId] ? <> · {etat.niveaux[o.niveauId]!.nom}</> : null}
        </p>
      </header>
      {verrouille && <p className="inspecteur-alerte" role="note">Calque « {calque!.nom} » verrouillé : déverrouillez-le dans le navigateur pour modifier cet objet.</p>}
      <dl className="inspecteur-champs">
        <div className="champ">
          <dt><label htmlFor={`calque-${o.id}`}>Calque</label></dt>
          <dd>
            <select id={`calque-${o.id}`} value={o.calqueId ?? ""} disabled={readOnly} onChange={(e) => e.target.value && onCommandes([{ type: "calque.affecter", params: { calqueId: e.target.value }, cibles: [o.id] }], "Changer de calque")}>
              {!o.calqueId && <option value="">Sans calque</option>}
              {Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre).map((c) => (
                <option key={c.id} value={c.id} disabled={c.verrouille}>{c.nom}{c.verrouille ? " (verrouillé)" : ""}</option>
              ))}
            </select>
          </dd>
        </div>
        <ChoixType o={o} etat={etat} desactive={desactive} onCommandes={onCommandes} />
        <ChoixPhase sel={[o]} readOnly={desactive} onCommandes={onCommandes} />
        {Object.entries(params).map(([cle, valeur]) => {
          if (GEOMETRIQUES.has(cle)) return <ResumeGeometrie key={cle} cle={cle} valeur={valeur} />;
          return <Champ key={cle} id={`${o.id}-${cle}`} cle={cle} valeur={valeur} etat={etat} desactive={desactive} onValider={(v) => modifier(cle, v)} />;
        })}
      </dl>
      {o.classe === "bloc-occurrence" && <FicheOccurrenceBloc o={o} etat={etat} />}
      {o.classe === "esquisse" && <Contraintes sel={[o]} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {(o.classe === "esquisse" || o.classe === "solide" || o.classe === "texte") && <CreerBloc sel={[o]} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {Object.keys(o.proprietes).length > 0 && (
        <details className="inspecteur-proprietes">
          <summary>Propriétés ({Object.keys(o.proprietes).length})</summary>
          <dl>
            {Object.entries(o.proprietes).map(([k, p]) => (
              <div key={k} className="champ">
                <dt>{k}</dt>
                <dd>
                  {formatValeur(p.valeur)}{p.unite ? ` ${p.unite}` : ""} <span className={`statut statut-${p.statut}`}>{p.provenance} · {p.statut === "a-verifier" ? "à vérifier" : p.statut === "verifiee" ? "vérifiée" : "déclarée"}</span>
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {references.length > 0 && (
        <div className="inspecteur-references">
          <h4>Références à réparer</h4>
          {references.map((r) => (
            <div key={r.id} className="reference-a-reparer">
              <span>{r.caracteristique ?? "?"} → objet disparu</span>
              {r.propositions.map((pr) => (
                <button key={`${pr.objetId}-${pr.caracteristique}`} type="button" disabled={readOnly} onClick={() => onCommandes([{ type: "reference.reparer", params: { referenceId: r.id, objetId: pr.objetId, caracteristique: pr.caracteristique } }], "Réparer la référence")}>
                  Rattacher à {pr.objetId} ({pr.caracteristique})
                </button>
              ))}
              <button type="button" disabled={readOnly} onClick={() => onCommandes([{ type: "reference.reparer", params: { referenceId: r.id, detacher: true } }], "Détacher la référence")}>Laisser libre</button>
            </div>
          ))}
        </div>
      )}
      {problemes.length > 0 && (
        <ul className="inspecteur-problemes">
          {problemes.map((p) => <li key={p.id}>{p.message}</li>)}
        </ul>
      )}
    </section>
  );
}

/** Paramètres d'un objet recopiés dans un nouveau type (catalogue de types, DA-07-01). */
const PARAMS_DE_TYPE: Partial<Record<string, string[]>> = {
  mur: ["epaisseur", "hauteur", "alignement", "exterieur"],
  porte: ["largeur", "hauteur"],
  fenetre: ["largeur", "hauteur", "allege"],
  ouverture: ["largeur", "hauteur"],
  dalle: ["epaisseur"],
  toiture: ["epaisseur", "type"],
  poteau: ["largeur", "profondeur", "hauteur"],
  escalier: ["largeur"],
};

/** Type (définition du catalogue) de l'occurrence : choisir un type existant ou en créer un depuis l'objet. */
function ChoixType({ o, etat, desactive, onCommandes }: { o: OccurrenceQuelconque; etat: ModeleAtelier; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const types = Object.values(etat.definitions).filter((d) => d.classe === o.classe).sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  const cles = PARAMS_DE_TYPE[o.classe];
  if (!cles && types.length === 0) return null;
  const creer = () => {
    const nom = `${CLASSES[o.classe].libelle} ${types.length + 1}`;
    const id = `type-${o.classe}-${Date.now().toString(36)}`;
    const p = o.params as unknown as Record<string, unknown>;
    const copie = Object.fromEntries((cles ?? []).filter((k) => p[k] !== undefined).map((k) => [k, p[k]]));
    onCommandes([{ type: "type.definir", params: { id, classe: o.classe, nom, params: copie } }, { type: "objet.modifier", params: { id: o.id, definitionId: id } }], `Nouveau type « ${nom} »`);
  };
  return (
    <div className="champ">
      <dt><label htmlFor={`type-${o.id}`}>Type</label></dt>
      <dd>
        <select id={`type-${o.id}`} value={o.definitionId ?? ""} disabled={desactive} onChange={(e) => onCommandes([{ type: "objet.modifier", params: { id: o.id, definitionId: e.target.value || null } }], "Changer de type")}>
          <option value="">Sans type</option>
          {types.map((d) => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        {cles && (
          <button type="button" className="bouton-mini" disabled={desactive} onClick={creer} title="Créer un type à partir de cet objet">
            +<span className="sr-only">Créer un type à partir de cet objet</span>
          </button>
        )}
      </dd>
    </div>
  );
}

function formatValeur(v: unknown): string {
  if (v === null || v === undefined || v === "") return "non évaluée";
  if (typeof v === "number") return fmt(v);
  if (typeof v === "boolean") return v ? "oui" : "non";
  if (typeof v === "object" && v && "value" in v) {
    const g = v as { value: number; unit: string };
    return `${fmt(g.value)} ${g.unit}`;
  }
  return typeof v === "string" ? v : JSON.stringify(v);
}

function ResumeGeometrie({ cle, valeur }: { cle: string; valeur: unknown }) {
  let resume = "";
  if (Array.isArray(valeur)) resume = `${valeur.length} ${cle === "polygones" ? "polygone(s)" : cle === "trous" ? "trou(s)" : "point(s)"}`;
  else if (valeur && typeof valeur === "object" && "x" in valeur) {
    const p = valeur as { x: number; y: number };
    resume = `x ${fmt(p.x)} · y ${fmt(p.y)} m`;
  } else resume = formatValeur(valeur);
  return (
    <div className="champ champ-lecture">
      <dt>{LIBELLES[cle] ?? cle}</dt>
      <dd>{resume}</dd>
    </div>
  );
}

const ENUMS: Record<string, string[]> = {
  alignement: ["axe", "gauche", "droite"],
  type: ["plate", "monopente", "bipente"],
  remplissage: ["barreaudage", "plein", "vitre"],
};

/** Champ éditable selon la forme de la valeur : grandeur {value, unit}, nombre, texte, booléen, niveau, énumération. */
function Champ({ id, cle, valeur, etat, desactive, onValider }: { id: string; cle: string; valeur: unknown; etat: ModeleAtelier; desactive: boolean; onValider: (v: unknown) => void }) {
  const libelle = LIBELLES[cle] ?? cle;
  const estGrandeur = !!valeur && typeof valeur === "object" && "value" in (valeur as object) && "unit" in (valeur as object);
  const unite = estGrandeur ? (valeur as { unit: string }).unit : null;
  const brut = estGrandeur ? (valeur as { value: number }).value : valeur;
  const [texte, setTexte] = useState(brut === null || brut === undefined ? "" : typeof brut === "number" ? String(brut).replace(".", ",") : String(brut));
  useEffect(() => setTexte(brut === null || brut === undefined ? "" : typeof brut === "number" ? String(brut).replace(".", ",") : String(brut)), [brut]);

  if (typeof valeur === "boolean") {
    return (
      <div className="champ">
        <dt><label htmlFor={id}>{libelle}</label></dt>
        <dd><input id={id} type="checkbox" checked={valeur} disabled={desactive} onChange={(e) => onValider(e.target.checked)} /></dd>
      </div>
    );
  }
  if (cle.startsWith("niveau") && cle.endsWith("Id")) {
    return (
      <div className="champ">
        <dt><label htmlFor={id}>{libelle}</label></dt>
        <dd>
          <select id={id} value={(valeur as string | null) ?? ""} disabled={desactive} onChange={(e) => onValider(e.target.value || null)}>
            <option value="">non renseigné</option>
            {Object.values(etat.niveaux).sort((a, b) => a.ordre - b.ordre).map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
          </select>
        </dd>
      </div>
    );
  }
  if (ENUMS[cle] && typeof valeur === "string") {
    return (
      <div className="champ">
        <dt><label htmlFor={id}>{libelle}</label></dt>
        <dd>
          <select id={id} value={valeur} disabled={desactive} onChange={(e) => onValider(e.target.value)}>
            {ENUMS[cle]!.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </dd>
      </div>
    );
  }
  const numerique = estGrandeur || typeof valeur === "number" || (valeur === null && ["hauteur", "pente", "allege"].includes(cle));
  const editable = numerique || typeof valeur === "string" || (valeur === null && ["nom", "code", "categorie"].includes(cle));
  if (!editable) {
    return (
      <div className="champ champ-lecture">
        <dt>{libelle}</dt>
        <dd>{formatValeur(valeur)}</dd>
      </div>
    );
  }
  const valider = () => {
    const t = texte.trim();
    if (numerique) {
      if (t === "") {
        // Vider un champ facultatif le remet à « non évaluée » ; jamais une valeur inventée.
        if (valeur === null || cle === "hauteur") onValider(null);
        return;
      }
      const n = Number(t.replace(",", "."));
      if (!Number.isFinite(n)) return;
      onValider(estGrandeur || valeur === null ? { value: n, unit: unite ?? "m" } : n);
    } else onValider(t === "" ? null : t);
  };
  const inchange = numerique ? Number(texte.replace(",", ".")) === brut || (texte === "" && brut === null) : texte === (brut ?? "");
  return (
    <div className="champ">
      <dt><label htmlFor={id}>{libelle}</label></dt>
      <dd>
        <input
          id={id}
          type="text"
          inputMode={numerique ? "decimal" : "text"}
          value={texte}
          placeholder={brut === null ? "non évaluée" : undefined}
          disabled={desactive}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={() => !inchange && valider()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (!inchange) valider();
            }
            if (e.key === "Escape") {
              // Échap : on rend la main au dessin (saisie validée si elle a changé, au blur) — les raccourcis reprennent.
              e.preventDefault();
              e.currentTarget.blur();
            }
            e.stopPropagation();
          }}
        />
        {unite && <span className="unite">{unite}</span>}
      </dd>
    </div>
  );
}

function SelectionMultiple({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const parClasse = new Map<string, number>();
  for (const o of sel) parClasse.set(o.classe, (parClasse.get(o.classe) ?? 0) + 1);
  return (
    <section className="inspecteur" aria-label="Inspecteur : sélection multiple">
      <header className="inspecteur-tete">
        <h3>{sel.length} objets sélectionnés</h3>
      </header>
      <ul className="inspecteur-compte">
        {[...parClasse].map(([c, n]) => <li key={c}>{CLASSES[c as keyof typeof CLASSES]?.libelle ?? c} : {n}</li>)}
      </ul>
      <div className="champ">
        <label htmlFor="calque-multiple">Affecter au calque</label>
        <select id="calque-multiple" value="" disabled={readOnly} onChange={(e) => e.target.value && onCommandes([{ type: "calque.affecter", params: { calqueId: e.target.value }, cibles: sel.map((o) => o.id) }], `Changer de calque (${sel.length})`)}>
          <option value="">Choisir…</option>
          {Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre).map((c) => <option key={c.id} value={c.id} disabled={c.verrouille}>{c.nom}</option>)}
        </select>
      </div>
      <dl className="inspecteur-champs">
        <ChoixPhase sel={sel} readOnly={readOnly} onCommandes={onCommandes} />
      </dl>
      <Contraintes sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <CreerBloc sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
    </section>
  );
}

/** Bibliothèques : choix du bloc ou du composant à placer (consultation, sans commande). */
function ChoixBloc({ etat, ui }: { etat: ModeleAtelier; ui: EtatUi }) {
  const [recherche, setRecherche] = useState("");
  const groupes = bibliotheques(etat, recherche);
  const choisi = ui.parametresOutil["definitionBloc"] as string | undefined;
  return (
    <div className="choix-bloc">
      <label htmlFor="recherche-bloc">Rechercher dans les bibliothèques</label>
      <input id="recherche-bloc" value={recherche} onChange={(e) => setRecherche(e.target.value)} onKeyDown={(e) => e.stopPropagation()} placeholder="nom, bibliothèque, classification" />
      {groupes.length === 0 && <p className="inspecteur-aide">Aucun bloc : sélectionnez des esquisses ou des solides et « Créer un bloc ou un composant ».</p>}
      {groupes.map((g) => (
        <fieldset key={g.nom}>
          <legend>{g.nom}</legend>
          {g.definitions.map((d) => (
            <label key={d.id} className="case">
              <input type="radio" name="definition-bloc" value={d.id} checked={choisi === d.id} onChange={() => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, definitionBloc: d.id } }))} />
              {d.nom} <span className="inspecteur-aide">{d.nature} · v{d.version} · {d.occurrences} occurrence(s)</span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}

/** Paramètres de l'outil courant (persistés dans les préférences d'affichage, jamais dans le modèle). */
const PARAMS_OUTIL: Record<string, { cle: string; libelle: string; unite?: string }[]> = {
  mur: [{ cle: "epaisseur", libelle: "Épaisseur", unite: "m" }, { cle: "hauteur", libelle: "Hauteur", unite: "m" }],
  porte: [{ cle: "largeurOuverture", libelle: "Largeur", unite: "m" }, { cle: "hauteurOuverture", libelle: "Hauteur", unite: "m" }],
  fenetre: [{ cle: "largeurOuverture", libelle: "Largeur", unite: "m" }, { cle: "hauteurOuverture", libelle: "Hauteur", unite: "m" }, { cle: "allege", libelle: "Allège", unite: "m" }],
  ouverture: [{ cle: "largeurOuverture", libelle: "Largeur", unite: "m" }, { cle: "hauteurOuverture", libelle: "Hauteur", unite: "m" }],
  dalle: [{ cle: "epaisseurDalle", libelle: "Épaisseur", unite: "m" }],
  toiture: [{ cle: "epaisseurDalle", libelle: "Épaisseur", unite: "m" }, { cle: "penteToiture", libelle: "Pente (0 = plate)", unite: "°" }],
  "garde-corps": [{ cle: "hauteurGardeCorps", libelle: "Hauteur", unite: "m" }, { cle: "epaisseurGardeCorps", libelle: "Épaisseur", unite: "m" }],
  escalier: [{ cle: "largeurEscalier", libelle: "Largeur", unite: "m" }],
  poteau: [{ cle: "taille", libelle: "Section", unite: "m" }, { cle: "hauteur", libelle: "Hauteur", unite: "m" }],
  solide: [{ cle: "hauteurSolide", libelle: "Hauteur d'extrusion", unite: "m" }],
  extruder: [{ cle: "hauteurSolide", libelle: "Hauteur d'extrusion", unite: "m" }],
  decaler: [{ cle: "distanceDecalage", libelle: "Distance", unite: "m" }],
  bloc: [{ cle: "angleBloc", libelle: "Angle", unite: "°" }],
  repeter: [{ cle: "repetitions", libelle: "Nombre de copies" }, { cle: "pasX", libelle: "Pas en x", unite: "m" }, { cle: "pasY", libelle: "Pas en y", unite: "m" }],
  raccorder: [{ cle: "rayon", libelle: "Rayon", unite: "m" }],
  chanfreiner: [{ cle: "distanceChanfrein", libelle: "Distance", unite: "m" }],
};

function ParametresOutil({ etat, ui }: { etat: ModeleAtelier; ui: EtatUi }) {
  const outil = OUTILS_PAR_ID[ui.outil];
  const champs = PARAMS_OUTIL[ui.outil] ?? [];
  const niveau = ui.niveauId ? etat.niveaux[ui.niveauId] : null;
  return (
    <section className="inspecteur" aria-label="Inspecteur : outil courant">
      <header className="inspecteur-tete">
        <h3>{outil ? `${outil.picto} ${outil.libelle}` : "Aucun outil"}</h3>
        {outil && <p className="inspecteur-aide">{outil.aide}</p>}
        {outil && <p className="inspecteur-exemple">Exemple : {outil.exemple}</p>}
      </header>
      {champs.length > 0 && (
        <dl className="inspecteur-champs">
          {champs.map((c) => {
            const v = ui.parametresOutil[c.cle];
            return (
              <div key={c.cle} className="champ">
                <dt><label htmlFor={`outil-${c.cle}`}>{c.libelle}</label></dt>
                <dd>
                  <input
                    id={`outil-${c.cle}`}
                    type="number"
                    step="any"
                    min={0}
                    value={typeof v === "number" ? v : ""}
                    placeholder="non renseigné"
                    onChange={(e) => {
                      const n = e.target.valueAsNumber;
                      etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, [c.cle]: Number.isFinite(n) ? n : undefined } }));
                    }}
                    onKeyDown={(e) => e.stopPropagation()}
                  />
                  {c.unite && <span className="unite">{c.unite}</span>}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
      {ui.outil === "toiture" && (
        <div className="champ">
          <label htmlFor="outil-type-toiture">Type (si pente)</label>
          <select id="outil-type-toiture" value={(ui.parametresOutil["typeToiture"] as string | undefined) ?? "bipente"} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, typeToiture: e.target.value } }))}>
            <option value="bipente">Bipente (faîtage parallèle au premier côté)</option>
            <option value="monopente">Monopente (égout sur le premier côté)</option>
          </select>
        </div>
      )}
      {ui.outil === "garde-corps" && (
        <div className="champ">
          <label htmlFor="outil-remplissage">Remplissage</label>
          <select id="outil-remplissage" value={(ui.parametresOutil["remplissageGardeCorps"] as string | undefined) ?? "barreaudage"} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, remplissageGardeCorps: e.target.value } }))}>
            <option value="barreaudage">Barreaudage</option>
            <option value="plein">Plein</option>
            <option value="vitre">Vitré</option>
          </select>
        </div>
      )}
      {ui.outil === "bloc" && <ChoixBloc etat={etat} ui={ui} />}
      {ui.outil === "mur" && Object.keys(etat.calques).length > 0 && (
        <div className="champ">
          <label htmlFor="outil-calque">Calque des nouveaux murs</label>
          <select id="outil-calque" value={(ui.parametresOutil["calqueId"] as string | undefined) ?? ""} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, calqueId: e.target.value || null } }))}>
            <option value="">Calque par défaut</option>
            {Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre).map((c) => <option key={c.id} value={c.id} disabled={c.verrouille}>{c.nom}</option>)}
          </select>
        </div>
      )}
      {niveau && (
        <p className="inspecteur-niveau">
          Niveau actif : <strong>{niveau.nom}</strong> · altitude {fmt(niveau.elevation)} m · hauteur {niveau.hauteur === null ? "non évaluée" : `${fmt(niveau.hauteur)} m`}
        </p>
      )}
    </section>
  );
}
