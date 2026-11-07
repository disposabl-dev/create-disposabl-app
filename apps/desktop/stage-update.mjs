import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const {
  DISPOSABL_DESKTOP_UPDATE_URL: base,
  DISPOSABL_DESKTOP_UPDATE_CHANNEL: channel = 'production',
  DISPOSABL_DESKTOP_PLATFORM: platform,
  DISPOSABL_RELEASE_VERSION: version,
} = process.env;
if (!base) process.exit(0);
const url = new URL(base);
if (
  url.protocol !== 'https:' ||
  url.username ||
  url.password ||
  url.search ||
  url.hash ||
  !/^[a-z0-9][a-z0-9-]*$/.test(channel)
)
  throw new Error('Invalid desktop update URL or channel');
if (!/^\d+\.\d+\.\d+$/.test(version ?? ''))
  throw new Error('Invalid update version');
const targets = { macos: ['darwin', 'arm64'], windows: ['win32', 'x64'] };
if (!targets[platform]) process.exit(0);
// Never stage an ad-hoc signed Mac app as an update.
if (platform === 'macos' && process.env.MACOS_NOTARIZE !== 'true')
  process.exit(0);
const [os, arch] = targets[platform];
url.pathname = `${url.pathname.replace(/\/+$/, '')}/${channel}/${os}/${arch}/`;
const release = join(root, 'dist/release');
const output = join(root, 'dist/update', channel, os, arch);
await mkdir(output, { recursive: true });
const files = await readdir(release);
if (platform === 'macos') {
  const zips = files.filter((name) => name.endsWith('.zip'));
  if (zips.length !== 1) throw new Error('Expected one macOS ZIP');
  const name = zips[0];
  await cp(join(release, name), join(output, name));
  const updateTo = {
    version,
    name: version,
    pub_date: new Date().toISOString(),
    url: new URL(encodeURIComponent(name), url).href,
  };
  await writeFile(
    join(output, 'RELEASES.json'),
    JSON.stringify(
      { currentRelease: version, releases: [{ version, updateTo }] },
      null,
      2,
    ) + '\n',
  );
} else {
  const releases = await readFile(join(release, 'RELEASES'), 'utf8');
  const names = [
    ...releases.matchAll(/^[A-Fa-f0-9]{40}\s+(\S+)\s+\d+\s*$/gm),
  ].map((match) => match[1]);
  if (
    !names.length ||
    names.some(
      (name) =>
        !files.includes(name) || name.includes('/') || name.includes('\\'),
    )
  )
    throw new Error('Invalid Squirrel RELEASES');
  for (const name of names) await cp(join(release, name), join(output, name));
  await writeFile(join(output, 'RELEASES'), releases);
}
