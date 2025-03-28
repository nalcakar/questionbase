// 20 önemli dil listesi: dil kodu ve adı
const languages = [
    { code: 'en', name: 'English' },
    { code: 'tr', name: 'Türkçe' },
    { code: 'es', name: 'Español' },
    { code: 'fr', name: 'Français' },
    { code: 'de', name: 'Deutsch' },
    { code: 'it', name: 'Italiano' },
    { code: 'ru', name: 'Русский' },
    { code: 'zh-CN', name: '中文 (简体)' },
    { code: 'ja', name: '日本語' },
    { code: 'ar', name: 'العربية' },
    { code: 'pt', name: 'Português' },
    { code: 'hi', name: 'हिन्दी' },
    { code: 'ko', name: '한국어' },
    { code: 'nl', name: 'Nederlands' },
    { code: 'sv', name: 'Svenska' },
    { code: 'no', name: 'Norsk' },
    { code: 'da', name: 'Dansk' },
    { code: 'fi', name: 'Suomi' },
    { code: 'pl', name: 'Polski' },
    { code: 'el', name: 'Ελληνικά' }
  ];
  
  // Dropdown oluşturup #language-select içine ekleyen fonksiyon
  function createLanguageDropdown() {
    const dropdown = document.getElementById('language-select');
    
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.code;
      option.textContent = lang.name;
      dropdown.appendChild(option);
    });
    
    // Sistem dilini al; listede varsa kullan, yoksa 'en'
    const systemLang = navigator.language.split('-')[0];
    const defaultLang = languages.find(lang => lang.code === systemLang) ? systemLang : 'en';
    dropdown.value = localStorage.getItem('selectedLanguage') || defaultLang;
  }
  
  // Çeviri için API çağrısı yapan fonksiyon
  async function translateText(text, targetLang) {
    try {
      const response = await fetch("https://translate-app-yjvw.onrender.com/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text, target: targetLang })
      });
      const data = await response.json();
      return decodeHTMLEntities(data.translatedText); // <--- burada
    } catch (err) {
      console.error("Çeviri hatası:", err);
      return text;
    }
  }
  
  // HTML karakterlerini dönüştüren yardımcı fonksiyon
  function decodeHTMLEntities(text) {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = text;
    return textarea.value;
  }
  
  
  // Sayfadaki tüm soru kartlarını seçili dile çeviren fonksiyon
  async function translateAllQuestions(targetLang) {
    const questionCards = document.querySelectorAll('.question');
    for (const card of questionCards) {
      // Soru metni
      const questionTextarea = card.querySelector('textarea.editable-input');
      const originalQuestion = questionTextarea.getAttribute('data-original') || questionTextarea.value;
      questionTextarea.value = await translateText(originalQuestion, targetLang);
      
      // Şıklar
      const choiceInputs = card.querySelectorAll('.choice-item input.editable-input');
      for (const input of choiceInputs) {
        const originalChoice = input.getAttribute('data-original') || input.value;
        input.value = await translateText(originalChoice, targetLang);
      }
      
      // Cevap
      const answerInput = card.querySelector('.answer-section input.editable-input');
      if (answerInput) {
        const originalAnswer = answerInput.getAttribute('data-original') || answerInput.value;
        answerInput.value = await translateText(originalAnswer, targetLang);
      }
      
      // Açıklama
      const explanationTextarea = card.querySelector('.explanation-section textarea.editable-input');
      if (explanationTextarea) {
        const originalExplanation = explanationTextarea.getAttribute('data-original') || explanationTextarea.value;
        explanationTextarea.value = await translateText(originalExplanation, targetLang);
      }
    }
  }
  
  // Orijinal metinleri data-original özniteliği ile saklayan fonksiyon
  function storeOriginalTexts() {
    const questionCards = document.querySelectorAll('.question');
    questionCards.forEach(card => {
      const questionTextarea = card.querySelector('textarea.editable-input');
      if (questionTextarea && !questionTextarea.getAttribute('data-original')) {
        questionTextarea.setAttribute('data-original', questionTextarea.value);
      }
      const choiceInputs = card.querySelectorAll('.choice-item input.editable-input');
      choiceInputs.forEach(input => {
        if (!input.getAttribute('data-original')) {
          input.setAttribute('data-original', input.value);
        }
      });
      const answerInput = card.querySelector('.answer-section input.editable-input');
      if (answerInput && !answerInput.getAttribute('data-original')) {
        answerInput.setAttribute('data-original', answerInput.value);
      }
      const explanationTextarea = card.querySelector('.explanation-section textarea.editable-input');
      if (explanationTextarea && !explanationTextarea.getAttribute('data-original')) {
        explanationTextarea.setAttribute('data-original', explanationTextarea.value);
      }
    });
  }
  
  // Sayfa yüklendiğinde dropdown'u oluştur ve kaydedilmiş dili uygula
  document.addEventListener("DOMContentLoaded", () => {
    createLanguageDropdown();
    // Soru kartları mevcutsa orijinal metinleri sakla
    storeOriginalTexts();
  
    // Çeviri butonu event listener'ı
    const translateBtn = document.getElementById('translate-btn');
    translateBtn.addEventListener('click', async () => {
      const targetLang = document.getElementById('language-select').value;
      localStorage.setItem('selectedLanguage', targetLang);
      await translateAllQuestions(targetLang);
    });
  });
  