// Renders the intro video frame by frame in headless Chrome and encodes it with ffmpeg.
// usage: node render.mjs <ko|en|es|ja|zh> [stills t1,t2,...]
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const [lang = "ko", mode, times] = process.argv.slice(2);
const here = path.dirname(new URL(import.meta.url).pathname);
const url = pathToFileURL(path.join(here, "intro.html")).href + `?lang=${lang}&t=0`;
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--allow-file-access-from-files", "--force-color-profile=srgb"] });
const page = await browser.newPage();
await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle0" });
await page.evaluate(() => window.ready);
await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));

if (mode === "stills") {
  fs.mkdirSync(path.join(here, "stills"), { recursive: true });
  for (const t of times.split(",").map(Number)) {
    await page.evaluate(async (t) => { window.render(t); await document.fonts.ready; }, t);
    await page.screenshot({ path: path.join(here, `stills/${lang}-${t.toFixed(2).padStart(5, "0")}.jpg`), type: "jpeg", quality: 85 });
  }
} else {
  const fps = 30, duration = await page.evaluate(() => window.DURATION);
  const out = path.join(here, `out/Ouroborocessor-intro-${lang}.mp4`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const ff = spawn("ffmpeg", ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });
  for (let f = 0; f < fps * duration; f++) {
    await page.evaluate(async (t) => { window.render(t); await document.fonts.ready; }, f / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(out);
}
await browser.close();
