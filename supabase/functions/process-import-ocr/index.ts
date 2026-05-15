import "@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ImportRecord = {
  cliente_fornecedor: string;
  documento: string;
  vencimento: string;
  valor: number;
  status: "vencido" | "pendente" | "a_vencer";
  telefone: string;
  observacoes: string;
  tipo: "receber";
  raw_text?: string;
};

type ParsedReceivablesResult = {
  candidateLines: string[];
  blocks: string[];
  records: ImportRecord[];
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeWhitespace(value: string) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u0000/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function stripAccents(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePdfText(value: string) {
  return normalizeWhitespace(
    String(value || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ ]{2,}/g, " ")
      .replace(/\n[ ]+/g, "\n"),
  );
}

function normalizePhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 13) return "";
  return digits;
}

function maskPhone(raw: string) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length <= 4) return `${digits.slice(0, 1)}***`;
  return `${digits.slice(0, 4)}***${digits.slice(-2)}`;
}

function maskCompanyId(raw: string) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function safeLog(label: string, payload?: Record<string, unknown>) {
  if (!payload) {
    console.log(label);
    return;
  }

  console.log(label, payload);
}

function safeError(label: string, message: string) {
  console.error(label, { message });
}

function parseBrazilianCurrency(raw: string) {
  const cleaned = String(raw || "")
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function toIsoDate(raw: string) {
  const match = String(raw || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

function todayInSaoPaulo() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function getStatusFromDueDate(isoDate: string): "vencido" | "pendente" | "a_vencer" {
  const today = todayInSaoPaulo();
  if (!isoDate) return "pendente";
  if (isoDate < today) return "vencido";
  if (isoDate === today) return "pendente";
  return "a_vencer";
}

function extractReadableTextFromBytes(bytes: Uint8Array) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const latin1 = new TextDecoder("latin1").decode(bytes);

  return normalizeWhitespace(
    `${utf8}\n${latin1}`
      .replace(/\\r/g, "\n")
      .replace(/[^\x20-\x7EÀ-ÿ\n]/g, " ")
      .replace(/[ ]{2,}/g, " "),
  );
}

function looksLikeUsefulPdfText(text: string) {
  const normalized = stripAccents(text).toLowerCase();
  return (
    text.length > 1000 &&
    (normalized.includes("lista de recebiveis") ||
      normalized.includes("sacado") ||
      normalized.includes("vencimento") ||
      normalized.includes("duplicata mercantil"))
  );
}

function decodePdfLiteralString(value: string) {
  let result = "";
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (current !== "\\") {
      result += current;
      continue;
    }

    const next = value[index + 1];
    if (!next) break;
    if (next === "n") {
      result += "\n";
      index += 1;
      continue;
    }
    if (next === "r") {
      result += "\r";
      index += 1;
      continue;
    }
    if (next === "t") {
      result += "\t";
      index += 1;
      continue;
    }
    if (next === "b") {
      result += "\b";
      index += 1;
      continue;
    }
    if (next === "f") {
      result += "\f";
      index += 1;
      continue;
    }
    if (next === "(" || next === ")" || next === "\\") {
      result += next;
      index += 1;
      continue;
    }
    if (/[0-7]/.test(next)) {
      let octal = next;
      if (/[0-7]/.test(value[index + 2] || "")) octal += value[index + 2];
      if (/[0-7]/.test(value[index + 3] || "")) octal += value[index + 3];
      result += String.fromCharCode(parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    result += next;
    index += 1;
  }

  return result;
}

function decodePdfHexString(value: string) {
  const hex = value.replace(/[^0-9a-f]/gi, "");
  const padded = hex.length % 2 === 1 ? `${hex}0` : hex;
  const bytes = new Uint8Array(padded.length / 2);

  for (let index = 0; index < padded.length; index += 2) {
    bytes[index / 2] = parseInt(padded.slice(index, index + 2), 16);
  }

  return new TextDecoder("latin1").decode(bytes);
}

function extractStringsFromPdfSource(source: string) {
  const chunks: string[] = [];
  const literalRegex = /\((?:\\.|[^\\()])+\)\s*(?:Tj|TJ|')/g;
  const arrayRegex = /\[(.*?)\]\s*TJ/g;
  const hexRegex = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|TJ|')/g;

  for (const match of source.matchAll(literalRegex)) {
    const raw = match[0].replace(/\)\s*(?:Tj|TJ|')$/, "");
    chunks.push(decodePdfLiteralString(raw.slice(1)));
  }

  for (const match of source.matchAll(hexRegex)) {
    chunks.push(decodePdfHexString(match[1] || ""));
  }

  for (const match of source.matchAll(arrayRegex)) {
    const inner = match[1] || "";
    const stringRegex = /\((?:\\.|[^\\()])+\)|<([0-9A-Fa-f\s]+)>/g;
    const parts: string[] = [];

    for (const stringMatch of inner.matchAll(stringRegex)) {
      const raw = stringMatch[0];
      if (raw.startsWith("(")) {
        parts.push(decodePdfLiteralString(raw.slice(1, -1)));
      } else if (raw.startsWith("<")) {
        parts.push(decodePdfHexString(raw.slice(1, -1)));
      }
    }

    if (parts.length) {
      chunks.push(parts.join(""));
    }
  }

  return chunks;
}

async function decompressDeflateBytes(bytes: Uint8Array) {
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const buffer = await new Response(stream).arrayBuffer();
    return new Uint8Array(buffer);
  } catch {
    throw new Error("Nao foi possivel descomprimir os streams do PDF.");
  }
}

async function extractFlateDecodedSources(bytes: Uint8Array) {
  const source = new TextDecoder("latin1").decode(bytes);
  const streamRegex = /<<[\s\S]*?\/Filter\s*(?:\[\s*)?\/FlateDecode\b[\s\S]*?>>\s*stream\r?\n/gi;
  const decodedSources: string[] = [];
  let totalDecompressedBytes = 0;
  let match: RegExpExecArray | null = null;

  while ((match = streamRegex.exec(source)) !== null) {
    const streamStart = match.index + match[0].length;
    const endIndex = source.indexOf("endstream", streamStart);
    if (endIndex === -1) {
      continue;
    }

    let streamEnd = endIndex;
    while (streamEnd > streamStart && (bytes[streamEnd - 1] === 0x0a || bytes[streamEnd - 1] === 0x0d)) {
      streamEnd -= 1;
    }

    const compressed = bytes.slice(streamStart, streamEnd);
    if (!compressed.length) {
      continue;
    }

    const decompressed = await decompressDeflateBytes(compressed);
    totalDecompressedBytes += decompressed.byteLength;
    decodedSources.push(new TextDecoder("latin1").decode(decompressed));
  }

  return {
    count: decodedSources.length,
    totalDecompressedBytes,
    decodedSources,
  };
}

async function extractTextFromPdfStreams(bytes: Uint8Array) {
  const rawText = extractReadableTextFromBytes(bytes);
  const flate = await extractFlateDecodedSources(bytes);
  const sourceCandidates = flate.decodedSources.length ? flate.decodedSources : [rawText];
  const chunks = sourceCandidates.flatMap((source) => extractStringsFromPdfSource(source));
  const normalizedFallback = normalizePdfText([rawText, ...sourceCandidates].join("\n"));

  const merged = normalizePdfText(
    chunks
      .join("\n")
      .replace(/[^\x20-\x7EÀ-ÿ\n]/g, " ")
      .replace(/[ ]{2,}/g, " "),
  );

  return {
    rawText,
    mergedText: merged,
    fallbackText: normalizedFallback,
    text: looksLikeUsefulPdfText(merged)
      ? merged
      : (looksLikeUsefulPdfText(normalizedFallback) ? normalizedFallback : ""),
    flateStreamCount: flate.count,
    totalDecompressedBytes: flate.totalDecompressedBytes,
  };
}

function cleanupReceivablesText(text: string) {
  return normalizeWhitespace(
    text
      .replace(/Lista de Receb[ií]veis/gi, " ")
      .replace(/Empresa\s+Cnpj\/Cpf Empresa\s+Sacado\s+Telefone\s+Tipo\s+N[º°]?\s*T[ií]tulo\s+Vencimento\s+Dias\s+Valor\s+Estado\s+Emiss[aã]o NFE\s+Pagamento\s+Valor Pago/gi, " ")
      .replace(/Total\s+R\$\s*[\d.]+,\d{2}/gi, " ")
      .replace(/P[aá]gina\s+\d+\s+de\s+\d+/gi, " ")
      .replace(/Emitido em\s+\d{2}\/\d{2}\/\d{4}.*?(?=\n|$)/gi, " "),
  );
}

function uniqueByCompositeKey(records: ImportRecord[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = [
      record.cliente_fornecedor.toUpperCase(),
      record.documento.toUpperCase(),
      record.vencimento,
      record.valor.toFixed(2),
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function looksLikeValidRecord(record: ImportRecord) {
  return Boolean(
    record.cliente_fornecedor &&
      record.documento &&
      record.vencimento &&
      Number.isFinite(record.valor) &&
      record.valor > 0,
  );
}

function parseReceivablesList(text: string): ParsedReceivablesResult {
  const cleaned = cleanupReceivablesText(text);
  const candidateLines = cleaned
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => /51\.382\.654\/0001-68|Duplicata|R\$|Aberto|Vencimento|Sacado/i.test(line));

  const flattened = cleaned.replace(/\n+/g, " ");
  const blocks = flattened
    .split(/(?=51\.382\.654\/0001-68)/g)
    .map((block) => normalizeWhitespace(block))
    .filter((block) => /Duplicata\s+Mercantil/i.test(block) && /R\$\s*[\d.]+,\d{2}/i.test(block));

  const recordRegex = /51\.382\.654\/0001-68\s+(.+?)\s+(\d{8,13})\s+Duplicata\s+Mercantil\s+([A-Z0-9/-]+)\s+(\d{2}\/\d{2}\/\d{4})\s+-?\d+\s+R\$\s*([\d.]+,\d{2})\s+(Aberto|Baixado|Pago|Vencido|Em\s+aberto)/gi;

  const records: ImportRecord[] = [];

  for (const source of blocks.length ? blocks : [flattened]) {
    for (const match of source.matchAll(recordRegex)) {
      const sacado = normalizeWhitespace(match[1] || "");
      const rawPhone = String(match[2] || "").trim();
      let telefone = normalizePhone(rawPhone);
      const documento = String(match[3] || "").trim();
      const vencimento = toIsoDate(match[4] || "");
      const valor = parseBrazilianCurrency(match[5] || "");
      const estado = normalizeWhitespace(match[6] || "");

      if (/[/-]/.test(rawPhone) || (telefone && normalizePhone(documento) === telefone)) {
        telefone = "";
      }

      safeLog("[OCR PARSER]", {
        sacado_length: sacado.length,
        telefone: maskPhone(telefone),
        documento_length: documento.length,
      });

      const record: ImportRecord = {
        cliente_fornecedor: sacado,
        documento,
        vencimento,
        valor,
        status: getStatusFromDueDate(vencimento),
        telefone,
        observacoes: [estado, "Duplicata Mercantil"].filter(Boolean).join(" | "),
        tipo: "receber",
        raw_text: normalizeWhitespace(match[0] || ""),
      };

      if (looksLikeValidRecord(record)) {
        records.push(record);
      }
    }
  }

  return {
    candidateLines,
    blocks,
    records: uniqueByCompositeKey(records),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, records: [], error: "Metodo nao permitido." }, 405);
  }

  try {
    const formData = await req.formData();
    const fileEntry = formData.get("file");
    const tipoImportacao = String(formData.get("tipo_importacao") || "").trim();
    const companyId = String(formData.get("company_id") || "").trim();

    if (!(fileEntry instanceof File)) {
      return jsonResponse({ success: false, records: [], error: "Arquivo nao enviado." }, 400);
    }

    if (!companyId) {
      return jsonResponse({ success: false, records: [], error: "company_id obrigatorio." }, 400);
    }

    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    safeLog("[process-import-ocr] request", {
      file_extension: String(fileEntry.name || "").split(".").pop() || "",
      mime_type: fileEntry.type || "unknown",
      file_size_bytes: fileEntry.size,
      tipo_importacao: tipoImportacao || "unknown",
      company_id: maskCompanyId(companyId),
      buffer_bytes: bytes.byteLength,
    });

    const extraction = await extractTextFromPdfStreams(bytes);
    const text = extraction.text || "";
    const normalized = normalizePdfText(extraction.mergedText || extraction.fallbackText || "");
    const parsed = text ? parseReceivablesList(text) : { candidateLines: [], blocks: [], records: [] };
    const { candidateLines, blocks, records } = parsed;

    safeLog("[process-import-ocr] extraction_summary", {
      flate_stream_count: extraction.flateStreamCount || 0,
      total_decompressed_bytes: extraction.totalDecompressedBytes || 0,
      text_length: text.length,
      candidate_lines: candidateLines.length,
      candidate_blocks: blocks.length,
      records_extracted: records.length,
    });

    if (!text.length) {
      throw new Error("Nao foi possivel ler texto util do PDF. Use um PDF com texto selecionavel ou configure OCR externo.");
    }

    if (!records.length) {
      return jsonResponse({
        success: false,
        records: [],
        error: "Nenhum registro foi encontrado no arquivo.",
      });
    }

    return jsonResponse({
      success: true,
      records,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao processar OCR.";
    safeError("[process-import-ocr] erro", message);
    return jsonResponse({
      success: false,
      records: [],
      error: message || "Nenhum registro foi encontrado no arquivo.",
    }, 500);
  }
});
