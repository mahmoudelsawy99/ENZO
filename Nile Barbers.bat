@echo off
title Nile Barbers

cd /d "D:\work space\Akram"

if not exist "client\dist\client\browser\index.html" (
    echo Nile Barbers is not built yet.
    echo Please contact the administrator.
    pause
    exit /b 1
)

start "" /min powershell -NoProfile -WindowStyle Hidden -Command ^
  "$ok=$false; for($i=0; $i -lt 40; $i++){ try { Invoke-WebRequest -UseBasicParsing http://localhost:8080 -TimeoutSec 2 | Out-Null; $ok=$true; break } catch { Start-Sleep -Seconds 1 } }; if($ok){ Start-Process 'http://localhost:8080' }"

echo Starting Nile Barbers...
echo Leave this window open. Closing it stops the app.
echo.

npx --yes serve "client\dist\client\browser" -s -l 8080
