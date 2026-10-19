import path from 'node:path';
// npm.cmd is not directly executable through spawn on Windows without a shell.
export function npmCommand(args) {
  if (process.platform === 'win32') {
    return { command: process.execPath, args: [process.env.npm_execpath ?? path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), ...args] };
  }
  return { command: 'npm', args };
}
