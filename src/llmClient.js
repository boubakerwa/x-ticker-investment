const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_LOCAL_LLM_BASE_URL = "http://127.0.0.1:8001/v1";

function normalizeProvider(value) {
  return value === "local_openai_compatible" ? value : "openai";
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

export function extractStructuredOutputText(payload, emptyOutputMessage) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const texts = [];

  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "refusal") {
        throw new Error(content.refusal || "The model refused the request.");
      }

      if (typeof content.text === "string" && content.text.trim()) {
        texts.push(content.text);
      } else if (content.text && typeof content.text === "object" && typeof content.text.value === "string") {
        texts.push(content.text.value);
      }
    }
  }

  if (!texts.length) {
    throw new Error(emptyOutputMessage);
  }

  return texts.join("\n").trim();
}

export function resolveLlmConfig({
  modelEnvVar,
  defaultModel,
  localModelEnvVar = "LOCAL_LLM_MODEL"
}) {
  const provider = normalizeProvider((process.env.LLM_PROVIDER || "openai").toLowerCase());
  const openaiBaseUrl = trimTrailingSlash(process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL);
  const localBaseUrl = trimTrailingSlash(process.env.LOCAL_LLM_BASE_URL || DEFAULT_LOCAL_LLM_BASE_URL);
  const openaiApiKey = process.env.OPENAI_API_KEY || "";
  const localApiKey = process.env.LOCAL_LLM_API_KEY || "local-dev-token";

  if (provider === "local_openai_compatible") {
    return {
      provider,
      baseUrl: localBaseUrl,
      apiKey: localApiKey,
      model: process.env[localModelEnvVar] || process.env[modelEnvVar] || defaultModel
    };
  }

  return {
    provider,
    baseUrl: openaiBaseUrl,
    apiKey: openaiApiKey,
    model: process.env[modelEnvVar] || defaultModel
  };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestStructuredResponse({
  config,
  instructions,
  inputText,
  schema,
  schemaName,
  emptyOutputMessage,
  requestErrorMessage,
  maxRetries = 0,
  baseDelayMs = 500,
  shouldRetry = null
}) {
  let attempt = 0;

  while (true) {
    try {
      const headers = {
        "Content-Type": "application/json; charset=utf-8"
      };

      if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const response = await fetch(`${config.baseUrl}/responses`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: config.model,
          store: false,
          instructions,
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: inputText
                }
              ]
            }
          ],
          text: {
            format: {
              type: "json_schema",
              name: schemaName,
              strict: true,
              schema
            }
          }
        })
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error?.message || requestErrorMessage || `Model request failed with ${response.status}.`);
      }

      const outputText = extractStructuredOutputText(payload, emptyOutputMessage);

      return {
        payload,
        outputText
      };
    } catch (error) {
      const retryable = typeof shouldRetry === "function" ? shouldRetry(error) : false;

      if (!retryable || attempt >= maxRetries) {
        throw error;
      }

      const delayMs = baseDelayMs * 2 ** attempt;
      attempt += 1;
      await sleep(delayMs);
    }
  }
}
