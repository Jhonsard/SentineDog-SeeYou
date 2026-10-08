#!/usr/bin/env python3
import time
import sys
from scapy.all import IP, TCP, send

def simulate_port_scan(target_ip, spoofed_src_ip=None, start_port=1, end_port=20):
    """
    Simule une attaque de type 'Port Scan Detected' en envoyant des paquets TCP SYN
    vers une plage de ports de la machine cible.
    """
    print(f"[*] Début de la simulation d'attaque (Port Scan) vers {target_ip}...")
    if spoofed_src_ip:
        print(f"[*] IP Source usurpée : {spoofed_src_ip}")
    else:
        print("[*] Utilisation de l'IP de l'interface par défaut.")

    print(f"[*] Balayage des ports {start_port} à {end_port}...")
    
    count = 0
    # On boucle sur la plage de ports pour générer les occurrences de l'attaque
    for port in range(start_port, end_port + 1):
        # Construction du paquet IP / TCP
        # dport = port de destination, flags="S" = SYN packet (tentative de connexion)
        if spoofed_src_ip:
            packet = IP(src=spoofed_src_ip, dst=target_ip) / TCP(sport=44444, dport=port, flags="S")
        else:
            packet = IP(dst=target_ip) / TCP(sport=44444, dport=port, flags="S")
        
        # Envoi du paquet sans attendre de réponse (plus rapide)
        send(packet, verbose=False)
        count += 1
        
        # Petit délai pour simuler un scan réaliste ou rapide (ajustable)
        time.sleep(0.1)
        
        if count % 5 == 0:
            print(f"[+] {count} paquets envoyés...")

    print(f"[+] Simulation terminée. {count} occurrences d'attaques envoyées.")

if __name__ == "__main__":
    # Configuration de la cible basée sur ton réseau local d'exemple
    # Remplace par l'IP de la machine où tourne ton sniffer Scapy si nécessaire
    TARGET_IP = "192.168.168.105" 
    
    # On utilise une IP externe fictive pour correspondre à tes logs (ex: 35.223.238.178)
    FAKE_SRC_IP = "127.0.0.1"

    # Exécution
    try:
        # Note : L'envoi de paquets bruts (Raw Sockets) nécessite les privilèges Root sur Linux
        while True:
            simulate_port_scan(target_ip=TARGET_IP, spoofed_src_ip=FAKE_SRC_IP, start_port=20, end_port=45)
    except PermissionError:
        print("[-] Erreur : Vous devez exécuter ce script avec les privilèges root (sudo python3 simulate_attack.py).")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n[-] Simulation interrompue par l'utilisateur.")
