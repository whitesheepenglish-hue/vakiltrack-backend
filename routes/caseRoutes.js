const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Case = require("../models/Case");

// Check if MongoDB is connected using mongoose connection state
const isDbConnected = () => mongoose.connection?.readyState === 1;

router.get("/", async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ 
        error: "MongoDB is not connected",
        readyState: mongoose.connection?.readyState || 0,
        readyStateLabel: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection?.readyState || 0],
      });
    }

    const cases = await Case.find();
    res.json(cases);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

router.post("/add", async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ 
        error: "MongoDB is not connected",
        readyState: mongoose.connection?.readyState || 0,
        readyStateLabel: ["disconnected", "connected", "connecting", "disconnecting"][mongoose.connection?.readyState || 0],
      });
    }

    const newCase = new Case(req.body);
    await newCase.save();

    res.json({ message: "Case saved" });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

module.exports = router;
