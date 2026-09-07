# -*- coding: utf-8 -*-
# PaddleOCR-VL OCR microservice for FamFin.
#
# Runs the PaddleOCR-VL vision-language model (https://huggingface.co/PaddlePaddle/PaddleOCR-VL)
# behind a small HTTP API so the Express backend (api/) can turn a scanned
# receipt photo into text without shipping a model inside the app.
#
# Endpoints:
#   GET  /health          -> {"ok": true}
#   POST /ocr             -> input  {"image_base64": "<base64 JPEG/PNG>"}
#                          -> output {"text": "<recognized lines>", "source": "paddleocr-vl"}
#
# Setup:
#   python -m venv .venv
#   .venv\Scripts\activate
#   pip install -r requirements.txt
#   python main.py            (serves on 127.0.0.1:8008)
#
# Env:
#   OCR_MODEL        HF model id (default "PaddlePaddle/PaddleOCR-VL")
#   OCR_PORT         port (default 8008)
#   OCR_DEVICE       "auto" | "cuda" | "cpu" | "mps" (default "auto")
#   OCR_MAX_TOKENS   generation cap (default 2048)
#
# First request downloads the model weights (a few GB) and is slow; afterwards
# the model stays loaded in memory. The /ocr handler is genuinely compute-heavy
# on CPU (a few seconds to a minute per receipt) — that is expected.

import base64
import io
import logging
import os
import threading
from typing import Optional

from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel, Field

MODEL_ID = os.environ.get("OCR_MODEL", "PaddlePaddle/PaddleOCR-VL")
PORT = int(os.environ.get("OCR_PORT", "8008"))
DEVICE_PREF = os.environ.get("OCR_DEVICE", "auto").lower()
MAX_TOKENS = int(os.environ.get("OCR_MAX_TOKENS", "2048"))

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
log = logging.getLogger("paddleocr-vl")

app = FastAPI(title="FamFin PaddleOCR-VL", version="1.0.0")

_model_lock = threading.Lock()
_model_cache: dict = {}


def _apply_transformers_compat() -> None:
    """Patches slipped APIs so PaddleOCR-VL's remote modeling code runs on the
    installed transformers.

    1. transformers 5.x removed the 'default' entry from ROPE_INIT_FUNCTIONS, but
       PaddleOCR-VL's remote Ernie4_5 code looks up ROPE_INIT_FUNCTIONS[config.rope_type]
       where rope_type defaults to 'default'. Linear scaling with factor 1.0 IS the
       default RoPE, so register the linear builder under 'default'.
    2. Some transformers versions renamed create_causal_mask(inputs_embeds=...) ->
       input_embeds; forward the legacy kwarg if the installed one uses the new name.
    Both run before the remote modeling module is imported by from_pretrained()."""
    try:
        from transformers import modeling_rope_utils as mru
        import transformers.modeling_utils as transform_utils

        # transformers 5.x only ships the extended rope builders ('linear', ...) in
        # ROPE_INIT_FUNCTIONS; remote custom models (PaddleOCR-VL) request 'default'.
        def _default_rope(config=None, device=None, seq_len=None, layer_type=None):
            # Mirror transformers 4.x get_default_rope_parameters for this config:
            # rope_theta=500000, head_dim=128, no scaling -> plain inverse freq RoPE.
            import torch as _torch

            base = float(getattr(config, "rope_theta", None) or 500000.0)
            partial = float(getattr(config, "partial_rotary_factor", None) or 1.0)
            head_dim = int(getattr(config, "head_dim", None) or (config.hidden_size // config.num_attention_heads))
            dim = int(head_dim * partial)
            inv_freq = 1.0 / (
                base
                ** (_torch.arange(0, dim, 2, dtype=_torch.int64).to(device=device, dtype=_torch.float32) / dim)
            )
            return inv_freq, 1.0

        if "default" not in mru.ROPE_INIT_FUNCTIONS:
            mru.ROPE_INIT_FUNCTIONS["default"] = _default_rope

        # 5.x _init_weights needs module.compute_default_rope_parameters() on any
        # custom RotaryEmbedding that uses rope_type='default'; the remote module
        # lacks it. Attach a method mirroring the registry fn right before init.
        def _attach_default_rope(module):
            def _compute_default_rope_parameters(self, config=None, device=None):
                return _default_rope(config or self.config, device or getattr(self, "device", None))

            module.compute_default_rope_parameters = _compute_default_rope_parameters.__get__(module)

        def _patched_init_weights(self, module):
            if (
                "RotaryEmbedding" in type(module).__name__
                and hasattr(module, "original_inv_freq")
                and getattr(module, "rope_type", None) == "default"
                and not hasattr(module, "compute_default_rope_parameters")
            ):
                _attach_default_rope(module)
            return _orig_init_weights(self, module)

        _orig_init_weights = transform_utils.PreTrainedModel._init_weights
        transform_utils.PreTrainedModel._init_weights = _patched_init_weights
    except Exception as exc:  # noqa: BLE001
        log.warning("rope compat not applied: %s", exc)

    try:
        import transformers.masking_utils as mu

        _orig = mu.create_causal_mask

        def _compat(*args, **kwargs):
            if "inputs_embeds" in kwargs:
                kwargs.setdefault("input_embeds", kwargs.pop("inputs_embeds"))
            return _orig(*args, **kwargs)

        mu.create_causal_mask = _compat
    except Exception as exc:  # noqa: BLE001
        log.warning("mask shim not applied: %s", exc)


_apply_transformers_compat()


def resolve_device() -> str:
    if DEVICE_PREF != "auto":
        return DEVICE_PREF
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        # Apple Silicon
        if getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            return "mps"
    except Exception:
        pass
    return "cpu"


def _patch_remote_prepare_inputs_for_generation(model) -> None:
    """transformers 5.x no longer prepares cache_position in generate(); PaddleOCR-VL's
    remote prepare_inputs_for_generation indexes it. Synthesize it when missing."""
    import torch

    orig = model.__class__.prepare_inputs_for_generation

    def patched(
        self,
        input_ids,
        past_key_values=None,
        attention_mask=None,
        inputs_embeds=None,
        cache_position=None,
        position_ids=None,
        use_cache=True,
        **kwargs,
    ):
        if cache_position is None:
            start = 0
            try:
                if past_key_values is not None:
                    start = past_key_values.get_seq_length() or 0
            except Exception:  # noqa: BLE001
                start = 0
            cache_position = torch.arange(start, start + input_ids.shape[1], device=input_ids.device)
        return orig(
            self,
            input_ids,
            past_key_values=past_key_values,
            attention_mask=attention_mask,
            inputs_embeds=inputs_embeds,
            cache_position=cache_position,
            position_ids=position_ids,
            use_cache=use_cache,
            **kwargs,
        )

    model.__class__.prepare_inputs_for_generation = patched


def load_model() -> dict:
    with _model_lock:
        if _model_cache:
            return _model_cache
        log.info("Loading PaddleOCR-VL model '%s' on %s (first load downloads weights)", MODEL_ID, resolve_device())
        import torch
        from transformers import AutoModelForCausalLM, AutoProcessor

        device = resolve_device()
        torch_dtype = torch.float16 if device in ("cuda", "mps") else torch.float32

        processor = AutoProcessor.from_pretrained(MODEL_ID, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            MODEL_ID,
            torch_dtype=torch_dtype,
            trust_remote_code=True,
            device_map="auto" if device == "cuda" else None,
        ).to(device if device != "cuda" else "cuda")
        _patch_remote_prepare_inputs_for_generation(model)
        model.eval()
        log.info("Model loaded")
        _model_cache.update(processor=processor, model=model, device=device, dtype=torch_dtype)
        return _model_cache


class OcrRequest(BaseModel):
    image_base64: str = Field(min_length=16)


class OcrResponse(BaseModel):
    text: str
    source: str = "paddleocr-vl"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/ocr", response_model=OcrResponse)
def ocr(req: OcrRequest) -> OcrResponse:
    try:
        raw = base64.b64decode(req.image_base64)
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Invalid image: {exc}") from exc

    cache = load_model()
    processor, model, device = cache["processor"], cache["model"], cache["device"]

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": image},
                {"type": "text", "text": "OCR:"},
            ],
        }
    ]
    inputs = processor.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_dict=True,
        return_tensors="pt",
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with _model_lock:
        outputs = model.generate(
            **inputs,
            do_sample=False,
            use_cache=True,
            max_new_tokens=MAX_TOKENS,
        )

    output_ids = outputs[:, inputs["input_ids"].shape[1]:]
    text = processor.tokenizer.decode(output_ids[0], skip_special_tokens=True).strip()
    return OcrResponse(text=text)


if __name__ == "__main__":
    import uvicorn

    log.info("Starting PaddleOCR-VL service on 127.0.0.1:%s", PORT)
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")