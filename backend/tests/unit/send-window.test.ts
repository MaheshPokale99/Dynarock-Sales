import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_WINDOW } from "../../src/modules/automation/automation.model.js";
import { inWindow, nextSendSlot, startOfLocalDay } from "../../src/modules/automation/send-window.js";

// IST is UTC+5:30, so 09:00 IST = 03:30 UTC and 18:00 IST = 12:30 UTC.
const ist = (iso: string) => new Date(`${iso}+05:30`);

describe("nextSendSlot (Mon–Sat 9:00–18:00 IST)", () => {
    it("keeps a time that is already inside the window", () => {
        const t = ist("2026-11-19T11:15:00"); // Thursday
        assert.equal(nextSendSlot(t, DEFAULT_WINDOW).toISOString(), t.toISOString());
        assert.equal(inWindow(t, DEFAULT_WINDOW), true);
    });

    it("moves early morning to 9:00 the same day", () => {
        assert.equal(
            nextSendSlot(ist("2026-11-19T06:40:00"), DEFAULT_WINDOW).toISOString(),
            ist("2026-11-19T09:00:00").toISOString(),
        );
    });

    it("moves evening to 9:00 the next working day", () => {
        assert.equal(
            nextSendSlot(ist("2026-11-19T19:30:00"), DEFAULT_WINDOW).toISOString(),
            ist("2026-11-20T09:00:00").toISOString(),
        );
    });

    it("skips Sunday", () => {
        // Saturday evening -> Monday 9:00
        assert.equal(
            nextSendSlot(ist("2026-11-21T18:30:00"), DEFAULT_WINDOW).toISOString(),
            ist("2026-11-23T09:00:00").toISOString(),
        );
        // Sunday noon -> Monday 9:00
        assert.equal(
            nextSendSlot(ist("2026-11-22T12:00:00"), DEFAULT_WINDOW).toISOString(),
            ist("2026-11-23T09:00:00").toISOString(),
        );
    });

    it("finds the start of the local day", () => {
        assert.equal(
            startOfLocalDay(ist("2026-11-19T00:30:00"), "Asia/Kolkata").toISOString(),
            ist("2026-11-19T00:00:00").toISOString(),
        );
    });
});
