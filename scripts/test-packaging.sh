#!/usr/bin/env bash
set -euo pipefail

# Ensure we are in the project root
cd "$(dirname "$0")/.."

echo "📦 Compiling and packing package..."
npm run build

# Pack the CLI and capture tarball name
TGZ_FILE=$(npm pack | tail -n 1)
echo "Tarball created: $TGZ_FILE"

# Create a temporary directory for isolated test
TEMP_DIR="temp-pack-test"
rm -rf "$TEMP_DIR"
mkdir -p "$TEMP_DIR"

echo "🌐 Installing package in isolated temp directory..."
cd "$TEMP_DIR"
npm init -y > /dev/null
npm install "../$TGZ_FILE" --no-audit --no-fund > /dev/null

echo "⚡ Running 'deviber analyse' on a test fixture..."
# Execute the CLI binary from the local node_modules
npx deviber analyse "../test-fixtures/frontend-only"

# Clean up
cd ..
rm -rf "$TEMP_DIR" "$TGZ_FILE"

echo "✅ Packaging test PASSED!"
