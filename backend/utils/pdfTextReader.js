// Thin adapter around pdfjs-dist that pulls positioned text items out of a PDF
// buffer. Kept separate from the grid logic in timetablePdf.js so the pure
// parsing rules stay unit-testable without a PDF runtime.

// Returns [{ str, x, y, width, height }] — PDF coordinates grow upwards, so a
// smaller y sits lower on the page; x/y mark the text baseline start.
const readTextItems = async (buffer) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });

  const doc = await loadingTask.promise;
  try {
    const items = [];
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (!item.str || !item.str.trim()) continue;
        items.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
          height: item.height,
        });
      }
    }
    return items;
  } finally {
    await loadingTask.destroy();
  }
};

module.exports = { readTextItems };
