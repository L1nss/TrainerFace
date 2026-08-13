import {
    supabase,
    getCurrentUser,
    getCurrentProfile,
    getSupabaseErrorMessage
} from "./supabase.js";

/*
=========================================================
TRAINER FACE
LOGIN
=========================================================
*/

const loginForm =
    document.getElementById("loginForm");

const emailInput =
    document.getElementById("email");

const passwordInput =
    document.getElementById("password");

const message =
    document.getElementById("loginMessage");

const submitButton =
    loginForm?.querySelector(
        'button[type="submit"]'
    );

/*
=========================================================
MESSAGE
=========================================================
*/

function setMessage(
    text = "",
    type = "error"
) {

    if (!message) {
        return;
    }

    message.textContent = text;

    message.classList.remove(
        "error",
        "success",
        "info"
    );

    if (!text) {
        return;
    }

    message.classList.add(type);

    if (type === "success") {

        message.style.color =
            "#86efac";

    } else if (type === "info") {

        message.style.color =
            "#93c5fd";

    } else {

        message.style.color =
            "#fca5a5";
    }
}

/*
=========================================================
LOADING
=========================================================
*/

function setLoading(
    loading
) {

    if (!submitButton) {
        return;
    }

    submitButton.disabled =
        loading;

    submitButton.textContent =
        loading
            ? "Entrando..."
            : "Entrar";
}

/*
=========================================================
VALIDAR EMAIL
=========================================================
*/

function isValidEmail(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email);

}

/*
=========================================================
REDIRECIONAMENTO
=========================================================
*/

function redirectAfterLogin(
    profile
) {

    if (!profile) {

        window.location.replace(
            "./index.html"
        );

        return;
    }

    if (profile.role === "admin") {

        window.location.replace(
            "./admin/admin.html"
        );

        return;
    }

    window.location.replace(
        "./index.html"
    );

}

/*
=========================================================
VERIFICAR USUÁRIO JÁ LOGADO
=========================================================
*/

async function checkExistingSession() {

    try {

        const user =
            await getCurrentUser();

        if (!user) {
            return;
        }

        const profile =
            await getCurrentProfile();

        redirectAfterLogin(
            profile
        );

    } catch (error) {

        console.error(
            "[TrainerFace] Erro verificando sessão:",
            error
        );

    }

}

/*
=========================================================
LOGIN
=========================================================
*/

async function handleLogin(
    event
) {

    event.preventDefault();

    const email =
        emailInput?.value
            ?.trim()
            ?.toLowerCase();

    const password =
        passwordInput?.value || "";

    /*
    -----------------------------------------------------
    VALIDAÇÃO
    -----------------------------------------------------
    */

    if (!email) {

        setMessage(
            "Informe seu e-mail.",
            "error"
        );

        emailInput?.focus();

        return;
    }

    if (!isValidEmail(email)) {

        setMessage(
            "Digite um e-mail válido.",
            "error"
        );

        emailInput?.focus();

        return;
    }

    if (!password) {

        setMessage(
            "Informe sua senha.",
            "error"
        );

        passwordInput?.focus();

        return;
    }

    /*
    -----------------------------------------------------
    LOGIN
    -----------------------------------------------------
    */

    setLoading(true);

    setMessage(
        "Autenticando...",
        "info"
    );

    try {

        const {
            data,
            error
        } =
            await supabase.auth
                .signInWithPassword({
                    email,
                    password
                });

        if (error) {
            throw error;
        }

        if (!data?.user) {

            throw new Error(
                "O Supabase não retornou um usuário autenticado."
            );

        }

        /*
        -------------------------------------------------
        GARANTIR PROFILE
        -------------------------------------------------
        */

        let profile =
            await getCurrentProfile();

        /*
        -------------------------------------------------
        PROFILE PODE AINDA NÃO ESTAR DISPONÍVEL
        IMEDIATAMENTE APÓS O LOGIN.
        -------------------------------------------------
        */

        if (!profile) {

            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        300
                    )
            );

            profile =
                await getCurrentProfile();
        }

        /*
        -------------------------------------------------
        LOGIN CONCLUÍDO
        -------------------------------------------------
        */

        setMessage(
            "Login realizado. Carregando...",
            "success"
        );

        /*
        -------------------------------------------------
        REDIRECIONAR
        -------------------------------------------------
        */

        redirectAfterLogin(
            profile
        );

    } catch (error) {

        console.error(
            "[TrainerFace] Erro no login:",
            error
        );

        /*
        -------------------------------------------------
        ERROS MAIS COMUNS
        -------------------------------------------------
        */

        let errorMessage =
            getSupabaseErrorMessage(
                error
            );

        const rawMessage =
            String(
                error?.message || ""
            ).toLowerCase();

        if (
            rawMessage.includes(
                "invalid login credentials"
            )
        ) {

            errorMessage =
                "E-mail ou senha incorretos.";

        } else if (
            rawMessage.includes(
                "email not confirmed"
            )
        ) {

            errorMessage =
                "Seu e-mail ainda não foi confirmado.";

        } else if (
            rawMessage.includes(
                "too many requests"
            )
        ) {

            errorMessage =
                "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

        } else if (
            rawMessage.includes(
                "network"
            )
        ) {

            errorMessage =
                "Erro de conexão. Verifique sua internet.";

        }

        setMessage(
            errorMessage,
            "error"
        );

        setLoading(false);
    }

}

/*
=========================================================
SUBMIT
=========================================================
*/

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        handleLogin
    );

}

/*
=========================================================
ENTER NO CAMPO DE SENHA
=========================================================
*/

passwordInput?.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter"
        ) {

            loginForm?.requestSubmit();

        }

    }
);

/*
=========================================================
FOCUS INICIAL
=========================================================
*/

if (
    emailInput &&
    !emailInput.value
) {

    setTimeout(
        () => emailInput.focus(),
        100
    );

}

/*
=========================================================
INICIAR
=========================================================
*/

checkExistingSession();
