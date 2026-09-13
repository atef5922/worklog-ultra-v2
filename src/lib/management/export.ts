import "server-only";
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import path from 'node:path';
import fs from 'node:fs';
export type ReportSheet={name:string;columns:string[];rows:(string|number|null)[][]};
// Spreadsheet cells are assigned text values, never formula objects.
export async function excelReport(title:string,sheets:ReportSheet[]){
 const workbook=new ExcelJS.Workbook();workbook.creator='WorkLog Ultra';workbook.created=new Date();
 for(const data of sheets){const sheet=workbook.addWorksheet(data.name.slice(0,31));sheet.addRow([title]);sheet.mergeCells(1,1,1,data.columns.length);sheet.getRow(1).font={size:15,bold:true,color:{argb:'FF172554'}};sheet.addRow(data.columns);sheet.getRow(2).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(2).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF4338CA'}};
  data.rows.forEach(row=>sheet.addRow(row));sheet.columns.forEach((c,i)=>{c.width=i===0?32:22;c.alignment={vertical:'top',wrapText:true};});sheet.views=[{state:'frozen',ySplit:2}];sheet.autoFilter={from:{row:2,column:1},to:{row:2,column:data.columns.length}};
 }
 return Buffer.from(await workbook.xlsx.writeBuffer());
}
export async function pdfReport(title:string,sheets:ReportSheet[]){
 const fontPath=path.join(process.cwd(),'public','fonts','NotoSansBengali-Regular.ttf');
 const doc=new PDFDocument({size:'A4',margin:40,bufferPages:true,info:{Title:title,Author:'WorkLog Ultra'}});
 const chunks:Buffer[]=[];const finished=new Promise<Buffer>((resolve,reject)=>{doc.on('data',chunk=>chunks.push(Buffer.from(chunk)));doc.on('end',()=>resolve(Buffer.concat(chunks)));doc.on('error',reject);});
 const bengali=fs.existsSync(fontPath);if(bengali)doc.registerFont('Bengali',fontPath);
 const write=(value:string,options:PDFKit.Mixins.TextOptions={})=>{
  const text=value.replace(/[\u2010-\u2015]/g,'-');
  const runs=text.match(/[\u0980-\u09ff\u200c\u200d]+|[^\u0980-\u09ff\u200c\u200d]+/g)??[''];
  runs.forEach((run,i)=>doc.font(bengali&&/[\u0980-\u09ff]/.test(run)?'Bengali':'Helvetica').text(run,{...options,continued:i<runs.length-1}));
 };
 doc.fillColor('#172554').fontSize(20);write('WorkLog Ultra');doc.fontSize(12);write(title);doc.moveDown();
 sheets.forEach((sheet,index)=>{if(index)doc.addPage();doc.fillColor('#4338ca').fontSize(15);write(sheet.name);doc.moveDown(.5);
  if(!sheet.rows.length){doc.fillColor('#475569').fontSize(10);write('No records in this period.');}
  for(const row of sheet.rows){if(doc.y>doc.page.height-150)doc.addPage();doc.fillColor('#0f172a').fontSize(11);write(String(row[0]??'Record'));doc.moveDown(.3);
   for(let i=1;i<sheet.columns.length;i++){doc.fillColor('#475569').fontSize(9);write(sheet.columns[i]+': '+(row[i]??'-'),{width:doc.page.width-80});}doc.moveDown(.75);
  }
 });
 const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.font('Helvetica').fillColor('#64748b').fontSize(8).text('Generated '+new Date().toISOString()+' | '+(i+1)+' / '+pages.count,40,doc.page.height-28,{lineBreak:false});}
 doc.end();return finished;
}
export async function exportResponse(title:string,sheets:ReportSheet[],format:string,filename:string){
 const pdf=format==='pdf';const buffer=pdf?await pdfReport(title,sheets):await excelReport(title,sheets);
 return new Response(new Uint8Array(buffer),{headers:{'Content-Type':pdf?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${filename}.${pdf?'pdf':'xlsx'}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
