import { supabase } from './supabaseClient';

const defaultRules = [
  { day: 'D+1', active: true },
  { day: 'D+3', active: true },
  { day: 'D+5', active: true },
  { day: 'D+10', active: false },
  { day: 'D+15', active: false },
];

const defaultConfig = {
  ativo: false,
  intervalo_dias: 5,
  hora_envio: '08:00',
  cobrar_apos_dias_vencido: 1,
  limite_cobrancas_por_titulo: 4,
  protesto_apos_5_dias: true,
  canal_envio: 'WhatsApp',
  regras: defaultRules,
  mensagem_template: `Ola, {{cliente}},

Entramos em contato para confirmar o pagamento da duplicata abaixo:

Documento: {{documento}}
Vencimento: {{vencimento}}
Valor: {{valor}}

Ate o momento, identificamos {{dias_atraso}} dia(s) de atraso em nosso sistema.

Solicitamos, por gentileza, a regularizacao do titulo ou o envio do comprovante de pagamento, caso ja tenha sido quitado.

Apos 5 dias do vencimento, o boleto podera estar sujeito a protesto e encargos adicionais.

Ficamos a disposicao.

Caso o pagamento ja tenha sido efetuado, desconsidere esta mensagem.`,
};

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

const normalizeTime = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return defaultConfig.hora_envio;
  const [hours = '08', minutes = '00'] = raw.split(':');
  return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
};

const normalizeRules = (value) => {
  if (!Array.isArray(value) || value.length === 0) {
    return [...defaultRules];
  }
  return value.map((rule, index) => ({
    day: String(rule?.day || rule?.id || `D+${index + 1}`),
    active: Boolean(rule?.active),
  }));
};

export async function getWhatsAppAutoConfig(empresaId) {
  if (!empresaId || !supabase) {
    return { ...defaultConfig };
  }

  const { data, error } = await supabase
    .from('whatsapp_cobranca_config')
    .select(
      'id, empresa_id, ativo, intervalo_dias, hora_envio, cobrar_apos_dias_vencido, limite_cobrancas_por_titulo, protesto_apos_5_dias, canal_envio, regras, mensagem_template, updated_at'
    )
    .eq('empresa_id', empresaId)
    .maybeSingle();

  if (error) {
    throw buildError(error, 'Falha ao carregar configuracao de cobranca automatica.');
  }

  if (!data) return { ...defaultConfig };

  return {
    ...defaultConfig,
    ...data,
    hora_envio: normalizeTime(data.hora_envio),
    regras: normalizeRules(data.regras),
    mensagem_template: data.mensagem_template || defaultConfig.mensagem_template,
  };
}

export async function saveWhatsAppAutoConfig(empresaId, config) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }
  if (!empresaId) {
    throw new Error('Selecione uma empresa especifica antes de salvar.');
  }

  const payload = {
    empresa_id: empresaId,
    ativo: Boolean(config.ativo),
    intervalo_dias: Number(config.intervalo_dias) || 5,
    hora_envio: normalizeTime(config.hora_envio),
    cobrar_apos_dias_vencido: Number(config.cobrar_apos_dias_vencido) || 1,
    limite_cobrancas_por_titulo: Number(config.limite_cobrancas_por_titulo) || 4,
    protesto_apos_5_dias: Boolean(config.protesto_apos_5_dias),
    canal_envio: String(config.canal_envio || 'WhatsApp'),
    regras: normalizeRules(config.regras),
    mensagem_template: String(config.mensagem_template || defaultConfig.mensagem_template),
  };

  const { data, error } = await supabase
    .from('whatsapp_cobranca_config')
    .upsert(payload, { onConflict: 'empresa_id' })
    .select(
      'id, empresa_id, ativo, intervalo_dias, hora_envio, cobrar_apos_dias_vencido, limite_cobrancas_por_titulo, protesto_apos_5_dias, canal_envio, regras, mensagem_template, updated_at'
    )
    .single();

  if (error) {
    throw buildError(error, 'Falha ao salvar configuracao de cobranca automatica.');
  }

  return {
    ...defaultConfig,
    ...data,
    hora_envio: normalizeTime(data.hora_envio),
    regras: normalizeRules(data.regras),
    mensagem_template: data.mensagem_template || defaultConfig.mensagem_template,
  };
}

export async function runScheduledWhatsAppChargesTest(empresaId) {
  if (!supabase) {
    throw new Error('Supabase nao configurado.');
  }
  if (!empresaId) {
    throw new Error('Selecione uma empresa especifica antes de simular cobrancas.');
  }

  const { data, error } = await supabase.functions.invoke('send-scheduled-whatsapp-charges', {
    body: { empresa_id: empresaId, dry_run: true },
  });

  if (error) {
    throw buildError(error, 'Falha ao executar simulacao de cobranca automatica.');
  }
  if (!data?.ok) {
    throw new Error(data?.error || 'Resposta inesperada da Edge Function.');
  }

  return data;
}

export async function getLastWhatsAppExecution(empresaId) {
  if (!supabase || !empresaId) return null;

  const { data } = await supabase
    .from('cobrancas_whatsapp')
    .select('created_at, status')
    .eq('empresa_id', empresaId)
    .in('status', ['enviado', 'mock_enviado'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data || null;
}

export { defaultConfig as defaultWhatsAppAutoConfig };
