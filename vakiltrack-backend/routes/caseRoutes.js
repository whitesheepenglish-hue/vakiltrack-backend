const express = require("express");
const router = express.Router();

const { getCase } = require("../controllers/caseController");

router.get("/case", getCase);

module.exports = router;