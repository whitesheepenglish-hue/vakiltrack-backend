import logging
import os
import time

import firebase_admin
import requests
import schedule
from bs4 import BeautifulSoup
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT_PATH = os.getenv("FIREBASE_CREDENTIALS", "serviceAccountKey.json")
CASE_NUMBER = os.getenv("CASE_NUMBER", "123/2024")
# allow specifying Firestore document ID directly
CASE_ID = os.getenv("CASE_ID")
ECOURTS_URL = os.getenv("ECOURTS_URL", "https://services.ecourts.gov.in/ecourtindia_v6/")
SCHEDULE_TIME = os.getenv("SCHEDULE_TIME", "06:00")
REQUEST_TIMEOUT_SECONDS = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "30"))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def init_firestore_client():
    if not os.path.exists(SERVICE_ACCOUNT_PATH):
        raise FileNotFoundError(
            f"Firebase credentials file not found: {SERVICE_ACCOUNT_PATH}"
        )

    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
        firebase_admin.initialize_app(cred)

    return firestore.client()


db = init_firestore_client()


def check_hearing():
    try:
        response = requests.get(ECOURTS_URL, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # TODO: replace with real selector parsing.
        _ = soup
        hearing_date = "10-07-2026"

        # choose document based on CASE_ID or fallback to case number
        doc_ref = db.collection("cases").document(CASE_ID) if CASE_ID else db.collection("cases").document(CASE_NUMBER)
        doc_ref.set(
            {
                "nextHearingDate": hearing_date,
                "updatedAt": firestore.SERVER_TIMESTAMP,
            },
            merge=True,
        )
        logging.info("Hearing updated for case %s (doc %s)", CASE_NUMBER, CASE_ID or CASE_NUMBER)
    except Exception:
        logging.exception("Failed to update hearing for case %s", CASE_NUMBER)


def main():
    schedule.every(6).hours.do(check_hearing)
    logging.info("Scheduler started. Running every 6 hours for case %s", CASE_NUMBER)

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    main()
