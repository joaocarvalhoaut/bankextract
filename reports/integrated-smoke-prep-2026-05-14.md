# Integrated Smoke Prep Report

Date: 2026-05-14
Timezone: America/Sao_Paulo
Target company: `94aa3163-1e84-4c05-a398-dcef29997c63`
Company label: `Construtora Vale Ltda`

## Environment readiness

- Remote Supabase secrets confirmed present: `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `ENABLE_MOCK_WHATSAPP`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_CLIENT_TOKEN`
- Remote secrets missing from the linked project secret list: `ENABLE_GOOGLE_VISION_OCR`
- Local runtime files only contain Google service account credentials; they do not contain local `SUPABASE_SERVICE_ROLE_KEY` or Z-API credentials
- Google Drive root folder for the selected tenant was confirmed in database config

## Database / migrations

- Applied remotely: `20260513000000_drive_boleto_config.sql`
- Applied remotely: `20260514153000_operational_readiness_tables.sql`
- Remote migration list now matches local migration list
- Runtime evidence confirmed tables exist with RLS enabled:
  - `automation_audit_logs`
  - `zapi_circuit_state`
  - `collection_events`
  - `collection_intelligence_scores`
- Runtime evidence confirmed CRUD policies exist for all four tables
- Runtime evidence confirmed new tables are queryable; all counts are currently `0`

## Diagnostics executed

- `node scripts/diagnose-database-readiness.js`
  - Result: `warning`
  - Reason: local runtime still lacks `SUPABASE_SERVICE_ROLE_KEY`, so node script cannot self-validate runtime through Supabase client
  - Compensating evidence: direct remote CLI queries proved tables, indexes, RLS and policies exist
- `node scripts/diagnose-tenant-isolation.js`
  - Result: `ok`
- `node scripts/diagnose-google-drive-boletos.js --company-id=94aa3163-1e84-4c05-a398-dcef29997c63 --folder-id=<tenant-folder> --dry-run=false`
  - Result: `warning`
  - Real validations passed:
    - folder ID extraction
    - Google authentication
    - folder permissions
    - recursive listing
    - PDF detection
    - PDF MIME
    - empty/corrupt PDF probe
  - Residual warning: tenant validation inside the node script could not use Supabase admin locally
- `node scripts/diagnose-whatsapp-zapi.js --company-id=94aa3163-1e84-4c05-a398-dcef29997c63 --dry-run=false`
  - Result: `error`
  - Real validations passed:
    - credentials located
    - payload generation
    - base64 generation
    - idempotency code path presence
  - Blocking failure:
    - Z-API handshake returned HTTP `400`
- `node scripts/diagnose-go-live-readiness.js --company-id=94aa3163-1e84-4c05-a398-dcef29997c63 --dry-run=false --write-report=true`
  - Result: `error`
  - Generated report: `reports/go-live-readiness-2026-05-14T18-14-56-058Z.md`

## Smoke test execution status

Completed with evidence:

- Database migration apply
- Database table/index/RLS/policy validation
- Tenant isolation static audit
- Google Drive healthcheck with real credentials and real tenant folder
- Z-API healthcheck with real tenant credentials
- Build verification
- Unit/diagnostic test verification

Not completed in this run:

- Full authenticated UI smoke flow
- Real login
- Dashboard walkthrough
- Importacao through UI
- Vision/analytics/manual operational panel walkthrough
- Real controlled WhatsApp send
- Audit trail confirmation for a real provider dispatch
- Circuit breaker runtime transition during a real send
- Retry validation during a real send

## Z-API validation

- `instance_id` reapplied with masked value `3F0B***2251`
- main token reapplied with masked value `E932***D50A`
- `client_token` preserved with masked value `F73b***952S`
- previous diagnostic state:
  - handshake `HTTP 400`
  - sanitized provider body: `{ "error": "Instance not found" }`
- current diagnostic state:
  - handshake `HTTP 200`
  - sanitized provider body: `{ "connected": true, "session": false, "error": "You are already connected.", "smartphoneConnected": true }`
- linked database updated to:
  - `company_integrations.connected = true`
  - `phone_number = ''` (provider did not return a number in the validation path)
- Z-API circuit breaker reset:
  - `state = 'closed'`
  - `failure_count = 0`
  - `success_count = 1`

## Remaining issues

1. Local execution environment does not have `SUPABASE_SERVICE_ROLE_KEY`.
   - This does not block remote CLI validation, but it does block full runtime validation inside the node diagnostics.

2. `ENABLE_GOOGLE_VISION_OCR` is not present in the linked project secret list.
   - Only relevant if the pilot depends on OCR fallback beyond text-selectable PDFs.

3. Full integrated UI smoke could not be executed from this session because no authenticated app session/test user flow was available here.

## Current classification

Status: `RC operacional com Z-API validada`

Not approved yet for:

- `aprovado piloto controlado`
- `aprovado producao ampla`

## Next actions

1. Provide or load a runtime path for `SUPABASE_SERVICE_ROLE_KEY` if node-level runtime diagnostics must be fully green locally.
2. Decide whether `ENABLE_GOOGLE_VISION_OCR` is required for the pilot and configure it explicitly if needed.
3. Execute the authenticated UI smoke checklist in `docs/SMOKE_TEST_ASSISTED_CHECKLIST.md`.
4. In a separate controlled step, execute one real send and capture:
   - provider response
   - audit trail
   - circuit breaker state
   - retry behavior
   - end-user message evidence
