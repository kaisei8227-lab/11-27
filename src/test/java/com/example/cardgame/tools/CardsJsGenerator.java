package com.example.cardgame.tools;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.BiFunction;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * スプレッドシート（CSV）から static/js/cards.js を生成する開発用ツール。
 * アプリ本体には含まれない（src/test/java に置く）。
 *
 * 使い方: Eclipse でこのファイルを右クリック →「実行」→「Java アプリケーション」
 *   引数なしなら src/main/resources/data/cards.csv を読み、
 *   src/main/resources/static/js/cards.js に書き出す。
 *   実行後、Eclipse でプロジェクトを選んで F5（更新）すると反映される。
 *
 * 効果テキストは決まった言い回しをパターンで読み取り、Fx の呼び出しに変換する。
 * 読み取れなかったカードは implemented: false にして、コンソールに一覧を出す。
 * エースカードと特殊なカードは下の OVERRIDES に手書きの JS を書く。
 */
public class CardsJsGenerator {

    static final String DEFAULT_CSV = "src/main/resources/data/cards.csv";
    static final String DEFAULT_OUT = "src/main/resources/static/js/cards.js";

    static final Map<String, String> CLASS_KEY = Map.of(
            "貴族", "NOBLE", "怪物", "MONSTER", "幽霊", "GHOST", "魔女", "WITCH",
            "人形", "PUPPET", "狩人", "HUNTER", "海賊", "PIRATE", "無所属", "NEUTRAL");

    static final List<String> CLASS_ORDER = List.of("貴族", "怪物", "幽霊", "無所属", "魔女", "人形", "狩人", "海賊");

    static final Map<String, String> KEYWORDS = Map.of(
            "守護", "WARD", "疾走", "STORM", "突進", "RUSH", "ドレイン", "DRAIN", "シールド", "SHIELD");

    // ===== きっかけ（いつ発動するか） =====
    record Trigger(Pattern pattern, String hook) {}

    static final List<Trigger> TRIGGERS = List.of(
            new Trigger(Pattern.compile("^場に出た時、"), "onPlay"),
            new Trigger(Pattern.compile("^破壊された時、"), "onDestroy"),
            new Trigger(Pattern.compile("^ターン終了時、"), "onTurnEnd"),
            new Trigger(Pattern.compile("^ターン開始時、"), "onTurnStart"),
            new Trigger(Pattern.compile("^(?:攻撃に成功した時|攻撃成功時|攻撃に成功するたび)、"), "onAttackSuccess"),
            new Trigger(Pattern.compile("^このカードが攻撃に成功するたび、"), "onAttackSuccess"),
            new Trigger(Pattern.compile("^このカードが攻撃するたび、"), "onAttack"),
            new Trigger(Pattern.compile("^(?:このカードが)?相手カードを撃破(?:した時|するたび)、"), "onKill"),
            new Trigger(Pattern.compile("^相手カード1体を撃破した後、"), "onKill"),
            new Trigger(Pattern.compile("^相手が場にカードを出した時、"), "onEnemyPlay"),
            new Trigger(Pattern.compile("^攻撃が成功した時、"), "onAttackSuccess"),
            new Trigger(Pattern.compile("^相手から攻撃を受けた時、"), "onAttacked"),
            new Trigger(Pattern.compile("^自分の場の傀儡トークンが破壊されるたび、"), "onAllyDestroyed:puppet"),
            new Trigger(Pattern.compile("^自分の場のカードを1体生け贄にするたび、"), "onAllySacrificed"));

    // ===== 対象の記録 =====
    // onPlay の最初の対象だけプレイヤーが選び、それ以外はランダム
    static class Targets {
        final String hook;
        String kind = null;

        Targets(String hook) {
            this.hook = hook;
        }

        String claim(String k, String randomExpr) {
            if (hook.equals("onPlay") && (kind == null || kind.equals(k))) {
                kind = k;
                return "(target || " + randomExpr + ")";
            }
            return randomExpr;
        }

        String ally() { return claim("ALLY_FOLLOWER", "Fx.randomOf(player.field)"); }
        String enemy() { return claim("ENEMY_FOLLOWER", "Fx.randomOf(opponent.field)"); }
        String enemyAny() { return claim("ENEMY_ANY", "opponent.leader"); }
    }

    static int n(Matcher m, int i) {
        String v = m.group(i);
        return v != null ? Integer.parseInt(v) : 1;
    }

    static int n(Matcher m) {
        return n(m, 1);
    }

    static int g0(Matcher m, int i) {
        String v = m.group(i);
        return v != null ? Integer.parseInt(v) : 0;
    }

    // ===== 効果テキスト → JS の変換ルール =====
    // 上から順に適用するので、より具体的な言い回しを先に置く
    record Rule(Pattern pattern, BiFunction<Matcher, Targets, String> fn) {}

    static final List<Rule> RULES = new ArrayList<>();

    static void rule(String regex, BiFunction<Matcher, Targets, String> fn) {
        RULES.add(new Rule(Pattern.compile(regex), fn));
    }

    static {
        rule("自分の手札の魔法カードの数だけ相手リーダーに1ダメージずつ与える",
                (m, T) -> "Fx.damageLeader(opponent, player.hand.filter(c => c.type === TYPE.SPELL).length);");
        rule("自分の墓地のカードを1枚選び、その攻撃力・体力の半分(?:（切り上げ）)?を持つ「亡霊」トークンを出す",
                (m, T) -> "{ const c = Fx.randomOf(player.graveyard.filter(c => c.type === TYPE.FOLLOWER)); "
                        + "if (c) Fx.summonToken(player, \"亡霊\", Math.ceil(c.attack / 2), Math.ceil(c.maxHp / 2), { class: self.class }); }");

        // --- ダメージ ---
        rule("相手カード1体、または相手リーダーに(\\d+)ダメージ",
                (m, T) -> "Fx.damageAny(" + T.enemyAny() + ", " + n(m) + ", game);");
        rule("相手カード1体に(\\d+)ダメージを与え、その後攻撃力-(\\d+)",
                (m, T) -> "{ const t = " + T.enemy() + "; Fx.damage(t, " + n(m) + ", game); Fx.buff(t, -" + n(m, 2) + ", 0); }");
        rule("相手カード1体に(\\d+)ダメージ（怪物クラスには\\+(\\d+)追加）",
                (m, T) -> "{ const t = " + T.enemy() + "; if (t) Fx.damage(t, " + n(m) + " + (t.class === CLASS.MONSTER ? " + n(m, 2) + " : 0), game); }");
        rule("相手カード1体に(\\d+)ダメージ、自分のリーダーに(\\d+)ダメージ",
                (m, T) -> "Fx.damage(" + T.enemy() + ", " + n(m) + ", game); Fx.damageLeader(player, " + n(m, 2) + ");");
        rule("相手カード1体に(\\d+)ダメージ、相手リーダーに(\\d+)ダメージ",
                (m, T) -> "Fx.damage(" + T.enemy() + ", " + n(m) + ", game); Fx.damageLeader(opponent, " + n(m, 2) + ");");
        rule("相手の場で最もHPが低いカードに(\\d+)ダメージ",
                (m, T) -> "Fx.damage([...opponent.field].sort((a, b) => a.hp - b.hp)[0], " + n(m) + ", game);");
        rule("相手の場で最もHPが低いカードを破壊",
                (m, T) -> "Fx.destroy([...opponent.field].sort((a, b) => a.hp - b.hp)[0], game);");
        rule("相手カード1体に(\\d+)ダメージ(?:を与える|を与え)?",
                (m, T) -> "Fx.damage(" + T.enemy() + ", " + n(m) + ", game);");
        rule("相手(?:の場の)?カード全体に(\\d+)ダメージ(?:、自分の場のカード全体は対象外)?",
                (m, T) -> "Fx.damageAll(opponent, " + n(m) + ", game);");
        rule("相手リーダーに(\\d+)ダメージ(?:追加|を与え(?:る)?)?",
                (m, T) -> "Fx.damageLeader(opponent, " + n(m) + ");");
        rule("自分のリーダーに(\\d+)ダメージ(?:を与える|を与え|与える|与え)?",
                (m, T) -> "Fx.damageLeader(player, " + n(m) + ");");
        rule("そのカードに(\\d+)ダメージ",
                (m, T) -> "Fx.damage(played, " + n(m) + ", game);");
        rule("そのカードの体力-(\\d+)",
                (m, T) -> "Fx.reduceHp(played, " + n(m) + ", game);");
        rule("そのカードの攻撃力-(\\d+)",
                (m, T) -> "Fx.buff(played, -" + n(m) + ", 0);");
        rule("攻撃した相手カードに(\\d+)ダメージ跳ね返す",
                (m, T) -> "Fx.damage(attacker, " + n(m) + ", game);");
        rule("相手カード1体に追加で(\\d+)ダメージ",
                (m, T) -> "Fx.damage(Fx.randomOf(opponent.field), " + n(m) + ", game);");

        // --- 回復 ---
        rule("自分の場のカードの数だけ自分のリーダーのHPを回復(?:する)?",
                (m, T) -> "Fx.healLeader(player, player.field.length);");
        rule("与えたダメージの半分を自分のリーダーが回復",
                (m, T) -> "Fx.healLeader(player, Math.floor(dealt / 2));");
        rule("自分のリーダーのHPを(\\d+)回復(?:する|し)?",
                (m, T) -> "Fx.healLeader(player, " + n(m) + ");");
        rule("自分の場のカード1体のHPを(\\d+)回復",
                (m, T) -> "Fx.healCard(" + T.ally() + ", " + n(m) + ");");
        rule("自分の場のカード全体のHPを(\\d+)回復",
                (m, T) -> "Fx.healAll(player, " + n(m) + ");");

        // --- 強化 ---
        rule("自分の場のカード1体の攻撃力・体力\\+(\\d+)ずつ",
                (m, T) -> "Fx.buff(" + T.ally() + ", " + n(m) + ", " + n(m) + ");");
        rule("自分の場のカード1体を対象に、その攻撃力を\\+(\\d+)(?:する)?",
                (m, T) -> "Fx.buff(" + T.ally() + ", " + n(m) + ", 0);");
        rule("自分の場のカード1体の攻撃力\\+(\\d+)",
                (m, T) -> "Fx.buff(" + T.ally() + ", " + n(m) + ", 0);");
        rule("自分の場のカード1体の体力\\+(\\d+)",
                (m, T) -> "Fx.buff(" + T.ally() + ", 0, " + n(m) + ");");
        rule("自分の場のカード1体の攻撃力とHPを入れ替える",
                (m, T) -> "Fx.swapStats(" + T.ally() + ", game);");
        rule("自分の場のカード全体の攻撃力\\+(\\d+)（1ターンのみ）",
                (m, T) -> "player.field.forEach(c => Fx.tempAttack(c, " + n(m) + ", 1));");
        rule("自分の場のカード全体の攻撃力\\+(\\d+)[、・](?:体力|HP)\\+(\\d+)(?:する)?",
                (m, T) -> "Fx.buffAll(player, " + n(m) + ", " + n(m, 2) + ");");
        rule("自分の場のカード全体の攻撃力・体力\\+(\\d+)",
                (m, T) -> "Fx.buffAll(player, " + n(m) + ", " + n(m) + ");");
        rule("自分の場のカード全体の攻撃力\\+(\\d+)",
                (m, T) -> "Fx.buffAll(player, " + n(m) + ", 0);");
        rule("自分の場のカード全体の(?:体力|HP)\\+(\\d+)",
                (m, T) -> "Fx.buffAll(player, 0, " + n(m) + ");");
        rule("自分の場の守護カード以外のカード全体の体力\\+(\\d+)",
                (m, T) -> "player.field.filter(c => !c.keywords.has(KEYWORD.WARD)).forEach(c => Fx.buff(c, 0, " + n(m) + "));");
        rule("自分の場の(?:他の)?守護カード(?:全体)?の体力\\+(\\d+)",
                (m, T) -> "Fx.others(player, self).filter(c => c.keywords.has(KEYWORD.WARD)).forEach(c => Fx.buff(c, 0, " + n(m) + "));");

        // --- 傀儡 ---
        rule("攻撃力(\\d+)・体力(\\d+)の「傀儡」トークンを(\\d+)体出す",
                (m, T) -> "Fx.summonPuppets(player, " + n(m, 3) + ", " + n(m) + ", " + n(m, 2) + ");");
        rule("傀儡トークンを(\\d+)体出(?:す|し)",
                (m, T) -> "Fx.summonPuppets(player, " + n(m) + ");");
        rule("自分の場の傀儡トークン1体の(?:体力|HP)\\+(\\d+)",
                (m, T) -> "Fx.buff(Fx.randomOf(Fx.puppets(player)), 0, " + n(m) + ");");
        rule("自分の場の傀儡トークン1体の攻撃力\\+(\\d+)",
                (m, T) -> "Fx.buff(Fx.randomOf(Fx.puppets(player)), " + n(m) + ", 0);");
        rule("自分の場の(?:傀儡|人形)トークン全体の攻撃力\\+(\\d+)(?:される)?",
                (m, T) -> "Fx.puppets(player).forEach(c => Fx.buff(c, " + n(m) + ", 0));");
        rule("自分の場の傀儡トークン全体(?:の|を)(?:体力|HP)\\+(\\d+)(?:する)?",
                (m, T) -> "Fx.puppets(player).forEach(c => Fx.buff(c, 0, " + n(m) + "));");
        rule("自分の場の傀儡トークン1体を生け贄にして(?:攻撃力\\+(\\d+)|体力\\+(\\d+))",
                (m, T) -> "{ const p = Fx.randomOf(Fx.puppets(player)); if (p) { Fx.sacrifice(player, [p], game); "
                        + "Fx.buff(self, " + g0(m, 1) + ", " + g0(m, 2) + "); } }");
        rule("自分の場の傀儡トークン1体を生け贄にすると体力\\+(\\d+)される",
                (m, T) -> "{ const p = Fx.randomOf(Fx.puppets(player)); if (p) { Fx.sacrifice(player, [p], game); "
                        + "Fx.buff(self, 0, " + n(m) + "); } }");
        rule("自分の場の傀儡トークンを全て生け贄にし、その数×(\\d+)ダメージを相手に与える",
                (m, T) -> "{ const ps = Fx.puppets(player); Fx.sacrifice(player, ps, game); "
                        + "Fx.damageAny(" + T.enemyAny() + ", ps.length * " + n(m) + ", game); }");
        rule("自分の場の傀儡トークンを2体生け贄にして相手カード1体を破壊する",
                (m, T) -> "{ const ps = Fx.puppets(player).slice(0, 2); if (ps.length === 2) { "
                        + "Fx.sacrifice(player, ps, game); Fx.destroy(" + T.enemy() + ", game); } }");
        rule("自分の場の(?:人形|傀儡)トークンの数だけ攻撃力\\+1",
                (m, T) -> "Fx.buff(self, Fx.puppets(player).length, 0);");
        rule("自分の場の傀儡トークンの数だけカードをドローする（最大(\\d+)枚）",
                (m, T) -> "Fx.draw(player, Math.min(" + n(m) + ", Fx.puppets(player).length));");
        rule("自分の場の傀儡トークン全体を攻撃力(\\d+)・体力(\\d+)の「戦う人形」に変える",
                (m, T) -> "Fx.puppets(player).forEach(c => { c.name = \"戦う人形\"; c.attack = " + n(m) + "; "
                        + "c.hp = c.maxHp = " + n(m, 2) + "; });");
        rule("自分の墓地の傀儡トークンを(\\d+)体、場に呼び戻す",
                (m, T) -> "player.graveyard.filter(c => Fx.isPuppet(c)).slice(0, " + n(m) + ").forEach(c => Fx.revive(player, c, null, game));");

        // --- トークン ---
        rule("攻撃力(\\d+)・体力(\\d+)の「(.+?)」(?:トークン)?を(\\d+)体出す",
                (m, T) -> "for (let i = 0; i < " + n(m, 4) + "; i++) Fx.summonToken(player, " + jsStr(m.group(3)) + ", "
                        + n(m) + ", " + n(m, 2) + ", { class: self.class, puppet: " + m.group(3).contains("人形") + " });");
        rule("「幽霊船員」トークンを(\\d+)体出す",
                (m, T) -> "for (let i = 0; i < " + n(m) + "; i++) Fx.summonToken(player, \"幽霊船員\", 1, 1, { class: CLASS.PIRATE });");
        rule("同じ「ぜんまい人形」トークンをもう1体出す",
                (m, T) -> "Fx.summonToken(player, \"ぜんまい人形\", 1, 1, { class: CLASS.PUPPET, puppet: true });");

        // --- 妨害 ---
        rule("相手(?:の場の)?カード全体を(\\d+)ターン(?:の間)?、?行動不能にする",
                (m, T) -> "Fx.stunAll(opponent, " + n(m) + ");");
        rule("相手カード1体を(\\d+)ターン(?:の間)?、?行動不能にする",
                (m, T) -> "Fx.stun(" + T.enemy() + ", " + n(m) + ");");
        rule("相手カード1体を(\\d+)ターン(?:の間)?、?攻撃力(?:を)?0にする",
                (m, T) -> "Fx.setAttackZero(" + T.enemy() + ", " + n(m) + ");");
        rule("相手カード1体を(\\d+)ターンの間、?攻撃力を半分にする",
                (m, T) -> "Fx.halveAttack(" + T.enemy() + ", " + n(m) + ");");
        rule("相手カード1体を(\\d+)ターン(?:の間)?、?攻撃力-(\\d+)(?:にする)?",
                (m, T) -> "Fx.tempAttack(" + T.enemy() + ", -" + n(m, 2) + ", " + n(m) + ");");
        rule("相手カード1体の攻撃力-(\\d+)（(\\d+)ターン）",
                (m, T) -> "Fx.tempAttack(" + T.enemy() + ", -" + n(m) + ", " + n(m, 2) + ");");
        rule("相手カード1体の攻撃力とスキル効果を(\\d+)ターン無効化する",
                (m, T) -> "{ const t = " + T.enemy() + "; Fx.setAttackZero(t, " + n(m) + "); Fx.silence(t, " + n(m) + "); }");
        rule("相手カード1体の効果を(\\d+)ターン無効化する",
                (m, T) -> "Fx.silence(" + T.enemy() + ", " + n(m) + ");");
        rule("相手(?:の場の)?カード1体の攻撃力を1奪い、自分のこのカードに加える",
                (m, T) -> "{ const t = Fx.randomOf(opponent.field); if (t && t.attack > 0) { Fx.buff(t, -1, 0); Fx.buff(self, 1, 0); } }");
        rule("相手(?:の場の)?カード1体の攻撃力を1奪う",
                (m, T) -> "{ const t = Fx.randomOf(opponent.field); if (t && t.attack > 0) { Fx.buff(t, -1, 0); Fx.buff(self, 1, 0); } }");
        rule("相手カード1体の攻撃力-(\\d+)",
                (m, T) -> "Fx.buff(" + T.enemy() + ", -" + n(m) + ", 0);");
        rule("相手(?:の場の)?カード全体の攻撃力-(\\d+)（(\\d+)ターン）",
                (m, T) -> "opponent.field.forEach(c => Fx.tempAttack(c, -" + n(m) + ", " + n(m, 2) + "));");
        rule("相手の場のカード全体を(\\d+)ターンの間攻撃力-(\\d+)(?:にする)?",
                (m, T) -> "opponent.field.forEach(c => Fx.tempAttack(c, -" + n(m, 2) + ", " + n(m) + "));");
        rule("相手(?:の場の)?カード全体の攻撃力を?-(\\d+)(?:する)?",
                (m, T) -> "opponent.field.forEach(c => Fx.buff(c, -" + n(m) + ", 0));");
        rule("相手カード1体に(?:「次に受けるダメージ\\+(\\d+)」の)?呪いを付与(?:（次に受けるダメージ\\+(\\d+)）)?",
                (m, T) -> "Fx.curse(" + T.enemy() + ", "
                        + (m.group(1) != null ? m.group(1) : m.group(2) != null ? m.group(2) : "1") + ");");
        rule("相手カード1体を眠らせる(?:（1ターン攻撃不可）)?",
                (m, T) -> "Fx.stun(" + T.enemy() + ", 1);");
        rule("相手カード1体を次ターン攻撃不可にする",
                (m, T) -> "Fx.stun(" + T.enemy() + ", 1);");
        rule("相手カード1体の攻撃力とHPを(?:完全に)?入れ替える",
                (m, T) -> "Fx.swapStats(" + T.enemy() + ", game);");
        rule("相手カード1体を破壊する（攻撃力(\\d+)以下限定）",
                (m, T) -> "{ const t = " + T.enemy() + "; if (t && t.attack <= " + n(m) + ") Fx.destroy(t, game); }");
        rule("守護を持つ相手カード1体を選んで破壊できる",
                (m, T) -> "{ const t = " + T.enemy() + "; if (t && t.keywords.has(KEYWORD.WARD)) Fx.destroy(t, game); }");
        rule("相手の場のカード1体を破壊し、その攻撃力分自分のリーダーのHPを回復する",
                (m, T) -> "{ const t = " + T.enemy() + "; if (t) { Fx.healLeader(player, t.attack); Fx.destroy(t, game); } }");
        rule("相手(?:の場の)?カード1体を破壊(?:する|し)",
                (m, T) -> "Fx.destroy(" + T.enemy() + ", game);");
        rule("相手カード1体をランダムに手札へ戻す",
                (m, T) -> "Fx.returnToHand(Fx.randomOf(opponent.field), game);");
        rule("相手(?:の場の)?カード1体を(?:自分の場に)?1ターンだけ奪い取る",
                (m, T) -> "Fx.takeControl(" + T.enemy() + ", game, player, 1);");
        rule("相手カード1体を1ターンの間「傀儡」として支配する",
                (m, T) -> "Fx.takeControl(" + T.enemy() + ", game, player, 1);");
        rule("相手カード1体を「傀儡」化し、攻撃力とHPを1にする",
                (m, T) -> "{ const t = " + T.enemy() + "; if (t) { t.attack = 1; t.hp = t.maxHp = 1; } }");

        // --- ドロー・手札・情報 ---
        rule("(?:自分の)?手札を1枚捨てて(?:、)?1枚ドローする",
                (m, T) -> "Fx.discardRandom(player, 1); Fx.draw(player, 1);");
        rule("カードを1枚ドローする代わりに手札を1枚捨てる",
                (m, T) -> "Fx.draw(player, 1); Fx.discardRandom(player, 1);");
        rule("手札の魔法カードを全て手札に加えたまま、カードを(\\d+)枚ドローする",
                (m, T) -> "Fx.draw(player, " + n(m) + ");");
        rule("(?:追加で)?カードを(\\d+)枚ドロー(?:する)?",
                (m, T) -> "Fx.draw(player, " + n(m) + ");");
        rule("魔法カードを1枚多く引ける",
                (m, T) -> "Fx.addSpellFromDeck(player, 1);");
        rule("カードを1枚多く引ける",
                (m, T) -> "Fx.draw(player, 1);");
        rule("魔法カードを(\\d+)枚手札に加える",
                (m, T) -> "Fx.addSpellFromDeck(player, " + n(m) + ");");
        rule("自分の墓地の魔法カードを1枚手札に戻す",
                (m, T) -> "Fx.returnFromGraveyard(player, Fx.randomOf(player.graveyard.filter(c => c.type === TYPE.SPELL)));");
        rule("自分の墓地のカード1体をランダムに手札へ戻す",
                (m, T) -> "Fx.returnFromGraveyard(player, Fx.randomOf(player.graveyard.filter(c => !c.isToken)));");
        rule("自分の墓地のカードを1枚見て手札に戻す",
                (m, T) -> "Fx.returnFromGraveyard(player, Fx.randomOf(player.graveyard.filter(c => !c.isToken)));");
        rule("自分の墓地から体力の一番低いカードを1体復活させる",
                (m, T) -> "Fx.revive(player, player.graveyard.filter(c => c.type === TYPE.FOLLOWER)"
                        + ".sort((a, b) => a.maxHp - b.maxHp)[0], null, game);");
        rule("自分の墓地からカードを1枚選び、体力半分(?:（切り上げ）)?で場に出す",
                (m, T) -> "{ const c = Fx.randomOf(player.graveyard.filter(c => c.type === TYPE.FOLLOWER)); "
                        + "if (c) Fx.revive(player, c, Math.ceil(c.maxHp / 2), game); }");
        rule("自分の手札を1枚捨てて、相手の手札を1枚ランダムに見る",
                (m, T) -> "Fx.discardRandom(player, 1); Fx.peekHand(game, player, opponent, 1);");
        rule("相手の手札を見てランダムに1枚捨てさせる",
                (m, T) -> "Fx.peekHand(game, player, opponent, \"all\"); Fx.discardRandom(opponent, 1);");
        rule("相手の手札を全て見る",
                (m, T) -> "Fx.peekHand(game, player, opponent, \"all\");");
        rule("相手の手札を(\\d+)枚(?:ランダムに)?見る",
                (m, T) -> "Fx.peekHand(game, player, opponent, " + n(m) + ");");
        rule("自分の山札の一番上を確認し、好きな順番に並べ替える（(\\d+)枚）",
                (m, T) -> "Fx.peekDeck(game, player, " + n(m) + ");");
        rule("山札を1枚見て並べ替える",
                (m, T) -> "Fx.peekDeck(game, player, 1);");
        rule("山札の一番上を確認(?:する|できる)?",
                (m, T) -> "Fx.peekDeck(game, player, 1);");
        rule("山札から1枚を見て手札に加える",
                (m, T) -> "Fx.draw(player, 1);");
        rule("相手の場のカード1体の情報を見る",
                (m, T) -> "Fx.peekCard(game, player, Fx.randomOf(opponent.field));");
        rule("相手の場のカードをランダムに1体選び、その攻撃力と体力を確認する",
                (m, T) -> "Fx.peekCard(game, player, Fx.randomOf(opponent.field));");
        rule("相手の墓地からカードを1枚ランダムに見る",
                (m, T) -> "Fx.peekCard(game, player, Fx.randomOf(opponent.graveyard));");
        rule("(?:自分の手札を1枚ランダムに増やす|(?:自分の手札に)?ランダムなカードを1枚(?:手札に)?加える)",
                (m, T) -> "Fx.draw(player, 1);");
    }

    // ===== 常時効果（フックではなくプロパティとして書き出す） =====
    record StaticRule(Pattern pattern, Function<Matcher, String> fn) {}

    static final List<StaticRule> STATIC_RULES = List.of(
            new StaticRule(Pattern.compile("^(?:このカードが)?攻撃を受けた時、(?:与えられる)?ダメージを(\\d+)軽減(?:する)?$"),
                    m -> "damageReduction: " + n(m) + ","),
            new StaticRule(Pattern.compile("^このカードが場にいる間、自分の場の守護カードは全て「攻撃を受けるダメージ-(\\d+)」を得る$"),
                    m -> "wardDamageReductionAura: " + n(m) + ","),
            new StaticRule(Pattern.compile("^場に出すには自分の場の傀儡トークンを(\\d+)体生け贄に捧げる必要がある$"),
                    m -> "sacrifice: { count: " + n(m) + ", filter: c => Fx.isPuppet(c) },"));

    static final Pattern NOISE_PAREN = Pattern.compile("（[^（）0-9０-９]*）"); // 数字を含まない注釈（（強化）など）
    static final Pattern FILLER = Pattern.compile("[、。\\s]|さらに|代わりに|その後|与える|与え|する|して|し");
    static final Pattern FLAVOR = Pattern.compile("場に居座|壁役"); // 説明だけの文
    static final Pattern ONCE = Pattern.compile("（1ゲーム(?:に)?1回(?:のみ)?）|（1ターン1回まで）");
    static final Pattern NO_EFFECT = Pattern.compile("^(特になし|効果なし)");

    record ParseResult(List<String> keywords, List<String> statics, LinkedHashMap<String, List<String>> hooks,
            String target, boolean ok) {}

    record Code(int start, String code) {}

    static ParseResult parseEffect(String desc) {
        List<String> keywords = new ArrayList<>();
        List<String> statics = new ArrayList<>();
        LinkedHashMap<String, List<String>> hooks = new LinkedHashMap<>();
        String target = null;
        String text = desc.strip();
        if (text.isEmpty() || NO_EFFECT.matcher(text).lookingAt()) {
            return new ParseResult(keywords, statics, hooks, null, true);
        }
        ParseResult fail = new ParseResult(List.of(), List.of(), new LinkedHashMap<>(), null, false);

        for (String sentence : text.split("。")) {
            if (sentence.isBlank()) continue;
            String s = NOISE_PAREN.matcher(sentence).replaceAll("").strip();
            if (s.isEmpty()) continue;
            if (FLAVOR.matcher(s).find()) continue;
            if (KEYWORDS.containsKey(s)) {
                keywords.add(KEYWORDS.get(s));
                continue;
            }

            boolean matchedStatic = false;
            for (StaticRule sr : STATIC_RULES) {
                Matcher m = sr.pattern().matcher(s);
                if (m.find()) {
                    statics.add(sr.fn().apply(m));
                    matchedStatic = true;
                    break;
                }
            }
            if (matchedStatic) continue;

            String hook = "onPlay";
            for (Trigger t : TRIGGERS) {
                Matcher m = t.pattern().matcher(s);
                if (m.lookingAt()) {
                    hook = t.hook();
                    s = s.substring(m.end());
                    break;
                }
            }

            boolean once = ONCE.matcher(s).find();
            s = ONCE.matcher(s).replaceAll("");

            String hookName = hook.split(":")[0];
            Targets T = new Targets(hookName);
            List<Code> codes = new ArrayList<>();
            StringBuilder rest = new StringBuilder(s);
            boolean progress = true;
            while (progress) {
                progress = false;
                for (Rule r : RULES) {
                    Matcher m = r.pattern().matcher(rest);
                    if (m.find()) {
                        codes.add(new Code(m.start(), r.fn().apply(m, T)));
                        for (int i = m.start(); i < m.end(); i++) rest.setCharAt(i, '\u0000');
                        progress = true;
                        break;
                    }
                }
            }
            String leftover = FILLER.matcher(rest.toString().replace("\u0000", "")).replaceAll("");
            if (!leftover.isEmpty() || codes.isEmpty()) return fail;

            codes.sort((a, b) -> Integer.compare(a.start(), b.start()));
            List<String> lines = new ArrayList<>();
            for (Code c : codes) lines.add(c.code());
            if (once) {
                lines.add(0, "if (self.flags.usedOnce) return;");
                lines.add(1, "self.flags.usedOnce = true;");
            }
            if (hook.equals("onAllyDestroyed:puppet")) lines.add(0, "if (!Fx.isPuppet(destroyed)) return;");
            hooks.computeIfAbsent(hookName, k -> new ArrayList<>()).addAll(lines);
            if (T.kind != null) target = T.kind;
        }
        return new ParseResult(keywords, statics, hooks, target, true);
    }

    static final List<String> CTX_NAMES = List.of(
            "game", "player", "opponent", "self", "target", "played", "attacker", "defender", "dealt", "destroyed");

    static String hookJs(String name, List<String> lines) {
        String body = String.join("\n", lines);
        List<String> used = new ArrayList<>();
        for (String n : CTX_NAMES) {
            if (Pattern.compile("\\b" + n + "\\b").matcher(body).find()) used.add(n);
        }
        String params = used.isEmpty() ? "()" : "{ " + String.join(", ", used) + " }";
        StringBuilder sb = new StringBuilder("        " + name + ": (" + params + ") => {\n");
        for (String l : lines) sb.append("            ").append(l).append("\n");
        sb.append("        },");
        return sb.toString();
    }

    static String jsStr(String s) {
        StringBuilder sb = new StringBuilder("\"");
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"' -> sb.append("\\\"");
                case '\\' -> sb.append("\\\\");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
                }
            }
        }
        return sb.append("\"").toString();
    }

    // ===== CSV の読み込み（ダブルクォート対応の簡易版） =====
    static List<Map<String, String>> readCsv(Path path) throws IOException {
        String content = Files.readString(path, StandardCharsets.UTF_8);
        if (content.startsWith("﻿")) content = content.substring(1); // BOM を除く
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < content.length(); i++) {
            char c = content.charAt(i);
            if (inQuotes) {
                if (c == '"' && i + 1 < content.length() && content.charAt(i + 1) == '"') {
                    field.append('"');
                    i++;
                } else if (c == '"') {
                    inQuotes = false;
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (c == '\n' || c == '\r') {
                if (c == '\r' && i + 1 < content.length() && content.charAt(i + 1) == '\n') i++;
                row.add(field.toString());
                field.setLength(0);
                if (!(row.size() == 1 && row.get(0).isEmpty())) rows.add(row);
                row = new ArrayList<>();
            } else {
                field.append(c);
            }
        }
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString());
            rows.add(row);
        }
        List<String> header = rows.get(0);
        List<Map<String, String>> result = new ArrayList<>();
        for (List<String> r : rows.subList(1, rows.size())) {
            Map<String, String> m = new HashMap<>();
            for (int i = 0; i < header.size(); i++) m.put(header.get(i).strip(), i < r.size() ? r.get(i) : "");
            result.add(m);
        }
        return result;
    }

    static String trimNewlines(String s) {
        int a = 0, b = s.length();
        while (a < b && s.charAt(a) == '\n') a++;
        while (b > a && s.charAt(b - 1) == '\n') b--;
        return s.substring(a, b);
    }

    public static void main(String[] args) throws IOException {
        Path src = Path.of(args.length > 0 ? args[0] : DEFAULT_CSV);
        Path dst = Path.of(args.length > 1 ? args[1] : DEFAULT_OUT);

        List<Map<String, String>> rows = readCsv(src);
        Map<String, List<String>> byClass = new LinkedHashMap<>();
        List<String> todo = new ArrayList<>();

        for (Map<String, String> r : rows) {
            int no = Integer.parseInt(r.get("No").strip());
            String cls = r.get("クラス").strip();
            boolean isSpell = r.get("種別").strip().equals("魔法");
            String rarity = r.get("レアリティ").strip();
            String desc = r.get("効果テキスト").strip();
            String evolve = r.getOrDefault("進化時効果", "").strip();

            List<String> lines = new ArrayList<>();
            lines.add("        id: " + no + ",");
            lines.add("        name: " + jsStr(r.get("カード名").strip()) + ",");
            lines.add("        class: CLASS." + CLASS_KEY.get(cls) + ",");
            lines.add("        type: TYPE." + (isSpell ? "SPELL" : "FOLLOWER") + ",");
            lines.add("        rarity: " + jsStr(rarity) + ",");
            if (rarity.equals("エース")) lines.add("        isAce: true,");
            lines.add("        cost: " + Integer.parseInt(r.get("コスト").strip()) + ",");
            if (!isSpell) {
                lines.add("        attack: " + Integer.parseInt(r.get("攻撃力").strip()) + ",");
                lines.add("        hp: " + Integer.parseInt(r.get("体力").strip()) + ",");
            }
            lines.add("        desc: " + jsStr(desc) + ",");
            if (!evolve.isEmpty()) lines.add("        evolveDesc: " + jsStr(evolve) + ",");

            if (OVERRIDES.containsKey(no)) {
                String body = trimNewlines(OVERRIDES.get(no));
                if (!body.contains("keywords:")) lines.add("        keywords: [],");
                lines.addAll(List.of(body.split("\n", -1)));
            } else {
                ParseResult p = parseEffect(desc);
                List<String> kws = new ArrayList<>();
                for (String k : p.keywords()) kws.add("KEYWORD." + k);
                lines.add("        keywords: [" + String.join(", ", kws) + "],");
                if (!p.ok()) {
                    lines.add("        implemented: false, // TODO: 効果を手書きで実装する");
                    todo.add("  " + no + " " + r.get("カード名") + ": " + desc);
                } else {
                    if (p.target() != null) lines.add("        target: TARGET." + p.target() + ",");
                    for (String s : p.statics()) lines.add("        " + s);
                    for (Map.Entry<String, List<String>> h : p.hooks().entrySet()) lines.add(hookJs(h.getKey(), h.getValue()));
                }
            }
            byClass.computeIfAbsent(cls, k -> new ArrayList<>()).add("    {\n" + String.join("\n", lines) + "\n    },");
        }

        StringBuilder out = new StringBuilder();
        out.append(HEADER.replace("{COUNT}", String.valueOf(rows.size())));
        List<String> body = new ArrayList<>();
        for (String cls : CLASS_ORDER) {
            body.add("    // ==================== " + cls + " ====================");
            body.addAll(byClass.getOrDefault(cls, List.of()));
        }
        out.append(String.join("\n", body));
        out.append(FOOTER);

        Files.createDirectories(dst.toAbsolutePath().getParent());
        Files.writeString(dst, out.toString(), StandardCharsets.UTF_8);

        System.out.println("生成: " + rows.size() + "枚 / 未実装: " + todo.size() + "枚");
        System.out.println("出力先: " + dst.toAbsolutePath());
        todo.forEach(System.out::println);
    }

    static final String HEADER = """
// js/cards.js
// カード定義（マスターデータ） 全{COUNT}枚
// CardsJsGenerator.java でスプレッドシート（CSV）から生成。数値やテキストを直すときは CSV を直して再生成する
// 効果を自動で読み取れなかったカードは implemented: false（未実装）になっている
//
// 使えるフック（すべて省略可）
//   canPlay(ctx)          … プレイ条件。false を返すと出せない
//   onPlay(ctx)           … 場に出た時（魔法は使用時）
//   onEvolve(ctx)         … 進化時
//   onAttack(ctx)         … 攻撃するたび（ctx.defender）
//   onAttacked(ctx)       … 攻撃を受けた時（ctx.attacker）
//   onAttackSuccess(ctx)  … 攻撃でダメージを与えた時（ctx.dealt）
//   onKill(ctx)           … 相手カードを撃破した時
//   onDestroy(ctx)        … 破壊された時
//   onTurnStart / onTurnEnd(ctx) … 自分のターン開始時・終了時
//   onEnemyPlay(ctx)      … 相手がカードをプレイした時（ctx.played）
//   onAllyDestroyed(ctx)  … 自分の場のカードが破壊された時（ctx.destroyed）
//   onAllySacrificed(ctx) … 自分の場のカードを生け贄にした時
// ctx = { game, player, opponent, self, target, ... }
// target が指定されていない（UI で選ばなかった）場合は、効果ごとにランダムな対象を使う

const CARD_DATABASE = [
""";

    static final String FOOTER = """

];

const CARD_MAP = new Map(CARD_DATABASE.map(c => [c.id, c]));

function getCardData(id) {
    const data = CARD_MAP.get(id);
    if (!data) throw new Error(`カードID ${id} が存在しません`);
    return data;
}

function getCardsByClass(cls) {
    return CARD_DATABASE.filter(c => c.class === cls);
}

// デッキ構築ルール: 選んだ1クラス＋無所属のみ
function canAddToDeck(deckClass, cardId) {
    const card = getCardData(cardId);
    if (deckClass === CLASS.NEUTRAL) return false; // 無所属は単体でクラスとして選べない
    return card.class === deckClass || card.class === CLASS.NEUTRAL;
}

// 未実装カードの一覧（開発用）
function getUnimplementedCards() {
    return CARD_DATABASE.filter(c => c.implemented === false);
}
""";

    // ===== エースカード・特殊なカードの手書き実装 =====
    // キー: スプレッドシートの No / 値: cards.js にそのまま書き出す JS
    // 新しく手書きしたいカードは、ここに同じ形で追加する
    static final Map<Integer, String> OVERRIDES = new HashMap<>();

    static {
        // No.70（エース）
        OVERRIDES.put(70, """
        keywords: [KEYWORD.STORM],
        evolveTarget: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ player, self }) => {
            const others = Fx.others(player, self);
            others.forEach(c => Fx.buff(c, 2, 0));
            if (others.length >= 2) self.attacksPerTurn = 2;
        },
        onEvolve: ({ game, opponent, target }) => {
            Fx.destroy(target || Fx.randomOf(opponent.field), game);
        },
""");
        // No.71（エース）
        OVERRIDES.put(71, """
        keywords: [KEYWORD.STORM],
        sacrifice: { count: 3, filter: c => c.class === CLASS.NOBLE },
        evolveTarget: TARGET.ENEMY_FOLLOWER,
        onEvolve: ({ game, opponent, target }) => {
            Fx.damage(target || Fx.randomOf(opponent.field), 3, game);
        },
""");
        // No.72（エース）
        OVERRIDES.put(72, """
        onPlay: ({ player, opponent, self }) => {
            Fx.stunAll(opponent, 2);
            self.flags.stunned = [...opponent.field];
            Fx.buffAll(player, 2, 0);
        },
        onEvolve: ({ game, opponent, self }) => {
            (self.flags.stunned || [])
                .filter(c => Fx.onField(opponent, c) && Fx.isStunned(c))
                .forEach(c => Fx.setHp(c, 1, game));
        },
""");
        // No.73（エース）
        OVERRIDES.put(73, """
        demonColor: "紫",
        onPlay: ({ game, opponent }) => {
            Fx.pickRandom(opponent.field, 3).forEach(c => Fx.damage(c, 5, game));
        },
""");
        // No.74（エース）
        OVERRIDES.put(74, """
        keywords: [KEYWORD.DRAIN],
        onPlay: ({ opponent }) => {
            opponent.field.forEach(c => Fx.tempAttack(c, -2, 1));
        },
""");
        // No.95（特殊）
        OVERRIDES.put(95, """
        onKill: ({ self }) => {
            Fx.buff(self, 0, 1);
        },
""");
        // No.104（特殊）
        OVERRIDES.put(104, """
        onKill: ({ self }) => {
            self.attacksPerTurn++; // 追加でもう1回攻撃できる
        },
""");
        // No.107（特殊）
        OVERRIDES.put(107, """
        onPlay: ({ player, self }) => {
            const c = Fx.randomOf(player.graveyard);
            if (!c) return;
            player.graveyard = player.graveyard.filter(g => g.uid !== c.uid);
            Fx.buff(self, 0, 3);
        },
""");
        // No.109（特殊）
        OVERRIDES.put(109, """
        attackBonus: ({ player }) => (player.leader.hp <= player.leader.maxHp / 2 ? 2 : 0),
""");
        // No.113（特殊）
        OVERRIDES.put(113, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, self, target }) => {
            const victim = Fx.randomOf(Fx.others(player, self));
            if (!victim) return;
            Fx.sacrifice(player, [victim], game);
            Fx.destroy(target || Fx.randomOf(opponent.field), game);
        },
""");
        // No.144（エース）
        OVERRIDES.put(144, """
        keywords: [KEYWORD.WARD],
        onPlay: ({ game, player, opponent, self }) => {
            const others = Fx.others(player, self);
            self.flags.destroyedAllies = others;
            others.forEach(c => Fx.destroy(c, game));
            Fx.destroyRandom(opponent, others.length, game);
            self.cannotAttackTurns = 2;
        },
        onEvolve: ({ game, player, self }) => {
            const candidates = (self.flags.destroyedAllies || []).filter(c => player.graveyard.includes(c));
            Fx.revive(player, Fx.randomOf(candidates), 1, game);
        },
""");
        // No.145（エース）
        OVERRIDES.put(145, """
        target: TARGET.ALLY_FOLLOWER_OTHER,
        targetFilter: c => c.class === CLASS.MONSTER,
        onPlay: ({ player, self, target }) => {
            const t = target || Fx.randomOf(Fx.others(player, self).filter(c => c.class === CLASS.MONSTER));
            if (!t) return;
            Fx.giveKeyword(t, KEYWORD.STORM);
            t.attacksPerTurn = 2;
            self.flags.granted = t;
        },
        onEvolve: ({ player, self }) => {
            if (Fx.onField(player, self.flags.granted)) Fx.buff(self.flags.granted, 2, 0);
        },
""");
        // No.146（エース）
        OVERRIDES.put(146, """
        onPlay: ({ game, player, opponent }) => {
            Fx.damageAll(opponent, 3, game);
            Fx.damageLeader(opponent, 2);
            Fx.damageLeader(player, 2);
        },
        onEvolve: ({ player }) => {
            player.tempLeaderReduction = 1;
        },
""");
        // No.147（エース）
        OVERRIDES.put(147, """
        demonColor: "赤",
        onPlay: ({ player, opponent }) => {
            Fx.damageLeader(opponent, 5);
            Fx.damageLeader(player, 2);
        },
""");
        // No.148（エース）
        OVERRIDES.put(148, """
        onPlay: ({ player }) => {
            player.field.forEach(c => {
                Fx.giveKeyword(c, KEYWORD.RUSH);
                Fx.buff(c, 3, 0);
            });
        },
        onTurnEnd: ({ player }) => {
            Fx.damageLeader(player, 2);
        },
""");
        // No.163（特殊）
        OVERRIDES.put(163, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, opponent, target }) => {
            const t = target || Fx.randomOf(opponent.field);
            if (!t) return;
            if (t.attack > t.hp) Fx.buff(t, -1, 0);
            else if (t.hp > t.attack) Fx.reduceHp(t, 1, game);
        },
""");
        // No.177（特殊）
        OVERRIDES.put(177, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, self, target }) => {
            const mine = Fx.randomOf(Fx.others(player, self));
            const theirs = target || Fx.randomOf(opponent.field);
            if (!mine || !theirs) return;
            Fx.takeControl(theirs, game, player, 1);
            Fx.takeControl(mine, game, opponent, 1);
        },
""");
        // No.197（特殊）
        OVERRIDES.put(197, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, opponent, target }) => {
            const t = target || Fx.randomOf(opponent.field);
            if (!t) return;
            if (t.attack > t.hp) Fx.buff(t, -1, 0);
            else if (t.hp > t.attack) Fx.reduceHp(t, 1, game);
        },
""");
        // No.218（エース）
        OVERRIDES.put(218, """
        keywords: [KEYWORD.RUSH, KEYWORD.DRAIN],
        onPlay: ({ player, self }) => {
            self.flags.brides = [Fx.summon(player, 149), Fx.summon(player, 149)].filter(Boolean);
            Fx.buffAll(player, 2, 2);
        },
        onEvolve: ({ player, self }) => {
            (self.flags.brides || []).filter(c => Fx.onField(player, c)).forEach(c => Fx.buff(c, 1, 1));
        },
""");
        // No.219（エース）
        OVERRIDES.put(219, """
        targetCount: 3,
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, self, targets }) => {
            const picked = targets && targets.length ? targets : Fx.pickRandom(opponent.field, 3);
            self.flags.destroyed = picked;
            picked.forEach(c => Fx.destroy(c, game));
            if (Fx.findOnField(player, "弔歌仇姫")) Fx.buffAll(player, 3, 3);
        },
        onEvolve: ({ opponent, self }) => {
            const ids = (self.flags.destroyed || []).map(c => c.uid);
            opponent.graveyard = opponent.graveyard.filter(c => !ids.includes(c.uid));
        },
""");
        // No.220（エース）
        OVERRIDES.put(220, """
        onPlay: ({ game, player, self }) => {
            const picked = Fx.pickRandom(player.graveyard.filter(c => c.type === TYPE.FOLLOWER), 2);
            self.flags.revived = picked.map(c => Fx.revive(player, c, 1, game)).filter(Boolean);
        },
        onEvolve: ({ player, self }) => {
            (self.flags.revived || []).filter(c => Fx.onField(player, c)).forEach(c => {
                c.hp = Math.max(c.hp, Math.min(2, c.maxHp));
            });
        },
""");
        // No.221（エース）
        OVERRIDES.put(221, """
        demonColor: "白",
        onPlay: ({ game, opponent }) => {
            [...opponent.field].forEach(c => Fx.destroy(c, game));
        },
""");
        // No.222（エース）
        OVERRIDES.put(222, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, target }) => {
            let total = 0;
            [...opponent.field].forEach(c => { total += Fx.damage(c, 1, game); });
            Fx.healLeader(player, total);
            const t = Fx.onField(opponent, target) ? target : Fx.randomOf(opponent.field);
            Fx.stun(t, 1);
        },
""");
        // No.223（エース）
        OVERRIDES.put(223, """
        noDamageWhenAttacking: true,
        annihilateOnAttack: true,
        evolveTarget: TARGET.ENEMY_FOLLOWER,
        canPlay: ({ player }) => player.stats.playedCount >= 6,
        onEvolve: ({ game, opponent, target }) => {
            Fx.banish(target || Fx.randomOf(opponent.field), game);
        },
""");
        // No.262（特殊）
        OVERRIDES.put(262, """
        target: TARGET.ENEMY_FOLLOWER,
        choices: ["破壊", "回復"],
        onPlay: ({ game, player, opponent, target, choice }) => {
            const pick = choice || (opponent.field.length ? "破壊" : "回復");
            if (pick === "破壊") Fx.destroy(target || Fx.randomOf(opponent.field), game);
            else Fx.healLeader(player, 5);
        },
""");
        // No.283（エース）
        OVERRIDES.put(283, """
        onPlay: ({ player }) => {
            player.field.forEach(c => {
                Fx.giveKeyword(c, KEYWORD.WARD);
                Fx.buff(c, 0, 6);
            });
        },
        onEvolve: ({ player }) => {
            player.field.filter(c => c.keywords.has(KEYWORD.WARD)).forEach(c => Fx.buff(c, 0, 2));
        },
""");
        // No.284（エース）
        OVERRIDES.put(284, """
        onPlay: ({ player }) => {
            Fx.draw(player, 3);
            Fx.damageLeader(player, 2);
        },
        onEvolve: ({ player }) => {
            Fx.draw(player, 1);
        },
""");
        // No.285（エース）
        OVERRIDES.put(285, """
        onPlay: ({ player }) => {
            if (Fx.hasDemon(player, "赤")) Fx.buffAll(player, 2, 0);
        },
""");
        // No.286（エース）
        OVERRIDES.put(286, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: (ctx) => {
            const demon = ctx.player.field.find(c => c.demonColor === "黒");
            if (demon && demon.onPlay) demon.onPlay({ ...ctx, self: demon });
        },
""");
        // No.287（エース）
        OVERRIDES.put(287, """
        onPlay: ({ player }) => {
            if (Fx.hasDemon(player, "白")) Fx.healLeader(player, 5);
        },
""");
        // No.288（エース）
        OVERRIDES.put(288, """
        onPlay: ({ player }) => {
            if (Fx.hasDemon(player, "黄")) Fx.draw(player, 2);
        },
""");
        // No.289（エース）
        OVERRIDES.put(289, """
        onPlay: ({ player }) => {
            if (Fx.hasDemon(player, "紫")) player.field.forEach(c => Fx.giveKeyword(c, KEYWORD.WARD));
        },
""");
        // No.290（エース）
        OVERRIDES.put(290, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, target }) => {
            if (Fx.hasDemon(player, "青")) Fx.takeControl(target || Fx.randomOf(opponent.field), game, player, 1);
        },
""");
        // No.291（エース）
        OVERRIDES.put(291, """
        onPlay: ({ player }) => {
            if (Fx.hasDemon(player, "緑")) {
                player.field.filter(c => c.keywords.has(KEYWORD.WARD)).forEach(c => Fx.buff(c, 0, 3));
            }
        },
""");
        // No.292（エース）
        OVERRIDES.put(292, """
        choices: [KEYWORD.RUSH, KEYWORD.WARD, KEYWORD.STORM, KEYWORD.DRAIN, KEYWORD.SHIELD],
        onPlay: ({ self, choice }) => {
            Fx.giveKeyword(self, choice || Fx.randomOf(self.choices));
        },
""");
        // No.308（特殊）
        OVERRIDES.put(308, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ player, opponent, target }) => {
            const t = target || Fx.randomOf(opponent.field);
            const ally = Fx.randomOf(player.field);
            if (!t || !ally || t.attack <= 0) return;
            Fx.buff(t, -1, 0);
            Fx.buff(ally, 1, 0);
        },
""");
        // No.314（特殊）
        OVERRIDES.put(314, """
        onPlay: ({ game, player }) => {
            const spell = Fx.randomOf(player.hand.filter(c => c.type === TYPE.SPELL));
            if (spell) Rules.playCard(game, player, spell, { free: true });
        },
""");
        // No.362（エース）
        OVERRIDES.put(362, """
        target: TARGET.ENEMY_ANY,
        onPlay: ({ game, player, opponent, self, target }) => {
            const spells = player.hand.filter(c => c.type === TYPE.SPELL && c.uid !== self.uid).length;
            Fx.damageAny(target || opponent.leader, spells, game);
            const idx = player.deck.findIndex(c => c.type === TYPE.FOLLOWER);
            if (idx !== -1) {
                const card = player.deck.splice(idx, 1)[0];
                card.cost = Math.max(0, card.cost - 1);
                Fx.addToHand(player, card);
            }
        },
""");
        // No.363（エース）
        OVERRIDES.put(363, """
        onPlay: ({ player, opponent }) => {
            if (player.stats.spellCount >= 6) opponent.leader.hp = Math.min(opponent.leader.hp, 1);
        },
        onEvolve: ({ player, opponent }) => {
            if (player.stats.spellCount < 6 && player.stats.spellCount + 1 >= 6) {
                opponent.leader.hp = Math.min(opponent.leader.hp, 1);
            }
        },
""");
        // No.364（エース）
        OVERRIDES.put(364, """
        onPlay: ({ player, self }) => {
            const spells = player.graveyard.filter(c => c.type === TYPE.SPELL);
            player.graveyard = player.graveyard.filter(c => c.type !== TYPE.SPELL);
            self.flags.returned = spells.map(c => {
                const fresh = createCardInstance(c.id);
                Fx.addToHand(player, fresh);
                return fresh;
            });
        },
        onEvolve: ({ player, self }) => {
            (self.flags.returned || []).filter(c => player.hand.includes(c)).forEach(c => {
                c.cost = Math.max(0, c.cost - 1);
                c.costDownTurns = 2; // 次の自分のターン終了時に元に戻る
            });
        },
""");
        // No.365（エース）
        OVERRIDES.put(365, """
        demonColor: "黒",
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, target }) => {
            Fx.takeControl(target || Fx.randomOf(opponent.field), game, player);
        },
""");
        // No.366（エース）
        OVERRIDES.put(366, """
        onPlay: ({ game, player, opponent }) => {
            [...player.field, ...opponent.field].forEach(c => Fx.banish(c, game));
            Fx.draw(player, 3);
        },
""");
        // No.367（特殊）
        OVERRIDES.put(367, """
        isPuppet: true,
        // 起動効果: UI のボタンなどから Rules.activate(game, player, card) で使う
        activate: ({ game, player, self, choice }) => {
            const big = choice || player.hand.find(c => c.type === TYPE.FOLLOWER && c.attack >= 5);
            if (!big) return false;
            Fx.sacrifice(player, [self], game);
            return Rules.playCard(game, player, big, { free: true });
        },
""");
        // No.369（特殊）
        OVERRIDES.put(369, """
        onPlay: ({ game, player }) => {
            const p = Fx.randomOf(Fx.puppets(player));
            const card = Fx.randomOf(player.hand.filter(c => c.type === TYPE.FOLLOWER));
            if (!p || !card) return;
            Fx.sacrifice(player, [p], game);
            Fx.buff(card, 0, 3);
        },
""");
        // No.371（特殊）
        OVERRIDES.put(371, """
        costModifier: ({ player }) => (Fx.puppets(player).length >= 1 ? -1 : 0),
""");
        // No.404（特殊）
        OVERRIDES.put(404, """
        attackBonus: ({ player }) => (Fx.puppets(player).length >= 3 ? 3 : 0),
""");
        // No.421（特殊）
        OVERRIDES.put(421, """
        hpBonus: ({ player }) => (Fx.puppets(player).length >= 1 ? 2 : 0),
""");
        // No.436（エース）
        OVERRIDES.put(436, """
        sacrifice: { count: 3, filter: c => Fx.isPuppet(c) },
        onPlay: ({ self, sacrificed }) => {
            Fx.buff(self, 2 * (sacrificed ? sacrificed.length : 0), 0);
        },
        onDestroy: ({ player, self }) => {
            Fx.summonPuppets(player, self.evolved ? 3 : 2, 2, 2);
        },
""");
        // No.437（エース）
        OVERRIDES.put(437, """
        onPlay: ({ player, self }) => {
            if (player.stats.puppetCount < 8) return;
            const valdo = Fx.summon(player, 436); // 生け贄なしで出るので攻撃力は素の3のまま
            if (valdo) {
                Fx.giveKeyword(valdo, KEYWORD.STORM);
                self.flags.valdo = valdo;
            }
            Fx.giveKeyword(self, KEYWORD.STORM);
        },
        onEvolve: ({ player, self }) => {
            if (Fx.onField(player, self.flags.valdo)) Fx.buff(self.flags.valdo, 0, 3);
        },
""");
        // No.438（エース）
        OVERRIDES.put(438, """
        onPlay: ({ player, self }) => {
            self.flags.puppets = Fx.summonPuppets(player, Math.min(3, player.field.length));
        },
        onEvolve: ({ player, self }) => {
            (self.flags.puppets || []).filter(c => Fx.onField(player, c)).forEach(c => Fx.buff(c, 1, 0));
        },
""");
        // No.439（エース）
        OVERRIDES.put(439, """
        demonColor: "黄",
        onPlay: ({ player }) => {
            player.field.forEach(c => {
                Fx.giveKeyword(c, KEYWORD.RUSH);
                Fx.buff(c, 2, 0);
            });
        },
""");
        // No.440（エース）
        OVERRIDES.put(440, """
        onPlay: ({ player }) => {
            Fx.summonPuppets(player, 5);
        },
""");
        // No.510（エース）
        OVERRIDES.put(510, """
        keywords: [KEYWORD.WARD],
        wardShieldAura: true,      // 他の守護カードは1回だけダメージを無効化
        leaderDamageReduction: 1,  // 自分のリーダーが受けるダメージ-1
        onEvolve: ({ player }) => {
            player.field.filter(c => c.keywords.has(KEYWORD.WARD)).forEach(c => Fx.buff(c, 0, 3));
        },
""");
        // No.511（エース）
        OVERRIDES.put(511, """
        target: TARGET.ALLY_FOLLOWER,
        targetFilter: c => c.keywords.has(KEYWORD.WARD),
        onPlay: ({ player, target }) => {
            const t = target || Fx.randomOf(player.field.filter(c => c.keywords.has(KEYWORD.WARD)));
            Fx.giveKeyword(t, KEYWORD.SHIELD);
        },
        onEvolve: ({ player }) => {
            const t = Fx.randomOf(player.field.filter(c => c.keywords.has(KEYWORD.WARD) && !c.keywords.has(KEYWORD.SHIELD)));
            Fx.giveKeyword(t, KEYWORD.SHIELD);
        },
""");
        // No.512（エース）
        OVERRIDES.put(512, """
        keywords: [KEYWORD.WARD],
        preventDestroy: (self) => {
            if (self.flags.survived) return false;
            self.flags.survived = true;
            self.hp = self.evolved ? 3 : 1;
            return true;
        },
""");
        // No.513（エース）
        OVERRIDES.put(513, """
        demonColor: "緑",
        onPlay: ({ game, opponent }) => {
            [...opponent.field].forEach(c => Fx.setHp(c, Math.floor(c.hp / 2), game));
        },
""");
        // No.514（エース）
        OVERRIDES.put(514, """
        keywords: [KEYWORD.WARD],
        onPlay: ({ opponent }) => {
            Fx.stunAll(opponent, 1);
        },
""");
        // No.518（特殊）
        OVERRIDES.put(518, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ opponent, self, target }) => {
            const t = target || Fx.randomOf(opponent.field.filter(c => c.keywords.size > 0));
            if (!t || t.keywords.size === 0) return;
            const kw = [...t.keywords][0];
            t.keywords.delete(kw);
            Fx.giveKeyword(self, kw);
        },
""");
        // No.525（特殊）
        OVERRIDES.put(525, """
        onKill: ({ game, player, opponent, self, defender }) => {
            // 撃破したカードの「場に出た時」の効果を自分のものとして使う
            if (defender.onPlay) defender.onPlay({ game, player, opponent, self, target: null });
        },
""");
        // No.527（特殊）
        OVERRIDES.put(527, """
        onPlay: ({ game, player, opponent, self }) => {
            const [seen] = Fx.peekHand(game, player, opponent, 1);
            if (!seen) return;
            const similar = CARD_DATABASE.filter(c =>
                c.cost === seen.cost && c.type === seen.type && !c.isAce &&
                (c.class === self.class || c.class === CLASS.NEUTRAL));
            const pick = Fx.randomOf(similar);
            if (pick) Fx.addToHand(player, createCardInstance(pick.id));
        },
""");
        // No.537（特殊）
        OVERRIDES.put(537, """
        onPlay: ({ game, player, opponent, self }) => {
            const c = Fx.randomOf(opponent.graveyard.filter(g => g.onPlay));
            if (c) c.onPlay({ game, player, opponent, self, target: null });
        },
""");
        // No.547（特殊）
        OVERRIDES.put(547, """
        onKill: ({ player }) => {
            Fx.draw(player, 1);
        },
        onAllyKill: ({ player }) => {
            Fx.draw(player, 1);
        },
""");
        // No.551（特殊）
        OVERRIDES.put(551, """
        attackBonus: ({ opponent }) => (opponent.leader.hp <= opponent.leader.maxHp / 2 ? 3 : 0),
""");
        // No.552（特殊）
        OVERRIDES.put(552, """
        onKill: ({ self, defender }) => {
            Fx.tempAttack(self, defender.attack, 1);
            self.statuses.push({ type: "TEMP_HP", value: defender.maxHp, turns: 1 });
            self.hp += defender.maxHp;
            self.maxHp += defender.maxHp;
        },
""");
        // No.584（エース）
        OVERRIDES.put(584, """
        target: TARGET.ENEMY_FOLLOWER,
        onPlay: ({ game, player, opponent, self, target }) => {
            self.flags.taken = Fx.takeControl(target || Fx.randomOf(opponent.field), game, player, 1);
        },
        onKill: ({ player }) => {
            Fx.draw(player, 1);
        },
        onEvolve: ({ player, self }) => {
            const taken = self.flags.taken;
            if (Fx.onField(player, taken)) {
                delete taken.returnTo;
                delete taken.returnAfterTurnOf;
            }
        },
""");
        // No.585（エース）
        OVERRIDES.put(585, """
        keywords: [KEYWORD.STORM],
        onPlay: ({ player, self }) => {
            Fx.buff(self, player.stats.stolenCount, player.stats.stolenCount);
        },
        onEvolve: ({ self }) => {
            Fx.buff(self, 2, 2);
        },
""");
        // No.586（エース）
        OVERRIDES.put(586, """
        onPlay: ({ player, opponent }) => {
            Fx.stealFromGraveyard(player, opponent, { toField: true, filter: c => c.type === TYPE.FOLLOWER });
        },
        onEvolve: ({ player, opponent }) => {
            Fx.stealFromGraveyard(player, opponent, { toField: true, filter: c => c.type === TYPE.FOLLOWER });
        },
""");
        // No.587（エース）
        OVERRIDES.put(587, """
        demonColor: "青",
        onPlay: ({ player, opponent }) => {
            Fx.stealFromGraveyard(player, opponent);
            Fx.stealFromHand(player, opponent);
        },
""");
        // No.588（エース）
        OVERRIDES.put(588, """
        onPlay: ({ game, player, opponent }) => {
            Fx.takeControl(Fx.randomOf(opponent.field), game, player);
            Fx.stealFromHand(player, opponent);
            Fx.stealFromGraveyard(player, opponent);
        },
""");
    }
}
