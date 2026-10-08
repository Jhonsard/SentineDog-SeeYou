#!/usr/bin/env python3
"""
Script de test pour les règles de filtrage firewall avancées.
Teste les détections équivalentes à Snort.
"""
import asyncio
import sys
from app.engine.firewall import firewall_manager

async def test_firewall_rules():
    """Teste les règles de filtrage firewall avancées."""
    print("="*60)
    print("TEST DES RÈGLES DE FILTRAGE FIREWALL AVANCÉES")
    print("="*60)
    
    tests_passed = 0
    tests_failed = 0
    
    # Test 1: Détection NULL scan
    print("\n[Test 1] Détection TCP NULL scan...")
    packet_info = {
        "src_ip": "192.168.1.100",
        "dst_ip": "10.0.0.1",
        "protocol": "TCP",
        "flags": 0  # NULL scan
    }
    result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
    if result:
        print(f"✓ NULL scan détecté: {result}")
        tests_passed += 1
    else:
        print("✗ NULL scan non détecté")
        tests_failed += 1
    
    # Nettoyer pour le test suivant
    if "192.168.1.100" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.100", "test")
    
    # Test 2: Détection XMAS scan
    print("\n[Test 2] Détection TCP XMAS scan...")
    packet_info = {
        "src_ip": "192.168.1.101",
        "dst_ip": "10.0.0.1",
        "protocol": "TCP",
        "flags": 0x29  # FIN, PSH, URG flags
    }
    result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
    if result:
        print(f"✓ XMAS scan détecté: {result}")
        tests_passed += 1
    else:
        print("✗ XMAS scan non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.101" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.101", "test")
    
    # Test 3: Détection FIN scan
    print("\n[Test 3] Détection TCP FIN scan...")
    packet_info = {
        "src_ip": "192.168.1.102",
        "dst_ip": "10.0.0.1",
        "protocol": "TCP",
        "flags": 0x01  # FIN flag only
    }
    result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
    if result:
        print(f"✓ FIN scan détecté: {result}")
        tests_passed += 1
    else:
        print("✗ FIN scan non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.102" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.102", "test")
    
    # Test 4: Détection port scan (multiple ports)
    print("\n[Test 4] Détection port scan...")
    for port in range(1, 15):  # Scanner 14 ports (seuil = 10)
        packet_info = {
            "src_ip": "192.168.1.103",
            "dst_ip": "10.0.0.1",
            "protocol": "TCP",
            "dst_port": port,
            "flags": 0x02  # SYN
        }
        result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
        if result:
            print(f"✓ Port scan détecté: {result}")
            tests_passed += 1
            break
    else:
        print("✗ Port scan non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.103" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.103", "test")
    
    # Test 5: Détection SYN Flood
    print("\n[Test 5] Détection SYN Flood...")
    for i in range(105):  # Envoyer 105 SYN (seuil = 100)
        packet_info = {
            "src_ip": "192.168.1.104",
            "dst_ip": "10.0.0.1",
            "protocol": "TCP",
            "flags": 0x02  # SYN
        }
        result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
        if result:
            print(f"✓ SYN Flood détecté: {result}")
            tests_passed += 1
            break
    else:
        print("✗ SYN Flood non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.104" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.104", "test")
    
    # Test 6: Détection ICMP Flood
    print("\n[Test 6] Détection ICMP Flood...")
    for i in range(55):  # Envoyer 55 ICMP (seuil = 50)
        packet_info = {
            "src_ip": "192.168.1.105",
            "dst_ip": "10.0.0.1",
            "protocol": "ICMP"
        }
        result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
        if result:
            print(f"✓ ICMP Flood détecté: {result}")
            tests_passed += 1
            break
    else:
        print("✗ ICMP Flood non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.105" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.105", "test")
    
    # Test 7: Détection rate limiting
    print("\n[Test 7] Détection rate limiting...")
    for i in range(35):  # Envoyer 35 connexions (seuil = 30)
        packet_info = {
            "src_ip": "192.168.1.106",
            "dst_ip": "10.0.0.1",
            "protocol": "TCP",
            "dst_port": 80
        }
        result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
        if result:
            print(f"✓ Rate limit dépassé: {result}")
            tests_passed += 1
            break
    else:
        print("✗ Rate limit non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.106" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.106", "test")
    
    # Test 8: Ignorer les IPs locales
    print("\n[Test 8] Test d'exclusion des IPs locales...")
    packet_info = {
        "src_ip": "192.168.1.50",
        "dst_ip": "10.0.0.1",
        "protocol": "TCP",
        "flags": 0  # NULL scan
    }
    result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
    if not result:
        print("✓ IP locale ignorée (non bloquée)")
        tests_passed += 1
    else:
        print("✗ IP locale bloquée (devrait être ignorée)")
        tests_failed += 1
    
    # Test 9: UDP port scan
    print("\n[Test 9] Détection UDP port scan...")
    for port in range(1, 15):  # Scanner 14 ports UDP
        packet_info = {
            "src_ip": "192.168.1.107",
            "dst_ip": "10.0.0.1",
            "protocol": "UDP",
            "dst_port": port
        }
        result = await firewall_manager.apply_advanced_firewall_rules(packet_info)
        if result:
            print(f"✓ UDP port scan détecté: {result}")
            tests_passed += 1
            break
    else:
        print("✗ UDP port scan non détecté")
        tests_failed += 1
    
    # Nettoyer
    if "192.168.1.107" in firewall_manager.blocked_ips:
        await firewall_manager.unblock_ip("192.168.1.107", "test")
    
    # Nettoyer les trackers
    print("\nNettoyage des trackers...")
    firewall_manager.cleanup_trackers()
    print("✓ Trackers nettoyés")
    
    # Résumé
    print("\n" + "="*60)
    print("RÉSUMÉ DES TESTS")
    print("="*60)
    print(f"Tests réussis: {tests_passed}")
    print(f"Tests échoués: {tests_failed}")
    print(f"Total tests: {tests_passed + tests_failed}")
    
    if tests_failed == 0:
        print("\n✓ Tous les tests réussis!")
        return True
    else:
        print(f"\n✗ {tests_failed} test(s) échoué(s)")
        return False

if __name__ == "__main__":
    success = asyncio.run(test_firewall_rules())
    sys.exit(0 if success else 1)
