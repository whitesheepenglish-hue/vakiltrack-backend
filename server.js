const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
app.use(cors());

app.get("/test", (req, res) => {
  res.json({
    "status": "working",
    "pageTitle": "Example Domain"
  });
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});