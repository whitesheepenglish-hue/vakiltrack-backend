const express = require("express");
const router = express.Router();

const caseController = require("../controllers/caseController");

router.get("/scrape/:caseno",caseController.scrapeAndSave);

module.exports = router;