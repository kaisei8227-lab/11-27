// js/twopick.js
// 2Pick: 提示された2枚1組のどちらかを選ぶのを15回くり返して30枚のデッキを作り、
//        7勝するか2敗するまで対戦する（対人戦。相手がいなければCPU戦）
// 保存先: localStorage の twoPickRun

const TwoPick = {
    PICKS: 15,
    MAX_WINS: 7,
    MAX_LOSSES: 2,
    REROLLS: 2,
    KEY: "twoPickRun",

    load() {
        try { return JSON.parse(localStorage.getItem(TwoPick.KEY) || "null"); } catch (e) { return null; }
    },
    save(run) {
        localStorage.setItem(TwoPick.KEY, JSON.stringify(run));
    },
    clear() {
        localStorage.removeItem(TwoPick.KEY);
    },

    pool(cls) {
        return CARD_DATABASE.filter((c) => !c.isToken && c.implemented !== false && (c.class === cls || c.class === CLASS.NEUTRAL));
    },

    // 1枚選ぶ（エースは出にくい）
    drawOne(cls, exclude = new Set()) {
        const pool = TwoPick.pool(cls).filter((c) => !exclude.has(c.id));
        const aces = pool.filter((c) => c.rarity === "エース");
        const normal = pool.filter((c) => c.rarity !== "エース");
        const list = Math.random() < 0.12 && aces.length ? aces : normal;
        return list[Math.floor(Math.random() * list.length)];
    },

    // 2枚1組を2つ
    offer(cls) {
        const used = new Set();
        const pair = () => {
            const a = TwoPick.drawOne(cls, used); used.add(a.id);
            const b = TwoPick.drawOne(cls, used); used.add(b.id);
            return [a.id, b.id];
        };
        return [pair(), pair()];
    },

    // 新しく始める: クラス候補3つ（それぞれ見本のエースを1枚表示）
    start() {
        const classes = [CLASS.NOBLE, CLASS.MONSTER, CLASS.GHOST, CLASS.WITCH, CLASS.PUPPET, CLASS.HUNTER, CLASS.PIRATE]
            .sort(() => Math.random() - 0.5).slice(0, 3);
        const run = {
            state: "class",
            classOptions: classes.map((cls) => {
                const aces = CARD_DATABASE.filter((c) => c.class === cls && c.rarity === "エース" && !c.isToken);
                return { cls, ace: aces[Math.floor(Math.random() * aces.length)].id };
            }),
            cls: null, deck: [], offer: null, rerolls: TwoPick.REROLLS, wins: 0, losses: 0, results: [],
            startedAt: Date.now(),
        };
        TwoPick.save(run);
        return run;
    },

    chooseClass(run, cls) {
        const opt = run.classOptions.find((o) => o.cls === cls);
        run.cls = cls;
        run.deck = opt ? [opt.ace] : []; // 見本のエースは最初の1枚としてもらえる（このぶん最後の組は1枚だけ選ぶ）
        run.state = "pick";
        run.offer = TwoPick.offer(cls);
        TwoPick.save(run);
        return run;
    },

    pick(run, index) {
        const pair = run.offer[index];
        run.deck.push(...pair);
        if (run.deck.length >= TwoPick.PICKS * 2) {
            run.deck = run.deck.slice(0, TwoPick.PICKS * 2);
            run.state = "battle";
            run.offer = null;
        } else {
            run.offer = TwoPick.offer(run.cls);
        }
        TwoPick.save(run);
        return run;
    },

    reroll(run) {
        if (run.rerolls <= 0 || run.state !== "pick") return run;
        run.rerolls--;
        run.offer = TwoPick.offer(run.cls);
        TwoPick.save(run);
        return run;
    },

    record(isWin) {
        const run = TwoPick.load();
        if (!run || run.state !== "battle") return null;
        if (isWin) run.wins++; else run.losses++;
        run.results.push(isWin ? "W" : "L");
        if (run.wins >= TwoPick.MAX_WINS || run.losses >= TwoPick.MAX_LOSSES) run.state = "done";
        TwoPick.save(run);
        return run;
    },

    // 終了時の報酬（勝利数に応じてコイン。7勝で称号）
    reward(run) {
        return { coin: 100 + run.wins * 150 + (run.wins >= TwoPick.MAX_WINS ? 500 : 0), title: run.wins >= TwoPick.MAX_WINS };
    },

    claimReward() {
        const run = TwoPick.load();
        if (!run || run.state !== "done" || run.rewarded) return null;
        const r = TwoPick.reward(run);
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        user.coin = (user.coin || 0) + r.coin;
        user.twoPickBest = Math.max(user.twoPickBest || 0, run.wins);
        localStorage.setItem("user", JSON.stringify(user));
        if (r.title && typeof Cosmetics !== "undefined") Cosmetics.grant("title_2pick");
        run.rewarded = true;
        TwoPick.save(run);
        return r;
    },
};
