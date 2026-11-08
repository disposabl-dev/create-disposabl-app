import { defineApp } from "convex/server";
import mcp from "@convex-dev/mcp/convex.config";
const app = defineApp();
app.use(mcp);
export default app;
