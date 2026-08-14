# Trainer Face

Versão consolidada do TrainerFace com:

- autenticação via Supabase;
- perfis `ADMIN`, `MONITOR` e `USER`;
- ADMIN principal: `dalcinryan0123@gmail.com`;
- dashboard de acompanhamento;
- vínculo entre MONITOR e alunos;
- montagem de treinos;
- progressão de carga com gráfico;
- geração e histórico de plano alimentar;
- RLS no Supabase;
- sem importação de treino por PDF.

## Estrutura

```text
TrainerFace/
├── index.html
├── login.html
├── package.json
├── css/
│   ├── style.css
│   ├── login.css
│   └── features.css
├── js/
│   ├── app.js
│   ├── login.js
│   └── supabase.js
└── database/
    └── schema.sql
```

## Antes do deploy

1. Abra o projeto no Supabase.
2. Vá em **SQL Editor**.
3. Execute TODO o conteúdo de `database/schema.sql`.
4. Confirme que `dalcinryan0123@gmail.com` aparece com `role = ADMIN`.
5. Faça o upload desta estrutura no GitHub.
6. Faça um novo deploy na Vercel.

## Importante

Não recoloque os arquivos antigos abaixo:

- `api/import-workout.js`
- `admin/admin.html`
- `js/admin.js`
- `css/rbac.css`

A administração agora está integrada ao dashboard principal.
