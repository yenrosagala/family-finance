# Creates a local venv, installs PaddleOCR-VL dependencies, and serves the OCR
# microservice on 127.0.0.1:8008 (the FamFin Express API proxies to it).
# Usage:  powershell -ExecutionPolicy Bypass -File start.ps1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating virtual environment..."
  python -m venv .venv
}

$Py = "$Root\.venv\Scripts\python.exe"
Write-Host "Installing requirements (first run downloads PyTorch + transformers)..."
& $Py -m pip install --upgrade pip
& $Py -m pip install -r requirements.txt

Write-Host "Starting PaddleOCR-VL OCR service on http://127.0.0.1:8008 ..."
& $Py main.py