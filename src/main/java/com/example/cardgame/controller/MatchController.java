package com.example.cardgame.controller;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.example.cardgame.model.MatchResult;
import com.example.cardgame.model.MatchRoom;
import com.example.cardgame.model.User;
import com.example.cardgame.repository.MatchResultRepository;
import com.example.cardgame.repository.UserRepository;
import com.example.cardgame.service.MatchService;

/**
 * ランクマッチの WebSocket（STOMP）窓口。
 * GameController（/join, /action）とは宛先が重ならないので共存できる。
 *
 * クライアント → サーバー（先頭の /app は WebSocketConfig の setApplicationDestinationPrefixes）
 *   /app/match/join            マッチング待ちに入る  { userId, deck: [カードID...], mode: "rank" | "2pick", sleeve, title }
 *   /app/match/cancel          待ちをやめる          { userId }
 *   /app/room/{roomId}/action  対戦中の操作          { by, type, ... }
 *   /app/room/{roomId}/result  勝敗の報告            { by, winnerId }
 *
 * サーバー → クライアント
 *   /topic/match/{userId}      マッチ成立（START）   { type: "START", roomId, seed, players }
 *   /topic/room/{roomId}       操作の配信            { seq, by, type, ... }
 */
@Controller
public class MatchController {

    /** モードごとのデッキ枚数（ランク40枚、2Pick30枚） */
    private static final Map<String, Integer> DECK_SIZE = Map.of("rank", 40, "2pick", 30);

    private final MatchService matchService;
    private final SimpMessagingTemplate messaging;
    private final UserRepository userRepository;
    private final MatchResultRepository matchResultRepository;

    public MatchController(MatchService matchService, SimpMessagingTemplate messaging,
            UserRepository userRepository, MatchResultRepository matchResultRepository) {
        this.matchService = matchService;
        this.messaging = messaging;
        this.userRepository = userRepository;
        this.matchResultRepository = matchResultRepository;
    }

    public record JoinRequest(long userId, List<Integer> deck, String mode, String sleeve, String title) {}
    public record CancelRequest(long userId) {}
    public record ResultReport(long by, long winnerId) {}

    @MessageMapping("/match/join")
    public void join(@Payload JoinRequest req) {
        // 登録されているユーザーか確認し、表示名は DB のユーザー名を使う
        Optional<User> user = userRepository.findById(req.userId());
        if (user.isEmpty()) return;
        String mode = req.mode() == null ? "rank" : req.mode();
        Integer size = DECK_SIZE.get(mode);
        if (size == null || req.deck() == null || req.deck().size() != size) return;

        MatchRoom.Entry entry = new MatchRoom.Entry(req.userId(), user.get().getUsername(), req.deck(),
                limit(req.sleeve(), 40), limit(req.title(), 30));
        MatchRoom room = matchService.join(mode, entry);
        if (room == null) return; // 相手待ち

        Map<String, Object> start = new HashMap<>();
        start.put("type", "START");
        start.put("roomId", room.getRoomId());
        start.put("seed", room.getSeed());
        start.put("players", room.getPlayers()); // 先頭が先攻
        start.put("mode", mode);
        for (MatchRoom.Entry p : room.getPlayers()) {
            send("/topic/match/" + p.id(), start);
        }
    }

    private static String limit(String s, int max) {
        if (s == null) return "";
        s = s.trim();
        return s.length() > max ? s.substring(0, max) : s;
    }

    @MessageMapping("/match/cancel")
    public void cancel(@Payload CancelRequest req) {
        matchService.cancel(req.userId());
    }

    /** 操作に番号を付けて両者に配るだけ。中身の計算はしない */
    @MessageMapping("/room/{roomId}/action")
    public void action(@DestinationVariable String roomId, @Payload Map<String, Object> action) {
        MatchRoom room = matchService.getRoom(roomId);
        if (room == null || room.isFinished()) return;
        Object by = action.get("by");
        if (!(by instanceof Number n) || !room.hasPlayer(n.longValue())) return;

        action.put("seq", room.nextSeq());
        send("/topic/room/" + roomId, action);
    }

    /** 両者の報告がそろって一致したら結果を保存する */
    @MessageMapping("/room/{roomId}/result")
    public void result(@DestinationVariable String roomId, @Payload ResultReport report) {
        MatchRoom room = matchService.getRoom(roomId);
        if (room == null || !room.hasPlayer(report.by())) return;

        Long winnerId = room.report(report.by(), report.winnerId());
        if (!room.isFinished()) return; // もう一方の報告待ち

        if (winnerId != null) {
            saveResult(room, winnerId);
        }
        // winnerId が null = 両者の報告が食い違った（盤面のズレ・不正の可能性）→ 記録しない
        matchService.closeRoom(roomId);
    }

    private void saveResult(MatchRoom room, long winnerId) {
        MatchRoom.Entry winner = room.getPlayer(winnerId);
        MatchRoom.Entry loser = room.getPlayers().stream().filter(p -> p.id() != winnerId).findFirst().orElse(null);
        if (winner == null || loser == null) return;

        // 対戦履歴（MatchResultRepository）に、両者それぞれの視点で1件ずつ残す
        String now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        matchResultRepository.save(new MatchResult(winner.name(), "WIN", loser.name(), now));
        matchResultRepository.save(new MatchResult(loser.name(), "LOSE", winner.name(), now));

        // DB の勝利数・敗北数を更新
        userRepository.findById(winner.id()).ifPresent(u -> {
            u.setWins(u.getWins() + 1);
            userRepository.save(u);
        });
        userRepository.findById(loser.id()).ifPresent(u -> {
            u.setLosses(u.getLosses() + 1);
            userRepository.save(u);
        });
    }

    /**
     * Spring 7 では convertAndSend(宛先, Map) が「宛先＋本文」と「本文＋ヘッダー」のどちらにも当てはまって
     * コンパイルエラーになるため、本文を Object として渡す
     */
    private void send(String destination, Object payload) {
        messaging.convertAndSend(destination, payload);
    }
}
