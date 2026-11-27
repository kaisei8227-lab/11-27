# Gothic Duel（ゴシック・デュエル）

ゴシックな世界観のオンライン対戦カードゲーム。Java（Spring Boot）＋ HTML / CSS / JavaScript。
8クラス・588枚のカード、ランクマッチ（対人戦）、2Pick、パズル、バトルパス、パーク（ロビー・チャット・ギルド）。

## 遊べること
| 画面 | 内容 |
|---|---|
| ランクマッチ `rank_match.html` | 対人戦（WebSocket）。MP・ランク（Beginner〜Grand Master）・グループ（直近10試合の勝率で昇格） |
| フリーマッチ `battle.html` | CPU戦（MPは変動しない）。AIアドバイスつき |
| ソロ `solo.html` | 5ステージを順に攻略 |
| 2Pick `twopick.html` | 2枚1組を15回選んで30枚デッキ → 7勝か2敗まで対戦（対人／CPU） |
| パズル `puzzle.html` | 決められた盤面で「このターン中に勝つ」問題 |
| バトルパス `battlepass.html` | 毎月のシーズン。Lv.50まで、報酬はコイン・称号・見た目 |
| パーク `park.html` | アバターで歩くロビー、チャット・エモート、ギルド（作成・加入・掲示板） |
| ショップ `shop.html` | コインでアバターの服・髪型・スリーブ・称号を買う（ガチャなし） |
| ランキング `ranking.html` | MP上位100人・マスター |
| デッキ編成・カード図鑑・プロフィール | 全カード最初から使用可能 |

### バトルのルール
- デッキ40枚（同名3枚まで、1クラス＋無所属）、リーダー体力30、手札5枚スタート、手札上限9枚、場は5体まで
- 進化：先攻4ターン目／後攻3ターン目から、2回（+2/+2・突進）
- **超進化**：先攻6ターン目／後攻5ターン目から、2回（+3/+3・突進、自分のターン中は無敵、能力で破壊されない、相手カードを倒すと相手リーダーに1ダメージ）。進化と超進化は合わせて1ターン1回
- **エクストラPP**：後攻だけ。5ターン目までに1回・6ターン目以降に1回、そのターンだけPP+1
- **クレスト**：リーダーに付いた効果をリーダーの横に表示
- マリガン、ターン制限90秒（対人戦）、山札切れで敗北、降参

## フォルダ構成
```
src/main/java/com/example/cardgame/
  controller/  AuthController（ログイン・登録）/ UserController（進行の保存・名前変更）
               MatchController（対戦の中継）/ LobbyController（パーク）/ GuildController / RankingController
  model/       User, Guild, GuildMessage, MatchRoom, RankGroup ...
  repository/  UserRepository, GuildRepository, GuildMessageRepository ...
  service/     MatchService（モード別のマッチング）, CardService
src/main/resources/
  static/      画面（HTML/CSS/JS）。js/effects.js がバトルのルール、js/cards.js がカードデータ
  data/cards.csv            カードの元データ
  application.properties    パソコン用（H2 データベース）
  application-prod.properties  Render 用（PostgreSQL）
src/test/java/.../tools/CardsJsGenerator.java   cards.csv → cards.js を作り直すツール
Dockerfile / render.yaml   Render で動かす設定
```

## パソコンで動かす（Eclipse）
1. プロジェクトを開き「Gradle → Gradle プロジェクトのリフレッシュ」
2. `CardGameApplication` を実行
3. http://localhost:8080 を開く（データはプロジェクト直下の `data/` に保存）

## GitHub → Render で公開する
1. GitHub に空のリポジトリを作る
2. このフォルダでコマンドプロンプトを開いて
   ```
   git init
   git add .
   git commit -m "Gothic Duel"
   git branch -M main
   git remote add origin https://github.com/<ユーザー名>/<リポジトリ名>.git
   git push -u origin main
   ```
   ※ GitHub のサイトの「Upload files」を使う場合は、`src` と `gradle` フォルダも必ずドラッグして上げる
3. https://dashboard.render.com → New → Blueprint → リポジトリを選ぶ → Apply
4. 5〜10分後、`https://card-game-xxxx.onrender.com` で遊べる。以後は push するたびに自動で更新

### 無料プランの注意
- 15分アクセスがないと停止し、次に開くと起動まで約1分
- 停止すると対戦中のルームとパークにいる人の情報は消える（ユーザー・進行・ギルドは DB に残る）
- 無料の PostgreSQL は作成から30日で期限切れ

## 仕組みのメモ
- 対人戦は「同じ seed の乱数で両者のブラウザが同じ処理を動かし、サーバーは操作を中継するだけ」。ターン終了ごとに盤面のハッシュを比べてズレを検出
- コイン・デッキ・バトルパスなどの進行はブラウザ（localStorage）に保存し、`js/sync.js` が自動でサーバー（`users.progress`）にも保存。ログイン時にサーバーから戻す
