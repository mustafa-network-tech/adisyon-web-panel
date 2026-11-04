import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconDirectory = path.join(projectRoot, "public", "icons");
const icons = [
  ["app-icon.svg", "app-icon-192.png", 192],
  ["app-icon.svg", "app-icon-512.png", 512],
  ["app-icon-maskable.svg", "app-icon-maskable-192.png", 192],
  ["app-icon-maskable.svg", "app-icon-maskable-512.png", 512],
  ["app-icon.svg", "apple-touch-icon.png", 180],
];

await Promise.all(
  icons.map(async ([source, output, size]) => {
    await sharp(path.join(iconDirectory, source), { density: 384 })
      .resize(size, size, { fit: "fill" })
      .png()
      .toFile(path.join(iconDirectory, output));
  }),
);

console.log(`Generated ${icons.length} PWA icons in ${iconDirectory}`);
