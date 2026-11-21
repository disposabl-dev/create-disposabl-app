import { writeFile } from "node:fs/promises";
import { join } from "node:path";

const [port, version] = process.argv.slice(2);
if (!/^\d+$/.test(port ?? "") || !/^1\.42\.[12]$/.test(version ?? ""))
  throw new Error("Expected an isolated debug port and fixture version");
const endpoint = `http://127.0.0.1:${port}/json`;
let page;
for (let attempt = 0; attempt < 40; attempt++) {
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(1000),
    });
    const targets = await response.json();
    page = targets.find(
      (target) => target.type === "page" && target.url.startsWith("file:"),
    );
    if (page) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 500));
}
if (!page) throw new Error("No local packaged Electron page found");
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let id = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  const task = pending.get(message.id);
  if (!task) return;
  pending.delete(message.id);
  message.error
    ? task.reject(new Error(message.error.message))
    : task.resolve(message.result);
});
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const current = ++id;
    pending.set(current, { resolve, reject });
    socket.send(JSON.stringify({ id: current, method, params }));
    setTimeout(() => {
      if (pending.delete(current)) reject(new Error(`${method} timed out`));
    }, 10000).unref();
  });
}
try {
  const { result } = await command("Runtime.evaluate", {
    expression:
      "({title: document.title, text: document.body.innerText, url: location.href})",
    returnByValue: true,
  });
  const observed = result.value;
  if (
    observed?.title !== "Disposabl" ||
    !observed?.url?.startsWith("file:") ||
    !observed.text?.includes("Welcome to Disposabl") ||
    !observed.text?.includes("Your desktop app is ready")
  )
    throw new Error(`Unexpected packaged window: ${JSON.stringify(observed)}`);
  const { data } = await command("Page.captureScreenshot", { format: "png" });
  const png = Buffer.from(data, "base64");
  if (
    png.length < 1000 ||
    !png.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    throw new Error("Invalid or empty window screenshot");
  const output = join(process.env.RUNNER_TEMP, `squirrel-window-${version}`);
  await writeFile(`${output}.png`, png);
  await writeFile(
    `${output}.json`,
    JSON.stringify({ version, observed, pageTitle: page.title }, null, 2) +
      "\n",
  );
  console.log(
    `Captured packaged ${version} window: ${observed.title}; ${png.length} PNG bytes`,
  );
} finally {
  socket.close();
}
