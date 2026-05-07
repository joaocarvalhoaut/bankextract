import { getSupabaseConfigStatus, hasSupabaseConfig, supabase } from './supabaseClient';
import { createAuditEvent } from './auditTimelineService';

const mockUserId = 'user_demo_1';
const storageKeyPrefix = 'bankextract.activeCompany.';
export const GLOBAL_COMPANY_ID = 'TODAS_EMPRESAS';
const envSystemAdminEmails = String(import.meta.env.VITE_SYSTEM_ADMIN_EMAILS || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const mockCompanies = [
  {
    id: 'emp1',
    nome: 'Construtora Vale Ltda',
    cnpj: '12.345.678/0001-90',
    inviteCode: 'VALE-2026',
    role: 'admin'
  },
  {
    id: 'emp2',
    nome: 'Comercial Horizonte SA',
    cnpj: '98.765.432/0001-10',
    inviteCode: 'HORIZ-2026',
    role: 'operador'
  }
];

const mockMemberships = [
  {
    id: 'membership_1',
    user_id: mockUserId,
    company_id: 'emp1',
    role: 'admin',
    created_at: new Date().toISOString()
  },
  {
    id: 'membership_2',
    user_id: mockUserId,
    company_id: 'emp2',
    role: 'operador',
    created_at: new Date().toISOString()
  }
];

const mockSystemAdmins = [
  {
    id: 'system_admin_1',
    user_id: mockUserId,
    email: 'admin@bankextract.local',
    created_at: new Date().toISOString()
  }
];

const buildError = (error, fallback) => {
  if (error instanceof Error) return error;
  return new Error(error?.message || fallback);
};

const requireSupabase = () => {
  const status = getSupabaseConfigStatus();
  if (!status.hasSupabaseConfig || !supabase) {
    throw new Error(status.supabaseConfigError || 'Supabase nao configurado.');
  }

  return supabase;
};

const makeStorageKey = (userId) => `${storageKeyPrefix}${userId || 'anon'}`;

const normalizeInviteCode = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9-]/g, '');

const createInviteCodeCandidate = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let blockA = '';
  let blockB = '';

  for (let index = 0; index < 4; index += 1) {
    blockA += alphabet[Math.floor(Math.random() * alphabet.length)];
    blockB += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return `${blockA}-${blockB}`;
};

const mapCompanyToApp = (row, membership = null) => ({
  id: row.id,
  nome: row.nome,
  cnpj: row.cnpj || '',
  inviteCode: row.invite_code || row.inviteCode || '',
  createdAt: row.created_at || null,
  role: membership?.role || row.role || 'operador'
});

const mapMembershipToApp = (row) => ({
  id: row.id,
  userId: row.user_id,
  companyId: row.company_id,
  role: row.role || 'operador',
  createdAt: row.created_at || null
});

const resolveRpcRow = (payload) => {
  if (Array.isArray(payload)) {
    return payload[0] || null;
  }

  return payload || null;
};

const userHasNoCompanyMemberships = async (userId) => {
  if (!userId) return true;

  if (!hasSupabaseConfig) {
    return !mockMemberships.some((membership) => membership.user_id === (userId || mockUserId));
  }

  const client = requireSupabase();
  const { count, error } = await client
    .from('usuarios_empresas')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    throw buildError(error, 'Falha ao verificar vinculos do usuario.');
  }

  return Number(count || 0) === 0;
};

const generateUniqueInviteCode = async (client) => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const inviteCode = createInviteCodeCandidate();
    const { data, error } = await client
      .from('empresas')
      .select('id')
      .eq('invite_code', inviteCode)
      .maybeSingle();

    if (error) {
      throw buildError(error, 'Falha ao validar codigo de convite.');
    }

    if (!data) {
      return inviteCode;
    }
  }

  throw new Error('Nao foi possivel gerar um codigo de convite unico.');
};

export const companyService = {
  async isSystemAdmin({ userId, email }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (normalizedEmail && envSystemAdminEmails.includes(normalizedEmail)) {
      return true;
    }

    if (!hasSupabaseConfig || !userId) {
      return mockSystemAdmins.some((item) => item.user_id === (userId || mockUserId) || item.email === email);
    }

    const client = requireSupabase();
    const { data, error } = await client
      .from('system_admins')
      .select('id, user_id, email')
      .or(`user_id.eq.${userId},email.eq.${email || ''}`)
      .limit(1);

    if (error) {
      throw buildError(error, 'Falha ao verificar permissao de administrador geral.');
    }

    return Boolean((data || []).length);
  },

  getStoredActiveCompanyId(userId) {
    if (typeof window === 'undefined') return '';
    return window.localStorage.getItem(makeStorageKey(userId)) || '';
  },

  setStoredActiveCompanyId(userId, companyId) {
    if (typeof window === 'undefined') return;

    if (!companyId) {
      window.localStorage.removeItem(makeStorageKey(userId));
      return;
    }

    window.localStorage.setItem(makeStorageKey(userId), companyId);
  },

  clearStoredActiveCompanyId(userId) {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(makeStorageKey(userId));
  },

  async listUserCompanies(userId, options = {}) {
    const { includeAll = false, email = '' } = options;

    if (!hasSupabaseConfig || !userId) {
      const memberships = mockMemberships
        .filter((membership) => membership.user_id === (userId || mockUserId))
        .map(mapMembershipToApp);
      const isAdmin = mockSystemAdmins.some(
        (item) => item.user_id === (userId || mockUserId) || item.email === email
      );
      const companies = (includeAll && isAdmin
        ? mockCompanies
        : mockCompanies.filter((company) =>
            mockMemberships.some((membership) => membership.user_id === (userId || mockUserId) && membership.company_id === company.id)
          ))
        .map((company) => {
          const membership = memberships.find((item) => item.companyId === company.id);
          return {
            ...company,
            role: membership?.role || (isAdmin ? 'admin' : 'operador')
          };
        });

      return {
        companies,
        memberships
      };
    }

    const client = requireSupabase();
    const adminAccess = includeAll && await this.isSystemAdmin({ userId, email });

    const { data: membershipsData, error: membershipsError } = await client
      .from('usuarios_empresas')
      .select('id, user_id, company_id, role, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (membershipsError) {
      throw buildError(membershipsError, 'Falha ao carregar empresas vinculadas.');
    }

    const memberships = (membershipsData || []).map(mapMembershipToApp);
    if (!memberships.length && !adminAccess) {
      return {
        companies: [],
        memberships: []
      };
    }

    const companiesQuery = adminAccess
      ? client
          .from('empresas')
          .select('*')
          .order('nome', { ascending: true })
      : client
          .from('empresas')
          .select('id, nome, cnpj, invite_code, created_at')
          .in('id', memberships.map((membership) => membership.companyId))
          .order('nome', { ascending: true });

    const { data: companiesData, error: companiesError } = await companiesQuery;

    if (companiesError) {
      throw buildError(companiesError, 'Falha ao carregar os dados das empresas.');
    }

    const companies = (companiesData || [])
      .map((company) => {
        const membership = memberships.find((item) => item.companyId === company.id);
        return mapCompanyToApp(company, membership || (adminAccess ? { role: 'admin' } : null));
      })
      .sort((left, right) => left.nome.localeCompare(right.nome, 'pt-BR'));

    return {
      companies,
      memberships
    };
  },

  async createCompany({ userId, email, nome, cnpj }) {
    const trimmedName = String(nome || '').trim();
    const trimmedCnpj = String(cnpj || '').trim();

    if (!trimmedName) {
      throw new Error('Informe o nome da empresa.');
    }

    const allowedToCreate = await this.isSystemAdmin({ userId, email }) || await userHasNoCompanyMemberships(userId);
    if (!allowedToCreate) {
      throw new Error('Voce ja esta vinculado a uma empresa. Solicite ao administrador geral a criacao de uma nova empresa.');
    }

    if (!hasSupabaseConfig || !userId) {
      const newCompany = {
        id: `emp_${Date.now()}`,
        nome: trimmedName,
        cnpj: trimmedCnpj,
        inviteCode: createInviteCodeCandidate(),
        role: 'admin'
      };

      mockCompanies.push(newCompany);
      mockMemberships.push({
        id: `membership_${Date.now()}`,
        user_id: userId || mockUserId,
        company_id: newCompany.id,
        role: 'admin',
        created_at: new Date().toISOString()
      });

      return {
        company: newCompany,
        membership: {
          id: `membership_${Date.now()}_admin`,
          userId: userId || mockUserId,
          companyId: newCompany.id,
          role: 'admin',
          createdAt: new Date().toISOString()
        }
      };
    }

    const client = requireSupabase();
    const inviteCode = await generateUniqueInviteCode(client);
    const { data: companyData, error: companyError } = await client
      .from('empresas')
      .insert({
        nome: trimmedName,
        cnpj: trimmedCnpj || null,
        invite_code: inviteCode,
        created_by: userId
      })
      .select('id, nome, cnpj, invite_code, created_at')
      .single();

    if (companyError) {
      throw buildError(companyError, 'Falha ao criar a empresa.');
    }

    const { error: membershipError } = await client
      .from('usuarios_empresas')
      .insert({
        user_id: userId,
        company_id: companyData.id,
        role: 'admin'
      });

    if (membershipError) {
      throw buildError(membershipError, 'A empresa foi criada, mas o vinculo do usuario falhou.');
    }

    const { error: configError } = await client
      .from('configuracoes_financeiras')
      .upsert({
        company_id: companyData.id,
        user_id: userId,
        multa_percentual: 2,
        juros_percentual_dia: 0.033
      });

    if (configError) {
      throw buildError(configError, 'A empresa foi criada, mas a configuracao inicial falhou.');
    }

    return {
      company: mapCompanyToApp(companyData, { role: 'admin' }),
      membership: {
        id: `membership_${companyData.id}`,
        userId,
        companyId: companyData.id,
        role: 'admin',
        createdAt: companyData.created_at || new Date().toISOString()
      }
    };
  },

  async joinCompanyByInviteCode({ userId, inviteCode }) {
    const normalizedCode = normalizeInviteCode(inviteCode);

    if (!normalizedCode) {
      throw new Error('Informe um codigo de convite valido.');
    }

    if (!hasSupabaseConfig || !userId) {
      const company = mockCompanies.find((item) => item.inviteCode === normalizedCode);
      if (!company) {
        throw new Error('Codigo de convite nao encontrado.');
      }

      const existingMembership = mockMemberships.find(
        (membership) => membership.user_id === (userId || mockUserId) && membership.company_id === company.id
      );

      if (!existingMembership) {
        mockMemberships.push({
          id: `membership_${Date.now()}`,
          user_id: userId || mockUserId,
          company_id: company.id,
          role: 'operador',
          created_at: new Date().toISOString()
        });
        createAuditEvent(company.id, {
          action: 'user_joined',
          entity_type: 'usuarios_empresas',
          entity_id: userId || mockUserId,
          title: 'Usuario entrou na empresa',
          description: 'Um usuario entrou na empresa usando codigo de convite.',
          metadata: {
            user_id: userId || mockUserId,
            invite_code: normalizedCode
          },
          severity: 'success',
          userId: userId || mockUserId
        }).catch(() => {});
      }

      return {
        company: {
          ...company,
          role: existingMembership?.role || 'operador'
        },
        membership: existingMembership
          ? mapMembershipToApp(existingMembership)
          : {
              id: `membership_${Date.now()}_joined`,
              userId: userId || mockUserId,
              companyId: company.id,
              role: 'operador',
              createdAt: new Date().toISOString()
            }
      };
    }

    const client = requireSupabase();
    const { data: rpcData, error: rpcError } = await client.rpc('join_empresa_by_invite_code', {
      p_invite_code: normalizedCode
    });

    if (rpcError) {
      throw buildError(rpcError, 'Falha ao entrar por codigo de convite.');
    }

    const companyData = resolveRpcRow(rpcData);
    if (!companyData) {
      throw new Error('Codigo de convite nao reconhecido ou invalido.');
    }

    const resolved = await resolveCompany(companyData);
    await createAuditEvent(resolved.company.id, {
      action: 'user_joined',
      entity_type: 'usuarios_empresas',
      entity_id: userId,
      title: 'Usuario entrou na empresa',
      description: 'Um usuario entrou na empresa usando codigo de convite.',
      metadata: {
        user_id: userId,
        invite_code: normalizedCode
      },
      severity: 'success',
      userId
    });

    return resolved;
  },
};
