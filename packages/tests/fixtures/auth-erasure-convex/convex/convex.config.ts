import { defineApp } from "convex/server";
import google from "../authpkg/src/components/google/convex.config.ts";
import password from "../authpkg/src/components/password/convex.config.ts";
import auth from "../authpkg/src/component/convex.config.ts";
const app = defineApp();
app.use(google, { httpPrefix: "/oauth/google", env: { CLIENT_ID: "fixture" } });
app.use(password);
app.use(auth);
export default app;
