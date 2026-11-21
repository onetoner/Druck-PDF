// Geräte-Test: führt .tablet/cdp.js in der laufenden App auf dem per USB angeschlossenen Gerät aus
// (WebView-DevTools über adb). Ergebnis und Konsolenmeldungen landen in der Ausgabe von tablet-test.bat.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const adb = process.env.ADB || 'adb';
const PKG = 'de.onetoner.zetteldruck';
const PORT = 9333;
const sh = (...args) => execFileSync(adb, args, { encoding: 'utf8' });

try {
  const pid = sh('shell', 'pidof', PKG).trim().split(/\s+/)[0];
  if (!pid) throw new Error('App läuft nicht.');
  const socks = [...sh('shell', 'cat', '/proc/net/unix').matchAll(/@(webview_devtools_remote_(\d+))/g)].map((m) => ({ name: m[1], pid: m[2] }));
  const sock = socks.find((s) => s.pid === pid);
  if (!sock) throw new Error(`Kein DevTools-Socket für PID ${pid} (gefunden: ${socks.map((s) => s.name).join(', ') || 'keine'})`);
  sh('forward', `tcp:${PORT}`, `localabstract:${sock.name}`);
  const pages = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = pages.find((p) => p.type === 'page' && /localhost/.test(p.url)) || pages[0];
  if (!page) throw new Error('Keine Seite in der WebView gefunden.');
  console.log(`Seite: ${page.url}`);
  if (typeof WebSocket === 'undefined') throw new Error(`Node ${process.version} hat kein WebSocket (Node 22 oder neuer nötig).`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WebSocket-Verbindung fehlgeschlagen')); });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled') console.log(`[console.${msg.params.type}] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
    if (msg.method === 'Runtime.exceptionThrown') console.log(`[exception] ${msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text}`);
  };
  const send = (method, params = {}) => new Promise((res) => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send('Runtime.enable');
  const code = fs.readFileSync(`.tablet/${(process.argv[2] || 'cdp').replace(/[^\w-]/g, '')}.js`, 'utf8');
  const timeout = new Promise((res) => setTimeout(() => res({ timeout: true }), Number(process.env.CDP_TIMEOUT || 150000)));
  const reply = await Promise.race([send('Runtime.evaluate', { expression: `(async () => {\n${code}\n})()`, awaitPromise: true, returnByValue: true, userGesture: true }), timeout]);
  if (reply.timeout) console.log('ERGEBNIS: Zeitüberschreitung');
  else if (reply.result?.exceptionDetails) console.log(`FEHLER: ${reply.result.exceptionDetails.exception?.description || reply.result.exceptionDetails.text}`);
  else console.log(`ERGEBNIS: ${JSON.stringify(reply.result?.result?.value)}`);
  await new Promise((res) => setTimeout(res, 300));
  ws.close();
} catch (e) {
  console.log(`CDP-FEHLER: ${e.message}`);
}
process.exit(0);
