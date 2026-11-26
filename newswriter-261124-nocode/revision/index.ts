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

// Formative self-check only: no semantic grades, no invented facts or model claims.
function selfCheck(original:any){
 const f=original.article?.fields||{};
 const text=(k:string)=>str(f[k]?.text,8000);
 const ink=(k:string)=>typeof f[k]?.ink==="string"&&f[k].ink.startsWith("data:image/");
 const task=(field:string,advice:string,hints:string[])=>({field,advice,hints});
 const tasks=[];
 if(!ink("headline")&&(text("headline").length>45||!text("headline")))tasks.push(task("headline","표제가 길거나 비어 있어요. 중요한 사건을 짧게 표현해 보세요.",["가장 중요한 사건은 무엇인가요?","핵심 낱말을 두세 개 골라요.","제목만 읽어도 어떤 사건인지 알 수 있도록 써요."]));
 if(!ink("lead")&&(!text("lead").match(/\d+\s*월|지난|최근|오늘|어제|올해|이번/)||text("lead").length<30))tasks.push(task("lead","전문에 독자가 궁금해할 핵심 사실을 넣었는지 확인해요. 시간 표현은 예시일 뿐이며 실제 사실을 확인해야 해요.",["누가, 언제, 어디서, 무엇을 했나요?","어떻게, 왜 일어났는지도 필요한 만큼 확인해요.","가장 중요한 사실을 한두 문장으로 요약해요."]));
 if(!ink("body1")&&!ink("body2")&&!ink("body3"))tasks.push(task("body1","본문의 중심 내용이 달라지는 곳을 직접 찾아 문단을 나누어 보세요. 문단 수는 정답이 아니에요.",["각 문장을 읽고 무엇에 관한 문장인지 말해 봐요.","같은 중심 내용끼리 묶어 봐요.","새로운 활동·결과·반응으로 바뀌면 새 문단을 고려해요."]));
 if(original.article?.photo&&!str(original.article?.source))tasks.push(task("caption","사진 출처와 사진이 기사에 도움이 되는지 확인해요.",["누가 만든 사진인가요?","기사 내용과 사진이 관련 있나요?","실제 출처를 밝혀요."]));
 tasks.push(task("body2","직접 확인한 사실과 개인적인 생각을 구별해요.",["직접 본 것과 들은 것은 무엇인가요?","날짜·수치·인용을 확인해요.","확인할 수 없는 사실은 지어내지 않아요."]));
 return {ratings:[null,null,null,null],praise:"첫 기사문을 제출했어요. 이제 독자의 눈으로 읽고 한 부분씩 발전시켜 봐요.",tasks:tasks.slice(0,3)};
}
function studentRow(row:any,original:any){
 return {...row,feedback:row.published?row.feedback:selfCheck(original),feedback_kind:row.published?"teacher":"selfcheck"};
}

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
 if(!row&&b.action==="load"){
 await db("POST","?on_conflict=original_id,original_revision",{original_id:id,original_revision:rev},"resolution=ignore-duplicates,return=representation");
 row=(await db("GET",path))[0];
 }
 if(!row)return fail("먼저 고쳐쓰기 편집실을 열어 주세요.",409);
 if(b.action==="load")return reply({ok:true,record:studentRow(row,original)});
 if(row.status==="submitted")return fail("이미 고쳐쓰기를 제출했습니다.",409);
 if(Number(b.version)!==row.version)return fail("다른 기기의 수정 기록이 있습니다. 새로고침 후 다시 확인하세요.",409);
 const fields:Record<string,string>={};
 for(const k of ids){const v=b.fields?.[k];if(typeof v!=="string"||v.length>8000)return fail("글자 수 또는 입력 형식을 확인하세요.");fields[k]=v;}
 const reflection=str(b.reflection,3000);
 if(b.action==="submit"&&(!fields.headline.trim()||!fields.lead.trim()||!fields.body1.trim()||!reflection))return fail("표제·전문·본문과 고쳐 쓴 이유를 작성하세요.");
 const result=await db("PATCH",path+"&version=eq."+row.version+"&status=eq.draft",{revised_fields:fields,reflection,version:row.version+1,status:b.action==="submit"?"submitted":"draft",updated_at:new Date().toISOString()});
 if(result.length!==1)return fail("동시 수정이 감지되었습니다. 현재 글을 복사한 후 다시 불러오세요.",409);
 return reply({ok:true,record:studentRow(result[0],original)});
 }catch{return fail("서버 작업 실패. 원본은 변경되지 않았습니다.",500);}
});