import { supabase } from "./supabase.js";

const form = document.querySelector("#signupForm");
const message = document.querySelector("#signupMessage");
const button = document.querySelector("#signupButton");

function showMessage(text, type = "error") {
  message.textContent = text;
  message.className = `auth-message ${type}`;
}

function translateError(error) {
  const text = error?.message || "Não foi possível criar a conta.";
  if (/already registered|already been registered|user already exists/i.test(text)) return "Este e-mail já está cadastrado.";
  if (/password/i.test(text)) return "A senha deve ter pelo menos 6 caracteres.";
  if (/invalid email/i.test(text)) return "Digite um e-mail válido.";
  if (/rate limit/i.test(text)) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  return text;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = document.querySelector("#name").value.trim();
  const email = document.querySelector("#email").value.trim().toLowerCase();
  const password = document.querySelector("#password").value;
  const confirmPassword = document.querySelector("#confirmPassword").value;

  if (name.length < 2) return showMessage("Digite seu nome.");
  if (password.length < 6) return showMessage("A senha deve ter pelo menos 6 caracteres.");
  if (password !== confirmPassword) return showMessage("As senhas não coincidem.");

  button.disabled = true;
  button.textContent = "Criando conta...";
  showMessage("Criando sua conta...", "info");

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name },
      emailRedirectTo: `${window.location.origin}/login.html`
    }
  });

  if (error) {
    showMessage(translateError(error));
    button.disabled = false;
    button.textContent = "Criar conta";
    return;
  }

  if (data.session) {
    window.location.replace("./index.html");
    return;
  }

  form.reset();
  showMessage("Conta criada. Verifique seu e-mail para confirmar o cadastro.", "success");
  button.disabled = false;
  button.textContent = "Criar conta";
});

document.addEventListener("DOMContentLoaded", async () => {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) window.location.replace("./index.html");
});
