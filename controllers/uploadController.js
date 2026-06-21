const axios = require("axios");

async function uploadLogo(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }

    const imageBase64 = req.file.buffer.toString("base64");

    const formData = new URLSearchParams();

    formData.append("key", process.env.IMGBB_API_KEY);
    formData.append("image", imageBase64);

    const response = await axios.post(
      "https://api.imgbb.com/1/upload",
      formData,
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    return res.json({
      success: true,
      url: response.data.data.url,
      display_url: response.data.data.display_url,
    });
  } catch (err) {
    console.error(err);

    return res.status(500).json({
      error: "Image upload failed",
    });
  }
}

module.exports = {
  uploadLogo,
};
