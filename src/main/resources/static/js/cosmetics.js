// js/cosmetics.js
// 見た目アイテム（アバターの髪型・髪色・服・アクセサリー、カードスリーブ、称号）
// ガチャは無し。コインで買う（shop.html）か、バトルパスの報酬でもらう。
// 保存先: localStorage の user.cosmetics = { owned: [id...], equipped: { hair, hairColor, outfit, accessory, sleeve, title } }

const COSMETICS = [
    // --- 髪型 ---
    { id: "hair_short", kind: "hair", name: "ショート", price: 0 },
    { id: "hair_long", kind: "hair", name: "ロング", price: 0 },
    { id: "hair_twin", kind: "hair", name: "ツインテール", price: 300 },
    { id: "hair_pony", kind: "hair", name: "ポニーテール", price: 300 },
    { id: "hair_spike", kind: "hair", name: "ツンツン", price: 300 },
    { id: "hair_bob", kind: "hair", name: "ボブ", price: 300 },
    // --- 髪色 ---
    { id: "color_black", kind: "hairColor", name: "黒", color: "#1d1820", price: 0 },
    { id: "color_silver", kind: "hairColor", name: "銀", color: "#d9dde6", price: 0 },
    { id: "color_crimson", kind: "hairColor", name: "深紅", color: "#a3122f", price: 200 },
    { id: "color_violet", kind: "hairColor", name: "紫", color: "#7b3fc4", price: 200 },
    { id: "color_gold", kind: "hairColor", name: "金", color: "#e8b93b", price: 200 },
    { id: "color_azure", kind: "hairColor", name: "蒼", color: "#2f6fd6", price: 200 },
    // --- 服 ---
    { id: "outfit_coat", kind: "outfit", name: "黒のロングコート", color: "#1b1424", trim: "#c9a050", price: 0 },
    { id: "outfit_dress", kind: "outfit", name: "ゴシックドレス", color: "#3a0d1e", trim: "#e0b3c5", price: 500 },
    { id: "outfit_knight", kind: "outfit", name: "聖騎士の鎧", color: "#8b95a6", trim: "#ffd76b", price: 800 },
    { id: "outfit_witch", kind: "outfit", name: "魔女のローブ", color: "#2b1450", trim: "#b98cff", price: 600 },
    { id: "outfit_pirate", kind: "outfit", name: "船長の外套", color: "#123056", trim: "#e8b93b", price: 600 },
    { id: "outfit_bp_vampire", kind: "outfit", name: "真祖の礼装", color: "#5a0012", trim: "#ffd76b", price: null, pass: true },
    // --- アクセサリー ---
    { id: "acc_none", kind: "accessory", name: "なし", price: 0 },
    { id: "acc_crown", kind: "accessory", name: "王冠", icon: "♛", price: 1000 },
    { id: "acc_horns", kind: "accessory", name: "悪魔の角", icon: "♈", price: 700 },
    { id: "acc_halo", kind: "accessory", name: "天使の輪", icon: "◯", price: 700 },
    { id: "acc_hat", kind: "accessory", name: "魔女帽子", icon: "▲", price: 500 },
    { id: "acc_bp_wings", kind: "accessory", name: "蝙蝠の翼", icon: "⋀", price: null, pass: true },
    // --- カードスリーブ（カードの裏面） ---
    { id: "sleeve_default", kind: "sleeve", name: "夜の紋章", bg: "linear-gradient(135deg,#1d1730,#0b0814)", mark: "✦", price: 0 },
    { id: "sleeve_blood", kind: "sleeve", name: "血の薔薇", bg: "linear-gradient(135deg,#5a0012,#16020a)", mark: "❦", price: 400 },
    { id: "sleeve_moon", kind: "sleeve", name: "蒼い月", bg: "linear-gradient(135deg,#123a6b,#050d1c)", mark: "☾", price: 400 },
    { id: "sleeve_forest", kind: "sleeve", name: "禁書の森", bg: "linear-gradient(135deg,#1f4a2b,#051208)", mark: "✶", price: 400 },
    { id: "sleeve_gold", kind: "sleeve", name: "黄金の十字", bg: "linear-gradient(135deg,#6b4a10,#1a1003)", mark: "✠", price: 800 },
    { id: "sleeve_bp_master", kind: "sleeve", name: "覇者の証", bg: "conic-gradient(from 45deg,#2b0050,#ffd76b,#2b0050,#ffd76b,#2b0050)", mark: "♛", price: null, pass: true },
    // --- 称号 ---
    { id: "title_none", kind: "title", name: "称号なし", price: 0 },
    { id: "title_novice", kind: "title", name: "見習い決闘者", price: 0 },
    { id: "title_night", kind: "title", name: "夜を歩く者", price: 300 },
    { id: "title_rose", kind: "title", name: "薔薇の誓い", price: 300 },
    { id: "title_bp10", kind: "title", name: "宵の挑戦者", price: null, pass: true },
    { id: "title_bp20", kind: "title", name: "月下の剣士", price: null, pass: true },
    { id: "title_bp30", kind: "title", name: "深淵を覗く者", price: null, pass: true },
    { id: "title_bp40", kind: "title", name: "黄昏の覇者", price: null, pass: true },
    { id: "title_bp50", kind: "title", name: "永夜の王", price: null, pass: true },
    { id: "title_2pick", kind: "title", name: "二択の魔術師", price: null, reward: "2Pickで7勝" },
    { id: "title_puzzle", kind: "title", name: "詰めの名手", price: null, reward: "パズルを全問クリア" },
    { id: "title_master", kind: "title", name: "マスター", price: null, reward: "マスターランク到達" },
];

const COSMETIC_KINDS = {
    hair: "髪型", hairColor: "髪色", outfit: "服", accessory: "アクセサリー", sleeve: "スリーブ", title: "称号",
};

const Cosmetics = {
    get(id) {
        return COSMETICS.find((c) => c.id === id) || null;
    },

    // 最初から持っているもの（price 0）＋買った・もらったもの
    ensure(user) {
        user.cosmetics = user.cosmetics || {};
        const owned = new Set(user.cosmetics.owned || []);
        COSMETICS.filter((c) => c.price === 0).forEach((c) => owned.add(c.id));
        // 以前の称号機能（unlockedTitles）で作った称号は、そのまま使えるように残す
        user.cosmetics.owned = [...owned];
        user.cosmetics.equipped = Object.assign({
            hair: "hair_short", hairColor: "color_black", outfit: "outfit_coat",
            accessory: "acc_none", sleeve: "sleeve_default", title: "title_novice",
        }, user.cosmetics.equipped || {});
        return user;
    },

    load() {
        return Cosmetics.ensure(JSON.parse(localStorage.getItem("user") || "{}"));
    },

    save(user) {
        localStorage.setItem("user", JSON.stringify(user));
    },

    owns(user, id) {
        return (user.cosmetics?.owned || []).includes(id);
    },

    grant(id) {
        const user = Cosmetics.load();
        if (!Cosmetics.owns(user, id)) user.cosmetics.owned.push(id);
        Cosmetics.save(user);
    },

    // 戻り値: { ok, message }
    buy(id) {
        const item = Cosmetics.get(id);
        const user = Cosmetics.load();
        if (!item || item.price == null) return { ok: false, message: "このアイテムは購入できません" };
        if (Cosmetics.owns(user, id)) return { ok: false, message: "すでに持っています" };
        if ((user.coin || 0) < item.price) return { ok: false, message: "コインが足りません" };
        user.coin -= item.price;
        user.cosmetics.owned.push(id);
        Cosmetics.save(user);
        return { ok: true, message: `「${item.name}」を購入しました` };
    },

    equip(id) {
        const item = Cosmetics.get(id);
        const user = Cosmetics.load();
        if (!item || !Cosmetics.owns(user, id)) return false;
        user.cosmetics.equipped[item.kind] = id;
        if (item.kind === "title") user.currentTitle = item.name;
        Cosmetics.save(user);
        return true;
    },

    equipped(user = Cosmetics.load()) {
        return Cosmetics.ensure(user).cosmetics.equipped;
    },

    titleName(user = Cosmetics.load()) {
        const id = Cosmetics.equipped(user).title || "";
        if (id.startsWith("custom:")) return id.slice(7); // プロフィールで作った自作の称号
        const t = Cosmetics.get(id);
        return t && t.id !== "title_none" ? t.name : "";
    },

    // 称号の一覧（持っている称号アイテム＋自作の称号）
    titles(user = Cosmetics.load()) {
        const items = COSMETICS.filter((c) => c.kind === "title" && Cosmetics.owns(user, c.id)).map((c) => ({ id: c.id, name: c.name }));
        const custom = (user.unlockedTitles || []).filter((t) => t && t !== "称号なし").map((t) => ({ id: `custom:${t}`, name: t }));
        return [...items, ...custom];
    },

    equipTitle(id) {
        const user = Cosmetics.load();
        const name = id.startsWith("custom:") ? id.slice(7) : (Cosmetics.get(id) || {}).name;
        if (!name) return false;
        if (!id.startsWith("custom:") && !Cosmetics.owns(user, id)) return false;
        user.cosmetics.equipped.title = id;
        user.currentTitle = id === "title_none" ? "" : name;
        Cosmetics.save(user);
        return true;
    },

    // アバター（avatar = equipped と同じ形）を SVG で描く
    avatarSvg(avatar = Cosmetics.equipped(), size = 120) {
        const hair = avatar.hair || "hair_short";
        const hc = (Cosmetics.get(avatar.hairColor) || {}).color || "#1d1820";
        const of = Cosmetics.get(avatar.outfit) || Cosmetics.get("outfit_coat");
        const acc = Cosmetics.get(avatar.accessory);
        const hairShapes = {
            hair_short: `<path d="M30 46 Q30 18 60 16 Q90 18 90 46 Q84 30 60 30 Q36 30 30 46Z" fill="${hc}"/>`,
            hair_long: `<path d="M28 48 Q28 16 60 14 Q92 16 92 48 L96 96 Q84 80 86 50 Q60 30 34 50 Q36 80 24 96Z" fill="${hc}"/>`,
            hair_twin: `<path d="M30 46 Q30 18 60 16 Q90 18 90 46 Q84 30 60 30 Q36 30 30 46Z" fill="${hc}"/><path d="M28 40 Q8 60 16 92 Q22 70 32 52Z M92 40 Q112 60 104 92 Q98 70 88 52Z" fill="${hc}"/>`,
            hair_pony: `<path d="M30 46 Q30 18 60 16 Q90 18 90 46 Q84 30 60 30 Q36 30 30 46Z" fill="${hc}"/><path d="M84 24 Q112 30 100 78 Q96 52 86 36Z" fill="${hc}"/>`,
            hair_spike: `<path d="M28 46 L34 14 L44 30 L52 8 L60 28 L70 8 L76 30 L88 14 L92 46 Q84 32 60 32 Q36 32 28 46Z" fill="${hc}"/>`,
            hair_bob: `<path d="M26 60 Q24 16 60 14 Q96 16 94 60 Q88 40 86 34 Q60 26 34 34 Q32 40 26 60Z" fill="${hc}"/>`,
        };
        const accSvg = !acc || acc.id === "acc_none" ? "" : {
            acc_crown: `<path d="M40 16 L46 2 L54 12 L60 0 L66 12 L74 2 L80 16Z" fill="#ffd76b" stroke="#8a5a00"/>`,
            acc_horns: `<path d="M34 24 Q24 4 38 8 Q36 16 40 22Z M86 24 Q96 4 82 8 Q84 16 80 22Z" fill="#3a0a12"/>`,
            acc_halo: `<ellipse cx="60" cy="6" rx="22" ry="5" fill="none" stroke="#fff3a8" stroke-width="3"/>`,
            acc_hat: `<path d="M26 22 L94 22 L72 16 L60 -10 L48 16Z" fill="#241040" stroke="#b98cff"/>`,
            acc_bp_wings: `<path d="M22 84 Q-2 64 4 44 Q14 58 26 60 Q16 70 22 84Z M98 84 Q122 64 116 44 Q106 58 94 60 Q104 70 98 84Z" fill="#2a0a1a" stroke="#ff4d6d"/>`,
        }[acc.id] || "";
        return `<svg viewBox="-4 -12 128 140" width="${size}" height="${size * 140 / 128}" class="avatar-svg">
            ${avatar.accessory === "acc_bp_wings" ? accSvg : ""}
            <path d="M24 126 Q26 82 60 78 Q94 82 96 126Z" fill="${of.color}" stroke="${of.trim}" stroke-width="2"/>
            <path d="M52 80 L60 96 L68 80" fill="none" stroke="${of.trim}" stroke-width="2"/>
            <rect x="52" y="64" width="16" height="16" fill="#f3dccb"/>
            <ellipse cx="60" cy="46" rx="26" ry="28" fill="#f7e4d6"/>
            <ellipse cx="50" cy="48" rx="3" ry="4" fill="#2a1830"/><ellipse cx="70" cy="48" rx="3" ry="4" fill="#2a1830"/>
            <path d="M54 60 Q60 64 66 60" fill="none" stroke="#a0525a" stroke-width="2" stroke-linecap="round"/>
            ${hairShapes[hair] || hairShapes.hair_short}
            ${avatar.accessory !== "acc_bp_wings" ? accSvg : ""}
        </svg>`;
    },

    // カードの裏面（スリーブ）の CSS
    sleeveStyle(id) {
        const s = Cosmetics.get(id) || Cosmetics.get("sleeve_default");
        return { background: s.bg, mark: s.mark };
    },
};
