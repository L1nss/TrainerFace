import { supabase } from "./supabase.js";

const loginForm = document.getElementById("loginForm");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const message = document.getElementById("loginMessage");

function setMessage(text, error = true) {
    if (!message) return;

    message.textContent = text;

    message.style.color = error
        ? "#fca5a5"
        : "#86efac";
}

function setLoading(loading) {
    const button = loginForm?.querySelector(
        'button[type="submit"]'
    );

    if (!button) return;

    button.disabled = loading;

    button.textContent = loading
        ? "Entrando..."
        : "Entrar";
}

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = emailInput?.value.trim();
        const password = passwordInput?.value;

        if (!email || !password) {
            setMessage("Preencha e-mail e senha.");
            return;
        }

        setLoading(true);
        setMessage("");

        try {
            const {
                data,
                error
            } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            if (!data?.user) {
                throw new Error(
                    "Não foi possível autenticar o usuário."
                );
            }

            setMessage(
                "Login realizado. Carregando...",
                false
            );

            window.location.replace("./index.html");

        } catch (error) {

            console.error(
                "[TrainerFace] Erro no login:",
                error
            );

            setMessage(
                error?.message ||
                "E-mail ou senha inválidos."
            );

            setLoading(false);
        }
    });
}
