#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob
ls -lh dist/release
if [[ "$RUNNER_OS" == Linux ]]; then
  debs=(dist/release/*.deb)
  rpms=(dist/release/*.rpm)
  [[ ${#debs[@]} == 1 && ${#rpms[@]} == 1 ]]
  dpkg-deb --info "${debs[0]}"
  dpkg-deb --fsys-tarfile "${debs[0]}" | tar -tf - > "$RUNNER_TEMP/desktop-deb-files.txt"
  rpm -qip "${rpms[0]}"
  rpm -K "${rpms[0]}"
  rpm2cpio "${rpms[0]}" | cpio -it > "$RUNNER_TEMP/desktop-rpm-files.txt"
else
  dmgs=(dist/release/*.dmg)
  zips=(dist/release/*.zip)
  [[ ${#dmgs[@]} == 1 && ${#zips[@]} == 1 ]]
  hdiutil verify "${dmgs[0]}"
  unzip -tq "${zips[0]}"
  app=$(find apps/desktop/out -maxdepth 2 -name '*.app' -type d -print -quit)
  test -n "$app"
  codesign --verify --strict --deep "$app"
  codesign -dv --verbose=4 "$app" 2>&1 | grep -F 'Signature=adhoc'
fi
