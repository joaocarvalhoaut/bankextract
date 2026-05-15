import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('.env.example documents operational runtime keys', () => {
  const content = fs.readFileSync('.env.example', 'utf8');
  for (const key of [
    'ENABLE_MOCK_WHATSAPP',
    'ENABLE_GOOGLE_VISION_OCR',
    'GOOGLE_CLIENT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'ZAPI_INSTANCE_ID',
    'ZAPI_TOKEN',
    'ZAPI_CLIENT_TOKEN',
    'TEST_ZAPI_INSTANCE_ID',
    'TEST_ZAPI_TOKEN',
    'TEST_ZAPI_CLIENT_TOKEN',
  ]) {
    assert.ok(content.includes(`${key}=`), `${key} should exist in .env.example`);
  }
});
