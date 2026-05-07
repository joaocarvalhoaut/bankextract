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

function normalizePhone(raw: string) {
  return String(raw || "").replace(/\D/g, "");
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

function cleanupReceivablesText(text: string) {
  return normalizeWhitespace(
    text
      .replace(/Lista de Receb[ií]veis/gi, " ")
      .replace(/Empresa\s+Cnpj\/Cpf Empresa\s+Sacado\s+Telefone\s+Tipo\s+N[º°]?\s*T[ií]tulo\s+Vencimento\s+Dias\s+Valor\s+Estado\s+Emiss[aã]o NFE\s+Pagamento\s+Valor Pago/gi, " ")
      .replace(/Total\s+R\$\s*[\d.]+,\d{2}/gi, " ")
      .replace(/Página\s+\d+\s+de\s+\d+/gi, " ")
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

function parseReceivablesList(text: string): ImportRecord[] {
  const flattened = cleanupReceivablesText(text).replace(/\n+/g, " ");
  const companyPrefix =
    "(?:ORTHOMAX(?:\\s+INDUSTRIA\\s+E\\s+COMERCIO(?:\\s+DE\\s+COLCHOES)?)?(?:\\s+LTDA)?\\s+)?";
  const companyDocument = "(?:\\d{2}\\.\\d{3}\\.\\d{3}\\/\\d{4}-\\d{2})";
  const phonePattern =
    "((?:\\(?\\d{2}\\)?\\s*)?(?:9?\\d{4}[-. ]?\\d{4}|\\d{8,13}))";
  const titlePattern = "([A-Z0-9][A-Z0-9./-]{1,39})";
  const datePattern = "(\\d{2}\\/\\d{2}\\/\\d{4})";
  const valuePattern = "(R\\$\\s*[\\d.]+,\\d{2})";
  const statePattern = "(Aberto|Pago|Liquidado|Vencido|Em\\s+aberto)";

  const recordRegex = new RegExp(
    `${companyPrefix}${companyDocument}\\s+(.+?)\\s+${phonePattern}\\s+` +
      `(Duplicata\\s+Mercantil)\\s+${titlePattern}\\s+${datePattern}\\s+(-?\\d+)\\s+${valuePattern}\\s+${statePattern}` +
      `(?:\\s+${datePattern})?(?:\\s+(?:${datePattern}|-))?(?:\\s+(?:${valuePattern}|-))?`,
    "gi",
  );

  const records: ImportRecord[] = [];

  for (const match of flattened.matchAll(recordRegex)) {
    const sacado = normalizeWhitespace(match[1] || "");
    const telefone = normalizePhone(match[2] || "");
    const tipoTitulo = normalizeWhitespace(match[3] || "Duplicata Mercantil");
    const documento = String(match[4] || "").trim();
    const vencimento = toIsoDate(match[5] || "");
    const valor = parseBrazilianCurrency(match[7] || "");
    const estado = normalizeWhitespace(match[8] || "");

    const record: ImportRecord = {
      cliente_fornecedor: sacado,
      documento,
      vencimento,
      valor,
      status: getStatusFromDueDate(vencimento),
      telefone,
      observacoes: [estado, tipoTitulo].filter(Boolean).join(" | "),
      tipo: "receber",
      raw_text: normalizeWhitespace(match[0] || ""),
    };

    if (looksLikeValidRecord(record)) {
      records.push(record);
    }
  }

  return uniqueByCompositeKey(records);
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

    console.log("[process-import-ocr] file", fileEntry.name, fileEntry.type, fileEntry.size);
    console.log("[process-import-ocr] tipo_importacao", tipoImportacao);
    console.log("[process-import-ocr] company_id", companyId);

    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    const extractedText = extractReadableTextFromBytes(bytes);
    const records = parseReceivablesList(extractedText);

    console.log("[process-import-ocr] records extraidos", records.length);

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
    console.error("[process-import-ocr] erro", message);
    return jsonResponse({
      success: false,
      records: [],
      error: message || "Nenhum registro foi encontrado no arquivo.",
    }, 500);
  }
});
