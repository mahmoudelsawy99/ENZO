#!/bin/bash
set -eu

public_port="${PORT:-8080}"
if [ "$public_port" = "3000" ]; then
  public_port=8080
fi

export PORT="$public_port"
envsubst '$PORT' < /opt/enzo/nginx.conf.template > /etc/nginx/conf.d/default.conf
rm -f /etc/nginx/sites-enabled/default

PORT=3000 node /app/dist/server.js &
api_pid=$!
nginx -g 'daemon off;' &
nginx_pid=$!

trap 'kill "$api_pid" "$nginx_pid" 2>/dev/null || true' TERM INT
wait -n "$api_pid" "$nginx_pid"
status=$?
kill "$api_pid" "$nginx_pid" 2>/dev/null || true
wait "$api_pid" "$nginx_pid" 2>/dev/null || true
exit "$status"
