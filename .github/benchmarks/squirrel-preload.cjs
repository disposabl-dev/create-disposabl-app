const { createRequire, syncBuiltinESMExports } = require("node:module");
const { join, basename } = require("node:path");
const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const spawn = childProcess.spawn;
childProcess.spawn = function (command, ...args) {
  const start = performance.now();
  const child = spawn.call(this, command, ...args);
  if (
    /^(rcedit|nuget|squirrel|signtool)\.(exe|com)$/i.test(basename(command))
  ) {
    child.once("close", () =>
      console.log(
        `PHASE ${basename(command)} ${((performance.now() - start) / 1000).toFixed(3)} s`,
      ),
    );
  }
  return child;
};
for (const name of ["cp", "rm"]) {
  const original = fs[name];
  fs[name] = async function (...args) {
    const target = name === "cp" ? args[1] : args[0];
    if (!basename(String(target)).startsWith("squirrel-maker-"))
      return original.apply(this, args);
    const start = performance.now();
    try {
      return await original.apply(this, args);
    } finally {
      console.log(
        `PHASE Forge temp ${name} ${((performance.now() - start) / 1000).toFixed(3)} s`,
      );
    }
  };
}
syncBuiltinESMExports();
if (process.env.DISPOSABL_SQUIRREL_VENDOR || process.env.SQUIRREL_TEST_PFX) {
  const desktopRequire = createRequire(
    join(process.env.GITHUB_WORKSPACE, "apps/desktop/package.json"),
  );
  const winstaller = desktopRequire("electron-winstaller");
  const original = winstaller.createWindowsInstaller;
  winstaller.createWindowsInstaller = (options) =>
    original({
      ...options,
      ...(process.env.DISPOSABL_SQUIRREL_VENDOR
        ? { vendorDirectory: process.env.DISPOSABL_SQUIRREL_VENDOR }
        : {}),
      ...(process.env.SQUIRREL_TEST_PFX
        ? {
            signWithParams: `/fd sha256 /f "${process.env.SQUIRREL_TEST_PFX}" /p fixture-only-password`,
          }
        : {}),
    });
}
