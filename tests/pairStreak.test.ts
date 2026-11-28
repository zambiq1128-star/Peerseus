import test from "node:test";
import assert from "node:assert/strict";
import { computePairStreak, groupPairDays } from "../src/lib/pairStreak.ts";
import { wibDay } from "../src/lib/streak.ts";

const T = "2026-11-28";

test("kosong", () => {
  assert.deepEqual(computePairStreak([], T), { current: 0, best: 0, atRisk: false });
});

test("satu hari (hari ini)", () => {
  assert.deepEqual(computePairStreak([T], T), { current: 1, best: 1, atRisk: false, lastDay: T });
});

test("berturut-turut sampai hari ini", () => {
  const r = computePairStreak(["2026-11-26", "2026-11-27", "2026-11-28"], T);
  assert.deepEqual(r, { current: 3, best: 3, atRisk: false, lastDay: T });
});

test("bolong sehari memutus streak, terbaik tetap tersimpan", () => {
  const r = computePairStreak(["2026-11-20", "2026-11-21", "2026-11-22", "2026-11-24", "2026-11-25"], "2026-11-25");
  assert.equal(r.current, 2);
  assert.equal(r.best, 3);
});

test("terakhir kemarin: hidup dan terancam", () => {
  const r = computePairStreak(["2026-11-26", "2026-11-27"], T);
  assert.deepEqual(r, { current: 2, best: 2, atRisk: true, lastDay: "2026-11-27" });
});

test("terakhir dua hari lalu: putus (current 0, best tetap)", () => {
  const r = computePairStreak(["2026-11-25", "2026-11-26"], T);
  assert.deepEqual(r, { current: 0, best: 2, atRisk: false, lastDay: "2026-11-26" });
});

test("beberapa duel di hari yang sama dihitung 1, urutan bebas", () => {
  const r = computePairStreak([T, "2026-11-27", T, "2026-11-27", T], T);
  assert.equal(r.current, 2);
  assert.equal(r.best, 2);
});

test("hari di masa depan (jam tidak cocok) diabaikan", () => {
  assert.equal(computePairStreak(["2026-11-29"], T).current, 0);
});

test("pergantian hari WIB vs UTC di sekitar 17:00 UTC", () => {
  const a = wibDay(Date.parse("2026-11-27T16:59:59Z")); // 23:59:59 WIB, 27 Nov
  const b = wibDay(Date.parse("2026-11-27T17:00:01Z")); // 00:00:01 WIB, 28 Nov
  assert.equal(a, "2026-11-27");
  assert.equal(b, "2026-11-28");
  // Two duels 2 seconds apart in UTC but on different WIB days = a 2-day streak.
  assert.equal(computePairStreak([a, b], b).current, 2);
  // 17:30 UTC on the 27th is already the 28th in WIB, so today (28th WIB) the streak is not at risk.
  assert.equal(computePairStreak([wibDay(Date.parse("2026-11-27T17:30:00Z"))], wibDay(Date.parse("2026-11-28T10:00:00Z"))).atRisk, false);
});

test("groupPairDays: hanya manusia, completed, dikelompokkan per lawan", () => {
  const at = (iso: string) => Date.parse(iso);
  const duels = [
    { status: "completed", challengerId: "me", opponentId: "ani", completedAt: at("2026-11-27T10:00:00Z") },
    { status: "completed", challengerId: "ani", opponentId: "me", completedAt: at("2026-11-28T03:00:00Z") },
    { status: "completed", challengerId: "me", opponentId: "bot_zeus", opponentIsBot: true, completedAt: at("2026-11-28T03:00:00Z") },
    { status: "completed", challengerId: "me", opponentId: "bot_x", completedAt: at("2026-11-28T03:00:00Z") },
    { status: "declined", challengerId: "me", opponentId: "budi", completedAt: at("2026-11-28T03:00:00Z") },
    { status: "completed", challengerId: "me", opponentId: "budi" }, // old duel, no completedAt
    { status: "expired", challengerId: "me", opponentId: "ani", completedAt: at("2026-11-26T03:00:00Z") },
  ];
  const g = groupPairDays(duels, "me", T);
  assert.deepEqual([...g.keys()], ["ani"]);
  assert.deepEqual(g.get("ani"), { days: ["2026-11-27", "2026-11-28"], todayDuels: 1 });
});
