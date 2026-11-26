const BASE=Deno.env.get("SUPABASE_URL")!;
const KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||Deno.env.get("SUPABASE_SECRET_KEY")||"";
const TABLE="grade6_newsroom_revision_261127";
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:CORS});
const fail=(error:string,status=400)=>reply({ok:false,error},status);
const ids=["headline","subtitle","lead","body1","body2","body3","caption"];
async function db(method:string,path:string,data?:unknown,prefer="return=representation"){
 const headers:Record<string,string>={apikey:KEY,"Content-Type":"application/json",Prefer:prefer};
 if(!KEY.startsWith("sb_secret_"))headers.Authorization="Bearer "+KEY;
 const r=await fetch(BASE+"/rest/v1/"+TABLE+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
 if(!r.ok)throw Error("DB failure");
 return await r.json();
}
const str=(v:unknown,max=3000)=>typeof v==="string"?v.trim().slice(0,max):"";
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:CORS});
 if(req.method!=="POST")return fail("POST 요청만 지원합니다.",405);
 try{
 const raw=await req.text();if(raw.length>100000)return fail("요청이 너무 큽니다.",413);
 const b=JSON.parse(raw);const n=Number(b.studentNo);
 if(!Number.isInteger(n)||n<1||n>40)return fail("학생 번호를 확인하세요.");
 const teacher=["teacherLoad","teacherSave"].includes(b.action);
 if(!teacher&&!["load","save","submit"].includes(b.action))return fail("지원하지 않는 요청입니다.");
 const credentials=teacher?{action:"teacherOne",teacherPass:b.teacherPass,studentNo:n}:{action:"load",studentCode:b.studentCode,studentNo:n};
 const headers:Record<string,string>={"Content-Type":"application/json"};
 const clientKey=req.headers.get("apikey");if(clientKey)headers.apikey=clientKey;
 const auth=await fetch(BASE+"/functions/v1/grade6-newsroom-261124",{method:"POST",headers,body:JSON.stringify(credentials)});
 const a=await auth.json();if(!auth.ok||!a.ok)return fail("접속 권한을 확인하세요.",403);
 const original=a.record;
 if(original.class_id!=="6-2"||Number(original.student_no)!==n||original.status!=="submitted")return fail("1차 기사문을 먼저 제출하세요.",409);
 const id=Number(original.id),rev=Number(original.revision);
 if(!Number.isSafeInteger(id)||!Number.isInteger(rev))return fail("원본 버전 오류",409);
 const path="?original_id=eq."+id+"&original_revision=eq."+rev;
 let row=(await db("GET",path))[0];
 if(b.action==="teacherLoad")return reply({ok:true,record:row||null});
 if(b.action==="teacherSave"){
 const f=b.feedback||{};const ratings=Array.isArray(f.ratings)?f.ratings:[];
 if(ratings.length!==4||!ratings.every((v:unknown)=>v===null||[1,2,3].includes(Number(v))))return fail("네 가지 평가 결과를 확인하세요.");
 const feedback={ratings:ratings.map((v:unknown)=>v===null?null:Number(v)),praise:str(f.praise),tasks:(Array.isArray(f.tasks)?f.tasks:[]).slice(0,3).map((t:any)=>({field:ids.includes(t.field)?t.field:"body1",advice:str(t.advice),hints:(Array.isArray(t.hints)?t.hints:[]).slice(0,3).map((h:unknown)=>str(h,1000))}))};
 if(b.published&&(!feedback.praise||!feedback.tasks.some((t:any)=>t.advice)))return fail("칭찬과 개선 과제를 먼저 작성하세요.");
 const result=await db("POST","?on_conflict=original_id,original_revision",{original_id:id,original_revision:rev,feedback,published:b.published===true},"resolution=merge-duplicates,return=representation");
 return reply({ok:true,record:result[0]});
 }
 if(!row||!row.published)return reply({ok:true,record:null});
 if(b.action==="load")return reply({ok:true,record:row});
 if(row.status==="submitted")return fail("이미 고쳐쓰기를 제출했습니다.",409);
 if(Number(b.version)!==row.version)return fail("다른 기기의 수정 기록이 있습니다. 새로고침 후 다시 확인하세요.",409);
 const fields:Record<string,string>={};
 for(const k of ids){const v=b.fields?.[k];if(typeof v!=="string"||v.length>8000)return fail("글자 수 또는 입력 형식을 확인하세요.");fields[k]=v;}
 const reflection=str(b.reflection,3000);
 if(b.action==="submit"&&(!fields.headline.trim()||!fields.lead.trim()||!fields.body1.trim()||!reflection))return fail("표제·전문·본문과 고쳐 쓴 이유를 작성하세요.");
 const result=await db("PATCH",path+"&version=eq."+row.version+"&status=eq.draft&published=eq.true",{revised_fields:fields,reflection,version:row.version+1,status:b.action==="submit"?"submitted":"draft",updated_at:new Date().toISOString()});
 if(result.length!==1)return fail("동시 수정이 감지되었습니다. 현재 글을 복사한 후 다시 불러오세요.",409);
 return reply({ok:true,record:result[0]});
 }catch{return fail("서버 작업 실패. 원본은 변경되지 않았습니다.",500);}
});