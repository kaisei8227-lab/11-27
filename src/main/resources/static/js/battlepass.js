// js/battlepass.js
// バトルパス: 毎月（シーズン）リセット。バトルやミッションでポイントを貯め、1000ptごとにレベルが1上がる（最大50）
// 報酬はコインと見た目アイテム（ガチャ・カードパックは無し）
// 保存先: localStorage の user.battlePass = { season: "2026-11", points, claimed: [レベル...] }

const BattlePass = {
    MAX_LEVEL: 50,
    PER_LEVEL: 1000,
    POINTS: {
        rank_win: 500, rank_lose: 150,      // ランクマッチ（CPU戦に切り替えた時も）
        twopick_win: 400, twopick_lose: 150,
        free_win: 150, free_lose: 50,       // フリーマッチ・ソロ
        mission: 1000,                      // デイリーミッション1つ
        puzzle: 300,
    },

    season(date = new Date()) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    },

    seasonEnd(date = new Date()) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 1);
    },

    // レベルごとの報酬: 10の倍数は称号・見た目、5の倍数はコイン多め、それ以外はコイン
    reward(level) {
        const special = {
            10: { item: "title_bp10" }, 15: { item: "sleeve_bp_master" }, 20: { item: "title_bp20" },
            25: { item: "acc_bp_wings" }, 30: { item: "title_bp30" }, 35: { item: "outfit_bp_vampire" },
            40: { item: "title_bp40" }, 50: { item: "title_bp50", coin: 3000 },
        };
        if (special[level]) return special[level];
        return { coin: level % 5 === 0 ? 500 : 100 };
    },

    rewardLabel(r) {
        const parts = [];
        if (r.item) {
            const it = typeof Cosmetics !== "undefined" ? Cosmetics.get(r.item) : null;
            parts.push(it ? `${COSMETIC_KINDS[it.kind]}「${it.name}」` : r.item);
        }
        if (r.coin) parts.push(`🪙 ${r.coin}`);
        return parts.join(" ＋ ");
    },

    ensure(user) {
        const now = BattlePass.season();
        if (!user.battlePass || user.battlePass.season !== now) {
            user.battlePass = { season: now, points: 0, claimed: [] };
        }
        return user;
    },

    level(user) {
        const bp = BattlePass.ensure(user).battlePass;
        return Math.min(BattlePass.MAX_LEVEL, Math.floor(bp.points / BattlePass.PER_LEVEL));
    },

    // type: POINTS のキー。戻り値: { gained, level, levelUp }
    add(type) {
        const pts = BattlePass.POINTS[type] || 0;
        const user = BattlePass.ensure(JSON.parse(localStorage.getItem("user") || "{}"));
        const before = BattlePass.level(user);
        const cap = BattlePass.MAX_LEVEL * BattlePass.PER_LEVEL;
        user.battlePass.points = Math.min(cap, user.battlePass.points + pts);
        localStorage.setItem("user", JSON.stringify(user));
        const after = BattlePass.level(user);
        return { gained: pts, level: after, levelUp: after > before };
    },

    canClaim(user, level) {
        return level <= BattlePass.level(user) && !BattlePass.ensure(user).battlePass.claimed.includes(level);
    },

    claim(level) {
        const user = BattlePass.ensure(JSON.parse(localStorage.getItem("user") || "{}"));
        if (!BattlePass.canClaim(user, level)) return null;
        const r = BattlePass.reward(level);
        user.battlePass.claimed.push(level);
        if (r.coin) user.coin = (user.coin || 0) + r.coin;
        if (r.item && typeof Cosmetics !== "undefined") {
            Cosmetics.ensure(user);
            if (!user.cosmetics.owned.includes(r.item)) user.cosmetics.owned.push(r.item);
        }
        localStorage.setItem("user", JSON.stringify(user));
        return r;
    },
};
