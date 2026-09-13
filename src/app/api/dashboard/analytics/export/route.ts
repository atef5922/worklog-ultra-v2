import {GET as exportManagementReport} from '@/app/api/management/reports/export/route';
// Legacy export bookmarks use the scoped, non-compensation report pipeline.
export async function GET(request:Request){const url=new URL(request.url);if(!url.searchParams.has('format'))url.searchParams.set('format','xlsx');return exportManagementReport(new Request(url,{headers:request.headers}));}
