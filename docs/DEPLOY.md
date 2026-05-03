# Deploy do BankExtract

## Variáveis `.env` do frontend

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_SUPABASE_USER_ID=
VITE_SUPABASE_COMPANY_ID=
```

- `VITE_SUPABASE_URL`: URL do projeto Supabase
- `VITE_SUPABASE_ANON_KEY`: chave pública anon
- `VITE_SUPABASE_USER_ID` e `VITE_SUPABASE_COMPANY_ID`: opcionais para fallback local

## Edge Functions usadas

- `send-whatsapp-charge`
- `send-scheduled-whatsapp-charges`
- `sync-google-sheets`

## Secrets do Supabase

### Obrigatórios para runtime padrão

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

### Google Sheets

- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_PROJECT_ID` (opcional, mas recomendado)

### WhatsApp mock / futuro real

- `ENABLE_MOCK_WHATSAPP=true`
- `CRON_SECRET`

### Z-API real no futuro

Não ativar agora, mas quando contratar:

- `ZAPI_INSTANCE_ID`
- `ZAPI_TOKEN`
- `ZAPI_CLIENT_TOKEN`

## Modo mock WhatsApp

Enquanto `ENABLE_MOCK_WHATSAPP=true`:

- a cobrança manual continua funcional
- a cobrança automática continua funcional
- os envios são registrados como `mock_enviado`
- nenhuma credencial da Z-API precisa ir para o frontend

## DEV x PROD

### DEV

- pode usar `ENABLE_MOCK_WHATSAPP=true`
- pode usar fallback local quando Supabase não estiver configurado
- Google Sheets pode ser testado com secrets reais ou mantido desligado

### PROD

- usar Supabase configurado
- aplicar schema consolidado
- revisar policies RLS
- manter segredos apenas nas Edge Functions / plataforma de deploy
- decidir depois se WhatsApp continua em mock ou passa para Z-API real

## Aplicar schema SQL

Arquivos principais:

- `supabase/bankextract_schema.sql`
- `supabase/migrations/consolidate_runtime_schema.sql`

Rodar no `SQL Editor` do Supabase.

## Deploy no Vercel

1. Conectar o repositório no Vercel
2. Configurar as variáveis:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Build command:
   - `npm run build`
4. Output:
   - `dist`

## Publicar Edge Functions

```powershell
supabase functions deploy send-whatsapp-charge
supabase functions deploy send-scheduled-whatsapp-charges
supabase functions deploy sync-google-sheets
```

## Checklist antes da venda real

- schema consolidado aplicado
- admin geral configurado em `system_admins`
- empresas e vínculos revisados
- Google Sheets validado
- audit logs validando ações sensíveis
- mock WhatsApp funcionando
- política comercial pronta
- landing page revisada
