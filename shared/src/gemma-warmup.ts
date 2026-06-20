import { GemmaOnnxLlm } from './gemma-onnx-llm.ts';

const model = new GemmaOnnxLlm();
const response = model.generateContentAsync({
  contents: [{ role: 'user', parts: [{ text: 'Say OK.' }] }],
  config: {
    maxOutputTokens: 4,
    temperature: 0,
  },
  liveConnectConfig: {},
  toolsDict: {},
});

for await (const chunk of response) {
  if (chunk.errorCode) {
    throw new Error(`${chunk.errorCode}: ${chunk.errorMessage}`);
  }
  console.log(chunk.content?.parts?.map((part) => part.text).filter(Boolean).join('') ?? 'OK');
}
