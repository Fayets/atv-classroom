#!/usr/bin/env bash
# Deja el backup corriendo todos los días a las 02:00 de Argentina (timer de systemd, aunque el VPS esté en UTC).
# Correr como root desde el VPS:  bash /opt/atv-classroom/deploy/backup/instalar.sh
set -euo pipefail
AQUI="$(cd "$(dirname "$0")" && pwd)"

if [ ! -f /etc/atv-backup.env ]; then
  install -m 600 "$AQUI/atv-backup.env.ejemplo" /etc/atv-backup.env
  echo "Creado /etc/atv-backup.env (solo en el VPS; Drive queda apagado)"
fi
chmod +x "$AQUI/atv-backup.sh"

cat > /etc/systemd/system/atv-backup.service <<UNIT
[Unit]
Description=Backup de la base de ATV
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash -c '$AQUI/atv-backup.sh >> /var/log/atv-backup.log 2>&1'
UNIT

cat > /etc/systemd/system/atv-backup.timer <<UNIT
[Unit]
Description=Backup de la base de ATV, 02:00 de Argentina

[Timer]
OnCalendar=*-*-* 02:00:00 America/Argentina/Buenos_Aires
Persistent=true

[Install]
WantedBy=timers.target
UNIT

# El cron viejo (si alguien lo había puesto) correría dos veces.
crontab -l 2>/dev/null | grep -v 'atv-backup.sh' | crontab - || true

systemctl daemon-reload
systemctl enable --now atv-backup.timer
echo "Primera corrida ahora, para probar…"
systemctl start atv-backup.service || true
tail -3 /var/log/atv-backup.log
ls -lh /var/backups/atv/base/diario/ 2>/dev/null || true
systemctl list-timers atv-backup.timer --no-pager
