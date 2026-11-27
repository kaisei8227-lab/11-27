// js/missions.js
// デイリーミッション（毎日3つ）の進み具合を記録する
// 各画面から Missions.add("battle_win") のように呼ぶと、localStorage の user に保存される

const MISSION_POOL = [
    { id: 1, text: "バトルを1回プレイする", type: "battle_play", goal: 1, diff: "易" },
    { id: 2, text: "バトルで3回勝利する", type: "battle_win", goal: 3, diff: "中" },
    { id: 3, text: "カードを合計30枚プレイする", type: "cards_played", goal: 30, diff: "易" },
    { id: 4, text: "ランクマッチに2回挑戦する", type: "rank_play", goal: 2, diff: "易" },
    { id: 5, text: "フォロワーを10体召喚する", type: "followers", goal: 10, diff: "中" },
    { id: 7, text: "デッキを保存する", type: "deck_save", goal: 1, diff: "易" },
    { id: 8, text: "2Pickで1回対戦する", type: "twopick_play", goal: 1, diff: "易" },
    { id: 9, text: "パズルを1問クリアする", type: "puzzle_clear", goal: 1, diff: "中" },
    { id: 10, text: "フォロワーを2回超進化させる", type: "super_evolve", goal: 2, diff: "中" },
    { id: 11, text: "パークでチャットを1回送る", type: "park_chat", goal: 1, diff: "易" },
    { id: 12, text: "ランクマッチで1回勝利する", type: "rank_win", goal: 1, diff: "中" },
];

const Missions = {
    REWARD: 100, // 1つあたりのコイン

    today() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    },

    // 日付が変わっていたら、新しいミッション3つに入れ替える
    ensureToday(user) {
        if (user.lastMissionDate !== Missions.today() || !Array.isArray(user.dailyMissions)) {
            user.lastMissionDate = Missions.today();
            user.claimedMissions = [];
            user.missionProgress = {};
            user.dailyMissions = [...MISSION_POOL].sort(() => Math.random() - 0.5).slice(0, 3);
        }
        // 以前の形式（type がない）で保存されていたら補う
        // 以前の形式・なくなったミッション（カード生成など）は入れ替える
        user.dailyMissions = user.dailyMissions.map((m) => {
            const known = MISSION_POOL.find((p) => p.id === m.id && p.type === m.type) || MISSION_POOL.find((p) => p.id === m.id);
            return known || MISSION_POOL.find((p) => !user.dailyMissions.some((d) => d.id === p.id)) || MISSION_POOL[0];
        });
        user.missionProgress = user.missionProgress || {};
        user.claimedMissions = user.claimedMissions || [];
        return user;
    },

    add(type, amount = 1) {
        if (!amount) return;
        const user = Missions.ensureToday(JSON.parse(localStorage.getItem("user") || "{}"));
        user.missionProgress[type] = (user.missionProgress[type] || 0) + amount;
        localStorage.setItem("user", JSON.stringify(user));
    },

    progress(user, mission) {
        return Math.min(mission.goal, (user.missionProgress || {})[mission.type] || 0);
    },

    isDone(user, mission) {
        return Missions.progress(user, mission) >= mission.goal;
    },
};
