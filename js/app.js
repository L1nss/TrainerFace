import { supabase } from "./supabase.js";


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

let generatedWorkout = null;

let importedWorkout = null;

let selectedPdf = null;


const $ = (selector) =>
    document.querySelector(selector);


const $$ = (selector) =>
    document.querySelectorAll(selector);


function showLoading(value) {

    $("#loading").classList.toggle(
        "show",
        value
    );
}


function toast(message) {

    const element = $("#toast");

    element.textContent = message;

    element.classList.add("show");

    setTimeout(() => {
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


/* =========================
   AUTENTICAÇÃO
========================= */

async function checkUser() {

    const {
        data,
        error
    } = await supabase.auth.getUser();

    if (error || !data.user) {

        window.location.href = "login.html";

        return;
    }

    currentUser = data.user;

    await loadWorkouts();
}


$("#logoutButton").addEventListener(
    "click",
    async () => {

        await supabase.auth.signOut();

        window.location.href =
            "login.html";
    }
);


/* =========================
   TABS
========================= */

$$(".tab").forEach(button => {

    button.addEventListener(
        "click",
        () => {

            $$(".tab").forEach(tab => {
                tab.classList.remove("active");
            });

            $$(".section").forEach(section => {
                section.classList.remove("active");
            });

            button.classList.add("active");

            const section =
                $("#section-" +
                button.dataset.section);

            section.classList.add("active");
        }
    );

});


/* =========================
   TEMA
========================= */

const savedTheme =
    localStorage.getItem(
        "trainer-face-theme"
    );

if (savedTheme === "light") {
    document.body.classList.add("light");
}


$("#themeButton").addEventListener(
    "click",
    () => {

        document.body.classList.toggle(
            "light"
        );

        localStorage.setItem(
            "trainer-face-theme",
            document.body.classList.contains(
                "light"
            )
                ? "light"
                : "dark"
        );
    }
);


/* =========================
   CARREGAR TREINOS
========================= */

async function loadWorkouts() {

    showLoading(true);

    const {
        data,
        error
    } = await supabase
        .from("workouts")
        .select(`
            id,
            name,
            weekday,
            notes,
            created_at,
            exercises (
                id,
                name,
                sets,
                reps,
                weight,
                position
            )
        `)
        .eq("user_id", currentUser.id)
        .order("weekday", {
            ascending: true
        });

    showLoading(false);

    if (error) {

        console.error(error);

        toast(
            "Erro ao carregar seus treinos."
        );

        return;
    }

    renderWorkouts(data || []);
}


function renderWorkouts(workouts) {

    const container =
        $("#workoutList");

    if (!workouts.length) {

        container.innerHTML = `
            <div class="empty">
                Nenhum treino cadastrado.
                <br><br>
                Use "Novo treino", "Montar treino"
                ou "Importar PDF".
            </div>
        `;

        return;
    }


    container.innerHTML =
        workouts.map(workout => {

            const exercises =
                [...(workout.exercises || [])]
                .sort(
                    (a, b) =>
                        a.position - b.position
                );


            return `
                <article class="workout-card">

                    <span class="workout-day">
                        ${DAYS[workout.weekday]}
                    </span>

                    <h3>
                        ${escapeHTML(workout.name)}
                    </h3>

                    ${
                        workout.notes
                            ? `
                                <p>
                                    ${escapeHTML(
                                        workout.notes
                                    )}
                                </p>
                              `
                            : ""
                    }

                    <ul class="exercise-list">

                        ${
                            exercises.length
                                ? exercises.map(
                                    exercise => `
                                        <li>
                                            <strong>
                                                ${escapeHTML(
                                                    exercise.name
                                                )}
                                            </strong>

                                            <br>

                                            ${
                                                exercise.sets
                                                    ? `${exercise.sets} séries`
                                                    : ""
                                            }

                                            ${
                                                exercise.reps
                                                    ? ` × ${escapeHTML(
                                                        exercise.reps
                                                    )}`
                                                    : ""
                                            }

                                            ${
                                                exercise.weight
                                                    ? ` — ${exercise.weight} kg`
                                                    : ""
                                            }
                                        </li>
                                    `
                                ).join("")
                                : `
                                    <li>
                                        Nenhum exercício.
                                    </li>
                                `
                        }

                    </ul>

                    <div class="card-actions">

                        <button
                            class="secondary-button delete-button"
                            data-delete="${workout.id}"
                        >
                            Excluir
                        </button>

                    </div>

                </article>
            `;

        }).join("");


    $$("[data-delete]").forEach(button => {

        button.addEventListener(
            "click",
            () =>
                deleteWorkout(
                    button.dataset.delete
                )
        );

    });
}


/* =========================
   EXCLUIR
========================= */

async function deleteWorkout(id) {

    const confirmed =
        confirm(
            "Excluir este treino?"
        );

    if (!confirmed) {
        return;
    }


    showLoading(true);

    const {
        error
    } = await supabase
        .from("workouts")
        .delete()
        .eq("id", id)
        .eq("user_id", currentUser.id);

    showLoading(false);


    if (error) {

        console.error(error);

        toast(
            "Não foi possível excluir."
        );

        return;
    }


    toast(
        "Treino excluído."
    );

    await loadWorkouts();
}


/* =========================
   MODAL
========================= */

$("#newWorkoutButton")
    .addEventListener(
        "click",
        () => {

            $("#workoutModal")
                .classList.remove(
                    "hidden"
                );

            if (
                !$("#manualExercises")
                    .children.length
            ) {
                addExerciseRow();
            }
        }
    );


$("#closeModal")
    .addEventListener(
        "click",
        closeModal
    );


function closeModal() {

    $("#workoutModal")
        .classList.add("hidden");

    $("#manualWorkoutForm").reset();

    $("#manualExercises").innerHTML = "";
}


/* =========================
   EXERCÍCIOS MANUAIS
========================= */

$("#addExerciseButton")
    .addEventListener(
        "click",
        addExerciseRow
    );


function addExerciseRow(data = {}) {

    const container =
        $("#manualExercises");

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
            value="${data.sets || ""}"
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
            step="0.5"
            min="0"
            placeholder="Kg"
            value="${data.weight || ""}"
        >

        <button
            type="button"
            class="remove-exercise"
        >
            ×
        </button>

    `;


    row.querySelector(
        ".remove-exercise"
    ).addEventListener(
        "click",
        () => row.remove()
    );


    container.appendChild(row);
}


/* =========================
   SALVAR MANUAL
========================= */

$("#manualWorkoutForm")
    .addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const rows =
                [...document.querySelectorAll(
                    "#manualExercises .exercise-row"
                )];


            const exercises =
                rows.map((row, index) => {

                    return {
                        name:
                            row.querySelector(
                                ".exercise-name"
                            ).value.trim(),

                        sets:
                            Number(
                                row.querySelector(
                                    ".exercise-sets"
                                ).value
                            ) || null,

                        reps:
                            row.querySelector(
                                ".exercise-reps"
                            ).value.trim() || null,

                        weight:
                            Number(
                                row.querySelector(
                                    ".exercise-weight"
                                ).value
                            ) || null,

                        position: index
                    };

                });


            await saveWorkout({

                name:
                    $("#manualName").value.trim(),

                weekday:
                    Number(
                        $("#manualWeekday").value
                    ),

                notes:
                    $("#manualNotes").value.trim(),

                exercises

            });


            closeModal();
        }
    );


/* =========================
   SALVAR TREINO
========================= */

async function saveWorkout(workout) {

    if (!currentUser) {
        return;
    }


    showLoading(true);


    const {
        data,
        error
    } = await supabase
        .from("workouts")
        .insert({

            user_id:
                currentUser.id,

            name:
                workout.name,

            weekday:
                workout.weekday,

            notes:
                workout.notes || null

        })
        .select()
        .single();


    if (error) {

        showLoading(false);

        console.error(error);

        toast(
            "Erro ao salvar treino."
        );

        return;
    }


    if (
        workout.exercises &&
        workout.exercises.length
    ) {

        const exercises =
            workout.exercises.map(
                (exercise, index) => ({

                    workout_id:
                        data.id,

                    name:
                        exercise.name,

                    sets:
                        exercise.sets || null,

                    reps:
                        exercise.reps || null,

                    weight:
                        exercise.weight || null,

                    position:
                        exercise.position ?? index

                })
            );


        const {
            error:
            exerciseError
        } = await supabase
            .from("exercises")
            .insert(exercises);


        if (exerciseError) {

            await supabase
                .from("workouts")
                .delete()
                .eq("id", data.id);

            showLoading(false);

            console.error(
                exerciseError
            );

            toast(
                "Erro ao salvar exercícios."
            );

            return;
        }
    }


    showLoading(false);

    toast(
        "Treino salvo."
    );

    await loadWorkouts();
}


/* =========================
   GERADOR DE TREINO
========================= */

$("#generatorForm")
    .addEventListener(
        "submit",
        event => {

            event.preventDefault();

            generatedWorkout =
                generateWorkout();

            renderGeneratedWorkout(
                generatedWorkout
            );
        }
    );


function generateWorkout() {

    const days =
        Number(
            $("#daysPerWeek").value
        );

    const goal =
        $("#goal").value;

    const experience =
        $("#experience").value;

    const equipment =
        $("#equipment").value;


    const exerciseDatabase =
        getExercises(
            equipment,
            goal
        );


    const splits =
        createSplit(days);


    const workouts =
        splits.map(
            (split, index) => {

                const exercises =
                    chooseExercises(
                        split,
                        exerciseDatabase,
                        experience
                    );


                return {

                    name:
                        split.name,

                    weekday:
                        split.weekday,

                    notes:
                        `Sugestão gerada para ${goal}.`,

                    exercises

                };

            }
        );


    return {
        workouts
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


    return options[days];
}


function getExercises(
    equipment,
    goal
) {

    const common = {

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


    if (equipment === "peso-corporal") {

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


    return common;
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
            .forEach(
                name => {

                    result.push({

                        name,

                        sets:
                            experience ===
                            "iniciante"
                                ? 2
                                : 3,

                        reps:
                            "8–12",

                        weight:
                            null,

                        position:
                            result.length

                    });

                }
            );
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

    } else if (
        name.includes("corpo inteiro")
    ) {

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


/* =========================
   RENDER GERADO
========================= */

function renderGeneratedWorkout(
    data
) {

    const container =
        $("#generatedContent");


    container.innerHTML =
        data.workouts.map(
            workout => `

                <div
                    class="generated-day"
                    data-generated-day="${workout.weekday}"
                >

                    <h3>
                        ${DAYS[workout.weekday]}
                        — ${escapeHTML(
                            workout.name
                        )}
                    </h3>

                    ${
                        workout.exercises
                            .map(
                                (exercise, index) => `

                                    <div
                                        class="generated-exercise"
                                    >

                                        <input
                                            value="${escapeHTML(
                                                exercise.name
                                            )}"
                                            data-name
                                            data-index="${index}"
                                        >

                                        <input
                                            value="${exercise.sets || ""}"
                                            type="number"
                                            min="1"
                                            data-sets
                                            data-index="${index}"
                                        >

                                        <input
                                            value="${escapeHTML(
                                                exercise.reps || ""
                                            )}"
                                            data-reps
                                            data-index="${index}"
                                        >

                                    </div>
                                `
                            )
                            .join("")
                    }

                </div>

            `
        ).join("");


    $("#generatedWorkout")
        .classList.remove("hidden");
}


/* =========================
   SALVAR GERADO
========================= */

$("#saveGeneratedButton")
    .addEventListener(
        "click",
        async () => {

            if (!generatedWorkout) {
                return;
            }


            const days =
                [...document.querySelectorAll(
                    "[data-generated-day]"
                )];


            for (
                const day of days
            ) {

                const weekday =
                    Number(
                        day.dataset.generatedDay
                    );


                const inputs =
                    [...day.querySelectorAll(
                        ".generated-exercise"
                    )];


                const original =
                    generatedWorkout.workouts
                        .find(
                            item =>
                                item.weekday ===
                                weekday
                        );


                const exercises =
                    inputs.map(
                        (row, index) => {

                            return {

                                name:
                                    row.querySelector(
                                        "[data-name]"
                                    ).value.trim(),

                                sets:
                                    Number(
                                        row.querySelector(
                                            "[data-sets]"
                                        ).value
                                    ) || null,

                                reps:
                                    row.querySelector(
                                        "[data-reps]"
                                    ).value.trim(),

                                weight:
                                    null,

                                position:
                                    index

                            };

                        }
                    );


                await saveWorkout({

                    name:
                        original.name,

                    weekday,

                    notes:
                        original.notes,

                    exercises

                });
            }


            $("#generatedWorkout")
                .classList.add("hidden");

            generatedWorkout = null;

            toast(
                "Treino gerado salvo."
            );
        }
    );


/* =========================
   PDF
========================= */

$("#pdfInput")
    .addEventListener(
        "change",
        event => {

            const file =
                event.target.files[0];

            if (!file) {
                return;
            }


            if (
                file.type !==
                "application/pdf"
            ) {

                toast(
                    "Selecione um arquivo PDF."
                );

                return;
            }


            if (
                file.size >
                10 * 1024 * 1024
            ) {

                toast(
                    "O PDF deve ter no máximo 10 MB."
                );

                return;
            }


            selectedPdf = file;

            $("#selectedFile")
                .textContent =
                    `${file.name} — ` +
                    `${(
                        file.size / 1024 / 1024
                    ).toFixed(2)} MB`;

            $("#importPdfButton")
                .disabled = false;
        }
    );


const uploadArea =
    $("#uploadArea");


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
            event.dataTransfer.files[0];

        if (!file) {
            return;
        }


        if (
            file.type !==
            "application/pdf"
        ) {

            toast(
                "O arquivo precisa ser PDF."
            );

            return;
        }


        selectedPdf = file;

        $("#selectedFile")
            .textContent =
                `${file.name} — ` +
                `${(
                    file.size / 1024 / 1024
                ).toFixed(2)} MB`;

        $("#importPdfButton")
            .disabled = false;
    }
);


/* =========================
   ENVIAR PDF
========================= */

$("#importPdfButton")
    .addEventListener(
        "click",
        importPdf
    );


async function importPdf() {

    if (!selectedPdf) {
        return;
    }


    showLoading(true);


    try {

        const base64 =
            await fileToBase64(
                selectedPdf
            );


        const response =
            await fetch(
                "/api/import-workout",
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        fileName:
                            selectedPdf.name,

                        mimeType:
                            selectedPdf.type,

                        file:
                            base64

                    })
                }
            );


        const result =
            await response.json();


        if (!response.ok) {

            throw new Error(
                result.error ||
                "Falha ao analisar PDF."
            );
        }


        importedWorkout =
            result.workout;


        renderPdfPreview(
            importedWorkout
        );


        toast(
            "PDF analisado."
        );

    } catch (error) {

        console.error(error);

        toast(
            error.message ||
            "Erro ao importar PDF."
        );

    } finally {

        showLoading(false);
    }
}


function fileToBase64(file) {

    return new Promise(
        (resolve, reject) => {

            const reader =
                new FileReader();


            reader.onload = () => {

                const result =
                    reader.result;

                const base64 =
                    result.split(",")[1];

                resolve(base64);
            };


            reader.onerror =
                reject;


            reader.readAsDataURL(
                file
            );
        }
    );
}


/* =========================
   PRÉVIA PDF
========================= */

function renderPdfPreview(
    workout
) {

    const container =
        $("#pdfPreviewContent");


    container.innerHTML = `

        <div class="field">

            <label>
                Nome do treino
            </label>

            <input
                id="pdfWorkoutName"
                value="${escapeHTML(
                    workout.name ||
                    "Treino importado"
                )}"
            >

        </div>


        <div class="field">

            <label>
                Dia da semana
            </label>

            <select id="pdfWorkoutDay">

                ${
                    Object.entries(DAYS)
                        .map(
                            ([value, name]) =>
                                `
                                <option
                                    value="${value}"
                                    ${
                                        Number(value) ===
                                        Number(
                                            workout.weekday
                                        )
                                            ? "selected"
                                            : ""
                                    }
                                >
                                    ${name}
                                </option>
                                `
                        )
                        .join("")
                }

            </select>

        </div>


        <div class="field">

            <label>
                Observações
            </label>

            <textarea
                id="pdfWorkoutNotes"
                rows="3"
            >${escapeHTML(
                workout.notes || ""
            )}</textarea>

        </div>


        <div>

            <h3>
                Exercícios
            </h3>

            <div id="pdfExercises">

                ${
                    (workout.exercises || [])
                        .map(
                            (exercise, index) => `

                                <div
                                    class="exercise-row"
                                >

                                    <input
                                        class="pdf-name"
                                        value="${escapeHTML(
                                            exercise.name || ""
                                        )}"
                                        placeholder="Exercício"
                                    >

                                    <input
                                        class="pdf-sets"
                                        type="number"
                                        value="${exercise.sets || ""}"
                                        placeholder="Séries"
                                    >

                                    <input
                                        class="pdf-reps"
                                        value="${escapeHTML(
                                            exercise.reps || ""
                                        )}"
                                        placeholder="Reps"
                                    >

                                    <input
                                        class="pdf-weight"
                                        type="number"
                                        step="0.5"
                                        value="${exercise.weight || ""}"
                                        placeholder="Kg"
                                    >

                                    <button
                                        type="button"
                                        class="remove-exercise"
                                        onclick="this.parentElement.remove()"
                                    >
                                        ×
                                    </button>

                                </div>

                            `
                        )
                        .join("")
                }

            </div>

        </div>
    `;


    $("#pdfPreview")
        .classList.remove("hidden");
}


/* =========================
   SALVAR PDF
========================= */

$("#savePdfWorkoutButton")
    .addEventListener(
        "click",
        async () => {

            const rows =
                [...document.querySelectorAll(
                    "#pdfExercises .exercise-row"
                )];


            const exercises =
                rows.map(
                    (row, index) => ({

                        name:
                            row.querySelector(
                                ".pdf-name"
                            ).value.trim(),

                        sets:
                            Number(
                                row.querySelector(
                                    ".pdf-sets"
                                ).value
                            ) || null,

                        reps:
                            row.querySelector(
                                ".pdf-reps"
                            ).value.trim(),

                        weight:
                            Number(
                                row.querySelector(
                                    ".pdf-weight"
                                ).value
                            ) || null,

                        position:
                            index

                    })
                );


            await saveWorkout({

                name:
                    $("#pdfWorkoutName")
                        .value.trim(),

                weekday:
                    Number(
                        $("#pdfWorkoutDay")
                            .value
                    ),

                notes:
                    $("#pdfWorkoutNotes")
                        .value.trim(),

                exercises

            });


            $("#pdfPreview")
                .classList.add("hidden");

            importedWorkout = null;

            selectedPdf = null;

            $("#pdfInput").value = "";

            $("#importPdfButton")
                .disabled = true;

            $("#selectedFile")
                .textContent =
                    "Nenhum arquivo selecionado";
        }
    );


/* =========================
   INICIALIZAÇÃO
========================= */

checkUser();