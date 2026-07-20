#!/bin/sh
set -e
echo "Initializing database..."
node --experimental-sqlite dist/scripts/init-db.js
echo "Starting server..."
node --experimental-sqlite dist/server.js
