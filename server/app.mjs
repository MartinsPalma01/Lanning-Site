import "dotenv/config";

import compression from "compression";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import express from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import helmet from "helmet";
import jwt from "jsonwebtoken";
import multer from "multer";
import nodemailer from "nodemailer";
import { Pool } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const publicDir = path.join(rootDir, "dist", "public");
const defaultConfigPath = path.join(rootDir, "dist", "default-config.json");
const localStorePath = path.join(rootDir, "work", "local-admin-store.json");

const AUTH_COOKIE = "la_admin_session";
const MAX_FILE_SIZE = 8 * 1024 * 1024;
const MAX_FILES = 6;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

let pool;
let initPromise;
let cachedDefaultConfig;
let localStorePromise;

function getAuthSecret() {
  return process.env.AUTH_SECRET || "dev-secret-change-before-production";
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    const sslRequired = process.env.PGSSL === "true" || /sslmode=require/i.test(process.env.DATABASE_URL);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslRequired ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

async function readDefaultConfig() {
  if (cachedDefaultConfig) return clone(cachedDefaultConfig);
  const raw = await fs.readFile(defaultConfigPath, "utf8");
  cachedDefaultConfig = JSON.parse(raw);
  return clone(cachedDefaultConfig);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function removeSecrets(config) {
  const publicConfig = clone(config);
  delete publicConfig.admin;
  delete publicConfig.adminPassword;
  delete publicConfig.internalBase;
  delete publicConfig.usersGuide;
  delete publicConfig.alertState;

  const people = Object.entries(publicConfig.professionals || {})
    .filter(([, person]) => person.status === "active" && person.publicVisible !== false);
  publicConfig.professionals = Object.fromEntries(people);
  Object.values(publicConfig.professionals).forEach((person) => {
    delete person.status;
    delete person.internalOnly;
    delete person.sortName;
  });
  const visibleKeys = new Set(Object.keys(publicConfig.professionals));
  const fallbackKey = visibleKeys.has("lorrayne") ? "lorrayne" : [...visibleKeys][0] || "";

  publicConfig.areas = (publicConfig.areas || []).map((area) => ({
    ...area,
    route: visibleKeys.has(area.route) ? area.route : fallbackKey,
  }));
  publicConfig.areas.forEach((area) => { delete area.status; });
  publicConfig.articles = (publicConfig.articles || [])
    .filter((article) => !["rascunho", "arquivado", "inactive"].includes(String(article.status || "publicado").toLowerCase()))
    .map((article) => {
      const cleanArticle = { ...article };
      delete cleanArticle.status;
      return cleanArticle;
    });
  publicConfig.chatbotRouting = Object.fromEntries(
    Object.entries(publicConfig.chatbotRouting || {}).map(([label, key]) => [
      label,
      visibleKeys.has(key) ? key : fallbackKey,
    ]),
  );
  return publicConfig;
}

async function ensureDatabase() {
  const db = getPool();
  if (!db) throw Object.assign(new Error("DATABASE_URL nao configurada."), { status: 503 });
  if (!initPromise) initPromise = initializeDatabase(db);
  await initPromise;
  return db;
}

async function initializeDatabase(db) {
  await db.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text UNIQUE NOT NULL,
      password_hash text NOT NULL,
      role text NOT NULL DEFAULT 'admin',
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS site_config (
      id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      data jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      data jsonb NOT NULL,
      status text NOT NULL DEFAULT 'novo',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const existingConfig = await db.query("SELECT id FROM site_config WHERE id = 1");
  if (!existingConfig.rowCount) {
    const defaultConfig = await readDefaultConfig();
    delete defaultConfig.admin;
    delete defaultConfig.adminPassword;
    await db.query("INSERT INTO site_config (id, data) VALUES (1, $1::jsonb)", [JSON.stringify(defaultConfig)]);
  }

  const existingUsers = await db.query("SELECT id FROM users LIMIT 1");
  if (!existingUsers.rowCount) {
    const email = process.env.ADMIN_EMAIL;
    const password = process.env.ADMIN_PASSWORD;
    if (!email || !password || password === "troque-esta-senha") {
      throw Object.assign(
        new Error("Configure ADMIN_EMAIL e ADMIN_PASSWORD seguros antes do primeiro login."),
        { status: 503 },
      );
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await db.query("INSERT INTO users (email, password_hash) VALUES ($1, $2)", [email.toLowerCase(), passwordHash]);
  }
}

function canUseLocalStore() {
  return !process.env.DATABASE_URL && process.env.NODE_ENV !== "production";
}

async function writeLocalStore(store) {
  await fs.mkdir(path.dirname(localStorePath), { recursive: true });
  await fs.writeFile(localStorePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function initializeLocalStore() {
  if (!canUseLocalStore()) {
    throw Object.assign(new Error("DATABASE_URL nao configurada."), { status: 503 });
  }

  try {
    const raw = await fs.readFile(localStorePath, "utf8");
    return await migrateLocalStore(JSON.parse(raw));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const defaultConfig = await readDefaultConfig();
  delete defaultConfig.admin;
  delete defaultConfig.adminPassword;

  const email = (process.env.ADMIN_EMAIL || "admin@lanningamaral.adv.br").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "Lanning@2026";
  const now = new Date().toISOString();
  const store = {
    users: [
      {
        id: "local-admin",
        email,
        password_hash: await bcrypt.hash(password, 12),
        role: "admin",
        created_at: now,
      },
    ],
    config: defaultConfig,
    leads: [],
  };
  await writeLocalStore(store);
  return store;
}

async function migrateLocalStore(store) {
  const defaults = await readDefaultConfig();
  let changed = false;
  store.config ||= clone(defaults);
  store.config.blogCategories ||= defaults.blogCategories || [];
  store.config.office ||= {};
  store.config.pageTexts ||= {};
  store.config.seo ||= {};
  store.config.footer ||= clone(defaults.footer || {});
  const oldShortText = "Escritório de advocacia em Jaciara/MT com análise cuidadosa dos documentos, orientação clara sobre os próximos passos e atendimento presencial e online.";
  const oldSubtagline = "Atendimento presencial e online em demandas previdenciárias, trabalhistas, cíveis, familiares, bancárias, rurais, empresariais, criminais e contra o Poder Público.";
  ["shortText", "subtagline"].forEach((key) => {
    if (!store.config.office[key] || store.config.office[key] === (key === "shortText" ? oldShortText : oldSubtagline)) {
      store.config.office[key] = defaults.office?.[key] || store.config.office[key];
      changed = true;
    }
  });
  ["institutional", "officeIntro", "homeDescription"].forEach((key) => {
    if (!store.config.pageTexts[key] || store.config.pageTexts[key] === oldSubtagline) {
      store.config.pageTexts[key] = defaults.pageTexts?.[key] || store.config.pageTexts[key];
      changed = true;
    }
  });
  ["homeTitle", "homeDescription", "ogTitle", "ogDescription"].forEach((key) => {
    if (!store.config.seo[key]) {
      store.config.seo[key] = defaults.seo?.[key] || store.config.seo[key];
      changed = true;
    }
  });
  for (const [key, value] of Object.entries(defaults.footer || {})) {
    if (store.config.footer[key] === undefined || store.config.footer[key] === "") {
      store.config.footer[key] = value;
      changed = true;
    }
  }
  ["lanning", "lorrayne", "andressa", "camila", "evelin", "eduarda"].forEach((key) => {
    if (store.config.professionals?.[key]) {
      if (store.config.professionals[key].showOnContact !== true) {
        store.config.professionals[key].showOnContact = true;
        changed = true;
      }
      if (store.config.professionals[key].showInFooter === true) {
        store.config.professionals[key].showInFooter = false;
        changed = true;
      }
    }
  });
  store.config.articles ||= [];
  const defaultArticles = new Map((defaults.articles || []).map((article) => [article.title, article]));
  store.config.articles = store.config.articles.map((article) => {
    const fallback = defaultArticles.get(article.title) || {};
    const next = { ...article };
    ["status", "author", "publishedAt", "updatedAt", "excerpt", "body", "featured", "views", "cover"].forEach((key) => {
      if ((next[key] === undefined || next[key] === "") && fallback[key] !== undefined) {
        next[key] = fallback[key];
        changed = true;
      }
    });
    return next;
  });
  if (changed) await writeLocalStore(store);
  return store;
}

async function ensureStorage() {
  const db = getPool();
  if (db) {
    if (!initPromise) initPromise = initializeDatabase(db);
    await initPromise;
    return { type: "database", db };
  }

  if (!localStorePromise) localStorePromise = initializeLocalStore();
  return { type: "local", store: await localStorePromise };
}

async function getStoredConfig() {
  const storage = await ensureStorage();
  if (storage.type === "local") return clone(storage.store.config);
  const db = storage.db;
  const { rows } = await db.query("SELECT data FROM site_config WHERE id = 1");
  return rows[0]?.data || {};
}

async function saveStoredConfig(config) {
  const storage = await ensureStorage();
  const cleanConfig = clone(config);
  delete cleanConfig.admin;
  delete cleanConfig.adminPassword;
  if (storage.type === "local") {
    storage.store.config = cleanConfig;
    await writeLocalStore(storage.store);
    return cleanConfig;
  }
  const db = storage.db;
  await db.query(
    "UPDATE site_config SET data = $1::jsonb, updated_at = now() WHERE id = 1",
    [JSON.stringify(cleanConfig)],
  );
  return cleanConfig;
}

function makeToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role }, getAuthSecret(), { expiresIn: "8h" });
}

function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    maxAge: 8 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearSessionCookie(res) {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
}

async function requireAdmin(req, res, next) {
  try {
    const token = req.cookies?.[AUTH_COOKIE];
    if (!token) return res.status(401).json({ error: "Login necessario." });
    const payload = jwt.verify(token, getAuthSecret());
    req.user = payload;
    return next();
  } catch (_error) {
    clearSessionCookie(res);
    return res.status(401).json({ error: "Sessao expirada. Faça login novamente." });
  }
}

function routeForArea(config, areaTitle) {
  const area = (config.areas || []).find(
    (item) => item.title === areaTitle || item.short === areaTitle || item.seoTitle === areaTitle,
  );
  return config.chatbotRouting?.[areaTitle] || area?.route || "lorrayne";
}

function serializeFiles(files = []) {
  return files.slice(0, MAX_FILES).map((file) => ({
    name: file.originalname,
    type: file.mimetype,
    size: file.size,
    encoding: "base64",
    data: file.buffer.toString("base64"),
  }));
}

function stripLeadFiles(lead) {
  return {
    ...lead,
    documentos: (lead.documentos || []).map((doc, index) => ({
      index,
      name: doc.name,
      type: doc.type,
      size: doc.size,
    })),
  };
}

function leadFromRequest(config, body, files = []) {
  const area = String(body.area || "").trim();
  const documents = serializeFiles(files);
  return {
    data: new Date().toISOString(),
    nome: String(body.nome || body.name || "").trim(),
    telefone: String(body.telefone || body.phone || "").trim(),
    email: String(body.email || "").trim(),
    cidade: String(body.cidade || body.city || "").trim(),
    area,
    resumo: String(body.resumo || body.summary || "").trim(),
    urgencia: String(body.urgencia || body.urgency || "").trim(),
    documentos: documents,
    profissionalSugerido: String(body.profissionalSugerido || routeForArea(config, area) || "").trim(),
    status: "novo",
    observacoes: "",
    origem: String(body.origem || "formulario publico").trim(),
    proximoPasso: "",
    dataRetorno: "",
  };
}

async function saveLead(lead) {
  const storage = await ensureStorage();
  if (storage.type === "local") {
    const now = new Date().toISOString();
    const saved = {
      id: randomUUID(),
      ...lead,
      status: lead.status || "novo",
      data: lead.data || now,
      criadoEm: now,
      atualizadoEm: now,
    };
    storage.store.leads.unshift(saved);
    await writeLocalStore(storage.store);
    return saved;
  }
  const db = storage.db;
  const { rows } = await db.query(
    "INSERT INTO leads (data, status) VALUES ($1::jsonb, $2) RETURNING id, data, status, created_at, updated_at",
    [JSON.stringify(lead), lead.status || "novo"],
  );
  const row = rows[0];
  return { id: row.id, ...row.data, status: row.status, data: row.data.data || row.created_at };
}

async function sendLeadEmail(lead) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  const recipients = (process.env.CONTACT_TO || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  const text = [
    "Nova solicitacao de atendimento pelo site.",
    "",
    `Nome: ${lead.nome}`,
    `WhatsApp: ${lead.telefone}`,
    `E-mail: ${lead.email || "Nao informado"}`,
    `Cidade: ${lead.cidade}`,
    `Area: ${lead.area}`,
    `Urgencia: ${lead.urgencia}`,
    `Origem: ${lead.origem}`,
    "",
    "Resumo:",
    lead.resumo,
  ].join("\n");

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.CONTACT_FROM || process.env.SMTP_USER,
    to: recipients,
    subject: "Solicitacao de atendimento - Lanning Amaral Advogados",
    text,
    attachments: (lead.documentos || []).map((doc) => ({
      filename: doc.name,
      content: Buffer.from(doc.data, "base64"),
      contentType: doc.type || "application/octet-stream",
    })),
  });
}

function publicConfigFallback() {
  return readDefaultConfig().then(removeSecrets);
}

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((req, _res, next) => {
  const netlifyPrefix = "/.netlify/functions/server";
  if (req.url.startsWith(netlifyPrefix)) {
    req.url = req.url.slice(netlifyPrefix.length) || "/";
    if (!req.url.startsWith("/api/")) req.url = `/api${req.url}`;
  }
  next();
});
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "lanning-amaral-site" });
});

app.get("/api/public-config", async (_req, res, next) => {
  try {
    let config;
    try {
      config = await getStoredConfig();
    } catch (error) {
      if (error.status !== 503) throw error;
      config = await publicConfigFallback();
      return res.json({ config, source: "build-fallback" });
    }
    res.json({ config: removeSecrets(config), source: "database" });
  } catch (error) {
    next(error);
  }
});

app.post("/api/leads", upload.array("documentos", MAX_FILES), async (req, res, next) => {
  try {
    const config = await getStoredConfig();
    const lead = leadFromRequest(config, req.body || {}, req.files || []);
    if (!lead.nome && !lead.telefone && !lead.email) {
      return res.status(400).json({ error: "Informe ao menos nome, telefone ou e-mail." });
    }
    const saved = await saveLead(lead);
    sendLeadEmail(saved).catch((error) => console.error("Falha ao enviar e-mail do lead:", error.message));
    return res.status(201).json({ ok: true, lead: stripLeadFiles(saved) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const storage = await ensureStorage();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    let user;
    if (storage.type === "local") {
      user = (storage.store.users || []).find((item) => item.email === email);
    } else {
      const { rows } = await storage.db.query("SELECT id, email, password_hash, role FROM users WHERE email = $1", [email]);
      user = rows[0];
    }
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    setSessionCookie(res, makeToken(user));
    return res.json({ ok: true, user: { email: user.email, role: user.role } });
  } catch (error) {
    next(error);
  }
});

app.post("/api/auth/logout", (_req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", requireAdmin, (req, res) => {
  res.json({ user: { email: req.user.email, role: req.user.role } });
});

app.get("/api/admin/config", requireAdmin, async (_req, res, next) => {
  try {
    const config = await getStoredConfig();
    res.json({ config });
  } catch (error) {
    next(error);
  }
});

app.put("/api/admin/config", requireAdmin, async (req, res, next) => {
  try {
    const config = await saveStoredConfig(req.body?.config || {});
    res.json({ ok: true, config });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/leads", requireAdmin, async (_req, res, next) => {
  try {
    const storage = await ensureStorage();
    if (storage.type === "local") {
      const leads = (storage.store.leads || [])
        .slice()
        .sort((a, b) => String(b.criadoEm || b.data).localeCompare(String(a.criadoEm || a.data)))
        .map(stripLeadFiles);
      return res.json({ leads });
    }
    const db = storage.db;
    const { rows } = await db.query(
      "SELECT id, data, status, created_at, updated_at FROM leads ORDER BY created_at DESC LIMIT 500",
    );
    const leads = rows.map((row) => stripLeadFiles({
      id: row.id,
      ...row.data,
      status: row.status || row.data.status || "novo",
      criadoEm: row.created_at,
      atualizadoEm: row.updated_at,
    }));
    res.json({ leads });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/leads/:id", requireAdmin, async (req, res, next) => {
  try {
    const storage = await ensureStorage();
    const status = String(req.body?.status || "novo").trim();
    const observacoes = String(req.body?.observacoes || "").trim();
    if (storage.type === "local") {
      const lead = (storage.store.leads || []).find((item) => item.id === req.params.id);
      if (!lead) return res.status(404).json({ error: "Contato nao encontrado." });
      lead.status = status;
      lead.observacoes = observacoes || lead.observacoes || "";
      lead.atualizadoEm = new Date().toISOString();
      await writeLocalStore(storage.store);
      return res.json({ ok: true });
    }
    const db = storage.db;
    const { rows } = await db.query("SELECT data FROM leads WHERE id = $1", [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Contato nao encontrado." });
    const data = { ...rows[0].data, status, observacoes: observacoes || rows[0].data.observacoes || "" };
    await db.query(
      "UPDATE leads SET data = $1::jsonb, status = $2, updated_at = now() WHERE id = $3",
      [JSON.stringify(data), status, req.params.id],
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/leads/:id/documents/:index", requireAdmin, async (req, res, next) => {
  try {
    const storage = await ensureStorage();
    let doc;
    if (storage.type === "local") {
      const lead = (storage.store.leads || []).find((item) => item.id === req.params.id);
      doc = lead?.documentos?.[Number(req.params.index)];
    } else {
      const { rows } = await storage.db.query("SELECT data FROM leads WHERE id = $1", [req.params.id]);
      if (!rows.length) return res.status(404).send("Documento nao encontrado.");
      doc = rows[0].data.documentos?.[Number(req.params.index)];
    }
    if (!doc?.data) return res.status(404).send("Documento nao encontrado.");
    res.setHeader("Content-Type", doc.type || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(doc.name || "documento")}"`);
    res.send(Buffer.from(doc.data, "base64"));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/users", requireAdmin, async (_req, res, next) => {
  try {
    const storage = await ensureStorage();
    if (storage.type === "local") {
      const users = (storage.store.users || []).map(({ password_hash, ...user }) => user);
      return res.json({ users });
    }
    const db = storage.db;
    const { rows } = await db.query("SELECT id, email, role, created_at FROM users ORDER BY created_at DESC");
    res.json({ users: rows });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/users", requireAdmin, async (req, res, next) => {
  try {
    const storage = await ensureStorage();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "assistente").trim().toLowerCase();
    const allowedRoles = new Set(["administrador", "advogado", "assistente", "editor", "admin"]);
    if (!email || !password) return res.status(400).json({ error: "Informe e-mail e senha inicial." });
    if (!allowedRoles.has(role)) return res.status(400).json({ error: "Perfil de usuário inválido." });
    if (password.length < 8) return res.status(400).json({ error: "A senha inicial deve ter pelo menos 8 caracteres." });
    const passwordHash = await bcrypt.hash(password, 12);
    if (storage.type === "local") {
      if ((storage.store.users || []).some((user) => user.email === email)) {
        return res.status(409).json({ error: "Já existe usuário com este e-mail." });
      }
      const user = {
        id: randomUUID(),
        email,
        password_hash: passwordHash,
        role: role === "administrador" ? "admin" : role,
        created_at: new Date().toISOString(),
      };
      storage.store.users.push(user);
      await writeLocalStore(storage.store);
      const { password_hash, ...safeUser } = user;
      return res.status(201).json({ user: safeUser });
    }
    const db = storage.db;
    const { rows } = await db.query(
      "INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, created_at",
      [email, passwordHash, role === "administrador" ? "admin" : role],
    );
    res.status(201).json({ user: rows[0] });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Já existe usuário com este e-mail." });
    next(error);
  }
});

app.use(express.static(publicDir, {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0,
}));

app.get("/admin", (_req, res) => res.redirect(301, "/admin/"));
app.get("/login", (_req, res) => res.redirect(301, "/login/"));
app.get(["/admin/*", "/login/*"], (req, res) => {
  const target = req.path.startsWith("/login") ? "login/index.html" : "admin/index.html";
  res.sendFile(path.join(publicDir, target));
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.status(404).sendFile(path.join(publicDir, "index.html"));
});

app.use((error, _req, res, _next) => {
  const status = error.status || error.statusCode || 500;
  const message = status >= 500 ? "Erro interno do servidor." : error.message;
  if (status >= 500) console.error(error);
  res.status(status).json({ error: message });
});

export default app;
