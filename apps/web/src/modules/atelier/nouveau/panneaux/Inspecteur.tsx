/**
 * Inspecteur typé (cahier §5.7, UX3) : paramètres canoniques de l'objet sélectionné, éditables champ par champ ;
 * chaque validation émet une seule commande `<classe>.modifier` (ou `objet.modifier`). Une valeur absente
 * s'affiche « non évaluée » et n'est jamais remplacée par une valeur par défaut. Sans sélection : paramètres de
 * l'outil courant (épaisseur, hauteur…) et informations du niveau.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../../../lib/api";
import { aire, chaineFermee, etendueEspace, niveauxTraverses, niveauxOrdonnes, cleTremie, bibliotheques, reconnaitreForme, pointsSpline, proposerPlancher, MOTIFS_HACHURE, MOTIF_HACHURE_DEFAUT, CLASSES, contourFerme, longueurSaisie, nombreSaisi, objetsSemblables, raisonVerrou, commandesNumerotationPieces, syntheseZone, compositionMur, FONCTIONS_COUCHE, type Commande, type CoucheParoi, type OuvrantPorte, type FonctionCouche, type ModeleAtelier, type Occurrence, type OccurrenceQuelconque } from "@parcours/atelier-model";
import { etatUi, type EtatUi } from "../etat-ui";
import { EditeurProfilVertical } from "./ProfilVertical";
import { ContrainteVerticale, PosesObjet } from "./Poses";
import { OUTILS_PAR_ID } from "../outils";
import { ChoixPhase, ChoixVerrou, Classification, Contraintes, CreerBloc, FicheOccurrenceBloc } from "./Complements";
import { FicheSolideExact, OutilSolideExact } from "./SolideExact";
import { FicheAssemblage, FicheLiaison, FichePieceMecanique, OutilAssemblage, OutilLiaison, OutilPieceMecanique } from "./Mecanique";
import { FicheArmature, FicheAssemblageStructurel, FicheCoulage, FichePlaque, FichePoutre, FicheSoudure, FicheTrame, OutilArmature, OutilAssemblageStructurel, OutilCoulage, OutilPlaque, OutilPoutre, OutilSoudure, OutilTrame } from "./Structure";
import { FicheAssemblageBois, FicheElementBois, FicheOssature, FichePanneauClt, OutilAssemblageBois, OutilElementBois, OutilOssature, OutilPanneauClt } from "./Bois";
import { FicheTole, OutilTole } from "./Tolerie";
import { FicheReseau, FicheSupportReseau, OutilConnexionReseau, OutilEquipementReseau, OutilRaccordReseau, OutilSegmentReseau, OutilSpecificationReseau, OutilSupportReseau, OutilVanne } from "./Reseaux";
import { LOCALE } from "../../../../lib/i18n";

export interface PropsInspecteur {
  etat: ModeleAtelier;
  ui: EtatUi;
  readOnly: boolean;
  onCommandes: (commandes: Commande[], label: string) => void;
  /** Projet (historique d'un objet, DA-21-06) ; absent dans les tests. */
  projectId?: string;
}

/** Libellés des paramètres canoniques (ceux qui ne figurent pas ici gardent leur nom technique). */
const LIBELLES: Record<string, string> = {
  ifcClasse: "Classe IFC d'origine",
  globalId: "GlobalId d'origine",
  source: "Fichier source",
  maillage: "Maillage",
  empreinte: "Emprise",
  epaisseur: "Épaisseur",
  hauteur: "Hauteur",
  usage: "Usage",
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
const GEOMETRIQUES = new Set(["a", "b", "contour", "trous", "points", "polygones", "point", "centre", "positionTexte", "maillage", "empreinte", "ifcClasse", "globalId", "source", "brep", "emprise", "operation", "empreinteBrep", "moteur", "versionMoteur", "volume", "aire", "faces", "position"]);

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(".", ","));

export function Inspecteur(props: PropsInspecteur) {
  const { etat, ui } = props;
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  if (sel.length === 0) return <ParametresOutil etat={etat} ui={ui} readOnly={props.readOnly} onCommandes={props.onCommandes} />;
  // Outil qui agit sur la sélection (répéter, décaler, réseau sur trajectoire…) avec des paramètres : ses champs
  // restent accessibles au-dessus de la sélection (D-058). Les outils de dessin gardent l'inspecteur de la sélection.
  // Outils des ontologies activables (P2-2 à P2-5) : leur panneau (formulaire) agit sur la sélection ou s'en sert
  // (polyligne à router, objets à connecter), il reste visible au-dessus d'elle.
  if (ui.outil !== "selection" && (((OUTILS_PAR_ID[ui.outil]?.condition ?? "").startsWith("selection") && (PARAMS_OUTIL[ui.outil]?.length ?? 0) > 0) || !!OUTILS_PAR_ID[ui.outil]?.ontologie)) {
    return (
      <>
        <ParametresOutil etat={etat} ui={ui} readOnly={props.readOnly} onCommandes={props.onCommandes} />
        <InspecteurSelection {...props} />
      </>
    );
  }
  return <InspecteurSelection {...props} />;
}

function InspecteurSelection({ etat, ui, readOnly, onCommandes, projectId }: PropsInspecteur) {
  const sel = ui.selection.map((id) => etat.objets[id]).filter((o): o is OccurrenceQuelconque => !!o);
  if (sel.length > 1) return <SelectionMultiple sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />;
  return (
    <>
      <FicheObjet o={sel[0]!} etat={etat} readOnly={readOnly} onCommandes={onCommandes}  projectId={projectId} />
      {projectId && sel[0]!.classe === "piece" && <EspaceProgramme key={`prog-${sel[0]!.id}`} projectId={projectId} pieceId={`${sel[0]!.niveauId}|${sel[0]!.id}`} readOnly={readOnly} />}
      {projectId && <HistoriqueObjet key={sel[0]!.id} projectId={projectId} objetId={sel[0]!.id} />}
    </>
  );
}

function FicheObjet({ o, etat, readOnly, onCommandes, projectId }: { o: OccurrenceQuelconque; etat: ModeleAtelier; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"]; projectId?: string }) {
  const description = CLASSES[o.classe];
  const calque = o.calqueId ? etat.calques[o.calqueId] : null;
  const verrouille = !!calque?.verrouille;
  const params = o.params as unknown as Record<string, unknown>;
  const problemes = Object.values(etat.problemes).filter((p) => p.objetId === o.id);
  const references = Object.values(etat.references).filter((r) => r.proprietaireId === o.id && r.etat === "a-reparer");
  const modifier = (cle: string, valeur: unknown) => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { [cle]: valeur } } }], `${description.libelle} : ${LIBELLES[cle] ?? cle}`);
  // Verrou de l'objet ou de son groupe (D-052) : champs figés, le verrou lui-même reste modifiable.
  const verrouObjet = raisonVerrou(etat, o);
  const desactive = readOnly || verrouille || !!verrouObjet;
  // Représentation importée (R16) : paramètres en lecture seule ; calque, phase et transformations restent possibles.
  const STRUCTURE = ["poutre", "trame", "plaque", "assemblage-structurel", "soudure", "armature", "coulage", "element-bois", "ossature", "panneau-clt", "assemblage-bois", "tole", "segment-reseau", "raccord-reseau", "vanne", "equipement-reseau", "support-reseau"];
  const parametresFiges = desactive || o.classe === "objet-importe" || o.classe === "solide-exact" || o.classe === "piece-mecanique" || o.classe === "liaison" || STRUCTURE.includes(o.classe);

  return (
    <section className="inspecteur" aria-label={`Inspecteur : ${description.libelle}`}>
      <header className="inspecteur-tete">
        <h3>{description.libelle}{typeof params["nom"] === "string" && params["nom"] ? ` — ${params["nom"] as string}` : ""}</h3>
        <p className="inspecteur-meta">
          <span title="Identifiant stable">{o.id}</span> · IFC <span>{o.classe === "objet-importe" ? `${o.params.ifcClasse} (importé)` : description.ifc}</span>
          {o.niveauId && etat.niveaux[o.niveauId] ? <> · {etat.niveaux[o.niveauId]!.nom}</> : null}
        </p>
      </header>
      {verrouille && <p className="inspecteur-alerte" role="note">Calque « {calque!.nom} » verrouillé : déverrouillez-le dans le navigateur pour modifier cet objet.</p>}
      {verrouObjet && <p className="inspecteur-alerte" role="note" data-verrou-objet>{verrouObjet === "objet verrouillé" ? "Objet verrouillé" : `Objet ${verrouObjet}`} : déverrouillez-le pour le modifier, le déplacer ou le supprimer.</p>}
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
        <ChoixVerrou sel={[o]} readOnly={readOnly || verrouille} onCommandes={onCommandes} />
        {Object.entries(avecFacultatifs(o.classe, params)).map(([cle, valeur]) => {
          if (cle === "ouvrant" || cle === "menuiserie" || (cle === "murHoteId" && (o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture"))) return null; // contrôles dédiés ci-dessous
          if (cle === "motif" && !(o.classe === "esquisse" && o.params.forme === "hachure")) return null; // motif : hachures seulement (D-072)
          if (cle === "degrade" || cle === "motifLignes") return null; // dégradé (D-120), lignes de motif importé (D-121)
          if (o.classe === "poteau" && (cle === "formeId" || cle === "epaisseurProfil")) return null; // section : contrôle dédié (D-139)
          if (o.classe === "dalle" && cle === "pente") return null; // pente : contrôle dédié (D-140)
          if (cle === "axeDe") {
            const ax = valeur as { sourceId: string; angle: number } | null;
            return ax ? (
              <div className="champ" key={cle} data-axe-associe={ax.sourceId}>
                <dt>Axe associé</dt>
                <dd>
                  centre de {ax.sourceId} ({String(ax.angle).replace(".", ",")}°){" "}
                  {!desactive && <button type="button" className="lien" onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { axeDe: null } } }], `Axe ${o.id} détaché`)}>Détacher</button>}
                </dd>
              </div>
            ) : null;
          }
          if (cle === "motif" && o.classe === "esquisse" && (o as Occurrence<"esquisse">).params.motifLignes) {
            const n = (o as Occurrence<"esquisse">).params.motifLignes!.length;
            return (
              <div className="champ" key={cle} data-motif-importe>
                <dt>Motif de hachure</dt>
                <dd>
                  « {String(valeur ?? "sans nom")} » importé : {n} ligne(s) de définition, pas en mètres du dessin.{" "}
                  {!desactive && <button type="button" className="lien" data-motif-catalogue onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { motif: null, motifLignes: null } } }], `Motif du catalogue pour ${o.id}`)}>Revenir au catalogue</button>}
                </dd>
              </div>
            );
          }
          if (GEOMETRIQUES.has(cle)) return <ResumeGeometrie key={cle} cle={cle} valeur={valeur} />;
          return <Champ key={cle} id={`${o.id}-${cle}`} cle={cle} valeur={valeur} etat={etat} desactive={parametresFiges} onValider={(v) => modifier(cle, v)} />;
        })}
      </dl>
      {(o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && <OuvertureHote o={o as Occurrence<"porte">} etat={etat} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "esquisse" && (o as Occurrence<"esquisse">).params.forme === "hachure" && <DegradeHachure key={`deg-${o.id}`} o={o as Occurrence<"esquisse">} desactive={desactive} onCommandes={onCommandes} />}
      {(o.classe === "fenetre" || o.classe === "porte") && <MenuiserieFenetre key={`men-${o.id}`} o={o as Occurrence<"fenetre">} desactive={desactive} onCommandes={onCommandes} />}
      {(o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && !desactive && <JumelerOuverture key={`jum-${o.id}`} o={o as Occurrence<"porte">} onCommandes={onCommandes} />}
      <GroupeSelection sel={[o]} etat={etat} readOnly={readOnly || verrouille} onCommandes={onCommandes} />
      {/* Sélection des semblables (D-134) : même classe et même type, sur ce niveau ou sur tous. */}
      <p className="inspecteur-aide" data-semblables>
        Sélectionner les semblables :{" "}
        <button type="button" className="lien" data-semblables-niveau onClick={() => { const ids = objetsSemblables(etat, o.id); etatUi.selectionner(ids); etatUi.set({ aide: `${ids.length} objet(s) semblable(s) sur ce niveau.` }); }}>ce niveau</button>
        {" · "}
        <button type="button" className="lien" data-semblables-tous onClick={() => { const ids = objetsSemblables(etat, o.id, { tousNiveaux: true }); etatUi.selectionner(ids); etatUi.set({ aide: `${ids.length} objet(s) semblable(s) sur ${new Set(ids.map((i) => etat.objets[i]?.niveauId)).size} niveau(x) : les transformations s'appliquent à tous.` }); }}>tous les niveaux</button>
      </p>
      <Classification key={`classif-${o.id}`} sel={[o]} etat={etat} readOnly={desactive} onCommandes={onCommandes} />
      {!(o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && o.niveauId && <VersNiveau sel={[o]} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "zone" && <SyntheseZoneVue o={o as Occurrence<"zone">} etat={etat} desactive={desactive} onCommandes={onCommandes} />}
      {(o.classe === "esquisse" || o.classe === "dalle" || o.classe === "piece" || o.classe === "zone") && !desactive && contourFerme(o) && <ChangerClasseContour key={`cc-${o.id}`} o={o} onCommandes={onCommandes} />}
      {(o.classe === "dalle" || o.classe === "piece" || o.classe === "zone" || (o.classe === "esquisse" && (o as Occurrence<"esquisse">).params.forme !== "hachure")) && !desactive && contourFerme(o) && (
        <button type="button" className="lien" data-hachurer={o.id} onClick={() => onCommandes([{ type: "esquisse.hachure", params: { niveauId: o.niveauId, calqueId: o.calqueId, points: contourFerme(o)!.contour, sourceId: o.id } }], `Hachure associée à ${o.id}`)}>
          Hachurer (associé au contour)
        </button>
      )}
      {o.classe === "esquisse" && (o as Occurrence<"esquisse">).params.centre && (o as Occurrence<"esquisse">).params.rayon && !desactive && <AxesCentre key={`axes-${o.id}`} o={o as Occurrence<"esquisse">} onCommandes={onCommandes} />}
      {(o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture") && <CintreBaie key={`cintre-${o.id}`} o={o as Occurrence<"fenetre">} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "espace" && <EspaceNiveaux key={`espn-${o.id}`} o={o as Occurrence<"espace">} etat={etat} desactive={desactive} onCommandes={onCommandes} />}
      {(o.classe === "mur" || o.classe === "esquisse" || (o.classe === "solide" && !!(o as Occurrence<"solide">).params.profilVertical)) && <EditeurProfilVertical key={`pv-${o.id}`} etat={etat} o={o} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "solide" && (o as Occurrence<"solide">).params.ferme && !(o as Occurrence<"solide">).params.profilVertical && <FormeSolide key={`forme-${o.id}`} o={o as Occurrence<"solide">} desactive={desactive} onCommandes={onCommandes} />}
      <PosesObjet o={o} etat={etat} readOnly={desactive} onCommandes={onCommandes} />
      {o.classe === "texte" && <OrientationTexte key={`orient-${o.id}`} o={o as Occurrence<"texte">} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "dalle" && <SensRetombeeDalle key={`retombee-${o.id}`} o={o as Occurrence<"dalle">} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "dalle" && <PenteDalle key={`pente-${o.id}`} o={o as Occurrence<"dalle">} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "poteau" && <SectionPoteau key={`sec-${o.id}`} o={o as Occurrence<"poteau">} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "escalier" && !desactive && <TremieEscalier o={o as Occurrence<"escalier">} etat={etat} onCommandes={onCommandes} />}
      {o.classe === "esquisse" && !desactive && ["polyligne", "polygone", "rectangle"].includes((o as Occurrence<"esquisse">).params.forme) && <ArrondirSommets key={`arr-${o.id}`} o={o as Occurrence<"esquisse">} onCommandes={onCommandes} />}
      {o.classe === "esquisse" && !desactive && <ConvertirEsquisse o={o as Occurrence<"esquisse">} onCommandes={onCommandes} />}
      {o.classe === "esquisse" && !desactive && (o as Occurrence<"esquisse">).params.forme === "spline" && <TangentesCourbe key={`tan-${o.id}`} o={o as Occurrence<"esquisse">} onCommandes={onCommandes} />}
      {o.classe === "esquisse" && !desactive && ["polyligne", "spline"].includes((o as Occurrence<"esquisse">).params.forme) && <ReconnaitreForme key={`rec-${o.id}`} o={o as Occurrence<"esquisse">} onCommandes={onCommandes} />}
      {o.classe === "mur" && !desactive && <ScinderEnParts o={o as Occurrence<"mur">} onCommandes={onCommandes} />}
      {o.classe === "mur" && <CompositionParoi o={o as Occurrence<"mur">} etat={etat} desactive={desactive} onCommandes={onCommandes} />}
      {o.classe === "bloc-occurrence" && <FicheOccurrenceBloc o={o} etat={etat} />}
      {o.classe === "solide-exact" && projectId && <FicheSolideExact o={o} projectId={projectId} />}
      {o.classe === "piece-mecanique" && <FichePieceMecanique o={o as Occurrence<"piece-mecanique">} etat={etat} />}
      {o.classe === "assemblage" && <FicheAssemblage o={o as Occurrence<"assemblage">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "liaison" && <FicheLiaison o={o as Occurrence<"liaison">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "poutre" && <FichePoutre o={o as Occurrence<"poutre">} etat={etat} />}
      {o.classe === "trame" && <FicheTrame key={`trame-${o.id}`} o={o as Occurrence<"trame">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "plaque" && <FichePlaque o={o as Occurrence<"plaque">} />}
      {o.classe === "assemblage-structurel" && <FicheAssemblageStructurel o={o as Occurrence<"assemblage-structurel">} etat={etat} />}
      {o.classe === "soudure" && <FicheSoudure o={o as Occurrence<"soudure">} etat={etat} />}
      {o.classe === "armature" && <FicheArmature o={o as Occurrence<"armature">} etat={etat} />}
      {o.classe === "coulage" && <FicheCoulage o={o as Occurrence<"coulage">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "element-bois" && <FicheElementBois o={o as Occurrence<"element-bois">} etat={etat} />}
      {o.classe === "ossature" && <FicheOssature key={`oss-${o.id}`} o={o as Occurrence<"ossature">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "panneau-clt" && <FichePanneauClt o={o as Occurrence<"panneau-clt">} />}
      {o.classe === "assemblage-bois" && <FicheAssemblageBois o={o as Occurrence<"assemblage-bois">} etat={etat} />}
      {o.classe === "tole" && <FicheTole o={o as Occurrence<"tole">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {(o.classe === "segment-reseau" || o.classe === "raccord-reseau" || o.classe === "vanne" || o.classe === "equipement-reseau") && <FicheReseau o={o as Occurrence<"segment-reseau">} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
      {o.classe === "support-reseau" && <FicheSupportReseau o={o as Occurrence<"support-reseau">} etat={etat} />}
      {(o.classe === "esquisse" || (o.classe === "mur" && !(o as Occurrence<"mur">).params.renflement)) && <Contraintes sel={[o]} etat={etat} readOnly={desactive} onCommandes={onCommandes} />}
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
        {o.definitionId && etat.definitions[o.definitionId] && <GererType o={o} etat={etat} types={types} desactive={desactive} onCommandes={onCommandes} />}
      </dd>
    </div>
  );
}

/** Type de l'objet : le remplacer partout par un autre, ou le supprimer (objets détachés, paramètres inchangés ; D-044). */
function GererType({ o, etat, types, desactive, onCommandes }: { o: OccurrenceQuelconque; etat: ModeleAtelier; types: { id: string; nom: string }[]; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const d = etat.definitions[o.definitionId!]!;
  const n = Object.values(etat.objets).filter((x) => x.definitionId === d.id).length;
  const autres = types.filter((t) => t.id !== d.id);
  return (
    <details className="inspecteur-gerer-type">
      <summary>Gérer le type « {d.nom} » ({n} objet{n > 1 ? "s" : ""})</summary>
      {autres.length > 0 && (
        <label>
          Remplacer partout par
          <select value="" disabled={desactive} data-type-action="substituer" onChange={(e) => e.target.value && onCommandes([{ type: "definition.substituer", params: { ancienne: d.id, nouvelle: e.target.value } }], `Remplacer le type « ${d.nom} » partout`)}>
            <option value="">Choisir…</option>
            {autres.map((t) => <option key={t.id} value={t.id}>{t.nom}</option>)}
          </select>
        </label>
      )}
      <button type="button" disabled={desactive} data-type-action="supprimer" onClick={() => onCommandes([{ type: "definition.supprimer", params: { id: d.id, detacher: true } }], `Supprimer le type « ${d.nom} » (${n} objet${n > 1 ? "s" : ""} sans type)`)}>
        Supprimer le type (objets gardés, sans type)
      </button>
    </details>
  );
}

const FONCTION_LIBELLE: Record<FonctionCouche, string> = { porteur: "porteur", isolant: "isolant", etancheite: "étanchéité", parement: "parement", "lame-air": "lame d'air", autre: "autre" };

/**
 * Composition de la paroi (D-026) : les couches du type du mur, de la face gauche à la face droite ; modifier les
 * couches modifie le type (tous ses murs). Rien n'est supposé : sans couches, la composition est « non renseignée ».
 */
function CompositionParoi({ o, etat, desactive, onCommandes }: { o: Occurrence<"mur">; etat: ModeleAtelier; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const type = o.definitionId ? etat.definitions[o.definitionId] : undefined;
  const actuelles = (type?.params["couches"] as CoucheParoi[] | undefined) ?? [];
  const [lignes, setLignes] = useState(() => actuelles.map((c) => ({ materiau: c.materiau, epaisseur: fmt(c.epaisseur.value * 1000), fonction: c.fonction ?? "" })));
  const [erreur, setErreur] = useState<string | null>(null);
  const cle = JSON.stringify(actuelles);
  useEffect(() => setLignes(actuelles.map((c) => ({ materiau: c.materiau, epaisseur: fmt(c.epaisseur.value * 1000), fonction: c.fonction ?? "" }))), [cle]); // eslint-disable-line react-hooks/exhaustive-deps
  const composition = compositionMur(etat, o);
  const nbMurs = type ? Object.values(etat.objets).filter((x) => x.definitionId === type.id).length : 0;
  if (!type) return <p className="inspecteur-note">Composition : donnez un type à ce mur pour décrire ses couches.</p>;
  const enregistrer = () => {
    setErreur(null);
    const couches = lignes.filter((l) => l.materiau.trim() || l.epaisseur.trim()).map((l) => ({ materiau: l.materiau.trim(), epaisseur: { value: Number(l.epaisseur.replace(",", ".")) / 1000, unit: "m" }, fonction: l.fonction || null }));
    if (couches.some((c) => !c.materiau || !(c.epaisseur.value > 0))) return setErreur("Chaque couche demande un matériau et une épaisseur en millimètres.");
    onCommandes([{ type: "type.modifier", params: { id: type.id, params: { couches: couches.length ? couches : null } } }], `Composition du type « ${type.nom} »`);
  };
  return (
    <details className="inspecteur-composition" open={actuelles.length > 0} data-composition={composition ? (composition.coherente ? "coherente" : "incoherente") : "absente"}>
      <summary>Composition du type « {type.nom} »{actuelles.length ? ` · ${actuelles.length} couche(s)` : " · non renseignée"}</summary>
      <p className="inspecteur-note">De la face gauche à la face droite (sens du tracé). {nbMurs > 1 ? `Modifier les couches modifie les ${nbMurs} murs de ce type.` : ""}</p>
      <table className="composition-couches">
        <thead>
          <tr><th scope="col">Matériau</th><th scope="col">mm</th><th scope="col">Fonction</th><th scope="col"><span className="sr-only">Retirer</span></th></tr>
        </thead>
        <tbody>
          {lignes.map((l, i) => (
            <tr key={i}>
              <td><input aria-label={`Matériau de la couche ${i + 1}`} value={l.materiau} disabled={desactive} maxLength={80} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, materiau: e.target.value } : x)))} data-couche-materiau={i} /></td>
              <td><input aria-label={`Épaisseur de la couche ${i + 1} (mm)`} inputMode="decimal" value={l.epaisseur} disabled={desactive} size={5} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, epaisseur: e.target.value } : x)))} data-couche-epaisseur={i} /></td>
              <td>
                <select aria-label={`Fonction de la couche ${i + 1}`} value={l.fonction} disabled={desactive} onChange={(e) => setLignes(lignes.map((x, j) => (j === i ? { ...x, fonction: e.target.value } : x)))}>
                  <option value="">—</option>
                  {FONCTIONS_COUCHE.map((f) => <option key={f} value={f}>{FONCTION_LIBELLE[f]}</option>)}
                </select>
              </td>
              <td><button type="button" className="bouton-mini" disabled={desactive} onClick={() => setLignes(lignes.filter((_, j) => j !== i))}>×<span className="sr-only">Retirer la couche {i + 1}</span></button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {!desactive && (
        <span className="ver-actions">
          <button type="button" onClick={() => setLignes([...lignes, { materiau: "", epaisseur: "", fonction: "" }])} data-couche-ajouter>Ajouter une couche</button>
          <button type="button" className="primaire" onClick={enregistrer} data-couche-enregistrer>Enregistrer la composition</button>
        </span>
      )}
      {erreur && <p className="inspecteur-alerte" role="alert">{erreur}</p>}
      {composition && (
        composition.coherente ? (
          <p className="inspecteur-note">Somme des couches {fmt(composition.total * 1000)} mm = épaisseur du mur.</p>
        ) : (
          <p className="inspecteur-alerte" role="note">
            Somme des couches {fmt(composition.total * 1000)} mm ≠ épaisseur du mur {fmt(o.params.epaisseur.value * 1000)} mm : couches non dessinées ni exportées.
            {!desactive && (
              <button type="button" className="bouton-mini" onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { epaisseur: { value: composition.total, unit: "m" } } } }], "Épaisseur du mur = composition")} data-couche-appliquer>
                Donner au mur l'épaisseur de la composition
              </button>
            )}
          </p>
        )
      )}
    </details>
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
  if (cle === "maillage" && valeur && typeof valeur === "object") {
    const m = valeur as { positions: unknown[]; indices: unknown[] };
    resume = `${m.indices.length / 3} triangle(s), ${m.positions.length / 3} sommet(s) — représentation importée, non paramétrique`;
  } else if (Array.isArray(valeur)) resume = `${valeur.length} ${cle === "polygones" ? "polygone(s)" : cle === "trous" ? "trou(s)" : "point(s)"}`;
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

/** Paramètres facultatifs absents du modèle mais proposés à la saisie (D-059) : « non renseigné » tant que vides. */
function avecFacultatifs(classe: string, params: Record<string, unknown>): Record<string, unknown> {
  if ((classe === "piece" || classe === "espace") && !("hauteur" in params)) return { ...params, hauteur: null };
  if (classe === "dalle" && !("usage" in params)) return { ...params, usage: null };
  return params;
}

const USAGES_DALLE_LIBELLES: [string, string][] = [["plancher", "Plancher"], ["dalle-isolee", "Dalle isolée"]];

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
  if (cle === "motif") {
    return (
      <div className="champ">
        <dt><label htmlFor={id}>Motif de hachure</label></dt>
        <dd>
          <select id={id} value={(valeur as string | null) ?? ""} disabled={desactive} data-champ="motif" onChange={(e) => onValider(e.target.value || null)}>
            <option value="">par défaut ({MOTIFS_HACHURE[MOTIF_HACHURE_DEFAUT]!.libelle})</option>
            {Object.entries(MOTIFS_HACHURE).map(([v, m]) => <option key={v} value={v}>{m.libelle}</option>)}
            {typeof valeur === "string" && valeur && !MOTIFS_HACHURE[valeur] && <option value={valeur}>{valeur} (inconnu)</option>}
          </select>
        </dd>
      </div>
    );
  }
  if (cle === "usage") {
    return (
      <div className="champ">
        <dt><label htmlFor={id}>{libelle}</label></dt>
        <dd>
          <select id={id} value={(valeur as string | null) ?? ""} disabled={desactive} data-champ="usage" onChange={(e) => onValider(e.target.value || null)}>
            <option value="">non renseigné</option>
            {USAGES_DALLE_LIBELLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
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
  const lire = (x: string) => ((estGrandeur ? unite === "m" : valeur === null) ? longueurSaisie(x) : nombreSaisi(x));
  const valider = () => {
    const t = texte.trim();
    if (numerique) {
      if (t === "") {
        // Vider un champ facultatif le remet à « non évaluée » ; jamais une valeur inventée.
        if (valeur === null || cle === "hauteur") onValider(null);
        return;
      }
      // Un nombre ou un calcul (« 2,5 + 0,3 », D-049), évalué par l'analyseur sûr des scripts ; une longueur peut
      // porter son unité (« 250 mm », « 10 ft », « 3'6" », D-130), convertie explicitement en mètres.
      const n = lire(t);
      if (n === null) return;
      setTexte(String(n).replace(".", ","));
      onValider(estGrandeur || valeur === null ? { value: n, unit: unite ?? "m" } : n);
    } else onValider(t === "" ? null : t);
  };
  const inchange = numerique ? lire(texte) === brut || (texte === "" && brut === null) : texte === (brut ?? "");
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
        {new Set(sel.map((o) => o.niveauId)).size > 1 && <p className="inspecteur-aide" data-multi-niveaux={new Set(sel.map((o) => o.niveauId)).size}>Sur {new Set(sel.map((o) => o.niveauId)).size} niveaux (seuls ceux du niveau affiché sont visibles au plan).</p>}
      </header>
      <ul className="inspecteur-compte">
        {[...parClasse].map(([c, n]) => <li key={c}>{CLASSES[c as keyof typeof CLASSES]?.libelle ?? c} : {n}</li>)}
      </ul>
      <ContrainteVerticale key={`pose|${sel.map((o) => o.id).join("|")}`} sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <div className="champ">
        <label htmlFor="calque-multiple">Affecter au calque</label>
        <select id="calque-multiple" value="" disabled={readOnly} onChange={(e) => e.target.value && onCommandes([{ type: "calque.affecter", params: { calqueId: e.target.value }, cibles: sel.map((o) => o.id) }], `Changer de calque (${sel.length})`)}>
          <option value="">Choisir…</option>
          {Object.values(etat.calques).sort((a, b) => a.ordre - b.ordre).map((c) => <option key={c.id} value={c.id} disabled={c.verrouille}>{c.nom}</option>)}
        </select>
      </div>
      <dl className="inspecteur-champs">
        <ChoixPhase sel={sel} readOnly={readOnly} onCommandes={onCommandes} />
        <ChoixVerrou sel={sel} readOnly={readOnly} onCommandes={onCommandes} />
      </dl>
      {/* Chaîne jointive fermée (D-126) : profil proposé, jamais imposé. */}
      {!readOnly && chaineFermee(etat, sel.map((o) => o.id)) && (
        <p className="inspecteur-aide" data-profil-propose={sel.length}>
          Ces {sel.length} traits forment un contour fermé.{" "}
          <button type="button" className="lien" data-joindre-profil onClick={() => onCommandes([{ type: "transformer.joindre", params: {}, cibles: sel.map((o) => o.id) }], `Joindre ${sel.length} traits en profil`)}>Joindre en profil</button>
          {" "}(un polygone, à extruder ou hachurer).
        </p>
      )}
      {sel.length === 2 && sel.every((o) => o.classe === "mur") && !readOnly && <OuvertureAngle key={`angle|${sel.map((o) => o.id).join("|")}`} murs={sel as Occurrence<"mur">[]} onCommandes={onCommandes} />}
      <TableauProprietes key={`props|${sel.map((o) => o.id).join("|")}`} sel={sel} readOnly={readOnly} onCommandes={onCommandes} />
      <Contraintes sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <CreerBloc sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <VersNiveau sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <GroupeSelection sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <Classification sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />
      <ProprieteCommune sel={sel} readOnly={readOnly} onCommandes={onCommandes} />
      {sel.length === 2 && sel.every((o) => o.classe === "piece") && (
        <button type="button" className="inspecteur-fusion" disabled={readOnly} data-pieces="fusionner" onClick={() => onCommandes([{ type: "piece.fusionner", params: { ids: sel.map((o) => o.id) } }], "Fusionner deux pièces")}>
          Fusionner les deux pièces (la première garde son nom et son code)
        </button>
      )}
      {sel.some((o) => o.classe === "piece") && <NumeroterPieces sel={sel} etat={etat} readOnly={readOnly} onCommandes={onCommandes} />}
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
      {groupes.length === 0 && <p className="inspecteur-aide">Aucun bloc : sélectionnez des esquisses, solides, poteaux ou dalles et « Créer un bloc ou un composant ».</p>}
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
  "mur-courbe": [{ cle: "epaisseur", libelle: "Épaisseur", unite: "m" }, { cle: "hauteur", libelle: "Hauteur", unite: "m" }],
  porte: [{ cle: "largeurOuverture", libelle: "Largeur", unite: "m" }, { cle: "hauteurOuverture", libelle: "Hauteur", unite: "m" }],
  fenetre: [{ cle: "largeurOuverture", libelle: "Largeur", unite: "m" }, { cle: "hauteurOuverture", libelle: "Hauteur", unite: "m" }, { cle: "allege", libelle: "Allège", unite: "m" }],
  ouverture: [{ cle: "largeurOuverture", libelle: "Largeur", unite: "m" }, { cle: "hauteurOuverture", libelle: "Hauteur", unite: "m" }],
  dalle: [{ cle: "epaisseurDalle", libelle: "Épaisseur", unite: "m" }],
  toiture: [{ cle: "epaisseurDalle", libelle: "Épaisseur", unite: "m" }, { cle: "penteToiture", libelle: "Pente (0 = plate)", unite: "°" }],
  "garde-corps": [{ cle: "hauteurGardeCorps", libelle: "Hauteur", unite: "m" }, { cle: "epaisseurGardeCorps", libelle: "Épaisseur", unite: "m" }],
  escalier: [{ cle: "largeurEscalier", libelle: "Largeur", unite: "m" }],
  "escalier-helicoidal": [{ cle: "rayonInterieurHelice", libelle: "Rayon intérieur", unite: "m" }, { cle: "balayageHelice", libelle: "Balayage (− : horaire)", unite: "°" }, { cle: "hauteurHelice", libelle: "Hauteur à franchir", unite: "m" }, { cle: "contremarchesHelice", libelle: "Contremarches" }, { cle: "epaisseurMarche", libelle: "Épaisseur des marches", unite: "m" }],
  "escalier-balance": [{ cle: "largeurVolees", libelle: "Largeur", unite: "m" }, { cle: "hauteurVolees", libelle: "Hauteur à franchir", unite: "m" }, { cle: "contremarchesVolees", libelle: "Contremarches (total)" }, { cle: "epaisseurMarche", libelle: "Épaisseur des marches", unite: "m" }, { cle: "ligneFoulee", libelle: "Ligne de foulée (depuis le limon intérieur)", unite: "m" }, { cle: "marchesBalancees", libelle: "Marches balancées par tournant" }],
  "escalier-volees": [{ cle: "largeurVolees", libelle: "Largeur", unite: "m" }, { cle: "hauteurVolees", libelle: "Hauteur à franchir", unite: "m" }, { cle: "contremarchesVolees", libelle: "Contremarches (total)" }, { cle: "epaisseurPalier", libelle: "Épaisseur des paliers", unite: "m" }],
  poteau: [{ cle: "taille", libelle: "Section", unite: "m" }, { cle: "hauteur", libelle: "Hauteur", unite: "m" }],
  solide: [{ cle: "hauteurSolide", libelle: "Hauteur d'extrusion", unite: "m" }],
  extruder: [{ cle: "hauteurSolide", libelle: "Hauteur d'extrusion", unite: "m" }, { cle: "epaisseurProfil", libelle: "Épaisseur d'un profil ouvert", unite: "m" }],
  "solide-exact": [{ cle: "angleRevolution", libelle: "Angle de révolution", unite: "°" }, { cle: "hauteurExacte", libelle: "Hauteur (lissage, trajet)", unite: "m" }, { cle: "epaisseurExacte", libelle: "Épaisseur de coque", unite: "m" }, { cle: "diametreExacte", libelle: "Diamètre du trou", unite: "m" }, { cle: "profondeurExacte", libelle: "Profondeur du trou (0 = traversant)", unite: "m" }, { cle: "xTrou", libelle: "Centre du trou x", unite: "m" }, { cle: "yTrou", libelle: "Centre du trou y", unite: "m" }],
  decaler: [{ cle: "distanceDecalage", libelle: "Distance", unite: "m" }],
  bloc: [{ cle: "angleBloc", libelle: "Angle", unite: "°" }],
  repeter: [{ cle: "repetitions", libelle: "Nombre de copies" }, { cle: "pasX", libelle: "Pas en x", unite: "m" }, { cle: "pasY", libelle: "Pas en y", unite: "m" }, { cle: "etagesReseau", libelle: "Étages au-dessus (réseau 3D)" }],
  raccorder: [{ cle: "rayon", libelle: "Rayon", unite: "m" }],
  "polygone-regulier": [{ cle: "cotes", libelle: "Nombre de côtés" }],
  "main-levee": [{ cle: "toleranceMainLevee", libelle: "Tolérance de simplification", unite: "m" }],
  plancher: [{ cle: "epaisseurPlancher", libelle: "Épaisseur", unite: "m" }],
  "reseau-trajet": [{ cle: "copiesTrajet", libelle: "Nombre de copies" }, { cle: "pasTrajet", libelle: "ou pas (prioritaire)", unite: "m" }],
  prolonger: [{ cle: "longueurProlongement", libelle: "Longueur (sans limite)", unite: "m" }],
  trame: [{ cle: "depassement", libelle: "Dépassement des axes", unite: "m" }],
  chanfreiner: [{ cle: "distanceChanfrein", libelle: "Distance", unite: "m" }],
  "chanfrein-sommet": [{ cle: "distanceChanfrein", libelle: "Distance", unite: "m" }],
};

function ParametresOutil({ etat, ui, readOnly = false, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly?: boolean; onCommandes?: (commandes: Commande[], label: string) => void }) {
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
      {ui.outil === "sommet" && (
        <label className="case" title="Posé sur le sommet d'une autre esquisse ou d'un mur, le sommet y reste lié (contrainte de coïncidence)">
          <input type="checkbox" checked={ui.parametresOutil["aimanterContrainte"] === true} data-aimanter-contrainte onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, aimanterContrainte: e.target.checked } }))} />
          Aimanter (contrainte de coïncidence)
        </label>
      )}
      {ui.outil === "repeter" && (
        <label className="case" title="Les paramètres sont gardés : modifier le pas ou le nombre recalcule les copies">
          <input type="checkbox" checked={ui.parametresOutil["reseauAssocie"] === true} data-reseau-associe onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, reseauAssocie: e.target.checked } }))} />
          Réseau associatif
        </label>
      )}
      {ui.outil === "extruder" && (
        <label className="case" title="Le solide suit le profil de l'esquisse fermée quand elle change ; supprimée ou ouverte, il garde son dernier contour">
          <input type="checkbox" checked={ui.parametresOutil["solideAssocie"] === true} data-solide-associe onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, solideAssocie: e.target.checked } }))} />
          Solide associé à l'esquisse
        </label>
      )}
      {ui.outil === "main-levee" && (
        <label className="case" title="Un geste rapide est davantage lissé, un passage lent garde ses détails (0,5 à 3 fois la tolérance)">
          <input type="checkbox" checked={ui.parametresOutil["lissageAdaptatif"] === true} data-lissage-adaptatif onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, lissageAdaptatif: e.target.checked } }))} />
          Lissage adaptatif (selon la vitesse du geste)
        </label>
      )}
      {ui.outil === "plancher" && <PropositionsPlancherVue etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "solide-exact" && <OutilSolideExact etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "piece-mecanique" && <OutilPieceMecanique etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "assemblage" && <OutilAssemblage etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "liaison" && <OutilLiaison etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "poutre" && <OutilPoutre key={`poutre-${ui.selection.join(",")}`} etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "trame-structure" && <OutilTrame etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "plaque" && <OutilPlaque etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "assemblage-structurel" && <OutilAssemblageStructurel etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "soudure" && <OutilSoudure etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "armature" && <OutilArmature key={`armature-${ui.selection.join(",")}`} etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "coulage" && <OutilCoulage etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "element-bois" && <OutilElementBois key={`bois-${ui.selection.join(",")}`} etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "ossature" && <OutilOssature etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "panneau-clt" && <OutilPanneauClt key={`clt-${ui.selection.join(",")}`} etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "assemblage-bois" && <OutilAssemblageBois etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "tole" && <OutilTole etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "segment-reseau" && <OutilSegmentReseau key={`seg-${ui.selection.join(",")}`} etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "raccord-reseau" && <OutilRaccordReseau etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "vanne" && <OutilVanne etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "equipement-reseau" && <OutilEquipementReseau etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "support-reseau" && <OutilSupportReseau etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "connexion-reseau" && <OutilConnexionReseau key={`cx-${ui.selection.join(",")}`} etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "specification-reseau" && <OutilSpecificationReseau etat={etat} ui={ui} readOnly={readOnly} onCommandes={onCommandes} />}
      {ui.outil === "contour" && (
        <div className="champ">
          <label htmlFor="outil-formeContour">Créer</label>
          <select id="outil-formeContour" value={(ui.parametresOutil["formeContour"] as string | undefined) ?? "polygone"} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, formeContour: e.target.value } }))}>
            <option value="polygone">un polygone</option>
            <option value="hachure">une hachure</option>
          </select>
        </div>
      )}
      {ui.outil === "decaler" && (
        <div className="champ">
          <label htmlFor="outil-distancesDecalage">Série de distances (m, facultative)</label>
          <input id="outil-distancesDecalage" value={(ui.parametresOutil["distancesDecalage"] as string | undefined) ?? ""} placeholder="ex. 0,5 ; 1 ; 1,5" onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, distancesDecalage: e.target.value } }))} onKeyDown={(e) => e.stopPropagation()} />
        </div>
      )}
      {ui.outil === "trame" && (
        <>
          {(["entraxesX", "entraxesY"] as const).map((cle) => (
            <div className="champ" key={cle}>
              <label htmlFor={`outil-${cle}`}>{cle === "entraxesX" ? "Entraxes en x (m)" : "Entraxes en y (m)"}</label>
              <input id={`outil-${cle}`} value={(ui.parametresOutil[cle] as string | undefined) ?? ""} placeholder="ex. 5,4 ; 2*6" onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, [cle]: e.target.value } }))} onKeyDown={(e) => e.stopPropagation()} data-trame={cle} />
            </div>
          ))}
          <div className="champ">
            <label htmlFor="outil-reperesX">Repères des axes x</label>
            <select id="outil-reperesX" value={(ui.parametresOutil["reperesX"] as string | undefined) ?? "chiffres"} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, reperesX: e.target.value } }))}>
              <option value="chiffres">1, 2, 3… (axes y : A, B, C…)</option>
              <option value="lettres">A, B, C… (axes y : 1, 2, 3…)</option>
            </select>
          </div>
        </>
      )}
      {ui.outil === "escalier-volees" && (
        <div className="champ">
          <label htmlFor="outil-niveauArriveeVolees">Niveau d'arrivée</label>
          <select id="outil-niveauArriveeVolees" value={(ui.parametresOutil["niveauArriveeVolees"] as string | undefined) ?? ""} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, niveauArriveeVolees: e.target.value || undefined } }))}>
            <option value="">non renseigné</option>
            {Object.values(etat.niveaux).sort((a, b) => a.elevation - b.elevation).filter((x) => x.id !== ui.niveauId).map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
          </select>
        </div>
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

const ACTIONS: Record<string, string> = { cree: "Créé", modifie: "Modifié", supprime: "Supprimé" };

/** Historique d'un objet (DA-21-06 -d) : ses entrées du journal, dans l'ordre des révisions, chargées à l'ouverture. */
function HistoriqueObjet({ projectId, objetId }: { projectId: string; objetId: string }) {
  const [ouvert, setOuvert] = useState(false);
  const historique = useQuery({ queryKey: ["atelier-historique", projectId, objetId], queryFn: () => api.getAtelierHistoriqueObjet(projectId, objetId), enabled: ouvert, retry: false });
  return (
    <details className="inspecteur-historique" onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Historique de l'objet</summary>
      {historique.isLoading && <p role="status">Lecture du journal…</p>}
      {historique.isError && <p className="ver-erreur">Historique indisponible (hors ligne ?).</p>}
      {historique.data && (historique.data.entrees.length === 0 ? (
        <p className="nav-vide">Aucune modification journalisée : objet issu de l'import initial, sans historique antérieur inventé.</p>
      ) : (
        <ol>
          {historique.data.entrees.map((h) => (
            <li key={h.journalId} data-historique={h.action}>
              <strong>{ACTIONS[h.action]}</strong> · {h.label} <span className="nav-detail">r{h.revision} · {new Date(h.date).toLocaleString(LOCALE, { dateStyle: "short", timeStyle: "short" })}{h.auteur ? ` · ${h.auteur}` : ""}{h.successeurs.length ? ` · remplacé par ${h.successeurs.join(", ")}` : ""}</span>
            </li>
          ))}
        </ol>
      ))}
    </details>
  );
}

/** Arrondir les sommets (D-063) : chaque sommet devient un segment en arc tangent à ses deux côtés. */
function ArrondirSommets({ o, onCommandes }: { o: Occurrence<"esquisse">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [rayon, setRayon] = useState("");
  const [sommet, setSommet] = useState("");
  const r = nombreSaisi(rayon);
  const n = o.params.forme === "rectangle" && o.params.points.length === 2 ? 4 : o.params.points.length;
  return (
    <form className="inspecteur-arrondir" data-arrondir onSubmit={(e) => {
      e.preventDefault();
      if (r === null || !(r > 0)) return;
      onCommandes([{ type: "esquisse.arrondirSommets", params: { id: o.id, rayon: { value: r, unit: "m" }, ...(sommet ? { sommets: [Number(sommet)] } : {}) } }], `Arrondir ${sommet ? `le sommet ${Number(sommet) + 1}` : "les sommets"} de ${o.id} (rayon ${String(r).replace(".", ",")} m)`);
    }}>
      <label>Rayon d'arrondi (m)<input inputMode="decimal" value={rayon} onChange={(e) => setRayon(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-arrondir-rayon /></label>
      <label>Sommet
        <select value={sommet} onChange={(e) => setSommet(e.target.value)}>
          <option value="">Tous</option>
          {Array.from({ length: n }, (_, i) => <option key={i} value={i}>{i + 1}</option>)}
        </select>
      </label>
      <button type="submit" disabled={r === null || !(r > 0)}>Arrondir</button>
    </form>
  );
}

/** Changer de classe sur place (D-060) : le contour est gardé, les paramètres propres à la classe d'arrivée sont saisis. */
function ChangerClasseContour({ o, onCommandes }: { o: OccurrenceQuelconque; onCommandes: PropsInspecteur["onCommandes"] }) {
  const choix = (["piece", "zone", "dalle", "esquisse"] as const).filter((c) => c !== o.classe);
  const [classe, setClasse] = useState<(typeof choix)[number]>(choix[0]!);
  const [nom, setNom] = useState("");
  const [epaisseur, setEpaisseur] = useState("");
  const LIB: Record<string, string> = { piece: "Pièce", zone: "Zone", dalle: "Dalle", esquisse: "Esquisse (polygone)" };
  const e = nombreSaisi(epaisseur);
  const pret = classe === "dalle" ? e !== null && e > 0 : classe === "esquisse" ? true : nom.trim().length > 0;
  return (
    <form className="inspecteur-classe" data-changer-classe onSubmit={(ev) => {
      ev.preventDefault();
      if (!pret) return;
      const params = classe === "dalle" ? { epaisseur: { value: e, unit: "m" } } : classe === "esquisse" ? {} : { nom: nom.trim() };
      onCommandes([{ type: "objet.changerClasse", params: { id: o.id, classe, params } }], `${o.id} → ${LIB[classe]}`);
    }}>
      <label>Changer en
        <select value={classe} onChange={(ev) => setClasse(ev.target.value as typeof classe)} data-classe-cible>
          {choix.map((c) => <option key={c} value={c}>{LIB[c]}</option>)}
        </select>
      </label>
      {(classe === "piece" || classe === "zone") && <label>Nom<input value={nom} maxLength={120} onChange={(ev) => setNom(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-classe-nom /></label>}
      {classe === "dalle" && <label>Épaisseur (m)<input inputMode="decimal" value={epaisseur} onChange={(ev) => setEpaisseur(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-classe-epaisseur /></label>}
      <button type="submit" disabled={!pret}>Changer de classe</button>
    </form>
  );
}

/** Trémie (D-059) : percer une dalle de l'emprise de l'escalier, agrandie d'une marge déclarée. */
function TremieEscalier({ o, etat, onCommandes }: { o: Occurrence<"escalier">; etat: ModeleAtelier; onCommandes: PropsInspecteur["onCommandes"] }) {
  const dalles = Object.values(etat.objets).filter((x): x is Occurrence<"dalle"> => x.classe === "dalle");
  // Dalles du niveau d'arrivée d'abord (la trémie s'y perce le plus souvent).
  const tri = [...dalles].sort((a, b) => (a.niveauId === o.params.niveauArriveeId ? 0 : 1) - (b.niveauId === o.params.niveauArriveeId ? 0 : 1) || a.id.localeCompare(b.id));
  const [dalle, setDalle] = useState("");
  const [marge, setMarge] = useState("0");
  if (!tri.length) return null;
  const m = nombreSaisi(marge);
  return (
    <form className="inspecteur-tremie" data-tremie onSubmit={(e) => { e.preventDefault(); if (dalle && m !== null && m >= 0) onCommandes([{ type: "escalier.tremie", params: { id: o.id, dalleId: dalle, marge: m } }], `Trémie de ${o.id} dans ${dalle}`); }}>
      <label>Trémie dans la dalle
        <select value={dalle} onChange={(e) => setDalle(e.target.value)} data-tremie-dalle>
          <option value="">Choisir…</option>
          {tri.map((d) => <option key={d.id} value={d.id}>{d.params.nom ?? d.id}{d.niveauId && etat.niveaux[d.niveauId] ? ` (${etat.niveaux[d.niveauId]!.nom})` : ""}</option>)}
        </select>
      </label>
      <label>Marge (m)<input inputMode="decimal" value={marge} onChange={(e) => setMarge(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>
      <button type="submit" disabled={!dalle}>Percer la trémie</button>
    </form>
  );
}

/**
 * Conversion d'esquisse (D-054) : ligne, polyligne ou polygone → spline (par les sommets, ou ajustée à une tolérance) ;
 * spline, arc, cercle ou ellipse → polyligne d'un nombre de segments saisi.
 */
function ConvertirEsquisse({ o, onCommandes }: { o: Occurrence<"esquisse">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const forme = o.params.forme;
  const versSpline = forme === "ligne" || forme === "polyligne" || forme === "polygone";
  const versPolyligne = forme === "spline" || forme === "arc" || forme === "cercle" || forme === "ellipse";
  const [valeur, setValeur] = useState(forme === "spline" ? "8" : forme === "arc" ? "16" : "32");
  const [tolerance, setTolerance] = useState("");
  if (!versSpline && !versPolyligne) return null;
  const n = nombreSaisi(valeur);
  const t = tolerance.trim() ? nombreSaisi(tolerance) : null;
  return (
    <form
      className="inspecteur-convertir"
      data-convertir-esquisse
      onSubmit={(e) => {
        e.preventDefault();
        if (versSpline) {
          if (tolerance.trim() && (t === null || !(t >= 0))) return;
          onCommandes([{ type: "esquisse.convertir", params: { id: o.id, forme: "spline", ...(t !== null ? { tolerance: t } : {}) } }], t !== null ? `Ajuster une spline sur ${o.id} (tolérance ${String(t).replace(".", ",")} m)` : `Convertir ${o.id} en spline`);
        } else {
          if (n === null || !Number.isInteger(n) || n < 1) return;
          onCommandes([{ type: "esquisse.convertir", params: { id: o.id, forme: "polyligne", segments: n } }], `Convertir ${o.id} en polyligne (${n} segments${forme === "spline" ? " par travée" : ""})`);
        }
      }}
    >
      {versSpline ? (
        <label>Tolérance d'ajustement (m, vide : tous les sommets)<input inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>
      ) : (
        <label>Segments{forme === "spline" ? " par travée" : ""}<input inputMode="numeric" value={valeur} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>
      )}
      <button type="submit">{versSpline ? "Convertir en spline" : "Convertir en polyligne"}</button>
    </form>
  );
}

const OUVRANTS: [string, string][] = [
  ["debut-gauche", "charnière au début · ouvre côté gauche"],
  ["debut-droite", "charnière au début · ouvre côté droit"],
  ["fin-gauche", "charnière à la fin · ouvre côté gauche"],
  ["fin-droite", "charnière à la fin · ouvre côté droit"],
];

/**
 * Mur hôte et sens d'ouverture (D-037) : changer d'hôte parmi les murs du projet (la position est gardée, l'emprise
 * contrôlée) ; pour une porte, sens d'ouverture renseigné ou non (« début », « gauche » : sens de tracé du mur hôte).
 */
function OuvertureHote({ o, etat, desactive, onCommandes }: { o: Occurrence<"porte">; etat: ModeleAtelier; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const libelle = CLASSES[o.classe].libelle;
  const murs = Object.values(etat.objets).filter((x): x is Occurrence<"mur"> => x.classe === "mur").sort((a, b) => (a.niveauId === o.niveauId ? 0 : 1) - (b.niveauId === o.niveauId ? 0 : 1) || a.id.localeCompare(b.id));
  const nomMur = (m: Occurrence<"mur">) => `${m.id}${m.niveauId && m.niveauId !== o.niveauId ? ` (${etat.niveaux[m.niveauId]?.nom ?? m.niveauId})` : ""}`;
  const ouvrant = o.classe === "porte" ? (o.params.ouvrant ?? null) : undefined;
  const valeur = ouvrant ? `${ouvrant.charniere}-${ouvrant.cote}` : "";
  // Porte pliante ou pivotante (D-152) : nombre de panneaux et distance du pivot saisis, jamais supposés.
  const [extra, setExtra] = useState({ panneaux: String(ouvrant?.panneaux ?? ""), pivot: ouvrant?.decalagePivot ? String(ouvrant.decalagePivot.value).replace(".", ",") : "" });
  const [typeChoisi, setTypeChoisi] = useState<OuvrantPorte["type"] | null>(null);
  const complement = (type: string | undefined) => {
    if (type === "pliante") return { panneaux: Number(extra.panneaux) };
    if (type === "pivotante") return { decalagePivot: { value: longueurSaisie(extra.pivot), unit: "m" } };
    return {};
  };
  const fixer = (v: string, type = ouvrant?.type) => {
    const [charniere, cote] = v ? v.split("-") : [];
    onCommandes([{ type: "ouverture.modifier", params: { id: o.id, params: { ouvrant: v ? { charniere, cote, ...(type && type !== "battante" ? { type, ...complement(type) } : {}) } : null } } }], v ? `Sens d'ouverture : ${OUVRANTS.find(([k]) => k === v)?.[1]}${type && type !== "battante" ? ` (${type})` : ""}` : "Sens d'ouverture non renseigné");
  };
  const [rep, setRep] = useState({ nombre: "", entraxe: "" });
  return (
    <div className="inspecteur-ouverture">
      <label htmlFor={`hote-${o.id}`}>Mur hôte</label>
      <select id={`hote-${o.id}`} value={o.params.murHoteId} disabled={desactive} data-champ="murHoteId" onChange={(e) => onCommandes([{ type: "ouverture.modifier", params: { id: o.id, params: { murHoteId: e.target.value } } }], `${libelle} : changer de mur hôte`)}>
        {murs.map((m) => (
          <option key={m.id} value={m.id}>
            {nomMur(m)}
          </option>
        ))}
      </select>
      <label htmlFor={`classe-${o.id}`}>Nature</label>
      <select id={`classe-${o.id}`} value={o.classe} disabled={desactive} data-champ="classeOuverture" onChange={(e) => onCommandes([{ type: "ouverture.changerClasse", params: { id: o.id, classe: e.target.value } }], `${libelle} → ${CLASSES[e.target.value as "porte"].libelle}`)}>
        <option value="porte">{CLASSES.porte.libelle}</option>
        <option value="fenetre">{CLASSES.fenetre.libelle}</option>
        <option value="ouverture">{CLASSES.ouverture.libelle}</option>
      </select>
      {ouvrant !== undefined && (
        <>
          <label htmlFor={`ouvrant-${o.id}`}>Sens d'ouverture</label>
          <select id={`ouvrant-${o.id}`} value={valeur} disabled={desactive} data-champ="ouvrant" onChange={(e) => fixer(e.target.value)}>
            <option value="">non renseigné (dessin selon la convention, signalé)</option>
            {OUVRANTS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          {ouvrant && (
            <>
              <label htmlFor={`vantail-${o.id}`}>Vantail</label>
              <select id={`vantail-${o.id}`} value={typeChoisi ?? ouvrant.type ?? "battante"} disabled={desactive} data-champ="vantail" onChange={(e) => { const t = e.target.value as "battante"; if ((t as string) === "pliante" || (t as string) === "pivotante") setTypeChoisi(t); else { setTypeChoisi(null); fixer(valeur, t); } }}>
                <option value="battante">battant (un vantail)</option>
                <option value="double">double (deux vantaux battants)</option>
                <option value="coulissante">coulissant (glisse vers la charnière)</option>
                <option value="pliante">pliant (panneaux en accordéon)</option>
                <option value="pivotante">pivotant (axe décalé du tableau)</option>
              </select>
              {((typeChoisi ?? ouvrant.type) === "pliante" || (typeChoisi ?? ouvrant.type) === "pivotante") && (
                <span className="ver-actions">
                  {(typeChoisi ?? ouvrant.type) === "pliante" ? (
                    <label>Panneaux<input type="number" min={2} max={12} step={1} value={extra.panneaux} disabled={desactive} onChange={(e) => setExtra({ ...extra, panneaux: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-ouvrant-panneaux /></label>
                  ) : (
                    <label>Pivot à (m du tableau)<input inputMode="decimal" value={extra.pivot} disabled={desactive} onChange={(e) => setExtra({ ...extra, pivot: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-ouvrant-pivot /></label>
                  )}
                  <button type="button" disabled={desactive} onClick={() => { fixer(valeur, typeChoisi ?? ouvrant.type); setTypeChoisi(null); }} data-ouvrant-appliquer>Appliquer</button>
                </span>
              )}
            </>
          )}
          {ouvrant && (
            <span className="ver-actions">
              <button type="button" disabled={desactive} onClick={() => fixer(`${ouvrant.charniere === "debut" ? "fin" : "debut"}-${ouvrant.cote}`)}>Inverser la charnière</button>
              <button type="button" disabled={desactive} onClick={() => fixer(`${ouvrant.charniere}-${ouvrant.cote === "gauche" ? "droite" : "gauche"}`)} data-inverser="cote">Inverser le côté</button>
            </span>
          )}
        </>
      )}
      {!desactive && (
        <details className="inspecteur-repartir">
          <summary>Répartir le long du mur</summary>
          <label>Nombre de copies<input type="number" min={1} max={100} step={1} value={rep.nombre} onChange={(e) => setRep({ ...rep, nombre: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-repartir="nombre" /></label>
          <label>Entraxe (m, négatif : vers le début du mur)<input inputMode="decimal" value={rep.entraxe} onChange={(e) => setRep({ ...rep, entraxe: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-repartir="entraxe" /></label>
          <button type="button" disabled={!Number.isInteger(Number(rep.nombre)) || Number(rep.nombre) < 1 || !Number.isFinite(Number(rep.entraxe.replace(",", "."))) || rep.entraxe.trim() === ""} onClick={() => onCommandes([{ type: "ouverture.repartir", params: { id: o.id, nombre: Number(rep.nombre), entraxe: { value: Number(rep.entraxe.replace(",", ".")), unit: "m" } } }], `Répartir ${libelle.toLowerCase()} × ${rep.nombre}`)} data-repartir="valider">
            Répartir
          </button>
        </details>
      )}
    </div>
  );
}

/** Déplacer ou copier la sélection vers un autre niveau (D-039) : les ouvertures suivent leur mur. */
function VersNiveau({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [cible, setCible] = useState("");
  const ids = sel.filter((o) => !(o.classe === "porte" || o.classe === "fenetre" || o.classe === "ouverture")).map((o) => o.id);
  const actuels = new Set(sel.map((o) => o.niveauId));
  const niveaux = Object.values(etat.niveaux).sort((a, b) => a.elevation - b.elevation).filter((n) => !(actuels.size === 1 && actuels.has(n.id)));
  if (!ids.length || !niveaux.length) return null;
  const nom = etat.niveaux[cible]?.nom ?? "";
  const agir = (type: "transformer.deplacer" | "transformer.copier") =>
    onCommandes([{ type, params: { dx: 0, dy: 0, niveauCible: cible }, cibles: ids }], `${type === "transformer.deplacer" ? "Déplacer" : "Copier"} ${ids.length} objet${ids.length > 1 ? "s" : ""} vers « ${nom} »`);
  return (
    <details className="inspecteur-vers-niveau">
      <summary>Vers un autre niveau</summary>
      <label htmlFor={`vers-niveau-${ids[0]}`}>Niveau cible</label>
      <select id={`vers-niveau-${ids[0]}`} value={cible} disabled={readOnly} onChange={(e) => setCible(e.target.value)} data-vers-niveau="cible">
        <option value="">Choisir…</option>
        {niveaux.map((n) => (
          <option key={n.id} value={n.id}>
            {n.nom} ({n.elevation} m)
          </option>
        ))}
      </select>
      <span className="ver-actions">
        <button type="button" disabled={readOnly || !cible} onClick={() => agir("transformer.deplacer")} data-vers-niveau="deplacer">Déplacer</button>
        <button type="button" disabled={readOnly || !cible} onClick={() => agir("transformer.copier")} data-vers-niveau="copier">Copier</button>
      </span>
    </details>
  );
}

/** Réseau associatif (D-115) : nombre et pas (ou angle) modifiables, recalcul des copies en un lot ; dissocier. */
function ReseauAssocie({ gid, reseau, readOnly, onCommandes }: { gid: string; reseau: NonNullable<ModeleAtelier["groupes"][string]["reseau"]>; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const cm = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));
  const [v, setV] = useState({ nombre: String(reseau.nombre), dx: cm(reseau.dx), dy: cm(reseau.dy), angle: cm(reseau.angle) });
  const polaire = !!reseau.centre;
  const n = Number(v.nombre);
  const lu = { dx: nombreSaisi(v.dx), dy: nombreSaisi(v.dy), angle: nombreSaisi(v.angle) };
  const ok = Number.isInteger(n) && n >= 1 && n <= 500 && (polaire ? lu.angle !== null : lu.dx !== null && lu.dy !== null);
  const champ = (k: keyof typeof v, libelle: string) => <label key={k}>{libelle}<input inputMode="decimal" value={v[k]} disabled={readOnly} onChange={(e) => setV({ ...v, [k]: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-reseau-champ={k} /></label>;
  return (
    <div className="nav-formulaire-altimetrie" data-reseau={gid}>
      <p className="inspecteur-aide">Réseau associatif : {reseau.copies.length} copie(s) de {reseau.sources.join(", ")}.</p>
      {champ("nombre", "Copies")}
      {polaire ? champ("angle", "Angle (°)") : [champ("dx", "Pas en x (m)"), champ("dy", "Pas en y (m)")]}
      {!readOnly && (
        <>
          <button type="button" disabled={!ok} data-reseau-recalculer onClick={() => onCommandes([{ type: "reseau.modifier", params: { groupeId: gid, nombre: n, ...(polaire ? { angle: { value: lu.angle!, unit: "deg" } } : { dx: lu.dx!, dy: lu.dy! }) } }], `Recalculer le réseau (${n} copies)`)}>Recalculer</button>
          <button type="button" className="lien" onClick={() => onCommandes([{ type: "reseau.dissocier", params: { groupeId: gid } }], "Dissocier le réseau")}>Dissocier</button>
        </>
      )}
    </div>
  );
}

/**
 * Groupe de la sélection (D-041) : renommer, retirer un membre, ajouter les objets sans groupe au groupe des autres,
 * sélectionner tout le groupe, dissoudre.
 */
function GroupeSelection({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const ids = new Set(sel.map((o) => o.groupeId).filter((x): x is string => !!x));
  const [nom, setNom] = useState<string | null>(null);
  if (ids.size !== 1) return null;
  const gid = [...ids][0]!;
  const groupe = etat.groupes[gid];
  if (!groupe) return null;
  const membres = Object.values(etat.objets).filter((o) => o.groupeId === gid);
  const sans = sel.filter((o) => !o.groupeId).map((o) => o.id);
  const retirables = sel.filter((o) => o.groupeId === gid).map((o) => o.id);
  const tenu = groupe.verrouille === true;
  return (
    <details className="inspecteur-groupe" data-groupe={gid} open={tenu || undefined}>
      <summary>
        Groupe « {groupe.nom} » ({membres.length}){tenu ? " · verrouillé" : ""}
      </summary>
      {groupe.reseau && <ReseauAssocie gid={gid} reseau={groupe.reseau} readOnly={readOnly || tenu} onCommandes={onCommandes} />}
      <label className="case">
        <input type="checkbox" checked={tenu} disabled={readOnly} data-groupe-action="verrouiller" onChange={(e) => onCommandes([{ type: "groupe.modifier", params: { id: gid, verrouille: e.target.checked } }], `${e.target.checked ? "Verrouiller" : "Déverrouiller"} le groupe « ${groupe.nom} »`)} /> Groupe verrouillé (membres non modifiables)
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (nom && nom.trim() && nom.trim() !== groupe.nom) onCommandes([{ type: "groupe.modifier", params: { id: gid, nom: nom.trim() } }], `Renommer le groupe « ${groupe.nom} »`);
          setNom(null);
        }}
      >
        <label htmlFor={`groupe-nom-${gid}`}>Nom</label>
        <input id={`groupe-nom-${gid}`} value={nom ?? groupe.nom} disabled={readOnly} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={120} />
      </form>
      <ProprietesCible cible={{ groupeId: gid }} proprietes={groupe.proprietes} readOnly={readOnly} onCommandes={onCommandes} libelle={`groupe « ${groupe.nom} »`} />
      <span className="ver-actions">
        <button type="button" onClick={() => etatUi.set({ selection: membres.map((o) => o.id) })}>Sélectionner le groupe</button>
        {sans.length > 0 && (
          <button type="button" disabled={readOnly} onClick={() => onCommandes([{ type: "groupe.modifier", params: { id: gid, ajouter: sans } }], `Ajouter ${sans.length} objet(s) au groupe « ${groupe.nom} »`)} data-groupe-action="ajouter">
            Ajouter au groupe ({sans.length})
          </button>
        )}
        {!tenu && retirables.length > 0 && retirables.length < membres.length && (
          <button type="button" disabled={readOnly} onClick={() => onCommandes([{ type: "groupe.modifier", params: { id: gid, retirer: retirables } }], `Retirer ${retirables.length} objet(s) du groupe « ${groupe.nom} »`)} data-groupe-action="retirer">
            Retirer du groupe ({retirables.length})
          </button>
        )}
        {!tenu && membres.every((x) => x.classe === "esquisse" || x.classe === "texte" || x.classe === "solide") && new Set(membres.map((x) => x.niveauId)).size === 1 && (
          <button type="button" disabled={readOnly} data-groupe-action="bloc" onClick={() => {
            // Point de base : coin bas gauche de l'emprise des membres (repère de placement, pas une donnée de projet).
            const pts = membres.flatMap((x) => { const q = x.params as unknown as Record<string, unknown>; return [...((q["points"] as { x: number; y: number }[] | undefined) ?? []), ...((q["contour"] as { x: number; y: number }[] | undefined) ?? []), ...(q["centre"] ? [q["centre"] as { x: number; y: number }] : []), ...(q["position"] ? [q["position"] as { x: number; y: number }] : [])]; });
            const base = pts.length ? { x: Math.min(...pts.map((q) => q.x)), y: Math.min(...pts.map((q) => q.y)) } : { x: 0, y: 0 };
            onCommandes([{ type: "groupe.dissoudre", params: { id: gid } }, { type: "bloc.definir", params: { nom: groupe.nom, cibles: membres.map((x) => x.id), pointDeBase: { ...base, frame: "local", unit: "m" }, remplacer: true } }], `Convertir le groupe « ${groupe.nom} » en bloc`);
          }}>
            Convertir en bloc
          </button>
        )}
        <button type="button" disabled={readOnly} onClick={() => onCommandes([{ type: "groupe.dissoudre", params: { id: gid } }], `Dissoudre le groupe « ${groupe.nom} »`)} data-groupe-action="dissoudre">
          Dissoudre
        </button>
      </span>
    </details>
  );
}

/** Scinder un mur en N parts égales (D-043, `mur.scinder` à plusieurs positions). */
function ScinderEnParts({ o, onCommandes }: { o: Occurrence<"mur">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [n, setN] = useState("");
  const parts = Number(n);
  const valide = Number.isInteger(parts) && parts >= 2 && parts <= 100;
  return (
    <div className="inspecteur-scinder">
      <label htmlFor={`scinder-${o.id}`}>Scinder en parts égales</label>
      <input id={`scinder-${o.id}`} type="number" min={2} max={100} step={1} value={n} placeholder="nombre de parts" onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-scinder="parts" />
      <button type="button" disabled={!valide} onClick={() => { onCommandes([{ type: "mur.scinder", params: { id: o.id, positions: Array.from({ length: parts - 1 }, (_, k) => (k + 1) / parts) } }], `Scinder le mur en ${parts} parts`); setN(""); }} data-scinder="valider">
        Scinder
      </button>
    </div>
  );
}

/** Une propriété saisie une fois pour toute la sélection (D-045) : une commande `propriete.definir` par objet. */
function ProprieteCommune({ sel, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [nom, setNom] = useState("");
  const [valeur, setValeur] = useState("");
  const [unite, setUnite] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const appliquer = () => {
    const v = valeur.trim();
    let val: string | number | boolean = v;
    if (/^-?\d+(?:[.,]\d+)?$/.test(v)) {
      if (!unite.trim()) return setErreur("Valeur numérique sans unité : renseignez l'unité (rien n'est supposé).");
      val = Number(v.replace(",", "."));
    }
    setErreur(null);
    onCommandes(sel.map((o) => ({ type: "propriete.definir", params: { id: o.id, nom: nom.trim(), valeur: val, ...(unite.trim() ? { unite: unite.trim() } : {}) } })), `Propriété « ${nom.trim()} » sur ${sel.length} objets`);
    setValeur("");
  };
  return (
    <details className="inspecteur-propriete-commune">
      <summary>Propriété commune</summary>
      <label>Nom<input value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={120} data-propriete="nom" /></label>
      <label>Valeur<input value={valeur} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-propriete="valeur" /></label>
      <label>Unité (si nombre)<input value={unite} onChange={(e) => setUnite(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={20} /></label>
      <button type="button" disabled={readOnly || !nom.trim() || !valeur.trim()} onClick={appliquer} data-propriete="appliquer">Appliquer à {sel.length} objets</button>
      {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
    </details>
  );
}

/** Numéroter les pièces sélectionnées (préfixe et premier numéro saisis ; ordre de lecture du plan ; D-045). */
function NumeroterPieces({ sel, etat, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; etat: ModeleAtelier; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [prefixe, setPrefixe] = useState("");
  const [debut, setDebut] = useState("");
  const [chiffres, setChiffres] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const ids = sel.filter((o) => o.classe === "piece").map((o) => o.id);
  const valider = () => {
    try {
      const c = commandesNumerotationPieces(etat, ids, prefixe, Number(debut), chiffres ? Number(chiffres) : 0);
      setErreur(null);
      onCommandes(c, `Numéroter ${c.length} pièce(s) à partir de ${prefixe}${debut}`);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    }
  };
  return (
    <details className="inspecteur-numeroter">
      <summary>Numéroter {ids.length} pièce(s)</summary>
      <label>Préfixe<input value={prefixe} onChange={(e) => setPrefixe(e.target.value)} onKeyDown={(e) => e.stopPropagation()} maxLength={20} data-numeroter="prefixe" /></label>
      <label>Premier numéro<input type="number" min={0} step={1} value={debut} onChange={(e) => setDebut(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-numeroter="debut" /></label>
      <label>Chiffres (zéros à gauche, facultatif)<input type="number" min={0} max={6} step={1} value={chiffres} onChange={(e) => setChiffres(e.target.value)} onKeyDown={(e) => e.stopPropagation()} /></label>
      <p className="inspecteur-aide">Ordre de lecture du plan : de haut en bas, puis de gauche à droite.</p>
      <button type="button" disabled={readOnly || debut === "" || !Number.isInteger(Number(debut))} onClick={valider} data-numeroter="valider">Numéroter</button>
      {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
    </details>
  );
}

/** Synthèse d'une zone : pièces et espaces contenus, aire totale (calculée, non réglementaire ; D-045). */
function SyntheseZoneVue({ o, etat, desactive, onCommandes }: { o: Occurrence<"zone">; etat: ModeleAtelier; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const s = syntheseZone(etat, o);
  const [candidat, setCandidat] = useState("");
  const niveau = (id: string | null) => (id && etat.niveaux[id] ? etat.niveaux[id]!.nom : "sans niveau");
  // Membres déclarés (relations « contient ») : pièces, espaces et sous-zones, de tout niveau (D-056).
  const declares = new Set(Object.values(etat.relations).filter((r) => r.kind === "contient" && r.sourceId === o.id).map((r) => r.targetId));
  const candidats = Object.values(etat.objets)
    .filter((x) => (x.classe === "piece" || x.classe === "espace" || x.classe === "zone") && x.id !== o.id && !declares.has(x.id))
    .map((x) => ({ id: x.id, libelle: `${x.classe === "zone" ? "Zone" : x.classe === "espace" ? "Espace" : "Pièce"} ${[x.classe === "piece" ? x.params.code : null, (x.params as { nom?: string | null }).nom].filter(Boolean).join(" · ") || x.id} (${niveau(x.niveauId)})` }))
    .sort((a, b) => a.libelle.localeCompare(b.libelle, "fr"));
  const NATURE: Record<string, string> = { relation: " (lien déclaré)", "sous-zone": " (par une sous-zone)", contour: "" };
  return (
    <details className="inspecteur-synthese-zone" open data-synthese-zone={s.pieces.length}>
      <summary>Contenu de la zone : {s.pieces.length} pièce(s) ou espace(s), {String(s.aireTotale).replace(".", ",")} m²</summary>
      <ul>
        {s.pieces.map((p) => (
          <li key={p.id}>
            {p.nom} — {String(p.aire).replace(".", ",")} m²{p.niveauId !== o.niveauId ? ` · ${niveau(p.niveauId)}` : ""}{NATURE[p.par]}
            {p.par === "relation" && !desactive && <button type="button" className="lien" data-zone-retirer={p.id} onClick={() => onCommandes([{ type: "zone.affecter", params: { zoneId: o.id, retirer: [p.id] } }], `Retirer ${p.nom} de la zone`)}>Retirer</button>}
          </li>
        ))}
      </ul>
      {s.sousZones.length > 0 && (
        <p>
          Sous-zones : {s.sousZones.map((z, i) => (
            <span key={z.id}>
              {i ? ", " : ""}{z.nom}
              {declares.has(z.id) && !desactive && <button type="button" className="lien" onClick={() => onCommandes([{ type: "zone.affecter", params: { zoneId: o.id, retirer: [z.id] } }], `Retirer la sous-zone ${z.nom}`)}>retirer</button>}
            </span>
          ))}
        </p>
      )}
      {!desactive && candidats.length > 0 && (
        <span className="ver-actions">
          <select aria-label="Pièce, espace ou zone à rattacher" value={candidat} onChange={(e) => setCandidat(e.target.value)} data-zone-candidat>
            <option value="">Rattacher…</option>
            {candidats.map((c) => <option key={c.id} value={c.id}>{c.libelle}</option>)}
          </select>
          <button type="button" disabled={!candidat} data-zone-rattacher onClick={() => { onCommandes([{ type: "zone.affecter", params: { zoneId: o.id, ajouter: [candidat] } }], `Rattacher ${candidats.find((c) => c.id === candidat)?.libelle ?? candidat} à la zone`); setCandidat(""); }}>
            Rattacher
          </button>
        </span>
      )}
      <p className="inspecteur-aide">Aires nettes calculées sur les contours (règle de mesure réglementaire non appliquée). Appartenance par contour (même niveau) ou déclarée (tout niveau, sous-zones comprises).</p>
    </details>
  );
}


/**
 * Outil Plancher (D-069, DA-07-05) : ligne de rive choisie explicitement, propositions listées (aire, trémies),
 * interstices des murs avec la jonction proposée, planchers existants et leurs écarts avec « Reprendre ». Rien n'est
 * écrit sans un clic.
 */
function PropositionsPlancherVue({ etat, ui, readOnly, onCommandes }: { etat: ModeleAtelier; ui: EtatUi; readOnly: boolean; onCommandes?: (commandes: Commande[], label: string) => void }) {
  const rive = ui.parametresOutil["rivePlancher"];
  const exclues = Array.isArray(ui.parametresOutil["tremiesExclues"]) ? (ui.parametresOutil["tremiesExclues"] as string[]) : [];
  const props = ui.niveauId && (rive === "axe" || rive === "exterieur") ? proposerPlancher(etat, ui.niveauId, rive) : null;
  const vus = new Set<string>();
  const interstices = (props?.interstices ?? []).filter((x) => {
    if (!x.voisinId) return true;
    const cle = [x.murId, x.voisinId].sort().join("|");
    if (vus.has(cle)) return false;
    vus.add(cle);
    return true;
  });
  return (
    <div className="inspecteur-plancher" data-plancher-outil>
      <div className="champ">
        <label htmlFor="outil-rivePlancher">Ligne de rive</label>
        <select id="outil-rivePlancher" data-plancher-rive value={rive === "axe" || rive === "exterieur" ? rive : ""} onChange={(e) => etatUi.set((u) => ({ parametresOutil: { ...u.parametresOutil, rivePlancher: e.target.value || undefined } }))}>
          <option value="">— à choisir —</option>
          <option value="axe">Axe (ligne de référence) des murs</option>
          <option value="exterieur">Face extérieure des murs</option>
        </select>
      </div>
      {props && (
        <>
          <p className="inspecteur-aide" data-plancher-propositions={props.contours.length}>
            {props.contours.length
              ? `${props.contours.length} contour(s) proposé(s) : ${props.contours.map((c) => `${fmt(c.aire)} m² (${c.trous.length} trémie(s))`).join(" ; ")}. Aire géométrique, pas une surface réglementaire.`
              : "Aucun contour fermé de murs sur ce niveau."}
          </p>
          {props.contours.some((c) => c.trous.length > 0) && (
            // Choix trou par trou (D-098) : décocher écarte la trémie du plancher créé au clic ; rien n'est écrit ici.
            <ul className="inspecteur-liste" data-plancher-tremies>
              {props.contours.flatMap((c, i) =>
                c.trous.map((t) => {
                  const cle = cleTremie(t);
                  const retenue = !exclues.includes(cle);
                  return (
                    <li key={`${i}|${cle}`}>
                      <label>
                        <input type="checkbox" checked={retenue} data-tremie={cle} onChange={(e) => etatUi.set((u) => { const avant = Array.isArray(u.parametresOutil["tremiesExclues"]) ? (u.parametresOutil["tremiesExclues"] as string[]) : []; return { parametresOutil: { ...u.parametresOutil, tremiesExclues: e.target.checked ? avant.filter((x) => x !== cle) : [...avant, cle] } }; })} />
                        Trémie {t.escaliers.join(", ")} — {fmt(Math.round(aire(t.contour) * 100) / 100)} m²{props.contours.length > 1 ? ` (contour ${i + 1})` : ""}
                      </label>
                    </li>
                  );
                }),
              )}
            </ul>
          )}
          {props.tremiesIsolees.length > 0 && <p className="inspecteur-aide">{props.tremiesIsolees.length} trémie(s) d'escalier hors de tout contour proposé.</p>}
          {interstices.length > 0 && (
            <ul className="inspecteur-liste" data-plancher-interstices={interstices.length}>
              {interstices.map((x, i) => (
                <li key={i}>
                  Interstice : extrémité libre de {x.murId}
                  {x.voisinId && x.distance !== null ? ` (à ${fmt(x.distance)} m de ${x.voisinId})` : ""}
                  {x.voisinId && !readOnly && onCommandes && (
                    <button type="button" className="lien" data-plancher-joindre={x.murId} onClick={() => onCommandes([{ type: "mur.joindre", params: { id: x.murId, autreId: x.voisinId } }, { type: "mur.joindre", params: { id: x.voisinId, autreId: x.murId } }], `Joindre ${x.murId} et ${x.voisinId}`)}>
                      Joindre
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {props.planchers.length > 0 && (
            <ul className="inspecteur-liste" data-plancher-existants={props.planchers.length}>
              {props.plusieurs && <li>Plusieurs planchers sur ce niveau : signalé, rien n'est fusionné.</li>}
              {props.planchers.map((p) => {
                const prop = p.proposition !== null ? props.contours[p.proposition] : null;
                const d = etat.objets[p.dalleId];
                const ecart = p.contourDifferent || p.tremiesAbsentes.length > 0;
                return (
                  <li key={p.dalleId} data-plancher-ecart={ecart ? "oui" : "non"}>
                    {p.dalleId} : {prop === null ? "hors des contours proposés" : !ecart ? "conforme à la proposition" : [p.contourDifferent ? "contour différent de l'emprise actuelle des murs" : null, p.tremiesAbsentes.length ? `${p.tremiesAbsentes.length} trémie(s) absente(s)` : null].filter(Boolean).join(" ; ")}
                    {ecart && prop && d?.classe === "dalle" && !readOnly && onCommandes && (
                      <button
                        type="button"
                        className="lien"
                        data-plancher-reprendre={p.dalleId}
                        onClick={() => onCommandes([{ type: "objet.modifier", params: { id: p.dalleId, params: { ...(p.contourDifferent ? { contour: prop.contour } : {}), trous: [...(p.contourDifferent ? d.params.trous.filter((h) => h.every((q) => prop.contour.length > 0 && dansContour(q, prop.contour))) : d.params.trous), ...p.tremiesAbsentes.map((t) => t.contour)] } } }], `Reprendre le plancher ${p.dalleId}`)}
                      >
                        Reprendre
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function dansContour(p: { x: number; y: number }, poly: readonly { x: number; y: number }[]): boolean {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) dedans = !dedans;
  }
  return dedans;
}

/**
 * Liaison de la pièce à un espace programmé (D-071, DA-07-15) : la liaison appartient au cas de programme appliqué
 * (module Programmation, mêmes routes et mêmes contrôles que « Programme ↔ modèle dessiné ») ; la pièce doit être
 * enregistrée sur le serveur. Sans programme appliqué : dit, rien n'est proposé.
 */
function EspaceProgramme({ projectId, pieceId, readOnly }: { projectId: string; /** Identifiant de zone de l'analyse : « niveau|pièce ». */ pieceId: string; readOnly: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const qc = useQueryClient();
  const liens = useQuery({ queryKey: ["programme-links", projectId], queryFn: () => api.getProgrammeModelLinks(projectId), enabled: ouvert, retry: false });
  const lier = useMutation({
    mutationFn: async ({ spaceId, retirer }: { spaceId: string; retirer: boolean }) => (retirer ? api.unlinkProgrammeRoom(projectId, spaceId, pieceId) : api.linkProgrammeRoom(projectId, spaceId, pieceId)),
    onSuccess: () => {
      setErreur(null);
      setChoix("");
      for (const k of ["programme-links", "programme", "steps", "design-review"]) void qc.invalidateQueries({ queryKey: [k, projectId] });
    },
    onError: (e) => setErreur(e instanceof ApiError && e.serverMessage ? e.serverMessage : "Liaison refusée."),
  });
  const v = liens.data;
  const lies = v?.rows.filter((r) => r.linked.some((x) => x.id === pieceId) || r.missing.includes(pieceId)) ?? [];
  return (
    <details className="inspecteur-historique" data-espace-programme onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Espace programmé</summary>
      {liens.isLoading && <p role="status">Lecture du programme…</p>}
      {liens.isError && <p className="ver-erreur">Programme indisponible (hors ligne ?).</p>}
      {v && !v.applied && <p className="nav-vide">Aucun programme appliqué à ce projet : rien à lier (Programmation, étape 07).</p>}
      {v?.applied && (
        <>
          {lies.length === 0 ? <p className="nav-vide">Pièce liée à aucun espace programmé.</p> : (
            <ul className="inspecteur-liste">
              {lies.map((r) => (
                <li key={r.space.id} data-espace-lie={r.space.id}>
                  {r.space.name} (cible {String(r.space.target).replace(".", ",")} m²{r.drawnArea !== null ? `, dessiné ${String(r.drawnArea).replace(".", ",")} m²` : ""})
                  {!readOnly && <button type="button" className="lien" disabled={lier.isPending} onClick={() => lier.mutate({ spaceId: r.space.id, retirer: true })}>Délier</button>}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <form className="nav-formulaire-altimetrie" onSubmit={(e) => { e.preventDefault(); if (choix) lier.mutate({ spaceId: choix, retirer: false }); }}>
              <select aria-label="Espace programmé à lier" value={choix} onChange={(e) => setChoix(e.target.value)} data-espace-choix>
                <option value="">— espace —</option>
                {v.rows.filter((r) => !lies.includes(r)).map((r, i) => <option key={`${r.space.id}-${i}`} value={r.space.id}>{r.space.name}</option>)}
              </select>
              <button type="submit" disabled={!choix || lier.isPending}>Lier</button>
            </form>
          )}
          {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
        </>
      )}
    </details>
  );
}

/**
 * Propriétés en tableau (D-076, DA-05-12) : une ligne par objet sélectionné, une colonne par propriété présente
 * (classification exclue : elle a sa section) ; les cellules modifiées sont enregistrées en un seul lot de
 * `propriete.definir`. Une valeur numérique garde l'unité de la propriété ; sans unité connue, elle est refusée
 * (rien n'est supposé) ; une cellule vidée retire la propriété de l'objet.
 */
function TableauProprietes({ sel, readOnly, onCommandes }: { sel: OccurrenceQuelconque[]; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const lignes = sel.slice(0, 200);
  const [colonnesAjoutees, setColonnesAjoutees] = useState<string[]>([]);
  const [nouvelle, setNouvelle] = useState("");
  const [brouillon, setBrouillon] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const colonnes = [...new Set([...lignes.flatMap((o) => Object.keys(o.proprietes).filter((k) => !k.startsWith("classification:"))), ...colonnesAjoutees])].sort((a, b) => a.localeCompare(b, "fr"));
  const texte = (o: OccurrenceQuelconque, k: string) => {
    const v = o.proprietes[k]?.valeur;
    return v === undefined || v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  };
  const unite = (k: string) => lignes.map((o) => o.proprietes[k]?.unite).find((u) => !!u) ?? null;
  const cle = (id: string, k: string) => `${id}\u0000${k}`;
  const modifiees = Object.entries(brouillon).filter(([c, v]) => {
    const [id, k] = c.split("\u0000") as [string, string];
    const o = lignes.find((x) => x.id === id);
    return o && v !== texte(o, k);
  });
  const enregistrer = () => {
    const commandes: Commande[] = [];
    for (const [c, v] of modifiees) {
      const [id, k] = c.split("\u0000") as [string, string];
      const t = v.trim();
      if (!t) {
        commandes.push({ type: "propriete.definir", params: { id, nom: k } });
        continue;
      }
      const o = lignes.find((x) => x.id === id)!;
      const u = o.proprietes[k]?.unite ?? unite(k);
      if (/^-?\d+(?:[.,]\d+)?$/.test(t)) {
        if (!u) return setErreur(`« ${k} » de ${id} : valeur numérique sans unité connue — saisissez-la par « Propriété commune » avec son unité.`);
        commandes.push({ type: "propriete.definir", params: { id, nom: k, valeur: Number(t.replace(",", ".")), unite: u } });
      } else commandes.push({ type: "propriete.definir", params: { id, nom: k, valeur: t } });
    }
    if (!commandes.length) return;
    setErreur(null);
    onCommandes(commandes, `Propriétés en tableau (${commandes.length} cellule(s))`);
    setBrouillon({});
  };
  return (
    <details className="inspecteur-tableau-proprietes" data-tableau-proprietes>
      <summary>Propriétés en tableau</summary>
      {sel.length > lignes.length && <p className="inspecteur-aide">Les 200 premiers objets seulement.</p>}
      {colonnes.length === 0 ? <p className="nav-vide">Aucune propriété sur ces objets : ajoutez une colonne.</p> : (
        <div className="tableau-defilant">
          <table className="tableau-proprietes">
            <thead>
              <tr>
                <th scope="col">Objet</th>
                {colonnes.map((k) => <th key={k} scope="col">{k}{unite(k) ? ` (${unite(k)})` : ""}</th>)}
              </tr>
            </thead>
            <tbody>
              {lignes.map((o) => (
                <tr key={o.id}>
                  <th scope="row">{o.id}</th>
                  {colonnes.map((k) => (
                    <td key={k}>
                      <input
                        aria-label={`${k} de ${o.id}`}
                        value={brouillon[cle(o.id, k)] ?? texte(o, k)}
                        disabled={readOnly}
                        data-cellule={`${o.id}|${k}`}
                        onChange={(e) => setBrouillon((b) => ({ ...b, [cle(o.id, k)]: e.target.value }))}
                        onKeyDown={(e) => e.stopPropagation()}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!readOnly && (
        <form className="nav-formulaire-altimetrie" onSubmit={(e) => { e.preventDefault(); const n = nouvelle.trim(); if (n && !colonnes.includes(n)) setColonnesAjoutees((c) => [...c, n]); setNouvelle(""); }}>
          <input aria-label="Nouvelle colonne (nom de propriété)" placeholder="Nouvelle colonne" value={nouvelle} maxLength={120} onChange={(e) => setNouvelle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tableau-colonne />
          <button type="submit" disabled={!nouvelle.trim()}>Ajouter la colonne</button>
        </form>
      )}
      {!readOnly && <button type="button" disabled={!modifiees.length} onClick={enregistrer} data-tableau-enregistrer>Enregistrer {modifiees.length} modification(s)</button>}
      {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
    </details>
  );
}

/**
 * Reconnaissance de formes proposée (D-079, DA-01-06) : droite, cercle ou rectangle approchant le tracé, avec l'écart
 * maximal ; remplacer seulement sur clic (même identifiant, même calque), jamais seul (R3).
 */
function ReconnaitreForme({ o, onCommandes }: { o: Occurrence<"esquisse">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [ouvert, setOuvert] = useState(false);
  const q = o.params;
  const pts = q.forme === "spline" ? pointsSpline(q.points, 8, q.ferme, q.tangentes) : q.points;
  const propositions = ouvert ? reconnaitreForme(pts, q.ferme) : [];
  const base = { id: o.id, niveauId: o.niveauId, calqueId: o.calqueId };
  const remplacer = (f: (typeof propositions)[number]) => {
    const creer: Commande = f.forme === "ligne" ? { type: "esquisse.ligne", params: { ...base, points: f.points } } : f.forme === "cercle" ? { type: "esquisse.cercle", params: { ...base, centre: f.centre, rayon: { value: f.rayon, unit: "m" } } } : { type: "esquisse.polygone", params: { ...base, points: f.points } };
    onCommandes([{ type: "objet.supprimer", params: { id: o.id } }, creer], `Remplacer ${o.id} par ${f.forme === "polygone" ? "un rectangle" : f.forme === "cercle" ? "un cercle" : "une ligne"} (forme reconnue)`);
  };
  return (
    <details className="inspecteur-historique" data-reconnaissance onToggle={(e) => setOuvert(e.currentTarget.open)}>
      <summary>Reconnaître une forme</summary>
      {ouvert && (propositions.length === 0 ? <p className="nav-vide">Aucune forme simple ne s'approche de ce tracé (écart au-delà de 5 % de sa taille).</p> : (
        <ul className="inspecteur-liste">
          {propositions.map((f, i) => (
            <li key={i} data-forme-reconnue={f.forme}>
              {f.forme === "ligne" ? "Ligne" : f.forme === "cercle" ? `Cercle de rayon ${fmt(f.rayon)} m` : "Rectangle"} · écart maximal {fmt(f.ecart)} m
              <button type="button" className="lien" onClick={() => remplacer(f)}>Remplacer</button>
            </li>
          ))}
        </ul>
      ))}
    </details>
  );
}

/**
 * Tangentes d'une courbe (D-082, DA-01-05) : imposer en un point la direction (angle) et l'intensité (m) de la
 * tangente, ou la libérer ; la courbe passe toujours par ses points.
 */
function TangentesCourbe({ o, onCommandes }: { o: Occurrence<"esquisse">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const n = o.params.points.length;
  const [i, setI] = useState(0);
  const [angle, setAngle] = useState("");
  const [longueur, setLongueur] = useState("");
  const actuelles = o.params.tangentes ?? Array.from({ length: n }, () => null);
  const t = actuelles[i] ?? null;
  const ecrire = (v: { x: number; y: number } | null, label: string) => {
    const tangentes = Array.from({ length: n }, (_, k) => (k === i ? v : (actuelles[k] ?? null)));
    onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { tangentes: tangentes.some((x) => x) ? tangentes : null } } }], label);
  };
  const a = nombreSaisi(angle);
  const l = nombreSaisi(longueur);
  return (
    <details className="inspecteur-historique" data-tangentes>
      <summary>Tangentes ({actuelles.filter(Boolean).length} imposée(s))</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Point
          <select value={i} onChange={(e) => setI(Number(e.target.value))} data-tangente-point>
            {Array.from({ length: n }, (_, k) => <option key={k} value={k}>{k + 1}{actuelles[k] ? " (imposée)" : ""}</option>)}
          </select>
        </label>
        <p className="inspecteur-aide">{t ? `Tangente imposée : ${fmt(Math.round(((Math.atan2(t.y, t.x) * 180) / Math.PI) * 100) / 100)}°, ${fmt(Math.round(Math.hypot(t.x, t.y) * 1000) / 1000)} m.` : "Tangente libre (la courbe suit ses voisins)."}</p>
        <label>Angle (°)<input inputMode="decimal" value={angle} onChange={(e) => setAngle(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tangente-angle /></label>
        <label>Intensité (m)<input inputMode="decimal" value={longueur} onChange={(e) => setLongueur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-tangente-longueur /></label>
        <button type="button" disabled={a === null || l === null || !(l > 0)} onClick={() => ecrire({ x: Math.round(l! * Math.cos((a! * Math.PI) / 180) * 1e9) / 1e9, y: Math.round(l! * Math.sin((a! * Math.PI) / 180) * 1e9) / 1e9 }, `Tangente imposée au point ${i + 1} de ${o.id}`)} data-tangente-imposer>Imposer</button>
        <button type="button" disabled={!t} onClick={() => ecrire(null, `Tangente libérée au point ${i + 1} de ${o.id}`)}>Libérer</button>
      </div>
    </details>
  );
}

/** Menuiserie paramétrée d'une fenêtre (D-101) : valeurs saisies, aucune par défaut ; vide = non évaluée. */
/** Espace sur plusieurs niveaux (D-142) : niveau haut (double hauteur, vide, gaine), niveaux traversés, volume. */
function EspaceNiveaux({ o, etat, desactive, onCommandes }: { o: Occurrence<"espace">; etat: ModeleAtelier; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const bas = o.niveauId ? etat.niveaux[o.niveauId]?.elevation : undefined;
  const dessus = niveauxOrdonnes(etat).filter((n) => bas !== undefined && n.elevation > bas);
  const [haut, setHaut] = useState(o.params.niveauHautId ?? "");
  const ext = etendueEspace(etat, o);
  const traverses = niveauxTraverses(etat, o).map((id) => etat.niveaux[id]?.nom ?? id);
  return (
    <details className="inspecteur-historique" data-espace-niveaux>
      <summary>Hauteur de l'espace ({ext ? `${String(Math.round((ext[1] - ext[0]) * 1000) / 1000).replace(".", ",")} m` : "non évaluée"})</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Monte jusqu'au niveau
          <select value={haut} disabled={desactive || !dessus.length} onChange={(e) => setHaut(e.target.value)} data-espace-niveau-haut>
            <option value="">— aucun (hauteur propre ou non évaluée) —</option>
            {dessus.map((n) => <option key={n.id} value={n.id}>{n.nom}</option>)}
          </select>
        </label>
        <p className="inspecteur-aide" data-espace-traverses>{traverses.length ? `Niveaux traversés : ${traverses.join(", ")} (vide signalé sur leurs plans, aucune surface déduite).` : "Aucun niveau traversé."}</p>
        {!desactive && (
          <button type="button" disabled={haut === (o.params.niveauHautId ?? "")} data-espace-niveaux-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: haut ? { niveauHautId: haut, hauteur: null } : { niveauHautId: null } } }], `Niveau haut de ${o.id}`)}>
            Appliquer
          </button>
        )}
      </div>
    </details>
  );
}

/** Haut de baie (D-141) : droit, plein cintre, surbaissé (flèche saisie) ou ogive ; la hauteur va jusqu'à la clé. */
function CintreBaie({ o, desactive, onCommandes }: { o: Occurrence<"fenetre">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const c = o.params.cintre ?? null;
  const [type, setType] = useState<string>(c?.type ?? "droit");
  const [fleche, setFleche] = useState(c?.fleche ? String(c.fleche.value).replace(".", ",") : "");
  const f = type === "surbaisse" ? longueurSaisie(fleche) : null;
  const w = o.params.largeur.value;
  const valide = type !== "surbaisse" || (f !== null && f > 0 && f < w / 2);
  const libelles: Record<string, string> = { droit: "droit", "plein-cintre": "plein cintre", surbaisse: "surbaissé", ogive: "ogive" };
  return (
    <details className="inspecteur-historique" data-cintre-baie>
      <summary>Haut de baie ({libelles[c?.type ?? "droit"]})</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Forme
          <select value={type} disabled={desactive} onChange={(e) => setType(e.target.value)} data-cintre-type>
            <option value="droit">Droit (rectangulaire)</option>
            <option value="plein-cintre">Plein cintre (demi-cercle)</option>
            <option value="surbaisse">Arc surbaissé</option>
            <option value="ogive">Ogive (arc brisé équilatéral)</option>
          </select>
        </label>
        {type === "surbaisse" && <label>Flèche de l'arc (m)<input inputMode="decimal" value={fleche} disabled={desactive} onChange={(e) => setFleche(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-cintre-fleche /></label>}
        {!valide && fleche !== "" && <p className="inspecteur-aide">Flèche entre 0 et la demi-largeur ({String(w / 2).replace(".", ",")} m) exclues.</p>}
        <p className="inspecteur-aide">La hauteur de la baie est mesurée de l'allège à la clé de l'arc.</p>
        {!desactive && (
          <button type="button" disabled={!valide} data-cintre-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { cintre: type === "droit" ? null : type === "surbaisse" ? { type, fleche: { value: f, unit: "m" } } : { type } } } }], `Haut de baie de ${o.id}`)}>
            Appliquer
          </button>
        )}
      </div>
    </details>
  );
}

/** Dépouille et extrusion oblique d'un solide fermé (D-148) : angles saisis, vides = droit. */
function FormeSolide({ o, desactive, onCommandes }: { o: Occurrence<"solide">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const f = (v: number | undefined) => (v === undefined ? "" : String(v).replace(".", ","));
  const [dep, setDep] = useState(f(o.params.depouille?.value));
  const [inc, setInc] = useState(f(o.params.inclinaison?.angle.value));
  const [dir, setDir] = useState(f(o.params.inclinaison?.direction.value) || "0");
  const d = dep.trim() ? nombreSaisi(dep) : 0;
  const a = inc.trim() ? nombreSaisi(inc) : 0;
  const r = nombreSaisi(dir);
  const valide = d !== null && a !== null && r !== null && Math.abs(d) < 60 && a >= 0 && a <= 60;
  return (
    <details className="inspecteur-historique" data-forme-solide>
      <summary>Extrusion {o.params.depouille ? `· dépouille ${f(o.params.depouille.value)}°` : ""}{o.params.inclinaison ? ` · inclinée ${f(o.params.inclinaison.angle.value)}° vers ${f(o.params.inclinaison.direction.value)}°` : ""}{!o.params.depouille && !o.params.inclinaison ? "droite" : ""}</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Dépouille (°, + resserre, − évase)<input inputMode="decimal" value={dep} disabled={desactive} onChange={(e) => setDep(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-forme-champ="depouille" /></label>
        <label>Inclinaison de l'axe (°)<input inputMode="decimal" value={inc} disabled={desactive} onChange={(e) => setInc(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-forme-champ="inclinaison" /></label>
        <label>Direction de l'inclinaison (°)<input inputMode="decimal" value={dir} disabled={desactive} onChange={(e) => setDir(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-forme-champ="direction" /></label>
        {!valide && <p className="inspecteur-aide">Dépouille entre −60° et 60°, inclinaison de 0 à 60°.</p>}
        {!desactive && (
          <button type="button" disabled={!valide} data-forme-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { depouille: d ? { value: d, unit: "deg" } : null, inclinaison: a ? { angle: { value: a, unit: "deg" }, direction: { value: r, unit: "deg" } } : null } } }], `Extrusion de ${o.id}`)}>
            Appliquer
          </button>
        )}
      </div>
    </details>
  );
}

/** Orientation d'un texte (D-146) : angle en degrés depuis l'horizontale, sens direct. */
function OrientationTexte({ o, desactive, onCommandes }: { o: Occurrence<"texte">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [v, setV] = useState(String(o.params.angle?.value ?? 0).replace(".", ","));
  const a = nombreSaisi(v);
  return (
    <div className="nav-formulaire-altimetrie" data-orientation-texte>
      <label>Orientation (°)<input inputMode="decimal" value={v} disabled={desactive} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-texte-angle /></label>
      {!desactive && (
        <button type="button" disabled={a === null || a === (o.params.angle?.value ?? 0)} data-texte-angle-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { angle: a ? { value: a, unit: "deg" } : null } } }], `Orientation de ${o.id}`)}>
          Orienter
        </button>
      )}
    </div>
  );
}

/** Sens de l'épaisseur et retombée de rive d'une dalle (D-144) : valeurs saisies, aucune par défaut. */
function SensRetombeeDalle({ o, desactive, onCommandes }: { o: Occurrence<"dalle">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const r = o.params.retombee ?? null;
  const [sens, setSens] = useState<string>(o.params.sens ?? "haut");
  const [largeur, setLargeur] = useState(r ? String(r.largeur.value).replace(".", ",") : "");
  const [hauteur, setHauteur] = useState(r ? String(r.hauteur.value).replace(".", ",") : "");
  const l = longueurSaisie(largeur);
  const h = longueurSaisie(hauteur);
  const avecRetombee = largeur !== "" || hauteur !== "";
  const valide = !avecRetombee || (l !== null && l > 0 && h !== null && h > 0);
  const f = (v: number) => String(v).replace(".", ",");
  return (
    <details className="inspecteur-historique" data-dalle-retombee>
      <summary>Épaisseur {o.params.sens === "bas" ? "sous la base" : "sur la base"}{r ? ` · retombée ${f(r.largeur.value)} × ${f(r.hauteur.value)} m` : ""}</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Sens de l'épaisseur
          <select value={sens} disabled={desactive} onChange={(e) => setSens(e.target.value)} data-dalle-sens>
            <option value="haut">Vers le haut (dessous à la base)</option>
            <option value="bas">Vers le bas (dessus à la base)</option>
          </select>
        </label>
        <label>Retombée de rive : largeur (m)<input inputMode="decimal" value={largeur} disabled={desactive} onChange={(e) => setLargeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-retombee-champ="largeur" /></label>
        <label>Retombée de rive : hauteur sous la dalle (m)<input inputMode="decimal" value={hauteur} disabled={desactive} onChange={(e) => setHauteur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-retombee-champ="hauteur" /></label>
        {!valide && <p className="inspecteur-aide">Largeur et hauteur de la retombée toutes deux positives, ou toutes deux vides (sans retombée).</p>}
        {!desactive && (
          <button type="button" disabled={!valide} data-dalle-retombee-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { sens: sens === "bas" ? "bas" : null, retombee: avecRetombee ? { largeur: { value: l, unit: "m" }, hauteur: { value: h, unit: "m" } } : null } } }], `Épaisseur et retombée de ${o.id}`)}>
            Appliquer
          </button>
        )}
      </div>
    </details>
  );
}

/** Pente d'une dalle (D-140) : angle (0 à 60°) et direction de montée (0° = +x) ; l'épaisseur reste verticale. */
function PenteDalle({ o, desactive, onCommandes }: { o: Occurrence<"dalle">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const p = o.params.pente ?? null;
  const [v, setV] = useState({ angle: p ? String(p.angle.value).replace(".", ",") : "", direction: p ? String(p.direction.value).replace(".", ",") : "0" });
  const angle = nombreSaisi(v.angle);
  const direction = nombreSaisi(v.direction);
  const valide = angle !== null && angle > 0 && angle <= 60 && direction !== null;
  return (
    <details className="inspecteur-historique" data-pente-dalle>
      <summary>Pente {p ? `(${String(p.angle.value).replace(".", ",")}° vers ${String(p.direction.value).replace(".", ",")}°)` : "(dalle horizontale)"}</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Pente (°)<input inputMode="decimal" value={v.angle} disabled={desactive} onChange={(e) => setV({ ...v, angle: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-pente-champ="angle" /></label>
        <label>Direction de montée (°)<input inputMode="decimal" value={v.direction} disabled={desactive} onChange={(e) => setV({ ...v, direction: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-pente-champ="direction" /></label>
        {!valide && v.angle !== "" && <p className="inspecteur-aide">Pente entre 0 (exclu) et 60°, direction en degrés.</p>}
        {!desactive && (
          <button type="button" disabled={!valide} data-pente-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { pente: { angle: { value: angle, unit: "deg" }, direction: { value: direction, unit: "deg" } } } } }], `Pente de ${o.id}`)}>
            Appliquer la pente
          </button>
        )}
        {!desactive && p && <button type="button" className="lien" onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { pente: null } } }], `Pente retirée de ${o.id}`)}>Rendre horizontale</button>}
      </div>
    </details>
  );
}

/** Section d'un poteau (D-139) : rectangle, cercle (diamètre = largeur), profilés I, T, L, U avec l'épaisseur des parois saisie. */
function SectionPoteau({ o, desactive, onCommandes }: { o: Occurrence<"poteau">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const connue = ["rectangle", "cercle", "I", "T", "L", "U"].includes(o.params.formeId) ? o.params.formeId : "rectangle";
  const [forme, setForme] = useState(o.params.formeId === "rond" ? "cercle" : connue);
  const [ep, setEp] = useState(o.params.epaisseurProfil ? String(o.params.epaisseurProfil.value).replace(".", ",") : "");
  const [retournee, setRetournee] = useState(!!o.params.miroir);
  const profile = ["I", "T", "L", "U"].includes(forme);
  const e = profile ? longueurSaisie(ep) : null;
  const valide = !profile || (e !== null && e > 0);
  return (
    <div className="nav-formulaire-altimetrie" data-section-poteau>
      <label>Section
        <select value={forme} disabled={desactive} onChange={(ev) => setForme(ev.target.value)} data-section-forme>
          <option value="rectangle">Rectangulaire{o.params.formeId !== "rectangle" && !["cercle", "rond", "I", "T", "L", "U"].includes(o.params.formeId) ? ` (« ${o.params.formeId} »)` : ""}</option>
          <option value="cercle">Circulaire (diamètre = largeur)</option>
          <option value="I">Profilé I (H)</option>
          <option value="T">Profilé T</option>
          <option value="L">Cornière L</option>
          <option value="U">Profilé U</option>
        </select>
      </label>
      {profile && <label>Épaisseur des parois (m)<input inputMode="decimal" value={ep} disabled={desactive} onChange={(ev) => setEp(ev.target.value)} onKeyDown={(ev) => ev.stopPropagation()} data-section-epaisseur /></label>}
      {/* Cornière retournée (D-146) : la seule section sans axe de symétrie. */}
      {forme === "L" && <label className="case"><input type="checkbox" checked={retournee} disabled={desactive} onChange={(ev) => setRetournee(ev.target.checked)} data-section-miroir /> Cornière retournée (symétrique)</label>}
      {!desactive && (
        <button type="button" disabled={!valide} data-section-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { formeId: forme === "rectangle" && !["cercle", "rond", "I", "T", "L", "U"].includes(o.params.formeId) ? o.params.formeId : forme, epaisseurProfil: profile ? { value: e, unit: "m" } : null, miroir: forme === "L" && retournee ? true : null } } }], `Section de ${o.id}`)}>
          Appliquer la section
        </button>
      )}
    </div>
  );
}

/** Axes associés au centre d'un cercle, d'un arc ou d'une ellipse (D-132) : deux lignes de construction qui suivent. */
function AxesCentre({ o, onCommandes }: { o: Occurrence<"esquisse">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [debord, setDebord] = useState("0,2");
  const d = longueurSaisie(debord);
  return (
    <div className="nav-formulaire-altimetrie" data-axes-centre>
      <label>Débord des axes (m)<input inputMode="decimal" value={debord} onChange={(e) => setDebord(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-axes-debord /></label>
      <button type="button" className="lien" disabled={d === null || d < 0} data-axes-creer onClick={() => onCommandes([{ type: "esquisse.axesCentre", params: { id: o.id, debord: d } }], `Axes associés au centre de ${o.id}`)}>
        Axes associés (suivent le centre)
      </button>
    </div>
  );
}

/** Dégradé d'une hachure (D-120) : deux gris (0 % noir … 100 % blanc) et une direction ; il remplace le motif. */
function DegradeHachure({ o, desactive, onCommandes }: { o: Occurrence<"esquisse">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const d = o.params.degrade ?? null;
  const pc = (x: number) => String(Math.round(x * 100));
  const [v, setV] = useState({ de: d ? pc(d.de) : "20", a: d ? pc(d.a) : "100", angle: d ? String(d.angle.value).replace(".", ",") : "0" });
  const de = nombreSaisi(v.de);
  const a = nombreSaisi(v.a);
  const angle = nombreSaisi(v.angle);
  const valide = de !== null && a !== null && angle !== null && de >= 0 && de <= 100 && a >= 0 && a <= 100;
  return (
    <details className="inspecteur-historique" data-degrade-hachure>
      <summary>Dégradé {d ? `(${pc(d.de)} % → ${pc(d.a)} %)` : "(aucun : motif de traits)"}</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Gris de départ (% de blanc)<input inputMode="decimal" value={v.de} disabled={desactive} onChange={(e) => setV({ ...v, de: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-degrade-champ="de" /></label>
        <label>Gris d'arrivée (% de blanc)<input inputMode="decimal" value={v.a} disabled={desactive} onChange={(e) => setV({ ...v, a: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-degrade-champ="a" /></label>
        <label>Direction (°)<input inputMode="decimal" value={v.angle} disabled={desactive} onChange={(e) => setV({ ...v, angle: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-degrade-champ="angle" /></label>
        {!valide && <p className="inspecteur-aide">Gris entre 0 et 100 %, direction en degrés.</p>}
        {!desactive && (
          <button type="button" disabled={!valide} data-degrade-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { degrade: { de: de! / 100, a: a! / 100, angle: { value: angle!, unit: "deg" } } } } }], `Dégradé de ${o.id}`)}>
            Appliquer le dégradé
          </button>
        )}
        {!desactive && d && (
          <button type="button" className="lien" data-degrade-retirer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { degrade: null } } }], `Dégradé retiré de ${o.id}`)}>
            Retirer (revenir au motif)
          </button>
        )}
      </div>
    </details>
  );
}

function MenuiserieFenetre({ o, desactive, onCommandes }: { o: Occurrence<"fenetre">; desactive: boolean; onCommandes: PropsInspecteur["onCommandes"] }) {
  const m = o.params.menuiserie ?? null;
  const cm = (v: number | undefined) => (v === undefined ? "" : String(Math.round(v * 1000) / 1000).replace(".", ","));
  const porte = o.classe === ("porte" as string);
  const [v, setV] = useState({ profil: cm(m?.dormant?.largeur.value), profondeur: cm(m?.dormant?.epaisseur.value), vitrage: cm(m?.vitrage?.epaisseur.value), composition: m?.vitrage?.composition ?? "", vantaux: m?.vantaux ? String(m.vantaux) : "", seuil: cm(m?.seuil?.value) });
  const lu = { profil: nombreSaisi(v.profil), profondeur: nombreSaisi(v.profondeur), vitrage: nombreSaisi(v.vitrage), seuil: nombreSaisi(v.seuil) };
  const dormantPartiel = (lu.profil === null) !== (lu.profondeur === null);
  const menuiserie = {
    ...(lu.profil !== null && lu.profondeur !== null ? { dormant: { largeur: { value: lu.profil, unit: "m" }, epaisseur: { value: lu.profondeur, unit: "m" } } } : {}),
    ...(lu.vitrage !== null ? { vitrage: { epaisseur: { value: lu.vitrage, unit: "m" }, composition: v.composition.trim() || null } } : {}),
    ...(v.vantaux ? { vantaux: Number(v.vantaux) } : {}),
    ...(porte && lu.seuil !== null ? { seuil: { value: lu.seuil, unit: "m" } } : {}),
  };
  const vide = Object.keys(menuiserie).length === 0;
  const champ = (k: "profil" | "profondeur" | "vitrage" | "seuil", libelle: string) => <label key={k}>{libelle}<input inputMode="decimal" value={v[k]} disabled={desactive} onChange={(e) => setV({ ...v, [k]: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-menuiserie-champ={k} /></label>;
  return (
    <details className="inspecteur-historique" data-menuiserie>
      <summary>Menuiserie {m ? (porte && m.vitrage ? "(porte-fenêtre)" : "(renseignée)") : "(non évaluée)"}</summary>
      <div className="nav-formulaire-altimetrie">
        {champ("profil", "Dormant : profil (m)")}
        {champ("profondeur", "Dormant : profondeur (m)")}
        {champ("vitrage", porte ? "Vitrage (porte-fenêtre) : épaisseur (m)" : "Vitrage : épaisseur (m)")}
        <label>Composition<input value={v.composition} maxLength={40} placeholder="ex. 4/16/4" disabled={desactive} onChange={(e) => setV({ ...v, composition: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-menuiserie-champ="composition" /></label>
        {porte && champ("seuil", "Seuil : hauteur (m)")}
        <label>Vantaux<select value={v.vantaux} disabled={desactive} onChange={(e) => setV({ ...v, vantaux: e.target.value })} data-menuiserie-champ="vantaux"><option value="">—</option>{[1, 2, 3, 4, 5, 6].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        {dormantPartiel && <p className="inspecteur-aide">Dormant : profil et profondeur ensemble.</p>}
        {!desactive && (
          <button type="button" disabled={dormantPartiel} data-menuiserie-appliquer onClick={() => onCommandes([{ type: "objet.modifier", params: { id: o.id, params: { menuiserie: vide ? null : menuiserie } } }], vide ? `Menuiserie retirée de ${o.id}` : `Menuiserie de ${o.id}`)}>
            {vide ? "Retirer la menuiserie" : "Appliquer"}
          </button>
        )}
      </div>
    </details>
  );
}

/** Jumeler une ouverture (D-083) : n ouvertures égales et leurs meneaux dans la même emprise. */
function JumelerOuverture({ o, onCommandes }: { o: Occurrence<"porte">; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [nombre, setNombre] = useState("2");
  const [meneau, setMeneau] = useState("");
  const n = Number(nombre);
  const mn = nombreSaisi(meneau);
  return (
    <details className="inspecteur-historique" data-jumeler>
      <summary>Jumeler</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Nombre<select value={nombre} onChange={(e) => setNombre(e.target.value)} data-jumeler-nombre>{[2, 3, 4, 5, 6].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label>Meneau (m)<input inputMode="decimal" value={meneau} onChange={(e) => setMeneau(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-jumeler-meneau /></label>
        <button type="button" disabled={mn === null || !(mn > 0)} onClick={() => onCommandes([{ type: "ouverture.jumeler", params: { id: o.id, nombre: n, meneau: { value: mn!, unit: "m" } } }], `Jumeler ${o.id} en ${n}`)}>Jumeler</button>
      </div>
    </details>
  );
}

/** Ouverture d'angle sur deux murs joints (D-083) : dimensions saisies, aucune par défaut. */
function OuvertureAngle({ murs, onCommandes }: { murs: Occurrence<"mur">[]; onCommandes: PropsInspecteur["onCommandes"] }) {
  const [classe, setClasse] = useState("fenetre");
  const [sansPoteau, setSansPoteau] = useState(false);
  const [v, setV] = useState({ largeurA: "", largeurB: "", hauteur: "", allege: "" });
  const lu = Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nombreSaisi(x)])) as Record<keyof typeof v, number | null>;
  const ok = [lu.largeurA, lu.largeurB, lu.hauteur].every((x) => x !== null && x > 0) && (classe !== "fenetre" || (lu.allege !== null && lu.allege >= 0));
  const champ = (k: keyof typeof v, libelle: string) => <label key={k}>{libelle}<input inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} onKeyDown={(e) => e.stopPropagation()} data-angle-champ={k} /></label>;
  return (
    <details className="inspecteur-historique" data-ouverture-angle>
      <summary>Ouverture d'angle</summary>
      <div className="nav-formulaire-altimetrie">
        <label>Classe<select value={classe} onChange={(e) => setClasse(e.target.value)}><option value="fenetre">fenêtre</option><option value="ouverture">baie</option><option value="porte">porte</option></select></label>
        {champ("largeurA", `Largeur sur ${murs[0]!.id} (m)`)}
        {champ("largeurB", `Largeur sur ${murs[1]!.id} (m)`)}
        {champ("hauteur", "Hauteur (m)")}
        {classe === "fenetre" && champ("allege", "Allège (m)")}
        <label><input type="checkbox" checked={sansPoteau} onChange={(e) => setSansPoteau(e.target.checked)} data-angle-sans-poteau /> Sans poteau (vitrage bord à bord)</label>
        <button type="button" disabled={!ok} onClick={() => onCommandes([{ type: "ouverture.angle", params: { murA: murs[0]!.id, murB: murs[1]!.id, classe, ...(sansPoteau ? { sansPoteau: true } : {}), largeurA: { value: lu.largeurA!, unit: "m" }, largeurB: { value: lu.largeurB!, unit: "m" }, hauteur: { value: lu.hauteur!, unit: "m" }, ...(classe === "fenetre" ? { allege: { value: lu.allege!, unit: "m" } } : {}) } }], `Ouverture d'angle sur ${murs[0]!.id} et ${murs[1]!.id}`)} data-angle-poser>Poser</button>
      </div>
    </details>
  );
}

/**
 * Propriétés d'un groupe ou d'un calque (D-088) : liste, ajout (nom, valeur, unité si nombre), retrait ; mêmes règles
 * que pour les objets (nombre sans unité refusé, rien n'est supposé).
 */
export function ProprietesCible({ cible, proprietes, readOnly, onCommandes, libelle }: { cible: { groupeId: string } | { calqueCible: string }; proprietes: Record<string, { valeur: unknown; unite?: string | null }> | undefined; readOnly: boolean; onCommandes: PropsInspecteur["onCommandes"]; libelle: string }) {
  const [nom, setNom] = useState("");
  const [valeur, setValeur] = useState("");
  const [unite, setUnite] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const entrees = Object.entries(proprietes ?? {}).sort(([a], [b]) => a.localeCompare(b, "fr"));
  const ajouter = () => {
    const v = valeur.trim();
    let val: string | number = v;
    if (/^-?\d+(?:[.,]\d+)?$/.test(v)) {
      if (!unite.trim()) return setErreur("Valeur numérique sans unité : renseignez l'unité (rien n'est supposé).");
      val = Number(v.replace(",", "."));
    }
    setErreur(null);
    onCommandes([{ type: "propriete.definir", params: { ...cible, nom: nom.trim(), valeur: val, ...(unite.trim() ? { unite: unite.trim() } : {}) } }], `Propriété « ${nom.trim()} » du ${libelle}`);
    setNom("");
    setValeur("");
    setUnite("");
  };
  return (
    <div className="proprietes-cible" data-proprietes-cible>
      <p className="inspecteur-aide">Propriétés du {libelle} : {entrees.length ? "" : "aucune."}</p>
      {entrees.length > 0 && (
        <ul className="inspecteur-liste">
          {entrees.map(([k, p]) => (
            <li key={k}>
              {k} : {String(p.valeur)}{p.unite ? ` ${p.unite}` : ""}
              {!readOnly && <button type="button" className="lien" onClick={() => onCommandes([{ type: "propriete.definir", params: { ...cible, nom: k } }], `Retirer la propriété « ${k} » du ${libelle}`)}>Retirer</button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="nav-formulaire-altimetrie">
          <input aria-label="Nom de la propriété" placeholder="Nom" value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-prop-cible="nom" />
          <input aria-label="Valeur" placeholder="Valeur" value={valeur} onChange={(e) => setValeur(e.target.value)} onKeyDown={(e) => e.stopPropagation()} data-prop-cible="valeur" />
          <input aria-label="Unité (si nombre)" placeholder="Unité" value={unite} maxLength={20} onChange={(e) => setUnite(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button type="button" disabled={!nom.trim() || !valeur.trim()} onClick={ajouter} data-prop-cible="ajouter">Ajouter</button>
        </div>
      )}
      {erreur && <p className="ver-erreur" role="alert">{erreur}</p>}
    </div>
  );
}
