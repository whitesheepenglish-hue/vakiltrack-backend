import sys
import requests
from bs4 import BeautifulSoup

cnr = sys.argv[1]

url = f"https://services.ecourts.gov.in/ecourtindia_v6/cases/cnr/{cnr}"

headers = {
 "User-Agent":"Mozilla/5.0"
}

r = requests.get(url, headers=headers)

soup = BeautifulSoup(r.text,"html.parser")

hearing = "Not Found"

rows = soup.find_all("tr")

for row in rows:

    cols = row.find_all("td")

    if len(cols) >= 2:

        if "Next Hearing Date" in cols[0].text:

            hearing = cols[1].text.strip()

print({
 "cnr":cnr,
 "nextHearingDate":hearing
})