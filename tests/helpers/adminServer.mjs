// A dev server with the admin signed in reach, for the walks that need an /admin page. It never
// touches the real store: the admin password is made up per run and the key value store is the
// in memory stand in (tests/helpers/fakeStack.mjs fakeKvStore) served over HTTP on a free port.
// It builds into its own folder (NEXT_DIST_DIR, next.config.js), so it never shares .next with the
// walks' dev server (tests/helpers/devServer.mjs), and it takes the same walking turn.
//   const admin = adminServer(3125); await admin.start(); ... await admin.signIn(context); ... await admin.stop();
import http from 'node:http';
import { spawn, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fakeKvStore } from './fakeStack.mjs';
import { takeTurn, giveTurn } from './devServer.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const listeners = (port) => { try { return execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().split(/\s+/).filter(Boolean).map(Number); } catch (e) { return []; } };
export const ADMIN_START_TIMEOUT = 1700000;

export function adminServer(port) {
  const base = `http://localhost:${port}`;
  const password = randomBytes(18).toString('hex');
  let kv = null; let child = null; let session = null;
  return {
    base,
    password, // made up for this run, known only to this process
    async start() {
      await takeTurn();
      const store = fakeKvStore();
      kv = http.createServer((req, res) => {
        let body = ''; req.on('data', (c) => { body += c; });
        req.on('end', async () => { const r = await store.fetch(`${store.base}${req.url}`, { method: req.method, body: body || undefined }); res.setHeader('content-type', 'application/json'); res.end(await r.text()); });
      });
      await new Promise((r) => kv.listen(0, '127.0.0.1', r));
      for (const pid of listeners(port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
      const env = { ...process.env, NEXT_DIST_DIR: `.next-walk-${port}`, ADMIN_PASSWORD: password, KV_REST_API_URL: `http://127.0.0.1:${kv.address().port}`, KV_REST_API_TOKEN: 'walk', KV_REST_API_READ_ONLY_TOKEN: 'walk' };
      child = spawn('npx', ['next', 'dev', '-p', String(port)], { cwd: new URL('../..', import.meta.url).pathname, env, stdio: 'ignore', detached: true });
      const t0 = Date.now();
      while (Date.now() - t0 < 180000) { const ok = await fetch(`${base}/admin`).then((r) => r.status < 500).catch(() => false); if (ok) return; await sleep(1000); }
      throw new Error(`The admin dev server on ${port} did not answer in 3 minutes`);
    },
    // Signs the browser context in: the first time through the real login route, which sets the
    // session cookie; after that with the same cookie, since the route allows five sign ins in
    // fifteen minutes.
    async signIn(context) {
      if (session) { await context.addCookies([session]); return; }
      const r = await context.request.post(`${base}/api/admin/login`, { data: { password } });
      if (!r.ok()) throw new Error(`admin sign in failed: ${r.status()}`);
      session = (await context.cookies()).find((c) => c.name === 'rl_admin');
      if (!session) throw new Error('admin sign in set no session cookie');
    },
    async stop() {
      if (child) { try { process.kill(-child.pid); } catch (e) { /* gone */ } }
      for (const pid of listeners(port)) { try { process.kill(pid, 'SIGKILL'); } catch (e) { /* gone */ } }
      if (kv) await new Promise((r) => kv.close(r));
      giveTurn();
    },
  };
}
