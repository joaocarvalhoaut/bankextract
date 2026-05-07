# Relatório de Código Morto e Refatoração — BankExtract

## 1. Resumo executivo

- Nível de risco geral: médio.
- Quantidade aproximada de itens encontrados: 20+ pontos de atenção entre componentes pouco acessíveis, logs de debug, duplicidade de services e hook legado aparentemente fora do fluxo principal.
- Áreas mais críticas:
  - duplicidade entre `financeService.js` e `financeService.ts`
  - hook legado `useFinance.js` aparentemente sem consumidores no app atual
  - telas/componentes exportados sem evidência de uso
  - normalização financeira espalhada em mais de um service

## 2. Componentes possivelmente não renderizados

| Arquivo | Componente | Evidência | Risco de remoção | Recomendação |
| --- | --- | --- | --- | --- |
| `src/screens/PreviewScreen.jsx` | `PreviewScreen` | Busca por `PreviewScreen` retornou apenas a própria declaração. | Médio | Confirmar se foi substituída por `ImportacaoScreen` ou fluxo inline em `App.jsx`. |
| `src/components/WhatsAppChargeModal.jsx` | `WhatsAppChargeModal` | Busca por `WhatsAppChargeModal` retornou apenas a própria declaração e referências internas de hook legado. | Médio | Validar se o modal foi descontinuado após a Central Operacional nova. |
| `src/components/WhatsAppAutoConfig.jsx` | `WhatsAppAutoConfig` | Busca textual retorna apenas o próprio componente e service relacionado. | Médio | Verificar se o novo fluxo de Automações substituiu esse componente. |
| `src/hooks/useFinance.js` | Hook inteiro e modais internos | Busca por `useFinance(` retornou apenas a própria exportação. | Alto | Não remover ainda. Primeiro confirmar se existe uso indireto por integração externa ou branch antiga. |

## 3. Funções declaradas mas não chamadas

| Arquivo | Função | Evidência | Risco | Recomendação |
| --- | --- | --- | --- | --- |
| `src/services/analyticsService.js` | `normalizeFinancialRecord` | Atualmente usada internamente, mas não há consumo externo direto. | Baixo | Manter. Faz parte da nova camada de normalização compartilhada. |
| `src/services/analyticsService.js` | `buildDashboardFinancialData` | Consumida por `App.jsx`; não é problema, apenas merece virar fonte única oficial. | Baixo | Consolidar como normalizador oficial do dashboard/analytics. |
| `src/hooks/useFinance.js` | `openWhatsAppChargeModal` | Busca textual só retorna declaração e retorno do hook. | Médio | Revisar junto com o hook inteiro antes de remover. |
| `src/hooks/useFinance.js` | `closeClearOverviewModal` | Mesmo cenário do hook legado. | Médio | Revisar em bloco com `useFinance.js`. |

## 4. Imports/variáveis não utilizados

| Arquivo | Item | Tipo | Recomendação |
| --- | --- | --- | --- |
| `src/screens/CentralCobrancaScreen.jsx` | `console.log('CentralCobranca getBillingCenter response', response)` | Debug/log | Remover ou proteger por flag de debug após homologação. |
| `src/screens/CobrancaAutomaticaScreen.jsx` | `console.log('CobrancaAutomatica companyId', resolvedCompanyId)` | Debug/log | Remover após validação do fluxo de company context. |
| `src/screens/ImportacaoScreen.jsx` | `console.info('[PlanLimitNotice] importacao', limit)` | Debug/log | Trocar por logger central ou remover em produção. |
| `src/hooks/useAutoGoogleSheetsSync.js` | `console.log`/`console.warn` | Debug/log | Revisar se precisam ficar em produção; hoje parecem logs operacionais. |

## 5. Estados React suspeitos

| Arquivo | Estado | Problema | Recomendação |
| --- | --- | --- | --- |
| `src/hooks/useFinance.js` | `clearOverviewModalOpen` | Estado existe, mas o hook não tem consumidor aparente no app atual. | Revisar o hook inteiro antes de limpar estados isolados. |
| `src/hooks/useFinance.js` | `activeTab` | Fluxo próprio dentro de hook legado, enquanto `App.jsx` hoje controla navegação central. | Avaliar se esse estado ainda faz sentido ou se virou sobra histórica. |
| `src/hooks/useFinance.js` | Estados de modais de WhatsApp | Suspeitos por falta de consumidores externos. | Validar se o hook ficou obsoleto após a nova Central de Cobrança. |

## 6. Services/telas inacessíveis

| Arquivo | Motivo | Recomendação |
| --- | --- | --- |
| `src/screens/PreviewScreen.jsx` | Sem evidência de rota ou import fora do próprio arquivo. | Confirmar se pode ser arquivada/removida em etapa controlada. |
| `src/services/financeService.js` + `src/services/financeService.ts` | Duas camadas convivendo com sobreposição parcial de responsabilidade. | Mapear quais consumidores devem falar só com a camada `.ts`. |
| `src/hooks/useFinance.js` | Sem evidência de consumo atual. | Tratar como legado de alto risco; não remover sem teste completo. |

## 7. Código comentado sem explicação

| Arquivo | Trecho/resumo | Recomendação |
| --- | --- | --- |
| Projeto em geral | Não encontrei grande volume de blocos comentados mortos nesta rodada. | Manter revisão futura por arquivo com foco em comentários históricos e temporários. |

## 8. Refatorações recomendadas por prioridade

### Prioridade Alta

- Remover logs de debug em telas operacionais após homologação.
- Unificar a fonte dos KPIs financeiros entre dashboard, analytics e sidebar.
- Corrigir/importar um script de lint para capturar imports e variáveis não usados automaticamente.
- Mapear oficialmente o que ainda depende de `financeService.js` versus `financeService.ts`.

### Prioridade Média

- Consolidar `useFinance.js` ou aposentá-lo em uma etapa testada.
- Revisar componentes aparentemente órfãos:
  - `PreviewScreen`
  - `WhatsAppChargeModal`
  - `WhatsAppAutoConfig`
- Padronizar nomes dos campos financeiros em um normalizador único reutilizável.
- Revisar mocks/fallbacks para separar melhor modo local e Supabase real.

### Prioridade Baixa

- Configurar ESLint.
- Configurar Prettier.
- Criar `npm run check` agregando build + lint.
- Adicionar testes unitários mínimos para normalização financeira e limits/plans.

## 9. Tarefas e subtarefas para refatoração

### Tarefa 1 — Limpeza segura

Subtarefas:
- remover logs de debug já homologados
- remover imports não utilizados apontados por lint futuro
- remover variáveis locais claramente não usadas
- validar build após cada micro-limpeza

### Tarefa 2 — Padronização de services

Subtarefas:
- mapear responsabilidades de `financeService.js`
- mapear responsabilidades de `financeService.ts`
- escolher a camada única de leitura financeira
- atualizar consumidores prioritários: dashboard, sidebar, analytics, cobrança

### Tarefa 3 — Padronização de campos financeiros

Subtarefas:
- oficializar `normalizeFinancialRecord`
- aplicar no dashboard
- aplicar no analytics
- aplicar futuramente na central operacional e relatórios

### Tarefa 4 — Remoção controlada de componentes mortos

Subtarefas:
- validar se `PreviewScreen` tem uso escondido
- validar se `WhatsAppChargeModal` ainda faz parte do fluxo legado
- validar se `WhatsAppAutoConfig` ainda é necessário
- remover um componente por vez com build após cada remoção

### Tarefa 5 — Organização de mocks/fallbacks

Subtarefas:
- revisar fallback local em analytics
- revisar fallback em subscriptions
- garantir que produção não dependa de mocks implícitos
- documentar comportamento sem Supabase

### Tarefa 6 — Qualidade contínua

Subtarefas:
- adicionar ESLint sem dependências excessivas
- adicionar Prettier opcional
- criar script `npm run check`
- definir smoke tests mínimos de dashboard/onboarding/planos

## 10. Itens que NÃO devem ser removidos ainda

- `src/hooks/useFinance.js`
- `src/services/financeService.js`
- `src/services/financeService.ts`
- `src/components/WhatsAppChargeModal.jsx`
- `src/components/WhatsAppAutoConfig.jsx`
- `src/screens/PreviewScreen.jsx`
- qualquer mock/fallback local de Supabase
- migrations e schema consolidados

Esses itens parecem candidatos naturais a simplificação, mas ainda têm risco de dependência indireta, histórico de uso ou papel de compatibilidade.

## Rodada 2 — Mapeamento de dependências reais

### 1. `src/hooks/useFinance.js`

| Campo | Mapeamento |
| --- | --- |
| Arquivo | `src/hooks/useFinance.js` |
| Onde é importado | Não há imports ativos no app atual. A busca por `useFinance` retornou apenas a própria exportação. |
| Onde é usado | Sem uso direto em `App.jsx` ou telas atuais. O hook ainda encapsula fluxos antigos de importação, tabela, representantes, WhatsApp e modais. |
| Risco de remoção | Alto |
| Recomendação | Manter por enquanto. Tratar como legado isolado, não como código morto confirmado. |
| Próximo passo seguro | Confirmar se existe branch, plugin interno ou fluxo fora do `App.jsx` que ainda consome o hook. Se não houver, migrar responsabilidades residuais antes de removê-lo. |

Observação:
- o hook ainda referencia `WhatsAppChargeModal`, `auditLog`, `whatsappService`, `useAutoGoogleSheetsSync` e a camada antiga de `financeService`
- o fluxo principal do app já não depende dele; `App.jsx` passou a orquestrar estado diretamente

### 2. `src/screens/PreviewScreen.jsx`

| Campo | Mapeamento |
| --- | --- |
| Arquivo | `src/screens/PreviewScreen.jsx` |
| Onde é importado | Não há imports ativos no projeto. |
| Onde é usado | Não há rota, menu, lazy import ou chamada no `App.jsx`. |
| Risco de remoção | Médio |
| Recomendação | Tratar como tela órfã provável, mas não remover ainda. |
| Próximo passo seguro | Comparar com o fluxo atual de [ImportacaoScreen.jsx](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/screens/ImportacaoScreen.jsx>) e confirmar se toda a revisão de prévia já foi absorvida por [PreviewImportTable.jsx](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/components/PreviewImportTable.jsx>). |

Conclusão:
- é o candidato mais forte a remoção futura, mas ainda precisa de validação funcional

### 3. `src/components/WhatsAppChargeModal.jsx`

| Campo | Mapeamento |
| --- | --- |
| Arquivo | `src/components/WhatsAppChargeModal.jsx` |
| Onde é importado | Não há imports ativos fora do legado. |
| Onde é usado | O único acoplamento encontrado é conceitual dentro de `useFinance.js`, via estados `whatsappModal`, `openWhatsAppChargeModal`, `closeWhatsAppModal` e `sendWhatsAppCharges`. O componente em si não é montado pelo `App.jsx`. |
| Risco de remoção | Médio |
| Recomendação | Manter até encerrar a revisão do hook legado. |
| Próximo passo seguro | Confirmar se o fluxo atual foi totalmente substituído por [MessagePreviewModal.jsx](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/components/MessagePreviewModal.jsx>) e pelos modais da [CentralCobrancaScreen.jsx](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/screens/CentralCobrancaScreen.jsx>). |

Substituto atual provável:
- `MessagePreviewModal` no `App.jsx`
- preparação manual e prévia de envio na `Central Operacional`

### 4. `src/components/WhatsAppAutoConfig.jsx`

| Campo | Mapeamento |
| --- | --- |
| Arquivo | `src/components/WhatsAppAutoConfig.jsx` |
| Onde é importado | Não há imports ativos nas telas atuais. |
| Onde é usado | Nenhum uso encontrado em `App.jsx`, `AutomacoesScreen.jsx` ou rota atual. |
| Risco de remoção | Médio |
| Recomendação | Manter temporariamente como componente legado não conectado. |
| Próximo passo seguro | Comparar o que ele cobre com a implementação nova em [CobrancaAutomaticaScreen.jsx](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/screens/CobrancaAutomaticaScreen.jsx>) e remover apenas depois de validar equivalência funcional. |

Substituto atual provável:
- `CobrancaAutomaticaScreen.jsx` com abas `Configuração`, `Templates`, `Integrações` e `Monitoramento`

### 5. `src/services/financeService.js`

| Campo | Mapeamento |
| --- | --- |
| Arquivo | `src/services/financeService.js` |
| Onde é importado | `src/components/CobrancaIndicators.jsx`, `src/hooks/useEmpresa.js`, `src/hooks/useFinance.js` e indiretamente por `src/services/financeService.ts`. |
| Onde é usado | Continua sendo a base de legado, mocks, `tenantContext` e parte das operações que a camada `.ts` delega. |
| Risco de remoção | Alto |
| Recomendação | Não remover. Hoje ele ainda é infraestrutura de compatibilidade. |
| Próximo passo seguro | Reduzir seus consumidores diretos primeiro, começando por `CobrancaIndicators.jsx`, `useEmpresa.js` e qualquer helper que ainda importe sem extensão. |

Pontos importantes:
- concentra mock dataset, `tenantContext`, `fetchCompanyDataset`, `fetchRegistros`, `sendWhatsAppCharge` e vários adaptadores antigos
- parte da camada `.ts` ainda delega chamadas para ele:
  - `getRepresentatives`
  - `updateFinancialRecord`
  - `saveRepresentative`
  - `deleteRepresentative`
  - `deleteFinancialRecords`
  - `fetchCobrancaDashboardMeta`
  - `fetchCompanyDataset`
  - `sendWhatsAppCharge`

### 6. `src/services/financeService.ts`

| Campo | Mapeamento |
| --- | --- |
| Arquivo | `src/services/financeService.ts` |
| Onde é importado | `src/App.jsx` e `src/screens/VisaoGeralScreen.jsx` de forma explícita. |
| Onde é usado | É a fachada principal do fluxo atual do app logado: dashboard, importação, histórico, cobranças, automações, sistema e visão geral. |
| Risco de remoção | Alto |
| Recomendação | Manter como camada principal atual e usá-lo como destino da unificação. |
| Próximo passo seguro | Migrar as dependências que ainda falam com o `.js` para a fachada `.ts`, depois internalizar gradualmente os delegadores herdados. |

Conclusão sobre duplicidade:
- `financeService.ts` já é a API de alto nível do app atual
- `financeService.js` ainda é a base de compatibilidade e mock
- a unificação segura não deve começar removendo o `.js`, mas sim absorvendo seus delegadores para dentro do `.ts` por grupos pequenos

### Plano seguro de unificação de `financeService.js` e `financeService.ts`

1. Padronizar todos os consumidores externos para importar explicitamente `financeService.ts`.
2. Mover `tenantContext` para um módulo próprio de contexto/runtime, para desacoplar `useEmpresa.js` do arquivo legado.
3. Migrar primeiro os delegadores mais estáveis:
   - `getRepresentatives`
   - `updateFinancialRecord`
   - `saveRepresentative`
   - `deleteRepresentative`
   - `deleteFinancialRecords`
4. Depois migrar leitura de dataset e mocks:
   - `fetchCompanyDataset`
   - `fetchRegistros`
5. Por último revisar:
   - `sendWhatsAppCharge`
   - bootstrap/mock global
   - utilitários internos de compatibilidade

### Decisão atual por item

| Item | Decisão |
| --- | --- |
| `useFinance.js` | Manter e mapear antes de qualquer remoção |
| `PreviewScreen.jsx` | Forte candidato a órfão, mas validar fluxo antes de remover |
| `WhatsAppChargeModal.jsx` | Manter até aposentar o hook legado |
| `WhatsAppAutoConfig.jsx` | Manter até confirmar equivalência total da tela nova |
| `financeService.js` | Manter como base de compatibilidade por enquanto |
| `financeService.ts` | Manter como fachada principal e destino da unificação |

## Rodada 3 — Migração controlada para financeService.ts

### Mapeamento de imports sem extensão

| Arquivo consumidor | Import anterior | Resolução no bundler | Equivalente seguro em `financeService.ts` | Status |
| --- | --- | --- | --- | --- |
| `src/components/CobrancaIndicators.jsx` | `import { financeService } from '../services/financeService'` | Resolvia para o legado por ausência de extensão explícita | Sim, `financeService` existe na fachada `.ts` e expõe `fetchCobrancaDashboardMeta` | Migrado |
| `src/hooks/useEmpresa.js` | `import { tenantContext } from '../services/financeService'` | Resolvia para o legado por ausência de extensão explícita | Parcialmente; foi necessário reexport seguro de `tenantContext` pela fachada `.ts` | Migrado |
| `src/hooks/useFinance.js` | `import { financeService, tenantContext } from '../services/financeService'` | Resolve para o legado | Não migrado nesta rodada por risco estrutural | Mantido |

### Mudanças aplicadas

| Arquivo | Import anterior | Import novo | Funções afetadas | Status | Motivo | Risco |
| --- | --- | --- | --- | --- | --- | --- |
| `src/components/CobrancaIndicators.jsx` | `../services/financeService` | `../services/financeService.ts` | `financeService.fetchCobrancaDashboardMeta()` | Migrado | Método existe na fachada `.ts` e já delega com compatibilidade | Baixo |
| `src/hooks/useEmpresa.js` | `../services/financeService` | `../services/financeService.ts` | `tenantContext.currentUserId` | Migrado | Reexport simples de `tenantContext` na fachada `.ts`, sem mudar comportamento | Baixo |
| `src/hooks/useFinance.js` | `../services/financeService` | Mantido | `financeService`, `tenantContext` | Pendente | Hook legado inteiro ainda depende da camada antiga e concentra fluxo grande | Médio |

### Reexports/compatibilidade adicionados

| Arquivo | Mudança | Motivo |
| --- | --- | --- |
| `src/services/financeService.ts` | `export { tenantContext };` | Permitir migração segura de consumidores leves sem obrigar import direto do legado |

### Imports mantidos e motivo

| Arquivo | Motivo para manter | Bloqueador |
| --- | --- | --- |
| `src/hooks/useFinance.js` | Hook legado não usado pelo app principal, mas ainda concentra fluxo complexo de compatibilidade | Precisa ser aposentado ou migrado em bloco, não por import isolado |

### Funções que faltam na fachada `.ts`

Nenhuma função necessária para `CobrancaIndicators.jsx` ficou faltando.

Para `useEmpresa.js`, faltava apenas a exposição de `tenantContext`, resolvida com reexport seguro.

### Próximos candidatos

- `src/hooks/useFinance.js`
- qualquer novo consumidor futuro que ainda importe `../services/financeService` sem extensão

### Bloqueadores para remover `financeService.js` futuramente

- `tenantContext` ainda nasce no legado
- `financeService.ts` ainda delega várias operações para o `.js`:
  - `getRepresentatives`
  - `updateFinancialRecord`
  - `saveRepresentative`
  - `deleteRepresentative`
  - `deleteFinancialRecords`
  - `fetchCobrancaDashboardMeta`
  - `fetchCompanyDataset`
  - `sendWhatsAppCharge`
- `useFinance.js` ainda depende diretamente do legado

## Rodada 4 — Extração de tenantContext

### Resultado da extração

O `tenantContext` deixou de nascer dentro de `financeService.js` e passou a viver em um módulo próprio compartilhado:

- novo módulo: `src/services/tenantContext.js`

Esse módulo agora concentra apenas:
- `tenantContext`
- `fallbackTenantIds`
- `currentTenantUserId`
- `defaultTenantCompanyId`

Sem mover lógica financeira geral.

### Tabela de migração

| Arquivo | Antes | Depois | Impacto | Risco | Resultado |
| --- | --- | --- | --- | --- | --- |
| `src/services/financeService.js` | Declarava `tenantContext`, `fallbackTenantIds`, `currentUserId`, `defaultCompanyId` internamente | Importa esses valores de `tenantContext.js` | Reduziu acoplamento estrutural do legado | Baixo | Concluído |
| `src/services/financeService.ts` | Importava `tenantContext` do legado `.js` e o reexportava | Importa e reexporta `tenantContext` de `tenantContext.js` | A fachada `.ts` deixou de depender do contexto interno do legado | Baixo | Concluído |
| `src/hooks/useEmpresa.js` | Lia `tenantContext` via `financeService.ts` | Lê `tenantContext` direto de `tenantContext.js` | Removeu dependência desnecessária da fachada financeira | Baixo | Concluído |
| `src/hooks/useFinance.js` | Lia `tenantContext` do import legado `../services/financeService` | Lê `tenantContext` direto de `tenantContext.js` | Separou contexto de tenant da API financeira, sem mexer no hook legado | Baixo | Concluído |

### Quanto isso reduziu o acoplamento

Antes:
- `financeService.ts` dependia do `tenantContext` definido dentro do `financeService.js`
- qualquer consumidor leve de contexto acabava encostando indiretamente na camada legada

Depois:
- `tenantContext` passou a ser um módulo transversal próprio
- `financeService.ts` continua dependendo do legado para operações compatíveis, mas não mais para o contexto do tenant
- `useEmpresa.js` e `useFinance.js` já conseguem ler contexto sem atravessar a fachada financeira

### Consumidores migrados

- `src/services/financeService.js`
- `src/services/financeService.ts`
- `src/hooks/useEmpresa.js`
- `src/hooks/useFinance.js`

### Pontos ainda acoplados ao legado

- `financeService.ts` ainda delega várias operações ao `financeService.js`:
  - `getRepresentatives`
  - `updateFinancialRecord`
  - `saveRepresentative`
  - `deleteRepresentative`
  - `deleteFinancialRecords`
  - `fetchCobrancaDashboardMeta`
  - `fetchCompanyDataset`
  - `sendWhatsAppCharge`

### Próximos candidatos a extração modular

- runtime context completo da fachada financeira
- normalizadores de registros financeiros
- helpers de dataset/mock local
- adaptadores de representatives e history rows

## Rodada 5 — Extração de helpers puros

### Resultado geral

Foi criado o módulo:

- `src/services/financeNormalizers.js`

Ele concentra apenas helpers puros e sem efeito colateral para:
- normalização de texto
- normalização de valor
- fallback de campos
- conversão de data
- conversão de número
- diferença em dias
- normalização de registro financeiro

Não foi criado `financeFormatters.js` nesta rodada porque o projeto já possui um módulo estável de formatação em:

- `src/utils/format.js`

Criar outro formatter agora aumentaria duplicação em vez de reduzir.

### Tabela de extração

| Helper | Origem | Novo módulo | Arquivos impactados | Risco | Status |
| --- | --- | --- | --- | --- | --- |
| `normalizeText` | `financeService.ts` e uso implícito no legado | `financeNormalizers.js` | `financeService.ts`, `financeService.js` | Baixo | Extraído |
| `normalizeMoney` | `analyticsService.js` e `financeService.ts` | `financeNormalizers.js` | `analyticsService.js`, `financeService.ts` | Baixo | Extraído |
| `firstDefined` | `analyticsService.js` | `financeNormalizers.js` | `analyticsService.js`, `financeNormalizers.js` | Baixo | Extraído |
| `toDate` | `analyticsService.js` e `financeService.ts` (`parseDate`) | `financeNormalizers.js` | `analyticsService.js`, `financeService.ts` | Baixo | Extraído |
| `toNumber` | `analyticsService.js` | `financeNormalizers.js` | `analyticsService.js`, `financeNormalizers.js` | Baixo | Extraído |
| `diffInDays` | `analyticsService.js` | `financeNormalizers.js` | `analyticsService.js`, `financeNormalizers.js` | Baixo | Extraído |
| `normalizeFinancialRecord` | `analyticsService.js` | `financeNormalizers.js` | `analyticsService.js` | Baixo | Extraído |

### Arquivos impactados

- `src/services/financeNormalizers.js`
- `src/services/analyticsService.js`
- `src/services/financeService.ts`
- `src/services/financeService.js`

### Helpers mantidos no arquivo original e motivo

| Helper | Arquivo mantido | Motivo |
| --- | --- | --- |
| `normalizeRepresentativeList` | `financeService.js` e `financeService.ts` | Apesar de puro, ainda está muito acoplado ao formato de representatives e ao fluxo legado/fachada. Melhor extrair junto com a camada de representatives. |
| `normalizeRecordStatus` | `financeService.ts` | Regra contextual da fachada financeira, ainda ligada à semântica local de status do produto. |
| `money` do legado | `financeService.js` | Muito espalhado no mock legado; trocar agora aumentaria superfície de risco sem ganho proporcional. |
| `formatDateTimeLabel` | `financeService.ts` | É formatação de UX local, não um normalizador transversal. |
| mapeadores `toUiRecord`, `toLegacyRecord`, `toUiHistoryRow` | `financeService.ts` | Dependem de shape de dados e contexto do serviço, não são apenas helpers puros genéricos. |
| `mapRegistroToApp`, `mapImportacaoToApp`, `mapConfiguracaoToApp` | `financeService.js` | Ainda fazem parte da camada de compatibilidade/mock. |

### Pontos ainda acoplados

- `financeService.ts` continua dependente do `financeService.js` para operações compatíveis
- os mapeadores de registros/importações ainda vivem separados entre legado e fachada
- helpers de representatives continuam duplicados entre as duas camadas

### Bloqueadores para reduzir `financeService.js` futuramente

- delegates ainda ativos da fachada `.ts` para o `.js`
- mock dataset e adaptadores ainda centralizados no legado
- `useFinance.js` continua acoplado ao legado
- representatives/history ainda não foram extraídos para módulos próprios

### Próximos candidatos de extração

- normalizadores/adaptadores de representatives
- mapeadores de registros e histórico
- utilitários de dataset mock
- helper único de status financeiro, se a semântica for consolidada primeiro

## Rodada 6 — Extração de adaptadores puros

### Resultado geral

Foi criado o módulo:

- `src/services/financeAdapters.js`

Ele concentra adaptadores puros e sem efeito colateral para:
- normalização de representatives
- mapeamento de representatives para app/db
- mapeamento de importações para app/db
- conversão de histórico para UI
- construção de mapa de nomes de empresa

### Tabela de extração

| Adaptador | Origem | Novo módulo | Arquivos impactados | Risco | Status | Motivo |
| --- | --- | --- | --- | --- | --- | --- |
| `normalizeRepresentativeList` | `financeService.js` e `financeService.ts` | `financeAdapters.js` | `financeService.js`, `financeService.ts` | Baixo | Extraído | Era duplicado e puro |
| `mapRepresentanteToApp` | `financeService.js` | `financeAdapters.js` | `financeService.js` | Baixo | Extraído | Shape estável e sem efeitos colaterais |
| `mapRepresentanteToDb` | `financeService.js` | `financeAdapters.js` | `financeService.js` | Baixo | Extraído | Conversão pura de payload |
| `mapImportacaoToApp` | `financeService.js` | `financeAdapters.js` | `financeService.js` | Baixo | Extraído | Adaptador puro de histórico/importação |
| `mapImportacaoToDb` | `financeService.js` | `financeAdapters.js` | `financeService.js` | Baixo | Extraído | Conversão pura para mock/db legado |
| `toUiHistoryRow` | `financeService.ts` | `financeAdapters.js` | `financeService.ts` | Baixo | Extraído | Adaptador puro de histórico para UI |
| `buildCompanyNameMap` | `financeService.ts` | `financeAdapters.js` | `financeService.ts` | Baixo | Extraído | Helper puro de suporte ao histórico/records |

### Adaptadores mantidos no arquivo original e motivo

| Adaptador | Arquivo mantido | Motivo |
| --- | --- | --- |
| `toUiRecord` | `financeService.ts` | Ainda acoplado à normalização de status e ao shape da fachada atual |
| `toLegacyRecord` | `financeService.ts` | Ainda ligado ao contexto runtime da fachada |
| `mapRegistroToApp` | `financeService.js` | Continua fazendo parte da camada de compatibilidade/mock e usa shape legado específico |
| `mapRegistroToDb` | `financeService.js` | Mesmo motivo do item anterior |
| `mapConfiguracaoToApp` | `financeService.js` | Adaptador puro, mas ainda fortemente local ao legado/mock |
| `mapConfiguracaoToDb` | `financeService.js` | Mesmo motivo |
| `toLegacyImportEntry` | `financeService.ts` | Apesar de puro, ainda depende de contexto runtime local |

### Arquivos impactados

- `src/services/financeAdapters.js`
- `src/services/financeService.js`
- `src/services/financeService.ts`

### Pontos ainda acoplados

- `financeService.ts` ainda delega operações ao `financeService.js`
- adaptação de registros financeiros ainda está separada entre legado e fachada
- `useFinance.js` continua acoplado ao legado
- configuração financeira e registros ainda têm mapeadores próprios no `.js`

### Bloqueadores para reduzir `financeService.js` futuramente

- `fetchCompanyDataset` ainda nasce no legado
- `sendWhatsAppCharge` continua no legado
- `mapRegistroToApp` e `mapRegistroToDb` ainda não foram consolidados
- `mapConfiguracaoToApp` e `mapConfiguracaoToDb` ainda não foram consolidados
- `useFinance.js` segue referenciando a camada antiga

### Próximos candidatos de extração

- adaptadores puros de registros financeiros
- adaptadores puros de configuração financeira
- helper de status financeiro, se a semântica for estabilizada
- módulo de dataset/mock local

## Rodada 7 — Adaptadores de registros e configuração financeira

### Resultado geral

Nesta rodada foram extraídos, com baixo risco, adaptadores puros do legado para o módulo compartilhado:

- `src/services/financeAdapters.js`

### Tabela

| Adaptador | Origem | Destino | Arquivos impactados | Risco | Status | Motivo |
| --- | --- | --- | --- | --- | --- | --- |
| `mapRegistroToApp` | `financeService.js` | `financeAdapters.js` | `financeAdapters.js`, `financeService.js` | Baixo | Extraído | Adaptador puro, sem dependência de Supabase ou runtime mutável |
| `mapRegistroToDb` | `financeService.js` | `financeAdapters.js` | `financeAdapters.js`, `financeService.js` | Baixo | Extraído | Conversão pura de shape legado |
| `mapConfiguracaoToApp` | `financeService.js` | `financeAdapters.js` | `financeAdapters.js`, `financeService.js` | Baixo | Extraído | Adaptador puro e estável |
| `mapConfiguracaoToDb` | `financeService.js` | `financeAdapters.js` | `financeAdapters.js`, `financeService.js` | Baixo | Extraído | Conversão pura, sem efeito colateral |

### Adaptadores mantidos no local original e motivo

| Adaptador | Local mantido | Motivo |
| --- | --- | --- |
| `toUiRecord` | `financeService.ts` | Ainda depende da semântica atual de `normalizeRecordStatus` e do shape final da fachada |
| `toLegacyRecord` | `financeService.ts` | Recebe `context` de runtime e serve à compatibilidade da fachada |
| `toLegacyImportEntry` | `financeService.ts` | Ainda ligado ao `context` e ao fluxo local de importação da fachada |
| `normalizeRecordStatus` | `financeService.ts` | Regra de domínio, não apenas adaptação mecânica |

### Pontos ainda acoplados ao legado

- `financeService.ts` ainda delega chamadas operacionais ao `financeService.js`
- `fetchCompanyDataset` ainda nasce no legado
- `sendWhatsAppCharge` continua no legado
- `useFinance.js` continua dependente da camada antiga
- o dataset mock ainda está centralizado no legado

### Próximos passos para reduzir `financeService.js`

1. Extrair adaptadores/context helpers restantes da fachada que ainda são puramente estruturais.
2. Mapear o dataset mock para um módulo próprio.
3. Só depois começar a migrar, por etapas, os delegadores operacionais do `.ts` que ainda chamam o `.js`.

## Rodada 8 � Isolamento de dataset legado

### Resultado geral

Foi criado o m�dulo:

- `src/services/financeDataset.js`

Ele concentra apenas o dataset legado local, sementes de preview e helpers de bootstrap/dataset de baixo risco. As chamadas Supabase, updates/deletes reais e a l�gica operacional principal permaneceram no `financeService.js`.

### Tabela

| Item | Origem | Destino | Impacto | Risco | Status |
| --- | --- | --- | --- | --- | --- |
| dataset mock de empresas, representantes, registros, importa��es e configura��es | `financeService.js` | `financeDataset.js` | remove o seed local do service principal | Baixo | Extra�do |
| `db` legada em mem�ria | `financeService.js` | `financeDataset.js` | centraliza o estado mock compartilhado | Baixo | Extra�do |
| `defaultAutomationRules` | `financeService.js` | `financeDataset.js` | isola regra padr�o usada no fluxo local | Baixo | Extra�do |
| `clone` | `financeService.js` | `financeDataset.js` | move helper puro de c�pia profunda | Baixo | Extra�do |
| `localDelay` | `financeService.js` | `financeDataset.js` | move helper de simula��o local | Baixo | Extra�do |
| `mapEmpresaToApp` | `financeService.js` | `financeDataset.js` | move adaptador local de empresa | Baixo | Extra�do |
| `createDefaultFinanceConfig` | `financeService.js` | `financeDataset.js` | centraliza config padr�o local | Baixo | Extra�do |
| `buildLocalBootstrap` | `financeService.js` | `financeDataset.js` | remove do service a montagem do bootstrap local | Baixo | Extra�do |
| `buildLocalCompanyDataset` | `financeService.js` | `financeDataset.js` | remove do service a montagem do dataset local por empresa | Baixo | Extra�do |
| `sampleNames` e `samplePhones` | `financeService.js` | `financeDataset.js` | centraliza sementes usadas na simula��o de importa��o | Baixo | Extra�do |

### Quanto isso reduziu `financeService.js`

- o arquivo deixou de declarar inline o banco mock completo
- o arquivo deixou de carregar inline os builders de bootstrap e dataset local
- o arquivo deixou de concentrar helpers gen�ricos de clone/delay e seeds de preview
- com isso, o `financeService.js` fica mais focado em orquestra��o e compatibilidade, em vez de tamb�m definir toda a base legada local

### O que ainda ficou no legado

- `fetchCompanyDataset` continua no `financeService.js`, agora orquestrando Supabase e chamando o builder local isolado
- `sendWhatsAppCharge` continua no legado
- updates/deletes locais e delegadores compat continuam no legado
- `useFinance.js` ainda depende dessa camada

### Bloqueadores para migrar `fetchCompanyDataset` futuramente

- o modo Supabase e o modo local ainda convivem no mesmo m�todo
- `getEffectiveTenant` e regras de permiss�o ainda est�o embutidos no `financeService.js`
- ainda existe estado mut�vel local em `db` que � atualizado por m�todos operacionais do legado
- a fachada `.ts` ainda delega diretamente para `legacyFinanceService.fetchCompanyDataset`

### Pr�ximos candidatos de extra��o

- helper de tenant/effective context, se puder ser isolado sem risco
- adaptadores restantes que ainda misturam contexto e shape da fachada
- separa��o futura entre `fetchCompanyDataset` local e `fetchCompanyDataset` Supabase, mantendo contrato comum

## Fase 2 � Usage counters reais

### Pontos instrumentados

- `imports_month`
  - incrementado na confirmacao de importacao em `src/hooks/useFinance.js`
  - cobre importacao de vencidos e liquidacao manual confirmada
- `charges_month`
  - incrementado no envio manual registrado em `src/App.jsx`
  - incrementado no fluxo legado de envio em lote via `src/hooks/useFinance.js`
- `automations_month`
  - incrementado ao executar simulacao/regua em `src/screens/CobrancaAutomaticaScreen.jsx`
  - incrementado ao rodar simulacao geral em `src/screens/ChecklistEnvioRealScreen.jsx`
- `users_count`
  - sincronizado por leitura real em `src/services/usageService.js` a partir de `usuarios_empresas`

### Pontos pendentes

- `prepare_manual_charge` na Central Operacional nao incrementa `charges_month`
  - motivo: hoje esse fluxo apenas prepara mensagem e boleto, sem envio de fato
- fluxos futuros de envio real por provider externo ainda nao estao conectados
  - quando houver envio real, o contador de cobrancas deve subir no ponto final de entrega/aceite do envio
- inclusao/remocao explicita de usuarios ainda nao chama `setUsage()` no evento de escrita
  - hoje o valor aparece sincronizado por leitura, mas ainda nao existe hook dedicado no evento de membership

### Riscos e observacoes

- a medicao passou a refletir uso real a partir desta fase; historico anterior pode continuar zerado em `usage_counters`
- o modo mock/local usa `localStorage` para manter contadores sem Supabase
- os limites de automacao usam fallback seguro em codigo, sem depender de integracao paga nem de alteracao estrutural no schema atual

## Fase 2.1 � Painel comercial de consumo

### Entregue nesta fase

- criado `src/components/UsageMeter.jsx` como componente reutilizavel de consumo
- `PlanosScreen` passou a mostrar o consumo atual da empresa ativa quando existe `companyId`
- `BillingScreen` passou a usar `usageService` como fonte do consumo comercial real
- avisos de 80%, 95% e 100% agora aparecem no contexto comercial de planos/billing
- CTA de upgrade nas telas comerciais permanece sem gateway e abre aviso amigavel

### Telas impactadas

- `src/screens/PlanosScreen.jsx`
- `src/screens/BillingScreen.jsx`

### Observacoes

- no contexto publico, `PlanosScreen` continua funcionando sem consumo por empresa
- na area logada, o consumo usa `usageService` por `company_id`
- a troca real de plano continua separada do checkout; nesta fase o foco foi UX comercial e visibilidade de consumo

## Fase 3 � Centro de Notificacoes

### Itens implementados
- tabela `notifications` criada em migration incremental com RLS por `company_id`
- `notificationService.js` com fallback local/mock e funcoes de leitura, criacao e marcacao de leitura
- `NotificationBell.jsx` conectado ao Header com badge de nao lidas e dropdown das ultimas notificacoes
- `NotificationsScreen.jsx` adicionada ao app com filtros, lista completa e acao de marcar todas como lidas
- rota interna `/notifications` adicionada ao fluxo de abas do App

### Pontos instrumentados
- importacao concluida
- cobranca enviada ou registrada em simulacao
- falha de envio de cobranca
- automacao executada / simulacao executada
- alertas de uso em 80%, 95% e 100%
- titulos vencidos em acompanhamento
- trial proximo do fim

### Cuidados e riscos
- notificacoes foram integradas como efeito colateral seguro: se a tabela ainda nao existir no ambiente, os fluxos principais continuam funcionando
- o modo mock/local persiste notificacoes em `localStorage`
- o fluxo legado de `useFinance.js` recebeu instrumentacao minima sem alterar comportamento principal

## Fase 4 - Auditoria visual

### Base reutilizada

- reutilizacao da tabela `audit_logs`
- migration incremental para enriquecer o schema com:
  - `title`
  - `description`
  - `severity`

### UI entregue

- `src/screens/AuditTimelineScreen.jsx` como timeline completa em `/audit`
- `src/components/AuditEventCard.jsx` para renderizacao dos eventos
- `src/components/AuditFilters.jsx` com filtros por tipo, periodo, usuario, entidade e busca textual
- mini card `Ultimas atividades` no dashboard executivo
- item `Auditoria` na sidebar

### Eventos integrados

- importacao criada
- importacao confirmada
- lote removido
- registro editado
- registro excluido
- representante alterado
- cobranca preparada
- cobranca enviada
- envio falhou
- cobranca simulada
- automacao executada
- simulacao de automacao
- plano alterado
- limite atingido
- trial proximo do fim
- notificacao criada e lida
- usuario entrou na empresa

### Ponto pendente mapeado

- `user_removed` ja existe no modelo visual e no service, mas ainda depende de um fluxo real de remocao de membro para ser instrumentado sem risco

## Fase 5 - Central de ajuda e onboarding rico

### Entregue

- rota interna `/help`
- item `Ajuda` na sidebar
- `HelpCenterScreen` com artigos operacionais e FAQ
- `OnboardingGuide` reutilizavel com:
  - checklist visual
  - links para telas
  - ver guia
  - marcar como concluido
  - pular etapa
- mini bloco `Primeiros passos` no dashboard

### Observacoes

- nao houve integracao com servicos pagos
- nao houve alteracao na cobranca real
- o estado de etapa pulada fica salvo localmente por empresa para nao interferir no backend do onboarding

## Fase 6 - IA de cobranca local

### Entregue

- `collectionMessageService.js` com geracao local por regras
- tons suportados:
  - amigavel
  - neutro
  - firme
  - juridico
- `CollectionToneSelector` e `CollectionMessagePreview` reutilizaveis
- integracao em:
  - `CentralCobrancaScreen.jsx`
  - `CobrancaAutomaticaScreen.jsx`
  - `ChecklistEnvioRealScreen.jsx`
- auditoria ao gerar mensagem inteligente
- notificacao quando tom firme ou juridico for usado
- artigo novo na ajuda: `Como usar IA de cobranca`

### Observacoes

- nenhuma API externa foi integrada
- nenhum envio real foi disparado
- o comportamento ficou totalmente local e editavel antes de uso
