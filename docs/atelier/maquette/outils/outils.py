#!/usr/bin/env python3
"""Catalogue des outils de la maquette de l'Atelier (L0.3) et génération des blocs HTML qui en dépendent.

Une seule source pour : la barre de commandes par famille (ordinateur), la feuille « Outils » (téléphone), les
entrées de la palette et le tableau d'exhaustivité du sommaire (outils du prototype et entrées DA retenues →
emplacement dans la maquette). Le contenu situé entre `<!-- OUTILS:CLE -->` et `<!-- /OUTILS:CLE -->` est
réécrit ; le reste des pages n'est pas touché.

    python3 docs/atelier/maquette/outils/outils.py            # régénère
    python3 docs/atelier/maquette/outils/outils.py --verifier # contrôle sans écrire (sortie 1 si périmé)

Les noms de commandes viennent de l'annexe B du cahier des charges ; ceux marqués « proposée » viennent des
fiches et seront figés en L1.2 (décision D-013). Aucun outil n'est exécuté par la maquette.
"""
import html
import re
import sys
from pathlib import Path

ICI = Path(__file__).resolve().parent.parent

FAMILLES = [
    ("creer", "Créer"),
    ("modifier", "Modifier"),
    ("connecter", "Connecter"),
    ("analyser", "Analyser"),
    ("documenter", "Documenter"),
    ("partager", "Partager"),
]

# id, nom, icône, famille, groupe, commande, fiche DA, lot, synonymes, action, outil du prototype (libellé) ou ""
# lot : "3a", "3b", "5", "6", "7". « trou » = outil présent dans le prototype mais prévu après la bascule (lot 4).
O = [
    # Créer · Architecture
    ("selection", "Sélection", "↖", "creer", "Architecture", "—", "L3a.2", "3a", "select, choisir, lasso", "Sélectionne par clic, lasso ou filtre par classe.", "Sélection"),
    ("mur", "Mur", "▭", "creer", "Architecture", "mur.tracer", "DA-07-01", "3a", "wall, cloison, paroi", "Trace un mur par son axe, avec type, épaisseur et hauteur.", "Mur"),
    ("porte", "Porte", "◫", "creer", "Architecture", "ouverture.poser", "DA-07-02", "3a", "door, baie", "Pose une porte hébergée par un mur.", "Porte"),
    ("fenetre", "Fenêtre", "⊞", "creer", "Architecture", "ouverture.poser", "DA-07-03", "3a", "window, châssis", "Pose une fenêtre hébergée par un mur.", "Fenêtre"),
    ("ouverture", "Ouverture", "▯", "creer", "Architecture", "ouverture.poser", "DA-07-04", "3a", "opening, trémie, baie libre", "Pose une ouverture sans menuiserie dans un mur.", ""),
    ("dalle", "Dalle", "▱", "creer", "Architecture", "dalle.creer", "DA-07-06", "3a", "slab, plancher bas", "Crée une dalle par son contour et son épaisseur.", ""),
    ("plancher", "Plancher", "▤", "creer", "Architecture", "dalle.creer (usage plancher, à valider)", "DA-07-05", "3a", "floor, plancher d'étage", "Crée le plancher d'un niveau (même classe que la dalle, interprétation à valider).", ""),
    ("escalier", "Escalier", "≡", "creer", "Architecture", "escalier.creer", "DA-07-10", "3a", "stair, stairs, volée", "Crée un escalier droit paramétrique entre deux niveaux.", "Escalier"),
    ("poteau", "Poteau", "■", "creer", "Architecture", "poteau.creer", "DA-03-13", "3a", "column, pilier", "Pose un poteau par son point et sa section.", "Poteau"),
    ("piece", "Pièce", "⬚", "creer", "Architecture", "piece.detecter / piece.creer", "DA-07-15", "3a", "room, local", "Propose ou crée une pièce délimitée par des murs.", ""),
    ("espace", "Espace", "◌", "creer", "Architecture", "espace.creer", "DA-07-16", "3a", "space, surface nommée", "Crée une surface nommée sans code de pièce.", ""),
    ("zone", "Zone", "◎", "creer", "Architecture", "zone.creer", "DA-07-17", "3a", "zone, regroupement", "Regroupe des pièces et des espaces.", ""),
    # Créer · Esquisse
    ("ligne", "Ligne", "╱", "creer", "Esquisse", "esquisse.ligne", "DA-01-02", "3a", "line, trait, pen", "Trace un segment.", "Ligne"),
    ("polyligne", "Polyligne", "⌇", "creer", "Esquisse", "esquisse.polyligne", "DA-01-02", "3a", "polyline, pline", "Trace une suite de segments.", ""),
    ("arc", "Arc", "◜", "creer", "Esquisse", "esquisse.arc", "DA-01-03", "3a", "arc", "Trace un arc par trois points ou centre, rayon et angles.", ""),
    ("cercle", "Cercle", "○", "creer", "Esquisse", "esquisse.cercle", "DA-01-03", "3a", "circle", "Trace un cercle par centre et rayon.", "Cercle"),
    ("rectangle", "Rectangle", "▢", "creer", "Esquisse", "esquisse.rectangle", "DA-01-04", "3a", "rectangle, rect", "Trace un rectangle par deux coins.", "Rectangle"),
    ("polygone", "Polygone", "⬡", "creer", "Esquisse", "esquisse.polygone", "DA-01-04", "3a", "polygon, ngon", "Trace un polygone régulier ou quelconque.", "Polygone"),
    ("spline", "Courbe", "∿", "creer", "Esquisse", "esquisse.spline", "DA-01-05", "3a", "spline, curve, bézier", "Trace une courbe lisse par points de passage.", ""),
    ("mainlevee", "Main levée", "✎", "creer", "Esquisse", "esquisse.polyligne (simplifiée)", "DA-01-06", "3a", "freehand, croquis", "Trace à main levée, simplifié en polyligne.", ""),
    ("axe", "Ligne d'axe", "┆", "creer", "Esquisse", "esquisse.construction", "DA-01-10", "3a", "centerline, axe, construction", "Trace une ligne d'axe ou de construction.", ""),
    ("esquisse", "Éditeur d'esquisse", "✐", "creer", "Esquisse", "esquisse.modifier", "DA-01-09", "3a", "sketcher, sketch", "Ouvre l'édition d'une esquisse sur un plan de travail.", ""),
    ("hachure", "Hachure", "▨", "creer", "Esquisse", "esquisse.hachure", "DA-01-11", "3a", "hatch, motif, remplissage", "Remplit un contour fermé d'un motif.", ""),
    # Modifier · Transformer
    ("deplacer", "Déplacer", "✥", "modifier", "Transformer", "transformer.deplacer", "DA-02-01", "3a", "move", "Déplace la sélection d'un point à un autre.", "Déplacer"),
    ("copier", "Copier", "⧉", "modifier", "Transformer", "transformer.copier", "DA-02-02", "3a", "copy, dupliquer", "Copie la sélection à un autre endroit.", "Copier"),
    ("tourner", "Tourner", "⟲", "modifier", "Transformer", "transformer.tourner", "DA-02-03", "3a", "rotate, pivoter", "Tourne la sélection autour d'un point.", "Tourner objet"),
    ("miroir", "Miroir", "⇋", "modifier", "Transformer", "transformer.miroir", "DA-02-04", "3a", "mirror, symétrie", "Crée le symétrique de la sélection par rapport à un axe.", "Miroir"),
    ("echelle", "Échelle", "⤢", "modifier", "Transformer", "transformer.echelle", "DA-02-05", "3a", "scale, homothétie", "Met à l'échelle sans changer épaisseurs ni ouvertures (D-014).", "Échelle"),
    ("etirer", "Étirer", "⇔", "modifier", "Transformer", "transformer.etirer", "DA-02-06", "3a", "stretch", "Déplace les sommets compris dans une fenêtre.", ""),
    ("repeter", "Répéter", "⁂", "modifier", "Transformer", "transformer.repeter", "DA-02-12", "3a", "array, réseau, pattern", "Répète la sélection en ligne, en grille ou en cercle.", ""),
    # Modifier · Ajuster les tracés
    ("decaler", "Décaler", "⇉", "modifier", "Ajuster les tracés", "transformer.decaler", "DA-02-09", "3a", "offset, parallèle", "Crée une copie parallèle à une distance donnée.", "Décalage"),
    ("ajuster", "Ajuster", "✂", "modifier", "Ajuster les tracés", "transformer.ajuster", "DA-02-07", "3a", "trim, couper, rogner", "Coupe un tracé à une limite.", ""),
    ("prolonger", "Prolonger", "⟼", "modifier", "Ajuster les tracés", "transformer.prolonger", "DA-02-08", "3a", "extend, allonger", "Allonge un tracé jusqu'à une limite.", ""),
    ("raccorder", "Raccorder", "◟", "modifier", "Ajuster les tracés", "transformer.raccorder (proposée)", "DA-02-10", "3a", "fillet, congé, arrondi", "Raccorde deux tracés par un arc.", ""),
    ("chanfreiner", "Chanfreiner", "◺", "modifier", "Ajuster les tracés", "transformer.chanfreiner (proposée)", "DA-02-11", "3a", "chamfer, biseau", "Coupe un angle par un segment.", ""),
    ("decomposer", "Décomposer", "⊹", "modifier", "Ajuster les tracés", "transformer.decomposer", "DA-02-13", "3a", "explode, éclater", "Décompose un objet en tracés simples (pertes listées).", ""),
    ("points", "Points de contrôle", "⋰", "modifier", "Ajuster les tracés", "transformer.pointsDeControle", "DA-02-14", "3a", "control points, grips, sommets", "Modifie un tracé par ses sommets.", ""),
    ("supprimer", "Effacer", "⌫", "modifier", "Ajuster les tracés", "<classe>.supprimer", "annexe B", "3a", "erase, delete, supprimer, gomme", "Supprime la sélection (les ouvertures hébergées sont listées avant accord).", "Effacer"),
    # Modifier · 3D
    ("pousser", "Pousser / tirer", "⇕", "modifier", "3D", "dalle.modifier / mur.modifier", "DA-04-07", "3b", "push/pull, push pull, presspull, tirer", "Change une hauteur ou une épaisseur en tirant une face.", "Pousser/Tirer"),
    ("extruder", "Extruder", "⬒", "modifier", "3D", "solide.extruder", "DA-04-01", "3b", "extrude, extrusion", "Extrude une esquisse fermée en solide.", "Extruder"),
    ("manipulateur", "Manipulateur", "✣", "modifier", "3D", "transformer.deplacer / tourner", "DA-02-17", "3b", "gumball, gizmo, poignées", "Déplace ou tourne la sélection par des poignées 3D.", ""),
    # Connecter
    ("joindre", "Joindre les murs", "┼", "connecter", "Murs et ouvertures", "mur.joindre", "DA-07-01", "3a", "join, raccord de murs", "Joint deux murs à leur rencontre.", ""),
    ("scinder", "Scinder un mur", "⫶", "connecter", "Murs et ouvertures", "mur.scinder", "DA-07-01", "3a", "split, couper un mur", "Coupe un mur en deux ; les ouvertures suivent leur segment.", ""),
    ("grouper", "Grouper", "⊡", "connecter", "Organisation", "groupe.creer", "DA-05-05", "3a", "group", "Regroupe la sélection.", ""),
    ("degrouper", "Dissoudre le groupe", "⊟", "connecter", "Organisation", "groupe.dissoudre", "DA-05-05", "3a", "ungroup", "Dissout un groupe sans toucher aux objets.", ""),
    ("calques", "Calques", "☰", "connecter", "Organisation", "calque.* (proposée)", "DA-05-01", "3a", "layers, calque", "Affecte la sélection à un calque ; gère les calques.", "Calques"),
    ("classe", "Classe", "◇", "connecter", "Organisation", "classification.affecter", "DA-05-02", "3a", "class, classes", "Filtre et organise par classe d'objet.", ""),
    ("type", "Changer de type", "⇆", "connecter", "Organisation", "type.definir / type.modifier", "DA-05-15", "3a", "type, catalogue, family", "Place ou change le type d'un objet depuis le catalogue.", ""),
    ("proprietes", "Propriétés BIM", "≣", "connecter", "Organisation", "propriete.definir", "DA-06-07", "3a", "properties, pset, attributs", "Renseigne les propriétés d'un objet.", ""),
    ("classification", "Classification", "⌗", "connecter", "Organisation", "classification.affecter", "DA-06-08", "3a", "classification, uniclass, code", "Affecte une classification (système à fournir avec sa source).", ""),
    # Analyser
    ("detecter", "Détecter les pièces", "⬚", "analyser", "Analyser", "piece.detecter (proposition)", "DA-07-15", "3a", "room detection, détection", "Propose les pièces fermées par des murs ; rien n'est imposé.", ""),
    ("revue", "Revue de la maquette", "◉", "analyser", "Analyser", "—", "DA-17-16", "3a", "review, revue, contrôle", "Parcourt les problèmes et réserves du panneau.", ""),
    ("metre", "Mètre", "↔", "analyser", "Analyser", "— (mesure, hors modèle)", "DA-15-01", "5", "measure, tape, distance", "Mesure une distance sans rien créer.", "Mètre"),
    ("metrage", "Métré", "Σ", "analyser", "Analyser", "— (quantités dérivées)", "DA-16-10", "5", "quantities, takeoff, surfaces, volumes", "Affiche les quantités du niveau actif.", "Métré"),
    # Documenter
    ("cotation", "Cotation", "⟷", "documenter", "Annotations", "cotation.creer", "DA-15-02", "5", "dimension, cote", "Crée une cote, rattachée aux objets (références).", "Cotation"),
    ("texte", "Texte", "T", "documenter", "Annotations", "texte.creer", "DA-15-04", "5", "text, note, annotation", "Place un texte.", "Texte"),
    ("etiquette", "Étiquette", "⌑", "documenter", "Annotations", "etiquette.creer", "DA-15-05", "5", "label, tag", "Place une étiquette liée à un objet.", ""),
    ("vues", "Vues et feuilles", "▦", "documenter", "Documents", "—", "DA-14-01", "5", "views, sheets, layout, plan, coupe, façade", "Plans, coupes, façades et feuilles dérivés du modèle.", ""),
    # Partager
    ("exporter", "Exporter (PNG, SVG, DXF, PDF)", "⤓", "partager", "Partager", "— (opération serveur)", "DA-14 / DA-22-03", "5", "export, dxf, pdf, svg, png", "Exporte une vue ou une feuille.", "Exporter"),
    ("ifc", "Exporter en IFC 4.3", "⇪", "partager", "Partager", "— (opération serveur)", "DA-22-01", "6", "ifc, bim export", "Exporte le sous-ensemble IFC 4.3 avec rapport.", ""),
    ("publier", "Publier une version", "⚑", "partager", "Partager", "— (version figée)", "DA-21", "7", "publish, version", "Fige et publie une version du modèle.", ""),
]

# Navigation de la vue : paramètres d'affichage (R10), pas des commandes.
NAVIGATION = [
    ("pan", "Pan", "✋", "DA-18-04 (3D) · L3a.2 (2D)", "3a / 3b", "Pan"),
    ("zoom", "Zoom", "⊕", "DA-18-04 (3D) · L3a.2 (2D)", "3a / 3b", ""),
    ("orbite", "Orbite (rotation de la vue)", "⟳", "DA-18-04", "3b", "Rotation vue"),
]

# Favoris du niveau Essentiel (outils du prototype à plat, décision à confirmer par le maître d'ouvrage).
ESSENTIEL = ["selection", "mur", "porte", "fenetre", "piece", "cotation", "pousser", "deplacer"]
FAVORIS = {"selection", "mur", "porte"}
DEJA_EN_PALETTE = {"pc": {"pousser", "decaler", "ajuster", "prolonger", "mur", "porte", "detecter", "exporter"},
                   "tel": {"decaler", "pousser", "ajuster", "mur", "exporter"}}
OUTILS = {o[0]: o for o in O}
TROU = {"5"}  # lots postérieurs à la bascule (lot 4) pour des outils que le prototype offre aujourd'hui

# Entrées DA retenues pour les lots 1 à 3 qui ne sont pas un outil : où la maquette les montre.
DA_HORS_OUTILS = {
    "DA-01-01": "Saisie de précision, grille 0,50 m, unités (O3, T8)",
    "DA-02-15": "Barre des accrochages sous le plan (O1, O3)",
    "DA-02-16": "Saisie de précision longueur / angle (O3, T8)",
    "DA-03-01": "Solides : Extruder, Pousser / tirer (famille Modifier · 3D)",
    "DA-03-09": "Inspecteur typé : paramètres nommés et unités (O1, O2, T4, T5)",
    "DA-03-10": "Pousser / tirer, points de contrôle (famille Modifier)",
    "DA-03-12": "Solides multicorps : Extruder (famille Modifier · 3D)",
    "DA-03-15": "Changer de type (famille Connecter)",
    "DA-05-03": "Calques du navigateur (O1, T2)",
    "DA-05-04": "Niveaux du navigateur, niveau actif (O1, T2)",
    "DA-05-12": "Objets par classe du navigateur, inspecteur (O1, O2)",
    "DA-05-14": "Changer de type (famille Connecter), type dans l'inspecteur",
    "DA-18-03": "Vue 3D (O6, T9)",
    "DA-18-04": "Vue 3D, orbite / pan / zoom (O6, T9)",
    "DA-21-01": "Journal et états local / synchronisé / conflit (O2, T6)",
    "DA-21-02": "État « conflit » et résolution dans le panneau (O2)",
    "DA-21-04": "Révision du modèle dans le bandeau ; journal (O2)",
    "DA-21-05": "Annuler / rétablir (bandeau, palette)",
    "DA-21-06": "États local / synchronisé, hors ligne (O2, T6)",
    "DA-21-07": "Problèmes et réserves du panneau (O2, T6)",
}

FAM_NOM = dict(FAMILLES)
e = html.escape


def badge(o):
    lot = o[7]
    if lot in ("3a",):
        return ""
    cls = "lot trou" if (lot in TROU and o[10]) else "lot"
    titre = (f"Prévu au lot {lot}, après la bascule (lot 4) : absent du produit entre les deux — décision du maître d'ouvrage"
             if "trou" in cls else f"Prévu au lot {lot}")
    return f'<span class="{cls}" title="{e(titre)}">lot {e(lot)}</span>'


def bouton(o, classe_sup=""):
    oid, nom, ico, fam, grp, cmd, da, lot, syn, action, proto = o
    cls = "outil" + (" favori" if oid in FAVORIS else "") + classe_sup
    if oid == "selection":
        attrs = 'aria-pressed="false" data-regle="etape" data-valeur="repos"'
    elif oid == "mur":
        attrs = 'aria-pressed="false" data-regle="etape" data-valeur="parametres" data-outil-geste'
    else:
        demo = f"Maquette : {nom} — {cmd} · fiche {da} · lot {lot}."
        attrs = f'aria-pressed="false" data-demo="{e(demo)}"'
    titre = f"{action} Fiche {da} · lot {lot}" + (f" · prototype : « {proto} »" if proto else "")
    return f'<button type="button" class="{cls}" {attrs} title="{e(titre)}"><span class="ico" aria-hidden="true">{e(ico)}</span>{e(nom)}{badge(o)}</button>'


def barre_pc():
    l = ['<div class="familles seul-complet" role="tablist" aria-label="Familles de commandes">']
    for fid, fnom in FAMILLES:
        n = sum(1 for o in O if o[3] == fid)
        l.append(f'    <button type="button" role="tab" data-regle="famille" data-valeur="{fid}">{e(fnom)} <span class="nb">{n}</span></button>')
    l.append('  </div>')
    l.append('  <div class="barre" role="toolbar" aria-label="Commandes">')
    l.append('    <span class="titre-groupe sauf-complet">Outils</span>')
    for oid in ESSENTIEL:
        l.append('    ' + bouton(OUTILS[oid], " sauf-complet"))
    for fid, fnom in FAMILLES:
        l.append(f'    <div class="groupe-fam seul-complet" data-famille="{fid}">')
        groupes = []
        for o in O:
            if o[3] == fid and o[4] not in groupes:
                groupes.append(o[4])
        for i, g in enumerate(groupes):
            if i:
                l.append('      <span class="sep" aria-hidden="true"></span>')
            l.append(f'      <span class="titre-groupe">{e(g)}</span>')
            for o in O:
                if o[3] == fid and o[4] == g:
                    l.append('      ' + bouton(o))
        l.append('    </div>')
    l.append('    <div class="droite">')
    l.append('      <span class="plus-palette">Toutes les commandes : <kbd>Ctrl</kbd> <kbd>K</kbd></span>')
    l.append('      <span class="muet seul-complet">★ favori épinglé · <span class="lot">lot n</span> prévu plus tard · <span class="lot trou">lot 5</span> outil du prototype absent entre la bascule et le lot 5</span>')
    l.append('    </div>')
    l.append('  </div>')
    return "\n  ".join(l)


def nav_pc():
    l = ['<div class="navigation-vue" role="group" aria-label="Navigation de la vue (ne modifie pas le modèle)">']
    for nid, nom, ico, da, lot, proto in NAVIGATION:
        cls = "chip seul-3d" if nid == "orbite" else "chip"
        l.append(f'<button type="button" class="{cls}" data-demo="Maquette : {e(nom)} — paramètre d\'affichage, aucune commande (R10)." title="{e(da)} · lot {e(lot)}"><span aria-hidden="true">{e(ico)}</span> {e(nom)}</button>')
    l.append('</div>')
    return "".join(l)


def feuille_tel():
    l = ['<div class="seul-complet">']
    for fid, fnom in FAMILLES:
        l.append(f'        <p class="eyebrow" style="margin-top:14px">{e(fnom)}</p>')
        l.append('        <div class="grille-outils">')
        for o in O:
            if o[3] == fid:
                l.append('          ' + bouton(o).replace(' favori', '').replace('data-outil-geste', ''))
        l.append('        </div>')
    l.append('        <p class="eyebrow" style="margin-top:14px">Navigation de la vue</p>')
    l.append('        <p class="muet">Pan et zoom à deux doigts ; orbite en vue 3D. Ces gestes ne modifient pas le modèle (R10).</p>')
    l.append('      </div>')
    return "\n".join(l)


def palette(cible):
    l = []
    for o in O:
        oid, nom, ico, fam, grp, cmd, da, lot, syn, action, proto = o
        if oid in DEJA_EN_PALETTE[cible] or oid == "selection":
            continue
        dispo = lot in ("3a", "3b")
        cls = "res" if dispo else "res indispo"
        etat = FAM_NOM[fam] + (" · outil" if dispo else f" · lot {lot}")
        l.append(f'<li class="{cls}" role="option" id="r-{oid}" data-mots="{e(syn)}">'
                 f'<span class="nom">{e(nom)}</span><span class="fam">{e(etat)}</span><span class="via" hidden></span>'
                 f'<dl><dt>Action</dt><dd>{e(action)}</dd><dt>Commande</dt><dd><code>{e(cmd)}</code> · fiche {e(da)}</dd>'
                 + ("" if dispo else f'<dt>Conditions</dt><dd>Indisponible avant le lot {e(lot)}.</dd>')
                 + '</dl></li>')
    return "\n    ".join(l)


def correspondance():
    # 1. Outils du prototype (moteur actuel, apps/web/public/atelier-native/v14-tools.js, 27 outils).
    proto = [o for o in O if o[10]]
    navp = [n for n in NAVIGATION if n[5]]
    l = ['<h3>Les 27 outils du prototype actuel</h3>',
         '<p class="muet">Liste lue dans <code>apps/web/public/atelier-native/v14-tools.js</code> (<code>TOOLS</code>). '
         f'{len(proto) + len(navp)} / 27 ont une place dans la maquette.</p>',
         '<table class="corresp"><tr><th>Outil du prototype</th><th>Dans la maquette</th><th>Fiche</th><th>Lot</th></tr>']
    for o in proto:
        alerte = ' <span class="lot trou">absent entre lot 4 et lot 5</span>' if o[7] in TROU else ""
        l.append(f'<tr><td>{e(o[10])}</td><td>{e(FAM_NOM[o[3]])} › {e(o[4])} › <b>{e(o[1])}</b></td><td>{e(o[6])}</td><td>{e(o[7])}{alerte}</td></tr>')
    for n in navp:
        l.append(f'<tr><td>{e(n[5])}</td><td>Navigation de la vue › <b>{e(n[1])}</b></td><td>{e(n[3])}</td><td>{e(n[4])}</td></tr>')
    l.append('</table>')
    # 2. Entrées DA retenues pour les lots 1 à 3 (fiches L0.2).
    fiches = sorted(p.stem for p in (ICI.parent / "fiches").glob("DA-*.md"))
    l.append('<h3>Les entrées DA retenues pour les lots 1 à 3</h3>')
    l.append(f'<p class="muet">Une ligne par fiche de <code>docs/atelier/fiches/</code> ({len(fiches)} fiches).</p>')
    l.append('<table class="corresp"><tr><th>Fiche</th><th>Où la voir</th></tr>')
    manquantes = []
    for f in fiches:
        outils = [o for o in O if f in o[6]]
        if outils:
            ou = " ; ".join(f'{FAM_NOM[o[3]]} › <b>{e(o[1])}</b>' for o in outils)
        elif f in DA_HORS_OUTILS:
            ou = e(DA_HORS_OUTILS[f])
        else:
            ou = '<span class="nonev">non représentée</span>'
            manquantes.append(f)
        l.append(f'<tr><td><a href="#{f}" id="{f}">{f}</a></td><td>{ou}</td></tr>')
    l.append('</table>')
    if manquantes:
        print("Fiches sans emplacement :", ", ".join(manquantes), file=sys.stderr)
    return "\n  ".join(l), manquantes


def remplacer(texte, cle, contenu):
    motif = re.compile(rf"(<!-- OUTILS:{cle} -->).*?(<!-- /OUTILS:{cle} -->)", re.S)
    if not motif.search(texte):
        raise SystemExit(f"marqueur OUTILS:{cle} absent")
    return motif.sub(lambda m: m.group(1) + contenu + m.group(2), texte)


def main():
    verifier = "--verifier" in sys.argv
    corresp, manquantes = correspondance()
    blocs = {
        "ordinateur.html": {"BARRE": barre_pc(), "NAV": nav_pc(), "PALETTE": palette("pc")},
        "telephone.html": {"FEUILLE": feuille_tel(), "PALETTE": palette("tel")},
        "index.html": {"CORRESPONDANCE": corresp},
    }
    perime = []
    for page, cles in blocs.items():
        p = ICI / page
        avant = p.read_text(encoding="utf-8")
        apres = avant
        for cle, contenu in cles.items():
            apres = remplacer(apres, cle, contenu)
        if apres != avant:
            perime.append(page)
            if not verifier:
                p.write_text(apres, encoding="utf-8")
    if verifier and perime:
        raise SystemExit("Pages à régénérer (outils/outils.py) : " + ", ".join(perime))
    if manquantes:
        raise SystemExit(1)
    print(("à jour" if verifier else "écrit") + f" · {len(O)} outils, {len(NAVIGATION)} gestes de navigation")


if __name__ == "__main__":
    main()
