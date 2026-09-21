# FamFin OCR service

A small FastAPI wrapper around the PaddleOCR-VL vision-language model, used
by the main API's `POST /api/receipt/ocr` endpoint to turn a photographed
receipt into text. See `main.py`'s top-of-file comment for endpoint details
and env vars.

## This is NOT deployed by `deploy/`

`deploy/` builds and ships the Express API only. This service is separate
on purpose: it needs meaningfully more resources than the API.

- **Not viable on a free tier.** This loads a multi-GB transformer model
  into memory and runs inference on every request. Render's free plan (used
  by `deploy/render.yaml` for the API) does not have the RAM or CPU for
  this.
- **Slow without a GPU.** Per `main.py`'s comments, CPU inference takes
  anywhere from a few seconds to about a minute per receipt. That's
  workable for a personal/family app but budget for it in whatever host you
  pick.
- **Cold start is slow.** The first request after startup downloads model
  weights (a few GB) before it can serve anything. `Dockerfile`'s
  `HEALTHCHECK` has a 120s start period to allow for this, but a real
  deploy should account for an even longer first-boot window.

## What happens if you don't deploy this at all

Nothing else breaks. `POST /api/receipt/ocr` returns a `503` with a clear
error message if `OCR_SERVICE_URL` is unreachable — the rest of the app
(manual transaction entry, budgets, reports, etc.) is unaffected. Receipt
*photo scanning* just won't work until this is deployed and
`OCR_SERVICE_URL` on the API points at it.

## Deploying it

1. Pick a host with enough CPU/RAM (4 vCPU / 8GB+ as a starting point) or a
   GPU-backed host if you want faster turnaround: Render (a paid instance
   type, not the free tier), Fly.io, Google Cloud Run (with enough memory
   configured), or a small GPU VM.
2. Build `Dockerfile` in this folder — the build context must be this
   folder (`ocr_service/`).
3. Set `OCR_SERVICE_URL` on the **API's** environment to point at wherever
   this ends up running, e.g. `https://your-ocr-host:8008`.
4. Verify: `GET https://your-ocr-host:8008/health` → `{"ok": true}`.

## Local dev

Use the repo-root `compose.dev.yaml` (`docker compose -f compose.dev.yaml up
--build`) to run the API and this service together locally with
`OCR_SERVICE_URL` already wired up. `deploy/compose.yaml` intentionally does
not include this service.

## GPU builds

The default `Dockerfile` installs the CPU build of `torch` from
`requirements.txt`. If your host has a GPU, replace the torch line in
`requirements.txt` with the matching CUDA wheel (see
https://pytorch.org/get-started/locally/) before building, and set
`OCR_DEVICE=cuda`.
