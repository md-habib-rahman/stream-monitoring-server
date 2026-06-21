const express = require("express");

const { getEvents } = require("../repositories/eventRepository");

const router = express.Router();

router.get("/events", async (req, res) => {
  try {
    const events = await getEvents();

    res.json(events);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
