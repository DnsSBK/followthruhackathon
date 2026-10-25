from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.lib.units import mm

ss = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=ss['Title'], fontName='Helvetica-Bold', fontSize=20, leading=24, alignment=0, spaceAfter=4)
SUB = ParagraphStyle('sub', parent=ss['Normal'], fontName='Helvetica', fontSize=11, textColor=colors.HexColor('#555555'), spaceAfter=14)
H2 = ParagraphStyle('h2', parent=ss['Heading2'], fontName='Helvetica-Bold', fontSize=13, spaceBefore=14, spaceAfter=6)
H3 = ParagraphStyle('h3', parent=ss['Heading3'], fontName='Helvetica-Bold', fontSize=11, spaceBefore=10, spaceAfter=3)
B = ParagraphStyle('b', parent=ss['Normal'], fontName='Helvetica', fontSize=10.5, leading=15, spaceAfter=6)
C = ParagraphStyle('c', parent=B, spaceAfter=0)

doc = SimpleDocTemplate('microeconomics-assessment-brief.pdf', pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                        topMargin=18*mm, bottomMargin=18*mm, title='Microeconomics 1 – Assessment Brief 2026/27',
                        author='Department of Economics (example document)')
s = []
s.append(Paragraph('Microeconomics 1 – Assessment Brief', H1))
s.append(Paragraph('Department of Economics · Academic year 2026/27 · Term 1 · Example document for testing', SUB))

s.append(Paragraph('About this module', H2))
s.append(Paragraph('Teaching began on Monday 5 October 2026. Lectures run every Tuesday at 9am in the main lecture theatre, '
                   'and seminars take place weekly from week 2. Office hours are held on Wednesdays, 2pm to 3pm.', B))
s.append(Paragraph('Reading week runs from 9 to 13 November 2026; there are no lectures or seminars that week.', B))

s.append(Paragraph('Assessment summary', H2))
rows = [
    ['Component', 'Weighting', 'Deadline'],
    ['Problem Set 1', '10%', 'Friday 6 November 2026, 12:00'],
    ['Market power essay', '30%', 'Friday 20 November 2026, 12:00'],
    ['In-class test', '10%', 'Wednesday 2 December 2026, 10:00'],
    ['Problem Set 2', '10%', 'Friday 11 December 2026, 12:00'],
    ['Final exam', '40%', 'Summer exam period (date TBC)'],
]
t = Table([[Paragraph(c, C) for c in r] for r in rows], colWidths=[62*mm, 28*mm, 80*mm])
t.setStyle(TableStyle([
    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
    ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eeeeee')),
    ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#bbbbbb')),
    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ('TOPPADDING', (0, 0), (-1, -1), 5), ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
]))
s.append(t)
s.append(Spacer(1, 6))
s.append(Paragraph('All coursework is submitted online. Extension requests must be made at least 48 hours before the deadline.', B))

s.append(Paragraph('Task details', H2))
s.append(Paragraph('Problem sets', H3))
s.append(Paragraph('Each problem set has five questions on consumer and producer theory. Show all working; marks are given for method as well as the final answer.', B))
s.append(Paragraph('Market power essay (1,500 words)', H3))
s.append(Paragraph('Discuss whether a merger between two large supermarket chains would harm consumers. Use at least one diagram and refer to real-world evidence. '
                   'A one-page essay plan can be sent to your seminar tutor for informal feedback by Friday 13 November 2026.', B))
s.append(Paragraph('In-class test', H3))
s.append(Paragraph('A 45-minute multiple-choice test covering weeks 1 to 8, held in your usual seminar room. Bring your student card.', B))
s.append(Paragraph('Group presentation (formative, not graded)', H3))
s.append(Paragraph('In groups of four, prepare a 10-minute presentation on a market of your choice. Slides must be submitted by 9am on Monday 30 November 2026.', B))

s.append(Paragraph('Feedback', H2))
s.append(Paragraph('Marked work and written feedback will be returned within 20 working days. Provisional marks are released by 18 December 2026.', B))
doc.build(s)
print('ok')
