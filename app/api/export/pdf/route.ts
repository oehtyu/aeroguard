import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export async function POST(req: NextRequest) {
  const { incidents } = await req.json();

  // Write incidents to a temp JSON file, generate PDF via Python
  const tmpJson = join(tmpdir(), `ag_export_${Date.now()}.json`);
  const tmpPdf = join(tmpdir(), `ag_export_${Date.now()}.pdf`);

  try {
    writeFileSync(tmpJson, JSON.stringify(incidents));

    const script = `
import json, sys
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import inch
from datetime import datetime

with open('${tmpJson}') as f:
    incidents = json.load(f)

doc = SimpleDocTemplate('${tmpPdf}', pagesize=letter,
    leftMargin=0.75*inch, rightMargin=0.75*inch,
    topMargin=0.75*inch, bottomMargin=0.75*inch)

styles = getSampleStyleSheet()
story = []

# Title
title_style = ParagraphStyle('title', parent=styles['Title'],
    fontSize=20, textColor=colors.HexColor('#0072ff'), spaceAfter=6)
story.append(Paragraph('AeroGuard — Incident Report', title_style))

sub_style = ParagraphStyle('sub', parent=styles['Normal'],
    fontSize=9, textColor=colors.HexColor('#64748b'), spaceAfter=16)
story.append(Paragraph(f'Generated: {datetime.now().strftime("%B %d, %Y %I:%M %p")} | Total Records: {len(incidents)}', sub_style))
story.append(Spacer(1, 0.1*inch))

# Table header
headers = ['Time', 'Device', 'Location', 'Level', 'PM2.5', 'Status']
col_widths = [1.1*inch, 0.8*inch, 2.1*inch, 0.75*inch, 0.9*inch, 0.85*inch]

def fmt_time(ts):
    try:
        dt = datetime.fromisoformat(ts.replace('Z',''))
        return dt.strftime('%b %d %I:%M %p')
    except:
        return ts[:16]

level_colors = {'Gray': '#94a3b8','Yellow':'#eab308','Orange':'#f97316','Red':'#ef4444'}

rows = [headers]
for i in incidents:
    rows.append([
        fmt_time(i.get('created_at','')),
        i.get('device_id',''),
        i.get('location','')[:32],
        i.get('threat_level',''),
        f"{i.get('pm25_value','')} µg/m³",
        'Resolved' if i.get('resolved') else 'Active',
    ])

t = Table(rows, colWidths=col_widths, repeatRows=1)
style = TableStyle([
    ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1e3a5f')),
    ('TEXTCOLOR', (0,0), (-1,0), colors.white),
    ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
    ('FONTSIZE', (0,0), (-1,0), 8),
    ('FONTSIZE', (0,1), (-1,-1), 7.5),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#f8fafc'), colors.white]),
    ('GRID', (0,0), (-1,-1), 0.25, colors.HexColor('#cbd5e1')),
    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ('PADDING', (0,0), (-1,-1), 5),
    ('TOPPADDING', (0,0), (-1,0), 8),
    ('BOTTOMPADDING', (0,0), (-1,0), 8),
])
# Color threat level column
for row_idx, inc in enumerate(incidents, start=1):
    lvl = inc.get('threat_level','Gray')
    col = level_colors.get(lvl, '#94a3b8')
    style.add('TEXTCOLOR', (3, row_idx), (3, row_idx), colors.HexColor(col))
    style.add('FONTNAME', (3, row_idx), (3, row_idx), 'Helvetica-Bold')

t.setStyle(style)
story.append(t)

# Footer
story.append(Spacer(1, 0.2*inch))
footer_style = ParagraphStyle('footer', parent=styles['Normal'],
    fontSize=7.5, textColor=colors.HexColor('#94a3b8'))
story.append(Paragraph('AeroGuard — BPSU Fire Safety System | Sentinel Aerosol Systems', footer_style))

doc.build(story)
print('ok')
`;

    execSync(`python3 -c "${script.replace(/"/g, '\\"').replace(/\n/g,'\\n')}"`, { timeout: 15000 });

    const pdfBuffer = readFileSync(tmpPdf);
    unlinkSync(tmpJson);
    unlinkSync(tmpPdf);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="aeroguard_incidents.pdf"',
      }
    });
  } catch (err: any) {
    try { unlinkSync(tmpJson) } catch {}
    try { unlinkSync(tmpPdf) } catch {}
    return NextResponse.json({ success: false, message: 'PDF generation failed: ' + err.message });
  }
}