import { workspace, type ExtensionContext } from 'vscode';
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';

let client: LanguageClient | undefined;

const CONFIG_SECTION = 'pkgbuild';

function serverOptions(context: ExtensionContext): ServerOptions {
  const module = context.asAbsolutePath('dist/server/cli.cjs');
  const nodePath = workspace.getConfiguration(CONFIG_SECTION).get<string>('server.nodePath')?.trim();

  // Default: run on the extension host's own Node over IPC, which needs no external
  // runtime and works unchanged over Remote-SSH, in WSL and in dev containers.
  if (!nodePath) return { module, transport: TransportKind.ipc };

  // Opt-in escape hatch for running the server on a specific Node build.
  return {
    command: nodePath,
    args: [module, '--stdio'],
    transport: TransportKind.stdio,
  };
}

export async function activate(context: ExtensionContext): Promise<void> {
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'pkgbuild' }],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher('**/PKGBUILD'),
    },
    // Passed to the server's initialize handler so the first analysis already respects
    // the user's disabled rules, rather than publishing and then correcting itself.
    initializationOptions: {
      pkgbuild: workspace.getConfiguration(CONFIG_SECTION),
    },
  };

  client = new LanguageClient(
    'pkgbuild',
    'PKGBUILD Language Server',
    serverOptions(context),
    clientOptions,
  );

  // A changed nodePath means a different server process; restart to pick it up.
  context.subscriptions.push(
    workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration(`${CONFIG_SECTION}.server.nodePath`)) return;
      await client?.restart();
    }),
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  await client?.stop();
  client = undefined;
}
