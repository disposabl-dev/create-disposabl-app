import passwordProvider from "@convex-dev/auth/components/password/convex.config.js";
import username from "@convex-dev/auth/components/username/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import mcp from "@convex-dev/mcp/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";

const app = defineApp();

app.use(auth);

app.use(passwordProvider);
app.use(username);
app.use(staticHosting);
app.use(mcp);

export default app;
