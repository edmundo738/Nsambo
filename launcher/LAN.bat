@echo off
title THE BACKROOMS - LAN (criar sala)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Para hospedar uma partida na rede precisas de Node.js:
  echo   https://nodejs.org  (versao LTS)
  echo   ^(o convidado NAO precisa; so quem cria a sala^)
  echo.
  pause
  exit /b 1
)
echo.
echo   THE BACKROOMS - sala LAN a servir na porta 8322
echo   Os amigos abrem o jogo, vao a MULTIJOGADOR (LAN) e carregam
echo   PROCURAR PARTIDAS - a sala aparece na lista.
  echo   (Ctrl+C fecha a sala)
echo.
node "%~dp0relay.cjs"
pause
