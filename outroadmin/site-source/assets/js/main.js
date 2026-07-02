(function () {
  const STORAGE_CONFIG = "laSiteConfigV2";
  const STORAGE_CONTACTS = "laContactsV2";
  const baseConfig = window.LA_SITE_CONFIG || {};
  const storedConfig = safeJson(localStorage.getItem(STORAGE_CONFIG));
  const config = storedConfig || baseConfig;
  window.getLASiteConfig = () => config;
  window.LA_STORAGE_KEYS = { config: STORAGE_CONFIG, contacts: STORAGE_CONTACTS };

  function safeJson(value) { try { return value ? JSON.parse(value) : null; } catch (_error) { return null; } }
  function cleanNumber(number) { return String(number || config.office?.whatsappPrincipal || "").replace(/\D/g, ""); }
  function whatsappUrl(number, message) { return `https://wa.me/${cleanNumber(number)}?text=${encodeURIComponent(message)}`; }
  function getContacts() { return safeJson(localStorage.getItem(STORAGE_CONTACTS)) || []; }
  function saveContact(contact) { const rows = getContacts(); rows.unshift(contact); localStorage.setItem(STORAGE_CONTACTS, JSON.stringify(rows)); }
  function professionals() { return Object.entries(config.professionals || {}).map(([key, p]) => ({ key, ...p })).sort((a, b) => (a.order || 99) - (b.order || 99)); }
  function getProfessional(key) { return config.professionals?.[key] || config.professionals?.lorrayne; }
  function fallbackProfessional(key) { const p = getProfessional(key); return p?.whatsapp ? p : getProfessional("lorrayne"); }
  function routeForArea(areaTitle) {
    const area = (config.areas || []).find((item) => item.title === areaTitle || item.short === areaTitle || item.seoTitle === areaTitle);
    return config.chatbotRouting?.[areaTitle] || (area ? area.route : "lorrayne") || "lorrayne";
  }
  function defaultMessage(area) { return `Olá. Vim pelo site do Lanning Amaral Advogados e gostaria de solicitar atendimento${area ? ` sobre ${area}` : ""}. Poderiam me orientar sobre os próximos passos?`; }
  function openWhatsApp(professionalKey, area) { const p = fallbackProfessional(professionalKey); window.open(whatsappUrl(p.whatsapp, defaultMessage(area)), "_blank", "noopener"); }

  function setupNav() {
    const toggle = document.querySelector("[data-nav-toggle]"); const nav = document.querySelector("[data-site-nav]");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => { const open = nav.classList.toggle("is-open"); toggle.setAttribute("aria-expanded", String(open)); });
  }
  function setupReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) { items.forEach((i) => i.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("is-visible"); observer.unobserve(entry.target); } }), { threshold: .12 });
    items.forEach((item) => observer.observe(item));
  }
  function areaHref(area) { return `${location.pathname.includes("/areas/") ? "" : "areas/"}${area.slug}.html`; }
  function renderAreas() {
    document.querySelectorAll("[data-area-cards]").forEach((container) => {
      const limit = Number(container.dataset.limit || 0);
      const areas = limit ? config.areas.slice(0, limit) : config.areas;
      container.innerHTML = areas.map((area) => `<article class="area-card reveal"><span>${area.eyebrow}</span><h3>${area.title}</h3><p>${area.description}</p><a class="card-link" href="${areaHref(area)}">Conhecer departamento</a></article>`).join("");
    });
  }
  function initials(name) { return String(name || "LA").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
  function renderTeam() {
    document.querySelectorAll("[data-team-cards]").forEach((container) => {
      const limit = Number(container.dataset.limit || 0);
      let people = professionals().filter((person) => person.status === "active" && person.publicVisible !== false);
      if (limit) people = people.slice(0, limit);
      container.innerHTML = people.map((person) => {
        const avatar = person.photo ? `<img class="team-avatar" src="${person.photo}" alt="Foto de ${person.displayName || person.name}">` : `<div class="team-avatar" aria-hidden="true">${initials(person.displayName || person.name)}</div>`;
        return `<article class="team-card reveal">${avatar}<div><h3>${person.displayName || person.name}</h3><p><strong>${person.role || ""}</strong>${person.oab ? ` · ${person.oab}` : ""}</p><p>${person.bio || ""}</p><div class="team-areas">${(person.areas || []).map((area) => `<span class="pill">${area}</span>`).join("")}</div>${person.email ? `<p><a href="mailto:${person.email}">${person.email}</a></p>` : ""}<div class="team-actions">${person.whatsapp ? `<button class="button button-primary" type="button" data-wa-professional="${person.key}">Falar pelo WhatsApp</button>` : ""}</div></div></article>`;
      }).join("") || `<p class="muted">Equipe em atualização.</p>`;
    });
  }
  function renderSteps() { document.querySelectorAll("[data-steps]").forEach((c) => c.innerHTML = (config.steps || []).map((s) => `<li>${s}</li>`).join("")); }
  function renderDocuments() { document.querySelectorAll("[data-documents]").forEach((c) => c.innerHTML = (config.documents || []).map((d) => `<article class="doc-card reveal"><h3>${d.title}</h3><p>${d.text}</p></article>`).join("")); }
  function renderFaq() { document.querySelectorAll("[data-faq]").forEach((c) => c.innerHTML = (config.faq || []).map((item) => `<article class="faq-item reveal"><h3>${item.q}</h3><p>${item.a}</p></article>`).join("")); }
  function renderBlog() {
    document.querySelectorAll("[data-blog-categories]").forEach((c) => c.innerHTML = (config.blogCategories || []).map((cat) => `<span>${cat}</span>`).join(""));
    document.querySelectorAll("[data-articles]").forEach((c) => c.innerHTML = (config.articles || []).map((a) => `<article class="article-card reveal"><span>${a.category}</span><h3>${a.title}</h3><p>Conteúdo informativo preparado para publicação.</p></article>`).join(""));
  }
  function setupAreaSelect() { document.querySelectorAll("[data-area-select]").forEach((select) => { select.innerHTML = [`<option value="">Selecione</option>`].concat((config.areas || []).map((a) => `<option value="${a.title}">${a.title}</option>`)).join(""); }); }
  async function filesToPayload(input) {
    const files = [...(input?.files || [])];
    const limited = files.slice(0, 4);
    return Promise.all(limited.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: reader.result });
      reader.onerror = () => resolve({ name: file.name, type: file.type, size: file.size, dataUrl: "" });
      reader.readAsDataURL(file);
    })));
  }
  function setupContactForm() {
    const form = document.querySelector("[data-contact-form]"); if (!form) return;
    const status = form.querySelector("[data-form-status]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form); const fileInput = form.querySelector('input[type="file"]'); const docs = await filesToPayload(fileInput);
      const responsible = routeForArea(data.get("area"));
      const contact = { id: `lead-${Date.now()}`, data: new Date().toISOString(), nome: data.get("nome"), telefone: data.get("telefone"), email: data.get("email"), cidade: data.get("cidade"), area: data.get("area"), resumo: data.get("resumo"), urgencia: data.get("urgencia"), documentos: docs, profissionalSugerido: responsible, status: "novo", observacoes: "", origem: "formulário público", proximoPasso: "", dataRetorno: "" };
      saveContact(contact);
      const body = [`Nova solicitação de atendimento pelo site.`, "", `Nome: ${contact.nome}`, `WhatsApp: ${contact.telefone}`, `E-mail: ${contact.email || "Não informado"}`, `Cidade: ${contact.cidade}`, `Área: ${contact.area}`, `Urgência: ${contact.urgencia}`, `Documentos: ${docs.map((d) => d.name).join("; ") || "Não anexados"}`, "", "Resumo:", contact.resumo].join("\n");
      window.location.href = `mailto:${config.office.emails.join(",")}?subject=${encodeURIComponent("Solicitação de atendimento - site")}&body=${encodeURIComponent(body)}`;
      if (status) status.textContent = "Solicitação registrada. Seu aplicativo de e-mail será aberto para envio aos endereços configurados.";
      form.reset();
    });
  }
  function setupWhatsAppMenu() {
    const menu = document.querySelector("[data-wa-menu]");
    document.querySelectorAll("[data-wa-toggle], [data-wa-toggle-main]").forEach((button) => button.addEventListener("click", () => { if (menu) menu.hidden = !menu.hidden; }));
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null; if (!target) return;
      const pro = target.closest("[data-wa-professional]"); if (pro && !pro.disabled) openWhatsApp(pro.dataset.waProfessional);
      const area = target.closest("[data-wa-area]"); if (area) openWhatsApp(routeForArea(area.dataset.waArea), area.dataset.waArea);
    });
  }
  const chat = { step: 0, answers: {} };
  const questions = [
    { key: "intro", type: "message", text: "Olá. Podemos ajudar a direcionar seu atendimento. Responda algumas perguntas rápidas para que sua solicitação seja encaminhada ao setor adequado." },
    { key: "nome", type: "input", text: "Qual é o seu nome?", placeholder: "Seu nome" },
    { key: "cidade", type: "input", text: "Qual é sua cidade?", placeholder: "Ex.: Jaciara/MT" },
    { key: "area", type: "choice", text: "Sobre qual assunto você precisa de atendimento?", options: [] },
    { key: "urgencia", type: "choice", text: "Você possui prazo, audiência, bloqueio, notificação ou alguma urgência?", options: ["Sim, existe urgência", "Não sei informar", "Não há urgência imediata"] },
    { key: "documentos", type: "choice", text: "Você já possui documentos relacionados ao caso?", options: ["Sim", "Não", "Tenho parte dos documentos"] },
  ];
  function openChatbot() { const widget = document.querySelector("[data-chatbot]"); if (!widget) return; widget.hidden = false; chat.step = 0; chat.answers = {}; renderChat(); }
  function closeChatbot() { const widget = document.querySelector("[data-chatbot]"); if (widget) widget.hidden = true; }
  function renderChat() {
    const body = document.querySelector("[data-chat-body]"); const actions = document.querySelector("[data-chat-actions]"); if (!body || !actions) return;
    const q = questions[chat.step];
    if (!q) {
      const responsible = routeForArea(chat.answers.area); const p = fallbackProfessional(responsible);
      const message = `Olá, meu nome é ${chat.answers.nome}. Vim pelo site do Lanning Amaral Advogados. Sou de ${chat.answers.cidade}. Preciso de atendimento sobre ${chat.answers.area}. Urgência: ${chat.answers.urgencia}. Documentos: ${chat.answers.documentos}. Gostaria de receber orientação sobre os próximos passos.`;
      const lead = { id: `chat-${Date.now()}`, data: new Date().toISOString(), nome: chat.answers.nome, telefone: "", email: "", cidade: chat.answers.cidade, area: chat.answers.area, resumo: "Contato iniciado pelo assistente de atendimento.", urgencia: chat.answers.urgencia, documentos: [], profissionalSugerido: responsible, status: "novo", observacoes: "", origem: "chatbot", proximoPasso: "", dataRetorno: "" };
      body.innerHTML = `<p>Obrigado. Você pode escolher como deseja continuar o atendimento.</p>`;
      actions.innerHTML = `<a class="button button-accent" href="${whatsappUrl(p.whatsapp, message)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><button type="button" data-chat-save>Solicitar contato</button><a class="button button-ghost-dark" href="contato.html">Continuar pelo formulário</a>`;
      actions.querySelector("[data-chat-save]")?.addEventListener("click", () => { saveContact(lead); body.innerHTML = "<p>Solicitação registrada. Para facilitar o retorno da equipe, você também pode continuar pelo WhatsApp ou complementar as informações no formulário.</p>"; actions.innerHTML = `<a class="button button-accent" href="${whatsappUrl(p.whatsapp, message)}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><a class="button button-ghost-dark" href="contato.html">Continuar pelo formulário</a>`; });
      return;
    }
    if (q.type === "message") { body.innerHTML = `<p>${q.text}</p>`; actions.innerHTML = `<button class="button-accent" type="button" data-chat-next>Começar</button>`; return; }
    if (q.type === "input") { body.innerHTML = `<p>${q.text}</p><input data-chat-input placeholder="${q.placeholder || ""}">`; actions.innerHTML = `<button class="button-accent" type="button" data-chat-input-next>Continuar</button>`; setTimeout(() => body.querySelector("input")?.focus(), 20); return; }
    const options = q.key === "area" ? (config.areas || []).map((a) => a.title) : q.options;
    body.innerHTML = `<p>${q.text}</p>`; actions.innerHTML = options.map((option) => `<button type="button" data-chat-answer="${option}">${option}</button>`).join("");
  }
  function setupChatbot() {
    document.querySelectorAll("[data-open-chatbot]").forEach((button) => button.addEventListener("click", openChatbot)); document.querySelector("[data-chat-close]")?.addEventListener("click", closeChatbot);
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null; if (!target) return;
      if (target.matches("[data-chat-next]")) { chat.step += 1; renderChat(); }
      if (target.matches("[data-chat-answer]")) { chat.answers[questions[chat.step].key] = target.dataset.chatAnswer; chat.step += 1; renderChat(); }
      if (target.matches("[data-chat-input-next]")) { const input = document.querySelector("[data-chat-input]"); const value = input?.value.trim(); if (!value) { input?.focus(); return; } chat.answers[questions[chat.step].key] = value; chat.step += 1; renderChat(); }
    });
  }
  document.addEventListener("DOMContentLoaded", () => { setupNav(); renderAreas(); renderTeam(); renderSteps(); renderDocuments(); renderFaq(); renderBlog(); setupAreaSelect(); setupContactForm(); setupWhatsAppMenu(); setupChatbot(); setupReveal(); });
})();
