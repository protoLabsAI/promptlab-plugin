import { useMemo } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";

// Model output is untrusted — sanitize the rendered HTML before it touches the
// DOM (this iframe carries allow-same-origin, so raw injection would reach our
// bearer-authed fetch context).
export function Markdown({ text }: { text: string }) {
  const html = useMemo(
    () => DOMPurify.sanitize(marked.parse(text, { async: false }) as string, { USE_PROFILES: { html: true } }),
    [text],
  );
  return <div className="md text-[13px]" dangerouslySetInnerHTML={{ __html: html }} />;
}
