# pose-sliders

Mobile-friendly three.js pose viewer. Five sliders, each labelled under its pose name:

| Slider | What it does |
| --- | --- |
| Deep squat | natural full squat: feet about shoulder width, heels flat, torso leaning forward about 25°, hands clasped at the chest |
| Wider stance | feet apart |
| Bend and touch toes | forward fold |
| Running: bust bounce | amplitude of a looping bust bounce |
| Running: glute motion | amplitude of a looping glute motion |

Touch: one finger rotates, pinch zooms, two fingers pan (three.js `OrbitControls`).

## How it works
* `models/her_poser.glb` is a skinned glTF (meshopt-compressed, WebP textures, about 2 MB).
  The poses are not baked: `models/pose_data.json` holds per-bone rotations/translations for each pose and
  `app.js` blends them by slider value (quaternion lerp from identity + normalise) on the bones each frame.
* The squat, stance and bend each have a *corrective morph target* (`fix_squat`, `fix_stance`, `fix_bend`) on the body and bikini.
  These keep the hips, glutes and upper thighs full and stop the candy-wrapper pinch of plain linear skinning.
  The morph weight is driven by the same slider.
* The running sliders animate breast/glute bones in JS; "Run" starts/stops the loop.
* URL hash presets, e.g. `#squat=1&stance=0.5&run=0&panel=0`.

## Files
* `index.html`, `app.js`: the app (no build step). three.js is vendored in `vendor/three`.
* `tools/optimize.mjs`: gltf-transform optimise pass (quantise, WebP, meshopt) plus morph-normal injection.
* `tools/normals.py`: computes corrective morph normals from the posed geometry.

Independent of any other project; has its own copy of the model.
