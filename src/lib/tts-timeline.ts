export interface TimelineWord {
  text: string;
  beginIndex: number;
  endIndex: number;
  beginTime: number;
  endTime: number;
}

export interface TimelineSentence {
  index: number;
  originalText?: string;
  words: TimelineWord[];
}

export interface TtsTimelineResult {
  clientRequestId?: string;
  requestId: string;
  audio: {
    url: string;
    id?: string;
    expiresAt?: number;
  };
  usage: {
    characters?: number;
  };
  sentences: TimelineSentence[];
}

export interface FlatTimelineWord extends TimelineWord {
  sentenceIndex: number;
}

export function normalizeTtsTimelineResult(result: TtsTimelineResult): TtsTimelineResult {
  const maxEndTime = result.sentences.flatMap((sentence) => sentence.words).reduce((max, word) => {
    return Math.max(max, word.endTime);
  }, 0);
  const multiplier = maxEndTime > 0 && maxEndTime <= 100 ? 1000 : 1;

  return {
    ...result,
    sentences: result.sentences
      .map((sentence) => ({
        ...sentence,
        words: [...sentence.words]
          .map((word) => ({
            ...word,
            beginTime: word.beginTime * multiplier,
            endTime: word.endTime * multiplier,
          }))
          .sort((a, b) => a.beginTime - b.beginTime),
      }))
      .sort((a, b) => a.index - b.index),
  };
}

export function flattenTimelineWords(result: TtsTimelineResult | null): FlatTimelineWord[] {
  if (!result) {
    return [];
  }

  return result.sentences.flatMap((sentence) =>
    sentence.words.map((word) => ({
      ...word,
      sentenceIndex: sentence.index,
    })),
  );
}

export function findActiveTimelineWordIndex(words: FlatTimelineWord[], currentMs: number): number {
  return words.findIndex((word) => currentMs >= word.beginTime && currentMs < word.endTime);
}
