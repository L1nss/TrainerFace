const $ = (id) => document.getElementById(id);
let currentUser = null;
let workouts = [];
let authMode = "login";

document.addEventListener("DOMContentLoaded", async () => {
  loadTheme();
  bindEvents();
  const { data } = await db.auth.getSession();
  if (data.session) showApp(data.session.user);
  else showAuth();
  db.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session.user);
    else showAuth();
  });
});

function bindEvents(){
  $("authForm").addEventListener("submit", handleAuth);
  $("toggleAuth").addEventListener("click", toggleAuth);
  $("logout").addEventListener("click", () => db.auth.signOut());
  $("themeToggle").addEventListener("click", toggleTheme);
  $("newWorkout").addEventListener("click", openNewWorkout);
  $("emptyNew").addEventListener("click", openNewWorkout);
  $("closeModal").addEventListener("click", closeModal);
  $("cancelModal").addEventListener("click", closeModal);
  $("addExercise").addEventListener("click", addExerciseRow);
  $("workoutForm").addEventListener("submit", saveWorkout);
  $("search").addEventListener("input", renderWorkouts);
  $("filterDate").addEventListener("change", renderWorkouts);
  $("clearFilters").addEventListener("click", () => { $("search").value=""; $("filterDate").value=""; renderWorkouts(); });
}

async function handleAuth(e){
  e.preventDefault();
  const email=$("email").value.trim(), password=$("password").value;
  $("authButton").disabled=true;
  $("authMessage").textContent="Processando...";
  let result;
  if(authMode==="login") result=await db.auth.signInWithPassword({email,password});
  else result=await db.auth.signUp({email,password});
  $("authButton").disabled=false;
  if(result.error){ $("authMessage").textContent=result.error.message; return; }
  $("authMessage").textContent=authMode==="login"?"": "Conta criada. Verifique seu e-mail se a confirmação estiver ativada.";
}

function toggleAuth(){
  authMode=authMode==="login"?"signup":"login";
  $("authButton").textContent=authMode==="login"?"Entrar":"Criar conta";
  $("toggleAuth").textContent=authMode==="login"?"Não tenho conta — criar agora":"Já tenho conta — entrar";
  $("authMessage").textContent="";
}

function showAuth(){ $("authScreen").classList.remove("hidden"); $("app").classList.add("hidden"); }
async function showApp(user){
  currentUser=user; $("authScreen").classList.add("hidden"); $("app").classList.remove("hidden");
  $("userEmail").textContent=user.email;
  await loadWorkouts();
}

async function loadWorkouts(){
  const {data,error}=await db.from("workouts").select("*, exercises(*)").order("workout_date",{ascending:false}).order("created_at",{ascending:false});
  if(error){ toast(error.message); return; }
  workouts=data||[]; updateStats(); renderWorkouts();
}

function updateStats(){
  $("totalWorkouts").textContent=workouts.length;
  const now=new Date(), month=now.getMonth(), year=now.getFullYear();
  const monthCount=workouts.filter(w=>{const d=new Date(w.workout_date+"T00:00:00");return d.getMonth()===month&&d.getFullYear()===year}).length;
  $("monthWorkouts").textContent=monthCount;
  $("lastWorkout").textContent=workouts[0]?formatDate(workouts[0].workout_date):"—";
}

function renderWorkouts(){
  const search=$("search").value.toLowerCase().trim(), date=$("filterDate").value;
  const filtered=workouts.filter(w=>(!search||w.name.toLowerCase().includes(search)||((w.notes||"").toLowerCase().includes(search)))&&(!date||w.workout_date===date));
  $("workoutsList").innerHTML=filtered.map(w=>`
    <article class="workout-card">
      <div class="workout-head"><div><div class="date">${formatDate(w.workout_date)}</div><h3>${escapeHtml(w.name)}</h3></div></div>
      ${w.notes?`<p class="notes">${escapeHtml(w.notes)}</p>`:""}
      <div>${(w.exercises||[]).sort((a,b)=>a.position-b.position).map(e=>`
        <div class="exercise"><div class="exercise-name">${escapeHtml(e.name)}</div>
        <div class="exercise-meta">${e.sets??"—"} séries · ${e.reps??"—"} repetições · ${e.weight??"—"} kg${e.notes?" · "+escapeHtml(e.notes):""}</div></div>`).join("")}</div>
      <div class="card-actions"><button class="edit" onclick="editWorkout('${w.id}')">Editar</button><button class="danger" onclick="deleteWorkout('${w.id}')">Excluir</button></div>
    </article>`).join("");
  $("emptyState").classList.toggle("hidden",filtered.length!==0);
}

function openNewWorkout(){
  $("workoutId").value=""; $("workoutName").value=""; $("workoutNotes").value="";
  $("workoutDate").value=new Date().toISOString().slice(0,10); $("exerciseRows").innerHTML="";
  $("modalTitle").textContent="Novo treino"; addExerciseRow(); $("workoutDialog").showModal();
}
function addExerciseRow(data={name:"",sets:"",reps:"",weight:"",notes:""}){
  const row=document.createElement("div"); row.className="exercise-row";
  row.innerHTML=`<input class="ex-name" required placeholder="Exercício" value="${escapeAttr(data.name)}"><input class="ex-sets" type="number" min="0" placeholder="Séries" value="${data.sets??""}"><input class="ex-reps" type="number" min="0" placeholder="Reps" value="${data.reps??""}"><input class="ex-weight" type="number" min="0" step="0.1" placeholder="Kg" value="${data.weight??""}"><button type="button" class="remove-exercise">×</button>`;
  row.querySelector(".remove-exercise").onclick=()=>row.remove();
  $("exerciseRows").appendChild(row);
}
async function saveWorkout(e){
  e.preventDefault();
  const id=$("workoutId").value;
  const payload={user_id:currentUser.id,name:$("workoutName").value.trim(),workout_date:$("workoutDate").value,notes:$("workoutNotes").value.trim()};
  if(!payload.name||!payload.workout_date)return;
  const rows=[...document.querySelectorAll(".exercise-row")];
  if(!rows.length){toast("Adicione pelo menos um exercício.");return}
  $("saveWorkout").disabled=true;
  let workoutId=id;
  let error;
  if(id){({error}=await db.from("workouts").update(payload).eq("id",id).eq("user_id",currentUser.id));}
  else {const r=await db.from("workouts").insert(payload).select().single(); error=r.error; workoutId=r.data?.id;}
  if(error){toast(error.message);$("saveWorkout").disabled=false;return}
  if(id){const r=await db.from("exercises").delete().eq("workout_id",id);if(r.error){toast(r.error.message);$("saveWorkout").disabled=false;return}}
  const exercises=rows.map((row,i)=>({workout_id:workoutId,name:row.querySelector(".ex-name").value.trim(),sets:numOrNull(row.querySelector(".ex-sets").value),reps:numOrNull(row.querySelector(".ex-reps").value),weight:numOrNull(row.querySelector(".ex-weight").value),position:i}));
  const r=await db.from("exercises").insert(exercises);
  $("saveWorkout").disabled=false;
  if(r.error){toast(r.error.message);return}
  closeModal();toast(id?"Treino atualizado.":"Treino salvo.");await loadWorkouts();
}
async function editWorkout(id){
  const w=workouts.find(x=>x.id===id); if(!w)return;
  $("workoutId").value=w.id;$("workoutName").value=w.name;$("workoutDate").value=w.workout_date;$("workoutNotes").value=w.notes||"";
  $("modalTitle").textContent="Editar treino";$("exerciseRows").innerHTML="";
  (w.exercises||[]).sort((a,b)=>a.position-b.position).forEach(addExerciseRow);
  if(!(w.exercises||[]).length)addExerciseRow();
  $("workoutDialog").showModal();
}
async function deleteWorkout(id){
  if(!confirm("Excluir este treino e seus exercícios?"))return;
  const {error}=await db.from("workouts").delete().eq("id",id).eq("user_id",currentUser.id);
  if(error){toast(error.message);return} toast("Treino excluído.");await loadWorkouts();
}
function closeModal(){if($("workoutDialog").open)$("workoutDialog").close()}
function formatDate(s){return new Intl.DateTimeFormat("pt-BR",{dateStyle:"medium"}).format(new Date(s+"T00:00:00"))}
function numOrNull(v){return v===""?null:Number(v)}
function escapeHtml(v=""){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}
function escapeAttr(v=""){return escapeHtml(String(v))}
function toast(msg){$("toast").textContent=msg;$("toast").classList.add("show");setTimeout(()=>$("toast").classList.remove("show"),2600)}
function loadTheme(){if(localStorage.getItem("trainerface-theme")==="dark"){document.body.classList.add("dark");$("themeToggle").textContent="☀"}}
function toggleTheme(){const dark=document.body.classList.toggle("dark");localStorage.setItem("trainerface-theme",dark?"dark":"light");$("themeToggle").textContent=dark?"☀":"☾"}
