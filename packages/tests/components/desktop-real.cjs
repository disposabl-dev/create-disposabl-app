// Runs the compiled desktop main in a dedicated Electron profile.
const { app } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const [build, profile, evidence, phase] = process.argv.slice(2);
app.setPath("appData", profile);
const timeout = setTimeout(() => {
  console.error("Desktop verification timed out");
  app.exit(1);
}, 45000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
app.once("browser-window-created", (_event, window) => {
  window.webContents.once("did-finish-load", async () => {
    const wc = window.webContents;
    const js = (code) => wc.executeJavaScript(code, true);
    const wait = async (code) => {
      for (let i = 0; i < 100; i++) {
        if (await js(code).catch(() => false)) return;
        await sleep(200);
      }
      throw new Error(
        `Timed out: ${code}; URL=${wc.getURL()}; text=${await js("document.body.innerText")}`,
      );
    };
    const capture = async (name) =>
      fs.writeFileSync(
        path.join(evidence, name + ".png"),
        (await wc.capturePage()).toPNG(),
      );
    try {
      await window.loadURL("http://127.0.0.1:3510/dashboard");
      if (phase === "login") {
        await wait(
          "!!document.querySelector('input[name=username]') || !!document.querySelector('input[autocomplete=username]')",
        );
        await capture("login");
        await js(
          `(() => { const inputs = [...document.querySelectorAll('input')]; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; for (const [el, value] of [[inputs.find(x => x.type !== 'password'), ${JSON.stringify(process.env.DESKTOP_TEST_USER)}], [inputs.find(x => x.type === 'password'), ${JSON.stringify(process.env.DESKTOP_TEST_PASSWORD)}]]) { set.call(el, value); el.dispatchEvent(new Event('input', {bubbles:true})); } [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Log in').click(); })()`,
        );
      }
      await wait("document.body.innerText.includes('Logout')");
      assert.equal(new URL(wc.getURL()).pathname, "/dashboard");
      console.log(
        "AUTHENTICATED",
        phase,
        (await js("document.body.innerText")).slice(0, 2500),
      );
      await capture(phase === "login" ? "signed-in" : "restored");
      if (phase === "restore") {
        assert.ok(
          await js(
            "[...document.querySelectorAll('a')].some(a => a.textContent.trim() === 'Docs')",
          ),
        );
        await js(
          "[...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Change password').click()",
        );
        await wait(
          "location.pathname === '/change-password' && document.body.innerText.includes('Current password')",
        );
        await capture("change-password");
        await js(
          "[...document.querySelectorAll('a')].find(a => a.textContent.trim() === 'Dashboard').click()",
        );
        await wait(
          "location.pathname === '/dashboard' && document.body.innerText.includes('Connect your accounts')",
        );
        await js(
          "[...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Logout').click()",
        );
        await wait(
          "document.body.innerText.includes('Log in') || document.body.innerText.includes('Login')",
        );
        await window.loadURL("http://127.0.0.1:3510/dashboard");
        await wait(
          "location.pathname === '/login' && document.body.innerText.includes('Log in')",
        );
        await capture("logged-out");
        console.log("LOGOUT_PROTECTED_ROUTE_OK");
      }
      clearTimeout(timeout);
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  });
});
require(path.join(build, "main.cjs"));
