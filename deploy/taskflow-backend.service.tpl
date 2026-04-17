[Unit]
Description=TaskFlow Backend (Gunicorn)
After=network.target

[Service]
Type=simple
User=__APP_USER__
Group=__APP_GROUP__
WorkingDirectory=__BACKEND_DIR__
EnvironmentFile=__ENV_FILE__
Environment=PYTHONUNBUFFERED=1
ExecStart=__BACKEND_DIR__/.venv/bin/gunicorn --workers __GUNICORN_WORKERS__ --bind 127.0.0.1:__BACKEND_PORT__ --access-logfile - --error-logfile - app:app
Restart=always
RestartSec=3
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
