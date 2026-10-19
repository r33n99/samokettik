import { spawn } from 'node:child_process';
import { npmCommand } from './npm-command.mjs';
const children = [['@samokettik/server', 'dev'], ['@samokettik/server', 'dev:worker'], ['@samokettik/web', 'dev']].map(([workspace, script]) => {
  const invocation = npmCommand(['run', script, '-w', workspace]);
  return spawn(invocation.command, invocation.args, { stdio: 'inherit', env: process.env });
});
let stopping = false;
function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.pid) continue;
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exitCode = exitCode;
}
for (const child of children) {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
