// js/card-view.js
// バトル以外の画面（デッキ編成・図鑑・ショップ）でカードを描く共通部品
// 見た目はバトル画面（battle.js の cardEl）と同じ。読み込み順: effects.js → cards.js → card-view.js

const CardView = {
    CLASSES: [CLASS.NOBLE, CLASS.MONSTER, CLASS.GHOST, CLASS.WITCH, CLASS.PUPPET, CLASS.HUNTER, CLASS.PIRATE],

    STYLE: {
        [CLASS.NOBLE]:   { sigil: "♛", hue: 345, sat: 55, theme: "吸血鬼の宮廷" },
        [CLASS.MONSTER]: { sigil: "☠", hue: 12,  sat: 60, theme: "獣人・悪魔の群れ" },
        [CLASS.GHOST]:   { sigil: "☾", hue: 200, sat: 35, theme: "未練を残す亡霊たち" },
        [CLASS.WITCH]:   { sigil: "✶", hue: 280, sat: 50, theme: "森と禁書の魔女団" },
        [CLASS.PUPPET]:  { sigil: "♟", hue: 35,  sat: 40, theme: "糸に縛られた者たち" },
        [CLASS.HUNTER]:  { sigil: "✚", hue: 140, sat: 35, theme: "聖域を守る番人たち" },
        [CLASS.PIRATE]:  { sigil: "⚓", hue: 215, sat: 55, theme: "呪われた幽霊船団" },
        [CLASS.NEUTRAL]: { sigil: "✦", hue: 48,  sat: 25, theme: "流浪する者たち" },
    },

    esc(s) {
        return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    },

    style(cls) {
        return CardView.STYLE[cls] || CardView.STYLE[CLASS.NEUTRAL];
    },

    art(card) {
        const st = CardView.style(card.class);
        const h = (st.hue + ((card.id * 37) % 40) - 20 + 360) % 360;
        return `radial-gradient(circle at 50% 28%, hsl(${h} ${st.sat}% 40%), hsl(${h} ${st.sat}% 15%) 58%, hsl(${h} ${st.sat}% 5%))`;
    },

    // クラスの紋章（丸いエンブレム）
    emblem(cls) {
        const st = CardView.style(cls);
        return `<span class="cv-emblem" style="--emb:radial-gradient(circle at 50% 35%, hsl(${st.hue} ${st.sat}% 32%), hsl(${st.hue} ${st.sat}% 8%) 70%)">${st.sigil}</span>`;
    },

    // opts: { evolved, badge（右上の文字）, dim（暗くする）, extraClass }
    html(card, opts = {}) {
        const st = CardView.style(card.class);
        const spell = card.type === TYPE.SPELL;
        const atk = spell ? "" : card.attack + (opts.evolved ? 2 : 0);
        const hp = spell ? "" : card.hp + (opts.evolved ? 2 : 0);
        const cls = ["cv-card", spell ? "spell" : "", card.isAce ? "ace" : "",
            String(card.rarity).includes("準エース") ? "semi" : "", opts.evolved ? "evolved" : "",
            opts.dim ? "dim" : "", opts.extraClass || ""].join(" ");
        return `<div class="${cls}" data-id="${card.id}">
            <div class="cv-art" style="--art:${CardView.art(card)}">
                <div class="cv-glyph">${CardView.esc(card.name[0])}</div>
                <div class="cv-sigil">${st.sigil}</div>
            </div>
            <div class="cv-name">${CardView.esc(card.name)}</div>
            <div class="cv-gem cv-cost">${card.cost}</div>
            ${spell ? "" : `<div class="cv-gem cv-atk ${opts.evolved ? "up" : ""}">${atk}</div><div class="cv-gem cv-hp ${opts.evolved ? "up" : ""}">${hp}</div>`}
            ${opts.badge != null ? `<div class="cv-badge">${opts.badge}</div>` : ""}
        </div>`;
    },
};
