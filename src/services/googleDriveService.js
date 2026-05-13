import {
  getDriveConfig,
  saveDriveConfig,
  saveDriveConfigFull,
  syncBillingDrive,
  testDriveConnection,
  testBoletoLookup,
  getDriveFolderStructure,
  extractFolderIdFromUrl,
} from './billingAutomationService';

export async function getDriveBoletosConfig(companyId) {
  return getDriveConfig(companyId);
}

export async function saveDriveBoletosConfig(companyId, driveRootFolderId) {
  return saveDriveConfig(companyId, driveRootFolderId);
}

export async function saveDriveBoletosConfigFull(companyId, config) {
  return saveDriveConfigFull(companyId, config);
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

export async function testDriveBoletoLookup(companyId, query) {
  return testBoletoLookup(companyId, query);
}

export async function getDriveFolderTree(companyId) {
  return getDriveFolderStructure(companyId);
}

export async function extractDriveFolderIdFromUrl(companyId, url) {
  return extractFolderIdFromUrl(companyId, url);
}
