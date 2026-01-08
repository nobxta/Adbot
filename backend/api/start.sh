#!/bin/bash
# Start script for AdBot FastAPI

cd "$(dirname "$0")/.."
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Activate virtual environment if exists
if [ -d "venv" ]; then
    source venv/bin/activate
fi

# Load environment variables
if [ -f "api/.env" ]; then
    export $(cat api/.env | grep -v '^#' | xargs)
fi

# Start FastAPI
uvicorn backend.api.main:app \
    --host 0.0.0.0 \
    --port ${API_PORT:-8000} \
    --reload

