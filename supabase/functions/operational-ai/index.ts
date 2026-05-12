import {
  corsHeaders,
  createRequestContext,
  errorResponse,
  extractCompanyId,
  logRuntime,
  requireAuthenticatedUser,
  requireCompanyId,
  successResponse,
  withRetry,
  withTimeout,
} from '../_shared/runtime.ts';

function buildFallbackInsights(analytics: Record<string, unknown> = {}) {
  const summary = (analytics.summary || {}) as Record<string, unknown>;
  const aiContext = (analytics.aiContext || {}) as Record<string, unknown>;
  const overdueCount = Number(aiContext.overdueCount || 0);
  const successRate = Number(aiContext.whatsappSuccessRate || 0);
  const avgReadMinutes = Number(aiContext.avgReadMinutes || 0);
  const manual = Number((aiContext.manualVsAutomatic as Record<string, unknown>)?.manual || 0);
  const automatic = Number((aiContext.manualVsAutomatic as Record<string, unknown>)?.automatic || 0);

  const risk =
    overdueCount >= 25 || Number(summary.overdueValue || 0) > 100000
      ? 'alto risco'
      : overdueCount >= 10 || successRate < 50
        ? 'medio risco'
        : 'baixo risco';

  const suggestions = [];

  if (manual > automatic) {
    suggestions.push({
      type: 'automation',
      title: 'Migrar operacao manual para automacao',
      description: 'A operacao ainda depende mais de envio manual do que automatico. Vale estruturar uma regua base para reduzir friccao.',
      priority: 'alta',
    });
  }

  if (successRate < 70) {
    suggestions.push({
      type: 'whatsapp',
      title: 'Revisar qualidade do envio WhatsApp',
      description: 'A taxa de sucesso do WhatsApp esta abaixo do ideal. Verifique telefone valido, templates e timing da mensagem.',
      priority: 'media',
    });
  }

  if (avgReadMinutes > 120) {
    suggestions.push({
      type: 'tone',
      title: 'Ajustar o tom da cobranca',
      description: 'A leitura das mensagens esta lenta. Teste um tom mais amigavel e contextual nas primeiras tentativas.',
      priority: 'media',
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      type: 'health',
      title: 'Operacao com sinais saudaveis',
      description: 'Os indicadores atuais mostram boa saude operacional. O proximo passo e escalar automacoes e acompanhar conversao.',
      priority: 'baixa',
    });
  }

  return {
    success: true,
    insights: suggestions,
    risk_score: risk,
    suggested_tones: [
      { tone: 'amigavel', reason: 'Melhora abertura em carteiras com atraso moderado.' },
      { tone: 'neutra', reason: 'Mantem consistencia operacional sem pressionar excessivamente.' },
      { tone: overdueCount > 15 ? 'firme' : 'urgente', reason: 'Adequado para titulos mais antigos ou com alto risco.' },
    ],
  };
}

async function callOpenAi(body: Record<string, unknown>) {
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  const model = Deno.env.get('OPENAI_MODEL') || 'gpt-4.1-mini';

  if (!apiKey) {
    return null;
  }

  const response = await withTimeout(
    (signal) =>
      fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          input: [
            {
              role: 'system',
              content: [
                {
                  type: 'input_text',
                  text: 'Voce eh um analista operacional de cobranca B2B. Responda somente JSON valido, sem markdown. Gere insights claros, pragmaticos e acionaveis para um SaaS financeiro multiempresa.',
                },
              ],
            },
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: JSON.stringify(body),
                },
              ],
            },
          ],
          text: {
            format: {
              type: 'json_schema',
              name: 'operational_ai',
              schema: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  insights: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        type: { type: 'string' },
                        title: { type: 'string' },
                        description: { type: 'string' },
                        priority: { type: 'string' },
                      },
                      required: ['type', 'title', 'description', 'priority'],
                    },
                  },
                  risk_score: { type: 'string' },
                  suggested_tones: {
                    type: 'array',
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      properties: {
                        tone: { type: 'string' },
                        reason: { type: 'string' },
                      },
                      required: ['tone', 'reason'],
                    },
                  },
                },
                required: ['insights', 'risk_score', 'suggested_tones'],
              },
            },
          },
        }),
      }),
    18000,
    'Tempo limite excedido ao consultar a IA operacional.',
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenAI error ${response.status}: ${JSON.stringify(data)}`);
  }

  const outputText = data?.output_text || data?.output?.[0]?.content?.[0]?.text || '';
  if (!outputText) {
    return null;
  }

  return JSON.parse(outputText);
}

Deno.serve(async (req) => {
  const ctx = createRequestContext(req, { module: 'operational-ai' });

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'build_operational_insights');
    const companyId = requireCompanyId(extractCompanyId(body));
    const user = await requireAuthenticatedUser(req);
    ctx.action = action;
    ctx.companyId = companyId;
    ctx.userId = user.id;

    logRuntime(ctx, {
      metadata: {
        has_openai_key: Boolean(Deno.env.get('OPENAI_API_KEY')),
        company_id: companyId,
      },
    });

    if (action === 'suggest_charge_tone') {
      const payload = body?.payload || {};
      const atraso = Number(payload?.dias_atraso || 0);
      const tone = atraso >= 30 ? 'urgente' : atraso >= 10 ? 'firme' : atraso >= 3 ? 'neutra' : 'amigavel';
      return successResponse(ctx, {
        success: true,
        tone,
        reason:
          tone === 'urgente'
            ? 'Atraso elevado e risco maior de inadimplencia.'
            : tone === 'firme'
              ? 'Carteira com atraso relevante e necessidade de maior firmeza.'
              : tone === 'neutra'
                ? 'Abordagem equilibrada para manter relacionamento e pressionar com moderacao.'
                : 'Melhor tom para abrir conversa com pouco atraso e maior chance de resposta positiva.',
      });
    }

    const analytics = body?.analytics || {};
    const fallback = buildFallbackInsights(analytics);

    try {
      const aiResult = await withRetry(
        ctx,
        async () => callOpenAi(body),
        { attempts: 2, baseDelayMs: 700 },
      );

      if (aiResult) {
        logRuntime(ctx, {
          action,
          status: 'ok',
          metadata: { provider: 'openai', fallback: false },
        });
        return successResponse(ctx, {
          success: true,
          ...aiResult,
        });
      }
    } catch (error) {
      logRuntime(ctx, {
        action,
        status: 'warning',
        metadata: { provider: 'openai', fallback: true },
        error,
      });
    }

    return successResponse(ctx, {
      ...fallback,
      provider: 'fallback',
    });
  } catch (error) {
    return errorResponse(ctx, error, {
      status: 200,
      code: 'OPERATIONAL_AI_FAILED',
    });
  }
});
