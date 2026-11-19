import { MS_PER_DAY } from "../../common/constants.js";
import type { SendWindow } from "./automation.model.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface LocalParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    weekday: number;
}

export function localParts(at: Date, timezone: string): LocalParts {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-US", {
            timeZone: timezone,
            year: "numeric",
            month: "numeric",
            day: "numeric",
            hour: "numeric",
            minute: "numeric",
            weekday: "short",
            hourCycle: "h23",
        })
            .formatToParts(at)
            .map((p) => [p.type, p.value]),
    );
    return {
        year: Number(parts.year),
        month: Number(parts.month),
        day: Number(parts.day),
        hour: Number(parts.hour),
        minute: Number(parts.minute),
        weekday: WEEKDAYS.indexOf(parts.weekday ?? "Sun"),
    };
}

// The instant of hh:00 on the same local calendar day as `at`.
function atLocalHour(at: Date, hour: number, timezone: string): Date {
    const p = localParts(at, timezone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    const offset = asUtc - Math.floor(at.getTime() / 60_000) * 60_000;
    return new Date(Date.UTC(p.year, p.month - 1, p.day, hour, 0) - offset);
}

export const startOfLocalDay = (at: Date, timezone: string) => atLocalHour(at, 0, timezone);

// First moment at or after `from` that falls inside the send window.
export function nextSendSlot(from: Date, window: SendWindow): Date {
    let t = from;
    for (let i = 0; i < 15; i++) {
        const p = localParts(t, window.timezone);
        if (window.days.includes(p.weekday)) {
            if (p.hour < window.startHour) return atLocalHour(t, window.startHour, window.timezone);
            if (p.hour < window.endHour) return t;
        }
        t = atLocalHour(
            new Date(atLocalHour(t, 12, window.timezone).getTime() + MS_PER_DAY),
            window.startHour,
            window.timezone,
        );
        const q = localParts(t, window.timezone);
        if (window.days.includes(q.weekday)) return t;
    }
    return t;
}

export const inWindow = (at: Date, window: SendWindow) => nextSendSlot(at, window).getTime() === at.getTime();
