export type GeneratedTextChunkDescriptor = {
  sourceName: string;
  partNumber: number;
  totalParts: number;
  kind: 'text_split' | 'parsed_extract';
};

const GENERATED_TEXT_CHUNK_PATTERN = /^(?<source>.+)\.part-(?<part>\d+)-of-(?<total>\d+)(?<extension>\.[^.]+)?$/i;
const GENERATED_EXTRACTED_CHUNK_PATTERN = /^(?<source>.+)\.extracted(?:\.part-(?<part>\d+)-of-(?<total>\d+))?\.txt$/i;

export function parseGeneratedTextChunkName(fileName: string): GeneratedTextChunkDescriptor | null {
  const extractedMatch = GENERATED_EXTRACTED_CHUNK_PATTERN.exec(fileName);
  if (extractedMatch?.groups?.source) {
    const sourceName = extractedMatch.groups.source.trim();
    const partNumber = Number.parseInt(extractedMatch.groups.part || '1', 10);
    const totalParts = Number.parseInt(extractedMatch.groups.total || '1', 10);
    return {
      sourceName,
      partNumber: Number.isFinite(partNumber) ? partNumber : 1,
      totalParts: Number.isFinite(totalParts) ? totalParts : 1,
      kind: 'parsed_extract',
    };
  }

  const chunkMatch = GENERATED_TEXT_CHUNK_PATTERN.exec(fileName);
  if (chunkMatch?.groups?.source) {
    const sourceName = `${chunkMatch.groups.source.trim()}${chunkMatch.groups.extension || ''}`;
    const partNumber = Number.parseInt(chunkMatch.groups.part || '1', 10);
    const totalParts = Number.parseInt(chunkMatch.groups.total || '1', 10);
    return {
      sourceName,
      partNumber: Number.isFinite(partNumber) ? partNumber : 1,
      totalParts: Number.isFinite(totalParts) ? totalParts : 1,
      kind: 'text_split',
    };
  }

  return null;
}
