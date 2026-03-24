document.addEventListener("DOMContentLoaded", () => {

    const launcher = document.getElementById("chatLauncher");
    const app = document.getElementById("chatApp");
    const welcomePage = document.getElementById("welcomePage");
    const chatPage = document.getElementById("chatPage");
    const startBtn = document.getElementById("startBtn");
    const backBtn = document.getElementById("backBtn");
    const closeBtn = document.getElementById("closeBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const input = document.getElementById("userInput");
    const chatBox = document.getElementById("chat-box");
    const sendBtn = document.querySelector(".send-btn");

    const BACKEND_URL = "/chat";

    launcher.addEventListener("click", () => {
        app.classList.remove("hidden");
        welcomePage.classList.remove("hidden");
        chatPage.classList.add("hidden");
    });

    startBtn.addEventListener("click", () => {
        welcomePage.classList.add("hidden");
        chatPage.classList.remove("hidden");
    });

    backBtn.addEventListener("click", () => {
        chatPage.classList.add("hidden");
        welcomePage.classList.remove("hidden");
    });

    closeBtn.addEventListener("click", () => {
        chatPage.classList.add("hidden");
        welcomePage.classList.add("hidden");
        app.classList.add("hidden");
    });

    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            chatBox.innerHTML = `
                <div class="bot-row">
                    <div class="bot-avatar">
                        <img src="rob.png" alt="Bot" class="bot-img">
                    </div>
                    <div class="bot-msg">
                        Hi 👋 Ask your Queries
                    </div>
                </div>
            `;
        });
    }

    function sendMessage() {
        const message = input.value.trim();
        if (!message) return;
        sendBtn.disabled = true;
        chatBox.innerHTML += `
            <div class="user-row">
                <div class="user-msg">${message}</div>
                <div class="user-avatar">
                    <img src="user.png" alt="User">
                </div>
            </div>
        `;

        input.value = "";
        chatBox.scrollTop = chatBox.scrollHeight;

        const loadingId = "loading-" + Date.now();
        chatBox.innerHTML += `
            <div class="bot-row" id="${loadingId}">
                <div class="bot-avatar">
                    <img src="rob.png" alt="Bot" class="bot-img">
                </div>
                <div class="bot-msg">Typing...</div>
            </div>
        `;
        chatBox.scrollTop = chatBox.scrollHeight;

        fetch("http://127.0.0.1:8000/chat", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question: message })
        })
        .then(response => {
            if (!response.ok) {
                throw new Error("Server error");
            }
            return response.json();
        })
        .then(data => {

            document.getElementById(loadingId)?.remove();

            const answer = (data.answer || "No response").toString();

            chatBox.innerHTML += `
                <div class="bot-row">
                    <div class="bot-avatar">
                        <img src="rob.png" alt="Bot" class="bot-img">
                    </div>
                    <div class="bot-msg" style="white-space: pre-line;">
                        ${answer}
                    </div>
                </div>
            `;

            chatBox.scrollTop = chatBox.scrollHeight;
            sendBtn.disabled = false;
        })
        .catch(error => {

            document.getElementById(loadingId)?.remove();

            chatBox.innerHTML += `
                <div class="bot-row">
                    <div class="bot-avatar">
                        <img src="rob.png" alt="Bot" class="bot-img">
                    </div>
                    <div class="bot-msg">
                        ❌ Cannot connect to backend server.
                    </div>
                </div>
            `;

            chatBox.scrollTop = chatBox.scrollHeight;
            sendBtn.disabled = false;
        });
    }

    sendBtn.addEventListener("click", sendMessage);

    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            sendMessage();
        }
    });

    const chatMemory = [];

    function memoryPush(role, text) {
        chatMemory.push({ role, text });
    }

    function memoryContext() {
        return chatMemory.slice(-6);
    }

    const _origSend = sendMessage;
    function sendMessage() {
        const message = input.value.trim();
        if (!message && !pendingImage) return;
        sendBtn.disabled = true;

        const imgB64  = pendingImage ? pendingImage.b64  : null;
        const imgMime = pendingImage ? pendingImage.mime : null;
        clearPendingImage();

        if (imgB64) {
            chatBox.innerHTML += `
                <div class="user-row">
                    <div>
                        <img src="data:${imgMime};base64,${imgB64}"
                             style="max-width:160px;border-radius:10px;border:2px solid #ccc;display:block;">
                        ${message ? `<div class="user-msg" style="margin-top:6px;">${message}</div>` : ""}
                    </div>
                    <div class="user-avatar"><img src="user.png" alt="User"></div>
                </div>`;
        } else {
            chatBox.innerHTML += `
                <div class="user-row">
                    <div class="user-msg">${message}</div>
                    <div class="user-avatar"><img src="user.png" alt="User"></div>
                </div>`;
        }
        if (message) memoryPush("user", message);
        input.value = "";
        chatBox.scrollTop = chatBox.scrollHeight;

        const loadingId = "loading-" + Date.now();
        chatBox.innerHTML += `
            <div class="bot-row" id="${loadingId}">
                <div class="bot-avatar"><img src="rob.png" alt="Bot" class="bot-img"></div>
                <div class="bot-msg">Typing...</div>
            </div>`;
        chatBox.scrollTop = chatBox.scrollHeight;

        const body = { question: message, history: memoryContext() };
        if (imgB64) { body.image_base64 = imgB64; body.image_mime = imgMime; }

        fetch(BACKEND_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        })
        .then(r => { if (!r.ok) throw new Error("Server error"); return r.json(); })
        .then(data => {
            document.getElementById(loadingId)?.remove();
            const answer = (data.answer || "No response").toString();
            memoryPush("bot", answer);
            chatBox.innerHTML += `
                <div class="bot-row">
                    <div class="bot-avatar"><img src="rob.png" alt="Bot" class="bot-img"></div>
                    <div class="bot-msg" style="white-space:pre-line;">${answer}</div>
                </div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
            sendBtn.disabled = false;
        })
        .catch(() => {
            document.getElementById(loadingId)?.remove();
            chatBox.innerHTML += `
                <div class="bot-row">
                    <div class="bot-avatar"><img src="rob.png" alt="Bot" class="bot-img"></div>
                    <div class="bot-msg">❌ Cannot connect to backend server.</div>
                </div>`;
            chatBox.scrollTop = chatBox.scrollHeight;
            sendBtn.disabled = false;
        });
    }

    let pendingImage = null;

    const imageUpload   = document.getElementById("imageUpload");
    const imgPreviewBar = document.getElementById("imgPreviewBar");
    const imgPreviewThumb = document.getElementById("imgPreviewThumb");
    const imgPreviewName  = document.getElementById("imgPreviewName");
    const removeImg       = document.getElementById("removeImg");

    imageUpload.addEventListener("change", () => {
        const file = imageUpload.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const b64 = e.target.result.split(",")[1];
            pendingImage = { b64, mime: file.type, name: file.name };
            imgPreviewThumb.src = e.target.result;
            imgPreviewName.textContent = file.name;
            imgPreviewBar.classList.remove("hidden");
            imgPreviewBar.style.display = "flex";
            input.placeholder = "Ask about this image...";
            input.focus();
        };
        reader.readAsDataURL(file);
        imageUpload.value = "";
    });

    function clearPendingImage() {
        pendingImage = null;
        imgPreviewBar.classList.add("hidden");
        imgPreviewBar.style.display = "none";
        imgPreviewThumb.src = "";
        imgPreviewName.textContent = "";
        input.placeholder = "Ask about Excel data or any general question...";
    }

    removeImg.addEventListener("click", clearPendingImage);

    const searchBtn   = document.getElementById("searchBtn");
    const searchBar   = document.getElementById("searchBar");
    const searchInput = document.getElementById("searchInput");
    const searchCount = document.getElementById("searchCount");
    const searchPrev  = document.getElementById("searchPrev");
    const searchNext  = document.getElementById("searchNext");
    const searchClose = document.getElementById("searchClose");

    let sMatches = [], sIdx = -1;

    searchBtn.addEventListener("click", () => {
        searchBar.classList.toggle("hidden");
        if (!searchBar.classList.contains("hidden")) searchInput.focus();
        else clearSearch();
    });

    searchClose.addEventListener("click", () => {
        searchBar.classList.add("hidden");
        clearSearch();
        searchInput.value = "";
    });

    searchInput.addEventListener("input", () => doSearch(searchInput.value.trim()));
    searchInput.addEventListener("keydown", e => { if (e.key === "Enter") stepSearch(1); });
    searchNext.addEventListener("click", () => stepSearch(1));
    searchPrev.addEventListener("click", () => stepSearch(-1));

    function doSearch(q) {
        chatBox.querySelectorAll(".s-highlight").forEach(el => el.replaceWith(el.textContent));
        chatBox.querySelectorAll(".bot-msg,.user-msg").forEach(el => el.normalize());
        sMatches = []; sIdx = -1;
        if (!q) { searchCount.textContent = ""; return; }
        const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "gi");
        chatBox.querySelectorAll(".bot-msg,.user-msg").forEach(msgEl => {
            highlightIn(msgEl, re);
        });
        sMatches = [...chatBox.querySelectorAll(".s-highlight")];
        searchCount.textContent = sMatches.length ? `1/${sMatches.length}` : "0";
        if (sMatches.length) { sIdx = 0; activateMatch(0); }
    }

    function highlightIn(el, re) {
        [...el.childNodes].forEach(node => {
            if (node.nodeType === 3) {
                const t = node.textContent;
                if (!re.test(t)) { re.lastIndex = 0; return; }
                re.lastIndex = 0;
                const frag = document.createDocumentFragment();
                let last = 0, m;
                while ((m = re.exec(t)) !== null) {
                    frag.appendChild(document.createTextNode(t.slice(last, m.index)));
                    const sp = document.createElement("span");
                    sp.className = "s-highlight";
                    sp.textContent = m[0];
                    frag.appendChild(sp);
                    last = re.lastIndex;
                }
                frag.appendChild(document.createTextNode(t.slice(last)));
                node.replaceWith(frag);
            } else if (node.nodeType === 1 && !node.classList.contains("s-highlight")) {
                highlightIn(node, re);
            }
        });
    }

    function stepSearch(dir) {
        if (!sMatches.length) return;
        sMatches[sIdx]?.classList.remove("s-active");
        sIdx = (sIdx + dir + sMatches.length) % sMatches.length;
        activateMatch(sIdx);
        searchCount.textContent = `${sIdx + 1}/${sMatches.length}`;
    }

    function activateMatch(i) {
        sMatches[i].classList.add("s-active");
        sMatches[i].scrollIntoView({ behavior: "smooth", block: "center" });
    }

    function clearSearch() {
        chatBox.querySelectorAll(".s-highlight").forEach(el => el.replaceWith(el.textContent));
        chatBox.querySelectorAll(".bot-msg,.user-msg").forEach(el => el.normalize());
        sMatches = []; sIdx = -1; searchCount.textContent = "";
    }

    const exportBtn = document.getElementById("exportBtn");

    exportBtn.addEventListener("click", () => {
        if (!chatMemory.length) { alert("No chat history to export yet."); return; }
        const lines = ["Remo Chat — Conversation Export", "Date: " + new Date().toLocaleString(), "=".repeat(48), ""];
        chatMemory.forEach(m => {
            lines.push((m.role === "user" ? "You" : "Remo") + ": " + m.text);
            lines.push("");
        });
        lines.push("=".repeat(48));
        lines.push("Powered by Gemini 2.5 Flash");
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "remo-chat-" + Date.now() + ".txt";
        a.click();
        URL.revokeObjectURL(a.href);
    });

    const darkModeBtn = document.getElementById("darkModeBtn");
    let isDark = localStorage.getItem("remo_dark") === "1";
    applyDark(isDark);

    darkModeBtn.addEventListener("click", () => {
        isDark = !isDark;
        localStorage.setItem("remo_dark", isDark ? "1" : "0");
        applyDark(isDark);
    });

    function applyDark(dark) {
        document.body.classList.toggle("dark-mode", dark);
        darkModeBtn.textContent = dark ? "light_mode" : "dark_mode";
        darkModeBtn.title = dark ? "Switch to Light Mode" : "Switch to Dark Mode";
    }

});
