// ===================================================
// 1. MPに応じたランクデータ定義（0 MPスタート対応）
// ===================================================
const RANK_TABLE = [
    { name: "Beginner 0", minMp: 0, maxMp: 199, icon: "🟢" },
    { name: "Beginner 1", minMp: 200, maxMp: 499, icon: "🟢" },
    { name: "Beginner 2", minMp: 500, maxMp: 999, icon: "🟢" },
    { name: "Beginner 3", minMp: 1000, maxMp: 1999, icon: "🟢" },
    { name: "D0", minMp: 2000, maxMp: 3499, icon: "🟠" },
    { name: "D1", minMp: 3500, maxMp: 4999, icon: "🟠" },
    { name: "D2", minMp: 5000, maxMp: 6999, icon: "🟠" },
    { name: "D3", minMp: 7000, maxMp: 8999, icon: "🟠" },
    { name: "C0", minMp: 9000, maxMp: 11499, icon: "🔴" },
    { name: "C1", minMp: 11500, maxMp: 13999, icon: "🔴" },
    { name: "C2", minMp: 14000, maxMp: 16999, icon: "🔴" },
    { name: "C3", minMp: 17000, maxMp: 19999, icon: "🔴" },
    { name: "B0", minMp: 20000, maxMp: 23999, icon: "💎" },
    { name: "B1", minMp: 24000, maxMp: 27999, icon: "💎" },
    { name: "B2", minMp: 28000, maxMp: 31999, icon: "💎" },
    { name: "B3", minMp: 32000, maxMp: 37999, icon: "💎" },
    { name: "A0", minMp: 38000, maxMp: 43499, icon: "🟣" },
    { name: "A1", minMp: 43500, maxMp: 49399, icon: "🟣" },
    { name: "A2", minMp: 49400, maxMp: 55999, icon: "🟣" },
    { name: "A3", minMp: 56000, maxMp: 62999, icon: "🟣" },
    { name: "AA0", minMp: 63000, maxMp: 70999, icon: "🔵" },
    { name: "AA1", minMp: 71000, maxMp: 79999, icon: "🔵" },
    { name: "AA2", minMp: 80000, maxMp: 89999, icon: "🔵" },
    { name: "AA3", minMp: 90000, maxMp: 99999, icon: "🔵" },
    { name: "Master", minMp: 100000, maxMp: 150000, icon: "🏆" },
    { name: "Grand Master 1", minMp: 150001, maxMp: 199999, icon: "👑" },
    { name: "Grand Master 2", minMp: 200000, maxMp: 249999, icon: "👑" },
    { name: "Grand Master 3", minMp: 250000, maxMp: 999999999, icon: "👑" }
];

// マスター以上か（マスター = 100,000MP 以上）
function isMasterRank(mp = 0) {
    return mp >= 100000;
}

// MPから現在のランク情報を計算するユーティリティ関数
function getRankInfo(mp = 0) {
    let rank = RANK_TABLE.find(r => mp >= r.minMp && mp <= r.maxMp);
    if (!rank) {
        rank = RANK_TABLE[RANK_TABLE.length - 1]; // 最大値超過時はGrand Master
    }
    const nextMp = rank.maxMp + 1 - mp;
    return {
        name: rank.name,
        icon: rank.icon,
        currentMp: mp,
        nextMp: Math.max(0, nextMp)
    };
}


// ===================================================
// 2. グループ＆獲得MPボーナス定義
// ===================================================
// グループは「直近10試合（AI戦を除く）の勝率」で1段階ずつ上がる。
//   エメラルド → トパーズ    : 勝率 20% 以上
//   トパーズ   → ルビー      : 勝率 40% 以上
//   ルビー     → サファイア  : 勝率 60% 以上
//   サファイア → ダイヤモンド: 勝率 80% 以上
// 勝率は「直近10試合の勝ち数 ÷ 10」（10試合に満たない間は、足りない分を負け扱い）。
// グループが下がることはない。
const GROUP_TABLE = [
    { name: "エメラルド",   promoteRate: 0,    mpBonus: 100, icon: "🟢", color: "#48bb78" },
    { name: "トパーズ",     promoteRate: 0.2,  mpBonus: 110, icon: "🟠", color: "#ed8936" },
    { name: "ルビー",       promoteRate: 0.4,  mpBonus: 120, icon: "🔴", color: "#e53e3e" },
    { name: "サファイア",   promoteRate: 0.6,  mpBonus: 130, icon: "🔵", color: "#3182ce" },
    { name: "ダイヤモンド", promoteRate: 0.8,  mpBonus: 150, icon: "💎", color: "#00f0ff" }
];
const GROUP_RECENT_MATCHES = 10;

// グループ情報を返す（引数は user オブジェクト または グループ名）
function getGroupInfo(userOrName) {
    const name = typeof userOrName === "string" ? userOrName : (userOrName && userOrName.group);
    return GROUP_TABLE.find(g => g.name === name) || GROUP_TABLE[0];
}

// 直近10試合（対人戦のみ）の勝率 0〜1
function getRecentWinRate(user) {
    const recent = (user && Array.isArray(user.recentPvp)) ? user.recentPvp.slice(-GROUP_RECENT_MATCHES) : [];
    return recent.filter(Boolean).length / GROUP_RECENT_MATCHES;
}

// 対人戦の結果を記録してグループを判定する（AI 戦では呼ばない）
// 戻り値: { group, promoted, winRate }
function recordPvpResult(user, isWin) {
    user.recentPvp = Array.isArray(user.recentPvp) ? user.recentPvp : [];
    user.recentPvp.push(!!isWin);
    user.recentPvp = user.recentPvp.slice(-GROUP_RECENT_MATCHES);

    const current = getGroupInfo(user);
    const index = GROUP_TABLE.indexOf(current);
    const next = GROUP_TABLE[index + 1];
    const winRate = getRecentWinRate(user);
    let promoted = false;
    if (next && winRate >= next.promoteRate) {
        user.group = next.name;
        promoted = true;
    } else {
        user.group = current.name;
    }
    return { group: getGroupInfo(user), promoted, winRate };
}
