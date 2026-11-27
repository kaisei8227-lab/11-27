// js/effects.js
// 定数・効果ヘルパー（Fx）・基本ルール（Rules）
// 読み込み順: effects.js → cards.js

// ===== 定数 =====
const CLASS = {
    NOBLE: "貴族",
    MONSTER: "怪物",
    GHOST: "幽霊",
    WITCH: "魔女",
    PUPPET: "人形",
    HUNTER: "狩人",
    PIRATE: "海賊",
    NEUTRAL: "無所属",
};

const TYPE = {
    FOLLOWER: "FOLLOWER", // スプレッドシートの「クリーチャー」
    SPELL: "SPELL",       // スプレッドシートの「魔法」
};

const KEYWORD = {
    RUSH: "突進",       // 出たターンから相手のカードに攻撃可能
    WARD: "守護",       // 場にいる限りリーダーは攻撃されない
    STORM: "疾走",      // 出たターンからリーダーとカードの両方に攻撃可能
    DRAIN: "ドレイン",   // 攻撃成功時、攻撃力分リーダーを回復
    SHIELD: "シールド",  // 1度だけ攻撃ダメージを無効化
};

// 対象選択の種類（UI はこれを見てプレイヤーに対象を選ばせる）
const TARGET = {
    NONE: null,
    ALLY_FOLLOWER: "ALLY_FOLLOWER",             // 自分のカード
    ALLY_FOLLOWER_OTHER: "ALLY_FOLLOWER_OTHER", // 自分の他のカード（自身を除く）
    ENEMY_FOLLOWER: "ENEMY_FOLLOWER",           // 相手のカード
    ENEMY_ANY: "ENEMY_ANY",                     // 相手のカードかリーダー
};

const MAX_FIELD = 5;
const MAX_HAND = 9;
const LEADER_HP = 30;
const MAX_PP = 10;
const EVOLVE_POINTS = 2;
const SUPER_EVOLVE_POINTS = 2;
// 進化は 先攻4ターン目／後攻3ターン目から、超進化は その2ターン後（先攻6／後攻5）から
const EVOLVE_TURN = { first: 4, second: 3 };
const SUPER_EVOLVE_TURN = { first: 6, second: 5 };
// 後攻だけが使えるエクストラPP（5ターン目までに1回・6ターン目以降に1回）
const EXTRA_PP_SPLIT_TURN = 5;
const MAX_CRESTS = 5;

// ===== 乱数（seed付き） =====
// 対人戦では両者のブラウザで同じ seed を使うことで、ランダムな効果の結果をそろえる
// Math.random は使わず、必ず Fx.random() を通すこと
let rngState = 1;

function setSeed(seed) {
    rngState = (seed >>> 0) || 1;
}

// mulberry32: 同じ seed なら必ず同じ数列になる
function nextRandom() {
    rngState = (rngState + 0x6D2B79F5) >>> 0;
    let t = rngState;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// ===== カード実体の生成 =====
let uidCounter = 0;

function resetUid() {
    uidCounter = 0;
}

function initInstance(card) {
    card.uid = ++uidCounter;
    card.maxHp = card.hp;
    card.keywords = new Set(card.keywords || []);
    card.statuses = [];          // 一時効果（行動不能・一時的な攻撃力増減・呪いなど）
    card.attacksPerTurn = card.attacksPerTurn || 1;
    card.attacksUsed = 0;
    card.cannotAttackTurns = card.cannotAttackTurns || 0;
    card.summonedThisTurn = false;
    card.evolved = false;
    card.flags = {};             // カード固有の記録用
    return card;
}

// マスターデータをコピーして対戦用の実体を作る（CARD_MAP は cards.js で定義）
function createCardInstance(id) {
    const base = CARD_MAP.get(id);
    if (!base) throw new Error(`カードID ${id} が存在しません`);
    return initInstance({ ...base, baseId: base.id });
}

// トークン（デッキに入らない、効果で出るカード）
function createToken(name, attack, hp, opts = {}) {
    return initInstance({
        id: 0,
        name,
        class: opts.class || CLASS.NEUTRAL,
        type: TYPE.FOLLOWER,
        isToken: true,
        isPuppet: !!opts.puppet,
        cost: 0,
        attack,
        hp,
        keywords: opts.keywords || [],
        desc: "",
    });
}

// ===== 効果ヘルパー =====
const Fx = {
    random() {
        return nextRandom();
    },

    randomOf(arr) {
        return arr.length ? arr[Math.floor(nextRandom() * arr.length)] : null;
    },

    pickRandom(arr, n) {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(nextRandom() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy.slice(0, n);
    },

    others(player, self) {
        return player.field.filter(c => c.uid !== self.uid);
    },

    isPuppet(card) {
        return !!card && (card.isPuppet || card.name === "傀儡");
    },

    puppets(player) {
        return player.field.filter(c => Fx.isPuppet(c));
    },

    onField(player, card) {
        return !!card && player.field.some(c => c.uid === card.uid);
    },

    findOnField(player, name) {
        return player.field.find(c => c.name === name) || null;
    },

    hasDemon(player, color) {
        return player.field.some(c => c.demonColor === color);
    },

    // --- ステータス変化 ---
    buff(card, atk = 0, hp = 0) {
        if (!card) return;
        card.attack = Math.max(0, card.attack + atk);
        if (hp) {
            card.hp += hp;
            card.maxHp += hp;
        }
    },

    buffAll(player, atk = 0, hp = 0) {
        [...player.field].forEach(c => Fx.buff(c, atk, hp));
    },

    // 体力を減らす（ダメージ扱いではないのでシールドでは防げない）
    reduceHp(card, amount, game) {
        if (!card) return;
        card.hp -= amount;
        card.maxHp = Math.max(card.hp, card.maxHp - amount);
        if (card.hp <= 0) Fx.destroy(card, game);
    },

    setHp(card, value, game) {
        if (!card) return;
        card.hp = value;
        if (card.hp <= 0) Fx.destroy(card, game);
    },

    // 一定ターンだけ攻撃力を増減する（turns は持ち主のターン終了時に減る）
    tempAttack(card, delta, turns) {
        if (!card) return;
        const before = card.attack;
        card.attack = Math.max(0, before + delta);
        card.statuses.push({ type: "TEMP_ATK", value: card.attack - before, turns });
    },

    setAttackZero(card, turns) {
        if (card) Fx.tempAttack(card, -card.attack, turns);
    },

    halveAttack(card, turns) {
        if (card) Fx.tempAttack(card, -Math.floor(card.attack / 2), turns);
    },

    stun(card, turns) {
        if (card) card.statuses.push({ type: "STUN", turns });
    },

    stunAll(player, turns) {
        player.field.forEach(c => Fx.stun(c, turns));
    },

    isStunned(card) {
        return card.statuses.some(s => s.type === "STUN");
    },

    // 効果（フック）を一時的に無効化
    silence(card, turns) {
        if (card) card.statuses.push({ type: "SILENCE", turns });
    },

    isSilenced(card) {
        return card.statuses.some(s => s.type === "SILENCE");
    },

    // 呪い: 次に受けるダメージ+value
    curse(card, value = 1) {
        if (card) card.statuses.push({ type: "CURSE", value, turns: Infinity });
    },

    giveKeyword(card, keyword) {
        if (card) card.keywords.add(keyword);
    },

    // 攻撃力と体力を入れ替える
    swapStats(card, game) {
        if (!card) return;
        const atk = card.attack;
        card.attack = card.hp;
        card.hp = atk;
        card.maxHp = atk;
        if (card.hp <= 0) Fx.destroy(card, game);
    },

    // --- ダメージ・回復 ---
    damage(card, amount, game) {
        if (!card || amount <= 0) return 0;
        if (card.isLeader) return Fx.damageLeader(card.owner, amount);

        // 呪い（次に受けるダメージ+N）
        const curses = card.statuses.filter(s => s.type === "CURSE");
        if (curses.length) {
            amount += curses.reduce((s, c) => s + c.value, 0);
            card.statuses = card.statuses.filter(s => s.type !== "CURSE");
        }

        // 被ダメージ軽減（自身の能力＋場のオーラ）
        const owner = game.getOwner(card);
        // 超進化したカードは、持ち主のターン中はダメージを受けない（無敵）
        if (card.superEvolved && owner && game.current === owner) return 0;
        let reduction = card.damageReduction || 0;
        if (owner && card.keywords.has(KEYWORD.WARD)) {
            reduction += owner.field
                .filter(c => c.uid !== card.uid)
                .reduce((s, c) => s + (c.wardDamageReductionAura || 0), 0);
        }
        amount = Math.max(0, amount - reduction);
        if (amount === 0) return 0;

        // シールド
        if (card.keywords.has(KEYWORD.SHIELD)) {
            card.keywords.delete(KEYWORD.SHIELD);
            return 0;
        }
        // 不動の聖騎士ガレオンのオーラ（他の守護カードは1回だけ無効化）
        if (owner && card.keywords.has(KEYWORD.WARD) && !card.flags.auraShieldUsed &&
            owner.field.some(c => c.uid !== card.uid && c.wardShieldAura)) {
            card.flags.auraShieldUsed = true;
            return 0;
        }

        card.hp -= amount;
        if (card.hp <= 0) Fx.destroy(card, game);
        return amount;
    },

    // 対象がカードでもリーダーでもダメージを与える
    damageAny(target, amount, game) {
        return Fx.damage(target, amount, game);
    },

    damageAll(player, amount, game) {
        [...player.field].forEach(c => Fx.damage(c, amount, game));
    },

    damageLeader(player, amount) {
        const reduction = player.field.reduce((s, c) => s + (c.leaderDamageReduction || 0), 0)
            + (player.tempLeaderReduction || 0);
        const dealt = Math.max(0, amount - reduction);
        player.leader.hp = Math.max(0, player.leader.hp - dealt);
        return dealt;
    },

    healLeader(player, amount) {
        player.leader.hp = Math.min(player.leader.maxHp, player.leader.hp + amount);
    },

    healCard(card, amount) {
        if (card) card.hp = Math.min(card.maxHp, card.hp + amount);
    },

    healAll(player, amount) {
        player.field.forEach(c => Fx.healCard(c, amount));
    },

    // --- 破壊・消滅 ---
    removeFromField(card, game) {
        const owner = game.getOwner(card);
        if (!owner) return null;
        owner.field = owner.field.filter(c => c.uid !== card.uid);
        return owner;
    },

    destroy(card, game, { force = false } = {}) {
        if (!card) return;
        const owner = game.getOwner(card);
        if (!owner) return;
        // 超進化したカードは能力では破壊されない（戦闘などで体力が0になった時は破壊される）
        if (card.superEvolved && card.hp > 0 && !force) return;
        // 破壊を防ぐ能力（不滅の大盾ブリュンヒルデなど）
        if (card.preventDestroy && card.preventDestroy(card)) return;
        Fx.removeFromField(card, game);
        owner.graveyard.push(card);
        Rules.callHook(game, card, "onDestroy", { player: owner, opponent: game.getOpponent(owner) });
        owner.field.forEach(c => Rules.callHook(game, c, "onAllyDestroyed", { destroyed: card }));
    },

    // 墓地に送らず消滅させる（超進化したカードは能力では消滅しない）
    banish(card, game, { force = false } = {}) {
        if (!card || (card.superEvolved && !force)) return;
        Fx.removeFromField(card, game);
    },

    // --- クレスト（リーダーに付く効果。最大5個）---
    // crest: { key, name, text, turns }（turns は持ち主のターン終了で減る。Infinity でずっと）
    addCrest(player, crest) {
        player.crests = player.crests || [];
        const same = player.crests.find(c => c.key === crest.key);
        if (same) {
            Object.assign(same, crest);
            return same;
        }
        if (player.crests.length >= MAX_CRESTS) return null;
        const c = { turns: Infinity, ...crest };
        player.crests.push(c);
        return c;
    },
    removeCrest(player, key) {
        player.crests = (player.crests || []).filter(c => c.key !== key);
    },

    destroyRandom(player, count, game) {
        Fx.pickRandom(player.field, count).forEach(c => Fx.destroy(c, game));
    },

    // 生け贄（破壊扱い）
    sacrifice(player, cards, game) {
        cards.forEach(c => {
            Fx.destroy(c, game, { force: true });
            player.stats.sacrificeCount++;
            player.field.forEach(f => Rules.callHook(game, f, "onAllySacrificed", { sacrificed: c }));
        });
    },

    // --- 召喚 ---
    summon(player, cardId) {
        if (player.field.length >= MAX_FIELD) return null;
        const card = createCardInstance(cardId);
        card.summonedThisTurn = true;
        player.field.push(card);
        if (Fx.isPuppet(card)) player.stats.puppetCount++;
        return card;
    },

    summonToken(player, name, attack, hp, opts = {}) {
        if (player.field.length >= MAX_FIELD) return null;
        const token = createToken(name, attack, hp, opts);
        token.summonedThisTurn = true;
        player.field.push(token);
        if (token.isPuppet) player.stats.puppetCount++;
        return token;
    },

    summonPuppets(player, count, attack = 0, hp = 1) {
        const result = [];
        for (let i = 0; i < count; i++) {
            const t = Fx.summonToken(player, "傀儡", attack, hp, { class: CLASS.PUPPET, puppet: true });
            if (t) result.push(t);
        }
        return result;
    },

    // 墓地から場に戻す
    revive(player, card, hp, game) {
        if (!card || player.field.length >= MAX_FIELD) return null;
        player.graveyard = player.graveyard.filter(c => c.uid !== card.uid);
        const revived = card.isToken
            ? createToken(card.name, card.attack, card.maxHp, { class: card.class, puppet: card.isPuppet })
            : createCardInstance(card.id);
        if (hp != null) revived.hp = Math.min(hp, revived.maxHp);
        revived.summonedThisTurn = true;
        player.field.push(revived);
        return revived;
    },

    // --- 手札・山札 ---
    addToHand(player, card) {
        if (player.hand.length < MAX_HAND) player.hand.push(card);
        else player.graveyard.push(card);
    },

    // 山札が0枚の時に引こうとすると、そのプレイヤーの負け（シャドバと同じ）
    draw(player, count = 1) {
        for (let i = 0; i < count; i++) {
            const card = player.deck.shift();
            if (!card) {
                player.deckOut = true;
                return;
            }
            Fx.addToHand(player, card);
        }
    },

    discardRandom(player, count = 1) {
        Fx.pickRandom(player.hand, count).forEach(c => {
            player.hand = player.hand.filter(h => h.uid !== c.uid);
            player.graveyard.push(c);
        });
    },

    // 山札から魔法カードを手札に加える
    addSpellFromDeck(player, count = 1) {
        for (let i = 0; i < count; i++) {
            const idx = player.deck.findIndex(c => c.type === TYPE.SPELL);
            if (idx === -1) return;
            Fx.addToHand(player, player.deck.splice(idx, 1)[0]);
        }
    },

    // 墓地から手札に戻す
    returnFromGraveyard(player, card) {
        if (!card) return;
        player.graveyard = player.graveyard.filter(c => c.uid !== card.uid);
        if (!card.isToken) Fx.addToHand(player, createCardInstance(card.id));
    },

    // 場から手札に戻す
    returnToHand(card, game) {
        if (!card) return;
        const owner = Fx.removeFromField(card, game);
        if (owner && !card.isToken) Fx.addToHand(owner, createCardInstance(card.id));
    },

    // 情報を見る系は UI に表示を任せる
    peekHand(game, viewer, target, count) {
        const cards = count === "all" ? [...target.hand] : Fx.pickRandom(target.hand, count);
        game.reveal(viewer, cards);
        return cards;
    },

    peekDeck(game, player, count = 1) {
        const cards = player.deck.slice(0, count);
        game.reveal(player, cards);
        return cards;
    },

    peekCard(game, viewer, card) {
        if (card) game.reveal(viewer, [card]);
    },

    // --- 支配・略奪 ---
    // turns を指定すると、そのターン終了時に元の持ち主へ戻る
    takeControl(card, game, newOwner, turns = null) {
        if (!card || newOwner.field.length >= MAX_FIELD) return null;
        const oldOwner = Fx.removeFromField(card, game);
        if (!oldOwner) return null;
        card.summonedThisTurn = true;
        if (turns) {
            card.returnTo = oldOwner;
            card.returnAfterTurnOf = newOwner;
        }
        newOwner.field.push(card);
        newOwner.stats.stolenCount++;
        return card;
    },

    stealFromHand(player, opponent) {
        const card = Fx.randomOf(opponent.hand);
        if (!card) return null;
        opponent.hand = opponent.hand.filter(c => c.uid !== card.uid);
        Fx.addToHand(player, card);
        player.stats.stolenCount++;
        return card;
    },

    // toField: true なら場に出す、false なら手札に加える
    stealFromGraveyard(player, opponent, { toField = false, filter = () => true } = {}) {
        const card = Fx.randomOf(opponent.graveyard.filter(c => !c.isToken && filter(c)));
        if (!card) return null;
        opponent.graveyard = opponent.graveyard.filter(c => c.uid !== card.uid);
        player.stats.stolenCount++;
        const fresh = createCardInstance(card.id);
        if (toField) {
            if (player.field.length >= MAX_FIELD) return null;
            fresh.summonedThisTurn = true;
            player.field.push(fresh);
        } else {
            Fx.addToHand(player, fresh);
        }
        return fresh;
    },
};

// ===== 基本ルール =====
const Rules = {
    createPlayer(name, deckIds, { isCPU = false } = {}) {
        const player = {
            name,
            isCPU,
            leader: { isLeader: true, hp: LEADER_HP, maxHp: LEADER_HP },
            hand: [],
            deck: Fx.pickRandom(deckIds.map(id => createCardInstance(id)), deckIds.length),
            field: [],
            graveyard: [],
            pp: 0,
            maxPp: 0,
            turnCount: 0,
            isFirst: false,
            evolvePoints: EVOLVE_POINTS,
            superEvolvePoints: SUPER_EVOLVE_POINTS,
            evolvedThisTurn: false,
            extraPp: { early: false, late: false, usedThisTurn: false },
            crests: [],
            tempLeaderReduction: 0,
            stats: { playedCount: 0, spellCount: 0, puppetCount: 0, stolenCount: 0, sacrificeCount: 0 },
        };
        player.leader.owner = player;
        return player;
    },

    // 対戦開始。seed と、先攻→後攻の順に並べた players を両者のブラウザで同じにすれば、同じ盤面になる
    // players: [{ id, name, deck: [カードID...] }, { ... }]（先頭が先攻）
    // mulligan: true なら、両者が手札の入れ替え（Rules.mulligan）を終えてから1ターン目が始まる
    startMatch({ seed, players, reveal, log, isCPU = [false, false], mulligan = false }) {
        setSeed(seed);
        resetUid();
        const [a, b] = players.map((p, i) => {
            const player = Rules.createPlayer(p.name, p.deck, { isCPU: isCPU[i] });
            player.id = p.id;
            return player;
        });
        const game = Rules.createGame(a, b, { reveal, log });
        if (mulligan) {
            game.phase = "mulligan";
        } else {
            game.phase = "play";
            Rules.startTurn(game, a);
        }
        return game;
    },

    // ソロ（CPU戦）用: seed を自動で決めて開始
    startSolo({ me, cpu, reveal, log, mulligan = false }) {
        const seed = Math.floor(Date.now() % 2147483647);
        const meFirst = Date.now() % 2 === 0;
        const players = meFirst ? [me, cpu] : [cpu, me];
        return Rules.startMatch({ seed, players, reveal, log, mulligan, isCPU: meFirst ? [false, true] : [true, false] });
    },

    // マリガン（最初の手札の入れ替え）: 選んだカードを山札に戻して混ぜ、同じ枚数を引き直す
    // 両者が終わったら先攻の1ターン目を始める
    mulligan(game, player, cards = []) {
        if (game.phase !== "mulligan" || player.mulliganDone) return false;
        const uids = new Set(cards.map((c) => (typeof c === "number" ? c : c.uid)));
        const back = player.hand.filter((c) => uids.has(c.uid));
        player.hand = player.hand.filter((c) => !uids.has(c.uid));
        player.deck = Fx.pickRandom([...player.deck, ...back], player.deck.length + back.length);
        Fx.draw(player, back.length);
        player.mulliganDone = true;
        if (game.players.every((p) => p.mulliganDone)) {
            game.phase = "play";
            Rules.startTurn(game, game.players[0]);
        }
        return true;
    },

    // 降参
    surrender(game, player) {
        player.leader.hp = 0;
    },

    // reveal(viewer, cards): 「相手の手札を見る」などで UI に表示するためのコールバック
    createGame(p1, p2, { reveal = () => {}, log = () => {} } = {}) {
        p1.isFirst = true;
        const game = {
            players: [p1, p2],
            current: p1,
            reveal,
            log,
            getOwner(card) {
                return game.players.find(p => p.field.some(c => c.uid === card.uid)) || null;
            },
            getOpponent(player) {
                return player === p1 ? p2 : p1;
            },
        };
        Fx.draw(p1, 5);
        Fx.draw(p2, 5);
        return game;
    },

    callHook(game, card, hook, extra = {}) {
        if (!card || !card[hook] || Fx.isSilenced(card)) return;
        const player = extra.player || game.getOwner(card);
        if (!player) return;
        card[hook]({ game, player, opponent: game.getOpponent(player), self: card, ...extra });
    },

    sacrificeCandidates(player, card) {
        return card.sacrifice ? player.field.filter(card.sacrifice.filter) : [];
    },

    // 条件付きコスト軽減（costModifier）込みのコスト
    costOf(game, player, card) {
        const mod = card.costModifier ? card.costModifier({ game, player, opponent: game.getOpponent(player), self: card }) : 0;
        return Math.max(0, card.cost + mod);
    },

    // 条件付き攻撃力ボーナス（attackBonus）込みの攻撃力
    attackOf(game, card) {
        const player = game.getOwner(card);
        if (!card.attackBonus || !player) return card.attack;
        return card.attack + card.attackBonus({ game, player, opponent: game.getOpponent(player), self: card });
    },

    // 条件付き体力ボーナス（hpBonus）を盤面に合わせて付け直す
    refreshAuras(game) {
        game.players.forEach(player => {
            [...player.field].forEach(card => {
                if (!card.hpBonus) return;
                const want = card.hpBonus({ game, player, opponent: game.getOpponent(player), self: card });
                const diff = want - (card.flags.hpBonusApplied || 0);
                if (diff === 0) return;
                card.flags.hpBonusApplied = want;
                card.maxHp += diff;
                card.hp += diff;
                if (card.hp <= 0) Fx.destroy(card, game);
            });
        });
    },

    canPlay(game, player, card, { free = false } = {}) {
        if (!free && Rules.costOf(game, player, card) > player.pp) return false;
        if (card.sacrifice && Rules.sacrificeCandidates(player, card).length < card.sacrifice.count) return false;
        const freed = card.sacrifice ? card.sacrifice.count : 0;
        if (card.type === TYPE.FOLLOWER && player.field.length - freed >= MAX_FIELD) return false;
        if (card.canPlay && !card.canPlay({ game, player, opponent: game.getOpponent(player), self: card })) return false;
        return true;
    },

    // options: { target, targets, choice, sacrifices, free }
    // free: true でコストを払わずにプレイ（魔女の箒など）
    playCard(game, player, card, options = {}) {
        if (!Rules.canPlay(game, player, card, options)) return false;
        const opponent = game.getOpponent(player);
        if (!options.free) player.pp -= Rules.costOf(game, player, card);
        player.hand = player.hand.filter(c => c.uid !== card.uid);

        let sacrificed = [];
        if (card.sacrifice) {
            sacrificed = options.sacrifices || Rules.sacrificeCandidates(player, card).slice(0, card.sacrifice.count);
            Fx.sacrifice(player, sacrificed, game);
        }

        if (card.type === TYPE.FOLLOWER) {
            card.summonedThisTurn = true;
            player.field.push(card);
        }
        player.stats.playedCount++;
        if (card.type === TYPE.SPELL) player.stats.spellCount++;
        if (Fx.isPuppet(card)) player.stats.puppetCount++;

        if (game.onCardPlayed) game.onCardPlayed(player, card);
        const ctx = { game, player, opponent, self: card, sacrificed, ...options };
        if (card.onPlay) card.onPlay(ctx);

        if (card.type === TYPE.SPELL) player.graveyard.push(card);
        [...opponent.field].forEach(c => Rules.callHook(game, c, "onEnemyPlay", { played: card }));
        Rules.refreshAuras(game);
        game.log(`${player.name} が ${card.name} をプレイ`);
        return true;
    },

    // 起動効果（名もなき傀儡など、場にいるカードを任意のタイミングで使う効果）
    activate(game, player, card, options = {}) {
        if (!card.activate || !Fx.onField(player, card)) return false;
        const result = card.activate({ game, player, opponent: game.getOpponent(player), self: card, ...options });
        Rules.refreshAuras(game);
        return result !== false;
    },

    hasWard(player) {
        return player.field.some(c => c.keywords.has(KEYWORD.WARD));
    },

    canAttack(card) {
        if (Fx.isStunned(card) || card.cannotAttackTurns > 0) return false;
        if (card.attacksUsed >= card.attacksPerTurn) return false;
        if (card.summonedThisTurn && !card.keywords.has(KEYWORD.RUSH) && !card.keywords.has(KEYWORD.STORM)) return false;
        return true;
    },

    canAttackLeader(game, card) {
        if (!Rules.canAttack(card)) return false;
        if (card.summonedThisTurn && !card.keywords.has(KEYWORD.STORM)) return false;
        return !Rules.hasWard(game.getOpponent(game.getOwner(card)));
    },

    canAttackFollower(game, card, defender) {
        if (!Rules.canAttack(card)) return false;
        const opponent = game.getOpponent(game.getOwner(card));
        return !Rules.hasWard(opponent) || defender.keywords.has(KEYWORD.WARD);
    },

    // defender はカードか相手リーダー（opponent.leader）
    attack(game, attacker, defender) {
        const player = game.getOwner(attacker);
        const opponent = game.getOpponent(player);
        const ok = defender.isLeader ? Rules.canAttackLeader(game, attacker) : Rules.canAttackFollower(game, attacker, defender);
        if (!ok) return false;

        attacker.attacksUsed++;
        Rules.callHook(game, attacker, "onAttack", { defender });

        const power = Rules.attackOf(game, attacker);
        let dealt = 0;
        let killed = false;
        if (defender.isLeader) {
            dealt = Fx.damageLeader(opponent, power);
        } else {
            Rules.callHook(game, defender, "onAttacked", { attacker });
            const counter = Rules.attackOf(game, defender);
            if (attacker.annihilateOnAttack) {
                // 大天使ミカエル: 自分から攻撃すると相手カードを消滅させる
                dealt = defender.hp;
                Fx.banish(defender, game);
                killed = !Fx.onField(opponent, defender);
            } else {
                dealt = Fx.damage(defender, power, game);
                killed = !Fx.onField(opponent, defender);
            }
            if (!attacker.noDamageWhenAttacking && Fx.onField(player, attacker)) {
                Fx.damage(attacker, counter, game);
            }
        }

        if (dealt > 0) {
            if (attacker.keywords.has(KEYWORD.DRAIN)) Fx.healLeader(player, power);
            Rules.callHook(game, attacker, "onAttackSuccess", { player, defender, dealt });
        }
        if (killed) {
            if (attacker.superEvolved && Fx.onField(player, attacker)) {
                Fx.damageLeader(opponent, 1);
                game.log(`${attacker.name} の超進化の一撃！ ${opponent.name} のリーダーに1ダメージ`);
            }
            Rules.callHook(game, attacker, "onKill", { player, defender });
            player.field.forEach(c => c.uid !== attacker.uid && Rules.callHook(game, c, "onAllyKill", { defender }));
        }
        Rules.refreshAuras(game);
        return true;
    },

    canEvolve(player, card) {
        const startTurn = player.isFirst ? EVOLVE_TURN.first : EVOLVE_TURN.second;
        return player.evolvePoints > 0 && !player.evolvedThisTurn && !card.evolved &&
            card.type === TYPE.FOLLOWER && player.turnCount >= startTurn && player.field.includes(card);
    },

    // 進化: 攻撃力+2・体力+2、突進を得る
    evolve(game, player, card, options = {}) {
        if (!Rules.canEvolve(player, card)) return false;
        player.evolvePoints--;
        player.evolvedThisTurn = true;
        card.evolved = true;
        Fx.buff(card, 2, 2);
        Fx.giveKeyword(card, KEYWORD.RUSH);
        Rules.callHook(game, card, "onEvolve", { player, ...options });
        game.log(`${player.name} が ${card.name} を進化`);
        return true;
    },

    // 超進化できるか（進化と超進化は合わせて1ターンに1回）
    canSuperEvolve(player, card) {
        const startTurn = player.isFirst ? SUPER_EVOLVE_TURN.first : SUPER_EVOLVE_TURN.second;
        return player.superEvolvePoints > 0 && !player.evolvedThisTurn && !card.superEvolved &&
            card.type === TYPE.FOLLOWER && player.turnCount >= startTurn && player.field.includes(card);
    },

    // 超進化: 攻撃力+3・体力+3、突進。自分のターン中は無敵・能力で破壊されない・
    // 相手のカードを攻撃で倒すと相手リーダーに1ダメージ。進化前なら「進化時」の効果も発動する
    superEvolve(game, player, card, options = {}) {
        if (!Rules.canSuperEvolve(player, card)) return false;
        player.superEvolvePoints--;
        player.evolvedThisTurn = true;
        const wasEvolved = card.evolved;
        if (wasEvolved) Fx.buff(card, 1, 1); // 進化済み(+2)から超進化(+3)への差分
        else Fx.buff(card, 3, 3);
        card.evolved = true;
        card.superEvolved = true;
        Fx.giveKeyword(card, KEYWORD.RUSH);
        if (!wasEvolved) Rules.callHook(game, card, "onEvolve", { player, ...options });
        Rules.callHook(game, card, "onSuperEvolve", { player, ...options });
        game.log(`${player.name} が ${card.name} を超進化！`);
        return true;
    },

    // エクストラPP（後攻のみ）: そのターンだけ PP+1。5ターン目までに1回、6ターン目以降に1回
    canUseExtraPp(game, player) {
        if (player.isFirst || game.current !== player || player.extraPp.usedThisTurn) return false;
        return player.turnCount <= EXTRA_PP_SPLIT_TURN ? !player.extraPp.early : !player.extraPp.late;
    },

    useExtraPp(game, player) {
        if (!Rules.canUseExtraPp(game, player)) return false;
        if (player.turnCount <= EXTRA_PP_SPLIT_TURN) player.extraPp.early = true;
        else player.extraPp.late = true;
        player.extraPp.usedThisTurn = true;
        player.pp += 1;
        game.log(`${player.name} がエクストラPPを使用（PP+1）`);
        return true;
    },

    startTurn(game, player) {
        game.current = player;
        player.turnCount++;
        player.maxPp = Math.min(MAX_PP, player.maxPp + 1);
        player.pp = player.maxPp;
        player.evolvedThisTurn = false;
        player.extraPp.usedThisTurn = false;
        Fx.draw(player, 1);
        player.field.forEach(c => {
            c.attacksUsed = 0;
            c.summonedThisTurn = false;
            if (c.cannotAttackTurns > 0) c.cannotAttackTurns--;
        });
        [...player.field].forEach(c => Rules.callHook(game, c, "onTurnStart", { player }));
    },

    endTurn(game, player) {
        [...player.field].forEach(c => Rules.callHook(game, c, "onTurnEnd", { player }));

        // 一時効果のターン経過（持ち主のターン終了時に減る）
        player.field.forEach(c => {
            c.statuses.forEach(s => {
                s.turns--;
                if (s.turns > 0) return;
                if (s.type === "TEMP_ATK") c.attack = Math.max(0, c.attack - s.value);
                if (s.type === "TEMP_HP") {
                    c.maxHp -= s.value;
                    c.hp = Math.min(c.hp, c.maxHp);
                }
            });
            c.statuses = c.statuses.filter(s => s.turns > 0);
        });

        // 一時的に奪ったカードを返す
        [...player.field].forEach(c => {
            if (c.returnAfterTurnOf === player) {
                const back = c.returnTo;
                delete c.returnTo;
                delete c.returnAfterTurnOf;
                player.field = player.field.filter(f => f.uid !== c.uid);
                if (back.field.length < MAX_FIELD) back.field.push(c);
                else back.graveyard.push(c);
            }
        });

        // 一時的なコスト軽減を戻す
        player.hand.forEach(c => {
            if (c.costDownTurns) {
                c.costDownTurns--;
                if (c.costDownTurns === 0) c.cost = CARD_MAP.get(c.id).cost;
            }
        });

        // 一時的な体力増加が切れて体力0以下になったカードを破壊
        [...player.field].filter(c => c.hp <= 0).forEach(c => Fx.destroy(c, game));
        player.tempLeaderReduction = 0;
        Fx.removeCrest(player, "tempLeaderReduction");
        // クレストのターン経過
        player.crests = (player.crests || []).filter(c => {
            if (c.turns === Infinity) return true;
            c.turns--;
            return c.turns > 0;
        });
        Rules.refreshAuras(game);
    },

    // 体力が0以下、または山札切れのプレイヤーの負け
    lost(player) {
        return player.leader.hp <= 0 || !!player.deckOut;
    },

    // リーダーに付いている効果（クレスト）の一覧。カードの能力で付いた一時的な効果も含める
    crestsOf(player) {
        const list = [...(player.crests || [])];
        if (player.tempLeaderReduction > 0) {
            list.push({ key: "tempLeaderReduction", name: "守りの加護", text: `このターン、リーダーが受けるダメージ-${player.tempLeaderReduction}`, turns: 1 });
        }
        const aura = player.field.reduce((n, c) => n + (c.leaderDamageReduction || 0), 0);
        if (aura > 0) list.push({ key: "aura", name: "鉄壁の陣", text: `場のカードの力で、リーダーが受けるダメージ-${aura}`, turns: Infinity });
        return list.slice(0, MAX_CRESTS);
    },

    winner(game) {
        const [p1, p2] = game.players;
        if (Rules.lost(p1)) return p2;
        if (Rules.lost(p2)) return p1;
        return null;
    },
};
