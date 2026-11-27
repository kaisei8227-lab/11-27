package com.example.cardgame.model;

/**
 * ランク表（static/js/rank_util.js の RANK_TABLE と同じ値にしてある）
 * 値を変えるときは両方を同じように直すこと。
 */
public enum RankGroup {
    BEGINNER_0("Beginner 0", 0, 199, "🟢"),
    BEGINNER_1("Beginner 1", 200, 499, "🟢"),
    BEGINNER_2("Beginner 2", 500, 999, "🟢"),
    BEGINNER_3("Beginner 3", 1000, 1999, "🟢"),

    D0("D0", 2000, 3499, "🟠"),
    D1("D1", 3500, 4999, "🟠"),
    D2("D2", 5000, 6999, "🟠"),
    D3("D3", 7000, 8999, "🟠"),

    C0("C0", 9000, 11499, "🔴"),
    C1("C1", 11500, 13999, "🔴"),
    C2("C2", 14000, 16999, "🔴"),
    C3("C3", 17000, 19999, "🔴"),

    B0("B0", 20000, 23999, "💎"),
    B1("B1", 24000, 27999, "💎"),
    B2("B2", 28000, 31999, "💎"),
    B3("B3", 32000, 37999, "💎"),

    A0("A0", 38000, 43499, "🟣"),
    A1("A1", 43500, 49399, "🟣"),
    A2("A2", 49400, 55999, "🟣"),
    A3("A3", 56000, 62999, "🟣"),

    AA0("AA0", 63000, 70999, "🔵"),
    AA1("AA1", 71000, 79999, "🔵"),
    AA2("AA2", 80000, 89999, "🔵"),
    AA3("AA3", 90000, 99999, "🔵"),

    MASTER("Master", 100000, 150000, "🏆"),
    GRAND_MASTER_1("Grand Master 1", 150001, 199999, "👑"),
    GRAND_MASTER_2("Grand Master 2", 200000, 249999, "👑"),
    GRAND_MASTER_3("Grand Master 3", 250000, Integer.MAX_VALUE, "👑");

    private final String displayName;
    private final int minMp;
    private final int maxMp;
    private final String icon;

    RankGroup(String displayName, int minMp, int maxMp, String icon) {
        this.displayName = displayName;
        this.minMp = minMp;
        this.maxMp = maxMp;
        this.icon = icon;
    }

    public String getDisplayName() { return displayName; }
    public int getMinMp() { return minMp; }
    public int getMaxMp() { return maxMp; }
    public String getIcon() { return icon; }

    /** MP からランクを取得する */
    public static RankGroup getRankByMp(int mp) {
        for (RankGroup rank : values()) {
            if (mp >= rank.minMp && mp <= rank.maxMp) return rank;
        }
        return mp < 0 ? BEGINNER_0 : GRAND_MASTER_3;
    }
}
