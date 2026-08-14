import { supabase } from "./supabase.js";

let currentUser = null;
let users = [];
let assignments = [];

/* =========================================================
   UTILITÁRIOS
========================================================= */

function escapeHTML(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function message(error) {
    return (
        error?.message ||
        error?.details ||
        error?.hint ||
        "Ocorreu um erro."
    );
}

/* =========================================================
   AUTENTICAÇÃO ADMIN
========================================================= */

async function requireAdmin() {
    const {
        data: {
            session
        }
    } = await supabase.auth.getSession();

    if (!session) {
        location.href =
            "../login.html";
        return false;
    }

    currentUser =
        session.user;

    const {
        data: profile,
        error
    } = await supabase
        .from("profiles")
        .select(
            "id,email,display_name,role"
        )
        .eq(
            "id",
            currentUser.id
        )
        .single();

    if (
        error ||
        profile?.role !== "admin"
    ) {
        alert(
            "Acesso negado."
        );

        location.href =
            "../index.html";

        return false;
    }

    return true;
}

/* =========================================================
   CARREGAR USUÁRIOS
========================================================= */

async function loadUsers() {
    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select(
            "id,email,display_name,role"
        )
        .order("email");

    if (error) {
        alert(message(error));
        return;
    }

    users = data || [];

    renderUsers();
    renderSelectors();
}

/* =========================================================
   RENDER USUÁRIOS
========================================================= */

function renderUsers() {
    const tbody =
        document.querySelector(
            "#users"
        );

    if (!tbody) return;

    tbody.innerHTML =
        users.map(user => `
      <tr>

        <td>
          ${escapeHTML(
            user.display_name ||
            ""
        )}
        </td>

        <td>
          ${escapeHTML(
            user.email ||
            ""
        )}
        </td>

        <td>

          <select
            class="role"
            data-id="${user.id}"
          >

            <option
              value="user"
              ${user.role ===
                "user"
                ? "selected"
                : ""
            }
            >
              USER
            </option>

            <option
              value="monitor"
              ${user.role ===
                "monitor"
                ? "selected"
                : ""
            }
            >
              MONITOR
            </option>

            <option
              value="admin"
              ${user.role ===
                "admin"
                ? "selected"
                : ""
            }
            >
              ADMIN
            </option>

          </select>

        </td>

        <td>

          <button
            class="primary-button save-role"
            data-id="${user.id}"
          >
            Salvar
          </button>

        </td>

      </tr>
    `).join("");

    document
        .querySelectorAll(
            ".save-role"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () =>
                    saveRole(
                        button.dataset.id
                    )
            );

        });
}

/* =========================================================
   SALVAR ROLE
========================================================= */

async function saveRole(id) {
    const select =
        document.querySelector(
            `.role[data-id="${id}"]`
        );

    if (!select) return;

    const role =
        select.value;

    const {
        error
    } = await supabase
        .from("profiles")
        .update({
            role,
            updated_at:
                new Date()
                    .toISOString()
        })
        .eq(
            "id",
            id
        );

    if (error) {
        alert(
            "Erro: " +
            message(error)
        );

        return;
    }

    alert(
        "Papel atualizado."
    );

    await loadUsers();
}

/* =========================================================
   SELECTS
========================================================= */

function renderSelectors() {
    const monitorSelect =
        document.querySelector(
            "#monitorSelect"
        );

    const userSelect =
        document.querySelector(
            "#userSelect"
        );

    if (!monitorSelect ||
        !userSelect) {
        return;
    }

    const monitors =
        users.filter(
            user =>
                user.role ===
                "monitor"
        );

    const normalUsers =
        users.filter(
            user =>
                user.role ===
                "user"
        );

    monitorSelect.innerHTML = `
    <option value="">
      Selecione o monitor
    </option>

    ${monitors.map(
        user => `
        <option value="${user.id}">
          ${escapeHTML(
            user.display_name ||
            user.email
        )}
        </option>
      `
    ).join("")}
  `;

    userSelect.innerHTML = `
    <option value="">
      Selecione o usuário
    </option>

    ${normalUsers.map(
        user => `
        <option value="${user.id}">
          ${escapeHTML(
            user.display_name ||
            user.email
        )}
        </option>
      `
    ).join("")}
  `;
}

/* =========================================================
   VINCULAR MONITOR
========================================================= */

const assignButton =
    document.querySelector(
        "#assignButton"
    );

if (assignButton) {
    assignButton.addEventListener(
        "click",
        assignUser
    );
}

async function assignUser() {
    const monitor =
        document.querySelector(
            "#monitorSelect"
        )?.value;

    const user =
        document.querySelector(
            "#userSelect"
        )?.value;

    if (!monitor || !user) {
        alert(
            "Selecione monitor e usuário."
        );

        return;
    }

    if (monitor === user) {
        alert(
            "Um monitor não pode ser vinculado a si mesmo."
        );

        return;
    }

    const {
        error
    } = await supabase
        .from(
            "monitor_assignments"
        )
        .insert({
            monitor_id:
                monitor,
            user_id:
                user
        });

    if (error) {
        if (
            error.code ===
            "23505"
        ) {
            alert(
                "Esse vínculo já existe."
            );
        } else {
            alert(
                "Erro: " +
                message(error)
            );
        }

        return;
    }

    alert(
        "Usuário vinculado ao monitor."
    );

    await loadAssignments();
}

/* =========================================================
   CARREGAR VÍNCULOS
========================================================= */

async function loadAssignments() {
    const {
        data,
        error
    } = await supabase
        .from(
            "monitor_assignments"
        )
        .select(`
      id,
      monitor_id,
      user_id,
      created_at
    `)
        .order(
            "created_at",
            {
                ascending: false
            }
        );

    if (error) {
        console.error(error);
        return;
    }

    assignments =
        data || [];

    renderAssignments();
}

/* =========================================================
   RENDER VÍNCULOS
========================================================= */

function renderAssignments() {
    const container =
        document.querySelector(
            "#assignments"
        );

    if (!container) return;

    if (!assignments.length) {
        container.innerHTML = `
      <div class="empty">
        Nenhum vínculo cadastrado.
      </div>
    `;

        return;
    }

    container.innerHTML =
        assignments.map(
            assignment => {

                const monitor =
                    users.find(
                        user =>
                            user.id ===
                            assignment.monitor_id
                    );

                const user =
                    users.find(
                        item =>
                            item.id ===
                            assignment.user_id
                    );

                return `
          <div class="assignment-row">

            <div>

              <strong>
                Monitor:
              </strong>

              ${escapeHTML(
                    monitor?.display_name ||
                    monitor?.email ||
                    "Desconhecido"
                )}

              <br>

              <strong>
                Usuário:
              </strong>

              ${escapeHTML(
                    user?.display_name ||
                    user?.email ||
                    "Desconhecido"
                )}

            </div>

            <button
              class="secondary-button delete-assignment"
              data-id="${assignment.id}"
            >
              Remover
            </button>

          </div>
        `;
            }
        ).join("");

    document
        .querySelectorAll(
            ".delete-assignment"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                () =>
                    deleteAssignment(
                        button.dataset.id
                    )
            );

        });
}

/* =========================================================
   REMOVER VÍNCULO
========================================================= */

async function deleteAssignment(
    id
) {
    if (
        !confirm(
            "Remover este vínculo?"
        )
    ) {
        return;
    }

    const {
        error
    } = await supabase
        .from(
            "monitor_assignments"
        )
        .delete()
        .eq(
            "id",
            id
        );

    if (error) {
        alert(
            "Erro: " +
            message(error)
        );

        return;
    }

    await loadAssignments();
}

/* =========================================================
   LOGOUT
========================================================= */

const logoutButton =
    document.querySelector(
        "#logoutButton"
    );

if (logoutButton) {
    logoutButton.addEventListener(
        "click",
        async () => {
            await supabase.auth.signOut();

            location.href =
                "../login.html";
        }
    );
}

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const allowed =
            await requireAdmin();

        if (!allowed) return;

        await loadUsers();
        await loadAssignments();

    }
);