const fs = require("node:fs");
const path = require("node:path");

async function run() {
  const { createCanvas, DOMMatrix, ImageData, Path2D } = require("@napi-rs/canvas");
  Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const directory = path.join(process.cwd(), "tmp/pdfs");
  for (const name of fs.readdirSync(directory)) {
    if (/^report-check-\d+\.png$/.test(name)) fs.unlinkSync(path.join(directory, name));
  }
  const file = path.join(directory, "report-check.pdf");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(fs.readFileSync(file)),
    useSystemFonts: false,
    standardFontDataUrl: path.join(process.cwd(), "node_modules/pdfjs-dist/standard_fonts") + "/",
  });
  const pdf = await loadingTask.promise;
  let text = "";
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const pageText = (await page.getTextContent()).items.map((item) => item.str ?? "").join(" ");
    if (!pageText.includes("WorkLog Ultra")) {
      throw new Error(`PDF page ${pageNumber} is missing the branded header.`);
    }
    if (!pageText.includes(`Page ${pageNumber} of ${pdf.numPages}`)) {
      throw new Error(`PDF page ${pageNumber} is missing the expected page footer.`);
    }
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
    fs.writeFileSync(path.join(directory, `report-check-${pageNumber}.png`), canvas.toBuffer("image/png"));
    text += pageText + "\n";
  }
  for (const required of ["Management Dashboard Report", "Report overview", "Tasks in Selected Period", "Completed", "Employee Performance Summary", "Page"]) {
    if (!text.includes(required)) throw new Error(`PDF text is missing required content: ${required}`);
  }
  if (pdf.numPages < 3) throw new Error("Representative report did not exercise multi-page pagination.");
  console.log("PASS: rendered", pdf.numPages, "professional PDF pages; required report content extracted.");
  await loadingTask.destroy();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
