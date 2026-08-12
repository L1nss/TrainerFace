const $ = (id) => document.getElementById(id);

let currentUser = null;
let workouts = [];
let authMode = "login";

const DAYS = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado"
};

document.addEventListener("DOMContentLoaded", async () => {

  loadTheme();
  bindEvents();

  const { data } = await db.auth.getSession();

  if (data.session) {
    showApp(data.session.user);
  } else {
    showAuth();
  }

  db.auth.onAuthStateChange((event, session) => {

    if (session) {
      showApp(session.user);
    } else {
      showAuth();
    }

  });

});


function bindEvents() {

  $("authForm").addEventListener("submit", handleAuth);

  $("toggleAuth").addEventListener("click", toggleAuth);

  $("logout").addEventListener("click", () => {
    db.auth.signOut();
  });

  $("themeToggle").addEventListener("click", toggleTheme);

  $("newWorkout").addEventListener("click", openNewWorkout);

  $("emptyNew").addEventListener("click", openNewWorkout);

  $("closeModal").addEventListener("click", closeModal);

  $("cancelModal").addEventListener("click", closeModal);

  $("addExercise").addEventListener("click", addExerciseRow);

  $("workoutForm").addEventListener("submit", saveWorkout);

  $("search").addEventListener("input", renderWorkouts);

  $("filterDay").addEventListener("change", renderWorkouts);

  $("clearFilters").addEventListener("click", () => {

    $("search").value = "";
    $("filterDay").value = "";

    renderWorkouts();

  });

}


async function handleAuth(e) {

  e.preventDefault();

  const email = $("email").value.trim();
  const password = $("password").value;

  $("authButton").disabled = true;
  $("authMessage").textContent = "Processando...";

  let result;

  if (authMode === "login") {

    result = await db.auth.signInWithPassword({
      email,
      password
    });

  } else {

    result = await db.auth.signUp({
      email,
      password
    });

  }

  $("authButton").disabled = false;

  if (result.error) {

    $("authMessage").textContent = result.error.message;
    return;

  }

  $("authMessage").textContent =
    authMode === "login"
      ? ""
      : "Conta criada. Verifique seu e-mail se a confirmação estiver ativada.";

}


function toggleAuth() {

  authMode = authMode === "login"
    ? "signup"
    : "login";

  $("authButton").textContent =
    authMode === "login"
      ? "Entrar"
      : "Criar conta";

  $("toggleAuth").textContent =
    authMode === "login"
      ? "Não tenho conta — criar agora"
      : "Já tenho conta — entrar";

  $("authMessage").textContent = "";

}


function showAuth() {

  $("authScreen").classList.remove("hidden");

  $("app").classList.add("hidden");

}


async function showApp(user) {

  currentUser = user;

  $("authScreen").classList.add("hidden");

  $("app").classList.remove("hidden");

  $("userEmail").textContent = user.email;

  await loadWorkouts();

}


async function loadWorkouts() {

  const { data, error } = await db
    .from("workouts")
    .select("*, exercises(*)")
    .order("weekday", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {

    toast(error.message);
    return;

  }

  workouts = data || [];

  updateStats();
  renderWorkouts();

}


function updateStats() {

  $("totalWorkouts").textContent = workouts.length;

  const activeDays = new Set(
    workouts.map(workout => workout.weekday)
  ).size;

  $("activeDays").textContent = activeDays;

  $("restDays").textContent = Math.max(
    0,
    7 - activeDays
  );

}


function renderWorkouts() {

  const search = $("search")
    .value
    .toLowerCase()
    .trim();

  const day = $("filterDay").value;


  const filtered = workouts.filter(workout => {

    const matchesSearch =
      !search ||
      workout.name.toLowerCase().includes(search) ||
      (workout.notes || "")
        .toLowerCase()
        .includes(search);

    const matchesDay =
      !day ||
      String(workout.weekday) === String(day);

    return matchesSearch && matchesDay;

  });


  const sorted = [...filtered].sort((a, b) => {

    return getDayOrder(a.weekday) -
      getDayOrder(b.weekday);

  });


  $("workoutsList").innerHTML = sorted.map(workout => {

    const exercises = (workout.exercises || [])
      .sort((a, b) => a.position - b.position);


    return `

            <article class="workout-card">

                <div class="workout-head">

                    <div>

                        <div class="date">
                            ${getDayName(workout.weekday)}
                        </div>

                        <h3>
                            ${escapeHtml(workout.name)}
                        </h3>

                    </div>

                </div>


                ${workout.notes
        ? `
                            <p class="notes">
                                ${escapeHtml(workout.notes)}
                            </p>
                          `
        : ""
      }


                <div>

                    ${exercises.map(exercise => `

                        <div class="exercise">

                            <div class="exercise-name">
                                ${escapeHtml(exercise.name)}
                            </div>

                            <div class="exercise-meta">

                                ${exercise.sets ?? "—"} séries ·

                                ${exercise.reps ?? "—"} repetições ·

                                ${exercise.weight ?? "—"} kg

                                ${exercise.notes
          ? " · " + escapeHtml(exercise.notes)
          : ""
        }

                            </div>

                        </div>

                    `).join("")}

                </div>


                <div class="card-actions">

                    <button
                        class="edit"
                        onclick="editWorkout('${workout.id}')"
                    >
                        Editar
                    </button>

                    <button
                        class="danger"
                        onclick="deleteWorkout('${workout.id}')"
                    >
                        Excluir
                    </button>

                </div>

            </article>

        `;

  }).join("");


  $("emptyState").classList.toggle(
    "hidden",
    filtered.length !== 0
  );

}


function openNewWorkout() {

  $("workoutId").value = "";

  $("workoutDay").value = "";

  $("workoutName").value = "";

  $("workoutNotes").value = "";

  $("exerciseRows").innerHTML = "";

  $("modalTitle").textContent = "Novo treino";

  addExerciseRow();

  $("workoutDialog").showModal();

}


function addExerciseRow(
  data = {
    name: "",
    sets: "",
    reps: "",
    weight: "",
    notes: ""
  }
) {

  const row = document.createElement("div");

  row.className = "exercise-row";

  row.innerHTML = `

        <input
            class="ex-name"
            required
            placeholder="Exercício"
            value="${escapeAttr(data.name)}"
        >

        <input
            class="ex-sets"
            type="number"
            min="0"
            placeholder="Séries"
            value="${data.sets ?? ""}"
        >

        <input
            class="ex-reps"
            type="number"
            min="0"
            placeholder="Reps"
            value="${data.reps ?? ""}"
        >

        <input
            class="ex-weight"
            type="number"
            min="0"
            step="0.1"
            placeholder="Kg"
            value="${data.weight ?? ""}"
        >

        <button
            type="button"
            class="remove-exercise"
        >
            ×
        </button>

    `;


  row
    .querySelector(".remove-exercise")
    .onclick = () => row.remove();


  $("exerciseRows").appendChild(row);

}


async function saveWorkout(e) {

  e.preventDefault();

  const id = $("workoutId").value;

  const payload = {

    user_id: currentUser.id,

    name: $("workoutName")
      .value
      .trim(),

    weekday: Number(
      $("workoutDay").value
    ),

    notes: $("workoutNotes")
      .value
      .trim()

  };


  if (
    !payload.name ||
    Number.isNaN(payload.weekday)
  ) {

    toast("Preencha o dia e o nome do treino.");

    return;

  }


  const rows = [
    ...document.querySelectorAll(".exercise-row")
  ];


  if (!rows.length) {

    toast("Adicione pelo menos um exercício.");

    return;

  }


  $("saveWorkout").disabled = true;


  let workoutId = id;

  let error;


  if (id) {

    const result = await db
      .from("workouts")
      .update(payload)
      .eq("id", id)
      .eq("user_id", currentUser.id);

    error = result.error;

  } else {

    const result = await db
      .from("workouts")
      .insert(payload)
      .select()
      .single();

    error = result.error;

    workoutId = result.data?.id;

  }


  if (error) {

    toast(error.message);

    $("saveWorkout").disabled = false;

    return;

  }


  if (id) {

    const result = await db
      .from("exercises")
      .delete()
      .eq("workout_id", id);

    if (result.error) {

      toast(result.error.message);

      $("saveWorkout").disabled = false;

      return;

    }

  }


  const exercises = rows.map((row, index) => ({

    workout_id: workoutId,

    name: row
      .querySelector(".ex-name")
      .value
      .trim(),

    sets: numOrNull(
      row.querySelector(".ex-sets").value
    ),

    reps: numOrNull(
      row.querySelector(".ex-reps").value
    ),

    weight: numOrNull(
      row.querySelector(".ex-weight").value
    ),

    position: index

  }));


  const result = await db
    .from("exercises")
    .insert(exercises);


  $("saveWorkout").disabled = false;


  if (result.error) {

    toast(result.error.message);

    return;

  }


  closeModal();

  toast(
    id
      ? "Treino atualizado."
      : "Treino adicionado à rotina."
  );

  await loadWorkouts();

}


async function editWorkout(id) {

  const workout = workouts.find(
    workout => workout.id === id
  );

  if (!workout) return;


  $("workoutId").value = workout.id;

  $("workoutDay").value = workout.weekday;

  $("workoutName").value = workout.name;

  $("workoutNotes").value =
    workout.notes || "";


  $("modalTitle").textContent =
    "Editar treino";


  $("exerciseRows").innerHTML = "";


  (workout.exercises || [])
    .sort((a, b) => a.position - b.position)
    .forEach(addExerciseRow);


  if (!(workout.exercises || []).length) {

    addExerciseRow();

  }


  $("workoutDialog").showModal();

}


async function deleteWorkout(id) {

  if (
    !confirm(
      "Excluir este treino e seus exercícios?"
    )
  ) {
    return;
  }


  const { error } = await db
    .from("workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", currentUser.id);


  if (error) {

    toast(error.message);

    return;

  }


  toast("Treino excluído.");

  await loadWorkouts();

}


function closeModal() {

  if ($("workoutDialog").open) {

    $("workoutDialog").close();

  }

}


function getDayName(day) {

  return DAYS[day] || "Dia inválido";

}


function getDayOrder(day) {

  // Segunda começa a semana visualmente
  const order = {
    1: 0,
    2: 1,
    3: 2,
    4: 3,
    5: 4,
    6: 5,
    0: 6
  };

  return order[day] ?? 99;

}


function numOrNull(value) {

  return value === ""
    ? null
    : Number(value);

}


function escapeHtml(value = "") {

  return String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character])
  );

}


function escapeAttr(value = "") {

  return escapeHtml(String(value));

}


function toast(message) {

  $("toast").textContent = message;

  $("toast").classList.add("show");

  setTimeout(
    () => $("toast").classList.remove("show"),
    2600
  );

}


function loadTheme() {

  if (
    localStorage.getItem(
      "trainerface-theme"
    ) === "dark"
  ) {

    document.body.classList.add("dark");

    $("themeToggle").textContent = "☀";

  }

}


function toggleTheme() {

  const dark =
    document.body.classList.toggle("dark");

  localStorage.setItem(
    "trainerface-theme",
    dark ? "dark" : "light"
  );

  $("themeToggle").textContent =
    dark ? "☀" : "☾";

}