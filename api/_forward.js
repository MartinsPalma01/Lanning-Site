export function forwardTo(app, targetPath) {
  return (req, res) => {
    const query = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
    req.url = `${targetPath}${query}`;
    return app(req, res);
  };
}

export function forwardLead(app) {
  return (req, res) => {
    const url = new URL(req.url, "https://local.invalid");
    const id = url.searchParams.get("id");
    if (!id) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "ID do contato nao informado." }));
      return undefined;
    }
    req.url = `/api/admin/leads/${encodeURIComponent(id)}`;
    return app(req, res);
  };
}

export function forwardLeadDocument(app) {
  return (req, res) => {
    const url = new URL(req.url, "https://local.invalid");
    const id = url.searchParams.get("id");
    const index = url.searchParams.get("index");
    if (!id || index === null) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Documento nao informado." }));
      return undefined;
    }
    req.url = `/api/admin/leads/${encodeURIComponent(id)}/documents/${encodeURIComponent(index)}`;
    return app(req, res);
  };
}
