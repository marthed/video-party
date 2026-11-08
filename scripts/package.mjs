// Builds the extension and zips extension/ into dist/video-party-<version>.zip,
// ready to upload to the Chrome Web Store (or share with friends).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const extDir = join(root, 'extension');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run('npm', ['run', 'build']);

const { version } = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'));
const required = ['manifest.json', 'offscreen.bundle.js', 'icons/icon128.png'];
for (const f of required) {
  if (!existsSync(join(extDir, f))) throw new Error(`Missing extension/${f}`);
}

mkdirSync(join(root, 'dist'), { recursive: true });
const out = join(root, 'dist', `video-party-${version}.zip`);
rmSync(out, { force: true });
// Zip the folder's contents (manifest.json must be at the zip root).
run('zip', ['-r', '-X', '-q', out, '.', '-x', '.DS_Store', '*/.DS_Store'], extDir);

console.log(`\nPackaged ${out}`);
