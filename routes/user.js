const express = require("express");
const router = express.Router();
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");

// This runs AFTER Firebase login
router.post("/sync", authMiddleware, async (req, res) => {
  try {
    const { uid, email, name } = req.user;

    let user = await User.findOne({ firebaseUid: uid });

    if (!user) {
      user = await User.create({
        firebaseUid: uid,
        email,
        name
      });
    }

    res.json({ message: "User synced", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;