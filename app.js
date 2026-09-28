import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, where, deleteField, writeBatch
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const state = {
  user:null,
  settings:{days:108,startDate:"",resetOnMiss:true,jaiTime:"06:00",sitaTime:"18:00",cloudinaryCloudName:"hazf1hmf",cloudinaryUploadPreset:""},
  todos:[],
  exercises:[],
  records:{},
  sita:{count:0,cycle:1,cycleCompletedAt:null},
  jai:{url:"",fileName:"",completedDate:""},
  expenses:[],
  borrowings:[],
  moneyTab:"expenses",
  calendarMonth:new Date(new Date().getFullYear(),new Date().getMonth(),1),
  exerciseRuns:{},
  exerciseAnimations:{},
  unsub:[],
  authRegister:false
};

const $ = id => document.getElementById(id);
const INDIA_TZ = "Asia/Kolkata";
const localDateKey = d => new Intl.DateTimeFormat("en-CA", {
  timeZone: INDIA_TZ, year:"numeric", month:"2-digit", day:"2-digit"
}).format(new Date(d));
// The journey is date-based and always follows Indian Standard Time,
// regardless of the device timezone.
const todayKey = () => localDateKey(new Date());
const dateFromKey = key => new Date(`${key}T00:00:00Z`);
const indiaTimeString = d => new Date(d).toLocaleTimeString("en-IN", {
  timeZone: INDIA_TZ, hour:"2-digit", minute:"2-digit", hour12:true
});
const indiaDateString = key => new Intl.DateTimeFormat("en-IN", {
  timeZone: INDIA_TZ, day:"2-digit", month:"short", year:"numeric"
}).format(dateFromKey(key));

const exerciseStorageKey = (id, dateKey=todayKey()) =>
  `hanuman-diksha:exercise:${state.user?.uid || "guest"}:${dateKey}:${id}`;
const activeExerciseStorageKey = (dateKey=todayKey()) =>
  `hanuman-diksha:active-exercise:${state.user?.uid || "guest"}:${dateKey}`;

function getActiveExerciseId(dateKey=todayKey()){
  try { return localStorage.getItem(activeExerciseStorageKey(dateKey)) || null; } catch { return null; }
}
function setActiveExerciseId(id,dateKey=todayKey()){
  try { if(id) localStorage.setItem(activeExerciseStorageKey(dateKey),id); else localStorage.removeItem(activeExerciseStorageKey(dateKey)); } catch {}
}

function loadPersistedExerciseRun(id, ex){
  try {
    const raw = localStorage.getItem(exerciseStorageKey(id));
    if(!raw) return null;
    const data = JSON.parse(raw);
    const duration = Number(data.duration || Number(ex.duration||1)*60);
    const startedAt = Number(data.startedAt);
    if(!startedAt || !Number.isFinite(startedAt)) return null;
    const elapsed = Math.floor((Date.now() - startedAt) / 1000);
    const remaining = Math.max(0, duration - elapsed);
    return {startedAt, duration, remaining, running: remaining > 0};
  } catch {
    return null;
  }
}

function persistExerciseRun(id, run){
  try {
    localStorage.setItem(exerciseStorageKey(id), JSON.stringify({
      startedAt: run.startedAt,
      duration: run.duration
    }));
  } catch {}
}

function clearPersistedExerciseRun(id){
  try {
    localStorage.removeItem(exerciseStorageKey(id));
    if(getActiveExerciseId()===id) localStorage.removeItem(activeExerciseStorageKey());
  } catch {}
}

function cancelExerciseAnimations(){
  Object.values(state.exerciseAnimations||{}).forEach(a=>{ if(a?.raf) cancelAnimationFrame(a.raf); });
  state.exerciseAnimations={};
}

function exerciseKind(name){
  const n=String(name||'').toLowerCase();
  if(n.includes('skip')) return 'skipping';
  if(n.includes('squat')) return 'squats';
  if(n.includes('push') || n.includes('chest')) return 'pushups';
  if(n.includes('lat') || n.includes('row')) return 'rows';
  if(n.includes('plank')) return 'plank';
  if(n.includes('stretch') || n.includes('recover')) return 'stretch';
  if(n.includes('warm')) return 'warmup';
  return 'default';
}

function startExerciseCanvas(id){
  const canvas=$(`exercise-canvas-${id}`);
  if(!canvas || state.exerciseAnimations[id]) return;
  const ctx=canvas.getContext('2d');
  const dpr=Math.max(1,Math.min(2,window.devicePixelRatio||1));
  const resize=()=>{
    const r=canvas.getBoundingClientRect();
    canvas.width=Math.max(1,Math.floor(r.width*dpr));
    canvas.height=Math.max(1,Math.floor(r.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  resize();
  const ro='ResizeObserver' in window ? new ResizeObserver(resize) : null;
  ro?.observe(canvas);
  const ex=state.exercises.find(x=>x.id===id);
  const kind=exerciseKind(ex?.name);
  const loop={raf:0,ro}; state.exerciseAnimations[id]=loop;

  const drawPerson=(t)=>{
    const w=canvas.clientWidth,h=canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    const g=ctx.createLinearGradient(0,0,w,h); g.addColorStop(0,'rgba(255,255,255,.14)'); g.addColorStop(1,'rgba(255,255,255,.035)');
    ctx.fillStyle=g; ctx.fillRect(0,0,w,h);
    const ground=h*.78, cx=w*.5, phase=(t/1000)*Math.PI*2;
    const pulse=(Math.sin(phase)+1)/2;
    ctx.strokeStyle='rgba(255,255,255,.14)'; ctx.lineWidth=2; ctx.beginPath(); ctx.ellipse(cx,ground+8,w*.30,10,0,0,Math.PI*2);ctx.stroke();
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#fff';ctx.fillStyle='#fff';ctx.lineWidth=Math.max(5,w*.012);
    const line=(a,b)=>{ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()};
    const circle=(x,y,r)=>{ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()};
    let head=[cx,ground-170], neck=[cx,ground-145], hip=[cx,ground-75];
    let shoulder=[cx,ground-125], lHand=[cx-55,ground-85], rHand=[cx+55,ground-85], lKnee=[cx-25,ground-35], rKnee=[cx+25,ground-35], lFoot=[cx-40,ground], rFoot=[cx+40,ground];
    if(kind==='skipping'){
      const jump=Math.abs(Math.sin(phase))*14, arm=Math.sin(phase)*28; head[1]-=jump;neck[1]-=jump;hip[1]-=jump;shoulder[1]-=jump;
      lHand=[cx-68-arm,ground-98-jump];rHand=[cx+68+arm,ground-98-jump];
      lKnee=[cx-24,ground-34-jump];rKnee=[cx+24,ground-34-jump];lFoot=[cx-36,ground-jump];rFoot=[cx+36,ground-jump];
      ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(cx,ground-90-jump,78+arm*.2,0.15,Math.PI-0.15);ctx.stroke();
    } else if(kind==='squats'){
      const q=(Math.sin(phase)+1)/2; const bend=55*q; head[1]+=bend*.38; neck[1]+=bend*.45; hip[1]+=bend; shoulder[1]+=bend*.45;
      lKnee=[cx-42,ground-35+bend*.35];rKnee=[cx+42,ground-35+bend*.35];lFoot=[cx-58,ground];rFoot=[cx+58,ground];lHand=[cx-52,ground-75+bend*.25];rHand=[cx+52,ground-75+bend*.25];
    } else if(kind==='pushups'){
      const q=(Math.sin(phase)+1)/2; const y=ground-55-q*15;
      head=[cx-100,y-30];neck=[cx-75,y-10];shoulder=[cx-55,y];hip=[cx+65,y+10];
      lHand=[cx-75,ground];rHand=[cx-35,ground];lKnee=[cx+95,ground-20];rKnee=[cx+110,ground-12];lFoot=[cx+130,ground];rFoot=[cx+145,ground];
    } else if(kind==='rows'){
      const q=Math.sin(phase); head[1]+=q*8; shoulder[1]+=q*8; hip[1]+=q*8; lHand=[cx-72-q*20,ground-88+q*10];rHand=[cx+72+q*20,ground-88+q*10];
      ctx.strokeStyle='rgba(255,255,255,.45)';ctx.lineWidth=4;line([cx-105,ground-130],[cx-72-q*20,ground-88+q*10]);line([cx+105,ground-130],[cx+72+q*20,ground-88+q*10]);
    } else if(kind==='plank'){
      const q=Math.sin(phase)*3; const y=ground-45+q; head=[cx-90,y-20];neck=[cx-65,y];shoulder=[cx-45,y];hip=[cx+65,y+4];lHand=[cx-62,ground];rHand=[cx-38,ground];lKnee=[cx+100,ground-10];rKnee=[cx+112,ground-5];lFoot=[cx+135,ground];rFoot=[cx+148,ground];
    } else if(kind==='stretch'){
      const q=Math.sin(phase)*18; head[0]+=q*.15; head[1]-=Math.abs(q)*.15; lHand=[cx-100-q,ground-125];rHand=[cx+100+q,ground-125];lKnee=[cx-35,ground-38];rKnee=[cx+35,ground-38];
    } else {
      const q=Math.sin(phase)*12; lHand=[cx-55-q,ground-92];rHand=[cx+55+q,ground-92];
    }
    circle(head[0],head[1],19);
    line(neck,shoulder); line(shoulder,lHand); line(shoulder,rHand); line(shoulder,hip);
    line(hip,lKnee); line(lKnee,lFoot); line(hip,rKnee); line(rKnee,rFoot);
    ctx.fillStyle='rgba(255,255,255,.72)';ctx.font='700 13px Arial';ctx.textAlign='center';ctx.fillText('LIVE EXERCISE',cx,28);
  };
  const frame=now=>{
    if(!state.exerciseAnimations[id]) return;
    drawPerson(now); loop.raf=requestAnimationFrame(frame);
  };
  loop.raf=requestAnimationFrame(frame);
}

const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));

// ---- Animated feedback: toasts, state screens, busy buttons ----
const ICONS = {
  success:`<svg viewBox="0 0 52 52" class="svg-ico ok"><circle cx="26" cy="26" r="22"/><path d="M15 27l7 7 15-16"/></svg>`,
  error:`<svg viewBox="0 0 52 52" class="svg-ico err"><circle cx="26" cy="26" r="22"/><path d="M18 18l16 16"/><path d="M34 18L18 34"/></svg>`,
  warning:`<svg viewBox="0 0 52 52" class="svg-ico warn"><path d="M26 6L48 45H4z"/><path d="M26 20v12"/><path d="M26 38.5v.5"/></svg>`,
  info:`<svg viewBox="0 0 52 52" class="svg-ico info"><circle cx="26" cy="26" r="22"/><path d="M26 24v12"/><path d="M26 16.5v.5"/></svg>`
};
function guessTone(msg){
  const m=String(msg).toLowerCase();
  if(/could not|failed|error|invalid|wrong|denied|larger than|auth\//.test(m)) return "error";
  if(/allow|configure|set a |finish the|missed|first/.test(m)) return "warning";
  if(/completed|saved|deleted|uploaded|cleared|back online|set for/.test(m)) return "success";
  return "info";
}
const showToast = (msg, tone) => {
  const t=$("toast"); tone=ICONS[tone]?tone:guessTone(msg);
  t.className=`toast ${tone}`;
  t.innerHTML=`<span class="t-icon">${ICONS[tone]}</span><span class="t-msg">${esc(msg)}</span><i class="t-bar"></i>`;
  void t.offsetWidth; t.classList.add("show");
  clearTimeout(showToast.t); showToast.t=setTimeout(()=>t.classList.remove("show"),3200);
};

function makeBurst(){
  const colors=["#fff","#ffc107","#ff8a00","#ffe08a","#ff3d00"];
  return Array.from({length:30},(_,i)=>`<i style="--r:${Math.round(i*12+Math.random()*10)}deg;--d:${-Math.round(110+Math.random()*130)}px;background:${colors[i%colors.length]};animation-delay:${(Math.random()*.15).toFixed(2)}s"></i>`).join("");
}
// One state screen at a time; later calls wait their turn. Resolves true (OK) / false (Cancel or tap outside).
let stateQueue=Promise.resolve();
function showState(opts){
  const p=stateQueue.then(()=>openState(opts));
  stateQueue=p.catch(()=>{});
  return p;
}
function openState({tone="success",title="",message="",okText="OK",cancelText=null,danger=false,burst=false}){
  return new Promise(resolve=>{
    const s=$("state-screen"), ok=$("state-ok"), cancel=$("state-cancel");
    s.className=`state-screen ${tone}`;
    $("state-icon").innerHTML=ICONS[tone]||ICONS.info;
    $("state-title").textContent=title; $("state-message").textContent=message;
    ok.textContent=okText; ok.className=danger?"danger-btn":"primary-btn";
    cancel.textContent=cancelText||""; cancel.classList.toggle("hidden",!cancelText);
    $("state-burst").innerHTML=burst?makeBurst():"";
    const done=v=>{
      ok.onclick=cancel.onclick=s.onclick=null;
      s.classList.add("closing");
      setTimeout(()=>{ s.classList.add("hidden"); s.classList.remove("closing"); resolve(v); },200);
    };
    ok.onclick=()=>done(true); cancel.onclick=()=>done(false);
    s.onclick=e=>{ if(e.target===s) done(false); };
    setTimeout(()=>ok.focus({preventScroll:true}),60);
  });
}
const confirmDialog=(title,message,{okText="Yes",danger=false}={})=>showState({tone:"warning",title,message,okText,cancelText:"Cancel",danger});
const celebrate=(title,message)=>showState({tone:"success",title,message,okText:"Jai Shri Ram 🚩",burst:true});

// Wraps a submit/click handler: spinner on the button while it runs, error toast if it throws.
const busy=fn=>async e=>{
  e?.preventDefault?.();
  const b=e?.submitter||(e?.currentTarget?.tagName==="BUTTON"?e.currentTarget:e?.target?.querySelector?.('button[type="submit"]'));
  if(b?.classList.contains("is-busy")) return;
  if(b){ b.classList.add("is-busy"); b.disabled=true; }
  try{ await fn(e); }
  catch(err){ console.error(err); showToast(String(err?.message||"Something went wrong").replace("Firebase: ",""),"error"); }
  finally{ if(b){ b.classList.remove("is-busy"); b.disabled=false; } }
};

// Short-lived "pop" animation that survives re-renders (continues via negative delay instead of restarting).
const popFx={};
function popAttr(id){
  const p=popFx[id]; if(!p) return "";
  const elapsed=Date.now()-p; if(elapsed>450){ delete popFx[id]; return ""; }
  return `data-pop style="--pop-delay:-${elapsed}ms"`;
}

function journeyStart(){
  return state.settings.startDate ? dateFromKey(state.settings.startDate) : null;
}
function dayIndex(dateKey=todayKey()){
  const s=journeyStart(); if(!s) return 0;
  const d=dateFromKey(dateKey);
  return Math.floor((d-s)/86400000)+1;
}
function journeyEnd(){
  const s=journeyStart(); if(!s) return null;
  return new Date(s.getTime()+(Number(state.settings.days||108)-1)*86400000);
}
function currentDay(){
  const d=dayIndex(); return d<1?0:d>state.settings.days?state.settings.days:d;
}
function isInJourney(dateKey){
  const n=dayIndex(dateKey); return n>=1 && n<=Number(state.settings.days||108);
}
function recordFor(dateKey=todayKey()){
  return state.records[dateKey] || {todo:{},exercise:{},jai:false,manual:false,status:"pending"};
}
function requiredTodoComplete(dateKey=todayKey()){
  const required=state.todos.filter(x=>x.required!==false);
  if(!required.length) return true;
  const r=recordFor(dateKey);
  return required.every(t=>r.todo?.[t.id]===true);
}
function exerciseComplete(dateKey=todayKey()){
  const req=state.exercises;
  if(!req.length) return true;
  const r=recordFor(dateKey);
  return req.every(e=>r.exercise?.[e.id]?.completed===true);
}
function jaiComplete(dateKey=todayKey()){ return recordFor(dateKey).jai===true; }
function sitaComplete(dateKey=todayKey()){ return Number(recordFor(dateKey).sitaCount||0)>=108; }

// A day is complete ONLY when todo + exercises + JAI SRI RAM video + SITA RAM (108) are all done.
function allRequiredComplete(dateKey=todayKey()){
  // Days locked in by "Clear history" stay complete, even though their JAI/SITA history fields were deleted.
  if(dateKey!==todayKey() && recordFor(dateKey).historyCleared===true) return true;
  return requiredTodoComplete(dateKey) && exerciseComplete(dateKey) && jaiComplete(dateKey) && sitaComplete(dateKey);
}

function dayStatus(dateKey){
  if(!isInJourney(dateKey)) return "out";
  if(dateKey===todayKey()) return allRequiredComplete(dateKey) ? "complete" : "today";
  const n=dayIndex(dateKey);
  if(n>currentDay() || new Date(dateKey)>new Date()) return "upcoming";
  const r=recordFor(dateKey);
  return allRequiredComplete(dateKey) ? "complete" : "missed";
}

let resetCheckRunning = false;
async function applyAutomaticResetIfNeeded(){
  if(!state.user || !state.settings.startDate || !state.settings.resetOnMiss || resetCheckRunning) return;
  resetCheckRunning = true;
  try {
    const start = journeyStart();
    const yesterday = dateFromKey(todayKey());
    yesterday.setUTCDate(yesterday.getUTCDate()-1);
    if(yesterday < start) return;

    // Find the most recent missed day from the current journey.
    // A missed day is only finalized after that IST calendar day has ended.
    let cursor = new Date(yesterday);
    let lastMissed = null;
    for(let i=0; i<Number(state.settings.days||108); i++){
      if(cursor < start) break;
      const key = localDateKey(cursor);
      if(!allRequiredComplete(key)) lastMissed = key;
      cursor.setUTCDate(cursor.getUTCDate()-1);
    }

    if(lastMissed){
      const restart = dateFromKey(lastMissed);
      restart.setUTCDate(restart.getUTCDate()+1);
      const restartKey = localDateKey(restart);
      // Do not repeatedly reset when the current start date is already the restart date.
      if(state.settings.startDate !== restartKey){
        state.settings.startDate = restartKey;
        state.settings.resetCount = Number(state.settings.resetCount||0)+1;
        state.settings.lastResetDate = lastMissed;
        await setDoc(doc(db,"users",state.user.uid,"meta","settings"),state.settings,{merge:true});
        showToast(`Missed ${lastMissed}. New journey starts from Day 1 on ${restartKey}.`);
      }
    }
  } finally {
    resetCheckRunning = false;
  }
}

function streak(){
  if(!journeyStart()) return 0;
  let n=currentDay(), s=0;
  for(let i=n;i>=1;i--){
    const key=localDateKey(new Date(journeyStart().getTime()+(i-1)*86400000));
    if(allRequiredComplete(key)) s++; else break;
  }
  return s;
}


// ---- Native reminders (Android app only; no-op in the browser) ----
let reminderTimer=null;
function syncNativeReminders(){
  if(!window.HanumanNative) return;
  clearTimeout(reminderTimer);
  reminderTimer=setTimeout(async()=>{
    const items=[];
    if(state.settings.jaiTime) items.push({key:"jai",time:state.settings.jaiTime,title:"JAI SRI RAM 🚩",body:"Time for today's JAI SRI RAM video."});
    if(state.settings.sitaTime) items.push({key:"sita",time:state.settings.sitaTime,title:"SITA RAM ॐ",body:"Complete today's 108 SITA RAM."});
    state.exercises.forEach(e=>{ if(e.time) items.push({key:"ex:"+e.id,time:e.time,title:"Exercise: "+e.name,body:`${e.duration||10} minutes — start now.`}); });
    state.todos.forEach(t=>{ if(t.time) items.push({key:"todo:"+t.id,time:t.time,title:t.title,body:t.required===false?"Optional task":"Required task for today"}); });
    const res=await window.HanumanNative.scheduleAll(items);
    if(res && !res.ok && res.reason==="permission-denied") showToast("Allow notifications for Hanuman Disha in phone settings to get reminders.");
  },800);
}

function renderAll(){
  renderDashboard(); renderTodo(); renderExercises(); renderJai(); renderSita(); renderJaiHistory(); renderSitaHistory(); renderCalendar(); renderMoney(); renderSettings(); syncNativeReminders();
  $("today-label").textContent=new Date().toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
}

function renderDashboard(){
  const day=currentDay(), total=Number(state.settings.days||108), pct=total?Math.min(1,Math.max(0,day/total)):0;
  $("day-number").textContent=day||0; $("day-caption").textContent=`of ${total} days`;
  $("days-left").textContent=Math.max(0,total-day);
  $("streak-value").textContent=streak();
  const circ=2*Math.PI*122; $("progress-ring").style.strokeDasharray=circ; $("progress-ring").style.strokeDashoffset=circ*(1-pct);
  $("today-title").textContent=day?`Day ${day}`:"Not started";
  const complete=allRequiredComplete();
  $("today-status").textContent=complete?"Completed":"Pending";
  $("journey-state-pill").textContent=state.settings.startDate ? (day?`Day ${day} active`:"Upcoming"):"Not started";
  const todos=state.todos.map(t=>({label:t.title,done:recordFor().todo?.[t.id]===true,time:t.time}));
  const ex=state.exercises.map(e=>({label:e.name,done:recordFor().exercise?.[e.id]?.completed===true,time:e.time}));
  const items=[...todos,...ex,{label:"JAI SRI RAM video",done:jaiComplete(),time:state.settings.jaiTime},{label:`SITA RAM (${sitaDailyCount()}/108)`,done:sitaComplete(),time:state.settings.sitaTime}];
  $("today-summary").innerHTML=items.length?items.map(x=>`<div class="summary-item"><div><b>${esc(x.label)}</b><small>${x.time||""}</small></div><span class="check ${x.done?"done":""}">${x.done?"✓":"•"}</span></div>`).join(""):`<div class="empty glass">Add your first daily task in Todo.</div>`;
  $("day-note").textContent=state.settings.resetOnMiss?"A missed required activity will mark the day missed and the next journey starts at Day 1.":"Reset mode is off. Missed days remain recorded without automatic reset.";
  $("jai-next-small").textContent=`Daily ${state.settings.jaiTime||"--:--"}`;
  $("sita-small").textContent=`${sitaDailyCount()} / 108 repetitions`;
  $("exercise-small").textContent=`${state.exercises.filter(e=>recordFor().exercise?.[e.id]?.completed).length}/${state.exercises.length} today`;
  $("todo-small").textContent=`${state.todos.filter(t=>recordFor().todo?.[t.id]).length}/${state.todos.length} completed`;
}

function renderTodo(){
  const box=$("todo-list");
  if(!state.todos.length){box.innerHTML=`<div class="empty glass">No tasks yet. Add the discipline items you want to track each day.</div>`;return}
  box.innerHTML=state.todos.slice().sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(t=>{
    const done=recordFor().todo?.[t.id]===true;
    return `<div class="task-card glass ${done?"done":""}" ${popAttr(t.id)}>
      <button class="task-check" data-todo-toggle="${t.id}">${done?"✓":""}</button>
      <div><div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(t.time||"")} · ${t.type==="avoid"?"Avoid":"Task"} · ${t.required!==false?"Required":"Optional"}</div></div>
      <div class="task-actions"><button class="icon-btn" data-todo-edit="${t.id}">✎</button><button class="icon-btn" data-todo-delete="${t.id}">×</button></div>
    </div>`;
  }).join("");
}

function renderExercises(){
  cancelExerciseAnimations();
  const box=$("exercise-list");
  if(!state.exercises.length){box.innerHTML=`<div class="empty glass">No exercises configured. Use Exercise settings to add one.</div>`;return}
  let activeId=getActiveExerciseId();
  if(activeId){
    const activeEx=state.exercises.find(x=>x.id===activeId);
    const activeRecord=recordFor().exercise?.[activeId];
    const activeRun=state.exerciseRuns[activeId] || (activeEx && !activeRecord?.completed ? loadPersistedExerciseRun(activeId,activeEx) : null);
    if(activeRun && !state.exerciseRuns[activeId]) state.exerciseRuns[activeId]=activeRun;
    if(!activeEx || activeRecord?.completed || !activeRun || activeRun.remaining<=0){
      clearPersistedExerciseRun(activeId);
      setActiveExerciseId(null);
      delete state.exerciseRuns[activeId];
      activeId=null;
    }
  }
  box.innerHTML=state.exercises.slice().sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(e=>{
    const run=recordFor().exercise?.[e.id]||{};
    const mins=Math.max(1,Number(e.duration||1));
    const persisted=state.user && !run.completed ? loadPersistedExerciseRun(e.id,e) : null;
    if(persisted && !state.exerciseRuns[e.id]) state.exerciseRuns[e.id]=persisted;
    const active=e.id===activeId && !run.completed;
    const remaining=state.exerciseRuns[e.id]?.remaining ?? mins*60;
    const anotherActive=!!activeId && activeId!==e.id;
    const buttonLabel=run.completed?'✓ Completed':active?'Running':'Start';
    return `<div class="exercise-card glass ${active?'exercise-active':''} ${run.completed?'exercise-done':''}">
      <div class="exercise-head"><div><h3>${esc(e.name)}</h3><div class="task-meta">${esc(e.time||'')} · ${mins} minutes</div></div><button class="icon-btn" data-ex-edit="${e.id}" ${active||anotherActive?'disabled':''}>✎</button></div>
      <div class="exercise-canvas-wrap"><canvas id="exercise-canvas-${e.id}" class="exercise-canvas" aria-label="Animated ${esc(e.name)} demonstration"></canvas><div class="canvas-badge">${active?'● LIVE':run.completed?'✓ DONE':'READY'}</div></div>
      <div class="exercise-controls"><button class="primary-btn" data-ex-start="${e.id}" ${run.completed||anotherActive||active?'disabled':''}>${buttonLabel}</button><span class="timer ${active?'timer-live':''}" id="timer-${e.id}">${formatTimer(remaining)}</span>${active?`<span class="status-pill exercise-running">Exercise in progress</span>`:''}${run.completed?`<span class="status-pill">Completed ${indiaTimeString(run.completedAt)}</span>`:''}${anotherActive?`<span class="status-pill">Another exercise is running</span>`:''}</div>
    </div>`;
  }).join("");
  const active=activeId && state.exerciseRuns[activeId];
  if(active && !recordFor().exercise?.[activeId]?.completed) startExerciseCanvas(activeId);
}
function formatTimer(sec){sec=Math.max(0,Math.floor(sec));return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`}

async function startExercise(id){
  const ex=state.exercises.find(x=>x.id===id); if(!ex)return;
  if(recordFor().exercise?.[id]?.completed)return;
  const activeId=getActiveExerciseId();
  if(activeId && activeId!==id){showToast("Finish the current exercise before starting another.");return;}
  if(activeId===id && state.exerciseRuns[id])return;

  let run=state.exerciseRuns[id] || loadPersistedExerciseRun(id,ex);
  const duration=Math.max(1,Number(ex.duration||1))*60;
  const startedAt=run?.startedAt || Date.now();
  const elapsed=Math.floor((Date.now()-startedAt)/1000);
  const remaining=Math.max(0,duration-elapsed);
  run={startedAt,duration,remaining};
  state.exerciseRuns[id]=run;
  setActiveExerciseId(id);
  persistExerciseRun(id,run);
  renderExercises();

  const tick=async()=>{
    const current=state.exerciseRuns[id];
    if(!current)return;
    const left=Math.max(0,current.duration-Math.floor((Date.now()-current.startedAt)/1000));
    current.remaining=left;
    const el=$(`timer-${id}`); if(el)el.textContent=formatTimer(left);
    if(left<=0){
      clearInterval(current.interval); current.interval=null;
      clearPersistedExerciseRun(id);
      const completedAt=new Date().toISOString();
      const dayDone=await setExerciseRecord(id,{completed:true,startedAt:new Date(current.startedAt).toISOString(),completedAt,actualDuration:Number(ex.duration||1)*60});
      delete state.exerciseRuns[id];
      setActiveExerciseId(null);
      renderAll();
      if(!dayDone) showToast(`${ex.name} completed`,"success");
    }
  };

  if(remaining<=0){await tick();return;}
  state.exerciseRuns[id].interval=setInterval(tick,1000);
  startExerciseCanvas(id);
  await tick();
}

async function setExerciseRecord(id,value){
  const key=todayKey(), r=recordFor(key);
  r.exercise={...(r.exercise||{}),[id]:value}; state.records[key]=r;
  if(value?.completed) clearPersistedExerciseRun(id);
  return saveRecord(key,r);
}
// Returns true when this save just completed today's whole sadhana (and shows the celebration once per day).
async function saveRecord(key,r){
  if(!state.user)return false;
  const wasComplete=r.status==="complete";
  const complete=allRequiredComplete(key);
  const next={...r,status:complete?"complete":"pending",updatedAt:serverTimestamp()};
  state.records[key]={...r,status:complete?"complete":"pending"};
  let dayDone=false;
  if(key===todayKey() && complete && !wasComplete){
    const flag=`hanuman-diksha:celebrated:${state.user.uid}:${key}`;
    let seen=false; try{ seen=!!localStorage.getItem(flag); localStorage.setItem(flag,"1"); }catch{}
    if(!seen){
      dayDone=true;
      const s=streak();
      celebrate(`Day ${currentDay()||1} complete!`,`Every activity for today is done. Streak: ${s} day${s===1?"":"s"}. Jai Shri Ram.`);
    }
  }
  await setDoc(doc(db,"users",state.user.uid,"dailyRecords",key),next,{merge:true});
  return dayDone;
}

function renderJai(){
  const v=$("jai-video"), empty=$("jai-empty");
  if(state.jai.url){v.src=state.jai.url;v.classList.remove("hidden");empty.classList.add("hidden");$("jai-file-name").textContent=state.jai.fileName||"Video uploaded";}
  else{v.removeAttribute("src");v.load();v.classList.add("hidden");empty.classList.remove("hidden");}
  const done=jaiComplete(); $("jai-status").textContent=done?"Completed today":"Not completed today";
  $("jai-start-btn").disabled=!state.jai.url || done;
}

function renderJaiHistory(){
  const body=$("jai-history-body"), empty=$("jai-history-empty");
  if(!body) return;
  const rows=Object.entries(state.records)
    .filter(([key,r])=>r?.jai===true)
    .map(([key,r])=>({key,completedAt:r.jaiCompletedAt||r.updatedAt}))
    .filter(x=>x.completedAt)
    .sort((a,b)=>b.key.localeCompare(a.key));
  body.innerHTML=rows.map((row,i)=>`<tr><td>${i+1}</td><td>${esc(indiaDateString(row.key))}</td><td>${esc(indiaTimeString(row.completedAt))}</td></tr>`).join("");
  empty?.classList.toggle("hidden",rows.length>0);
}

function sitaDailyCount(dateKey=todayKey()){
  return Math.min(108, Math.max(0, Number(recordFor(dateKey).sitaCount||0)));
}

function renderSita(){
  const count=sitaDailyCount();
  const total=108;
  const pct=count/total;
  const circumference=2*Math.PI*108;
  const ring=$("sita-progress-ring");
  if(ring){
    ring.style.strokeDasharray=circumference;
    ring.style.strokeDashoffset=circumference*(1-pct);
  }
  $("sita-count").textContent=count;
  $("sita-cycle").textContent=count;
  $("sita-cycle-progress").textContent=`${count} / ${total}`;
  document.querySelector(".sita-progress")?.classList.toggle("complete",count>=total);
  const btn=$("sita-add-btn");
  if(btn){
    btn.disabled=count>=total;
    const label=count>=total ? "Completed for today ✓" : "SITA RAM";
    if(btn.dataset.label!==label){ btn.textContent=label; btn.dataset.label=label; }  // don't wipe the tap ripple
  }
}
function sitaTapFx(e){
  const btn=$("sita-add-btn"), r=btn.getBoundingClientRect();
  const fromPointer=e && e.detail>0;
  const rip=document.createElement("span"); rip.className="rip";
  rip.style.left=((fromPointer?e.clientX:r.left+r.width/2)-r.left)+"px";
  rip.style.top=((fromPointer?e.clientY:r.top+r.height/2)-r.top)+"px";
  btn.appendChild(rip); setTimeout(()=>rip.remove(),650);
  const plus=document.createElement("span"); plus.className="float-plus"; plus.textContent="+1";
  document.querySelector(".sita-card").appendChild(plus); setTimeout(()=>plus.remove(),850);
  const c=$("sita-count"); c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump");
}
function renderSitaHistory(){
  const body=$("sita-history-body"), empty=$("sita-history-empty"), foot=$("sita-history-foot");
  if(!body) return;
  const rows=Object.entries(state.records)
    .filter(([key,r])=>Number(r?.sitaCount||0)>=108)
    .map(([key,r])=>({key,completedAt:r.sitaCompletedAt||r.sitaUpdatedAt||r.updatedAt}))
    .filter(x=>x.completedAt)
    .sort((a,b)=>b.key.localeCompare(a.key));
  body.innerHTML=rows.map((row,i)=>`<tr><td>${i+1}</td><td>${esc(indiaDateString(row.key))}</td><td>${esc(indiaTimeString(row.completedAt))}</td></tr>`).join("");
  if(foot) foot.innerHTML=`<tr><td colspan="2">Total completed days</td><td>${rows.length}</td></tr>`;
  empty?.classList.toggle("hidden",rows.length>0);
}

function nextTimeCountdown(time){
  if(!time)return "--:--:--";
  const [h,m]=time.split(":").map(Number);
  const now=new Date();
  const parts=new Intl.DateTimeFormat("en-CA", {timeZone:INDIA_TZ, hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false}).formatToParts(now);
  const get=k=>Number(parts.find(x=>x.type===k)?.value||0);
  let secondsUntil=(h-get("hour"))*3600+(m-get("minute"))*60-get("second");
  if(secondsUntil<=0)secondsUntil+=86400;
  return formatHMS(secondsUntil*1000);
}
function formatHMS(ms){let s=Math.floor(ms/1000),h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function updateCountdowns(){ $("jai-countdown").textContent=nextTimeCountdown(state.settings.jaiTime); $("sita-countdown").textContent=nextTimeCountdown(state.settings.sitaTime); }
setInterval(updateCountdowns,1000);
let lastRenderedIndiaDate=todayKey();
setInterval(()=>{
  const current=todayKey();
  if(current!==lastRenderedIndiaDate){
    lastRenderedIndiaDate=current;
    renderAll();
  }
},1000);

async function completeJai(){
  const v=$("jai-video"); if(!v.src)return;
  $("jai-start-btn").disabled=true; $("jai-status").textContent="Playing…";
  try{await v.play()}catch(e){$("jai-start-btn").disabled=false;showToast("Tap Start again to allow video playback.");return}
}
$("jai-video").addEventListener("pause",async()=>{
  const v=$("jai-video");
  if(v.ended || !v.src || !state.user) return;
  try { await v.play(); } catch {}
});
$("jai-video").addEventListener("seeking",()=>{
  const v=$("jai-video");
  if(v.currentTime > (v.__lastAllowedTime||0) + 1.5) v.currentTime = v.__lastAllowedTime||0;
});
$("jai-video").addEventListener("timeupdate",()=>{
  const v=$("jai-video");
  v.__lastAllowedTime = v.currentTime;
});
$("jai-video").addEventListener("ended",async()=>{
  const key=todayKey(),r=recordFor(key);r.jai=true;r.jaiCompletedAt=new Date().toISOString();state.records[key]=r;
  const dayDone=await saveRecord(key,r); renderAll();
  if(!dayDone) celebrate("JAI SRI RAM complete","Today's video is done. Keep going with the rest of your sadhana.");
});

async function toggleTodo(id){
  const key=todayKey(),r=recordFor(key);r.todo={...(r.todo||{}),[id]:!(r.todo?.[id]===true)};state.records[key]=r;
  if(r.todo[id]) popFx[id]=Date.now();
  renderTodo(); renderDashboard();   // instant feedback; Firestore sync follows
  await saveRecord(key,r);renderAll();
}
function renderCalendar(){
  const d=state.calendarMonth, y=d.getFullYear(),m=d.getMonth();
  $("cal-title").textContent=d.toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const first=new Date(y,m,1), start=first.getDay(), days=new Date(y,m+1,0).getDate();
  const cells=[];
  for(let i=0;i<start;i++)cells.push(`<div class="calendar-day out"></div>`);
  for(let day=1;day<=days;day++){
    const date=new Date(y,m,day), key=localDateKey(date), status=dayStatus(key), n=dayIndex(key);
    cells.push(`<div class="calendar-day ${status}" title="${status}"><span class="num">${day}</span>${isInJourney(key)?`<span class="dlabel">Day ${n}</span>`:""}</div>`);
  }
  $("calendar-grid").innerHTML=cells.join("");
}

function currency(n){
  return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(n||0));
}
function renderMoney(){
  const totalExp=state.expenses.reduce((s,x)=>s+Number(x.amount||0),0);
  const totalBorrow=state.borrowings.reduce((s,x)=>s+Number(x.amount||0),0);
  const outstanding=state.borrowings.filter(x=>x.status!=="settled").reduce((s,x)=>s+Number(x.amount||0),0);
  $("total-expenses").textContent=currency(totalExp);
  $("total-borrowed").textContent=currency(totalBorrow);
  $("outstanding-borrowed").textContent=currency(outstanding);
  document.querySelectorAll(".money-tab").forEach(b=>b.classList.toggle("active",b.dataset.moneyTab===state.moneyTab));
  const list=$("money-list");
  const data=state.moneyTab==="expenses"?state.expenses:state.borrowings;
  if(!data.length){
    list.innerHTML=`<div class="empty glass">No ${state.moneyTab} recorded yet.</div>`;
    return;
  }
  list.innerHTML=data.slice().sort((a,b)=>String(b.date||"").localeCompare(String(a.date||""))).map(x=>{
    if(state.moneyTab==="expenses"){
      return `<div class="money-card glass">
        <div><h3>${esc(x.category)}</h3><div class="meta">${esc(x.date||"")} · ${esc(x.method||"")} ${x.note?`· ${esc(x.note)}`:""}</div></div>
        <div class="money-actions"><span class="amount">${currency(x.amount)}</span><button class="icon-btn" data-expense-edit="${x.id}">✎</button><button class="icon-btn" data-expense-delete="${x.id}">×</button></div>
      </div>`;
    }
    return `<div class="money-card glass">
      <div><h3>${esc(x.from)}</h3><div class="meta">${esc(x.date||"")} ${x.note?`· ${esc(x.note)}`:""}</div></div>
      <div class="money-actions"><span class="badge">${x.status==="settled"?"Settled":"Outstanding"}</span><span class="amount">${currency(x.amount)}</span><button class="icon-btn" data-borrow-edit="${x.id}">✎</button><button class="icon-btn" data-borrow-delete="${x.id}">×</button></div>
    </div>`;
  }).join("");
}
async function saveExpense(e){
  e.preventDefault();
  const id=$("expense-id").value;
  const data={amount:Number($("expense-amount").value),category:$("expense-category").value.trim(),date:$("expense-date").value,method:$("expense-method").value,note:$("expense-note").value.trim(),updatedAt:serverTimestamp()};
  if(id) await updateDoc(doc(db,"users",state.user.uid,"expenses",id),data);
  else await addDoc(collection(db,"users",state.user.uid,"expenses"),{...data,createdAt:serverTimestamp()});
  closeModal("expense-modal");e.target.reset();showToast("Expense saved.");
}
async function saveBorrowing(e){
  e.preventDefault();
  const id=$("borrowing-id").value;
  const data={amount:Number($("borrowing-amount").value),from:$("borrowing-from").value.trim(),date:$("borrowing-date").value,status:$("borrowing-status").value,note:$("borrowing-note").value.trim(),updatedAt:serverTimestamp()};
  if(id) await updateDoc(doc(db,"users",state.user.uid,"borrowings",id),data);
  else await addDoc(collection(db,"users",state.user.uid,"borrowings"),{...data,createdAt:serverTimestamp()});
  closeModal("borrowing-modal");e.target.reset();showToast("Borrowing saved.");
}
function editExpense(id){
  const x=state.expenses.find(v=>v.id===id);if(!x)return;
  $("expense-id").value=id;$("expense-amount").value=x.amount;$("expense-category").value=x.category;$("expense-date").value=x.date||todayKey();$("expense-method").value=x.method||"Cash";$("expense-note").value=x.note||"";openModal("expense-modal");
}
function editBorrowing(id){
  const x=state.borrowings.find(v=>v.id===id);if(!x)return;
  $("borrowing-id").value=id;$("borrowing-amount").value=x.amount;$("borrowing-from").value=x.from;$("borrowing-date").value=x.date||todayKey();$("borrowing-status").value=x.status||"outstanding";$("borrowing-note").value=x.note||"";openModal("borrowing-modal");
}

function renderSettings(){
  $("setting-start").value=state.settings.startDate||"";
  $("setting-days").value=state.settings.days||108;
  $("setting-reset").checked=state.settings.resetOnMiss!==false;
  $("setting-jai-time").value=state.settings.jaiTime||"06:00";
  $("setting-sita-time").value=state.settings.sitaTime||"18:00";
  $("setting-cloudinary-cloud").value=state.settings.cloudinaryCloudName||"";
  $("setting-cloudinary-preset").value=state.settings.cloudinaryUploadPreset||"";
  $("jai-file-name").textContent=state.jai.fileName||"No video uploaded";
}

async function loadUser(){
  const ref=doc(db,"users",state.user.uid,"meta","settings");
  const snap=await getDoc(ref);
  if(snap.exists())state.settings={...state.settings,...snap.data()};
  else await setDoc(ref,{...state.settings,createdAt:serverTimestamp()});
  const jr=await getDoc(doc(db,"users",state.user.uid,"meta","jai"));
  if(jr.exists())state.jai={...state.jai,...jr.data()};
  const tq=query(collection(db,"users",state.user.uid,"todos"),orderBy("time"));
  state.unsub.push(onSnapshot(tq,s=>{state.todos=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  const eq=query(collection(db,"users",state.user.uid,"exercises"),orderBy("time"));
  state.unsub.push(onSnapshot(eq,s=>{state.exercises=s.docs.map(d=>({id:d.id,...d.data()}));renderAll()}));
  const rq=query(collection(db,"users",state.user.uid,"dailyRecords"));
  state.unsub.push(onSnapshot(rq,async s=>{
    state.records={};s.docs.forEach(d=>state.records[d.id]=d.data());
    await applyAutomaticResetIfNeeded();
    renderAll();
  }));
  const xq=query(collection(db,"users",state.user.uid,"expenses"),orderBy("date","desc"));
  state.unsub.push(onSnapshot(xq,s=>{state.expenses=s.docs.map(d=>({id:d.id,...d.data()}));renderMoney()}));
  const bq=query(collection(db,"users",state.user.uid,"borrowings"),orderBy("date","desc"));
  state.unsub.push(onSnapshot(bq,s=>{state.borrowings=s.docs.map(d=>({id:d.id,...d.data()}));renderMoney()}));
  renderAll();
}

async function saveSettings(){
  const oldStart=state.settings.startDate;
  state.settings={
    ...state.settings,
    startDate:$("setting-start").value,
    days:Math.max(1,Number($("setting-days").value||108)),
    resetOnMiss:$("setting-reset").checked,
    jaiTime:$("setting-jai-time").value,
    sitaTime:$("setting-sita-time").value,
    cloudinaryCloudName:$("setting-cloudinary-cloud").value.trim(),
    cloudinaryUploadPreset:$("setting-cloudinary-preset").value.trim()
  };
  await setDoc(doc(db,"users",state.user.uid,"meta","settings"),state.settings,{merge:true});
  renderAll();showToast(oldStart!==state.settings.startDate?"Journey settings saved.":"Settings saved.");
}


// Removes ONLY the SITA RAM + JAI video history fields from every daily record (in Firestore),
// so to-dos, exercises, calendar status and streak history stay intact.
async function clearHistory(){
  if(!state.user) return;
  const targets=Object.entries(state.records).filter(([key,r])=>
    r && (r.jai!==undefined || r.jaiCompletedAt!==undefined || r.sitaCount!==undefined ||
          r.sitaCompletedAt!==undefined || r.sitaUpdatedAt!==undefined));
  if(!targets.length){ showToast("No SITA RAM or video history to clear."); return; }
  if(!await confirmDialog("Clear history?",`Delete SITA RAM and JAI SRI RAM video history for ${targets.length} day(s) from the database? This cannot be undone.`,{okText:"Continue",danger:true})) return;
  if(!await confirmDialog("Are you sure?","All SITA RAM and video history will be permanently deleted.",{okText:"Delete forever",danger:true})) return;

  const btn=$("clear-history-btn"); btn.disabled=true; btn.textContent="Clearing…";
  // Remember which days were truly complete BEFORE the history fields disappear
  const wasComplete={}; Object.keys(state.records).forEach(k=>{ wasComplete[k]=allRequiredComplete(k); });
  const today=todayKey();
  try{
    // Firestore batches are limited to 500 writes
    for(let i=0;i<targets.length;i+=400){
      const batch=writeBatch(db);
      targets.slice(i,i+400).forEach(([key])=>{
        const upd={
          jai:deleteField(), jaiCompletedAt:deleteField(),
          sitaCount:deleteField(), sitaCompletedAt:deleteField(), sitaUpdatedAt:deleteField()
        };
        if(key!==today && wasComplete[key]) upd.historyCleared=true;   // keep the day counted as complete
        batch.update(doc(db,"users",state.user.uid,"dailyRecords",key),upd);
      });
      await batch.commit();
    }
    // Local state is refreshed by the live dailyRecords listener; update immediately too.
    targets.forEach(([key,r])=>{
      const n={...r}; ["jai","jaiCompletedAt","sitaCount","sitaCompletedAt","sitaUpdatedAt"].forEach(k=>delete n[k]);
      if(key!==today && wasComplete[key]) n.historyCleared=true;
      state.records[key]=n;
    });
    renderAll();
    showState({tone:"success",title:"History cleared",message:"SITA RAM and video history were deleted. Your calendar and streak are unchanged."});
  }catch(err){
    console.error(err);
    showState({tone:"error",title:"Couldn't clear history",message:err.message||"Unknown error. Check your connection and try again.",okText:"Close"});
  }finally{
    btn.disabled=false; btn.textContent="Clear SITA RAM & video history";
  }
}

async function uploadToCloudinary(file, folder){
  const cloud=state.settings.cloudinaryCloudName, preset=state.settings.cloudinaryUploadPreset;
  if(!cloud || !preset) throw new Error("Configure Cloudinary cloud name and unsigned upload preset in Settings first.");
  const resourceType=file.type.startsWith("video/")?"video":"image";
  const form=new FormData();
  form.append("file",file);
  form.append("upload_preset",preset);
  form.append("folder",folder);
  const res=await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/${resourceType}/upload`,{method:"POST",body:form});
  const data=await res.json();
  if(!res.ok || !data.secure_url) throw new Error(data.error?.message||"Cloudinary upload failed.");
  return {url:data.secure_url,publicId:data.public_id,resourceType};
}

async function uploadJai(){
  const f=$("jai-upload").files[0]; if(!f)return;
  if(f.size>500*1024*1024)return showToast("Video is larger than 500 MB.");
  const status=$("jai-file-name");
  try{
    showToast("Uploading JAI SRI RAM video to Cloudinary…","info");
    status.classList.add("uploading"); status.textContent=`Uploading ${f.name}…`;
    const media=await uploadToCloudinary(f,`munnar_trip/${state.user.uid}/jai`);
    state.jai={url:media.url,fileName:f.name,publicId:media.publicId,resourceType:media.resourceType,uploadedAt:new Date().toISOString()};
    await setDoc(doc(db,"users",state.user.uid,"meta","jai"),state.jai,{merge:true});
    status.classList.remove("uploading");
    renderAll();
    showToast("Video uploaded. Firebase stored the public URL only.","success");
  }catch(err){ status.classList.remove("uploading"); renderSettings(); showToast(err.message,"error"); }
}

async function saveTodo(e){
  e.preventDefault();const id=$("todo-id").value;
  const data={title:$("todo-title").value.trim(),time:$("todo-time").value,type:$("todo-type").value,required:$("todo-required").checked,updatedAt:serverTimestamp()};
  if(id)await updateDoc(doc(db,"users",state.user.uid,"todos",id),data);else await addDoc(collection(db,"users",state.user.uid,"todos"),{...data,createdAt:serverTimestamp()});
  closeModal("todo-modal");e.target.reset();$("todo-required").checked=true;showToast("Task saved.");
}
async function saveExercise(e){
  e.preventDefault();
  const id=$("exercise-id").value;
  const data={name:$("exercise-name").value.trim(),time:$("exercise-time").value,duration:Number($("exercise-duration").value),updatedAt:serverTimestamp()};
  if(id) await updateDoc(doc(db,"users",state.user.uid,"exercises",id),data);
  else await addDoc(collection(db,"users",state.user.uid,"exercises"),{...data,createdAt:serverTimestamp()});
  closeModal("exercise-modal"); e.target.reset(); showToast("Exercise saved.");
}

function openModal(id){$(id).classList.remove("hidden")}
function closeModal(id){$(id).classList.add("hidden")}
function editTodo(id){const t=state.todos.find(x=>x.id===id);if(!t)return;$("todo-id").value=id;$("todo-title").value=t.title;$("todo-time").value=t.time||"";$("todo-type").value=t.type||"task";$("todo-required").checked=t.required!==false;openModal("todo-modal")}
function editExercise(id){const e=state.exercises.find(x=>x.id===id);if(!e)return;$("exercise-id").value=id;$("exercise-name").value=e.name;$("exercise-time").value=e.time||"";$("exercise-duration").value=e.duration||10;openModal("exercise-modal")}

function icsDate(date,time){
  const [h,m]=time.split(":").map(Number); const d=new Date(date); d.setHours(h,m,0,0);
  return d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z/,"Z");
}
function escapeICS(s){return String(s).replace(/[\\;,]/g,m=>"\\"+m).replace(/\n/g,"\\n")}
function buildICS(){
  if(!journeyStart())return "";
  const total=Number(state.settings.days||108), lines=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Hanuman Disha//108 Day Sadhana//EN"];
  for(let i=0;i<total;i++){
    const d=new Date(journeyStart().getTime()+i*86400000), date=localDateKey(d);
    const tasks=[...state.todos.map(t=>({title:t.title,time:t.time})),...state.exercises.map(e=>({title:`Exercise: ${e.name}`,time:e.time})),{title:"JAI SRI RAM Video",time:state.settings.jaiTime}];
    tasks.forEach((x,j)=>{
      if(!x.time)return;
      const start=icsDate(date,x.time), uid=`hanuman-${date}-${j}-${Math.random().toString(36).slice(2)}@hanumandisha`;
      lines.push("BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${icsDate(date,"00:00")}`,`DTSTART:${start}`,`DTEND:${start}`,`SUMMARY:${escapeICS(x.title)} - Day ${i+1}`,"BEGIN:VALARM","TRIGGER:-PT10M","ACTION:DISPLAY","DESCRIPTION:Reminder","END:VALARM","END:VEVENT");
    });
  }
  lines.push("END:VCALENDAR");return lines.join("\r\n");
}
function downloadICS(){
  const ics=buildICS();if(!ics)return showToast("Set a journey start date first.");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([ics],{type:"text/calendar"}));a.download="hanuman-disha-108-day-schedule.ics";a.click();URL.revokeObjectURL(a.href);
}
function showCalendarLinks(){
  const box=$("calendar-links");box.classList.toggle("hidden");
  const start=journeyStart(); if(!start){box.innerHTML="<span class='helper'>Set a start date first.</span>";return}
  const items=[["JAI SRI RAM",state.settings.jaiTime],...state.exercises.map(e=>[`Exercise: ${e.name}`,e.time]),...state.todos.map(t=>[t.title,t.time])];
  box.innerHTML=items.filter(x=>x[1]).map(([title,time])=>{
    const [h,m]=time.split(":").map(Number);const d=new Date(start);d.setHours(h,m,0,0);
    const s=d.toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z/,"Z");const e=new Date(d.getTime()+30*60000).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}Z/,"Z");
    const url=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${s}/${e}&details=${encodeURIComponent("Hanuman Disha 108-day sadhana")}&recur=${encodeURIComponent("RRULE:FREQ=DAILY;COUNT="+Number(state.settings.days||108))}`;
    return `<a target="_blank" rel="noopener" href="${url}">Add recurring "${esc(title)}" at ${esc(time)}</a>`;
  }).join("");
}

// ---- Navigation: sidebar (website), bottom nav + "More" sheet (phone app), Android back button via history ----
const PAGES=[...document.querySelectorAll(".page")].map(p=>p.id.replace("page-",""));
const MORE_PAGES=["exercise","calendar","money","settings"];
let currentPage="dashboard";
function openSheet(){ $("more-sheet").classList.remove("hidden","closing"); }
function closeSheet(){
  const s=$("more-sheet"); if(s.classList.contains("hidden")||s.classList.contains("closing")) return;
  s.classList.add("closing"); setTimeout(()=>{ s.classList.add("hidden"); s.classList.remove("closing"); },220);
}
function switchPage(page,{push=true}={}){
  if(!PAGES.includes(page)) page="dashboard";
  closeSheet(); $("sidebar").classList.remove("open");
  if(page===currentPage && $(`page-${page}`).classList.contains("active")) return;
  document.querySelectorAll(".page").forEach(p=>p.classList.remove("active","entering"));
  const el=$(`page-${page}`); el.classList.add("active","entering");
  clearTimeout(switchPage.t); switchPage.t=setTimeout(()=>el.classList.remove("entering"),800);
  document.querySelectorAll("[data-page]").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  document.querySelector("[data-more]")?.classList.toggle("active",MORE_PAGES.includes(page));
  if(push) history.pushState({page},"",`#${page}`);
  currentPage=page;
  window.scrollTo(0,0);
}
window.addEventListener("popstate",e=>{
  document.querySelectorAll(".modal:not(.hidden)").forEach(m=>m.classList.add("hidden"));
  switchPage(e.state?.page||location.hash.slice(1)||"dashboard",{push:false});
});
const startPage=location.hash.slice(1);
if(PAGES.includes(startPage) && startPage!=="dashboard") switchPage(startPage,{push:false});
history.replaceState({page:currentPage},"");

async function confirmSignOut(){
  if(await confirmDialog("Sign out?","You can sign back in anytime with your email and password.",{okText:"Sign out"})){ closeSheet(); await signOut(auth); }
}

$("mobile-menu").onclick=()=>$("sidebar").classList.toggle("open");
document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>switchPage(b.dataset.go));
document.querySelector("[data-more]").onclick=()=>$("more-sheet").classList.contains("hidden")?openSheet():closeSheet();
document.querySelectorAll("[data-sheet-close]").forEach(b=>b.onclick=closeSheet);
$("signout-btn").onclick=confirmSignOut;
document.querySelectorAll("[data-signout]").forEach(b=>b.onclick=confirmSignOut);

function updateOnline(){ $("offline-bar").classList.toggle("hidden",navigator.onLine); }
window.addEventListener("offline",updateOnline);
window.addEventListener("online",()=>{ updateOnline(); showToast("Back online. Syncing your progress.","success"); });
updateOnline();

$("add-todo-btn").onclick=()=>{ $("todo-id").value=""; $("todo-form").reset();$("todo-required").checked=true;openModal("todo-modal");};
$("exercise-settings-btn").onclick=()=>{ $("exercise-form").reset();$("exercise-id").value="";openModal("exercise-modal");};
$("save-settings-btn").onclick=busy(saveSettings);
$("clear-history-btn").onclick=clearHistory;
if(window.HanumanNative){
  $("native-card")?.classList.remove("hidden");
  $("native-test-btn")?.addEventListener("click",async()=>{
    const r=await window.HanumanNative.scheduleAll([{key:"test",time:(()=>{const d=new Date(Date.now()+60000);return String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");})(),title:"Test reminder 🚩",body:"If you see this, reminders work."}]);
    showToast(r.ok?"Test reminder set for the next minute. Lock your phone and wait.":"Could not set reminder: "+(r.reason||"unknown"));
    setTimeout(syncNativeReminders,90000);
  });
  $("native-exact-btn")?.addEventListener("click",()=>window.HanumanNative.openExactAlarmSettings());
}
$("jai-upload").onchange=uploadJai;
$("add-expense-btn").onclick=()=>{ $("expense-form").reset(); $("expense-id").value=""; $("expense-date").value=todayKey(); openModal("expense-modal"); };
$("add-borrowing-btn").onclick=()=>{ $("borrowing-form").reset(); $("borrowing-id").value=""; $("borrowing-date").value=todayKey(); $("borrowing-status").value="outstanding"; openModal("borrowing-modal"); };
$("expense-form").onsubmit=busy(saveExpense);
$("borrowing-form").onsubmit=busy(saveBorrowing);
document.querySelectorAll(".money-tab").forEach(b=>b.onclick=()=>{state.moneyTab=b.dataset.moneyTab;renderMoney()});
$("jai-start-btn").onclick=completeJai;
$("sita-add-btn").onclick=async e=>{
  const key=todayKey();
  const current=sitaDailyCount(key);
  if(current>=108){
    renderSita();
    return;
  }
  const count=current+1;
  const r=recordFor(key);
  r.sitaCount=count;
  r.sitaUpdatedAt=new Date().toISOString();
  if(count===108 && !r.sitaCompletedAt) r.sitaCompletedAt=new Date().toISOString();
  state.records[key]=r;
  sitaTapFx(e);
  renderSita();
  const dayDone=await saveRecord(key,r);
  renderSita();
  renderSitaHistory();
  renderDashboard();
  if(count===108 && !dayDone) celebrate("108 SITA RAM complete","Today's 108 repetitions are done. सीता राम.");
};
$("cal-prev").onclick=()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()-1,1);renderCalendar()};
$("cal-next").onclick=()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+1,1);renderCalendar()};
$("calendar-export-btn").onclick=downloadICS;
$("calendar-links-btn").onclick=showCalendarLinks;
$("exercise-form").onsubmit=busy(saveExercise);$("todo-form").onsubmit=busy(saveTodo);
document.addEventListener("click",async e=>{
  const close=e.target.closest("[data-close]");if(close)closeModal(close.dataset.close);
  const tt=e.target.closest("[data-todo-toggle]");if(tt)await toggleTodo(tt.dataset.todoToggle);
  const te=e.target.closest("[data-todo-edit]");if(te)editTodo(te.dataset.todoEdit);
  const td=e.target.closest("[data-todo-delete]");if(td){if(await confirmDialog("Delete this task?","It will be removed from your daily list.",{okText:"Delete",danger:true})){await deleteDoc(doc(db,"users",state.user.uid,"todos",td.dataset.todoDelete));showToast("Task deleted.");}}
  const ee=e.target.closest("[data-ex-start]");if(ee)startExercise(ee.dataset.exStart);
  const ed=e.target.closest("[data-ex-edit]");if(ed)editExercise(ed.dataset.exEdit);
  const exed=e.target.closest("[data-expense-edit]");if(exed)editExpense(exed.dataset.expenseEdit);
  const exdel=e.target.closest("[data-expense-delete]");if(exdel){if(await confirmDialog("Delete this expense?","This entry will be removed permanently.",{okText:"Delete",danger:true})){await deleteDoc(doc(db,"users",state.user.uid,"expenses",exdel.dataset.expenseDelete));showToast("Expense deleted.");}}
  const bed=e.target.closest("[data-borrow-edit]");if(bed)editBorrowing(bed.dataset.borrowEdit);
  const bdel=e.target.closest("[data-borrow-delete]");if(bdel){if(await confirmDialog("Delete this borrowing?","This entry will be removed permanently.",{okText:"Delete",danger:true})){await deleteDoc(doc(db,"users",state.user.uid,"borrowings",bdel.dataset.borrowDelete));showToast("Borrowing deleted.");}}
});

let authModeRegister=false;
$("auth-toggle").onclick=()=>{
  authModeRegister=!authModeRegister;
  $("auth-submit-label").textContent=authModeRegister?"Create account":"Sign in";
  $("auth-toggle").textContent=authModeRegister?"Already have an account? Sign in":"Create an account";
};
$("auth-form").onsubmit=busy(async e=>{
  const email=$("auth-email").value.trim(),pass=$("auth-password").value;
  try{if(authModeRegister)await createUserWithEmailAndPassword(auth,email,pass);else await signInWithEmailAndPassword(auth,email,pass);}
  catch(err){
    $("auth-form").closest(".auth-card").animate([{transform:"translateX(0)"},{transform:"translateX(-8px)"},{transform:"translateX(8px)"},{transform:"translateX(0)"}],{duration:360});
    showToast(err.message.replace("Firebase: ",""),"error");
  }
});

function hideBoot(){
  const b=$("boot-screen"); if(!b||b.classList.contains("done")) return;
  b.classList.add("done"); setTimeout(()=>b.remove(),600);
}
setTimeout(hideBoot,10000);   // never trap the user on the splash

onAuthStateChanged(auth,async user=>{
  state.unsub.forEach(fn=>fn&&fn());state.unsub=[];
  state.user=user;
  $("auth-screen").classList.toggle("hidden",!!user);$("app-shell").classList.toggle("hidden",!user);
  if(user){
    try{ await loadUser(); }
    catch(err){
      console.error(err); hideBoot();
      if(await showState({tone:"error",title:"Couldn't load your data",message:"Check your internet connection and try again.",okText:"Retry",cancelText:"Close"})) location.reload();
    }
    if("serviceWorker" in navigator && !window.HanumanNative)navigator.serviceWorker.register("./sw.js").catch(()=>{}); /* native app already has local files */
  }
  hideBoot();
});
