import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const BUNDLE = new URL('../dist/cli.cjs', import.meta.url).pathname;

/**
 * Drives the *bundled* server over real stdio JSON-RPC.
 *
 * The unit tests exercise the features as functions; this exercises the artefact users
 * actually run. That distinction has already paid for itself: bundling silently broke
 * web-tree-sitter's `createRequire(import.meta.url)`, which no unit test could have seen
 * because it only exists after the ESM-to-CJS conversion.
 */
describe('bundled server over stdio', () => {
  let server: ChildProcessWithoutNullStreams;
  let buffer = Buffer.alloc(0);
  let nextId = 1;
  const waiters = new Map<number, (msg: Record<string, unknown>) => void>();
  const notifications: Record<string, unknown>[] = [];

  const send = (payload: Record<string, unknown>): void => {
    const body = JSON.stringify({ jsonrpc: '2.0', ...payload });
    server.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  };

  const request = <T = any>(method: string, params: unknown): Promise<T> =>
    new Promise((resolve) => {
      const id = nextId++;
      waiters.set(id, (msg) => resolve(msg as T));
      send({ id, method, params });
    });

  const notify = (method: string, params: unknown): void => send({ method, params });

  /** Waits for a notification matching `method`, or times out. */
  const waitForNotification = async (method: string, timeoutMs = 5000): Promise<any> => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = notifications.filter((n) => n['method'] === method).pop();
      if (found) return found;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${method}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  };

  beforeAll(async () => {
    expect(existsSync(BUNDLE), `${BUNDLE} missing - run the build first`).toBe(true);
    server = spawn(process.execPath, [BUNDLE, '--stdio'], { stdio: 'pipe' });

    server.stdout.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) return;
        const length = Number(/Content-Length: (\d+)/i.exec(buffer.subarray(0, headerEnd).toString())?.[1]);
        if (buffer.length < headerEnd + 4 + length) return;
        const message = JSON.parse(buffer.subarray(headerEnd + 4, headerEnd + 4 + length).toString());
        buffer = buffer.subarray(headerEnd + 4 + length);
        const waiter = typeof message.id === 'number' ? waiters.get(message.id) : undefined;
        if (waiter) {
          waiters.delete(message.id);
          waiter(message);
        } else {
          notifications.push(message);
        }
      }
    });
  });

  afterAll(() => server?.kill());

  const uri = 'file:///tmp/PKGBUILD';
  const TEXT = `pkgname=hello
pkgver=1.2.3
pkgrel=1
arch=('x86_64')
license=('GPL3')
source=("$pkgname-$pkgver.tar.gz" extra.patch)
sha256sums=('aa')

build() {
  make DESTDIR=$pkgdir
}
`;

  it('completes the initialize handshake with the expected capabilities', async () => {
    const response = await request('initialize', {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });
    expect(response.error).toBeUndefined();
    expect(response.result.serverInfo.name).toBe('pkgbuild-language-server');
    expect(Object.keys(response.result.capabilities).sort()).toEqual([
      'codeActionProvider',
      'completionProvider',
      'documentSymbolProvider',
      'hoverProvider',
      'semanticTokensProvider',
      'textDocumentSync',
    ]);
    notify('initialized', {});
  });

  it('publishes diagnostics for an opened document', async () => {
    notify('textDocument/didOpen', {
      textDocument: { uri, languageId: 'pkgbuild', version: 1, text: TEXT },
    });
    const message = await waitForNotification('textDocument/publishDiagnostics');
    const codes = message.params.diagnostics.map((d: { code: string }) => d.code).sort();
    expect(codes).toEqual([
      'PKGBUILD002',
      'PKGBUILD003',
      'PKGBUILD008',
      'PKGBUILD011',
      'PKGBUILD012',
    ]);
  });

  it('answers hover requests', async () => {
    const response = await request('textDocument/hover', {
      textDocument: { uri },
      position: { line: 1, character: 3 },
    });
    expect(response.result.contents.value).toContain('Upstream version');
  });

  it('answers context-aware completion requests', async () => {
    const response = await request('textDocument/completion', {
      textDocument: { uri },
      position: { line: 3, character: 6 },
    });
    const items = response.result.items ?? response.result;
    expect(items.map((i: { label: string }) => i.label)).toContain('aarch64');
  });

  it('answers document symbol requests', async () => {
    const response = await request('textDocument/documentSymbol', { textDocument: { uri } });
    expect(response.result.map((s: { name: string }) => s.name)).toContain('build()');
  });

  it('answers semantic token requests', async () => {
    const response = await request('textDocument/semanticTokens/full', { textDocument: { uri } });
    expect(response.result.data.length).toBeGreaterThan(0);
    expect(response.result.data.length % 5).toBe(0);
  });

  it('offers quick fixes for its own diagnostics', async () => {
    const published = await waitForNotification('textDocument/publishDiagnostics');
    const response = await request('textDocument/codeAction', {
      textDocument: { uri },
      range: published.params.diagnostics[0].range,
      context: { diagnostics: published.params.diagnostics },
    });
    const titles = response.result.map((a: { title: string }) => a.title);
    expect(titles).toContain('Replace with GPL-3.0-or-later');
    expect(titles).toContain('Add 1 missing checksum entry');
  });
});
