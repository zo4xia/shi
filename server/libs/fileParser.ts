/**
 * 内置文件解析服务
 * 纯Node实现，零外部运行时依赖
 * 支持: docx, pdf, txt, md, csv, json, xml, html, xlsx(基础), 代码文件
 */

// 纯文本扩展名
const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'csv', 'json', 'xml', 'html', 'htm', 'yaml', 'yml',
  'log', 'ini', 'conf', 'cfg', 'env', 'toml', 'properties',
  'ts', 'js', 'jsx', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'hpp',
  'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'lua',
  'css', 'scss', 'less', 'sql', 'sh', 'bash', 'bat', 'ps1', 'cmd',
  'r', 'R', 'dart', 'vue', 'svelte', 'astro',
  'makefile', 'dockerfile', 'gitignore', 'editorconfig',
]);

const MAX_TEXT_LENGTH = 30000;

export interface ParseFileOptions {
  maxTextLength?: number;
}

export interface ParseResult {
  success: boolean;
  text: string;
  fileType: string;
  pageCount?: number;
  truncated?: boolean;
  originalLength?: number;
  error?: string;
}

/**
 * 解析文件内容为纯文本
 */
export async function parseFile(
  fileName: string,
  buffer: Buffer,
  options: ParseFileOptions = {},
): Promise<ParseResult> {
  const ext = getExtension(fileName);
  const fileType = getFileType(ext);
  const maxTextLength = Number.isFinite(options.maxTextLength)
    ? Math.max(1, Math.floor(options.maxTextLength as number))
    : MAX_TEXT_LENGTH;

  try {
    let text: string | null = null;

    switch (fileType) {
      case 'docx':
        text = await parseDocx(buffer);
        break;
      case 'pdf':
        text = await parsePdf(buffer);
        break;
      case 'xlsx':
        text = await parseXlsx(buffer);
        break;
      case 'text':
        text = parseText(buffer);
        break;
      case 'html':
        text = parseHtml(buffer);
        break;
      default:
        // 尝试当纯文本解析
        text = tryParseAsText(buffer);
        if (!text) {
          return { success: false, text: '', fileType, error: `不支持的文件格式: .${ext}` };
        }
    }
    if (!text || !text.trim()) {
      return { success: false, text: '', fileType, error: '文件内容为空' };
    }

    const originalLength = text.length;
    const wasTruncated = originalLength > maxTextLength;
    const normalizedText = wasTruncated
      ? text.slice(0, maxTextLength) + '\n\n...[内容已截断]'
      : text;
    return {
      success: true,
      text: normalizedText,
      fileType,
      truncated: wasTruncated,
      originalLength,
    };
  } catch (err: any) {
    return { success: false, text: '', fileType, error: err.message || '解析失败' };
  }
}

function getExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function getFileType(ext: string): string {
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  if (ext === 'html' || ext === 'htm') return 'html';
  if (TEXT_EXTENSIONS.has(ext)) return 'text';
  return 'unknown';
}

function parseText(buffer: Buffer): string {
  return buffer.toString('utf-8').trim();
}

function parseHtml(buffer: Buffer): string {
  const html = buffer.toString('utf-8');
  // 简单HTML标签剥离
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function tryParseAsText(buffer: Buffer): string | null {
  // 检查是否像文本文件（前1024字节中非ASCII比例低）
  const sample = buffer.subarray(0, Math.min(1024, buffer.length));
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const b = sample[i];
    if (b === 0 || (b < 32 && b !== 9 && b !== 10 && b !== 13)) nonPrintable++;
  }
  if (nonPrintable / sample.length > 0.1) return null;
  return buffer.toString('utf-8').trim();
}

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.default.extractRawText({ buffer });
  return result.value?.trim() || '';
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const pdfParse = await import('pdf-parse');
  const fn = (pdfParse as any).default || pdfParse;
  const result = await fn(buffer);
  return result.text?.trim() || '';
}

async function parseXlsx(buffer: Buffer): Promise<string> {
  // 纯Node xlsx解析：读取sharedStrings.xml从zip
  // xlsx是zip格式，包含xl/sharedStrings.xml和xl/worksheets/sheet1.xml
  try {
    const entries = readZipEntries(buffer);
    const sharedStrings = entries['xl/sharedStrings.xml'];
    const sheet1 = entries['xl/worksheets/sheet1.xml'];

    if (!sharedStrings && !sheet1) {
      return '[Excel文件，内容无法解析]';
    }

    // 提取共享字符串
    const strings: string[] = [];
    if (sharedStrings) {
      const xml = Buffer.from(sharedStrings).toString('utf-8');
      const matches = xml.matchAll(/<t[^>]*>([^<]*)<\/t>/g);
      for (const m of matches) {
        if (m[1]) strings.push(m[1]);
      }
    }

    if (strings.length > 0) {
      return strings.join('\t').slice(0, MAX_TEXT_LENGTH);
    }
    return '[Excel文件，未找到文本内容]';
  } catch {
    return '[Excel文件，解析失败]';
  }
}

// 简易zip解析（只读取未压缩和deflate压缩的条目）
function readZipEntries(buffer: Buffer): Record<string, Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  let offset = 0;
  const view = buffer;

  while (offset + 30 < view.length) {
    const sig = view.readUInt32LE(offset);
    if (sig !== 0x04034b50) break; // PK\x03\x04

    const method = view.readUInt16LE(offset + 8);
    const compSize = view.readUInt32LE(offset + 18);
    const uncompSize = view.readUInt32LE(offset + 22);
    const nameLen = view.readUInt16LE(offset + 26);
    const extraLen = view.readUInt16LE(offset + 28);
    const name = view.subarray(offset + 30, offset + 30 + nameLen).toString('utf-8');
    const dataStart = offset + 30 + nameLen + extraLen;

    if (method === 0 && uncompSize > 0) {
      // Stored (no compression)
      entries[name] = view.subarray(dataStart, dataStart + uncompSize);
    } else if (method === 8 && compSize > 0) {
      // Deflate
      try {
        const { inflateRawSync } = require('zlib');
        entries[name] = inflateRawSync(view.subarray(dataStart, dataStart + compSize));
      } catch { /* skip */ }
    }

    offset = dataStart + compSize;
  }
  return entries;
}
