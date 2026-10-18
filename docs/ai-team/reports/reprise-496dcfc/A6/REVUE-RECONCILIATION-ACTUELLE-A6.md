# Revue A6 des deux résolutions actuelles

PASS statique borné : dix contextes et14 négatifs par fichier ; égalité repo/headrepo/base/event/branche vérifiée.

- PR169 : `c5933b1aebf6def658037cf27989f2af7cb60e41adb88120e19107dacba87c44` ; contrôles tous conformes=True.
- PR171 : `beca2dea96a0cef5dd027b16fe6bbcf5099b3b73c196210ca2f02ca47ad618b9` ; contrôles tous conformes=True.

Jobs applicatifs inchangés sauf if/commentaires, conditions avant services ; jobs purs seuls éligibles pour les branches exactes présentes dans chaque variante. Triggers et permissions inchangés.169 inclut les quatre restrictions repository proposées ;171 identique au template.

Analyse textuelle locale stdlib et grammaire égalité/and/or/not strictement bornée sans eval, sans import des helpers tiers ; aucun runner/test/service/DB/réseau. Avis statique pour résolution locale bornée. Pas preuve CI futur SHA ni autorisation push/fusion main/admin/services. Les autres contextes rendent les jobs applicatifs éligibles. Templates source b6794c64c7ff98fadf62868331f4297631201069, main817bd36.

Limite de sémantique Actions : `==` y compare les chaînes sans distinguer la casse. La matrice finie porte sur les valeurs canoniques ; elle ne démontre pas le rejet des variations de casse et ne constitue pas un moteur Actions complet. Les conditions utilisent les littéraux déclarés sans wildcard.
