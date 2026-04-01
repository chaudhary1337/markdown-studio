#!/bin/bash
set -e

cd "$(dirname "$0")/.."

echo "==> Installing dependencies..."
npm ci

echo "==> Building extension..."
node esbuild.js --production

echo "==> Packaging .vsix..."
npx vsce package --no-dependencies

if [[ "$1" == "--publish" ]]; then
  echo "==> Publishing to marketplace..."
  npx vsce publish
else
  echo ""
  echo "Done. .vsix file created."
  echo "Run with --publish flag to publish to marketplace."
fi
