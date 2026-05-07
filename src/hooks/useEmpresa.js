import { useCallback, useEffect, useMemo, useState } from 'react';
import { tenantContext } from '../services/tenantContext.js';
import { companyService, GLOBAL_COMPANY_ID } from '../services/companyService';
import { markOnboardingStep } from '../services/onboardingService';
import { ensureTrialSubscription } from '../services/subscriptionService';
import { setUsage } from '../services/usageService';

const globalCompanyOption = {
  id: GLOBAL_COMPANY_ID,
  nome: 'Todas as empresas',
  cnpj: '',
  inviteCode: '',
  role: 'admin',
  isGlobal: true
};

const initialForm = {
  nome: '',
  cnpj: '',
  inviteCode: ''
};

export const useEmpresa = ({ user, authEnabled }) => {
  const authUserId = user?.id || null;
  const authEmail = user?.email || '';
  const fallbackUserId = tenantContext.currentUserId;
  const effectiveUserId = authUserId || fallbackUserId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isSystemAdmin, setIsSystemAdmin] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('criar');
  const [modalError, setModalError] = useState('');
  const [modalForm, setModalForm] = useState(initialForm);

  const activeCompany = useMemo(
    () => companies.find((company) => company.id === activeCompanyId) || null,
    [activeCompanyId, companies]
  );
  const isGlobalActive = activeCompanyId === GLOBAL_COMPANY_ID;
  const canCreateCompany = isSystemAdmin || companies.length === 0;

  const persistActiveCompany = useCallback((companyId) => {
    companyService.setStoredActiveCompanyId(effectiveUserId, companyId);
  }, [effectiveUserId]);

  const setActiveCompanyId = useCallback((companyId) => {
    setActiveCompanyIdState(companyId || '');
    persistActiveCompany(companyId || '');
  }, [persistActiveCompany]);

  const resetModalState = useCallback(() => {
    setModalError('');
    setModalForm(initialForm);
    setModalMode(canCreateCompany ? 'criar' : 'entrar');
  }, [canCreateCompany]);

  const applyCompanySelection = useCallback((nextCompanies, preferredCompanyId = '', adminStatus = false) => {
    const storedCompanyId = companyService.getStoredActiveCompanyId(effectiveUserId);
    const linkedCompanyIds = nextCompanies.map((company) => company.id);

    if (!linkedCompanyIds.length) {
      setCompanies([]);
      setActiveCompanyIdState('');
      setModalOpen(true);
      persistActiveCompany('');
      return;
    }

    const nextActiveCompanyId = [preferredCompanyId, storedCompanyId, activeCompanyId]
      .filter(Boolean)
      .find((companyId) => linkedCompanyIds.includes(companyId)) || '';

    setCompanies(nextCompanies);
    if (adminStatus && !nextActiveCompanyId) {
      setActiveCompanyIdState('');
      persistActiveCompany('');
      setModalOpen(true);
      setModalError('');
      return;
    }

    const resolvedCompanyId = nextActiveCompanyId || linkedCompanyIds[0];
    setActiveCompanyIdState(resolvedCompanyId);
    persistActiveCompany(resolvedCompanyId);
    setModalOpen(false);
    setModalError('');
  }, [activeCompanyId, effectiveUserId, persistActiveCompany]);

  const loadCompanies = useCallback(async (preferredCompanyId = '') => {
    if (authEnabled && !authUserId) {
      setLoading(false);
      setCompanies([]);
      setMemberships([]);
      setActiveCompanyIdState('');
      setIsSystemAdmin(false);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const adminStatus = await companyService.isSystemAdmin({
        userId: effectiveUserId,
        email: authEmail
      });
      setIsSystemAdmin(adminStatus);

      const data = await companyService.listUserCompanies(effectiveUserId, {
        includeAll: adminStatus,
        email: authEmail
      });
      const companiesWithGlobal = adminStatus && (data.companies || []).length
        ? [globalCompanyOption, ...(data.companies || []).filter((company) => company.id !== GLOBAL_COMPANY_ID)]
        : (data.companies || []);
      setMemberships(data.memberships || []);
      applyCompanySelection(companiesWithGlobal, preferredCompanyId, adminStatus);
      if (!companiesWithGlobal.length) {
        setModalMode(adminStatus || !(data.memberships || []).length ? 'criar' : 'entrar');
        setModalError('');
        setModalForm(initialForm);
      }
    } catch (err) {
      setError(err.message || 'Nao foi possivel carregar as empresas vinculadas.');
    } finally {
      setLoading(false);
    }
  }, [applyCompanySelection, authEmail, authEnabled, authUserId, effectiveUserId]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    if (!companies.length) return;
    if (!activeCompanyId) return;

    if (!companies.some((company) => company.id === activeCompanyId)) {
      const fallbackCompanyId = isSystemAdmin ? '' : (companies[0]?.id || '');
      setActiveCompanyIdState(fallbackCompanyId);
      persistActiveCompany(fallbackCompanyId);
    }
  }, [activeCompanyId, companies, isSystemAdmin, persistActiveCompany]);

  const setModalField = useCallback((field, value) => {
    setModalForm((prev) => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const createCompany = useCallback(async () => {
    setSaving(true);
    setModalError('');

    try {
      const result = await companyService.createCompany({
        userId: effectiveUserId,
        email: authEmail,
        nome: modalForm.nome,
        cnpj: modalForm.cnpj
      });

      await Promise.allSettled([
        ensureTrialSubscription(result.company.id),
        setUsage(result.company.id, 'users_count', 1),
        markOnboardingStep(result.company.id, 'company_created'),
      ]);

      resetModalState();
      await loadCompanies(result.company.id);
    } catch (err) {
      setModalError(err.message || 'Nao foi possivel criar a empresa.');
    } finally {
      setSaving(false);
    }
  }, [authEmail, effectiveUserId, loadCompanies, modalForm.cnpj, modalForm.nome, resetModalState]);

  const joinCompany = useCallback(async () => {
    setSaving(true);
    setModalError('');

    try {
      const result = await companyService.joinCompanyByInviteCode({
        userId: effectiveUserId,
        inviteCode: modalForm.inviteCode
      });

      await Promise.allSettled([
        ensureTrialSubscription(result.company.id),
        markOnboardingStep(result.company.id, 'company_created'),
      ]);

      resetModalState();
      await loadCompanies(result.company.id);
    } catch (err) {
      setModalError(err.message || 'Nao foi possivel entrar na empresa pelo codigo de convite.');
    } finally {
      setSaving(false);
    }
  }, [effectiveUserId, loadCompanies, modalForm.inviteCode, resetModalState]);

  const closeModal = useCallback(() => {
    if (!isSystemAdmin) return;
    setModalOpen(false);
    setModalError('');
  }, [isSystemAdmin]);

  const continueWithoutCompany = useCallback(() => {
    if (!isSystemAdmin) return;
    setActiveCompanyIdState('');
    persistActiveCompany('');
    setModalOpen(false);
    setModalError('');
  }, [isSystemAdmin, persistActiveCompany]);

  const openCompanyModal = useCallback((nextMode = 'criar') => {
    setModalMode(nextMode);
    setModalError('');
    setModalOpen(true);
  }, []);

  return {
    loading,
    saving,
    error,
    setError,
    companies,
    memberships,
    isSystemAdmin,
    canCreateCompany,
    isGlobalActive,
    activeCompanyId,
    setActiveCompanyId,
    activeCompany,
    userRole: activeCompany?.role || (isSystemAdmin ? 'admin' : 'operador'),
    modalOpen,
    modalMode,
    setModalMode,
    setModalOpen,
    modalError,
    modalForm,
    setModalField,
    createCompany,
    joinCompany,
    closeModal,
    continueWithoutCompany,
    openCompanyModal,
    reloadCompanies: loadCompanies
  };
}
