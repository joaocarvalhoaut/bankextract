# Smoke Test Assistido - Piloto Real

Use este checklist em ambiente integrado antes de desligar mocks e antes do primeiro cliente piloto.

## Identificacao da execucao

- Data/hora:
- Ambiente:
- Operador:
- Empresa de teste (`company_id`):
- Build SHA / branch:
- `ENABLE_MOCK_WHATSAPP` no inicio:
- `ENABLE_GOOGLE_VISION_OCR`:

## Checklist funcional

- Login: autenticar com usuario valido e confirmar carregamento sem erro visivel.
- Dashboard: validar cards, metricas e ausencia de stack trace/erro cru.
- Importacao: enviar arquivo de teste, gerar previa e confirmar lote.
- Visao geral: validar filtros, totais, acoes de linha e responsividade minima.
- Analytics: abrir metricas e timeline sem query vazando empresa incorreta.
- Boletos: validar status do boleto, linha digitavel e metadados de Drive.
- Sync Drive: executar sincronizacao controlada e registrar resultado.
- Envio simulado: executar `send_single_charge` ou lote em simulacao e validar auditoria.
- Healthcheck Google Drive: rodar diagnostico dedicado e anexar resultado.
- Healthcheck Z-API: rodar diagnostico dedicado e anexar resultado.
- Auditoria: confirmar eventos com `request_id` e/ou `correlation_id`.
- Painel go-live: rodar `npm run diagnose:go-live-readiness` e anexar relatorio.

## Confirmacoes de seguranca

- Nenhum token apareceu em tela/log sem mascaramento.
- Telefones aparecem mascarados em logs operacionais.
- Nenhum stack trace foi exposto ao usuario final.
- `company_id` da empresa ativa foi respeitado nas telas e acoes validadas.
- Acoes perigosas possuem confirmacao explicita.

## Ativacao real

- Smoke test concluido com sucesso.
- `ENABLE_MOCK_WHATSAPP=false` aplicado somente apos smoke test.
- Secrets reais conferidos no ambiente integrado.
- Migrations aplicadas no banco alvo.
- Relatorio go-live salvo em `reports/`.
