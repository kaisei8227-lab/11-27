package com.example.cardgame.controller;

import java.util.List;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.cardgame.model.User;
import com.example.cardgame.repository.UserRepository;

/**
 * ランキング API
 *   GET /api/ranking?kind=all     … MP の多い順に上位100人
 *   GET /api/ranking?kind=master  … マスター（100,000MP 以上）だけ
 */
@RestController
public class RankingController {

    public static final int MASTER_MP = 100_000;

    private final UserRepository userRepository;

    public RankingController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/api/ranking")
    public List<Map<String, Object>> ranking(@RequestParam(defaultValue = "all") String kind) {
        List<User> users = "master".equals(kind)
                ? userRepository.findTop100ByMpGreaterThanEqualOrderByMpDescWinsDesc(MASTER_MP)
                : userRepository.findTop100ByOrderByMpDescWinsDesc();
        return users.stream().map(u -> Map.<String, Object>of(
                "id", u.getId(),
                "username", u.getUsername(),
                "mp", u.getMp(),
                "wins", u.getWins(),
                "losses", u.getLosses(),
                "title", u.getTitle() == null ? "" : u.getTitle())).toList();
    }
}
