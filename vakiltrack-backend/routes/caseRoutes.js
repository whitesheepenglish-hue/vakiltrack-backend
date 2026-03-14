const express = require("express");
const router = express.Router();

const { trackCase } = require("../controllers/caseController");

router.post("/track", trackCase);

module.exports = router;