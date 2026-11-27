// js/park.js
// パーク: アバターで歩き回るロビー（WebSocket）、チャット・エモート、ギルド
// サーバーが無い・つながらない時は、自分のアバターだけで動く（オフライン表示）

const Park = {
    me: JSON.parse(localStorage.getItem("user") || "{}"),
    users: new Map(), // id → { id, name, title, avatar, x, y }
    stomp: null,
    online: false,
    pos: { x: 50, y: 82 },
    EMOTES: ["👋", "😄", "😢", "😡", "⚔️", "✨", "👍", "❤️"],
};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function myView() {
    return {
        id: Park.me.id,
        name: Park.me.username || "あなた",
        title: Cosmetics.titleName(),
        avatar: Cosmetics.equipped(),
        x: Park.pos.x,
        y: Park.pos.y,
    };
}

// ===== アバター表示 =====
function drawAvatars() {
    const box = $("avatars");
    const list = [...Park.users.values()];
    if (!Park.users.has(Park.me.id)) list.push(myView());
    const seen = new Set();
    list.forEach((u) => {
        seen.add(String(u.id));
        let el = box.querySelector(`[data-id="${u.id}"]`);
        if (!el) {
            el = document.createElement("div");
            el.className = `avatar ${u.id === Park.me.id ? "me" : ""}`;
            el.dataset.id = u.id;
            box.appendChild(el);
        }
        const key = JSON.stringify([u.avatar, u.name, u.title]);
        if (el.dataset.key !== key) {
            el.dataset.key = key;
            const bubble = el.querySelector(".bubble");
            el.innerHTML = `<div class="nm">${esc(u.name)}${u.title ? `<small>${esc(u.title)}</small>` : ""}</div>${Cosmetics.avatarSvg(u.avatar || {}, 70)}`;
            if (bubble) el.prepend(bubble);
        }
        el.style.left = `${u.x}%`;
        el.style.top = `${u.y}%`;
        el.style.zIndex = 3 + Math.round(u.y);
    });
    box.querySelectorAll(".avatar").forEach((el) => {
        if (!seen.has(el.dataset.id)) el.remove();
    });
    $("online").textContent = Park.online ? `オンライン ${Math.max(1, Park.users.size)}人` : "オフライン（あなただけ表示）";
}

function showBubble(userId, text, isEmote) {
    const el = $("avatars").querySelector(`[data-id="${userId}"]`);
    if (!el) return;
    el.querySelectorAll(".bubble").forEach((b) => b.remove());
    const b = document.createElement("div");
    b.className = `bubble ${isEmote ? "emote" : ""}`;
    b.textContent = text;
    el.prepend(b);
    setTimeout(() => b.remove(), isEmote ? 2500 : 5000);
}

function addChat(html) {
    const log = $("chat-log");
    const d = document.createElement("div");
    d.innerHTML = html;
    log.appendChild(d);
    while (log.children.length > 100) log.firstChild.remove();
    log.scrollTop = log.scrollHeight;
}

// ===== 通信 =====
function send(dest, body) {
    if (!Park.online) return false;
    Park.stomp.publish({ destination: dest, body: JSON.stringify({ userId: Park.me.id, ...body }) });
    return true;
}

function sendMove() {
    const v = myView();
    send("/app/lobby/move", { x: v.x, y: v.y, avatar: v.avatar, title: v.title });
}

function connect() {
    if (typeof StompJs === "undefined" || Park.me.id == null) {
        addChat(`<div class="sys">サーバーに接続できないため、オフラインで表示しています。</div>`);
        drawAvatars();
        return;
    }
    const options = { reconnectDelay: 5000 };
    if (window.SockJS) options.webSocketFactory = () => new SockJS("/ws");
    else options.brokerURL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
    Park.stomp = new StompJs.Client(options);
    Park.stomp.onConnect = () => {
        Park.online = true;
        Park.stomp.subscribe("/topic/lobby", (frame) => onLobby(JSON.parse(frame.body)));
        sendMove();
        addChat(`<div class="sys">パークに入りました。</div>`);
        drawAvatars();
    };
    Park.stomp.onWebSocketClose = () => {
        Park.online = false;
        drawAvatars();
    };
    Park.stomp.onWebSocketError = () => {
        Park.online = false;
        drawAvatars();
    };
    Park.stomp.activate();
    // 20秒ごとに「まだいるよ」を送る（60秒来ないとサーバーが退室扱いにする）
    setInterval(() => Park.online && sendMove(), 20000);
    window.addEventListener("pagehide", () => send("/app/lobby/leave", {}));
}

function onLobby(msg) {
    switch (msg.type) {
        case "STATE":
            Park.users.clear();
            msg.users.forEach((u) => Park.users.set(Number(u.id), { ...u, id: Number(u.id) }));
            break;
        case "MOVE": {
            const u = { ...msg.user, id: Number(msg.user.id) };
            if (!Park.users.has(u.id)) addChat(`<div class="sys">${esc(u.name)} が来ました。</div>`);
            Park.users.set(u.id, u);
            break;
        }
        case "LEAVE": {
            const u = Park.users.get(Number(msg.userId));
            if (u) addChat(`<div class="sys">${esc(u.name)} が帰りました。</div>`);
            Park.users.delete(Number(msg.userId));
            break;
        }
        case "CHAT":
            addChat(`<div class="m"><b>${esc(msg.name)}</b>${esc(msg.text)}</div>`);
            drawAvatars();
            showBubble(Number(msg.userId), msg.text, false);
            return;
        case "EMOTE":
            showBubble(Number(msg.userId), msg.emote, true);
            return;
    }
    drawAvatars();
}

// ===== 操作 =====
function setupPlaza() {
    $("plaza").addEventListener("click", (e) => {
        if (e.target.closest(".sign")) return;
        const r = $("plaza").getBoundingClientRect();
        // 空（上の方）には行けない
        Park.pos = {
            x: Math.max(3, Math.min(97, ((e.clientX - r.left) / r.width) * 100)),
            y: Math.max(48, Math.min(97, ((e.clientY - r.top) / r.height) * 100)),
        };
        if (Park.users.has(Park.me.id)) Object.assign(Park.users.get(Park.me.id), Park.pos);
        drawAvatars();
        sendMove();
    });
    $("emotes").innerHTML = Park.EMOTES.map((e) => `<button type="button" data-e="${e}">${e}</button>`).join("");
    $("emotes").addEventListener("click", (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        if (!send("/app/lobby/emote", { emote: b.dataset.e })) showBubble(Park.me.id, b.dataset.e, true);
    });
    $("chat-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const text = $("chat-input").value.trim();
        if (!text) return;
        $("chat-input").value = "";
        if (typeof Missions !== "undefined") Missions.add("park_chat");
        if (!send("/app/lobby/chat", { text })) {
            addChat(`<div class="m"><b>${esc(Park.me.username)}</b>${esc(text)}</div>`);
            showBubble(Park.me.id, text, false);
        }
    });
    document.querySelectorAll(".side-tabs .gd-tab").forEach((t) => t.addEventListener("click", () => {
        document.querySelectorAll(".side-tabs .gd-tab").forEach((x) => x.classList.toggle("active", x === t));
        $("tab-chat").classList.toggle("hidden", t.dataset.tab !== "chat");
        $("tab-guild").classList.toggle("hidden", t.dataset.tab !== "guild");
        if (t.dataset.tab === "guild") Guild.render();
    }));
}

// ===== ギルド =====
const Guild = {
    async api(path, method = "GET", body) {
        const res = await fetch(`/api/guilds${path}`, {
            method,
            headers: { "Content-Type": "application/json" },
            body: body ? JSON.stringify({ userId: Park.me.id, ...body }) : undefined,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "通信に失敗しました");
        return data;
    },

    async myGuildId() {
        const res = await fetch(`/api/users/${Park.me.id}`);
        if (!res.ok) throw new Error("サーバーに接続できません");
        const data = await res.json();
        return data.user ? data.user.guildId : null;
    },

    async render() {
        const box = $("tab-guild");
        box.innerHTML = `<div class="small">読み込み中…</div>`;
        try {
            const gid = await Guild.myGuildId();
            if (gid) await Guild.renderMine(gid);
            else await Guild.renderList();
        } catch (e) {
            box.innerHTML = `<p class="err">${esc(e.message)}</p><p class="small">ギルドはサーバーに接続している時だけ使えます。</p>`;
        }
    },

    async renderList() {
        const list = await Guild.api("");
        $("tab-guild").innerHTML = `
            <div class="guild-card">
                <h4>ギルドを作る</h4>
                <input class="gd-input" id="g-name" maxlength="20" placeholder="ギルド名（20文字まで）" style="width:100%;margin-bottom:6px">
                <input class="gd-input" id="g-desc" maxlength="100" placeholder="ひとこと紹介（100文字まで）" style="width:100%;margin-bottom:6px">
                <button class="gd-btn primary" id="g-create">作成する</button>
                <div class="err" id="g-err"></div>
            </div>
            <div class="small" style="margin:6px 0">ギルド一覧（メンバーの合計勝利数でレベルが上がります）</div>
            ${list.length ? list.map((g) => `
                <div class="guild-card">
                    <h4>${esc(g.name)} <span class="small">Lv.${g.level}</span></h4>
                    <p>${esc(g.description || "")}</p>
                    <div class="small">メンバー ${g.members}人／合計 ${g.totalWins}勝</div>
                    <button class="gd-btn" data-join="${g.id}" style="margin-top:6px">加入する</button>
                </div>`).join("") : `<p class="small">まだギルドがありません。最初のギルドを作りましょう！</p>`}`;
        $("g-create").onclick = async () => {
            try {
                await Guild.api("", "POST", { name: $("g-name").value, description: $("g-desc").value });
                Guild.render();
            } catch (e) {
                $("g-err").textContent = e.message;
            }
        };
        document.querySelectorAll("[data-join]").forEach((b) => b.onclick = async () => {
            try {
                await Guild.api(`/${b.dataset.join}/join`, "POST", {});
                Guild.render();
            } catch (e) {
                alert(e.message);
            }
        });
    },

    async renderMine(gid) {
        const [g, msgs] = await Promise.all([Guild.api(`/${gid}`), Guild.api(`/${gid}/messages`)]);
        $("tab-guild").innerHTML = `
            <div class="guild-card">
                <h4>${esc(g.name)} <span class="small">Lv.${g.level}</span></h4>
                <p>${esc(g.description || "")}</p>
                <div class="small">メンバー ${g.members}人／合計 ${g.totalWins}勝（20勝ごとにレベルアップ）</div>
            </div>
            <div class="small">メンバー</div>
            ${g.memberList.map((m) => `<div class="member"><span>${m.id === g.leaderId ? "👑 " : ""}${esc(m.username)}${m.title ? ` <span class="small">${esc(m.title)}</span>` : ""}</span><span class="small">${m.wins}勝</span></div>`).join("")}
            <div class="small" style="margin-top:10px">掲示板</div>
            <form id="g-post" class="chat-form"><input class="gd-input" id="g-text" maxlength="200" placeholder="ギルドへのメッセージ" autocomplete="off"><button class="gd-btn primary">書く</button></form>
            <div>${msgs.map((m) => `<div class="board-msg"><b>${esc(m.username)}</b>${esc(m.text)}<div class="small">${esc(String(m.createdAt || "").replace("T", " ").slice(0, 16))}</div></div>`).join("") || '<p class="small">まだ書き込みがありません。</p>'}</div>
            <button class="gd-btn danger" id="g-leave" style="margin-top:10px">ギルドを脱退</button>`;
        $("g-post").onsubmit = async (e) => {
            e.preventDefault();
            const text = $("g-text").value.trim();
            if (!text) return;
            try {
                await Guild.api(`/${gid}/messages`, "POST", { text });
                Guild.render();
            } catch (err) {
                alert(err.message);
            }
        };
        $("g-leave").onclick = async () => {
            if (!confirm("ギルドを脱退しますか？")) return;
            await Guild.api(`/${gid}/leave`, "POST", {});
            Guild.render();
        };
    },
};

document.addEventListener("DOMContentLoaded", () => {
    setupPlaza();
    drawAvatars();
    connect();
});
