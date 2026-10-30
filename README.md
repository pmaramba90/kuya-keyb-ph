# Kuya Keyb PH

A minimalist typing game: build a mechanical keyboard, then type the falling words. Every keystroke is synthesized live from the parts you picked. The look is deep navy with gold, set in JetBrains Mono.

## Run it locally

No build step and no install. Either:

- **Double-click `index.html`**. It opens straight from disk in Chrome, Edge or Firefox.
- Or serve the folder with any static server, for example the VS Code "Live Server" extension, or `npx serve .` if you have Node.

Click or press any key once the page opens. Browsers block audio until you interact with the page.

## Sections

The top bar has **home · profile · play · friends · marketplace**, plus your picture and name. Clicking your name opens a small drop-down. Your nickname, city and country show in a box; the small **edit** above its right corner makes them editable (save or cancel). **log out** is below. Click outside it or press Esc to close it. Signed out, the site shows the logo with sign in / sign up; signed in, it opens on home.

On a phone the tabs move to a bar along the bottom (icons with small names), your name shrinks to just your picture at the top right, and every page fits the screen's width. The bar hides while you're playing. On a tablet the tabs show as icons only.

**Playing on a phone.** Phones don't send key presses to a web page, so during a game a hidden text box holds the phone's own keyboard open. Whatever you type into it goes to the game: letters type, ⌫ deletes, and space clears the word. It reads keyboards that compose or autocorrect whole words (like Gboard) by comparing what's in the box before and after each change.
- The keyboard comes up with the countdown.
- If it's hidden, **⌨ tap here to type** (or a tap on the play area) brings it back.
- The **pause** button at the top right stands in for Esc.
- Any card that opens (pause, results, an invite) puts the keyboard away so its buttons can be tapped.
- The play area is shorter on phones and the scores are compact, so the falling words and what you've typed stay above the keyboard.
- Cheat detection still applies: phone typing counts as real typing, and fake input events from a script are caught.

- **home**: a feed, like X or Facebook.
  - **Posts**: your posts and reviews and your friends', newest first. Click a name or picture to open that player's page. ✕ deletes your own (click twice).
  - **Reactions and replies**: under every post, **♥** and **😂** toggle your reaction and show how many people reacted (hover to see who). **reply** opens a reply box under the post; replies show oldest first, with names and pictures that open profiles. You can delete your own replies, the post's owner can delete any reply on their post, and the moderator can delete any reply. Deleting a post deletes its reactions and replies too.
  - **Moderator**: **akosipolnew1** sees every post on the site, not just friends', and can delete any of them. The database rules allow that one account and no other.
  - **+** opens **new review** or **new post**.
    - A post is text, a GIF, or both. **GIF** opens a GIPHY picker.
      - With a GIPHY API key in `js/giphy-config.js`, it shows trending GIFs and a search box; click one to add it.
      - Without a key, or as well as the search, paste a GIPHY link (giphy.com → a GIF → copy link). A paste is read at once; a typed link is read on Enter.
      - Only the GIF's GIPHY id is saved, and it's always shown from GIPHY's own servers, marked "via GIPHY". Anything that isn't a valid id is never shown.
      - Getting a key: developers.giphy.com → Create an App → **API** → name it → copy the API key into `js/giphy-config.js`. It's a public key meant for web pages. A new key is limited to 100 searches an hour until GIPHY approves it for production.
    - A review: pick what you're reviewing (full keyboard, base (case), plate, switches, keycaps, lube or mods), search the catalog and pick the item, rate it out of 5 stars, then write the review. Clicking the left half of a star gives half a star; the arrow keys also move the rating in half stars. Keyboard reviews show the product photo.
    - Reviews can include an optional link to where you can buy the item. Only https links to Amazon, Lazada or Shopee are accepted (their short links too); anything else is refused, and other links are never shown. The link appears as a **buy on Lazada ↗** button and opens in a new tab.
  - **Popular keyboards** on the side: the five keyboards on the site with the most hearts, from anyone, not just friends. Each is drawn whole, scaled down to fit. Click one to open its owner's page. The sign-up and online counts are here too.
- **profile**: your dashboard.
  - your best score in each mode: single player (best total), vs AI and vs players (best round), each with your win–loss record
  - **edit profile**, plus **build a new keyboard · full keyboards · continue last build**
  - your **featured keyboard**: your main keyboard drawn full size with its full spec sheet, estimated price, win rate and record; click it to open its summary
  - your other keyboards as rows (sound, price, win rate), each with **make main** to feature it instead; click a row to open it. If you have keyboards but haven't picked one, the first becomes your main. Your main keyboard is marked in the online copy of your builds, so it follows you to other devices and friends see it.
  - **Hearts**: every keyboard on a player's page has a ♥ with its count. Click it to heart someone else's keyboard, and click again to take the heart back. On your own keyboards you just see the count, since you can't heart your own.
- **play**: the game modes (single player, vs AI, vs players), your saved builds (load, rename, delete), and your **match history** against players (not the AI). Each match shows who it was against, the keyboard you used, win or loss, the round score, and how it ended if it wasn't by rounds (they left, you were away, cheating…). Click one to open that player's page.
- **Anyone's profile**: you can open any player's page, friend or not. Type a username on friends and press **view profile**, or click someone in popular keyboards, the vs players list or your match history. If you're not friends, the page has an **add friend** button. Once you've sent a request it shows **request sent**; if they've asked you, it shows **accept friend request**; once you're friends it shows **✓ friends**.
- **friends**: add a friend by username. They get a request (a red badge on "friends") and accept or decline. **requests received / requests sent** switch between the requests waiting for you and the ones you've sent that haven't been answered yet (cancel takes one back). Click a request to open that player's profile. The list shows how many friends are online, each friend's picture with an online dot, their optional nickname and city/country, and a **challenge** button when they're online. ✕ removes a friend (click twice). Click a friend to open **their page**: their picture, nickname and location, whether they're online (with a challenge button), their featured main keyboard drawn full size with its sound profile and details, and their other keyboards. **▶ hear it** plays their main keyboard, and while you're on their page your typing sounds like their board (yours comes back when you leave).
- **marketplace**: coming soon.
- **edit profile** (on your profile): change your picture or remove it, and set an optional nickname, city, country and email. Your email is only visible to you. Log out is here.

**Profile pictures** work like Facebook's: pick a photo, then drag to position it in the circle and zoom with the slider (or the mouse wheel). It's cropped in the browser to a 192 px square JPEG (a few KB) and saved in the database, because file storage would need Firebase's paid plan. Without a picture you get the keyboard logo. Pictures show in the nav, on home, on friends, in the vs players list, on challenges, on the VS card and beside both names at the top of the match.

## Accounts

The home page is the logo, the wordmark, a count of players who have signed up, and **log in / sign up** (username and password).

- **Online (Firebase configured, see "Going online"):** accounts are Firebase Auth accounts, so one account works on every device. Passwords need 6+ characters. Saved builds are copied online, so they follow you to other devices and other players can see them.
- **Offline (no config):** accounts live only in this browser's localStorage. Passwords are salted and hashed with PBKDF2-SHA256 via Web Crypto. This is not real security: anyone with access to the browser profile can read or wipe the data.
- An account made in the browser before going online moves online the first time you log in with it, as long as its password has 6+ characters.
- Each account has its own current build, saved builds, level progress and vs-AI record. Saving a build only saves it to the signed-in account.
- Builds made before accounts existed are given to the first account created on that browser.
- Each browser tab keeps its own sign-in, so two tabs can be two players.

## Full keyboards

There's a third option next to "build a new keyboard" and "continue last build": **full keyboards**. It lists 1,462 prebuilt boards from 81 brands. Search them, for example "keychron k8" or "razer blackwidow", or filter by brand, size or switch type. The boards come from three sources:

| source | boards | how |
|---|---|---|
| mechanicalkeyboards.com | 1,097 | the store's product feed |
| the makers' own stores: Keychron, Lemokey, YUNZII, EPOMAKER, Royal Kludge, Ajazz, Attack Shark, HyperX, Glorious, GravaStar | 271 | each store's product feed, minus boards already listed above, accessories, kits, numpads, membrane boards and regional-layout duplicates |
| gaming brands without a public feed: Razer, Logitech G, Corsair, SteelSeries, ASUS ROG, NuPhy, Redragon, Akko, Cherry, HyperX, Turtle Beach, Cooler Master, Drop, Mountain, DrunkDeer, Aula, MSI | 94 | entered by hand from the makers' spec pages and reviews |

The link on each board goes to the store it came from. Hand-entered boards use MSRP in USD. Where a maker's page has no photo the card shows the board's colors instead.

- **Pick a board, its color and its switch, then play it as sold.** There are no mods. You can also save it to your builds.
- **The look:** each color option shows the store's real photo. The rendered board takes its case, alpha, mod and accent colors from that photo, and its legend style from the maker. Individually colored keys are found in the photo too: a WASD or arrow cluster (located by its inverted-T shape, so it works on angled shots), and a lone colored Esc, Enter or spacebar on straight-on shots. The Esc/Enter accent is only kept when a cap of that color actually shows in the photo.
- **The sound** is built from exactly the parts listed on the product page:
  - case material, plate, mount
  - factory foam and lubed stabilizers or switches
  - stock keycap profile and material
  - the chosen switch
- **Switch names** from the stores map to the switch model:
  - Specific overrides come first: Varmilo EC V2, Keychron Super and Silk POM, Gateron Jupiter, Kailh Prestige, Matias, and Cherry MX *Nature* White, which is linear.
  - The gaming brands' own switches have overrides too: Razer Green / Yellow / Orange and optical, Logitech GL / GX, Corsair MLX / OPX / MGX, SteelSeries OmniPoint / OptiPoint / QX2, ROG NX / RX / HFX, and HyperX Aqua. Magnetic (Hall effect) switches are tagged magnetic; Razer's analog *optical* switches are not.
  - A type word in the name wins over the color guess, so "Linear Violet" is linear even though violet usually means tactile.
  - Otherwise the closest catalog switch is used, or one is synthesized from the name.
- **Topre** (HHKB, Realforce) gets its own rubber-dome sound: rounded, muted, no spring ping, with a stronger upstroke.
- The data is in `js/data-keyboards.js`. For store boards, specs are parsed from the product descriptions and colors are sampled from each color variant's photo. Hand-entered boards have hand-picked colors.

## vs AI

Pick **vs AI** next to **single player** on the home page or the build summary, then choose a difficulty:

| difficulty | word speed | AI typist |
|---|---|---|
| easy | level 3 | ≈40 wpm, makes typos |
| medium | level 4 | ≈60 wpm, steady |
| hard | level 5 | ≈90 wpm, rarely slips |

- You play on the left and the AI on the right. Both fields get the same words at the same moments.
- The AI behaves like a person: a reaction delay before each word, uneven typing rhythm, typos that it backspaces, occasional lapses, and it sometimes grabs power-ups.
- When a side overflows, its screen is destroyed:
  - cracks spread from an impact point and glass shards burst out
  - the remaining words tumble off the screen
  - the page quakes, and the field turns dark and glitchy
  - a huge diagonal **OVERFLOW** slams in; the explosion and breaking glass hit first, then the announcer shouts "OVERFLOOOW!" in the clear, through a clean vocal chain
  - the round result appears after the moment plays out (about 2.6 s)
- A match is **best of 3**, with 1:30 rounds. A round ends when someone's overflow bar fills. If both survive the 90 seconds, the higher score wins.
- The field is busier than single player at the same speed: words arrive about 1.5x as often, and up to 8 more can be on screen at once.
- **Your overflow bar only fills from the other side's combos.** Missing a word doesn't fill your own bar in vs modes. Instead it lowers your **opponent's** bar by about 5% (half a miss's damage), so every miss helps the other side.
- **Combo attacks**: every 5x combo milestone fires at the opponent and raises their overflow bar. A 5x combo does 1.2× a missed word's damage (about 12% of the bar at medium speed), rising by 0.3× each tier to 2.4× at WOW (about 25%). The AI's combos hit you the same way.
- Your win/loss record per difficulty is saved to your account.

## vs players

**vs players** on the home page lists everyone online: each player's username and the keyboard they've picked to play with (name, how it sounds, board, switch, keycaps, and its win–loss record). Once you're signed in, the home page also shows how many players are online now, under the sign-up count.

- Choose **your keyboard** at the top: any saved build, or the default if you have none (a creamy TKL: white aluminum case, black-on-white cherry PBT caps, NK Creams).
- **Challenge** someone. They hear an arcade alarm, a two-tone siren then a sword-clash "shing", with a softer reminder at 5 seconds, and their tab title flashes "⚔ challenged!" if they're elsewhere. They get an overlay on whatever screen they're on (a running single-player game pauses), showing your name and build, a picker for their own build, and a 10-second timer. If they don't accept in time, the challenge expires. Enter accepts, Esc declines.
- Same rules as vs AI at medium speed (level 4): best of 3, 1:30 rounds, combos attack the other player's overflow bar.
- Before round 1 a **VS card** plays (about 4 seconds). Each player's selected keyboard is the main image: the store photo for a full keyboard, otherwise the build drawn large. Both sweep in from opposite sides, VS slams down with a flash, a screen shake, a boom and the announcer's "VERSUS!". Then the countdown runs, ending in "FIGHT!". Both calls use the clean vocal path (like OVERFLOW), not the gritty combo chain, and come in after the slam's crash so they're easy to make out. The takes were chosen by running Windows speech recognition on the candidates against soundalike words.
- During the match both keyboards sit under the lanes, each with its owner's name and full setup. Your opponent's keys light up as they type.
- Both players get the same words in the same order (a shared seed). Your field runs on your machine. The right lane is a live view of theirs, updated about 7 times a second.
- Esc doesn't pause against a person. It asks whether to forfeit.
- The match keeps running when you alt-tab or minimize: a worker's timer steps the game when the browser stops sending animation frames, so your words keep falling and missing, and your opponent keeps seeing your field.
- Between rounds, each player has **30 seconds** to start the next round once the other is waiting. If you don't, the waiting player wins the match, and your screen shows the loss when you come back.
- Leaving, closing the page, or losing connection for 12 seconds mid-round also counts as a loss.
- Each win or loss is added to the build you played: **wins: 1 · losses: 0** shows on that saved build on the home page. Matches against the AI don't count.

## Going online

Without setup, vs players works between tabs of one browser, which is handy for testing. To let everyone play each other, connect a free Firebase project (Spark plan, no card needed):

1. At https://console.firebase.google.com create a project. Then **Build → Authentication → Get started → Email/Password → Enable**.
2. **Build → Realtime Database → Create database**: pick the Singapore (`asia-southeast1`) location and start in **locked mode**. Under **Rules**, paste `database.rules.json` and publish.
3. **Authentication → Settings → Authorized domains**: add the site's domains (`kuyakeybph.com`, `www.kuyakeybph.com`, and `pmaramba90.github.io` for the old link).
4. **Project settings → Your apps → Web (</>)**: register an app and copy its `firebaseConfig`. Paste it into `js/net-config.js` as `window.KK_FIREBASE = { ... }`. It must include `databaseURL`.

The config values are public by design. The database rules are what keep each player's data their own. Usernames become sign-in emails on `players.kuyakeybph.com`; nothing is ever sent to them.

## How it plays

1. **Build**: choose the base (layout, case material and color, plate, mount), the switches (586 from keybumps.com), the keycaps (727 sets from mechanicalkeyboards.com), and any mods and lube.
2. **Summary**: a write-up of how the board sounds, an estimated price (USD by default, PHP or EUR optional), and shop links for every part. Name and save the build here. Saved builds appear on the home screen after a refresh, where you can load, rename or delete them.
3. **Play (survival)**: each level lasts 1 minute.
   - Every word that reaches the bottom fills the **overflow bar**, and finishing words drains it a little. If the bar fills, it's game over. Survive the minute to unlock the next level.
   - A game over always sends you back to level 1 with a fresh total. Only "next level" continues a run.
   - As the bar fills, the field's border turns redder and flickers faster. From 75% the whole box shakes, faster and harder until it overflows. This applies in vs mode too.
   - Your **combo** only suffers when you mistype: a wrong letter halves it. A word that falls off the bottom doesn't touch it.
   - The **combo meter** (top right) shows your combo count, which catches fire and burns hotter at each tier (5x creamy → 10x double → 15x triple → 20x ultra → 25x WOW). It also shows the current tier name, progress to the next tier, and the score multiplier.
   - A spec sheet of your build sits beside the in-game keyboard.
   - Your **total score** carries across levels and shows at the top left. Words typed higher up score more, and a combo raises the multiplier up to x3.
   - **Word sizes**: words fall in four sizes, and the smaller the word, the more it's worth: tiny ×2, small ×1.5, normal ×1, large ×0.7. Longer words score more too, so small long words are the jackpot (an 8-letter word scores 160 tiny vs 56 large).
   - **Announcer** (switch in the footer: "announcer: dragon / classic"):
     - **dragon** (default): the [DRAGON Announcer Audio Pack](https://voicebosch.itch.io/dragon-announcer-audio-pack) by **VoiceBosch**, licensed [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The credit sits in the footer, and details are in `audio/dragon/CREDITS.txt`. 13 of its lines were mixed to mono, resampled to 22 kHz and trimmed (826 KB total). They're used like this:
       - combos at 5x / 10x / 15x / 20x / 25x+: "Vicious!", "Savagery!", "Ferocity!", "Killing Frenzy!", "Berserk!" (the on-screen combo names match)
       - VS card: "Embrace the Fury!"
       - each vs round: "First / Second / Third Round", then "Fight!" on go
       - overflow: "K.O.!"
       - winning a vs match: "Victor!"
       - single-player game over: "Game Over"
     - **classic**: the synthesized calls below.
   - The classic announcer shouts your switch's word on combos: 5x "Creamy!", 10x "Double Creamy!", 15x "Triple Creamy!", 20x "Ultra Creaaammmyyyy!", and "WOW!!!" at 25x and every 5 after. The word is "Creamy" for linear or silent switches, "Thocky" for tactile and "Clicky" for clicky.
     - The lines were rendered offline with the Windows "Microsoft David" voice (raised pitch, slowed stressed words) and are embedded in `js/data-announcer.js`.
     - At playback they get an arcade treatment: grit, chest and presence EQ, heavy compression, a stadium hall, ping-pong echoes, and a boom-and-fanfare stinger that grows with each tier.
     - To use your own recorded voice, replace the base64 WAVs in that file. Keep the same keys.
   - **Power-ups**: type a glowing word to grab its power.
     - ❄ **freeze** stops all words for 4s.
     - ◷ **slow** makes words fall at 40% speed for 7s.
     - ×2 **double** doubles your score for 10s.
     - ✕ **erase** clears the screen and scores every word on it.
     - − **subtract** lowers your own overflow bar by 5% for every word you type, for 10s.
   - `space` / `enter` clears what you've typed, `esc` pauses.

Two volume sliders in the footer control the music and the sfx (keyboard, game sounds and announcer).

## Cheat detection

While a round runs, `js/anticheat.js` watches the keys that reach the game and catches typing no person did:

- **scripted keys**: key events made by code (a console script, an extension), not a keyboard
- **no keyboard**: letters reaching the game that no key press sent
- **instant keys**: pressed and released within 12 ms on most of the last 30 keys. Macro tools and auto-typers do that; a finger holds a key 50–150 ms.
- **machine rhythm**: the gaps between the last 30 keys vary by under 8% (a person's vary by 40–70%)
- **inhuman speed**: 60 keys averaging under 35 ms apart (about 340 wpm, sustained)

What happens when it's caught:
- **Single player and vs AI**: the run stops and doesn't count, so no scores, records or unlocks.
- **vs players**: the cheater forfeits. It counts as a loss for them, and the other player is told why and gets the win.

The limits are generous so a fast typist never trips them. It runs in the player's browser, so it stops bots, macros and auto-typers. Someone who edits the game's code in their own browser could still get round it; making that impossible would need scores checked on a server.

## How the keycaps are drawn

Legends follow each maker's style as seen in the mechanicalkeyboards.com product photos. The styles are `LEGEND_STYLES` in `js/catalog.js`:

| style | font | look |
|---|---|---|
| GMK | Inter Bold | grotesk legends, stacked shifted symbols, arrow-icon mods |
| Ducky | Montserrat | "1!" side by side |
| Leopold | Rajdhani | squarish legends |
| HHKB / Topre | — | centered legends, lowercase mods |
| Akko and similar cute sets | Fredoka | rounded |
| Traitors and Hangul sets | — | kana / jamo sub-legends |
| everyone else | Arimo | Helvetica-style |

Blank sets have no legends, and side-print sets print on the front edge.

Colors come from the set's name. When the name has no colors, they're sampled from the set's product photo (`js/data-keycap-colors.js`).

## How the keyboard sound works

Nothing is sampled. Each press is modeled as a series of contact events, and each event excites a bank of resonant modes:

| event | shaped by |
|---|---|
| stem friction (scratch) | lube, housing material (POM / UHMWPE self-lubricate), films |
| tactile bump | switch bump strength, thick lube dulls it |
| click | click-jacket (MX Blue style, clicks on press **and** release), click-bar (Kailh BOX / Choc, one crisp click), Zeal leaf |
| bottom-out | keycap profile & material (main pitch/ring), housing (nylon deep, PC bright), long-pole stems (sharper), plate stiffness, mount softness |
| case cavity / metallic ping | case material, layout size, case/plate foam, tape mod, desk mat |
| spring ping | lube choice, force-break mod |
| stabilizer rattle | stab lube, holee mod, case material |
| top-out on release | spring weight, films, silent dampers |

Each event is built from short noise-excited resonances and fast-decaying modes, the way plastic actually behaves, not from long-ringing tones. The bottom-out is split into three layers that you hear separately:

- **Clack:** bright plastic formants around 1.1–5.5 kHz.
- **Thock:** the low body around 360–1600 Hz, plus a ~1 kHz "tok" so it still comes through on laptop speakers.
- **Contact snap:** its brightness depends on how hard the contact is.

Hollowness isn't a note of its own: the first 12 ms of each strike drive the case's resonances, and that response is mixed back under the dry strike. Those resonances are the shell's first few bending modes (higher ones die faster, as in a damped plate; plastic shells ring about 16 ms, foam shortens them) and the standing waves of the air inside the case, which come from its inside length and depth. Each key excites them in a different mix. A stock plastic tray-mount board rings out in about 40 ms to −30 dB, instead of a single 500 Hz tone ringing for well over 100 ms like a drum.

Clicks are mixed outside the keycap low-pass, so they cut through: MX-style click jackets give a thin tick near 8–10 kHz, Kailh click bars a louder, fuller snap near 3–4 kHz. Each key size (alpha, wide, spacebar) renders 6 variants. Each key also gets its own slight pitch offset and a stereo position. Switch housing material, stem type and factory lube are inferred from each switch's name and brand.

## Music

The music plays only while you're playing (single player, vs AI and vs players), starting on that level's track, and stops when you leave the game. The rest of the site is quiet; key sounds still play everywhere.

A procedural **lo-fi chill radio** with six tracks:

| track | BPM | chords | keys / lead | drums | ambience |
|---|---|---|---|---|---|
| rainy window | 72 | Fmaj9 Em7 Dm9 Cmaj9 | Rhodes + pad / kalimba | boom-bap | rain |
| late night ramen | 80 | Dm9 G13 Cmaj9 A7♭9 | Rhodes / vibraphone | busy, swung | vinyl |
| jeepney sunset | 86 | E♭maj9 Cm9 Fm9 B♭13 | nylon guitar / Rhodes | boom-bap | vinyl |
| sari-sari dusk | 74 | Am9 Fmaj9 Cmaj9 G6 | felt piano + pad / vibes | half-time | night crickets |
| study session | 70 | Gmaj9 Bm7 Em9 Cmaj9♯11 | felt piano / Rhodes | boom-bap | light rain |
| typhoon season | 66 | Cm9 A♭maj9 E♭maj9 G7alt | Rhodes + pad / kalimba | half-time | heavy rain |

Everything is synthesized:

- **Instruments:** FM Rhodes, felt piano, Karplus-Strong nylon guitar, kalimba, vibraphone, a warm sine bass, soft pads, and dusty drums.
- **Lo-fi treatment:** swung drums, a kick-pumped "sidechain", tape wow and flutter, saturation, a warm low-pass, and vinyl crackle.
- **Structure:** each track opens with a drum-less intro, and its melody comes and goes between loops.
- **Playlist:** tracks play in order. Each new level or vs round switches to a different one.
- **Footer:** **♫ track name** shows what's playing. Click it to skip to the next track.

## Files

```
index.html
css/style.css
js/util.js            helpers + localStorage (global and per-user keys)
js/auth.js            local sign up / log in (PBKDF2-hashed passwords)
js/net-config.js      Firebase web config (null = everything stays in this browser)
js/net.js             online layer: Firebase Auth + Realtime Database, or a localStorage stand-in
js/online.js          vs players: presence, lobby, challenges, build sync, records, user count
js/social.js          profiles, profile pictures (crop + store), friends and friend requests
js/data-*.js          switches, keycap sets, word lists (english + tagalog)
js/catalog.js         parts, sound multipliers, switch/keycap inference
js/audio-core.js      audio context, buses, DSP primitives
js/keysound.js        keyboard sound model + playback
js/music.js           lo-fi radio engine (6 tracks)
js/sfx.js             game sound effects
js/keyboard-view.js   keyboard renderer
js/builder.js         build flow
js/kbs.js             full (prebuilt) keyboards screen
js/feed.js            home feed: posts and reviews (+), hearts, popular keyboards
js/anticheat.js       cheat detection: scripted / instant / machine-rhythm / inhuman-speed keys
js/game.js            game engine: Board (one field), solo, vs AI + AI typist, vs players
database.rules.json   Firebase Realtime Database security rules
js/main.js            screens, overlay, input, settings
```

## Publishing

It's live at **https://kuyakeybph.com**, served by GitHub Pages from `main` (repo `pmaramba90/kuya-keyb-ph`). Every push redeploys in about a minute.

- The domain is registered at Namecheap. DNS has four `A` records on `@` (185.199.108.153, .109.153, .110.153, .111.153) and `www` as a `CNAME` to `pmaramba90.github.io`. The `CNAME` file in the repo holds the custom domain.
- HTTPS is a free Let's Encrypt certificate that GitHub renews automatically. `www`, plain `http` and the old `pmaramba90.github.io/kuya-keyb-ph/` all redirect to https://kuyakeybph.com.
- The domain is verified on the GitHub account (TXT `_github-pages-challenge-pmaramba90`), so no one else can claim it for their Pages site.
- Firebase Auth lists `kuyakeybph.com` and `www.kuyakeybph.com` as authorized domains.

It's a fully static site, so any static host works. Online play needs the Firebase setup above. The UI font (JetBrains Mono) and the keycap legend fonts load from Google Fonts. Without a connection the UI falls back to the system monospace font (Cascadia Mono or Consolas on Windows).
