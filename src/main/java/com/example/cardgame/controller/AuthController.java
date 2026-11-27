package com.example.cardgame.controller;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.example.cardgame.model.User;
import com.example.cardgame.repository.UserRepository;

/**
 * ログイン・会員登録 API
 *   POST /api/auth/register   { username, password }                  新規登録（成功するとそのままログイン）
 *   POST /api/auth/login      { username, password }                  ログイン
 *   GET  /api/auth/check?username=...                                 ユーザー名が使えるか
 *   POST /api/auth/password   { userId, currentPassword, newPassword } パスワード変更
 */
@RestController
@RequestMapping("/api/auth")
@CrossOrigin(origins = "*")
public class AuthController {

    static final int NAME_MAX = 20;
    static final int PASSWORD_MIN = 4;
    static final int PASSWORD_MAX = 64;
    /** 同じユーザー名で続けて失敗できる回数と、ロックする時間 */
    private static final int MAX_FAILS = 5;
    private static final long LOCK_MS = 5 * 60 * 1000;

    private final UserRepository userRepository;
    // パスワードをハッシュ化する（同じパスワードでも毎回違う値になり、元に戻せない）
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    /** ユーザー名 → { 失敗回数, 最後に失敗した時刻 } */
    private final Map<String, long[]> failures = new ConcurrentHashMap<>();

    public AuthController(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody Map<String, String> request) {
        String username = trim(request.get("username"));
        String password = request.get("password");

        String nameError = validateName(username);
        if (nameError != null) return bad(nameError);
        String passError = validatePassword(password);
        if (passError != null) return bad(passError);
        if (userRepository.existsByUsername(username)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("message", "そのユーザー名は既に使われています。別の名前にしてください。"));
        }

        User savedUser = userRepository.save(new User(username, passwordEncoder.encode(password)));
        return ResponseEntity.ok(Map.of(
            "message", "ようこそ、" + username + " さん！",
            "user", savedUser // password は JSON に含まれない（User の @JsonProperty）
        ));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> request) {
        String username = trim(request.get("username"));
        String password = request.get("password");
        if (username.isEmpty() || password == null || password.isEmpty()) {
            return bad("ユーザー名とパスワードを入力してください。");
        }

        long wait = lockRemainingMs(username);
        if (wait > 0) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
                "message", "パスワードを" + MAX_FAILS + "回まちがえたため、あと" + Math.max(1, (wait + 59_999) / 60_000) + "分ほど待ってから試してください。"));
        }

        Optional<User> userOptional = userRepository.findByUsername(username);
        if (userOptional.isEmpty()) {
            recordFailure(username);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("message", "ユーザー名またはパスワードが正しくありません。", "hint", "まだ登録していない場合は「新規登録」タブから作れます。"));
        }
        if (!passwordMatches(userOptional.get(), password)) {
            int left = MAX_FAILS - recordFailure(username);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of(
                "message", "ユーザー名またはパスワードが正しくありません。",
                "hint", left > 0 ? "あと" + left + "回まちがえると5分間ログインできなくなります。" : ""));
        }

        failures.remove(username);
        return ResponseEntity.ok(Map.of("message", "ログインしました", "user", userOptional.get()));
    }

    @GetMapping("/check")
    public Map<String, Object> check(@RequestParam String username) {
        String name = trim(username);
        String error = validateName(name);
        if (error != null) return Map.of("available", false, "message", error);
        boolean available = !userRepository.existsByUsername(name);
        return Map.of("available", available, "message", available ? "使えます" : "既に使われています");
    }

    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@RequestBody Map<String, Object> request) {
        if (!(request.get("userId") instanceof Number id)) return bad("ログインし直してください。");
        User user = userRepository.findById(id.longValue()).orElse(null);
        if (user == null) return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("message", "ユーザーが見つかりません。"));

        String current = request.get("currentPassword") instanceof String s ? s : "";
        String next = request.get("newPassword") instanceof String s ? s : "";
        if (!passwordMatches(user, current)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("message", "今のパスワードが正しくありません。"));
        }
        String passError = validatePassword(next);
        if (passError != null) return bad(passError);
        if (current.equals(next)) return bad("今と同じパスワードです。");

        user.setPassword(passwordEncoder.encode(next));
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "パスワードを変更しました。"));
    }

    // ---------- チェック ----------
    static String validateName(String name) {
        if (name == null || name.isEmpty()) return "ユーザー名を入力してください。";
        if (name.length() > NAME_MAX) return "ユーザー名は" + NAME_MAX + "文字以内にしてください。";
        if (name.chars().anyMatch(Character::isISOControl)) return "ユーザー名に使えない文字が入っています。";
        return null;
    }

    static String validatePassword(String password) {
        if (password == null || password.isEmpty()) return "パスワードを入力してください。";
        if (password.length() < PASSWORD_MIN) return "パスワードは" + PASSWORD_MIN + "文字以上にしてください。";
        if (password.length() > PASSWORD_MAX) return "パスワードは" + PASSWORD_MAX + "文字以内にしてください。";
        if (!password.equals(password.strip())) return "パスワードの最初と最後に空白は使えません。";
        return null;
    }

    private long lockRemainingMs(String username) {
        long[] f = failures.get(username);
        if (f == null || f[0] < MAX_FAILS) return 0;
        long remain = LOCK_MS - (System.currentTimeMillis() - f[1]);
        if (remain <= 0) {
            failures.remove(username);
            return 0;
        }
        return remain;
    }

    /** 失敗を記録して、今の失敗回数を返す（前の失敗から5分以上たっていたら数え直す） */
    private int recordFailure(String username) {
        long now = System.currentTimeMillis();
        long[] f = failures.compute(username, (k, v) -> {
            if (v == null || now - v[1] > LOCK_MS) return new long[] { 1, now };
            return new long[] { v[0] + 1, now };
        });
        return (int) f[0];
    }

    /**
     * パスワードの照合。
     * 以前の平文で保存されたユーザーも、そのままログインでき、その時にハッシュ化して保存し直す。
     */
    private boolean passwordMatches(User user, String rawPassword) {
        String stored = user.getPassword();
        if (stored == null || rawPassword == null) return false;

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

    private static String trim(String s) {
        return s == null ? "" : s.strip();
    }

    private static ResponseEntity<?> bad(String message) {
        return ResponseEntity.badRequest().body(Map.of("message", message));
    }
}
