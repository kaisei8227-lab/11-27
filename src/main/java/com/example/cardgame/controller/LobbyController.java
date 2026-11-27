package com.example.cardgame.controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.example.cardgame.repository.UserRepository;

/**
 * シャドバパーク風のロビー（WebSocket / STOMP）
 *
 * クライアント → サーバー
 *   /app/lobby/move   { userId, x, y, avatar: {...}, title }   入室・移動（20秒ごとの生存通知も兼ねる）
 *   /app/lobby/chat   { userId, text }                          チャット（100文字まで）
 *   /app/lobby/emote  { userId, emote }                         エモート
 *   /app/lobby/leave  { userId }                                退室
 *
 * サーバー → クライアント（/topic/lobby）
 *   { type: "STATE", users: [...] }  入室した人がいた時の全員の状態
 *   { type: "MOVE" | "CHAT" | "EMOTE" | "LEAVE", user / userId, ... }
 */
@Controller
public class LobbyController {

    private static final long TIMEOUT_MS = 60_000;          // 60秒通知がなければ退室扱い
    private static final List<String> EMOTES = List.of("👋", "😄", "😢", "😡", "⚔️", "✨", "👍", "❤️");

    private final SimpMessagingTemplate messaging;
    private final UserRepository userRepository;
    /** userId → { id, name, title, avatar, x, y, seen } */
    private final Map<Long, Map<String, Object>> present = new ConcurrentHashMap<>();

    public LobbyController(SimpMessagingTemplate messaging, UserRepository userRepository) {
        this.messaging = messaging;
        this.userRepository = userRepository;
    }

    @MessageMapping("/lobby/move")
    public void move(@Payload Map<String, Object> req) {
        Long id = userId(req);
        if (id == null) return;
        pruneOld();
        boolean isNew = !present.containsKey(id);
        Map<String, Object> u = present.computeIfAbsent(id, k -> new HashMap<>());
        u.put("id", id);
        userRepository.findById(id).ifPresent(user -> u.put("name", user.getUsername()));
        u.put("title", limit(req.get("title"), 30));
        if (req.get("avatar") instanceof Map<?, ?> avatar) u.put("avatar", avatar);
        u.put("x", clamp(req.get("x")));
        u.put("y", clamp(req.get("y")));
        u.put("seen", System.currentTimeMillis());

        if (isNew) {
            send("/topic/lobby", Map.of("type", "STATE", "users", snapshot()));
        } else {
            send("/topic/lobby", Map.of("type", "MOVE", "user", publicView(u)));
        }
    }

    @MessageMapping("/lobby/chat")
    public void chat(@Payload Map<String, Object> req) {
        Long id = userId(req);
        if (id == null || !present.containsKey(id)) return;
        String text = limit(req.get("text"), 100);
        if (text.isEmpty()) return;
        present.get(id).put("seen", System.currentTimeMillis());
        send("/topic/lobby", Map.of(
                "type", "CHAT", "userId", id, "name", present.get(id).getOrDefault("name", ""), "text", text));
    }

    @MessageMapping("/lobby/emote")
    public void emote(@Payload Map<String, Object> req) {
        Long id = userId(req);
        String emote = limit(req.get("emote"), 4);
        if (id == null || !present.containsKey(id) || !EMOTES.contains(emote)) return;
        send("/topic/lobby", Map.of("type", "EMOTE", "userId", id, "emote", emote));
    }

    @MessageMapping("/lobby/leave")
    public void leave(@Payload Map<String, Object> req) {
        Long id = userId(req);
        if (id == null || present.remove(id) == null) return;
        send("/topic/lobby", Map.of("type", "LEAVE", "userId", id));
    }

    private void pruneOld() {
        long now = System.currentTimeMillis();
        present.entrySet().removeIf(e -> {
            boolean old = now - ((Number) e.getValue().getOrDefault("seen", 0L)).longValue() > TIMEOUT_MS;
            if (old) send("/topic/lobby", Map.of("type", "LEAVE", "userId", e.getKey()));
            return old;
        });
    }

    private List<Map<String, Object>> snapshot() {
        List<Map<String, Object>> list = new ArrayList<>();
        present.values().forEach(u -> list.add(publicView(u)));
        return list;
    }

    private static Map<String, Object> publicView(Map<String, Object> u) {
        Map<String, Object> m = new HashMap<>(u);
        m.remove("seen");
        return m;
    }

    private Long userId(Map<String, Object> req) {
        if (!(req.get("userId") instanceof Number n)) return null;
        long id = n.longValue();
        return userRepository.existsById(id) ? id : null;
    }

    /** 座標は 0〜100（画面の割合） */
    private static double clamp(Object v) {
        double d = v instanceof Number n ? n.doubleValue() : 50;
        return Math.max(0, Math.min(100, d));
    }

    private static String limit(Object v, int max) {
        if (!(v instanceof String s)) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    /**
     * Spring 7 では convertAndSend(宛先, Map) が「宛先＋本文」と「本文＋ヘッダー」のどちらにも当てはまって
     * コンパイルエラーになるため、本文を Object として渡す
     */
    private void send(String destination, Object payload) {
        messaging.convertAndSend(destination, payload);
    }
}
