export type OpenAIToolCallCompat = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

export function isToolLoopCompatibilityError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (!message.trim()) {
    return false;
  }

  return /(tool[_\s-]?choice|tools? are not supported|does not support tools?|does not appear to support tool completions?|unsupported\s+tools?|unsupported\s+tool[_\s-]?choice|invalid.*tool[_\s-]?choice|invalid.*tool[_\s-]?calls?|unknown parameter.*tool[_\s-]?choice|unknown parameter.*tool[_\s-]?calls?|function(?:\s|_|-)?calls?\s+are\s+not\s+supported|invalid.*function(?:\s|_|-)?calls?|unknown parameter.*function(?:\s|_|-)?calls?)/i.test(
    message
  );
}

export function normalizeAssistantMessageContent(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const textValue = typeof (value as any).text === 'string'
      ? (value as any).text
      : typeof (value as any).text?.value === 'string'
        ? (value as any).text.value
        : typeof (value as any).content === 'string'
          ? (value as any).content
          : '';
    const trimmed = textValue.trim();
    return trimmed ? trimmed : null;
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const text = value
    .map((part) => {
      if (typeof part === 'string') {
        return part;
      }
      if (typeof part?.text === 'string') {
        return part.text;
      }
      if (typeof part?.text?.value === 'string') {
        return part.text.value;
      }
      if (typeof part?.content === 'string') {
        return part.content;
      }
      return '';
    })
    .join('')
    .trim();
  return text ? text : null;
}

export function extractAssistantToolCalls(payload: any): OpenAIToolCallCompat[] {
  const firstChoice = payload?.choices?.[0];
  const message = firstChoice?.message;
  const rawToolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls
    : Array.isArray(firstChoice?.delta?.tool_calls)
      ? firstChoice.delta.tool_calls
      : [];
  const parsedDirectToolCalls = rawToolCalls
    .map((item, index) => {
      const id = typeof item?.id === 'string' && item.id.trim()
        ? item.id.trim()
        : `tool_call_${index}`;
      const name = typeof item?.function?.name === 'string' ? item.function.name.trim() : '';
      if (!name) {
        return null;
      }
      const args = typeof item?.function?.arguments === 'string'
        ? item.function.arguments
        : JSON.stringify(item?.function?.arguments ?? {});
      return {
        id,
        type: 'function' as const,
        function: {
          name,
          arguments: args || '{}',
        },
      };
    })
    .filter((item): item is OpenAIToolCallCompat => Boolean(item));

  if (parsedDirectToolCalls.length > 0) {
    return parsedDirectToolCalls;
  }

  const legacyFunctionCall = message?.function_call;
  if (legacyFunctionCall && typeof legacyFunctionCall === 'object') {
    const name = typeof legacyFunctionCall.name === 'string' ? legacyFunctionCall.name.trim() : '';
    if (name) {
      return [{
        id: 'legacy_function_call',
        type: 'function',
        function: {
          name,
          arguments: typeof legacyFunctionCall.arguments === 'string'
            ? legacyFunctionCall.arguments
            : JSON.stringify(legacyFunctionCall.arguments ?? {}),
        },
      }];
    }
  }

  const contentBasedToolCalls = extractToolCallsFromMessageContent(message?.content);
  if (contentBasedToolCalls.length > 0) {
    return contentBasedToolCalls;
  }

  const responsesToolCalls = extractToolCallsFromResponsesOutput(payload?.output);
  if (responsesToolCalls.length > 0) {
    return responsesToolCalls;
  }

  return [];
}

export function extractTextFromResponsesOutput(output: unknown): string {
  if (!Array.isArray(output)) {
    return '';
  }

  const textChunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, any>;
    const type = typeof record.type === 'string' ? record.type : '';
    if (type === 'message' && Array.isArray(record.content)) {
      for (const contentItem of record.content) {
        if (!contentItem || typeof contentItem !== 'object') {
          continue;
        }
        const contentRecord = contentItem as Record<string, any>;
        const contentType = typeof contentRecord.type === 'string' ? contentRecord.type : '';
        if (contentType === 'output_text' || contentType === 'text' || contentType === 'input_text') {
          if (typeof contentRecord.text === 'string' && contentRecord.text) {
            textChunks.push(contentRecord.text);
            continue;
          }
          if (typeof contentRecord.text?.value === 'string' && contentRecord.text.value) {
            textChunks.push(contentRecord.text.value);
          }
        }
      }
      continue;
    }

    if (type === 'output_text' || type === 'text') {
      if (typeof record.text === 'string' && record.text) {
        textChunks.push(record.text);
        continue;
      }
      if (typeof record.text?.value === 'string' && record.text.value) {
        textChunks.push(record.text.value);
      }
    }
  }

  return textChunks.join('');
}

export function summarizeOpenAIToolPayload(payload: any): Record<string, unknown> {
  const firstChoice = payload?.choices?.[0] ?? null;
  const message = firstChoice?.message ?? null;
  const messageContent = message?.content;
  const normalizedText = normalizeAssistantMessageContent(messageContent);
  const parsedToolCalls = extractAssistantToolCalls(payload);

  return {
    id: typeof payload?.id === 'string' ? payload.id : null,
    model: typeof payload?.model === 'string' ? payload.model : null,
    finishReason: typeof firstChoice?.finish_reason === 'string' ? firstChoice.finish_reason : null,
    choiceCount: Array.isArray(payload?.choices) ? payload.choices.length : 0,
    hasMessage: Boolean(message),
    contentType: Array.isArray(messageContent) ? 'array' : typeof messageContent,
    textPreview: normalizedText ? normalizedText.slice(0, 160) : null,
    rawToolCallsCount: Array.isArray(message?.tool_calls) ? message.tool_calls.length : 0,
    deltaToolCallsCount: Array.isArray(firstChoice?.delta?.tool_calls) ? firstChoice.delta.tool_calls.length : 0,
    parsedToolCallsCount: parsedToolCalls.length,
    hasLegacyFunctionCall: Boolean(message?.function_call),
    responsesOutputCount: Array.isArray(payload?.output) ? payload.output.length : 0,
    responsesOutputTypes: Array.isArray(payload?.output)
      ? payload.output.slice(0, 6).map((item: any) => (item && typeof item.type === 'string' ? item.type : typeof item))
      : [],
  };
}

export function summarizeRawToolResponseBody(rawText: string): Record<string, unknown> {
  const normalized = String(rawText || '');
  const trimmed = normalized.trim();
  return {
    bodyLength: normalized.length,
    isEmpty: trimmed.length === 0,
    startsWithBrace: trimmed.startsWith('{'),
    startsWithBracket: trimmed.startsWith('['),
    startsWithEvent: trimmed.startsWith('event:'),
    startsWithData: trimmed.startsWith('data:'),
    preview: trimmed.slice(0, 280),
  };
}

function extractToolCallsFromMessageContent(content: unknown): OpenAIToolCallCompat[] {
  if (!Array.isArray(content)) {
    return [];
  }

  return content
    .map((part, index) => {
      if (!part || typeof part !== 'object') {
        return null;
      }

      const record = part as Record<string, any>;
      const type = typeof record.type === 'string' ? record.type.trim() : '';
      if (type !== 'tool_use' && type !== 'tool_call') {
        return null;
      }

      const functionRecord = record.function && typeof record.function === 'object'
        ? record.function as Record<string, any>
        : null;
      const name = typeof record.name === 'string' && record.name.trim()
        ? record.name.trim()
        : typeof functionRecord?.name === 'string' && functionRecord.name.trim()
          ? functionRecord.name.trim()
          : '';
      if (!name) {
        return null;
      }

      const rawArguments = record.input ?? record.arguments ?? functionRecord?.arguments ?? {};
      return {
        id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `content_tool_call_${index}`,
        type: 'function' as const,
        function: {
          name,
          arguments: typeof rawArguments === 'string' ? rawArguments : JSON.stringify(rawArguments ?? {}),
        },
      };
    })
    .filter((item): item is OpenAIToolCallCompat => Boolean(item));
}

function extractToolCallsFromResponsesOutput(output: unknown): OpenAIToolCallCompat[] {
  if (!Array.isArray(output)) {
    return [];
  }

  return output
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, any>;
      if (typeof record.type !== 'string' || record.type !== 'function_call') {
        return null;
      }

      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!name) {
        return null;
      }

      return {
        id: typeof record.call_id === 'string' && record.call_id.trim()
          ? record.call_id.trim()
          : typeof record.id === 'string' && record.id.trim()
            ? record.id.trim()
            : `responses_tool_call_${index}`,
        type: 'function' as const,
        function: {
          name,
          arguments: typeof record.arguments === 'string'
            ? record.arguments
            : JSON.stringify(record.arguments ?? {}),
        },
      };
    })
    .filter((item): item is OpenAIToolCallCompat => Boolean(item));
}
