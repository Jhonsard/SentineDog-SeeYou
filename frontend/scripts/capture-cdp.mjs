import fs from "node:fs/promises";

const BASE = "http://localhost:3001";
const OUT = "livrables/captures";

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
const TOKEN = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ sub: "admin", exp: 4102444800 })}.`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id) {
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        msg.error
          ? pending.reject(new Error(JSON.stringify(msg.error)))
          : pending.resolve(msg.result);
      } else {
        (this.listeners.get(msg.method) ?? []).forEach((fn) => fn(msg.params));
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  once(method, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`timeout ${method}`)),
        timeout,
      );
      const fn = (params) => {
        clearTimeout(timer);
        this.listeners.set(
          method,
          (this.listeners.get(method) ?? []).filter((f) => f !== fn),
        );
        resolve(params);
      };
      this.listeners.set(method, [...(this.listeners.get(method) ?? []), fn]);
    });
  }
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const target = await (
    await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })
  ).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const evaluate = async (expression) => {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
    });
    return result?.value;
  };

  const go = async (path) => {
    const loaded = cdp.once("Page.loadEventFired").catch(() => {});
    await cdp.send("Page.navigate", { url: BASE + path });
    await loaded;
    await sleep(1800);
    await evaluate(
      `(() => { if (!document.getElementById("hide-toasts")) { const s = document.createElement("style"); s.id = "hide-toasts"; s.textContent = "[data-sonner-toaster]{display:none!important}"; document.head.appendChild(s); } })()`,
    );
  };

  const shot = async (name) => {
    const { data } = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    await fs.writeFile(`${OUT}/${name}.png`, Buffer.from(data, "base64"));
    console.log("capture:", name);
  };

  const scenario = async (name, path, theme, options = {}) => {
    await go("/welcome");
    await evaluate("localStorage.clear()");
    const items = { theme };
    if (options.auth) items.jwt_token = TOKEN;
    if (options.logs) items["logs-display"] = options.logs;
    await evaluate(
      Object.entries(items)
        .map(
          ([k, v]) =>
            `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`,
        )
        .join(""),
    );
    await go(path);
    await shot(name);
  };

  const clickText = async (text) => {
    const found = await evaluate(
      `(() => { const el = [...document.querySelectorAll("button")].find((b) => b.textContent.includes(${JSON.stringify(text)})); if (!el) return false; el.click(); return true; })()`,
    );
    await sleep(1200);
    return found;
  };

  // Pages publiques
  await scenario("welcome-light", "/welcome", "light");
  await scenario("welcome-dark", "/welcome", "dark");
  await scenario("login-light", "/login", "light");
  await scenario("404-light", "/404", "light");

  // Dashboard et onglets, mode clair
  await scenario("dashboard-light", "/", "light", { auth: true });
  await scenario("dashboard-dark", "/", "dark", { auth: true });
  await scenario("logs-light", "/logs", "light", { auth: true });
  await scenario("logs-dark", "/logs", "dark", { auth: true });
  await scenario("logs-severity-light", "/logs", "light", {
    auth: true,
    logs: "severity",
  });

  const tabs = [
    ["networklogs", "Network Logs"],
    ["threatintel", "Threat Intel"],
    ["assets", "Assets"],
    ["profile", "Profile"],
    ["nodes", "Nodes Management"],
    ["settings", "Settings"],
    ["blacklist", "Hôtes Bloqués"],
  ];
  for (const [name, label] of tabs) {
    await scenario(`${name}-light`, "/", "light", { auth: true });
    const ok = await clickText(label);
    if (ok) await shot(`${name}-light-tab`);
    else console.log("onglet introuvable:", label);
  }

  // Coloration par sévérité sur Network Logs
  await scenario("networklogs-severity-light", "/", "light", {
    auth: true,
    logs: "severity",
  });
  if (await clickText("Network Logs")) {
    await sleep(600);
    await shot("networklogs-severity-light-tab");
  }

  // Paramètres en mode sombre
  await scenario("settings-dark", "/", "dark", { auth: true });
  if (await clickText("Settings")) await shot("settings-dark-tab");

  cdp.ws.close();
  await fetch(`http://127.0.0.1:9222/json/close/${target.id}`, {
    method: "PUT",
  }).catch(() => {});
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
