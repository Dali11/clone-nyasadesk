// api/_lib/knowledgeIngest.js
// Phase 3: turn a URL or an uploaded PDF/DOCX/TXT file into a knowledge_base
// snippet's { title, content }. Lives in _lib (doesn't count toward Vercel
// Hobby's 12-function cap). No embeddings/chunking yet -- same as Phase 2,
// content is just truncated to a safe length before being handed to
// generateDraftReply's buildKnowledgeBlock, which caps the total prompt size.

const MAX_CONTENT_CHARS = 12000; // stored capped; buildKnowledgeBlock caps again at prompt time

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

export async function ingestUrl(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new Error('That is not a valid URL'); }
  if (!/^https?:$/.test(parsed.protocol)) throw new Error('URL must start with http:// or https://');

  const res = await fetch(parsed.toString(), {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NyasaDeskBot/1.0; +https://nyasadesk1.vercel.app)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('Could not fetch that page (HTTP ' + res.status + ')');
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error('That URL is not a webpage (content-type: ' + contentType + ')');
  }
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = (titleMatch?.[1] || parsed.hostname).trim();
  const text = stripHtml(html).slice(0, MAX_CONTENT_CHARS);
  if (!text || text.length < 20) throw new Error('Could not find readable text on that page');
  return { title, content: text };
}

export async function ingestFile(filename, mimeType, base64Content) {
  const buffer = Buffer.from(base64Content, 'base64');
  const MAX_FILE_BYTES = 2.5 * 1024 * 1024; // base64 inflates ~33% -- stays under Vercel's 4.5MB request body limit
  if (buffer.length > MAX_FILE_BYTES) throw new Error('File is too large (max 2.5MB)');

  const name = filename || 'Uploaded file';
  const lower = name.toLowerCase();

  let text;
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    text = data.text;
  } else if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    lower.endsWith('.docx')
  ) {
    const mammoth = (await import('mammoth')).default;
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (mimeType.startsWith('text/') || lower.endsWith('.txt')) {
    text = buffer.toString('utf-8');
  } else {
    throw new Error('Unsupported file type -- upload a PDF, DOCX, or TXT file');
  }

  text = (text || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim().slice(0, MAX_CONTENT_CHARS);
  if (!text || text.length < 20) throw new Error('Could not extract readable text from that file');
  return { title: name.replace(/\.[^.]+$/, ''), content: text };
}
