import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getDatabase, ref, get, set, update, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const $ = (id) => document.getElementById(id);
const stageData = [
  ["Старт і постановка завдання","Знайомство з темою, правилами та очікуваними результатами.",10],
  ["Командна розробка","Визначення аудиторії, стилю, структури сайту та розподіл ролей.",35],
  ["Створення прототипу","Макет у Figma або початкова HTML/CSS-реалізація.",30],
  ["Презентація проєктів","Демонстрація концепцій, сторінок і ключових рішень.",15],
  ["Взаємний UX-аудит","Оцінювання роботи конкурентів і формування рекомендацій.",15],
  ["Вдосконалення","Впровадження хоча б однієї пропозиції конкурентів.",10],
  ["Фінал і підсумки","Порівняння результатів та спільні висновки.",5]
];
const criteria = [
  ["design","Оригінальність і цілісність дизайну","Візуальна єдність, доречні кольори та стиль."],
  ["navigation","Зручність навігації","Зрозуміле меню та логічна структура."],
  ["readability","Читабельність і доступність","Текст, контраст, розміри елементів."],
  ["content","Якість подання інформації","Зрозумілий профіль, дисципліни та матеріали."],
  ["functionality","Логіка функцій і кабінетів","Кнопки, вхід, редагування, логіка адміністратора."],
  ["responsive","Мобільна адаптивність","Зручність на смартфоні."]
];
let app=null, auth=null, db=null, currentUser=null, isAdmin=false;
let timerSeconds=120*60, timerInterval=null, votingOpen=false, resultsPublished=false, currentStage=-1;
let unsubscribeState=null, unsubscribeVotes=null;
const demoKey="speedrun-demo-state";
const defaultState={stage:-1,timerSeconds:7200,timerRunning:false,timerUpdatedAt:Date.now(),votingOpen:false,resultsPublished:false};

function toast(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),2600)}
function getDemo(){try{return {...defaultState,...JSON.parse(localStorage.getItem(demoKey)||"{}")}}catch{return {...defaultState}}}
function saveDemo(patch){const s={...getDemo(),...patch};localStorage.setItem(demoKey,JSON.stringify(s));applyState(s)}
function applyState(s){
  currentStage=s.stage??-1;votingOpen=!!s.votingOpen;resultsPublished=!!s.resultsPublished;
  $("phaseChip").textContent=currentStage<0?"Очікування старту":stageData[currentStage][0];
  $("currentStage").textContent=currentStage<0?"Очікуємо початку":stageData[currentStage][0];
  $("stageDescription").textContent=currentStage<0?"Підготуйте пристрої та сформуйте команди.":stageData[currentStage][1];
  $("timerDisplay").textContent=formatTime(timerSeconds);
  $("adminTimer").textContent=formatTime(timerSeconds);
  $("adminStage").value=String(Math.max(0,currentStage));
  $("votingState").textContent=votingOpen?"Голосування відкрите":"Зараз закрите";
  $("resultsState").textContent=resultsPublished?"Результати опубліковані":"Результати приховані";
  $("voteLocked").classList.toggle("hidden",votingOpen);
  $("voteForm").classList.toggle("hidden",!votingOpen);
  $("resultsLocked").classList.toggle("hidden",resultsPublished);
  $("resultsContent").classList.toggle("hidden",!resultsPublished);
  document.querySelectorAll(".timeline-item").forEach((el,i)=>el.classList.toggle("current",i===currentStage));
}
function formatTime(s){s=Math.max(0,Math.floor(s));return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`}
function renderCriteria(){
  $("criteriaList").innerHTML=criteria.map(([key,title,desc])=>`<div class="criterion"><div class="criterion-head"><span>${title}</span><span>0–5</span></div><small>${desc}</small><div class="rating-options">${[0,1,2,3,4,5].map(n=>`<label><input type="radio" name="${key}" value="${n}" ${n===0?"checked":""}><span>${n}</span></label>`).join("")}</div></div>`).join("");
}
function setupNav(){
  const nav=$("mainNav");
  document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener("click",e=>{
    const id=a.getAttribute("href").slice(1);
    if(!document.getElementById("page-"+id))return;
    e.preventDefault();showPage(id);nav.classList.remove("open");history.replaceState(null,"","#"+id);
  }));
  $("menuToggle").addEventListener("click",()=>nav.classList.toggle("open"));
}
function showPage(name){
  document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active",p.id==="page-"+name));
  document.querySelectorAll("#mainNav a").forEach(a=>a.classList.toggle("active",a.dataset.page===name));
  window.scrollTo({top:0,behavior:"smooth"});
}
function setupQR(){
  const url=location.href.split("#")[0];
  if(window.QRCode){new QRCode($("homeQr"),{text:url,width:90,height:90,colorDark:"#101b3b",colorLight:"#ffffff",correctLevel:QRCode.CorrectLevel.M});}
}
function updateTarget(){const mine=$("myTeam").value;const target=mine==="team1"?"Команду №2":mine==="team2"?"Команду №1":"команду-конкурента";$("targetBanner").textContent="Ви оцінюєте: "+target}
function initFirebase(){
  if(!isFirebaseConfigured){applyState(getDemo());$("connectionStatus").textContent="Демо-режим: Firebase ще не налаштовано. Сторінки працюють локально на цьому пристрої.";return;}
  try{
    app=initializeApp(firebaseConfig);auth=getAuth(app);db=getDatabase(app);
    signInAnonymously(auth).catch(e=>console.error(e));
    onAuthStateChanged(auth,user=>{currentUser=user;if(user){listenState();listenVotes();}});
    $("connectionStatus").textContent="Firebase підключено. Очікування авторизації…";
  }catch(e){console.error(e);$("connectionStatus").textContent="Помилка підключення Firebase: "+e.message;}
}
function listenState(){
  if(unsubscribeState)unsubscribeState();
  unsubscribeState=onValue(ref(db,"hackathon/state"),snap=>{
    const s={...defaultState,...(snap.val()||{})};
    const now=Date.now();
    if(s.timerRunning&&s.timerUpdatedAt){timerSeconds=Math.max(0,Math.floor((s.timerSeconds*1000-(now-s.timerUpdatedAt))/1000));}else timerSeconds=s.timerSeconds??7200;
    applyState(s);
  });
}
function listenVotes(){
  if(unsubscribeVotes)unsubscribeVotes();
  unsubscribeVotes=onValue(ref(db,"hackathon/votes"),snap=>{renderResults(snap.val()||{});});
}
async function updateRemoteState(patch){
  if(!db){saveDemo(patch);return;}
  await update(ref(db,"hackathon/state"),{...patch,updatedAt:Date.now()});
}
async function adminAction(patch){try{await updateRemoteState(patch);toast("Зміни збережено");}catch(e){toast("Не вдалося зберегти: "+e.message)}}
function startTimer(){
  if(timerInterval)clearInterval(timerInterval);
  timerInterval=setInterval(async()=>{
    timerSeconds=Math.max(0,timerSeconds-1);
    $("timerDisplay").textContent=formatTime(timerSeconds);$("adminTimer").textContent=formatTime(timerSeconds);
    if(timerSeconds<=0){clearInterval(timerInterval);timerInterval=null;toast("Час етапу завершився");}
  },1000);
}
function renderResults(votes){
  const targetTeams={team1:[],team2:[]};
  Object.entries(votes||{}).forEach(([target,items])=>Object.values(items||{}).forEach(v=>{if(targetTeams[target])targetTeams[target].push(v)}));
  const avg=(arr)=>{const nums=arr.map(v=>Number(v.total||0));return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:0};
  const a=avg(targetTeams.team1),b=avg(targetTeams.team2);
  $("score1").textContent=targetTeams.team1.length?a.toFixed(1):"—";
  $("score2").textContent=targetTeams.team2.length?b.toFixed(1):"—";
  $("voteCount").textContent=`${targetTeams.team1.length+targetTeams.team2.length} оцінок`;
  $("criteriaResults").innerHTML=criteria.map(([key,title])=>{
    const mean=(arr)=>{const values=arr.map(v=>Number(v.criteria?.[key]??0));return values.length?values.reduce((x,y)=>x+y,0)/values.length:0};
    const x=mean(targetTeams.team1),y=mean(targetTeams.team2);
    return `<div class="bar-row"><span>${title}</span><div class="bar-track"><div class="bar-fill" style="width:${x/5*100}%"></div></div><b>${x.toFixed(1)}</b></div><div class="bar-row"><span>Команда №2</span><div class="bar-track"><div class="bar-fill" style="width:${y/5*100}%"></div></div><b>${y.toFixed(1)}</b></div>`;
  }).join("");
  const comments=[];
  Object.entries(votes||{}).forEach(([target,items])=>Object.values(items||{}).forEach(v=>{
    if(v.comment)comments.push(`<div class="comment-item"><b>${target==="team1"?"Відгук для команди №1":"Відгук для команди №2"}:</b> ${escapeHTML(v.comment)}</div>`);
    if(v.idea)comments.push(`<div class="comment-item"><b>Ідея для запозичення:</b> ${escapeHTML(v.idea)}</div>`);
  }));
  $("commentsList").innerHTML=comments.length?comments.join(""):"<p class='small-muted'>Коментарів поки немає.</p>";
}
function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function submitVote(e){
  e.preventDefault();
  if(!votingOpen){toast("Голосування закрите");return;}
  const mine=$("myTeam").value;if(!mine){toast("Оберіть свою команду");return;}
  const target=mine==="team1"?"team2":"team1";
  const criteriaValues={};criteria.forEach(([key])=>{criteriaValues[key]=Number(document.querySelector(`input[name="${key}"]:checked`)?.value||0)});
  const total=Object.values(criteriaValues).reduce((x,y)=>x+y,0)/6*20;
  const vote={criteria:criteriaValues,total,comment:$("voteComment").value.trim(),idea:$("voteIdea").value.trim(),createdAt:Date.now()};
  const uid=currentUser?.uid||"demo_"+(localStorage.getItem("demo-voter-id")||(()=>{const x=Math.random().toString(36).slice(2);localStorage.setItem("demo-voter-id",x);return x})());
  try{
    if(db){
      const voteRef=ref(db,`hackathon/votes/${target}/${uid}`);
      const result=await runTransaction(voteRef,current=>current===null?vote:current);
      if(!result.committed){$("voteMessage").textContent="Ви вже надсилали оцінку з цього облікового запису.";return;}
    }else{
      const s=getDemo();s.votes=s.votes||{team1:{},team2:{}};
      if(s.votes[target]?.[uid]){$("voteMessage").textContent="Оцінку з цього браузера вже надіслано.";return;}
      s.votes[target]=s.votes[target]||{};s.votes[target][uid]=vote;localStorage.setItem(demoKey,JSON.stringify(s));renderResults(s.votes);
    }
    $("voteMessage").textContent="Дякуємо! Вашу оцінку надіслано.";
    $("submitVote").disabled=true;
  }catch(err){$("voteMessage").textContent="Не вдалося надіслати оцінку: "+err.message;}
}
function setupAdmin(){
  $("adminLoginForm").addEventListener("submit",async e=>{
    e.preventDefault();
    if(!auth){$("adminMessage").textContent="Спочатку налаштуйте Firebase та створіть адміністратора.";return;}
    try{await signInWithEmailAndPassword(auth,$("adminEmail").value,$("adminPassword").value);$("adminMessage").textContent="Вхід успішний.";}catch(err){$("adminMessage").textContent="Помилка входу: "+err.message;}
  });
  $("logoutBtn").addEventListener("click",async()=>{if(auth)await signOut(auth);isAdmin=false;showAdmin(false)});
  $("setStage").addEventListener("click",()=>adminAction({stage:Number($("adminStage").value)}));
  $("startTimer").addEventListener("click",async()=>{if(!timerInterval)startTimer();await adminAction({timerRunning:true,timerSeconds,timerUpdatedAt:Date.now()})});
  $("pauseTimer").addEventListener("click",async()=>{if(timerInterval){clearInterval(timerInterval);timerInterval=null;}await adminAction({timerRunning:false,timerSeconds,timerUpdatedAt:Date.now()})});
  $("resetTimer").addEventListener("click",async()=>{if(timerInterval){clearInterval(timerInterval);timerInterval=null;}timerSeconds=7200;$("timerDisplay").textContent="120:00";$("adminTimer").textContent="120:00";await adminAction({timerRunning:false,timerSeconds:7200,timerUpdatedAt:Date.now()})});
  $("openVoting").addEventListener("click",()=>adminAction({votingOpen:true}));
  $("closeVoting").addEventListener("click",()=>adminAction({votingOpen:false}));
  $("publishResults").addEventListener("click",()=>adminAction({resultsPublished:true}));
  $("hideResults").addEventListener("click",()=>adminAction({resultsPublished:false}));
}
function showAdmin(ok){
  isAdmin=ok;$("adminLogin").classList.toggle("hidden",ok);$("adminControls").classList.toggle("hidden",!ok);
}
function setupAuthAdmin(){
  if(!auth)return;
  onAuthStateChanged(auth,async user=>{
    currentUser=user;
    if(!user||user.isAnonymous){showAdmin(false);return;}
    try{
      const snap=await get(ref(db,`admins/${user.uid}`));
      const allowed=snap.val()===true;
      showAdmin(allowed);
      if(!allowed){await signOut(auth);$("adminMessage").textContent="Цей обліковий запис не має прав керівника.";}
    }catch(e){showAdmin(false);}
  });
}
function init(){
  setupNav();renderCriteria();setupQR();$("myTeam").addEventListener("change",updateTarget);
  $("voteForm").addEventListener("submit",submitVote);setupAdmin();initFirebase();
  if(location.hash)showPage(location.hash.slice(1));
  if(!isFirebaseConfigured){const s=getDemo();applyState(s);renderResults(s.votes||{});showAdmin(true);$("adminLogin").classList.add("hidden");$("adminControls").classList.remove("hidden");$("connectionStatus").textContent="ДЕМО-РЕЖИМ: керування доступне локально. Для синхронізації пристроїв підключіть Firebase."; }
  else setupAuthAdmin();
}
init();
