#!/usr/bin/env python3
"""
Script pour corriger le document Word conformément aux commentaires de l'enseignant
"""

from docx import Document
from docx.shared import Pt, RGBColor
from docx.enum.text import WD_PARAGRAPH_ALIGNMENT

def load_document(path):
    """Charge le document Word original"""
    return Document(path)

def correct_citations(doc):
    """Harmonise les citations : remplace 'et al[' par 'et al.'"""
    corrections = 0
    for para in doc.paragraphs:
        if 'et al[' in para.text:
            # Remplacer le texte
            para.text = para.text.replace('et al[', 'et al.[')
            corrections += 1
    print(f"✓ Corrections citations : {corrections} remplacements")
    return doc

def add_dataset_alshuaibi(doc):
    """Ajoute le dataset pour Alshuaibi et al. (à compléter par l'utilisateur)"""
    for para in doc.paragraphs:
        if 'Alshuaibi et al.[3] rapportent' in para.text:
            # Note : l'utilisateur doit préciser le dataset exact
            # Pour l'instant, j'ajoute un marqueur
            if 'sur le jeu de données' not in para.text:
                para.text = para.text.replace(
                    'Alshuaibi et al.[3] rapportent, lors de l\'évaluation de plusieurs classificateurs supervisés,',
                    'Alshuaibi et al.[3] rapportent, lors de l\'évaluation de plusieurs classificateurs supervisés sur le jeu de données [À PRÉCISER : dataset utilisé],'
                )
                print("✓ Ajout dataset Alshuaibi : marqueur ajouté (à compléter)")
    return doc

def correct_random_forest_knn(doc):
    """Corrige l'incohérence chiffrée Random Forest/KNN"""
    for para in doc.paragraphs:
        if 'Random Forest atteint 99% d\'exactitude dans la classification binaire' in para.text:
            if 'soit un gain de 4% par rapport au Random Forest' in para.text:
                # Le Random Forest en multi-classes devrait être ~95% et non 99%
                para.text = para.text.replace(
                    'Random Forest atteint 99% d\'exactitude dans la classification binaire des attaques DDoS HTTP, tandis que l\'algorithme KNN surpasse ses pairs dans la classification multi-classes avec une exactitude de 99%, soit un gain de 4% par rapport au Random Forest pour cette tâche spécifique.',
                    'Random Forest atteint 99% d\'exactitude dans la classification binaire des attaques DDoS HTTP, tandis que l\'algorithme KNN surpasse ses pairs dans la classification multi-classes avec une exactitude de 99%, soit un gain de 4% par rapport au Random Forest (environ 95% en multi-classes) pour cette tâche spécifique.'
                )
                print("✓ Correction Random Forest/KNN : ajout de la précision multi-classes (~95%)")
    return doc

def explain_unsw_nb15_drop(doc):
    """Explique la baisse à 85,55% sur UNSW-NB15"""
    for para in doc.paragraphs:
        if '85,55% sur UNSW-NB15' in para.text:
            if 'Cette disparité démontre' in para.text:
                # Ajouter une explication possible
                para.text = para.text.replace(
                    'Cette disparité démontre qu\'aucune généralisation absolue des performances ne peut être extraite sans corrélation stricte avec le jeu de données exploité.',
                    'Cette disparité s\'explique probablement par le déséquilibre des classes plus marqué dans UNSW-NB15, la distribution différente des attributs, et la nature des attaques représentées dans ce dataset (plus subtiles et récentes). Elle démontre qu\'aucune généralisation absolue des performances ne peut être extraite sans corrélation stricte avec le jeu de données exploité.'
                )
                print("✓ Explication baisse UNSW-NB15 : ajoutée")
    return doc

def split_long_sentence(doc):
    """Scinde la phrase très longue en deux phrases"""
    for para in doc.paragraphs:
        if 'Kumar (Amit) et al.[9]' in para.text:
            if 'l\'objectif n\'est pas uniquement de réduire le délai de réponse — en tendant vers des inférences ultra-rapides de l\'ordre de la milliseconde —, mais aussi de limiter la dépendance à des serveurs centraux' in para.text:
                para.text = para.text.replace(
                    'Comme le démontrent Kumar (Amit) et al.[9], l\'objectif n\'est pas uniquement de réduire le délai de réponse — en tendant vers des inférences ultra-rapides de l\'ordre de la milliseconde —, mais aussi de limiter la dépendance à des serveurs centraux dont la congestion peut compromettre la fonction de prévention.',
                    'Comme le démontrent Kumar (Amit) et al.[9], l\'objectif est de tendre vers des inférences ultra-rapides de l\'ordre de la milliseconde pour réduire le délai de réponse. Il vise également à limiter la dépendance à des serveurs centraux dont la congestion peut compromettre la fonction de prévention.'
                )
                print("✓ Scission phrase longue : effectuée")
    return doc

def add_el_hajj_metrics(doc):
    """Ajoute un résultat chiffré pour El-Hajj (à compléter par l'utilisateur)"""
    for para in doc.paragraphs:
        if 'El-Hajj[8]' in para.text:
            if 'minimiser le temps d\'analyse des flux' in para.text:
                # Note : l'utilisateur doit ajouter le chiffre exact
                if 'gain de' not in para.text and 'réduction de' not in para.text:
                    para.text = para.text.replace(
                        'répond à une exigence essentielle des environnements inline : minimiser le temps d\'analyse des flux sans compromettre la qualité globale de la détection.',
                        'répond à une exigence essentielle des environnements inline : minimiser le temps d\'analyse des flux [À PRÉCISER : ajouter chiffre ex: réduction de X% du temps de traitement] sans compromettre la qualité globale de la détection.'
                    )
                    print("✓ Ajout métriques El-Hajj : marqueur ajouté (à compléter)")
    return doc

def reduce_conclusion_redundancy(doc):
    """Réduit la redondance entre la conclusion et la synthèse"""
    for para in doc.paragraphs:
        if 'Thirimanne et al.[11]' in para.text:
            if 'En pratique, un modèle affichant d\'excellents résultats' in para.text:
                # Raccourcir pour éviter la redondance avec la synthèse
                para.text = para.text.replace(
                    'En pratique, un modèle affichant d\'excellents résultats en simulation ne garantit pas une robustesse équivalente en environnement de production. Dès lors, l\'évaluation d\'un IPS ne doit pas se limiter aux métriques de classification classiques ; elle doit également intégrer la latence de décision, le débit soutenu et la stabilité du comportement sous charge. Cette exigence méthodologique justifie le recours à des classificateurs plus légers ou à des architectures hybrides conçues explicitement pour concilier précision de détection et exécution en temps réel.',
                    'Cette baisse d\'efficacité pratique confirme que l\'évaluation d\'un IPS ne doit pas se limiter aux métriques de classification classiques, mais doit également intégrer la latence de décision, le débit soutenu et la stabilité sous charge.'
                )
                print("✓ Réduction redondance conclusion : effectuée")
    return doc

def create_summary_table(doc):
    """Crée un tableau récapitulatif comparatif des 11 travaux"""
    # Trouver la position après la section "Synthèse"
    table_inserted = False
    for i, para in enumerate(doc.paragraphs):
        if 'Synthèse de la revue de la littérature' in para.text:
            # Insérer le tableau après ce titre
            table = doc.add_table(rows=12, cols=5)
            # Utiliser un style simple ou aucun style
            try:
                table.style = 'Light Grid'
            except:
                pass  # Si le style n'existe pas, continuer sans style
            
            # En-têtes
            headers = ['Référence', 'Méthode/Modèle', 'Dataset', 'Métrique de performance', 'Latence/Contrainte temps réel']
            for j, header in enumerate(headers):
                table.rows[0].cells[j].text = header
                
            # Données (à compléter par l'utilisateur avec les valeurs exactes)
            data = [
                ['Ghurab et al.[1]', 'Signatures', '[À PRÉCISER]', '[À PRÉCISER]', 'Non mentionné'],
                ['Ahmed et al.[2]', 'Random Forest + SMOTE + ACP', 'UNSW-NB15', '95.1% exactitude', 'Non mentionné'],
                ['Alshuaibi et al.[3]', 'Random Forest, XGBoost', '[À PRÉCISER]', '99.3% exactitude, 99.4% F1', 'Non mentionné'],
                ['Churcher et al.[4]', 'Random Forest, KNN', 'Bot-IoT', '99% exactitude (binaire)', 'Non mentionné'],
                ['Bo Cao et al.[5]', 'CNN-BiGRU hybride', 'UNSW-NB15, NSL-KDD, CIC-IDS2017', '85.55% à 99.81%', 'Non mentionné'],
                ['Kilichev et Kim[6]', '1D-CNN + GA/PSO', 'UNSW-NB15', '99.31% exactitude', 'Non mentionné'],
                ['Seo et al.[7]', '[À PRÉCISER]', '[À PRÉCISER]', '[À PRÉCISER]', 'Temps réel mentionné'],
                ['El-Hajj[8]', 'Multi-niveaux', '[À PRÉCISER]', '[À PRÉCISER]', 'Temps réel mentionné'],
                ['Kumar (Amit) et al.[9]', 'Edge Computing', '[À PRÉCISER]', '[À PRÉCISER]', 'Inférence ~1ms'],
                ['Wijethilaka et al.[10]', 'Raspberry Pi', '[À PRÉCISER]', '[À PRÉCISER]', '~50ms temps de réponse'],
                ['Thirimanne et al.[11]', 'Deep Learning (RT-IDS)', 'NSL-KDD', 'Baisse en temps réel', 'Temps réel (problèmes)']
            ]
            
            for row_idx, row_data in enumerate(data, start=1):
                for col_idx, cell_data in enumerate(row_data):
                    table.rows[row_idx].cells[col_idx].text = cell_data
            
            table_inserted = True
            print("✓ Tableau récapitulatif : créé (à compléter avec les valeurs exactes)")
            break
    
    if not table_inserted:
        print("⚠ Tableau récapitulatif : non inséré (section 'Synthèse' non trouvée)")
    
    return doc

def save_document(doc, output_path):
    """Sauvegarde le document corrigé"""
    doc.save(output_path)
    print(f"✓ Document sauvegardé : {output_path}")

def main():
    input_path = '/home/jhonsard/Downloads/59Travail_From_NZANZU_VINGI_Patrick_1784470121.docx'
    output_path = '/home/jhonsard/Downloads/59Travail_From_NZANZU_VINGI_Patrick_1784470121_CORRIGE.docx'
    
    print("=== Début des corrections ===\n")
    
    # Charger le document
    doc = load_document(input_path)
    print("✓ Document chargé")
    
    # Appliquer les corrections
    doc = correct_citations(doc)
    doc = add_dataset_alshuaibi(doc)
    doc = correct_random_forest_knn(doc)
    doc = explain_unsw_nb15_drop(doc)
    doc = split_long_sentence(doc)
    doc = add_el_hajj_metrics(doc)
    doc = reduce_conclusion_redundancy(doc)
    doc = create_summary_table(doc)
    
    # Sauvegarder
    save_document(doc, output_path)
    
    print("\n=== Corrections terminées ===")
    print("\n⚠ NOTE : Certaines corrections nécessitent que vous complétiez les informations manquantes :")
    print("  - Dataset utilisé par Alshuaibi et al.[3]")
    print("  - Métriques chiffrées pour El-Hajj[8]")
    print("  - Valeurs exactes dans le tableau récapitulatif")

if __name__ == '__main__':
    main()
