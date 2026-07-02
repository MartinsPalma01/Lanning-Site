import app from "../server/app.mjs";
import { forwardTo } from "./_forward.js";

export default forwardTo(app, "/api/auth/login");
