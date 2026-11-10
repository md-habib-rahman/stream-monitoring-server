const axios = require("axios");
const dns = require("node:dns");
const net = require("node:net");
const ipaddr = require("ipaddr.js");
const { Parser } = require("m3u8-parser");

function isPublicAddress(address) {
  try {
    const parsed = ipaddr.parse(address);
    if (parsed.kind() === "ipv4") {
      return parsed.range() === "unicast";
    }

    if (parsed.isIPv4MappedAddress()) {
      return parsed.toIPv4Address().range() === "unicast";
    }

    return (
      parsed.range() === "unicast" &&
      parsed.match(ipaddr.IPv6.parse("2000::"), 3) &&
      !parsed.match(ipaddr.IPv6.parse("2001::"), 23) &&
      !parsed.match(ipaddr.IPv6.parse("2002::"), 16)
    );
  } catch {
    return false;
  }
}

function validateStreamUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid stream URL");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new Error("Stream URL must use HTTP or HTTPS without credentials");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname) && !isPublicAddress(hostname)) {
    throw new Error("Stream destination must resolve to a public IP address");
  }

  return url;
}

function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error);
      return;
    }

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => !isPublicAddress(address))
    ) {
      callback(new Error("Stream destination must resolve to a public IP address"));
      return;
    }

    if (options?.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
}

function safeRequestConfig() {
  const token = process.env.HLS_TOKEN;
  if (!token) {
    throw new Error("HLS_TOKEN is not configured");
  }

  return {
    timeout: 10000,
    maxRedirects: 0,
    proxy: false,
    lookup: safeLookup,
    headers: {
      "X-Origin-Auth": token,
    },
  };
}

async function getSegmentSize(segmentUrl) {
  try {
    const url = validateStreamUrl(segmentUrl);
    const response = await axios.head(url.href, safeRequestConfig());

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
    let playlistUrl = validateStreamUrl(url).href;

    // -----------------------------
    // Load playlist
    // -----------------------------

    let response = await axios.get(playlistUrl, safeRequestConfig());

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
        const variantUrl = validateStreamUrl(
          new URL(playlist.uri, playlistUrl).href,
        ).href;

        const variantName = playlist.attributes?.RESOLUTION
          ? `${playlist.attributes.RESOLUTION.width}x${playlist.attributes.RESOLUTION.height}`
          : `${Math.round((playlist.attributes?.BANDWIDTH || 0) / 1000)}kbps`;

        try {
          const variantResponse = await axios.get(variantUrl, safeRequestConfig());

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

      playlistUrl = validateStreamUrl(
        new URL(firstVariant.uri, playlistUrl).href,
      ).href;

      response = await axios.get(playlistUrl, safeRequestConfig());

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
