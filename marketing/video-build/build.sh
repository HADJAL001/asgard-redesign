#!/usr/bin/env bash
set -euo pipefail

FFMPEG="/c/Users/HADJAL/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.2-full_build/bin/ffmpeg.exe"
ROOT="/c/Users/HADJAL/work/asgard-redesign"
SRC="$ROOT/marketing/screenshots"
OUT="$ROOT/marketing/video-build"
SCENES="$OUT/scenes"
mkdir -p "$SCENES"
cd "$ROOT"

export FONTCONFIG_PATH="C:\\Users\\HADJAL\\work\\asgard-redesign\\marketing\\video-build"
FONT="marketing/video-build/georgia.ttf"

GOLD="0xD4AF37"
BG="0x0A0A0F"
FPS=30
W=1920
H=1080

title_card () {
  local name="$1" dur="$2" line1="$3" line2="$4"
  local fout; fout=$(awk -v d="$dur" 'BEGIN{printf "%.2f", d-0.6}')
  "$FFMPEG" -y -f lavfi -i "color=c=${BG}:s=${W}x${H}:d=${dur}:r=${FPS}" \
    -vf "drawtext=fontfile=${FONT}:text='${line1}':fontcolor=${GOLD}:fontsize=88:x=(w-text_w)/2:y=(h-text_h)/2-40:shadowcolor=black:shadowx=3:shadowy=3,\
drawtext=fontfile=${FONT}:text='${line2}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=(h-text_h)/2+70:alpha=0.85,\
fade=t=in:st=0:d=0.6,fade=t=out:st=${fout}:d=0.6" \
    -pix_fmt yuv420p -r $FPS "$SCENES/$name.mp4"
}

scene_cover_center () {
  local name="$1" src="$2" dur="$3" caption="$4"
  local fout frames; fout=$(awk -v d="$dur" 'BEGIN{printf "%.2f", d-0.4}'); frames=$(awk -v d="$dur" -v f="$FPS" 'BEGIN{printf "%d", d*f}')
  "$FFMPEG" -y -loop 1 -i "$SRC/$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},\
zoompan=z='min(zoom+0.0012,1.18)':d=${frames}:s=${W}x${H}:fps=${FPS},\
drawbox=x=0:y=ih-140:w=iw:h=140:color=black@0.45:t=fill,\
drawtext=fontfile=${FONT}:text='${caption}':fontcolor=${GOLD}:fontsize=42:x=(w-text_w)/2:y=h-95,\
fade=t=in:st=0:d=0.4,fade=t=out:st=${fout}:d=0.4" \
    -t "$dur" -pix_fmt yuv420p -r $FPS "$SCENES/$name.mp4"
}

scene_cover_top () {
  local name="$1" src="$2" dur="$3" caption="$4"
  local fout frames; fout=$(awk -v d="$dur" 'BEGIN{printf "%.2f", d-0.4}'); frames=$(awk -v d="$dur" -v f="$FPS" 'BEGIN{printf "%d", d*f}')
  "$FFMPEG" -y -loop 1 -i "$SRC/$src" \
    -vf "scale=${W}:-1,crop=${W}:${H}:0:0,\
zoompan=z='min(zoom+0.0012,1.15)':d=${frames}:s=${W}x${H}:fps=${FPS},\
drawbox=x=0:y=ih-140:w=iw:h=140:color=black@0.45:t=fill,\
drawtext=fontfile=${FONT}:text='${caption}':fontcolor=${GOLD}:fontsize=42:x=(w-text_w)/2:y=h-95,\
fade=t=in:st=0:d=0.4,fade=t=out:st=${fout}:d=0.4" \
    -t "$dur" -pix_fmt yuv420p -r $FPS "$SCENES/$name.mp4"
}

scene_contain_pad () {
  local name="$1" src="$2" dur="$3" caption="$4"
  local fout frames; fout=$(awk -v d="$dur" 'BEGIN{printf "%.2f", d-0.4}'); frames=$(awk -v d="$dur" -v f="$FPS" 'BEGIN{printf "%d", d*f}')
  "$FFMPEG" -y -loop 1 -i "$SRC/$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${BG},\
zoompan=z='min(zoom+0.0006,1.06)':d=${frames}:s=${W}x${H}:fps=${FPS},\
drawbox=x=0:y=ih-140:w=iw:h=140:color=black@0.45:t=fill,\
drawtext=fontfile=${FONT}:text='${caption}':fontcolor=${GOLD}:fontsize=42:x=(w-text_w)/2:y=h-95,\
fade=t=in:st=0:d=0.4,fade=t=out:st=${fout}:d=0.4" \
    -t "$dur" -pix_fmt yuv420p -r $FPS "$SCENES/$name.mp4"
}

echo ">> intro"
title_card "00-intro" 2.5 "OSGARD NEW WORLD" "Turn your idea into a legendary artifact"

echo ">> scenes"
scene_cover_center "01-hero"        "02-hero.png"               2.2 "Describe an idea. AI forges the artifact."
scene_cover_center "02-generator"   "03-demo-generator.png"     2.2 "Generation in progress"
scene_cover_center "03-result"      "04-demo-result-page.png"   2.2 "Rarity. Stats. Lore."
scene_cover_center "04-closeup"     "05-demo-result-closeup.png" 2.2 "Every artifact is one of a kind"
scene_cover_top     "05-halloffame" "06-hall-of-fame.png"       2.2 "Climb the Architects leaderboard"
scene_cover_center "06-wallet"      "07-wallet-economy.png"     2.2 "TimeCoin — backed one-to-one by a real Solana token"
scene_cover_center "07-referral"    "08-referral.png"           2.2 "Invite. Earn. Grow the economy."
scene_contain_pad   "08-mobile"     "landing-mobile.png"        2.2 "Web and mobile. One account, one wallet."

echo ">> outro"
title_card "09-outro" 3.0 "osgardnewworld.com" "Forge yours today"

echo ">> concat"
LIST="$OUT/list.txt"
> "$LIST"
for f in "$SCENES"/00-intro.mp4 "$SCENES"/01-hero.mp4 "$SCENES"/02-generator.mp4 "$SCENES"/03-result.mp4 \
         "$SCENES"/04-closeup.mp4 "$SCENES"/05-halloffame.mp4 "$SCENES"/06-wallet.mp4 "$SCENES"/07-referral.mp4 \
         "$SCENES"/08-mobile.mp4 "$SCENES"/09-outro.mp4; do
  echo "file '$(cygpath -w "$f" | sed 's#\\#/#g')'" >> "$LIST"
done

"$FFMPEG" -y -f concat -safe 0 -i "$LIST" -c:v libx264 -crf 18 -pix_fmt yuv420p -r $FPS \
  "$ROOT/marketing/promo-teaser.mp4"

echo ">> gif"
"$FFMPEG" -y -i "$ROOT/marketing/promo-teaser.mp4" \
  -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer" \
  "$ROOT/marketing/promo-teaser.gif"

echo ">> done"
ls -la "$ROOT/marketing/promo-teaser.mp4" "$ROOT/marketing/promo-teaser.gif"
