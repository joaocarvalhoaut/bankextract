export function normalizeWhatsappConnectionState(raw = {}) {
  const connected = Boolean(raw?.connected);
  const phoneNumber = String(raw?.phone_number || raw?.phoneNumber || '').trim();
  const connectedPendingPhone = connected && !phoneNumber;
  const backendPendingPhone = raw?.connected_pending_phone === true || raw?.connectedPendingPhone === true;
  const pendingPhone = connectedPendingPhone || backendPendingPhone;

  let status = String(raw?.status || raw?.status_label || '').trim().toLowerCase();
  if (!status) {
    if (connected) status = 'connected';
    else if (raw?.qrCode || raw?.image_data_url) status = 'awaiting_qr';
    else status = 'not_configured';
  }

  const isFullyPaired = connected && Boolean(phoneNumber);
  const isConnected = connected;

  return {
    ...raw,
    connected,
    phone_number: phoneNumber || null,
    connected_pending_phone: pendingPhone,
    is_connected: isConnected,
    is_fully_paired: isFullyPaired,
    should_poll_phone: pendingPhone,
    status,
    status_key: pendingPhone ? 'connected_pending_phone' : status,
    status_label: pendingPhone
      ? 'WhatsApp conectado — aguardando sincronizacao do numero'
      : String(raw?.status_label || (isFullyPaired ? 'WhatsApp conectado' : connected ? 'WhatsApp conectado' : 'Aguardando leitura do QR Code')),
    message: String(
      raw?.message ||
      (pendingPhone
        ? 'WhatsApp conectado. Aguardando sincronizacao do numero.'
        : isFullyPaired
          ? 'WhatsApp conectado com sucesso.'
          : connected
            ? 'WhatsApp conectado.'
            : 'Instancia aguardando leitura do QR Code.')
    ),
  };
}

export function isWhatsappFullyPaired(raw = {}) {
  return normalizeWhatsappConnectionState(raw).is_fully_paired;
}
