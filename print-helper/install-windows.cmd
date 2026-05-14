@echo off
REM ─────────────────────────────────────────────────────────────────────
REM MaxPOS print helper — Windows service installer (NSSM).
REM
REM Prereqs:
REM   1. Node 20+ installed at the default location.
REM   2. NSSM downloaded from https://nssm.cc/download and placed at
REM      C:\nssm\nssm.exe (or adjust NSSM= below).
REM
REM Run this script from an *elevated* command prompt (right-click ->
REM Run as administrator). Adjust the constants below to your machine
REM before running.
REM ─────────────────────────────────────────────────────────────────────

set SERVICE=MaxPOSPrintHelper
set NSSM=C:\nssm\nssm.exe
set NODE=C:\Program Files\nodejs\node.exe
set WORKDIR=%~dp0
set SCRIPT=index.js

REM Adjust to your queue. \\.\<queue-name> sends raw bytes to the
REM Windows print spooler queue you added for the XP-58IIB.
set PRINTER_DEVICE=\\.\XP58
set PORT=9100
set PAPER_WIDTH=32

set LOGDIR=C:\ProgramData\MaxPOSPrintHelper
if not exist "%LOGDIR%" mkdir "%LOGDIR%"

"%NSSM%" install %SERVICE% "%NODE%" %SCRIPT%
"%NSSM%" set %SERVICE% AppDirectory "%WORKDIR%"
"%NSSM%" set %SERVICE% AppEnvironmentExtra ^
    PORT=%PORT% ^
    PRINTER_DEVICE=%PRINTER_DEVICE% ^
    PAPER_WIDTH=%PAPER_WIDTH%
"%NSSM%" set %SERVICE% AppStdout "%LOGDIR%\helper.log"
"%NSSM%" set %SERVICE% AppStderr "%LOGDIR%\helper.log"
"%NSSM%" set %SERVICE% AppRotateFiles 1
"%NSSM%" set %SERVICE% AppRotateBytes 1048576
"%NSSM%" set %SERVICE% Start SERVICE_AUTO_START
"%NSSM%" set %SERVICE% AppExit Default Restart

"%NSSM%" start %SERVICE%

echo.
echo Done. Service "%SERVICE%" installed and started.
echo Logs:    %LOGDIR%\helper.log
echo Manage:  services.msc  (or:  nssm stop/start/restart %SERVICE% )
echo Remove:  nssm remove %SERVICE% confirm
