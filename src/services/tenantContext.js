import { getFallbackTenantIds } from './supabaseClient';

const mockUserId = 'user_demo_1';
const mockDefaultCompanyId = 'emp1';

export const fallbackTenantIds = getFallbackTenantIds();
export const currentTenantUserId = fallbackTenantIds.userId || mockUserId;
export const defaultTenantCompanyId = fallbackTenantIds.companyId || mockDefaultCompanyId;

export const tenantContext = {
  get currentUserId() {
    return currentTenantUserId;
  },
  get defaultCompanyId() {
    return defaultTenantCompanyId;
  },
};
