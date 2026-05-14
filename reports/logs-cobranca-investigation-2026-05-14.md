# Investigacao de `logs_cobranca` no Fluxo WhatsApp

Data: 2026-05-14  
Projeto Supabase: `hjmknnenbrowzadjcjhl`  
Edge Function analisada: `billing-automation`

## 1. Causa Raiz

Causa raiz confirmada:
- o schema remoto de `logs_cobranca` aceitava apenas `tipo_cobranca in ('preventiva', 'vencimento', 'atraso', 'manual_assistido')`
- os fluxos de envio manual real, envio manual com erro, envio manual duplicado e `simulate=true` gravavam `tipo_cobranca: 'manual'`
- o insert em `logs_cobranca` falhava por `check constraint`
- como esses caminhos usam `tryInsertLog(...)`, o erro era engolido como warning e o pipeline seguia normalmente

Por isso o comportamento observado era:
- `cobrancas_whatsapp` persistia
- `automation_dispatches` persistia
- `provider_message_id` persistia
- `logs_cobranca` nao recebia linha

## 2. Diferenca Entre Fluxos

Fluxos automaticos:
- usam `tipo_cobranca` como `preventiva`, `vencimento` ou `atraso`
- ja eram compativeis com a constraint do banco

Fluxos manuais:
- `send_single_charge` real
- `send_single_charge` com `simulate=true`
- `send_real` em lote
- erro por telefone invalido
- duplicidade recente / idempotencia

Todos esses caminhos usavam `tipo_cobranca: 'manual'`, e por isso quebravam no insert.

## 3. RLS, rollback, frontend e early returns

Conclusoes da investigacao:
- RLS/policies nao eram a causa
  - a edge usa client admin/service role
- nao havia rollback transacional escondido
  - as demais tabelas persistiam normalmente
- o frontend nao era a causa
  - o problema estava na combinacao edge + constraint do banco
- havia sim early return sem trilha operacional suficiente
  - duplicidade recente em `sendSingleChargeData`
  - duplicidade de idempotencia em `sendRealChargesData`

Esses dois caminhos agora tambem deixam log `ignorado`.

## 4. Correcoes Aplicadas

### Banco

Migration criada e aplicada:
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\migrations\20260514235900_logs_cobranca_manual_type.sql](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\migrations\20260514235900_logs_cobranca_manual_type.sql)

Correcao:
- a constraint `logs_cobranca_tipo_cobranca_check` passou a aceitar `manual`

### Edge Function

Arquivo:
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts)

Correcoes:
- mantive os inserts manuais em `tipo_cobranca: 'manual'`
- adicionei logging para duplicidade recente em `sendSingleChargeData`
- adicionei logging para duplicidade por idempotencia em `sendRealChargesData`
- sanitizei o `payload` gravado em `logs_cobranca`

Payload agora registra o necessario sem excesso:
- `company_id`
- `registro_id`
- `status`
- `provider_message_id` quando houver
- `sent_at`
- `canal`
- `envio_real`
- `simulated`
- `force_resend`
- `message_preview`
- ids tecnicos da Z-API quando relevantes

Payload nao grava mais:
- mensagem completa
- `zapi_raw`
- payload bruto completo

### Frontend

Arquivo:
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\screens\HistoricoCobrancaScreen.jsx](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\screens\HistoricoCobrancaScreen.jsx)

Correcao:
- o historico agora le `payload.message_preview` para continuar exibindo a previa da mensagem mesmo sem armazenar o texto completo

## 5. Validacao Real

Conta usada:
- `jo***@gmail.com`

Empresa:
- `Construtora Vale Ltda`

Numero autorizado de teste:
- `7798***67`

### Envio individual real

Resultado:
- `ok=true`
- `provider_message_id` presente
- `logs_cobranca` criado com:
  - `status_envio='sucesso'`
  - `tipo_cobranca='manual'`
  - `provider_message_id` em payload
  - `message_preview` presente
  - sem `zapi_raw`
  - sem mensagem completa

### Duplicidade / retry

Resultado:
- segunda tentativa do mesmo titulo em seguida retornou `duplicate=true`
- `logs_cobranca` criado com:
  - `status_envio='ignorado'`
  - `erro='duplicado_recente'`
  - `duplicate_provider_message_id` presente

### Erro de envio

Cenario validado:
- telefone invalido controlado

Resultado:
- `ok=false`
- `error='Telefone invalido para envio real.'`
- `logs_cobranca` criado com:
  - `status_envio='erro'`
  - `tipo_cobranca='manual'`
  - erro sanitizado

### `simulate=true`

Resultado:
- `ok=true`
- `simulated=true`
- `logs_cobranca` criado com:
  - `status_envio='sucesso_simulado'`
  - `tipo_cobranca='manual'`
  - `message_preview` presente

### Envio em lote

Resultado:
- `ok=true`
- `sent_count=2`
- `failed_count=0`
- cada item gerou sua propria linha em `logs_cobranca` com:
  - `status_envio='sucesso'`
  - `provider_message_id` presente
  - `message_preview` presente

### Timeout

Status:
- nao executado contra o provider real

Motivo:
- forcar timeout em producao exigiria degradar deliberadamente uma integracao valida

Cobertura restante:
- o caminho de timeout continua coberto pela camada centralizada publicada e pelos testes automatizados de normalizacao

## 6. Evidencias Sanitizadas

Exemplos confirmados durante a validacao:
- `status_envio='sucesso'`, `tipo_cobranca='manual'`, `provider_message_id` presente
- `status_envio='ignorado'`, `erro='duplicado_recente'`
- `status_envio='erro'`, `erro='Telefone invalido para envio real.'`
- `status_envio='sucesso_simulado'`
- `payload.message_preview` presente
- `payload.message` ausente
- `payload.zapi_raw` ausente
- sem telefone completo no relatorio
- sem token
- sem client token

## 7. Resultado de Qualidade

- `supabase db push` -> `ok`
- `supabase functions deploy billing-automation` -> `ok`
- `npm test` -> `ok`
- `npm run lint` -> `ok`
- `npm run build` -> `ok`

## 8. Arquivos Alterados

- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\migrations\20260514235900_logs_cobranca_manual_type.sql](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\migrations\20260514235900_logs_cobranca_manual_type.sql)
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts)
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\screens\HistoricoCobrancaScreen.jsx](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\screens\HistoricoCobrancaScreen.jsx)

## 9. Status Final

Status: `aprovado`

Conclusao:
- a causa raiz foi corrigida
- `logs_cobranca` passou a registrar corretamente os fluxos manuais reais, em lote, simulados, com erro e de duplicidade
- a rastreabilidade operacional do pipeline ficou restaurada
- a unica validacao nao exercida ao vivo foi timeout, por restricao de seguranca operacional

