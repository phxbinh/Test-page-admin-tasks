// ---------- App.Debugger ----------
/*
	•	🔹 init hook
	•	⚡ gọi setState
	•	🎨 cập nhật state + trigger render
	•	✅ state không thay đổi, skip render
	
	Biểu tượng ♻️ / ✨ / ✅ giúp phân biệt cleanup, run, skip.
	•	🔵 → state được cập nhật sau khi gọi dispatch, log cả giá trị trước (prev), action và giá trị mới (next). useReduce()

*/

// ----- App.Debugger nâng cao -----
window.App = window.App || {};
App.Debugger = (function(){

  // ----- Config ----
  const DEBUG = {
    memo: false,
    patchProps: false,
    hooks: false,
    router: false,
    general: true,
    console: false // bật/tắt console.log
  };

  const ICONS = {
    memo: "🗄️",
    hooks: "🪝",
    patchProps: "⚡",
    router: "🚦",
    general: "ℹ️"
  };

  const COLORS = {
    memo: "blue",
    hooks: "green",
    patchProps: "orange",
    router: "purple",
    general: "black"
  };

  // ----- Logging helper -----
  function log(msg, data, type="general"){
    if(!DEBUG[type]) return;

    const icon = ICONS[type] || "";
    const color = COLORS[type] || "black";
    const timestamp = new Date().toLocaleTimeString("en-GB", {
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 3, // 3 chữ số milli
  timeZone: "Asia/Bangkok"   // GMT+7
});

    const text = `${icon} [${timestamp}] ${msg}` + (data ? " " + JSON.stringify(data) : "");

    // console log
    if(DEBUG.console) console.log(text);

    // log vào HTML #log
    const area = document.getElementById("log");
    if(area){
      const span = document.createElement("span");
      span.style.color = color;
      span.textContent = text;
      area.appendChild(span);
      area.appendChild(document.createElement("br"));
      area.scrollTop = area.scrollHeight;
    }
  }

  // ----- Update debug flags -----
  // Kiểu dữ liệu của flags là mội object giống với DEBUG (bao gồm đầy đủ các thuộc tính của DEBUG)
  function setDebug(flags){
    // Clone flags to DEBUG
    Object.assign(DEBUG, flags);
  }

  // ----- Export -----
  return {
    log,
    DEBUG,
    setDebug,
    ICONS,
    COLORS
  };

})();


