// Minimal .env loader (replaces the "dotenv" package so there is one less dependency to install).
// Lines look like KEY=value. Real environment variables always win over the file.
import { existsSync, readFileSync } from 'node:fs';

const file = new URL('../.env', import.meta.url);

if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!match) continue; // blank lines and # comments
    let value = match[2];
    if (/^(['"]).*\1$/.test(value)) value = value.slice(1, -1);
    if (process.env[match[1]] === undefined) process.env[match[1]] = value;
  }
}
