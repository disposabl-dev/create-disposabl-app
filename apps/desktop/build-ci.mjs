import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const targets = {
  windows: ['win32', 'x64'],
  linux: ['linux', 'x64'],
  macos: ['darwin', 'arm64'],
};
const target = process.env.DISPOSABL_DESKTOP_PLATFORM;
const version = process.env.DISPOSABL_RELEASE_VERSION;
if (!Object.hasOwn(targets, target ?? ''))
  throw new Error('Invalid DISPOSABL_DESKTOP_PLATFORM');
if (!version || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
  throw new Error('DISPOSABL_RELEASE_VERSION must be numeric semver');
if (
  process.platform !== targets[target][0] ||
  process.arch !== targets[target][1]
)
  throw new Error(`Build ${target} on ${targets[target].join('/')}`);
const packagePath = join(root, 'package.json');
const original = await readFile(packagePath, 'utf8');
try {
  await rm(join(root, 'out'), { recursive: true, force: true });
  await rm(join(root, '../../dist/release'), { recursive: true, force: true });
  await rm(join(root, '../../dist/update'), { recursive: true, force: true });
  await writeFile(
    packagePath,
    JSON.stringify({ ...JSON.parse(original), version }, null, 2) + '\n',
  );
  const result = spawnSync('bun', ['run', `make:${target}`], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.status !== 0)
    throw new Error(`Forge failed: ${result.error ?? result.status}`);
  const destination = join(root, '../../dist/release');
  await mkdir(destination, { recursive: true });
  async function collect(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await collect(path);
      else if (entry.isFile())
        await cp(path, join(destination, entry.name), {
          errorOnExist: true,
          force: false,
        });
    }
  }
  await collect(join(root, 'out', 'make'));
  if (!(await readdir(destination)).length)
    throw new Error('Forge produced no artifacts');
  const staged = spawnSync('node', ['stage-update.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (staged.status !== 0)
    throw new Error(`Update staging failed: ${staged.error ?? staged.status}`);
} finally {
  await writeFile(packagePath, original);
}
