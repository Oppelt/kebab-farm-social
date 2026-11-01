@echo off
chcp 65001 >nul
title Kebab Farm - Status
cd /d "%~dp0"
git pull -q --rebase --autostash origin main 2>nul
node scripts\status.js
echo.
pause
