#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob
debs=(dist/release/*.deb)
rpms=(dist/release/*.rpm)
[[ ${#debs[@]} == 1 && ${#rpms[@]} == 1 ]]
dpkg-deb --info "${debs[0]}"
dpkg-deb --fsys-tarfile "${debs[0]}" | tar -tf - > /tmp/desktop-deb-files.txt
rpm -qip "${rpms[0]}"
rpm -K "${rpms[0]}"
rpm2cpio "${rpms[0]}" | cpio -it > /tmp/desktop-rpm-files.txt
runtime_dir=$(mktemp -d)
trap 'rm -rf "$runtime_dir"' EXIT
dpkg-deb -x "${debs[0]}" "$runtime_dir"
test -x "$runtime_dir/usr/lib/desktop/desktop"
export DESKTOP_BINARY="$runtime_dir/usr/lib/desktop/desktop"
export HOME="$runtime_dir/home"
mkdir -p "$HOME"
xvfb-run -a -s '-screen 0 1280x800x24' bash -euo pipefail -c '
  "$DESKTOP_BINARY" --no-sandbox --disable-gpu > "$HOME/desktop.log" 2>&1 &
  app_pid=$!
  trap "kill $app_pid 2>/dev/null || true" EXIT
  for attempt in $(seq 1 30); do
    kill -0 "$app_pid" || { cat "$HOME/desktop.log"; exit 1; }
    sleep 1
    import -window root desktop-linux-runtime.png
    tesseract desktop-linux-runtime.png "$HOME/screen" 2>/dev/null
    if grep -Fq "Welcome to Disposabl" "$HOME/screen.txt"; then
      cat "$HOME/screen.txt"
      echo "Packaged DEB displayed the bundled Disposabl starter UI"
      exit 0
    fi
  done
  cat "$HOME/desktop.log" "$HOME/screen.txt"
  exit 1
'
