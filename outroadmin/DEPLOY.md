# Publicacao em producao - Lanning Amaral Advogados

Este projeto agora tem dois modos:

- **Producao completa**: site + API + painel `/admin` + PostgreSQL + formulario + chatbot gravando contatos. Use Vercel, Netlify ou cPanel com suporte a Node.js.
- **Hospedagem estatica em `public_html`**: publica apenas o site em `dist/public`. O visual, paginas, WhatsApp e links funcionam, mas o painel real, formulario com banco e chatbot com registro exigem o backend Node + PostgreSQL.

## 1. Instalar dependencias

```bash
npm install
```

## 2. Gerar build final

```bash
npm run build
```

O build copia o site para `dist/public`, remove `admin-config.js` do publico, substitui os scripts por versoes conectadas a API, gera `dist/default-config.json`, atualiza `robots.txt` e `sitemap.xml` para o dominio `https://lanningamaral.adv.br`.

Para testar localmente em uma porta comum de navegador:

```bash
npm start
```

Depois acesse:

```text
http://localhost:8080
```

Para testar o painel local sem PostgreSQL configurado, use:

```text
E-mail: admin@lanningamaral.adv.br
Senha: Lanning@2026
```

Esse acesso local salva dados apenas em `work/local-admin-store.json`. Em producao, configure `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` para usar PostgreSQL real.

Em hospedagens como Vercel, Netlify e cPanel com Node.js, o provedor pode definir a variavel `PORT` automaticamente. Nesse caso, mantenha a porta fornecida pelo provedor.

## 3. Pasta final para publicar

- **Vercel/Netlify com backend**: publique o projeto inteiro. O build command e `dist/public` ja estao configurados em `vercel.json` e `netlify.toml`.
- **cPanel com Node.js**: envie o projeto inteiro, rode `npm install`, `npm run build` e configure o app Node apontando para `server/index.mjs`.
- **cPanel somente `public_html`**: envie o conteudo de `dist/public` para `public_html`. Use este modo apenas como site estatico, sem painel/banco/formulario real.

## 4. Variaveis de ambiente

Configure estas variaveis no provedor:

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://lanningamaral.adv.br
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
AUTH_SECRET=gere-uma-chave-aleatoria-com-mais-de-32-caracteres
ADMIN_EMAIL=admin@lanningamaral.adv.br
ADMIN_PASSWORD=senha-forte-inicial
CONTACT_TO=adv.lorraynemartins@hotmail.com,lanning.amaral@gmail.com
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Lanning Amaral Advogados <no-reply@lanningamaral.adv.br>"
```

O primeiro usuario admin e criado automaticamente quando o banco ainda nao tem usuarios. Use uma senha forte antes do primeiro deploy.

## 5. Dominio `.adv.br`

1. Registre `lanningamaral.adv.br` no Registro.br ou ajuste para o dominio escolhido.
2. No provedor de hospedagem, adicione o dominio personalizado.
3. Configure os DNS conforme o provedor:
   - Vercel/Netlify: normalmente `CNAME` para `www` e `A`/`ALIAS`/nameservers para o dominio raiz, conforme instrucoes exibidas pelo painel.
   - cPanel: aponte o dominio para o servidor da hospedagem e configure o document root ou o app Node.
4. Atualize `PUBLIC_BASE_URL` se o dominio final for diferente.
5. Rode `npm run build` novamente para atualizar sitemap e robots.

## 6. SSL/HTTPS

- Vercel e Netlify emitem SSL automaticamente apos o DNS propagar.
- cPanel: ative AutoSSL/Let's Encrypt para o dominio e force HTTPS. O build inclui `.htaccess` para redirecionamento HTTPS no modo Apache.
- Confirme que `/admin`, `/api/health`, formulario e arquivos do site abrem por `https://`.

## 7. Teste final

Apos publicar, teste:

```text
https://lanningamaral.adv.br/
https://lanningamaral.adv.br/contato.html
https://lanningamaral.adv.br/equipe.html
https://lanningamaral.adv.br/areas.html
https://lanningamaral.adv.br/atendimento-online.html
https://lanningamaral.adv.br/admin/
https://lanningamaral.adv.br/api/health
```

Checklist:

- paginas internas abrem sem `localhost`, `127.0.0.1` ou `file:///`;
- imagens, CSS e JS carregam com status 200;
- menu mobile funciona;
- botoes de WhatsApp abrem conversa;
- formulario de contato grava lead no painel;
- chatbot registra contato e oferece WhatsApp;
- login `/admin` exige usuario e senha;
- dados de equipe, OAB, e-mails, telefones, WhatsApp, areas, artigos, FAQ, textos e midias salvam no banco.
