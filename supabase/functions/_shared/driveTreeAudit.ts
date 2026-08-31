import {
  buildFinancialLookupVariants,
  extractFinancialIdsFromText,
  normalizeFinancialId,
} from './normalizeFinancialId.ts';

export interface DriveAuditPdfSample {
  name: string;
  parentName: string;
  modifiedTime?: string | null;
}

export interface DriveAuditFolderNode {
  id: string;
  name: string;
  depth: number;
  path: string;
  pdfCount: number;
  subfolderCount: number;
  samplePdfs: DriveAuditPdfSample[];
}

export interface DriveAuditPatternSummary {
  suffix_0_pdf: number;
  suffix_1_pdf: number;
  compact_numeric_ids: number;
  alpha_numeric_ids: number;
  prefixed_boleto_names: number;
  client_month_structure: number;
  boleto_prefix: number;
  number_dash_client: number;
  client_folder: number;
  generic_document: number;
}

export interface DriveAuditReport {
  foldersVisited: number;
  pdfsScanned: number;
  maxDepthReached: number;
  topFolders: Array<{
    name: string;
    path: string;
    depth: number;
    pdfCount: number;
    subfolderCount: number;
    samplePdfs: string[];
  }>;
  likelyRoots: Array<{
    name: string;
    path: string;
    reason: string;
    pdfCount: number;
  }>;
  namingPatterns: DriveAuditPatternSummary;
  commonPrefixes: Array<{ prefix: string; count: number }>;
  financialPatterns: Array<{ pattern: string; count: number; examples: string[] }>;
  orphanPdfs: Array<{ path: string; name: string }>;
}

export async function scanFolderTree(
  rootId: string,
  options: {
    rootName?: string;
    maxDepth?: number;
    maxFolders?: number;
    listSubfolders: (parentId: string) => Promise<Array<{ id: string; name: string }>>;
    listPdfs: (folderId: string) => Promise<Array<{ name: string; modifiedTime?: string | null }>>;
  },
): Promise<DriveAuditFolderNode[]> {
  const rootName = options.rootName || 'root';
  const maxDepth = Math.max(1, Number(options.maxDepth || 5));
  const maxFolders = Math.max(1, Number(options.maxFolders || 250));
  const queue: Array<{ id: string; name: string; depth: number; path: string }> = [
    { id: rootId, name: rootName, depth: 0, path: rootName },
  ];
  const visited = new Set<string>();
  const nodes: DriveAuditFolderNode[] = [];

  while (queue.length > 0 && visited.size < maxFolders) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    const [subfolders, pdfs] = await Promise.all([
      options.listSubfolders(current.id).catch(() => []),
      options.listPdfs(current.id).catch(() => []),
    ]);

    nodes.push({
      id: current.id,
      name: current.name,
      depth: current.depth,
      path: current.path,
      pdfCount: pdfs.length,
      subfolderCount: subfolders.length,
      samplePdfs: pdfs.slice(0, 8).map((pdf) => ({
        name: pdf.name,
        parentName: current.name,
        modifiedTime: pdf.modifiedTime || null,
      })),
    });

    if (current.depth >= maxDepth - 1) continue;
    for (const folder of subfolders) {
      queue.push({
        id: folder.id,
        name: folder.name,
        depth: current.depth + 1,
        path: `${current.path} / ${folder.name}`,
      });
    }
  }

  return nodes;
}

export function collectPdfSamples(nodes: DriveAuditFolderNode[], limit = 120) {
  const samples: DriveAuditPdfSample[] = [];
  for (const node of nodes) {
    for (const pdf of node.samplePdfs) {
      samples.push(pdf);
      if (samples.length >= limit) return samples;
    }
  }
  return samples;
}

export function detectNamingPatterns(samples: DriveAuditPdfSample[]): DriveAuditPatternSummary {
  return samples.reduce<DriveAuditPatternSummary>((acc, sample) => {
    const upper = String(sample.name || '').toUpperCase();
    const parentUpper = String(sample.parentName || '').toUpperCase();
    if (/_0\.PDF$/i.test(upper)) acc.suffix_0_pdf += 1;
    if (/_1\.PDF$/i.test(upper)) acc.suffix_1_pdf += 1;
    if (/[A-Z0-9]+_\d{5,}\b/i.test(upper)) acc.compact_numeric_ids += 1;
    if (/[A-Z]+\d+[A-Z0-9_-]*/i.test(upper)) acc.alpha_numeric_ids += 1;
    if (/^BOLETO[\s_-]/i.test(upper) || /^FATURA[\s_-]/i.test(upper)) acc.prefixed_boleto_names += 1;
    if (/^BOLETO[\s_-]/i.test(upper)) acc.boleto_prefix += 1;
    if (/^\d+[A-Z0-9/._-]*\s*-\s*[A-Z]/i.test(upper)) acc.number_dash_client += 1;
    if (/\bCLIENTES?\b/i.test(parentUpper) || parentUpper.split(/\s+/).length >= 2) acc.client_folder += 1;
    if (/\b(RELATORIO|RECIBO|RECIBOS|NOTA|COMPROVANTE|CONTRATO|PLANILHA|MOBILAR NOTA)\b/i.test(upper)) acc.generic_document += 1;
    if (/\b(20\d{2}|JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\b/i.test(sample.parentName)) acc.client_month_structure += 1;
    return acc;
  }, {
    suffix_0_pdf: 0,
    suffix_1_pdf: 0,
    compact_numeric_ids: 0,
    alpha_numeric_ids: 0,
    prefixed_boleto_names: 0,
    client_month_structure: 0,
    boleto_prefix: 0,
    number_dash_client: 0,
    client_folder: 0,
    generic_document: 0,
  });
}

export function detectCommonPrefixes(samples: DriveAuditPdfSample[]) {
  const counts = new Map<string, number>();
  for (const sample of samples) {
    const normalized = String(sample.name || '')
      .replace(/\.pdf$/i, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .join(' ')
      .toUpperCase();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([prefix, count]) => ({ prefix, count }));
}

export function detectFinancialPatterns(samples: DriveAuditPdfSample[]) {
  const counter = new Map<string, { count: number; examples: string[] }>();
  for (const sample of samples) {
    const ids = extractFinancialIdsFromText(sample.name);
    for (const id of ids) {
      const variants = buildFinancialLookupVariants(id.raw).slice(0, 3);
      for (const variant of variants) {
        if (!variant || variant.length < 4) continue;
        const bucket = counter.get(variant) || { count: 0, examples: [] };
        bucket.count += 1;
        if (bucket.examples.length < 3) bucket.examples.push(sample.name);
        counter.set(variant, bucket);
      }
      if (id.compact) {
        const normalized = normalizeFinancialId(id.raw);
        const key = normalized.compact;
        const bucket = counter.get(key) || { count: 0, examples: [] };
        bucket.count += 1;
        if (bucket.examples.length < 3) bucket.examples.push(sample.name);
        counter.set(key, bucket);
      }
    }
  }

  return [...counter.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20)
    .map(([pattern, data]) => ({
      pattern,
      count: data.count,
      examples: data.examples,
    }));
}

export function buildDriveAuditReport(nodes: DriveAuditFolderNode[]): DriveAuditReport {
  const samples = collectPdfSamples(nodes);
  const topFolders = [...nodes]
    .sort((a, b) => b.pdfCount - a.pdfCount)
    .slice(0, 15)
    .map((node) => ({
      name: node.name,
      path: node.path,
      depth: node.depth,
      pdfCount: node.pdfCount,
      subfolderCount: node.subfolderCount,
      samplePdfs: node.samplePdfs.slice(0, 5).map((pdf) => pdf.name),
    }));

  const likelyRoots = topFolders
    .filter((folder) => folder.pdfCount > 0 || folder.subfolderCount >= 5)
    .slice(0, 8)
    .map((folder) => ({
      name: folder.name,
      path: folder.path,
      reason: folder.pdfCount > 0
        ? 'alta_concentracao_de_pdfs'
        : 'container_com_muitas_subpastas',
      pdfCount: folder.pdfCount,
    }));

  const orphanPdfs = nodes
    .filter((node) => node.depth <= 1 && node.pdfCount > 0)
    .flatMap((node) => node.samplePdfs.map((pdf) => ({
      path: node.path,
      name: pdf.name,
    })))
    .slice(0, 20);

  return {
    foldersVisited: nodes.length,
    pdfsScanned: nodes.reduce((sum, node) => sum + node.pdfCount, 0),
    maxDepthReached: Math.max(0, ...nodes.map((node) => node.depth)),
    topFolders,
    likelyRoots,
    namingPatterns: detectNamingPatterns(samples),
    commonPrefixes: detectCommonPrefixes(samples),
    financialPatterns: detectFinancialPatterns(samples),
    orphanPdfs,
  };
}
