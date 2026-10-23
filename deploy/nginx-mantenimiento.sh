#!/usr/bin/env bash
# Página "Estamos mejorando" en nginx para classroom.atvos.io: la muestra mientras los contenedores se
# reinician en un deploy (en vez del 502). Se puede correr más de una vez: si ya está, solo actualiza la página.
# Uso (en el VPS, como root):  bash /opt/atv-classroom/deploy/nginx-mantenimiento.sh
set -euo pipefail

DOMINIO="classroom.atvos.io"
AQUI="$(cd "$(dirname "$0")" && pwd)"
WEB="/var/www/atv-mantenimiento"
SNIPPET="/etc/nginx/snippets/atv-mantenimiento.conf"

# -R y no -r: en sites-enabled las configuraciones son enlaces a sites-available.
CONF="$(grep -RlE "server_name[^;]*\b${DOMINIO//./\\.}\b" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | head -n1 || true)"
if [ -z "$CONF" ]; then echo "No encontré la configuración de nginx de $DOMINIO." >&2; exit 1; fi
CONF="$(readlink -f "$CONF")"
echo "Configuración: $CONF"

mkdir -p "$WEB" /etc/nginx/snippets
cp "$AQUI/mantenimiento.html" "$WEB/atv-mantenimiento.html"

cat > "$SNIPPET" <<'NGINX'
# Mientras el classroom se reinicia (deploy), "Estamos mejorando" en vez del error 502.
error_page 502 503 504 /atv-mantenimiento.html;
location = /atv-mantenimiento.html {
    root /var/www/atv-mantenimiento;
    internal;
    add_header Cache-Control "no-store" always;
}
NGINX

if grep -q "snippets/atv-mantenimiento.conf" "$CONF"; then
  echo "Ya estaba incluido: solo se actualizó la página."
else
  COPIA="$CONF.antes-mantenimiento.$(date +%Y%m%d%H%M%S)"
  cp "$CONF" "$COPIA"
  # Se agrega después de cada server_name del dominio (el bloque con SSL y el de redirección).
  python3 - "$CONF" "$DOMINIO" <<'PY'
import re, sys
ruta, dominio = sys.argv[1], sys.argv[2]
texto = open(ruta).read()
patron = re.compile(r"^([ \t]*)server_name[^;]*\b" + re.escape(dominio) + r"\b[^;]*;[^\n]*\n", re.M)
nuevo, n = patron.subn(lambda m: m.group(0) + m.group(1) + "include snippets/atv-mantenimiento.conf;\n", texto)
if not n:
    sys.exit("no se encontró server_name")
open(ruta, "w").write(nuevo)
print(f"Incluido en {n} bloque(s).")
PY
  if ! nginx -t; then
    cp "$COPIA" "$CONF"
    echo "nginx no validó la configuración: dejé todo como estaba (copia en $COPIA)." >&2
    exit 1
  fi
  echo "Copia de la configuración anterior: $COPIA"
fi

nginx -t && systemctl reload nginx
echo "Listo: durante los deploys se ve 'Estamos mejorando' en $DOMINIO."
