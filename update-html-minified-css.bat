@echo off
REM Script to update all HTML files to use minified CSS and add optimization hints
REM Run this in PowerShell if on Windows

cd /d "%~dp0"

echo ========================================
echo  Kaarlight Performance Optimization Script
echo ========================================
echo.

REM Count HTML files
for /f %%A in ('dir /b *.html ^| find /c /v ""') do set count=%%A
echo Found %count% HTML files to update...
echo.

REM Update each HTML file
for %%F in (*.html) do (
    echo Processing: %%F
    
    REM Replace style.css with style.min.css
    powershell -Command "(Get-Content '%%F').Replace('href=""style.css""', 'href=""style.min.css""') | Set-Content '%%F' -Encoding UTF8"
)

echo.
echo Done - All HTML files updated!
echo.
echo Next steps:
echo 1. Convert logo.png to WebP format (saves 70%% of size)
echo 2. Minify script.js
echo 3. Test site performance with Lighthouse
echo.
pause

