// Curated emoji set, no full-Unicode dump. Four small categories, ~80 total.

export const EMOJI: Record<string, string[]> = {
  Smileys: [
    "😀","😅","😂","🤣","😊","😍","😘","🥹",
    "😎","🤩","😭","😱","🤯","😤","🥰","🥲",
    "🙂","😉","😏","😴","🤔","🙃","😬","😶",
  ],
  Fire: [
    "🔥","💯","✨","⭐","💥","⚡","🌟","🌈",
    "🎉","🎊","🪩","🍿","🥂","🍷","☕","🌙",
  ],
  Watch: [
    "🎬","🎥","📺","🎞","🎶","🎵","💃","🕺",
    "👀","🍑","🍕","🛋","🎮","📸","🎤","🎧",
  ],
  Hearts: [
    "❤️","🧡","💛","💚","💙","💜","🤎","🖤",
    "💔","💕","💖","💗","🤍","💘","💞","💝",
  ],
  Hands: [
    "👍","👎","👏","🙌","🙏","🤝","👋","🤘",
    "✊","🫶","🤞","✌️","🤟","💪","🤲","🤌",
  ],
};

export const EMOJI_CATEGORIES = Object.keys(EMOJI) as Array<keyof typeof EMOJI>;
