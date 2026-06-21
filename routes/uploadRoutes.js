const express = require("express");
const multer = require("multer");

const { uploadLogo } = require("../controllers/uploadController");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024,
  },
});

router.post("/logo", upload.single("file"), uploadLogo);

module.exports = router;
