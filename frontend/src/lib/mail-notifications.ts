const ENABLED_KEY = "dynarock.mailNotifications.enabled";
const CHANGE_EVENT = "dynarock-mail-notifications-change";

declare global {
    interface Window {
        dynarockDesktop?: {
            notify(input: { title: string; body: string; url: string }): Promise<boolean>;
        };
    }
}

let audio: AudioContext | null = null;

export function mailNotificationsEnabled(): boolean {
    return typeof window !== "undefined" && window.localStorage.getItem(ENABLED_KEY) === "true";
}

export function subscribeMailNotifications(listener: () => void): () => void {
    if (typeof window === "undefined") return () => undefined;
    window.addEventListener(CHANGE_EVENT, listener);
    return () => window.removeEventListener(CHANGE_EVENT, listener);
}

function audioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    const Context = window.AudioContext;
    if (!Context) return null;
    audio ??= new Context();
    return audio;
}

export async function enableMailNotifications(): Promise<NotificationPermission | "desktop"> {
    if (typeof window === "undefined") return "default";
    const permission = window.dynarockDesktop
        ? Promise.resolve<NotificationPermission | "desktop">("desktop")
        : !("Notification" in window)
          ? Promise.resolve<NotificationPermission | "desktop">("denied")
          : Notification.permission === "default"
            ? Notification.requestPermission()
            : Promise.resolve<NotificationPermission | "desktop">(Notification.permission);
    window.localStorage.setItem(ENABLED_KEY, "true");
    window.dispatchEvent(new Event(CHANGE_EVENT));
    const context = audioContext();
    if (context?.state === "suspended") await context.resume().catch(() => undefined);
    return permission;
}

export async function resumeMailAudio(): Promise<void> {
    const context = audioContext();
    if (context?.state === "suspended") await context.resume().catch(() => undefined);
}

export function disableMailNotifications(): void {
    if (typeof window !== "undefined") {
        window.localStorage.removeItem(ENABLED_KEY);
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }
}

export function playMailSound(): void {
    const context = audioContext();
    if (!context) return;
    if (context.state === "suspended") {
        void context
            .resume()
            .then(() => playMailSound())
            .catch(() => undefined);
        return;
    }
    if (context.state !== "running") return;

    const oscillator = context.createOscillator();
    const volume = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, now);
    volume.gain.setValueAtTime(0.0001, now);
    volume.gain.exponentialRampToValueAtTime(0.12, now + 0.015);
    volume.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    oscillator.connect(volume);
    volume.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.23);
}

export function sendMailNotification(input: { title: string; body: string; threadId: string }): void {
    if (!mailNotificationsEnabled()) return;
    const url = `/inbox?t=${encodeURIComponent(input.threadId)}&f=all`;
    const desktop = window.dynarockDesktop;
    if (desktop) {
        // Electron's native notification plays the operating system's alert sound.
        void desktop.notify({ title: input.title, body: input.body, url }).catch(() => undefined);
        return;
    }
    playMailSound();
    if ("Notification" in window && Notification.permission === "granted") {
        const notification = new Notification(input.title, { body: input.body, silent: true });
        notification.onclick = () => {
            window.focus();
            window.history.pushState({}, "", url);
            window.dispatchEvent(new PopStateEvent("popstate"));
        };
    }
}
