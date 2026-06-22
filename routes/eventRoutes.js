const express = require("express");

const { getEvents } = require("../repositories/eventRepository");

const router = express.Router();
const authenticatedToken = require("../middleware/authMiddleware");

// router.use(authenticatedToken);

router.get("/", async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;

    const limit = Number(req.query.limit) || 50;

    const filters = {
      channelId: req.query.channelId,
      location: req.query.location,
      broadcaster: req.query.broadcaster,
      status: req.query.status,
      from: req.query.from,
      to: req.query.to,
    };

    const result = await getEvents(page, limit, filters);

    res.json({
      data: result.events,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
