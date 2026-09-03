#!/bin/bash
# bash, not sh: the supervision at the bottom uses `wait -n`, which dash does not have.
# Under /bin/sh this exits 2 the moment both daemons are up -- so the app starts perfectly,
# runs its migrations, warms its cache, and then the container dies anyway.
# Renders the nginx config, warms Symfony's cache, and runs nginx and php-fpm together.
set -eu

: "${FRIGATE_HOST:=frigate:5000}"
: "${GO2RTC_HOST:=frigate:1984}"
# Kubernetes' DNS, so the Frigate Service is re-resolved rather than pinned to whatever IP
# it had when nginx started. Overridable for running this outside a cluster.
: "${DNS_RESOLVER:=kube-dns.kube-system.svc.cluster.local}"

export FRIGATE_HOST GO2RTC_HOST DNS_RESOLVER

envsubst '${FRIGATE_HOST} ${GO2RTC_HOST} ${DNS_RESOLVER}' \
    < /etc/nginx/templates/motion-api.conf.template \
    > /etc/nginx/conf.d/motion-api.conf

# `map` has to live in the http block, and there is no template hook for it in the stock
# Debian nginx.conf -- so it goes in its own conf.d file. Without it a WebSocket upgrade
# turns into a plain proxied request and the live view silently never starts.
cat > /etc/nginx/conf.d/00-upgrade-map.conf <<'MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
MAP

cd /var/www/symfony

if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
    # Doctrine migrations are additive here and the app is a single replica, so running
    # them at start is simpler than a Job and cannot race with itself.
    php bin/console doctrine:migrations:migrate --no-interaction --allow-no-migration || {
        echo "migrations failed" >&2
        exit 1
    }
fi

php bin/console cache:warmup --no-interaction || true

# The console ran as root, so everything it just wrote is root-owned -- and php-fpm serves
# as www-data. Symfony then tries to rebuild the bits it cannot read *at request time* and
# fails on the rename, which surfaces as a 500 on every route rather than as anything about
# permissions.
chown -R www-data:www-data var

php-fpm -F &
FPM_PID=$!

nginx -g 'daemon off;' &
NGINX_PID=$!

# If either half dies the container should die with it. A pod that is half-alive answers
# health checks and serves errors, which is the worst of both.
trap 'kill -TERM "$FPM_PID" "$NGINX_PID" 2>/dev/null || true' TERM INT
wait -n "$FPM_PID" "$NGINX_PID"
kill -TERM "$FPM_PID" "$NGINX_PID" 2>/dev/null || true
wait
