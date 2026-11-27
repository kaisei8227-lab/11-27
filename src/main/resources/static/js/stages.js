// js/stages.js
// 対戦ステージ（盤面の背景）。バトル選択画面で選び、battle.js が盤面に反映する
// 保存先: localStorage の battleStage（"random" ならバトルのたびにランダム）

const STAGES = [
    {
        id: "forest", name: "苔むす古城の庭",
        bg: "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(201,165,76,0.10), transparent 70%), repeating-linear-gradient(45deg, rgba(255,255,255,0.012) 0 2px, transparent 2px 14px), radial-gradient(circle at 50% 50%, #2e4726 0%, #121c0e 65%, #080d06 100%)",
    },
    {
        id: "fog", name: "霧の街の石畳",
        bg: "radial-gradient(ellipse 70% 35% at 50% 50%, rgba(255,214,140,0.12), transparent 70%), repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(255,255,255,0.02) 0 1px, transparent 1px 40px), radial-gradient(circle at 50% 45%, #4a4a52 0%, #26252c 60%, #0e0d12 100%)",
    },
    {
        id: "crimson", name: "真紅の大広間",
        bg: "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(255,200,120,0.10), transparent 70%), repeating-linear-gradient(45deg, rgba(255,215,107,0.03) 0 2px, transparent 2px 22px), radial-gradient(circle at 50% 50%, #5a1220 0%, #2a0810 62%, #0e0205 100%)",
    },
    {
        id: "graveyard", name: "月夜の墓地",
        bg: "radial-gradient(circle at 78% 18%, rgba(230,240,255,0.18), transparent 18%), radial-gradient(ellipse 60% 30% at 50% 50%, rgba(160,190,255,0.08), transparent 70%), radial-gradient(circle at 50% 50%, #1f2c47 0%, #0e1426 62%, #04060d 100%)",
    },
    {
        id: "ship", name: "幽霊船の甲板",
        bg: "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(120,255,220,0.08), transparent 70%), repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 3px, transparent 3px 46px), radial-gradient(circle at 50% 50%, #3b2a1a 0%, #1e150c 60%, #080503 100%)",
    },
    {
        id: "library", name: "禁書の図書館",
        bg: "radial-gradient(ellipse 60% 30% at 50% 50%, rgba(200,150,255,0.10), transparent 70%), repeating-linear-gradient(0deg, rgba(0,0,0,0.25) 0 2px, transparent 2px 34px), radial-gradient(circle at 50% 50%, #3a2350 0%, #1a0f26 62%, #07040c 100%)",
    },
];

const Stages = {
    selected() {
        return localStorage.getItem("battleStage") || "random";
    },
    select(id) {
        localStorage.setItem("battleStage", id);
    },
    get(id) {
        return STAGES.find((s) => s.id === id) || null;
    },
    // 今回のバトルで使うステージ（random ならランダムに1つ）
    resolve() {
        const id = Stages.selected();
        return Stages.get(id) || STAGES[Math.floor(Math.random() * STAGES.length)];
    },
};
