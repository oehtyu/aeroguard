import { NextRequest, NextResponse } from 'next/server';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  WidthType, BorderStyle, ShadingType } from 'docx';

const fmtTime = (ts: string) => {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
};

export async function POST(req: NextRequest) {
  try {
    const { incidents } = await req.json();

    const rows = (incidents || []).map((i: any) => [
      fmtTime(i.created_at),
      i.device_id,
      i.location || '',
      i.threat_level,
      `${i.pm25_value} µg/m³`,
      i.resolved ? 'Resolved' : 'Active',
    ]);

    const border = { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' };
    const borders = { top: border, bottom: border, left: border, right: border };
    const colWidths = [1600, 1100, 2900, 1000, 1200, 1100]; // DXA, sums to 9900

    const levelColors: Record<string, string> = { Gray: '94a3b8', Yellow: 'eab308', Orange: 'f97316', Red: 'ef4444' };

    const headerRow = new TableRow({
      tableHeader: true,
      children: ['Time', 'Device', 'Location', 'Level', 'PM2.5', 'Status'].map((h, i) =>
        new TableCell({
          borders,
          width: { size: colWidths[i], type: WidthType.DXA },
          shading: { fill: '1e3a5f', type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 100, right: 100 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 18 })] })]
        })
      )
    });

    const dataRows = rows.map((row: any[], ri: number) =>
      new TableRow({
        children: row.map((cell, ci) => {
          const isLevel = ci === 3;
          const color = isLevel ? (levelColors[cell] || '94a3b8') : '334155';
          return new TableCell({
            borders,
            width: { size: colWidths[ci], type: WidthType.DXA },
            shading: { fill: ri % 2 === 0 ? 'f8fafc' : 'FFFFFF', type: ShadingType.CLEAR },
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            children: [new Paragraph({ children: [new TextRun({ text: String(cell), size: 17, color, bold: isLevel })] })]
          });
        })
      })
    );

    const doc = new Document({
      sections: [{
        properties: {
          page: { size: { width: 12240, height: 15840 }, margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } }
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'AeroGuard — Incident Report', bold: true, size: 36, color: '0072ff' })]
          }),
          new Paragraph({
            children: [new TextRun({ text: `Generated: ${new Date().toLocaleString('en-PH')}   |   Total Records: ${rows.length}`, size: 18, color: '64748b' })]
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Table({
            width: { size: 9900, type: WidthType.DXA },
            columnWidths: colWidths,
            rows: [headerRow, ...dataRows]
          }),
          new Paragraph({ children: [new TextRun({ text: '' })] }),
          new Paragraph({
            children: [new TextRun({ text: 'AeroGuard | BPSU Fire Safety System | Sentinel Aerosol Systems', size: 16, color: '94a3b8' })]
          }),
        ]
      }]
    });

    const buffer = await Packer.toBuffer(doc);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': 'attachment; filename="aeroguard_incidents.docx"',
      }
    });
  } catch (err: any) {
    console.error('[DOCX EXPORT] Failed:', err);
    return NextResponse.json({ success: false, message: 'DOCX generation failed: ' + err.message }, { status: 500 });
  }
}