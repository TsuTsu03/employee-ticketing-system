// src/components/ui/markdown-renderer.tsx
'use client';

import React from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

const COMPONENTS: Components = {
  h1: ({ node, ...props }) => (
    <h1 className="mt-6 scroll-m-20 text-3xl font-bold tracking-tight" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="mt-6 scroll-m-20 text-2xl font-semibold tracking-tight" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mt-5 scroll-m-20 text-xl font-semibold tracking-tight" {...props} />
  ),
  h4: ({ node, ...props }) => (
    <h4 className="mt-4 scroll-m-20 text-lg font-semibold tracking-tight" {...props} />
  ),
  p: ({ node, ...props }) => <p className="leading-7" {...props} />,
  ul: ({ node, ...props }) => <ul className="my-4 ml-6 list-disc space-y-1" {...props} />,
  ol: ({ node, ...props }) => <ol className="my-4 ml-6 list-decimal space-y-1" {...props} />,
  li: ({ node, ...props }) => <li {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="border-muted-foreground/40 text-muted-foreground border-l-4 pl-3 italic"
      {...props}
    />
  ),
  hr: ({ node, ...props }) => <hr className="border-muted my-6" {...props} />,
  strong: ({ node, ...props }) => <strong {...props} />,
  em: ({ node, ...props }) => <em {...props} />,
  a: ({ node, href, children, ...props }) => (
    <a
      href={href ?? '#'}
      rel="noreferrer noopener"
      target="_blank"
      className="underline underline-offset-4 hover:opacity-80"
      {...props}
    >
      {children}
    </a>
  ),
  img: ({ node, src, alt, ...props }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src ?? ''} alt={alt ?? ''} className="my-2 max-w-full rounded-lg border" {...props} />
  ),
  code: ({ node, inline, className, children, ...props }) => {
    if (inline) {
      return (
        <code className="bg-muted rounded px-1 py-0.5 text-[0.9em]" {...props}>
          {children}
        </code>
      );
    }
    return (
      <pre className="my-3 overflow-x-auto rounded-lg border p-3">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  pre: ({ node, ...props }) => <pre className="my-3" {...props} />,
  table: ({ node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border">
      <table className="min-w-full text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-muted/40" {...props} />,
  th: ({ node, ...props }) => <th className="px-3 py-2 text-left font-medium" {...props} />,
  td: ({ node, ...props }) => <td className="px-3 py-2 align-top" {...props} />,
};

export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <div className="space-y-3">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default MarkdownRenderer;
