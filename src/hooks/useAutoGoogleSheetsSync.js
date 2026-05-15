/**
 * useAutoGoogleSheetsSync
 *
 * Hook de sincronização automática com Google Sheets.
 * - Debounce de 1000ms: múltiplas edições rápidas geram apenas uma chamada.
 * - Verifica se a empresa possui config ativa antes de chamar a Edge Function.
 * - Cache de config com TTL de 60s para evitar consultas excessivas ao Supabase.
 * - Nunca sincroniza em modo global ("Todas as empresas").
 * - Erros sao silenciosos para o usuario (apenas estado exposto).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GLOBAL_COMPANY_ID } from '../services/companyService';
import { getGoogleSheetsConfig, syncGoogleSheets } from '../services/googleSheetsService';

export const SYNC_STATUS = {
  IDLE:      'idle',
  SYNCING:   'syncing',
  SYNCED:    'synced',
  ERROR:     'error',
  NO_CONFIG: 'no_config',
};

const CONFIG_CACHE_TTL_MS = 60_000; // 60 segundos

export function useAutoGoogleSheetsSync({ activeCompanyId, isGlobalView, enabled = true }) {
  const [syncStatus, setSyncStatus]   = useState(SYNC_STATUS.IDLE);
  const [syncMessage, setSyncMessage] = useState('');

  const debounceRef    = useRef(null);
  const clearSyncRef   = useRef(null);
  const configCacheRef = useRef(null); // { companyId, hasConfig, cachedAt }

  // Zerar cache e status quando a empresa muda
  useEffect(() => {
    configCacheRef.current = null;
    clearTimeout(debounceRef.current);
    setSyncStatus(SYNC_STATUS.IDLE);
    setSyncMessage('');
  }, [activeCompanyId]);

  // Cleanup na desmontagem
  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      clearTimeout(clearSyncRef.current);
    };
  }, []);

  /** Verifica (com cache) se a empresa tem configuração Google Sheets ativa. */
  const checkConfig = useCallback(async (companyId) => {
    const cache = configCacheRef.current;
    const now = Date.now();

    if (cache && cache.companyId === companyId && now - cache.cachedAt < CONFIG_CACHE_TTL_MS) {
      return cache.hasConfig;
    }

    try {
      const config = await getGoogleSheetsConfig(companyId);
      const hasConfig = Boolean(config && config.ativo);
      configCacheRef.current = { companyId, hasConfig, cachedAt: now };
      return hasConfig;
    } catch {
      // Falha silenciosa: tratar como "sem config"
      return false;
    }
  }, []);

  /**
   * Dispara a sincronização automática com debounce.
   * @param {string} reason - Motivo do disparo (apenas para log).
   */
  const triggerSync = useCallback(() => {
    if (!enabled) return;
    if (!activeCompanyId) return;
    if (activeCompanyId === GLOBAL_COMPANY_ID || isGlobalView) return;

    clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        var hasConfig = await checkConfig(activeCompanyId);

        if (!hasConfig) {
          setSyncStatus(SYNC_STATUS.NO_CONFIG);
          return;
        }

        setSyncStatus(SYNC_STATUS.SYNCING);
        setSyncMessage('');

        try {
          await syncGoogleSheets(activeCompanyId);
          setSyncStatus(SYNC_STATUS.SYNCED);

          clearTimeout(clearSyncRef.current);
          clearSyncRef.current = setTimeout(() => setSyncStatus(SYNC_STATUS.IDLE), 4000);
        } catch (syncErr) {
          setSyncStatus(SYNC_STATUS.ERROR);
          setSyncMessage((syncErr && syncErr.message) || 'Falha na sincronização automática com Google Sheets.');

          clearTimeout(clearSyncRef.current);
          clearSyncRef.current = setTimeout(() => {
            setSyncStatus(SYNC_STATUS.IDLE);
            setSyncMessage('');
          }, 6000);
        }
      } catch {
        // Proteção extra: qualquer erro inesperado não deve crashar o app
      }
    }, 1000);
  }, [activeCompanyId, checkConfig, enabled, isGlobalView]);

  /**
   * Invalida o cache de configuração.
   * Chamar após salvar uma nova config no GoogleSheetsConfig.jsx.
   */
  const invalidateConfigCache = useCallback(() => {
    configCacheRef.current = null;
  }, []);

  return {
    syncStatus,
    syncMessage,
    triggerSync,
    invalidateConfigCache,
  };
}
