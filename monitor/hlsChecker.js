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

    let variants = [];

    if (manifest.playlists && manifest.playlists.length > 0) {
      for (const playlist of manifest.playlists) {
        const variantUrl = new URL(playlist.uri, url).href;

        const variantName = playlist.attributes?.RESOLUTION
          ? `${playlist.attributes.RESOLUTION.width}x${playlist.attributes.RESOLUTION.height}`
          : `${Math.round((playlist.attributes?.BANDWIDTH || 0) / 1000)}kbps`;

        try {
          const variantResponse = await axios.get(variantUrl, {
            timeout: 10000,
          });

          const variantParser = new Parser();

          variantParser.push(variantResponse.data);

          variantParser.end();

          const variantManifest = variantParser.manifest;

          variants.push({
            name: variantName,
            status: "UP",
            segmentCount: variantManifest.segments?.length || 0,
            lastSegment:
              variantManifest.segments?.[variantManifest.segments.length - 1]
                ?.uri || null,
          });
        } catch (err) {
          variants.push({
            name: variantName,
            status: "DOWN",
            error: err.message,
          });
        }
      }

      const firstVariant = manifest.playlists[0];

      if (firstVariant.attributes?.BANDWIDTH) {
        advertisedBitrate = Math.round(
          firstVariant.attributes.BANDWIDTH / 1000,
        );
      }

      playlistUrl = new URL(firstVariant.uri, url).href;

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
    const degraded =
      variants.length > 0 && variants.some((v) => v.status === "DOWN");

    return {
      status: degraded ? "DEGRADED" : "UP",

      segmentCount: segments.length,

      lastSegment:
        segments.length > 0 ? segments[segments.length - 1].uri : null,

      bitrate,

      variants,

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
