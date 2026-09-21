import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, addDoc, deleteDoc, onSnapshot,
  query, orderBy, serverTimestamp, where
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

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
  unsub:[],
  authRegister:false
};

const $ = id => document.getElementById(id);
const todayKey = () => new Date().toISOString().slice(0,10);
const localDateKey = d => {
  const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
};
const esc = s => String(s ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const showToast = msg => { const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(showToast.t); showToast.t=setTimeout(()=>t.classList.remove("show"),3000); };

function journeyStart(){
  return state.settings.startDate ? new Date(state.settings.startDate+"T00:00:00") : null;
}
function dayIndex(dateKey=todayKey()){
  const s=journeyStart(); if(!s) return 0;
  const d=new Date(dateKey+"T00:00:00");
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

function allRequiredComplete(dateKey=todayKey()){
  return requiredTodoComplete(dateKey) && exerciseComplete(dateKey) && jaiComplete(dateKey);
}

function dayStatus(dateKey){
  if(!isInJourney(dateKey)) return "out";
  if(dateKey===todayKey()) return allRequiredComplete(dateKey) ? "complete" : "today";
  const n=dayIndex(dateKey);
  if(n>currentDay() || new Date(dateKey)>new Date()) return "upcoming";
  const r=recordFor(dateKey);
  return allRequiredComplete(dateKey) || r.manual ? "complete" : "missed";
}

let resetCheckRunning = false;
async function applyAutomaticResetIfNeeded(){
  if(!state.user || !state.settings.startDate || !state.settings.resetOnMiss || resetCheckRunning) return;
  resetCheckRunning = true;
  try {
    const start = journeyStart();
    const yesterday = new Date();
    yesterday.setHours(0,0,0,0);
    yesterday.setDate(yesterday.getDate()-1);
    if(yesterday < start) return;

    // Find the most recent missed day from the current journey.
    // A missed day is only finalized after that calendar day has ended.
    let cursor = new Date(yesterday);
    let lastMissed = null;
    for(let i=0; i<Number(state.settings.days||108); i++){
      if(cursor < start) break;
      const key = localDateKey(cursor);
      if(!allRequiredComplete(key) && !recordFor(key).manual) lastMissed = key;
      cursor.setDate(cursor.getDate()-1);
    }

    if(lastMissed){
      const restart = new Date(lastMissed+"T00:00:00");
      restart.setDate(restart.getDate()+1);
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
    if(allRequiredComplete(key) || recordFor(key).manual) s++; else break;
  }
  return s;
}

function renderAll(){
  renderDashboard(); renderTodo(); renderExercises(); renderJai(); renderSita(); renderCalendar(); renderMoney(); renderSettings();
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
  $("complete-day-btn").disabled=!state.settings.startDate;
  $("complete-day-btn").textContent=complete?"Today completed":"Mark today complete";
  const todos=state.todos.map(t=>({label:t.title,done:recordFor().todo?.[t.id]===true,time:t.time}));
  const ex=state.exercises.map(e=>({label:e.name,done:recordFor().exercise?.[e.id]?.completed===true,time:e.time}));
  const items=[...todos,...ex,{label:"JAI SRI RAM video",done:jaiComplete(),time:state.settings.jaiTime}];
  $("today-summary").innerHTML=items.length?items.map(x=>`<div class="summary-item"><div><b>${esc(x.label)}</b><small>${x.time||""}</small></div><span class="check ${x.done?"done":""}">${x.done?"✓":"•"}</span></div>`).join(""):`<div class="empty glass">Add your first daily task in Todo.</div>`;
  $("day-note").textContent=state.settings.resetOnMiss?"A missed required activity will mark the day missed and the next journey starts at Day 1.":"Reset mode is off. Missed days remain recorded without automatic reset.";
  $("jai-next-small").textContent=`Daily ${state.settings.jaiTime||"--:--"}`;
  $("sita-small").textContent=`${state.sita.count||0} repetitions`;
  $("exercise-small").textContent=`${state.exercises.filter(e=>recordFor().exercise?.[e.id]?.completed).length}/${state.exercises.length} today`;
  $("todo-small").textContent=`${state.todos.filter(t=>recordFor().todo?.[t.id]).length}/${state.todos.length} completed`;
}

function renderTodo(){
  const box=$("todo-list");
  if(!state.todos.length){box.innerHTML=`<div class="empty glass">No tasks yet. Add the discipline items you want to track each day.</div>`;return}
  box.innerHTML=state.todos.slice().sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(t=>{
    const done=recordFor().todo?.[t.id]===true;
    return `<div class="task-card glass ${done?"done":""}">
      <button class="task-check" data-todo-toggle="${t.id}">${done?"✓":""}</button>
      <div><div class="task-title">${esc(t.title)}</div><div class="task-meta">${esc(t.time||"")} · ${t.type==="avoid"?"Avoid":"Task"} · ${t.required!==false?"Required":"Optional"}</div></div>
      <div class="task-actions"><button class="icon-btn" data-todo-edit="${t.id}">✎</button><button class="icon-btn" data-todo-delete="${t.id}">×</button></div>
    </div>`;
  }).join("");
}

function renderExercises(){
  const box=$("exercise-list");
  if(!state.exercises.length){box.innerHTML=`<div class="empty glass">No exercises configured. Use Exercise settings to add one.</div>`;return}
  box.innerHTML=state.exercises.slice().sort((a,b)=>(a.time||"").localeCompare(b.time||"")).map(e=>{
    const run=recordFor().exercise?.[e.id]||{};
    const mins=Number(e.duration||1), remaining=state.exerciseRuns[e.id]?.remaining ?? mins*60;
    return `<div class="exercise-card glass">
      <div class="exercise-head"><div><h3>${esc(e.name)}</h3><div class="task-meta">${esc(e.time)} · ${mins} minutes</div></div><button class="icon-btn" data-ex-edit="${e.id}">✎</button></div>
      ${e.videoUrl?`<video class="exercise-video" controls playsinline preload="metadata" src="${esc(e.videoUrl)}"></video>`:""}
      <div class="exercise-controls"><button class="primary-btn" data-ex-start="${e.id}">${run.completed?"Completed":"Start"}</button><span class="timer" id="timer-${e.id}">${formatTimer(remaining)}</span>${run.completed?`<span class="status-pill">Completed ${new Date(run.completedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>`:""}</div>
    </div>`;
  }).join("");
  Object.entries(state.exerciseRuns).forEach(([id,v])=>{const el=$(`timer-${id}`);if(el)el.textContent=formatTimer(v.remaining);});
}
function formatTimer(sec){sec=Math.max(0,Math.floor(sec));return `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(sec%60).padStart(2,"0")}`}

async function startExercise(id){
  const ex=state.exercises.find(x=>x.id===id); if(!ex)return;
  if(recordFor().exercise?.[id]?.completed){return}
  if(state.exerciseRuns[id]?.interval)return;
  let remaining=Number(ex.duration||1)*60;
  state.exerciseRuns[id]={remaining};
  renderExercises();
  state.exerciseRuns[id].interval=setInterval(async()=>{
    remaining--; state.exerciseRuns[id].remaining=remaining;
    const el=$(`timer-${id}`); if(el)el.textContent=formatTimer(remaining);
    if(remaining<=0){
      clearInterval(state.exerciseRuns[id].interval);
      await setExerciseRecord(id,{completed:true,startedAt:state.exerciseRuns[id].startedAt||new Date().toISOString(),completedAt:new Date().toISOString(),actualDuration:Number(ex.duration)*60});
      state.exerciseRuns[id].remaining=0; renderAll(); showToast(`${ex.name} completed`);
    }
  },1000);
  state.exerciseRuns[id].startedAt=new Date().toISOString();
}

async function setExerciseRecord(id,value){
  const key=todayKey(), r=recordFor(key);
  r.exercise={...(r.exercise||{}),[id]:value}; state.records[key]=r;
  await saveRecord(key,r);
}
async function saveRecord(key,r){
  if(!state.user)return;
  await setDoc(doc(db,"users",state.user.uid,"dailyRecords",key),{...r,updatedAt:serverTimestamp()},{merge:true});
}

function renderJai(){
  const v=$("jai-video"), empty=$("jai-empty");
  if(state.jai.url){v.src=state.jai.url;v.classList.remove("hidden");empty.classList.add("hidden");$("jai-file-name").textContent=state.jai.fileName||"Video uploaded";}
  else{v.removeAttribute("src");v.load();v.classList.add("hidden");empty.classList.remove("hidden");}
  const done=jaiComplete(); $("jai-status").textContent=done?"Completed today":"Not completed today";
  $("jai-start-btn").disabled=!state.jai.url || done;
}
function renderSita(){
  const count=Number(state.sita.count||0); $("sita-count").textContent=count; $("sita-cycle").textContent=Math.floor(count/108)+1; $("sita-cycle-progress").textContent=`${count%108} / 108`;
}
function nextTimeCountdown(time){
  if(!time)return "--:--:--";
  const [h,m]=time.split(":").map(Number), now=new Date(), target=new Date(now); target.setHours(h,m,0,0);
  if(target<=now)target.setDate(target.getDate()+1);
  return formatHMS(Math.max(0,target-now));
}
function formatHMS(ms){let s=Math.floor(ms/1000),h=Math.floor(s/3600);s%=3600;let m=Math.floor(s/60);s%=60;return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`}
function updateCountdowns(){ $("jai-countdown").textContent=nextTimeCountdown(state.settings.jaiTime); $("sita-countdown").textContent=nextTimeCountdown(state.settings.sitaTime); }
setInterval(updateCountdowns,1000);

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
  await saveRecord(key,r); renderAll(); showToast("JAI SRI RAM video completed");
});

async function toggleTodo(id){
  const key=todayKey(),r=recordFor(key);r.todo={...(r.todo||{}),[id]:!(r.todo?.[id]===true)};state.records[key]=r;
  await saveRecord(key,r);renderAll();
}
async function manualCompleteDay(){
  if(!state.settings.startDate)return showToast("Set a start date first.");
  if(!allRequiredComplete())return showToast("Complete all required items before marking the day done.");
  const key=todayKey(),r=recordFor(key);r.manual=true;r.status="complete";state.records[key]=r;await saveRecord(key,r);renderAll();showToast("Today marked complete");
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
  const sr=await getDoc(doc(db,"users",state.user.uid,"meta","sita"));
  if(sr.exists())state.sita={...state.sita,...sr.data()};
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
  try{
    showToast("Uploading JAI SRI RAM video to Cloudinary…");
    const media=await uploadToCloudinary(f,`munnar_trip/${state.user.uid}/jai`);
    state.jai={url:media.url,fileName:f.name,publicId:media.publicId,resourceType:media.resourceType,uploadedAt:new Date().toISOString()};
    await setDoc(doc(db,"users",state.user.uid,"meta","jai"),state.jai,{merge:true});
    renderAll();
    showToast("Video uploaded. Firebase stored the public URL only.");
  }catch(err){showToast(err.message)}
}

async function saveTodo(e){
  e.preventDefault();const id=$("todo-id").value;
  const data={title:$("todo-title").value.trim(),time:$("todo-time").value,type:$("todo-type").value,required:$("todo-required").checked,updatedAt:serverTimestamp()};
  if(id)await updateDoc(doc(db,"users",state.user.uid,"todos",id),data);else await addDoc(collection(db,"users",state.user.uid,"todos"),{...data,createdAt:serverTimestamp()});
  closeModal("todo-modal");e.target.reset();$("todo-required").checked=true;showToast("Task saved.");
}
async function saveExercise(e){
  e.preventDefault();const id=$("exercise-id").value,f=$("exercise-video").files[0];
  const data={name:$("exercise-name").value.trim(),time:$("exercise-time").value,duration:Number($("exercise-duration").value),updatedAt:serverTimestamp()};
  if(f){
    if(f.size>500*1024*1024)return showToast("Video is larger than 500 MB.");
    try{
      showToast("Uploading exercise video to Cloudinary…");
      const media=await uploadToCloudinary(f,`munnar_trip/${state.user.uid}/exercise`);
      data.videoUrl=media.url;data.videoName=f.name;data.videoPublicId=media.publicId;
    }catch(err){showToast(err.message);return}
  }else if(id){const old=state.exercises.find(x=>x.id===id);if(old?.videoUrl)data.videoUrl=old.videoUrl;if(old?.videoName)data.videoName=old.videoName}
  if(id)await updateDoc(doc(db,"users",state.user.uid,"exercises",id),data);else await addDoc(collection(db,"users",state.user.uid,"exercises"),{...data,createdAt:serverTimestamp()});
  closeModal("exercise-modal");e.target.reset();showToast("Exercise saved.");
}

function openModal(id){$(id).classList.remove("hidden")}
function closeModal(id){$(id).classList.add("hidden")}
function editTodo(id){const t=state.todos.find(x=>x.id===id);if(!t)return;$("todo-id").value=id;$("todo-title").value=t.title;$("todo-time").value=t.time||"";$("todo-type").value=t.type||"task";$("todo-required").checked=t.required!==false;openModal("todo-modal")}
function editExercise(id){const e=state.exercises.find(x=>x.id===id);if(!e)return;$("exercise-id").value=id;$("exercise-name").value=e.name;$("exercise-time").value=e.time||"";$("exercise-duration").value=e.duration||10;$("exercise-video-status").textContent=e.videoName||"Optional video (existing video will remain if no replacement is selected)";openModal("exercise-modal")}

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

function switchPage(page){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id===`page-${page}`));
  document.querySelectorAll(".nav-item").forEach(n=>n.classList.toggle("active",n.dataset.page===page));
  $("sidebar").classList.remove("open");
}

$("mobile-menu").onclick=()=>$("sidebar").classList.toggle("open");
document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>switchPage(b.dataset.page));
document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>switchPage(b.dataset.go));
$("signout-btn").onclick=()=>signOut(auth);
$("complete-day-btn").onclick=manualCompleteDay;
$("add-todo-btn").onclick=()=>{ $("todo-id").value=""; $("todo-form").reset();$("todo-required").checked=true;openModal("todo-modal");};
$("exercise-settings-btn").onclick=()=>{ $("exercise-form").reset();$("exercise-id").value="";$("exercise-video-status").textContent="Optional video";openModal("exercise-modal");};
$("save-settings-btn").onclick=saveSettings;
$("jai-upload").onchange=uploadJai;
$("add-expense-btn").onclick=()=>{ $("expense-form").reset(); $("expense-id").value=""; $("expense-date").value=todayKey(); openModal("expense-modal"); };
$("add-borrowing-btn").onclick=()=>{ $("borrowing-form").reset(); $("borrowing-id").value=""; $("borrowing-date").value=todayKey(); $("borrowing-status").value="outstanding"; openModal("borrowing-modal"); };
$("expense-form").onsubmit=saveExpense;
$("borrowing-form").onsubmit=saveBorrowing;
document.querySelectorAll(".money-tab").forEach(b=>b.onclick=()=>{state.moneyTab=b.dataset.moneyTab;renderMoney()});
$("jai-start-btn").onclick=completeJai;
$("sita-add-btn").onclick=async()=>{
  const count=Number(state.sita.count||0)+1;const cycle=Math.floor(count/108)+1;const completed=count%108===0;
  state.sita={...state.sita,count,cycle,cycleCompletedAt:completed?new Date().toISOString():state.sita.cycleCompletedAt};
  await setDoc(doc(db,"users",state.user.uid,"meta","sita"),state.sita,{merge:true});renderSita();renderDashboard();
  if(completed)showToast("108 SITA RAM repetitions completed.");
};
$("cal-prev").onclick=()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()-1,1);renderCalendar()};
$("cal-next").onclick=()=>{state.calendarMonth=new Date(state.calendarMonth.getFullYear(),state.calendarMonth.getMonth()+1,1);renderCalendar()};
$("calendar-export-btn").onclick=downloadICS;
$("calendar-links-btn").onclick=showCalendarLinks;
$("exercise-form").onsubmit=saveExercise;$("todo-form").onsubmit=saveTodo;
document.addEventListener("click",async e=>{
  const close=e.target.closest("[data-close]");if(close)closeModal(close.dataset.close);
  const tt=e.target.closest("[data-todo-toggle]");if(tt)await toggleTodo(tt.dataset.todoToggle);
  const te=e.target.closest("[data-todo-edit]");if(te)editTodo(te.dataset.todoEdit);
  const td=e.target.closest("[data-todo-delete]");if(td){if(confirm("Delete this task?")){await deleteDoc(doc(db,"users",state.user.uid,"todos",td.dataset.todoDelete));showToast("Task deleted.");}}
  const ee=e.target.closest("[data-ex-start]");if(ee)startExercise(ee.dataset.exStart);
  const ed=e.target.closest("[data-ex-edit]");if(ed)editExercise(ed.dataset.exEdit);
  const exed=e.target.closest("[data-expense-edit]");if(exed)editExpense(exed.dataset.expenseEdit);
  const exdel=e.target.closest("[data-expense-delete]");if(exdel){if(confirm("Delete this expense?")){await deleteDoc(doc(db,"users",state.user.uid,"expenses",exdel.dataset.expenseDelete));showToast("Expense deleted.");}}
  const bed=e.target.closest("[data-borrow-edit]");if(bed)editBorrowing(bed.dataset.borrowEdit);
  const bdel=e.target.closest("[data-borrow-delete]");if(bdel){if(confirm("Delete this borrowing?")){await deleteDoc(doc(db,"users",state.user.uid,"borrowings",bdel.dataset.borrowDelete));showToast("Borrowing deleted.");}}
});

let authModeRegister=false;
$("auth-toggle").onclick=()=>{
  authModeRegister=!authModeRegister;
  $("auth-submit-label").textContent=authModeRegister?"Create account":"Sign in";
  $("auth-toggle").textContent=authModeRegister?"Already have an account? Sign in":"Create an account";
};
$("auth-form").onsubmit=async e=>{
  e.preventDefault();const email=$("auth-email").value.trim(),pass=$("auth-password").value;
  try{if(authModeRegister)await createUserWithEmailAndPassword(auth,email,pass);else await signInWithEmailAndPassword(auth,email,pass);}
  catch(err){showToast(err.message.replace("Firebase: ",""))}
};

onAuthStateChanged(auth,async user=>{
  state.unsub.forEach(fn=>fn&&fn());state.unsub=[];
  state.user=user;
  $("auth-screen").classList.toggle("hidden",!!user);$("app-shell").classList.toggle("hidden",!user);
  if(user){await loadUser(); if("serviceWorker" in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});}
});
