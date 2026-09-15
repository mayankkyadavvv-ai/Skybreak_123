import test from "node:test";
import assert from "node:assert/strict";
import { getAirspaceAt, getNearestCity, getGPSCoordinates, checkBoundaryCrossing, getApproachingLocation, getBiomeAt, CITIES, INTERNATIONAL_BORDERS } from "../src/game/GeoWorld.js";

test("GeoWorld: correctly identifies Indian airspace and states", () => {
  const jodhpur = getAirspaceAt(10000, 6000);
  assert.equal(jodhpur.country, "India");
  assert.equal(jodhpur.state, "Rajasthan");

  const amritsar = getAirspaceAt(4000, -25000);
  assert.equal(amritsar.country, "India");
  assert.equal(amritsar.state, "Punjab");

  const srinagar = getAirspaceAt(8000, -46000);
  assert.equal(srinagar.country, "India");
  assert.equal(srinagar.state, "Jammu & Kashmir");
});

test("GeoWorld: correctly identifies Pakistan, UAE and International airspace", () => {
  const karachi = getAirspaceAt(-18000, 14000);
  assert.equal(karachi.country, "Pakistan");
  assert.equal(karachi.state, "Sindh");

  const dubai = getAirspaceAt(-62000, 22000);
  assert.equal(dubai.country, "United Arab Emirates");

  const maritime = getAirspaceAt(-25000, 45000);
  assert.equal(maritime.country, "International Airspace");
});

test("GeoWorld: nearest city lookup returns expected major cities", () => {
  const nearDelhi = getNearestCity(27500, -13500);
  assert.equal(nearDelhi.city.name, "New Delhi");
  assert.ok(nearDelhi.distance < 2000);

  const nearKarachi = getNearestCity(-18200, 14200);
  assert.equal(nearKarachi.city.name, "Karachi");
  assert.ok(nearKarachi.distance < 2000);
});

test("GeoWorld: detects international border crossings correctly", () => {
  const indiaPos = { x: 5000, z: 6000 };
  const pakPos = { x: -5000, z: 6000 };

  const cross = checkBoundaryCrossing(indiaPos, pakPos);
  assert.ok(cross);
  assert.equal(cross.crossed, true);
  assert.equal(cross.fromCountry, "India");
  assert.equal(cross.toCountry, "Pakistan");

  // Staying inside India
  const noCross = checkBoundaryCrossing(indiaPos, { x: 8000, z: 7000 });
  assert.equal(noCross, null);
});

test("GeoWorld: computes valid GPS latitude and longitude strings", () => {
  const gpsOrigin = getGPSCoordinates(0, 0);
  assert.match(gpsOrigin.formatted, /26°30'N, 71°30'E/);

  const gpsDelhi = getGPSCoordinates(28000, -14000);
  assert.match(gpsDelhi.formatted, /26°\d\d'N, 71°\d\d'E/);
});

test("GeoWorld: computes approaching destination and live ETA accurately", () => {
  // Near Jodhpur, flying East towards Jaipur
  const pos = { x: 9000, y: 1500, z: 6000 };
  const forwardVec = { x: 0.98, y: 0, z: -0.2 };
  const speed = 250;

  const journey = getApproachingLocation(pos, forwardVec, speed);
  assert.ok(journey);
  assert.ok(journey.origin);
  assert.ok(journey.destination);
  assert.equal(journey.origin.name, "Jaisalmer");
  assert.ok(journey.distanceKm > 0);
  assert.ok(journey.formattedETA.includes(":"));
});

test("GeoWorld: correctly identifies regional natural biomes", () => {
  const himalayas = getBiomeAt(10000, -50000);
  assert.equal(himalayas.id, "himalayan_snow");
  assert.match(himalayas.name, /Himalayas/);

  const thar = getBiomeAt(5000, 5000);
  assert.equal(thar.id, "thar_desert");

  const sea = getBiomeAt(-10000, 45000);
  assert.equal(sea.id, "arabian_sea");

  const plains = getBiomeAt(25000, -20000);
  assert.equal(plains.id, "fertile_plains");
});

test("GeoWorld: contains 62 real surveyed cities and military airbases with verified lat/lon", () => {
  assert.equal(CITIES.length, 62);

  const airbases = CITIES.filter(c => c.militaryBase);
  assert.ok(airbases.length >= 24, "Should have at least 24 strategic military airbases");

  // Check key strategic airbases exist
  const ambala = CITIES.find(c => c.id === "ambala_afb");
  assert.ok(ambala);
  assert.equal(ambala.name, "Ambala Air Base");
  assert.equal(ambala.country, "India");
  assert.ok(ambala.lat > 30 && ambala.lat < 31);
  assert.ok(ambala.lon > 76 && ambala.lon < 77);

  const sargodha = CITIES.find(c => c.id === "sargodha_afb");
  assert.ok(sargodha);
  assert.equal(sargodha.name, "Sargodha Air Base");
  assert.equal(sargodha.country, "Pakistan");

  const alDhafra = CITIES.find(c => c.id === "aldhafra_afb");
  assert.ok(alDhafra);
  assert.equal(alDhafra.country, "United Arab Emirates");

  const hotan = CITIES.find(c => c.id === "hotan_afb");
  assert.ok(hotan);
  assert.equal(hotan.country, "China");

  // Validate all 62 cities have complete attributes within realistic geographical bounds
  for (const city of CITIES) {
    assert.ok(city.id && typeof city.id === "string");
    assert.ok(city.name && typeof city.name === "string");
    assert.ok(city.country && typeof city.country === "string");
    assert.ok(city.state && typeof city.state === "string");
    assert.ok(typeof city.lat === "number" && city.lat >= 15 && city.lat <= 42, `Invalid lat for ${city.id}: ${city.lat}`);
    assert.ok(typeof city.lon === "number" && city.lon >= 50 && city.lon <= 86, `Invalid lon for ${city.id}: ${city.lon}`);
    assert.ok(typeof city.x === "number");
    assert.ok(typeof city.z === "number");
    assert.ok(city.icon && typeof city.icon === "string");
  }
});

