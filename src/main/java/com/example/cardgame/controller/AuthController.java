package com.example.cardgame.controller;

import java.util.Map;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.cardgame.model.User;
import com.example.cardgame.repository.UserRepository;

@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    private final UserRepository userRepository;
    // パスワードをハッシュ化する（同じパスワードでも毎回違う値になり、元に戻せない）
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /**
     * 新規ユーザー登録 API
     */
    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        // 入力チェック (nullおよび空文字判定)
        if (username == null || username.trim().isEmpty() || password == null || password.trim().isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("message", "ユーザー名とパスワードを入力してください。"));
        }

        // ユーザー名の重複チェック
        if (userRepository.existsByUsername(username.trim())) {
            return ResponseEntity.badRequest().body(Map.of("message", "そのユーザー名は既に使用されています。"));
        }

        // パスワードはハッシュ化して保存する
        User newUser = new User(username.trim(), passwordEncoder.encode(password));
        User savedUser = userRepository.save(newUser);

        return ResponseEntity.ok(Map.of(
            "message", "ユーザー登録が完了しました！",
            "user", savedUser // password は JSON に含まれない（User の @JsonProperty）
        ));
    }

    /**
     * ログイン API
     */
    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        String username = request.get("username");
        String password = request.get("password");

        if (username == null || password == null) {
            return ResponseEntity.badRequest().body(Map.of("message", "ユーザー名とパスワードを入力してください。"));
        }

        Optional<User> userOptional = userRepository.findByUsername(username.trim());
        if (userOptional.isEmpty() || !passwordMatches(userOptional.get(), password)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "ユーザー名またはパスワードが正しくありません。"));
        }

        return ResponseEntity.ok(Map.of(
            "message", "ログイン成功",
            "user", userOptional.get()
        ));
    }

    /**
     * パスワードの照合。
     * 以前の平文で保存されたユーザーも、そのままログインでき、その時にハッシュ化して保存し直す。
     */
    private boolean passwordMatches(User user, String rawPassword) {
        String stored = user.getPassword();
        if (stored == null) return false;

        if (stored.startsWith("$2")) { // BCrypt でハッシュ化済み
            return passwordEncoder.matches(rawPassword, stored);
        }
        if (stored.equals(rawPassword)) { // 平文のまま残っていた古いユーザー
            user.setPassword(passwordEncoder.encode(rawPassword));
            userRepository.save(user);
            return true;
        }
        return false;
    }
}
