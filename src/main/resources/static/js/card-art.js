// js/card-art.js
// カードのイラスト。img/cards/{カードID}.webp（なければ .png → .jpg）を表示する。
// 画像が無いカードは、今までどおりの紋章（名前の1文字目）が見える。

const CARD_ART_DIR = "img/cards/";
const CARD_ART_EXTS = [".webp", ".png", ".jpg"];

// 画像の読み込みに失敗したら次の拡張子を試し、全部だめなら画像を消す
function cardArtFallback(img) {
    const next = Number(img.dataset.ext || 0) + 1;
    if (next >= CARD_ART_EXTS.length) {
        img.remove();
        return;
    }
    img.dataset.ext = next;
    img.src = CARD_ART_DIR + img.dataset.id + CARD_ART_EXTS[next];
}

// トークン（場に出るだけのカード）は id が無いので画像なし
function cardArtImg(card, className = "art-img") {
    if (!card || card.isToken || card.id == null) return "";
    return `<img class="${className}" src="${CARD_ART_DIR}${card.id}${CARD_ART_EXTS[0]}" data-id="${card.id}" alt="" loading="lazy" draggable="false" onerror="cardArtFallback(this)">`;
}
