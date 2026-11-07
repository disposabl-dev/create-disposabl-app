import { createReadStream } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const {
  DISPOSABL_DESKTOP_ID: app,
  DISPOSABL_DESKTOP_PLATFORM: target,
  DISPOSABL_DESKTOP_UPDATE_CHANNEL: channel = 'production',
  DISPOSABL_RELEASE_VERSION: version,
} = process.env;
const targets = { windows: ['win32', 'x64'], macos: ['darwin', 'arm64'] };
if (!targets[target]) process.exit(0);
if (target === 'macos' && process.env.MACOS_NOTARIZE !== 'true')
  process.exit(0);
if (
  !/^[a-f0-9]{32}$/.test(app ?? '') ||
  !/^1\.0\.[1-9]\d*$/.test(version ?? '')
)
  throw new Error('Invalid update identity or version');
const [platform, arch] = targets[target];
const directory = join('dist/update', channel, platform, arch);
const files = await readdir(directory);
const candidates = files.filter((f) =>
  platform === 'darwin' ? f.endsWith('.zip') : f.endsWith('-full.nupkg'),
);
if (candidates.length !== 1)
  throw new Error('Expected exactly one full update package');
const filename = candidates[0];
const path = join(directory, filename);
const size = (await stat(path)).size;
const sha256 = createHash('sha256');
const sha1 = createHash('sha1');
for await (const chunk of createReadStream(path)) {
  sha256.update(chunk);
  sha1.update(chunk);
}
const hash = sha256.digest('hex');
const squirrelHash = sha1.digest('hex').toUpperCase();
if (platform === 'win32') {
  const releases = (await readFile(join(directory, 'RELEASES'), 'utf8')).trim();
  if (releases !== `${squirrelHash} ${filename} ${size}`)
    throw new Error('Squirrel RELEASES does not match the full package');
}
function run(name, args) {
  const result = spawnSync(
    'bun',
    [
      'x',
      '--no-install',
      'convex',
      'run',
      '--prod',
      '--codegen=disable',
      '--typecheck=disable',
      name,
      JSON.stringify(args),
    ],
    { cwd: 'packages/backend', encoding: 'utf8' },
  );
  if (result.status !== 0)
    throw new Error(`Convex ${name} failed: ${result.stderr}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}
const uploadUrl = run('desktopUpdates:uploadUrl', {});
const response = await fetch(uploadUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/octet-stream' },
  body: createReadStream(path),
  duplex: 'half',
});
if (!response.ok) throw new Error(`Update upload failed: ${response.status}`);
const { storageId } = await response.json();
run('desktopUpdates:publish', {
  app,
  channel,
  platform,
  arch,
  version,
  build: Number(version.split('.')[2]),
  filename,
  storageId,
  sha256: hash,
  sha1: squirrelHash,
  size,
});
console.log(`Published ${platform}/${arch} ${version} to ${channel}`);
