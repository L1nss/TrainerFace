import { supabase } from "./supabase.js";

/* =========================================================
   CONFIGURAÇÕES
========================================================= */

const DAYS = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

let currentUser = null;

let generatedWorkout = null;
let importedWorkout = null;
let selectedPdf = null;

let editingWorkoutId = null;

let savingWorkout = false;

/* =========================================================
   UTILITÁRIOS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => document.querySelectorAll(selector);

function showLoading(value) {
  const element = $("#loading");

  if (!element) return;

  element.classList.toggle("show", Boolean(value));
}

function toast(message) {
  const element = $("#toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.classList.add("show");

  clearTimeout(element._toastTimer);

  element._toastTimer = setTimeout(() => {
    element.classList.remove("show");
  }, 3000);
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const normalized = String(value).replace(",", ".").trim();

  if (!normalized) {
    return null;
  }

  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();

  return text || null;
}

function getErrorMessage(error, fallback = "Ocorreu um erro.") {
  if (!error) {
    return fallback;
  }

  if (typeof error === "string") {
    return error;
  }

  return error.message || error.details || error.hint || fallback;
}

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

async function checkUser() {
  try {
    const { data, error } = await supabase.auth.getUser();

    if (error) {
      console.error("Erro ao verificar usuário:", error);

      window.location.href = "login.html";
      return;
    }

    if (!data?.user) {
      window.location.href = "login.html";
      return;
    }

    currentUser = data.user;

    await loadWorkouts();

    /*
     * Se a aba de evolução existir,
     * carrega os dados dela.
     */

    await loadProgress();
  } catch (error) {
    console.error("checkUser:", error);

    window.location.href = "login.html";
  }
}

/* =========================================================
   LOGOUT
========================================================= */

const logoutButton = $("#logoutButton");

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.href = "login.html";
    }
  });
}

/* =========================================================
   TABS
========================================================= */

$$(".tab").forEach((button) => {
  button.addEventListener("click", async () => {
    $$(".tab").forEach((tab) => {
      tab.classList.remove("active");
    });

    $$(".section").forEach((section) => {
      section.classList.remove("active");
    });

    button.classList.add("active");

    const section = $("#section-" + button.dataset.section);

    if (section) {
      section.classList.add("active");
    }

    /*
     * Atualiza evolução quando
     * o usuário abre a aba.
     */

    if (button.dataset.section === "evolucao") {
      await loadProgress();
    }
  });
});

/* =========================================================
   TEMA
========================================================= */

const savedTheme = localStorage.getItem("trainer-face-theme");

if (savedTheme === "light") {
  document.body.classList.add("light");
}

const themeButton = $("#themeButton");

if (themeButton) {
  themeButton.addEventListener("click", () => {
    document.body.classList.toggle("light");

    localStorage.setItem(
      "trainer-face-theme",
      document.body.classList.contains("light") ? "light" : "dark",
    );
  });
}

/* =========================================================
   CARREGAR TREINOS
========================================================= */

async function loadWorkouts() {
  if (!currentUser) {
    return;
  }

  showLoading(true);

  try {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
          id,
          user_id,
          name,
          weekday,
          notes,
          created_at,
          exercises (
            id,
            workout_id,
            name,
            sets,
            reps,
            weight,
            notes,
            position
          )
        `,
      )
      .eq("user_id", currentUser.id)
      .order("weekday", {
        ascending: true,
      })
      .order("position", {
        foreignTable: "exercises",
        ascending: true,
      });

    if (error) {
      console.error("Erro ao carregar treinos:", error);

      toast("Erro ao carregar seus treinos: " + getErrorMessage(error));

      return;
    }

    renderWorkouts(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("loadWorkouts:", error);

    toast(getErrorMessage(error, "Erro ao carregar seus treinos."));
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   RENDERIZAR TREINOS
========================================================= */

function renderWorkouts(workouts) {
  const container = $("#workoutList");

  if (!container) {
    return;
  }

  if (!Array.isArray(workouts) || workouts.length === 0) {
    container.innerHTML = `
      <div class="empty">
        Nenhum treino cadastrado.
        <br><br>
        Use "Novo treino",
        "Montar treino"
        ou "Importar PDF".
      </div>
    `;

    return;
  }

  container.innerHTML = workouts
    .map((workout) => {
      const exercises = [...(workout.exercises || [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      );

      return `
          <article
            class="workout-card"
            data-workout-id="${escapeHTML(workout.id)}"
          >

            <span class="workout-day">
              ${escapeHTML(DAYS[workout.weekday] || "Dia não definido")}
            </span>

            <h3>
              ${escapeHTML(workout.name)}
            </h3>

            ${
              workout.notes
                ? `
                  <p>
                    ${escapeHTML(workout.notes)}
                  </p>
                `
                : ""
            }

            <ul class="exercise-list">

              ${
                exercises.length
                  ? exercises
                      .map(
                        (exercise) => `
                          <li>

                            <strong>
                              ${escapeHTML(exercise.name)}
                            </strong>

                            <br>

                            ${
                              exercise.sets !== null &&
                              exercise.sets !== undefined
                                ? `${escapeHTML(exercise.sets)} séries`
                                : ""
                            }

                            ${
                              exercise.reps
                                ? ` × ${escapeHTML(exercise.reps)}`
                                : ""
                            }

                            ${
                              exercise.weight !== null &&
                              exercise.weight !== undefined
                                ? ` — ${exercise.weight} kg`
                                : ""
                            }

                          </li>
                        `,
                      )
                      .join("")
                  : `
                    <li>
                      Nenhum exercício.
                    </li>
                  `
              }

            </ul>

            <div class="card-actions">

              <button
                type="button"
                class="primary-button edit-button"
                data-edit="${escapeHTML(workout.id)}"
              >
                Editar
              </button>

              <button
                type="button"
                class="secondary-button delete-button"
                data-delete="${escapeHTML(workout.id)}"
              >
                Excluir
              </button>

            </div>

          </article>
        `;
    })
    .join("");

  $$("[data-delete]").forEach((button) => {
    button.addEventListener("click", () =>
      deleteWorkout(button.dataset.delete),
    );
  });

  $$("[data-edit]").forEach((button) => {
    button.addEventListener("click", () =>
      openEditWorkout(button.dataset.edit),
    );
  });
}

/* =========================================================
   EXCLUIR TREINO
========================================================= */

async function deleteWorkout(id) {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return;
  }

  if (!id) {
    toast("Treino inválido.");
    return;
  }

  const confirmed = confirm("Excluir este treino?");

  if (!confirmed) {
    return;
  }

  showLoading(true);

  try {
    /*
     * Primeiro removemos exercícios.
     *
     * Isso funciona mesmo que a FK não
     * tenha ON DELETE CASCADE.
     */

    const { error: exercisesError } = await supabase
      .from("exercises")
      .delete()
      .eq("workout_id", id);

    if (exercisesError) {
      throw new Error(
        "Erro ao excluir exercícios: " + getErrorMessage(exercisesError),
      );
    }

    /*
     * Depois removemos o treino.
     */

    const { error: workoutError } = await supabase
      .from("workouts")
      .delete()
      .eq("id", id)
      .eq("user_id", currentUser.id);

    if (workoutError) {
      throw new Error(
        "Erro ao excluir treino: " + getErrorMessage(workoutError),
      );
    }

    toast("Treino excluído com sucesso.");

    await loadWorkouts();

    await loadProgress();
  } catch (error) {
    console.error("deleteWorkout:", error);

    toast(getErrorMessage(error, "Não foi possível excluir o treino."));
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   MODAL NOVO TREINO
========================================================= */

const newWorkoutButton = $("#newWorkoutButton");

if (newWorkoutButton) {
  newWorkoutButton.addEventListener("click", () => {
    editingWorkoutId = null;

    $("#workoutModal")?.classList.remove("hidden");

    const title = $("#workoutModal h2");

    if (title) {
      title.textContent = "Criar treino";
    }

    const saveButton = $("#manualWorkoutForm button[type='submit']");

    if (saveButton) {
      saveButton.textContent = "Salvar treino";
    }

    const form = $("#manualWorkoutForm");

    if (form) {
      form.reset();
    }

    const exercises = $("#manualExercises");

    if (exercises) {
      exercises.innerHTML = "";
    }

    addExerciseRow();
  });
}

const closeModalButton = $("#closeModal");

if (closeModalButton) {
  closeModalButton.addEventListener("click", closeModal);
}

function closeModal() {
  $("#workoutModal")?.classList.add("hidden");

  editingWorkoutId = null;

  const form = $("#manualWorkoutForm");

  if (form) {
    form.reset();
  }

  const exercises = $("#manualExercises");

  if (exercises) {
    exercises.innerHTML = "";
  }

  const title = $("#workoutModal h2");

  if (title) {
    title.textContent = "Criar treino";
  }

  const saveButton = $("#manualWorkoutForm button[type='submit']");

  if (saveButton) {
    saveButton.textContent = "Salvar treino";
  }
}

/* =========================================================
   ADICIONAR EXERCÍCIO MANUAL
========================================================= */

const addExerciseButton = $("#addExerciseButton");

if (addExerciseButton) {
  addExerciseButton.addEventListener("click", () => addExerciseRow());
}

function addExerciseRow(data = {}) {
  const container = $("#manualExercises");

  if (!container) {
    return;
  }

  const row = document.createElement("div");

  row.className = "exercise-row";

  row.innerHTML = `
    <input
      class="exercise-name"
      placeholder="Exercício"
      value="${escapeHTML(data.name || "")}"
      required
    >

    <input
      class="exercise-sets"
      type="number"
      min="1"
      placeholder="Séries"
      value="${data.sets ?? ""}"
    >

    <input
      class="exercise-reps"
      placeholder="Reps"
      value="${escapeHTML(data.reps || "")}"
    >

    <input
      class="exercise-weight"
      type="number"
      step="0.5"
      min="0"
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

  const remove = row.querySelector(".remove-exercise");

  if (remove) {
    remove.addEventListener("click", () => row.remove());
  }

  container.appendChild(row);
}

/* =========================================================
   EDITAR TREINO
========================================================= */

async function openEditWorkout(id) {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return;
  }

  if (!id) {
    toast("Treino inválido.");
    return;
  }

  showLoading(true);

  try {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
          id,
          user_id,
          name,
          weekday,
          notes,
          exercises (
            id,
            workout_id,
            name,
            sets,
            reps,
            weight,
            notes,
            position
          )
        `,
      )
      .eq("id", id)
      .eq("user_id", currentUser.id)
      .single();

    if (error) {
      throw new Error(
        getErrorMessage(error, "Não foi possível buscar o treino."),
      );
    }

    if (!data) {
      toast("Treino não encontrado.");

      return;
    }

    editingWorkoutId = data.id;

    $("#workoutModal")?.classList.remove("hidden");

    const title = $("#workoutModal h2");

    if (title) {
      title.textContent = "Editar treino";
    }

    const saveButton = $("#manualWorkoutForm button[type='submit']");

    if (saveButton) {
      saveButton.textContent = "Salvar alterações";
    }

    const nameInput = $("#manualName");

    if (nameInput) {
      nameInput.value = data.name || "";
    }

    const weekdayInput = $("#manualWeekday");

    if (weekdayInput) {
      weekdayInput.value = String(data.weekday);
    }

    const notesInput = $("#manualNotes");

    if (notesInput) {
      notesInput.value = data.notes || "";
    }

    const container = $("#manualExercises");

    if (container) {
      container.innerHTML = "";

      const exercises = [...(data.exercises || [])].sort(
        (a, b) => (a.position ?? 0) - (b.position ?? 0),
      );

      exercises.forEach((exercise) => addExerciseRow(exercise));

      if (exercises.length === 0) {
        addExerciseRow();
      }
    }
  } catch (error) {
    console.error("openEditWorkout:", error);

    toast(getErrorMessage(error, "Erro ao abrir treino."));
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   FORMULÁRIO MANUAL
========================================================= */

const manualWorkoutForm = $("#manualWorkoutForm");

if (manualWorkoutForm) {
  manualWorkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (savingWorkout) {
      return;
    }

    const rows = [
      ...document.querySelectorAll("#manualExercises .exercise-row"),
    ];

    const exercises = rows
      .map((row, index) => {
        const name = row.querySelector(".exercise-name")?.value?.trim();

        if (!name) {
          return null;
        }

        return {
          name,

          sets: numberOrNull(row.querySelector(".exercise-sets")?.value),

          reps: normalizeText(row.querySelector(".exercise-reps")?.value),

          weight: numberOrNull(row.querySelector(".exercise-weight")?.value),

          notes: null,

          position: index,
        };
      })
      .filter(Boolean);

    const name = $("#manualName")?.value?.trim();

    const weekday = Number($("#manualWeekday")?.value);

    const notes = $("#manualNotes")?.value?.trim() || null;

    if (!name) {
      toast("Informe o nome do treino.");

      return;
    }

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      toast("Selecione um dia válido.");

      return;
    }

    const workout = {
      name,
      weekday,
      notes,
      exercises,
    };

    let saved = false;

    if (editingWorkoutId) {
      saved = await updateWorkout(editingWorkoutId, workout);
    } else {
      saved = await saveWorkout(workout);
    }

    if (saved) {
      closeModal();
    }
  });
}

/* =========================================================
   PREPARAR EXERCÍCIOS
========================================================= */

function prepareExercises(exercises) {
  if (!Array.isArray(exercises)) {
    return [];
  }

  return exercises
    .map((exercise, index) => {
      if (!exercise || !String(exercise.name || "").trim()) {
        return null;
      }

      return {
        name: String(exercise.name).trim(),

        sets: numberOrNull(exercise.sets),

        reps: normalizeText(exercise.reps),

        weight: numberOrNull(exercise.weight),

        notes: normalizeText(exercise.notes),

        position: index,
      };
    })
    .filter(Boolean);
}

/* =========================================================
   SALVAR TREINO
========================================================= */

async function saveWorkout(workout) {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return false;
  }

  if (savingWorkout) {
    toast("Já existe um salvamento em andamento.");

    return false;
  }

  const name = String(workout?.name || "").trim();

  const weekday = Number(workout?.weekday);

  const notes = normalizeText(workout?.notes);

  if (!name) {
    toast("Informe o nome do treino.");

    return false;
  }

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    toast("Selecione um dia da semana válido.");

    return false;
  }

  const exercises = prepareExercises(workout?.exercises);

  savingWorkout = true;

  showLoading(true);

  let workoutId = null;

  try {
    /*
     * =====================================================
     * 1. CRIAR TREINO
     * =====================================================
     */

    const { data: insertedWorkout, error: workoutError } = await supabase
      .from("workouts")
      .insert({
        user_id: currentUser.id,

        name,

        weekday,

        notes,
      })
      .select("id, user_id, name, weekday, notes, created_at")
      .single();

    if (workoutError) {
      console.error("SUPABASE workouts INSERT:", workoutError);

      throw new Error(
        "Não foi possível salvar o treino: " + getErrorMessage(workoutError),
      );
    }

    if (!insertedWorkout?.id) {
      throw new Error("O Supabase não retornou o ID do treino.");
    }

    workoutId = insertedWorkout.id;

    /*
     * =====================================================
     * 2. INSERIR EXERCÍCIOS
     * =====================================================
     */

    if (exercises.length > 0) {
      const rows = exercises.map((exercise, index) => ({
        workout_id: workoutId,

        name: exercise.name,

        sets: exercise.sets,

        reps: exercise.reps,

        weight: exercise.weight,

        notes: exercise.notes,

        position: index,
      }));

      const { error: exerciseError } = await supabase
        .from("exercises")
        .insert(rows);

      if (exerciseError) {
        console.error("SUPABASE exercises INSERT:", exerciseError);

        /*
         * Rollback.
         */

        await supabase.from("exercises").delete().eq("workout_id", workoutId);

        await supabase
          .from("workouts")
          .delete()
          .eq("id", workoutId)
          .eq("user_id", currentUser.id);

        throw new Error(
          "O treino foi criado, mas os exercícios não puderam ser salvos: " +
            getErrorMessage(exerciseError),
        );
      }
    }

    /*
     * =====================================================
     * 3. SUCESSO
     * =====================================================
     */

    console.log("TREINO SALVO:", {
      id: workoutId,
      name,
      weekday,
      exercises,
    });

    toast("Treino salvo com sucesso.");

    await loadWorkouts();

    await loadProgress();

    return true;
  } catch (error) {
    console.error("saveWorkout:", error);

    toast(getErrorMessage(error, "Erro ao salvar treino."));

    return false;
  } finally {
    savingWorkout = false;

    showLoading(false);
  }
}

/* =========================================================
   ATUALIZAR TREINO
========================================================= */

async function updateWorkout(workoutId, workout) {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return false;
  }

  if (!workoutId) {
    toast("ID do treino inválido.");

    return false;
  }

  if (savingWorkout) {
    toast("Já existe um salvamento em andamento.");

    return false;
  }

  const name = String(workout?.name || "").trim();

  const weekday = Number(workout?.weekday);

  if (!name) {
    toast("Informe o nome do treino.");

    return false;
  }

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    toast("Selecione um dia válido.");

    return false;
  }

  const exercises = prepareExercises(workout?.exercises);

  savingWorkout = true;

  showLoading(true);

  try {
    /*
     * =====================================================
     * 1. ATUALIZAR TREINO
     * =====================================================
     */

    const { data: updatedWorkout, error: workoutError } = await supabase
      .from("workouts")
      .update({
        name,
        weekday,
        notes: normalizeText(workout?.notes),
      })
      .eq("id", workoutId)
      .eq("user_id", currentUser.id)
      .select("id, user_id, name, weekday, notes")
      .single();

    if (workoutError) {
      throw new Error(
        "Não foi possível atualizar o treino: " + getErrorMessage(workoutError),
      );
    }

    if (!updatedWorkout) {
      throw new Error(
        "O treino não foi encontrado ou não pertence ao usuário.",
      );
    }

    /*
     * =====================================================
     * 2. EXCLUIR EXERCÍCIOS ANTIGOS
     * =====================================================
     */

    const { error: deleteError } = await supabase
      .from("exercises")
      .delete()
      .eq("workout_id", workoutId);

    if (deleteError) {
      throw new Error(
        "Não foi possível atualizar os exercícios: " +
          getErrorMessage(deleteError),
      );
    }

    /*
     * =====================================================
     * 3. INSERIR EXERCÍCIOS NOVOS
     * =====================================================
     */

    if (exercises.length > 0) {
      const rows = exercises.map((exercise, index) => ({
        workout_id: workoutId,

        name: exercise.name,

        sets: exercise.sets,

        reps: exercise.reps,

        weight: exercise.weight,

        notes: exercise.notes,

        position: index,
      }));

      const { error: insertError } = await supabase
        .from("exercises")
        .insert(rows);

      if (insertError) {
        /*
         * Remove o que acabou de ser
         * inserido para evitar estado
         * parcialmente atualizado.
         */

        await supabase.from("exercises").delete().eq("workout_id", workoutId);

        throw new Error(
          "Não foi possível salvar os novos exercícios: " +
            getErrorMessage(insertError),
        );
      }
    }

    toast("Treino atualizado com sucesso.");

    await loadWorkouts();

    await loadProgress();

    return true;
  } catch (error) {
    console.error("updateWorkout:", error);

    toast(getErrorMessage(error, "Erro ao atualizar treino."));

    return false;
  } finally {
    savingWorkout = false;

    showLoading(false);
  }
}

/* =========================================================
   GERADOR
========================================================= */

const generatorForm = $("#generatorForm");

if (generatorForm) {
  generatorForm.addEventListener("submit", (event) => {
    event.preventDefault();

    generatedWorkout = generateWorkout();

    if (!generatedWorkout) {
      toast("Não foi possível montar o treino.");

      return;
    }

    renderGeneratedWorkout(generatedWorkout);
  });
}

function generateWorkout() {
  const days = Number($("#daysPerWeek")?.value);

  const goal = $("#goal")?.value || "geral";

  const experience = $("#experience")?.value || "iniciante";

  const equipment = $("#equipment")?.value || "academia";

  const database = getExercises(equipment, goal);

  const splits = createSplit(days);

  if (!splits) {
    toast("Quantidade de dias inválida.");

    return null;
  }

  const workouts = splits.map((split) => ({
    name: split.name,

    weekday: split.weekday,

    notes: `Sugestão gerada para ${goal}.`,

    exercises: chooseExercises(split, database, experience),
  }));

  return {
    workouts,
  };
}

/* =========================================================
   DIVISÃO
========================================================= */

function createSplit(days) {
  const options = {
    2: [
      {
        weekday: 1,
        name: "Treino A — Corpo inteiro",
      },
      {
        weekday: 4,
        name: "Treino B — Corpo inteiro",
      },
    ],

    3: [
      {
        weekday: 1,
        name: "Treino A — Corpo inteiro",
      },
      {
        weekday: 3,
        name: "Treino B — Corpo inteiro",
      },
      {
        weekday: 5,
        name: "Treino C — Corpo inteiro",
      },
    ],

    4: [
      {
        weekday: 1,
        name: "Treino A — Superior",
      },
      {
        weekday: 2,
        name: "Treino B — Inferior",
      },
      {
        weekday: 4,
        name: "Treino C — Superior",
      },
      {
        weekday: 5,
        name: "Treino D — Inferior",
      },
    ],

    5: [
      {
        weekday: 1,
        name: "Peito + Tríceps",
      },
      {
        weekday: 2,
        name: "Costas + Bíceps",
      },
      {
        weekday: 3,
        name: "Pernas",
      },
      {
        weekday: 4,
        name: "Ombros + Core",
      },
      {
        weekday: 5,
        name: "Corpo inteiro",
      },
    ],
  };

  return options[days] || null;
}

/* =========================================================
   BANCO DE EXERCÍCIOS
========================================================= */

function getExercises(equipment, goal) {
  const common = {
    peito: ["Supino com carga adequada", "Flexão de braços", "Crucifixo"],

    costas: ["Puxada", "Remada", "Remada unilateral"],

    pernas: ["Agachamento", "Leg press", "Elevação de panturrilhas"],

    ombros: [
      "Desenvolvimento de ombros",
      "Elevação lateral",
      "Elevação posterior",
    ],

    biceps: ["Rosca de bíceps", "Rosca martelo"],

    triceps: ["Tríceps na polia", "Extensão de tríceps"],

    core: ["Prancha", "Dead bug"],
  };

  if (equipment === "peso-corporal") {
    return {
      peito: ["Flexão de braços"],

      costas: ["Remada invertida"],

      pernas: ["Agachamento livre", "Avanço"],

      ombros: ["Flexão inclinada"],

      biceps: ["Rosca com resistência disponível"],

      triceps: ["Flexão com apoio adequado"],

      core: ["Prancha", "Dead bug"],
    };
  }

  return common;
}

/* =========================================================
   ESCOLHER EXERCÍCIOS
========================================================= */

function chooseExercises(split, database, experience) {
  const result = [];

  function addGroup(group, amount) {
    const list = database[group] || [];

    list.slice(0, amount).forEach((name) => {
      result.push({
        name,

        sets: experience === "iniciante" ? 2 : 3,

        reps: "8–12",

        weight: null,

        notes: null,

        position: result.length,
      });
    });
  }

  const name = split.name.toLowerCase();

  if (name.includes("superior") || name.includes("peito")) {
    addGroup("peito", 2);
    addGroup("costas", 2);
    addGroup("ombros", 1);
    addGroup("triceps", 1);
    addGroup("biceps", 1);
  } else if (name.includes("inferior") || name.includes("pernas")) {
    addGroup("pernas", 3);
    addGroup("core", 1);
  } else if (name.includes("costas")) {
    addGroup("costas", 3);
    addGroup("biceps", 2);
  } else if (name.includes("corpo inteiro")) {
    addGroup("pernas", 2);
    addGroup("peito", 1);
    addGroup("costas", 1);
    addGroup("ombros", 1);
    addGroup("core", 1);
  } else {
    addGroup("peito", 1);
    addGroup("costas", 1);
    addGroup("pernas", 2);
    addGroup("ombros", 1);
    addGroup("core", 1);
  }

  return result;
}

/* =========================================================
   RENDER GERADOR
========================================================= */

function renderGeneratedWorkout(data) {
  const container = $("#generatedContent");

  if (!container) {
    console.error("Elemento #generatedContent não encontrado.");

    return;
  }

  if (!data || !Array.isArray(data.workouts)) {
    toast("Nenhum treino para exibir.");

    return;
  }

  container.innerHTML = data.workouts
    .map(
      (workout) => `
          <div
            class="generated-day"
            data-generated-day="${Number(workout.weekday)}"
          >

            <h3>
              ${escapeHTML(DAYS[workout.weekday] || "Dia")}

              —

              ${escapeHTML(workout.name)}
            </h3>

            <div class="generated-exercises">

              ${
                Array.isArray(workout.exercises) && workout.exercises.length
                  ? workout.exercises
                      .map(
                        (exercise, index) => `
                          <div class="generated-exercise">

                            <input
                              type="text"
                              value="${escapeHTML(exercise.name || "")}"
                              data-name
                              data-index="${index}"
                              placeholder="Exercício"
                            >

                            <input
                              type="number"
                              min="1"
                              value="${exercise.sets ?? ""}"
                              data-sets
                              data-index="${index}"
                              placeholder="Séries"
                            >

                            <input
                              type="text"
                              value="${escapeHTML(exercise.reps || "")}"
                              data-reps
                              data-index="${index}"
                              placeholder="Reps"
                            >

                            <input
                              type="number"
                              min="0"
                              step="0.5"
                              value="${exercise.weight ?? ""}"
                              data-weight
                              data-index="${index}"
                              placeholder="Kg"
                            >

                          </div>
                        `,
                      )
                      .join("")
                  : `
                    <p>
                      Nenhum exercício encontrado.
                    </p>
                  `
              }

            </div>

          </div>
        `,
    )
    .join("");

  $("#generatedWorkout")?.classList.remove("hidden");
}

/* =========================================================
   SALVAR TREINOS GERADOS
========================================================= */

const saveGeneratedButton = $("#saveGeneratedButton");

if (saveGeneratedButton) {
  saveGeneratedButton.addEventListener("click", saveGeneratedWorkouts);
}

async function saveGeneratedWorkouts() {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return;
  }

  if (
    !generatedWorkout ||
    !Array.isArray(generatedWorkout.workouts) ||
    generatedWorkout.workouts.length === 0
  ) {
    toast("Nenhum treino foi gerado.");

    return;
  }

  if (savingWorkout) {
    toast("Já existe um salvamento em andamento.");

    return;
  }

  const button = $("#saveGeneratedButton");

  if (button) {
    button.disabled = true;
    button.textContent = "Salvando...";
  }

  let savedCount = 0;

  try {
    for (const generated of generatedWorkout.workouts) {
      if (!generated) {
        continue;
      }

      const dayElement = document.querySelector(
        `[data-generated-day="${Number(generated.weekday)}"]`,
      );

      let exercises = [];

      /*
       * Primeiro tenta pegar os dados
       * que o usuário editou na prévia.
       */

      if (dayElement) {
        const rows = [...dayElement.querySelectorAll(".generated-exercise")];

        exercises = rows
          .map((row, index) => {
            const name = row.querySelector("[data-name]")?.value?.trim();

            if (!name) {
              return null;
            }

            return {
              name,

              sets: numberOrNull(row.querySelector("[data-sets]")?.value),

              reps: normalizeText(row.querySelector("[data-reps]")?.value),

              weight: numberOrNull(row.querySelector("[data-weight]")?.value),

              position: index,
            };
          })
          .filter(Boolean);
      }

      /*
       * Fallback para os dados originais.
       */

      if (exercises.length === 0 && Array.isArray(generated.exercises)) {
        exercises = prepareExercises(generated.exercises);
      }

      /*
       * Aqui está a correção principal:
       * todos os nomes são tratados como
       * texto normal.
       *
       * "Peito + Tríceps"
       * "Costas + Bíceps"
       * "Ombros + Core"
       *
       * não recebem tratamento especial.
       */

      const saved = await saveWorkout({
        name: String(generated.name || "Treino gerado").trim(),

        weekday: Number(generated.weekday),

        notes: generated.notes || null,

        exercises,
      });

      if (!saved) {
        throw new Error(`Não foi possível salvar "${generated.name}".`);
      }

      savedCount++;
    }

    if (savedCount !== generatedWorkout.workouts.length) {
      throw new Error(
        `${savedCount} de ${generatedWorkout.workouts.length} treinos foram salvos.`,
      );
    }

    generatedWorkout = null;

    $("#generatedWorkout")?.classList.add("hidden");

    toast(`${savedCount} treinos salvos com sucesso.`);

    await loadWorkouts();

    const treinosTab = document.querySelector('.tab[data-section="treinos"]');

    if (treinosTab) {
      treinosTab.click();
    }
  } catch (error) {
    console.error("saveGeneratedWorkouts:", error);

    toast(
      getErrorMessage(error, "Não foi possível salvar os treinos gerados."),
    );
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Salvar todos os treinos";
    }
  }
}

/* =========================================================
   PDF
========================================================= */

const pdfInput = $("#pdfInput");

if (pdfInput) {
  pdfInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    validateAndSetPdf(file);
  });
}

function validateAndSetPdf(file) {
  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    toast("Selecione um arquivo PDF.");

    if ($("#pdfInput")) {
      $("#pdfInput").value = "";
    }

    return false;
  }

  if (file.size > 10 * 1024 * 1024) {
    toast("O PDF deve ter no máximo 10 MB.");

    if ($("#pdfInput")) {
      $("#pdfInput").value = "";
    }

    return false;
  }

  selectedPdf = file;

  const selectedFile = $("#selectedFile");

  if (selectedFile) {
    selectedFile.textContent = `${file.name} — ${(
      file.size /
      1024 /
      1024
    ).toFixed(2)} MB`;
  }

  const importButton = $("#importPdfButton");

  if (importButton) {
    importButton.disabled = false;
  }

  return true;
}

/* =========================================================
   DRAG AND DROP PDF
========================================================= */

const uploadArea = $("#uploadArea");

if (uploadArea) {
  uploadArea.addEventListener("dragover", (event) => {
    event.preventDefault();

    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", (event) => {
    event.preventDefault();

    uploadArea.classList.remove("dragover");

    const file = event.dataTransfer?.files?.[0];

    if (!file) {
      return;
    }

    validateAndSetPdf(file);
  });
}

/* =========================================================
   IMPORTAR PDF
========================================================= */

const importPdfButton = $("#importPdfButton");

if (importPdfButton) {
  importPdfButton.addEventListener("click", importPdf);
}

async function importPdf() {
  if (!selectedPdf) {
    toast("Selecione um PDF primeiro.");

    return;
  }

  showLoading(true);

  try {
    const text = await readPdfDirectly(selectedPdf);

    if (!text?.trim()) {
      throw new Error("Não foi possível encontrar texto no PDF.");
    }

    importedWorkout = parseWorkoutFromPdf(text);

    if (!importedWorkout) {
      throw new Error("Não foi possível interpretar o treino.");
    }

    renderPdfPreview(importedWorkout);

    toast("PDF analisado com sucesso.");
  } catch (error) {
    console.error("importPdf:", error);

    toast(getErrorMessage(error, "Erro ao importar PDF."));
  } finally {
    showLoading(false);
  }
}

/* =========================================================
   LER PDF
========================================================= */

async function readPdfDirectly(file) {
  if (!window.pdfjsLib) {
    await loadPdfJs();
  }

  if (!window.pdfjsLib) {
    throw new Error("O leitor de PDF não foi carregado.");
  }

  const arrayBuffer = await file.arrayBuffer();

  const pdf = await window.pdfjsLib.getDocument({
    data: arrayBuffer,
  }).promise;

  let fullText = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);

    const content = await page.getTextContent();

    const pageText = content.items.map((item) => item.str || "").join(" ");

    fullText += pageText + "\n";
  }

  return fullText;
}

/* =========================================================
   PDF.JS
========================================================= */

function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve();
      return;
    }

    const script = document.createElement("script");

    script.src =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

    script.onload = () => {
      if (!window.pdfjsLib) {
        reject(new Error("Não foi possível inicializar o leitor de PDF."));

        return;
      }

      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

      resolve();
    };

    script.onerror = () => {
      reject(new Error("Não foi possível carregar o leitor de PDF."));
    };

    document.head.appendChild(script);
  });
}

/* =========================================================
   INTERPRETAR PDF
========================================================= */

function parseWorkoutFromPdf(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const lowerText = text.toLowerCase();

  let weekday = 1;

  const dayNames = [
    {
      day: 0,
      names: ["domingo"],
    },

    {
      day: 1,
      names: ["segunda", "segunda-feira"],
    },

    {
      day: 2,
      names: ["terça", "terça-feira", "terca", "terca-feira"],
    },

    {
      day: 3,
      names: ["quarta", "quarta-feira"],
    },

    {
      day: 4,
      names: ["quinta", "quinta-feira"],
    },

    {
      day: 5,
      names: ["sexta", "sexta-feira"],
    },

    {
      day: 6,
      names: ["sábado", "sabado"],
    },
  ];

  for (const item of dayNames) {
    if (item.names.some((name) => lowerText.includes(name))) {
      weekday = item.day;

      break;
    }
  }

  let workoutName = "Treino importado";

  const possibleTitle = lines.find((line) =>
    /treino|workout|peito|costas|perna|pernas|ombro|braço|braco/i.test(line),
  );

  if (possibleTitle) {
    workoutName = possibleTitle.substring(0, 100).trim();
  }

  const exercises = [];

  for (const line of lines) {
    const match = line.match(
      /^(.+?)\s+(\d+)\s*(?:x|×)\s*([\d\-–]+)(?:\s+([\d,.]+)\s*(?:kg|kgs)?)?$/i,
    );

    if (!match) {
      continue;
    }

    const name = match[1].trim().replace(/\s+/g, " ");

    if (name.length < 2) {
      continue;
    }

    const sets = Number(match[2]);

    const reps = match[3];

    const weight = match[4] ? Number(match[4].replace(",", ".")) : null;

    exercises.push({
      name,

      sets: Number.isFinite(sets) ? sets : null,

      reps,

      weight,

      notes: null,

      position: exercises.length,
    });
  }

  return {
    name: workoutName,

    weekday,

    notes: "Treino importado de PDF.",

    exercises,
  };
}

/* =========================================================
   PRÉVIA PDF
========================================================= */

function renderPdfPreview(workout) {
  const container = $("#pdfPreviewContent");

  if (!container) {
    return;
  }

  const exercises = Array.isArray(workout.exercises) ? workout.exercises : [];

  container.innerHTML = `
    <div class="field">

      <label for="pdfWorkoutName">
        Nome do treino
      </label>

      <input
        id="pdfWorkoutName"
        value="${escapeHTML(workout.name || "Treino importado")}"
      >

    </div>

    <div class="field">

      <label for="pdfWorkoutDay">
        Dia da semana
      </label>

      <select id="pdfWorkoutDay">

        ${Object.entries(DAYS)
          .map(
            ([value, name]) => `
              <option
                value="${value}"
                ${Number(value) === Number(workout.weekday) ? "selected" : ""}
              >
                ${escapeHTML(name)}
              </option>
            `,
          )
          .join("")}

      </select>

    </div>

    <div class="field">

      <label for="pdfWorkoutNotes">
        Observações
      </label>

      <textarea
        id="pdfWorkoutNotes"
        rows="3"
      >${escapeHTML(workout.notes || "")}</textarea>

    </div>

    <div>

      <div class="exercise-title">

        <h3>
          Exercícios
        </h3>

        <button
          type="button"
          id="addPdfExerciseButton"
          class="secondary-button"
        >
          + Exercício
        </button>

      </div>

      <div id="pdfExercises">

        ${exercises.map((exercise) => createPdfExerciseHTML(exercise)).join("")}

      </div>

    </div>
  `;

  const addButton = $("#addPdfExerciseButton");

  if (addButton) {
    addButton.addEventListener("click", () => addPdfExerciseRow());
  }

  $$("#pdfExercises .pdf-remove-exercise").forEach((button) => {
    button.addEventListener("click", () =>
      button.closest(".exercise-row")?.remove(),
    );
  });

  $("#pdfPreview")?.classList.remove("hidden");
}

/* =========================================================
   HTML EXERCÍCIO PDF
========================================================= */

function createPdfExerciseHTML(data = {}) {
  return `
    <div class="exercise-row">

      <input
        class="pdf-name"
        value="${escapeHTML(data.name || "")}"
        placeholder="Exercício"
      >

      <input
        class="pdf-sets"
        type="number"
        min="1"
        value="${data.sets ?? ""}"
        placeholder="Séries"
      >

      <input
        class="pdf-reps"
        value="${escapeHTML(data.reps || "")}"
        placeholder="Reps"
      >

      <input
        class="pdf-weight"
        type="number"
        min="0"
        step="0.5"
        value="${data.weight ?? ""}"
        placeholder="Kg"
      >

      <button
        type="button"
        class="remove-exercise pdf-remove-exercise"
      >
        ×
      </button>

    </div>
  `;
}

/* =========================================================
   ADICIONAR EXERCÍCIO PDF
========================================================= */

function addPdfExerciseRow(data = {}) {
  const container = $("#pdfExercises");

  if (!container) {
    return;
  }

  const wrapper = document.createElement("div");

  wrapper.innerHTML = createPdfExerciseHTML(data);

  const row = wrapper.firstElementChild;

  if (!row) {
    return;
  }

  const removeButton = row.querySelector(".pdf-remove-exercise");

  if (removeButton) {
    removeButton.addEventListener("click", () => row.remove());
  }

  container.appendChild(row);
}

/* =========================================================
   SALVAR PDF
========================================================= */

const savePdfWorkoutButton = $("#savePdfWorkoutButton");

if (savePdfWorkoutButton) {
  savePdfWorkoutButton.addEventListener("click", savePdfWorkout);
}

async function savePdfWorkout() {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return;
  }

  if (savingWorkout) {
    toast("Já existe um salvamento em andamento.");

    return;
  }

  const name = $("#pdfWorkoutName")?.value?.trim();

  const weekday = Number($("#pdfWorkoutDay")?.value);

  const notes =
    $("#pdfWorkoutNotes")?.value?.trim() || "Treino importado de PDF.";

  if (!name) {
    toast("Informe o nome do treino.");

    return;
  }

  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    toast("Selecione um dia válido.");

    return;
  }

  const rows = [...document.querySelectorAll("#pdfExercises .exercise-row")];

  const exercises = rows
    .map((row, index) => {
      const exerciseName = row.querySelector(".pdf-name")?.value?.trim();

      if (!exerciseName) {
        return null;
      }

      return {
        name: exerciseName,

        sets: numberOrNull(row.querySelector(".pdf-sets")?.value),

        reps: normalizeText(row.querySelector(".pdf-reps")?.value),

        weight: numberOrNull(row.querySelector(".pdf-weight")?.value),

        position: index,
      };
    })
    .filter(Boolean);

  const button = $("#savePdfWorkoutButton");

  if (button) {
    button.disabled = true;

    button.textContent = "Salvando...";
  }

  try {
    const saved = await saveWorkout({
      name,

      weekday,

      notes,

      exercises,
    });

    if (!saved) {
      throw new Error("O treino do PDF não foi salvo.");
    }

    importedWorkout = null;

    selectedPdf = null;

    $("#pdfPreview")?.classList.add("hidden");

    if ($("#pdfInput")) {
      $("#pdfInput").value = "";
    }

    if ($("#importPdfButton")) {
      $("#importPdfButton").disabled = true;
    }

    if ($("#selectedFile")) {
      $("#selectedFile").textContent = "Nenhum arquivo selecionado";
    }

    await loadWorkouts();

    const treinosTab = document.querySelector('.tab[data-section="treinos"]');

    if (treinosTab) {
      treinosTab.click();
    }

    toast("Treino do PDF salvo com sucesso.");
  } catch (error) {
    console.error("savePdfWorkout:", error);

    toast(getErrorMessage(error, "Não foi possível salvar o treino do PDF."));
  } finally {
    if (button) {
      button.disabled = false;

      button.textContent = "Salvar treino";
    }
  }
}

/* =========================================================
   EVOLUÇÃO DE CARGA
========================================================= */

let progressData = [];

async function loadProgress() {
  if (!currentUser) {
    return;
  }

  /*
   * A aba de evolução é opcional.
   * Se o HTML ainda não tiver seus elementos,
   * simplesmente não faz nada.
   */

  const progressContainer =
    $("#progressList") || $("#progressTimeline") || $("#timeline");

  if (!progressContainer) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from("workout_progress")
      .select(
        `
          id,
          user_id,
          workout_id,
          exercise_name,
          weight,
          reps,
          recorded_at
        `,
      )
      .eq("user_id", currentUser.id)
      .order("recorded_at", {
        ascending: false,
      });

    if (error) {
      console.error("Erro ao carregar evolução:", error);

      return;
    }

    progressData = Array.isArray(data) ? data : [];

    renderProgress(progressData);
  } catch (error) {
    console.error("loadProgress:", error);
  }
}

function renderProgress(data) {
  const container =
    $("#progressList") || $("#progressTimeline") || $("#timeline");

  if (!container) {
    return;
  }

  if (!Array.isArray(data) || data.length === 0) {
    container.innerHTML = `
      <div class="empty">
        Nenhuma evolução de carga registrada.
      </div>
    `;

    return;
  }

  container.innerHTML = data
    .map(
      (item) => `
          <div class="timeline-item">

            <div class="timeline-dot"></div>

            <div class="timeline-content">

              <strong>
                ${escapeHTML(item.exercise_name || "Exercício")}
              </strong>

              <span>
                ${
                  item.weight !== null && item.weight !== undefined
                    ? `${item.weight} kg`
                    : "Sem carga"
                }

                ${item.reps ? ` × ${escapeHTML(item.reps)}` : ""}
              </span>

              <small>
                ${
                  item.recorded_at
                    ? new Date(item.recorded_at).toLocaleString("pt-BR")
                    : ""
                }
              </small>

            </div>

          </div>
        `,
    )
    .join("");
}

/* =========================================================
   SALVAR EVOLUÇÃO
========================================================= */

async function saveProgress(data) {
  if (!currentUser) {
    toast("Usuário não autenticado.");

    return false;
  }

  const exerciseName = String(
    data?.exercise_name || data?.exerciseName || "",
  ).trim();

  const weight = numberOrNull(data?.weight);

  const reps = normalizeText(data?.reps);

  if (!exerciseName) {
    toast("Selecione um exercício.");

    return false;
  }

  if (weight === null || weight < 0) {
    toast("Informe uma carga válida.");

    return false;
  }

  try {
    const { error } = await supabase.from("workout_progress").insert({
      user_id: currentUser.id,

      workout_id: data?.workout_id || data?.workoutId || null,

      exercise_name: exerciseName,

      weight,

      reps,

      recorded_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    toast("Evolução registrada.");

    await loadProgress();

    return true;
  } catch (error) {
    console.error("saveProgress:", error);

    toast(getErrorMessage(error, "Não foi possível registrar a evolução."));

    return false;
  }
}

/* =========================================================
   SELEÇÃO DE EXERCÍCIO PARA EVOLUÇÃO
========================================================= */

async function loadExerciseSelector() {
  const selector =
    $("#progressExercise") || $("#exerciseSelect") || $("#timelineExercise");

  if (!selector) {
    return;
  }

  if (!currentUser) {
    return;
  }

  try {
    const { data, error } = await supabase
      .from("workouts")
      .select(
        `
          id,
          name,
          exercises (
            id,
            name
          )
        `,
      )
      .eq("user_id", currentUser.id);

    if (error) {
      console.error("Erro ao carregar exercícios:", error);

      return;
    }

    const exercises = [];

    for (const workout of data || []) {
      for (const exercise of workout.exercises || []) {
        exercises.push({
          id: exercise.id,
          name: exercise.name,
          workoutId: workout.id,
          workoutName: workout.name,
        });
      }
    }

    /*
     * Remove duplicados pelo nome.
     */

    const unique = exercises.filter(
      (exercise, index, array) =>
        index ===
        array.findIndex(
          (item) => item.name.toLowerCase() === exercise.name.toLowerCase(),
        ),
    );

    selector.innerHTML = `
      <option value="">
        Selecione um exercício
      </option>

      ${unique
        .map(
          (exercise) => `
            <option
              value="${escapeHTML(exercise.name)}"
              data-workout-id="${escapeHTML(exercise.workoutId)}"
            >
              ${escapeHTML(exercise.name)}
            </option>
          `,
        )
        .join("")}
    `;
  } catch (error) {
    console.error("loadExerciseSelector:", error);
  }
}

/* =========================================================
   EVENTO DE SALVAR EVOLUÇÃO
========================================================= */

const saveProgressButton = $("#saveProgressButton");

if (saveProgressButton) {
  saveProgressButton.addEventListener("click", async () => {
    const selector =
      $("#progressExercise") || $("#exerciseSelect") || $("#timelineExercise");

    const weightInput = $("#progressWeight") || $("#weightProgress");

    const repsInput = $("#progressReps") || $("#repsProgress");

    if (!selector) {
      toast("Seletor de exercício não encontrado.");

      return;
    }

    const selected = selector.options[selector.selectedIndex];

    const exerciseName = selector.value?.trim();

    const workoutId = selected?.dataset?.workoutId || null;

    await saveProgress({
      exercise_name: exerciseName,

      workout_id: workoutId,

      weight: weightInput?.value,

      reps: repsInput?.value,
    });
  });
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

checkUser();

document.addEventListener("DOMContentLoaded", () => {
  /*
   * Caso os elementos da aba de
   * evolução já estejam no HTML.
   */

  loadExerciseSelector();
});
