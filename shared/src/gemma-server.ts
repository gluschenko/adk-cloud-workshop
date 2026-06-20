import express from 'express';
import { GemmaOnnxLlm } from './gemma-onnx-llm.ts';
import type { LlmRequest, LlmResponse } from '@google/adk';

const port = Number(process.env.GEMMA_API_PORT ?? 8010);
const host = process.env.GEMMA_API_HOST ?? '127.0.0.1';
const model = new GemmaOnnxLlm();
const app = express();

app.use(express.json({ limit: '5mb' }));

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    model: model.model,
    device: model.device,
    dtype: model.dtype,
  });
});

app.post('/v1/adk/generate', async (req, res) => {
  const { request } = req.body as { model?: string; request?: LlmRequest };
  if (!request) {
    res.status(400).json({ error: 'request is required' });
    return;
  }

  try {
    let result: LlmResponse | undefined;
    for await (const chunk of model.generateContentAsync(request, false)) {
      result = chunk;
      break;
    }
    res.json(result ?? { errorCode: 'EMPTY_RESPONSE', errorMessage: 'Gemma service returned no response.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.listen(port, host, () => {
  console.log(`[gemma] model: ${model.model}`);
  console.log(`[gemma] runtime: device=${model.device} dtype=${model.dtype}`);
  console.log(`[gemma] API: http://${host}:${port}`);
});
