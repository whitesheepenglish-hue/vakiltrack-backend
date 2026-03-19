const express = require("express");
const router = express.Router();
const Case = require("../models/Case");

router.get("/", async (req, res) => {
  try {
    if (Case?.db?.readyState !== 1) {
      return res.status(503).json({ error: "MongoDB is not connected" });
    }

    const cases = await Case.find();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

router.post("/add", async (req, res) => {
  try {
    if (Case?.db?.readyState !== 1) {
      return res.status(503).json({ error: "MongoDB is not connected" });
    }

    const newCase = new Case(req.body);
    await newCase.save();

    res.json({ message: "Case saved" });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

module.exports = router;
