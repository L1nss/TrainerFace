import { supabase } from "./supabase.js";

const form =
    document.querySelector(
        "#loginForm"
    );

const message =
    document.querySelector(
        "#loginMessage"
    );

function showMessage(
    text,
    error = false
) {
    if (!message) return;

    message.textContent =
        text;

    message.style.color =
        error
            ? "#ff5c5c"
            : "";
}

async function redirectUser() {
    const {
        data: {
            user
        }
    } = await supabase.auth.getUser();

    if (!user) return;

    const {
        data: profile
    } = await supabase
        .from("profiles")
        .select("role")
        .eq(
            "id",
            user.id
        )
        .single();

    if (
        profile?.role ===
        "admin"
    ) {
        window.location.href =
            "index.html";

        return;
    }

    if (
        profile?.role ===
        "monitor"
    ) {
        window.location.href =
            "index.html";

        return;
    }

    window.location.href =
        "index.html";
}

form?.addEventListener(
    "submit",
    async event => {

        event.preventDefault();

        const email =
            document.querySelector(
                "#email"
            )?.value
                ?.trim();

        const password =
            document.querySelector(
                "#password"
            )?.value;

        if (!email || !password) {
            showMessage(
                "Preencha todos os campos.",
                true
            );

            return;
        }

        showMessage(
            "Entrando..."
        );

        const {
            error
        } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            showMessage(
                error.message,
                true
            );

            return;
        }

        await redirectUser();
    }
);

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const {
            data: {
                session
            }
        } =
            await supabase.auth.getSession();

        if (session) {
            await redirectUser();
        }

    }
);