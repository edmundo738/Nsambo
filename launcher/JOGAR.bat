@echo off
title THE BACKROOMS - BETA FECHADA
chdir /d "%~dp0"
echo.
echo   THE BACKROOMS - BETA FECHADA (Lobby 0)
echo   =======================================
echo   A iniciar o servidor local...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
if errorlevel 1 (
  echo.
  echo   Servidor local falhou - vou abrir o jogo diretamente...
  start "" "%~dp0backrooms.html"
)
pause
