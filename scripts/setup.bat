@echo off
rem Double-click or run from cmd. Passes any arguments (e.g. -Start, -SkipModels) to setup.ps1.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
if errorlevel 1 (
  echo.
  echo Setup failed. See the messages above.
  pause
  exit /b 1
)
