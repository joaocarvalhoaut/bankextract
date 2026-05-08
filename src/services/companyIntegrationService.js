import { supabase } from './supabaseClient';

const buildError = (err, fallback) => {
  if (err instanceof Error) return err;
  return new Error(err?.message || err?.error || fallback);
};

export async function getCompanyIntegration(companyId, provider = 'zapi') {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) throw new Error('Nenhuma empresa ativa selecionada.');

  const { data, error } = await supabase
    .from('company_integrations')
    .select('id, company_id, provider, instance_id, token, client_token, phone_number, connected, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('provider', provider)
    .maybeSingle();

  if (error) throw buildError(error, 'Falha ao carregar integracao da empresa.');
  return data || null;
}

export async function saveCompanyIntegration(companyId, payload, provider = 'zapi') {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) throw new Error('Nenhuma empresa ativa selecionada.');

  const dataToSave = {
    company_id: companyId,
    provider,
    instance_id: String(payload?.instance_id || '').trim(),
    token: String(payload?.token || '').trim(),
    client_token: String(payload?.client_token || '').trim(),
    phone_number: String(payload?.phone_number || '').trim(),
    connected: Boolean(payload?.connected),
  };

  const { data, error } = await supabase
    .from('company_integrations')
    .upsert(dataToSave, { onConflict: 'company_id,provider' })
    .select('id, company_id, provider, instance_id, token, client_token, phone_number, connected, created_at, updated_at')
    .single();

  if (error) throw buildError(error, 'Falha ao salvar integracao da empresa.');
  return data;
}

export async function validateCompanyIntegration(companyId, payload) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) throw new Error('Nenhuma empresa ativa selecionada.');

  const { data, error } = await supabase.functions.invoke('billing-automation', {
    body: {
      action: 'validate_connection',
      company_id: companyId,
      provider: 'zapi',
      config: {
        instance_id: String(payload?.instance_id || '').trim(),
        token: String(payload?.token || '').trim(),
        client_token: String(payload?.client_token || '').trim(),
      },
    },
  });

  if (error) throw buildError(error, 'Falha ao validar integracao da empresa.');
  if (!(data?.ok === true || data?.success === true)) {
    throw new Error(data?.error || 'Falha ao validar integracao da empresa.');
  }

  return data;
}

export async function getCompanyIntegrationQrCode(companyId, payload) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) throw new Error('Nenhuma empresa ativa selecionada.');

  const { data, error } = await supabase.functions.invoke('billing-automation', {
    body: {
      action: 'get_qr_code',
      company_id: companyId,
      provider: 'zapi',
      config: {
        instance_id: String(payload?.instance_id || '').trim(),
        token: String(payload?.token || '').trim(),
        client_token: String(payload?.client_token || '').trim(),
      },
    },
  });

  if (error) throw buildError(error, 'Falha ao carregar o QR Code da integracao.');
  if (!(data?.ok === true || data?.success === true)) {
    throw new Error(
      data?.error || 'Nao foi possivel gerar o QR Code. Confira se a instancia, token e client token estao corretos.'
    );
  }

  return data;
}

export async function getCompanyIntegrationStatus(companyId, payload) {
  if (!supabase) throw new Error('Supabase nao configurado.');
  if (!companyId) throw new Error('Nenhuma empresa ativa selecionada.');

  const { data, error } = await supabase.functions.invoke('billing-automation', {
    body: {
      action: 'get_connection_status',
      company_id: companyId,
      provider: 'zapi',
      config: {
        instance_id: String(payload?.instance_id || '').trim(),
        token: String(payload?.token || '').trim(),
        client_token: String(payload?.client_token || '').trim(),
      },
    },
  });

  if (error) throw buildError(error, 'Falha ao consultar o status da integracao.');
  if (!(data?.ok === true || data?.success === true)) {
    throw new Error(data?.error || 'Falha ao consultar o status da integracao.');
  }

  return data;
}
