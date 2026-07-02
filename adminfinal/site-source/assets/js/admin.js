(function () {
  const configKey = "laSiteConfigV2";
  const contactsKey = "laContactsV2";
  const defaultConfig = window.LA_ADMIN_CONFIG || window.LA_SITE_CONFIG || {};
  let config = JSON.parse(localStorage.getItem(configKey) || "null") || defaultConfig;
  let selectedProfessional = Object.keys(config.professionals || {})[0] || "";
  const login = document.querySelector("[data-admin-login]");
  const panel = document.querySelector("[data-admin-panel]");
  const status = document.querySelector("[data-admin-status]");
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function getPath(object, path) { return path.split(".").reduce((current, key) => current?.[key], object); }
  function setPath(object, path, value) { const keys = path.split("."); const last = keys.pop(); const target = keys.reduce((current, key) => { current[key] ??= {}; return current[key]; }, object); target[last] = value; }
  function contacts() { try { return JSON.parse(localStorage.getItem(contactsKey)) || []; } catch (_e) { return []; } }
  function saveContacts(rows) { localStorage.setItem(contactsKey, JSON.stringify(rows)); }
  function persist() { localStorage.setItem(configKey, JSON.stringify(config)); fillAll(); }
  function professionals() { return Object.entries(config.professionals || {}).map(([key, p]) => ({ key, ...p })).sort((a, b) => (a.order || 99) - (b.order || 99)); }
  function fillAll() {
    document.querySelectorAll("[data-config-path]").forEach((field) => field.value = getPath(config, field.dataset.configPath) || "");
    document.querySelectorAll("[data-json-field]").forEach((field) => { const key = field.dataset.jsonField; field.value = JSON.stringify(key === "full" ? config : config[key], null, 2); });
    renderKpis(); renderProfessionalList(); renderProfessionalForm(); renderContacts();
  }
  function renderKpis() {
    const box = document.querySelector("[data-admin-kpis]"); if (!box) return;
    const rows = contacts(); const active = professionals().filter((p) => p.status === "active").length;
    box.innerHTML = `<div class="admin-kpi"><span>Contatos</span><strong>${rows.length}</strong></div><div class="admin-kpi"><span>Novos</span><strong>${rows.filter((r) => (r.status || "novo") === "novo").length}</strong></div><div class="admin-kpi"><span>Equipe ativa</span><strong>${active}</strong></div><div class="admin-kpi"><span>Áreas</span><strong>${(config.areas || []).length}</strong></div>`;
  }
  function renderProfessionalList() {
    const box = document.querySelector("[data-professional-list]"); if (!box) return;
    box.innerHTML = professionals().map((p) => `<button type="button" data-select-professional="${p.key}">${p.displayName || p.name}<br><small>${p.role || ""} · ${p.status || ""}</small></button>`).join("") + `<button type="button" data-new-professional>Novo profissional</button>`;
  }
  function renderProfessionalForm() {
    const form = document.querySelector("[data-professional-form]"); if (!form) return;
    const person = config.professionals[selectedProfessional] || { name: "", displayName: "", role: "", oab: "", email: "", phone: "", whatsapp: "", whatsappLink: "", areas: [], bio: "", resume: "", status: "pending", publicVisible: false, order: 99, photo: "" };
    form.innerHTML = `<div class="form-grid">
      <label>Nome completo <input name="name" value="${person.name || ""}"></label><label>Nome de exibição <input name="displayName" value="${person.displayName || ""}"></label>
      <label>Cargo <input name="role" value="${person.role || ""}"></label><label>OAB/UF <input name="oab" value="${person.oab || ""}"></label>
      <label>Foto <input name="photo" value="${person.photo || ""}"></label><label>E-mail <input name="email" value="${person.email || ""}"></label>
      <label>Telefone <input name="phone" value="${person.phone || ""}"></label><label>WhatsApp <input name="whatsapp" value="${person.whatsapp || ""}"></label>
      <label>Link direto do WhatsApp <input name="whatsappLink" value="${person.whatsappLink || ""}"></label><label>Ordem de exibição <input name="order" type="number" value="${person.order || 99}"></label>
      <label>Status <select name="status"><option value="active">ativo</option><option value="pending">pendente</option><option value="inactive">inativo</option></select></label><label>Exibição pública <select name="publicVisible"><option value="true">sim</option><option value="false">não</option></select></label>
    </div><label>Áreas principais <textarea name="areas" rows="4">${(person.areas || []).join("\n")}</textarea></label><label>Mini biografia <textarea name="bio" rows="4">${person.bio || ""}</textarea></label><label>Currículo resumido <textarea name="resume" rows="4">${person.resume || ""}</textarea></label><div class="button-row"><button class="button button-accent" type="submit">Salvar</button><a class="button button-ghost-dark" href="equipe.html" target="_blank">Visualizar como cliente</a></div>`;
    form.status.value = person.status || "pending"; form.publicVisible.value = String(person.publicVisible !== false);
  }
  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null; if (!target) return;
    if (target.matches("[data-admin-tab]")) { document.querySelectorAll("[data-admin-tab]").forEach((b) => b.classList.remove("is-active")); document.querySelectorAll("[data-admin-view]").forEach((v) => v.classList.remove("is-active")); target.classList.add("is-active"); document.querySelector(`[data-admin-view="${target.dataset.adminTab}"]`)?.classList.add("is-active"); }
    if (target.matches("[data-select-professional]")) { selectedProfessional = target.dataset.selectProfessional; renderProfessionalForm(); }
    if (target.matches("[data-new-professional]")) { selectedProfessional = `profissional_${Date.now()}`; config.professionals[selectedProfessional] = { name: "Novo profissional", displayName: "Novo profissional", role: "", oab: "", email: "", phone: "", whatsapp: "", whatsappLink: "", areas: [], bio: "", resume: "", status: "pending", publicVisible: false, order: 99, photo: "" }; persist(); }
    if (target.matches("[data-save-basic]")) { document.querySelectorAll("[data-config-path]").forEach((field) => setPath(config, field.dataset.configPath, field.value)); persist(); alert("Dados salvos."); }
    if (target.matches("[data-save-json]")) { const key = target.dataset.saveJson; const field = document.querySelector(`[data-json-field="${key}"]`); try { config[key] = JSON.parse(field.value); persist(); alert("Conteúdo salvo."); } catch (error) { alert(`JSON inválido: ${error.message}`); } }
    if (target.matches("[data-export-contacts]")) exportCsv();
    if (target.matches("[data-clear-contacts]")) { if (confirm("Limpar contatos deste navegador?")) { localStorage.removeItem(contactsKey); renderContacts(); renderKpis(); } }
    if (target.matches("[data-lead-status]")) { const rows = contacts(); const lead = rows.find((r) => r.id === target.dataset.leadId); if (lead) { lead.status = target.dataset.leadStatus; saveContacts(rows); renderContacts(); renderKpis(); } }
  });
  document.querySelector("[data-admin-enter]")?.addEventListener("click", () => {
    const email = document.querySelector("[data-admin-email]")?.value; const password = document.querySelector("[data-admin-password]")?.value;
    if (email === (config.admin?.email || "admin@lanningamaral.local") && password === (config.admin?.password || config.adminPassword)) { login.hidden = true; panel.hidden = false; fillAll(); } else if (status) status.textContent = "E-mail ou senha incorretos.";
  });
  document.querySelector("[data-professional-form]")?.addEventListener("submit", (event) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const person = {};
    ["name","displayName","role","oab","photo","email","phone","whatsapp","whatsappLink","bio","resume","status"].forEach((key) => person[key] = data.get(key));
    person.areas = String(data.get("areas") || "").split(/\n|,/).map((item) => item.trim()).filter(Boolean); person.order = Number(data.get("order") || 99); person.publicVisible = data.get("publicVisible") === "true";
    config.professionals[selectedProfessional] = person; persist(); alert("Profissional salvo.");
  });
  function renderContacts() {
    const box = document.querySelector("[data-contacts-table]"); if (!box) return; const rows = contacts();
    if (!rows.length) { box.innerHTML = "<p>Nenhum contato recebido neste navegador.</p>"; return; }
    const statuses = ["novo", "em análise", "aguardando documentos", "atendido", "contratado", "arquivado"];
    box.innerHTML = `<table><thead><tr><th>Data</th><th>Nome</th><th>Contato</th><th>Área</th><th>Urgência</th><th>Profissional</th><th>Status</th><th>Documentos</th><th>Ações</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${new Date(row.data).toLocaleString("pt-BR")}</td><td>${row.nome || ""}<br><small>${row.cidade || ""}</small></td><td>${row.telefone || ""}<br>${row.email || ""}</td><td>${row.area || ""}</td><td>${row.urgencia || ""}</td><td>${row.profissionalSugerido || row.responsavel || ""}</td><td>${row.status || "novo"}</td><td>${(row.documentos || []).map((doc) => doc.dataUrl ? `<a href="${doc.dataUrl}" download="${doc.name}">${doc.name}</a>` : doc.name).join("<br>")}</td><td><div class="lead-actions"><a href="https://wa.me/${String(row.telefone || "").replace(/\D/g, "")}" target="_blank">WhatsApp</a>${statuses.map((s) => `<button type="button" data-lead-id="${row.id}" data-lead-status="${s}">${s}</button>`).join("")}</div></td></tr>`).join("")}</tbody></table>`;
  }
  function exportCsv() { const rows = contacts(); const headers = ["data","nome","telefone","email","cidade","area","resumo","urgencia","profissionalSugerido","status","observacoes","origem","proximoPasso","dataRetorno"]; const csv = [headers.join(",")].concat(rows.map((row) => headers.map((key) => `"${String(row[key] || "").replace(/"/g, '""')}"`).join(","))).join("\n"); const blob = new Blob([csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "contatos-lanning-amaral.csv"; a.click(); URL.revokeObjectURL(url); }
})();
