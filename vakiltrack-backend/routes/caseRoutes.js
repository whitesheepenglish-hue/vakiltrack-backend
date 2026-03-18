const express = require("express");
const router = express.Router();

router.get("/", async (req, res) => {
  res.json({ message: "Cases route working" });
});

module.exports = router;