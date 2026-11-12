#!/usr/bin/env bash
# CampusRadar — full browser golden path with agent-browser (headless, mobile viewport)
# signup → onboarding → radar estimate → broadcast → tasks (viewer counter)
# → logout → login as seeded helper → feed → accept → chat → PIN verify → points
set -uo pipefail
mkdir -p /tmp/render
ab() { agent-browser "$@"; }
FRONT=http://localhost:3100
EMAIL="browser.tester.$(date +%s)@uiet.ac.in"

cleanup() {
  [ -n "${STACK_PID:-}" ] && kill -- -"$STACK_PID" 2>/dev/null
  pkill -f "next start -p 3100" 2>/dev/null
  ab close 2>/dev/null
  true
}
trap cleanup EXIT

# ref_of <grep-pattern> <snapshot-file> — pull the first @eN ref matching a pattern
ref_of() { grep -E "$1" "$2" | grep -oE "ref=e[0-9]+" | sed "s/ref=e/@e/" | head -1; }
fail() { echo "FAIL: $1"; exit 1; }

echo "=== 1. backend stack (pg + redis + api) ==="
cd /home/z/my-project/campusradar/backend
setsid python3 /home/z/my-project/scripts/run_stack.py > /tmp/run_stack.log 2>&1 &
STACK_PID=$!
for i in $(seq 1 60); do
  curl -sf http://127.0.0.1:8000/healthz > /dev/null 2>&1 && break; sleep 1
done
curl -sf http://127.0.0.1:8000/healthz > /dev/null || { echo "backend failed"; cat /tmp/run_stack.log; exit 1; }
echo "backend healthy"

echo "=== 2. frontend (next start :3100) ==="
cd /home/z/my-project/campusradar/frontend
setsid npx next start -p 3100 > /tmp/next-start.log 2>&1 &
for i in $(seq 1 40); do
  curl -sf -o /dev/null http://localhost:3100/ && break; sleep 1
done
curl -sf -o /dev/null http://localhost:3100/ || { echo "frontend failed"; cat /tmp/next-start.log; exit 1; }
echo "frontend healthy"

echo "=== 3. browser: mobile viewport + UIET geo ==="
ab set viewport 390 844
ab set geo 30.7633 76.7870
ab open $FRONT/signup
ab wait --load networkidle || true
ab snapshot > /tmp/render/s1.txt

echo "--- 3a. signup"
R=$(ref_of 'textbox' /tmp/render/s1.txt); [ -n "$R" ] || fail "email box"
ab fill "$R" "$EMAIL"
R=$(ref_of 'button "Send verification code' /tmp/render/s1.txt); [ -n "$R" ] || fail "send btn"
ab click "$R"
ab wait --text "Dev mode:" || fail "otp screen"
ab snapshot > /tmp/render/s2.txt
CODE=$(grep -oE "\(production sends email\) — [0-9]{6}" /tmp/render/s2.txt | grep -oE "[0-9]{6}" | head -1)
[ -n "$CODE" ] || fail "otp parse"
echo "otp=$CODE"
R=$(ref_of 'textbox' /tmp/render/s2.txt); [ -n "$R" ] || fail "otp box"
ab fill "$R" "$CODE"
R=$(ref_of 'button "Verify code' /tmp/render/s2.txt); [ -n "$R" ] || fail "verify btn"
ab click "$R"
ab wait --text "Set a password" || fail "password screen"
ab snapshot > /tmp/render/s3.txt
R=$(ref_of 'textbox' /tmp/render/s3.txt)
ab fill "$R" "strongpass123"
R=$(ref_of 'button "Create account' /tmp/render/s3.txt)
ab click "$R"
ab wait --url "/onboarding" || fail "onboarding nav"
echo "signup ok"

echo "--- 3b. onboarding"
ab wait --load networkidle || true
ab snapshot > /tmp/render/s4.txt
R=$(ref_of 'button.*Female' /tmp/render/s4.txt); [ -n "$R" ] || fail "female btn"
ab click "$R"
R=$(ref_of 'checkbox' /tmp/render/s4.txt); [ -n "$R" ] || fail "confirm box"
ab check "$R"
R=$(ref_of 'button.*Enter CampusRadar' /tmp/render/s4.txt); [ -n "$R" ] || fail "enter btn"
ab click "$R"
ab wait --url "/radar" || fail "radar nav"
ab wait --load networkidle || true
sleep 2
echo "onboarding ok"

echo "--- 3c. radar: drop pin + zone estimate"
ab find first ".leaflet-container" click
ab wait --text "matching helper" || fail "estimate text"
sleep 1
ab screenshot /tmp/render/01-radar.png
ab snapshot > /tmp/render/s5.txt
EST=$(grep -oE "[0-9]+ matching helpers? online in this zone" /tmp/render/s5.txt | head -1)
echo "estimate: ${EST:-NOT FOUND}"

echo "--- 3d. compose + broadcast"
ab find first "textarea" fill "Need paracetamol from the shop near Student Centre, bring to Gate 2"
ab scroll down 1400
sleep 0.8
ab find first "input[aria-label='Tip amount']" fill "20" || echo "tip fill skipped"
ab snapshot > /tmp/render/s6.txt
R=$(ref_of 'button "Broadcast request' /tmp/render/s6.txt); [ -n "$R" ] || fail "broadcast btn"
ab click "$R"
ab wait --url "/requests" || fail "tasks nav"
sleep 1.5
ab screenshot /tmp/render/02-tasks-viewer-counter.png
ab snapshot > /tmp/render/s7.txt
grep -oE "(Waiting for nearby helpers[^\"<]*|[0-9]+ users? are currently viewing your request)" /tmp/render/s7.txt | head -1

echo "--- 3e. capture token + logout"
ab storage local cr_token > /tmp/render/token.txt 2>&1
TOKEN=$(grep -oE "eyJ[A-Za-z0-9._-]{40,}" /tmp/render/token.txt | head -1)
[ -n "$TOKEN" ] || fail "token capture"
echo "token ok (${#TOKEN} chars)"
ab open $FRONT/profile
ab wait --text "Log out" || fail "profile"
ab snapshot > /tmp/render/s8.txt
R=$(ref_of 'button "Log out' /tmp/render/s8.txt)
ab click "$R"
ab wait --url "/login" || fail "login nav"

echo "--- 3f. login as seeded helper aarav.sharma@pu.ac.in"
ab snapshot > /tmp/render/s9.txt
R=$(ref_of 'textbox' /tmp/render/s9.txt)
ab fill "$R" "aarav.sharma@pu.ac.in"
R=$(ref_of 'textbox' /tmp/render/s9.txt | tail -1)
REFS=$(grep -oE "ref=e[0-9]+" | sed "s/ref=e/@e/" /tmp/render/s9.txt | tr '\n' ' ')
R2=$(echo "$REFS" | tr ' ' '\n' | grep -A0 -m2 -E "@e[0-9]+" | sed -n 2p)
# second textbox = password: pick the textbox line explicitly
R2=$(grep -E 'textbox' /tmp/render/s9.txt | grep -oE "ref=e[0-9]+" | sed "s/ref=e/@e/" | sed -n 2p)
ab fill "$R2" "campus123"
R=$(ref_of 'button "Log in' /tmp/render/s9.txt)
ab click "$R"
ab wait --url "/radar" || fail "helper radar"
ab open $FRONT/feed
ab wait --text "Accept & help" || fail "feed empty"
ab screenshot /tmp/render/03-feed.png
echo "feed ok"

echo "--- 3g. accept → chat"
ab snapshot > /tmp/render/s10.txt
R=$(ref_of 'button "Accept & help' /tmp/render/s10.txt); [ -n "$R" ] || fail "accept btn"
ab click "$R"
ab wait --url "/chat/" || fail "chat nav"
ab wait --text "coordinate, meet, then verify PIN" || fail "chat header"
ab screenshot /tmp/render/04-chat-helper.png
echo "chat ok"

echo "--- 3h. handshake PIN verification"
URL=$(ab get url)
REQ_ID=$(echo "$URL" | grep -oE "/chat/[0-9a-f-]{36}" | cut -d/ -f3)
[ -n "$REQ_ID" ] || fail "req id from url"
PIN=$(curl -sf -H "Authorization: Bearer $TOKEN" "http://127.0.0.1:8000/api/v1/requests/$REQ_ID/pin" | grep -oE '"pin":"[0-9]{4}"' | grep -oE "[0-9]{4}")
[ -n "$PIN" ] || fail "pin fetch"
echo "pin=$PIN"
ab find first "input[inputmode=numeric]" click
for d in $(echo "$PIN" | grep -o .); do ab press "$d"; done
sleep 0.5
ab snapshot > /tmp/render/s11.txt
R=$(ref_of 'button "Verify & complete' /tmp/render/s11.txt); [ -n "$R" ] || fail "verify btn"
ab click "$R"
ab wait --text "Verified!" || fail "verified text"
sleep 1
ab screenshot /tmp/render/05-verified-points.png
ab snapshot > /tmp/render/s12.txt
grep -oE "Verified! \+[0-9]+ Help Points \(total [0-9]+\)" /tmp/render/s12.txt | head -1

echo "--- 3i. rewards page reflects balance"
ab open $FRONT/rewards
ab wait --text "Your balance" || fail "rewards"
sleep 1.5
ab screenshot /tmp/render/06-rewards.png
echo "rewards ok"

echo "--- 3j. diagnostics"
ab errors || true
echo "--- console tail ---"
ab console | tail -12 || true
ab close

echo "=== BROWSER E2E COMPLETE ==="
ls -la /tmp/render/*.png 2>/dev/null
