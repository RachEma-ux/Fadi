# Écarts déclarés — PDF reçu (cas 4, lot C4, étape 4)

Maquette : `analyses/catalogue-extensions/cas-4/maquettes/c4-etape-4-pdf-recu.png`. Catalogue : D10-F14-008,
D10-F14-009, D10-S-004.

## Lecture du PDF
- Lecteur écrit pour Fadi (`packages/sandbox-planche-model/src/pdf-recu.ts`), sans bibliothèque : objets directs et
  flux d'objets (PDF 1.5), arbre des pages, MediaBox, Rotate, UserUnit, contenus et formulaires (XObject Form, 8 niveaux
  au plus). Décompression FlateDecode par `inflate.ts` (écrite pour Fadi). Les flux à prédicteur et les autres filtres
  (LZW, ASCII85…) ne sont pas lus : ils sont comptés « non lus » dans la liste des pages, jamais ignorés en silence.
- PDF chiffré : refusé avec motif.
- Traits peints (S, s, B, b) repris en segments, en millimètres papier. Les aplats (f, F, f*) ne sont pas repris : ils
  sont comptés. Les épaisseurs, couleurs, tiretés et calques (OCG) du PDF ne sont pas repris.
- Arcs : une courbe de Bézier qui suit un cercle à 0,05 mm papier près devient un vrai arc ; les arcs consécutifs d'un
  même cercle sont réunis (un cercle en quatre courbes redevient un cercle). Les ellipses et courbes libres sont posées
  en segments (4 à 32 par courbe), comptées.
- Textes : relevés seulement pour proposer l'échelle ; ils ne sont pas insérés. Les polices à codage propre (CID) ne
  donnent pas de texte lisible : l'échelle n'est alors pas proposée d'après le texte.
- Au-delà de 200 000 traits, la page n'est pas insérable (motif affiché) ; l'aperçu s'arrête à 30 000 traits, tous
  sont insérés.

## Échelle
- Proposée d'après le texte de la page (« 1:100 », « 1/50 », « 1 : 1 000 » ; la plus fréquente) ou d'après la barre
  d'échelle **pointée** : deux clics sur l'aperçu et la longueur réelle tapée. La barre graphique n'est pas reconnue
  automatiquement (écart à « échelle proposée d'après la barre d'échelle ») : la personne la pointe.
- Rien n'est inséré ni posé avant « Confirmer l'échelle » ; priorité : échelle tapée, puis barre pointée, puis texte.
- La concordance barre / texte est jugée à 1 % près.

## Insertion
- Une page = un groupe nommé « fichier · p. n », décrit par le fichier, la page, l'échelle et l'empreinte de l'original
  archivé. Arêtes à l'altitude du niveau choisi, à partir de l'origine saisie ; pas de rotation à l'insertion (elle se
  fait ensuite avec l'outil Rotation).
- Les arêtes suivent les règles de la Planche (découpe aux croisements, faces automatiques) : un plan très chargé est
  lent à insérer (même limite que l'insertion d'un plan DXF au-delà de 5 000 traits).
- Mesure sur tablette : sur l'aperçu, deux clics accrochés aux extrémités des traits et des arcs ; longueur à l'échelle
  confirmée, sinon en millimètres papier.

## Page scannée
- Image JPEG (DCTDecode) ou pixels 8 bits gris / RVB (FlateDecode) ; les autres codages (JBIG2, CCITT, JPEG 2000) ne
  sont pas lus (comptés). La plus grande image de la page est posée comme un fond de l'étape 1, à l'échelle confirmée,
  calée et non verrouillée ; une image déformée ou en miroir est refusée.
- Le PDF d'origine est archivé tel quel en base (table `sandbox_references_fichiers`, format `pdf`) ; l'image extraite
  est archivée comme original du fond (`/sandbox/fonds`).
- Raccourcis en deux temps : P (panneau), Maj+P, E, B, Maj+E, I, F après Ctrl+Maj+Espace.
