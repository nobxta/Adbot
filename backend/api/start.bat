@echo off
REM Start script for AdBot FastAPI (Windows)

cd /d "%~dp0\.."

REM Activate virtual environment if exists
if exist "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
)

REM Load environment variables
if exist "api\.env" (
    for /f "tokens=*" %%a in (api\.env) do (
        if not "%%a"=="" if not "%%a"=="#" (
            set %%a
        )
    )
)

REM Start FastAPI
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port %API_PORT% --reload

