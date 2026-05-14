# Validacao Real Z-API Pos-Deploy

Data: 2026-05-14  
Projeto Supabase: `hjmknnenbrowzadjcjhl`  
Edge Function validada: `billing-automation`

## Resultado Final

Status: `aprovado`

Escopo aprovado nesta rodada:
- redeploy real da edge `billing-automation`
- validacao da nova camada centralizada de interpretacao de erros Z-API no ambiente Supabase publicado
- confirmacao de UX normalizada para `400`, `403` e credenciais validas
- confirmacao de sanitizacao sem token, client token, telefone completo, payload completo ou stack trace

Observacao:
- a instancia de teste usada estava conectada, entao o fluxo validado para QR ficou no ramo `WhatsApp ja conectado`
- isso nao bloqueia a aprovacao desta rodada porque o objetivo aqui era validar a nova normalizacao de erros em ambiente real, e nao comprovar leitura de QR com uma instancia desconectada

## 1. Deploy

Comando executado:
- `supabase functions deploy billing-automation`

Resultado:
- `Deployed Functions on project hjmknnenbrowzadjcjhl: billing-automation`

Confirmacao de frontend:
- o frontend continua apontando para `billing-automation` em [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\services\companyIntegrationService.js](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\services\companyIntegrationService.js)

## 2. Testes Reais Pos-Deploy

Usuario autenticado para a chamada real:
- `lucasoliveira@orthomax.com`

Empresa da sessao:
- `Orthomax`

Modo da validacao:
- chamada autenticada ao `billing-automation` com `config` inline, no mesmo caminho usado pelo frontend
- sem envio real
- sem alterar credenciais persistidas da empresa durante esta rodada

### Credenciais validas

Config usada, mascarada:
- `instance_id`: `3F0B***2251`
- `token`: `E932***D50A`
- `client_token`: `F73b***952S`

Evidencias:
- `validate_connection` -> `ok=true`, `message="Integracao Z-API validada com sucesso."`, `connected=true`, `2725 ms`
- `get_qr_code` -> `ok=true`, `message="WhatsApp ja conectado"`, `status="connected"`, `2468 ms`

Conclusao:
- a edge publicada aceita credenciais validas
- a rota de QR retorna resposta terminal clara sem spinner infinito

### Client Token invalido

Cenario:
- mesmo `instance_id` e `token`
- `client_token` adulterado apenas para teste controlado

Resposta validada:
- `ok=false`
- `error="Client Token invalido ou expirado"`
- `details.kind="invalid_client_token"`
- `details.http_status=403`
- `details.endpoint="https://api.z-api.io/instances/:instance_id/token/:token/qr-code/image"`
- sem stack trace

Conclusao:
- a UX agora reflete corretamente o comportamento real observado do provider
- `403` real ficou normalizado como erro amigavel de `Client Token invalido ou expirado`

### Instance ID invalido

Cenario:
- mesmo `token` e `client_token`
- `instance_id` adulterado apenas para teste controlado

Resposta validada:
- `ok=false`
- `error="Instancia Z-API nao encontrada"`
- `details.kind="invalid_instance"`
- `details.http_status=400`
- `details.endpoint="https://api.z-api.io/instances/:instance_id/token/:token/qr-code/image"`
- sem stack trace

Conclusao:
- a UX agora reflete corretamente o comportamento real observado do provider
- `400` real ficou normalizado como erro amigavel de `Instancia Z-API nao encontrada`

## 3. Seguranca

### Erros e detalhes tecnicos

Validado nas respostas reais:
- nao houve exposicao de `token`
- nao houve exposicao de `client_token`
- nao houve exposicao de telefone completo
- nao houve exposicao de payload completo
- nao houve exposicao de `stack trace`

Correcao adicional aplicada nesta rodada:
- havia um vazamento residual no campo `details.endpoint`, que retornava a URL completa da Z-API com `instance_id` e `token`
- isso foi corrigido na edge para publicar apenas a rota sanitizada:
  - `https://api.z-api.io/instances/:instance_id/token/:token/qr-code/image`

Arquivo corrigido:
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts)

### Bundle de producao

Validado:
- build limpo
- `dist/index.html` referencia o bundle atual `assets/index-CEt4B3JI.js`
- busca por `[ZAPI get_qr_code]` no `dist` atual sem ocorrencias

## 4. Matriz de Normalizacao Validada

- `401` ou `403` -> `Client Token invalido ou expirado`
- `400` ou `404` -> `Instancia Z-API nao encontrada`
- `429` -> `Limite temporario excedido`
- `timeout`, `abort`, `failed to fetch`, falha de rede -> `Z-API indisponivel no momento`

Validado nesta rodada em ambiente real:
- `403` -> mensagem correta
- `400` -> mensagem correta
- credenciais validas -> sucesso correto
- ramo `ja conectado` -> sucesso correto

Validado por teste automatizado local:
- `401`
- `404`
- `429`
- `timeout`

## 5. Resultado dos Comandos

- `npm.cmd test` -> `ok` (`10/10` testes passando)
- `npm.cmd run lint` -> `ok`
- `npm.cmd run build` -> `ok`
- `supabase functions deploy billing-automation` -> `ok`

## 6. Bugs Encontrados e Correcoes Aplicadas

1. Vazamento residual de segredo no campo `details.endpoint`
- causa raiz: a nova camada preservava a URL bruta do provider
- impacto: `instance_id` e `token` apareciam no detalhe tecnico do erro
- correcao: sanitizacao central do endpoint na edge antes de serializar `details`
- status: corrigido, redeployado e revalidado

Nao houve novos bugs funcionais nesta rodada na interpretacao de erro.

## 7. Arquivos Alterados

- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\supabase\functions\billing-automation\index.ts)
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\reports\zapi-post-deploy-validation-2026-05-14.md](C:\Users\ACIRLEIDE FERREIRA\Documents\New project\reports\zapi-post-deploy-validation-2026-05-14.md)

## 8. Pendencias Restantes

Pendencias nao bloqueantes para este escopo:
- nao houve validacao visual de QR Code porque a instancia de teste ja estava conectada
- nao houve exercicio real de `429` ou timeout em producao nesta rodada; esses cenarios seguem cobertos por teste automatizado e pela camada centralizada publicada

## Checklist Final

- deploy da edge concluido
- frontend segue apontando para a funcao atualizada
- `403` real normalizado para `Client Token invalido ou expirado`
- `400` real normalizado para `Instancia Z-API nao encontrada`
- credenciais validas aceitas em runtime real
- resposta de `QR/já conectado` clara e sem spinner infinito
- sem `token`, `client_token`, telefone completo, payload completo ou stack trace nos erros retornados
- `npm test`, `npm run lint` e `npm run build` aprovados

