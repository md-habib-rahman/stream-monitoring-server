const axios = require("axios");
const { Parser } = require("m3u8-parser");

async function getSegmentSize(segmentUrl) {
  try {
    const response = await axios.head(segmentUrl);

    return parseInt(response.headers["content-length"] || 0);
  } catch {
    return 0;
  }
}

async function calculateBitrate(playlistUrl, segments) {
  let totalBytes = 0;
  let totalDuration = 0;

  for (const segment of segments) {
    const segmentUrl = new URL(segment.uri, playlistUrl).href;

    const bytes = await getSegmentSize(segmentUrl);

    totalBytes += bytes;
    totalDuration += segment.duration;
  }

  if (totalDuration === 0) {
    return 0;
  }

  return Math.round((totalBytes * 8) / totalDuration / 1000);
}

async function checkHLS(url) {
  try {
    let playlistUrl = url;

    // -----------------------------
    // Load playlist
    // -----------------------------

    let response = await axios.get(playlistUrl, {
      timeout: 10000,
    });

    let parser = new Parser();

    parser.push(response.data);
    parser.end();

    let manifest = parser.manifest;
    let advertisedBitrate = 0;
    // -----------------------------
    // Master playlist?
    // -----------------------------

    if (manifest.playlists && manifest.playlists.length > 0) {
    //   let advertisedBitrate = 0;

      if (
        manifest.playlists[0].attributes &&
        manifest.playlists[0].attributes.BANDWIDTH
      ) {
        advertisedBitrate = Math.round(
          manifest.playlists[0].attributes.BANDWIDTH / 1000,
        );
      }
      playlistUrl = new URL(manifest.playlists[0].uri, url).href;

      response = await axios.get(playlistUrl, {
        timeout: 10000,
      });

      parser = new Parser();

      parser.push(response.data);

      parser.end();

      manifest = parser.manifest;
    }

    const segments = manifest.segments || [];

    const bitrate =
      advertisedBitrate > 0
        ? advertisedBitrate
        : await calculateBitrate(playlistUrl, segments);
    // console.log("URL:", playlistUrl);

    // console.log("Segments:", segments.length);

    // console.log("Bitrate:", bitrate);
    return {
      status: "UP",

      segmentCount: segments.length,

      lastSegment:
        segments.length > 0 ? segments[segments.length - 1].uri : null,

      bitrate,

      checkedAt: new Date(),
    };
  } catch (error) {
    return {
      status: "DOWN",

      error: error.message,

      checkedAt: new Date(),
    };
  }
}
module.exports = checkHLS;
