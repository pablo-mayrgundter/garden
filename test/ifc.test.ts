import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as WebIFC from "web-ifc";
import { exportIfc, ifcGuid, real, str } from "../src/lib/map/ifc.ts";
import { KINDS } from "../src/lib/map/kinds.ts";
import type { MapEntity } from "../src/lib/map/model.ts";
import type { Backup } from "../src/lib/store.ts";
import type { GardenData } from "../src/lib/types.ts";

const NOW = "2026-10-20T00:00:00Z";

/** The sample garden, plus one of every kind laid out along the back of a deeper lot, and a bed with plants up in it. */
function fixture(): GardenData {
  const sample = JSON.parse(readFileSync(new URL("../public/samples/herb-garden.json", import.meta.url), "utf8")) as Backup;
  const data = structuredClone({ ...sample.data, rain: sample.data.rain ?? [] }) as GardenData;
  let x = 2;
  let y = 140;
  let rowD = 0;
  for (const k of KINDS) {
    if (x + k.defaults.w > 58) [x, y, rowD] = [2, y + rowD + 3, 0];
    rowD = Math.max(rowD, k.defaults.d);
    const e: MapEntity = {
      id: `extra-${k.kind}`,
      kind: k.kind,
      name: `Extra ${k.label}`,
      x,
      y,
      w: k.defaults.w,
      d: k.defaults.d,
      h: k.defaults.h,
      z: k.defaults.z ?? 0,
      rot: k.kind === "shed" ? 30 : 0,
      props: { ...(k.defaults.props ?? {}) },
      links: {},
      notes: null,
      createdAt: NOW,
      updatedAt: NOW,
    };
    data.mapEntities.push(e);
    x += Math.max(k.defaults.w, 2) + 2;
  }
  data.garden.site = { ...data.garden.site!, depth: y + rowD + 6, lat: 40.7128, lon: -74.006, northDeg: 15 };
  data.trays.push({ id: "bed-tray", name: "Bed 1 rows", kind: null, rows: ["A", "B"], cols: 1, notes: null, layout: "rows", position: 9, createdAt: NOW });
  ["growing", "planned"].forEach((status, i) =>
    data.plantings.push({ id: `bed-p${i}`, speciesId: data.species[i].id, trayId: "bed-tray", cells: [`1${"AB"[i]}`], location: null, status: status as "growing", sownAt: "2026-05-01", sowDateEstimated: false, count: 5, createdAt: NOW, updatedAt: NOW }),
  );
  data.mapEntities.find((e) => e.name === "Bed 1")!.links.trayId = "bed-tray";
  return data;
}

test("STEP values: reals always have a point, strings escape quotes and anything beyond ASCII", () => {
  assert.equal(real(3), "3.");
  assert.equal(real(-0.0000001), "0.");
  assert.equal(real(0.3048), "0.3048");
  assert.equal(real(1e-5), "0.00001");
  assert.equal(str("Ann's bed"), "'Ann''s bed'");
  assert.equal(str("a\\b"), "'a\\\\b'");
  assert.equal(str("Café 🌱"), "'Caf\\X2\\00E9\\X0\\ \\X2\\D83CDF31\\X0\\'");
});

test("GlobalIds are 22 characters, the same for the same thing on every export, and differ between things", () => {
  const a = ifcGuid("bed-1");
  assert.match(a, /^[0-3][0-9A-Za-z_$]{21}$/);
  assert.equal(ifcGuid("bed-1"), a);
  assert.notEqual(ifcGuid("bed-2"), a);
});

test("the export is the same text every time for the same garden", () => {
  const data = fixture();
  const now = new Date(NOW);
  assert.equal(exportIfc(data, { now }), exportIfc(data, { now }));
});

test("the export opens in web-ifc (what Bldrs uses), with a shape for everything on the map", async () => {
  const data = fixture();
  data.mapEntities.find((e) => e.kind === "pool")!.notes = "Ann's \"pool\" — 🏊";
  const text = exportIfc(data, { now: new Date(NOW) });
  assert.match(text, /^ISO-10303-21;\nHEADER;[\s\S]*FILE_SCHEMA\(\('IFC4'\)\);[\s\S]*END-ISO-10303-21;\n$/);

  const api = new WebIFC.IfcAPI();
  await api.Init();
  api.SetLogLevel(WebIFC.LogLevel.LOG_LEVEL_OFF);
  const id = api.OpenModel(new TextEncoder().encode(text));
  try {
    // Every element with a shape comes out as triangles.
    const named = new Map<string, number>();
    const types = new Map<string, number>();
    api.StreamAllMeshes(id, (mesh) => {
      const line = api.GetLine(id, mesh.expressID);
      let tris = 0;
      for (let i = 0; i < mesh.geometries.size(); i++) {
        const g = api.GetGeometry(id, mesh.geometries.get(i).geometryExpressID);
        tris += g.GetIndexDataSize() / 3;
      }
      assert.ok(tris > 0, `${line.Name?.value} has no triangles`);
      named.set(line.Name?.value, (named.get(line.Name?.value) ?? 0) + 1);
      const type = api.GetNameFromTypeCode(line.type);
      types.set(type, (types.get(type) ?? 0) + 1);
    });
    for (const e of data.mapEntities) {
      if (e.kind === "area" || e.kind === "house" || e.kind === "shed") continue;
      assert.ok(named.has(e.name), `${e.kind} "${e.name}" is in the model`);
    }

    // Houses and sheds are buildings with storeys, walls, a roof, and their doors and windows cut in.
    const buildings = api.GetLineIDsWithType(id, WebIFC.IFCBUILDING);
    assert.equal(buildings.size(), data.mapEntities.filter((e) => e.kind === "house" || e.kind === "shed").length);
    assert.equal(types.get("IfcRoof"), buildings.size());
    assert.ok((types.get("IfcWindow") ?? 0) > 10);
    assert.ok((types.get("IfcDoor") ?? 0) >= 3);
    assert.equal(api.GetLineIDsWithType(id, WebIFC.IFCRELVOIDSELEMENT).size(), api.GetLineIDsWithType(id, WebIFC.IFCOPENINGELEMENT).size());

    // The plants that are up stand in their bed; planned ones don't show yet.
    const up = data.species[0];
    assert.equal(named.get(up.variety ? `${up.commonName} (${up.variety})` : up.commonName), 1);
    assert.equal(api.GetLineIDsWithType(id, WebIFC.IFCGEOGRAPHICELEMENT).size(), 1 + data.mapEntities.filter((e) => ["lawn", "mulch", "tree", "fruit-tree", "shrub", "hedge"].includes(e.kind)).length + 1);

    // The site knows where it is.
    const site = api.GetLine(id, api.GetLineIDsWithType(id, WebIFC.IFCSITE).get(0));
    assert.deepEqual(site.RefLatitude.value, [40, 42, 46, 80000]);
    assert.deepEqual(site.RefLongitude.value, [-74, 0, -21, -600000]);

    // Names and notes come through intact, quotes, dashes and emoji included.
    const proxies = api.GetLineIDsWithType(id, WebIFC.IFCBUILDINGELEMENTPROXY);
    const descriptions = Array.from({ length: proxies.size() }, (_, i) => api.GetLine(id, proxies.get(i)).Description?.value);
    assert.ok(descriptions.includes("Ann's \"pool\" — 🏊"), descriptions.join(" | "));

    // Each element's map settings are a property set.
    const props = api.GetLineIDsWithType(id, WebIFC.IFCPROPERTYSINGLEVALUE);
    const values = Array.from({ length: props.size() }, (_, i) => api.GetLine(id, props.get(i)));
    assert.ok(values.some((v) => v.Name.value === "Roof rise (ft)" && v.NominalValue.value === 7));
    assert.ok(values.some((v) => v.Name.value === "Planter" && v.NominalValue.value === "Bed 1 rows"));

    // GlobalIds are unique.
    const all = api.GetAllLines(id);
    const guids = new Set<string>();
    for (let i = 0; i < all.size(); i++) {
      const line = api.GetLine(id, all.get(i));
      if (line.GlobalId) {
        assert.ok(!guids.has(line.GlobalId.value), `duplicate GlobalId on ${api.GetNameFromTypeCode(line.type)}`);
        guids.add(line.GlobalId.value);
      }
    }
  } finally {
    api.CloseModel(id);
  }
});
