# Checklist de Ambiente de Produção — BankExtract

## Objetivo
Preparar o ambiente de produção do BankExtract com segurança, sem expor segredos e sem depender de valores locais de desenvolvimento.

## Variáveis encontradas no projeto

### Obrigatórias
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Opcionais
- `VITE_SYSTEM_ADMIN_EMAILS`
- `VITE_SUPABASE_COMPANY_ID`
- `VITE_SUPABASE_USER_ID`

## O que cada variável faz

### `VITE_SUPABASE_URL`
- URL do projeto Supabase de produção
- usada em [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\services\supabaseClient.js](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/services/supabaseClient.js>)
- sem ela, o frontend entra em fallback de “Supabase não configurado”

### `VITE_SUPABASE_ANON_KEY`
- chave pública anon do Supabase de produção
- usada em [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\services\supabaseClient.js](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/services/supabaseClient.js>)
- é uma chave pública do frontend, mas ainda assim deve ser configurada via Vercel e não hardcoded no código

### `VITE_SYSTEM_ADMIN_EMAILS`
- fallback de e-mails com acesso admin SaaS
- usada em:
  - [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\services\adminSaasService.js](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/services/adminSaasService.js>)
  - [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\src\services\companyService.js](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/src/services/companyService.js>)
- formato esperado:
```env
VITE_SYSTEM_ADMIN_EMAILS=admin@empresa.com,owner@empresa.com
```

### `VITE_SUPABASE_COMPANY_ID`
- fallback local/mock para contexto de tenant
- não deve ser necessária em produção conectada corretamente ao Supabase

### `VITE_SUPABASE_USER_ID`
- fallback local/mock para contexto de usuário
- não deve ser necessária em produção conectada corretamente ao Supabase

## Onde configurar no Vercel
No painel do projeto Vercel:

1. `Project`
2. `Settings`
3. `Environment Variables`

Cadastrar pelo menos:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Cadastrar se fizer sentido:
- `VITE_SYSTEM_ADMIN_EMAILS`

Não é necessário cadastrar em produção:
- `VITE_SUPABASE_COMPANY_ID`
- `VITE_SUPABASE_USER_ID`

## Variáveis que NÃO devem ser commitadas

Nunca commitar em arquivo real de produção:
- `.env.production`
- `.env.local`
- `.env.secrets`
- qualquer valor real de URL/chave/IDs internos do ambiente

O repositório já ignora:
- `.env`
- `.env.local`
- `.env.*.local`

Recomendação adicional:
- manter `.env.secrets` somente local e fora de versionamento
- usar apenas `.env.production.example` como referência segura

## Como validar se o Supabase production está conectado

### Validação mínima no frontend
Após deploy:
1. abrir o app em produção
2. verificar se a tela de login abre normalmente
3. autenticar com um usuário válido
4. confirmar se empresa ativa carrega
5. confirmar se telas dependentes de dados reais não entram em fallback local

### Sinais positivos esperados
- login Supabase funciona
- lista de empresas reais carrega
- `Planos/Billing` mostra assinatura da empresa
- `Notifications` carrega notificações reais
- `Audit` carrega auditoria real
- `Production Checklist` persiste por empresa

### Sinais de problema
- mensagem de “Supabase não configurado”
- login sem sessão persistida
- app carregando apenas mocks
- ausência total de dados reais em empresas existentes

## Como validar `VITE_SYSTEM_ADMIN_EMAILS`

1. configurar a variável no Vercel com e-mails separados por vírgula
2. fazer login com um e-mail incluído
3. validar se aparece:
   - `Admin SaaS`
   - permissões de system admin
4. fazer login com um e-mail fora da lista
5. validar que `Admin SaaS` não aparece, a menos que o usuário também esteja na tabela `system_admins`

Exemplo:
```env
VITE_SYSTEM_ADMIN_EMAILS=admin@empresa.com,cto@empresa.com
```

Boas práticas:
- usar e-mails corporativos reais e estáveis
- evitar listas muito amplas
- preferir a tabela `system_admins` como fonte principal e manter a env como fallback seguro

## Como validar redirects e URLs

### URL base do frontend
- confirmar que o domínio/URL final da Vercel abre o app sem erro 404
- como ainda não há domínio customizado nesta etapa, validar a URL padrão da Vercel

### Fluxo de navegação
Validar:
- `/`
- `/planos`
- `/notifications`
- `/audit`
- `/help`
- `/production-checklist`

Como o app usa navegação interna por estado + history:
- abrir cada rota diretamente na URL
- atualizar a página
- confirmar que a tela correspondente continua funcionando

### Supabase Auth / redirects
Se estiver usando autenticação por email/senha:
- confirmar que não há dependência de redirect externo
- validar persistência de sessão após refresh

## Smoke test pós-deploy

### 1. Acesso e autenticação
- abrir URL da Vercel
- validar carregamento do app
- fazer login
- recarregar a página
- confirmar sessão persistida

### 2. Empresa ativa
- selecionar empresa
- trocar empresa
- validar atualização de dados nas telas

### 3. SaaS interno
- abrir `Planos`
- abrir `Billing`
- validar plano atual
- validar medidores de uso

### 4. Operação
- abrir `Importacao`
- abrir `Central de Cobranca`
- abrir `Automacoes`
- validar que o app não quebra com dados reais

### 5. Notificações e auditoria
- abrir `Notifications`
- abrir `Audit`
- validar leitura de eventos reais

### 6. Ajuda e checklist
- abrir `Help`
- abrir `Production Checklist`
- validar persistência dos itens

### 7. Admin SaaS
- login com admin permitido
- validar `Admin SaaS`
- login com usuário comum
- confirmar ocultação da área admin

## Pendências recomendadas antes do deploy real
- confirmar que o projeto Supabase de produção já recebeu as migrations recentes
- revisar usuários em `system_admins`
- revisar valores de `VITE_SYSTEM_ADMIN_EMAILS`
- validar RLS no banco com um usuário não-admin e um admin
- validar que nenhum arquivo com segredo real está staged para commit

## Arquivo seguro de referência
Usar:
- [C:\Users\ACIRLEIDE FERREIRA\Documents\New project\.env.production.example](</C:/Users/ACIRLEIDE%20FERREIRA/Documents/New%20project/.env.production.example>)

Não criar nem commitar:
- `.env.production` com valores reais
