// Runs inside Electron against the compiled application main and preload.
const { app, BrowserWindow, shell, dialog } = require("electron");
const assert = require("node:assert/strict");
const { once, EventEmitter } = require("node:events");
const path = require("node:path");
const [build, origin, id] = process.argv.slice(2);
const cold = process.argv.includes(
  `disposabl-desktop-${id}://login?convexAuthCode=cold-ticket`,
);
app.setPath("appData", build);
app.setPath("userData", path.join(build, "user-data"));
const events = new EventEmitter();
const opened = [];
const dialogs = [];
shell.openExternal = async (url) => {
  opened.push(url);
  if (url === "https://broken.example.test/")
    throw new Error("No browser handler");
  events.emit("external", url);
};
dialog.showMessageBox = async (...args) => {
  dialogs.push(args.at(-1).message);
  events.emit("dialog");
  return { response: 0 };
};
const firstWindow = new Promise((resolve) => {
  app.once("browser-window-created", (_event, window) => {
    window.hide();
    window.webContents.on("console-message", (event) =>
      console.error("renderer:", event.message),
    );
    window.webContents.on("preload-error", (_event, path, error) =>
      console.error("preload:", path, error),
    );
    window.webContents.on("did-finish-load", () => {
      if (
        !cold ||
        new URL(window.webContents.getURL()).searchParams.get(
          "convexAuthCode",
        ) === "cold-ticket"
      )
        resolve(window);
    });
  });
});
const timeout = setTimeout(() => {
  console.error("Desktop fixture timed out");
  app.exit(1);
}, 25000);
require(path.join(build, "main.cjs"));
(async () => {
  const window = await firstWindow;
  const contents = window.webContents;
  console.log("stage: loaded", contents.getURL());
  const prefs = contents.getLastWebPreferences();
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(
    await contents.executeJavaScript("window.disposablDesktop.authentication"),
    true,
  );
  await contents.executeJavaScript(
    "localStorage.setItem('flow-fixture', 'private-initiator-state')",
  );

  console.log("stage: popup");
  let external = once(events, "external");
  assert.equal(
    await contents.executeJavaScript(
      `
    window.connection = window.open('about:blank', '_blank');
    if (window.connection) {
      window.connection.opener = null;
      window.connection.document.body.textContent = 'Opening connection setup';
      window.connection.location.replace('https://provider.example.test/authorize');
    }
    Boolean(window.connection);
  `,
      true,
    ),
    true,
  );
  assert.deepEqual(await external, ["https://provider.example.test/authorize"]);
  await new Promise(setImmediate);
  assert.equal(BrowserWindow.getAllWindows().length, 1);

  external = once(events, "external");
  await contents.executeJavaScript(
    "window.location.assign('https://billing.example.test/checkout')",
    true,
  );
  assert.deepEqual(await external, ["https://billing.example.test/checkout"]);
  assert.equal(new URL(contents.getURL()).origin, origin);

  const blocked = once(contents, "will-navigate");
  await contents.executeJavaScript(
    "window.location.assign('http://untrusted.example.test/')",
    true,
  );
  assert.equal((await blocked)[0].defaultPrevented, true);
  assert.equal(opened.length, 2);
  assert.equal(
    await contents.executeJavaScript(
      "window.open('file:///tmp/not-allowed')===null",
      true,
    ),
    true,
  );

  const failed = once(events, "dialog");
  const closed = new Promise((resolve) =>
    app.once("browser-window-created", (_event, popup) =>
      popup.once("closed", resolve),
    ),
  );
  await contents.executeJavaScript(
    "window.failed = window.open('about:blank'); window.failed.location.replace('https://broken.example.test/')",
    true,
  );
  await Promise.all([failed, closed]);
  assert.equal(BrowserWindow.getAllWindows().length, 1);
  assert.deepEqual(dialogs, ["Could not open your browser. Please try again."]);

  console.log("stage: same-origin");
  let loaded = once(contents, "did-finish-load");
  void contents
    .executeJavaScript(
      `window.location.assign(${JSON.stringify(origin + "/login?returnTo=%2Fdashboard")})`,
      true,
    )
    .catch(() => {});
  await loaded;
  console.log("stage: callback");
  loaded = once(contents, "did-finish-load");
  app.emit(
    "open-url",
    { preventDefault() {} },
    `disposabl-desktop-${id}://login?convexAuthCode=one-time-ticket`,
  );
  await loaded;
  const returned = new URL(contents.getURL());
  assert.equal(returned.origin, origin);
  assert.equal(returned.pathname, "/login");
  assert.equal(returned.searchParams.get("returnTo"), "/dashboard");
  assert.equal(returned.searchParams.get("convexAuthCode"), "one-time-ticket");
  assert.equal(
    await contents.executeJavaScript("localStorage.getItem('flow-fixture')"),
    "private-initiator-state",
  );
  const before = contents.getURL();
  app.emit(
    "open-url",
    { preventDefault() {} },
    "disposabl-desktop-other://login?convexAuthCode=wrong-app",
  );
  assert.equal(contents.getURL(), before);
  assert.equal(dialogs.length, 1);
  console.log("DESKTOP_NAVIGATION_PASSED");
  clearTimeout(timeout);
  app.exit(0);
})().catch((error) => {
  console.error(error);
  app.exit(1);
});
