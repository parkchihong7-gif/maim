@echo off
rem maim home PC game program - double click to start. Close this window to stop.
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
where python >nul 2>nul && (python main.py) || (py -3 main.py)
pause
