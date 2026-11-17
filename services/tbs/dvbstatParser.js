const SUPPORTED_MODS = Object.freeze(["cdn", "mpi", "srt", "tus", "pus", "out"]);
const SUPPORTED_MOD_SET = new Set(SUPPORTED_MODS);

function readTag(xmlBlock, tagName) {
  const match = xmlBlock.match(
    new RegExp(`<${tagName}>([^<]*)</${tagName}>`, "i"),
  );
  return match ? match[1].trim() : null;
}

function normalizeStatus(lock, sync) {
  if (lock === "true") return sync === "true" ? "online" : "no_sync";
  if (lock === "false") return "no_lock";
  if (lock === "idle") return "stopped";
  if (lock === "odmidle") return "idle";
  if (["stopping", "starting", "restarting"].includes(lock)) return lock;
  return "unknown";
}

function readNumber(xmlBlock, tagName) {
  const value = Number(readTag(xmlBlock, tagName) || 0);
  return Number.isFinite(value) ? value : 0;
}

function parseDvbStatXml(xmlString, targetMods = ["cdn"]) {
  if (
    !Array.isArray(targetMods) ||
    targetMods.some((mod) => !SUPPORTED_MOD_SET.has(mod))
  ) {
    throw new Error("Unsupported TBS stream module");
  }

  const xml = String(xmlString || "");
  const streams = [];

  for (const mod of new Set(targetMods)) {
    const modSectionMatch = xml.match(
      new RegExp(`<${mod}>([\\s\\S]*?)</${mod}>`, "i"),
    );
    if (!modSectionMatch) continue;

    const itemMatches = [
      ...modSectionMatch[1].matchAll(
        /<dvs\s+name="([^"]+)">([\s\S]*?)<\/dvs>/gi,
      ),
    ];

    for (const match of itemMatches) {
      const mid = match[1];
      const block = match[2];
      const statusMatch = block.match(/<sta>([\s\S]*?)<\/sta>/i);
      const statusBlock = statusMatch ? statusMatch[1] : block;
      const lock = readTag(statusBlock, "lock") || "unknown";
      const sync = readTag(statusBlock, "sync");
      const serviceName =
        block.match(/<SERVICE_DESC[^>]+service="([^"]*)"/i)?.[1] || null;

      streams.push({
        mid,
        mod,
        name: readTag(statusBlock, "dnm") || serviceName || mid,
        source: readTag(statusBlock, "iaddr"),
        status: normalizeStatus(lock, sync),
        lock,
        sync: sync === "true",
        fps: readNumber(statusBlock, "fps"),
        bitrateBps: readNumber(statusBlock, "obr"),
        uptimeSec: readNumber(statusBlock, "dur"),
        discontinuities: readNumber(statusBlock, "dis"),
        errors: readNumber(statusBlock, "err"),
        loopCount: readNumber(statusBlock, "cycc"),
      });
    }
  }

  return streams;
}

module.exports = {
  SUPPORTED_MODS,
  parseDvbStatXml,
};
