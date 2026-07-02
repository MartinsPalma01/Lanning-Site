# Lanning Amaral Advogados - Deploy no Vercel

Esta pasta esta pronta para subir no GitHub e importar no Vercel.

Importante: envie a pasta inteira para o GitHub, incluindo `site-source`, `api`, `server`, `scripts`, `src`, `package.json` e `vercel.json`.

## Configuracao no Vercel

- Framework Preset: `Other`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist/public`

O arquivo `vercel.json` ja deixa esses comandos configurados.

O build usa `site-source` como fonte do site e gera automaticamente `dist/public`.

## Variaveis obrigatorias

Configure em **Project Settings > Environment Variables**:

```env
NODE_ENV=production
PUBLIC_BASE_URL=https://lanningamaral.adv.br
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE?sslmode=require
AUTH_SECRET=gere-uma-chave-longa-aleatoria
ADMIN_EMAIL=admin@lanningamaral.adv.br
ADMIN_PASSWORD=defina-uma-senha-forte
CONTACT_TO=adv.lorraynemartins@hotmail.com,lanning.amaral@gmail.com
```

Sem `DATABASE_URL`, o site publico ainda consegue usar a configuracao padrao do build, mas o painel `/admin` nao conseguira salvar edicoes em producao.

## Rotas para testar

Depois do deploy, teste:

```text
https://lanningamaral.adv.br/
https://lanningamaral.adv.br/contato.html
https://lanningamaral.adv.br/admin/
https://lanningamaral.adv.br/api/health
```

## Dominio

No Vercel, adicione:

```text
lanningamaral.adv.br
www.lanningamaral.adv.br
```

Depois copie os registros DNS indicados pelo Vercel para o painel do Registro.br.
