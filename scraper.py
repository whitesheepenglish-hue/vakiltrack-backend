import logging
import os
import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

# Firebase setup
SERVICE_ACCOUNT_PATH = "serviceAccountKey.json"
if not firebase_admin._apps:
    cred = credentials.Certificate(SERVICE_ACCOUNT_PATH)
    firebase_admin.initialize_app(cred)

db = firestore.client()

ECOURTS_URL = "https://services.ecourts.gov.in/ecourtindia_v6/"
REQUEST_TIMEOUT_SECONDS = 30
def fetch_case_details(case_number=None):
    """
    Prompt the user for CNR and captcha, post to the cnr_result.php
    endpoint, and look up the Next Hearing Date in the resulting table.
    """
    CNR = input("Enter CNR: ").strip()
    captcha = input("Enter captcha from eCourts website: ").strip()

    url = "https://services.ecourts.gov.in/ecourtindia_v6/cases/cnr_result.php"

    payload = {
        "cnrno": CNR,
        "captcha": captcha
    }

    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    response = requests.post(url, data=payload, headers=headers, timeout=REQUEST_TIMEOUT_SECONDS)
    soup = BeautifulSoup(response.text, "html.parser")

    rows = soup.find_all("tr")

    hearing_date = None

    for row in rows:
        cols = row.find_all("td")
        if len(cols) >= 2:
            label = cols[0].get_text(strip=True)
            value = cols[1].get_text(strip=True)

            if "Next Hearing Date" in label:
                hearing_date = value

    case_details = {
        "case_number": CNR,
        "status": "Active",
        "nextHearingDate": hearing_date or "Not Scheduled",
        "court": "Unknown",
    }
    logging.info("Fetched details for CNR %s", CNR)
    
    if hearing_date:
        db.collection("cases").document(CNR).update({
            "nextHearingDate": hearing_date
        })
        logging.info("Updated Firebase for CNR %s", CNR)
    
    return case_details

def main():
    print("E-Courts Case Details Fetcher")
    print("==============================")
    
    details = fetch_case_details()
    
    if details:
        print("\nCase Details:")
        print(f"CNR Number: {details['case_number']}")
        print(f"Status: {details['status']}")
        print(f"Next Hearing Date: {details['nextHearingDate']}")
        print(f"Court: {details['court']}")
    else:
        print("Failed to fetch case details. See logs for more information.")

if __name__ == "__main__":
    main()