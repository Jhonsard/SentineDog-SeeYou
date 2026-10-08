"""
Tests de robustesse de la file d'attente de paquets Phase 6.
Vérifie :
- Compteur atomique de paquets perdus par saturation
- Backpressure contrôlé sans exception non gérée
- Exposition des métriques via PacketQueueManager
"""
import os
import unittest
import asyncio

os.environ.setdefault("SECRET_KEY", "aB3dEfGhIjKlMnOpQrStUvWxYz123456")

from app.engine.queue_manager import PacketQueueManager


class TestPacketQueueManager(unittest.TestCase):
    def test_put_nowait_success(self):
        manager = PacketQueueManager(maxsize=2)
        result = manager.put_nowait_with_metrics("pkt1")
        self.assertTrue(result)
        self.assertEqual(manager.dropped_packets, 0)
        self.assertEqual(manager.qsize(), 1)

    def test_put_nowait_drops_on_full(self):
        manager = PacketQueueManager(maxsize=1)
        manager.put_nowait_with_metrics("pkt1")
        result = manager.put_nowait_with_metrics("pkt2")
        self.assertFalse(result)
        self.assertEqual(manager.dropped_packets, 1)
        self.assertEqual(manager.qsize(), 1)

    def test_get_nowait(self):
        manager = PacketQueueManager(maxsize=10)
        manager.put_nowait_with_metrics("pkt1")
        item = manager.get_nowait()
        self.assertEqual(item, "pkt1")
        self.assertEqual(manager.qsize(), 0)

    def test_task_done(self):
        manager = PacketQueueManager(maxsize=10)
        manager.put_nowait_with_metrics("pkt1")
        manager.get_nowait()
        manager.task_done()
        self.assertEqual(manager.qsize(), 0)

    def test_metrics_exposure(self):
        manager = PacketQueueManager(maxsize=10)
        for _ in range(5):
            manager.put_nowait_with_metrics("pkt")
        manager.get_nowait()
        
        metrics = manager.get_metrics()
        self.assertEqual(metrics["queue_size"], 4)
        self.assertEqual(metrics["queue_maxsize"], 10)
        self.assertEqual(metrics["total_processed"], 1)
        self.assertEqual(metrics["utilization_pct"], 40.0)

    def test_high_saturation_drops(self):
        manager = PacketQueueManager(maxsize=3)
        for i in range(100):
            manager.put_nowait_with_metrics(f"pkt{i}")
        
        self.assertGreater(manager.dropped_packets, 0)
        self.assertEqual(manager.qsize(), 3)
        self.assertEqual(manager.qsize(), manager.maxsize)
        metrics = manager.get_metrics()
        self.assertEqual(metrics["queue_size"], 3)
        self.assertGreater(metrics["dropped_packets"], 90)

    def test_empty_queue_get_raises(self):
        manager = PacketQueueManager(maxsize=10)
        with self.assertRaises(asyncio.QueueEmpty):
            manager.get_nowait()


if __name__ == "__main__":
    unittest.main()
