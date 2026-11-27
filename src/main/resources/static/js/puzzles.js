// js/puzzles.js
// パズル（詰めシャドバ）: 決められた盤面から「このターン中に相手リーダーを倒す」問題
// setup(game, me, cpu) で盤面を作る。ターン終了を押すと失敗。

const PuzzleKit = {
    card(id, opts = {}) {
        const c = createCardInstance(id);
        c.summonedThisTurn = !!opts.summoned;
        return c;
    },
    // 共通の初期化: 手札・場・墓地を空にして、自分のターンにする
    base(game, me, cpu, { turn = 6, pp = 6, isFirst = false, ep = 0, sep = 0, oppHp = 20 } = {}) {
        game.phase = "play";
        game.current = me;
        me.isFirst = isFirst;
        cpu.isFirst = !isFirst;
        me.turnCount = turn;
        me.maxPp = Math.min(10, Math.max(pp, turn));
        me.pp = pp;
        me.evolvePoints = ep;
        me.superEvolvePoints = sep;
        me.evolvedThisTurn = false;
        me.extraPp = { early: false, late: false, usedThisTurn: false };
        me.hand = [];
        me.field = [];
        me.graveyard = [];
        cpu.hand = [];
        cpu.field = [];
        cpu.graveyard = [];
        cpu.leader.hp = oppHp;
        cpu.leader.maxHp = Math.max(oppHp, cpu.leader.maxHp);
    },
};

const PUZZLES = [
    {
        id: 1,
        title: "はじめての超進化",
        goal: "超進化を使って、このターン中に相手リーダーを倒そう",
        hint: "超進化したカードで相手のカードを倒すと、相手リーダーにも1ダメージ入ります。",
        setup(game, me, cpu) {
            PuzzleKit.base(game, me, cpu, { turn: 6, pp: 6, ep: 1, sep: 1, oppHp: 3 });
            me.field.push(PuzzleKit.card(16), PuzzleKit.card(7));     // 古き血統の騎士 4/4、見習いの令息 2/2
            cpu.field.push(PuzzleKit.card(452));                       // 門を守る犬 2/3 守護
        },
    },
    {
        id: 2,
        title: "あと1つのPP",
        goal: "後攻だけの「エクストラPP」を使って、相手リーダーを倒そう",
        hint: "EX PP ボタンを押すと、このターンだけ PP が1増えます。",
        setup(game, me, cpu) {
            PuzzleKit.base(game, me, cpu, { turn: 3, pp: 3, isFirst: false, oppHp: 3 });
            me.hand.push(PuzzleKit.card(350), PuzzleKit.card(313));  // 禁忌の火球(3)・業炎の呪詛(4)
        },
    },
    {
        id: 3,
        title: "守護を越えて",
        goal: "守護をどかして、相手リーダーの体力7を削り切ろう",
        hint: "全体強化の魔法を先に使うと、攻撃が届くようになります。",
        setup(game, me, cpu) {
            PuzzleKit.base(game, me, cpu, { turn: 7, pp: 7, isFirst: true, oppHp: 7 });
            me.field.push(PuzzleKit.card(16), PuzzleKit.card(9));     // 古き血統の騎士 4/4、血の従者 3/2
            me.hand.push(PuzzleKit.card(293), PuzzleKit.card(297));  // 業火の一撃、大魔女の降臨
            cpu.field.push(PuzzleKit.card(441));                       // 盾持ちの新兵 1/5 守護
        },
    },
    {
        id: 4,
        title: "雷鳴の王",
        goal: "疾走を持つカードで一気に9ダメージを与えよう",
        hint: "雷神王は、場にいる他のカードの攻撃力も上げてくれます。",
        setup(game, me, cpu) {
            PuzzleKit.base(game, me, cpu, { turn: 6, pp: 6, isFirst: true, oppHp: 9 });
            me.field.push(PuzzleKit.card(6));                          // 侍従の吸血鬼 1/2
            me.hand.push(PuzzleKit.card(70), PuzzleKit.card(12));    // 雷神王、血族の護衛
        },
    },
    {
        id: 5,
        title: "総力戦",
        goal: "場の3体を強化して、相手リーダーの体力12を削り切ろう",
        hint: "強化は何回でも重ねられます。PPの使い道をよく考えて。",
        setup(game, me, cpu) {
            PuzzleKit.base(game, me, cpu, { turn: 8, pp: 8, isFirst: true, oppHp: 12 });
            me.field.push(PuzzleKit.card(7), PuzzleKit.card(7), PuzzleKit.card(7)); // 見習いの令息 2/2 ×3
            me.hand.push(PuzzleKit.card(3), PuzzleKit.card(540), PuzzleKit.card(23)); // 血の盟約者、甲板長の号令、城壁の守備隊長
            cpu.field.push(PuzzleKit.card(20));                        // 忠実なる従僕 2/6
        },
    },
];

const Puzzles = {
    cleared(user = JSON.parse(localStorage.getItem("user") || "{}")) {
        return user.clearedPuzzles || [];
    },
    // クリア記録。初回だけコイン +200（全問クリアで称号）
    markCleared(id) {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        user.clearedPuzzles = user.clearedPuzzles || [];
        const first = !user.clearedPuzzles.includes(id);
        if (first) {
            user.clearedPuzzles.push(id);
            user.coin = (user.coin || 0) + 200;
        }
        localStorage.setItem("user", JSON.stringify(user));
        if (first && user.clearedPuzzles.length === PUZZLES.length && typeof Cosmetics !== "undefined") Cosmetics.grant("title_puzzle");
        return first;
    },
};
