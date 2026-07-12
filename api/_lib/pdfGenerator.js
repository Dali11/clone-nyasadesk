// api/_lib/pdfGenerator.js
// Generic PDF renderer for quotations & invoices -- works for ANY business
// (ad agency, school, hospital, restaurant, retailer, freelancer...), driven
// entirely by `settings` (branding/defaults) and `doc` (the quotation/invoice
// record itself). Nothing here is Brandfletch- or industry-specific.
//
// Uses jsPDF (already a project dependency, previously unused) in its
// Node-compatible mode -- no canvas/DOM required for text/lines/rects, which
// is all these templates need. Logo/signature images are fetched and
// embedded as base64 at render time.

// jsPDF is loaded dynamically to avoid crashing the Node.js serverless runtime
// on module load — Vercel's esbuild bundles the browser build by default.

const PAGE_W = 210; // A4 mm
const PAGE_H = 297;
const MARGIN = 15;

function money(n, currency) {
  const num = Number(n) || 0;
  return currency + ' ' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function fetchImageAsDataUrl(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    const contentType = r.headers.get('content-type') || 'image/png';
    if (!/^image\//.test(contentType)) return null;
    return { dataUrl: `data:${contentType};base64,${buf.toString('base64')}`, format: contentType.includes('png') ? 'PNG' : 'JPEG' };
  } catch {
    return null; // never let a bad logo URL break PDF generation
  }
}

function hexToRgb(hex) {
  const h = (hex || '#25D366').replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

// docType: 'quotation' | 'invoice'
export async function generateDocumentPdf(doc, docType, settings) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const brand = hexToRgb(settings?.brand_color);
  const currency = doc.currency || settings?.currency || 'MWK';
  const label = docType === 'invoice' ? 'INVOICE' : 'QUOTATION';

  const logo = await fetchImageAsDataUrl(settings?.logo_url);
  const signature = await fetchImageAsDataUrl(settings?.signature_url);

  let y = MARGIN;

  // ── Header band ──────────────────────────────────────────────────────
  pdf.setFillColor(...brand);
  pdf.rect(0, 0, PAGE_W, 3, 'F');

  if (logo) {
    try { pdf.addImage(logo.dataUrl, logo.format, MARGIN, y, 28, 28, undefined, 'FAST'); } catch { /* ignore bad image */ }
  }
  const textX = logo ? MARGIN + 34 : MARGIN;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14); pdf.setTextColor(20, 20, 20);
  pdf.text(settings?.company_name || 'Your Business', textX, y + 6);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90, 90, 90);
  let ly = y + 12;
  for (const line of [settings?.address, [settings?.phone, settings?.email].filter(Boolean).join(' · '), settings?.website].filter(Boolean)) {
    pdf.text(String(line), textX, ly); ly += 4.5;
  }

  // Doc title + number, right-aligned
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.setTextColor(...brand);
  pdf.text(label, PAGE_W - MARGIN, y + 6, { align: 'right' });
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(60, 60, 60);
  pdf.text('#' + doc.number, PAGE_W - MARGIN, y + 13, { align: 'right' });
  pdf.setFontSize(9); pdf.setTextColor(120, 120, 120);
  pdf.text('Date: ' + new Date(doc.created_at || Date.now()).toLocaleDateString(), PAGE_W - MARGIN, y + 18, { align: 'right' });
  const dateLabel = docType === 'invoice' ? 'Due: ' : 'Valid until: ';
  const dateVal = docType === 'invoice' ? doc.due_date : doc.valid_until;
  if (dateVal) pdf.text(dateLabel + new Date(dateVal).toLocaleDateString(), PAGE_W - MARGIN, y + 23, { align: 'right' });

  y = Math.max(ly, y + 30) + 6;
  pdf.setDrawColor(220, 220, 220); pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // ── Bill To ──────────────────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(140, 140, 140);
  pdf.text('BILL TO', MARGIN, y);
  y += 5;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(20, 20, 20);
  pdf.text(doc.customer_name || 'Customer', MARGIN, y);
  y += 5;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90, 90, 90);
  for (const line of [doc.customer_business_name, doc.customer_address, [doc.customer_phone, doc.customer_email].filter(Boolean).join(' · ')].filter(Boolean)) {
    pdf.text(String(line), MARGIN, y); y += 4.5;
  }
  if (doc.duration) { pdf.text('Duration: ' + doc.duration, MARGIN, y); y += 4.5; }

  y += 6;

  // ── Items table ──────────────────────────────────────────────────────
  const col = { desc: MARGIN, qty: 120, price: 145, total: 175 };
  pdf.setFillColor(245, 247, 246);
  pdf.rect(MARGIN, y, PAGE_W - MARGIN * 2, 8, 'F');
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(60, 60, 60);
  pdf.text('DESCRIPTION', col.desc + 2, y + 5.5);
  pdf.text('QTY', col.qty, y + 5.5);
  pdf.text('UNIT PRICE', col.price, y + 5.5);
  pdf.text('TOTAL', PAGE_W - MARGIN - 2, y + 5.5, { align: 'right' });
  y += 12;

  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(30, 30, 30);
  for (const item of doc.items || []) {
    if (y > PAGE_H - 70) { pdf.addPage(); y = MARGIN; }
    const descLines = pdf.splitTextToSize(item.description || '', 100);
    pdf.text(descLines, col.desc, y);
    pdf.text(String(item.quantity ?? 1), col.qty, y);
    pdf.text(money(item.unit_price, currency), col.price, y);
    pdf.text(money((item.quantity || 1) * (item.unit_price || 0), currency), PAGE_W - MARGIN, y, { align: 'right' });
    y += Math.max(descLines.length * 4.5, 6);
    pdf.setDrawColor(240, 240, 240); pdf.line(MARGIN, y - 1.5, PAGE_W - MARGIN, y - 1.5);
  }

  y += 4;

  // ── Totals ───────────────────────────────────────────────────────────
  const totalsX = PAGE_W - MARGIN - 60;
  const row = (lbl, val, bold) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal'); pdf.setFontSize(bold ? 11 : 9.5);
    pdf.setTextColor(bold ? 20 : 90, bold ? 20 : 90, bold ? 20 : 90);
    pdf.text(lbl, totalsX, y);
    pdf.text(money(val, currency), PAGE_W - MARGIN, y, { align: 'right' });
    y += bold ? 7 : 5.5;
  };
  row('Subtotal', doc.subtotal, false);
  if (Number(doc.discount_amount) > 0) row('Discount', -doc.discount_amount, false);
  if (Number(doc.tax_amount) > 0) row((settings?.tax_label || 'Tax') + ' (' + (settings?.tax_rate_percent || 0) + '%)', doc.tax_amount, false);
  pdf.setDrawColor(200, 200, 200); pdf.line(totalsX, y - 3, PAGE_W - MARGIN, y - 3);
  row('TOTAL', doc.total, true);
  if (docType === 'invoice' && Number(doc.amount_paid) > 0) {
    row('Paid', doc.amount_paid, false);
    row('Balance Due', doc.total - doc.amount_paid, true);
  }

  y += 8;

  // ── Notes ────────────────────────────────────────────────────────────
  if (doc.notes) {
    if (y > PAGE_H - 60) { pdf.addPage(); y = MARGIN; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(140, 140, 140);
    pdf.text('NOTES', MARGIN, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
    const noteLines = pdf.splitTextToSize(doc.notes, PAGE_W - MARGIN * 2);
    pdf.text(noteLines, MARGIN, y); y += noteLines.length * 4.5 + 4;
  }

  // ── Payment instructions / bank & mobile money accounts ─────────────
  const paymentInstructions = doc.payment_instructions || settings?.default_payment_instructions;
  const hasBankInfo = (settings?.bank_accounts || []).length || (settings?.mobile_money_accounts || []).length;
  if (paymentInstructions || hasBankInfo) {
    if (y > PAGE_H - 70) { pdf.addPage(); y = MARGIN; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(140, 140, 140);
    pdf.text('PAYMENT INSTRUCTIONS', MARGIN, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(80, 80, 80);
    if (paymentInstructions) {
      const lines = pdf.splitTextToSize(paymentInstructions, PAGE_W - MARGIN * 2);
      pdf.text(lines, MARGIN, y); y += lines.length * 4.5 + 2;
    }
    for (const b of settings?.bank_accounts || []) {
      pdf.text(`${b.bank_name || 'Bank'}: ${b.account_name || ''} · ${b.account_number || ''}${b.branch ? ' · ' + b.branch : ''}`, MARGIN, y);
      y += 4.5;
    }
    for (const m of settings?.mobile_money_accounts || []) {
      pdf.text(`${m.provider || 'Mobile Money'}: ${m.account_name || ''} · ${m.number || ''}`, MARGIN, y);
      y += 4.5;
    }
    y += 4;
  }

  // ── Terms & signature ────────────────────────────────────────────────
  if (settings?.default_terms) {
    if (y > PAGE_H - 50) { pdf.addPage(); y = MARGIN; }
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(140, 140, 140);
    pdf.text('TERMS & CONDITIONS', MARGIN, y); y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110, 110, 110);
    const termLines = pdf.splitTextToSize(settings.default_terms, PAGE_W - MARGIN * 2);
    pdf.text(termLines, MARGIN, y); y += termLines.length * 4 + 4;
  }

  if (signature) {
    if (y > PAGE_H - 40) { pdf.addPage(); y = MARGIN; }
    try { pdf.addImage(signature.dataUrl, signature.format, MARGIN, y, 30, 15, undefined, 'FAST'); } catch { /* ignore */ }
    pdf.setFontSize(8); pdf.setTextColor(120, 120, 120);
    pdf.text('Authorized signature', MARGIN, y + 19);
  }

  // ── Footer (every page) ──────────────────────────────────────────────
  const pageCount = pdf.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
    pdf.text(settings?.footer_text || 'Generated with NyasaDesk', PAGE_W / 2, PAGE_H - 10, { align: 'center' });
  }

  return Buffer.from(pdf.output('arraybuffer'));
}
