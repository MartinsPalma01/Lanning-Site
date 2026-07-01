(function () {
  let config = window.LA_SITE_CONFIG || {};
  const articleFilters = { category: "Todos", query: "", author: "", sort: "recentes", featured: "todos" };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function cleanNumber(number) {
    return String(number || config.office?.whatsappPrincipal || "").replace(/\D/g, "");
  }

  function formatPhone(number) {
    const digits = cleanNumber(number).replace(/^55/, "");
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return number || "";
  }

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

  function treatmentPrefix(person = {}) {
    const treatment = person.treatment || "auto";
    if (treatment === "dr") return "Dr.";
    if (treatment === "dra") return "Dra.";
    if (treatment === "none") return "";
    if (treatment === "custom") return String(person.treatmentCustom || "").trim();
    if (sortName(person.role) === "advogado") return "Dr.";
    if (sortName(person.role) === "advogada") return "Dra.";
    return "";
  }

  function professionalName(person = {}) {
    const cleanName = stripTreatment(person.name || person.displayName || "Profissional");
    return [treatmentPrefix(person), cleanName].filter(Boolean).join(" ");
  }

  function whatsappUrl(number, message) {
    return `https://wa.me/${cleanNumber(number)}?text=${encodeURIComponent(message)}`;
  }

  async function loadConfig() {
    try {
      const response = await fetch("/api/public-config", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Config API unavailable");
      const payload = await response.json();
      config = payload.config || payload;
      window.LA_SITE_CONFIG = config;
    } catch (_error) {
      config = window.LA_SITE_CONFIG || {};
    }
    window.getLASiteConfig = () => config;
  }

  function professionals() {
    return Object.entries(config.professionals || {})
      .map(([key, person]) => ({ key, ...person }))
      .sort((a, b) => (a.order || 99) - (b.order || 99));
  }

  function getProfessional(key) {
    const people = config.professionals || {};
    return people[key] || people.lorrayne || Object.values(people)[0] || {};
  }

  function fallbackProfessional(key) {
    const person = getProfessional(key);
    return person?.whatsapp ? person : getProfessional("lorrayne");
  }

  function routeForArea(areaTitle) {
    const area = (config.areas || []).find((item) =>
      item.title === areaTitle || item.short === areaTitle || item.seoTitle === areaTitle
    );
    return config.chatbotRouting?.[areaTitle] || area?.route || "lorrayne";
  }

  function defaultMessage(area) {
    return config.whatsappSettings?.defaultMessage || `Olá. Vim pelo site do Lanning Amaral Advogados e gostaria de solicitar atendimento${area ? ` sobre ${area}` : ""}. Poderiam me orientar sobre os próximos passos?`;
  }

  function openWhatsApp(professionalKey, area) {
    const person = fallbackProfessional(professionalKey);
    window.open(whatsappUrl(person.whatsapp, defaultMessage(area)), "_blank", "noopener");
  }

  function setupNav() {
    const toggle = document.querySelector("[data-nav-toggle]");
    const nav = document.querySelector("[data-site-nav]");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
  }

  function setupReveal() {
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((item) => observer.observe(item));
  }

  function areaHref(area) {
    return `${location.pathname.includes("/areas/") ? "" : "areas/"}${area.slug}.html`;
  }

  function renderAreas() {
    document.querySelectorAll("[data-area-cards]").forEach((container) => {
      const limit = Number(container.dataset.limit || 0);
      const areas = limit ? (config.areas || []).slice(0, limit) : (config.areas || []);
      container.innerHTML = areas.map((area) => (
        `<article class="area-card reveal"><span>${escapeHtml(area.eyebrow)}</span><h3>${escapeHtml(area.title)}</h3><p>${escapeHtml(area.description)}</p><a class="card-link" href="${escapeHtml(areaHref(area))}">Conhecer departamento</a></article>`
      )).join("");
    });
  }

  function renderHelpCards() {
    document.querySelectorAll("[data-help-cards]").forEach((container) => {
      container.innerHTML = (config.helpCards || []).map((card) =>
        `<a class="help-card reveal" href="${escapeHtml(card.href)}"><h3>${escapeHtml(card.title)}</h3><p>${escapeHtml(card.text)}</p></a>`
      ).join("");
    });
  }

  function initials(name) {
    return String(name || "LA").split(/\s+/).filter(Boolean).slice(0, 2)
      .map((part) => part[0]).join("").toUpperCase();
  }

  function renderTeam() {
    document.querySelectorAll("[data-team-cards]").forEach((container) => {
      const limit = Number(container.dataset.limit || 0);
      let people = professionals().filter((person) => (person.status === undefined || person.status === "active") && person.publicVisible !== false);
      people = people.sort((a, b) => {
        if (limit && Boolean(b.highlight) !== Boolean(a.highlight)) return Number(Boolean(b.highlight)) - Number(Boolean(a.highlight));
        return sortName(a.name || a.displayName).localeCompare(sortName(b.name || b.displayName), "pt-BR");
      });
      if (limit) people = people.slice(0, limit);
      container.innerHTML = people.map((person) => {
        const name = professionalName(person);
        const avatar = person.photo
          ? `<img class="team-avatar" src="${escapeHtml(person.photo)}" alt="Foto de ${escapeHtml(name)}">`
          : `<div class="team-avatar" aria-hidden="true">${escapeHtml(initials(name))}</div>`;
        const areas = (person.areas || []).map((area) => `<span class="pill">${escapeHtml(area)}</span>`).join("");
        const whatsapp = person.whatsapp && person.showWhatsApp !== false
          ? `<button class="button button-primary" type="button" data-wa-professional="${escapeHtml(person.key)}">Falar pelo WhatsApp</button>`
          : `<a class="button button-ghost-dark" href="${location.pathname.includes("/areas/") ? "../" : ""}contato.html">Solicitar atendimento</a>`;
        const instagram = person.instagram && person.showInstagram
          ? `<a class="social-link" href="${escapeHtml(person.instagram)}" target="_blank" rel="noopener">Instagram</a>`
          : "";
        return `<article class="team-card reveal${person.highlight ? " is-highlighted" : ""}">${avatar}<div><h3>${escapeHtml(name)}</h3><p><strong>${escapeHtml(person.role)}</strong>${person.oab ? ` &middot; ${escapeHtml(person.oab)}` : ""}</p><p>${escapeHtml(person.bio)}</p><div class="team-areas">${areas}</div><div class="team-actions">${whatsapp}${instagram}<a class="profile-link" href="${location.pathname.includes("/areas/") ? "../" : ""}contato.html">Ver perfil</a></div></div></article>`;
      }).join("") || `<p class="muted">Equipe em atualização.</p>`;
    });
  }

  function renderSteps() {
    document.querySelectorAll("[data-steps]").forEach((container) => {
      container.innerHTML = (config.steps || []).map((step) => `<li>${escapeHtml(step)}</li>`).join("");
    });
  }

  function renderDocuments() {
    document.querySelectorAll("[data-documents]").forEach((container) => {
      container.innerHTML = (config.documents || []).map((doc) =>
        `<details class="doc-card reveal"><summary>${escapeHtml(doc.title)}</summary><p>${escapeHtml(doc.text)}</p></details>`
      ).join("");
    });
    document.querySelectorAll("[data-meu-inss-note]").forEach((container) => {
      container.textContent = config.pageTexts?.meuInssNotice || "";
    });
  }

  function renderFaq() {
    document.querySelectorAll("[data-faq]").forEach((container) => {
      container.innerHTML = (config.faq || []).map((item) =>
        `<article class="faq-item reveal"><h3>${escapeHtml(item.q)}</h3><p>${escapeHtml(item.a)}</p></article>`
      ).join("");
    });
  }

  function articleDate(article) {
    return article.updatedAt || article.publishedAt || article.date || "";
  }

  function articleSummary(article) {
    const excerpt = String(article.excerpt || "").trim();
    if (excerpt) return excerpt;
    const body = String(article.body || "").replace(/\s+/g, " ").trim();
    if (body) return body.length > 170 ? `${body.slice(0, 167).trim()}...` : body;
    return "Orientação jurídica sobre o tema, com informações gerais para ajudar na compreensão inicial.";
  }

  function publishedArticles() {
    return (config.articles || [])
      .filter((article) => !["rascunho", "arquivado", "inactive"].includes(String(article.status || "publicado").toLowerCase()));
  }

  function articleCategories(articles) {
    const configured = config.blogCategories || [];
    const fromArticles = articles.map((article) => article.category).filter(Boolean);
    return [...new Set([...configured, ...fromArticles])];
  }

  function filteredArticles() {
    const query = sortName(articleFilters.query);
    const articles = publishedArticles().filter((article) => {
      const categoryOk = articleFilters.category === "Todos" || article.category === articleFilters.category;
      const authorOk = !articleFilters.author || (article.author || "") === articleFilters.author;
      const featuredOk = articleFilters.featured !== "destaques" || article.featured;
      const haystack = sortName([article.title, article.category, article.author, article.excerpt, article.body].join(" "));
      return categoryOk && authorOk && featuredOk && (!query || haystack.includes(query));
    });
    return articles.sort((a, b) => {
      if (articleFilters.sort === "mais-lidos") return Number(b.views || 0) - Number(a.views || 0);
      if (articleFilters.sort === "destaques") return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || String(articleDate(b)).localeCompare(String(articleDate(a)));
      return String(articleDate(b)).localeCompare(String(articleDate(a)));
    });
  }

  function renderBlog() {
    const allArticles = publishedArticles();
    const categories = articleCategories(allArticles);
    document.querySelectorAll("[data-blog-categories]").forEach((container) => {
      const buttons = ["Todos", ...categories].map((category) => {
        const count = category === "Todos" ? allArticles.length : allArticles.filter((article) => article.category === category).length;
        return `<button type="button" data-article-category="${escapeHtml(category)}" class="${articleFilters.category === category ? "is-active" : ""}">${escapeHtml(category)} <span>${count}</span></button>`;
      }).join("");
      container.innerHTML = buttons;
    });
    document.querySelectorAll("[data-article-author]").forEach((select) => {
      const authors = [...new Set(allArticles.map((article) => article.author).filter(Boolean))];
      select.innerHTML = [`<option value="">Todos os autores</option>`].concat(authors.map((author) => `<option value="${escapeHtml(author)}"${articleFilters.author === author ? " selected" : ""}>${escapeHtml(author)}</option>`)).join("");
    });
    document.querySelectorAll("[data-article-search]").forEach((input) => {
      if (input.value !== articleFilters.query) input.value = articleFilters.query;
    });
    document.querySelectorAll("[data-article-sort]").forEach((select) => { select.value = articleFilters.sort; });
    document.querySelectorAll("[data-article-featured-filter]").forEach((select) => { select.value = articleFilters.featured; });
    const articles = filteredArticles();
    document.querySelectorAll("[data-articles]").forEach((container) => {
      container.innerHTML = articles.map((article, index) => {
        const date = articleDate(article);
        const dateObject = date ? new Date(String(date).includes("T") ? date : `${date}T00:00:00`) : null;
        const formattedDate = dateObject && !Number.isNaN(dateObject.getTime()) ? dateObject.toLocaleDateString("pt-BR") : "Data em atualização";
        const author = article.author || "Lanning Amaral Advogados";
        const body = String(article.body || "").trim() || articleSummary(article);
        const cover = article.cover ? `<img class="article-cover" src="${escapeHtml(article.cover)}" alt="Imagem de capa do artigo ${escapeHtml(article.title)}">` : "";
        return `<article class="article-card reveal" id="artigo-${index}">
          ${cover}
          <div class="article-meta"><span>${escapeHtml(article.category || "Orientação")}</span>${article.featured ? "<span>Destaque</span>" : ""}</div>
          <h3>${escapeHtml(article.title)}</h3>
          <p>${escapeHtml(articleSummary(article))}</p>
          <p class="article-byline">${escapeHtml(author)} · ${escapeHtml(formattedDate)}</p>
          <details class="article-read"><summary>Ler orientação</summary><p>${escapeHtml(body)}</p>${article.externalUrl ? `<a class="card-link" href="${escapeHtml(article.externalUrl)}" target="_blank" rel="noopener">Abrir conteúdo completo</a>` : ""}</details>
        </article>`;
      }).join("") || `<div class="empty-state"><h3>Ainda não há publicações nesta categoria.</h3><p>Você pode buscar outro termo, escolher “Todos” ou falar com a equipe para receber orientação inicial.</p></div>`;
    });
  }

  function contactsFor(place) {
    return professionals().filter((person) => {
      if ((person.status !== undefined && person.status !== "active") || person.internalOnly) return false;
      if (place === "footer") return person.showInFooter;
      if (place === "contact") return person.showOnContact;
      return person.publicVisible !== false;
    });
  }

  function resolveHref(href) {
    const value = String(href || "");
    if (!value || /^(https?:|mailto:|tel:|#)/i.test(value) || value.startsWith("/")) return value;
    return `${location.pathname.includes("/areas/") ? "../" : ""}${value}`;
  }

  function footerSettings() {
    const office = config.office || {};
    const footer = config.footer || {};
    return {
      logo: footer.logo || "",
      shortText: footer.shortText || office.shortText || "Advocacia em Jaciara/MT, com atendimento técnico, comunicação clara e análise individualizada de cada demanda.",
      notice: footer.notice || "As informações deste site possuem caráter informativo e não substituem a análise individualizada do caso por advogado. O envio de mensagem ou formulário não caracteriza contratação automática.",
      showNotice: footer.showNotice !== false,
      attendanceTitle: footer.attendanceTitle || "Atendimento",
      officeName: footer.officeName || office.name || "Lanning Amaral Advogados",
      address: footer.address || office.address || "",
      cep: footer.cep || office.cep || "",
      whatsappPrincipal: footer.whatsappPrincipal || office.generalWhatsapp || office.whatsappPrincipal || "",
      phonePrincipal: footer.phonePrincipal || office.generalPhone || "",
      emailPrincipal: footer.emailPrincipal || "",
      instagram: footer.instagram || office.instagram || "",
      hours: footer.hours || office.hours || "",
      showQuickLinks: footer.showQuickLinks !== false,
      showAreas: footer.showAreas !== false,
      columnOrder: footer.columnOrder || ["Identidade institucional", "Atendimento", "Links rápidos", "Áreas de atuação"],
      quickLinks: footer.quickLinks || [
        { label: "O Escritório", href: "sobre.html" },
        { label: "Equipe", href: "equipe.html" },
        { label: "Áreas de Atuação", href: "areas.html" },
        { label: "Atendimento Online", href: "atendimento-online.html" },
        { label: "Artigos", href: "artigos.html" },
        { label: "Contato", href: "contato.html" },
        { label: "Política de Privacidade", href: "politica-privacidade.html" },
        { label: "Termos de Uso", href: "termos-de-uso.html" },
      ],
      areas: footer.areas || (config.blogCategories || []).map((label) => ({ label, href: "areas.html" })),
    };
  }

  function footerPrimaryContact(settings) {
    const footerPeople = contactsFor("footer");
    const reception = footerPeople.find((person) => person.showAsReception && person.whatsapp && person.showWhatsApp !== false);
    if (reception) return { label: "Recepção / Atendimento Geral", whatsapp: reception.whatsapp };
    if (settings.whatsappPrincipal) return { label: "WhatsApp", whatsapp: settings.whatsappPrincipal };
    const main = footerPeople.find((person) => person.showAsMainContact && person.whatsapp && person.showWhatsApp !== false);
    if (main) return { label: professionalName(main), whatsapp: main.whatsapp };
    if (settings.phonePrincipal) return { label: "Telefone", phone: settings.phonePrincipal };
    return null;
  }

  function whatsappButton(person, label = "Falar pelo WhatsApp") {
    if (!person?.whatsapp || person.showWhatsApp === false) return "";
    return `<button class="button button-primary" type="button" data-wa-professional="${escapeHtml(person.key)}">${escapeHtml(label)}</button>`;
  }

  function renderDynamicContacts() {
    const office = config.office || {};
    const footer = footerSettings();
    document.querySelectorAll("[data-office-short]").forEach((item) => {
      item.textContent = footer.shortText || "";
    });
    document.querySelectorAll("[data-footer-logo]").forEach((image) => {
      if (footer.logo) image.src = footer.logo;
    });
    document.querySelectorAll("[data-footer-notice]").forEach((item) => {
      item.textContent = footer.notice || "";
      item.hidden = !footer.showNotice;
    });
    document.querySelectorAll("[data-footer-column]").forEach((column) => {
      const index = footer.columnOrder.indexOf(column.dataset.footerColumn);
      column.style.order = String(index >= 0 ? index + 1 : 10);
    });
    document.querySelectorAll("[data-footer-attendance], [data-footer-office], [data-footer-service]").forEach((box) => {
      const primary = footerPrimaryContact(footer);
      const contactRow = primary?.whatsapp
        ? `<p><a href="${escapeHtml(whatsappUrl(primary.whatsapp, defaultMessage()))}">WhatsApp: ${escapeHtml(formatPhone(primary.whatsapp))}</a></p>`
        : primary?.phone
          ? `<p>Telefone: ${escapeHtml(formatPhone(primary.phone))}</p>`
          : "";
      box.innerHTML = `<h2>${escapeHtml(footer.attendanceTitle)}</h2><p><strong>${escapeHtml(footer.officeName)}</strong><br>${escapeHtml(footer.address)}<br>CEP ${escapeHtml(footer.cep)}</p>${contactRow}${footer.phonePrincipal && primary?.whatsapp ? `<p>Telefone: ${escapeHtml(formatPhone(footer.phonePrincipal))}</p>` : ""}${footer.emailPrincipal ? `<p><a href="mailto:${escapeHtml(footer.emailPrincipal)}">${escapeHtml(footer.emailPrincipal)}</a></p>` : ""}<p>${escapeHtml(footer.hours)}</p>${footer.instagram ? `<p><a href="${escapeHtml(footer.instagram)}" target="_blank" rel="noopener">Instagram do escritório</a></p>` : ""}`;
    });
    document.querySelectorAll("[data-footer-links]").forEach((box) => {
      box.hidden = !footer.showQuickLinks;
      box.innerHTML = `<h2>Links rápidos</h2>${(footer.quickLinks || []).map((item) => `<a href="${escapeHtml(resolveHref(item.href))}">${escapeHtml(item.label)}</a>`).join("")}`;
    });
    document.querySelectorAll("[data-footer-areas]").forEach((box) => {
      box.hidden = !footer.showAreas;
      box.innerHTML = `<h2>Áreas de atuação</h2>${(footer.areas || []).map((item) => `<a href="${escapeHtml(resolveHref(item.href))}">${escapeHtml(item.label)}</a>`).join("")}`;
    });
    document.querySelectorAll("[data-contact-sidebar]").forEach((box) => {
      const people = contactsFor("contact");
      const peopleHtml = people.map((person) => `<article class="contact-person"><h3>${escapeHtml(professionalName(person))}</h3><p>${escapeHtml(person.role || "")}${person.oab ? ` · ${escapeHtml(person.oab)}` : ""}</p>${person.whatsapp && person.showWhatsApp !== false ? `<p><a href="${escapeHtml(whatsappUrl(person.whatsapp, defaultMessage()))}">WhatsApp: ${escapeHtml(formatPhone(person.whatsapp))}</a></p>` : ""}${person.phone && person.showPhone ? `<p>Telefone: ${escapeHtml(formatPhone(person.phone))}</p>` : ""}${person.email && person.showEmail ? `<p><a href="mailto:${escapeHtml(person.email)}">${escapeHtml(person.email)}</a></p>` : ""}${person.instagram && person.showInstagram ? `<p><a href="${escapeHtml(person.instagram)}" target="_blank" rel="noopener">Instagram</a></p>` : ""}${whatsappButton(person)}</article>`).join("");
      const general = office.generalWhatsapp ? `<article class="contact-person"><h3>Recepção / Atendimento Geral</h3><p>Atendimento inicial do escritório.</p><p><a href="${escapeHtml(whatsappUrl(office.generalWhatsapp, defaultMessage()))}">WhatsApp: ${escapeHtml(formatPhone(office.generalWhatsapp))}</a></p><button class="button button-ghost-dark" type="button" data-wa-professional="__office">Falar com a recepção</button></article>` : "";
      box.innerHTML = `<h2>Dados do escritório</h2><p><strong>${escapeHtml(office.name)}</strong><br>${escapeHtml(office.address)}<br>CEP ${escapeHtml(office.cep || "")}</p><p><strong>Horário</strong><br>${escapeHtml(office.hours || "")}</p><h2>Equipe de atendimento</h2>${peopleHtml || "<p>Nenhum contato da equipe selecionado para exibição no momento.</p>"}${general}`;
    });
  }

  function renderWhatsAppMenu() {
    document.querySelectorAll("[data-wa-menu]").forEach((menu) => {
      const people = contactsFor("contact").filter((person) => person.whatsapp && person.showWhatsApp !== false);
      const options = people.map((person) => `<button type="button" data-wa-professional="${escapeHtml(person.key)}">Falar com ${escapeHtml(professionalName(person))}</button>`).join("");
      const general = config.office?.whatsappPrincipal ? `<button type="button" data-wa-professional="__office">Não sei com quem falar</button>` : "";
      menu.innerHTML = `${options}${general}<button type="button" data-open-chatbot>Solicitar direcionamento</button>`;
    });
  }

  function setupArticleFilters() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target.closest("[data-article-category]") : null;
      if (!target) return;
      articleFilters.category = target.dataset.articleCategory || "Todos";
      renderBlog();
    });
    document.querySelectorAll("[data-article-search]").forEach((input) => {
      input.addEventListener("input", () => {
        articleFilters.query = input.value || "";
        renderBlog();
      });
    });
    document.querySelectorAll("[data-article-author]").forEach((select) => {
      select.addEventListener("change", () => {
        articleFilters.author = select.value || "";
        renderBlog();
      });
    });
    document.querySelectorAll("[data-article-sort]").forEach((select) => {
      select.addEventListener("change", () => {
        articleFilters.sort = select.value || "recentes";
        renderBlog();
      });
    });
    document.querySelectorAll("[data-article-featured-filter]").forEach((select) => {
      select.addEventListener("change", () => {
        articleFilters.featured = select.value || "todos";
        renderBlog();
      });
    });
  }

  function setupAreaSelect() {
    document.querySelectorAll("[data-area-select]").forEach((select) => {
      select.innerHTML = [`<option value="">Selecione</option>`]
        .concat((config.areas || []).map((area) => `<option value="${escapeHtml(area.title)}">${escapeHtml(area.title)}</option>`))
        .join("");
    });
  }

  function applyDynamicMedia() {
    const media = config.media || {};
    if (media.logoPrincipal) {
      document.querySelectorAll('img[src$="logo-main.png"], img[src$="logo-dark.png"], img[src$="logo-green.png"]')
        .forEach((image) => { image.src = media.logoPrincipal; });
    }
    if (media.imagemInstitucional) {
      document.querySelectorAll('img[src*="office-wall"], img[src*="facade"], img[src*="brand-card"]')
        .forEach((image) => { image.src = media.imagemInstitucional; });
    }
  }

  async function postLead(payload) {
    const response = await fetch("/api/leads", {
      method: "POST",
      body: payload instanceof FormData ? payload : JSON.stringify(payload),
      headers: payload instanceof FormData ? undefined : { "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Nao foi possivel enviar sua solicitacao.");
    return data;
  }

  function setupContactForm() {
    const form = document.querySelector("[data-contact-form]");
    if (!form) return;
    const status = form.querySelector("[data-form-status]");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const area = data.get("area");
      data.set("origem", "formulario publico");
      data.set("profissionalSugerido", routeForArea(area));
      if (status) status.textContent = "Enviando sua solicitação com segurança...";
      try {
        await postLead(data);
        if (status) status.textContent = "Solicitação registrada. A equipe recebeu seus dados e retornará pelo contato informado.";
        form.reset();
      } catch (error) {
        const person = fallbackProfessional(routeForArea(area));
        if (status) {
          status.innerHTML = `Não foi possível concluir o envio agora. <a href="${escapeHtml(whatsappUrl(person.whatsapp, defaultMessage(area)))}" target="_blank" rel="noopener">Continuar pelo WhatsApp</a>.`;
        }
        console.error(error);
      }
    });
  }

  function setupWhatsAppMenu() {
    const menu = document.querySelector("[data-wa-menu]");
    document.querySelectorAll("[data-wa-toggle], [data-wa-toggle-main]").forEach((button) => {
      button.addEventListener("click", () => { if (menu) menu.hidden = !menu.hidden; });
    });
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const professional = target.closest("[data-wa-professional]");
      if (professional && !professional.disabled) {
        if (professional.dataset.waProfessional === "__office") {
          window.open(whatsappUrl(config.office?.generalWhatsapp || config.office?.whatsappPrincipal, defaultMessage()), "_blank", "noopener");
        } else openWhatsApp(professional.dataset.waProfessional);
      }
      const area = target.closest("[data-wa-area]");
      if (area) openWhatsApp(routeForArea(area.dataset.waArea), area.dataset.waArea);
    });
  }

  const chat = { step: 0, answers: {} };
  const questions = [
    { key: "intro", type: "message", text: "Olá. Podemos ajudar a direcionar seu atendimento. Responda algumas perguntas rápidas para que sua solicitação seja encaminhada ao setor adequado." },
    { key: "nome", type: "input", text: "Qual é o seu nome?", placeholder: "Seu nome" },
    { key: "telefone", type: "input", text: "Qual WhatsApp a equipe pode usar para retorno?", placeholder: "(66) 9 0000-0000" },
    { key: "cidade", type: "input", text: "Qual é sua cidade?", placeholder: "Ex.: Jaciara/MT" },
    { key: "area", type: "choice", text: "Sobre qual assunto você precisa de atendimento?", options: [] },
    { key: "urgencia", type: "choice", text: "Existe urgência, audiência, bloqueio, intimação ou prazo?", options: ["Sim, existe urgência", "Não sei informar", "Não há urgência imediata"] },
    { key: "documentos", type: "choice", text: "Você já possui documentos relacionados ao caso?", options: ["Sim", "Não", "Tenho parte dos documentos"] },
  ];

  function openChatbot() {
    const widget = document.querySelector("[data-chatbot]");
    if (!widget) return;
    widget.hidden = false;
    chat.step = 0;
    chat.answers = {};
    renderChat();
  }

  function closeChatbot() {
    const widget = document.querySelector("[data-chatbot]");
    if (widget) widget.hidden = true;
  }

  function renderChat() {
    const body = document.querySelector("[data-chat-body]");
    const actions = document.querySelector("[data-chat-actions]");
    if (!body || !actions) return;
    const question = questions[chat.step];
    if (!question) {
      const responsible = routeForArea(chat.answers.area);
      const person = fallbackProfessional(responsible);
      const message = `Olá, meu nome é ${chat.answers.nome}. Vim pelo site do Lanning Amaral Advogados. Sou de ${chat.answers.cidade}. Preciso de atendimento sobre ${chat.answers.area}. Urgência: ${chat.answers.urgencia}. Documentos: ${chat.answers.documentos}. Gostaria de receber orientação sobre os próximos passos.`;
      const lead = {
        nome: chat.answers.nome,
        telefone: chat.answers.telefone,
        email: "",
        cidade: chat.answers.cidade,
        area: chat.answers.area,
        resumo: "Contato iniciado pelo assistente de atendimento.",
        urgencia: chat.answers.urgencia,
        profissionalSugerido: responsible,
        origem: "chatbot",
      };
      body.innerHTML = `<p>Obrigado. Você pode continuar pelo WhatsApp, solicitar retorno ou enviar o formulário completo.</p>`;
      actions.innerHTML = `<a class="button button-accent" href="${escapeHtml(whatsappUrl(person.whatsapp || config.office?.whatsappPrincipal, message))}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><button type="button" data-chat-save>Solicitar contato</button><a class="button button-ghost-dark" href="contato.html">Continuar pelo formulário</a>`;
      actions.querySelector("[data-chat-save]")?.addEventListener("click", async () => {
        body.innerHTML = "<p>Registrando sua solicitação...</p>";
        try {
          await postLead(lead);
          body.innerHTML = "<p>Solicitação registrada. A equipe recebeu seu contato e retornará pelo WhatsApp informado.</p>";
        } catch (_error) {
          body.innerHTML = "<p>Não foi possível registrar pelo site agora. Você pode continuar pelo WhatsApp.</p>";
        }
        actions.innerHTML = `<a class="button button-accent" href="${escapeHtml(whatsappUrl(person.whatsapp || config.office?.whatsappPrincipal, message))}" target="_blank" rel="noopener">Enviar pelo WhatsApp</a><a class="button button-ghost-dark" href="contato.html">Continuar pelo formulário</a>`;
      });
      return;
    }
    if (question.type === "message") {
      body.innerHTML = `<p>${escapeHtml(question.text)}</p>`;
      actions.innerHTML = `<button class="button-accent" type="button" data-chat-next>Começar</button>`;
      return;
    }
    if (question.type === "input") {
      body.innerHTML = `<p>${escapeHtml(question.text)}</p><input data-chat-input placeholder="${escapeHtml(question.placeholder || "")}">`;
      actions.innerHTML = `<button class="button-accent" type="button" data-chat-input-next>Continuar</button>`;
      setTimeout(() => body.querySelector("input")?.focus(), 20);
      return;
    }
    const options = question.key === "area" ? (config.areas || []).map((area) => area.title) : question.options;
    body.innerHTML = `<p>${escapeHtml(question.text)}</p>`;
    actions.innerHTML = options.map((option) => `<button type="button" data-chat-answer="${escapeHtml(option)}">${escapeHtml(option)}</button>`).join("");
  }

  function setupChatbot() {
    document.querySelectorAll("[data-open-chatbot]").forEach((button) => button.addEventListener("click", openChatbot));
    document.querySelector("[data-chat-close]")?.addEventListener("click", closeChatbot);
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.matches("[data-chat-next]")) { chat.step += 1; renderChat(); }
      if (target.matches("[data-chat-answer]")) {
        chat.answers[questions[chat.step].key] = target.dataset.chatAnswer;
        chat.step += 1;
        renderChat();
      }
      if (target.matches("[data-chat-input-next]")) {
        const input = document.querySelector("[data-chat-input]");
        const value = input?.value.trim();
        if (!value) { input?.focus(); return; }
        chat.answers[questions[chat.step].key] = value;
        chat.step += 1;
        renderChat();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await loadConfig();
    setupNav();
    applyDynamicMedia();
    renderAreas();
    renderHelpCards();
    renderTeam();
    renderSteps();
    renderDocuments();
    renderFaq();
    renderBlog();
    setupArticleFilters();
    renderDynamicContacts();
    renderWhatsAppMenu();
    setupAreaSelect();
    setupContactForm();
    setupWhatsAppMenu();
    setupChatbot();
    setupReveal();
  });
})();
