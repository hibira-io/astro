#!/bin/sh
# Builds test/fixture (an on-demand Astro site using @hibira-io/astro) for one
# Astro major against the packed package, in $2 (default a temp dir).
#
#   test/fixture.sh 7 /tmp/fx && (cd /tmp/fx && node dist/server/entry.mjs)
#
# Astro 4 has <ViewTransitions /> where 5+ has <ClientRouter />.
set -eu
major="${1:-7}"
out="${2:-$(mktemp -d)}/fixture"
here="$(cd "$(dirname "$0")/.." && pwd)"
case "$major" in
  4) node_adapter=8 ;;
  5) node_adapter=9 ;;
  6) node_adapter=10 ;;
  *) node_adapter=11 ;;
esac
rm -rf "$out"
mkdir -p "$out"
(cd "$here" && rm -f hibira-io-astro-*.tgz && npm pack --silent >/dev/null)
cp -r "$here/test/fixture/package.json" "$here/test/fixture/astro.config.mjs" "$here/test/fixture/src" "$here/test/fixture/.env" "$here/test/fixture/check.mjs" "$out/"
if [ "$major" = 4 ]; then
  sed -i 's/ClientRouter/ViewTransitions/g' "$out/src/layouts/Base.astro"
  sed -i '/security:/d' "$out/astro.config.mjs"
fi
cd "$out"
npm install --no-audit --no-fund "$here"/hibira-io-astro-*.tgz "astro@$major" "@astrojs/node@$node_adapter" pusher pusher-js
npx astro build
echo "built Astro $(npx astro --version | tail -1) fixture in $out"
