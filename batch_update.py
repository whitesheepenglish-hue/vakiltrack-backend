import requests
from bs4 import BeautifulSoup
import firebase_admin
from firebase_admin import credentials, firestore

cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

def fetch_case(cnr):

    url = f"https://services.ecourts.gov.in/ecourtindia_v6/cases/cnr/{cnr}"

    headers = {
        "User-Agent": "Mozilla/5.0"
    }

    r = requests.get(url, headers=headers)

    soup = BeautifulSoup(r.text, "html.parser")

    hearing = "Not Found"

    rows = soup.find_all("tr")

    for row in rows:
        cols = row.find_all("td")

        if len(cols) >= 2:
            if "Next Hearing Date" in cols[0].text:
                hearing = cols[1].text.strip()

    return hearing


cases = db.collection("cases").stream()

for case in cases:

    data = case.to_dict()

    cnr = data.get("cnrNumber")

    if cnr:

        hearing = fetch_case(cnr)

        db.collection("cases").document(case.id).update({
            "nextHearingDate": hearing
        })

        print("Updated:", cnr, hearing)