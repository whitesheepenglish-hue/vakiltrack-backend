import os
import sys
import time
from dataclasses import dataclass
from typing import Iterable, Optional

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


class CaptchaRequiredError(RuntimeError):
    pass


@dataclass(frozen=True)
class EcourtsSelectors:
    case_number: tuple[str, ...]
    search: tuple[str, ...]
    status: tuple[str, ...]


DEFAULT_SELECTORS = EcourtsSelectors(
    case_number=(
        "#caseNumber",
        "#case_number",
        "#caseNo",
        "input[name='caseNo']",
        "input[name='caseNumber']",
        "input[name='case_number']",
        "input[placeholder*='Case' i]",
    ),
    search=(
        "#searchBtn",
        "button:has-text('Search')",
        "input[type='submit'][value*='Search' i]",
    ),
    status=(
        "#caseStatus",
        "text=/\\bcase status\\b/i",
    ),
)


def _env_selector_list(var_name: str) -> Optional[tuple[str, ...]]:
    raw = os.getenv(var_name, "").strip()
    if not raw:
        return None
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    return tuple(parts) if parts else None


def _pick_first_visible(page, selectors: Iterable[str], timeout_ms: int):
    deadline = time.time() + (timeout_ms / 1000)
    last_error: Exception | None = None

    while time.time() < deadline:
        for selector in selectors:
            try:
                loc = page.locator(selector).first
                if loc.count() and loc.is_visible():
                    return loc
            except Exception as e:  # noqa: BLE001 - Playwright can raise many runtime errors
                last_error = e
        time.sleep(0.2)

    if last_error:
        raise last_error
    raise PlaywrightTimeoutError(f"Timed out waiting for any selector: {list(selectors)}")


def _captcha_seems_present(page) -> bool:
    # Heuristic only: the site frequently requires a captcha before searching.
    patterns = [
        "text=/\\bcaptcha\\b/i",
        "input[type='text'][name*='captcha' i]",
        "input[type='text'][id*='captcha' i]",
        "img[id*='captcha' i]",
        "img[src*='captcha' i]",
    ]
    try:
        for s in patterns:
            loc = page.locator(s).first
            if loc.count() and loc.is_visible():
                return True
    except Exception:
        return False
    return False


def get_captcha(
    *,
    url: str = "https://services.ecourts.gov.in/",
    timeout_ms: int = 30_000,
    headless: Optional[bool] = None,
) -> bytes:
    """
    Returns a screenshot (bytes) of the captcha image if one is visible on the page.

    Note: eCourts may only render the captcha after specific interactions; this function
    is best-effort and will raise if no captcha image becomes visible within `timeout_ms`.
    """
    if headless is None:
        headless = os.getenv("ECOURTS_HEADLESS", "1").strip() not in {"0", "false", "False"}

    captcha_selectors = (
        "img[id*='captcha' i]",
        "img[src*='captcha' i]",
        "img[alt*='captcha' i]",
        "#captcha_image",
        "#captchaImg",
    )

    with sync_playwright() as p:
        launch_args: list[str] = ["--disable-blink-features=AutomationControlled"]
        if os.name != "nt":
            launch_args.extend(["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"])

        browser = p.chromium.launch(headless=headless, args=launch_args)
        page = browser.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(2000)

            captcha_img = _pick_first_visible(page, captcha_selectors, timeout_ms=timeout_ms)
            return captcha_img.screenshot()
        finally:
            browser.close()


def get_case_status(
    case_number: str,
    *,
    url: str = "https://services.ecourts.gov.in/",
    timeout_ms: int = 30_000,
    headless: Optional[bool] = None,
    selectors: EcourtsSelectors = DEFAULT_SELECTORS,
    interactive: bool = False,
) -> str:
    data = get_case_data(
        case_number,
        url=url,
        timeout_ms=timeout_ms,
        headless=headless,
        selectors=selectors,
        interactive=interactive,
    )
    return data["status"]


def get_case_data(
    case_number: str,
    *,
    url: str = "https://services.ecourts.gov.in/",
    timeout_ms: int = 30_000,
    headless: Optional[bool] = None,
    selectors: EcourtsSelectors = DEFAULT_SELECTORS,
    interactive: bool = False,
) -> dict:
    if headless is None:
        headless = os.getenv("ECOURTS_HEADLESS", "1").strip() not in {"0", "false", "False"}
    if interactive and headless:
        raise ValueError("interactive=True requires headless=False (a visible browser) to solve captcha.")

    sel_case = _env_selector_list("ECOURTS_CASE_INPUT_SELECTOR") or selectors.case_number
    sel_search = _env_selector_list("ECOURTS_SEARCH_SELECTOR") or selectors.search
    sel_status = _env_selector_list("ECOURTS_STATUS_SELECTOR") or selectors.status

    with sync_playwright() as p:
        launch_args: list[str] = ["--disable-blink-features=AutomationControlled"]
        if os.name != "nt":
            launch_args.extend(
                [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                ]
            )

        browser = p.chromium.launch(
            headless=headless,
            args=launch_args,
        )
        page = browser.new_page()
        try:
            page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            page.wait_for_timeout(4000)

            case_input = _pick_first_visible(page, sel_case, timeout_ms=timeout_ms)
            case_input.fill(case_number, timeout=timeout_ms)

            if _captcha_seems_present(page):
                if not interactive:
                    raise CaptchaRequiredError(
                        "Captcha appears to be required on eCourts. "
                        "Run interactively (CLI) to solve it manually, or integrate a captcha-solving flow."
                    )
                print("Captcha detected. Solve it in the browser, then return here.", file=sys.stderr)
                input("Press ENTER after solving captcha... ")

            search_btn = _pick_first_visible(page, sel_search, timeout_ms=timeout_ms)
            search_btn.click(timeout=timeout_ms)

            page.wait_for_timeout(5000)

            try:
                status = page.locator("text=Case Status").first.inner_text(timeout=timeout_ms).strip()
            except Exception:
                status_loc = _pick_first_visible(page, sel_status, timeout_ms=timeout_ms)
                status = status_loc.inner_text(timeout=timeout_ms).strip()

            try:
                hearing = page.locator("text=Next Hearing").first.inner_text(timeout=timeout_ms).strip()
            except Exception:
                hearing = None

            return {
                "case_number": case_number,
                "status": status,
                "next_hearing": hearing,
            }
        finally:
            browser.close()


def fetch_case(case_number: str) -> dict:
    return get_case_data(case_number)


def scrape_case(case_number: str) -> dict:
    """
    Backwards-compatible helper for callers that expect a `scrape_case` function.
    Returns a payload suitable for caching (e.g. in `main.py`).
    """
    return get_case_data(case_number)


def _main(argv: list[str]) -> int:
    import argparse

    parser = argparse.ArgumentParser(description="Fetch eCourts case status (may require captcha).")
    parser.add_argument("case_number", help="Case number to search")
    parser.add_argument("--url", default=os.getenv("ECOURTS_URL", "https://services.ecourts.gov.in/"))
    parser.add_argument("--headed", action="store_true", help="Run with a visible browser")
    parser.add_argument("--timeout-ms", type=int, default=30_000)
    args = parser.parse_args(argv)

    try:
        status = get_case_status(
            args.case_number,
            url=args.url,
            timeout_ms=args.timeout_ms,
            headless=not args.headed,
            interactive=True,
        )
        print(status)
        return 0
    except CaptchaRequiredError as e:
        print(str(e), file=sys.stderr)
        return 2
    except PlaywrightTimeoutError as e:
        print(f"Timed out: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(_main(sys.argv[1:]))
