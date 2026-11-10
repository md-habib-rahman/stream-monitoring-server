const express = require("express");

const router = express.Router();

const {
  getAllChannels,
  getChannelById,
  createChannel,
  updateChannel,
  setChannelEnabled,
  deleteChannel,
} = require("../repositories/channelRepository");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");

router.use(authenticatedToken);
router.post("/", requireRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
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

router.put("/:id", requireRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  try {
    const channel = await updateChannel(req.params.id, req.body);

    res.json(channel);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

router.patch(
  "/:id/enabled",
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      return res.status(400).json({
        error: "enabled must be a boolean",
      });
    }

    try {
      const channel = await setChannelEnabled(req.params.id, req.body.enabled);

      if (!channel) {
        return res.status(404).json({
          error: "Channel not found",
        });
      }

      res.json(channel);
    } catch (err) {
      res.status(500).json({
        error: err.message,
      });
    }
  },
);

router.delete("/:id", requireRoles("ADMIN", "SUPER_ADMIN"), async (req, res) => {
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
