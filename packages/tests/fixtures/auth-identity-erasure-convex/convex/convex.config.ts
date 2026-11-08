import { defineApp } from "convex/server";
import username from "../authpkg/src/components/username/convex.config.ts";
import email from "../authpkg/src/components/email/convex.config.ts";
const app = defineApp();
app.use(username);
app.use(email);
export default app;
