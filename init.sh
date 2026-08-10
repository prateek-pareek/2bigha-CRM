#!/bin/bash
# Mathionix CRM — local dev bootstrap

set -e

echo "Setting up Mathionix CRM..."

npm run setup

if [ ! -f api/.env ]; then
  cp api/.env.example api/.env
  echo "Created api/.env from example"
fi

if [ ! -f portal/.env.local ]; then
  cp portal/.env.local.example portal/.env.local
  echo "Created portal/.env.local from example"
fi

echo ""
echo "Done. Next steps:"
echo "  npm run db:up    # start MongoDB + Redis"
echo "  npm run dev      # start API + portal"
