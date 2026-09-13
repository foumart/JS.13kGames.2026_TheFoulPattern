let rainbowCanvas;
let pathTrail = [];
let rainbowPulse = 0;
let rainbowAnim = 0;
let rainbowStart = 0;
let rainbowDone = 0;
let rainbowWait = 0;
let retractX = -1;
let retractY = -1;
let hopping = 0;

// N=1 E=2 S=4 W=8
function dirMask(dx, dy) {
	if (dy < 0) return 1;
	if (dx > 0) return 2;
	if (dy > 0) return 4;
	if (dx < 0) return 8;
	return 0;
}

function isPath(x, y) {
	return inBounds(x, y) && pathStep[y][x] > 0;
}

function isFill(x, y) {
	return inBounds(x, y) && fillData[y][x] > 0;
}

function placeStartPath(x, y) {
	pathCount = 1;
	pathStep[y][x] = 1;
	pathData[y][x] = 0;
	pathTrail = [[x, y]];
}

function extendPath(ox, oy, nx, ny, dx, dy) {
	//sfx(")(!", 0.005);// step end
	sfx(")", 0.03);
	pathCount ++;
	pathStep[ny][nx] = pathCount;
	pathData[oy][ox] |= dirMask(dx, dy);
	pathData[ny][nx] |= dirMask(-dx, -dy);
	pathTrail.push([nx, ny]);
}

function canRetract() {
	return pathTrail.length > 1;
}

function isPrevPath(x, y) {
	if (!canRetract()) return 0;
	const p = pathTrail[pathTrail.length - 2];
	return p[0] == x && p[1] == y;
}

function isTrail(x, y) {
	for (let i = pathTrail.length - 1; i--;) {
		if (pathTrail[i][0] == x && pathTrail[i][1] == y) return 1;
	}
	return 0;
}

// retrace back to the older trail tile, one hop per rendered frame
function startRetract(x, y) {
	if (!player || moving || state != 1 || menu || showObjective || showEnd) return;

	if (!isTrail(x, y)) {
		sfx("Aa");// blocked
		retractX = -1;
		return;
	}
	if (retractX != x || retractY != y) {
		retractX = x;
		retractY = y;
		moving = 1;
		sfx("@20");// attempt to get back
		poke(player, x, y, () => tween(player, 6, {offsetX: 0, offsetY: 0}, () => moving = 0));
		return;
	}
	sfx(">0+$'");// get back on old trail
	moving = 1;
	hopping = 1;
	stepRetract();
}

function stepRetract() {
	// stop the chain in the middle or when reaching exit
	if (retractX < 0 || state != 1 || (player.x == retractX && player.y == retractY) || !canRetract()) {
		retractX = -1;
		hopping = 0;
		moving = 0;
		drawBoard();
		return;
	}
	const p = pathTrail[pathTrail.length - 2];
	player.hopBack(p[0] - player.x, p[1] - player.y);
	drawBoard();
	requestAnimationFrame(stepRetract);
}

// Pull trail + tip floor off immediately so undo never flashes rainbow under the hop
function beginRetractPath() {
	const cur = pathTrail.pop();
	const cx = cur[0];
	const cy = cur[1];
	const prev = pathTrail[pathTrail.length - 1];
	const dx = cx - prev[0];
	const dy = cy - prev[1];
	pathData[prev[1]][prev[0]] &= ~dirMask(dx, dy);
	let still = 0;
	for (let i = 0; i < pathTrail.length; i++) {
		if (pathTrail[i][0] == cx && pathTrail[i][1] == cy) still = 1;
	}
	if (!still) {
		if (fillData[cy][cx]) {
			pathStep[cy][cx] = 1;
		} else {
			pathData[cy][cx] = 0;
			pathStep[cy][cx] = 0;
		}
	} else {
		pathData[cy][cx] &= ~dirMask(-dx, -dy);
	}
	pathCount = pathTrail.length;
}

// Rainbow background: tileWidth*boardW x tileWidth*boardH, 45 degrees gradient
function buildRainbowBackdrop() {
	rainbowCanvas = document.createElement("canvas");
	rainbowCanvas.width = tileWidth * boardWidth;
	rainbowCanvas.height = tileWidth * boardHeight;
	rainbowCanvas.ctx = rainbowCanvas.getContext("2d");
	paintRainbow(0);
}

// one diagonal gradient - stops on hue multiples of 60 interpolate like hsl()
function paintRainbow(shift) {
	const bw = rainbowCanvas.width;
	const bh = rainbowCanvas.height;
	const ctx = rainbowCanvas.ctx;
	const a = -shift / 2, b = a + (bw + bh - 2) * 4 / 7;
	const g = ctx.createLinearGradient(a, a, b, b);
	for (let i = 0; i < 49; i++) g.addColorStop(i / 48, pathInk(i * 60));
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, bw, bh);
}

function scrollRainbow() {
	if (!rainbowPulse) {
		rainbowDone = 0;
		rainbowWait = 0;
	}
	if (rainbowPulse && !rainbowAnim && !rainbowDone) {
		if (!rainbowWait) {
			rainbowWait = time;
			paintRainbow(0);
			return;
		}
		if (time - rainbowWait < 100) return;
		rainbowStart = time;
		rainbowAnim = 1;
		rainbowDone = 1;
		rainbowWait = 0;
	}
	if (!rainbowAnim) return;
	const denom = rainbowCanvas.width + rainbowCanvas.height - 2;
	const t = (time - rainbowStart) / 1000;
	if (t >= 1) {
		paintRainbow(0);
		if (rainbowDone > 1 || state == 2) {
			rainbowDone = 1;
			rainbowStart = time;
		} else rainbowAnim = 0;
	} else {
		paintRainbow(t * denom / 7);
	}
}

function pathInk(shift) {
	return "hsl(" + shift % 360 + ",85%,55%)";
}

function drawPurifiedTile(x, y) {
	const w = cellSize;
	const px = boardOffsetX + x * w;
	const py = boardOffsetY + y * w;
	//gameContext.imageSmoothingEnabled = false;
	gameContext.drawImage(
		rainbowCanvas,
		x * tileWidth, y * tileWidth, tileWidth, tileWidth,
		px, py, w, w
	);
}

function drawFlowingPath() {
	const w = cellSize;
	for (let i = 0; i < pathTrail.length; i++) {
		const p = pathTrail[i];
		const m = pathData[p[1]][p[0]];
		gameContext.drawImage(pathBitmaps[m], boardOffsetX + p[0] * w, boardOffsetY + p[1] * w, w, w);
	}
}
