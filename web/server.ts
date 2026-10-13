import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { htmlFor } from './render.ts';
import { SnapshotRejected, loadSite } from './site.ts';

export type ServeOptions = { readonly workspace: string; readonly snapshot: string; readonly port: number };

export function parseArgs(argv: readonly string[]): ServeOptions {
  let workspace = '';
  let snapshot = '';
  let port = 4173;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--workspace') workspace = argv[++i] ?? '';
    else if (arg === '--snapshot') snapshot = argv[++i] ?? '';
    else if (arg === '--port') port = Number(argv[++i]);
    else throw new Error(`unknown argument ${arg ?? ''}`);
  }
  if (!workspace || !snapshot) throw new Error('usage: node web/server.ts --workspace <dir> --snapshot <file> [--port N]');
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`bad port ${port}`);
  return { workspace, snapshot, port };
}

const stylesPath = fileURLToPath(new URL('./styles.css', import.meta.url));
const monaSansPath = fileURLToPath(new URL('./fonts/mona-sans.woff2', import.meta.url));

/** Serves the site until the process exits, and prints "listening on <url>" once it accepts connections. */
export function serve(args: ServeOptions): void {
  let site;
  try {
    site = loadSite(args.workspace, args.snapshot);
  } catch (err) {
    if (err instanceof SnapshotRejected) {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname === '/styles.css') {
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
      res.end(fs.readFileSync(stylesPath));
      return;
    }
    if (url.pathname === '/fonts/mona-sans.woff2') {
      res.writeHead(200, { 'content-type': 'font/woff2', 'cache-control': 'max-age=31536000, immutable' });
      res.end(fs.readFileSync(monaSansPath));
      return;
    }
    void htmlFor(site, url).then(
      (page) => {
        res.writeHead(page.status, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(page.html);
      },
      (err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(message);
      },
    );
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  });

  const home = `/${site.identity.owner}/${site.identity.name}`;
  server.listen(args.port, '127.0.0.1', () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : args.port;
    process.stdout.write(`listening on http://127.0.0.1:${port}\n`);
    process.stdout.write(`open http://127.0.0.1:${port}${home}\n`);
  });
}

if (import.meta.main) serve(parseArgs(process.argv.slice(2)));
