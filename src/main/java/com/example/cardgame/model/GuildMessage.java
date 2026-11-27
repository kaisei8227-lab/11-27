package com.example.cardgame.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** ギルド掲示板の書き込み */
@Entity
@Table(name = "guild_messages")
public class GuildMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private Long guildId;
    private Long userId;
    private String username;

    @Column(length = 200)
    private String text;

    private LocalDateTime createdAt = LocalDateTime.now();

    public GuildMessage() {}

    public GuildMessage(Long guildId, Long userId, String username, String text) {
        this.guildId = guildId;
        this.userId = userId;
        this.username = username;
        this.text = text;
    }

    public Long getId() { return id; }
    public Long getGuildId() { return guildId; }
    public Long getUserId() { return userId; }
    public String getUsername() { return username; }
    public String getText() { return text; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
