import { buildOpenAIChatCompletionsURL } from '../../src/main/libs/coworkFormatTransform';

export type ToolRuntimeApiConfig = {
  baseURL: string;
  apiKey: string;
  model: string;
  agentRoleKey: string;
};

export type ToolRuntimeToolChoice = 'auto' | 'required';

export function buildToolCompletionRequest(params: {
  apiConfig: ToolRuntimeApiConfig;
  messages: unknown[];
  tools: unknown[];
  toolChoice: ToolRuntimeToolChoice;
  maxTokens: number;
}): {
  url: string;
  init: RequestInit;
  summary: Record<string, unknown>;
} {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (params.apiConfig.apiKey.trim()) {
    headers.Authorization = `Bearer ${params.apiConfig.apiKey.trim()}`;
  }

  const body = {
    model: params.apiConfig.model,
    max_tokens: params.maxTokens,
    stream: false,
    tool_choice: params.toolChoice,
    messages: params.messages,
    tools: params.tools,
  };

  return {
    url: buildOpenAIChatCompletionsURL(params.apiConfig.baseURL),
    init: {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    },
    summary: summarizeToolCompletionRequest(params.apiConfig, body),
  };
}

function summarizeToolCompletionRequest(
  apiConfig: ToolRuntimeApiConfig,
  body: {
    model: string;
    max_tokens: number;
    stream: boolean;
    tool_choice: ToolRuntimeToolChoice;
    messages: unknown[];
    tools: unknown[];
  }
): Record<string, unknown> {
  const roles = Array.isArray(body.messages)
    ? body.messages
      .map((message: any) => (message && typeof message.role === 'string' ? message.role : typeof message))
      .slice(0, 12)
    : [];
  const toolNames = Array.isArray(body.tools)
    ? body.tools
      .map((tool: any) => tool?.function?.name)
      .filter((name): name is string => typeof name === 'string' && name.trim().length > 0)
      .slice(0, 16)
    : [];

  return {
    role: apiConfig.agentRoleKey,
    model: apiConfig.model,
    baseURL: apiConfig.baseURL,
    toolChoice: body.tool_choice,
    messageCount: Array.isArray(body.messages) ? body.messages.length : 0,
    messageRoles: roles,
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0,
    toolNames,
    stream: body.stream,
    maxTokens: body.max_tokens,
  };
}
