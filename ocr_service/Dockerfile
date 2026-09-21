# PaddleOCR-VL microservice — self-contained image.
#
# This ships a multi-GB vision-language model (torch + transformers). It is
# NOT suited to a free-tier host: budget at least 4 vCPU / 8GB+ RAM (CPU-only
# inference is slow — expect several seconds to ~1 minute per receipt, per
# main.py's own comments) or a GPU-backed host for real-time use. Render's
# free tier, in particular, will not work — use a GPU/CPU-heavy tier on
# Render, Fly.io, Cloud Run, or a small GPU VM instead, and only enable
# api/receipt's /ocr endpoint (via OCR_SERVICE_URL) once this is reachable.
#
# Build context MUST be this folder (ocr_service/).

FROM python:3.11-slim

WORKDIR /app

# System deps for Pillow/torch wheels
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# CPU-only torch build by default keeps the image smaller; if you have a GPU
# host, replace this with the matching CUDA wheel per pytorch.org before
# building.
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py .

ENV OCR_PORT=8008
ENV OCR_HOST=0.0.0.0
EXPOSE 8008

# First request downloads model weights (a few GB) — give it room; there is
# no separate warmup step here, so the first /ocr call after a cold start
# will be slow. Consider a startup probe with a long initial delay if your
# host supports one.
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8008/health', timeout=5)" || exit 1

CMD ["python", "main.py"]
