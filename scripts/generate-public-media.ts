import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const projectRoot = process.cwd();
const outputDir = path.join(projectRoot, "pub", "optimized");
const targetWidths = [640, 960, 1280, 1536] as const;

type HeroAssetSource = {
  inputFile: string;
  outputBaseName: string;
};

const heroSources: HeroAssetSource[] = [
  { inputFile: path.join(projectRoot, "pub", "home-hero-screen.png"), outputBaseName: "home-hero-screen" },
  { inputFile: path.join(projectRoot, "pub", "home-hero-screen-en.png"), outputBaseName: "home-hero-screen-en" },
  { inputFile: path.join(projectRoot, "pub", "home-hero-screen-eu.png"), outputBaseName: "home-hero-screen-eu" },
];

async function ensureDirectory(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function createDerivative(
  inputFile: string,
  outputFile: string,
  width: number,
  format: "avif" | "webp" | "png",
) {
  const pipeline = sharp(inputFile).resize({
    width,
    withoutEnlargement: true,
    fit: "inside",
  });

  if (format === "avif") {
    await pipeline
      .avif({
        quality: 58,
        effort: 7,
      })
      .toFile(outputFile);
    return;
  }

  if (format === "webp") {
    await pipeline
      .webp({
        quality: 82,
        effort: 6,
      })
      .toFile(outputFile);
    return;
  }

  await pipeline
    .png({
      compressionLevel: 9,
      effort: 8,
      adaptiveFiltering: true,
    })
    .toFile(outputFile);
}

async function generateResponsiveSet({ inputFile, outputBaseName }: HeroAssetSource) {
  const metadata = await sharp(inputFile).metadata();
  const inputWidth = metadata.width || targetWidths[targetWidths.length - 1];
  const effectiveWidths = Array.from(
    new Set<number>([...targetWidths.filter((width) => width <= inputWidth), inputWidth]),
  ).sort((left, right) => left - right);

  await Promise.all(
    effectiveWidths.flatMap((width) => [
      createDerivative(inputFile, path.join(outputDir, `${outputBaseName}-${width}.avif`), width, "avif"),
      createDerivative(inputFile, path.join(outputDir, `${outputBaseName}-${width}.webp`), width, "webp"),
      createDerivative(inputFile, path.join(outputDir, `${outputBaseName}-${width}.png`), width, "png"),
    ]),
  );
}

async function main() {
  await ensureDirectory(outputDir);
  await Promise.all(heroSources.map(generateResponsiveSet));
}

main().catch((error) => {
  console.error("[media] Error generating responsive public media", error);
  process.exitCode = 1;
});
