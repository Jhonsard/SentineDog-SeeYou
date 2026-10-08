# ml_model/RL/main.py
# FIXED: suppression du serveur FastAPI doublon
# FIXED: suppression des imports backend.app.* impossibles ici
# FIXED: suppression des appels à API/process_packet/handle_alert inexistants
# Ce fichier ne sert qu'à exposer un point d'entrée unitaire pour l'inférence RL.

from ml_model.RL.inference import RLInference

__all__ = ["RLInference"]
