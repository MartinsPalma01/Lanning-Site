import app from "../server/app.mjs";
import { forwardLead, forwardTo } from "./_forward.js";

export default (req, res) => {
  if (req.url.includes("id=")) return forwardLead(app)(req, res);
  return forwardTo(app, "/api/admin/leads")(req, res);
};
