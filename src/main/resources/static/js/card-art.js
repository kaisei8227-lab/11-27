// js/card-art.js
// カードのイラスト。
//   1. img/cards/{カードID}.webp（なければ .png → .jpg）
//   2. 個別画像が無ければ、クラスの代用画像 img/classes/{クラス}.webp（.png → .jpg）
//   3. それも無ければ画像を消して、今までどおりの紋章（名前の1文字目）を見せる

const CARD_ART_DIR = "img/cards/";
const CLASS_ART_DIR = "img/classes/";
const CARD_ART_EXTS = [".webp", ".png", ".jpg"];

// クラス名 → 代用画像のファイル名
const CLASS_ART_FILES = {
    "貴族": "noble",
    "怪物": "monster",
    "幽霊": "ghost",
    "無所属": "neutral",
    "魔女": "witch",
    "人形": "puppet",
    "狩人": "hunter",
    "海賊": "pirate",
};

function cardArtSrc(img) {
    const ext = CARD_ART_EXTS[Number(img.dataset.ext || 0)];
    return img.dataset.stage === "class"
        ? CLASS_ART_DIR + img.dataset.cls + ext
        : CARD_ART_DIR + img.dataset.id + ext;
}

// 読み込みに失敗したら次の候補へ。個別画像 → クラス画像 → 画像なし
function cardArtFallback(img) {
    let next = Number(img.dataset.ext || 0) + 1;
    if (next >= CARD_ART_EXTS.length) {
        if (img.dataset.stage !== "class" && img.dataset.cls) {
            img.dataset.stage = "class";
            next = 0;
        } else {
            img.remove();
            return;
        }
    }
    img.dataset.ext = next;
    img.src = cardArtSrc(img);
}

function cardArtImg(card, className = "art-img") {
    if (!card) return "";
    const cls = CLASS_ART_FILES[card.class] || "";
    const hasOwn = !card.isToken && card.id != null;
    // トークン（場に出るだけのカード）は個別画像が無いので、クラス画像から始める
    if (!hasOwn && !cls) return "";
    const stage = hasOwn ? "card" : "class";
    const src = hasOwn
        ? `${CARD_ART_DIR}${card.id}${CARD_ART_EXTS[0]}`
        : `${CLASS_ART_DIR}${cls}${CARD_ART_EXTS[0]}`;
    return `<img class="${className}" src="${src}" data-stage="${stage}" data-id="${hasOwn ? card.id : ""}" data-cls="${cls}" alt="" loading="lazy" draggable="false" onerror="cardArtFallback(this)">`;
}
