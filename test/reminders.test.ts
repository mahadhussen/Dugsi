import { test } from "node:test";
import assert from "node:assert/strict";
import { msUntilNext, reminderIcs } from "../lib/reminders";

test("next reminder is later today when the time has not passed", () => {
  const now = new Date(2026, 5, 10, 9, 0, 0); // Wednesday
  const ms = msUntilNext("20:00", [], now);
  assert.equal(ms, 11 * 3_600_000);
});

test("next reminder rolls to tomorrow when the time has passed", () => {
  const now = new Date(2026, 5, 10, 21, 0, 0);
  const ms = msUntilNext("20:00", [], now);
  assert.equal(ms, 23 * 3_600_000);
});

test("weekday filter skips days that are not allowed", () => {
  const now = new Date(2026, 5, 10, 9, 0, 0); // Wednesday (3)
  const ms = msUntilNext("20:00", [5], now); // Fridays only
  assert.equal(ms, (2 * 24 + 11) * 3_600_000);
});

test("ics has a daily rule, an alarm and the app url", () => {
  const ics = reminderIcs({ reminderTime: "07:30", reminderDays: [] }, new Date(2026, 0, 1, 8), "https://x.test/");
  assert.match(ics, /RRULE:FREQ=DAILY/);
  assert.match(ics, /DTSTART:20260102T073000/); // 07:30 has passed → tomorrow
  assert.match(ics, /BEGIN:VALARM/);
  assert.match(ics, /https:\/\/x\.test\//);
});

test("ics uses BYDAY when specific days are chosen", () => {
  const ics = reminderIcs({ reminderTime: "20:00", reminderDays: [1, 3] }, new Date(2026, 0, 1, 8), "u");
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO,WE/);
});
