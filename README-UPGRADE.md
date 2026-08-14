# TrainerFace — patch RBAC + dieta + progressão

Este pacote substitui/adiociona os arquivos principais do repositório `L1nss/TrainerFace`.

## O que muda

- Remove a interface e o fluxo de importação de treino por PDF.
- Remove a dependência `openai` que era usada pelo endpoint de importação.
- Adiciona `profiles` com papéis `ADMIN`, `MONITOR` e `USER`.
- Força `dalcinryan0123@gmail.com` como `ADMIN`.
- Adiciona vínculo `monitor_students`.
- ADMIN vê todos os alunos, treinos e progressões e gerencia funções/vínculos.
- MONITOR vê somente alunos vinculados, seus treinos e progressão de carga.
- USER vê e altera apenas os próprios treinos, dieta e registros de progressão.
- Adiciona geração e histórico de plano alimentar equilibrado por preferências/restrições.
- Adiciona gráfico SVG de progressão de carga, sem biblioteca externa.
- Atualiza RLS no Supabase para que a regra de acesso exista também no banco.

## Aplicação

1. Substitua `index.html`, `js/app.js`, `database/schema.sql` e `package.json`.
2. Adicione `css/features.css`.
3. Remova `api/import-workout.js`.
4. Execute `database/schema.sql` no SQL Editor do Supabase.
5. Faça deploy novamente na Vercel.
6. Entre com `dalcinryan0123@gmail.com`; esse usuário será ADMIN.
7. Na aba **Acessos**, transforme contas em MONITOR e vincule alunos.

## Observação de segurança

O front-end apenas adapta a interface. A separação real ADMIN/MONITOR/USER é feita pelas políticas RLS do Supabase incluídas no schema.
