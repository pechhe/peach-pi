import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scheduleToCron,
  cronToSchedule,
  cronLabel,
  automationScheduleLabel,
  type AutomationSchedule,
} from "../../src/lib/automations/schedule.ts";

test("scheduleToCron + cronToSchedule round-trip the known frequencies", () => {
  const cases: AutomationSchedule[] = [
    { frequency: "hourly", time: "00:15" },
    { frequency: "daily", time: "09:00" },
    { frequency: "weekly", time: "17:30", dayOfWeek: 3 },
    { frequency: "monthly", time: "08:00" },
  ];
  for (const schedule of cases) {
    const cron = scheduleToCron(schedule);
    const back = cronToSchedule(cron);
    assert.deepEqual(back, schedule.frequency === "hourly" ? { frequency: "hourly", time: "00:15" } : schedule);
  }
});

test("scheduleToCron emits valid 5-field cron", () => {
  assert.equal(scheduleToCron({ frequency: "hourly", time: "00:15" }), "15 * * * *");
  assert.equal(scheduleToCron({ frequency: "daily", time: "09:00" }), "0 9 * * *");
  assert.equal(scheduleToCron({ frequency: "weekly", time: "17:30", dayOfWeek: 3 }), "30 17 * * 3");
  assert.equal(scheduleToCron({ frequency: "monthly", time: "08:00" }), "0 8 1 * *");
});

test("cronToSchedule returns null for custom expressions", () => {
  assert.equal(cronToSchedule("*/15 * * * *"), null);
  assert.equal(cronToSchedule("0 9 * 6 1-5"), null);
  assert.equal(cronToSchedule("not a cron"), null);
});

test("cronLabel falls back to the raw cron when unrecognised", () => {
  assert.equal(cronLabel("0 9 * * *"), "Daily at 9:00");
  assert.equal(cronLabel("30 17 * * 3"), "Wednesdays at 17:30");
  assert.equal(cronLabel("*/15 * * * *"), "*/15 * * * *");
});

test("automationScheduleLabel reads naturally", () => {
  assert.equal(automationScheduleLabel({ frequency: "hourly", time: "00:05" }), "Hourly at :05");
  assert.equal(automationScheduleLabel({ frequency: "monthly", time: "08:00" }), "Monthly on the 1st at 8:00");
});
