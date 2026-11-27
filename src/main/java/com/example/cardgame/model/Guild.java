package com.example.cardgame.model;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** ギルド（パークでプレイヤー同士が集まるグループ） */
@Entity
@Table(name = "guilds")
public class Guild {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false, length = 20)
    private String name;

    @Column(length = 100)
    private String description;

    private Long leaderId;
    private LocalDateTime createdAt = LocalDateTime.now();

    public Guild() {}

    public Guild(String name, String description, Long leaderId) {
        this.name = name;
        this.description = description;
        this.leaderId = leaderId;
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Long getLeaderId() { return leaderId; }
    public void setLeaderId(Long leaderId) { this.leaderId = leaderId; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
