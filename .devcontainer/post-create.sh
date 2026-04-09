#!/usr/bin/env bash
set -euo pipefail

cd /workspaces/traffic-ioc/ai-core

python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python -m pip install -r requirements-dev.txt
python -m pip install jupyter ipykernel

# Dang ky kernel de notebook chon duoc ngay trong VS Code.
python -m ipykernel install --user --name ai-core --display-name "Python (ai-core Docker)"

echo "Dev Container setup completed: Python kernel 'Python (ai-core Docker)' is ready."
