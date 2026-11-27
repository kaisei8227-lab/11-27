package com.example.cardgame.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.cardgame.model.RankGroup;
import com.example.cardgame.model.User;
import com.example.cardgame.repository.UserRepository;

/**
 * ユーザー情報・ゲーム進行の保存 API
 *   GET /api/users/{id}           … ユーザー情報（進行データ・ランク込み）
 *   PUT /api/users/{id}/progress  … 進行データ（localStorage の中身）を保存
 *   PUT /api/users/{id}/name      … ユーザー名の変更（重複チェックあり）
 */
@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*")
public class UserController {

    private static final int MAX_PROGRESS_LENGTH = 500_000; // 進行データの上限（約500KB）

    private final UserRepository userRepository;

    public UserController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable Long id) {
        return userRepository.findById(id)
                .<ResponseEntity<?>>map(u -> ResponseEntity.ok(Map.of(
                        "user", u,
                        "rank", RankGroup.getRankByMp(u.getMp()).getDisplayName())))
                .orElseGet(() -> notFound());
    }

    /**
     * 受け取る形: { "progress": "<localStorage の中身を JSON 文字列にしたもの>", "mp": 0, "wins": 0, "losses": 0 }
     * （progress は文字列のまま保存するので、Spring Boot 3 / 4 どちらの Jackson でも動く）
     */
    @PutMapping("/{id}/progress")
    public ResponseEntity<?> saveProgress(@PathVariable Long id, @RequestBody Map<String, Object> request) {
        User user = userRepository.findById(id).orElse(null);
        if (user == null) return notFound();

        Object progress = request.get("progress");
        if (!(progress instanceof String text) || text.isBlank() || !text.trim().startsWith("{")) {
            return ResponseEntity.badRequest().body(Map.of("message", "保存データの形式が正しくありません。"));
        }
        if (text.length() > MAX_PROGRESS_LENGTH) {
            return ResponseEntity.badRequest().body(Map.of("message", "保存データが大きすぎます。"));
        }

        // 一覧表示やランク判定に使う値は列にも入れておく
        user.setMp(Math.max(0, toInt(request.get("mp"), user.getMp())));
        user.setWins(Math.max(user.getWins(), toInt(request.get("wins"), 0)));
        user.setLosses(Math.max(user.getLosses(), toInt(request.get("losses"), 0)));
        Object title = request.get("title");
        if (title instanceof String t) user.setTitle(t.length() > 30 ? t.substring(0, 30) : t);
        user.setProgress(text);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "保存しました"));
    }

    private static int toInt(Object value, int fallback) {
        if (value instanceof Number n) return n.intValue();
        try {
            return value == null ? fallback : Integer.parseInt(value.toString());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    @PutMapping("/{id}/name")
    public ResponseEntity<?> rename(@PathVariable Long id, @RequestBody Map<String, String> request) {
        User user = userRepository.findById(id).orElse(null);
        if (user == null) return notFound();

        String name = request.get("username");
        name = name == null ? "" : name.trim();
        if (name.isEmpty() || name.length() > 20) {
            return ResponseEntity.badRequest().body(Map.of("message", "名前は1〜20文字で入力してください。"));
        }
        if (!name.equals(user.getUsername()) && userRepository.existsByUsername(name)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "その名前は既に使われています。"));
        }

        user.setUsername(name);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "名前を変更しました", "user", user));
    }

    private ResponseEntity<?> notFound() {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "ユーザーが見つかりません。"));
    }
}
