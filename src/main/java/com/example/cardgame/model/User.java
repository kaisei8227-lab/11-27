package com.example.cardgame.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String username;

    // ブラウザへ返す JSON には含めない（受け取りだけ許可）
    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    private String password; // BCrypt でハッシュ化した値を保存する

    private int wins = 0;   // 勝利数
    private int losses = 0; // 敗北数
    // 既存のデータベースに列を追加しても困らないよう Integer（null は 0 として扱う）
    private Integer mp = 0; // ランクのMP（ランキング表示などに使う）

    private Long guildId;       // 所属ギルド（なければ null）
    private String title;       // 装備中の称号（ランキング・パークに表示）

    // ゲームの進行（コイン・所持カード・デッキ・ミッションなど）を JSON 文字列のまま保存する。
    // ブラウザの localStorage と同じ形なので、どの端末でログインしても続きから遊べる。
    @Column(columnDefinition = "TEXT")
    private String progress;

    public User() {}

    public User(String username, String password) {
        this.username = username;
        this.password = password;
    }

    // --- ゲッター & セッター ---
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }

    public int getWins() { return wins; }
    public void setWins(int wins) { this.wins = wins; }

    public int getLosses() { return losses; }
    public void setLosses(int losses) { this.losses = losses; }

    public int getMp() { return mp == null ? 0 : mp; }
    public void setMp(int mp) { this.mp = mp; }

    public Long getGuildId() { return guildId; }
    public void setGuildId(Long guildId) { this.guildId = guildId; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getProgress() { return progress; }
    public void setProgress(String progress) { this.progress = progress; }
}
