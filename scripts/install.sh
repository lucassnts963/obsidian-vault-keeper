#!/usr/bin/env bash
# install.sh — build, package and optionally install Vault Keeper
#
# Usage:
#   ./scripts/install.sh                     # build + zip only
#   ./scripts/install.sh --vault /path/vault # build + zip + install to vault
#   ./scripts/install.sh --android           # build + zip + push via adb
#   ./scripts/install.sh --vault /path --android  # install to vault + push to Android
#
# Options:
#   --vault <path>   Install into <path>/.obsidian/plugins/vault-keeper/
#   --android        Push to Android via adb (requires adb in PATH)
#   --adb-vault <p>  Android vault path (default: /sdcard/Documents/obsidian/knowledge)
#   --no-build       Skip build step (use existing main.js)
#   --skip-tests     Skip test suite before build
#   -h, --help       Show this help

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Defaults ────────────────────────────────────────────────────────────────
VAULT_PATH=""
ANDROID=false
ADB_VAULT="/sdcard/Documents/obsidian/knowledge"
DO_BUILD=true
SKIP_TESTS=false
PLUGIN_ID="vault-keeper"

# ── Parse args ───────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --vault)       VAULT_PATH="$2"; shift 2 ;;
    --android)     ANDROID=true; shift ;;
    --adb-vault)   ADB_VAULT="$2"; shift 2 ;;
    --no-build)    DO_BUILD=false; shift ;;
    --skip-tests)  SKIP_TESTS=true; shift ;;
    -h|--help)
      sed -n '/^# install/,/^$/p' "$0" | sed 's/^# \?//' | head -20
      exit 0
      ;;
    *) echo "Opção desconhecida: $1"; exit 1 ;;
  esac
done

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "\033[1;34m▶\033[0m $*"; }
success() { echo -e "\033[1;32m✔\033[0m $*"; }
warn()    { echo -e "\033[1;33m⚠\033[0m $*"; }
error()   { echo -e "\033[1;31m✗\033[0m $*" >&2; exit 1; }

# ── Read version from manifest.json ──────────────────────────────────────────
cd "$ROOT_DIR"
VERSION=$(node -e "process.stdout.write(require('./manifest.json').version)")
ZIP_NAME="vault-keeper-v${VERSION}.zip"

# ── 1. Tests ──────────────────────────────────────────────────────────────────
if [[ "$DO_BUILD" == true && "$SKIP_TESTS" == false ]]; then
  info "Rodando testes..."
  npm test || error "Testes falharam. Use --skip-tests para pular."
  success "Testes: OK"
fi

# ── 2. Build ──────────────────────────────────────────────────────────────────
if [[ "$DO_BUILD" == true ]]; then
  info "Build de produção..."
  npm run build || error "Build falhou."
  success "Build: OK (main.js $(du -sh main.js | cut -f1))"
else
  [[ -f main.js ]] || error "main.js não encontrado. Rode sem --no-build."
  warn "Usando main.js existente (--no-build)"
fi

# ── 3. Zip ────────────────────────────────────────────────────────────────────
info "Gerando $ZIP_NAME..."
rm -f "$ZIP_NAME"
# Include styles.css if present; silently fall back without it
if [[ -f styles.css ]]; then
  zip -j "$ZIP_NAME" main.js manifest.json styles.css
else
  zip -j "$ZIP_NAME" main.js manifest.json
fi
success "Zip: $ZIP_NAME ($(du -sh "$ZIP_NAME" | cut -f1))"

# ── 4. Install to local vault ─────────────────────────────────────────────────
if [[ -n "$VAULT_PATH" ]]; then
  PLUGIN_DIR="$VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
  info "Instalando em $PLUGIN_DIR..."
  mkdir -p "$PLUGIN_DIR"
  cp main.js manifest.json "$PLUGIN_DIR/"
  [[ -f styles.css ]] && cp styles.css "$PLUGIN_DIR/" || true
  success "Instalado em $PLUGIN_DIR"
  echo ""
  echo "  Próximos passos:"
  echo "  1. Abra o Obsidian"
  echo "  2. Settings → Community plugins → Vault Keeper → ativar"
fi

# ── 5. Android via adb ────────────────────────────────────────────────────────
if [[ "$ANDROID" == true ]]; then
  command -v adb &>/dev/null || error "adb não encontrado no PATH. Instale Android Platform Tools."

  info "Verificando dispositivo Android..."
  DEVICES=$(adb devices | grep -v "^List" | grep "device$" | wc -l | tr -d ' ')
  [[ "$DEVICES" -eq 0 ]] && error "Nenhum dispositivo Android conectado. Habilite Depuração USB."
  [[ "$DEVICES" -gt 1 ]] && warn "$DEVICES dispositivos encontrados — usando o primeiro"

  ADB_PLUGIN_DIR="$ADB_VAULT/.obsidian/plugins/$PLUGIN_ID"
  info "Instalando em Android: $ADB_PLUGIN_DIR"

  adb shell "mkdir -p '$ADB_PLUGIN_DIR'" 2>/dev/null || \
    adb shell mkdir -p "$ADB_PLUGIN_DIR"
  adb push main.js     "$ADB_PLUGIN_DIR/main.js"
  adb push manifest.json "$ADB_PLUGIN_DIR/manifest.json"
  [[ -f styles.css ]] && adb push styles.css "$ADB_PLUGIN_DIR/styles.css" || true

  success "Instalado no Android: $ADB_PLUGIN_DIR"
  echo ""
  echo "  Próximos passos:"
  echo "  1. Abra o Obsidian no Android"
  echo "  2. Settings → Community plugins → Vault Keeper → ativar"
  echo "  3. Se o plugin já estava ativo, force-close e reabra o Obsidian"
fi

# ── Resumo ────────────────────────────────────────────────────────────────────
echo ""
success "Vault Keeper v$VERSION pronto"
echo "  Zip: $ROOT_DIR/$ZIP_NAME"
if [[ -n "$VAULT_PATH" ]]; then
  echo "  Vault desktop: $VAULT_PATH/.obsidian/plugins/$PLUGIN_ID"
fi
if [[ "$ANDROID" == true ]]; then
  echo "  Vault Android: $ADB_VAULT/.obsidian/plugins/$PLUGIN_ID"
fi
exit 0
