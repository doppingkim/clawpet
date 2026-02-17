#!/usr/bin/env node
import { spawn } from 'node:child_process';
import os from 'node:os';

const url = process.env.CLAWGOTCHI_URL || 'http://localhost:5173';
const width = Number(process.env.CLAWGOTCHI_WIDTH || 560);
const height = Number(process.env.CLAWGOTCHI_HEIGHT || 620);

function run(cmd, args) {
  return spawn(cmd, args, { detached: true, stdio: 'ignore' });
}

const platform = os.platform();
let opened = false;

if (platform === 'win32') {
  // best-effort force-size using Chrome app window
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const p = run(chrome, [`--app=${url}`, `--window-size=${width},${height}`, '--new-window']);
  p.unref();
  opened = true;
} else if (platform === 'darwin') {
  const p = run('open', ['-a', 'Google Chrome', url]);
  p.unref();
  opened = true;
} else {
  const p = run('xdg-open', [url]);
  p.unref();
  opened = true;
}

if (!opened) {
  console.log(url);
}
