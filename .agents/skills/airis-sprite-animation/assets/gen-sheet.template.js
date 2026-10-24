// Codex runs this file verbatim through its exec tool (see ask-codex.md), so the image model
// receives these strings unchanged. Replace REFERENCE and PROP; keep CYCLE, WHO and STYLE unless
// the animation is not a run. The shipped popcorn run cycle came from this text, minus the
// feather-clip side, which was added after that sprite showed the clip on the wrong side.
// Escaped absolute Windows path to docs/design/airis/turnaround.webp (the splash was generated from
// a PNG export of an Airis image); check it exists before launching Codex.
const REFERENCE = "C:\\absolute\\path\\to\\docs\\design\\airis\\turnaround.webp";
const PROP = "She hugs a big red-and-white striped popcorn bucket against her chest with both arms. The bucket is heaped with popcorn and every kernel stays inside it: no popcorn flies, falls or floats anywhere around her.";

const CYCLE = "Animation sprite sheet of ONE run cycle, 8 frames, wide landscape image, 4 columns by 2 rows, read left to right then top to bottom. " +
  "Every frame shows the whole character in strict side view running toward the right, same size, same costume, same object, feet on the same invisible ground line, " +
  "centered in its cell, running in place (no forward travel between frames). Classic run cycle breakdown: " +
  "1 CONTACT: front (right) leg reaching forward, heel touching the ground, back leg stretched behind with toes just leaving the ground. " +
  "2 DOWN: front foot flat under her body, knee bent, body at its lowest point, back leg folding up behind. " +
  "3 PASSING: supporting leg straight under her, the other knee swinging forward past it, body rising. " +
  "4 UP: pushing off the toes, both feet off the ground, body at its highest point, the free leg reaching forward. " +
  "5 CONTACT with the legs swapped (left leg forward). 6 DOWN, legs swapped. 7 PASSING, legs swapped. 8 UP, legs swapped. " +
  "Her long hair streams back and bounces a beat after her body: it rises when she goes down and drops when she goes up. " +
  "Cheerful determined face, slight forward lean. ";
const WHO = "Airis, the chibi anime girl from the reference image: same face and big sparkling blue eyes, extremely long wavy royal-blue hair fading to cyan, " +
  "white feather hair clip on her LEFT side only, so it is hidden behind her head when she faces right, " +
  "white sleeveless dress open over a deep-blue skirt with tiny star sparkles, long white opera gloves, white shoes. " +
  "IGNORE any other object in the reference: it is not part of her. ";
const STYLE = "Clean cel-shaded anime illustration matching the reference style. Transparent background, no scenery, no grid lines, no borders, no numbers, no text, no shadow.";

const r = await tools.image_gen__imagegen({
  prompt: CYCLE + WHO + PROP + " " + STYLE,
  referenced_image_paths: [REFERENCE],
  transparent_background: true,
});
generatedImage(r);
text("DONE");
