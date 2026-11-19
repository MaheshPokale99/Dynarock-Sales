const pad = (n: number) => String(n).padStart(2, "0");

// ISO -> value for <input type="datetime-local"> (in the browser's time zone).
export function toLocalInput(iso: string | Date): string {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const fromLocalInput = (value: string) => new Date(value).toISOString();

// Next weekday (Mon–Sat) at the given hour, at least an hour from now.
export function nextWorkingSlot(hour: number, skipToMonday = false): Date {
    const d = new Date();
    d.setHours(hour, 0, 0, 0);
    if (skipToMonday) {
        d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
        return d;
    }
    if (d.getTime() < Date.now() + 3_600_000) d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    return d;
}

export const whenLabel = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
    if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${time}`;
    return d.toLocaleString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
    });
};
