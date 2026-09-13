const fs=require('node:fs'),path=require('node:path');
async function run(){
 const {createCanvas,DOMMatrix,ImageData,Path2D}=require('@napi-rs/canvas');
 Object.assign(globalThis,{DOMMatrix,ImageData,Path2D});
 const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
 const file=path.join(process.cwd(),'tmp/pdfs/report-check.pdf');
 const loadingTask=pdfjs.getDocument({data:new Uint8Array(fs.readFileSync(file)),useSystemFonts:false,standardFontDataUrl:path.join(process.cwd(),"node_modules/pdfjs-dist/standard_fonts")+'/'});const pdf=await loadingTask.promise;
 let text='';
 for(let n=1;n<=pdf.numPages;n++){
  const page=await pdf.getPage(n),viewport=page.getViewport({scale:1.5});const canvas=createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
  await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport}).promise;
  fs.writeFileSync(path.join(process.cwd(),`tmp/pdfs/report-check-${n}.png`),canvas.toBuffer('image/png'));
  text+=(await page.getTextContent()).items.map(i=>i.str??'').join(' ')+'\n';
 }
 if(!text.includes('Synthetic report')||!text.includes('Completed')||!text.includes('480'))throw Error('PDF text is missing required report fields.');
 console.log('PASS: rendered',pdf.numPages,'PDF pages; required Latin labels, status and numeric values extracted.');await loadingTask.destroy();
}
run().catch(e=>{console.error(e);process.exitCode=1;});
