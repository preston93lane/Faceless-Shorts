"""Generate a reusable paper-grain texture (multiply overlay) once, so renders don't
compute SVG turbulence on every frame. Run: python3 -I scripts/make_paper_grain.py"""
import numpy as np
from PIL import Image, ImageFilter

W, H = 1080, 1920
rng = np.random.default_rng(7)
acc = np.zeros((H, W), dtype=np.float32)
amp, total = 1.0, 0.0
for cell in (240, 96, 40, 14, 5, 2):  # coarse blotches -> fine fibres
    gh, gw = H // cell + 2, W // cell + 2
    grid = rng.random((gh, gw)).astype(np.float32)
    img = Image.fromarray((grid * 255).astype(np.uint8)).resize((gw * cell, gh * cell), Image.BICUBIC)
    acc += np.asarray(img, dtype=np.float32)[:H, :W] / 255.0 * amp
    total += amp
    amp *= 0.62
acc /= total
acc = (acc - acc.min()) / (acc.max() - acc.min())
# Map to a light multiply range: 1.0 = no change, ~0.78 = darkest fibre
out = 0.78 + 0.22 * acc
im = Image.fromarray((out * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(0.6))
im.save("public/textures/paper-grain.jpg", quality=88)
print("wrote public/textures/paper-grain.jpg")
