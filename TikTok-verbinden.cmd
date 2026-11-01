@echo off
chcp 65001 >nul
title Kebab Farm - TikTok verbinden
cd /d "%~dp0"
node scripts\setup.js tiktok
echo.
pause
