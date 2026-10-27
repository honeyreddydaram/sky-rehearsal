"""Fixed-source aviation weather and optional Google Cloud Speech-to-Text."""
import base64
import binascii
import os
import time
from functools import lru_cache

import httpx
from fastapi import HTTPException
from app.catalog import get_airport
from google.cloud import speech
from pydantic import BaseModel, ConfigDict, Field


# Restrict to the packaged airport; this is not an arbitrary URL proxy.
@lru_cache(maxsize=2)
def cached_metar(window, station="VOHY"):
    try:
        with httpx.Client(timeout=8, follow_redirects=False) as client:
            response = client.get("https://aviationweather.gov/api/data/metar", params={"ids": station, "format": "raw", "hours": 2}, headers={"User-Agent": "SkyRehearsal/1.0 ground-training"})
            response.raise_for_status()
            raw = response.text.strip()
        if not raw or len(raw) > 6000:
            raise ValueError("No usable METAR")
        # API may return several observations; choose the first, rechecked in browser.
        return {"raw": raw.splitlines()[0], "station": station, "source": "NOAA Aviation Weather Center", "retrievedAt": time.time()}
    except Exception:
        return None


def latest_metar(airport_id="VOHY"):
    station = get_airport(airport_id)['weatherStation']
    if not station:
        raise HTTPException(422, 'This airport package has no configured METAR station')
    result = cached_metar(int(time.time() // 300), station)
    if result is None:
        raise HTTPException(503, "METAR unavailable; paste an observation or use a training scenario")
    return result


class AudioRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    audio: str = Field(min_length=1, max_length=1400000)


def transcribe(body):
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if not project or project.startswith("demo-") or os.getenv("FIREBASE_AUTH_EMULATOR_HOST"):
        raise HTTPException(503, "Google Cloud Speech is not configured")
    try:
        content = base64.b64decode(body.audio, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(422, "Invalid base64 audio") from None
    if len(content) > 1000000 or not content.startswith(b"\x1a\x45\xdf\xa3"):
        raise HTTPException(422, "Choose a WebM/Opus recording under 1 MB")
    try:
        with speech.SpeechClient(client_options={"quota_project_id": project}) as client:
            response = client.recognize(
                config=speech.RecognitionConfig(encoding=speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
                    sample_rate_hertz=48000, language_code="en-IN", enable_automatic_punctuation=True),
                audio=speech.RecognitionAudio(content=content), timeout=15, retry=None,
            )
        transcript = " ".join(result.alternatives[0].transcript for result in response.results if result.alternatives)
        if not transcript.strip() or len(transcript) > 500:
            raise ValueError("No short transcript")
        return {"transcript": transcript.strip(), "source": "Google Cloud Speech-to-Text"}
    except Exception:
        raise HTTPException(503, "Transcription unavailable; type your readback instead") from None
