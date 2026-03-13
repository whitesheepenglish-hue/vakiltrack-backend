import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import FastAPI, HTTPException

from scraper import fetch_case
from scraper import CaptchaRequiredError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

app = FastAPI()

_CACHE_TTL_SECONDS = int(os.getenv("CASE_CACHE_TTL_SECONDS", "300").strip() or "300")
_MAX_WORKERS = int(os.getenv("CASE_FETCH_MAX_WORKERS", "4").strip() or "4")
_EXECUTOR = ThreadPoolExecutor(max_workers=_MAX_WORKERS, thread_name_prefix="case-fetch")

_lock = threading.Lock()
_inflight: set[str] = set()
_database: dict[str, dict] = {}


@app.on_event("shutdown")
def _shutdown_executor() -> None:
    _EXECUTOR.shutdown(wait=False, cancel_futures=True)


def _now() -> float:
    return time.time()


def _is_fresh(entry: dict) -> bool:
    updated_at = float(entry.get("updated_at", 0))
    return (_now() - updated_at) <= _CACHE_TTL_SECONDS


def _store_success(case_number: str, payload: dict) -> None:
    with _lock:
        _database[case_number] = {
            "state": "ready",
            "updated_at": _now(),
            "data": payload,
        }
        _inflight.discard(case_number)


def _store_error(case_number: str, *, status_code: int, detail: str) -> None:
    with _lock:
        _database[case_number] = {
            "state": "error",
            "updated_at": _now(),
            "error": {"status_code": status_code, "detail": detail},
        }
        _inflight.discard(case_number)


def _fetch_case_job(case_number: str) -> None:
    try:
        payload = fetch_case(case_number)
        _store_success(case_number, payload)
    except CaptchaRequiredError as e:
        _store_error(case_number, status_code=409, detail=str(e))
    except PlaywrightTimeoutError as e:
        _store_error(case_number, status_code=504, detail=f"Timed out fetching case status: {e}")
    except Exception as e:  # noqa: BLE001
        _store_error(case_number, status_code=502, detail=f"Failed to fetch case data: {e}")


@app.get("/case")
def get_case(case_number: str):
    case_number = case_number.strip()
    if not case_number:
        raise HTTPException(status_code=422, detail="case_number is required")

    with _lock:
        entry = _database.get(case_number)
        if entry and _is_fresh(entry):
            if entry.get("state") == "ready":
                return entry["data"]
            if entry.get("state") == "error":
                err = entry.get("error") or {}
                raise HTTPException(status_code=int(err.get("status_code", 502)), detail=str(err.get("detail", "")))

        already_inflight = case_number in _inflight
        if not already_inflight:
            _inflight.add(case_number)

    if not already_inflight:
        _EXECUTOR.submit(_fetch_case_job, case_number)

    return {"message": "Fetching case data, try again in a few seconds"}
