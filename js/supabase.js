import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

/*
=========================================================
TRAINER FACE
SUPABASE CONFIGURATION
=========================================================
*/

export const SUPABASE_URL =
    "https://unbwdyrhovdxgeggwiwv.supabase.co";

export const SUPABASE_PUBLISHABLE_KEY =
    "sb_publishable_ZeKAPEARRdrT_iLHBg-ZRQ_UsUdv92F";

/*
=========================================================
SUPABASE CLIENT
=========================================================
*/

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            flowType: "pkce"
        },

        global: {
            headers: {
                "x-application-name": "trainer-face"
            }
        }
    }
);

/*
=========================================================
AUTH HELPERS
=========================================================
*/

export async function getCurrentUser() {

    const {
        data,
        error
    } = await supabase.auth.getUser();

    if (error) {
        console.error(
            "Erro ao obter usuário:",
            error
        );

        return null;
    }

    return data?.user ?? null;
}


/*
=========================================================
SESSION
=========================================================
*/

export async function getCurrentSession() {

    const {
        data,
        error
    } = await supabase.auth.getSession();

    if (error) {

        console.error(
            "Erro ao obter sessão:",
            error
        );

        return null;
    }

    return data?.session ?? null;
}


/*
=========================================================
PROFILE
=========================================================
*/

export async function getCurrentProfile() {

    const user =
        await getCurrentUser();

    if (!user) {
        return null;
    }

    const {
        data,
        error
    } = await supabase
        .from("profiles")
        .select(`
            id,
            display_name,
            email,
            role,
            created_at,
            updated_at
        `)
        .eq("id", user.id)
        .maybeSingle();

    if (error) {

        console.error(
            "Erro ao buscar profile:",
            error
        );

        return null;
    }

    return data;
}


/*
=========================================================
ROLE
=========================================================
*/

export async function getCurrentRole() {

    const {
        data,
        error
    } = await supabase
        .rpc("current_role");

    if (error) {

        console.error(
            "Erro ao obter role:",
            error
        );

        return "user";
    }

    return data || "user";
}


/*
=========================================================
AUTH STATE LISTENER
=========================================================
*/

export function onAuthStateChange(callback) {

    return supabase.auth.onAuthStateChange(
        (event, session) => {

            try {

                callback(
                    event,
                    session
                );

            } catch (error) {

                console.error(
                    "Erro no callback de autenticação:",
                    error
                );

            }

        }
    );

}


/*
=========================================================
LOGOUT
=========================================================
*/

export async function logout() {

    const {
        error
    } = await supabase.auth.signOut();

    if (error) {

        console.error(
            "Erro ao sair:",
            error
        );

        throw error;
    }

}


/*
=========================================================
REDIRECT
=========================================================
*/

export function redirectToLogin() {

    const currentPath =
        window.location.pathname;

    if (
        !currentPath.endsWith(
            "login.html"
        )
    ) {

        window.location.href =
            "login.html";

    }

}


/*
=========================================================
AUTH GUARD
=========================================================
*/

export async function requireAuth() {

    const user =
        await getCurrentUser();

    if (!user) {

        redirectToLogin();

        return null;
    }

    return user;
}


/*
=========================================================
ROLE GUARD
=========================================================
*/

export async function requireRole(
    allowedRoles = []
) {

    const user =
        await requireAuth();

    if (!user) {
        return null;
    }

    const role =
        await getCurrentRole();

    if (
        !allowedRoles.includes(role)
    ) {

        console.warn(
            "Acesso negado. Role:",
            role
        );

        window.location.href =
            "../index.html";

        return null;
    }

    return {
        user,
        role
    };

}


/*
=========================================================
SAFE SUPABASE ERROR
=========================================================
*/

export function getSupabaseErrorMessage(
    error
) {

    if (!error) {
        return "Erro desconhecido.";
    }

    if (
        error.code === "42501"
    ) {

        return (
            "Permissão negada pelo banco de dados. " +
            "Verifique as políticas RLS."
        );

    }

    if (
        error.code === "23505"
    ) {

        return (
            "Este registro já existe."
        );

    }

    if (
        error.code === "23503"
    ) {

        return (
            "Não foi possível realizar a operação " +
            "porque existe uma dependência relacionada."
        );

    }

    return (
        error.message ||
        "Erro ao comunicar com o Supabase."
    );

}


/*
=========================================================
EXPORT DEFAULT
=========================================================
*/

export default supabase;
