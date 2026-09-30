@echo off
title EcoShift AI Dashboard
echo ====================================================
echo   EcoShift AI - Telemetry Dashboard Server
echo ====================================================
echo Opening http://localhost:8080 in your browser...
echo Close this terminal window whenever you want to stop the server.
echo.

start http://localhost:8080
python server.py 8080

pause
