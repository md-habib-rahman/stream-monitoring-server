const express = require("express");

const router = express.Router();

const {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  deleteChannel,
} = require("../repositories/channelRepository");
const authenticatedToken = require("../middleware/authMiddleware");

router.use(authenticatedToken);
router.post("/", async (req, res) => {
  try {
    // console.log(req.body);
    const channel = await createChannel(req.body);

    res.status(201).json(channel);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.get("/", async (req, res) => {
  try {
    const channel = await getAllChannels();
    res.status(200).json(channel);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const channel = await updateChannel(req.params.id, req.body);

    res.json(channel);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    await deleteChannel(req.params.id);

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

module.exports = router;
