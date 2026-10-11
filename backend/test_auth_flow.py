#!/usr/bin/env python3
"""Diagnostique le cycle d'authentification complet: login -> REST -> WebSocket.

Le serveur uvicorn est lance comme sous-processus; tout l'output est capture
en memoire et affiche UNIQUEMENT a la fin, pour resister au filtrage stdout.
"""
import os, sys, subprocess, time, json, urllib.request, urllib.parse, asyncio

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = []


def log(*a):
    OUT.append(" ".join(str(x) for x in a))


def http(method, url, data=None, headers=None, timeout=6):
    h = headers or {}
    body = None
    if data is not None:
        body = urllib.parse.urlencode(data).encode()
        h.setdefault("Content-Type", "application/x-www-form-urlencoded")
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()
    except Exception as e:
        return 0, str(e)


def main():
    backend = os.path.dirname(os.path.abspath(__file__))
    env = dict(os.environ)
    py = os.path.join(os.path.dirname(backend), ".venv", "bin", "python")
    if not os.path.exists(py):
        py = sys.executable
    log("python:", py)

    srv = subprocess.Popen(
        [py, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
         "--port", "8000", "--log-level", "info"],
        cwd=backend, env=env,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    base = "http://127.0.0.1:8000"
    try:
        for _ in range(40):
            time.sleep(0.5)
            st, _ = http("GET", base + "/api/v1/health", timeout=2)
            if st == 200:
                break
        log("health:", st)

        # 1. LOGIN
        st, body = http("POST", base + "/api/v1/auth/token",
                        data={"username": "admin", "password": "Admin@IDS2025!"})
        log("login status:", st)
        tok = ""
        try:
            tok = json.loads(body).get("access_token", "")
        except Exception:
            pass
        log("token len:", len(tok))

        # 2. REST protege
        st2, _ = http("GET", base + "/api/v1/alerts/history?limit=3",
                      headers={"Authorization": "Bearer " + tok})
        log("REST /alerts/history:", st2)
        st3, _ = http("GET", base + "/api/v1/ai/status",
                      headers={"Authorization": "Bearer " + tok})
        log("REST /ai/status:", st3)

        # 3. Decodage du payload (sans verifier la signature)
        try:
            p = tok.split(".")[1]
            p += "=" * (-len(p) % 4)
            import base64
            payload = json.loads(base64.urlsafe_b64decode(p))
            log("payload:", {k: payload.get(k) for k in ("sub", "role", "exp", "iat")})
            log("exp vs now:", payload.get("exp"), int(time.time()),
                "EXPIRE" if payload.get("exp", 0) < time.time() else "VALIDE")
        except Exception as e:
            log("decode payload err:", e)

        # 4. WebSocket
        try:
            import websockets

            async def ws_test():
                async with websockets.connect(
                    "ws://127.0.0.1:8000/api/v1/alerts/ws/alerts",
                    origin="http://localhost:3000",
                ) as ws:
                    await ws.send(json.dumps({"token": tok}))
                    try:
                        r = await asyncio.wait_for(ws.recv(), timeout=4)
                        return "RECU: " + str(r)[:60]
                    except asyncio.TimeoutError:
                        return "CONNECTE (auth OK, en attente d'alertes)"

            log("WS:", asyncio.run(ws_test()))
        except Exception as e:
            log("WS err:", type(e).__name__, e)
    finally:
        srv.terminate()
        try:
            out, _ = srv.communicate(timeout=5)
            for line in (out or b"").decode(errors="replace").splitlines():
                if any(x in line for x in ("ids_ips", "Application startup",
                                           "Uvicorn running", "ERROR",
                                           "Traceback", "Error")):
                    log("SRV:", line[:160])
        except Exception:
            pass
    print("\n".join(OUT))


if __name__ == "__main__":
    main()
