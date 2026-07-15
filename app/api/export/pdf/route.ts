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

export async function POST(req: NextRequest) {
  try {
    const { incidents } = await req.json();
    const rows = (incidents || []).map((i: any) => ({
      time: fmtTime(i.created_at),
      device: i.device_id || '',
      location: (i.location || '').slice(0, 30),
      level: i.threat_level || 'Gray',
      pm25: `${i.pm25_value ?? '-'} \u00b5g/m\u00b3`,
      status: i.resolved ? 'Resolved' : 'Active',
    }));

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const [pageW, pageH] = PageSizes.Letter;
    const margin = 40;
    const usableW = pageW - margin * 2;
    const colWidths = [80, 60, 155, 55, 75, 65]; // sums to 490 ~ usableW
    const headers = ['Time', 'Device', 'Location', 'Level', 'PM2.5', 'Status'];
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

    rows.forEach((row: any, ri: number) => {
      if (y - rowH < margin + 30) {
        page = pdfDoc.addPage(PageSizes.Letter);
        y = pageH - margin;
        drawTableHeader();
      }
      let x = margin;
      page.drawRectangle({ x: margin, y: y - rowH, width: usableW, height: rowH, color: ri % 2 === 0 ? ROW_BG_EVEN : ROW_BG_ODD });
      const cells = [row.time, row.device, row.location, row.level, row.pm25, row.status];
      cells.forEach((cell, ci) => {
        const isLevel = ci === 3;
        const color = isLevel ? hex(LEVEL_COLORS[row.level] || '94a3b8') : TEXT;
        page.drawText(String(cell), { x: x + 5, y: y - rowH + 6, size: 8, font: isLevel ? fontBold : font, color, maxWidth: colWidths[ci] - 8 });
        x += colWidths[ci];
      });
      page.drawRectangle({ x: margin, y: y - rowH, width: usableW, height: rowH, borderColor: GRID, borderWidth: 0.5, color: undefined });
      y -= rowH;
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