# vakiltrack-backend

## Setup

- Install deps: `.\.venv\Scripts\pip.exe install -r requirements.txt`
- Install Playwright browser: `.\.venv\Scripts\python.exe -m playwright install chromium`

## Run API

- Start: `.\.venv\Scripts\uvicorn.exe main:app --reload`
- Fetch: `GET /case?case_number=...`

## Run scraper (interactive)

eCourts often requires a captcha. Use the CLI to solve it in a headed browser:

`.\.venv\Scripts\python.exe scraper.py "YOUR_CASE_NUMBER" --headed`

## Run daily updater (scheduler)

This runs `update_all_cases()` every day at `06:00` local time by default.

- Install deps: `.\.venv\Scripts\pip.exe install -r requirements.txt`
- Run: `$env:CASE_NUMBERS="CASE1,CASE2"; .\.venv\Scripts\python.exe scheduler.py`
- Optional: `$env:UPDATE_TIME="06:00"` (24h `HH:MM`)

### Selector overrides (optional)

If the site markup changes, you can override selectors via env vars (comma-separated):

- `ECOURTS_CASE_INPUT_SELECTOR`
- `ECOURTS_SEARCH_SELECTOR`
- `ECOURTS_STATUS_SELECTOR`
