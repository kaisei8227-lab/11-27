package com.example.cardgame.service;

import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

import com.example.cardgame.model.MatchRoom;

/**
 * ランクマッチ・2Pick のマッチング待ちとルームの管理。
 */
@Service
public class MatchService {

    private final SecureRandom random = new SecureRandom();
    private final Map<String, MatchRoom> rooms = new ConcurrentHashMap<>();
    /** モード（rank / 2pick）ごとの待ち */
    private final Map<String, MatchRoom.Entry> waiting = new ConcurrentHashMap<>();

    /**
     * マッチング待ちに入る。相手が見つかったらルームを作って返す。
     * 見つからなければ null（待ち状態になる）。
     */
    public synchronized MatchRoom join(String mode, MatchRoom.Entry entry) {
        // 同じユーザーが別のモードで待っていたら取り消す
        waiting.entrySet().removeIf(e -> e.getValue().id() == entry.id() && !e.getKey().equals(mode));
        MatchRoom.Entry other = waiting.get(mode);
        if (other == null || other.id() == entry.id()) {
            waiting.put(mode, entry);
            return null;
        }
        List<MatchRoom.Entry> players = new ArrayList<>(List.of(other, entry));
        Collections.shuffle(players, random); // 先攻・後攻をランダムに決める
        waiting.remove(mode);

        String roomId = UUID.randomUUID().toString();
        int seed = random.nextInt(Integer.MAX_VALUE - 1) + 1; // 1以上
        MatchRoom room = new MatchRoom(roomId, seed, players);
        rooms.put(roomId, room);
        return room;
    }

    public synchronized void cancel(long userId) {
        waiting.entrySet().removeIf(e -> e.getValue().id() == userId);
    }

    public MatchRoom getRoom(String roomId) {
        return rooms.get(roomId);
    }

    public void closeRoom(String roomId) {
        rooms.remove(roomId);
    }
}
