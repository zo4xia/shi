import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
// @ts-ignore
import remarkGfm from 'remark-gfm';
// @ts-ignore
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
// @ts-ignore
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ClipboardDocumentIcon, CheckIcon, DocumentIcon, FolderIcon } from '@heroicons/react/24/outline';

const CODE_BLOCK_LINE_LIMIT = 200;
const CODE_BLOCK_CHAR_LIMIT = 20000;
const SYNTAX_HIGHLIGHTER_STYLE = {
  margin: 0,
  borderRadius: 0,
  background: '#1f2227',
};
const SAFE_URL_PROTOCOLS = new Set(['http', 'https', 'mailto', 'tel', 'file']);

type MathMarkdownDeps = {
  remarkMath: unknown;
  rehypeKatex: unknown;
};

type MermaidModule = {
  default: {
    initialize: (config: Record<string, unknown>) => void;
    render: (id: string, code: string) => Promise<{ svg: string }>;
  };
};

let mathMarkdownDepsPromise: Promise<MathMarkdownDeps> | null = null;
let mermaidModulePromise: Promise<MermaidModule['default']> | null = null;

const loadMathMarkdownDeps = async (): Promise<MathMarkdownDeps> => {
  if (!mathMarkdownDepsPromise) {
    mathMarkdownDepsPromise = Promise.all([
      import('remark-math'),
      import('rehype-katex'),
      import('katex/dist/katex.min.css'),
    ]).then(([remarkMathModule, rehypeKatexModule]) => ({
      remarkMath: remarkMathModule.default,
      rehypeKatex: rehypeKatexModule.default,
    }));
  }

  return mathMarkdownDepsPromise;
};

const loadMermaidModule = async (): Promise<MermaidModule['default']> => {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((module) => {
      const mermaid = module.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
      });
      return mermaid;
    });
  }

  return mermaidModulePromise;
};

const encodeFileUrl = (url: string): string => {
  const encoded = encodeURI(url);
  return encoded.replace(/\(/g, '%28').replace(/\)/g, '%29');
};

const encodeFileUrlDestination = (dest: string): string => {
  const trimmed = dest.trim();
  if (!/^<?file:\/\//i.test(trimmed)) {
    return dest;
  }

  let core = trimmed;
  let prefix = '';
  let suffix = '';
  if (core.startsWith('<') && core.endsWith('>')) {
    prefix = '<';
    suffix = '>';
    core = core.slice(1, -1);
  }

  const encoded = encodeFileUrl(core);
  return dest.replace(trimmed, `${prefix}${encoded}${suffix}`);
};

const findMarkdownLinkEnd = (input: string, start: number): number => {
  let depth = 1;
  for (let i = start; i < input.length; i += 1) {
    const char = input[i];
    if (char === '\\') {
      i += 1;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
    if (char === '\n') {
      return -1;
    }
  }
  return -1;
};

const encodeFileUrlsInMarkdown = (content: string): string => {
  if (!content.includes('file://')) {
    return content;
  }

  let result = '';
  let cursor = 0;
  while (cursor < content.length) {
    const openIndex = content.indexOf('](', cursor);
    if (openIndex === -1) {
      result += content.slice(cursor);
      break;
    }

    result += content.slice(cursor, openIndex + 2);
    const destStart = openIndex + 2;
    const destEnd = findMarkdownLinkEnd(content, destStart);
    if (destEnd === -1) {
      result += content.slice(destStart);
      break;
    }

    const dest = content.slice(destStart, destEnd);
    result += encodeFileUrlDestination(dest);
    result += ')';
    cursor = destEnd + 1;
  }
  return result;
};

/**
 * Normalize multi-line display math blocks for remark-math compatibility.
 * remark-math treats $$ like code fences: opening $$ must be on its own line,
 * and closing $$ must also be on its own line.
 * LLMs often output $$content\n...\ncontent$$ which breaks parsing and corrupts
 * all subsequent markdown. This function normalizes such blocks.
 */
const normalizeDisplayMath = (content: string): string => {
  return content.replace(/\$\$([\s\S]+?)\$\$/g, (match, inner) => {
    if (!inner.includes('\n')) {
      return match;
    }
    return `$$\n${inner.trim()}\n$$`;
  });
};

const safeUrlTransform = (url: string): string => {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  const match = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!match) {
    return trimmed;
  }

  const protocol = match[1].toLowerCase();
  if (SAFE_URL_PROTOCOLS.has(protocol)) {
    return trimmed;
  }

  return '';
};

const getHrefProtocol = (href: string): string | null => {
  const trimmed = href.trim();
  const match = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!match) return null;
  return match[1].toLowerCase();
};

const isExternalHref = (href: string): boolean => {
  const protocol = getHrefProtocol(href);
  if (!protocol) return false;
  return protocol !== 'file';
};

const openExternalViaDefaultBrowser = async (url: string): Promise<boolean> => {
  const openExternal = (window as any)?.electron?.shell?.openExternal;
  if (typeof openExternal !== 'function') {
    return false;
  }

  try {
    const result = await openExternal(url);
    return !!result?.success;
  } catch (error) {
    console.error('Failed to open external link with system browser:', url, error);
    return false;
  }
};

const openExternalViaAnchorFallback = (url: string): void => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const CodeBlock: React.FC<any> = ({ node, className, children, ...props }) => {
  const normalizedClassName = Array.isArray(className)
    ? className.join(' ')
    : className || '';
  const match = /language-([\w-]+)/.exec(normalizedClassName);
  const hasPosition = node?.position?.start?.line != null && node?.position?.end?.line != null;
  const isInline = typeof props.inline === 'boolean'
    ? props.inline
    : hasPosition
      ? node.position.start.line === node.position.end.line
      : !match;
  const codeText = Array.isArray(children) ? children.join('') : String(children);
  const trimmedCodeText = codeText.replace(/\n$/, '');
  const shouldHighlight = !isInline && match
    && trimmedCodeText.length <= CODE_BLOCK_CHAR_LIMIT
    && trimmedCodeText.split('\n').length <= CODE_BLOCK_LINE_LIMIT;
  const [isCopied, setIsCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null);
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const mermaidRenderSeqRef = useRef(0);

  useEffect(() => () => {
    if (copyTimeoutRef.current != null) {
      window.clearTimeout(copyTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (isInline || match?.[1] !== 'mermaid') {
      setMermaidSvg(null);
      setMermaidError(null);
      return;
    }

    let cancelled = false;
    const renderSeq = mermaidRenderSeqRef.current + 1;
    mermaidRenderSeqRef.current = renderSeq;
    setMermaidSvg(null);
    setMermaidError(null);

    void loadMermaidModule()
      .then(async (mermaid) => {
        const renderId = `mermaid-${renderSeq}-${Math.random().toString(36).slice(2, 10)}`;
        const rendered = await mermaid.render(renderId, trimmedCodeText);
        if (!cancelled && mermaidRenderSeqRef.current === renderSeq) {
          setMermaidSvg(rendered.svg);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to render mermaid block:', error);
          setMermaidError(error instanceof Error ? error.message : 'Mermaid render failed');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isInline, match, trimmedCodeText]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(trimmedCodeText);
      setIsCopied(true);
      if (copyTimeoutRef.current != null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setIsCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy code block: ', error);
    }
  }, [trimmedCodeText]);

  if (!isInline) {
    if (match?.[1] === 'mermaid') {
      return (
        <div className="my-3 rounded-xl overflow-hidden border dark:border-claude-darkBorder border-claude-border relative shadow-subtle">
          <div className="dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted px-4 py-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary font-medium flex items-center justify-between">
            <span>mermaid</span>
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
              title={'复制到剪贴板'}
              aria-label={'复制到剪贴板'}
            >
              {isCopied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="overflow-x-auto bg-white px-4 py-4 dark:bg-claude-darkSurfaceInset">
            {mermaidSvg ? (
              <div
                className="mermaid-diagram min-w-max dark:[&_svg]:text-claude-darkText"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            ) : mermaidError ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {`Mermaid 渲染失败：${mermaidError}`}
                </div>
                <code className="block whitespace-pre-wrap break-words rounded-lg bg-[#282c34] px-4 py-3 font-mono text-[13px] leading-6 text-claude-darkText">
                  {trimmedCodeText}
                </code>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed dark:border-claude-darkBorder border-claude-border px-3 py-4 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary">
                Mermaid 渲染中...
              </div>
            )}
          </div>
        </div>
      );
    }

    // Simple code block without language - minimal styling
    if (!match) {
      return (
        <div className="my-2 relative group">
          <div className="overflow-x-auto rounded-lg bg-[#282c34] text-[13px] leading-6">
            <button
              type="button"
              onClick={handleCopy}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-md bg-gray-700/80 text-gray-300 hover:bg-gray-600 transition-colors opacity-0 group-hover:opacity-100"
              title={'复制到剪贴板'}
              aria-label={'复制到剪贴板'}
            >
              {isCopied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardDocumentIcon className="h-4 w-4" />
              )}
            </button>
            <code className="block px-4 py-3 font-mono text-claude-darkText whitespace-pre">
              {trimmedCodeText}
            </code>
          </div>
        </div>
      );
    }

    // Code block with language - show header with language name
    return (
      <div className="my-3 rounded-xl overflow-hidden border dark:border-claude-darkBorder border-claude-border relative shadow-subtle">
        <div className="dark:bg-claude-darkSurfaceMuted bg-claude-surfaceMuted px-4 py-2 text-xs dark:text-claude-darkTextSecondary text-claude-textSecondary font-medium flex items-center justify-between">
          <span>{match[1]}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-md dark:hover:bg-claude-darkSurfaceHover hover:bg-claude-surfaceHover transition-colors"
            title={'复制到剪贴板'}
            aria-label={'复制到剪贴板'}
          >
            {isCopied ? (
              <CheckIcon className="h-4 w-4 text-green-500" />
            ) : (
              <ClipboardDocumentIcon className="h-4 w-4" />
            )}
          </button>
        </div>
        {shouldHighlight ? (
          <SyntaxHighlighter
            style={oneDark}
            language={match[1]}
            PreTag="div"
            customStyle={SYNTAX_HIGHLIGHTER_STYLE}
          >
            {trimmedCodeText}
          </SyntaxHighlighter>
        ) : (
          <div className="m-0 overflow-x-auto bg-[#282c34] text-[13px] leading-6">
            <code className="block px-4 py-3 font-mono text-claude-darkText whitespace-pre">
              {trimmedCodeText}
            </code>
          </div>
        )}
      </div>
    );
  }

  const inlineClassName = [
    'inline bg-transparent px-0.5 text-[0.92em] font-mono font-medium dark:text-claude-darkText text-claude-text',
    normalizedClassName,
  ].filter(Boolean).join(' ');

  return (
    <code
      className={inlineClassName}
      {...props}
    >
      {children}
    </code>
  );
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const stripHashAndQuery = (value: string): string => value.split('#')[0].split('?')[0];

const stripFileProtocol = (value: string): string => {
  let cleaned = value.replace(/^file:\/\//i, '');
  if (/^\/[A-Za-z]:/.test(cleaned)) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
};

const hasFileExtension = (value: string): boolean => /\.[A-Za-z0-9]{1,6}$/.test(value);

const looksLikeDirectory = (value: string): boolean => {
  if (!value) return false;
  if (value.endsWith('/') || value.endsWith('\\')) return true;
  return !hasFileExtension(value);
};

const isLikelyLocalFilePath = (href: string): boolean => {
  if (!href) return false;
  if (/^file:\/\//i.test(href)) return true;
  if (/^[A-Za-z]:[\\/]/.test(href)) return true;
  if (href.startsWith('/') || href.startsWith('./') || href.startsWith('../')) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return false;

  const base = stripHashAndQuery(href);
  if (base.includes('/') || base.includes('\\')) return true;

  const extMatch = base.match(/\.([A-Za-z0-9]{1,6})$/);
  if (!extMatch) return false;
  const ext = extMatch[1].toLowerCase();
  const commonTlds = new Set(['com', 'net', 'org', 'io', 'cn', 'co', 'ai', 'app', 'dev', 'gov', 'edu']);
  return !commonTlds.has(ext);
};

const toFileHref = (filePath: string): string => {
  const normalized = filePath.replace(/\\/g, '/');
  if (/^[A-Za-z]:/.test(filePath)) {
    return `file:///${normalized}`;
  }
  if (normalized.startsWith('/')) {
    return `file://${normalized}`;
  }
  return `file://${normalized}`;
};

const getLocalPathFromLink = (
  href: string | null,
  text: string,
  resolveLocalFilePath?: (href: string, text: string) => string | null
): string | null => {
  if (!href) return null;
  const resolved = resolveLocalFilePath ? resolveLocalFilePath(href, text) : null;
  if (resolved) return resolved;
  if (!isLikelyLocalFilePath(href)) return null;
  const rawPath = stripFileProtocol(stripHashAndQuery(href));
  const decoded = safeDecodeURIComponent(rawPath);
  return decoded || rawPath || null;
};

const findFallbackPathFromContext = (
  anchor: HTMLAnchorElement | null,
  fileName: string,
  resolveLocalFilePath?: (href: string, text: string) => string | null
): string | null => {
  const trimmedName = fileName.trim();
  if (!trimmedName || trimmedName.includes('/') || trimmedName.includes('\\')) {
    return null;
  }

  if (!anchor || typeof anchor.closest !== 'function') return null;
  const container = anchor.closest('.markdown-content');
  if (!container) return null;

  const anchors = Array.from(container.querySelectorAll('a'));
  const index = anchors.indexOf(anchor);
  if (index <= 0) return null;

  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = anchors[i] as HTMLAnchorElement;
    const candidateHref = candidate.getAttribute('href');
    const candidateText = candidate.textContent ?? '';
    const basePath = getLocalPathFromLink(candidateHref, candidateText, resolveLocalFilePath);
    if (!basePath || !looksLikeDirectory(basePath)) {
      continue;
    }

    const normalizedBase = basePath.replace(/[\\/]+$/, '');
    return `${normalizedBase}/${trimmedName}`;
  }

  return null;
};

const createMarkdownComponents = (
  resolveLocalFilePath?: (href: string, text: string) => string | null
) => ({
  p: ({ node, className, children, ...props }: any) => (
    <p className="my-1 first:mt-0 last:mb-0 leading-[1.7] dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </p>
  ),
  strong: ({ node, className, children, ...props }: any) => (
    <strong className="font-semibold dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </strong>
  ),
  h1: ({ node, className, children, ...props }: any) => (
    <h1 className="text-2xl font-semibold mt-6 mb-3 dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </h1>
  ),
  h2: ({ node, className, children, ...props }: any) => (
    <h2 className="text-xl font-semibold mt-5 mb-2 dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </h2>
  ),
  h3: ({ node, className, children, ...props }: any) => (
    <h3 className="text-lg font-semibold mt-4 mb-2 dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </h3>
  ),
  ul: ({ node, className, children, ...props }: any) => (
    <ul className="list-disc pl-5 my-1.5 dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </ul>
  ),
  ol: ({ node, className, children, ...props }: any) => (
    <ol className="list-decimal pl-6 my-1.5 dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </ol>
  ),
  li: ({ node, className, children, ...props }: any) => (
    <li className="my-0.5 leading-[1.7] dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </li>
  ),
  blockquote: ({ node, className, children, ...props }: any) => (
    <blockquote className="border-l-4 border-claude-accent pl-4 py-1 my-2 dark:bg-claude-darkSurface/30 bg-claude-surfaceHover/30 rounded-r-lg dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </blockquote>
  ),
  code: CodeBlock,
  table: ({ node, className, children, ...props }: any) => (
    <div className="my-4 overflow-x-auto rounded-xl border dark:border-claude-darkBorder border-claude-border">
      <table className="border-collapse w-full" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ node, className, children, ...props }: any) => (
    <thead className="dark:bg-claude-darkSurface bg-claude-surfaceHover" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ node, className, children, ...props }: any) => (
    <tbody className="divide-y dark:divide-claude-darkBorder divide-claude-border" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ node, className, children, ...props }: any) => (
    <tr className="divide-x dark:divide-claude-darkBorder divide-claude-border" {...props}>
      {children}
    </tr>
  ),
  th: ({ node, className, children, ...props }: any) => (
    <th className="px-4 py-2 text-left font-semibold dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </th>
  ),
  td: ({ node, className, children, ...props }: any) => (
    <td className="px-4 py-2 dark:text-claude-darkText text-claude-text" {...props}>
      {children}
    </td>
  ),
  img: ({ node, className, ...props }: any) => (
    <img className="max-w-full h-auto rounded-xl my-4" {...props} />
  ),
  hr: ({ node, ...props }: any) => (
    <hr className="my-5 dark:border-claude-darkBorder border-claude-border" {...props} />
  ),
  a: ({ node, href, className, children, ...props }: any) => {
    if (typeof href === 'string' && href.startsWith('#artifact-')) {
      return null;
    }

    const hrefValue = typeof href === 'string' ? href.trim() : '';
    const isExternalLink = !!hrefValue && isExternalHref(hrefValue);
    const linkText = Array.isArray(children) ? children.join('') : String(children ?? '');
    const resolvedPath = hrefValue && !isExternalLink && resolveLocalFilePath
      ? resolveLocalFilePath(hrefValue, linkText)
      : null;
    const isLocalFilePath = !!hrefValue && !isExternalLink && (resolvedPath || isLikelyLocalFilePath(hrefValue));

    if (isLocalFilePath) {
      const rawPath = resolvedPath
        ?? stripFileProtocol(stripHashAndQuery(hrefValue));
      const decodedPath = safeDecodeURIComponent(rawPath);
      const filePath = decodedPath || rawPath;

      const handleClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        const anchor = e.currentTarget;
        try {
          const result = await window.electron.shell.openPath(filePath);
          if (result?.success) {
            return;
          }

          const fallbackPath = findFallbackPathFromContext(
            anchor,
            linkText,
            resolveLocalFilePath
          );
          if (fallbackPath) {
            const fallbackResult = await window.electron.shell.openPath(fallbackPath);
            if (!fallbackResult?.success) {
              console.error('Failed to open file (fallback):', fallbackPath, fallbackResult?.error);
            }
          } else {
            console.error('Failed to open file:', filePath, result?.error);
          }
        } catch (error) {
          console.error('Failed to open file:', filePath, error);
        }
      };

      return (
        <a
          href={toFileHref(filePath)}
          onClick={handleClick}
          className="text-claude-accent hover:text-claude-accentHover underline decoration-claude-accent/50 hover:decoration-claude-accent transition-colors cursor-pointer inline-flex items-center gap-1"
          title={filePath}
          {...props}
        >
          {children}
          {looksLikeDirectory(filePath) ? (
            <FolderIcon className="h-3.5 w-3.5 inline" />
          ) : (
            <DocumentIcon className="h-3.5 w-3.5 inline" />
          )}
        </a>
      );
    }

    if (isExternalLink) {
      const handleExternalClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
        const openExternal = (window as any)?.electron?.shell?.openExternal;
        if (typeof openExternal !== 'function') {
          return;
        }

        e.preventDefault();
        const opened = await openExternalViaDefaultBrowser(hrefValue);
        if (!opened) {
          openExternalViaAnchorFallback(hrefValue);
        }
      };

      return (
        <a
          href={hrefValue}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleExternalClick}
          className="text-claude-accent hover:text-claude-accentHover underline decoration-claude-accent/50 hover:decoration-claude-accent transition-colors"
          {...props}
        >
          {children}
        </a>
      );
    }

    return (
      <a
        href={hrefValue}
        target="_blank"
        rel="noopener noreferrer"
        className="text-claude-accent hover:text-claude-accentHover underline decoration-claude-accent/50 hover:decoration-claude-accent transition-colors"
        {...props}
      >
        {children}
      </a>
    );
  },
});

interface MarkdownContentProps {
  content: string;
  className?: string;
  resolveLocalFilePath?: (href: string, text: string) => string | null;
  deferMarkdown?: boolean;
  enableMath?: boolean;
}

const DeferredMarkdownContent: React.FC<Pick<MarkdownContentProps, 'content' | 'className'>> = ({
  content,
  className = '',
}) => (
  <div className={`markdown-content select-text text-sm leading-[1.7] ${className}`}>
    <div className="select-text whitespace-pre-wrap break-words dark:text-claude-darkText text-claude-text">
      {content}
    </div>
  </div>
);

const FullMarkdownContent: React.FC<Omit<MarkdownContentProps, 'deferMarkdown'>> = ({
  content,
  className = '',
  resolveLocalFilePath,
  enableMath = false,
}) => {
  const [mathDeps, setMathDeps] = useState<MathMarkdownDeps | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!enableMath) {
      setMathDeps(null);
      return () => {
        cancelled = true;
      };
    }

    void loadMathMarkdownDeps().then((deps) => {
      if (!cancelled) {
        setMathDeps(deps);
      }
    }).catch((error) => {
      if (!cancelled) {
        console.error('Failed to load math markdown deps:', error);
        setMathDeps(null);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enableMath]);

  const components = useMemo(() => createMarkdownComponents(resolveLocalFilePath), [resolveLocalFilePath]);
  const normalizedContent = useMemo(() => (
    enableMath
      ? normalizeDisplayMath(encodeFileUrlsInMarkdown(content))
      : encodeFileUrlsInMarkdown(content)
  ), [content, enableMath]);
  const remarkPlugins = useMemo(() => (
    enableMath && mathDeps ? [remarkGfm, mathDeps.remarkMath] : [remarkGfm]
  ), [enableMath, mathDeps]);
  const rehypePlugins = useMemo(() => (
    enableMath && mathDeps ? [mathDeps.rehypeKatex] : []
  ), [enableMath, mathDeps]);

  return (
    <div className={`markdown-content select-text text-sm leading-[1.7] ${className}`}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins as any}
        rehypePlugins={rehypePlugins as any}
        urlTransform={safeUrlTransform}
        components={components}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
};

const MarkdownContentInner: React.FC<MarkdownContentProps> = ({
  content,
  className = '',
  resolveLocalFilePath,
  deferMarkdown = false,
  enableMath = false,
}) => {
  // {标记} P1-STREAMING-MARKDOWN-DEFER: 流式阶段先走轻文本，完成后再恢复完整 Markdown 解析。
  // {标记} P0-HOOK-ORDER-FIX: defer 模式与完整 Markdown 模式拆成独立组件，避免同一组件前后渲染 Hook 结构漂移。
  if (deferMarkdown) {
    return <DeferredMarkdownContent content={content} className={className} />;
  }

  return (
    <FullMarkdownContent
      content={content}
      className={className}
      resolveLocalFilePath={resolveLocalFilePath}
      enableMath={enableMath}
    />
  );
};

const MarkdownContent = React.memo(MarkdownContentInner);

export default MarkdownContent;
