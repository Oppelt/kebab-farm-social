@echo off
chcp 65001 >nul
title Kebab Farm - YouTube verbinden
cd /d "%~dp0"
node scripts\setup.js youtube
echo.
pause
