import { supabase } from "./supabase.js";

const ADMIN_EMAIL = "dalcinryan0123@gmail.com";
const DAYS = {0:"Domingo",1:"Segunda-feira",2:"Terça-feira",3:"Quarta-feira",4:"Quinta-feira",5:"Sexta-feira",6:"Sábado"};
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let currentUser = null;
let profile = null;
let visibleStudents = [];
let selectedStudentId = null;
let generatedWorkout = null;
let generatedDiet = null;
let editingWorkoutId = null;
let cachedWorkouts = [];
let cachedProgress = [];

function escapeHTML(value="") {
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
}
function toast(message) {
  const el = $("#toast");
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 3000);
}
function showLoading(on) {
  const loading = $("#loading");
  if (!loading) return;
  loading.classList.toggle("hidden", !Boolean(on));
}
function numberOrNull(v){ if(v===""||v==null) return null; const n=Number(v); return Number.isFinite(n)?n:null; }
function role(){ return profile?.role || "USER"; }
function isAdmin(){ return role()==="ADMIN"; }
function isMonitor(){ return role()==="MONITOR"; }
function isUser(){ return role()==="USER"; }
function targetUserId(){ return (isAdmin()||isMonitor()) ? (selectedStudentId || visibleStudents[0]?.id || currentUser?.id) : currentUser?.id; }
function targetStudent(){ return visibleStudents.find(s => s.id === targetUserId()) || profile; }

function setRoleUI() {
  $("#roleLabel").textContent = `${profile?.email || currentUser.email} · ${role()}`;
  $("#welcomeTitle").textContent = isAdmin() ? "Visão administrativa" : isMonitor() ? "Painel do monitor" : "Seu planejamento";
  $("#welcomeText").textContent = isAdmin()
    ? "Acompanhe usuários, monitores, alunos, treinos e evolução."
    : isMonitor()
      ? "Acompanhe apenas os alunos vinculados a você."
      : "Organize treinos, alimentação e evolução de carga.";

  $$(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin()));
  $$(".user-only").forEach(el => el.classList.toggle("hidden", !isUser()));

  $("#dashboardSubtitle").textContent = isAdmin()
    ? "Visão global do Trainer Face."
    : isMonitor() ? "Somente alunos atribuídos ao seu perfil." : "Resumo da sua evolução.";

  $("#studentSelectorWrap")?.classList.toggle("hidden", isUser());
  $("#newWorkoutButton")?.classList.toggle("hidden", !isUser());
}

async function ensureProfile() {
  const { data, error } = await supabase.from("profiles").select("id,email,full_name,role").eq("id", currentUser.id).maybeSingle();
  if (error && error.code !== "PGRST116") throw error;

  if (data) {
    profile = data;
  } else {
    const forcedRole = currentUser.email?.toLowerCase() === ADMIN_EMAIL ? "ADMIN" : "USER";
    const row = {id: currentUser.id, email: currentUser.email?.toLowerCase(), full_name: currentUser.email?.split("@")[0], role: forcedRole};
    const result = await supabase.from("profiles").upsert(row).select("id,email,full_name,role").single();
    if (result.error) throw result.error;
    profile = result.data;
  }

  if (currentUser.email?.toLowerCase() === ADMIN_EMAIL && profile.role !== "ADMIN") {
    const result = await supabase.from("profiles").update({role:"ADMIN"}).eq("id", currentUser.id).select().single();
    if (!result.error) profile = result.data;
  }
}

async function loadVisibleStudents() {
  if (isUser()) {
    visibleStudents = [profile];
    selectedStudentId = currentUser.id;
    return;
  }

  if (isAdmin()) {
    const { data, error } = await supabase.from("profiles").select("id,email,full_name,role").order("created_at");
    if (error) throw error;
    visibleStudents = (data || []).filter(p => p.role === "USER");
  } else {
    const { data: links, error: linkError } = await supabase.from("monitor_students").select("student_id").eq("monitor_id", currentUser.id);
    if (linkError) throw linkError;
    const ids = (links || []).map(x => x.student_id);
    if (!ids.length) visibleStudents = [];
    else {
      const { data, error } = await supabase.from("profiles").select("id,email,full_name,role").in("id", ids);
      if (error) throw error;
      visibleStudents = data || [];
    }
  }

  if (!visibleStudents.some(s => s.id === selectedStudentId)) selectedStudentId = visibleStudents[0]?.id || null;
  renderStudentSelector();
}

function renderStudentSelector() {
  const select = $("#studentSelector");
  if (!select) return;
  select.innerHTML = visibleStudents.length
    ? visibleStudents.map(s => `<option value="${s.id}" ${s.id===selectedStudentId?"selected":""}>${escapeHTML(s.full_name || s.email)}</option>`).join("")
    : `<option value="">Nenhum aluno disponível</option>`;
}

async function loadDashboard() {
  const metrics = $("#dashboardMetrics");
  const cards = $("#dashboardStudents");
  if (!metrics || !cards) return;

  if (isUser()) {
    const [w,p,d] = await Promise.all([
      supabase.from("workouts").select("id",{count:"exact",head:true}).eq("user_id",currentUser.id),
      supabase.from("workout_progress").select("id",{count:"exact",head:true}).eq("user_id",currentUser.id),
      supabase.from("diet_plans").select("id",{count:"exact",head:true}).eq("user_id",currentUser.id)
    ]);
    metrics.innerHTML = metric("Treinos",w.count||0)+metric("Registros de carga",p.count||0)+metric("Planos alimentares",d.count||0);
    cards.innerHTML = "";
    return;
  }

  let usersCount = visibleStudents.length;
  let monitorsCount = 0;
  if (isAdmin()) {
    const { count } = await supabase.from("profiles").select("id",{count:"exact",head:true}).eq("role","MONITOR");
    monitorsCount = count || 0;
  }
  const studentIds = visibleStudents.map(s=>s.id);
  let workoutsCount=0, progressCount=0;
  if (studentIds.length) {
    const [w,p] = await Promise.all([
      supabase.from("workouts").select("id",{count:"exact",head:true}).in("user_id",studentIds),
      supabase.from("workout_progress").select("id",{count:"exact",head:true}).in("user_id",studentIds)
    ]);
    workoutsCount=w.count||0; progressCount=p.count||0;
  }
  metrics.innerHTML = metric("Alunos",usersCount)+metric("Treinos",workoutsCount)+metric("Registros de carga",progressCount)+(isAdmin()?metric("Monitores",monitorsCount):"");
  cards.innerHTML = visibleStudents.length ? visibleStudents.map(s => `
    <article class="workout-card person-card">
      <div class="person-meta"><span class="role-badge">USER</span></div>
      <h3>${escapeHTML(s.full_name || s.email)}</h3>
      <p>${escapeHTML(s.email || "")}</p>
      <button class="primary-button" data-open-student="${s.id}">Abrir acompanhamento</button>
    </article>`).join("") : `<div class="empty">Nenhum aluno disponível.</div>`;

  $$("[data-open-student]").forEach(btn => btn.onclick = async () => {
    selectedStudentId = btn.dataset.openStudent;
    renderStudentSelector();
    document.querySelector('.tab[data-section="treinos"]')?.click();
  });
}
function metric(label,value){ return `<div class="metric-card"><span>${escapeHTML(label)}</span><strong>${value}</strong></div>`; }

async function loadWorkouts() {
  const uid = targetUserId();
  if (!uid) { $("#workoutList").innerHTML = `<div class="empty">Selecione um aluno.</div>`; return; }

  const { data,error } = await supabase.from("workouts")
    .select("id,user_id,name,weekday,notes,created_at,exercises(id,workout_id,name,sets,reps,weight,notes,position)")
    .eq("user_id",uid).order("weekday",{ascending:true}).order("position",{foreignTable:"exercises",ascending:true});
  if (error) { toast(error.message); return; }
  cachedWorkouts=data||[];
  const t=targetStudent();
  $("#workoutsTitle").textContent = isUser() ? "Meus treinos" : `Treinos de ${t?.full_name || t?.email || "aluno"}`;
  renderWorkouts();
  await loadExerciseSelector();
}

function renderWorkouts() {
  const c=$("#workoutList");
  if(!cachedWorkouts.length){ c.innerHTML=`<div class="empty">Nenhum treino cadastrado.</div>`; return; }
  c.innerHTML=cachedWorkouts.map(w=>`
    <article class="workout-card">
      <span class="workout-day">${escapeHTML(DAYS[w.weekday] || "Dia")}</span>
      <h3>${escapeHTML(w.name)}</h3>
      ${w.notes?`<p>${escapeHTML(w.notes)}</p>`:""}
      <ul class="exercise-list">${(w.exercises||[]).sort((a,b)=>(a.position||0)-(b.position||0)).map(e=>`
        <li><strong>${escapeHTML(e.name)}</strong><br>${e.sets??""}${e.sets?" séries":""}${e.reps?` × ${escapeHTML(e.reps)}`:""}${e.weight!=null?` — ${e.weight} kg`:""}</li>`).join("")}</ul>
      ${isUser()?`<div class="card-actions"><button class="primary-button" data-edit="${w.id}">Editar</button><button class="secondary-button" data-delete="${w.id}">Excluir</button></div>`:`<div class="readonly-note">Somente leitura para ${role()}.</div>`}
    </article>`).join("");
  $$("[data-edit]").forEach(b=>b.onclick=()=>openEditWorkout(b.dataset.edit));
  $$("[data-delete]").forEach(b=>b.onclick=()=>deleteWorkout(b.dataset.delete));
}

function addExerciseRow(data={}) {
  const row=document.createElement("div"); row.className="exercise-row";
  row.innerHTML=`<input class="exercise-name" placeholder="Exercício" required value="${escapeHTML(data.name||"")}">
    <input class="exercise-sets" type="number" min="1" placeholder="Séries" value="${data.sets??""}">
    <input class="exercise-reps" placeholder="Reps" value="${escapeHTML(data.reps||"")}">
    <input class="exercise-weight" type="number" min="0" step="0.5" placeholder="Kg" value="${data.weight??""}">
    <button type="button" class="remove-exercise">×</button>`;
  row.querySelector(".remove-exercise").onclick=()=>row.remove();
  $("#manualExercises").appendChild(row);
}

function openNewWorkout(){
  if(!isUser()) return;
  editingWorkoutId=null; $("#manualWorkoutForm").reset(); $("#manualExercises").innerHTML=""; addExerciseRow();
  $("#workoutModalTitle").textContent="Criar treino"; $("#workoutModal").classList.remove("hidden");
}
function openEditWorkout(id){
  const w=cachedWorkouts.find(x=>x.id===id); if(!w) return;
  editingWorkoutId=id; $("#manualName").value=w.name||""; $("#manualWeekday").value=String(w.weekday); $("#manualNotes").value=w.notes||"";
  $("#manualExercises").innerHTML=""; (w.exercises||[]).forEach(addExerciseRow); if(!(w.exercises||[]).length)addExerciseRow();
  $("#workoutModalTitle").textContent="Editar treino"; $("#workoutModal").classList.remove("hidden");
}
function closeWorkoutModal(){ $("#workoutModal").classList.add("hidden"); editingWorkoutId=null; }

async function saveManualWorkout(e){
  e.preventDefault(); if(!isUser()) return;
  const payload={name:$("#manualName").value.trim(),weekday:Number($("#manualWeekday").value),notes:$("#manualNotes").value.trim()||null};
  const exercises=$$("#manualExercises .exercise-row").map((r,i)=>({
    name:r.querySelector(".exercise-name").value.trim(),sets:numberOrNull(r.querySelector(".exercise-sets").value),
    reps:r.querySelector(".exercise-reps").value.trim()||null,weight:numberOrNull(r.querySelector(".exercise-weight").value),position:i
  })).filter(x=>x.name);
  showLoading(true);
  try{
    let workoutId=editingWorkoutId;
    if(workoutId){
      const up=await supabase.from("workouts").update(payload).eq("id",workoutId).eq("user_id",currentUser.id);
      if(up.error) throw up.error;
      const del=await supabase.from("exercises").delete().eq("workout_id",workoutId); if(del.error) throw del.error;
    } else {
      const ins=await supabase.from("workouts").insert({...payload,user_id:currentUser.id}).select("id").single();
      if(ins.error) throw ins.error; workoutId=ins.data.id;
    }
    if(exercises.length){ const ins=await supabase.from("exercises").insert(exercises.map(x=>({...x,workout_id:workoutId}))); if(ins.error) throw ins.error; }
    closeWorkoutModal(); toast("Treino salvo."); await loadWorkouts(); await loadDashboard();
  }catch(err){toast(err.message||"Erro ao salvar treino.");}finally{showLoading(false);}
}
async function deleteWorkout(id){
  if(!isUser()||!confirm("Excluir este treino?")) return;
  const del=await supabase.from("workouts").delete().eq("id",id).eq("user_id",currentUser.id);
  if(del.error) toast(del.error.message); else {toast("Treino excluído."); await loadWorkouts(); await loadDashboard();}
}

function generateWorkout(){
  const days=Number($("#daysPerWeek").value), exp=$("#experience").value, equipment=$("#equipment").value;
  const splits={
    2:[[1,"Treino A — Corpo inteiro"],[4,"Treino B — Corpo inteiro"]],
    3:[[1,"Treino A — Corpo inteiro"],[3,"Treino B — Corpo inteiro"],[5,"Treino C — Corpo inteiro"]],
    4:[[1,"Treino A — Superior"],[2,"Treino B — Inferior"],[4,"Treino C — Superior"],[5,"Treino D — Inferior"]],
    5:[[1,"Peito + Tríceps"],[2,"Costas + Bíceps"],[3,"Pernas"],[4,"Ombros + Core"],[5,"Corpo inteiro"]]
  }[days];
  const bank=equipment==="peso-corporal"
    ? ["Agachamento livre","Flexão de braços","Avanço","Remada invertida","Prancha","Elevação pélvica"]
    : ["Agachamento","Supino","Remada","Leg press","Desenvolvimento de ombros","Puxada","Rosca de bíceps","Tríceps na polia"];
  return {workouts:splits.map(([weekday,name],idx)=>({weekday,name,notes:"Sugestão gerada pelo Trainer Face.",exercises:bank.slice(idx%3,idx%3+5).map((n,i)=>({name:n,sets:exp==="iniciante"?2:3,reps:"8–12",weight:null,position:i}))}))};
}
function renderGenerated(){
  $("#generatedWorkout").classList.remove("hidden");
  $("#generatedContent").innerHTML=generatedWorkout.workouts.map(w=>`<div class="generated-day"><h3>${DAYS[w.weekday]} — ${escapeHTML(w.name)}</h3><ul>${w.exercises.map(e=>`<li>${escapeHTML(e.name)} — ${e.sets} × ${e.reps}</li>`).join("")}</ul></div>`).join("");
}
async function saveGenerated(){
  if(!generatedWorkout) return;
  showLoading(true);
  try{
    for(const w of generatedWorkout.workouts){
      const ins=await supabase.from("workouts").insert({user_id:currentUser.id,name:w.name,weekday:w.weekday,notes:w.notes}).select("id").single();
      if(ins.error) throw ins.error;
      const ex=await supabase.from("exercises").insert(w.exercises.map(e=>({...e,workout_id:ins.data.id}))); if(ex.error) throw ex.error;
    }
    generatedWorkout=null; $("#generatedWorkout").classList.add("hidden"); toast("Treinos salvos."); await loadWorkouts(); await loadDashboard();
  }catch(err){toast(err.message);}finally{showLoading(false);}
}

const FOODS = {
  onivora:{
    protein:["ovos","frango","peixe","carne magra","iogurte natural","feijão"],
    base:["arroz","batata","mandioca","aveia","pão integral","macarrão"],
    snack:["fruta com iogurte","sanduíche com queijo e tomate","banana com aveia","fruta e castanhas"]
  },
  vegetariana:{
    protein:["ovos","iogurte natural","queijo","feijão","lentilha","grão-de-bico","tofu"],
    base:["arroz","batata","mandioca","aveia","pão integral","macarrão"],
    snack:["fruta com iogurte","banana com aveia","pão com queijo","fruta e castanhas"]
  },
  vegana:{
    protein:["feijão","lentilha","grão-de-bico","tofu","ervilha","pasta de grão-de-bico"],
    base:["arroz","batata","mandioca","aveia","pão integral","macarrão"],
    snack:["fruta com aveia","pão com pasta de grão-de-bico","fruta e castanhas","vitamina vegetal com fruta"]
  }
};
function excludes(text, item){ const t=(text||"").toLowerCase(); return item.toLowerCase().split(" ").some(w=>w.length>4 && t.includes(w)); }
function pick(list,restrictions,index){ const safe=list.filter(x=>!excludes(restrictions,x)); return safe[index%safe.length]||"alimento compatível com suas restrições"; }
function generateDiet(){
  const pref=$("#dietPreference").value, meals=Number($("#dietMeals").value), restrictions=$("#dietRestrictions").value.trim(), likes=$("#dietLikes").value.trim(), obj=$("#dietObjective").value;
  const f=FOODS[pref];
  const titles=meals===3?["Café da manhã","Almoço","Jantar"]:meals===4?["Café da manhã","Almoço","Lanche","Jantar"]:meals===5?["Café da manhã","Lanche da manhã","Almoço","Lanche da tarde","Jantar"]:["Café da manhã","Lanche da manhã","Almoço","Lanche da tarde","Jantar","Ceia"];
  const plan=titles.map((title,i)=>{
    const main=/Almoço|Jantar/.test(title);
    return {title,items:main
      ? [pick(f.base,restrictions,i),pick(f.protein,restrictions,i),"verduras e legumes variados","uma fruta ou outra opção natural"]
      : [pick(f.snack,restrictions,i),"água ao longo do dia"]};
  });
  return {title:"Plano alimentar personalizado",objective:obj,preferences:`${pref}${likes?` · preferências: ${likes}`:""}`,restrictions:restrictions||"Nenhuma informada",meals_per_day:meals,plan};
}
function renderDiet(){
  $("#dietPreview").classList.remove("hidden");
  $("#dietContent").innerHTML=`<p><strong>Objetivo:</strong> ${escapeHTML(generatedDiet.objective.replaceAll("_"," "))}</p>
    <p><strong>Restrições informadas:</strong> ${escapeHTML(generatedDiet.restrictions)}</p>
    <div class="diet-grid">${generatedDiet.plan.map(m=>`<article class="meal-card"><h3>${escapeHTML(m.title)}</h3><ul>${m.items.map(i=>`<li>${escapeHTML(i)}</li>`).join("")}</ul></article>`).join("")}</div>
    <p class="readonly-note">Sugestão geral de organização alimentar. Alergias, condições clínicas ou necessidades específicas devem ser avaliadas por profissional qualificado.</p>`;
}
async function saveDiet(){
  if(!generatedDiet||!isUser()) return;
  const {error}=await supabase.from("diet_plans").insert({user_id:currentUser.id,...generatedDiet});
  if(error) toast(error.message); else {toast("Plano alimentar salvo."); await loadDietHistory(); await loadDashboard();}
}
async function loadDietHistory(){
  if(!isUser()) return;
  const {data,error}=await supabase.from("diet_plans").select("id,title,objective,preferences,restrictions,meals_per_day,plan,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(10);
  if(error){$("#dietHistory").innerHTML=`<div class="empty">${escapeHTML(error.message)}</div>`;return;}
  $("#dietHistory").innerHTML=(data||[]).length?(data||[]).map(d=>`<div class="timeline-row"><div><strong>${escapeHTML(d.title)}</strong><br><small>${new Date(d.created_at).toLocaleDateString("pt-BR")}</small></div><span>${d.meals_per_day} refeições</span></div>`).join(""):`<div class="empty">Nenhum plano salvo.</div>`;
}

async function loadExerciseSelector(){
  const uid=targetUserId(), select=$("#progressExercise"); if(!uid||!select) return;
  const {data,error}=await supabase.from("workouts").select("exercises(name)").eq("user_id",uid);
  if(error){select.innerHTML=`<option value="">Erro ao carregar</option>`;return;}
  const names=[...new Set((data||[]).flatMap(w=>(w.exercises||[]).map(e=>e.name)).filter(Boolean))].sort();
  select.innerHTML=`<option value="">Selecione</option>`+names.map(n=>`<option value="${escapeHTML(n)}">${escapeHTML(n)}</option>`).join("");
  if(names.length){ select.value=names[0]; await loadProgress(); } else { cachedProgress=[]; renderProgress(); }
}

async function saveProgress(){
  if(!isUser()) return;
  const exercise=$("#progressExercise").value, weight=numberOrNull($("#progressWeight").value);
  if(!exercise||weight==null){toast("Selecione o exercício e informe a carga.");return;}
  const date=$("#progressDate").value;
  const recorded_at=date ? new Date(`${date}T12:00:00`).toISOString() : new Date().toISOString();
  const {error}=await supabase.from("workout_progress").insert({
    user_id:currentUser.id,exercise_name:exercise,weight,reps:numberOrNull($("#progressReps").value),
    sets:numberOrNull($("#progressSets").value),recorded_at
  });
  if(error) toast(error.message); else {toast("Evolução registrada."); await loadProgress(); await loadDashboard();}
}
async function loadProgress(){
  const uid=targetUserId(), exercise=$("#progressExercise")?.value;
  if(!uid||!exercise){cachedProgress=[];renderProgress();return;}
  const {data,error}=await supabase.from("workout_progress").select("id,user_id,exercise_name,weight,reps,sets,recorded_at").eq("user_id",uid).eq("exercise_name",exercise).order("recorded_at",{ascending:true});
  if(error){toast(error.message);return;}
  cachedProgress=data||[]; renderProgress();
}
function renderProgress(){
  const chart=$("#progressChart"), stats=$("#progressStats"), timeline=$("#progressTimelineContent");
  if(!cachedProgress.length){
    chart.innerHTML=`<div class="empty">Sem registros suficientes para o gráfico.</div>`;
    stats.innerHTML=""; timeline.innerHTML=`<div class="empty">Nenhum registro para este exercício.</div>`; return;
  }
  const points=cachedProgress.map(x=>({x:new Date(x.recorded_at),y:Number(x.weight)}));
  const W=720,H=300,pad=42,min=Math.min(...points.map(p=>p.y)),max=Math.max(...points.map(p=>p.y)),range=Math.max(1,max-min);
  const coords=points.map((p,i)=>({px:pad+(i*Math.max(1,W-pad*2)/(Math.max(1,points.length-1))),py:H-pad-((p.y-min)/range)*(H-pad*2),...p}));
  const poly=coords.map(p=>`${p.px},${p.py}`).join(" ");
  chart.innerHTML=`<svg class="progress-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gráfico de progressão de carga">
    ${[0,1,2,3,4].map(i=>`<line class="chart-grid" x1="${pad}" x2="${W-pad}" y1="${pad+i*(H-pad*2)/4}" y2="${pad+i*(H-pad*2)/4}"/>`).join("")}
    <line class="chart-axis" x1="${pad}" x2="${pad}" y1="${pad}" y2="${H-pad}"/><line class="chart-axis" x1="${pad}" x2="${W-pad}" y1="${H-pad}" y2="${H-pad}"/>
    <polyline class="chart-line" points="${poly}"/>
    ${coords.map(p=>`<circle class="chart-dot" cx="${p.px}" cy="${p.py}" r="5"><title>${p.y} kg · ${p.x.toLocaleDateString("pt-BR")}</title></circle>`).join("")}
    <text class="chart-label" x="${pad}" y="${H-10}">${coords[0].x.toLocaleDateString("pt-BR")}</text>
    <text class="chart-label" x="${W-pad-70}" y="${H-10}">${coords.at(-1).x.toLocaleDateString("pt-BR")}</text>
    <text class="chart-label" x="5" y="${pad+4}">${max} kg</text><text class="chart-label" x="5" y="${H-pad}">${min} kg</text>
  </svg>`;
  const first=points[0].y,last=points.at(-1).y,delta=last-first;
  stats.innerHTML=`<div class="metric-grid">${metric("Primeira carga",`${first} kg`)}${metric("Carga atual",`${last} kg`)}${metric("Variação",`${delta>=0?"+":""}${delta.toFixed(1)} kg`)}</div>`;
  timeline.innerHTML=`<div class="timeline-list">${[...cachedProgress].reverse().map(x=>`<div class="timeline-row"><div><strong>${escapeHTML(x.exercise_name)}</strong><br><small>${new Date(x.recorded_at).toLocaleString("pt-BR")}</small></div><span>${x.weight} kg${x.reps?` · ${x.reps} reps`:""}${x.sets?` · ${x.sets} séries`:""}</span></div>`).join("")}</div>`;
}

async function loadAccessAdmin(){
  if(!isAdmin()) return;
  const {data,error}=await supabase.from("profiles").select("id,email,full_name,role").order("email");
  if(error){toast(error.message);return;}
  $("#accessUsers").innerHTML=(data||[]).map(u=>`<article class="workout-card"><span class="role-badge">${u.role}</span><h3>${escapeHTML(u.full_name||u.email)}</h3><p>${escapeHTML(u.email||"")}</p>
    <div class="access-actions"><select data-role-user="${u.id}" ${u.email?.toLowerCase()===ADMIN_EMAIL?"disabled":""}>
      ${["USER","MONITOR","ADMIN"].map(r=>`<option ${u.role===r?"selected":""}>${r}</option>`).join("")}</select>
      <button class="primary-button" data-save-role="${u.id}" ${u.email?.toLowerCase()===ADMIN_EMAIL?"disabled":""}>Salvar função</button></div></article>`).join("");
  $$("[data-save-role]").forEach(b=>b.onclick=async()=>{
    const id=b.dataset.saveRole, value=document.querySelector(`[data-role-user="${id}"]`).value;
    const {error}=await supabase.from("profiles").update({role:value}).eq("id",id); if(error)toast(error.message);else{toast("Função atualizada.");await loadAccessAdmin();await loadVisibleStudents();await loadDashboard();}
  });
  const monitors=(data||[]).filter(x=>x.role==="MONITOR"), students=(data||[]).filter(x=>x.role==="USER");
  $("#monitorSelect").innerHTML=monitors.map(x=>`<option value="${x.id}">${escapeHTML(x.full_name||x.email)}</option>`).join("");
  $("#studentSelect").innerHTML=students.map(x=>`<option value="${x.id}">${escapeHTML(x.full_name||x.email)}</option>`).join("");
}
async function assignStudent(){
  if(!isAdmin())return;
  const monitor_id=$("#monitorSelect").value,student_id=$("#studentSelect").value;
  if(!monitor_id||!student_id){toast("Selecione monitor e aluno.");return;}
  const {error}=await supabase.from("monitor_students").upsert({monitor_id,student_id});
  if(error)toast(error.message);else toast("Aluno vinculado ao monitor.");
}

function bindTabs(){
  $$(".tab").forEach(btn=>btn.onclick=async()=>{
    $$(".tab").forEach(x=>x.classList.remove("active")); $$(".section").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active"); $(`#section-${btn.dataset.section}`)?.classList.add("active");
    if(btn.dataset.section==="dashboard") await loadDashboard();
    if(btn.dataset.section==="treinos") await loadWorkouts();
    if(btn.dataset.section==="dieta") await loadDietHistory();
    if(btn.dataset.section==="evolucao"){await loadExerciseSelector(); await loadProgress();}
    if(btn.dataset.section==="acessos") await loadAccessAdmin();
  });
}

async function init(){
  showLoading(true);
  try{
    const {data,error}=await supabase.auth.getUser(); if(error||!data?.user){location.href="login.html";return;}
    currentUser=data.user; await ensureProfile(); setRoleUI(); bindTabs(); await loadVisibleStudents(); await loadDashboard();
    if(isUser()) await loadDietHistory();
  }catch(err){console.error(err);toast(err.message||"Erro ao iniciar aplicação.");}finally{showLoading(false);}
}

$("#studentSelector")?.addEventListener("change",async e=>{selectedStudentId=e.target.value||null;await loadDashboard();await loadWorkouts();await loadExerciseSelector();});
$("#newWorkoutButton")?.addEventListener("click",openNewWorkout);
$("#closeModal")?.addEventListener("click",closeWorkoutModal);
$("#addExerciseButton")?.addEventListener("click",()=>addExerciseRow());
$("#manualWorkoutForm")?.addEventListener("submit",saveManualWorkout);
$("#generatorForm")?.addEventListener("submit",e=>{e.preventDefault();generatedWorkout=generateWorkout();renderGenerated();});
$("#saveGeneratedButton")?.addEventListener("click",saveGenerated);
$("#dietForm")?.addEventListener("submit",e=>{e.preventDefault();generatedDiet=generateDiet();renderDiet();});
$("#saveDietButton")?.addEventListener("click",saveDiet);
$("#saveProgressButton")?.addEventListener("click",saveProgress);
$("#progressExercise")?.addEventListener("change",loadProgress);
$("#assignStudentButton")?.addEventListener("click",assignStudent);
$("#logoutButton")?.addEventListener("click",async()=>{await supabase.auth.signOut();location.href="login.html";});
$("#themeButton")?.addEventListener("click",()=>{document.body.classList.toggle("light");localStorage.setItem("trainer-face-theme",document.body.classList.contains("light")?"light":"dark");});
if(localStorage.getItem("trainer-face-theme")==="light")document.body.classList.add("light");
$("#progressDate").value=new Date().toISOString().slice(0,10);

// Fail-safe visual: nunca deixe o overlay bloquear a aplicação indefinidamente.
window.setTimeout(() => {
  $("#loading")?.classList.add("hidden");
}, 12000);

init();
