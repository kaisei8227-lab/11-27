// js/match.js
// ランクマッチ（対人戦）の同期処理
// 読み込み順: effects.js → cards.js → match.js
//
// 仕組み
//   1. サーバー（GameRoom）が seed と両者のデッキを配る（START メッセージ）
//   2. 両者のブラウザが同じ seed で Rules.startMatch → 同じ盤面ができる
//   3. 自分の操作は「すぐ適用せず」サーバーに送る
//   4. サーバーが番号（seq）を付けて両者に配る → 両者とも受け取った順に適用する
//      自分の操作も、サーバーから戻ってきた時に適用する（両者の適用順を必ずそろえるため）
//   5. ターン終了時に盤面のハッシュを付けて送り、受け取った側で比べてズレを検知する

class MatchClient {
    // seed, players: サーバーの START メッセージの中身
    // myId: 自分のユーザーID
    // send(action): サーバーに操作を送る関数（WebSocket 送信）
    // onUpdate(game): 盤面が変わるたびに呼ばれる（画面の再描画用）
    // onGameOver(winner, game): 決着時に呼ばれる
    // onDesync(info): 両者の盤面がずれた時に呼ばれる
    constructor({ seed, players, myId, send, onUpdate = () => {}, onGameOver = () => {}, onDesync = () => {}, reveal, log }) {
        this.myId = myId;
        this.send = send;
        this.onUpdate = onUpdate;
        this.onGameOver = onGameOver;
        this.onDesync = onDesync;
        this.nextSeq = 0;
        this.pending = new Map(); // 順番より先に届いた操作
        this.finished = false;
        this.waiting = false;     // 送った操作がサーバーから戻ってくるまで次の操作を受け付けない

        // 自分以外への reveal（相手が自分の手札を見た等）は表示しない
        const safeReveal = (viewer, cards) => {
            if (viewer === this.me && reveal) reveal(viewer, cards);
        };
        this.game = Rules.startMatch({ seed, players, reveal: safeReveal, log, mulligan: true });
        this.me = this.game.players.find(p => p.id === myId);
        this.opponent = this.game.getOpponent(this.me);
    }

    isMyTurn() {
        return !this.finished && this.game.phase === "play" && this.game.current === this.me;
    }

    // マリガン（手札の入れ替え）をまだ選んでいないか
    needsMulligan() {
        return !this.finished && this.game.phase === "mulligan" && !this.me.mulliganDone && !this.waiting;
    }

    // 今操作できるか（自分の手番で、前の操作の反映待ちでない）
    canAct() {
        return this.isMyTurn() && !this.waiting;
    }

    // ===== UI から呼ぶ操作 =====
    // それぞれ、ルール上できる操作か確かめてから送信する（適用はサーバーから戻ってきた時）

    play(card, { target, targets, choice, sacrifices } = {}) {
        if (!this.canAct() || !Rules.canPlay(this.game, this.me, card)) return false;
        return this._send({
            type: "PLAY",
            card: card.uid,
            target: this._ref(target),
            targets: targets ? targets.map(t => this._ref(t)) : null,
            choice: this._ref(choice),
            sacrifices: sacrifices ? sacrifices.map(c => c.uid) : null,
        });
    }

    attack(attacker, defender) {
        if (!this.canAct()) return false;
        const ok = defender.isLeader
            ? Rules.canAttackLeader(this.game, attacker)
            : Rules.canAttackFollower(this.game, attacker, defender);
        if (!ok) return false;
        return this._send({ type: "ATTACK", attacker: attacker.uid, defender: this._ref(defender) });
    }

    evolve(card, { target } = {}) {
        if (!this.canAct() || !Rules.canEvolve(this.me, card)) return false;
        return this._send({ type: "EVOLVE", card: card.uid, target: this._ref(target) });
    }

    superEvolve(card, { target } = {}) {
        if (!this.canAct() || !Rules.canSuperEvolve(this.me, card)) return false;
        return this._send({ type: "SUPER_EVOLVE", card: card.uid, target: this._ref(target) });
    }

    extraPp() {
        if (!this.canAct() || !Rules.canUseExtraPp(this.game, this.me)) return false;
        return this._send({ type: "EXTRA_PP" });
    }

    activate(card, { choice } = {}) {
        if (!this.canAct() || !card.activate) return false;
        return this._send({ type: "ACTIVATE", card: card.uid, choice: this._ref(choice) });
    }

    endTurn() {
        if (!this.canAct()) return false;
        return this._send({ type: "END_TURN" });
    }

    // cards: 入れ替えるカード（手札のカードの配列。入れ替えない場合は []）
    mulligan(cards) {
        if (!this.needsMulligan()) return false;
        return this._send({ type: "MULLIGAN", cards: cards.map((c) => c.uid) });
    }

    surrender() {
        if (this.finished) return false;
        return this._send({ type: "SURRENDER" });
    }

    // ===== サーバーから届いた操作 =====
    // action = { seq, by, type, ... }
    receive(action) {
        if (this.finished) return;
        this.pending.set(action.seq, action);
        while (this.pending.has(this.nextSeq)) {
            const next = this.pending.get(this.nextSeq);
            this.pending.delete(this.nextSeq);
            this.nextSeq++;
            this._apply(next);
            if (this.finished) break;
        }
    }

    // ===== 内部処理 =====

    _send(action) {
        if (action.type === "END_TURN") action.hash = MatchClient.hashState(this.game);
        if (action.type !== "SURRENDER") this.waiting = true;
        this.send({ ...action, by: this.myId });
        return true;
    }

    _apply(action) {
        const game = this.game;
        const actor = game.players.find(p => p.id === action.by);
        if (!actor) return;
        if (action.by === this.myId) this.waiting = false;

        if (action.type === "SURRENDER") {
            Rules.surrender(game, actor);
            return this._checkEnd();
        }
        if (action.type === "MULLIGAN") {
            Rules.mulligan(game, actor, action.cards || []);
            this.onUpdate(game);
            return;
        }
        // 手番でないプレイヤーの操作は無視（両者とも同じ判断になる）
        if (game.current !== actor) return;

        switch (action.type) {
            case "PLAY": {
                const card = actor.hand.find(c => c.uid === action.card);
                if (!card) return;
                Rules.playCard(game, actor, card, {
                    target: this._resolve(action.target),
                    targets: action.targets ? action.targets.map(r => this._resolve(r)).filter(Boolean) : undefined,
                    choice: this._resolve(action.choice),
                    sacrifices: action.sacrifices ? action.sacrifices.map(u => this._find(u)).filter(Boolean) : undefined,
                });
                break;
            }
            case "ATTACK": {
                const attacker = actor.field.find(c => c.uid === action.attacker);
                const defender = this._resolve(action.defender);
                if (attacker && defender) Rules.attack(game, attacker, defender);
                break;
            }
            case "EVOLVE": {
                const card = actor.field.find(c => c.uid === action.card);
                if (card) Rules.evolve(game, actor, card, { target: this._resolve(action.target) });
                break;
            }
            case "SUPER_EVOLVE": {
                const card = actor.field.find(c => c.uid === action.card);
                if (card) Rules.superEvolve(game, actor, card, { target: this._resolve(action.target) });
                break;
            }
            case "EXTRA_PP": {
                Rules.useExtraPp(game, actor);
                break;
            }
            case "ACTIVATE": {
                const card = actor.field.find(c => c.uid === action.card);
                if (card) Rules.activate(game, actor, card, { choice: this._resolve(action.choice) });
                break;
            }
            case "END_TURN": {
                // 送り手がターン終了ボタンを押した時点の盤面と比べる
                if (action.by !== this.myId && action.hash !== MatchClient.hashState(game)) {
                    this.onDesync({ seq: action.seq, expected: action.hash, actual: MatchClient.hashState(game) });
                }
                Rules.endTurn(game, actor);
                if (!this._checkEnd()) Rules.startTurn(game, game.getOpponent(actor));
                break;
            }
        }
        if (!this._checkEnd()) this.onUpdate(game);
    }

    _checkEnd() {
        const winner = Rules.winner(this.game);
        if (!winner || this.finished) return !!winner;
        this.finished = true;
        this.onUpdate(this.game);
        this.onGameOver(winner, this.game);
        return true;
    }

    // カード・リーダー・選択肢を送れる形に変換
    _ref(obj) {
        if (obj == null) return null;
        if (obj.isLeader) return { leader: obj.owner.id };
        if (obj.uid != null) return { uid: obj.uid };
        return { value: obj }; // 文字列などの選択肢（「破壊」「回復」、キーワード名など）
    }

    _resolve(ref) {
        if (ref == null) return undefined;
        if (ref.leader != null) {
            const p = this.game.players.find(pl => pl.id === ref.leader);
            return p ? p.leader : undefined;
        }
        if (ref.uid != null) return this._find(ref.uid);
        return ref.value;
    }

    _find(uid) {
        for (const p of this.game.players) {
            for (const zone of [p.field, p.hand, p.graveyard, p.deck]) {
                const c = zone.find(x => x.uid === uid);
                if (c) return c;
            }
        }
        return undefined;
    }

    // 盤面の要約から作るハッシュ（両者で一致するはずの情報だけを使う）
    static hashState(game) {
        const parts = game.players.map(p => [
            p.leader.hp, p.pp, p.maxPp, p.evolvePoints, p.superEvolvePoints, p.deck.length,
            p.hand.map(c => c.uid).join(","),
            p.field.map(c => `${c.uid}:${c.attack}:${c.hp}:${[...c.keywords].sort().join("")}`).join(","),
            p.graveyard.length,
        ].join("|"));
        const str = parts.join("#");
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0).toString(16);
    }
}
