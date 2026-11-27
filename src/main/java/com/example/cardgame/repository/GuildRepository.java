package com.example.cardgame.repository;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.example.cardgame.model.Guild;

@Repository
public interface GuildRepository extends JpaRepository<Guild, Long> {
    boolean existsByName(String name);
    List<Guild> findTop50ByOrderByCreatedAtDesc();
}
