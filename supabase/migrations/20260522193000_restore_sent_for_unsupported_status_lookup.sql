update public.cobrancas_whatsapp
set status = 'sent'
where status = 'queued'
  and provider_tracking_status = 'fallback_indisponivel'
  and sent_at is not null
  and delivered_at is null
  and read_at is null
  and failed_at is null;
