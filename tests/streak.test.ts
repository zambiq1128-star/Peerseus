import test from "node:test";
import assert from "node:assert/strict";
import { applyActivity, displayCurrent, lastSevenDays, shieldAvailable, streakMessage, weekOf, wibDay, type Streak } from "../src/lib/streak.ts";

// 2026-11-23 is a Monday. Week: 23 (Mon) ... 29 (Sun).
const s = (p: Partial<Streak> & { lastDay: string }): Streak => ({ current: 3, best: 3, ...p });

test("hari WIB: batas tengah malam", () => {
  assert.equal(wibDay(Date.parse("2026-11-24T16:59:59Z")), "2026-11-24"); // 23:59:59 WIB
  assert.equal(wibDay(Date.parse("2026-11-24T17:00:00Z")), "2026-11-25"); // 00:00:00 WIB
  assert.equal(wibDay(Date.parse("2026-12-31T17:00:00Z")), "2027-01-01");
});

test("minggu dimulai Senin", () => {
  assert.equal(weekOf("2026-11-23"), "2026-11-23");
  assert.equal(weekOf("2026-11-29"), "2026-11-23"); // Minggu
  assert.equal(weekOf("2026-11-30"), "2026-11-30");
  assert.equal(weekOf("2027-01-01"), "2026-12-28");
});

test("aktivitas pertama", () => {
  const r = applyActivity(null, "2026-11-25");
  assert.equal(r.kind, "start");
  assert.deepEqual(r.streak, { current: 1, best: 1, lastDay: "2026-11-25", recentDays: ["2026-11-25"] });
});

test("hari yang sama: tidak berubah", () => {
  const prev = s({ lastDay: "2026-11-25", recentDays: ["2026-11-25"] });
  const r = applyActivity(prev, "2026-11-25");
  assert.equal(r.kind, "same");
  assert.deepEqual(r.streak, prev);
  assert.equal(streakMessage(r.kind, 3), null);
});

test("hari berikutnya: +1 dan best ikut naik", () => {
  const r = applyActivity(s({ lastDay: "2026-11-25", current: 3, best: 3 }), "2026-11-26");
  assert.equal(r.kind, "extended");
  assert.equal(r.streak.current, 4);
  assert.equal(r.streak.best, 4);
  const lower = applyActivity(s({ lastDay: "2026-11-25", current: 3, best: 9 }), "2026-11-26");
  assert.equal(lower.streak.best, 9);
});

test("bolong 1 hari dengan perisai tersedia: perisai terpakai", () => {
  const r = applyActivity(s({ lastDay: "2026-11-24", recentDays: ["2026-11-24"] }), "2026-11-26"); // Selasa -> Kamis
  assert.equal(r.kind, "shield");
  assert.equal(r.streak.current, 4);
  assert.equal(r.streak.shieldWeek, "2026-11-23");
  assert.deepEqual(r.streak.shieldDays, ["2026-11-25"]);
  assert.deepEqual(r.streak.recentDays, ["2026-11-24", "2026-11-26"]);
  assert.match(streakMessage(r.kind, 4)!, /Perisai terpakai, streak 4 hari/);
});

test("bolong 1 hari, perisai minggu ini sudah terpakai: reset ke 1", () => {
  const r = applyActivity(s({ lastDay: "2026-11-26", shieldWeek: "2026-11-23", best: 7 }), "2026-11-28");
  assert.equal(r.kind, "start");
  assert.equal(r.streak.current, 1);
  assert.equal(r.streak.best, 7);
});

test("bolong 2 hari atau lebih: reset ke 1, perisai tidak dipakai", () => {
  const r = applyActivity(s({ lastDay: "2026-11-24" }), "2026-11-27");
  assert.equal(r.kind, "start");
  assert.equal(r.streak.current, 1);
  assert.equal(r.streak.shieldWeek, undefined);
});

test("pergantian minggu: perisai tersedia lagi", () => {
  const used = s({ lastDay: "2026-11-28", shieldWeek: "2026-11-23" });
  assert.equal(shieldAvailable(used, "2026-11-29"), false);
  assert.equal(shieldAvailable(used, "2026-11-30"), true);
  // Sabtu (aktif) -> Minggu bolong -> Senin aktif: bolong 1 hari, perisai minggu baru dipakai.
  const r = applyActivity(used, "2026-11-30");
  assert.equal(r.kind, "shield");
  assert.equal(r.streak.shieldWeek, "2026-11-30");
  assert.equal(r.streak.current, 4);
});

test("aktivitas di hari lebih lama dari lastDay diabaikan", () => {
  const prev = s({ lastDay: "2026-11-26" });
  assert.equal(applyActivity(prev, "2026-11-25").kind, "same");
});

test("batas tengah malam WIB: dua aktivitas berdekatan", () => {
  const first = applyActivity(null, wibDay(Date.parse("2026-11-24T16:59:59Z")));
  const second = applyActivity(first.streak, wibDay(Date.parse("2026-11-24T17:00:01Z")));
  assert.equal(second.kind, "extended");
  assert.equal(second.streak.current, 2);
});

test("tampilan jujur: 0 kalau sudah tak terselamatkan", () => {
  const base = s({ lastDay: "2026-11-24", current: 5 });
  assert.equal(displayCurrent(base, "2026-11-24"), 5); // hari ini sudah tercatat
  assert.equal(displayCurrent(base, "2026-11-25"), 5); // masih bisa dijaga hari ini
  assert.equal(displayCurrent(base, "2026-11-26"), 5); // bolong 1 hari, perisai bisa menyelamatkan
  assert.equal(displayCurrent({ ...base, shieldWeek: "2026-11-23" }, "2026-11-26"), 0); // perisai sudah terpakai
  assert.equal(displayCurrent(base, "2026-11-27"), 0); // bolong 2 hari
  assert.equal(displayCurrent(null, "2026-11-27"), 0);
  assert.equal(displayCurrent(s({ lastDay: "2026-11-29", current: 4 }), "2026-12-01"), 4); // minggu baru, perisai kembali
});

test("7 titik terakhir", () => {
  let st = applyActivity(null, "2026-11-22").streak;
  st = applyActivity(st, "2026-11-23").streak;
  st = applyActivity(st, "2026-11-25").streak; // perisai menutup 24
  const dots = lastSevenDays(st, "2026-11-26");
  assert.deepEqual(dots.map((d) => d.state), ["empty", "empty", "done", "done", "shield", "done", "empty"]);
  assert.equal(dots[6].today, true);
  assert.equal(dots[6].day, "2026-11-26");
});

test("recentDays maksimal 7 entri", () => {
  let st: Streak | undefined;
  for (let i = 0; i < 12; i++) st = applyActivity(st, `2026-11-${String(10 + i).padStart(2, "0")}`).streak;
  assert.equal(st!.current, 12);
  assert.equal(st!.recentDays!.length, 7);
  assert.equal(st!.recentDays![0], "2026-11-15");
});
