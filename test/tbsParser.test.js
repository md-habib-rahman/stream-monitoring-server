const test = require("node:test");
const assert = require("node:assert/strict");
const { parseDvbStatXml } = require("../services/tbs/dvbstatParser");

test("parses stream telemetry from the selected modules", () => {
  const xml = `
    <root>
      <cdn><dvs name="1"><sta><lock>true</lock><sync>true</sync><fps>25</fps>
        <obr>1234</obr><dur>30</dur><dis>1</dis><err>2</err><cycc>4</cycc>
      </sta></dvs></cdn>
      <mpi><dvs name="2"><sta><dnm>Backup</dnm><lock>false</lock></sta></dvs></mpi>
    </root>`;

  const streams = parseDvbStatXml(xml, ["cdn", "mpi"]);
  assert.deepEqual(
    streams.map(({ mid, mod, name, status, bitrateBps }) => ({
      mid,
      mod,
      name,
      status,
      bitrateBps,
    })),
    [
      { mid: "1", mod: "cdn", name: "1", status: "online", bitrateBps: 1234 },
      { mid: "2", mod: "mpi", name: "Backup", status: "no_lock", bitrateBps: 0 },
    ],
  );
});

test("rejects untrusted module names", () => {
  assert.throws(() => parseDvbStatXml("<root/>", ["cdn>(.*)"]));
});
