// js/rank-match.js
// rank_match.html で、WebSocket（STOMP）と MatchClient をつなぐ部分
// 読み込み順: stomp.umd.min.js → effects.js → cards.js → match.js → rank-match.js
//
// <script src="https://cdn.jsdelivr.net/npm/@stomp/stompjs@7/bundles/stomp.umd.min.js"></script>
// WebSocketConfig で .withSockJS() を使っている場合は、SockJS も読み込む（自動でそちらを使う）
// <script src="https://cdn.jsdelivr.net/npm/sockjs-client@1/dist/sockjs.min.js"></script>

const RankMatch = {
    stomp: null,
    client: null,   // MatchClient
    roomSub: null,

    endpoint: "/ws", // WebSocketConfig の addEndpoint に合わせる

    // me: { id, name }（id はログイン時の user.id）、deck: [カードID...]（ランク40枚／2Pick30枚）
    // ui.mode: "rank" | "2pick"、ui.sleeve / ui.title: 相手に見せる見た目
    // ui: { onWaiting, onStart(client), onUpdate(game), onGameOver(winner, game, isWin), onDesync(), reveal(viewer, cards) }
    start(me, deck, ui) {
        if (typeof StompJs === "undefined") {
            // 通信ライブラリが読み込めなかった（オフラインなど）
            setTimeout(() => ui.onError && ui.onError("サーバーに接続できませんでした"), 0);
            return;
        }
        const protocol = location.protocol === "https:" ? "wss" : "ws";
        const options = { reconnectDelay: 0 };
        if (window.SockJS) options.webSocketFactory = () => new SockJS(this.endpoint);
        else options.brokerURL = `${protocol}://${location.host}${this.endpoint}`;
        this.stomp = new StompJs.Client(options);
        this.stomp.onStompError = (frame) => console.error("STOMP エラー", frame.headers.message);
        this.stomp.onWebSocketError = () => ui.onError && ui.onError("サーバーに接続できませんでした");

        this.stomp.onConnect = () => {
            // マッチ成立の通知を待つ
            this.stomp.subscribe(`/topic/match/${me.id}`, frame => {
                const msg = JSON.parse(frame.body);
                if (msg.type === "START") this._onStart(me, msg, ui);
            });
            this.stomp.publish({
                destination: "/app/match/join",
                // 名前はサーバーが DB から引く。mode ごとに別々の待ち列になる（rank / 2pick）
                body: JSON.stringify({ userId: me.id, deck, mode: ui.mode || "rank", sleeve: ui.sleeve || "", title: ui.title || "" }),
            });
            ui.onWaiting && ui.onWaiting();
        };
        this.stomp.activate();
    },

    cancel(me) {
        if (!this.stomp) return;
        this.stomp.publish({ destination: "/app/match/cancel", body: JSON.stringify({ userId: me.id }) });
        this.stomp.deactivate();
    },

    _onStart(me, msg, ui) {
        const roomId = msg.roomId;

        this.client = new MatchClient({
            seed: msg.seed,
            players: msg.players,
            myId: me.id,
            send: action => this.stomp.publish({
                destination: `/app/room/${roomId}/action`,
                body: JSON.stringify(action),
            }),
            onUpdate: game => ui.onUpdate && ui.onUpdate(game),
            onGameOver: (winner, game) => {
                // 両者が勝敗を報告し、一致したらサーバーが記録する
                this.stomp.publish({
                    destination: `/app/room/${roomId}/result`,
                    body: JSON.stringify({ by: me.id, winnerId: winner.id }),
                });
                ui.onGameOver && ui.onGameOver(winner, game, winner.id === me.id);
            },
            onDesync: info => {
                console.error("盤面のズレを検知", info);
                ui.onDesync && ui.onDesync(info);
            },
            reveal: ui.reveal,
        });

        // 操作を受け取ったら MatchClient に渡す（自分の操作もここで戻ってくる）
        this.roomSub = this.stomp.subscribe(`/topic/room/${roomId}`, frame => {
            this.client.receive(JSON.parse(frame.body));
        });

        ui.onStart && ui.onStart(this.client, msg);
        ui.onUpdate && ui.onUpdate(this.client.game);
    },
};

/*
===== battle.js の対戦画面をそのまま使う場合 =====
rank_match.html を battle.html と同じ中身にして、次の2点だけ変える
  1. <body data-mode="rank">（ソロ用のCPU戦が始まらなくなる）
  2. スクリプトを effects.js → cards.js → match.js → battle.js → rank-match.js の順に読み込む

RankMatch.start({ id: ログイン中のユーザーID, name: "介人" }, デッキのカードID配列, {
    onWaiting: () => BattleUI.banner("対戦相手を探しています…"),
    onStart: client => BattleUI.attach(client),
    onUpdate: () => BattleUI.render(),
    onGameOver: (winner, game, isWin) => BattleUI.showResult(isWin),
    onDesync: () => BattleUI.log("通信エラー：盤面がずれました"),
    reveal: (viewer, cards) => BattleUI.reveal(viewer, cards),
});

===== 画面を自作する場合の使い方の例 =====
RankMatch.start({ id: 1, name: "介人" }, myDeckIds, {
    onWaiting: () => showMessage("対戦相手を探しています…"),
    onStart: client => { window.match = client; },
    onUpdate: game => render(game),          // 盤面を描き直す
    onGameOver: (winner, game, isWin) => showResult(isWin),
    onDesync: () => showMessage("通信エラーが発生しました"),
    reveal: (viewer, cards) => showPeek(cards), // 「相手の手札を見る」効果の表示
});

// ボタン操作などから
match.play(card, { target });       // カードを出す
match.attack(attacker, defender);    // 攻撃（defender は相手カードか match.opponent.leader）
match.evolve(card, { target });      // 進化
match.endTurn();                     // ターン終了
match.canAct();                      // 今操作できるか（ボタンの有効・無効に使う）
*/
