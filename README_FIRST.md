# card-game 上書き用セット（Render 対応）

## 1. 上書きする
この zip の中身を、エクスプローラーで card-game フォルダ（build.gradle がある場所）に
そのままコピーして「上書き」してください。フォルダの形はプロジェクトと同じです。

## 2. 消すファイル（使っていない・ビルドの邪魔になる）
- src/main/java/com/example/cardgame/controller/GameController.java
- src/main/java/com/example/cardgame/model/GameRoom.java
- src/main/java/com/example/cardgame/model/Player.java
- src/main/resources/static/app.js / index.html
- src/main/resources/static/css/style.css / gothic.css（あれば）
- src/main/resources/static/js/game.js / card-data.js（あれば）
- プロジェクト直下の NewFile.html

## 3. gradle/wrapper/gradle-wrapper.properties
Gradle 9.7.1（今のプロジェクトと同じ）を指定したもの。上書きして OK。
gradlew・gradlew.bat・gradle-wrapper.jar は今のものをそのまま使う（この zip には入っていない）。

## 3-2. build.gradle について
今の build.gradle（Spring Boot 4.1.1）をもとに、次の3つだけ足したものです。そのまま上書きして OK。
- runtimeOnly 'org.postgresql:postgresql'（Render のデータベース）
- implementation 'org.springframework.security:spring-security-crypto'（パスワードのハッシュ化）
- jar タスクを止める設定（Render で使う jar を1つにする）

## 4. Eclipse で確認
card-game を右クリック → Gradle → Gradle プロジェクトのリフレッシュ → 起動して
http://localhost:8080 でログインできれば OK。
※ ローカルのデータベースはプロジェクト直下の data/ フォルダに保存されます（GitHub には上がりません）。
※ 以前のデータベース（ユーザー）は引き継がれないので、新しく登録し直してください。

## 5. GitHub に上げる（card-game フォルダでコマンドプロンプト）
    git init
    git add .
    git commit -m "Render 対応"
    git branch -M main
    git remote add origin https://github.com/<ユーザー名>/card-game.git
    git push -u origin main
（すでにリポジトリがある場合は git add . → git commit → git push だけ）

## 6. Render
dashboard.render.com → New → Blueprint → card-game リポジトリ → Apply。
5〜10分後、Logs に Started CardGameApplication が出たら https://card-game-xxxx.onrender.com で遊べます。

## 無料プランの注意
- 15分アクセスがないと停止 → 次に開くと起動まで約1分
- 無料 PostgreSQL は作成から30日で期限切れ
