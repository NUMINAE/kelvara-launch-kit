# Kelvara launch: critique log

Scores 1-10: hook · readability at phone size · motion quality · variety · brand accuracy · sound sync

## Round 1
6 · 6 · 7 · 8 · 8 · –
- Lattice overexposed: bloom swallowed the headline. Fixed: bloom 0.9 -> 0.38, threshold 0.2 -> 0.55, smaller pulses.
- Empty downbeat frames at b8 (before the phone) and b16 (half a logo stroke). Fixed: phone rises from b7.6, mark draws during the tile collapse.
- Phone too small in 16:9, Mini App unreadable. Fixed: closer camera, larger phone.

## Round 2
8 · 7 · 8 · 8 · 9 · –
- 16:9 phone cut off at the top. Fixed: lower and slightly smaller.
- 9:16 lattice crowded "machines." and the line under it. Fixed: lattice lower and smaller in portrait.
- b14: outgoing phone overlapped "Presale is live." Fixed: phone leaves by b14.05.
- Rolling figures smeared into ghost digits under motion blur. Fixed: no sub-frames for b13.9-15.5.

## Round 3
8 · 8 · 8 · 8 · 9 · 9
- Figure ticks sat ~24 ms off the score's 16th ticks. Fixed: tiles on 13.75/14/14.25/14.5; sync median 2.5 ms, 24/26 hits within 20 ms (the two misses are the frame-0 word and the amber-line swell, which has no attack).
- 9:16 tiles too small; 16:9 countdown overflowed its tile. Fixed: wider portrait tiles, smaller 16:9 countdown.

Final: hook 8 · readability 8 · motion 8 · variety 8 · brand 9 · sync 9

## Round 4: retime to 15 s
Feedback: the 10 s cut was too fast to follow. Kept every scene and stretched them over 30 beats (WARP in film.js); the score was rebuilt for 30 beats. Each Mini App receipt now holds about 1 s. Sync median 3.8 ms, 24/26 hits within 20 ms (same two expected misses).

## Round 5: slow the motion itself
Feedback: the 15 s cut still felt fast because each animation kept its old speed. Softer springs (text settles in ~0.9 s, was 0.29 s), glyph stagger doubled, whips 0.9 beats (were 0.4), tag typing 0.8 beats, slower crossfades, exits and end-card drawing. Phone rise starts under the amber wipe so beat 12 isn't empty.
