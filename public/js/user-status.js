async function checkUserStatus() {
  try {
    const res = await fetch("/me", {
      credentials: "include" // ✅ bu satır şart!
    });
    const user = await res.json();

    if (user.isPatron) {
      console.log("Üye: Evet ✅");
      showWelcomeMessage(user.name, user.tier || "Üye");
    } else {
      console.log("Üye değil ❌");
      limitQuestionsToFreeUser();
      showLoginButton();
    }
  } catch (e) {
    console.warn("Kullanıcı durumu alınamadı.");
    showLoginButton();
  }
}


function showWelcomeMessage(name, tier) {
  const welcomeDiv = document.createElement("div");
  welcomeDiv.style.textAlign = "center";
  welcomeDiv.style.marginBottom = "20px";
  welcomeDiv.innerHTML = `
    <p style="font-size: 1.1rem; font-weight: bold;">👋 Hoş geldiniz, ${name}!</p>
    <p style="font-size: 1rem; color: #007bff;">🏅 Üyelik Seviyesi: ${tier}</p>
    <button onclick="logout()" style="background:#dc3545;color:white;padding:8px 16px;border:none;border-radius:6px;margin-top:10px;cursor:pointer;">
      Çıkış Yap
    </button>
  `;
  document.getElementById("main-container").prepend(welcomeDiv);
}

function logout() {
  fetch("/logout")
    .finally(() => {
      localStorage.removeItem("user");
      window.location.reload();
    });
}

function showLoginButton() {
  const loginBtn = document.createElement("div");
  loginBtn.innerHTML = `
    <p style="text-align:center; color:gray;">👤 Üye girişi yapmadınız. Yalnızca 5 soru görüntüleniyor.</p>
    <div style="text-align:center; margin-top:10px;">
      <a href="/login">
        <button style="background:#ff424d;color:white;padding:10px 20px;border:none;border-radius:6px;cursor:pointer;">Patreon ile Giriş Yap</button>
      </a>
    </div>
  `;
  document.getElementById("main-container").prepend(loginBtn);
}

function limitQuestionsToFreeUser() {
  setTimeout(() => {
    const allQuestions = document.querySelectorAll(".question");
    allQuestions.forEach((q, i) => {
      if (i >= 5) q.remove(); // sadece ilk 5 soruyu göster
    });
  }, 500); // soruların yüklenmesini bekle
}


document.addEventListener("DOMContentLoaded", checkUserStatus);
