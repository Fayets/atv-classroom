#!/usr/bin/env bash
# Backup nocturno de ATV: queda en el disco del VPS (/var/backups/atv) y, si hay REMOTO configurado,
# también en Google Drive (aumentatuvalorx@gmail.com) cifrado con rclone crypt.
#
# Qué respalda:
#   1. La base de Neon completa (classroom, clients, ops, hiring…): un pg_dump por día.
#      Se guardan 30 diarios y uno por mes durante un año.
#   2. Los adjuntos del chat (están en el disco del VPS, no en Neon): espejo diario; lo que se
#      borra o se pisa queda 90 días en adjuntos/borrados/<fecha>.
#
# Si algo falla avisa por WhatsApp con Theo (openclaw) y sale con error.
#
# Configuración: /etc/atv-backup.env (ver atv-backup.env.ejemplo). Lo instala instalar.sh: un timer de
# systemd que corre todos los días a las 02:00 de Argentina.
#
# Restaurar (siempre primero en una base local, nunca encima de producción):
#   ls /var/backups/atv/base/diario/
#   pg_restore --no-owner --no-acl -d <base_local> /var/backups/atv/base/diario/2026-10-27.dump

set -Eeuo pipefail

CONF="${ATV_BACKUP_CONF:-/etc/atv-backup.env}"
# shellcheck disable=SC1090
source "$CONF"

: "${ENV_DB:?falta ENV_DB (el .env de donde sale la conexión a Neon)}"
: "${REMOTO:=}"
: "${LOCAL_DIR:=/var/backups/atv}"
: "${ADJUNTOS_DIR:=}"
: "${AVISAR_A:=}"
: "${PG_DUMP:=docker run --rm -i -e PGPASSWORD postgres:18-alpine pg_dump}"
: "${PG_RESTORE:=docker run --rm -i postgres:18-alpine pg_restore}"
: "${MINIMO_BYTES:=1000000}"

HOY="$(TZ=America/Argentina/Buenos_Aires date +%Y-%m-%d)"
TMP="$(mktemp -d /tmp/atv-backup.XXXXXX)"
PASO="arrancando"

avisar() {
  echo "$(date -u +%FT%TZ) $1"
  if [ -n "$AVISAR_A" ] && command -v openclaw >/dev/null 2>&1; then
    openclaw message send --channel whatsapp --target "$AVISAR_A" --message "$1" >/dev/null 2>&1 || true
  fi
}

fallo() {
  avisar "⚠️ Falló el backup de ATV del $HOY (paso: $PASO). Mirá /var/log/atv-backup.log en el VPS."
  rm -rf "$TMP"
  exit 1
}
trap fallo ERR

# Una sola corrida a la vez.
exec 9>/tmp/atv-backup.lock
flock -n 9 || { echo "Ya hay un backup corriendo"; exit 0; }

# La conexión sale del .env del backend: así no hay una segunda copia de la contraseña.
PASO="leer conexión"
leer() { grep -E "^$1=" "$ENV_DB" | tail -1 | cut -d= -f2- | sed -e 's/^["'\'']//' -e 's/["'\'']$//'; }
DB_HOST="$(leer DB_HOST)"; DB_PORT="$(leer DB_PORT)"; DB_NAME="$(leer DB_NAME)"; DB_USER="$(leer DB_USER)"
export PGPASSWORD="$(leer DB_PASSWORD)"
# pg_dump va directo a Neon, no por el pooler (en modo transacción corta los dumps largos).
DB_HOST="${DB_HOST/-pooler/}"
SSL="sslmode=require"
case "$DB_HOST" in 127.0.0.1|localhost) SSL="sslmode=disable" ;; esac

# 1) Base
PASO="pg_dump"
DUMP="$TMP/$HOY.dump"
$PG_DUMP --format=custom --no-owner --no-acl \
  "host=$DB_HOST port=${DB_PORT:-5432} dbname=$DB_NAME user=$DB_USER $SSL" > "$DUMP"

PASO="verificar dump"
TAM="$(wc -c < "$DUMP" | tr -d ' ')"
[ "$TAM" -ge "$MINIMO_BYTES" ] || { PASO="verificar dump (pesa $TAM bytes, demasiado poco)"; false; }
# Que se pueda leer: pg_restore lista su contenido sin restaurar nada.
TABLAS="$($PG_RESTORE --list < "$DUMP" | grep -c ' TABLE DATA ' || true)"
[ "$TABLAS" -gt 0 ] || { PASO="verificar dump (sin tablas)"; false; }

PASO="guardar base en el VPS"
mkdir -p "$LOCAL_DIR/base/diario" "$LOCAL_DIR/base/mensual"
chmod 700 "$LOCAL_DIR"
cp "$DUMP" "$LOCAL_DIR/base/diario/$HOY.dump.tmp" && mv "$LOCAL_DIR/base/diario/$HOY.dump.tmp" "$LOCAL_DIR/base/diario/$HOY.dump"
if [ "${HOY:8:2}" = "01" ]; then
  cp "$LOCAL_DIR/base/diario/$HOY.dump" "$LOCAL_DIR/base/mensual/${HOY:0:7}.dump"
fi
PASO="limpiar base vieja del VPS"
find "$LOCAL_DIR/base/diario" -name '*.dump' -mtime +30 -delete
find "$LOCAL_DIR/base/mensual" -name '*.dump' -mtime +370 -delete

if [ -n "$REMOTO" ]; then
  PASO="subir base"
  rclone copyto "$DUMP" "${REMOTO}base/diario/$HOY.dump"
  if [ "${HOY:8:2}" = "01" ]; then
    rclone copyto "$DUMP" "${REMOTO}base/mensual/${HOY:0:7}.dump"
  fi

  PASO="limpiar base vieja"
  rclone delete --min-age 31d "${REMOTO}base/diario/"
  # La carpeta mensual no existe hasta el primer día 1.
  if rclone lsf "${REMOTO}base/" | grep -qx 'mensual/'; then
    rclone delete --min-age 370d "${REMOTO}base/mensual/"
  fi
fi

# 2) Adjuntos (solo a Drive: en el VPS ya están)
if [ -n "$ADJUNTOS_DIR" ] && [ -n "$REMOTO" ]; then
  PASO="adjuntos"
  [ -d "$ADJUNTOS_DIR" ] || { PASO="adjuntos (no existe $ADJUNTOS_DIR)"; false; }
  rclone sync "$ADJUNTOS_DIR" "${REMOTO}adjuntos/actual" --backup-dir "${REMOTO}adjuntos/borrados/$HOY"
  if rclone lsf "${REMOTO}adjuntos/" | grep -qx 'borrados/'; then
    rclone delete --min-age 90d "${REMOTO}adjuntos/borrados/"
    rclone rmdirs --leave-root "${REMOTO}adjuntos/borrados/"
  fi
fi

rm -rf "$TMP"
trap - ERR
echo "$(date -u +%FT%TZ) OK: base $((TAM / 1024 / 1024)) MB, $TABLAS tablas, en $LOCAL_DIR/base/diario/$HOY.dump${REMOTO:+ y en Drive}"
