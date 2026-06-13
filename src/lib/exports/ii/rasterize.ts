import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rasterizeTimeoutMs = 30_000;

/** Rasterise the cause-tree SVG to PNG with rsvg-convert (librsvg2-bin). The
 * writer-only LibreOffice on the VPS has no PNG export filter, so we use librsvg
 * — tiny, no Java. Rendered at 2x for crispness in print. Returns null on any
 * failure (e.g. rsvg-convert not installed) so the export still succeeds without
 * the graphic. NOTE: a fresh VPS must `apt-get install -y librsvg2-bin`. */
export async function svgToPng(svg: string): Promise<Buffer | null> {
	const workdir = await mkdtemp(join(tmpdir(), "ssfw-ii-tree-"));
	const svgPath = join(workdir, "tree.svg");
	const pngPath = join(workdir, "tree.png");
	try {
		await writeFile(svgPath, svg, "utf8");
		await execFileAsync("rsvg-convert", ["-z", "2", "-o", pngPath, svgPath], {
			timeout: rasterizeTimeoutMs,
		});
		return await readFile(pngPath);
	} catch {
		return null;
	} finally {
		await rm(workdir, { force: true, recursive: true });
	}
}
