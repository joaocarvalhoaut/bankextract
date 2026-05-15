# Authenticated Smoke And Simulated-Send Report

Date: 2026-05-14
Timezone: America/Sao_Paulo
Authenticated user: `lucasoliveira@orthomax.com`
Authenticated company: `Orthomax`
Company id: `7b34c535-0959-4005-80ac-5bfa2cff8c54`

## Login result

- Login succeeded with the real user session
- The app redirected successfully from `/login` to `/dashboard`
- The active company in the authenticated session is `Orthomax`

## Screen validation

Validated successfully:

- `Dashboard`
- `Importacao`
- `Visao Geral`
- `Historico`
- `Integracoes`
- `Checklist Pre-Envio`
- `Central Operacional`

Observed UI state:

- `Integracoes` shows `0/2 integracoes ativas`
- `Checklist Pre-Envio` shows overall status `Nao pronto`
- `Central Operacional` loads a carteira with `16` open titles

## Simulated-send readiness check

Safe title candidate characteristics in the UI:

- phone present
- boleto found
- confidence `100%`
- no visible conflict state
- status `pendente`

However, the simulated-send step was **blocked by application state** before execution:

- row-level `Preparar cobranca` buttons are disabled
- top-level `Preparar cobranca` action is disabled

## Database confirmation for the authenticated company

Linked database evidence for `Orthomax`:

- `16` open titles exist
- `company_integrations.connected = null`
- no Z-API integration row is active for this tenant
- `google_sheets_config` is absent for this tenant
- `drive_root_folder_id` is not configured for this tenant

This matches the UI state and explains why the preparation/simulation actions are disabled.

## Send execution result

- No simulated send was executed
- No real send was executed
- No login bypass was used
- No frontend service-role usage was used
- No forced session manipulation was used

## Classification

Status: `bloqueado com motivo específico`

Specific blocking reason:

- the authenticated session belongs to `Orthomax`, but this tenant is not configured for the operational smoke path
- the app correctly disables `Preparar cobranca` because the current tenant lacks the required integration readiness

## Approval decision

Decision: `bloqueado`

This session is **not approved for first real controlled send** and is also **not ready for simulated-send validation** until one of the following is true:

1. a real session is opened for the tenant that already has validated Drive and Z-API integration, or
2. the authenticated tenant `Orthomax` is configured with the required backend integrations first

## Next action

1. Open a real authenticated session for the correct pilot tenant that has validated Z-API and Drive readiness, or
2. finish configuring `Orthomax` in:
   - Z-API integration
   - Google Drive / Sheets integration
3. rerun this same authenticated smoke
4. only then execute one `simulate=true` send and verify:
   - no real provider delivery
   - `logs_cobranca`
   - `automation_dispatches`
   - `automation_audit_logs`
   - timeline/audit updates
   - idempotency preservation
