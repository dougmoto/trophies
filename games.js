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
  },
  {
    title: "The Case of the Golden Idol",
    platform: "PS5",
    file: "golden-idol.html",
    key: "golden-idol",
    icon: "GI",
    image: "covers/golden-idol.png",
    color: "#c9962e"
  },
  {
    title: "Mina the Hollower",
    platform: "PS5",
    file: "mina-hollower.html",
    key: "mina-hollower",
    icon: "MH",
    image: "covers/mina-hollower.png",
    color: "#8a5cf5"
  },
  {
    title: "1000xRESIST",
    platform: "PS5",
    file: "1000xresist.html",
    key: "1000xresist",
    icon: "1K",
    image: "covers/1000xresist.png",
    color: "#ff3d81"
  },
  {
    title: "Humanity",
    platform: "PS5",
    file: "humanity.html",
    key: "humanity",
    icon: "HU",
    image: "covers/humanity.png",
    color: "#4fc3e0"
  }
];
