package com.example.cardgame.repository;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.example.cardgame.model.User;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    List<User> findTop100ByOrderByMpDescWinsDesc();
    List<User> findTop100ByMpGreaterThanEqualOrderByMpDescWinsDesc(Integer mp);
    List<User> findByGuildId(Long guildId);
    long countByGuildId(Long guildId);
}