from fastapi import FastAPI
from scraper import get_captcha
import base64

app = FastAPI()


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/captcha")
def captcha():
    img = get_captcha()
    b64 = base64.b64encode(img).decode()
    return {"ok": True, "captchaImage": b64}
