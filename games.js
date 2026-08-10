/* =====================================================================
   Shared game list — used by index.html (hub) and cabinet.html (trophy
   case). Add a game here once and it shows up in both places.

   ICONS — pick one style per game:
     icon: "GT"                     two letters (default)
     emoji: "\u{1F47B}"             any emoji
     image: "covers/ghost-trick.png"  box art — extension doesn't matter,
                                       png/jpg/jpeg/webp are all tried
   ===================================================================== */

const GAMES = [
  {
    title: "Ghost Trick: Phantom Detective",
    platform: "PS4",
    file: "ghost-trick.html",
    key: "ghost-trick",
    icon: "GT",
    image: "covers/ghost-trick.png",
    color: "#ff6b4a"
  },
  {
    title: "Stardew Valley",
    platform: "PS4",
    file: "stardew.html",
    key: "stardew",
    icon: "SV",
    image: "covers/stardew.png",
    color: "#7cc48f"
  },
  {
    title: "Vampire Crawlers",
    platform: "PS5",
    file: "vampire-crawlers.html",
    key: "vampire-crawlers",
    icon: "VC",
    image: "covers/vampire-crawlers.png",
    color: "#8b1a2b"
  }
];
