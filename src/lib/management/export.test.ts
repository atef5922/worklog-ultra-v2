import {describe,it,expect,vi} from 'vitest';
vi.mock('server-only',()=>({}));
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import {excelReport,pdfReport,exportResponse} from './export';
describe('Report file generation',()=>{
 it('keeps formula-like employee/task text as plain text',async()=>{
  const bytes=await excelReport('Test',[{name:'Tasks',columns:['Task','Minutes'],rows:[['=HYPERLINK("https://example.com")',12],['বাংলা কাজ',25]]}]);const book=new ExcelJS.Workbook();await book.xlsx.load(bytes as never);expect(book.worksheets[0].getCell('A3').value).toBe('=HYPERLINK("https://example.com")');expect(book.worksheets[0].getCell('B4').value).toBe(25);
 });
 it('creates a valid PDF containing multiple report sections',async()=>{const bytes=await pdfReport('Synthetic report',[{name:'Tasks',columns:['Task','Status'],rows:[['বাংলা কাজ','Completed']]},{name:'Attendance',columns:['Employee','Minutes'],rows:[['Test employee',480]]}]);if(process.env.WORKLOG_EXPORT_QA==='1'){fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/report-check.pdf',bytes);}expect(bytes.subarray(0,5).toString()).toBe('%PDF-');expect(bytes.length).toBeGreaterThan(2000);});
 it('returns download headers and disables caching',async()=>{const response=await exportResponse('Test',[{name:'Tasks',columns:['Task'],rows:[]}],'xlsx','test');expect(response.headers.get('Content-Disposition')).toContain('test.xlsx');expect(response.headers.get('Cache-Control')).toBe('private, no-store');});
});
