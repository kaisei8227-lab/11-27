package com.example.cardgame.model;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * ランクマッチ1試合分の情報。
 * サーバーはカード効果などの計算をせず、
 * seed の配布・操作の中継（番号付け）・勝敗の受け取りだけを行う。
 * 対戦の処理は両者のブラウザ（effects.js / cards.js）が同じ seed で動かす。
 */
public class MatchRoom {

    /** 対戦参加者。players の先頭が先攻。sleeve・title は相手に見せる見た目 */
    public record Entry(long id, String name, List<Integer> deck, String sleeve, String title) {}

    private final String roomId;
    private final int seed;
    private final List<Entry> players;
    private final AtomicLong nextSeq = new AtomicLong(0);
    /** 各プレイヤーが報告した勝者ID */
    private final Map<Long, Long> reportedWinner = new ConcurrentHashMap<>();
    private volatile boolean finished = false;

    public MatchRoom(String roomId, int seed, List<Entry> players) {
        this.roomId = roomId;
        this.seed = seed;
        this.players = players;
    }

    public boolean hasPlayer(long userId) {
        return players.stream().anyMatch(p -> p.id() == userId);
    }

    public Entry getPlayer(long userId) {
        return players.stream().filter(p -> p.id() == userId).findFirst().orElse(null);
    }

    /** 操作に付ける通し番号。両者のブラウザはこの順に適用する */
    public long nextSeq() {
        return nextSeq.getAndIncrement();
    }

    /**
     * 勝敗の報告を受け取る。両者の報告がそろって一致したら勝者IDを返す。
     * まだそろっていない・食い違っている場合は null。
     */
    public synchronized Long report(long reporterId, long winnerId) {
        if (finished) return null;
        reportedWinner.put(reporterId, winnerId);
        if (reportedWinner.size() < 2) return null;
        long first = reportedWinner.values().iterator().next();
        boolean agree = reportedWinner.values().stream().allMatch(w -> w == first);
        finished = true;
        return agree ? first : null;
    }

    public String getRoomId() { return roomId; }
    public int getSeed() { return seed; }
    public List<Entry> getPlayers() { return players; }
    public boolean isFinished() { return finished; }
}
