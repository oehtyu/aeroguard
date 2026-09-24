import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';

const fmtTime = (ts: string) => {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch { return (ts || '').slice(0, 16); }
};

const hex = (h: string) => {
  const n = parseInt(h.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const LEVEL_COLORS: Record<string, string> = { Gray: '94a3b8', Yellow: 'eab308', Orange: 'f97316', Red: 'ef4444' };
const HEADER_BG = hex('1e3a5f');
const ROW_BG_EVEN = hex('f8fafc');
const ROW_BG_ODD = hex('ffffff');
const GRID = hex('cbd5e1');
const TEXT = hex('334155');
const MUTED = hex('64748b');
const TITLE_COLOR = hex('0072ff');
const WHITE = rgb(1, 1, 1);

// Cells are one line tall — trim with an ellipsis instead of letting text wrap over the next row.
const fit = (text: string, width: number, size: number, f: { widthOfTextAtSize: (t: string, s: number) => number }) => {
  if (f.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && f.widthOfTextAtSize(t + '...', size) > width) t = t.slice(0, -1);
  return t + '...';
};

export async function POST(req: NextRequest) {
  try {
        const { incidents } = await req.json();
    const rows = (incidents || []).map((i: any) => ({
      time: fmtTime(i.created_at),
      device: i.device_id || '',
      location: (i.location || '').slice(0, 35),
      level: i.threat_level || 'Gray',
      pm25: `${i.pm25_value ?? '-'} \u00b5g/m\u00b3`,
      // the built-in PDF font only covers Latin-1 — swap anything else so a name can't crash the export
      responders: String(i.responders || 'None').replace(/[^\x20-\xFF]/g, '?'),
    }));
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const [pageW, pageH] = PageSizes.Letter;
    const margin = 40;
    const usableW = pageW - margin * 2;
        const colWidths = [72, 50, 108, 42, 62, 156]; // sums to 490 ~ usableW
    const headers = ['Time', 'Device', 'Location', 'Level', 'PM2.5', 'Responders'];
    const rowH = 20;
    const headerH = 22;

    let page = pdfDoc.addPage(PageSizes.Letter);
    let y = pageH - margin;

    const drawHeader = () => {
      page.drawText('AeroGuard \u2014 Incident Report', { x: margin, y: y - 18, size: 20, font: fontBold, color: TITLE_COLOR });
      y -= 26;
      page.drawText(`Generated: ${new Date().toLocaleString('en-PH')}   |   Total Records: ${rows.length}`, { x: margin, y: y - 12, size: 9, font, color: MUTED });
      y -= 26;
    };

    const drawTableHeader = () => {
      let x = margin;
      page.drawRectangle({ x: margin, y: y - headerH, width: usableW, height: headerH, color: HEADER_BG });
      headers.forEach((h, i) => {
        page.drawText(h, { x: x + 5, y: y - headerH + 6, size: 9, font: fontBold, color: WHITE });
        x += colWidths[i];
      });
      y -= headerH;
    };

    drawHeader();
    drawTableHeader();

    // Responders get as many lines as they need (one "Name (Role)" per line) so a
    // report with several responders is never cut short.
    const respWidth = colWidths[5] - 8;
    const lineH = 10;

    rows.forEach((row: any, ri: number) => {
      const respLines = String(row.responders).split('; ').map((t: string) => fit(t, respWidth, 8, font));
      const thisH = Math.max(rowH, respLines.length * lineH + 10);
      if (y - thisH < margin + 30) {
        page = pdfDoc.addPage(PageSizes.Letter);
        y = pageH - margin;
        drawTableHeader();
      }
      let x = margin;
      page.drawRectangle({ x: margin, y: y - thisH, width: usableW, height: thisH, color: ri % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD });
      const cells = [row.time, row.device, row.location, row.level, row.pm25];
      cells.forEach((cell, ci) => {
        const isLevel = ci === 3;
        const color = isLevel ? hex(LEVEL_COLORS[row.level] || '94a3b8') : TEXT;
        page.drawText(fit(String(cell), colWidths[ci] - 8, 8, isLevel ? fontBold : font), { x: x + 5, y: y - rowH + 6, size: 8, font: isLevel ? fontBold : font, color });
        x += colWidths[ci];
      });
      respLines.forEach((line: string, li: number) => {
        page.drawText(line, { x: x + 5, y: y - 13 - li * lineH, size: 8, font, color: TEXT });
      });
      page.drawRectangle({ x: margin, y: y - thisH, width: usableW, height: thisH, borderColor: GRID, borderWidth: 0.5, color: undefined });
      y -= thisH;
    });

    page.drawText('AeroGuard \u2014 BPSU Fire Safety System | Sentinel Aerosol Systems', { x: margin, y: margin - 10, size: 7.5, font, color: MUTED });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="aeroguard_incidents.pdf"',
      }
    });
  } catch (err: any) {
    console.error('[PDF EXPORT] Failed:', err);
    return NextResponse.json({ success: false, message: 'PDF generation failed: ' + err.message }, { status: 500 });
  }
}