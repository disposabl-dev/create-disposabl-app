#!/usr/bin/env bash
set -euo pipefail

cd apps/desktop
benchmark="$RUNNER_TEMP/desktop-compression"
mkdir -p "$benchmark"
time bun x --no-install electron-forge package --platform=linux --arch=x64

for profile in stock fast; do
  if [[ "$profile" == fast ]]; then
    export DPKG_DEB_COMPRESSOR_LEVEL=1
    sed -i 's/compressionLevel %>.xzdio/compressionLevel %>T2.xzdio/' rpm.spec.ejs
  fi
  printf '\nProfile %s\n' "$profile"
  /usr/bin/time -f 'Installer wall seconds: %e' bun x --no-install electron-forge make --platform=linux --arch=x64 --from-package
  deb=$(find out/make -name '*.deb' -type f -print -quit)
  rpm=$(find out/make -name '*.rpm' -type f -print -quit)
  test -s "$deb" && test -s "$rpm"
  stat -c '%n %s bytes' "$deb" "$rpm"
  rpm -K --nosignature "$rpm"
  mkdir -p "$benchmark/$profile/rpm"
  dpkg-deb -x "$deb" "$benchmark/$profile/deb"
  rpm2cpio "$rpm" | (cd "$benchmark/$profile/rpm" && cpio -idm --quiet)
  rm -rf out/make
done

diff -qr "$benchmark/stock" "$benchmark/fast"
echo 'Both installers extract the same files.'
