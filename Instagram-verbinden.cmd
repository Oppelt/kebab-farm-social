@echo off
chcp 65001 >nul
title Kebab Farm - Instagram verbinden
cd /d "%~dp0"
node scripts\setup.js instagram
echo.
pause
