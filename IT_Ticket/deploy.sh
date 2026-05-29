#!/usr/bin/env bash
# One-shot deploy script for Vercel (new account)
# Usage: bash deploy.sh
#
# Prerequisites (run ONCE before first deploy):
#   1) npm install -g vercel
#   2) vercel login  (opens browser → login with new email)

set -e

echo "=============================================="
echo "  IT Ticket System — Deploy to Vercel"
echo "=============================================="
echo ""

# Check if already logged in
if ! vercel whoami > /dev/null 2>&1; then
    echo "⚠ Not logged in to Vercel. Run first:"
    echo "    vercel login"
    exit 1
fi

VERCEL_USER=$(vercel whoami 2>&1)
echo "✓ Logged in as: $VERCEL_USER"
echo ""

# Check if project is already linked
if [ ! -f .vercel/project.json ]; then
    echo "▶ First-time setup — linking project..."
    echo "  (Vercel will prompt a few questions, pick defaults)"
    vercel link --yes || vercel
    echo ""
fi

# Make sure env vars exist
echo "▶ Ensuring environment variables..."
echo ""

# Helper: add env var only if it doesn't already exist
add_env_if_missing() {
    local name=$1
    local prompt=$2
    if vercel env ls production 2>/dev/null | grep -q "^$name "; then
        echo "  ✓ $name already set"
    else
        echo "  • Adding $name ..."
        echo "    $prompt"
        read -r VAL
        echo "$VAL" | vercel env add "$name" production
    fi
}

add_env_if_missing "SUPABASE_ANON_KEY" "Paste Supabase anon key (default is current one):"
add_env_if_missing "GROQ_API_KEY"      "Paste Groq API key from https://console.groq.com/keys :"

echo ""
echo "▶ Deploying to production..."
vercel --prod --yes

echo ""
echo "=============================================="
echo "  ✅ Done! Visit the URL printed above."
echo "=============================================="
