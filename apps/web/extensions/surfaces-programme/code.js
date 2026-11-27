// Extension « Surfaces et programme » (catalogue des extensions de la Planche, cas 1 de la feuille de route, extension
// n° 1 ; maquette validée le 27 novembre 2026). Six onglets, un par entrée du catalogue :
//   Tableau des surfaces (n° 1, D9-F10-021) · Programme (n° 17, D9-F10-024) · Capacité (n° 24, D6-F20b-007) ·
//   Typologies (n° 14, D6-F20b-009) · Lots (n° 30, D9-F10-071) · SDP du permis (n° 31, D4-F23-048).
//
// Un local est une face de sol horizontale du contexte ouvert, déclarée avec un numéro, un nom, un usage et un niveau.
// Il sert à tous les onglets qui parlent de locaux (Tableau des surfaces, Lots, SDP du permis).
//
// Aucune valeur réglementaire n'est écrite ici : la destination, l'état (existant, créé, démoli), les déductions et
// leur motif, le coefficient de surface de plancher, la surface du terrain et la surface moyenne d'un logement sont
// déclarés par l'utilisateur. Une valeur qui en dépend sans avoir été déclarée est « non évaluée » ; une valeur tirée
// d'un coefficient déclaré est étiquetée « estimation ». Toute surface calculée porte sa règle.

var VERSION = "1.0.0";
var PANNEAU = "surfaces";
var ONGLETS = ["surfaces", "programme", "capacite", "typologies", "lots", "sdp"];
var REGLES = {
  surfaces: "tableau-surfaces/1",
  programme: "boites-programme/1",
  capacite: "volumes-capacite/1",
  typologies: "typologies-facade/1",
  lots: "lots/1",
  sdp: "sdp-permis/1",
};
var LIGNES_PAR_PAGE = 80;
var TAILLE_PAQUET = 3600;
var MAX_LOCAUX = 2000;
var MAX_PAQUETS = { "locaux.": 60, "programme.": 8, "lots.": 20 };
var MAX_PROGRAMME = 200;
var MAX_BOITES = 300;
var MAX_TYPOLOGIES = 10;
var MAX_NIVEAUX = 60;
var EPS = 1e-9;

var onglet = "surfaces";
var page = 0;
var langue = "fr";

// ——————————————————————————————————————————————— Textes (français, langue source ; anglais)

var T = {
  fr: {
    sansNiveau: "Sans niveau",
    estimation: "estimation",
    nonEvaluee: "non évaluée",
    locaux: function (n) { return n + (n > 1 ? " locaux" : " local"); },
    boites: function (n) { return n + (n > 1 ? " boîtes" : " boîte"); },
    logements: function (n) { return n + (n > 1 ? " logements" : " logement"); },
    regle: {
      surfaces: "Règle : aire nette de la face de sol, trous déduits, arrondie au 0,01 m² ; total = somme des valeurs exactes.",
      programme: "Règle : boîte carrée de côté √(surface cible) arrondi au millimètre ; l'écart entre la surface obtenue et la cible est affiché.",
      capacite: "Règle : surface brute d'un niveau = aire de l'emprise (moins le retrait pour l'attique) ; SDP = surface brute × coefficient déclaré, estimation.",
      typologies: "Règle : rectangle de largeur de façade déclarée et de profondeur = surface ÷ largeur, posé le long de l'arête choisie.",
      lots: "Règle : surface d'un lot = somme des aires nettes de ses locaux, principaux et annexes séparés ; SHAB et Carrez non évaluées sans hauteurs sous plafond.",
      sdp: "Règle : par local qualifié, aire nette moins la déduction déclarée avec son motif ; ventilée par destination et par état.",
    },
    note: {
      surfaces: "Les locaux déclarés ici servent aussi aux onglets Lots (logements, copropriété) et SDP du permis (existante, créée, démolie par destination).",
      programme: "Les boîtes sont posées en ligne à droite du dessin, chacune dans un groupe nommé ; régénérer remplace les boîtes précédentes.",
      capacite: "Sélectionnez la face d'emprise (horizontale) avant de générer ; régénérer remplace les volumes précédents.",
      typologies: "Sélectionnez une arête horizontale de façade avant de remplir ; le remplissage commence à son premier point.",
      lots: "Sélectionnez des faces de locaux déclarés, puis créez ou complétez un logement ou un lot de copropriété.",
      sdp: "Sélectionnez une face de local déclaré, puis qualifiez-la : destination, état, déduction et motif.",
    },
    col: {
      surfaces: ["N°", "Local", "Usage", "Surface"],
      programme: ["Ligne", "Nombre", "Cible", "Côté", "Écart"],
      capacite: ["Niveau", "Base", "Surface brute"],
      typologies: ["Typologie", "Largeur", "Posés", "Mix", "Surface"],
      lots: ["Lot", "Local", "Nature", "Surface"],
      sdp: ["Destination", "Conservée", "Créée", "Démolie"],
    },
    total: "Total",
    // Tableau des surfaces
    titreDeclarer: "Déclarer un local",
    titreModifier: "Modifier le local",
    numero: "Numéro",
    nom: "Nom du local",
    usage: "Usage",
    niveau: "Niveau (vide : sans niveau)",
    retirer: "Retirer ce local du tableau",
    choisirFace: "Sélectionnez une seule face de sol, puis déclarez le local.",
    pasUneFace: "La sélection n'est pas une face : sélectionnez la face de sol du local, pas un groupe ni une arête.",
    pasHorizontale: "Cette face n'est pas horizontale : un local se déclare sur sa face de sol.",
    nomVide: "Le nom est obligatoire : rien n'a été enregistré.",
    tropLocaux: "Le tableau est plein : 2 000 locaux au plus.",
    plein: "Les données de l'extension sont pleines : retirez des lignes avant d'en ajouter.",
    introuvable: "face introuvable dans le niveau ouvert : supprimée, ou dans un autre groupe ; non comptée",
    declare: "Local déclaré : ",
    modifie: "Local modifié : ",
    retire: "Local retiré du tableau : ",
    exporte: "Tableau exporté.",
    videExport: "Rien à exporter : déclarez d'abord un local.",
    fichierSurfaces: "tableau-des-surfaces.csv",
    csvSurfaces: "Tableau des surfaces",
    csvSeparateur: "Séparateur décimal",
    csvEnteteSurfaces: ["Niveau", "N°", "Local", "Usage", "Surface (m²)"],
    sousTotal: "Sous-total",
    videSurfaces: "Aucun local : sélectionnez une face de sol dans le dessin, puis « Déclarer un local ».",
    // Programme
    titreLigne: "Ligne de programme",
    nomLigne: "Nom",
    surfaceCible: "Surface cible",
    hauteur: "Hauteur",
    nombre: "Nombre",
    retirerLigne: "Retirer cette ligne",
    ligneAjoutee: "Ligne de programme enregistrée : ",
    ligneRetiree: "Ligne de programme retirée : ",
    tropLignes: "Le programme est plein : 200 lignes au plus.",
    tropBoites: "Trop de boîtes : 300 au plus en une fois.",
    importer: "Programme chargé : ",
    importLignes: function (n) { return n + (n > 1 ? " lignes" : " ligne"); },
    importVide: "Aucune ligne lisible : colonnes attendues « nom ; surface ; hauteur ; nombre », séparées par « ; ».",
    importRejet: function (n) { return n + (n > 1 ? " lignes ignorées (nom vide ou surface non positive)" : " ligne ignorée (nom vide ou surface non positive)"); },
    programmeVide: "Programme vide : ajoutez une ligne ou importez un CSV d'abord.",
    boitesGenerees: "Boîtes de programme générées : ",
    opBoites: "Générer les boîtes de programme",
    videProgramme: "Aucune ligne : « Ajouter une ligne » ou « Importer un CSV » (nom ; surface ; hauteur ; nombre).",
    totalCible: "Total cible",
    obtenue: "obtenue",
    // Capacité
    titreCapacite: "Volumes de capacité",
    niveaux: "Nombre de niveaux",
    hauteurEtage: "Hauteur d'étage",
    retrait: "Retrait de l'attique (0 : pas d'attique)",
    coefficient: "Coefficient SDP / surface brute",
    terrain: "Surface du terrain (0 : non renseignée)",
    surfaceLogement: "Surface moyenne d'un logement (0 : non renseignée)",
    choisirEmprise: "Sélectionnez une seule face horizontale : l'emprise des volumes.",
    retraitImpossible: "Le retrait de l'attique est trop grand pour cette emprise : rien n'a été dessiné.",
    empriseInvalide: "L'emprise doit être une face sans trou et sans côté nul.",
    opCapacite: "Générer les volumes de capacité",
    opEffacerCapacite: "Effacer les volumes de capacité",
    capaciteGeneree: "Volumes de capacité générés : ",
    capaciteEffacee: "Volumes de capacité effacés.",
    rienAEffacer: "Rien à effacer.",
    videCapacite: "Aucun volume : sélectionnez la face d'emprise, puis « Générer les volumes ».",
    niveauNom: function (k) { return "Niveau " + k; },
    attique: "attique",
    brute: "Surface brute",
    sdpEstimee: "SDP (estimation, coefficient ",
    emprise: "Emprise au sol / terrain",
    densite: "Surface brute / terrain",
    nbLogements: "Logements (estimation)",
    parHectare: "Logements par hectare (estimation)",
    // Typologies
    titreTypologie: "Typologie",
    nomTypologie: "Nom (T2, T3…)",
    surfaceTypologie: "Surface",
    largeur: "Largeur de façade",
    retirerTypologie: "Retirer cette typologie",
    typologieEnregistree: "Typologie enregistrée : ",
    typologieRetiree: "Typologie retirée : ",
    tropTypologies: "La bibliothèque est pleine : 10 typologies au plus.",
    bibliothequeVide: "Bibliothèque vide : ajoutez d'abord une typologie.",
    titreRemplir: "Remplir le long d'une façade",
    combien: function (nom) { return "Nombre de " + nom; },
    cote: "Poser de l'autre côté de l'arête",
    choisirArete: "Sélectionnez une seule arête horizontale de façade.",
    pasHorizontaleArete: "Cette arête n'est pas horizontale : choisissez une arête de façade au sol.",
    tropLong: function (besoin, dispo) { return "La façade est trop courte : " + besoin + " m demandés pour " + dispo + " m disponibles ; rien n'a été dessiné."; },
    rienDemande: "Aucune unité demandée : rien n'a été dessiné.",
    opRemplir: "Remplir le long d'une façade",
    opEffacerRemplissage: "Effacer le remplissage des typologies",
    remplissage: "Unités posées : ",
    remplissageEfface: "Remplissage des typologies effacé.",
    videTypologies: "Aucune typologie : « Ajouter une typologie » (nom, surface, largeur de façade).",
    rapportCapacite: "Part de la surface brute de capacité",
    // Lots
    titreLot: "Logement ou lot",
    genre: "Genre",
    logement: "Logement",
    lotCopro: "Lot de copropriété",
    numeroLot: "Numéro",
    nomLot: "Nom (facultatif)",
    typologieLot: "Typologie (facultatif)",
    etage: "Étage (facultatif)",
    annexe: "Locaux sélectionnés en annexe (cave, parking…)",
    choisirLocaux: "Sélectionnez une ou plusieurs faces de locaux déclarés.",
    nonDeclare: function (n) { return n + (n > 1 ? " faces sélectionnées ne sont pas des locaux déclarés : déclarez-les d'abord." : " face sélectionnée n'est pas un local déclaré : déclarez-la d'abord."); },
    numeroVide: "Le numéro est obligatoire : rien n'a été enregistré.",
    dejaDansLot: function (local, lot) { return "Le local « " + local + " » appartient déjà à « " + lot + " » : retirez-le de ce lot d'abord."; },
    lotEnregistre: "Lot enregistré : ",
    lotRetire: "Lot retiré : ",
    tropLots: "Trop de lots : les données de l'extension sont pleines.",
    principal: "principal",
    annexeNature: "annexe",
    sansLot: "Locaux sans lot",
    shab: "SHAB et Carrez : non évaluées (hauteurs sous plafond non déclarées)",
    videLots: "Aucun lot : sélectionnez des locaux déclarés, puis « Créer ou compléter un lot ».",
    // SDP
    titreQualifier: "Qualifier le local pour le permis",
    destination: "Destination (texte déclaré)",
    etat: "État",
    existant: "Existant conservé",
    cree: "Créé",
    demoli: "Démoli",
    deduction: "Déduction",
    motif: "Motif de la déduction",
    choisirLocal: "Sélectionnez la face d'un seul local déclaré.",
    pasDeclare: "Cette face n'est pas un local déclaré : déclarez-la d'abord dans le tableau des surfaces.",
    motifVide: "Une déduction demande son motif : rien n'a été enregistré.",
    destinationVide: "La destination est obligatoire : rien n'a été enregistré.",
    deductionTrop: "La déduction dépasse l'aire du local : rien n'a été enregistré.",
    qualifie: "Local qualifié : ",
    nonQualifies: "Locaux non qualifiés (non comptés)",
    apres: "Après travaux = conservée + créée",
    fichierSdp: "sdp-du-permis.csv",
    csvSdp: "Surface de plancher du permis",
    csvEnteteSdp: ["Destination", "Conservée (m²)", "Créée (m²)", "Démolie (m²)", "Après travaux (m²)"],
    videSdp: "Aucun local qualifié : sélectionnez la face d'un local déclaré, puis « Qualifier le local ».",
    videExportSdp: "Rien à exporter : qualifiez d'abord un local.",
    choisirLigne: "Choisissez d'abord une ligne du tableau.",
  },
  en: {
    sansNiveau: "No storey",
    estimation: "estimate",
    nonEvaluee: "not assessed",
    locaux: function (n) { return n + (n > 1 ? " rooms" : " room"); },
    boites: function (n) { return n + (n > 1 ? " boxes" : " box"); },
    logements: function (n) { return n + (n > 1 ? " dwellings" : " dwelling"); },
    regle: {
      surfaces: "Rule: net area of the floor face, holes deducted, rounded to 0.01 m²; total = sum of the exact values.",
      programme: "Rule: square box with side √(target area) rounded to the millimetre; the gap between the area obtained and the target is shown.",
      capacite: "Rule: gross area of a storey = footprint area (less the setback for the attic); floor area = gross area × declared coefficient, estimate.",
      typologies: "Rule: rectangle of the declared frontage width and depth = area ÷ width, laid along the chosen edge.",
      lots: "Rule: area of a lot = sum of the net areas of its rooms, main and ancillary kept apart; habitable and Carrez areas not assessed without ceiling heights.",
      sdp: "Rule: per qualified room, net area less the declared deduction with its reason; broken down by use class and by state.",
    },
    note: {
      surfaces: "The rooms declared here also serve the Lots (dwellings, co-ownership) and Permit floor area (existing, created, demolished by use class) tabs.",
      programme: "The boxes are laid in a row to the right of the drawing, each in a named group; generating again replaces the previous boxes.",
      capacite: "Select the (horizontal) footprint face before generating; generating again replaces the previous volumes.",
      typologies: "Select a horizontal façade edge before filling; the fill starts at its first point.",
      lots: "Select faces of declared rooms, then create or complete a dwelling or a co-ownership lot.",
      sdp: "Select the face of a declared room, then qualify it: use class, state, deduction and reason.",
    },
    col: {
      surfaces: ["No.", "Room", "Use", "Area"],
      programme: ["Line", "Count", "Target", "Side", "Gap"],
      capacite: ["Storey", "Base", "Gross area"],
      typologies: ["Unit type", "Width", "Laid", "Mix", "Area"],
      lots: ["Lot", "Room", "Kind", "Area"],
      sdp: ["Use class", "Kept", "Created", "Demolished"],
    },
    total: "Total",
    titreDeclarer: "Declare a room",
    titreModifier: "Edit the room",
    numero: "Number",
    nom: "Room name",
    usage: "Use",
    niveau: "Storey (empty: no storey)",
    retirer: "Remove this room from the schedule",
    choisirFace: "Select a single floor face, then declare the room.",
    pasUneFace: "The selection is not a face: select the room's floor face, not a group or an edge.",
    pasHorizontale: "This face is not horizontal: a room is declared on its floor face.",
    nomVide: "The name is required: nothing was saved.",
    tropLocaux: "The schedule is full: 2,000 rooms at most.",
    plein: "The extension's data is full: remove lines before adding more.",
    introuvable: "face not found in the open level: deleted, or in another group; not counted",
    declare: "Room declared: ",
    modifie: "Room edited: ",
    retire: "Room removed from the schedule: ",
    exporte: "Schedule exported.",
    videExport: "Nothing to export: declare a room first.",
    fichierSurfaces: "area-schedule.csv",
    csvSurfaces: "Area schedule",
    csvSeparateur: "Decimal separator",
    csvEnteteSurfaces: ["Storey", "No.", "Room", "Use", "Area (m²)"],
    sousTotal: "Subtotal",
    videSurfaces: "No room yet: select a floor face in the drawing, then « Declare a room ».",
    titreLigne: "Brief line",
    nomLigne: "Name",
    surfaceCible: "Target area",
    hauteur: "Height",
    nombre: "Count",
    retirerLigne: "Remove this line",
    ligneAjoutee: "Brief line saved: ",
    ligneRetiree: "Brief line removed: ",
    tropLignes: "The brief is full: 200 lines at most.",
    tropBoites: "Too many boxes: 300 at most at once.",
    importer: "Brief loaded: ",
    importLignes: function (n) { return n + (n > 1 ? " lines" : " line"); },
    importVide: "No readable line: expected columns « name ; area ; height ; count », separated by « ; ».",
    importRejet: function (n) { return n + (n > 1 ? " lines skipped (empty name or area not positive)" : " line skipped (empty name or area not positive)"); },
    programmeVide: "Empty brief: add a line or load a CSV first.",
    boitesGenerees: "Brief boxes generated: ",
    opBoites: "Generate the brief boxes",
    videProgramme: "No line yet: « Add a line » or « Load a CSV » (name ; area ; height ; count).",
    totalCible: "Target total",
    obtenue: "obtained",
    titreCapacite: "Capacity volumes",
    niveaux: "Number of storeys",
    hauteurEtage: "Storey height",
    retrait: "Attic setback (0: no attic)",
    coefficient: "Floor area / gross area coefficient",
    terrain: "Site area (0: not given)",
    surfaceLogement: "Average dwelling area (0: not given)",
    choisirEmprise: "Select a single horizontal face: the footprint of the volumes.",
    retraitImpossible: "The attic setback is too large for this footprint: nothing was drawn.",
    empriseInvalide: "The footprint must be a face with no hole and no zero-length side.",
    opCapacite: "Generate the capacity volumes",
    opEffacerCapacite: "Erase the capacity volumes",
    capaciteGeneree: "Capacity volumes generated: ",
    capaciteEffacee: "Capacity volumes erased.",
    rienAEffacer: "Nothing to erase.",
    videCapacite: "No volume yet: select the footprint face, then « Generate the volumes ».",
    niveauNom: function (k) { return "Storey " + k; },
    attique: "attic",
    brute: "Gross area",
    sdpEstimee: "Floor area (estimate, coefficient ",
    emprise: "Footprint / site",
    densite: "Gross area / site",
    nbLogements: "Dwellings (estimate)",
    parHectare: "Dwellings per hectare (estimate)",
    titreTypologie: "Unit type",
    nomTypologie: "Name (1-bed, 2-bed…)",
    surfaceTypologie: "Area",
    largeur: "Frontage width",
    retirerTypologie: "Remove this unit type",
    typologieEnregistree: "Unit type saved: ",
    typologieRetiree: "Unit type removed: ",
    tropTypologies: "The library is full: 10 unit types at most.",
    bibliothequeVide: "Empty library: add a unit type first.",
    titreRemplir: "Fill along a façade",
    combien: function (nom) { return "Number of " + nom; },
    cote: "Lay on the other side of the edge",
    choisirArete: "Select a single horizontal façade edge.",
    pasHorizontaleArete: "This edge is not horizontal: choose a façade edge at ground level.",
    tropLong: function (besoin, dispo) { return "The façade is too short: " + besoin + " m requested for " + dispo + " m available; nothing was drawn."; },
    rienDemande: "No unit requested: nothing was drawn.",
    opRemplir: "Fill along a façade",
    opEffacerRemplissage: "Erase the unit type fill",
    remplissage: "Units laid: ",
    remplissageEfface: "Unit type fill erased.",
    videTypologies: "No unit type yet: « Add a unit type » (name, area, frontage width).",
    rapportCapacite: "Share of the capacity gross area",
    titreLot: "Dwelling or lot",
    genre: "Kind",
    logement: "Dwelling",
    lotCopro: "Co-ownership lot",
    numeroLot: "Number",
    nomLot: "Name (optional)",
    typologieLot: "Unit type (optional)",
    etage: "Floor (optional)",
    annexe: "Selected rooms as ancillary (cellar, parking…)",
    choisirLocaux: "Select one or more faces of declared rooms.",
    nonDeclare: function (n) { return n + (n > 1 ? " selected faces are not declared rooms: declare them first." : " selected face is not a declared room: declare it first."); },
    numeroVide: "The number is required: nothing was saved.",
    dejaDansLot: function (local, lot) { return "Room « " + local + " » already belongs to « " + lot + " »: remove it from that lot first."; },
    lotEnregistre: "Lot saved: ",
    lotRetire: "Lot removed: ",
    tropLots: "Too many lots: the extension's data is full.",
    principal: "main",
    annexeNature: "ancillary",
    sansLot: "Rooms without a lot",
    shab: "Habitable and Carrez areas: not assessed (ceiling heights not declared)",
    videLots: "No lot yet: select declared rooms, then « Create or complete a lot ».",
    titreQualifier: "Qualify the room for the permit",
    destination: "Use class (declared text)",
    etat: "State",
    existant: "Existing, kept",
    cree: "Created",
    demoli: "Demolished",
    deduction: "Deduction",
    motif: "Reason for the deduction",
    choisirLocal: "Select the face of a single declared room.",
    pasDeclare: "This face is not a declared room: declare it first in the area schedule.",
    motifVide: "A deduction needs its reason: nothing was saved.",
    destinationVide: "The use class is required: nothing was saved.",
    deductionTrop: "The deduction exceeds the room's area: nothing was saved.",
    qualifie: "Room qualified: ",
    nonQualifies: "Rooms not qualified (not counted)",
    apres: "After works = kept + created",
    fichierSdp: "permit-floor-area.csv",
    csvSdp: "Permit floor area",
    csvEnteteSdp: ["Use class", "Kept (m²)", "Created (m²)", "Demolished (m²)", "After works (m²)"],
    videSdp: "No qualified room yet: select the face of a declared room, then « Qualify the room ».",
    videExportSdp: "Nothing to export: qualify a room first.",
    choisirLigne: "Choose a line of the table first.",
  },
};
var tx = function () { return T[langue === "en" ? "en" : "fr"]; };
var retenirLangue = function (d) { if (d && (d.langue === "fr" || d.langue === "en")) langue = d.langue; };
var a = function (m) { return planche.message.afficher(m, "alerte"); };
var info = function (m) { return planche.message.afficher(m); };

// ——————————————————————————————————————————————— Données de l'extension (projet), par paquets

/** Lit une liste rangée par paquets sous « <prefixe>0 », « <prefixe>1 »… */
async function lireListe(prefixe) {
  var toutes = (await planche.donnees.lire("projet")) || {};
  var cles = Object.keys(toutes).filter(function (k) { return k.indexOf(prefixe) === 0 && /^\d+$/.test(k.slice(prefixe.length)); });
  cles.sort(function (x, y) { return Number(x.slice(prefixe.length)) - Number(y.slice(prefixe.length)); });
  var liste = [];
  cles.forEach(function (k) { (Array.isArray(toutes[k]) ? toutes[k] : []).forEach(function (e) { if (Array.isArray(e)) liste.push(e); }); });
  return { liste: liste, cles: cles };
}

/** Réécrit la liste en paquets (dans l'opération de l'appel : un seul pas d'annulation) et efface les paquets de trop. */
async function ecrireListe(prefixe, entrees, anciennesCles) {
  var paquets = [];
  var courant = [];
  var taille = 2;
  entrees.forEach(function (e) {
    var n = JSON.stringify(e).length + 1;
    if (courant.length && taille + n > TAILLE_PAQUET) {
      paquets.push(courant);
      courant = [];
      taille = 2;
    }
    courant.push(e);
    taille += n;
  });
  if (courant.length) paquets.push(courant);
  if (paquets.length > MAX_PAQUETS[prefixe]) throw new Error(tx().plein);
  for (var i = 0; i < paquets.length; i++) await planche.donnees.ecrire("projet", prefixe + i, paquets[i]);
  for (var j = paquets.length; j < anciennesCles.length; j++) await planche.donnees.effacer("projet", prefixe + j);
}

var texte = function (v) { return v === undefined || v === null ? "" : String(v); };
var nombreOu = function (v, defaut) { return typeof v === "number" && isFinite(v) ? v : defaut; };

// Local : [face, numéro, nom, usage, niveau, destination, état, déduction, motif]
async function lireLocaux() {
  var l = await lireListe("locaux.");
  return {
    cles: l.cles,
    locaux: l.liste.filter(function (e) { return typeof e[0] === "string"; }).map(function (e) {
      return { face: e[0], numero: texte(e[1]), nom: texte(e[2]), usage: texte(e[3]), niveau: texte(e[4]), destination: texte(e[5]), etat: texte(e[6]), deduction: nombreOu(e[7], 0), motif: texte(e[8]) };
    }),
  };
}
var ecrireLocaux = function (locaux, cles) {
  return ecrireListe("locaux.", locaux.map(function (l) {
    var e = [l.face, l.numero, l.nom, l.usage, l.niveau];
    if (l.etat) e.push(l.destination, l.etat, l.deduction, l.motif);
    return e;
  }), cles);
};

// Ligne de programme : [id, nom, surface, hauteur, nombre]
async function lireProgramme() {
  var l = await lireListe("programme.");
  return {
    cles: l.cles,
    lignes: l.liste.map(function (e) { return { id: texte(e[0]), nom: texte(e[1]), surface: nombreOu(e[2], 0), hauteur: nombreOu(e[3], 3), nombre: Math.max(1, Math.floor(nombreOu(e[4], 1))) }; }),
  };
}
var ecrireProgramme = function (lignes, cles) {
  return ecrireListe("programme.", lignes.map(function (l) { return [l.id, l.nom, l.surface, l.hauteur, l.nombre]; }), cles);
};

// Lot : [id, genre, numéro, nom, typologie, étage, faces principales, faces annexes]
async function lireLots() {
  var l = await lireListe("lots.");
  return {
    cles: l.cles,
    lots: l.liste.map(function (e) {
      return { id: texte(e[0]), genre: e[1] === "lot" ? "lot" : "logement", numero: texte(e[2]), nom: texte(e[3]), typologie: texte(e[4]), etage: texte(e[5]), faces: Array.isArray(e[6]) ? e[6].map(String) : [], annexes: Array.isArray(e[7]) ? e[7].map(String) : [] };
    }),
  };
}
var ecrireLots = function (lots, cles) {
  return ecrireListe("lots.", lots.map(function (l) { return [l.id, l.genre, l.numero, l.nom, l.typologie, l.etage, l.faces, l.annexes]; }), cles);
};

async function lireCle(cle, defaut) {
  var v = await planche.donnees.lire("projet", cle);
  return v === null || v === undefined ? defaut : v;
}

var nouvelId = function (prefixe, existants) {
  var n = existants.length + 1;
  var ids = {};
  existants.forEach(function (x) { ids[x] = true; });
  while (ids[prefixe + n]) n++;
  return prefixe + n;
};

// ——————————————————————————————————————————————— Géométrie

var comparer = function (x, y) { return x.localeCompare(y, langue, { numeric: true, sensitivity: "base" }); };

/** Normale d'un contour (méthode de Newell), non normée. */
function normale(points) {
  var n = [0, 0, 0];
  for (var i = 0; i < points.length; i++) {
    var p = points[i];
    var q = points[(i + 1) % points.length];
    n[0] += (p[1] - q[1]) * (p[2] + q[2]);
    n[1] += (p[2] - q[2]) * (p[0] + q[0]);
    n[2] += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return n;
}
function estHorizontale(points) {
  var n = normale(points);
  var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  return l > 0 && Math.abs(n[2]) / l >= 0.9995;
}
/** Aire signée dans le plan horizontal (positive dans le sens trigonométrique). */
function aireSignee(pts) {
  var s = 0;
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var q = pts[(i + 1) % pts.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}
/** Contour décalé vers l'intérieur de `d` (contour dans le sens trigonométrique), ou null s'il se retourne. */
function decaler(pts, d) {
  var n = pts.length;
  var lignes = [];
  for (var i = 0; i < n; i++) {
    var p = pts[i];
    var q = pts[(i + 1) % n];
    var dx = q[0] - p[0];
    var dy = q[1] - p[1];
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l < EPS) return null;
    var nx = -dy / l;
    var ny = dx / l;
    lignes.push({ p: [p[0] + nx * d, p[1] + ny * d], u: [dx / l, dy / l] });
  }
  var res = [];
  for (var k = 0; k < n; k++) {
    var l1 = lignes[(k + n - 1) % n];
    var l2 = lignes[k];
    var det = l1.u[0] * l2.u[1] - l1.u[1] * l2.u[0];
    if (Math.abs(det) < 1e-12) res.push([l2.p[0], l2.p[1], pts[k][2]]);
    else {
      var t = ((l2.p[0] - l1.p[0]) * l2.u[1] - (l2.p[1] - l1.p[1]) * l2.u[0]) / det;
      res.push([l1.p[0] + l1.u[0] * t, l1.p[1] + l1.u[1] * t, pts[k][2]]);
    }
  }
  // Chaque côté garde son sens et l'aire reste positive : sinon le décalage a retourné le contour.
  for (var m = 0; m < n; m++) {
    var a0 = res[m];
    var b0 = res[(m + 1) % n];
    var ex = b0[0] - a0[0];
    var ey = b0[1] - a0[1];
    if (ex * lignes[m].u[0] + ey * lignes[m].u[1] <= EPS) return null;
  }
  return aireSignee(res) > EPS ? res : null;
}

async function lireModele() {
  var m = await planche.modele.lire();
  var aires = {};
  var faces = {};
  m.faces.forEach(function (f) { aires[f.id] = f.aire; faces[f.id] = f; });
  var aretes = {};
  m.aretes.forEach(function (x) { aretes[x.id] = x; });
  var objets = {};
  m.objets.forEach(function (o) { objets[o.id] = o; });
  return { modele: m, aires: aires, faces: faces, aretes: aretes, objets: objets };
}

/** Plus grand x de la géométrie libre du contexte ouvert (0 si vide). */
function xMax(m) {
  var x = -Infinity;
  m.faces.forEach(function (f) { f.points.forEach(function (p) { if (p[0] > x) x = p[0]; }); });
  m.aretes.forEach(function (e) { e.points.forEach(function (p) { if (p[0] > x) x = p[0]; }); });
  return x === -Infinity ? 0 : x;
}

/**
 * Dessine un contour loin du dessin (pour qu'il ne se soude à aucune géométrie existante), le pousse de `h`, le groupe
 * sous `nom`, puis ramène le groupe à sa place. Rend l'identifiant du groupe.
 */
async function volumeLoin(pts, h, nom, loin) {
  for (var i = 0; i < pts.length; i++) {
    var p = pts[i];
    var q = pts[(i + 1) % pts.length];
    await planche.modele.ligne([p[0] + loin, p[1], p[2]], [q[0] + loin, q[1], q[2]]);
  }
  var m = await planche.modele.lire();
  var dansLoin = function (pp) { return pp.every(function (r) { return r[0] > loin / 2; }); };
  var face = m.faces.filter(function (f) { return dansLoin(f.points); })[0];
  if (!face) throw new Error(tx().empriseInvalide);
  if (h > 0) {
    var n = normale(face.points);
    await planche.modele.pousser(face.id, n[2] < 0 ? -h : h);
  }
  var m2 = await planche.modele.lire();
  var ids = m2.faces.filter(function (f) { return dansLoin(f.points); }).map(function (f) { return f.id; })
    .concat(m2.aretes.filter(function (e) { return dansLoin(e.points); }).map(function (e) { return e.id; }));
  var g = await planche.modele.grouper(ids, nom);
  await planche.modele.deplacer([g], [-loin, 0, 0]);
  return g;
}

/** Efface ceux des objets donnés qui existent encore ; rend leur nombre. */
async function effacerObjets(ids, objets) {
  var presents = ids.filter(function (id) { return objets[id]; });
  if (presents.length) await planche.modele.effacer(presents);
  return presents.length;
}

var centieme = function (v, sep) { return (Math.round(v * 100) / 100).toFixed(2).replace(".", sep); };
var metre = function (v, sep) { return (Math.round(v * 1000) / 1000).toFixed(3).replace(".", sep); };
var m2 = function (v, sep) { return centieme(v, sep) + " m²"; };

// ——————————————————————————————————————————————— Onglet « Tableau des surfaces »

function composer(locaux, aires) {
  var groupes = {};
  locaux.forEach(function (l) {
    var cle = l.niveau.trim();
    (groupes[cle] = groupes[cle] || []).push(l);
  });
  var noms = Object.keys(groupes).filter(function (k) { return k !== ""; }).sort(comparer);
  if (groupes[""]) noms.push("");
  var total = 0;
  var comptes = 0;
  var niveaux = noms.map(function (nom) {
    var lignes = groupes[nom].slice().sort(function (x, y) { return comparer(x.numero, y.numero) || comparer(x.nom, y.nom); }).map(function (l) {
      var aire = Object.prototype.hasOwnProperty.call(aires, l.face) ? aires[l.face] : null;
      return { face: l.face, numero: l.numero, nom: l.nom, usage: l.usage, aire: aire };
    });
    var somme = 0;
    var n = 0;
    lignes.forEach(function (x) { if (x.aire !== null) { somme += x.aire; n++; } });
    total += somme;
    comptes += n;
    return { nom: nom, sansNiveau: nom === "", lignes: lignes, total: somme, nombre: n };
  });
  return { niveaux: niveaux, total: total, nombre: comptes };
}

async function etatSurfaces(sep, sel) {
  var x = tx();
  var lus = await lireLocaux();
  var mo = await lireModele();
  var t = composer(lus.locaux, mo.aires);
  var lignes = [];
  t.niveaux.forEach(function (n) {
    lignes.push({ genre: "groupe", cellules: [(n.sansNiveau ? x.sansNiveau : n.nom) + " · " + x.locaux(n.nombre), m2(n.total, sep)] });
    n.lignes.forEach(function (l) {
      lignes.push(l.aire === null
        ? { genre: "introuvable", id: l.face, cellules: [l.numero || "–", l.nom + " : " + x.introuvable, "", "–"] }
        : { genre: "ligne", id: l.face, choisi: sel.indexOf(l.face) >= 0, cellules: [l.numero || "–", l.nom, l.usage || "–", m2(l.aire, sep)] });
    });
  });
  return { lignes: lignes, pied: [x.total + " · " + x.locaux(t.nombre), m2(t.total, sep)], vide: lus.locaux.length ? null : x.videSurfaces };
}

async function declarer(face) {
  var x = tx();
  var lus = await lireLocaux();
  var mo = await lireModele();
  if (face === undefined) {
    var sel = await planche.selection.lire();
    if (sel.length !== 1) return a(x.choisirFace);
    face = sel[0];
  }
  var f = mo.faces[face];
  var existant = lus.locaux.filter(function (l) { return l.face === face; })[0];
  if (!f && !existant) return a(x.pasUneFace);
  if (f && !estHorizontale(f.points)) return a(x.pasHorizontale);
  var champs = [
    { id: "numero", libelle: x.numero, genre: "texte", valeur: existant ? existant.numero : "" },
    { id: "nom", libelle: x.nom, genre: "texte", valeur: existant ? existant.nom : "" },
    { id: "usage", libelle: x.usage, genre: "texte", valeur: existant ? existant.usage : "" },
    { id: "niveau", libelle: x.niveau, genre: "texte", valeur: existant ? existant.niveau : "" },
  ];
  if (existant) champs.push({ id: "retirer", libelle: x.retirer, genre: "case", valeur: false });
  var r = await planche.saisie.demander(existant ? x.titreModifier : x.titreDeclarer, champs);
  if (!r) return;
  var locaux = lus.locaux.filter(function (l) { return l.face !== face; });
  if (r.retirer === true) {
    await ecrireLocaux(locaux, lus.cles);
    return info(x.retire + existant.nom);
  }
  var nom = texte(r.nom).trim();
  if (!nom) return a(x.nomVide);
  var local = existant ? Object.assign({}, existant) : { destination: "", etat: "", deduction: 0, motif: "" };
  local.face = face;
  local.numero = texte(r.numero).trim();
  local.nom = nom;
  local.usage = texte(r.usage).trim();
  local.niveau = texte(r.niveau).trim();
  locaux.push(local);
  if (locaux.length > MAX_LOCAUX) return a(x.tropLocaux);
  await ecrireLocaux(locaux, lus.cles);
  return info((existant ? x.modifie : x.declare) + (local.numero ? local.numero + " " : "") + nom);
}

var cellule = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
var debutCsv = function (titre, regle, sep) {
  var x = tx();
  return [cellule(titre), cellule(x.regle[regle]), cellule(REGLES[regle] + " (" + VERSION + ")"), cellule(x.csvSeparateur + " : " + sep)].join(";");
};

function csvSurfaces(t, sep) {
  var x = tx();
  var l = [debutCsv(x.csvSurfaces, "surfaces", sep), x.csvEnteteSurfaces.map(cellule).join(";")];
  t.niveaux.forEach(function (n) {
    var nomNiveau = n.sansNiveau ? x.sansNiveau : n.nom;
    n.lignes.forEach(function (y) {
      l.push([cellule(nomNiveau), cellule(y.numero), cellule(y.nom), cellule(y.usage), y.aire === null ? cellule(x.introuvable) : centieme(y.aire, sep)].join(";"));
    });
    l.push([cellule(x.sousTotal + " " + nomNiveau), "", cellule(x.locaux(n.nombre)), "", centieme(n.total, sep)].join(";"));
  });
  l.push([cellule(x.total), "", cellule(x.locaux(t.nombre)), "", centieme(t.total, sep)].join(";"));
  return "﻿" + l.join("\r\n") + "\r\n";
}

async function exporterSurfaces() {
  var x = tx();
  var lus = await lireLocaux();
  if (lus.locaux.length === 0) return a(x.videExport);
  var mo = await lireModele();
  var sep = (await planche.unites.lire()).separateur;
  if (await planche.fichiers.enregistrer(x.fichierSurfaces, csvSurfaces(composer(lus.locaux, mo.aires), sep))) await info(x.exporte);
}

// ——————————————————————————————————————————————— Onglet « Programme »

var coteBoite = function (s) { return Math.round(Math.sqrt(s) * 1000) / 1000; };

async function etatProgramme(sep) {
  var x = tx();
  var p = await lireProgramme();
  var total = 0;
  var lignes = p.lignes.map(function (l) {
    var c = coteBoite(l.surface);
    total += l.surface * l.nombre;
    var ecart = c * c - l.surface;
    return { genre: "ligne", id: l.id, cellules: [l.nom, String(l.nombre), m2(l.surface, sep), metre(c, sep) + " m", (Math.round(Math.abs(ecart) * 100) === 0 ? "" : ecart > 0 ? "+" : "−") + centieme(Math.abs(ecart), sep) + " m²"] };
  });
  var boites = p.lignes.reduce(function (s, l) { return s + l.nombre; }, 0);
  return { lignes: lignes, pied: [x.totalCible + " · " + x.boites(boites), m2(total, sep)], vide: p.lignes.length ? null : x.videProgramme };
}

async function ligneProgramme(id) {
  var x = tx();
  var p = await lireProgramme();
  var existante = id ? p.lignes.filter(function (l) { return l.id === id; })[0] : null;
  if (id && !existante) return a(x.choisirLigne);
  if (!existante && p.lignes.length >= MAX_PROGRAMME) return a(x.tropLignes);
  var champs = [
    { id: "nom", libelle: x.nomLigne, genre: "texte", valeur: existante ? existante.nom : "" },
    { id: "surface", libelle: x.surfaceCible, genre: "nombre", valeur: existante ? existante.surface : 20, min: 0.01, max: 100000, unite: "m²" },
    { id: "hauteur", libelle: x.hauteur, genre: "nombre", valeur: existante ? existante.hauteur : 3, min: 0.1, max: 100, unite: "m" },
    { id: "nombre", libelle: x.nombre, genre: "nombre", valeur: existante ? existante.nombre : 1, min: 1, max: MAX_BOITES },
  ];
  if (existante) champs.push({ id: "retirer", libelle: x.retirerLigne, genre: "case", valeur: false });
  var r = await planche.saisie.demander(x.titreLigne, champs);
  if (!r) return;
  var lignes = p.lignes.filter(function (l) { return !existante || l.id !== existante.id; });
  if (r.retirer === true) {
    await ecrireProgramme(lignes, p.cles);
    return info(x.ligneRetiree + existante.nom);
  }
  var nom = texte(r.nom).trim();
  if (!nom) return a(x.nomVide);
  var ligne = { id: existante ? existante.id : nouvelId("p", p.lignes.map(function (l) { return l.id; })), nom: nom, surface: r.surface, hauteur: r.hauteur, nombre: Math.max(1, Math.floor(r.nombre)) };
  if (existante) lignes.splice(p.lignes.indexOf(existante), 0, ligne);
  else lignes.push(ligne);
  await ecrireProgramme(lignes, p.cles);
  return info(x.ligneAjoutee + nom);
}

/** Nombre écrit avec « , » ou « . » décimal, espaces de milliers tolérées. */
var lireNombre = function (s) {
  var t = texte(s).replace(/[\s  ]/g, "").replace(/m²|m2|m$/i, "").replace(",", ".");
  return t === "" ? NaN : Number(t);
};

async function importerProgramme() {
  var x = tx();
  var f = await planche.fichiers.ouvrir([".csv", ".txt"]);
  if (!f) return;
  var p = await lireProgramme();
  var ajout = [];
  var rejet = 0;
  var ids = p.lignes.map(function (l) { return l.id; });
  texte(f.texte).replace(/^﻿/, "").split(/\r?\n/).forEach(function (brute, rang) {
    if (!brute.trim()) return;
    var c = brute.split(";").map(function (v) { return v.trim().replace(/^"(.*)"$/, "$1").replace(/""/g, '"'); });
    var surface = lireNombre(c[1]);
    // Première ligne d'en-tête (surface illisible) : ignorée sans être comptée comme rejet.
    if (rang === 0 && !isFinite(surface)) return;
    var hauteur = lireNombre(c[2]);
    var nombre = lireNombre(c[3]);
    if (!c[0] || !(surface > 0) || surface > 100000) { rejet++; return; }
    var id = nouvelId("p", ids);
    ids.push(id);
    ajout.push({ id: id, nom: c[0].slice(0, 120), surface: surface, hauteur: hauteur > 0 && hauteur <= 100 ? hauteur : 3, nombre: nombre >= 1 && nombre <= MAX_BOITES ? Math.floor(nombre) : 1 });
  });
  if (!ajout.length) return a(x.importVide);
  if (p.lignes.length + ajout.length > MAX_PROGRAMME) return a(x.tropLignes);
  await ecrireProgramme(p.lignes.concat(ajout), p.cles);
  await info(x.importer + x.importLignes(ajout.length));
  if (rejet) await a(x.importRejet(rejet));
}

async function genererBoites() {
  var x = tx();
  var p = await lireProgramme();
  if (!p.lignes.length) return a(x.programmeVide);
  var total = p.lignes.reduce(function (s, l) { return s + l.nombre; }, 0);
  if (total > MAX_BOITES) return a(x.tropBoites);
  var anciennes = await lireCle("boites", []);
  await planche.operation.ouvrir(x.opBoites);
  try {
    var mo = await lireModele();
    await effacerObjets(Array.isArray(anciennes) ? anciennes : [], mo.objets);
    var depart = xMax((await lireModele()).modele) + 3;
    var xCourant = depart;
    var groupes = [];
    for (var i = 0; i < p.lignes.length; i++) {
      var l = p.lignes[i];
      var c = coteBoite(l.surface);
      for (var k = 1; k <= l.nombre; k++) {
        var ids = await planche.modele.boite([xCourant, 0, 0], c, c, l.hauteur);
        var g = await planche.modele.grouper(ids, l.nom + (l.nombre > 1 ? " " + k : ""));
        await planche.donnees.ecrire(g, "programme", { ligne: l.id, nom: l.nom, cible: l.surface, obtenue: c * c, hauteur: l.hauteur });
        groupes.push(g);
        xCourant += c + 1;
      }
    }
    await planche.donnees.ecrire("projet", "boites", groupes);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.boitesGenerees + x.boites(total));
}

// ——————————————————————————————————————————————— Onglet « Capacité »

async function etatCapacite(sep) {
  var x = tx();
  var c = await lireCle("capacite", null);
  if (!c || !Array.isArray(c.niveaux) || !c.niveaux.length) return { lignes: [], pied: null, vide: x.videCapacite };
  var mo = await lireModele();
  var lignes = [];
  var brute = 0;
  var presents = 0;
  c.niveaux.forEach(function (n, k) {
    var ok = !!mo.objets[n.groupe];
    if (ok) { brute += n.surface; presents++; }
    lignes.push(ok
      ? { genre: "ligne", id: n.groupe, cellules: [x.niveauNom(k + 1) + (n.attique ? " (" + x.attique + ")" : ""), metre(n.base, sep) + " m", m2(n.surface, sep)] }
      : { genre: "introuvable", id: n.groupe, cellules: [x.niveauNom(k + 1), x.introuvable, "–"] });
  });
  var sdp = brute * c.coefficient;
  lignes.push({ genre: "groupe", cellules: [x.sdpEstimee + texte(c.coefficient).replace(".", sep) + ")", m2(sdp, sep)] });
  var ne = x.nonEvaluee;
  lignes.push({ genre: "groupe", cellules: [x.emprise, c.terrain > 0 ? centieme(c.emprise / c.terrain, sep) : ne] });
  lignes.push({ genre: "groupe", cellules: [x.densite, c.terrain > 0 ? centieme(brute / c.terrain, sep) : ne] });
  var logements = c.surfaceLogement > 0 ? Math.floor(sdp / c.surfaceLogement) : null;
  lignes.push({ genre: "groupe", cellules: [x.nbLogements, logements === null ? ne : String(logements)] });
  lignes.push({ genre: "groupe", cellules: [x.parHectare, logements !== null && c.terrain > 0 ? centieme(logements / (c.terrain / 10000), sep) : ne] });
  return { lignes: lignes, pied: [x.brute + " · " + presents + " / " + c.niveaux.length, m2(brute, sep)], vide: null };
}

async function volumesCapacite() {
  var x = tx();
  var sel = await planche.selection.lire();
  var mo = await lireModele();
  var f = sel.length === 1 ? mo.faces[sel[0]] : null;
  if (!f || !estHorizontale(f.points)) return a(x.choisirEmprise);
  if (f.trous > 0 || f.points.length < 3) return a(x.empriseInvalide);
  var ancien = await lireCle("capacite", null);
  var r = await planche.saisie.demander(x.titreCapacite, [
    { id: "niveaux", libelle: x.niveaux, genre: "nombre", valeur: ancien ? ancien.niveaux.length : 3, min: 1, max: MAX_NIVEAUX },
    { id: "hauteur", libelle: x.hauteurEtage, genre: "nombre", valeur: ancien ? ancien.hauteur : 3, min: 0.5, max: 20, unite: "m" },
    { id: "retrait", libelle: x.retrait, genre: "nombre", valeur: ancien ? ancien.retrait : 0, min: 0, max: 100, unite: "m" },
    { id: "coefficient", libelle: x.coefficient, genre: "nombre", valeur: ancien ? ancien.coefficient : 1, min: 0, max: 1 },
    { id: "terrain", libelle: x.terrain, genre: "nombre", valeur: ancien ? ancien.terrain : 0, min: 0, max: 100000000, unite: "m²" },
    { id: "surfaceLogement", libelle: x.surfaceLogement, genre: "nombre", valeur: ancien ? ancien.surfaceLogement : 0, min: 0, max: 100000, unite: "m²" },
  ]);
  if (!r) return;
  var niveaux = Math.max(1, Math.min(MAX_NIVEAUX, Math.floor(r.niveaux)));
  // Contour dans le sens trigonométrique, vu de dessus.
  var pts = f.points.map(function (p) { return [p[0], p[1], p[2]]; });
  if (aireSignee(pts) < 0) pts.reverse();
  var attique = r.retrait > 0 && niveaux > 1 ? decaler(pts, r.retrait) : null;
  if (r.retrait > 0 && niveaux > 1 && !attique) return a(x.retraitImpossible);
  var aireEmprise = f.aire;
  await planche.operation.ouvrir(x.opCapacite);
  try {
    if (ancien && Array.isArray(ancien.niveaux)) await effacerObjets(ancien.niveaux.map(function (n) { return n.groupe; }), (await lireModele()).objets);
    var loin = xMax((await lireModele()).modele) + 1000;
    var liste = [];
    for (var k = 0; k < niveaux; k++) {
      var estAttique = !!attique && k === niveaux - 1;
      var contour = (estAttique ? attique : pts).map(function (p) { return [p[0], p[1], p[2] + k * r.hauteur]; });
      var surface = estAttique ? aireSignee(attique) : aireEmprise;
      var g = await volumeLoin(contour, r.hauteur, x.niveauNom(k + 1), loin);
      await planche.donnees.ecrire(g, "capacite", { niveau: k + 1, surface: surface, attique: estAttique });
      liste.push({ groupe: g, base: pts[0][2] + k * r.hauteur, surface: surface, attique: estAttique });
    }
    await planche.donnees.ecrire("projet", "capacite", { niveaux: liste, hauteur: r.hauteur, retrait: r.retrait, coefficient: r.coefficient, terrain: r.terrain, surfaceLogement: r.surfaceLogement, emprise: aireEmprise });
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.capaciteGeneree + niveaux);
}

async function effacerCapacite() {
  var x = tx();
  var c = await lireCle("capacite", null);
  if (!c) return a(x.rienAEffacer);
  await planche.operation.ouvrir(x.opEffacerCapacite);
  try {
    await effacerObjets((c.niveaux || []).map(function (n) { return n.groupe; }), (await lireModele()).objets);
    await planche.donnees.effacer("projet", "capacite");
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.capaciteEffacee);
}

// ——————————————————————————————————————————————— Onglet « Typologies »

// « typologies » : { bibliotheque: [[id, nom, surface, largeur]], unites: [[groupe, id]] }
async function lireTypologies() {
  var t = await lireCle("typologies", {});
  return {
    bibliotheque: (Array.isArray(t.bibliotheque) ? t.bibliotheque : []).map(function (e) { return { id: texte(e[0]), nom: texte(e[1]), surface: nombreOu(e[2], 0), largeur: nombreOu(e[3], 1) }; }),
    unites: (Array.isArray(t.unites) ? t.unites : []).filter(Array.isArray),
  };
}
var ecrireTypologies = function (t) {
  return planche.donnees.ecrire("projet", "typologies", { bibliotheque: t.bibliotheque.map(function (b) { return [b.id, b.nom, b.surface, b.largeur]; }), unites: t.unites });
};

async function etatTypologies(sep) {
  var x = tx();
  var t = await lireTypologies();
  if (!t.bibliotheque.length) return { lignes: [], pied: null, vide: x.videTypologies };
  var mo = await lireModele();
  var compte = {};
  t.unites.forEach(function (u) { if (mo.objets[u[0]]) compte[u[1]] = (compte[u[1]] || 0) + 1; });
  var n = 0;
  var total = 0;
  t.bibliotheque.forEach(function (b) { n += compte[b.id] || 0; total += (compte[b.id] || 0) * b.surface; });
  var lignes = t.bibliotheque.map(function (b) {
    var k = compte[b.id] || 0;
    return { genre: "ligne", id: b.id, cellules: [b.nom + " · " + m2(b.surface, sep), metre(b.largeur, sep) + " m", String(k), n ? Math.round((100 * k) / n) + " %" : "–", m2(k * b.surface, sep)] };
  });
  var c = await lireCle("capacite", null);
  var brute = 0;
  if (c && Array.isArray(c.niveaux)) c.niveaux.forEach(function (v) { if (mo.objets[v.groupe]) brute += v.surface; });
  lignes.push({ genre: "groupe", cellules: [x.rapportCapacite + " (" + x.estimation + ")", brute > 0 ? Math.round((100 * total) / brute) + " %" : x.nonEvaluee] });
  return { lignes: lignes, pied: [x.total + " · " + x.logements(n), m2(total, sep)], vide: null };
}

async function typologie(id) {
  var x = tx();
  var t = await lireTypologies();
  var existante = id ? t.bibliotheque.filter(function (b) { return b.id === id; })[0] : null;
  if (id && !existante) return a(x.choisirLigne);
  if (!existante && t.bibliotheque.length >= MAX_TYPOLOGIES) return a(x.tropTypologies);
  var champs = [
    { id: "nom", libelle: x.nomTypologie, genre: "texte", valeur: existante ? existante.nom : "" },
    { id: "surface", libelle: x.surfaceTypologie, genre: "nombre", valeur: existante ? existante.surface : 45, min: 1, max: 10000, unite: "m²" },
    { id: "largeur", libelle: x.largeur, genre: "nombre", valeur: existante ? existante.largeur : 6, min: 0.5, max: 200, unite: "m" },
  ];
  if (existante) champs.push({ id: "retirer", libelle: x.retirerTypologie, genre: "case", valeur: false });
  var r = await planche.saisie.demander(x.titreTypologie, champs);
  if (!r) return;
  if (r.retirer === true) {
    t.bibliotheque = t.bibliotheque.filter(function (b) { return b.id !== existante.id; });
    await ecrireTypologies(t);
    return info(x.typologieRetiree + existante.nom);
  }
  var nom = texte(r.nom).trim();
  if (!nom) return a(x.nomVide);
  if (existante) {
    existante.nom = nom;
    existante.surface = r.surface;
    existante.largeur = r.largeur;
  } else t.bibliotheque.push({ id: nouvelId("t", t.bibliotheque.map(function (b) { return b.id; })), nom: nom, surface: r.surface, largeur: r.largeur });
  await ecrireTypologies(t);
  return info(x.typologieEnregistree + nom);
}

async function remplirFacade() {
  var x = tx();
  var t = await lireTypologies();
  if (!t.bibliotheque.length) return a(x.bibliothequeVide);
  var sel = await planche.selection.lire();
  var mo = await lireModele();
  var e = sel.length === 1 ? mo.aretes[sel[0]] : null;
  if (!e) return a(x.choisirArete);
  var p0 = e.points[0];
  var p1 = e.points[e.points.length - 1];
  if (Math.abs(p1[2] - p0[2]) > 1e-6) return a(x.pasHorizontaleArete);
  var champs = t.bibliotheque.map(function (b, i) { return { id: "n" + i, libelle: x.combien(b.nom).slice(0, 60), genre: "nombre", valeur: 0, min: 0, max: 200 }; });
  champs.push({ id: "cote", libelle: x.cote, genre: "case", valeur: false });
  var r = await planche.saisie.demander(x.titreRemplir, champs);
  if (!r) return;
  var dx = p1[0] - p0[0];
  var dy = p1[1] - p0[1];
  var longueur = Math.sqrt(dx * dx + dy * dy);
  var u = [dx / longueur, dy / longueur];
  var n = r.cote ? [u[1], -u[0]] : [-u[1], u[0]];
  var demandes = [];
  var besoin = 0;
  t.bibliotheque.forEach(function (b, i) {
    var k = Math.max(0, Math.floor(r["n" + i] || 0));
    for (var j = 0; j < k; j++) demandes.push(b);
    besoin += k * b.largeur;
  });
  if (!demandes.length) return a(x.rienDemande);
  var sep = (await planche.unites.lire()).separateur;
  if (besoin > longueur + 1e-6) return a(x.tropLong(metre(besoin, sep), metre(longueur, sep)));
  await planche.operation.ouvrir(x.opRemplir);
  try {
    var loin = xMax(mo.modele) + 1000;
    var s = 0;
    var compteurs = {};
    for (var i = 0; i < demandes.length; i++) {
      var b = demandes[i];
      var prof = b.surface / b.largeur;
      var c0 = [p0[0] + u[0] * s, p0[1] + u[1] * s, p0[2]];
      var contour = [c0, [c0[0] + u[0] * b.largeur, c0[1] + u[1] * b.largeur, p0[2]], [c0[0] + u[0] * b.largeur + n[0] * prof, c0[1] + u[1] * b.largeur + n[1] * prof, p0[2]], [c0[0] + n[0] * prof, c0[1] + n[1] * prof, p0[2]]];
      compteurs[b.id] = (compteurs[b.id] || 0) + 1;
      var g = await volumeLoin(contour, 0, b.nom + " " + compteurs[b.id], loin);
      await planche.donnees.ecrire(g, "typologie", { typologie: b.id, nom: b.nom, surface: b.surface });
      t.unites.push([g, b.id]);
      s += b.largeur;
    }
    var presents = (await lireModele()).objets;
    t.unites = t.unites.filter(function (v) { return presents[v[0]]; });
    await ecrireTypologies(t);
    await planche.operation.valider();
  } catch (err) {
    await planche.operation.abandonner();
    throw err;
  }
  return info(x.remplissage + demandes.length);
}

async function effacerRemplissage() {
  var x = tx();
  var t = await lireTypologies();
  if (!t.unites.length) return a(x.rienAEffacer);
  await planche.operation.ouvrir(x.opEffacerRemplissage);
  try {
    await effacerObjets(t.unites.map(function (v) { return v[0]; }), (await lireModele()).objets);
    t.unites = [];
    await ecrireTypologies(t);
    await planche.operation.valider();
  } catch (e) {
    await planche.operation.abandonner();
    throw e;
  }
  return info(x.remplissageEfface);
}

// ——————————————————————————————————————————————— Onglet « Lots »

var nomLot = function (l) {
  var x = tx();
  return (l.genre === "lot" ? x.lotCopro : x.logement) + " " + l.numero + (l.nom ? " · " + l.nom : "") + (l.typologie ? " · " + l.typologie : "") + (l.etage ? " · " + l.etage : "");
};

async function etatLots(sep, sel) {
  var x = tx();
  var lus = await lireLocaux();
  var lots = (await lireLots()).lots;
  var mo = await lireModele();
  var parFace = {};
  lus.locaux.forEach(function (l) { parFace[l.face] = l; });
  var dansUnLot = {};
  var lignes = [];
  lots.slice().sort(function (p, q) { return comparer(p.genre, q.genre) || comparer(p.numero, q.numero); }).forEach(function (lot) {
    var principale = 0;
    var annexe = 0;
    var sous = [];
    [[lot.faces, false], [lot.annexes, true]].forEach(function (paire) {
      paire[0].forEach(function (face) {
        dansUnLot[face] = true;
        var local = parFace[face];
        var aire = Object.prototype.hasOwnProperty.call(mo.aires, face) ? mo.aires[face] : null;
        var nom = local ? (local.numero ? local.numero + " " : "") + local.nom : face;
        if (aire === null || !local) sous.push({ genre: "introuvable", id: face, cellules: ["", nom + " : " + x.introuvable, "", "–"] });
        else {
          if (paire[1]) annexe += aire;
          else principale += aire;
          sous.push({ genre: "ligne", id: face, choisi: sel.indexOf(face) >= 0, cellules: ["", nom, paire[1] ? x.annexeNature : x.principal, m2(aire, sep)] });
        }
      });
    });
    lignes.push({ genre: "groupe", id: "lot:" + lot.id, cellules: [nomLot(lot), m2(principale, sep) + (annexe > 0 ? " + " + m2(annexe, sep) : "")] });
    lignes = lignes.concat(sous);
  });
  var sans = lus.locaux.filter(function (l) { return !dansUnLot[l.face] && Object.prototype.hasOwnProperty.call(mo.aires, l.face); });
  if (sans.length) {
    lignes.push({ genre: "groupe", cellules: [x.sansLot + " · " + x.locaux(sans.length), ""] });
    sans.forEach(function (l) { lignes.push({ genre: "ligne", id: l.face, choisi: sel.indexOf(l.face) >= 0, cellules: ["", (l.numero ? l.numero + " " : "") + l.nom, "–", m2(mo.aires[l.face], sep)] }); });
  }
  if (lots.length) lignes.push({ genre: "groupe", cellules: [x.shab, ""] });
  return { lignes: lignes, pied: null, vide: lots.length ? null : x.videLots };
}

async function creerLot() {
  var x = tx();
  var sel = await planche.selection.lire();
  if (!sel.length) return a(x.choisirLocaux);
  var lus = await lireLocaux();
  var parFace = {};
  lus.locaux.forEach(function (l) { parFace[l.face] = l; });
  var absents = sel.filter(function (id) { return !parFace[id]; });
  if (absents.length) return a(x.nonDeclare(absents.length));
  var r = await planche.saisie.demander(x.titreLot, [
    { id: "genre", libelle: x.genre, genre: "choix", valeur: "logement", choix: [{ valeur: "logement", libelle: x.logement }, { valeur: "lot", libelle: x.lotCopro }] },
    { id: "numero", libelle: x.numeroLot, genre: "texte", valeur: "" },
    { id: "nom", libelle: x.nomLot, genre: "texte", valeur: "" },
    { id: "typologie", libelle: x.typologieLot, genre: "texte", valeur: "" },
    { id: "etage", libelle: x.etage, genre: "texte", valeur: "" },
    { id: "annexe", libelle: x.annexe, genre: "case", valeur: false },
  ]);
  if (!r) return;
  var numero = texte(r.numero).trim();
  if (!numero) return a(x.numeroVide);
  var genre = r.genre === "lot" ? "lot" : "logement";
  var l = await lireLots();
  var lot = l.lots.filter(function (y) { return y.genre === genre && y.numero === numero; })[0];
  // Un local appartient à un seul logement et à un seul lot de copropriété.
  for (var i = 0; i < sel.length; i++) {
    var autre = l.lots.filter(function (y) { return y.genre === genre && y !== lot && (y.faces.indexOf(sel[i]) >= 0 || y.annexes.indexOf(sel[i]) >= 0); })[0];
    if (autre) return a(x.dejaDansLot(parFace[sel[i]].nom, nomLot(autre)));
  }
  if (!lot) {
    lot = { id: nouvelId("l", l.lots.map(function (y) { return y.id; })), genre: genre, numero: numero, nom: "", typologie: "", etage: "", faces: [], annexes: [] };
    l.lots.push(lot);
  }
  ["nom", "typologie", "etage"].forEach(function (k) { if (texte(r[k]).trim()) lot[k] = texte(r[k]).trim(); });
  sel.forEach(function (face) {
    lot.faces = lot.faces.filter(function (f) { return f !== face; });
    lot.annexes = lot.annexes.filter(function (f) { return f !== face; });
    (r.annexe ? lot.annexes : lot.faces).push(face);
  });
  try {
    await ecrireLots(l.lots, l.cles);
  } catch (e) {
    return a(x.tropLots);
  }
  return info(x.lotEnregistre + nomLot(lot));
}

async function retirerLot(id) {
  var x = tx();
  var l = await lireLots();
  var lot = l.lots.filter(function (y) { return "lot:" + y.id === id; })[0];
  if (!lot) return a(x.choisirLigne);
  await ecrireLots(l.lots.filter(function (y) { return y !== lot; }), l.cles);
  return info(x.lotRetire + nomLot(lot));
}

// ——————————————————————————————————————————————— Onglet « SDP du permis »

function composerSdp(locaux, aires) {
  var dest = {};
  var non = [];
  var total = { existant: 0, cree: 0, demoli: 0 };
  locaux.forEach(function (l) {
    var aire = Object.prototype.hasOwnProperty.call(aires, l.face) ? aires[l.face] : null;
    if (aire === null) return;
    if (!l.etat) { non.push(l); return; }
    var v = Math.max(0, aire - l.deduction);
    var d = (dest[l.destination] = dest[l.destination] || { existant: 0, cree: 0, demoli: 0 });
    if (d[l.etat] === undefined) { non.push(l); return; }
    d[l.etat] += v;
    total[l.etat] += v;
  });
  return { destinations: Object.keys(dest).sort(comparer).map(function (k) { return { nom: k, v: dest[k] }; }), total: total, non: non };
}

async function etatSdp(sep, sel) {
  var x = tx();
  var lus = await lireLocaux();
  var mo = await lireModele();
  var s = composerSdp(lus.locaux, mo.aires);
  var lignes = s.destinations.map(function (d) { return { genre: "ligne", cellules: [d.nom, m2(d.v.existant, sep), m2(d.v.cree, sep), m2(d.v.demoli, sep)] }; });
  if (s.destinations.length) lignes.push({ genre: "groupe", cellules: [x.apres, m2(s.total.existant + s.total.cree, sep)] });
  if (s.non.length) {
    lignes.push({ genre: "groupe", cellules: [x.nonQualifies + " · " + x.locaux(s.non.length), ""] });
    s.non.forEach(function (l) { lignes.push({ genre: "ligne", id: l.face, choisi: sel.indexOf(l.face) >= 0, cellules: [(l.numero ? l.numero + " " : "") + l.nom, m2(mo.aires[l.face], sep), "", ""] }); });
  }
  return {
    lignes: lignes,
    pied: s.destinations.length ? [x.total, m2(s.total.existant, sep), m2(s.total.cree, sep), m2(s.total.demoli, sep)] : null,
    vide: s.destinations.length || s.non.length ? null : x.videSdp,
  };
}

async function qualifierLocal() {
  var x = tx();
  var sel = await planche.selection.lire();
  if (sel.length !== 1) return a(x.choisirLocal);
  var lus = await lireLocaux();
  var local = lus.locaux.filter(function (l) { return l.face === sel[0]; })[0];
  if (!local) return a(x.pasDeclare);
  var mo = await lireModele();
  var aire = mo.aires[local.face];
  var r = await planche.saisie.demander(x.titreQualifier, [
    { id: "destination", libelle: x.destination, genre: "texte", valeur: local.destination },
    { id: "etat", libelle: x.etat, genre: "choix", valeur: local.etat || "existant", choix: [{ valeur: "existant", libelle: x.existant }, { valeur: "cree", libelle: x.cree }, { valeur: "demoli", libelle: x.demoli }] },
    { id: "deduction", libelle: x.deduction, genre: "nombre", valeur: local.deduction, min: 0, max: 100000, unite: "m²" },
    { id: "motif", libelle: x.motif, genre: "texte", valeur: local.motif },
  ]);
  if (!r) return;
  var destination = texte(r.destination).trim();
  if (!destination) return a(x.destinationVide);
  if (r.deduction > 0 && !texte(r.motif).trim()) return a(x.motifVide);
  if (typeof aire === "number" && r.deduction > aire + 1e-9) return a(x.deductionTrop);
  local.destination = destination;
  local.etat = r.etat === "cree" || r.etat === "demoli" ? r.etat : "existant";
  local.deduction = r.deduction;
  local.motif = r.deduction > 0 ? texte(r.motif).trim() : "";
  await ecrireLocaux(lus.locaux, lus.cles);
  return info(x.qualifie + (local.numero ? local.numero + " " : "") + local.nom);
}

async function exporterSdp() {
  var x = tx();
  var lus = await lireLocaux();
  var mo = await lireModele();
  var s = composerSdp(lus.locaux, mo.aires);
  if (!s.destinations.length) return a(x.videExportSdp);
  var sep = (await planche.unites.lire()).separateur;
  var l = [debutCsv(x.csvSdp, "sdp", sep), x.csvEnteteSdp.map(cellule).join(";")];
  s.destinations.forEach(function (d) { l.push([cellule(d.nom), centieme(d.v.existant, sep), centieme(d.v.cree, sep), centieme(d.v.demoli, sep), centieme(d.v.existant + d.v.cree, sep)].join(";")); });
  l.push([cellule(x.total), centieme(s.total.existant, sep), centieme(s.total.cree, sep), centieme(s.total.demoli, sep), centieme(s.total.existant + s.total.cree, sep)].join(";"));
  // Les déductions et leur motif, local par local : la ventilation reste vérifiable.
  lus.locaux.forEach(function (y) {
    if (y.etat && y.deduction > 0) l.push([cellule(y.destination), cellule((y.numero ? y.numero + " " : "") + y.nom), cellule(tx().deduction + " " + centieme(y.deduction, sep)), cellule(y.motif), ""].join(";"));
  });
  if (await planche.fichiers.enregistrer(x.fichierSdp, "﻿" + l.join("\r\n") + "\r\n")) await info(x.exporte);
}

// ——————————————————————————————————————————————— Panneau

/** État envoyé à la page : l'onglet actif seulement, une page de lignes au plus (bornes du panneau). */
async function etat() {
  var x = tx();
  var sep = (await planche.unites.lire()).separateur;
  var sel = await planche.selection.lire();
  var e;
  if (onglet === "programme") e = await etatProgramme(sep);
  else if (onglet === "capacite") e = await etatCapacite(sep);
  else if (onglet === "typologies") e = await etatTypologies(sep);
  else if (onglet === "lots") e = await etatLots(sep, sel);
  else if (onglet === "sdp") e = await etatSdp(sep, sel);
  else e = await etatSurfaces(sep, sel);
  var pages = Math.max(1, Math.ceil(e.lignes.length / LIGNES_PAR_PAGE));
  if (page >= pages) page = pages - 1;
  return {
    onglet: onglet,
    regle: x.regle[onglet],
    note: x.note[onglet],
    colonnes: x.col[onglet],
    lignes: e.lignes.slice(page * LIGNES_PAR_PAGE, (page + 1) * LIGNES_PAR_PAGE),
    pied: e.pied,
    vide: e.vide,
    page: page,
    pages: pages,
  };
}
async function rafraichir() {
  await planche.panneau.envoyer(PANNEAU, await etat());
}

/** Une action de la page : retient la langue (et l'onglet), agit, puis rend le nouvel état. */
var action = function (nom, fn) {
  planche.panneau.sur(PANNEAU, nom, async function (d) {
    retenirLangue(d);
    if (d && ONGLETS.indexOf(d.onglet) >= 0 && d.onglet !== onglet) {
      onglet = d.onglet;
      page = 0;
    }
    try {
      await fn(d || {});
    } catch (e) {
      await a(e && e.message ? e.message : String(e));
    }
    return etat();
  });
};
var id = function (d) { return d && typeof d.id === "string" ? d.id : ""; };

action("etat", function () {});
action("page", function (d) { page = Math.max(0, Math.floor(Number(d.page) || 0)); });
action("choisir", async function (d) {
  var cible = id(d);
  var mo = await lireModele();
  if (Object.prototype.hasOwnProperty.call(mo.aires, cible)) return planche.selection.definir([cible]);
  if (onglet === "capacite" && mo.objets[cible]) return planche.selection.definir([cible]);
  if (onglet === "lots" && cible.indexOf("lot:") === 0) {
    var lot = (await lireLots()).lots.filter(function (y) { return "lot:" + y.id === cible; })[0];
    if (lot) return planche.selection.definir(lot.faces.concat(lot.annexes).filter(function (f) { return Object.prototype.hasOwnProperty.call(mo.aires, f); }));
  }
});
action("declarer", function () { return declarer(); });
action("modifier", function (d) { return id(d) ? declarer(id(d)) : a(tx().choisirLigne); });
action("exporter", exporterSurfaces);
action("programme-ajouter", function () { return ligneProgramme(""); });
action("programme-modifier", function (d) { return id(d) ? ligneProgramme(id(d)) : a(tx().choisirLigne); });
action("programme-importer", importerProgramme);
action("generer-boites", genererBoites);
action("volumes-capacite", volumesCapacite);
action("capacite-effacer", effacerCapacite);
action("typologie-ajouter", function () { return typologie(""); });
action("typologie-modifier", function (d) { return id(d) ? typologie(id(d)) : a(tx().choisirLigne); });
action("remplir-facade", remplirFacade);
action("typologies-effacer", effacerRemplissage);
action("creer-lot", creerLot);
action("lot-retirer", function (d) { return retirerLot(id(d)); });
action("qualifier-local", qualifierLocal);
action("sdp-exporter", exporterSdp);

/** Commande de la Planche : ouvre le panneau sur l'onglet de la commande, agit, puis rafraîchit le panneau. */
var commande = function (nom, ong, fn) {
  planche.sur("commande." + nom, async function (d) {
    retenirLangue(d);
    if (onglet !== ong) page = 0;
    onglet = ong;
    await planche.panneau.ouvrir(PANNEAU);
    try {
      if (fn) await fn();
    } catch (e) {
      await a(e && e.message ? e.message : String(e));
    }
    await rafraichir();
  });
};
commande("ouvrir-panneau", "surfaces", null);
commande("declarer-local", "surfaces", function () { return declarer(); });
commande("generer-boites", "programme", genererBoites);
commande("volumes-capacite", "capacite", volumesCapacite);
commande("remplir-facade", "typologies", remplirFacade);
commande("creer-lot", "lots", creerLot);
commande("qualifier-local", "sdp", qualifierLocal);
planche.sur("modele.change", rafraichir);
planche.sur("selection.change", rafraichir);
