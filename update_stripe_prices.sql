-- Atualiza stripe_price_id e stripe_product_id na tabela plans (modo TEST)
-- Execute no Supabase: SQL Editor → New query → Cole e rode

UPDATE plans SET
  stripe_product_id = 'prod_UUgVQFZzBDntpj',
  stripe_price_id   = 'price_1TVh8v3LSxthilgGZrF1qL6'
WHERE code = 'starter';

UPDATE plans SET
  stripe_product_id = 'prod_UUgWoUtmeXW3gy',
  stripe_price_id   = 'price_1TVh9C3LSxthilgrgGeHSNf'
WHERE code = 'pro';

UPDATE plans SET
  stripe_product_id = 'prod_UUgWxaiOS7HGKS',
  stripe_price_id   = 'price_1TVh9V3LSxthilg5hdHDsZ5'
WHERE code = 'business';

-- Confirma resultado
SELECT code, name, stripe_product_id, stripe_price_id, price_cents
FROM plans
ORDER BY price_cents;
