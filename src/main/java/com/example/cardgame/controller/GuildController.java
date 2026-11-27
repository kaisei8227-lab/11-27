package com.example.cardgame.controller;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.example.cardgame.model.Guild;
import com.example.cardgame.model.GuildMessage;
import com.example.cardgame.model.User;
import com.example.cardgame.repository.GuildMessageRepository;
import com.example.cardgame.repository.GuildRepository;
import com.example.cardgame.repository.UserRepository;

/**
 * ギルド API
 *   GET  /api/guilds                    … ギルド一覧（新しい順50件、人数・レベル付き）
 *   POST /api/guilds                    … 作成 { userId, name, description }（作った人がリーダーで加入）
 *   GET  /api/guilds/{id}               … 詳細（メンバー一覧・レベル）
 *   POST /api/guilds/{id}/join          … 加入 { userId }
 *   POST /api/guilds/{id}/leave         … 脱退 { userId }（最後の1人が抜けると解散）
 *   GET  /api/guilds/{id}/messages      … 掲示板（新しい順50件）
 *   POST /api/guilds/{id}/messages      … 書き込み { userId, text }（メンバーのみ）
 */
@RestController
@RequestMapping("/api/guilds")
public class GuildController {

    private static final int MAX_MEMBERS = 30;

    private final GuildRepository guildRepository;
    private final GuildMessageRepository messageRepository;
    private final UserRepository userRepository;

    public GuildController(GuildRepository guildRepository, GuildMessageRepository messageRepository,
            UserRepository userRepository) {
        this.guildRepository = guildRepository;
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
    }

    /** ギルドレベル: メンバーの合計勝利数20ごとに1上がる（最大10） */
    static int level(List<User> members) {
        int wins = members.stream().mapToInt(User::getWins).sum();
        return Math.min(10, 1 + wins / 20);
    }

    private Map<String, Object> summary(Guild g, List<User> members) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", g.getId());
        m.put("name", g.getName());
        m.put("description", g.getDescription() == null ? "" : g.getDescription());
        m.put("leaderId", g.getLeaderId());
        m.put("members", members.size());
        m.put("level", level(members));
        m.put("totalWins", members.stream().mapToInt(User::getWins).sum());
        return m;
    }

    @GetMapping
    public List<Map<String, Object>> list() {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Guild g : guildRepository.findTop50ByOrderByCreatedAtDesc()) {
            out.add(summary(g, userRepository.findByGuildId(g.getId())));
        }
        return out;
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> req) {
        User user = findUser(req.get("userId"));
        if (user == null) return error(HttpStatus.NOT_FOUND, "ユーザーが見つかりません。");
        if (user.getGuildId() != null) return error(HttpStatus.BAD_REQUEST, "すでにギルドに入っています。先に脱退してください。");
        String name = text(req.get("name"), 20);
        if (name.isEmpty()) return error(HttpStatus.BAD_REQUEST, "ギルド名を入力してください（20文字まで）。");
        if (guildRepository.existsByName(name)) return error(HttpStatus.CONFLICT, "そのギルド名は既に使われています。");

        Guild g = guildRepository.save(new Guild(name, text(req.get("description"), 100), user.getId()));
        user.setGuildId(g.getId());
        userRepository.save(user);
        return ResponseEntity.ok(summary(g, List.of(user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable Long id) {
        Guild g = guildRepository.findById(id).orElse(null);
        if (g == null) return error(HttpStatus.NOT_FOUND, "ギルドが見つかりません。");
        List<User> members = new ArrayList<>(userRepository.findByGuildId(id));
        members.sort(Comparator.comparingInt(User::getWins).reversed());
        Map<String, Object> m = summary(g, members);
        m.put("memberList", members.stream().map(u -> Map.of(
                "id", u.getId(), "username", u.getUsername(), "wins", u.getWins(),
                "mp", u.getMp(), "title", u.getTitle() == null ? "" : u.getTitle())).toList());
        return ResponseEntity.ok(m);
    }

    @PostMapping("/{id}/join")
    public ResponseEntity<?> join(@PathVariable Long id, @RequestBody Map<String, Object> req) {
        User user = findUser(req.get("userId"));
        Guild g = guildRepository.findById(id).orElse(null);
        if (user == null || g == null) return error(HttpStatus.NOT_FOUND, "ギルドまたはユーザーが見つかりません。");
        if (user.getGuildId() != null) return error(HttpStatus.BAD_REQUEST, "すでにギルドに入っています。先に脱退してください。");
        if (userRepository.countByGuildId(id) >= MAX_MEMBERS) return error(HttpStatus.BAD_REQUEST, "このギルドは満員です。");
        user.setGuildId(id);
        userRepository.save(user);
        return ResponseEntity.ok(Map.of("message", "「" + g.getName() + "」に加入しました"));
    }

    @PostMapping("/{id}/leave")
    @Transactional
    public ResponseEntity<?> leave(@PathVariable Long id, @RequestBody Map<String, Object> req) {
        User user = findUser(req.get("userId"));
        if (user == null || !id.equals(user.getGuildId())) return error(HttpStatus.BAD_REQUEST, "このギルドに入っていません。");
        user.setGuildId(null);
        userRepository.save(user);

        Guild g = guildRepository.findById(id).orElse(null);
        List<User> rest = userRepository.findByGuildId(id);
        if (g != null && rest.isEmpty()) {
            messageRepository.deleteByGuildId(id);
            guildRepository.delete(g);
        } else if (g != null && user.getId().equals(g.getLeaderId())) {
            g.setLeaderId(rest.get(0).getId()); // リーダーが抜けたら次のメンバーへ
            guildRepository.save(g);
        }
        return ResponseEntity.ok(Map.of("message", "ギルドを脱退しました"));
    }

    @GetMapping("/{id}/messages")
    public List<GuildMessage> messages(@PathVariable Long id) {
        return messageRepository.findTop50ByGuildIdOrderByCreatedAtDesc(id);
    }

    @PostMapping("/{id}/messages")
    public ResponseEntity<?> post(@PathVariable Long id, @RequestBody Map<String, Object> req) {
        User user = findUser(req.get("userId"));
        if (user == null || !id.equals(user.getGuildId())) return error(HttpStatus.FORBIDDEN, "メンバーだけが書き込めます。");
        String text = text(req.get("text"), 200);
        if (text.isEmpty()) return error(HttpStatus.BAD_REQUEST, "メッセージを入力してください。");
        return ResponseEntity.ok(messageRepository.save(new GuildMessage(id, user.getId(), user.getUsername(), text)));
    }

    private User findUser(Object id) {
        if (!(id instanceof Number n)) return null;
        return userRepository.findById(n.longValue()).orElse(null);
    }

    private static String text(Object v, int max) {
        if (!(v instanceof String s)) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    private static ResponseEntity<?> error(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(Map.of("message", message));
    }
}
