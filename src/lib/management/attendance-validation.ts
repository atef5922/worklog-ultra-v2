type Session={id?:string;startedAt:string;endedAt:string};
export function validateAttendanceCorrection(date:string,work:Session[],breaks:Session[],legacyBreakMinutes:number,now=new Date()) {
 const start=new Date(`${date}T00:00:00+06:00`).getTime();
 if(!Number.isFinite(start)||!work.length||work.length>50||breaks.length>50)return 'Provide a valid date and at least one work session.';
 const intervals=(sessions:Session[])=>sessions.map(s=>({start:new Date(s.startedAt).getTime(),end:new Date(s.endedAt).getTime()})).sort((a,b)=>a.start-b.start);
 const w=intervals(work),b=intervals(breaks);
 for(const list of [w,b])for(let i=0;i<list.length;i++){
  const s=list[i];if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||s.end<=s.start||s.start<start||s.start>=start+86400000||s.end>start+2*86400000||s.end>now.getTime())return 'Session times must be ordered, start on the attendance date, and not be in the future.';
  if(i&&list[i-1].end>s.start)return 'Sessions must not overlap.';
 }
 if(b.some(s=>!w.some(parent=>parent.start<=s.start&&parent.end>=s.end)))return 'Every break must be inside one work session.';
 const minutes=w.reduce((n,s)=>n+(s.end-s.start)/60000,0),breakMinutes=b.reduce((n,s)=>n+(s.end-s.start)/60000,0);
 if(!Number.isInteger(legacyBreakMinutes)||legacyBreakMinutes<0||breakMinutes+legacyBreakMinutes>minutes)return 'Break duration exceeds time in the office.';
 return null;
}
