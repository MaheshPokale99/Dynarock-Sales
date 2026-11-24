/* eslint @typescript-eslint/no-require-imports: "off" */
const { app, BrowserWindow, ipcMain, Menu, nativeImage, Notification, shell, Tray } = require("electron");

const defaultAppUrl = app.isPackaged ? "https://sales.dynarock.in" : "http://localhost:3000";
const appUrl = new URL(process.env.DYNAROCK_APP_URL || defaultAppUrl);
if (!["http:", "https:"].includes(appUrl.protocol)) throw new Error("DYNAROCK_APP_URL must use HTTP or HTTPS");

let windowRef;
let trayRef;
let trayIcon;
let isQuitting = false;

function trustedFrame(frame) {
    try {
        return new URL(frame.url).origin === appUrl.origin;
    } catch {
        return false;
    }
}

function openExternal(url) {
    try {
        const target = new URL(url);
        if (target.protocol === "https:" || target.protocol === "http:") void shell.openExternal(target.href);
    } catch {
        // Ignore malformed or non-web URLs.
    }
}

function showWindow() {
    if (!windowRef) createWindow();
    if (windowRef.isMinimized()) windowRef.restore();
    windowRef.show();
    windowRef.focus();
}

function createTray() {
    trayIcon = nativeImage.createFromPath(require("node:path").join(__dirname, "assets", "tray.png"));
    trayRef = new Tray(trayIcon);
    trayRef.setToolTip("Dynarock Sales — mail notifications are active");
    trayRef.setContextMenu(Menu.buildFromTemplate([
        { label: "Open Dynarock Sales", click: showWindow },
        { type: "separator" },
        { label: "Quit", click: () => app.quit() },
    ]));
    trayRef.on("click", showWindow);
    trayRef.on("double-click", showWindow);
}

function createWindow() {
    windowRef = new BrowserWindow({
        width: 1440,
        height: 960,
        minWidth: 920,
        minHeight: 640,
        backgroundColor: "#f8fafc",
        title: "Dynarock Sales",
        autoHideMenuBar: true,
        webPreferences: {
            preload: require("node:path").join(__dirname, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
        },
    });

    windowRef.webContents.setWindowOpenHandler(({ url }) => {
        openExternal(url);
        return { action: "deny" };
    });
    windowRef.webContents.on("will-navigate", (event, url) => {
        if (!trustedFrame({ url })) {
            event.preventDefault();
            openExternal(url);
        }
    });
    windowRef.on("closed", () => {
        windowRef = undefined;
    });
    windowRef.on("close", (event) => {
        if (!isQuitting && trayRef) {
            event.preventDefault();
            windowRef.hide();
        }
    });
    void windowRef.loadURL(appUrl.href);
}

ipcMain.handle("dynarock:notify", (event, value) => {
    if (!trustedFrame(event.senderFrame) || !Notification.isSupported()) return false;
    const title = typeof value?.title === "string" ? value.title.slice(0, 120) : "Dynarock Sales";
    const body = typeof value?.body === "string" ? value.body.slice(0, 300) : "You have new mail.";
    let targetPath = "/inbox";
    try {
        const target = new URL(typeof value?.url === "string" ? value.url : "/inbox", appUrl);
        if (target.origin === appUrl.origin) targetPath = `${target.pathname}${target.search}${target.hash}`;
    } catch {
        // Keep the default Inbox target.
    }

    const notification = new Notification({ title, body, icon: trayIcon, silent: false });
    notification.on("click", () => {
        if (!windowRef) createWindow();
        windowRef.show();
        windowRef.focus();
        void windowRef.loadURL(new URL(targetPath, appUrl).href);
    });
    notification.show();
    return true;
});

app.whenReady().then(() => {
    if (process.platform === "win32") app.setAppUserModelId("in.dynarock.sales");
    // The Windows app uses the tray menu; Electron's default File/Edit/View menu is not needed.
    Menu.setApplicationMenu(null);
    createTray();
    createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Keep the Electron process and tray alive after the last window is hidden/closed.
app.on("window-all-closed", () => {});
app.on("before-quit", () => {
    isQuitting = true;
});
