# Go Live Checklist — Piloto BankExtract

## Objetivo
Checklist operacional final para liberar o piloto do BankExtract com segurança, rastreabilidade e plano de reversão controlado.

---

## 1. Antes do deploy

### Banco e migrations
- [ ] Todas as migrations recentes foram aplicadas em staging
- [ ] Todas as migrations recentes foram aplicadas em produção
- [ ] Validado:
  - [ ] SaaS Phase 1
  - [ ] Notifications Center
  - [ ] Audit Logs Enrichment
  - [ ] Production Checklist
- [ ] RLS validado com usuário comum
- [ ] RLS validado com system admin
- [ ] Nenhuma migration destrutiva foi executada

### Ambiente
- [ ] Variáveis da Vercel configuradas
- [ ] `VITE_SUPABASE_URL` preenchida
- [ ] `VITE_SUPABASE_ANON_KEY` preenchida
- [ ] `VITE_SYSTEM_ADMIN_EMAILS` validada, se usada
- [ ] Não existe `.env.production` com segredo commitado

### Aplicação
- [ ] `npm run build` aprovado localmente
- [ ] Supabase production validado no frontend
- [ ] Usuário admin de produção validado
- [ ] Empresa piloto criada
- [ ] Empresa de teste interna criada

---

## 2. Deploy Vercel

### Configuração do projeto
- [ ] Projeto enviado para Vercel
- [ ] Framework preset configurado para `Vite`
- [ ] Build command validado:

```bash
npm run build
```

- [ ] Output directory validado:

```txt
dist
```

- [ ] Root directory confirmada
- [ ] Todas as environment variables foram salvas no ambiente correto:
  - [ ] Production
  - [ ] Preview, se aplicável

### Conferência final antes de publicar
- [ ] Branch correta selecionada para produção
- [ ] Último deploy em preview conferido
- [ ] Logs de build da Vercel sem erro
- [ ] Build publicado com sucesso

---

## 3. Smoke test pós-deploy

### Acesso e autenticação
- [ ] Landing abre normalmente
- [ ] Login funciona
- [ ] Sessão persiste após refresh

### Contexto multiempresa
- [ ] Empresa ativa carrega
- [ ] Troca de empresa funciona
- [ ] Modo global, se usado, não quebra navegação

### Dashboard e operação
- [ ] Dashboard abre
- [ ] Dados financeiros aparecem
- [ ] Importação abre
- [ ] Importação processa preview
- [ ] Central de cobrança abre
- [ ] Prévia/preparo de cobrança funciona
- [ ] Automações/simulação funciona

### Comercial e SaaS
- [ ] Planos abre
- [ ] Billing abre
- [ ] Plano atual aparece corretamente
- [ ] Usage counters aparecem corretamente

### Monitoramento e governança
- [ ] Notificações abre
- [ ] Auditoria abre
- [ ] Help Center abre
- [ ] Checklist de produção abre

### Smoke test mínimo do piloto
- [ ] Cliente teste consegue importar carteira
- [ ] Cliente teste consegue preparar cobrança
- [ ] Cliente teste consegue abrir dashboard

---

## 4. Critérios para aprovar o piloto

O piloto só deve ser liberado se todos os itens abaixo forem verdadeiros:

- [ ] Nenhum erro crítico no app
- [ ] Build aprovado
- [ ] Deploy publicado com sucesso
- [ ] Migrations aplicadas corretamente
- [ ] Supabase production validado
- [ ] Checklist de produção em `100%`
- [ ] Cliente teste consegue importar carteira
- [ ] Cliente teste consegue preparar cobrança
- [ ] Fluxos principais funcionam sem fallback inesperado

### Critérios de bloqueio
Se qualquer item abaixo acontecer, o piloto não deve ser liberado:
- [ ] erro de autenticação
- [ ] empresa não carrega
- [ ] dashboard sem dados quando há dados reais
- [ ] importação falhando
- [ ] cobrança/preparo falhando
- [ ] notificações ou auditoria quebradas

---

## 5. Plano de rollback

### Rollback de aplicação
- [ ] Voltar para o deploy anterior na Vercel
- [ ] Validar se a versão anterior sobe normalmente
- [ ] Confirmar que login e empresa ativa continuam funcionando

### Banco
- [ ] Não executar rollback destrutivo por impulso
- [ ] Não remover tabelas/colunas em produção sem backup
- [ ] Revisar logs do Supabase antes de qualquer reversão
- [ ] Restaurar backup apenas se necessário e aprovado

### Contenção operacional
- [ ] Desativar usuário piloto, se necessário
- [ ] Suspender acesso do cliente piloto temporariamente, se necessário
- [ ] Comunicar status interno da reversão

---

## 6. Lista de evidências

### Prints obrigatórios
- [ ] Landing
- [ ] Login autenticado
- [ ] Empresa ativa selecionada
- [ ] Dashboard com dados
- [ ] Importação / preview
- [ ] Central de cobrança
- [ ] Planos / Billing
- [ ] Notifications
- [ ] Audit
- [ ] Checklist de produção em 100%

### Dados de teste
- [ ] nome da empresa piloto
- [ ] usuário utilizado
- [ ] arquivo importado no teste
- [ ] documento/título usado na cobrança de teste

### Registro do teste
- [ ] data do teste
- [ ] horário do teste
- [ ] ambiente validado
- [ ] responsável principal
- [ ] aprovador final

---

## Assinatura operacional

- Responsável técnico: __________________________________
- Responsável produto/operação: _________________________
- Data: ________________________________________________
- Hora: ________________________________________________
- Status final:
  - [ ] Aprovado para piloto
  - [ ] Reprovado / precisa ajustes
