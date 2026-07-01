import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const preferredSourceDir = path.join(rootDir, "site-source");
const legacySourceDir = path.join(rootDir, "outputs");
let sourceDir = preferredSourceDir;
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(distDir, "public");
const baseUrl = (process.env.PUBLIC_BASE_URL || "https://lanningamaral.adv.br").replace(/\/+$/, "");

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function sanitizePublicConfig(config) {
  const publicConfig = clone(config);
  delete publicConfig.admin;
  delete publicConfig.adminPassword;
  delete publicConfig.internalBase;
  delete publicConfig.usersGuide;
  delete publicConfig.alertState;

  const people = Object.entries(publicConfig.professionals || {})
    .filter(([, person]) => person.status === "active" && person.publicVisible !== false)
    .map(([key, person]) => {
      const cleanPerson = { ...person };
      delete cleanPerson.status;
      delete cleanPerson.internalOnly;
      delete cleanPerson.sortName;
      return [key, cleanPerson];
    });
  publicConfig.professionals = Object.fromEntries(people);
  const visibleKeys = new Set(Object.keys(publicConfig.professionals));
  const fallbackKey = visibleKeys.has("lorrayne") ? "lorrayne" : [...visibleKeys][0] || "";

  publicConfig.areas = (publicConfig.areas || []).map((area) => {
    const cleanArea = { ...area, route: visibleKeys.has(area.route) ? area.route : fallbackKey };
    delete cleanArea.status;
    return cleanArea;
  });
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

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function cleanProfessional(person, patch = {}) {
  return {
    memberType: "advogado",
    treatment: "auto",
    treatmentCustom: "",
    sortName: "",
    instagram: "",
    linkedIn: "",
    responsibleDepartments: [],
    showOnContact: false,
    showInFooter: false,
    showAsMainContact: false,
    showAsReception: false,
    internalOnly: false,
    showInstagram: false,
    showEmail: false,
    showWhatsApp: true,
    showPhone: false,
    highlight: false,
    sortAlphabetically: false,
    ...person,
    ...patch,
  };
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
  if (person.treatment === "dr") return "Dr.";
  if (person.treatment === "dra") return "Dra.";
  if (person.treatment === "none") return "";
  if (person.treatment === "custom") return String(person.treatmentCustom || "").trim();
  const role = sortName(person.role);
  if (role === "advogado") return "Dr.";
  if (role === "advogada") return "Dra.";
  return "";
}

function displayNameFor(person = {}) {
  return [treatmentPrefix(person), stripTreatment(person.name || person.displayName)].filter(Boolean).join(" ");
}

function finalizeProfessional(person) {
  const clean = { ...person, name: stripTreatment(person.name || person.displayName) };
  clean.sortName = sortName(clean.name);
  clean.displayName = displayNameFor(clean);
  return clean;
}

function enrichDefaultConfig(config) {
  const next = clone(config);
  next.office = {
    ...(next.office || {}),
    name: "Lanning Amaral Advogados",
    tagline: "Técnica, responsabilidade e atendimento próximo em Jaciara/MT e região.",
    subtagline: "Atendimento presencial em Jaciara/MT e online para Mato Grosso e demais localidades, conforme a natureza da demanda.",
    shortText: "Advocacia em Jaciara/MT, com atendimento técnico, comunicação clara e análise individualizada de cada demanda.",
    address: "Rua Jurucê, nº 1150, Centro, Jaciara-MT",
    street: "Rua Jurucê",
    number: "1150",
    district: "Centro",
    city: "Jaciara",
    state: "MT",
    cep: "78.820-000",
    hours: "Atendimento de segunda a sexta-feira, mediante agendamento.",
    generalPhone: next.office?.generalPhone || "",
    generalWhatsapp: next.office?.generalWhatsapp || next.office?.whatsappPrincipal || "5566999633058",
    generalEmail: next.office?.generalEmail || "adv.lorraynemartins@hotmail.com",
    instagram: next.office?.instagram || "",
    contactPageText: "Envie uma solicitação inicial, fale pelo WhatsApp ou consulte os dados do escritório para atendimento presencial em Jaciara/MT mediante agendamento.",
    serviceNotice: "Por segurança, não envie senhas, códigos Gov.br ou credenciais do Meu INSS pelo formulário do site.",
    whatsappPrincipal: next.office?.whatsappPrincipal || "5566999633058",
  };

  next.pageTexts = {
    ...(next.pageTexts || {}),
    homeHeadline: "Lanning Amaral Advogados",
    homeSubtitle: "Técnica, responsabilidade e atendimento próximo em Jaciara/MT e região.",
    homeDescription: next.office.subtagline,
    institutional: "O Lanning Amaral Advogados atua com análise cuidadosa dos documentos, orientação clara e condução responsável de cada demanda. O escritório reúne profissionais com atuação em diferentes áreas do Direito, buscando oferecer atendimento técnico, organizado e compatível com as particularidades de cada caso.",
    officeIntro: "O Lanning Amaral Advogados é um escritório com atuação em Jaciara/MT e atendimento online, estruturado para oferecer orientação jurídica técnica, responsável e acessível. A atuação parte da análise cuidadosa dos documentos, da compreensão do contexto apresentado pelo cliente e da definição de medidas compatíveis com a natureza e a urgência de cada demanda.",
    teamTitle: "Nossa equipe",
    teamSubtitle: "Profissionais com atuação técnica, atendimento próximo e análise individualizada de cada demanda.",
    teamIntro: "O Lanning Amaral Advogados reúne profissionais com atuação em diferentes áreas do Direito, permitindo que cada caso seja direcionado conforme sua natureza, urgência e necessidade jurídica.",
    onlineTitle: "Atendimento online",
    onlineSubtitle: "Envie sua solicitação inicial de forma simples e segura.",
    onlineIntro: "O atendimento online permite que você encaminhe informações iniciais, documentos e dúvidas para que a equipe compreenda melhor a situação e indique os próximos passos. O envio das informações não caracteriza contratação automática e não substitui a análise jurídica individualizada.",
    documentsIntro: "Cada caso exige documentos específicos, mas alguns arquivos costumam ajudar na compreensão inicial da demanda.",
    meuInssNotice: "Em casos previdenciários, também pode ser útil informar se você possui acesso ao Meu INSS. Por segurança, dados de acesso e senhas não devem ser enviados pelo formulário do site. Caso seja necessário acesso a sistemas externos, a equipe orientará o procedimento adequado durante o atendimento.",
    lgpdConsent: "Declaro estar ciente de que as informações enviadas serão utilizadas apenas para análise inicial de atendimento, conforme a Política de Privacidade.",
  };

  next.seo = {
    ...(next.seo || {}),
    homeTitle: "Lanning Amaral Advogados | Advocacia em Jaciara-MT",
    homeDescription: "Escritório de advocacia em Jaciara/MT, com atendimento presencial e online em demandas previdenciárias, trabalhistas, cíveis, familiares, bancárias, rurais, empresariais, criminais e contra o Poder Público.",
    ogTitle: "Lanning Amaral Advogados | Advocacia em Jaciara-MT",
    ogDescription: "Escritório de advocacia em Jaciara/MT, com atendimento presencial e online em demandas previdenciárias, trabalhistas, cíveis, familiares, bancárias, rurais, empresariais, criminais e contra o Poder Público.",
  };

  next.footer = {
    ...(next.footer || {}),
    logo: next.footer?.logo || "",
    shortText: next.footer?.shortText || "Advocacia em Jaciara/MT, com atendimento técnico, comunicação clara e análise individualizada de cada demanda.",
    notice: next.footer?.notice || "As informações deste site possuem caráter informativo e não substituem a análise individualizada do caso por advogado. O envio de mensagem ou formulário não caracteriza contratação automática.",
    showNotice: next.footer?.showNotice !== false,
    attendanceTitle: next.footer?.attendanceTitle || "Atendimento",
    officeName: next.footer?.officeName || "Lanning Amaral Advogados",
    address: next.footer?.address || next.office.address,
    cep: next.footer?.cep || next.office.cep,
    whatsappPrincipal: next.footer?.whatsappPrincipal || next.office.generalWhatsapp || next.office.whatsappPrincipal || "",
    phonePrincipal: next.footer?.phonePrincipal || next.office.generalPhone || "",
    emailPrincipal: next.footer?.emailPrincipal || "",
    instagram: next.footer?.instagram || next.office.instagram || "",
    hours: next.footer?.hours || next.office.hours,
    showQuickLinks: next.footer?.showQuickLinks !== false,
    showAreas: next.footer?.showAreas !== false,
    columnOrder: next.footer?.columnOrder || ["Identidade institucional", "Atendimento", "Links rápidos", "Áreas de atuação"],
    quickLinks: next.footer?.quickLinks || [
      { label: "O Escritório", href: "sobre.html" },
      { label: "Equipe", href: "equipe.html" },
      { label: "Áreas de Atuação", href: "areas.html" },
      { label: "Atendimento Online", href: "atendimento-online.html" },
      { label: "Artigos", href: "artigos.html" },
      { label: "Contato", href: "contato.html" },
      { label: "Política de Privacidade", href: "politica-privacidade.html" },
      { label: "Termos de Uso", href: "termos-de-uso.html" },
    ],
    areas: next.footer?.areas || [
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

  next.helpCards = [
    { title: "Problema com banco, cobrança ou financiamento", href: "areas/bancario-superendividamento.html", text: "Contratos bancários, execução, renegociação, juros, penhora, bloqueio ou cobrança extrajudicial." },
    { title: "INSS, aposentadoria ou benefício negado", href: "areas/previdenciario.html", text: "Aposentadoria, auxílio por incapacidade, BPC/LOAS, salário-maternidade, pensão por morte ou revisão." },
    { title: "Demissão, salário, descontos ou audiência trabalhista", href: "areas/trabalhista.html", text: "Verbas rescisórias, vínculo de emprego, acidente, horas extras, descontos indevidos ou defesa trabalhista." },
    { title: "Divórcio, guarda, alimentos ou partilha", href: "areas/familia.html", text: "Família, filhos, pensão, visitas, união estável, separação, bens ou medida urgente." },
    { title: "Inventário, herança, alvará ou sucessão", href: "areas/sucessoes.html", text: "Regularização de bens, partilha, herdeiros, testamento, alvará judicial ou sobrepartilha." },
    { title: "Negativação, desconto indevido ou problema de consumo", href: "areas/consumidor.html", text: "Empréstimo não contratado, cobrança abusiva, falha em serviço, transporte, energia, telefonia ou reembolso." },
    { title: "Imóvel, posse, usucapião ou regularização", href: "areas/civil.html", text: "Conflitos de posse, propriedade, contrato, vizinhança, matrícula, compra e venda ou ação possessória." },
    { title: "Servidor público, Município ou Estado", href: "areas/administrativo-servidor-publico.html", text: "Diferenças salariais, gratificações, adicionais, progressões, processo administrativo, RPV ou precatório." },
    { title: "Empresa, sociedade, contrato ou cobrança empresarial", href: "areas/empresarial.html", text: "Contratos, títulos de crédito, sociedade, recuperação de crédito, licitações, holding, franquia ou representação comercial." },
    { title: "Produtor rural, crédito rural ou patrimônio do campo", href: "areas/direito-rural.html", text: "Contrato rural, posse, propriedade, safra, maquinário, financiamento, cédula rural ou dívida bancária rural." },
    { title: "Execução, penhora, bloqueio, RPV ou precatório", href: "areas/execucoes-rpv-precatorios.html", text: "Cumprimento de sentença, levantamento de valores, alvará, bloqueio judicial, cálculos ou pagamento judicial." },
    { title: "Delegacia, intimação, audiência ou defesa criminal", href: "areas/criminal.html", text: "Inquérito, audiência de custódia, ação penal, medida cautelar, recurso criminal ou acompanhamento em delegacia." },
  ];

  next.steps = [
    "Você envia sua solicitação pelo formulário, WhatsApp ou assistente de atendimento.",
    "A equipe identifica a área relacionada ao caso.",
    "Quando necessário, podem ser solicitados documentos complementares.",
    "O atendimento é direcionado ao profissional adequado.",
    "Após a análise inicial, são informados os próximos passos.",
  ];

  next.documents = [
    { title: "Previdenciário", text: "Documentos pessoais, CNIS, carteira de trabalho, carta de indeferimento, laudos, exames, documentos rurais, comprovantes de contribuição e documentos do benefício." },
    { title: "Trabalhista", text: "CTPS, contrato, holerites, extrato do FGTS, rescisão, mensagens, controles de jornada, documentos médicos e provas do vínculo." },
    { title: "Família e sucessões", text: "Certidões, documentos pessoais, comprovantes de renda e despesas, documentos dos filhos, bens, decisões e conversas relevantes." },
    { title: "Bancário e consumidor", text: "Contratos, extratos, prints de descontos, notificações, demonstrativo da dívida, faturas e comprovantes de pagamento." },
    { title: "Rural", text: "Contratos rurais, matrícula, CCIR, CAR, notas fiscais, crédito rural, documentos de maquinário, notificações e documentos de posse." },
    { title: "Meu INSS e segurança", text: next.pageTexts.meuInssNotice },
  ];

  next.professionals = {
    ...(next.professionals || {}),
    lanning: cleanProfessional(next.professionals?.lanning, {
      name: "Lanning Pires Amaral",
      role: "Advogado",
      treatment: "auto",
      memberType: "advogado",
      oab: "",
      status: "active",
      publicVisible: true,
      showOnContact: true,
      showInFooter: false,
      showAsMainContact: true,
      showEmail: true,
      responsibleDepartments: ["direito-rural", "empresarial", "bancario-superendividamento"],
      areas: ["Direito Rural", "Direito Empresarial", "Direito Bancário", "Contratos", "Patrimônio", "Execuções complexas"],
      bio: "Atuação estratégica em demandas rurais, empresariais, bancárias e patrimoniais, com análise técnica dos documentos e dos riscos envolvidos.",
      order: 1,
    }),
    lorrayne: cleanProfessional(next.professionals?.lorrayne, {
      name: "Lorrayne Martins Palma",
      role: "Advogada",
      treatment: "auto",
      memberType: "advogada",
      oab: "",
      status: "active",
      publicVisible: true,
      showOnContact: true,
      showInFooter: false,
      showAsMainContact: true,
      showEmail: true,
      responsibleDepartments: ["previdenciario", "trabalhista", "consumidor", "familia", "civil", "administrativo-servidor-publico", "execucoes-rpv-precatorios", "sucessoes"],
      areas: ["Previdenciário", "Trabalhista", "Consumidor", "Família", "Civil", "Servidor Público", "RPV e Precatórios"],
      bio: "Atendimento jurídico com escuta cuidadosa, organização documental e comunicação objetiva sobre os próximos passos.",
      order: 2,
    }),
    andressa: cleanProfessional(next.professionals?.andressa, {
      name: "Andressa",
      treatment: "auto",
      role: "Advogada",
      memberType: "advogada",
      oab: "",
      areas: ["Direito Civil", "Família", "Previdenciário", "Consumidor", "Demandas correlatas"],
      bio: "Atuação em demandas cíveis, familiares, previdenciárias e consumeristas, conforme cadastro interno do escritório.",
      status: "active",
      publicVisible: true,
      showOnContact: true,
      order: 3,
    }),
    camila: cleanProfessional(next.professionals?.camila, {
      name: "Camila",
      treatment: "auto",
      role: "Advogada",
      memberType: "advogada",
      oab: "",
      areas: ["Direito Civil", "Família", "Previdenciário", "Consumidor", "Demandas correlatas"],
      bio: "Atuação em demandas cíveis, familiares, previdenciárias e consumeristas, conforme cadastro interno do escritório.",
      status: "active",
      publicVisible: true,
      showOnContact: true,
      order: 4,
    }),
    evelin: cleanProfessional(next.professionals?.evelin, {
      name: "Evelin",
      treatment: "auto",
      role: "Advogada",
      memberType: "advogada",
      oab: "",
      areas: ["Direito Criminal", "Acompanhamento em delegacia", "Inquérito policial", "Ação penal", "Demandas cíveis correlatas"],
      responsibleDepartments: ["criminal"],
      bio: "Principal profissional vinculada ao Departamento Criminal, com atuação em investigação, defesa e acompanhamento de procedimentos criminais.",
      status: "active",
      publicVisible: true,
      showOnContact: true,
      order: 5,
    }),
    eduarda: cleanProfessional(next.professionals?.eduarda, {
      name: "Eduarda",
      treatment: "none",
      role: "Assistente Jurídica",
      memberType: "assistente jurídica",
      oab: "",
      areas: ["Atendimento", "Organização documental", "Apoio administrativo"],
      bio: "Assistente jurídica com atuação no atendimento inicial e na organização documental do escritório.",
      status: "active",
      publicVisible: true,
      showOnContact: true,
      showWhatsApp: false,
      order: 6,
    }),
  };

  next.professionals = Object.fromEntries(
    Object.entries(next.professionals || {}).map(([key, person]) => [key, finalizeProfessional(person)]),
  );

  for (const area of ensureArray(next.areas)) {
    area.status = area.status || "active";
    area.openingText = area.openingText || area.description;
    area.responsibleKey = area.route;
    area.faq = ensureArray(area.faq);
    if (area.slug === "criminal") {
      area.route = "evelin";
      area.responsibleKey = "evelin";
      area.when = "Procure orientação criminal ao receber intimação, ser chamado à delegacia, ter audiência marcada, sofrer medida cautelar, prisão, busca e apreensão, acusação formal, investigação em andamento ou dúvida sobre seus direitos em inquérito policial, termo circunstanciado ou ação penal.";
      area.documents = "intimações, boletim de ocorrência, termo circunstanciado ou auto de prisão; prints, mensagens, fotos, vídeos, documentos pessoais e endereço atualizado; decisões judiciais, medidas cautelares, mandados e dados do processo; nomes de testemunhas e documentos que ajudem a contextualizar os fatos";
      area.documentsList = [
        "intimações, boletim de ocorrência, termo circunstanciado ou auto de prisão",
        "prints, mensagens, fotos, vídeos, documentos pessoais e endereço atualizado",
        "decisões judiciais, medidas cautelares, mandados e dados do processo",
        "nomes de testemunhas e documentos que ajudem a contextualizar os fatos",
      ];
    }
  }

  const articleSummaries = new Map([
    ["O que fazer quando o INSS nega um benefício?", "Entenda por que benefícios podem ser negados, quais documentos revisar e quando buscar orientação para recurso administrativo ou ação judicial."],
    ["Empresa pode descontar valores do salário do empregado?", "Orientação sobre descontos permitidos, limites legais e documentos que ajudam a avaliar cobrança feita diretamente no salário."],
    ["Como funciona a execução de alimentos?", "Explicação inicial sobre cobrança de pensão alimentícia, medidas urgentes, documentos necessários e possíveis consequências do atraso."],
    ["O que fazer diante de empréstimo não contratado?", "Veja como organizar provas, extratos e reclamações quando surgem descontos ou contratos bancários que o consumidor não reconhece."],
    ["Dívida bancária rural: quais documentos devem ser analisados?", "Resumo dos documentos essenciais para avaliar crédito rural, garantias, cédulas, renegociação e risco patrimonial."],
    ["Bloqueio judicial em conta bancária: quais são os próximos passos?", "Saiba quais informações levantar após bloqueio em conta, como identificar a origem do processo e quando pedir desbloqueio."],
    ["Servidor público pode cobrar diferenças salariais do Município?", "Orientação sobre revisão de verbas, adicionais, progressões e documentos úteis para apurar diferenças de servidor público."],
    ["Quando é necessário abrir inventário?", "Entenda quando o inventário é obrigatório, quais bens e documentos reunir e por que a regularização evita problemas futuros."],
    ["RPV e precatório: qual a diferença?", "Explicação clara sobre requisições de pequeno valor, precatórios, prazos de pagamento e acompanhamento de valores judiciais."],
    ["Recebi uma intimação criminal: como organizar os primeiros documentos?", "Primeiros cuidados ao receber intimação, importância de preservar documentos e necessidade de orientação técnica antes de prestar informações."],
  ]);
  next.articles = ensureArray(next.articles).map((article, index) => ({
    ...article,
    status: article.status || "publicado",
    author: article.author || "Lanning Amaral Advogados",
    publishedAt: article.publishedAt || `2026-06-${String(10 + index).padStart(2, "0")}`,
    updatedAt: article.updatedAt || "",
    excerpt: article.excerpt || articleSummaries.get(article.title) || "Orientação jurídica sobre o tema, com informações gerais para ajudar na compreensão inicial.",
    body: article.body || articleSummaries.get(article.title) || "Orientação jurídica sobre o tema, com informações gerais para ajudar na compreensão inicial.",
    featured: index < 3 ? Boolean(article.featured ?? true) : Boolean(article.featured),
    views: Number(article.views || 0),
    cover: article.cover || "",
  }));

  next.chatbotRouting = {
    ...(next.chatbotRouting || {}),
    "Departamento Criminal": "evelin",
    "Criminal": "evelin",
    "Departamento Rural": "lanning",
    "Departamento Empresarial": "lanning",
    "Departamento Bancário e Superendividamento": "lanning",
    "Departamento Previdenciário": "lorrayne",
    "Departamento Trabalhista": "lorrayne",
    "Departamento do Consumidor": "lorrayne",
    "Departamento de Família": "lorrayne",
    "Departamento Administrativo e Servidor Público": "lorrayne",
    "Departamento de Execuções, RPV e Precatórios": "lorrayne",
    "Departamento de Sucessões": "lorrayne",
    "Departamento Cível": "lorrayne",
    "Dúvidas gerais": "lorrayne",
  };

  next.whatsappSettings = {
    principal: next.office.whatsappPrincipal,
    useReceptionAsPrincipal: false,
    showFloatingButton: true,
    defaultMessage: "Olá. Vim pelo site do Lanning Amaral Advogados e gostaria de solicitar atendimento. Poderiam me orientar sobre os próximos passos?",
    openChatbotBeforeWhatsapp: false,
    allowChooseProfessional: true,
    showUnknownOption: true,
    fallback: next.office.whatsappPrincipal,
    pages: ["home", "areas", "equipe", "atendimento-online", "artigos", "contato"],
    routing: next.chatbotRouting,
  };

  next.usersGuide = next.usersGuide || [
    { role: "administrador", permissions: "Edita todo o site, painel, usuários, contatos e configurações." },
    { role: "advogado", permissions: "Edita perfil, artigos próprios, contatos e base interna." },
    { role: "assistente", permissions: "Visualiza contatos, atualiza status e cadastra informações básicas." },
    { role: "editor", permissions: "Cria e edita artigos, mídias e textos públicos." },
  ];

  return next;
}

async function readAdminConfig() {
  const raw = await fs.readFile(path.join(sourceDir, "assets", "js", "admin-config.js"), "utf8");
  const match = raw.match(/window\.LA_ADMIN_CONFIG\s*=\s*([\s\S]*?);\s*$/);
  if (!match) throw new Error("Nao foi possivel ler assets/js/admin-config.js na pasta fonte do site.");
  const config = JSON.parse(match[1]);
  delete config.admin;
  delete config.adminPassword;
  return config;
}

async function listFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(absolute);
    return [absolute];
  }));
  return nested.flat();
}

async function resolveSourceDir() {
  for (const candidate of [preferredSourceDir, legacySourceDir]) {
    try {
      await fs.access(path.join(candidate, "assets", "js", "admin-config.js"));
      sourceDir = candidate;
      return;
    } catch (_error) {
      // Try the next candidate.
    }
  }
  throw new Error("Nao foi encontrada a pasta site-source com assets/js/admin-config.js.");
}

function shouldCopyPublicSource(src) {
  const relative = path.relative(sourceDir, src);
  if (!relative) return true;

  const parts = relative.split(path.sep);
  const firstPart = parts[0] || "";
  const basename = path.basename(src);

  if (firstPart.startsWith("lanning-amaral-")) return false;
  if (basename.endsWith(".zip")) return false;
  return true;
}

async function replaceInFile(file, replacements) {
  let content = await fs.readFile(file, "utf8");
  for (const [pattern, replacement] of replacements) {
    content = content.replace(pattern, replacement);
  }
  await fs.writeFile(file, content, "utf8");
}

function footerShell(prefix = "") {
  const areas = [
    ["Previdenciário", "areas/previdenciario.html"],
    ["Trabalhista", "areas/trabalhista.html"],
    ["Família", "areas/familia.html"],
    ["Consumidor", "areas/consumidor.html"],
    ["Bancário", "areas/bancario-superendividamento.html"],
    ["Direito Rural", "areas/direito-rural.html"],
    ["Criminal", "areas/criminal.html"],
    ["Servidor Público", "areas/administrativo-servidor-publico.html"],
    ["Sucessões", "areas/sucessoes.html"],
    ["Execução e Precatório", "areas/execucoes-rpv-precatorios.html"],
  ];
  const links = [
    ["O Escritório", "sobre.html"],
    ["Equipe", "equipe.html"],
    ["Áreas de Atuação", "areas.html"],
    ["Atendimento Online", "atendimento-online.html"],
    ["Artigos", "artigos.html"],
    ["Contato", "contato.html"],
    ["Política de Privacidade", "politica-privacidade.html"],
    ["Termos de Uso", "termos-de-uso.html"],
  ];
  return `<footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand" data-footer-column="Identidade institucional">
        <img src="${prefix}assets/img/logo-main.png" alt="Lanning Amaral Advogados" data-footer-logo>
        <p data-office-short>Advocacia em Jaciara/MT, com atendimento técnico, comunicação clara e análise individualizada de cada demanda.</p>
        <p class="legal-note" data-footer-notice>As informações deste site possuem caráter informativo e não substituem a análise individualizada do caso por advogado. O envio de mensagem ou formulário não caracteriza contratação automática.</p>
      </div>
      <div data-footer-attendance data-footer-column="Atendimento"></div>
      <div data-footer-links data-footer-column="Links rápidos">
        <h2>Links rápidos</h2>
        ${links.map(([label, href]) => `<a href="${prefix}${href}">${label}</a>`).join("\n        ")}
      </div>
      <div class="footer-areas" data-footer-areas data-footer-column="Áreas de atuação">
        <h2>Áreas de atuação</h2>
        ${areas.map(([label, href]) => `<a href="${prefix}${href}">${label}</a>`).join("\n        ")}
      </div>
    </div>
    <div class="container footer-bottom"><span>© 2026 Lanning Amaral Advogados.</span><span>Publicidade informativa nos termos éticos da advocacia.</span></div>
  </footer>`;
}

function adminShell(baseTag = "") {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  ${baseTag}
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Painel Administrativo | Lanning Amaral Advogados</title>
  <meta name="description" content="Área interna protegida do Lanning Amaral Advogados.">
  <meta name="robots" content="noindex, nofollow">
  <meta name="theme-color" content="#073845">
  <link rel="icon" href="assets/img/logo-main.png">
  <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body data-page="admin">
  <section class="admin-app">
    <div class="admin-login-card" data-admin-login>
      <img src="assets/img/logo-main.png" alt="Lanning Amaral Advogados">
      <h1>Painel administrativo</h1>
      <p>Acesso interno para gestão de conteúdo, equipe, contatos e base administrativa do escritório.</p>
      <label>E-mail <input type="email" data-admin-email autocomplete="username" placeholder="E-mail de acesso"></label>
      <label>Senha <input type="password" data-admin-password autocomplete="current-password"></label>
      <button class="button button-accent" type="button" data-admin-enter>Entrar</button>
      <p class="form-status" data-admin-status></p>
    </div>
    <div class="admin-layout" data-admin-panel hidden>
      <aside class="admin-sidebar">
        <img src="assets/img/logo-main.png" alt="Lanning Amaral Advogados">
        <button data-admin-tab="dashboard" class="is-active">Dashboard</button>
        <button data-admin-tab="profissionais">Profissionais</button>
        <button data-admin-tab="areas">Áreas de atuação</button>
        <button data-admin-tab="textos">Textos públicos</button>
        <button data-admin-tab="faq">FAQ</button>
        <button data-admin-tab="artigos">Artigos/Blog</button>
        <button data-admin-tab="contato">Contato</button>
        <button data-admin-tab="rodape">Rodapé</button>
        <button data-admin-tab="midias">Mídias e SEO</button>
        <button data-admin-tab="whatsapp">WhatsApp e chatbot</button>
        <button data-admin-tab="leads">Contatos recebidos</button>
        <button data-admin-tab="base">Base interna</button>
        <button data-admin-tab="usuarios">Usuários e permissões</button>
      </aside>
      <main class="admin-main">
        <section class="admin-view is-active" data-admin-view="dashboard">
          <h2>Dashboard</h2>
          <div class="admin-kpis" data-admin-kpis></div>
          <div class="admin-dashboard-grid">
            <div class="admin-card"><h3>Últimos contatos</h3><div data-dashboard-leads></div></div>
            <div class="admin-card"><h3>Alertas de cadastro</h3><div data-dashboard-alerts></div></div>
          </div>
        </section>
        <section class="admin-view" data-admin-view="profissionais">
          <div class="admin-title-row"><div><h2>Profissionais</h2><p>Cadastre equipe, contatos, áreas e exibição pública sem mexer em código.</p></div><button class="button button-accent" type="button" data-new-professional>Novo profissional</button></div>
          <div class="admin-tools"><input data-professional-filter placeholder="Filtrar por nome, cargo, área ou status"><button type="button" data-sort-professionals>Ordenar alfabeticamente</button></div>
          <div class="admin-two"><div class="admin-list" data-professional-list></div><form class="admin-form" data-professional-form></form></div>
        </section>
        <section class="admin-view" data-admin-view="areas">
          <div class="admin-title-row"><div><h2>Áreas de atuação</h2><p>Edite cada departamento por ficha visual.</p></div><button class="button button-accent" type="button" data-new-area>Novo departamento</button></div>
          <div class="admin-two"><div class="admin-list" data-area-list></div><form class="admin-form" data-area-form></form></div>
        </section>
        <section class="admin-view" data-admin-view="textos"><h2>Textos públicos</h2><form class="admin-form" data-texts-form></form></section>
        <section class="admin-view" data-admin-view="faq">
          <div class="admin-title-row"><div><h2>FAQ</h2><p>Gerencie perguntas, categorias e onde cada item aparece.</p></div><button class="button button-accent" type="button" data-new-faq>Nova pergunta</button></div>
          <div class="admin-two"><div class="admin-list" data-faq-list></div><form class="admin-form" data-faq-form></form></div>
        </section>
        <section class="admin-view" data-admin-view="artigos">
          <div class="admin-title-row"><div><h2>Artigos e orientações jurídicas</h2><p>Crie rascunhos, publique orientações e edite SEO de cada artigo.</p></div><button class="button button-accent" type="button" data-new-article>Novo artigo</button></div>
          <div class="admin-two"><div class="admin-list" data-article-list></div><form class="admin-form" data-article-form></form></div>
        </section>
        <section class="admin-view" data-admin-view="contato"><h2>Contato</h2><form class="admin-form" data-contact-form-admin></form></section>
        <section class="admin-view" data-admin-view="rodape"><h2>Rodapé</h2><form class="admin-form" data-footer-form></form></section>
        <section class="admin-view" data-admin-view="midias"><h2>Mídias e SEO</h2><form class="admin-form" data-media-form></form></section>
        <section class="admin-view" data-admin-view="whatsapp"><h2>WhatsApp e chatbot</h2><form class="admin-form" data-whatsapp-form></form></section>
        <section class="admin-view" data-admin-view="leads"><h2>Contatos recebidos</h2><div class="button-row"><button class="button button-primary" data-export-contacts type="button">Exportar CSV</button><button class="button button-ghost-dark" data-refresh-contacts type="button">Atualizar contatos</button></div><div class="contacts-table" data-contacts-table></div></section>
        <section class="admin-view" data-admin-view="base"><h2>Base interna</h2><form class="admin-form" data-base-form></form></section>
        <section class="admin-view" data-admin-view="usuarios"><h2>Usuários e permissões</h2><div data-users-panel></div></section>
      </main>
    </div>
  </section>
  <script src="assets/js/admin.js"></script>
</body>
</html>
`;
}

async function rewritePublicHtml() {
  const files = (await listFiles(publicDir)).filter((file) => file.endsWith(".html") && !file.includes(`${path.sep}admin${path.sep}`) && !file.includes(`${path.sep}login${path.sep}`));
  for (const file of files) {
    const relativePrefix = path.relative(path.dirname(file), publicDir).replace(/\\/g, "/");
    const prefix = relativePrefix ? `${relativePrefix}/` : "";
    await replaceInFile(file, [
      [/<a class="nav-cta" href="[^"]*contato\.html">(Agendar|Contato)<\/a>/g, '<button class="nav-cta" type="button" data-wa-toggle-main>WhatsApp</button>'],
      [/<p><a href="mailto:adv\.lorraynemartins@hotmail\.com">[\s\S]*?<\/p>\s*<\/div>\s*<div>\s*<h2>Links rápidos<\/h2>/g, '<div data-footer-office></div>\n      </div>\n      <div>\n        <h2>Links rápidos</h2>'],
      [/<div>\s*<h2>Atendimento<\/h2>[\s\S]*?<\/div>\s*<\/div>\s*<div class="container footer-bottom">/g, '<div data-footer-service></div>\n    </div>\n    <div class="container footer-bottom">'],
      [/<footer class="site-footer">[\s\S]*?<\/footer>/, footerShell(prefix)],
    ]);
  }

  await replaceInFile(path.join(publicDir, "index.html"), [
    [/<title>[\s\S]*?<\/title>/, "<title>Lanning Amaral Advogados | Advocacia em Jaciara-MT</title>"],
    [/<meta name="description" content="[^"]*">/, '<meta name="description" content="Escritório de advocacia em Jaciara/MT, com atendimento presencial e online em demandas previdenciárias, trabalhistas, cíveis, familiares, bancárias, rurais, empresariais, criminais e contra o Poder Público.">'],
    [/<meta property="og:title" content="[^"]*">/, '<meta property="og:title" content="Lanning Amaral Advogados | Advocacia em Jaciara-MT">'],
    [/<meta property="og:description" content="[^"]*">/, '<meta property="og:description" content="Escritório de advocacia em Jaciara/MT, com atendimento presencial e online em demandas previdenciárias, trabalhistas, cíveis, familiares, bancárias, rurais, empresariais, criminais e contra o Poder Público.">'],
    [/<span class="kicker">Advocacia em Jaciara\/MT e região<\/span>\s*<h1>[\s\S]*?<\/h1>\s*<p>[\s\S]*?<\/p>\s*<div class="hero-actions">[\s\S]*?<\/div>/,
      '<span class="kicker">Advocacia em Jaciara/MT e região</span>\n        <h1>Lanning Amaral Advogados</h1>\n        <p><strong>Técnica, responsabilidade e atendimento próximo em Jaciara/MT e região.</strong></p>\n        <p>Atendimento presencial em Jaciara/MT e online para Mato Grosso e demais localidades, conforme a natureza da demanda.</p>\n        <div class="hero-actions"><button class="button button-accent" type="button" data-wa-toggle-main>Falar pelo WhatsApp</button><a class="button button-light" href="contato.html">Solicitar atendimento</a><a class="button button-ghost" href="areas.html">Conhecer áreas de atuação</a></div>'],
    [/<div class="help-grid">[\s\S]*?<\/div><\/div><\/section>/,
      '<div class="help-grid" data-help-cards></div></div></section>'],
    [/Atendimento presencial mediante agendamento e atendimento online por WhatsApp, formulário ou assistente de atendimento\./g,
      "Atendimento presencial em Jaciara/MT e atendimento online, conforme a viabilidade jurídica e operacional do caso."],
  ]);

  await replaceInFile(path.join(publicDir, "sobre.html"), [
    [/O Lanning Amaral Advogados atua em Jaciara\/MT com atendimento presencial e online, análise cuidadosa dos documentos e orientação clara sobre os próximos passos\./g,
      "O Lanning Amaral Advogados é um escritório com atuação em Jaciara/MT e atendimento online, estruturado para oferecer orientação jurídica técnica, responsável e acessível. A atuação parte da análise cuidadosa dos documentos, da compreensão do contexto apresentado pelo cliente e da definição de medidas compatíveis com a natureza e a urgência de cada demanda."],
  ]);

  await replaceInFile(path.join(publicDir, "atendimento-online.html"), [
    [/<section class="page-hero">[\s\S]*?<\/section>/,
      '<section class="page-hero"><div class="container narrow reveal"><span class="kicker">Atendimento online</span><h1>Atendimento online</h1><p>Envie sua solicitação inicial de forma simples e segura.</p></div></section>'],
    [/O atendimento online permite que o cliente encaminhe informações iniciais, documentos e dúvidas para que a equipe possa indicar os próximos passos de forma organizada\. O envio das informações não substitui a análise jurídica individualizada e não representa contratação automática\./g,
      'O atendimento online permite que você encaminhe informações iniciais, documentos e dúvidas para que a equipe compreenda melhor a situação e indique os próximos passos. O envio das informações não caracteriza contratação automática e não substitui a análise jurídica individualizada.'],
    [/Documentos que ajudam na análise inicial/g, 'Documentos que podem ajudar na análise inicial'],
    [/<div class="doc-grid" data-documents><\/div>/g, '<div class="doc-grid" data-documents></div><p class="security-note reveal" data-meu-inss-note></p>'],
  ]);

  await replaceInFile(path.join(publicDir, "equipe.html"), [
    [/Profissionais com atuação jurídica técnica, atendimento próximo e análise individualizada de cada demanda\./g, 'Profissionais com atuação técnica, atendimento próximo e análise individualizada de cada demanda.'],
  ]);

  await replaceInFile(path.join(publicDir, "contato.html"), [
    [/Cidade <input name="cidade"/g, 'Cidade/Estado <input name="cidade"'],
    [/Sim, há prazo ou urgência/g, 'Sim, há prazo, audiência, bloqueio, intimação ou notificação'],
    [/<aside class="contact-card reveal">[\s\S]*?<\/aside>/, '<aside class="contact-card reveal" data-contact-sidebar></aside>'],
  ]);

  await replaceInFile(path.join(publicDir, "artigos.html"), [
    [/<section class="page-hero">[\s\S]*?<\/section>/,
      '<section class="page-hero"><div class="container narrow reveal"><span class="kicker">Artigos e orientações jurídicas</span><h1>Artigos e orientações jurídicas</h1><p>Conteúdos informativos sobre temas recorrentes no atendimento do escritório.</p><p class="article-support">Os materiais possuem caráter informativo e não substituem a análise individualizada do caso por advogado.</p></div></section>'],
    [/<section class="section"><div class="container"><div class="category-pills" data-blog-categories><\/div><div class="article-grid" data-articles><\/div><\/div><\/section>/,
      '<section class="section"><div class="container"><div class="article-toolbar reveal"><label>Buscar orientação <input data-article-search type="search" placeholder="Buscar por INSS, desconto, inventário, execução, banco..."></label><label>Autor <select data-article-author><option value="">Todos os autores</option></select></label><label>Ordenar <select data-article-sort><option value="recentes">Mais recentes</option><option value="mais-lidos">Mais lidos</option><option value="destaques">Destaques</option></select></label><label>Destaques <select data-article-featured-filter><option value="todos">Todos</option><option value="destaques">Somente destaques</option></select></label></div><div class="category-pills" data-blog-categories></div><div class="article-grid" data-articles></div></div></section>'],
  ]);

  await replaceInFile(path.join(publicDir, "areas", "criminal.html"), [
    [/Procure orientação quando receber intimação, for chamado à delegacia, houver audiência marcada, medida cautelar, prisão, acusação formal ou dúvida sobre direitos em investigação ou ação penal\.<\/p><p>Também é recomendável buscar orientação quando receber cobrança[\s\S]*?obrigações\./,
      'Procure orientação criminal ao receber intimação, ser chamado à delegacia, ter audiência marcada, sofrer medida cautelar, prisão, busca e apreensão, acusação formal, investigação em andamento ou dúvida sobre seus direitos em inquérito policial, termo circunstanciado ou ação penal.'],
  ]);

  const areaFiles = (await listFiles(path.join(publicDir, "areas"))).filter((file) => file.endsWith(".html"));
  for (const file of areaFiles) {
    await replaceInFile(file, [
      [
        /<p>Também é recomendável buscar orientação quando receber cobrança, intimação, notificação, desconto indevido, negativa administrativa, proposta de acordo, bloqueio judicial, atraso de pagamento, conflito familiar ou qualquer situação que gere dúvida sobre seus direitos e obrigações\.<\/p>/g,
        ""
      ],
      [/Execução penal, se a profissional responsável desejar manter essa subárea ativa/g, "Execução penal"],
      [/Imersão em RH, se esse serviço estiver ativo no escritório/g, "Consultoria preventiva trabalhista"]
    ]);
  }
}

async function appendProductionCss() {
  const cssPath = path.join(publicDir, "assets", "css", "styles.css");
  await fs.appendFile(cssPath, `

.security-note { margin-top: 22px; color: var(--primary); background: rgba(168, 215, 42, .12); border: 1px solid rgba(168, 215, 42, .38); border-radius: var(--radius); padding: 16px; font-weight: 700; }
.doc-card summary { cursor: pointer; color: var(--primary-dark); font-size: 18px; font-weight: 900; }
.doc-card summary::-webkit-details-marker { color: var(--accent-dark); }
.team-card.is-highlighted { border-color: rgba(168, 215, 42, .65); }
.team-card .profile-link, .team-card .social-link { color: var(--primary); font-weight: 900; }
.admin-title-row, .admin-tools { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 14px; }
.admin-tools { justify-content: flex-start; background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; }
.admin-tools input { max-width: 420px; }
.admin-card, .admin-section-card, .repeat-list, .user-card { background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 18px; box-shadow: 0 10px 34px rgba(3, 40, 50, .06); }
.admin-dashboard-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.admin-form textarea { font-family: inherit; min-height: 110px; }
.repeat-list { display: grid; gap: 10px; }
.repeat-item { display: grid; grid-template-columns: 1fr auto auto auto; gap: 8px; align-items: center; }
.link-item { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1fr) auto auto auto; gap: 8px; align-items: center; }
.repeat-item textarea { min-height: 70px; }
.mini-button, .admin-tools button, .repeat-list button { border: 1px solid var(--line); border-radius: var(--radius); color: var(--primary); background: var(--soft); padding: 9px 11px; font-weight: 900; cursor: pointer; }
.form-section-title { margin-top: 18px; padding-top: 18px; border-top: 1px solid var(--line); color: var(--primary-dark); }
.image-preview { width: 112px; height: 112px; border-radius: var(--radius); border: 1px solid var(--line); object-fit: cover; background: var(--soft); }
.status-badge { display: inline-flex; border-radius: 999px; padding: 4px 8px; background: rgba(168, 215, 42, .12); color: var(--primary); font-size: 12px; font-weight: 900; }
.site-nav .nav-cta { border: 0; cursor: pointer; font-family: inherit; }
.site-footer { padding-bottom: 112px; }
.footer-grid { gap: 34px; align-items: start; }
.footer-brand p, .site-footer p { line-height: 1.65; }
.site-footer a { display: block; margin: 8px 0; line-height: 1.35; }
.footer-areas a { font-size: 14px; }
.site-footer h2 { margin-bottom: 14px; }
.float-actions { z-index: 80; }
.toggle-panel { display: grid; gap: 16px; }
.toggle-group { background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; box-shadow: 0 10px 34px rgba(3, 40, 50, .05); }
.toggle-group h4 { margin: 0 0 12px; color: var(--primary-dark); font-size: 16px; }
.toggle-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.toggle-card { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; background: var(--soft); cursor: pointer; }
.toggle-card input { position: absolute; opacity: 0; pointer-events: none; }
.toggle-card small { display: block; color: var(--muted); line-height: 1.35; margin-top: 2px; }
.toggle-visual { width: 42px; height: 24px; border-radius: 999px; background: #d9e3e6; position: relative; transition: background .2s ease; }
.toggle-visual::after { content: ""; width: 18px; height: 18px; border-radius: 999px; background: var(--white); position: absolute; top: 3px; left: 3px; box-shadow: 0 2px 8px rgba(3, 40, 50, .2); transition: transform .2s ease; }
.toggle-card input:checked + .toggle-visual { background: var(--accent); }
.toggle-card input:checked + .toggle-visual::after { transform: translateX(18px); }
.professional-list-item { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: stretch; }
.professional-list-item[draggable="true"] { cursor: grab; }
.order-actions { display: grid; gap: 6px; }
.order-actions button { width: 38px; text-align: center; }
.alert-tabs, .article-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; margin-bottom: 16px; }
.alert-tabs button, .alert-card button, .category-pills button { border: 1px solid var(--line); background: var(--white); color: var(--primary); border-radius: 999px; padding: 9px 12px; font-weight: 900; cursor: pointer; }
.alert-tabs button.is-active, .category-pills button.is-active { background: var(--accent); border-color: var(--accent); color: var(--primary-dark); }
.alert-list { display: grid; gap: 12px; }
.alert-card { border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; background: var(--soft); }
.alert-card h4 { margin: 8px 0 6px; font-size: 17px; }
.alert-card small { color: var(--muted); margin-left: 8px; }
.article-support { margin-top: 12px; font-size: 16px; color: rgba(255,255,255,.82); }
.article-toolbar { background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 16px; box-shadow: 0 10px 34px rgba(3, 40, 50, .06); }
.article-toolbar label { flex: 1 1 210px; color: var(--primary-dark); font-weight: 900; }
.article-toolbar input, .article-toolbar select { margin-top: 6px; }
.category-pills { display: flex; flex-wrap: wrap; gap: 10px; margin: 18px 0 24px; }
.category-pills button span { opacity: .72; }
.article-card { display: grid; align-content: start; gap: 10px; }
.article-cover { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: var(--radius); background: var(--soft); }
.article-meta { display: flex; flex-wrap: wrap; gap: 8px; }
.article-meta span { display: inline-flex; border-radius: 999px; padding: 5px 9px; background: rgba(168, 215, 42, .14); color: var(--primary); font-size: 12px; font-weight: 900; }
.article-byline { color: var(--muted); font-size: 14px; font-weight: 800; }
.article-read summary { display: inline-flex; width: fit-content; border-radius: var(--radius); background: var(--primary); color: var(--white); padding: 10px 13px; font-weight: 900; cursor: pointer; list-style: none; }
.article-read summary::-webkit-details-marker { display: none; }
.article-read p { margin-top: 12px; }
.empty-state { grid-column: 1 / -1; background: var(--white); border: 1px solid var(--line); border-radius: var(--radius); padding: 28px; text-align: center; box-shadow: 0 10px 34px rgba(3, 40, 50, .06); }
@media (max-width: 900px) { .admin-dashboard-grid, .repeat-item, .link-item, .toggle-grid { grid-template-columns: 1fr; } .site-footer { padding-bottom: 138px; } .footer-grid { gap: 28px; } }
`, "utf8");
}

async function rewriteAdminHtml() {
  await fs.writeFile(path.join(publicDir, "admin.html"), adminShell(""), "utf8");
  await fs.writeFile(path.join(publicDir, "admin", "index.html"), adminShell('<base href="../">'), "utf8");
  await fs.writeFile(path.join(publicDir, "login", "index.html"), adminShell('<base href="../">'), "utf8");
}

async function rewriteSitemapAndRobots() {
  const sitemapPath = path.join(publicDir, "sitemap.xml");
  const raw = await fs.readFile(sitemapPath, "utf8");
  const sitemap = raw.replace(/<loc>\.\/([^<]+)<\/loc>/g, (_match, loc) => `<loc>${baseUrl}/${loc}</loc>`);
  await fs.writeFile(sitemapPath, sitemap, "utf8");
  await fs.writeFile(path.join(publicDir, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`, "utf8");
}

async function writeStaticHostingFiles() {
  await fs.writeFile(path.join(publicDir, "_headers"), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: SAMEORIGIN
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`, "utf8");

  await fs.writeFile(path.join(publicDir, ".htaccess"), `Options -Indexes
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>
`, "utf8");
}

async function main() {
  await resolveSourceDir();
  await fs.rm(distDir, { recursive: true, force: true });
  await fs.mkdir(distDir, { recursive: true });
  await fs.cp(sourceDir, publicDir, { recursive: true, filter: shouldCopyPublicSource });

  const defaultConfig = enrichDefaultConfig(await readAdminConfig());
  await fs.writeFile(path.join(distDir, "default-config.json"), JSON.stringify(defaultConfig, null, 2), "utf8");
  await fs.writeFile(
    path.join(publicDir, "assets", "js", "config.js"),
    `window.LA_SITE_CONFIG = ${JSON.stringify(sanitizePublicConfig(defaultConfig), null, 2)};\n`,
    "utf8",
  );
  await fs.rm(path.join(publicDir, "assets", "js", "admin-config.js"), { force: true });
  await fs.copyFile(path.join(rootDir, "src", "client", "main-api.js"), path.join(publicDir, "assets", "js", "main.js"));
  await fs.copyFile(path.join(rootDir, "src", "client", "admin-api.js"), path.join(publicDir, "assets", "js", "admin.js"));

  await rewritePublicHtml();
  await rewriteAdminHtml();
  await rewriteSitemapAndRobots();
  await writeStaticHostingFiles();
  await appendProductionCss();

  const htmlFiles = (await listFiles(publicDir)).filter((file) => file.endsWith(".html"));
  console.log(`Build concluido em ${publicDir}`);
  console.log(`${htmlFiles.length} paginas HTML prontas para publicacao.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
