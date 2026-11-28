# Écarts Fadi — liens de consultation (cas 4 du catalogue des extensions, étape 7d)

Référence du panneau « Liens de consultation » et de la page publique `/consultation/:jeton` (fiche D11-F18-018 du
catalogue des extensions, lot C0 du cas 4 « Noyau ou hôte » ; maquette
`analyses/catalogue-extensions/cas-4/maquettes/etape-7-hote.png`, quart 7d). Un lien donne une **copie figée** de la
Planche, en lecture seule, ouvrable sans compte (téléphone d'abord). Le dessin d'origine n'est jamais modifié par un lien.

## § 1 — Panneau

- **Partager un lien** (Fichier ▸ Partager un lien, Outils ▾, Ctrl+Alt+7) ouvre le panneau, hors de la colonne.
- Réglages avant de créer : **Échéance** (date, ou aucune) et **Mesure** (permise ou non).
- **Créer le lien** (Ctrl+Alt+Maj+9) : le dessin courant est envoyé, relu par le serveur (`lireModelePlanche`), rangé
  tel quel (`sandbox_consultations`), avec un jeton aléatoire de 24 octets (32 caractères). Dessin de 8 Mo au plus.
- Liste « Version figée / Échéance » : sur le lien choisi, **Copier** (Ctrl+Alt+9, presse-papiers, l'adresse est aussi
  écrite dans le panneau) et **Révoquer** (Ctrl+Alt+8, définitif). Un lien révoqué ou échu est marqué « Révoqué » / « Échu ».
- Compte connecté exigé pour créer, lister et révoquer ; chaque compte ne voit que ses liens.

## § 2 — Page de consultation (sans compte)

- En-tête toujours visible : nom de la Planche et « Version du jj.mm.aaaa hh h mm · lecture seule ».
- Scènes de la Planche en pastilles (« Vue d'ensemble » cadre tout) ; barre **Orbiter / Mesurer / Cadrer**.
- **Mesurer** (si le lien le permet, sinon grisé) : deux points accrochés (sommets, arêtes, faces) donnent la longueur à
  deux décimales, précédée de « ≈ » quand l'arrondi change la valeur.
- Aucune commande d'édition ; seul appel au serveur : `GET /consultation/api/:jeton`.
- Un lien révoqué, échu (échéance passée, heure suisse) ou inconnu répond « Lien indisponible » — sans dire lequel.

## § 3 — Écarts déclarés à la maquette

- Raccourcis : la maquette donnait Ctrl+Alt+5 (Partager) et Ctrl+Alt+6 (Révoquer), pris par les règles de hauteur de
  l'enveloppe (étape 7c) : Partager un lien = Ctrl+Alt+7, Révoquer = Ctrl+Alt+8. « Créer le lien » et « Copier », sans
  raccourci sur la maquette, reçoivent Ctrl+Alt+Maj+9 et Ctrl+Alt+9 (règle d'or : chaque commande a le sien).
- La longueur mesurée s'affiche dans la vue et en haut de la vue (consigne), au lieu de la seule étiquette.
