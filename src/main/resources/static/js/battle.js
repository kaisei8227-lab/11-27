// js/battle.js
// シャドバ風の対戦画面（描画・操作・演出・CPU）
// 読み込み順: effects.js → cards.js → battle.js
//
// <body data-mode="..."> で画面の種類を切り替える
//   （なし）  battle.html     … CPU戦（保存デッキ。?class=魔女 でお試しデッキ）
//   stage     solo.html       … ソロのステージ戦（currentSoloStage のステージ）
//   rank      rank_match.html … ランクマッチ（対人。待ち時間中に CPU 戦も選べる）
// ランクマッチ:  <body data-mode="rank"> にして match.js と rank-match.js も読み込むと、
//               ログイン中の user と保存デッキでマッチングを始める（startRank）

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// クラスごとの記号と色（カード絵の代わり）
const CLASS_STYLE = {
    [CLASS.NOBLE]:   { sigil: "♛", hue: 345, sat: 55 },
    [CLASS.MONSTER]: { sigil: "☠", hue: 12,  sat: 60 },
    [CLASS.GHOST]:   { sigil: "☾", hue: 200, sat: 35 },
    [CLASS.WITCH]:   { sigil: "✶", hue: 280, sat: 50 },
    [CLASS.PUPPET]:  { sigil: "♟", hue: 35,  sat: 40 },
    [CLASS.HUNTER]:  { sigil: "✚", hue: 140, sat: 35 },
    [CLASS.PIRATE]:  { sigil: "⚓", hue: 215, sat: 55 },
    [CLASS.NEUTRAL]: { sigil: "✦", hue: 48,  sat: 25 },
};

// ソロのステージ（今の solo.html の設定を引き継ぎ、相手のクラスを追加）
const STAGE_CONFIGS = {
    1: { name: "ステージ 1", opponent: "見習い従者", emblem: "🕯️", aiHp: 15, difficulty: "easy", cpuClass: CLASS.NOBLE },
    2: { name: "ステージ 2", opponent: "墓場の獣", emblem: "🐺", aiHp: 20, difficulty: "normal", cpuClass: CLASS.MONSTER },
    3: { name: "ステージ 3", opponent: "嘆きの亡霊", emblem: "👻", aiHp: 25, difficulty: "normal", cpuClass: CLASS.GHOST },
    4: { name: "ステージ 4", opponent: "見習い魔女", emblem: "🔮", aiHp: 30, difficulty: "hard", cpuClass: CLASS.WITCH },
    5: { name: "ステージ 5", opponent: "深紅の女王 カリスタ", emblem: "👑", aiHp: 40, difficulty: "hard", cpuClass: CLASS.NOBLE },
};

const TURN_SECONDS = 90; // ランクマッチ（対人）の1ターンの制限時間

const KW_SHORT = {
    [KEYWORD.STORM]: "疾走",
    [KEYWORD.RUSH]: "突進",
    [KEYWORD.DRAIN]: "吸収",
    [KEYWORD.SHIELD]: "盾",
    [KEYWORD.WARD]: "守護",
};

// ===================================================================
// 効果音（Web Audio で鳴らすので音声ファイルは不要）
// ===================================================================
const GothicSoundManager = {
    audioCtx: null,
    init() {
        if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    },
    tone(type, from, to, gain, dur) {
        try {
            this.init();
            const t = this.audioCtx.currentTime;
            const o = this.audioCtx.createOscillator();
            const g = this.audioCtx.createGain();
            o.type = type;
            o.frequency.setValueAtTime(from, t);
            o.frequency.exponentialRampToValueAtTime(to, t + dur);
            g.gain.setValueAtTime(gain, t);
            g.gain.exponentialRampToValueAtTime(0.01, t + dur);
            o.connect(g);
            g.connect(this.audioCtx.destination);
            o.start();
            o.stop(t + dur);
        } catch (e) { /* 音が鳴らせない環境では何もしない */ }
    },
    playCard() { this.tone("sine", 400, 800, 0.3, 0.1); },
    playAttack() { this.tone("triangle", 150, 40, 0.5, 0.2); },
    playEvolve() { this.tone("sine", 300, 1200, 0.3, 0.35); },
    playGothicVictoryAnthem() {
        try {
            this.init();
            const now = this.audioCtx.currentTime;
            [130.81, 261.63, 392.0].forEach((freq) => {
                const bell = this.audioCtx.createOscillator();
                const gain = this.audioCtx.createGain();
                bell.type = "sine";
                bell.frequency.setValueAtTime(freq, now);
                gain.gain.setValueAtTime(0.5, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.5);
                bell.connect(gain);
                gain.connect(this.audioCtx.destination);
                bell.start(now);
                bell.stop(now + 2.5);
            });
            [440.0, 554.37, 659.25, 880.0, 1108.73].forEach((freq, idx) => {
                const st = now + 0.4 + idx * 0.18;
                const o = this.audioCtx.createOscillator();
                const g = this.audioCtx.createGain();
                o.type = "triangle";
                o.frequency.setValueAtTime(freq, st);
                g.gain.setValueAtTime(0.35, st);
                g.gain.exponentialRampToValueAtTime(0.001, st + 1.2);
                o.connect(g);
                g.connect(this.audioCtx.destination);
                o.start(st);
                o.stop(st + 1.2);
            });
        } catch (e) { /* 何もしない */ }
    },
};

function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function hashStr(s) {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return Math.abs(h);
}

function artOf(card) {
    const st = CLASS_STYLE[card.class] || CLASS_STYLE[CLASS.NEUTRAL];
    const seed = card.id || hashStr(card.name);
    const h = (st.hue + ((seed * 37) % 40) - 20 + 360) % 360;
    const s = st.sat;
    return `radial-gradient(circle at 50% 28%, hsl(${h} ${s}% 40%), hsl(${h} ${s}% 15%) 58%, hsl(${h} ${s}% 5%))`;
}

// ===================================================================
// 画面の状態
// ===================================================================
const UI = {
    game: null,
    me: null,
    opp: null,
    ctrl: null,          // play / attack / evolve / activate / endTurn / canAct を持つもの
    selectedUid: null,   // クリックで選んだ自分のカード（進化ボタン表示用）
    targeting: null,     // 対象選択中: { keys:Set, resolve }
    drag: null,
    snap: null,          // 前回描画時の体力（ダメージ表示用）
    rects: new Map(),    // 前回描画時のカード位置（破壊演出用）
    flashUid: null,
    logs: [],
    allLogs: [],
    ended: false,
    timerEnabled: false, // ランクマッチ（対人）だけ制限時間あり
    timerKey: null,
    timerId: null,
    lastTurnKey: null,
    mulliganOpen: false,
};

const BattleUI = {
    // ctrl: MatchClient でも SoloController でもよい
    attach(ctrl) {
        UI.ctrl = ctrl;
        UI.game = ctrl.game;
        UI.me = ctrl.me;
        UI.opp = UI.game.getOpponent(UI.me);
        // リーダーの見た目用に、デッキの中身からクラスを決める
        for (const p of UI.game.players) {
            if (p.deckClass) continue;
            const c = [...p.deck, ...p.hand, ...p.field].find((x) => x.class !== CLASS.NEUTRAL);
            p.deckClass = c ? c.class : CLASS.NEUTRAL;
        }
        UI.lastCurrent = UI.game.current;
        // カードが出された時の大きな表示（相手のカードと、自分の魔法）
        UI.followersPlayed = 0;
        UI.game.onCardPlayed = (player, card) => {
            if (player === UI.me && card.type === TYPE.FOLLOWER) UI.followersPlayed++;
            if (player !== UI.me || card.type === TYPE.SPELL) showCutin(card, player !== UI.me);
        };
        // 自分の見た目（スリーブ・称号）。相手は対人戦ならサーバーから届いた値、CPU 戦なら既定
        if (typeof Cosmetics !== "undefined") {
            const eq = Cosmetics.equipped();
            UI.me.sleeve = UI.me.sleeve || eq.sleeve;
            UI.me.title = UI.me.title || Cosmetics.titleName();
        }
        const nameHtml = (p) => `${esc(p.name)}${p.title ? `<small class="leader-title">${esc(p.title)}</small>` : ""}`;
        $("opp-name").innerHTML = nameHtml(UI.opp);
        $("my-name").innerHTML = nameHtml(UI.me);
        render();
    },
    render: () => render(),
    showResult: (isWin) => showResult(isWin),
    banner: (text, enemy) => banner(text, enemy),
    reveal: (viewer, cards) => reveal(viewer, cards),
    log: (msg) => addLog(msg),
};

// ===================================================================
// 描画
// ===================================================================
function render() {
    const { game, me, opp } = UI;
    if (!game) return;

    // 前回の位置を記録（破壊されたカードの演出に使う）
    const oldRects = new Map();
    document.querySelectorAll(".field .card").forEach((el) => {
        oldRects.set(Number(el.dataset.uid), { rect: el.getBoundingClientRect(), html: el.outerHTML });
    });
    const prevFieldUids = new Set(oldRects.keys());

    renderLeader(opp, "opp");
    renderLeader(me, "my");
    renderField(opp, $("opp-field"), false, prevFieldUids);
    renderField(me, $("my-field"), true, prevFieldUids);
    renderHand();
    renderOppHand();
    renderInfo(me, "my");
    renderInfo(opp, "opp");
    renderEndTurn();
    renderTargeting();
    $("turn-count").textContent = Math.max(1, me.turnCount);

    // ランクマッチ: 手番が替わったらバナー（ソロは SoloController が出す）
    const turnKey = game.phase === "play" ? `${game.current.id}-${game.current.turnCount}` : null;
    if (!(UI.ctrl instanceof SoloController) && turnKey && UI.lastTurnKey !== turnKey && !UI.ended) {
        banner(game.current === me ? "YOUR TURN" : "ENEMY TURN", game.current !== me);
    }
    UI.lastTurnKey = turnKey;

    // ランクマッチのマリガン
    if (UI.ctrl && UI.ctrl.needsMulligan && !UI.ended) {
        if (UI.ctrl.needsMulligan() && !UI.mulliganOpen) {
            openMulligan((cards) => UI.ctrl.mulligan(cards));
        } else if (game.phase === "play" && UI.mulliganOpen) {
            closeMulligan();
        } else if (game.phase === "mulligan" && me.mulliganDone) {
            $("mulligan-sub").textContent = "相手の入れ替えを待っています…";
        }
    }
    updateTimer();

    // 破壊・消滅したカードの演出
    const alive = new Set([...me.field, ...opp.field].map((c) => c.uid));
    oldRects.forEach((v, uid) => {
        if (alive.has(uid)) return;
        const holder = document.createElement("div");
        holder.innerHTML = v.html;
        const ghost = holder.firstElementChild;
        ghost.classList.remove("can-attack", "selected", "targetable", "enter");
        ghost.classList.add("dying");
        ghost.style.left = v.rect.left + "px";
        ghost.style.top = v.rect.top + "px";
        ghost.style.width = v.rect.width + "px";
        ghost.querySelectorAll(".card-action").forEach((b) => b.remove());
        $("fx-layer").appendChild(ghost);
        setTimeout(() => ghost.remove(), 600);
    });

    showDamageNumbers();
}

function renderLeader(player, side) {
    $(`${side}-hp`).textContent = player.leader.hp;
    const el = $(`${side}-leader`);
    el.classList.toggle("low", player.leader.hp <= 10);
    const portrait = el.querySelector(".leader-portrait");
    const cls = player.deckClass || CLASS.NEUTRAL;
    const st = CLASS_STYLE[cls] || CLASS_STYLE[CLASS.NEUTRAL];
    portrait.style.setProperty("--art", `radial-gradient(circle at 50% 35%, hsl(${st.hue} ${st.sat}% 30%), hsl(${st.hue} ${st.sat}% 8%) 70%)`);
    portrait.textContent = player.portrait || st.sigil;
}

function cardEl(card, where) {
    const el = document.createElement("div");
    el.className = "card";
    el.dataset.uid = card.uid;
    const st = CLASS_STYLE[card.class] || CLASS_STYLE[CLASS.NEUTRAL];
    const isSpell = card.type === TYPE.SPELL;
    if (isSpell) el.classList.add("spell");

    let gems = "";
    if (where === "hand") {
        const cost = Rules.costOf(UI.game, UI.me, card);
        gems += `<div class="gem cost">${cost}</div>`;
    } else if (where === "peek") {
        gems += `<div class="gem cost">${card.cost}</div>`;
    }
    if (!isSpell) {
        const base = CARD_MAP.get(card.id);
        const atk = where === "field" ? Rules.attackOf(UI.game, card) : card.attack;
        const atkCls = base && atk > base.attack ? "buffed" : base && atk < base.attack ? "damaged" : "";
        const hpCls = card.hp < card.maxHp ? "damaged" : base && card.hp > base.hp ? "buffed" : "";
        gems += `<div class="gem atk ${atkCls}">${atk}</div><div class="gem hp ${hpCls}">${card.hp}</div>`;
    }

    let badges = "";
    if (where === "field") {
        const list = [];
        for (const kw of [KEYWORD.STORM, KEYWORD.RUSH, KEYWORD.DRAIN]) if (card.keywords.has(kw)) list.push(KW_SHORT[kw]);
        if (card.statuses.some((s) => s.type === "CURSE")) list.push("呪");
        if (card.statuses.some((s) => s.type === "SILENCE")) list.push("封");
        if (card.attacksPerTurn > 1) list.push(`${card.attacksPerTurn}回`);
        if (list.length) badges = `<div class="badges">${list.map((b) => `<span class="badge">${b}</span>`).join("")}</div>`;
        const icons = effectIcons(card);
        if (icons.length) badges += `<div class="icons">${icons.map(([i, t]) => `<span class="icon" title="${t}">${i}</span>`).join("")}</div>`;
    }

    el.innerHTML = `
        <div class="art" style="--art:${artOf(card)}">
            <div class="glyph">${esc(card.name[0])}</div>
            <div class="sigil">${st.sigil}</div>
        </div>
        <div class="name">${esc(card.name)}</div>
        ${gems}${badges}`;
    return el;
}

// 場のカードの下に出す効果アイコン（シャドバのラストワード・交戦アイコンのようなもの）
function effectIcons(card) {
    const icons = [];
    if (card.onDestroy) icons.push(["✠", "ラストワード（破壊された時）"]);
    if (card.onAttack || card.onAttackSuccess) icons.push(["⚔", "攻撃時"]);
    if (card.onKill || card.onAllyKill) icons.push(["✦", "撃破時"]);
    if (card.onTurnEnd || card.onTurnStart) icons.push(["☾", "ターン開始・終了時"]);
    if (card.onEnemyPlay || card.onAttacked || card.onAllyDestroyed || card.onAllySacrificed ||
        card.attackBonus || card.hpBonus || card.wardShieldAura || card.wardDamageReductionAura ||
        card.leaderDamageReduction || card.damageReduction || card.preventDestroy || card.noDamageWhenAttacking) {
        icons.push(["◎", "常時効果"]);
    }
    if (card.activate) icons.push(["◈", "起動"]);
    return icons;
}

function hasAttackTarget(card) {
    if (!Rules.canAttack(card)) return false;
    if (Rules.canAttackLeader(UI.game, card)) return true;
    return UI.opp.field.some((d) => Rules.canAttackFollower(UI.game, card, d));
}

function renderField(player, box, mine, prevUids) {
    box.innerHTML = "";
    const myTurn = UI.ctrl && UI.ctrl.canAct();
    for (const card of player.field) {
        const el = cardEl(card, "field");
        if (card.keywords.has(KEYWORD.WARD)) el.classList.add("ward");
        if (card.keywords.has(KEYWORD.SHIELD)) el.classList.add("shield");
        if (Fx.isStunned(card)) el.classList.add("stunned");
        if (card.evolved) el.classList.add("evolved");
        if (card.superEvolved) el.classList.add("super-evolved");
        if (!prevUids.has(card.uid)) el.classList.add("enter");
        if (UI.adviceUid === card.uid) el.classList.add("advice");
        if (UI.flashUid === card.uid) el.classList.add("evolve-flash");

        if (mine && myTurn && !UI.targeting && hasAttackTarget(card)) {
            el.classList.add("can-attack");
            if (card.summonedThisTurn && card.keywords.has(KEYWORD.STORM)) el.classList.add("ready-storm");
        }
        if (mine && UI.selectedUid === card.uid && myTurn && !UI.targeting) {
            el.classList.add("selected");
            if (Rules.canEvolve(UI.me, card)) {
                el.insertAdjacentHTML("beforeend", `<button class="card-action evolve" data-action="evolve" type="button">進化</button>`);
            }
            if (Rules.canSuperEvolve(UI.me, card)) {
                el.insertAdjacentHTML("beforeend", `<button class="card-action super" data-action="super" type="button">超進化</button>`);
            }
            if (card.activate) {
                el.insertAdjacentHTML("beforeend", `<button class="card-action activate" data-action="activate" type="button">起動</button>`);
            }
        }
        box.appendChild(el);
    }
}

function renderHand() {
    const box = $("hand");
    box.innerHTML = "";
    const hand = UI.me.hand;
    const n = hand.length;
    const canAct = UI.ctrl && UI.ctrl.canAct() && !UI.targeting;
    const cardW = box.clientWidth / 6.2;
    const spacing = Math.min(cardW * 0.82, (box.clientWidth - cardW) / Math.max(n - 1, 1));
    hand.forEach((card, i) => {
        const el = cardEl(card, "hand");
        const off = i - (n - 1) / 2;
        el.style.setProperty("--x", `${off * spacing}px`);
        el.style.setProperty("--y", `${off * off * 2}px`);
        el.style.setProperty("--r", `${off * 3}deg`);
        el.style.zIndex = 10 + i;
        if (canAct && Rules.canPlay(UI.game, UI.me, card)) el.classList.add("playable");
        if (UI.adviceUid === card.uid) el.classList.add("advice");
        if (UI.drag && UI.drag.card === card && UI.drag.moved) el.classList.add("dragging");
        box.appendChild(el);
    });
}

function renderOppHand() {
    const box = $("opp-hand");
    box.innerHTML = "";
    for (let i = 0; i < UI.opp.hand.length; i++) {
        const b = document.createElement("div");
        b.className = "card-back";
        if (UI.opp.sleeve && typeof Cosmetics !== "undefined") {
            const sl = Cosmetics.sleeveStyle(UI.opp.sleeve);
            b.style.background = sl.background;
            b.dataset.mark = sl.mark;
        }
        box.appendChild(b);
    }
}

function evolveOpen(player) {
    const startTurn = player.isFirst ? EVOLVE_TURN.first : EVOLVE_TURN.second;
    return player.evolvePoints > 0 && !player.evolvedThisTurn && player.turnCount >= startTurn;
}

function superEvolveOpen(player) {
    const startTurn = player.isFirst ? SUPER_EVOLVE_TURN.first : SUPER_EVOLVE_TURN.second;
    return player.superEvolvePoints > 0 && !player.evolvedThisTurn && player.turnCount >= startTurn;
}

function renderInfo(player, side) {
    $(`${side}-deck`).textContent = player.deck.length;
    $(`${side}-grave`).textContent = player.graveyard.length;
    $(`${side}-pp`).textContent = `${player.pp}/${player.maxPp}`;
    const ep = $(`${side}-ep`);
    ep.innerHTML = `<span class="ep-label">EP</span>` +
        Array.from({ length: EVOLVE_POINTS }, (_, i) => `<span class="ep-orb ${i < player.evolvePoints ? "on" : ""}"></span>`).join("") +
        `<span class="ep-label sep">SEP</span>` +
        Array.from({ length: SUPER_EVOLVE_POINTS }, (_, i) => `<span class="ep-orb sep ${i < player.superEvolvePoints ? "on" : ""}"></span>`).join("");
    const mine = UI.game.current === player;
    ep.classList.toggle("active", mine && evolveOpen(player));
    ep.classList.toggle("super-active", mine && superEvolveOpen(player));
    renderCrests(player, side);
    if (side === "my") {
        $("my-pp-orbs").innerHTML = Array.from({ length: MAX_PP }, (_, i) =>
            `<span class="pp-orb ${i < player.maxPp ? "max" : ""} ${i < player.pp ? "on" : ""}"></span>`).join("");
        renderExtraPp(player);
    }
}

// クレスト（リーダーに付いている効果）をリーダーの横に並べる
function renderCrests(player, side) {
    const box = $(`${side}-crests`);
    if (!box) return;
    const list = Rules.crestsOf(player);
    box.innerHTML = list.map((c) =>
        `<span class="crest" title="${esc(c.name)}：${esc(c.text)}">◈<span class="crest-tip"><b>${esc(c.name)}</b>${esc(c.text)}${c.turns !== Infinity ? `（残り${c.turns}ターン）` : ""}</span></span>`).join("");
}

// 後攻だけのエクストラPPボタン（5ターン目までに1回、6ターン目以降に1回）
function renderExtraPp(player) {
    const btn = $("extra-pp");
    if (!btn) return;
    const show = !player.isFirst;
    btn.classList.toggle("hidden", !show);
    if (!show) return;
    const used = (player.extraPp.early ? 1 : 0) + (player.extraPp.late ? 1 : 0);
    btn.querySelector(".xpp-count").textContent = `${2 - used}`;
    btn.disabled = !(UI.ctrl && UI.ctrl.canAct() && !UI.targeting && Rules.canUseExtraPp(UI.game, player));
    btn.classList.toggle("used-now", player.extraPp.usedThisTurn);
}

function renderEndTurn() {
    const btn = $("end-turn");
    const canAct = UI.ctrl && UI.ctrl.canAct() && !UI.targeting;
    btn.disabled = !canAct;
    btn.querySelector(".end-turn-label").textContent = UI.game.current === UI.me ? "ターン終了" : "相手のターン";
    const nothingLeft = canAct &&
        !UI.me.hand.some((c) => Rules.canPlay(UI.game, UI.me, c)) &&
        !UI.me.field.some((c) => hasAttackTarget(c));
    btn.classList.toggle("done", nothingLeft);
}

function renderTargeting() {
    const t = UI.targeting;
    $("target-hint").classList.toggle("hidden", !t);
    $("opp-leader").classList.toggle("targetable", !!t && t.keys.has("opp-leader"));
    $("my-leader").classList.toggle("targetable", !!t && t.keys.has("my-leader"));
    if (!t) return;
    $("target-hint-text").textContent = t.hint;
    document.querySelectorAll(".field .card").forEach((el) => {
        el.classList.toggle("targetable", t.keys.has(Number(el.dataset.uid)));
    });
}

// ダメージ・回復の数字を出す
function showDamageNumbers() {
    const { me, opp } = UI;
    const now = new Map();
    [...me.field, ...opp.field].forEach((c) => now.set(c.uid, c.hp));
    now.set("my-leader", me.leader.hp);
    now.set("opp-leader", opp.leader.hp);

    if (UI.snap) {
        now.forEach((hp, key) => {
            if (!UI.snap.has(key)) return;
            const diff = hp - UI.snap.get(key);
            if (diff === 0) return;
            const el = typeof key === "number"
                ? document.querySelector(`.field .card[data-uid="${key}"]`)
                : $(key).querySelector(".leader-frame");
            if (!el) return;
            floatNum(el, diff);
            if (typeof key === "string" && diff < 0) {
                const leader = $(key);
                leader.classList.remove("shake");
                void leader.offsetWidth;
                leader.classList.add("shake");
            }
        });
        // 破壊されたカードは最後の体力からのダメージを出す
        UI.snap.forEach((hp, key) => {
            if (typeof key !== "number" || now.has(key)) return;
            const r = UI.rects.get(key);
            if (r) floatNumAt(r.left + r.width / 2, r.top + r.height / 2, -Math.max(hp, 1));
        });
    }
    UI.snap = now;
    UI.rects = new Map();
    document.querySelectorAll(".field .card").forEach((el) => UI.rects.set(Number(el.dataset.uid), el.getBoundingClientRect()));
}

function floatNum(el, diff) {
    const r = el.getBoundingClientRect();
    floatNumAt(r.left + r.width / 2, r.top + r.height / 2, diff);
}

function floatNumAt(x, y, diff) {
    const n = document.createElement("div");
    n.className = `float-num ${diff < 0 ? "dmg" : "heal"}`;
    n.textContent = diff < 0 ? diff : `+${diff}`;
    n.style.left = x + "px";
    n.style.top = y + "px";
    $("fx-layer").appendChild(n);
    setTimeout(() => n.remove(), 1000);
}

// ===================================================================
// カード詳細
// ===================================================================
function showDetail(card) {
    const d = $("detail");
    const isSpell = card.type === TYPE.SPELL;
    const kws = card.keywords ? [...card.keywords] : [];
    const atk = isSpell ? "" : (UI.game && UI.me.field.concat(UI.opp.field).includes(card) ? Rules.attackOf(UI.game, card) : card.attack);
    d.innerHTML = `
        <div class="d-head">
            <div class="d-cost">${card.cost}</div>
            <div>
                <div class="d-name">${esc(card.name)}</div>
                <div class="d-sub">${esc(card.class)} ・ ${isSpell ? "魔法" : "クリーチャー"}${card.isAce ? " ・ エース" : ""}${card.isToken ? " ・ トークン" : ""}</div>
            </div>
        </div>
        ${isSpell ? "" : `<div class="d-stats"><span class="a">⚔ ${atk}</span>　<span class="h">❤ ${card.hp}${card.hp !== card.maxHp ? ` / ${card.maxHp}` : ""}</span></div>`}
        ${kws.length ? `<div class="d-kw">${kws.map((k) => `<span>${esc(k)}</span>`).join("")}</div>` : ""}
        <div class="d-text">${esc(card.desc || "（効果なし）")}</div>
        ${card.evolveDesc ? `<div class="d-evolve">【進化時】${esc(card.evolveDesc)}</div>` : ""}
        ${card.implemented === false ? `<div class="d-todo">※この効果は未実装です</div>` : ""}`;
    d.classList.remove("hidden");
}

function hideDetail() {
    if (UI.detailPinned) return;
    $("detail").classList.add("hidden");
}

function findCard(uid) {
    for (const p of [UI.me, UI.opp]) {
        for (const zone of [p.field, p.hand]) {
            const c = zone.find((x) => x.uid === uid);
            if (c) return c;
        }
    }
    return null;
}

// ===================================================================
// 対象選択・選択肢
// ===================================================================
function keyOf(obj) {
    if (obj === UI.opp.leader) return "opp-leader";
    if (obj === UI.me.leader) return "my-leader";
    return obj.uid;
}

function objOf(key) {
    if (key === "opp-leader") return UI.opp.leader;
    if (key === "my-leader") return UI.me.leader;
    return findCard(key);
}

function validTargets(spec, filter, self) {
    const f = filter || (() => true);
    switch (spec) {
        case TARGET.ALLY_FOLLOWER: return UI.me.field.filter(f);
        case TARGET.ALLY_FOLLOWER_OTHER: return UI.me.field.filter((c) => c !== self).filter(f);
        case TARGET.ENEMY_FOLLOWER: return UI.opp.field.filter(f);
        case TARGET.ENEMY_ANY: return [...UI.opp.field.filter(f), UI.opp.leader];
        default: return [];
    }
}

function pickTarget(list, hint) {
    return new Promise((resolve) => {
        UI.targeting = { keys: new Set(list.map(keyOf)), resolve, hint };
        render();
    });
}

function endTargeting(result) {
    const t = UI.targeting;
    UI.targeting = null;
    render();
    if (t) t.resolve(result);
}

function chooseModal(title, choices) {
    return new Promise((resolve) => {
        const box = $("modal-box");
        box.innerHTML = `<h3>${esc(title)}</h3><div class="choices">${choices.map((c, i) => `<button type="button" data-i="${i}">${esc(c)}</button>`).join("")}</div>
            <div style="margin-top:2vh"><button type="button" data-i="-1">キャンセル</button></div>`;
        $("modal").classList.remove("hidden");
        box.onclick = (e) => {
            const b = e.target.closest("button");
            if (!b) return;
            $("modal").classList.add("hidden");
            const i = Number(b.dataset.i);
            resolve(i < 0 ? null : choices[i]);
        };
    });
}

// 「相手の手札を見る」などの効果
function reveal(viewer, cards) {
    if (viewer !== UI.me || !cards.length) return;
    const box = $("modal-box");
    box.innerHTML = `<h3>カードを確認</h3><div class="peek-row"></div><button type="button">閉じる</button>`;
    const row = box.querySelector(".peek-row");
    cards.forEach((c) => row.appendChild(cardEl(c, "peek")));
    $("modal").classList.remove("hidden");
    box.onclick = (e) => {
        if (e.target.closest("button")) $("modal").classList.add("hidden");
    };
}

// ===================================================================
// 操作
// ===================================================================
async function beginPlay(card) {
    let choice;
    if (card.choices) {
        choice = await chooseModal(`${card.name}：効果を選ぶ`, card.choices);
        if (choice == null) return;
    }
    let target;
    const skipTarget = choice === "回復";
    if (card.target && !card.targetCount && !skipTarget) {
        const list = validTargets(card.target, card.targetFilter, null);
        if (list.length) {
            target = await pickTarget(list, `${card.name}：対象を選んでください`);
            if (target === undefined) return;
        }
    }
    if (UI.ctrl.play(card, { target, choice }) !== false) GothicSoundManager.playCard();
    afterAction();
}

async function beginEvolve(card) {
    let target;
    if (card.evolveTarget) {
        const list = validTargets(card.evolveTarget, null, card);
        if (list.length) {
            target = await pickTarget(list, `${card.name}：進化時の対象を選んでください`);
            if (target === undefined) return;
        }
    }
    UI.selectedUid = null;
    UI.flashUid = card.uid;
    GothicSoundManager.playEvolve();
    UI.ctrl.evolve(card, { target });
    afterAction();
    setTimeout(() => { UI.flashUid = null; }, 900);
}

async function beginSuperEvolve(card) {
    let target;
    if (!card.evolved && card.evolveTarget) {
        const list = validTargets(card.evolveTarget, null, card);
        if (list.length) {
            target = await pickTarget(list, `${card.name}：進化時の対象を選んでください`);
            if (target === undefined) return;
        }
    }
    UI.selectedUid = null;
    UI.flashUid = card.uid;
    GothicSoundManager.playEvolve();
    showCutin({ ...card, name: `超進化 ${card.name}` }, false);
    if (UI.ctrl.superEvolve(card, { target }) !== false && typeof Missions !== "undefined") Missions.add("super_evolve");
    afterAction();
    setTimeout(() => { UI.flashUid = null; }, 1100);
}

function useExtraPp() {
    if (!UI.ctrl || !UI.ctrl.extraPp) return;
    if (UI.ctrl.extraPp() !== false) GothicSoundManager.playEvolve();
    afterAction();
}

async function doAttack(attacker, defender) {
    UI.selectedUid = null;
    await animateAttack(attacker, defender);
    GothicSoundManager.playAttack();
    addLog(`${attacker.name} → ${defender.isLeader ? "リーダー" : defender.name}`);
    UI.ctrl.attack(attacker, defender);
    afterAction();
}

function afterAction() {
    UI.adviceUid = null;
    if (!$("advice-panel").classList.contains("hidden")) showAdvice();
    render();
    checkEnd();
}

// ===== AIアドバイス（CPU戦だけ）=====
// 今の盤面から「おすすめの手」を文章で返す。CPU の思考（hard）と同じ考え方を自分側に当てはめる
function computeAdvice(game, me, opp) {
    const tips = [];
    let focus = null;
    if (game.phase !== "play" || game.current !== me) return { tips: ["相手のターンです。相手の動きを見て、次のターンの作戦を考えましょう。"], focus };

    const name = (c) => `「${c.name}」`;
    const faceAttackers = me.field.filter((c) => Rules.canAttackLeader(game, c));
    const facePower = faceAttackers.reduce((n, c) => n + Rules.attackOf(game, c), 0);
    if (facePower >= opp.leader.hp && faceAttackers.length) {
        tips.push(`リーサル（とどめ）です！ ${faceAttackers.map(name).join("・")} で相手リーダーを攻撃しましょう（合計 ${facePower} ダメージ）。`);
        return { tips, focus: faceAttackers[0] };
    }

    // カードを出す: 今の PP でできるだけ多く使える組み合わせ（コストの高い順に詰める）
    const playable = me.hand.filter((c) => Rules.canPlay(game, me, c))
        .sort((a, b) => Rules.costOf(game, me, b) - Rules.costOf(game, me, a));
    let pp = me.pp;
    const plan = [];
    for (const c of playable) {
        const cost = Rules.costOf(game, me, c);
        if (cost <= pp) {
            plan.push(c);
            pp -= cost;
        }
    }
    if (Rules.canUseExtraPp(game, me)) {
        const withExtra = me.hand.find((c) => Rules.costOf(game, me, c) === me.pp + 1);
        if (withExtra) tips.push(`エクストラPPを使うと ${name(withExtra)}（コスト${Rules.costOf(game, me, withExtra)}）を出せます。`);
    }
    if (plan.length) {
        tips.push(`${plan.map(name).join(" → ")} をプレイすると、PPを${me.pp - pp}使えて効率的です。`);
        focus = plan[0];
    } else if (me.hand.length) {
        tips.push("今出せるカードはありません。次のターンに備えましょう。");
    }

    // 超進化・進化
    const byAtk = (a, b) => Rules.attackOf(game, b) - Rules.attackOf(game, a);
    const sev = me.field.filter((c) => Rules.canSuperEvolve(me, c)).sort(byAtk)[0];
    const ev = me.field.filter((c) => Rules.canEvolve(me, c)).sort(byAtk)[0];
    if (sev) {
        tips.push(`${name(sev)} を超進化しましょう。自分のターン中は無敵で、相手のカードを倒すと相手リーダーにも1ダメージ入ります。`);
        focus = focus || sev;
    } else if (ev && (opp.field.length || ev.evolveTarget || opp.leader.hp <= 10)) {
        tips.push(`${name(ev)} を進化させると +2/+2 と突進で、相手のカードを倒しやすくなります。`);
        focus = focus || ev;
    }

    // 攻撃先
    const saved = UI.difficulty;
    UI.difficulty = "hard";
    const planned = new Map(); // 同じ相手を何体もで狙わないように、予定ダメージを数える
    me.field.filter((c) => Rules.canAttack(c)).sort(byAtk).forEach((atk) => {
        let t = cpuChooseAttack(game, atk, me, opp);
        if (t && !t.isLeader && (planned.get(t.uid) || 0) >= t.hp) {
            t = Rules.canAttackLeader(game, atk) ? opp.leader : null;
        }
        if (!t) return;
        if (!t.isLeader) planned.set(t.uid, (planned.get(t.uid) || 0) + Rules.attackOf(game, atk));
        tips.push(t.isLeader ? `${name(atk)} は相手リーダーを攻撃。` : `${name(atk)} で ${name(t)} を攻撃すると有利な交換になります。`);
        focus = focus || atk;
    });
    UI.difficulty = saved;

    if (Rules.hasWard(opp)) tips.push("相手の場に守護がいます。先に守護を倒さないとリーダーを攻撃できません。");
    if (!tips.length) tips.push("できることはありません。ターンを終了しましょう。");
    return { tips, focus };
}

function showAdvice() {
    if (!UI.game) return;
    const { tips, focus } = computeAdvice(UI.game, UI.me, UI.opp);
    $("advice-list").innerHTML = tips.map((t) => `<li>${esc(t)}</li>`).join("");
    $("advice-panel").classList.remove("hidden");
    UI.adviceUid = focus ? focus.uid : null;
}

async function animateAttack(attacker, defender) {
    const a = document.querySelector(`.field .card[data-uid="${attacker.uid}"]`);
    const d = defender.isLeader
        ? (defender === UI.opp.leader ? $("opp-leader") : $("my-leader")).querySelector(".leader-frame")
        : document.querySelector(`.field .card[data-uid="${defender.uid}"]`);
    if (!a || !d) return;
    const ra = a.getBoundingClientRect();
    const rd = d.getBoundingClientRect();
    const dx = (rd.left + rd.width / 2) - (ra.left + ra.width / 2);
    const dy = (rd.top + rd.height / 2) - (ra.top + ra.height / 2);
    a.style.zIndex = 30;
    a.animate([
        { transform: "none" },
        { transform: `translate(${dx * 0.75}px, ${dy * 0.75}px) scale(1.12)`, offset: 0.55 },
        { transform: "none" },
    ], { duration: 420, easing: "ease-in-out" });
    await sleep(240);
}

// ----- ポインター操作（ドラッグでプレイ・矢印で攻撃） -----
function boardPoint(e) {
    return { x: e.clientX, y: e.clientY };
}

function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function onPointerDown(e) {
    if (UI.ended || e.button > 0) return;
    if (e.target.closest(".card-action, #end-turn, .modal, .target-hint")) return;
    if (UI.targeting) return; // 対象選択はクリックで処理
    const el = e.target.closest(".card");
    if (!el || !UI.ctrl.canAct()) return;
    const uid = Number(el.dataset.uid);

    if (el.parentElement.id === "hand") {
        const card = UI.me.hand.find((c) => c.uid === uid);
        if (card && Rules.canPlay(UI.game, UI.me, card)) {
            UI.drag = { kind: "play", card, el, start: boardPoint(e), moved: false };
        }
    } else if (el.parentElement.id === "my-field") {
        const card = UI.me.field.find((c) => c.uid === uid);
        if (!card) return;
        UI.drag = { kind: hasAttackTarget(card) ? "attack" : "click", card, el, start: boardPoint(e), moved: false };
    }
    if (UI.drag) e.preventDefault();
}

function onPointerMove(e) {
    const drag = UI.drag;
    if (!drag) return;
    const p = boardPoint(e);
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 8) {
        drag.moved = true;
        if (drag.kind === "play") {
            drag.ghost = cardEl(drag.card, "hand");
            $("drag-layer").appendChild(drag.ghost);
            drag.el.classList.add("dragging");
            hideDetail();
        }
    }
    if (!drag.moved) return;

    if (drag.kind === "play") {
        drag.ghost.style.left = p.x + "px";
        drag.ghost.style.top = p.y + "px";
        $("my-field").classList.toggle("drop-ok", p.y < window.innerHeight * 0.78);
    } else if (drag.kind === "attack") {
        drawArrow(centerOf(drag.el), p);
        document.querySelectorAll(".target-hover").forEach((x) => x.classList.remove("target-hover"));
        const t = attackTargetAt(p, drag.card);
        if (t) t.el.classList.add("target-hover");
    }
}

// 攻撃の矢印（少し弧を描く）
function drawArrow(from, to) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const bend = Math.min(80, len * 0.25);
    const cx = (from.x + to.x) / 2 - (dy / len) * bend;
    const cy = (from.y + to.y) / 2 + (dx / len) * bend * 0.3 - bend * 0.5;
    const path = $("arrow-path");
    path.setAttribute("d", `M${from.x},${from.y} Q${cx},${cy} ${to.x},${to.y}`);
    path.setAttribute("stroke-width", Math.max(6, window.innerHeight * 0.011));
}

function attackTargetAt(p, attacker) {
    const under = document.elementFromPoint(p.x, p.y);
    if (!under) return null;
    const leaderEl = under.closest("#opp-leader");
    if (leaderEl && Rules.canAttackLeader(UI.game, attacker)) return { el: leaderEl.querySelector(".leader-frame"), obj: UI.opp.leader };
    const cardEl = under.closest("#opp-field .card");
    if (cardEl) {
        const def = UI.opp.field.find((c) => c.uid === Number(cardEl.dataset.uid));
        if (def && Rules.canAttackFollower(UI.game, attacker, def)) return { el: cardEl, obj: def };
    }
    return null;
}

function onPointerUp(e) {
    const drag = UI.drag;
    if (!drag) return;
    UI.drag = null;
    const p = boardPoint(e);
    $("arrow-path").setAttribute("d", "");
    $("my-field").classList.remove("drop-ok");
    document.querySelectorAll(".target-hover").forEach((x) => x.classList.remove("target-hover"));
    if (drag.ghost) drag.ghost.remove();
    drag.el.classList.remove("dragging");

    if (drag.kind === "play") {
        if (drag.moved && p.y < window.innerHeight * 0.78) beginPlay(drag.card);
        else render();
        return;
    }
    if (drag.kind === "attack" && drag.moved) {
        const t = attackTargetAt(p, drag.card);
        if (t) doAttack(drag.card, t.obj);
        return;
    }
    // クリック: 選択の切り替え（進化ボタンを出す）
    UI.selectedUid = UI.selectedUid === drag.card.uid ? null : drag.card.uid;
    render();
}

function onClick(e) {
    // 進化・起動ボタン
    const action = e.target.closest(".card-action");
    if (action) {
        const uid = Number(action.closest(".card").dataset.uid);
        const card = UI.me.field.find((c) => c.uid === uid);
        if (!card) return;
        if (action.dataset.action === "evolve") beginEvolve(card);
        if (action.dataset.action === "super") beginSuperEvolve(card);
        if (action.dataset.action === "activate") {
            UI.selectedUid = null;
            UI.ctrl.activate(card, {});
            afterAction();
        }
        return;
    }
    // 対象選択中
    if (UI.targeting) {
        const leader = e.target.closest(".leader");
        const cardEl = e.target.closest(".field .card");
        let key = null;
        if (leader) key = leader.id === "opp-leader" ? "opp-leader" : "my-leader";
        else if (cardEl) key = Number(cardEl.dataset.uid);
        if (key != null && UI.targeting.keys.has(key)) endTargeting(objOf(key));
        return;
    }
    // 何もない所をクリックしたら選択解除
    if (!e.target.closest(".card") && UI.selectedUid != null) {
        UI.selectedUid = null;
        render();
    }
}

function onPointerOver(e) {
    if (UI.drag && UI.drag.moved) return;
    const el = e.target.closest(".card");
    if (!el || el.closest("#drag-layer, #fx-layer, .modal")) return;
    const card = findCard(Number(el.dataset.uid));
    if (card) showDetail(card);
}

function onPointerOut(e) {
    const el = e.target.closest(".card");
    if (el && !el.contains(e.relatedTarget)) hideDetail();
}

// ===================================================================
// バナー・ログ・勝敗
// ===================================================================
function banner(text, enemy = false) {
    const b = $("banner");
    $("banner-text").textContent = text;
    b.classList.toggle("enemy", enemy);
    b.classList.remove("hidden");
    b.style.animation = "none";
    void b.offsetWidth;
    b.style.animation = "";
    return sleep(1300).then(() => b.classList.add("hidden"));
}

function addLog(msg) {
    UI.allLogs.push(`[T${UI.me ? Math.max(1, UI.me.turnCount) : 1}] ${msg}`);
    if (UI.allLogs.length > 200) UI.allLogs.shift();
    if (!$("log-panel").classList.contains("hidden")) renderLogPanel();
    UI.logs.push(msg);
    if (UI.logs.length > 7) UI.logs.shift();
    $("log").innerHTML = UI.logs.map((m) => `<div>${esc(m)}</div>`).join("");
}

function checkEnd() {
    const winner = Rules.winner(UI.game);
    if (!winner || UI.ended) return !!winner;
    if (!(UI.ctrl instanceof SoloController)) return true; // ランクマッチは MatchClient の onGameOver で表示
    showResult(winner === UI.me);
    return true;
}

function showResult(isWin) {
    if (UI.ended) return;
    UI.ended = true;
    clearInterval(UI.timerId);
    closeMulligan();
    $("modal").classList.add("hidden");
    if (UI.targeting) endTargeting(undefined);

    const conf = window.BATTLE_CONFIG || {};
    const data = conf.onResult
        ? conf.onResult(isWin, UI.game)
        : UI.mode === "2pick" || UI.mode === "2pick-cpu"
        ? handleTwoPickResult(isWin)
        : UI.mode === "stage"
        ? (isWin ? handleStageVictory() : handleStageDefeat())
        : UI.mode === "free"
            ? handleFreeResult(isWin)
            : (isWin ? handleBattleVictory() : handleBattleDefeat());
    // デイリーミッションの進み具合
    if (typeof Missions !== "undefined") {
        Missions.add("battle_play");
        if (isWin) Missions.add("battle_win");
        if (UI.mode === "rank" || UI.mode === "rank-cpu") Missions.add("rank_play");
        if (UI.mode === "2pick" || UI.mode === "2pick-cpu") Missions.add("twopick_play");
        if (isWin && (UI.mode === "rank" || UI.mode === "rank-cpu")) Missions.add("rank_win");
        Missions.add("cards_played", UI.me.stats.playedCount);
        Missions.add("followers", UI.followersPlayed || 0);
    }
    // バトルパスのポイント
    if (typeof BattlePass !== "undefined" && UI.mode !== "puzzle") {
        const type = UI.mode === "rank" || UI.mode === "rank-cpu" ? "rank"
            : UI.mode === "2pick" || UI.mode === "2pick-cpu" ? "twopick" : "free";
        const bp = BattlePass.add(`${type}_${isWin ? "win" : "lose"}`);
        data.bpText = `バトルパス +${bp.gained}pt（Lv.${bp.level}${bp.levelUp ? " レベルアップ！" : ""}）`;
    }

    // サーバーにも結果を送りたい場合は window.onBattleEnd を定義する
    if (typeof window.onBattleEnd === "function") window.onBattleEnd(isWin, UI.game, data);

    if (isWin) {
        GothicSoundManager.playGothicVictoryAnthem();
        setTimeout(() => {
            $("gothic-cross").classList.remove("hidden");
            setTimeout(() => {
                $("gothic-cross").classList.add("hidden");
                showResultModal(true, data);
            }, 2800);
        }, 700);
    } else {
        setTimeout(() => showResultModal(false, data), 900);
    }
}

// ランクマッチの戦績更新（localStorage の user）
// グループは対人戦（mode "rank"）の直近10試合の勝率で上がる。CPU 戦（"rank-cpu"）は数えない。
function updateRankGroup(user, isWin) {
    const pvp = UI.mode === "rank";
    if (pvp && typeof recordPvpResult === "function") return recordPvpResult(user, isWin);
    const group = typeof getGroupInfo === "function" ? getGroupInfo(user) : { name: "エメラルド", mpBonus: 100 };
    return { group, promoted: false, winRate: typeof getRecentWinRate === "function" ? getRecentWinRate(user) : 0 };
}

function groupText(user, result) {
    const wins = (user.recentPvp || []).filter(Boolean).length;
    const head = result.promoted ? `${result.group.name} に昇格！` : result.group.name;
    const tail = UI.mode === "rank" ? `直近10戦 ${wins}勝` : "CPU戦はグループに影響しません";
    return `${head}（${tail}）`;
}

function handleBattleVictory() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const oldMp = user.mp || 0;
    const oldRank = typeof getRankInfo === "function" ? getRankInfo(oldMp) : { name: "Beginner 0" };

    user.totalBattles = (user.totalBattles || 0) + 1;
    user.wins = (user.wins || 0) + 1;
    user.winStreak = (user.winStreak || 0) + 1;
    if (!user.classWins) user.classWins = { noble: 0, monster: 0, ghost: 0, witch: 0, doll: 0, hunter: 0, pirate: 0 };
    user.classWins[UI.deckClassKey] = (user.classWins[UI.deckClassKey] || 0) + 1;

    // 獲得MPは「試合前のグループ」のボーナス
    const beforeGroup = typeof getGroupInfo === "function" ? getGroupInfo(user) : { mpBonus: 100 };
    const mpGain = beforeGroup.mpBonus || 100;
    const result = updateRankGroup(user, true);
    const coinGain = 150;
    user.mp = oldMp + mpGain;
    user.coin = (user.coin || 0) + coinGain;
    localStorage.setItem("user", JSON.stringify(user));
    if (typeof isMasterRank === "function" && isMasterRank(user.mp) && typeof Cosmetics !== "undefined") Cosmetics.grant("title_master");

    const newRank = typeof getRankInfo === "function" ? getRankInfo(user.mp) : { name: "Beginner 0" };
    return {
        mpGain,
        coinGain,
        groupName: beforeGroup.name,
        streakLabel: "グループ",
        streakText: groupText(user, result),
        isRankUp: oldRank.name !== newRank.name,
        newRankName: newRank.name,
    };
}

function handleBattleDefeat() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const mpLoss = Math.min(30, user.mp || 0);
    user.totalBattles = (user.totalBattles || 0) + 1;
    user.losses = (user.losses || 0) + 1;
    user.winStreak = 0;
    user.mp = Math.max(0, (user.mp || 0) - 30);
    const result = updateRankGroup(user, false);
    localStorage.setItem("user", JSON.stringify(user));
    return {
        mpGain: -mpLoss, coinGain: 0, groupName: result.group.name, isRankUp: false, newRankName: "",
        streakLabel: "グループ", streakText: groupText(user, result),
    };
}

// 2Pick: 勝敗を記録（MP は変わらない）
function handleTwoPickResult(isWin) {
    const run = typeof TwoPick !== "undefined" ? TwoPick.record(isWin) : null;
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    user.totalBattles = (user.totalBattles || 0) + 1;
    if (isWin) user.wins = (user.wins || 0) + 1; else user.losses = (user.losses || 0) + 1;
    localStorage.setItem("user", JSON.stringify(user));
    return {
        mpGain: 0, coinGain: 0, groupName: "", isRankUp: false, newRankName: "",
        streakLabel: "2Pick",
        streakText: run ? `${run.wins}勝 ${run.losses}敗${run.state === "done" ? "（終了）" : ""}` : "",
    };
}

// フリーマッチ: シャドバと同じく MP・連勝は変わらない（勝敗数とクラス勝利数だけ記録、勝てばコイン +50）
function handleFreeResult(isWin) {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    user.totalBattles = (user.totalBattles || 0) + 1;
    if (isWin) {
        user.wins = (user.wins || 0) + 1;
        if (!user.classWins) user.classWins = { noble: 0, monster: 0, ghost: 0, witch: 0, doll: 0, hunter: 0, pirate: 0 };
        user.classWins[UI.deckClassKey] = (user.classWins[UI.deckClassKey] || 0) + 1;
        user.coin = (user.coin || 0) + 50;
    } else {
        user.losses = (user.losses || 0) + 1;
    }
    localStorage.setItem("user", JSON.stringify(user));
    return {
        mpGain: 0, coinGain: isWin ? 50 : 0, groupName: "", isRankUp: false, newRankName: "",
        streakLabel: "フリーマッチ", streakText: "MPは変動しません",
    };
}

// ステージ勝利: コイン +200、MP +100、クリア済みステージを更新（今の solo.html と同じ）
function handleStageVictory() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const oldRank = typeof getRankInfo === "function" ? getRankInfo(user.mp || 0) : { name: "" };
    user.coin = (user.coin || 0) + 200;
    user.mp = (user.mp || 0) + 100;
    user.clearedStage = Math.max(typeof user.clearedStage === "number" ? user.clearedStage : 0, UI.stageId);
    localStorage.setItem("user", JSON.stringify(user));
    const newRank = typeof getRankInfo === "function" ? getRankInfo(user.mp) : { name: "" };
    return {
        mpGain: 100, coinGain: 200, groupName: "",
        isRankUp: oldRank.name !== newRank.name, newRankName: newRank.name,
        streakLabel: "ステージ", streakText: `${UI.stage.name} クリア`,
    };
}

// ステージ敗北: ペナルティなし
function handleStageDefeat() {
    return {
        mpGain: 0, coinGain: 0, groupName: "", isRankUp: false, newRankName: "",
        streakLabel: "ステージ", streakText: "何度でも挑戦できます",
    };
}

function showResultModal(isWin, data) {
    const r = $("result");
    const stage = UI.mode === "stage";
    r.classList.toggle("lose", !isWin);
    $("result-title").textContent = isWin
        ? (data.isRankUp ? "RANK UP!" : stage ? "STAGE CLEAR!" : "VICTORY")
        : "DEFEAT";
    $("result-sub").textContent = isWin
        ? (data.isRankUp ? "新たな高みへ到達しました" : stage ? "強敵を打ち破りました" : "栄光の凱旋")
        : "闇に呑まれた…";
    if (!isWin && UI.me.deckOut) $("result-sub").textContent = "山札が尽きました…";
    if (isWin && UI.opp.deckOut) $("result-sub").textContent = "相手の山札が尽きました";
    $("res-streak-label").textContent = data.streakLabel || "連勝";
    $("btn-home").textContent = stage ? "ホームへ戻る" : "プロフィールへ進む";
    const mp = $("res-mp");
    mp.textContent = data.mpGain >= 0 ? `+${data.mpGain} MP${data.groupName ? ` (${data.groupName})` : ""}` : `${data.mpGain} MP`;
    mp.classList.toggle("minus", data.mpGain < 0);
    $("res-coin").textContent = `+${data.coinGain}`;
    $("res-streak").textContent = data.streakText || (isWin ? `${data.winStreak} 連勝中` : "連勝リセット");
    let bpRow = $("res-bp-row");
    if (!bpRow) {
        bpRow = document.createElement("div");
        bpRow.className = "reward-row";
        bpRow.id = "res-bp-row";
        bpRow.innerHTML = `<span>バトルパス</span><span class="reward-val" id="res-bp"></span>`;
        $("res-streak").closest(".reward-row").after(bpRow);
    }
    bpRow.classList.toggle("hidden", !data.bpText);
    $("res-bp").textContent = (data.bpText || "").replace("バトルパス ", "");
    $("res-rank-row").classList.toggle("hidden", !data.isRankUp);
    $("res-rank").textContent = data.newRankName;
    r.classList.remove("hidden");
}

// ===================================================================
// ソロ（CPU戦）
// ===================================================================
class SoloController {
    constructor(game, me, cpu) {
        this.game = game;
        this.me = me;
        this.cpu = cpu;
        this.busy = false;
    }

    canAct() {
        return !this.busy && !UI.ended && this.game.phase === "play" && !Rules.winner(this.game) && this.game.current === this.me;
    }

    surrender() {
        Rules.surrender(this.game, this.me);
        afterAction();
    }

    play(card, opts) {
        return this.canAct() && Rules.playCard(this.game, this.me, card, opts);
    }

    attack(attacker, defender) {
        return this.canAct() && Rules.attack(this.game, attacker, defender);
    }

    evolve(card, opts) {
        if (!this.canAct()) return false;
        const ok = Rules.evolve(this.game, this.me, card, opts);
        return ok;
    }

    superEvolve(card, opts) {
        if (!this.canAct()) return false;
        const ok = Rules.superEvolve(this.game, this.me, card, opts);
        return ok;
    }

    extraPp() {
        return this.canAct() && Rules.useExtraPp(this.game, this.me);
    }

    activate(card, opts) {
        return this.canAct() && Rules.activate(this.game, this.me, card, opts);
    }

    async endTurn() {
        if (!this.canAct()) return;
        this.busy = true;
        UI.selectedUid = null;
        Rules.endTurn(this.game, this.me);
        render();
        if (checkEnd()) return;
        await this.cpuTurn();
        if (checkEnd()) return;
        Rules.startTurn(this.game, this.me);
        render();
        if (checkEnd()) return; // 山札切れ
        await banner("YOUR TURN");
        this.busy = false;
        render();
    }

    async cpuTurn() {
        const { game, cpu } = this;
        Rules.startTurn(game, cpu);
        render();
        await banner("ENEMY TURN", true);
        await runCpu(game, cpu, this.me);
        if (Rules.winner(game)) return;
        Rules.endTurn(game, cpu);
        render();
        await sleep(300);
    }
}

// ----- CPU の思考 -----
function cpuPickTarget(spec, filter, game, cpu, enemy, self) {
    const f = filter || (() => true);
    const byThreat = (a, b) => Rules.attackOf(game, b) - Rules.attackOf(game, a);
    switch (spec) {
        case TARGET.ENEMY_FOLLOWER: return enemy.field.filter(f).sort(byThreat)[0];
        case TARGET.ENEMY_ANY: return enemy.field.filter(f).sort(byThreat)[0] || enemy.leader;
        case TARGET.ALLY_FOLLOWER: return cpu.field.filter(f).sort(byThreat)[0];
        case TARGET.ALLY_FOLLOWER_OTHER: return cpu.field.filter((c) => c !== self).filter(f).sort(byThreat)[0];
        default: return undefined;
    }
}

// 難易度: ステージ戦はステージの設定、それ以外は localStorage の aiDifficulty（"easy" / "normal" / "hard"）
function aiDifficulty() {
    return UI.difficulty || localStorage.getItem("aiDifficulty") || "normal";
}

// 攻撃先をランダムにする確率（easy 5割、normal 3割、hard なし）
function aiRandomRate() {
    return { easy: 0.5, normal: 0.3, hard: 0 }[aiDifficulty()] ?? 0.3;
}

function cpuChooseAttack(game, atk, cpu, enemy) {
    const power = Rules.attackOf(game, atk);
    // normal は3割くらいの確率で、狙いをランダムにする（hard は常に最善手）
    if (Math.random() < aiRandomRate()) {
        const options = [
            ...(Rules.canAttackLeader(game, atk) ? [enemy.leader] : []),
            ...enemy.field.filter((d) => Rules.canAttackFollower(game, atk, d)),
        ];
        if (options.length) return options[Math.floor(Math.random() * options.length)];
    }
    const leaderOk = Rules.canAttackLeader(game, atk);
    const foes = enemy.field.filter((d) => Rules.canAttackFollower(game, atk, d));

    // とどめを刺せるならリーダーへ
    if (leaderOk) {
        const total = cpu.field.filter((c) => Rules.canAttackLeader(game, c)).reduce((s, c) => s + Rules.attackOf(game, c), 0);
        if (total >= enemy.leader.hp) return enemy.leader;
    }
    // 倒せて生き残れる相手を優先
    const goodTrade = foes
        .filter((d) => power >= d.hp && (Rules.attackOf(game, d) < atk.hp || atk.noDamageWhenAttacking))
        .sort((a, b) => Rules.attackOf(game, b) - Rules.attackOf(game, a))[0];
    if (goodTrade) return goodTrade;
    if (leaderOk) return enemy.leader;
    // リーダーを狙えない（守護など）なら倒せる相手 → 一番脅威の相手
    const killable = foes.filter((d) => power >= d.hp).sort((a, b) => Rules.attackOf(game, b) - Rules.attackOf(game, a))[0];
    return killable || foes.sort((a, b) => Rules.attackOf(game, b) - Rules.attackOf(game, a))[0] || null;
}

async function runCpu(game, cpu, enemy) {
    // 後攻ならエクストラPP: PPが1足りずに出せないカードがある時に使う
    if (Rules.canUseExtraPp(game, cpu)) {
        const needOne = cpu.hand.some((c) => Rules.costOf(game, cpu, c) === cpu.pp + 1);
        if (needOne || (cpu.turnCount >= 8 && Math.random() < 0.5)) {
            Rules.useExtraPp(game, cpu);
        }
    }
    // カードを出す（コストの高い順）
    for (let i = 0; i < 10; i++) {
        if (Rules.winner(game)) return;
        // hard はコストの高い順、normal は手札の順に出す
        const playable = cpu.hand.filter((c) => Rules.canPlay(game, cpu, c));
        if (aiDifficulty() === "hard") playable.sort((a, b) => Rules.costOf(game, cpu, b) - Rules.costOf(game, cpu, a));
        if (!playable.length) break;
        const card = playable[0];
        const opts = {};
        if (card.choices) opts.choice = card.choices.includes("破壊") ? (enemy.field.length ? "破壊" : "回復") : Fx.randomOf(card.choices);
        if (card.target && opts.choice !== "回復") opts.target = cpuPickTarget(card.target, card.targetFilter, game, cpu, enemy, null);

        Rules.playCard(game, cpu, card, opts); // onCardPlayed でカットインが出る
        GothicSoundManager.playCard();
        await sleep(350);
        render();
        await sleep(900);
    }

    // 超進化（使えるなら一番攻撃力の高いカード。easy は使わないこともある）
    const sev = cpu.field.filter((c) => Rules.canSuperEvolve(cpu, c)).sort((a, b) => b.attack - a.attack)[0];
    const superRate = { easy: 0.4, normal: 0.8, hard: 1 }[aiDifficulty()] ?? 0.8;
    if (sev && Math.random() < superRate && !Rules.winner(game)) {
        const target = !sev.evolved && sev.evolveTarget ? cpuPickTarget(sev.evolveTarget, null, game, cpu, enemy, sev) : undefined;
        UI.flashUid = sev.uid;
        Rules.superEvolve(game, cpu, sev, { target });
        render();
        UI.flashUid = null;
        await sleep(800);
    }

    // 進化（normal は6割の確率。相手リーダーの体力が10以下なら必ず）
    const ev = cpu.field.filter((c) => Rules.canEvolve(cpu, c)).sort((a, b) => b.attack - a.attack)[0];
    const evolveRate = { easy: 0.3, normal: 0.6, hard: 1 }[aiDifficulty()] ?? 0.6;
    const wantEvolve = Math.random() < evolveRate || enemy.leader.hp <= 10;
    if (ev && wantEvolve && !Rules.winner(game)) {
        const target = ev.evolveTarget ? cpuPickTarget(ev.evolveTarget, null, game, cpu, enemy, ev) : undefined;
        UI.flashUid = ev.uid;
        Rules.evolve(game, cpu, ev, { target });
        render();
        UI.flashUid = null;
        await sleep(700);
    }

    // 攻撃
    for (const atk of [...cpu.field]) {
        let guard = 0;
        while (guard++ < 4 && !Rules.winner(game) && Fx.onField(cpu, atk) && Rules.canAttack(atk)) {
            const target = cpuChooseAttack(game, atk, cpu, enemy);
            if (!target) break;
            await animateAttack(atk, target);
            GothicSoundManager.playAttack();
            addLog(`相手の ${atk.name} → ${target.isLeader ? "あなた" : target.name}`);
            Rules.attack(game, atk, target);
            render();
            await sleep(480);
        }
    }
}

// ----- デッキ（サーバーから取得するまでの仮） -----
function buildDeck(cls) {
    const pool = CARD_DATABASE.filter((c) => canAddToDeck(cls, c.id) && c.implemented !== false);
    const low = pool.filter((c) => c.cost <= 3);
    const mid = pool.filter((c) => c.cost >= 4 && c.cost <= 6);
    const high = pool.filter((c) => c.cost >= 7);
    return [
        ...Fx.pickRandom(low, 18),
        ...Fx.pickRandom(mid, 16),
        ...Fx.pickRandom(high, 6),
    ].map((c) => c.id);
}

const CLASS_KEY = {
    [CLASS.NOBLE]: "noble", [CLASS.MONSTER]: "monster", [CLASS.GHOST]: "ghost", [CLASS.WITCH]: "witch",
    [CLASS.PUPPET]: "doll", [CLASS.HUNTER]: "hunter", [CLASS.PIRATE]: "pirate",
};

// デッキ編成画面で保存したデッキを読む（userDecksList / activeDeckIndex）
// 戻り値: { name, cls, ids } / 読めない・40枚でない場合は { error }
function loadUserDeck() {
    const saved = localStorage.getItem("userDecksList");
    const activeIdx = parseInt(localStorage.getItem("activeDeckIndex") || "0", 10);
    if (!saved) return { error: "デッキが保存されていません" };

    let decks;
    try {
        decks = JSON.parse(saved);
    } catch (e) {
        return { error: "デッキの読み込みに失敗しました" };
    }
    let deck = decks[activeIdx];
    if (!deck || !deck.cards || deck.cards.length === 0) deck = decks.find((d) => d && d.cards && d.cards.length > 0);
    if (!deck) return { error: "デッキが保存されていません" };

    // 保存されているカードを cards.js のカードIDに変換（id があれば id、なければ名前で探す）
    const ids = [];
    const missing = [];
    for (const c of deck.cards) {
        const data = (c.id != null && CARD_MAP.get(Number(c.id))) || CARD_DATABASE.find((d) => d.name === c.name);
        const count = Number(c.count) || 1;
        if (!data) {
            missing.push(c.name);
            continue;
        }
        for (let i = 0; i < count; i++) ids.push(data.id);
    }
    if (missing.length) console.warn("cards.js に見つからないカード:", missing);

    // クラス: 無所属以外で最初に見つかったカードのクラス
    const first = ids.map((id) => CARD_MAP.get(id)).find((c) => c.class !== CLASS.NEUTRAL);
    const cls = first ? first.class : CLASS.NOBLE;
    const name = deck.name || `デッキ ${activeIdx + 1}`;

    if (ids.length !== 40) {
        return { error: `デッキ枚数が 40 枚ではありません（現在 ${ids.length} 枚${missing.length ? `、見つからないカード ${missing.length} 種` : ""}）` };
    }
    return { name, cls, ids };
}

// 自分のデッキを決める: BATTLE_CONFIG → ?class=（お試しのランダムデッキ）→ 保存デッキ の順
// 保存デッキが使えない場合は deck.html に戻して null を返す
function resolveMyDeck() {
    const params = new URLSearchParams(location.search);
    const classes = [CLASS.NOBLE, CLASS.MONSTER, CLASS.GHOST, CLASS.WITCH, CLASS.PUPPET, CLASS.HUNTER, CLASS.PIRATE];
    const conf = window.BATTLE_CONFIG || {};
    if (conf.deck) return { name: conf.deckName || "デッキ", cls: conf.deckClass || CLASS.NOBLE, ids: conf.deck };
    if (classes.includes(params.get("class"))) {
        const cls = params.get("class");
        return { name: `${cls}（お試し）`, cls, ids: buildDeck(cls) };
    }
    const deck = loadUserDeck();
    if (deck.error) {
        alert(`${deck.error}。デッキ編成画面に戻ります。`);
        location.href = "deck.html";
        return null;
    }
    return deck;
}

// パズル（詰めシャドバ）: 決められた盤面から、このターン中に相手リーダーを倒せばクリア
function startPuzzle(conf, myDeck, user) {
    const game = Rules.startMatch({
        seed: 12345,
        players: [
            { id: 1, name: user.username || "あなた", deck: myDeck.ids },
            { id: 2, name: conf.cpuName || "パズル", deck: conf.cpuDeck || buildDeck(conf.cpuClass || CLASS.NOBLE) },
        ],
        isCPU: [false, true],
        mulligan: false,
        reveal: (viewer, cards) => reveal(viewer, cards),
        log: (msg) => addLog(msg),
    });
    const [me, cpu] = game.players;
    me.deckClass = myDeck.cls;
    cpu.deckClass = conf.cpuClass || CLASS.NOBLE;
    conf.puzzle.setup(game, me, cpu);
    const ctrl = new SoloController(game, me, cpu);
    // ターン終了 = 失敗
    ctrl.endTurn = async function () {
        if (!this.canAct()) return;
        UI.ended = false;
        showResult(false);
    };
    BattleUI.attach(ctrl);
    addLog(`パズル「${conf.puzzle.title}」：${conf.puzzle.goal}`);
    $("advice-btn").classList.remove("hidden");
    render();
    banner("PUZZLE");
}

// CPU 戦を始める
// mode: "free"（battle.html）/ "stage"（solo.html）/ "rank-cpu"（ランクマッチの CPU 戦）
function startCpuBattle(mode, presetDeck) {
    UI.mode = mode;
    const params = new URLSearchParams(location.search);
    const classes = [CLASS.NOBLE, CLASS.MONSTER, CLASS.GHOST, CLASS.WITCH, CLASS.PUPPET, CLASS.HUNTER, CLASS.PIRATE];
    const conf = window.BATTLE_CONFIG || {};

    const myDeck = presetDeck || conf.myDeck || resolveMyDeck();
    if (!myDeck) return;
    if (conf.mode) UI.mode = conf.mode;
    $("deck-name").textContent = `デッキ: ${myDeck.name} (${myDeck.ids.length}枚)`;
    UI.deckClassKey = CLASS_KEY[myDeck.cls] || "noble";

    // 相手
    let cpuClass = classes.includes(params.get("cpu")) ? params.get("cpu") : classes[Math.floor(Math.random() * classes.length)];
    let cpuName = conf.cpuName || "CPU";
    if (conf.cpuClass) cpuClass = conf.cpuClass;
    let stage = null;
    if (mode === "stage") {
        UI.stageId = parseInt(localStorage.getItem("currentSoloStage") || "1", 10);
        stage = STAGE_CONFIGS[UI.stageId] || STAGE_CONFIGS[1];
        if (!STAGE_CONFIGS[UI.stageId]) UI.stageId = 1;
        UI.stage = stage;
        UI.difficulty = stage.difficulty;
        cpuClass = stage.cpuClass;
        cpuName = stage.opponent;
    }

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (conf.puzzle) return startPuzzle(conf, myDeck, user);
    const game = Rules.startSolo({
        mulligan: true,
        me: { id: 1, name: conf.myName || user.username || "あなた", deck: myDeck.ids },
        cpu: { id: 2, name: cpuName, deck: conf.cpuDeck || buildDeck(cpuClass) },
        reveal: (viewer, cards) => reveal(viewer, cards),
        log: (msg) => addLog(msg),
    });
    const me = game.players.find((p) => p.id === 1);
    const cpu = game.players.find((p) => p.id === 2);
    me.deckClass = myDeck.cls;
    cpu.deckClass = cpuClass;
    if (stage) {
        cpu.leader.hp = cpu.leader.maxHp = stage.aiHp;
        cpu.portrait = stage.emblem;
    }

    const ctrl = new SoloController(game, me, cpu);
    BattleUI.attach(ctrl);
    if (conf.setup) conf.setup(game, me, cpu);
    $("advice-btn").classList.toggle("hidden", mode === "rank-cpu");
    addLog(stage ? `${stage.name}（${stage.opponent}）との戦闘開始！` : "バトルが開始しました");

    (async () => {
        ctrl.busy = true;
        render();
        await banner(game.players[0] === me ? "先攻" : "後攻");
        // マリガン: 自分は選んで入れ替え、CPU はコスト5以上を入れ替える
        const swap = await new Promise((resolve) => openMulligan(resolve));
        closeMulligan();
        Rules.mulligan(game, me, swap);
        Rules.mulligan(game, cpu, cpu.hand.filter((c) => c.cost >= 5));
        render();
        if (game.current === cpu) {
            await banner("ENEMY TURN", true);
            await runCpu(game, cpu, me);
            if (checkEnd()) return;
            Rules.endTurn(game, cpu);
            Rules.startTurn(game, me);
            render();
            if (checkEnd()) return;
            await banner("YOUR TURN");
        } else {
            await banner("YOUR TURN");
        }
        ctrl.busy = false;
        render();
    })();
}

// ソロのステージ選択（クリア済みの次のステージまで選べる）
function chooseStage() {
    return new Promise((resolve) => {
        const user = JSON.parse(localStorage.getItem("user") || "{}");
        const cleared = typeof user.clearedStage === "number" ? user.clearedStage : 0;
        const diff = { easy: "やさしい", normal: "ふつう", hard: "むずかしい" };
        const rows = Object.entries(STAGE_CONFIGS).map(([id, st]) => {
            const n = Number(id);
            const locked = n > cleared + 1;
            return `<button type="button" class="stage-row ${n <= cleared ? "cleared" : ""}" data-id="${n}" ${locked ? "disabled" : ""}>
                <span class="st-emblem">${locked ? "🔒" : st.emblem}</span>
                <span><span class="st-name">${st.name}</span><br><span class="st-opp">${locked ? "？？？" : esc(st.opponent)}</span></span>
                <span class="st-meta">${st.cpuClass} ・ ${diff[st.difficulty]}<br>相手の体力 ${st.aiHp}</span>
            </button>`;
        }).join("");
        const box = $("modal-box");
        box.innerHTML = `<h3>SOLO ─ ステージを選ぶ</h3><div class="stage-list">${rows}</div>
            <button type="button" id="stage-back">ホームへ戻る</button>`;
        $("modal").classList.remove("hidden");
        box.onclick = (e) => {
            if (e.target.closest("#stage-back")) { location.href = "home.html"; return; }
            const row = e.target.closest(".stage-row");
            if (!row || row.disabled) return;
            localStorage.setItem("currentSoloStage", row.dataset.id);
            $("modal").classList.add("hidden");
            box.onclick = null;
            resolve(Number(row.dataset.id));
        };
    });
}

// ===================================================================
// マリガン・カットイン・メニュー・制限時間
// ===================================================================
// onDone(入れ替えるカードの配列) を呼ぶ
function openMulligan(onDone) {
    UI.mulliganOpen = true;
    const box = $("mulligan-cards");
    box.innerHTML = "";
    const chosen = new Set();
    UI.me.hand.forEach((card) => {
        const el = cardEl(card, "peek");
        el.addEventListener("click", () => {
            if (chosen.has(card)) chosen.delete(card);
            else chosen.add(card);
            el.classList.toggle("swap", chosen.has(card));
        });
        el.addEventListener("pointerenter", () => showDetail(card));
        el.addEventListener("pointerleave", () => hideDetail());
        box.appendChild(el);
    });
    $("mulligan-sub").textContent = "入れ替えたいカードを選んでください";
    const ok = $("mulligan-ok");
    ok.disabled = false;
    ok.onclick = () => {
        ok.disabled = true;
        $("mulligan-sub").textContent = "相手の入れ替えを待っています…";
        hideDetail();
        onDone([...chosen]);
    };
    $("mulligan").classList.remove("hidden");
}

function closeMulligan() {
    UI.mulliganOpen = false;
    $("mulligan").classList.add("hidden");
}

function showCutin(card, enemy) {
    const layer = $("cutin");
    layer.innerHTML = "";
    layer.appendChild(cardEl(card, "peek"));
    layer.insertAdjacentHTML("beforeend", `<div class="cutin-text">
        <div class="ct-who">${enemy ? esc(UI.opp.name) + " がプレイ" : "あなたがプレイ"}</div>
        <div class="ct-name">${esc(card.name)}</div>
        <div class="ct-desc">${esc(card.desc || "")}</div></div>`);
    layer.className = `cutin ${enemy ? "enemy" : "mine"}`;
    void layer.offsetWidth;
    clearTimeout(UI.cutinTimer);
    UI.cutinTimer = setTimeout(() => layer.classList.add("hidden"), 1100);
}

function renderLogPanel() {
    const body = $("log-panel-body");
    body.innerHTML = UI.allLogs.map((m) => `<div>${esc(m)}</div>`).join("");
    body.scrollTop = body.scrollHeight;
}

function openMenu() {
    if (UI.ended || !UI.game) return;
    const box = $("modal-box");
    box.innerHTML = `<h3>MENU</h3><div class="menu-list">
        <button type="button" data-m="log">バトルログを見る</button>
        <button type="button" data-m="surrender" class="danger">降参する</button>
        <button type="button" data-m="close">閉じる</button></div>`;
    $("modal").classList.remove("hidden");
    box.onclick = (e) => {
        const b = e.target.closest("button");
        if (!b) return;
        const m = b.dataset.m;
        if (m === "close") $("modal").classList.add("hidden");
        if (m === "log") {
            $("modal").classList.add("hidden");
            $("log-panel").classList.remove("hidden");
            renderLogPanel();
        }
        if (m === "surrender") {
            box.innerHTML = `<h3>本当に降参しますか？</h3><div class="choices">
                <button type="button" data-m="yes" class="danger">降参する</button>
                <button type="button" data-m="close">やめる</button></div>`;
        }
        if (m === "yes") {
            $("modal").classList.add("hidden");
            addLog("降参しました");
            if (UI.ctrl.surrender) UI.ctrl.surrender();
        }
    };
}

// ランクマッチの制限時間（自分のターンだけ数える。0秒で自動的にターン終了）
function updateTimer() {
    const btn = $("end-turn");
    if (!UI.timerEnabled || UI.ended) {
        btn.classList.remove("timed", "hurry");
        $("turn-timer").textContent = "";
        return;
    }
    const myTurn = UI.game.phase === "play" && UI.game.current === UI.me;
    const key = myTurn ? UI.me.turnCount : null;
    if (key === UI.timerKey) return;
    UI.timerKey = key;
    clearInterval(UI.timerId);
    btn.classList.toggle("timed", myTurn);
    $("turn-timer").textContent = "";
    if (!myTurn) return;
    UI.timerEnd = Date.now() + TURN_SECONDS * 1000;
    const tick = () => {
        const left = Math.max(0, (UI.timerEnd - Date.now()) / 1000);
        btn.style.setProperty("--p", (left / TURN_SECONDS).toFixed(3));
        btn.classList.toggle("hurry", left <= 20);
        $("turn-timer").textContent = left <= 20 ? Math.ceil(left) : "";
        if (left <= 0 && !UI.drag) {
            if (UI.targeting) endTargeting(undefined);
            $("modal").classList.add("hidden");
            if (UI.ctrl.canAct()) {
                addLog("時間切れでターン終了");
                UI.ctrl.endTurn();
            }
        }
    };
    tick();
    UI.timerId = setInterval(tick, 250);
}

// ===================================================================
// ランクマッチ
// ===================================================================
// 対戦相手のスリーブ・称号（サーバーの START に入っている）
function applyPlayerInfo(client, startMsg) {
    const list = (startMsg && startMsg.players) || [];
    client.game.players.forEach((p) => {
        const info = list.find((x) => Number(x.id) === Number(p.id)) || {};
        p.sleeve = info.sleeve || "sleeve_default";
        p.title = info.title || "";
    });
}

// 2Pick の対戦
function startTwoPick() {
    const run = typeof TwoPick !== "undefined" ? TwoPick.load() : null;
    if (!run || run.state !== "battle") {
        location.href = "twopick.html";
        return;
    }
    $("modal-box").innerHTML = "";
    window.BATTLE_CONFIG = Object.assign(window.BATTLE_CONFIG || {}, { backTo: "twopick.html" });
    $("btn-home").textContent = "2Pickへ戻る";
    startRank({ mode: "2pick", label: "2Pick", deck: { name: `2Pick（${run.cls}）`, cls: run.cls, ids: run.deck } });
}

// opts: { mode: "rank" | "2pick", deck: { name, cls, ids }（省略時は使用中のデッキ）, label }
function startRank(opts = {}) {
    const mode = opts.mode || "rank";
    const label = opts.label || "ランクマッチ";
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user.id == null) {
        alert("ログインしてください。");
        location.href = "login.html";
        return;
    }
    const myDeck = opts.deck || loadUserDeck();
    if (myDeck.error) {
        alert(`${myDeck.error}。デッキ編成画面に戻ります。`);
        location.href = "deck.html";
        return;
    }
    $("deck-name").textContent = `デッキ: ${myDeck.name} (${myDeck.ids.length}枚)`;
    UI.deckClassKey = CLASS_KEY[myDeck.cls] || "noble";
    const me = { id: user.id, name: user.username || "あなた" };

    // マッチング待ちの表示（キャンセル可）
    const box = $("modal-box");
    box.innerHTML = `<h3>対戦相手を探しています…</h3>
        <div class="choices">
            <button type="button" id="match-cpu">CPU と対戦する</button>
            <button type="button" id="match-cancel">キャンセル</button>
        </div>`;
    $("modal").classList.remove("hidden");
    $("match-cancel").onclick = () => {
        RankMatch.cancel(me);
        location.href = mode === "2pick" ? "twopick.html" : "home.html";
    };
    // 相手が見つからない時は CPU 戦に切り替えられる（MP は増減するが、グループの判定には数えない）
    $("match-cpu").onclick = () => {
        RankMatch.cancel(me);
        $("modal").classList.add("hidden");
        startCpuBattle(mode === "2pick" ? "2pick-cpu" : "rank-cpu", myDeck);
    };

    const eq = typeof Cosmetics !== "undefined" ? Cosmetics.equipped() : {};
    RankMatch.start(me, myDeck.ids, {
        mode,
        sleeve: eq.sleeve,
        title: typeof Cosmetics !== "undefined" ? Cosmetics.titleName() : "",
        onStart: (client, startMsg) => {
            $("modal").classList.add("hidden");
            client.me.deckClass = myDeck.cls;
            UI.mode = mode; // 対人戦（ランクはグループ判定の対象）
            UI.timerEnabled = true;
            applyPlayerInfo(client, startMsg);
            BattleUI.attach(client);
            addLog(`${label}が開始しました`);
            banner(client.game.players[0] === client.me ? "先攻" : "後攻", false);
        },
        onUpdate: () => render(),
        onGameOver: (winner, game, isWin) => showResult(isWin),
        onDesync: () => addLog("通信エラー：盤面がずれました"),
        onError: (msg) => {
            if (UI.mode === "rank-cpu" || UI.mode === "2pick-cpu") return; // CPU 戦に切り替え済み
            box.innerHTML = `<h3>${esc(msg)}</h3>
                <div class="choices">
                    <button type="button" id="err-cpu">CPU と対戦する</button>
                    <button type="button" onclick="location.href='home.html'">戻る</button>
                </div>`;
            $("err-cpu").onclick = () => {
                $("modal").classList.add("hidden");
                startCpuBattle(mode === "2pick" ? "2pick-cpu" : "rank-cpu", myDeck);
            };
        },
        reveal: (viewer, cards) => reveal(viewer, cards),
    });
}

// ===================================================================
// 初期化
// ===================================================================
document.addEventListener("DOMContentLoaded", () => {
    const board = $("board");
    board.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    board.addEventListener("click", onClick);
    board.addEventListener("pointerover", onPointerOver);
    board.addEventListener("pointerout", onPointerOut);
    $("end-turn").addEventListener("click", () => {
        if (UI.ctrl && UI.ctrl.canAct()) {
            UI.selectedUid = null;
            UI.ctrl.endTurn();
            render();
        }
    });
    $("target-cancel").addEventListener("click", () => endTargeting(undefined));
    $("menu-btn").addEventListener("click", openMenu);
    $("extra-pp").addEventListener("click", useExtraPp);
    $("advice-btn").addEventListener("click", showAdvice);
    $("advice-close").addEventListener("click", () => {
        $("advice-panel").classList.add("hidden");
        UI.adviceUid = null;
        render();
    });
    $("log-close").addEventListener("click", () => $("log-panel").classList.add("hidden"));
    $("btn-retry").addEventListener("click", () => location.reload());
    $("btn-home").addEventListener("click", () => {
        const conf = window.BATTLE_CONFIG || {};
        location.href = conf.backTo || (UI.mode === "stage" ? "home.html" : "profile.html");
    });
    window.addEventListener("resize", () => render());

    const mode = document.body.dataset.mode;
    if (mode === "rank") startRank();
    else if (mode === "2pick") startTwoPick();
    else if (mode === "stage") chooseStage().then(() => startCpuBattle("stage"));
    else if (mode === "custom") { /* 2Pick・パズルのページが BATTLE_CONFIG を用意して startCpuBattle を呼ぶ */ }
    else startCpuBattle("free");
});
