import os
import time

import schedule

from scraper import CaptchaRequiredError, fetch_case


def update_all_cases() -> None:
    raw = os.getenv("CASE_NUMBERS", "").strip()
    if not raw:
        print("scheduler: no CASE_NUMBERS set; nothing to update")
        return

    case_numbers = [c.strip() for c in raw.split(",") if c.strip()]
    print(f"scheduler: updating {len(case_numbers)} case(s)")

    for case_number in case_numbers:
        try:
            data = fetch_case(case_number)
            print(f"scheduler: {case_number}: {data.get('status')}")
        except CaptchaRequiredError as e:
            print(f"scheduler: {case_number}: captcha required ({e})")
        except Exception as e:  # noqa: BLE001
            print(f"scheduler: {case_number}: error ({e})")


def main() -> None:
    at_time = os.getenv("UPDATE_TIME", "06:00").strip() or "06:00"
    schedule.every().day.at(at_time).do(update_all_cases)
    print(f"scheduler: scheduled daily update at {at_time} (local time)")

    while True:
        schedule.run_pending()
        time.sleep(1)


if __name__ == "__main__":
    main()
