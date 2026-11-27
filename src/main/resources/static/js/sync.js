// ===================================================
// ゲームの進行をサーバーに保存する（どの端末でも続きから遊べるようにする）
//   localStorage の user / userDecksList / activeDeckIndex が変わると、
//   少し待ってから PUT /api/users/{id}/progress に送る。
//   ログイン時は login.html がサーバーの進行を localStorage に戻す。
// ===================================================
(function () {
    const KEYS = ["user", "userDecksList", "activeDeckIndex"];
    const DELAY = 800;
    let timer = null;

    function read(key, fallback) {
        try {
            const v = localStorage.getItem(key);
            return v == null ? fallback : JSON.parse(v);
        } catch (e) {
            return fallback;
        }
    }

    function snapshot() {
        return {
            version: 1,
            savedAt: new Date().toISOString(),
            user: read("user", {}),
            decks: read("userDecksList", []),
            activeDeckIndex: Number(read("activeDeckIndex", 0)) || 0,
        };
    }

    function push(keepalive) {
        timer = null;
        const user = read("user", null);
        if (!user || !user.id) return Promise.resolve(false);
        return fetch(`/api/users/${user.id}/progress`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                progress: JSON.stringify(snapshot()),
                mp: user.mp || 0,
                wins: user.wins || 0,
                losses: user.losses || 0,
                title: user.currentTitle || "",
            }),
            keepalive: !!keepalive,
        }).then(res => res.ok).catch(() => false);
    }

    function schedule() {
        clearTimeout(timer);
        timer = setTimeout(() => push(false), DELAY);
    }

    // localStorage.setItem を見張って、対象のキーが変わったら保存を予約する
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
        originalSetItem.call(this, key, value);
        if (this === window.localStorage && KEYS.includes(key)) schedule();
    };

    // ページを離れる時、まだ送っていなければすぐ送る
    window.addEventListener("pagehide", () => {
        if (timer) {
            clearTimeout(timer);
            push(true);
        }
    });

    // サーバーに保存された進行を localStorage に戻す（login.html から使う）
    function restore(serverUser) {
        let progress = null;
        try {
            progress = serverUser.progress ? JSON.parse(serverUser.progress) : null;
        } catch (e) {
            progress = null;
        }
        const base = { id: serverUser.id, username: serverUser.username, wins: serverUser.wins, losses: serverUser.losses };
        if (!progress || !progress.user) return false;

        const user = { ...progress.user, ...base, mp: Math.max(progress.user.mp || 0, serverUser.mp || 0) };
        user.wins = Math.max(progress.user.wins || 0, serverUser.wins || 0);
        user.losses = Math.max(progress.user.losses || 0, serverUser.losses || 0);
        originalSetItem.call(localStorage, "user", JSON.stringify(user));
        originalSetItem.call(localStorage, "userDecksList", JSON.stringify(progress.decks || []));
        originalSetItem.call(localStorage, "activeDeckIndex", String(progress.activeDeckIndex || 0));
        return true;
    }

    window.GameSync = { push, snapshot, restore };
})();
