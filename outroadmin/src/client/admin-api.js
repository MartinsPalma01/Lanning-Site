(function () {
  let config = {};
  let leads = [];
  let users = [];
  let selectedProfessional = "";
  let selectedArea = "";
  let selectedFaq = 0;
  let selectedArticle = 0;
  let draggedProfessionalKey = "";
  let alertFilter = "novos";

  const login = document.querySelector("[data-admin-login]");
  const panel = document.querySelector("[data-admin-panel]");
  const status = document.querySelector("[data-admin-status]");

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slugify(value) {
    return String(value || "item")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `item-${Date.now()}`;
  }

  function cleanNumber(number) {
    return String(number || "").replace(/\D/g, "");
  }

  function whatsappLink(number) {
    const digits = cleanNumber(number);
    return digits ? `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}` : "";
  }

  function statusLabel(value) {
    return ({ active: "ativo", pending: "pendente", inactive: "inativo", rascunho: "rascunho", publicado: "publicado", arquivado: "arquivado", admin: "administrador" })[value] || value || "";
  }

  const roleOptions = ["Advogado", "Advogada", "Assistente Jurídica", "Recepção", "Administrativo", "Estagiário", "Outro"];
  const treatmentOptions = [
    { value: "auto", label: "Automático" },
    { value: "dr", label: "Dr." },
    { value: "dra", label: "Dra." },
    { value: "none", label: "Sem tratamento" },
    { value: "custom", label: "Personalizado" },
  ];

  function stripTreatment(value) {
    return String(value || "")
      .replace(/^\s*(dr\.?|dra\.?|doutor|doutora)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function sortName(value) {
    return stripTreatment(value)
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function roleToMemberType(role) {
    const normalized = sortName(role);
    if (normalized === "advogado") return "advogado";
    if (normalized === "advogada") return "advogada";
    if (normalized === "assistente juridica") return "assistente jurídica";
    if (normalized === "recepcao") return "recepção";
    if (normalized === "administrativo") return "administrativo";
    if (normalized === "estagiario") return "estagiário";
    return "outro";
  }

  function inferTreatment(person = {}) {
    if (person.treatment) return person.treatment;
    const visible = String(person.displayName || person.name || "");
    if (/^\s*dr\.?\s/i.test(visible)) return "dr";
    if (/^\s*dra\.?\s/i.test(visible)) return "dra";
    return "auto";
  }

  function treatmentPrefix(person = {}) {
    const treatment = inferTreatment(person);
    if (treatment === "dr") return "Dr.";
    if (treatment === "dra") return "Dra.";
    if (treatment === "none") return "";
    if (treatment === "custom") return String(person.treatmentCustom || "").trim();
    const role = String(person.role || "");
    if (sortName(role) === "advogado") return "Dr.";
    if (sortName(role) === "advogada") return "Dra.";
    return "";
  }

  function professionalName(person = {}) {
    const cleanName = stripTreatment(person.name || person.displayName || "Profissional");
    return [treatmentPrefix(person), cleanName].filter(Boolean).join(" ");
  }

  function normalizeProfessional(person = {}) {
    const cleanName = stripTreatment(person.name || person.displayName || "");
    const normalized = {
      ...person,
      name: cleanName,
      treatment: inferTreatment(person),
      memberType: person.memberType || roleToMemberType(person.role),
    };
    normalized.sortName = sortName(cleanName);
    normalized.displayName = professionalName(normalized);
    return normalized;
  }

  async function api(path, options = {}) {
    const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
    const response = await fetch(path, {
      credentials: "same-origin",
      ...options,
      headers: { ...headers, ...(options.headers || {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Erro ao comunicar com o servidor.");
    return payload;
  }

  function setStatus(message) {
    if (status) status.textContent = message || "";
  }

  function showLogin(message) {
    if (login) login.hidden = false;
    if (panel) panel.hidden = true;
    setStatus(message || "");
  }

  function showPanel() {
    if (login) login.hidden = true;
    if (panel) panel.hidden = false;
    ensureLogoutButton();
    fillAll();
  }

  function professionals() {
    return Object.entries(config.professionals || {})
      .map(([key, person]) => ({ key, ...normalizeProfessional(person) }))
      .sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  function activeProfessionals() {
    return professionals().filter((person) => person.status === "active");
  }

  function areas() {
    return [...(config.areas || [])].sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  async function loadAdminData() {
    const [configPayload, leadsPayload, usersPayload] = await Promise.all([
      api("/api/admin/config"),
      api("/api/admin/leads"),
      api("/api/admin/users").catch(() => ({ users: [] })),
    ]);
    config = configPayload.config || {};
    config.professionals ??= {};
    config.areas ??= [];
    config.faq ??= [];
    config.articles ??= [];
    config.pageTexts ??= {};
    config.office ??= {};
    config.footer ??= defaultFooterConfig();
    config.media ??= {};
    config.seo ??= {};
    config.whatsappSettings ??= {};
    config.internalBase ??= {};
    for (const [key, person] of Object.entries(config.professionals || {})) {
      config.professionals[key] = normalizeProfessional(person);
    }
    leads = leadsPayload.leads || [];
    users = usersPayload.users || [];
    selectedProfessional ||= Object.keys(config.professionals)[0] || "";
    selectedArea ||= config.areas[0]?.slug || "";
  }

  async function saveConfig(message = "Dados salvos no banco.") {
    const payload = await api("/api/admin/config", {
      method: "PUT",
      body: JSON.stringify({ config }),
    });
    config = payload.config || config;
    fillAll();
    if (message) alert(message);
  }

  function field(label, name, value = "", attrs = "") {
    return `<label>${label} <input name="${name}" value="${escapeHtml(value)}" ${attrs}></label>`;
  }

  function textField(label, name, value = "", rows = 4) {
    return `<label>${label} <textarea name="${name}" rows="${rows}">${escapeHtml(value)}</textarea></label>`;
  }

  function selectField(label, name, value, options) {
    return `<label>${label} <select name="${name}">${options.map((option) => {
      const item = typeof option === "string" ? { value: option, label: option } : option;
      return `<option value="${escapeHtml(item.value)}"${String(item.value) === String(value) ? " selected" : ""}>${escapeHtml(item.label)}</option>`;
    }).join("")}</select></label>`;
  }

  function checkbox(label, name, checked) {
    return `<label class="checkbox-row"><input type="checkbox" name="${name}"${checked ? " checked" : ""}> <span>${label}</span></label>`;
  }

  function toggleCard(label, name, checked, help) {
    return `<label class="toggle-card">
      <input type="checkbox" name="${escapeHtml(name)}"${checked ? " checked" : ""}>
      <span class="toggle-visual" aria-hidden="true"></span>
      <span><strong>${escapeHtml(label)}</strong><small>${escapeHtml(help)}</small></span>
    </label>`;
  }

  function toggleGroup(title, cards) {
    return `<section class="toggle-group"><h4>${escapeHtml(title)}</h4><div class="toggle-grid">${cards.join("")}</div></section>`;
  }

  function sectionTitle(title) {
    return `<h3 class="form-section-title">${escapeHtml(title)}</h3>`;
  }

  function repeatList(name, label, values = [], multiline = false) {
    const rows = (values.length ? values : [""]).map((value) => repeatItem(value, multiline)).join("");
    return `<div class="repeat-list" data-repeat="${escapeHtml(name)}" data-multiline="${multiline ? "true" : "false"}"><div class="admin-title-row"><h3>${escapeHtml(label)}</h3><button class="mini-button" type="button" data-repeat-add>Adicionar item</button></div><div data-repeat-items>${rows}</div></div>`;
  }

  function repeatItem(value = "", multiline = false) {
    const input = multiline
      ? `<textarea data-repeat-input rows="3">${escapeHtml(value)}</textarea>`
      : `<input data-repeat-input value="${escapeHtml(value)}">`;
    return `<div class="repeat-item">${input}<button class="mini-button" type="button" data-repeat-up>Subir</button><button class="mini-button" type="button" data-repeat-down>Descer</button><button class="mini-button" type="button" data-repeat-remove>Remover</button></div>`;
  }

  function linkList(name, label, values = []) {
    const rows = (values.length ? values : [{ label: "", href: "" }]).map((item) => linkItem(item)).join("");
    return `<div class="repeat-list" data-link-list="${escapeHtml(name)}"><div class="admin-title-row"><h3>${escapeHtml(label)}</h3><button class="mini-button" type="button" data-link-add>Adicionar item</button></div><div data-link-items>${rows}</div></div>`;
  }

  function linkItem(item = {}) {
    return `<div class="link-item"><input data-link-label placeholder="Texto exibido" value="${escapeHtml(item.label)}"><input data-link-url placeholder="Link ou página" value="${escapeHtml(item.href)}"><button class="mini-button" type="button" data-link-up>Subir</button><button class="mini-button" type="button" data-link-down>Descer</button><button class="mini-button" type="button" data-link-remove>Remover</button></div>`;
  }

  function readRepeat(form, name) {
    const list = [...form.querySelectorAll("[data-repeat]")].find((item) => item.dataset.repeat === name);
    if (!list) return [];
    return [...list.querySelectorAll("[data-repeat-input]")]
      .map((input) => input.value.trim())
      .filter(Boolean);
  }

  function readLinkList(form, name) {
    const list = [...form.querySelectorAll("[data-link-list]")].find((item) => item.dataset.linkList === name);
    if (!list) return [];
    return [...list.querySelectorAll(".link-item")].map((row) => ({
      label: row.querySelector("[data-link-label]")?.value.trim() || "",
      href: row.querySelector("[data-link-url]")?.value.trim() || "",
    })).filter((item) => item.label && item.href);
  }

  function professionalOptions(selected = "") {
    const opts = [{ value: "", label: "WhatsApp principal / recepção" }]
      .concat(professionals().map((person) => ({ value: person.key, label: person.displayName || person.name })));
    return opts.map((option) => `<option value="${escapeHtml(option.value)}"${option.value === selected ? " selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
  }

  function defaultFooterConfig() {
    const office = config.office || {};
    return {
      logo: "",
      shortText: "Advocacia em Jaciara/MT, com atendimento técnico, comunicação clara e análise individualizada de cada demanda.",
      notice: "As informações deste site possuem caráter informativo e não substituem a análise individualizada do caso por advogado. O envio de mensagem ou formulário não caracteriza contratação automática.",
      showNotice: true,
      attendanceTitle: "Atendimento",
      officeName: office.name || "Lanning Amaral Advogados",
      address: office.address || "Rua Jurucê, nº 1150, Centro, Jaciara-MT",
      cep: office.cep || "78.820-000",
      whatsappPrincipal: office.generalWhatsapp || office.whatsappPrincipal || "",
      phonePrincipal: office.generalPhone || "",
      emailPrincipal: "",
      instagram: office.instagram || "",
      hours: office.hours || "Atendimento de segunda a sexta-feira, mediante agendamento.",
      showQuickLinks: true,
      showAreas: true,
      columnOrder: ["Identidade institucional", "Atendimento", "Links rápidos", "Áreas de atuação"],
      quickLinks: [
        { label: "O Escritório", href: "sobre.html" },
        { label: "Equipe", href: "equipe.html" },
        { label: "Áreas de Atuação", href: "areas.html" },
        { label: "Atendimento Online", href: "atendimento-online.html" },
        { label: "Artigos", href: "artigos.html" },
        { label: "Contato", href: "contato.html" },
        { label: "Política de Privacidade", href: "politica-privacidade.html" },
        { label: "Termos de Uso", href: "termos-de-uso.html" },
      ],
      areas: [
        { label: "Previdenciário", href: "areas/previdenciario.html" },
        { label: "Trabalhista", href: "areas/trabalhista.html" },
        { label: "Família", href: "areas/familia.html" },
        { label: "Consumidor", href: "areas/consumidor.html" },
        { label: "Bancário", href: "areas/bancario-superendividamento.html" },
        { label: "Direito Rural", href: "areas/direito-rural.html" },
        { label: "Criminal", href: "areas/criminal.html" },
        { label: "Servidor Público", href: "areas/administrativo-servidor-publico.html" },
        { label: "Sucessões", href: "areas/sucessoes.html" },
        { label: "Execução e Precatório", href: "areas/execucoes-rpv-precatorios.html" },
      ],
    };
  }

  function renderKpis() {
    const box = document.querySelector("[data-admin-kpis]");
    if (!box) return;
    const active = professionals().filter((person) => person.status === "active").length;
    const published = (config.articles || []).filter((article) => (article.status || "rascunho") === "publicado").length;
    const activeAreas = (config.areas || []).filter((area) => (area.status || "active") !== "inactive").length;
    box.innerHTML = [
      `<div class="admin-kpi"><span>Contatos recebidos</span><strong>${leads.length}</strong></div>`,
      `<div class="admin-kpi"><span>Novos atendimentos</span><strong>${leads.filter((lead) => (lead.status || "novo") === "novo").length}</strong></div>`,
      `<div class="admin-kpi"><span>Artigos publicados</span><strong>${published}</strong></div>`,
      `<div class="admin-kpi"><span>Profissionais ativos</span><strong>${active}</strong></div>`,
      `<div class="admin-kpi"><span>Áreas ativas</span><strong>${activeAreas}</strong></div>`,
    ].join("");
  }

  function buildAlerts() {
    const alerts = [];
    const footer = { ...defaultFooterConfig(), ...(config.footer || {}) };
    const hasFooterPerson = professionals().some((person) => person.showInFooter && (person.showAsReception || person.showAsMainContact) && person.whatsapp && person.showWhatsApp !== false);
    if (!footer.whatsappPrincipal && !hasFooterPerson) {
      alerts.push({ id: "footer-whatsapp-principal", type: "Rodapé", related: "", title: "Defina um WhatsApp principal para o rodapé.", hint: "Informe o WhatsApp principal na aba Rodapé ou marque um contato principal/recepção para exibição no rodapé." });
    }
    professionals().forEach((person) => {
      const name = professionalName(person);
      if ((person.memberType === "advogado" || person.memberType === "advogada") && !person.oab) {
        alerts.push({ id: `prof-${person.key}-oab`, type: "Cadastro", related: person.key, title: `${name}: OAB ainda não informada.`, hint: "Complete a OAB ou mantenha o perfil oculto até finalizar o cadastro." });
      }
      if (person.publicVisible && !person.bio) {
        alerts.push({ id: `prof-${person.key}-bio`, type: "Conteúdo público", related: person.key, title: `${name}: biografia pública pendente.`, hint: "Inclua uma mini biografia para melhorar a apresentação da equipe." });
      }
      if ((person.showOnContact || person.showInFooter || person.showAsMainContact) && !person.whatsapp && !person.phone) {
        alerts.push({ id: `prof-${person.key}-contact`, type: "Contato", related: person.key, title: `${name}: contato público sem telefone/WhatsApp.`, hint: "Informe um canal ou remova este profissional das áreas públicas de contato." });
      }
    });
    return alerts;
  }

  function alertState(id) {
    config.alertState ??= {};
    return config.alertState[id] || {};
  }

  function renderAlertCenter() {
    const box = document.querySelector("[data-dashboard-alerts]");
    if (!box) return;
    const alerts = buildAlerts();
    const now = new Date().toISOString();
    alerts.forEach((item) => {
      config.alertState ??= {};
      config.alertState[item.id] ??= { status: "novo", createdAt: now };
    });
    const visible = alerts.filter((item) => {
      const state = alertState(item.id);
      if (state.status === "resolvido" || state.status === "dispensado") return alertFilter === state.status;
      if (alertFilter === "novos") return !state.status || state.status === "novo";
      if (alertFilter === "lidos") return state.status === "lido";
      if (alertFilter === "pendentes") return ["novo", "lido", "ignorado"].includes(state.status || "novo");
      return true;
    });
    const count = (filter) => alerts.filter((item) => {
      const state = alertState(item.id);
      if (filter === "novos") return !state.status || state.status === "novo";
      if (filter === "lidos") return state.status === "lido";
      if (filter === "pendentes") return ["novo", "lido", "ignorado"].includes(state.status || "novo");
      return state.status === filter;
    }).length;
    box.innerHTML = `
      <div class="alert-tabs">
        ${["novos", "pendentes", "lidos", "resolvido", "dispensado"].map((filter) => `<button type="button" data-alert-filter="${filter}" class="${alertFilter === filter ? "is-active" : ""}">${escapeHtml(filter === "resolvido" ? "resolvidos" : filter === "dispensado" ? "dispensados" : filter)} (${count(filter)})</button>`).join("")}
      </div>
      <div class="alert-list">${visible.map((item) => {
        const state = alertState(item.id);
        const date = state.createdAt ? new Date(state.createdAt).toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
        return `<article class="alert-card">
          <div><span class="status-badge">${escapeHtml(state.status || "novo")}</span><small>${escapeHtml(item.type)} · ${escapeHtml(date)}</small></div>
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.hint)}</p>
          <div class="button-row">
            <button type="button" data-alert-action="lido" data-alert-id="${escapeHtml(item.id)}">Ok</button>
            <button type="button" data-alert-action="lido" data-alert-id="${escapeHtml(item.id)}">Lido</button>
            <button type="button" data-alert-action="resolver" data-alert-id="${escapeHtml(item.id)}" data-alert-related="${escapeHtml(item.related)}">Resolver agora</button>
            <button type="button" data-alert-action="ignorado" data-alert-id="${escapeHtml(item.id)}">Ignorar por enquanto</button>
            <button type="button" data-alert-action="dispensado" data-alert-id="${escapeHtml(item.id)}">Dispensar alerta</button>
            <button type="button" data-alert-action="resolvido" data-alert-id="${escapeHtml(item.id)}">Marcar como resolvido</button>
          </div>
        </article>`;
      }).join("") || "<p>Nenhum alerta nesta categoria.</p>"}</div>`;
  }

  function renderDashboard() {
    const latest = document.querySelector("[data-dashboard-leads]");
    if (latest) {
      latest.innerHTML = leads.slice(0, 5).map((lead) => `<p><strong>${escapeHtml(lead.nome || "Sem nome")}</strong><br>${escapeHtml(lead.area || "Área não informada")} · <span class="status-badge">${escapeHtml(lead.status || "novo")}</span></p>`).join("") || "<p>Nenhum contato recebido ainda.</p>";
    }
    renderAlertCenter();
  }

  function renderProfessionalList() {
    const box = document.querySelector("[data-professional-list]");
    if (!box) return;
    const filter = document.querySelector("[data-professional-filter]")?.value?.toLowerCase() || "";
    const rows = professionals().filter((person) => {
      const haystack = [person.name, person.displayName, person.role, person.status, ...(person.areas || [])].join(" ").toLowerCase();
      return haystack.includes(filter);
    });
    box.innerHTML = rows.map((person) => `<div class="professional-list-item" draggable="true" data-drag-professional="${escapeHtml(person.key)}">
      <button type="button" data-select-professional="${escapeHtml(person.key)}" class="${person.key === selectedProfessional ? "is-active" : ""}">${escapeHtml(professionalName(person))}<br><small>${escapeHtml(person.role || "")} · ${escapeHtml(statusLabel(person.status))}</small></button>
      <div class="order-actions"><button type="button" data-professional-up="${escapeHtml(person.key)}" aria-label="Subir">↑</button><button type="button" data-professional-down="${escapeHtml(person.key)}" aria-label="Descer">↓</button></div>
    </div>`).join("") || "<p>Nenhum profissional encontrado.</p>";
  }

  function renderProfessionalForm() {
    const form = document.querySelector("[data-professional-form]");
    if (!form) return;
    const person = normalizeProfessional(config.professionals[selectedProfessional] || {});
    const departmentOptions = areas().map((area) => `<option value="${escapeHtml(area.slug)}"${(person.responsibleDepartments || []).includes(area.slug) ? " selected" : ""}>${escapeHtml(area.title)}</option>`).join("");
    form.innerHTML = `
      <div class="admin-title-row"><h3>Ficha do profissional</h3><div class="button-row"><button class="mini-button" type="button" data-duplicate-professional>Duplicar</button><button class="mini-button" type="button" data-archive-professional>Arquivar</button><a class="button button-ghost-dark" href="equipe.html" target="_blank">Visualizar como cliente</a></div></div>
      <div class="form-grid">
        ${field("Nome completo sem tratamento", "name", person.name)}
        ${selectField("Tratamento", "treatment", person.treatment || "auto", treatmentOptions)}
        ${field("Tratamento personalizado", "treatmentCustom", person.treatmentCustom, 'placeholder="Ex.: Prof."')}
        ${selectField("Cargo", "role", person.role || "Advogado", roleOptions)}
        ${field("OAB/UF", "oab", person.oab)}
        ${field("E-mail", "email", person.email, 'type="email"')}
        ${field("Telefone", "phone", person.phone)}
        ${field("WhatsApp", "whatsapp", person.whatsapp)}
        ${field("Instagram", "instagram", person.instagram)}
        ${field("LinkedIn", "linkedIn", person.linkedIn)}
        ${field("Ordem de destaque", "order", person.order || 99, 'type="number"')}
        ${selectField("Status interno", "status", person.status || "pending", [{ value: "active", label: "ativo" }, { value: "pending", label: "pendente" }, { value: "inactive", label: "inativo" }])}
      </div>
      <p class="muted"><strong>Prévia pública:</strong> ${escapeHtml(professionalName(person))}. A ordenação usa automaticamente o nome limpo, sem Dr., Dra., acentos ou espaços extras.</p>
      ${sectionTitle("Foto")}
      <div class="admin-grid"><label>Foto atual ou URL/base64 <input name="photo" value="${escapeHtml(person.photo)}"></label><label>Enviar nova foto <input type="file" data-image-upload="photo" accept="image/*"></label>${person.photo ? `<img class="image-preview" src="${escapeHtml(person.photo)}" alt="Pré-visualização">` : ""}</div>
      ${textField("Mini biografia", "bio", person.bio, 4)}
      ${textField("Currículo resumido", "resume", person.resume, 4)}
      ${repeatList("areas", "Áreas principais", person.areas || [])}
      <label>Profissional responsável por quais departamentos <select name="responsibleDepartments" multiple size="8">${departmentOptions}</select></label>
      ${sectionTitle("Exibição pública e canais")}
      <div class="toggle-panel">
        ${toggleGroup("Onde este cadastro aparece", [
          toggleCard("Exibir publicamente", "publicVisible", person.publicVisible !== false, "Mostra este cadastro no site público."),
          toggleCard("Exibir na página de contato", "showOnContact", person.showOnContact, "Inclui este contato na página de contato."),
          toggleCard("Exibir no rodapé", "showInFooter", person.showInFooter, "Inclui este contato no rodapé do site."),
          toggleCard("Exibir apenas no painel interno", "internalOnly", person.internalOnly, "Mantém o cadastro oculto para clientes."),
        ])}
        ${toggleGroup("Canais exibidos", [
          toggleCard("Exibir WhatsApp", "showWhatsApp", person.showWhatsApp !== false, "Mostra botão ou link de WhatsApp quando houver número."),
          toggleCard("Exibir e-mail", "showEmail", person.showEmail, "Mostra o e-mail público quando preenchido."),
          toggleCard("Exibir Instagram", "showInstagram", person.showInstagram, "Mostra o Instagram quando houver link cadastrado."),
          toggleCard("Exibir telefone", "showPhone", person.showPhone, "Mostra telefone fixo ou celular quando preenchido."),
        ])}
        ${toggleGroup("Função no atendimento", [
          toggleCard("Contato principal", "showAsMainContact", person.showAsMainContact, "Usa este contato como referência geral do escritório."),
          toggleCard("Recepção / atendimento geral", "showAsReception", person.showAsReception, "Identifica este cadastro como apoio de atendimento inicial."),
          toggleCard("Destacar este profissional", "highlight", person.highlight, "Pode colocar este profissional antes na home."),
          toggleCard("Ordenar automaticamente por ordem alfabética", "sortAlphabetically", person.sortAlphabetically, "Ajuda o sistema a manter a ordem pelo nome limpo."),
        ])}
      </div>
      <button class="button button-accent" type="submit">Salvar profissional</button>`;
  }

  function renderAreaList() {
    const box = document.querySelector("[data-area-list]");
    if (!box) return;
    box.innerHTML = areas().map((area) => `<button type="button" data-select-area="${escapeHtml(area.slug)}" class="${area.slug === selectedArea ? "is-active" : ""}">${escapeHtml(area.title)}<br><small>${escapeHtml(area.short || "")} · ${escapeHtml(statusLabel(area.status || "active"))}</small></button>`).join("");
  }

  function currentArea() {
    return config.areas.find((area) => area.slug === selectedArea) || config.areas[0] || {};
  }

  function renderAreaForm() {
    const form = document.querySelector("[data-area-form]");
    if (!form) return;
    const area = currentArea();
    form.innerHTML = `
      <div class="form-grid">
        ${field("Nome público", "title", area.title)}
        ${field("Título da página", "seoTitle", area.seoTitle)}
        ${field("Subtítulo", "eyebrow", area.eyebrow)}
        ${field("Imagem opcional do departamento", "image", area.image)}
        ${selectField("Profissional responsável", "route", area.route, professionals().map((person) => ({ value: person.key, label: person.displayName || person.name })))}
        ${field("WhatsApp preferencial", "whatsapp", area.whatsapp)}
        ${selectField("Status", "status", area.status || "active", [{ value: "active", label: "ativo" }, { value: "inactive", label: "inativo" }])}
        ${field("Ordem de exibição", "order", area.order || 99, 'type="number"')}
      </div>
      ${textField("Texto de abertura", "description", area.description, 5)}
      ${textField("Quando procurar orientação jurídica?", "when", area.when, 5)}
      ${repeatList("subareas", "Situações atendidas", area.subareas || area.items || [])}
      ${repeatList("documentsList", "Documentos que podem ajudar", area.documentsList || [])}
      ${repeatList("faq", "FAQ específico do departamento", (area.faq || []).map((item) => `${item.q || ""}\n${item.a || ""}`), true)}
      ${sectionTitle("SEO")}
      ${field("SEO title", "seoTitle2", area.seoTitle)}
      ${textField("Meta description", "metaDescription", area.metaDescription || area.description, 3)}
      <div class="button-row"><button class="button button-accent" type="submit">Salvar departamento</button><a class="button button-ghost-dark" href="areas/${escapeHtml(area.slug || "")}.html" target="_blank">Visualizar</a></div>`;
  }

  function renderTextsForm() {
    const form = document.querySelector("[data-texts-form]");
    if (!form) return;
    const texts = config.pageTexts || {};
    form.innerHTML = `
      <div class="form-grid">
        ${field("Headline da home", "homeHeadline", texts.homeHeadline)}
        ${field("Subtítulo da home", "homeSubtitle", texts.homeSubtitle)}
      </div>
      ${textField("Texto principal da home", "homeDescription", texts.homeDescription, 4)}
      ${textField("Texto institucional", "institutional", texts.institutional, 5)}
      ${textField("Texto da equipe", "teamIntro", texts.teamIntro, 5)}
      ${textField("Texto do escritório", "officeIntro", texts.officeIntro, 5)}
      ${textField("Texto do atendimento online", "onlineIntro", texts.onlineIntro, 5)}
      ${textField("Aviso legal", "legalNotice", config.legalNotice, 4)}
      ${textField("Texto de LGPD do formulário", "lgpdConsent", texts.lgpdConsent, 3)}
      ${textField("Mensagem padrão do formulário", "formSuccess", texts.formSuccess, 3)}
      <button class="button button-accent" type="submit">Salvar textos públicos</button>`;
  }

  function renderFaqList() {
    const box = document.querySelector("[data-faq-list]");
    if (!box) return;
    box.innerHTML = (config.faq || []).map((item, index) => `<button type="button" data-select-faq="${index}" class="${index === selectedFaq ? "is-active" : ""}">${escapeHtml(item.q || "Pergunta sem título")}<br><small>${escapeHtml(item.category || "geral")}</small></button>`).join("") || "<p>Nenhuma pergunta cadastrada.</p>";
  }

  function renderFaqForm() {
    const form = document.querySelector("[data-faq-form]");
    if (!form) return;
    const item = config.faq[selectedFaq] || {};
    form.innerHTML = `
      ${field("Pergunta", "q", item.q)}
      ${textField("Resposta", "a", item.a, 5)}
      <div class="form-grid">
        ${field("Categoria", "category", item.category)}
        ${field("Ordem", "order", item.order || selectedFaq + 1, 'type="number"')}
        ${selectField("Status", "status", item.status || "active", [{ value: "active", label: "ativo" }, { value: "inactive", label: "inativo" }])}
        ${selectField("Departamento específico", "department", item.department || "", [{ value: "", label: "Geral" }].concat(areas().map((area) => ({ value: area.slug, label: area.title }))))}
      </div>
      <div class="admin-grid">
        ${checkbox("Exibir na home", "showHome", item.showHome !== false)}
        ${checkbox("Exibir na página de atendimento", "showOnline", item.showOnline !== false)}
      </div>
      <div class="button-row"><button class="button button-accent" type="submit">Salvar pergunta</button><button class="mini-button" type="button" data-delete-faq>Arquivar/remover</button></div>`;
  }

  function renderArticleList() {
    const box = document.querySelector("[data-article-list]");
    if (!box) return;
    box.innerHTML = (config.articles || []).map((item, index) => `<button type="button" data-select-article="${index}" class="${index === selectedArticle ? "is-active" : ""}">${escapeHtml(item.title || "Artigo sem título")}<br><small>${escapeHtml(item.category || "")} · ${escapeHtml(item.status || "rascunho")}</small></button>`).join("") || "<p>Nenhum artigo cadastrado.</p>";
  }

  function renderArticleForm() {
    const form = document.querySelector("[data-article-form]");
    if (!form) return;
    const item = config.articles[selectedArticle] || {};
    form.innerHTML = `
      <div class="form-grid">
        ${field("Título", "title", item.title)}
        ${field("Categoria", "category", item.category)}
        ${field("Autor", "author", item.author)}
        ${field("Data de publicação", "publishedAt", item.publishedAt, 'type="date"')}
        ${field("Data de atualização", "updatedAt", item.updatedAt, 'type="date"')}
        ${selectField("Status", "status", item.status || "rascunho", ["rascunho", "publicado", "arquivado"])}
      </div>
      <div class="admin-grid"><label>Imagem de capa <input name="cover" value="${escapeHtml(item.cover)}"></label><label>Enviar capa <input type="file" data-article-upload="cover" accept="image/*"></label>${item.cover ? `<img class="image-preview" src="${escapeHtml(item.cover)}" alt="Pré-visualização">` : ""}</div>
      ${textField("Resumo", "excerpt", item.excerpt, 4)}
      ${textField("Corpo do texto", "body", item.body, 10)}
      ${field("Link externo opcional", "externalUrl", item.externalUrl)}
      ${checkbox("Destaque na home", "featured", item.featured)}
      ${sectionTitle("SEO")}
      ${field("SEO title", "seoTitle", item.seoTitle)}
      ${textField("Meta description", "metaDescription", item.metaDescription, 3)}
      <div class="button-row"><button class="button button-accent" type="submit">Salvar rascunho/publicação</button><button class="mini-button" type="button" data-duplicate-article>Duplicar</button><button class="mini-button" type="button" data-delete-article>Arquivar</button><a class="button button-ghost-dark" href="artigos.html" target="_blank">Visualizar como cliente</a></div>`;
  }

  function renderContactForm() {
    const form = document.querySelector("[data-contact-form-admin]");
    if (!form) return;
    const office = config.office || {};
    form.innerHTML = `
      <div class="form-grid">
        ${field("Nome do escritório", "name", office.name)}
        ${field("Endereço", "address", office.address)}
        ${field("Número", "number", office.number)}
        ${field("Bairro", "district", office.district)}
        ${field("Cidade", "city", office.city)}
        ${field("Estado", "state", office.state)}
        ${field("CEP", "cep", office.cep)}
        ${field("Google Maps / link do mapa", "mapUrl", office.mapUrl)}
        ${field("Mapa incorporado", "mapEmbed", office.mapEmbed)}
        ${field("Telefone geral", "generalPhone", office.generalPhone)}
        ${field("WhatsApp geral", "generalWhatsapp", office.generalWhatsapp)}
        ${field("E-mail geral", "generalEmail", office.generalEmail)}
        ${field("Instagram geral", "instagram", office.instagram)}
      </div>
      ${textField("Horário de atendimento", "hours", office.hours, 3)}
      ${textField("Texto da página de contato", "contactPageText", office.contactPageText, 4)}
      ${textField("Aviso de atendimento", "serviceNotice", office.serviceNotice, 4)}
      <p class="muted">A seleção de quais profissionais aparecem na página de contato e no rodapé é feita na ficha de cada profissional.</p>
      <button class="button button-accent" type="submit">Salvar contato</button>`;
  }

  function renderFooterForm() {
    const form = document.querySelector("[data-footer-form]");
    if (!form) return;
    const footer = { ...defaultFooterConfig(), ...(config.footer || {}) };
    form.innerHTML = `
      ${sectionTitle("Identidade institucional")}
      <div class="form-grid">
        ${field("Logo do rodapé", "logo", footer.logo)}
        ${field("Nome do escritório", "officeName", footer.officeName)}
      </div>
      <div class="admin-grid"><label>Enviar logo do rodapé <input type="file" data-footer-upload="logo" accept="image/*"></label>${footer.logo ? `<img class="image-preview" src="${escapeHtml(footer.logo)}" alt="Pré-visualização">` : ""}</div>
      ${textField("Texto institucional curto", "shortText", footer.shortText, 3)}
      ${textField("Aviso informativo", "notice", footer.notice, 3)}
      <div class="admin-grid">
        ${checkbox("Exibir aviso informativo", "showNotice", footer.showNotice !== false)}
      </div>
      ${sectionTitle("Coluna Atendimento")}
      <div class="form-grid">
        ${field("Título da coluna", "attendanceTitle", footer.attendanceTitle)}
        ${field("Endereço", "address", footer.address)}
        ${field("CEP", "cep", footer.cep)}
        ${field("WhatsApp principal", "whatsappPrincipal", footer.whatsappPrincipal)}
        ${field("Telefone principal", "phonePrincipal", footer.phonePrincipal)}
        ${field("E-mail principal", "emailPrincipal", footer.emailPrincipal, 'type="email"')}
        ${field("Instagram geral", "instagram", footer.instagram)}
      </div>
      ${textField("Horário de atendimento", "hours", footer.hours, 2)}
      ${sectionTitle("Colunas e listas")}
      <div class="admin-grid">
        ${checkbox("Ativar coluna de links rápidos", "showQuickLinks", footer.showQuickLinks !== false)}
        ${checkbox("Ativar coluna de áreas de atuação", "showAreas", footer.showAreas !== false)}
      </div>
      ${repeatList("columnOrder", "Ordem das colunas", footer.columnOrder || [])}
      ${linkList("quickLinks", "Links rápidos exibidos", footer.quickLinks || [])}
      ${linkList("areas", "Áreas de atuação exibidas", footer.areas || [])}
      <p class="muted">O rodapé exibe dados institucionais do escritório. Contatos individuais só são usados como WhatsApp principal quando marcados como “Exibir no rodapé” e “Contato principal” ou “Recepção / atendimento geral”.</p>
      <button class="button button-accent" type="submit">Salvar rodapé</button>`;
  }

  function renderMediaForm() {
    const form = document.querySelector("[data-media-form]");
    if (!form) return;
    const media = config.media || {};
    const seo = config.seo || {};
    form.innerHTML = `
      <div class="form-grid">
        ${field("Logo principal", "logoPrincipal", media.logoPrincipal)}
        ${field("Logo alternativa", "logoAlt", media.logoAlt)}
        ${field("Favicon", "favicon", media.favicon)}
        ${field("Imagem institucional", "imagemInstitucional", media.imagemInstitucional)}
        ${field("Imagem para redes sociais", "ogImage", seo.ogImage)}
        ${field("Alt text das imagens", "altText", media.altText)}
      </div>
      <div class="admin-grid">
        <label>Enviar logo principal <input type="file" data-media-upload="logoPrincipal" accept="image/*"></label>
        <label>Enviar imagem institucional <input type="file" data-media-upload="imagemInstitucional" accept="image/*"></label>
        <label>Enviar imagem de redes sociais <input type="file" data-media-upload="ogImage" accept="image/*"></label>
      </div>
      ${sectionTitle("SEO geral")}
      <div class="form-grid">
        ${field("SEO title da home", "homeTitle", seo.homeTitle)}
        ${field("OG title", "ogTitle", seo.ogTitle)}
      </div>
      ${textField("Meta description da home", "homeDescription", seo.homeDescription, 3)}
      ${textField("OG description", "ogDescription", seo.ogDescription, 3)}
      <button class="button button-accent" type="submit">Salvar mídias e SEO</button>`;
  }

  function renderWhatsappForm() {
    const form = document.querySelector("[data-whatsapp-form]");
    if (!form) return;
    const settings = config.whatsappSettings || {};
    const routing = settings.routing || config.chatbotRouting || {};
    const rows = areas().map((area) => `<label>Para ${escapeHtml(area.title)}, encaminhar para <select name="route:${escapeHtml(area.title)}">${professionalOptions(routing[area.title] || area.route)}</select></label>`).join("");
    form.innerHTML = `
      <div class="form-grid">
        ${field("WhatsApp principal do escritório", "principal", settings.principal || config.office?.whatsappPrincipal)}
        ${field("Número de fallback", "fallback", settings.fallback)}
      </div>
      ${textField("Mensagem padrão para WhatsApp", "defaultMessage", settings.defaultMessage, 4)}
      <div class="admin-grid">
        ${checkbox("Usar recepção como WhatsApp principal", "useReceptionAsPrincipal", settings.useReceptionAsPrincipal)}
        ${checkbox("Mostrar botão fixo de WhatsApp", "showFloatingButton", settings.showFloatingButton !== false)}
        ${checkbox("Abrir chatbot antes do WhatsApp", "openChatbotBeforeWhatsapp", settings.openChatbotBeforeWhatsapp)}
        ${checkbox("Permitir cliente escolher profissional", "allowChooseProfessional", settings.allowChooseProfessional !== false)}
        ${checkbox("Exibir opção “não sei com quem falar”", "showUnknownOption", settings.showUnknownOption !== false)}
      </div>
      ${sectionTitle("Direcionamento por departamento")}
      <div class="admin-grid">${rows}<label>Para dúvidas gerais, encaminhar para <select name="route:Dúvidas gerais">${professionalOptions(routing["Dúvidas gerais"] || "")}</select></label></div>
      <button class="button button-accent" type="submit">Salvar WhatsApp e chatbot</button>`;
  }

  function renderBaseForm() {
    const form = document.querySelector("[data-base-form]");
    if (!form) return;
    const base = config.internalBase || {};
    form.innerHTML = `
      ${textField("Roteiro de atendimento por área", "roteiroPorArea", base.roteiroPorArea, 5)}
      ${textField("Perguntas internas de triagem", "perguntasTriagem", base.perguntasTriagem, 5)}
      ${textField("Documentos que a equipe costuma solicitar", "documentosEquipe", base.documentosEquipe, 5)}
      ${textField("Observações de fluxo", "observacoes", base.observacoes, 5)}
      ${textField("Responsáveis preferenciais", "responsaveis", base.responsaveis, 4)}
      ${textField("Modelos de mensagem", "modelosMensagem", base.modelosMensagem, 5)}
      ${textField("Checklists internos", "checklists", base.checklists, 5)}
      <button class="button button-accent" type="submit">Salvar base interna</button>`;
  }

  function renderUsersPanel() {
    const box = document.querySelector("[data-users-panel]");
    if (!box) return;
    const guide = config.usersGuide || [];
    box.innerHTML = `<div class="admin-card"><h3>Novo usuário interno</h3><form data-user-form class="admin-grid">${field("E-mail", "email", "", 'type="email" required')}${field("Senha inicial", "password", "", 'type="password" required')}${selectField("Perfil", "role", "assistente", ["administrador", "advogado", "assistente", "editor"])}<button class="button button-accent" type="submit">Criar usuário</button></form></div><div class="admin-dashboard-grid">${guide.map((item) => `<div class="user-card"><h3>${escapeHtml(item.role)}</h3><p>${escapeHtml(item.permissions)}</p></div>`).join("")}</div><div class="contacts-table"><table><thead><tr><th>E-mail</th><th>Perfil</th><th>Criado em</th></tr></thead><tbody>${users.map((user) => `<tr><td>${escapeHtml(user.email)}</td><td>${escapeHtml(statusLabel(user.role))}</td><td>${escapeHtml(user.created_at ? new Date(user.created_at).toLocaleString("pt-BR") : "")}</td></tr>`).join("")}</tbody></table></div>`;
  }

  function renderContacts() {
    const box = document.querySelector("[data-contacts-table]");
    if (!box) return;
    if (!leads.length) {
      box.innerHTML = "<p>Nenhum contato recebido ainda.</p>";
      return;
    }
    const statuses = ["novo", "em análise", "aguardando documentos", "atendido", "contratado", "arquivado"];
    box.innerHTML = `<table><thead><tr><th>Data</th><th>Nome</th><th>Contato</th><th>Área</th><th>Urgência</th><th>Profissional</th><th>Status</th><th>Documentos</th><th>Ações</th></tr></thead><tbody>${leads.map((row) => {
      const date = row.data || row.criadoEm || row.created_at || new Date().toISOString();
      const docs = (row.documentos || []).map((doc) => `<a href="/api/admin/leads/${escapeHtml(row.id)}/documents/${escapeHtml(doc.index)}" target="_blank" rel="noopener">${escapeHtml(doc.name)}</a>`).join("<br>");
      const phone = cleanNumber(row.telefone);
      return `<tr><td>${escapeHtml(new Date(date).toLocaleString("pt-BR"))}</td><td>${escapeHtml(row.nome)}<br><small>${escapeHtml(row.cidade)}</small></td><td>${escapeHtml(row.telefone)}<br>${escapeHtml(row.email)}</td><td>${escapeHtml(row.area)}</td><td>${escapeHtml(row.urgencia)}</td><td>${escapeHtml(row.profissionalSugerido || row.responsavel)}</td><td>${escapeHtml(row.status || "novo")}</td><td>${docs || "Sem anexos"}</td><td><div class="lead-actions">${phone ? `<a href="https://wa.me/55${escapeHtml(phone.replace(/^55/, ""))}" target="_blank" rel="noopener">WhatsApp</a>` : ""}${statuses.map((item) => `<button type="button" data-lead-id="${escapeHtml(row.id)}" data-lead-status="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div></td></tr>`;
    }).join("")}</tbody></table>`;
  }

  function fillAll() {
    renderKpis();
    renderDashboard();
    renderProfessionalList();
    renderProfessionalForm();
    renderAreaList();
    renderAreaForm();
    renderTextsForm();
    renderFaqList();
    renderFaqForm();
    renderArticleList();
    renderArticleForm();
    renderContactForm();
    renderFooterForm();
    renderMediaForm();
    renderWhatsappForm();
    renderBaseForm();
    renderContacts();
    renderUsersPanel();
  }

  function formDataObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function booleanField(data, key) {
    return data.get(key) === "on";
  }

  function readProfessionalForm(form) {
    const data = new FormData(form);
    const person = { ...config.professionals[selectedProfessional] };
    ["treatment", "treatmentCustom", "role", "oab", "photo", "email", "phone", "whatsapp", "instagram", "linkedIn", "bio", "resume", "status"].forEach((key) => { person[key] = data.get(key) || ""; });
    person.name = stripTreatment(data.get("name"));
    person.memberType = roleToMemberType(person.role);
    person.whatsappLink = whatsappLink(person.whatsapp);
    person.order = Number(data.get("order") || 99);
    person.areas = readRepeat(form, "areas");
    person.responsibleDepartments = [...form.querySelector("[name='responsibleDepartments']")?.selectedOptions || []].map((option) => option.value);
    ["publicVisible", "showOnContact", "showInFooter", "showAsMainContact", "showAsReception", "internalOnly", "showInstagram", "showEmail", "showWhatsApp", "showPhone", "highlight", "sortAlphabetically"].forEach((key) => { person[key] = booleanField(data, key); });
    return normalizeProfessional(person);
  }

  function ensureLogoutButton() {
    const sidebar = document.querySelector(".admin-sidebar");
    if (!sidebar || sidebar.querySelector("[data-admin-logout]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.adminLogout = "true";
    button.textContent = "Sair";
    sidebar.appendChild(button);
  }

  async function refresh() {
    await loadAdminData();
    fillAll();
  }

  function exportCsv() {
    const headers = ["data", "nome", "telefone", "email", "cidade", "area", "resumo", "urgencia", "profissionalSugerido", "status", "observacoes", "origem", "proximoPasso", "dataRetorno"];
    const csv = [headers.join(",")].concat(leads.map((row) => headers.map((key) => `"${String(row[key] || "").replace(/"/g, '""')}"`).join(","))).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "contatos-lanning-amaral.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function applyProfessionalOrder(orderedKeys) {
    orderedKeys.forEach((key, index) => {
      if (config.professionals[key]) config.professionals[key].order = index + 1;
    });
  }

  function moveProfessional(key, direction) {
    const ordered = professionals().map((person) => person.key);
    const index = ordered.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ordered.length) return false;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    applyProfessionalOrder(ordered);
    return true;
  }

  function orderProfessionalsAlphabetically() {
    const ordered = professionals()
      .slice()
      .sort((a, b) => sortName(a.name || a.displayName).localeCompare(sortName(b.name || b.displayName), "pt-BR"))
      .map((person) => person.key);
    applyProfessionalOrder(ordered);
  }

  function bindFormHandlers() {
    return;
    document.querySelector("[data-professional-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      config.professionals[selectedProfessional] = readProfessionalForm(event.currentTarget);
      await saveConfig("Profissional salvo.");
    });

    document.querySelector("[data-area-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = formDataObject(form);
      const index = config.areas.findIndex((area) => area.slug === selectedArea);
      const area = { ...(config.areas[index] || {}) };
      area.title = data.title;
      area.seoTitle = data.seoTitle2 || data.seoTitle;
      area.eyebrow = data.eyebrow;
      area.image = data.image;
      area.route = data.route;
      area.responsibleKey = data.route;
      area.whatsapp = data.whatsapp;
      area.status = data.status;
      area.order = Number(data.order || 99);
      area.description = data.description;
      area.summary = data.description;
      area.when = data.when;
      area.subareas = readRepeat(form, "subareas");
      area.items = area.subareas.slice(0, 8);
      area.documentsList = readRepeat(form, "documentsList");
      area.documents = area.documentsList.join("; ");
      area.faq = readRepeat(form, "faq").map((value) => {
        const [q, ...rest] = value.split("\n");
        return { q: q.trim(), a: rest.join("\n").trim() };
      }).filter((item) => item.q || item.a);
      area.metaDescription = data.metaDescription;
      if (index >= 0) config.areas[index] = area;
      await saveConfig("Departamento salvo.");
    });

    document.querySelector("[data-texts-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formDataObject(event.currentTarget);
      config.pageTexts = { ...(config.pageTexts || {}), ...data };
      config.legalNotice = data.legalNotice || config.legalNotice;
      await saveConfig("Textos públicos salvos.");
    });

    document.querySelector("[data-faq-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      config.faq[selectedFaq] = {
        q: data.get("q"),
        a: data.get("a"),
        category: data.get("category"),
        order: Number(data.get("order") || selectedFaq + 1),
        status: data.get("status"),
        department: data.get("department"),
        showHome: booleanField(data, "showHome"),
        showOnline: booleanField(data, "showOnline"),
      };
      await saveConfig("Pergunta salva.");
    });

    document.querySelector("[data-article-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formDataObject(event.currentTarget);
      config.articles[selectedArticle] = { ...(config.articles[selectedArticle] || {}), ...data, featured: new FormData(event.currentTarget).get("featured") === "on" };
      await saveConfig("Artigo salvo.");
    });

    document.querySelector("[data-contact-form-admin]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      config.office = { ...(config.office || {}), ...formDataObject(event.currentTarget) };
      config.office.whatsappPrincipal = config.office.generalWhatsapp || config.office.whatsappPrincipal;
      await saveConfig("Contato salvo.");
    });

    document.querySelector("[data-footer-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = formDataObject(form);
      config.footer = {
        ...(config.footer || {}),
        ...data,
        showNotice: new FormData(form).get("showNotice") === "on",
        showQuickLinks: new FormData(form).get("showQuickLinks") === "on",
        showAreas: new FormData(form).get("showAreas") === "on",
        columnOrder: readRepeat(form, "columnOrder"),
        quickLinks: readLinkList(form, "quickLinks"),
        areas: readLinkList(form, "areas"),
      };
      await saveConfig("Rodapé salvo.");
    });

    document.querySelector("[data-media-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formDataObject(event.currentTarget);
      config.media = { ...(config.media || {}), logoPrincipal: data.logoPrincipal, logoAlt: data.logoAlt, favicon: data.favicon, imagemInstitucional: data.imagemInstitucional, altText: data.altText };
      config.seo = { ...(config.seo || {}), homeTitle: data.homeTitle, homeDescription: data.homeDescription, ogTitle: data.ogTitle, ogDescription: data.ogDescription, ogImage: data.ogImage };
      await saveConfig("Mídias e SEO salvos.");
    });

    document.querySelector("[data-whatsapp-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const routing = {};
      for (const [key, value] of data.entries()) {
        if (key.startsWith("route:")) routing[key.replace("route:", "")] = value;
      }
      config.whatsappSettings = {
        ...(config.whatsappSettings || {}),
        principal: data.get("principal"),
        fallback: data.get("fallback"),
        defaultMessage: data.get("defaultMessage"),
        useReceptionAsPrincipal: booleanField(data, "useReceptionAsPrincipal"),
        showFloatingButton: booleanField(data, "showFloatingButton"),
        openChatbotBeforeWhatsapp: booleanField(data, "openChatbotBeforeWhatsapp"),
        allowChooseProfessional: booleanField(data, "allowChooseProfessional"),
        showUnknownOption: booleanField(data, "showUnknownOption"),
        routing,
      };
      config.chatbotRouting = routing;
      config.office.whatsappPrincipal = data.get("principal") || config.office.whatsappPrincipal;
      await saveConfig("WhatsApp e chatbot salvos.");
    });

    document.querySelector("[data-base-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      config.internalBase = { ...(config.internalBase || {}), ...formDataObject(event.currentTarget) };
      await saveConfig("Base interna salva.");
    });

    document.querySelector("[data-user-form]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = formDataObject(event.currentTarget);
      await api("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
      await refresh();
      alert("Usuário criado.");
    });
  }

  document.addEventListener("submit", async (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    if (!form) return;
    try {
      if (form.matches("[data-professional-form]")) {
        event.preventDefault();
        config.professionals[selectedProfessional] = readProfessionalForm(form);
        await saveConfig("Profissional salvo.");
      }

      if (form.matches("[data-area-form]")) {
        event.preventDefault();
        const data = formDataObject(form);
        const index = config.areas.findIndex((area) => area.slug === selectedArea);
        const area = { ...(config.areas[index] || {}) };
        area.title = data.title;
        area.seoTitle = data.seoTitle2 || data.seoTitle;
        area.eyebrow = data.eyebrow;
        area.image = data.image;
        area.route = data.route;
        area.responsibleKey = data.route;
        area.whatsapp = data.whatsapp;
        area.status = data.status;
        area.order = Number(data.order || 99);
        area.description = data.description;
        area.summary = data.description;
        area.when = data.when;
        area.subareas = readRepeat(form, "subareas");
        area.items = area.subareas.slice(0, 8);
        area.documentsList = readRepeat(form, "documentsList");
        area.documents = area.documentsList.join("; ");
        area.faq = readRepeat(form, "faq").map((value) => {
          const [q, ...rest] = value.split("\n");
          return { q: q.trim(), a: rest.join("\n").trim() };
        }).filter((item) => item.q || item.a);
        area.metaDescription = data.metaDescription;
        if (index >= 0) config.areas[index] = area;
        await saveConfig("Departamento salvo.");
      }

      if (form.matches("[data-texts-form]")) {
        event.preventDefault();
        const data = formDataObject(form);
        config.pageTexts = { ...(config.pageTexts || {}), ...data };
        config.legalNotice = data.legalNotice || config.legalNotice;
        await saveConfig("Textos públicos salvos.");
      }

      if (form.matches("[data-faq-form]")) {
        event.preventDefault();
        const data = new FormData(form);
        config.faq[selectedFaq] = {
          q: data.get("q"),
          a: data.get("a"),
          category: data.get("category"),
          order: Number(data.get("order") || selectedFaq + 1),
          status: data.get("status"),
          department: data.get("department"),
          showHome: booleanField(data, "showHome"),
          showOnline: booleanField(data, "showOnline"),
        };
        await saveConfig("Pergunta salva.");
      }

      if (form.matches("[data-article-form]")) {
        event.preventDefault();
        const data = formDataObject(form);
        config.articles[selectedArticle] = { ...(config.articles[selectedArticle] || {}), ...data, featured: new FormData(form).get("featured") === "on" };
        await saveConfig("Artigo salvo.");
      }

      if (form.matches("[data-contact-form-admin]")) {
        event.preventDefault();
        config.office = { ...(config.office || {}), ...formDataObject(form) };
        config.office.whatsappPrincipal = config.office.generalWhatsapp || config.office.whatsappPrincipal;
        await saveConfig("Contato salvo.");
      }

      if (form.matches("[data-footer-form]")) {
        event.preventDefault();
        const data = formDataObject(form);
        const formData = new FormData(form);
        config.footer = {
          ...(config.footer || {}),
          ...data,
          showNotice: formData.get("showNotice") === "on",
          showQuickLinks: formData.get("showQuickLinks") === "on",
          showAreas: formData.get("showAreas") === "on",
          columnOrder: readRepeat(form, "columnOrder"),
          quickLinks: readLinkList(form, "quickLinks"),
          areas: readLinkList(form, "areas"),
        };
        await saveConfig("Rodapé salvo.");
      }

      if (form.matches("[data-media-form]")) {
        event.preventDefault();
        const data = formDataObject(form);
        config.media = { ...(config.media || {}), logoPrincipal: data.logoPrincipal, logoAlt: data.logoAlt, favicon: data.favicon, imagemInstitucional: data.imagemInstitucional, altText: data.altText };
        config.seo = { ...(config.seo || {}), homeTitle: data.homeTitle, homeDescription: data.homeDescription, ogTitle: data.ogTitle, ogDescription: data.ogDescription, ogImage: data.ogImage };
        await saveConfig("Mídias e SEO salvos.");
      }

      if (form.matches("[data-whatsapp-form]")) {
        event.preventDefault();
        const data = new FormData(form);
        const routing = {};
        for (const [key, value] of data.entries()) {
          if (key.startsWith("route:")) routing[key.replace("route:", "")] = value;
        }
        config.whatsappSettings = {
          ...(config.whatsappSettings || {}),
          principal: data.get("principal"),
          fallback: data.get("fallback"),
          defaultMessage: data.get("defaultMessage"),
          useReceptionAsPrincipal: booleanField(data, "useReceptionAsPrincipal"),
          showFloatingButton: booleanField(data, "showFloatingButton"),
          openChatbotBeforeWhatsapp: booleanField(data, "openChatbotBeforeWhatsapp"),
          allowChooseProfessional: booleanField(data, "allowChooseProfessional"),
          showUnknownOption: booleanField(data, "showUnknownOption"),
          routing,
        };
        config.chatbotRouting = routing;
        config.office.whatsappPrincipal = data.get("principal") || config.office.whatsappPrincipal;
        await saveConfig("WhatsApp e chatbot salvos.");
      }

      if (form.matches("[data-base-form]")) {
        event.preventDefault();
        config.internalBase = { ...(config.internalBase || {}), ...formDataObject(form) };
        await saveConfig("Base interna salva.");
      }

      if (form.matches("[data-user-form]")) {
        event.preventDefault();
        const data = formDataObject(form);
        await api("/api/admin/users", { method: "POST", body: JSON.stringify(data) });
        await refresh();
        alert("Usuário criado.");
      }
    } catch (error) {
      alert(error.message);
    }
  });

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    try {
      if (target.matches("[data-admin-tab]")) {
        document.querySelectorAll("[data-admin-tab]").forEach((button) => button.classList.remove("is-active"));
        document.querySelectorAll("[data-admin-view]").forEach((view) => view.classList.remove("is-active"));
        target.classList.add("is-active");
        document.querySelector(`[data-admin-view="${target.dataset.adminTab}"]`)?.classList.add("is-active");
      }
      if (target.matches("[data-alert-filter]")) {
        alertFilter = target.dataset.alertFilter || "novos";
        renderAlertCenter();
      }
      if (target.matches("[data-alert-action]")) {
        const id = target.dataset.alertId;
        const action = target.dataset.alertAction;
        config.alertState ??= {};
        config.alertState[id] = {
          ...(config.alertState[id] || {}),
          status: action === "resolver" ? "lido" : action,
          readAt: ["lido", "resolver"].includes(action) ? new Date().toISOString() : config.alertState[id]?.readAt,
          updatedAt: new Date().toISOString(),
        };
        if (action === "resolver" && target.dataset.alertRelated) {
          await saveConfig("");
          selectedProfessional = target.dataset.alertRelated;
          document.querySelector('[data-admin-tab="profissionais"]')?.click();
          fillAll();
          return;
        }
        await saveConfig(action === "lido" ? "Alerta marcado como lido." : "Alerta atualizado.");
      }
      if (target.matches("[data-select-professional]")) { selectedProfessional = target.dataset.selectProfessional; fillAll(); }
      if (target.matches("[data-new-professional]")) {
        selectedProfessional = `profissional_${Date.now()}`;
        config.professionals[selectedProfessional] = normalizeProfessional({ name: "Novo profissional", treatment: "auto", role: "Advogado", memberType: "advogado", status: "pending", publicVisible: false, order: professionals().length + 1, areas: [] });
        fillAll();
      }
      if (target.matches("[data-duplicate-professional]")) {
        const original = normalizeProfessional(config.professionals[selectedProfessional]);
        const copy = normalizeProfessional({ ...original, name: `${stripTreatment(original.name) || "Profissional"} (cópia)` });
        selectedProfessional = `profissional_${Date.now()}`;
        config.professionals[selectedProfessional] = copy;
        await saveConfig("Profissional duplicado.");
      }
      if (target.matches("[data-archive-professional]")) {
        config.professionals[selectedProfessional].status = "inactive";
        config.professionals[selectedProfessional].publicVisible = false;
        await saveConfig("Profissional arquivado.");
      }
      if (target.matches("[data-sort-professionals]")) {
        orderProfessionalsAlphabetically();
        await saveConfig("Profissionais ordenados.");
      }
      if (target.matches("[data-professional-up]")) {
        if (moveProfessional(target.dataset.professionalUp, -1)) await saveConfig("Ordem atualizada.");
      }
      if (target.matches("[data-professional-down]")) {
        if (moveProfessional(target.dataset.professionalDown, 1)) await saveConfig("Ordem atualizada.");
      }
      if (target.matches("[data-select-area]")) { selectedArea = target.dataset.selectArea; fillAll(); }
      if (target.matches("[data-new-area]")) {
        const slug = `departamento-${Date.now()}`;
        config.areas.push({ slug, title: "Novo departamento", seoTitle: "Novo departamento", eyebrow: "", description: "", when: "", subareas: [], documentsList: [], status: "active", order: config.areas.length + 1 });
        selectedArea = slug;
        fillAll();
      }
      if (target.matches("[data-select-faq]")) { selectedFaq = Number(target.dataset.selectFaq); fillAll(); }
      if (target.matches("[data-new-faq]")) { config.faq.push({ q: "Nova pergunta", a: "", category: "Geral", status: "active", showHome: true, showOnline: true }); selectedFaq = config.faq.length - 1; fillAll(); }
      if (target.matches("[data-delete-faq]")) { config.faq.splice(selectedFaq, 1); selectedFaq = 0; await saveConfig("Pergunta removida."); }
      if (target.matches("[data-select-article]")) { selectedArticle = Number(target.dataset.selectArticle); fillAll(); }
      if (target.matches("[data-new-article]")) { config.articles.push({ title: "Novo artigo", category: "Geral", status: "rascunho", excerpt: "", body: "" }); selectedArticle = config.articles.length - 1; fillAll(); }
      if (target.matches("[data-duplicate-article]")) { config.articles.push({ ...config.articles[selectedArticle], title: `${config.articles[selectedArticle].title} (cópia)`, status: "rascunho" }); selectedArticle = config.articles.length - 1; await saveConfig("Artigo duplicado."); }
      if (target.matches("[data-delete-article]")) { config.articles[selectedArticle].status = "arquivado"; await saveConfig("Artigo arquivado."); }
      if (target.matches("[data-repeat-add]")) {
        const list = target.closest("[data-repeat]");
        list.querySelector("[data-repeat-items]").insertAdjacentHTML("beforeend", repeatItem("", list.dataset.multiline === "true"));
      }
      if (target.matches("[data-repeat-remove]")) target.closest(".repeat-item")?.remove();
      if (target.matches("[data-repeat-up]")) {
        const item = target.closest(".repeat-item");
        if (item?.previousElementSibling) item.parentElement.insertBefore(item, item.previousElementSibling);
      }
      if (target.matches("[data-repeat-down]")) {
        const item = target.closest(".repeat-item");
        if (item?.nextElementSibling) item.parentElement.insertBefore(item.nextElementSibling, item);
      }
      if (target.matches("[data-link-add]")) {
        const list = target.closest("[data-link-list]");
        list.querySelector("[data-link-items]").insertAdjacentHTML("beforeend", linkItem({}));
      }
      if (target.matches("[data-link-remove]")) target.closest(".link-item")?.remove();
      if (target.matches("[data-link-up]")) {
        const item = target.closest(".link-item");
        if (item?.previousElementSibling) item.parentElement.insertBefore(item, item.previousElementSibling);
      }
      if (target.matches("[data-link-down]")) {
        const item = target.closest(".link-item");
        if (item?.nextElementSibling) item.parentElement.insertBefore(item.nextElementSibling, item);
      }
      if (target.matches("[data-export-contacts]")) exportCsv();
      if (target.matches("[data-refresh-contacts]")) await refresh();
      if (target.matches("[data-lead-status]")) {
        await api(`/api/admin/leads/${target.dataset.leadId}`, { method: "PATCH", body: JSON.stringify({ status: target.dataset.leadStatus }) });
        await refresh();
      }
      if (target.matches("[data-admin-logout]")) {
        await api("/api/auth/logout", { method: "POST", body: "{}" });
        showLogin("Sessão encerrada.");
      }
    } catch (error) {
      alert(error.message);
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.matches("[data-professional-filter]")) renderProfessionalList();
  });

  document.addEventListener("dragstart", (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-drag-professional]") : null;
    if (!item) return;
    draggedProfessionalKey = item.dataset.dragProfessional || "";
    event.dataTransfer?.setData("text/plain", draggedProfessionalKey);
  });

  document.addEventListener("dragover", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-drag-professional]")) event.preventDefault();
  });

  document.addEventListener("drop", async (event) => {
    const item = event.target instanceof Element ? event.target.closest("[data-drag-professional]") : null;
    if (!item || !draggedProfessionalKey || draggedProfessionalKey === item.dataset.dragProfessional) return;
    event.preventDefault();
    const ordered = professionals().map((person) => person.key).filter((key) => key !== draggedProfessionalKey);
    const targetIndex = ordered.indexOf(item.dataset.dragProfessional);
    ordered.splice(Math.max(targetIndex, 0), 0, draggedProfessionalKey);
    applyProfessionalOrder(ordered);
    draggedProfessionalKey = "";
    await saveConfig("Ordem manual atualizada.");
  });

  document.addEventListener("change", (event) => {
    const target = event.target instanceof HTMLInputElement ? event.target : null;
    if (!target || (!target.matches("[data-image-upload]") && !target.matches("[data-media-upload]") && !target.matches("[data-article-upload]") && !target.matches("[data-footer-upload]"))) return;
    const file = target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert("Envie imagens de até 2 MB neste painel.");
      target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (target.matches("[data-image-upload]")) {
        const input = target.closest("form").querySelector(`[name="${target.dataset.imageUpload}"]`);
        if (input) input.value = reader.result;
      } else if (target.matches("[data-article-upload]")) {
        const input = target.closest("form").querySelector(`[name="${target.dataset.articleUpload}"]`);
        if (input) input.value = reader.result;
      } else if (target.matches("[data-footer-upload]")) {
        const input = target.closest("form").querySelector(`[name="${target.dataset.footerUpload}"]`);
        if (input) input.value = reader.result;
      } else {
        config.media ??= {};
        config.media[target.dataset.mediaUpload] = reader.result;
        fillAll();
      }
    };
    reader.readAsDataURL(file);
  });

  document.querySelector("[data-admin-enter]")?.addEventListener("click", async () => {
    const email = document.querySelector("[data-admin-email]")?.value;
    const password = document.querySelector("[data-admin-password]")?.value;
    setStatus("Entrando...");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      await loadAdminData();
      showPanel();
      bindFormHandlers();
      setStatus("");
    } catch (error) {
      showLogin(error.message);
    }
  });

  document.querySelector("[data-admin-password]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.querySelector("[data-admin-enter]")?.click();
  });

  (async function init() {
    try {
      await api("/api/auth/me");
      await loadAdminData();
      showPanel();
      bindFormHandlers();
    } catch (_error) {
      showLogin("");
    }
  })();
})();
