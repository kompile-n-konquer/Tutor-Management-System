// Throwaway smoke test: pdf-lib generates a grid PDF, pdfjs-dist reads text items.
const fs = require('fs');
const { PDFDocument, StandardFonts } = require('pdf-lib');

const SLOTS = ['08:00-08:45', '09:00-09:45', '10:15-11:00'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

async function main() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 400]);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  // Day headers across the top
  DAYS.forEach((d, i) => {
    page.drawText(d, { x: 100 + i * 90, y: 360, size: 12, font });
  });
  // Time labels down the left + some "class" text in busy cells
  SLOTS.forEach((s, r) => {
    page.drawText(s, { x: 20, y: 320 - r * 40, size: 10, font });
  });
  page.drawText('CS301', { x: 100, y: 320, size: 10, font }); // Mon 08:00 busy
  page.drawText('CS450', { x: 280, y: 280, size: 10, font }); // Wed 09:00 busy

  const bytes = await doc.save();
  fs.writeFileSync('tmp_fixture.pdf', bytes);

  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const parsed = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
  const page1 = await parsed.getPage(1);
  const content = await page1.getTextContent();
  for (const item of content.items) {
    if (!item.str.trim()) continue;
    console.log(JSON.stringify({ str: item.str, x: item.transform[4], y: item.transform[5], w: item.width, h: item.height }));
  }
  await parsed.destroy();
  console.log('PAGES:', parsed.numPages);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
