/**
 * idurazi-templates-ui.js
 * ------------------------
 * يعرض قائمة قوالب iDurazi الاثني عشر الثابتة في تبويب الجرافيكس،
 * ويطابقها مع ملفات mogrt الفعلية الموجودة في مشروع بريمير الحالي.
 */

function renderIDuraziTemplatesList() {
  const container = document.getElementById("idurazi-templates-list");
  if (!container) return;

  container.innerHTML = "";
  IDURAZI_TEMPLATES.forEach(t => {
    const div = document.createElement("div");
    div.className = "mogrt-item";
    div.id = `template-row-${t.code}`;
    div.innerHTML = `
      <div class="mogrt-item-name">${t.code} — ${escapeHtml(t.purpose)}</div>
      <div class="hint" style="margin:2px 0 0;">${escapeHtml(t.name)}.mogrt</div>
      <div class="template-status" id="status-${t.code}" style="margin-top:4px; font-size:11px;">⏳ لم يُتحقق بعد</div>
    `;
    container.appendChild(div);
  });
}

/** يحدّث حالة كل قالب (موجود ✅ / غير موجود ❌) بناءً على نتيجة المسح */
function updateTemplateMatchStatus(mogrtItems) {
  IDURAZI_TEMPLATES.forEach(t => {
    const statusEl = document.getElementById(`status-${t.code}`);
    if (!statusEl) return;
    const found = PremiereBridge.findMogrtByCode(mogrtItems, t.code);
    statusEl.textContent = found ? "✅ موجود في المشروع" : "❌ غير موجود — يجب استيراده";
    statusEl.style.color = found ? "#6dcf6d" : "#e07a7a";
  });
}

// عرض القائمة فور تحميل الصفحة
document.addEventListener("DOMContentLoaded", renderIDuraziTemplatesList);
// بعض بيئات UXP لا تُطلق DOMContentLoaded بشكل موثوق دائمًا، فننفذ فورًا أيضًا كاحتياط
renderIDuraziTemplatesList();
