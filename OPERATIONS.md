# Operações WhatsApp / Z-API

## Estado atual

- O envio real com anexo PDF está funcional.
- O webhook de status está configurado em:
  - `https://hjmknnenbrowzadjcjhl.supabase.co/functions/v1/zapi-webhook`
- Nesta instância específica da Z-API, o callback espontâneo de status (`delivered` / `read`) **não foi observado de forma confiável**, mesmo com:
  - webhook salvo
  - `Notificar as enviadas por mim também` ativado
  - `Ler status automaticamente` ativado
  - instância reconectada

## Comportamento operacional adotado

- O sistema continua considerando `sent` como um estado válido.
- O histórico **não** rebaixa mais mensagens válidas para `queued` quando a instância não expõe o lookup por `provider_message_id`.
- O backend registra status operacionais internos em `cobrancas_whatsapp.webhook_status`:
  - `aguardando_evento`
  - `recebido`
  - `fallback_indisponivel`

Também usa `provider_tracking_status`:
- `resolved`
- `pending_webhook`
- `fallback_indisponivel`

## Limitação observada da instância Z-API

Ao consultar status por `provider_message_id`, esta instância responde com payload incompatível com reconciliação direta:

```json
{
  "error": "NOT_FOUND",
  "message": "Unable to find matching target resource method"
}
```

Quando isso ocorre:
- a cobrança permanece em `sent`
- `webhook_status` muda para `fallback_indisponivel`
- `provider_tracking_status` muda para `fallback_indisponivel`
- uma auditoria segura é registrada

## Scheduler de fallback

Foi criada a function:

- `whatsapp-status-scheduler`

Objetivo:
- chamar `sync-whatsapp-status` periodicamente
- usar `x-cron-secret`
- encaminhar `Authorization: Bearer SERVICE_ROLE_KEY` internamente

### Proteção

O agendador aceita `x-cron-secret` com um destes valores:
- `BILLING_CRON_SECRET`
- `CRON_SECRET`
- `GATEWAY_ADMIN_SECRET` como fallback operacional interno

## Agendamento ativo

Ferramenta usada:
- `Codex app automation` (`automationId: whatsapp-status-scheduler-tick`)

Frequencia ativa:
- a cada 5 minutos

URL chamada:
- `https://hjmknnenbrowzadjcjhl.supabase.co/functions/v1/whatsapp-status-scheduler`

Responsavel operacional:
- operacao interna NC Finance / administradores globais

Header obrigatorio:
- `x-cron-secret: <BILLING_CRON_SECRET ou CRON_SECRET ou GATEWAY_ADMIN_SECRET>`

Exemplo de chamada HTTP:

```http
POST /functions/v1/whatsapp-status-scheduler
x-cron-secret: <BILLING_CRON_SECRET>
```

## Observabilidade

- `zapi-webhook` continua aceitando callbacks externos sem JWT
- token errado retorna `401`
- logs não devem incluir:
  - `token`
  - `client_token`
  - URL pública de PDF
  - telefone completo
  - mensagem completa do cliente final

## Regra de produto

Essa complexidade é interna e **não deve ser exposta ao cliente final**.

Para o cliente:
- `sent` continua sendo um estado aceitável quando a instância Z-API não fornece callback ou lookup compatível
- não mostrar erro técnico de webhook ausente
