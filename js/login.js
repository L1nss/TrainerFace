import { supabase } from "./supabase.js";

console.log("LOGIN.JS FOI CARREGADO");

// ======================================================
// ELEMENTOS
// ======================================================

const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");

const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");

const message = document.getElementById("message");
const themeButton = document.getElementById("themeButton");

// ======================================================
// MENSAGEM
// ======================================================

function showMessage(text, type = "") {
  if (!message) return;

  message.textContent = text;

  message.className = "message";

  if (type) {
    message.classList.add(type);
  }
}

// ======================================================
// LOADING
// ======================================================

function setLoading(form, loading) {
  if (!form) return;

  const button = form.querySelector("button[type='submit']");

  if (!button) return;

  button.disabled = loading;

  if (loading) {
    button.dataset.originalText = button.textContent;

    button.textContent = "Aguarde...";
  } else {
    button.textContent = button.dataset.originalText || "Enviar";
  }
}

// ======================================================
// VERIFICAR SE JÁ ESTÁ LOGADO
// ======================================================

async function checkExistingSession() {
  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      console.error("Erro ao verificar sessão:", error);

      return;
    }

    if (data.session) {
      console.log("Usuário já autenticado:", data.session.user.email);

      window.location.replace("./index.html");
    }
  } catch (error) {
    console.error("Erro inesperado ao verificar sessão:", error);
  }
}

// ======================================================
// LOGIN
// ======================================================

if (loginForm) {
  loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    showMessage("");

    const emailInput = document.getElementById("loginEmail");

    const passwordInput = document.getElementById("loginPassword");

    if (!emailInput || !passwordInput) {
      showMessage("Campos de login não encontrados.", "error");

      return;
    }

    const email = emailInput.value.trim();

    const password = passwordInput.value;

    if (!email || !password) {
      showMessage("Preencha o e-mail e a senha.", "error");

      return;
    }

    setLoading(loginForm, true);

    console.log("Tentando fazer login:", email);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error("Erro do Supabase:", error);

        showMessage(translateAuthError(error), "error");

        return;
      }

      if (!data.session) {
        showMessage("Login realizado, mas nenhuma sessão foi criada.", "error");

        return;
      }

      console.log("Login realizado com sucesso.");

      showMessage("Login realizado. Entrando...", "success");

      setTimeout(() => {
        window.location.replace("./index.html");
      }, 500);
    } catch (error) {
      console.error("Erro inesperado no login:", error);

      showMessage("Ocorreu um erro ao tentar entrar.", "error");
    } finally {
      setLoading(loginForm, false);
    }
  });
}

// ======================================================
// CADASTRO
// ======================================================

if (signupForm) {
  signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    showMessage("");

    const emailInput = document.getElementById("signupEmail");

    const passwordInput = document.getElementById("signupPassword");

    const confirmationInput = document.getElementById("signupPasswordConfirm");

    if (!emailInput || !passwordInput || !confirmationInput) {
      showMessage("Campos de cadastro não encontrados.", "error");

      return;
    }

    const email = emailInput.value.trim();

    const password = passwordInput.value;

    const confirmation = confirmationInput.value;

    if (!email || !password || !confirmation) {
      showMessage("Preencha todos os campos.", "error");

      return;
    }

    if (password.length < 6) {
      showMessage("A senha precisa ter pelo menos 6 caracteres.", "error");

      return;
    }

    if (password !== confirmation) {
      showMessage("As senhas não são iguais.", "error");

      return;
    }

    setLoading(signupForm, true);

    console.log("Criando conta:", email);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        console.error("Erro do Supabase:", error);

        showMessage(translateAuthError(error), "error");

        return;
      }

      console.log("Resposta do cadastro:", data);

      // ==========================================
      // CONFIRMAÇÃO DE E-MAIL DESATIVADA
      // ==========================================

      if (data.session) {
        showMessage("Conta criada. Entrando...", "success");

        setTimeout(() => {
          window.location.replace("./index.html");
        }, 500);

        return;
      }

      // ==========================================
      // CONFIRMAÇÃO DE E-MAIL ATIVADA
      // ==========================================

      showMessage(
        "Conta criada. Verifique seu e-mail para confirmar o cadastro.",
        "success",
      );
    } catch (error) {
      console.error("Erro inesperado no cadastro:", error);

      showMessage("Ocorreu um erro ao criar sua conta.", "error");
    } finally {
      setLoading(signupForm, false);
    }
  });
}

// ======================================================
// ABA LOGIN
// ======================================================

if (loginTab) {
  loginTab.addEventListener("click", function () {
    loginTab.classList.add("active");

    if (signupTab) {
      signupTab.classList.remove("active");
    }

    if (loginForm) {
      loginForm.classList.remove("hidden");
    }

    if (signupForm) {
      signupForm.classList.add("hidden");
    }

    showMessage("");
  });
}

// ======================================================
// ABA CADASTRO
// ======================================================

if (signupTab) {
  signupTab.addEventListener("click", function () {
    signupTab.classList.add("active");

    if (loginTab) {
      loginTab.classList.remove("active");
    }

    if (signupForm) {
      signupForm.classList.remove("hidden");
    }

    if (loginForm) {
      loginForm.classList.add("hidden");
    }

    showMessage("");
  });
}

// ======================================================
// TEMA
// ======================================================

function loadTheme() {
  const theme = localStorage.getItem("trainer-face-theme");

  if (theme === "light") {
    document.body.classList.add("light");
  }
}

if (themeButton) {
  themeButton.addEventListener("click", function () {
    document.body.classList.toggle("light");

    const isLight = document.body.classList.contains("light");

    localStorage.setItem("trainer-face-theme", isLight ? "light" : "dark");
  });
}

// ======================================================
// TRADUZIR ERROS DO SUPABASE
// ======================================================

function translateAuthError(error) {
  const message = (error?.message || "").toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }

  if (message.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado no Supabase.";
  }

  if (message.includes("user already registered")) {
    return "Este e-mail já está cadastrado.";
  }

  if (message.includes("password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }

  if (message.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos.";
  }

  if (message.includes("failed to fetch")) {
    return "Não foi possível conectar ao Supabase. Verifique a URL e a chave.";
  }

  if (message.includes("invalid api key")) {
    return "A chave do Supabase está incorreta.";
  }

  return error?.message || "Não foi possível realizar a operação.";
}

// ======================================================
// INICIALIZAÇÃO
// ======================================================

loadTheme();

checkExistingSession();

// ======================================================
// MONITORAR ALTERAÇÕES DE AUTENTICAÇÃO
// ======================================================

supabase.auth.onAuthStateChange((event, session) => {
  console.log("Auth event:", event);

  if (event === "SIGNED_OUT") {
    if (!window.location.pathname.endsWith("login.html")) {
      window.location.replace("./login.html");
    }
  }
});
