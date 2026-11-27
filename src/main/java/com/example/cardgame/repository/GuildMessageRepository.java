package com.example.cardgame.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.example.cardgame.model.GuildMessage;

@Repository
public interface GuildMessageRepository extends JpaRepository<GuildMessage, Long> {
    List<GuildMessage> findTop50ByGuildIdOrderByCreatedAtDesc(Long guildId);
    void deleteByGuildId(Long guildId);
}
