@echo off
chcp 65001 >nul
title Kebab Farm - Aufnahme
cd /d "%~dp0"
node scripts\record.js
echo.
pause
