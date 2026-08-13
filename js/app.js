import { supabase } from "./supabase.js";

/* =========================================================
   CONFIGURAÇÃO
========================================================= */

const DAYS = {
    0: "Domingo",
    1: "Segunda-feira",
    2: "Terça-feira",
    3: "Quarta-feira",
    4: "Quinta-feira",
    5: "Sexta-feira",
    6: "Sábado"
};

let currentUser = null;
let currentProfile = null;

let generatedWorkout = null;
let importedWorkout = null;
let selectedPdf = null;
let editingWorkoutId = null;
let savingWorkout = false;

let monitorUsers = [];
let selectedMonitorUserId = null;

/* =========================================================
   UTILITÁRIOS
========================================================= */

const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

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

    const normalized = String(value)
        .replace(",", ".")
        .trim();

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
    if (!error) return fallback;

    if (typeof error === "string") {
        return error;
    }

    return (
        error.message ||
        error.details ||
        error.hint ||
        fallback
    );
}

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

/* =========================================================
   AUTENTICAÇÃO / RBAC
========================================================= */

async function checkUser() {
    try {
        const {
            data: { user },
            error
        } = await supabase.auth.getUser();

        if (error || !user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        await loadProfile();

        if (!currentProfile) {
            toast("Não foi possível carregar seu perfil.");
            return;
        }

        applyRoleInterface();

        await loadWorkouts();
        await loadProgress();
        await loadExerciseSelector();

        if (currentProfile.role === "admin") {
            await loadAdminDashboard();
        }

        if (currentProfile.role === "monitor") {
            await loadMonitorUsers();
        }

    } catch (error) {
        console.error("checkUser:", error);
        window.location.href = "login.html";
    }
}

async function loadProfile() {
    const { data, error } = await supabase
        .from("profiles")
        .select("id,email,display_name,role")
        .eq("id", currentUser.id)
        .single();

    if (error) {
        console.error("loadProfile:", error);
        return;
    }

    currentProfile = data;
}

function applyRoleInterface() {
    if (!currentProfile) return;

    const role = currentProfile.role || "user";

    const nameElement = $("#userName");
    const roleElement = $("#userRole");

    if (nameElement) {
        nameElement.textContent =
            currentProfile.display_name ||
            currentProfile.email ||
            "Usuário";
    }

    if (roleElement) {
        roleElement.textContent = role.toUpperCase();
    }

    $$("[data-role]").forEach(element => {
        const allowed = element.dataset.role
            .split(",")
            .map(value => value.trim());

        element.hidden = !allowed.includes(role);
    });

    const adminLink = $("#adminLink");

    if (adminLink) {
        adminLink.hidden = role !== "admin";
    }
}

/* =========================================================
   LOGOUT
========================================================= */

const logoutButton = $("#logoutButton");

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });
}

/* =========================================================
   TABS
========================================================= */

$$(".tab").forEach(button => {
    button.addEventListener("click", async () => {
        $$(".tab").forEach(tab =>
            tab.classList.remove("active")
        );

        $$(".section").forEach(section =>
            section.classList.remove("active")
        );

        button.classList.add("active");

        const section =
            $("#section-" + button.dataset.section);

        if (section) {
            section.classList.add("active");
        }

        if (button.dataset.section === "evolucao") {
            await loadProgress();
        }
    });
});

/* =========================================================
   TEMA
========================================================= */

const savedTheme =
    localStorage.getItem("trainer-face-theme");

if (savedTheme === "light") {
    document.body.classList.add("light");
}

const themeButton = $("#themeButton");

if (themeButton) {
    themeButton.addEventListener("click", () => {
        document.body.classList.toggle("light");

        localStorage.setItem(
            "trainer-face-theme",
            document.body.classList.contains("light")
                ? "light"
                : "dark"
        );
    });
}

/* =========================================================
   RBAC — USUÁRIO ALVO
========================================================= */

function getTargetUserId() {
    if (
        currentProfile?.role === "admin" &&
        selectedMonitorUserId
    ) {
        return selectedMonitorUserId;
    }

    if (
        currentProfile?.role === "monitor" &&
        selectedMonitorUserId
    ) {
        return selectedMonitorUserId;
    }

    return currentUser?.id || null;
}

/* =========================================================
   TREINOS
========================================================= */

async function loadWorkouts() {
    if (!currentUser || !currentProfile) return;

    showLoading(true);

    try {
        const targetUserId = getTargetUserId();

        let query = supabase
            .from("workouts")
            .select(`
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
      `)
            .order("weekday", {
                ascending: true
            });

        /*
         * USER:
         * somente os próprios treinos.
         *
         * MONITOR:
         * somente do usuário selecionado.
         *
         * ADMIN:
         * pode visualizar todos.
         */

        if (currentProfile.role === "user") {
            query = query.eq(
                "user_id",
                currentUser.id
            );
        }

        if (
            currentProfile.role === "monitor" &&
            targetUserId
        ) {
            query = query.eq(
                "user_id",
                targetUserId
            );
        }

        if (
            currentProfile.role === "admin" &&
            selectedMonitorUserId
        ) {
            query = query.eq(
                "user_id",
                selectedMonitorUserId
            );
        }

        const {
            data,
            error
        } = await query;

        if (error) {
            throw error;
        }

        renderWorkouts(data || []);

    } catch (error) {
        console.error("loadWorkouts:", error);

        toast(
            "Erro ao carregar treinos: " +
            getErrorMessage(error)
        );

    } finally {
        showLoading(false);
    }
}

function renderWorkouts(workouts) {
    const container = $("#workoutList");

    if (!container) return;

    if (!workouts.length) {
        container.innerHTML = `
      <div class="empty">
        Nenhum treino encontrado.
      </div>
    `;

        return;
    }

    container.innerHTML = workouts
        .map(workout => {
            const exercises =
                [...(workout.exercises || [])]
                    .sort(
                        (a, b) =>
                            (a.position ?? 0) -
                            (b.position ?? 0)
                    );

            const canEdit =
                currentProfile?.role === "user" ||
                currentProfile?.role === "admin";

            return `
        <article class="workout-card">

          <span class="workout-day">
            ${escapeHTML(
                DAYS[workout.weekday] ||
                "Dia não definido"
            )}
          </span>

          <h3>
            ${escapeHTML(workout.name)}
          </h3>

          ${workout.notes
                    ? `<p>${escapeHTML(workout.notes)}</p>`
                    : ""
                }

          <ul class="exercise-list">

            ${exercises.length
                    ? exercises.map(exercise => `
                    <li>

                      <strong>
                        ${escapeHTML(exercise.name)}
                      </strong>

                      <br>

                      ${exercise.sets != null
                            ? `${escapeHTML(
                                exercise.sets
                            )} séries`
                            : ""
                        }

                      ${exercise.reps
                            ? ` × ${escapeHTML(
                                exercise.reps
                            )}`
                            : ""
                        }

                      ${exercise.weight != null
                            ? ` — ${exercise.weight} kg`
                            : ""
                        }

                    </li>
                  `).join("")
                    : `
                    <li>
                      Nenhum exercício.
                    </li>
                  `
                }

          </ul>

          ${canEdit
                    ? `
                <div class="card-actions">

                  <button
                    type="button"
                    class="primary-button edit-button"
                    data-edit="${escapeHTML(
                        workout.id
                    )}"
                  >
                    Editar
                  </button>

                  <button
                    type="button"
                    class="secondary-button delete-button"
                    data-delete="${escapeHTML(
                        workout.id
                    )}"
                  >
                    Excluir
                  </button>

                </div>
              `
                    : ""
                }

        </article>
      `;
        })
        .join("");

    $$("[data-delete]").forEach(button => {
        button.addEventListener("click", () => {
            deleteWorkout(button.dataset.delete);
        });
    });

    $$("[data-edit]").forEach(button => {
        button.addEventListener("click", () => {
            openEditWorkout(button.dataset.edit);
        });
    });
}

/* =========================================================
   EXCLUIR TREINO
========================================================= */

async function deleteWorkout(id) {
    if (!currentUser) return;

    if (
        currentProfile.role !== "user" &&
        currentProfile.role !== "admin"
    ) {
        toast("Seu perfil não pode excluir treinos.");
        return;
    }

    if (!confirm("Excluir este treino?")) {
        return;
    }

    showLoading(true);

    try {
        const {
            data: workout
        } = await supabase
            .from("workouts")
            .select("user_id")
            .eq("id", id)
            .single();

        if (!workout) {
            throw new Error("Treino não encontrado.");
        }

        if (
            currentProfile.role === "user" &&
            workout.user_id !== currentUser.id
        ) {
            throw new Error("Acesso negado.");
        }

        const {
            error: exerciseError
        } = await supabase
            .from("exercises")
            .delete()
            .eq("workout_id", id);

        if (exerciseError) {
            throw exerciseError;
        }

        const {
            error: workoutError
        } = await supabase
            .from("workouts")
            .delete()
            .eq("id", id);

        if (workoutError) {
            throw workoutError;
        }

        toast("Treino excluído.");

        await loadWorkouts();
        await loadProgress();

    } catch (error) {
        console.error(error);

        toast(
            "Erro ao excluir: " +
            getErrorMessage(error)
        );

    } finally {
        showLoading(false);
    }
}

/* =========================================================
   MODAL
========================================================= */

const newWorkoutButton =
    $("#newWorkoutButton");

if (newWorkoutButton) {
    newWorkoutButton.addEventListener(
        "click",
        () => {

            if (
                currentProfile?.role !== "user" &&
                currentProfile?.role !== "admin"
            ) {
                toast(
                    "Somente USER e ADMIN podem criar treinos."
                );

                return;
            }

            editingWorkoutId = null;

            $("#workoutModal")
                ?.classList.remove("hidden");

            $("#workoutModal h2").textContent =
                "Criar treino";

            const button =
                $("#manualWorkoutForm button[type='submit']");

            if (button) {
                button.textContent =
                    "Salvar treino";
            }

            $("#manualWorkoutForm")?.reset();

            $("#manualExercises").innerHTML = "";

            addExerciseRow();
        }
    );
}

const closeModalButton =
    $("#closeModal");

if (closeModalButton) {
    closeModalButton.addEventListener(
        "click",
        closeModal
    );
}

function closeModal() {
    $("#workoutModal")
        ?.classList.add("hidden");

    editingWorkoutId = null;

    $("#manualWorkoutForm")?.reset();

    const exercises =
        $("#manualExercises");

    if (exercises) {
        exercises.innerHTML = "";
    }
}

/* =========================================================
   EXERCÍCIOS MANUAIS
========================================================= */

const addExerciseButton =
    $("#addExerciseButton");

if (addExerciseButton) {
    addExerciseButton.addEventListener(
        "click",
        () => addExerciseRow()
    );
}

function addExerciseRow(data = {}) {
    const container =
        $("#manualExercises");

    if (!container) return;

    const row =
        document.createElement("div");

    row.className =
        "exercise-row";

    row.innerHTML = `
    <input
      class="exercise-name"
      placeholder="Exercício"
      value="${escapeHTML(
        data.name || ""
    )}"
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
      value="${escapeHTML(
        data.reps || ""
    )}"
    >

    <input
      class="exercise-weight"
      type="number"
      min="0"
      step="0.5"
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
        ?.addEventListener(
            "click",
            () => row.remove()
        );

    container.appendChild(row);
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

            const name =
                String(
                    exercise?.name || ""
                ).trim();

            if (!name) return null;

            return {
                name,
                sets: numberOrNull(
                    exercise.sets
                ),
                reps: normalizeText(
                    exercise.reps
                ),
                weight: numberOrNull(
                    exercise.weight
                ),
                notes: normalizeText(
                    exercise.notes
                ),
                position: index
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

    if (
        currentProfile.role !== "user" &&
        currentProfile.role !== "admin"
    ) {
        toast(
            "Seu perfil não pode criar treinos."
        );

        return false;
    }

    if (savingWorkout) {
        return false;
    }

    const name =
        String(workout?.name || "").trim();

    const weekday =
        Number(workout?.weekday);

    if (!name) {
        toast("Informe o nome.");
        return false;
    }

    if (
        !Number.isInteger(weekday) ||
        weekday < 0 ||
        weekday > 6
    ) {
        toast("Dia inválido.");
        return false;
    }

    const exercises =
        prepareExercises(
            workout.exercises
        );

    savingWorkout = true;
    showLoading(true);

    try {
        const {
            data: inserted,
            error
        } = await supabase
            .from("workouts")
            .insert({
                user_id: currentUser.id,
                name,
                weekday,
                notes:
                    normalizeText(
                        workout.notes
                    )
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        if (
            exercises.length
        ) {
            const rows =
                exercises.map(
                    (exercise, index) => ({
                        workout_id:
                            inserted.id,
                        name:
                            exercise.name,
                        sets:
                            exercise.sets,
                        reps:
                            exercise.reps,
                        weight:
                            exercise.weight,
                        notes:
                            exercise.notes,
                        position:
                            index
                    })
                );

            const {
                error: exerciseError
            } = await supabase
                .from("exercises")
                .insert(rows);

            if (exerciseError) {
                await supabase
                    .from("workouts")
                    .delete()
                    .eq("id", inserted.id);

                throw exerciseError;
            }
        }

        toast("Treino salvo com sucesso.");

        await loadWorkouts();
        await loadExerciseSelector();

        return true;

    } catch (error) {
        console.error(error);

        toast(
            "Erro ao salvar: " +
            getErrorMessage(error)
        );

        return false;

    } finally {
        savingWorkout = false;
        showLoading(false);
    }
}

/* =========================================================
   ATUALIZAR TREINO
========================================================= */

async function openEditWorkout(id) {
    if (
        currentProfile.role !== "user" &&
        currentProfile.role !== "admin"
    ) {
        toast("Seu perfil não pode editar treinos.");
        return;
    }

    showLoading(true);

    try {
        const {
            data,
            error
        } = await supabase
            .from("workouts")
            .select(`
        id,
        user_id,
        name,
        weekday,
        notes,
        exercises (
          id,
          name,
          sets,
          reps,
          weight,
          notes,
          position
        )
      `)
            .eq("id", id)
            .single();

        if (error) {
            throw error;
        }

        if (
            currentProfile.role === "user" &&
            data.user_id !== currentUser.id
        ) {
            throw new Error("Acesso negado.");
        }

        editingWorkoutId = data.id;

        $("#workoutModal")
            ?.classList.remove("hidden");

        $("#workoutModal h2").textContent =
            "Editar treino";

        $("#manualName").value =
            data.name || "";

        $("#manualWeekday").value =
            String(data.weekday);

        $("#manualNotes").value =
            data.notes || "";

        $("#manualExercises").innerHTML = "";

        const exercises =
            [...(data.exercises || [])]
                .sort(
                    (a, b) =>
                        (a.position ?? 0) -
                        (b.position ?? 0)
                );

        exercises.forEach(
            exercise =>
                addExerciseRow(exercise)
        );

        if (!exercises.length) {
            addExerciseRow();
        }

    } catch (error) {
        toast(
            getErrorMessage(
                error,
                "Erro ao abrir treino."
            )
        );
    } finally {
        showLoading(false);
    }
}

const manualWorkoutForm =
    $("#manualWorkoutForm");

if (manualWorkoutForm) {
    manualWorkoutForm.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            if (savingWorkout) return;

            const rows =
                [...document.querySelectorAll(
                    "#manualExercises .exercise-row"
                )];

            const exercises =
                rows.map(
                    (row, index) => {

                        const name =
                            row.querySelector(
                                ".exercise-name"
                            )?.value?.trim();

                        if (!name) return null;

                        return {
                            name,
                            sets:
                                numberOrNull(
                                    row.querySelector(
                                        ".exercise-sets"
                                    )?.value
                                ),
                            reps:
                                normalizeText(
                                    row.querySelector(
                                        ".exercise-reps"
                                    )?.value
                                ),
                            weight:
                                numberOrNull(
                                    row.querySelector(
                                        ".exercise-weight"
                                    )?.value
                                ),
                            position: index
                        };
                    }
                ).filter(Boolean);

            const workout = {
                name:
                    $("#manualName")
                        ?.value?.trim(),
                weekday:
                    Number(
                        $("#manualWeekday")
                            ?.value
                    ),
                notes:
                    $("#manualNotes")
                        ?.value?.trim(),
                exercises
            };

            let success = false;

            if (editingWorkoutId) {
                success =
                    await updateWorkout(
                        editingWorkoutId,
                        workout
                    );
            } else {
                success =
                    await saveWorkout(
                        workout
                    );
            }

            if (success) {
                closeModal();
            }
        }
    );
}

async function updateWorkout(
    workoutId,
    workout
) {
    if (savingWorkout) return false;

    savingWorkout = true;
    showLoading(true);

    try {
        const {
            data,
            error
        } = await supabase
            .from("workouts")
            .update({
                name:
                    String(
                        workout.name || ""
                    ).trim(),
                weekday:
                    Number(workout.weekday),
                notes:
                    normalizeText(
                        workout.notes
                    )
            })
            .eq("id", workoutId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        await supabase
            .from("exercises")
            .delete()
            .eq(
                "workout_id",
                workoutId
            );

        const exercises =
            prepareExercises(
                workout.exercises
            );

        if (exercises.length) {
            const rows =
                exercises.map(
                    (exercise, index) => ({
                        workout_id:
                            workoutId,
                        name:
                            exercise.name,
                        sets:
                            exercise.sets,
                        reps:
                            exercise.reps,
                        weight:
                            exercise.weight,
                        notes:
                            exercise.notes,
                        position:
                            index
                    })
                );

            const {
                error: exerciseError
            } = await supabase
                .from("exercises")
                .insert(rows);

            if (exerciseError) {
                throw exerciseError;
            }
        }

        toast(
            "Treino atualizado."
        );

        await loadWorkouts();
        await loadExerciseSelector();

        return true;

    } catch (error) {
        console.error(error);

        toast(
            "Erro ao atualizar: " +
            getErrorMessage(error)
        );

        return false;

    } finally {
        savingWorkout = false;
        showLoading(false);
    }
}

/* =========================================================
   GERADOR DE TREINOS
========================================================= */

const generatorForm =
    $("#generatorForm");

if (generatorForm) {
    generatorForm.addEventListener(
        "submit",
        event => {

            event.preventDefault();

            generatedWorkout =
                generateWorkout();

            if (generatedWorkout) {
                renderGeneratedWorkout(
                    generatedWorkout
                );
            }
        }
    );
}

function generateWorkout() {
    const days =
        Number(
            $("#daysPerWeek")?.value
        );

    const experience =
        $("#experience")?.value ||
        "iniciante";

    const goal =
        $("#goal")?.value ||
        "geral";

    const equipment =
        $("#equipment")?.value ||
        "academia";

    const split =
        createSplit(days);

    if (!split) {
        toast("Quantidade de dias inválida.");
        return null;
    }

    const database =
        getExercises(
            equipment,
            goal
        );

    return {
        workouts:
            split.map(item => ({
                name:
                    item.name,
                weekday:
                    item.weekday,
                notes:
                    `Sugestão gerada para ${goal}.`,
                exercises:
                    chooseExercises(
                        item,
                        database,
                        experience
                    )
            }))
    };
}

function createSplit(days) {
    const options = {
        2: [
            {
                weekday: 1,
                name: "Treino A — Corpo inteiro"
            },
            {
                weekday: 4,
                name: "Treino B — Corpo inteiro"
            }
        ],

        3: [
            {
                weekday: 1,
                name: "Treino A — Corpo inteiro"
            },
            {
                weekday: 3,
                name: "Treino B — Corpo inteiro"
            },
            {
                weekday: 5,
                name: "Treino C — Corpo inteiro"
            }
        ],

        4: [
            {
                weekday: 1,
                name: "Treino A — Superior"
            },
            {
                weekday: 2,
                name: "Treino B — Inferior"
            },
            {
                weekday: 4,
                name: "Treino C — Superior"
            },
            {
                weekday: 5,
                name: "Treino D — Inferior"
            }
        ],

        5: [
            {
                weekday: 1,
                name: "Peito + Tríceps"
            },
            {
                weekday: 2,
                name: "Costas + Bíceps"
            },
            {
                weekday: 3,
                name: "Pernas"
            },
            {
                weekday: 4,
                name: "Ombros + Core"
            },
            {
                weekday: 5,
                name: "Corpo inteiro"
            }
        ]
    };

    return options[days] || null;
}

function getExercises(
    equipment,
    goal
) {
    if (
        equipment ===
        "peso-corporal"
    ) {
        return {
            peito: [
                "Flexão de braços"
            ],
            costas: [
                "Remada invertida"
            ],
            pernas: [
                "Agachamento livre",
                "Avanço"
            ],
            ombros: [
                "Flexão inclinada"
            ],
            biceps: [
                "Rosca com resistência disponível"
            ],
            triceps: [
                "Flexão com apoio adequado"
            ],
            core: [
                "Prancha",
                "Dead bug"
            ]
        };
    }

    return {
        peito: [
            "Supino com carga adequada",
            "Flexão de braços",
            "Crucifixo"
        ],
        costas: [
            "Puxada",
            "Remada",
            "Remada unilateral"
        ],
        pernas: [
            "Agachamento",
            "Leg press",
            "Elevação de panturrilhas"
        ],
        ombros: [
            "Desenvolvimento de ombros",
            "Elevação lateral",
            "Elevação posterior"
        ],
        biceps: [
            "Rosca de bíceps",
            "Rosca martelo"
        ],
        triceps: [
            "Tríceps na polia",
            "Extensão de tríceps"
        ],
        core: [
            "Prancha",
            "Dead bug"
        ]
    };
}

function chooseExercises(
    split,
    database,
    experience
) {
    const result = [];

    function addGroup(
        group,
        amount
    ) {
        const list =
            database[group] || [];

        list
            .slice(0, amount)
            .forEach(name => {
                result.push({
                    name,
                    sets:
                        experience ===
                            "iniciante"
                            ? 2
                            : 3,
                    reps: "8–12",
                    weight: null,
                    notes: null,
                    position:
                        result.length
                });
            });
    }

    const name =
        split.name.toLowerCase();

    if (
        name.includes("superior") ||
        name.includes("peito")
    ) {
        addGroup("peito", 2);
        addGroup("costas", 2);
        addGroup("ombros", 1);
        addGroup("triceps", 1);
        addGroup("biceps", 1);

    } else if (
        name.includes("inferior") ||
        name.includes("pernas")
    ) {
        addGroup("pernas", 3);
        addGroup("core", 1);

    } else if (
        name.includes("costas")
    ) {
        addGroup("costas", 3);
        addGroup("biceps", 2);

    } else {
        addGroup("pernas", 2);
        addGroup("peito", 1);
        addGroup("costas", 1);
        addGroup("ombros", 1);
        addGroup("core", 1);
    }

    return result;
}

function renderGeneratedWorkout(
    data
) {
    const container =
        $("#generatedContent");

    if (!container) return;

    container.innerHTML =
        data.workouts
            .map(workout => `
        <div
          class="generated-day"
          data-generated-day="${workout.weekday}"
        >

          <h3>
            ${escapeHTML(
                DAYS[workout.weekday]
            )}
            —
            ${escapeHTML(
                workout.name
            )}
          </h3>

          <div class="generated-exercises">

            ${workout.exercises
                    .map(
                        (exercise, index) => `
                    <div
                      class="generated-exercise"
                    >

                      <input
                        type="text"
                        value="${escapeHTML(
                            exercise.name
                        )}"
                        data-name
                        data-index="${index}"
                      >

                      <input
                        type="number"
                        min="1"
                        value="${exercise.sets ?? ""}"
                        data-sets
                        data-index="${index}"
                      >

                      <input
                        type="text"
                        value="${escapeHTML(
                            exercise.reps || ""
                        )}"
                        data-reps
                        data-index="${index}"
                      >

                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value="${exercise.weight ?? ""}"
                        data-weight
                        data-index="${index}"
                      >

                    </div>
                  `
                    )
                    .join("")
                }

          </div>

        </div>
      `)
            .join("");

    $("#generatedWorkout")
        ?.classList.remove("hidden");
}

const saveGeneratedButton =
    $("#saveGeneratedButton");

if (saveGeneratedButton) {
    saveGeneratedButton.addEventListener(
        "click",
        saveGeneratedWorkouts
    );
}

async function saveGeneratedWorkouts() {
    if (!generatedWorkout) {
        toast("Nenhum treino gerado.");
        return;
    }

    for (
        const workout of
        generatedWorkout.workouts
    ) {

        const element =
            document.querySelector(
                `[data-generated-day="${workout.weekday}"]`
            );

        const exercises =
            [...element.querySelectorAll(
                ".generated-exercise"
            )]
                .map(row => ({
                    name:
                        row.querySelector(
                            "[data-name]"
                        )?.value,
                    sets:
                        numberOrNull(
                            row.querySelector(
                                "[data-sets]"
                            )?.value
                        ),
                    reps:
                        normalizeText(
                            row.querySelector(
                                "[data-reps]"
                            )?.value
                        ),
                    weight:
                        numberOrNull(
                            row.querySelector(
                                "[data-weight]"
                            )?.value
                        )
                }))
                .filter(item => item.name);

        const saved =
            await saveWorkout({
                name:
                    workout.name,
                weekday:
                    workout.weekday,
                notes:
                    workout.notes,
                exercises
            });

        if (!saved) return;
    }

    generatedWorkout = null;

    $("#generatedWorkout")
        ?.classList.add("hidden");

    toast(
        "Treinos gerados salvos."
    );

    await loadWorkouts();
}

/* =========================================================
   PDF
========================================================= */

const pdfInput =
    $("#pdfInput");

if (pdfInput) {
    pdfInput.addEventListener(
        "change",
        event => {

            const file =
                event.target.files?.[0];

            if (file) {
                validateAndSetPdf(file);
            }
        }
    );
}

function validateAndSetPdf(file) {
    const valid =
        file.type ===
        "application/pdf" ||
        file.name
            .toLowerCase()
            .endsWith(".pdf");

    if (!valid) {
        toast("Selecione um PDF.");
        return false;
    }

    if (
        file.size >
        10 * 1024 * 1024
    ) {
        toast(
            "PDF máximo: 10 MB."
        );

        return false;
    }

    selectedPdf = file;

    $("#selectedFile").textContent =
        `${file.name} — ${(
            file.size / 1024 / 1024
        ).toFixed(2)} MB`;

    $("#importPdfButton").disabled =
        false;

    return true;
}

const uploadArea =
    $("#uploadArea");

if (uploadArea) {
    uploadArea.addEventListener(
        "dragover",
        event => {
            event.preventDefault();
            uploadArea.classList.add(
                "dragover"
            );
        }
    );

    uploadArea.addEventListener(
        "dragleave",
        () => {
            uploadArea.classList.remove(
                "dragover"
            );
        }
    );

    uploadArea.addEventListener(
        "drop",
        event => {
            event.preventDefault();

            uploadArea.classList.remove(
                "dragover"
            );

            const file =
                event.dataTransfer
                    ?.files?.[0];

            if (file) {
                validateAndSetPdf(file);
            }
        }
    );
}

const importPdfButton =
    $("#importPdfButton");

if (importPdfButton) {
    importPdfButton.addEventListener(
        "click",
        importPdf
    );
}

async function importPdf() {
    if (!selectedPdf) {
        toast(
            "Selecione um PDF."
        );
        return;
    }

    showLoading(true);

    try {
        const text =
            await readPdfDirectly(
                selectedPdf
            );

        importedWorkout =
            parseWorkoutFromPdf(
                text
            );

        renderPdfPreview(
            importedWorkout
        );

        toast(
            "PDF analisado."
        );

    } catch (error) {
        console.error(error);

        toast(
            getErrorMessage(
                error,
                "Erro ao analisar PDF."
            )
        );

    } finally {
        showLoading(false);
    }
}

async function readPdfDirectly(file) {
    if (!window.pdfjsLib) {
        await loadPdfJs();
    }

    const buffer =
        await file.arrayBuffer();

    const pdf =
        await window.pdfjsLib
            .getDocument({
                data: buffer
            })
            .promise;

    let text = "";

    for (
        let page = 1;
        page <= pdf.numPages;
        page++
    ) {

        const current =
            await pdf.getPage(page);

        const content =
            await current.getTextContent();

        text +=
            content.items
                .map(item => item.str)
                .join(" ") +
            "\n";
    }

    return text;
}

function loadPdfJs() {
    return new Promise(
        (resolve, reject) => {

            if (window.pdfjsLib) {
                resolve();
                return;
            }

            const script =
                document.createElement(
                    "script"
                );

            script.src =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";

            script.onload = () => {

                window.pdfjsLib
                    .GlobalWorkerOptions
                    .workerSrc =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

                resolve();
            };

            script.onerror =
                () =>
                    reject(
                        new Error(
                            "Falha ao carregar PDF.js."
                        )
                    );

            document.head.appendChild(
                script
            );
        }
    );
}

function parseWorkoutFromPdf(
    text
) {
    const lines =
        text
            .split(/\r?\n/)
            .map(line =>
                line.trim()
            )
            .filter(Boolean);

    let weekday = 1;

    const days = [
        ["domingo", 0],
        ["segunda", 1],
        ["terça", 2],
        ["terca", 2],
        ["quarta", 3],
        ["quinta", 4],
        ["sexta", 5],
        ["sábado", 6],
        ["sabado", 6]
    ];

    const lower =
        text.toLowerCase();

    for (
        const [name, day]
        of days
    ) {
        if (
            lower.includes(name)
        ) {
            weekday = day;
            break;
        }
    }

    let name =
        "Treino importado";

    const possible =
        lines.find(line =>
            /treino|peito|costas|perna|pernas|ombro|braço|braco/i
                .test(line)
        );

    if (possible) {
        name =
            possible.substring(
                0,
                100
            );
    }

    const exercises = [];

    for (
        const line of lines
    ) {

        const match =
            line.match(
                /^(.+?)\s+(\d+)\s*(?:x|×)\s*([\d\-–]+)(?:\s+([\d,.]+)\s*(?:kg|kgs)?)?$/i
            );

        if (!match) continue;

        exercises.push({
            name:
                match[1].trim(),
            sets:
                Number(match[2]),
            reps:
                match[3],
            weight:
                match[4]
                    ? Number(
                        match[4]
                            .replace(",", ".")
                    )
                    : null,
            position:
                exercises.length
        });
    }

    return {
        name,
        weekday,
        notes:
            "Treino importado de PDF.",
        exercises
    };
}

function renderPdfPreview(
    workout
) {
    const container =
        $("#pdfPreviewContent");

    if (!container) return;

    container.innerHTML = `
    <div class="field">

      <label>
        Nome do treino
      </label>

      <input
        id="pdfWorkoutName"
        value="${escapeHTML(
        workout.name
    )}"
      >

    </div>

    <div class="field">

      <label>
        Dia
      </label>

      <select
        id="pdfWorkoutDay"
      >

        ${Object.entries(DAYS)
            .map(
                ([value, name]) => `
              <option
                value="${value}"
                ${Number(value) ===
                        Number(workout.weekday)
                        ? "selected"
                        : ""
                    }
              >
                ${escapeHTML(name)}
              </option>
            `
            )
            .join("")}

      </select>

    </div>

    <div class="field">

      <label>
        Observações
      </label>

      <textarea
        id="pdfWorkoutNotes"
      >${escapeHTML(
                workout.notes || ""
            )}</textarea>

    </div>

    <div
      id="pdfExercises"
    >

      ${workout.exercises
            .map(
                exercise =>
                    createPdfExerciseHTML(
                        exercise
                    )
            )
            .join("")
        }

    </div>

    <button
      type="button"
      id="addPdfExerciseButton"
      class="secondary-button"
    >
      + Exercício
    </button>
  `;

    $("#addPdfExerciseButton")
        ?.addEventListener(
            "click",
            () => addPdfExerciseRow()
        );

    $$("#pdfExercises .pdf-remove-exercise")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => button
                    .closest(".exercise-row")
                    ?.remove()
            );
        });

    $("#pdfPreview")
        ?.classList.remove("hidden");
}

function createPdfExerciseHTML(
    data = {}
) {
    return `
    <div class="exercise-row">

      <input
        class="pdf-name"
        value="${escapeHTML(
        data.name || ""
    )}"
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
        value="${escapeHTML(
        data.reps || ""
    )}"
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

function addPdfExerciseRow(
    data = {}
) {
    const container =
        $("#pdfExercises");

    if (!container) return;

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.innerHTML =
        createPdfExerciseHTML(
            data
        );

    const row =
        wrapper.firstElementChild;

    const remove =
        row.querySelector(
            ".pdf-remove-exercise"
        );

    remove.addEventListener(
        "click",
        () => row.remove()
    );

    container.appendChild(
        row
    );
}

const savePdfWorkoutButton =
    $("#savePdfWorkoutButton");

if (savePdfWorkoutButton) {
    savePdfWorkoutButton.addEventListener(
        "click",
        savePdfWorkout
    );
}

async function savePdfWorkout() {
    const rows =
        [...document.querySelectorAll(
            "#pdfExercises .exercise-row"
        )];

    const exercises =
        rows.map(
            row => ({
                name:
                    row.querySelector(
                        ".pdf-name"
                    )?.value?.trim(),
                sets:
                    numberOrNull(
                        row.querySelector(
                            ".pdf-sets"
                        )?.value
                    ),
                reps:
                    normalizeText(
                        row.querySelector(
                            ".pdf-reps"
                        )?.value
                    ),
                weight:
                    numberOrNull(
                        row.querySelector(
                            ".pdf-weight"
                        )?.value
                    )
            })
        )
            .filter(item =>
                item.name
            );

    const saved =
        await saveWorkout({
            name:
                $("#pdfWorkoutName")
                    ?.value?.trim(),
            weekday:
                Number(
                    $("#pdfWorkoutDay")
                        ?.value
                ),
            notes:
                $("#pdfWorkoutNotes")
                    ?.value?.trim(),
            exercises
        });

    if (!saved) return;

    importedWorkout = null;
    selectedPdf = null;

    $("#pdfPreview")
        ?.classList.add("hidden");

    $("#pdfInput").value = "";
    $("#importPdfButton").disabled =
        true;

    $("#selectedFile").textContent =
        "Nenhum arquivo selecionado";

    await loadWorkouts();

    toast(
        "Treino do PDF salvo."
    );
}

/* =========================================================
   EVOLUÇÃO DE CARGA
========================================================= */

async function loadProgress() {
    if (!currentUser) return;

    const targetUserId =
        getTargetUserId();

    let query =
        supabase
            .from("load_history")
            .select(`
        id,
        user_id,
        exercise_id,
        workout_id,
        exercise_name,
        weight,
        reps,
        sets,
        recorded_at,
        recorded_by
      `)
            .order(
                "recorded_at",
                {
                    ascending: false
                }
            );

    if (
        currentProfile.role === "user"
    ) {
        query =
            query.eq(
                "user_id",
                currentUser.id
            );
    }

    if (
        currentProfile.role === "monitor" &&
        targetUserId
    ) {
        query =
            query.eq(
                "user_id",
                targetUserId
            );
    }

    if (
        currentProfile.role === "admin" &&
        selectedMonitorUserId
    ) {
        query =
            query.eq(
                "user_id",
                selectedMonitorUserId
            );
    }

    const {
        data,
        error
    } = await query;

    if (error) {
        console.error(
            "loadProgress:",
            error
        );
        return;
    }

    renderProgress(
        data || []
    );
}

function renderProgress(
    data
) {
    const container =
        $("#progressTimelineContent") ||
        $("#progressList") ||
        $("#timeline");

    if (!container) return;

    if (!data.length) {
        container.innerHTML = `
      <div class="empty">
        Nenhum registro de carga.
      </div>
    `;

        return;
    }

    container.innerHTML =
        data.map(item => `
      <div class="timeline-item">

        <div>

          <strong>
            ${escapeHTML(
            item.exercise_name
        )}
          </strong>

          <div>
            ${item.weight != null
                ? `${item.weight} kg`
                : "Sem carga"
            }

            ${item.reps
                ? ` × ${escapeHTML(
                    item.reps
                )}`
                : ""
            }

            ${item.sets
                ? ` — ${item.sets} séries`
                : ""
            }
          </div>

          <small>
            ${new Date(
                item.recorded_at
            ).toLocaleString(
                "pt-BR"
            )}
          </small>

        </div>

      </div>
    `).join("");
}

async function loadExerciseSelector() {
    const selector =
        $("#progressExercise");

    if (!selector) return;

    let workoutsQuery =
        supabase
            .from("workouts")
            .select(`
        id,
        user_id,
        name,
        exercises (
          id,
          name
        )
      `);

    if (
        currentProfile.role === "user"
    ) {
        workoutsQuery =
            workoutsQuery.eq(
                "user_id",
                currentUser.id
            );
    }

    if (
        currentProfile.role === "monitor" &&
        selectedMonitorUserId
    ) {
        workoutsQuery =
            workoutsQuery.eq(
                "user_id",
                selectedMonitorUserId
            );
    }

    if (
        currentProfile.role === "admin" &&
        selectedMonitorUserId
    ) {
        workoutsQuery =
            workoutsQuery.eq(
                "user_id",
                selectedMonitorUserId
            );
    }

    const {
        data,
        error
    } = await workoutsQuery;

    if (error) {
        console.error(error);
        return;
    }

    const unique =
        new Map();

    for (
        const workout
        of data || []
    ) {
        for (
            const exercise
            of workout.exercises || []
        ) {
            const key =
                exercise.name
                    .toLowerCase();

            if (!unique.has(key)) {
                unique.set(
                    key,
                    {
                        name:
                            exercise.name,
                        workoutId:
                            workout.id
                    }
                );
            }
        }
    }

    selector.innerHTML = `
    <option value="">
      Selecione um exercício
    </option>

    ${[...unique.values()]
            .map(item => `
        <option
          value="${escapeHTML(
                item.name
            )}"
          data-workout-id="${escapeHTML(
                item.workoutId
            )}"
        >
          ${escapeHTML(
                item.name
            )}
        </option>
      `)
            .join("")}
  `;
}

const saveProgressButton =
    $("#saveProgressButton");

if (saveProgressButton) {
    saveProgressButton.addEventListener(
        "click",
        async () => {

            const selector =
                $("#progressExercise");

            if (!selector?.value) {
                toast(
                    "Selecione um exercício."
                );
                return;
            }

            /*
             * USER pode registrar
             * sua própria carga.
             *
             * MONITOR e ADMIN podem
             * registrar para o usuário
             * selecionado.
             */

            if (
                currentProfile.role === "monitor" &&
                !selectedMonitorUserId
            ) {
                toast(
                    "Selecione um usuário."
                );
                return;
            }

            const selected =
                selector.options[
                selector.selectedIndex
                ];

            const userId =
                getTargetUserId();

            const {
                error
            } = await supabase
                .from("load_history")
                .insert({
                    user_id:
                        userId,
                    exercise_id:
                        null,
                    workout_id:
                        selected?.dataset
                            ?.workoutId || null,
                    exercise_name:
                        selector.value,
                    weight:
                        numberOrNull(
                            $("#progressWeight")
                                ?.value
                        ),
                    reps:
                        normalizeText(
                            $("#progressReps")
                                ?.value
                        ),
                    sets:
                        numberOrNull(
                            $("#progressSets")
                                ?.value
                        ),
                    recorded_by:
                        currentUser.id
                });

            if (error) {
                toast(
                    "Erro: " +
                    getErrorMessage(error)
                );
                return;
            }

            toast(
                "Evolução registrada."
            );

            await loadProgress();
        }
    );
}

const refreshProgressButton =
    $("#refreshProgressButton");

if (refreshProgressButton) {
    refreshProgressButton.addEventListener(
        "click",
        async () => {
            await loadExerciseSelector();
            await loadProgress();
        }
    );
}

/* =========================================================
   MONITOR
========================================================= */

async function loadMonitorUsers() {
    if (
        currentProfile.role !==
        "monitor"
    ) {
        return;
    }

    const {
        data: assignments,
        error
    } = await supabase
        .from("monitor_assignments")
        .select("user_id")
        .eq(
            "monitor_id",
            currentUser.id
        );

    if (error) {
        console.error(error);
        return;
    }

    const ids =
        (assignments || [])
            .map(item =>
                item.user_id
            );

    if (!ids.length) {
        monitorUsers = [];
        renderMonitorUsers();
        return;
    }

    const {
        data: users
    } = await supabase
        .from("profiles")
        .select(
            "id,email,display_name,role"
        )
        .in("id", ids);

    monitorUsers =
        users || [];

    renderMonitorUsers();
}

function renderMonitorUsers() {
    const container =
        $("#monitorUsers");

    if (!container) return;

    container.innerHTML = `
    <option value="">
      Selecione um aluno
    </option>

    ${monitorUsers
            .map(user => `
        <option value="${user.id}">
          ${escapeHTML(
                user.display_name ||
                user.email
            )}
        </option>
      `)
            .join("")}
  `;
}

const monitorUsersSelector =
    $("#monitorUsers");

if (monitorUsersSelector) {
    monitorUsersSelector.addEventListener(
        "change",
        async () => {

            selectedMonitorUserId =
                monitorUsersSelector.value ||
                null;

            await loadWorkouts();
            await loadProgress();
            await loadExerciseSelector();
        }
    );
}

/* =========================================================
   ADMIN
========================================================= */

async function loadAdminDashboard() {
    if (
        currentProfile.role !==
        "admin"
    ) {
        return;
    }

    const [
        users,
        monitors,
        workouts
    ] = await Promise.all([

        supabase
            .from("profiles")
            .select("*", {
                count: "exact",
                head: true
            }),

        supabase
            .from("profiles")
            .select("*", {
                count: "exact",
                head: true
            })
            .eq(
                "role",
                "monitor"
            ),

        supabase
            .from("workouts")
            .select("*", {
                count: "exact",
                head: true
            })
    ]);

    const set =
        (id, value) => {
            const element =
                document.getElementById(
                    id
                );

            if (element) {
                element.textContent =
                    value ?? 0;
            }
        };

    set(
        "adminUsers",
        users.count
    );

    set(
        "adminMonitors",
        monitors.count
    );

    set(
        "adminWorkouts",
        workouts.count
    );
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {
        checkUser();
    }
);