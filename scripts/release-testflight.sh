#!/bin/bash
#
# Archives Chess Trainer and uploads the build to TestFlight.
# Usage: scripts/release-testflight.sh [--archive-only]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/ios/App"

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
SCHEME="App"
WORKSPACE="App.xcworkspace"
BUILD_DIR="${BUILD_DIR:-/tmp/chess-tf}"
EXPORT_DIR="$BUILD_DIR/export"
EXPORT_PLIST="$ROOT/scripts/ExportOptions.plist"

mkdir -p "$BUILD_DIR"

KEYS_DIR="${ASC_KEYS_DIR:-$HOME/.appstoreconnect/private_keys}"
if [[ -z "${ASC_KEY_ID:-}" ]]; then
  shopt -s nullglob
  keys=("$KEYS_DIR"/AuthKey_*.p8)
  shopt -u nullglob
  if [[ ${#keys[@]} -eq 1 ]]; then
    ASC_KEY_ID="$(basename "${keys[0]}" | sed -E 's/^AuthKey_([^.]+)\.p8$/\1/')"
  fi
fi
if [[ -z "${ASC_ISSUER_ID:-}" && -f "$HOME/.appstoreconnect/issuer_id" ]]; then
  ASC_ISSUER_ID="$(tr -d '[:space:]' < "$HOME/.appstoreconnect/issuer_id")"
fi

AUTH_ARGS=()
if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
  KEY_PATH="${ASC_KEY_PATH:-$KEYS_DIR/AuthKey_$ASC_KEY_ID.p8}"
  if [[ ! -f "$KEY_PATH" ]]; then
    echo "App Store Connect key not found at $KEY_PATH" >&2
    exit 1
  fi
  AUTH_ARGS=(
    -authenticationKeyPath "$KEY_PATH"
    -authenticationKeyID "$ASC_KEY_ID"
    -authenticationKeyIssuerID "$ASC_ISSUER_ID"
  )
  echo "note: using App Store Connect API key $ASC_KEY_ID"
else
  echo "ASC_KEY_ID/ASC_ISSUER_ID missing. Put the .p8 in $KEYS_DIR and set ASC_ISSUER_ID" >&2
  echo "(or write it to ~/.appstoreconnect/issuer_id)." >&2
  exit 1
fi

PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"
read_version() {
  python3 - <<'PY' "$PBX" "$1"
import re, sys
text = open(sys.argv[1]).read()
key = sys.argv[2]
m = re.search(rf"{key} = ([^;]+);", text)
print(m.group(1).strip().strip('"') if m else "")
PY
}

BUILD_NUMBER="$(read_version CURRENT_PROJECT_VERSION)"
MARKETING_VERSION="$(read_version MARKETING_VERSION)"
ARCHIVE="$BUILD_DIR/App-b${BUILD_NUMBER}.xcarchive"

echo "==> Archiving ${MARKETING_VERSION:-?} ($BUILD_NUMBER)"
rm -rf "$ARCHIVE"
xcodebuild archive \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=JM22S3M78C \
  CODE_SIGN_STYLE=Automatic \
  "${AUTH_ARGS[@]}"

if [[ "${1:-}" == "--archive-only" ]]; then
  echo "Archive at $ARCHIVE"
  exit 0
fi

echo "==> Exporting"
rm -rf "$EXPORT_DIR"
xcodebuild -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates \
  "${AUTH_ARGS[@]}"

IPA="$(find "$EXPORT_DIR" -name '*.ipa' -maxdepth 1 | head -1)"
if [[ -z "$IPA" ]]; then
  echo "No .ipa was produced in $EXPORT_DIR" >&2
  exit 1
fi

echo "==> Uploading $(basename "$IPA") to TestFlight"
xcrun altool --upload-app \
  --type ios \
  --file "$IPA" \
  --apiKey "$ASC_KEY_ID" \
  --apiIssuer "$ASC_ISSUER_ID"

echo "Uploaded ${MARKETING_VERSION:-?} ($BUILD_NUMBER). Processing in App Store Connect usually takes a few minutes."
