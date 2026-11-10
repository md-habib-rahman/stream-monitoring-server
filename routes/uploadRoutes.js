const express = require("express");
const multer = require("multer");

const { uploadLogo } = require("../controllers/uploadController");
const authenticatedToken = require("../middleware/authMiddleware");
const requireRoles = require("../middleware/requireRoles");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

router.post(
  "/logo",
  authenticatedToken,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  upload.single("file"),
  uploadLogo,
);

module.exports = router;
