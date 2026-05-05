import {
  getDriveConfig,
  saveDriveConfig,
  syncBillingDrive,
  testDriveConnection,
} from './billingAutomationService';

export async function getDriveBoletosConfig(companyId) {
  return getDriveConfig(companyId);
}

export async function saveDriveBoletosConfig(companyId, driveRootFolderId) {
  return saveDriveConfig(companyId, driveRootFolderId);
}

export async function testDriveBoletosConnection(companyId) {
  return testDriveConnection(companyId);
}

export async function syncDriveBoletos(companyId) {
  return syncBillingDrive(companyId);
}

export async function sincronizarDrive(companyId) {
  return syncDriveBoletos(companyId);
}
