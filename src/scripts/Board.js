const tileWidth = 6;
const cellSize = 18;
const unitScale = 2 / 3;
const campaignLength = 63;
const puzzleLength = 100;

function lastIndex() {
	return (puzzleMode ? puzzleLength : campaignLength) - 1;
}

function runComplete() {
	return levelIndex >= lastIndex() && (puzzleMode ? state == 2 : battleResult == 2);
}

let boardWidth;
let boardHeight;
let boardOffsetX = 0;
let boardOffsetY = 0;
let viewLeft = 0;
let viewTop = 0;
let viewScale = 1;
let iconContext;
let scanHPattern;

let enemies = []; // 0 empty, 1 blue, 2 green, 3 red, 4-6 dying
let obstacles = [];
let coins = [];
let exits = [];
let rescues = []; // 0 empty, else unit bitmap index
let pathData = [];
let pathStep = [];
let fillData = [];
let moveLog = []; // flushed enemy cells per forward move (for undo)
let player;
let moving = 0;
let gameLoop;
let time = 0;
let pathCount = 0;
let hiscore = 0;
let lives = 3;
let puzzleMode = 0;
let menu = 1; // 1 title, 2 pause
let perfects = 0;

let state = 1; // 1 play, 2 win, 3 lose
let showEnd = 0;
let showObjective = 0;
let stageCaptive = 0;
let stageItem = 0; // the jewel of judgement to obtain before the exit opens

let levelIndex = 0;
let enemiesTotal = 0;
let enemiesCleared = 0;
let coinsCollected = 0;
let moveCount = 0;
let levelScore = 0;
let totalScore = 0;
let scoreStart = 0;
let scoreBanked = 0;
let revealPlayerTile = 0;

let leftoverEnemies = 0;
let leftTotalThisLevel = 0;
let leftoverKinds = [0, 0, 0, 0, 0];
let leftUnitsThisLevel = [0, 0, 0, 0, 0];
let rescuedUnits = [];
let levelCaptives = [];
let rescueDying = [];
let unitMods = {}; // name -> [hp, att, move steps taken, attack steps taken, around]
const UNITS = [
	// name,     hp,dm,mv,at,bm,pttrn, rng, rc - born as 0:+ 1:x 2:* 3:knight 4:around
	//           |  |  |  |  |  |      |    |    rn/rc cap each ladder: K*100 + maxR*10 + maxB
	//           |  |  |  |  |  |      |    |    and 0 means it never upgrades
	[0,          6, 2, 3, 3, 0, 0,     100, 121], // Unicorn
	["Corwin",   9, 1, 0, 3, 7, "012", 121, 0], // grey
	["Merlin",   6, 1, 2, 0, 7, "b56", 131, 43], // blue
	["Benedict", 10,2, 0, 0, 6, "082", 21,  21], // orange
	["Fiona",    5, 1, 2, 1, 5, 0,     33,  16], // blue
	["Random",   8, 1, 1, 1, 7, 0,     12,  22], // dark red
	["Bleys",    8, 1, 0, 0, 6, 0,     21,  13], // red
	["Julian",   7, 1, 0, 0, 5, "392", 121, 61], // dark green
	["Caine",    8, 1, 0, 0, 6, "096", 11,  40], // dark green
	["Gerard",   12,2, 0, 0, 6, "356", 11,  21], // blue
];
const ENEMIES = [
	["Manticore",28,8, 3, 1, 1, "cd6", 143, 16],
	["Brand",    32,9, 3, 3, 6, "716", 166, 21]
];

// A boss plus the two lesser foes are encoded like: kind * 10 + lvl
// 0:leprechaun, 1:hydra, 2:serpent, 3:manticore, 4:brand
// Boss then escort for all 21 battles, one char each: kind * 5 + lvl - 1 off "0", so
// 0-4 leprechaun, 5-9 hydra, 10-14 serpent, 15 manticore, 20 brand. Worlds 1-3 each
// introduce a kind backed by the previous one's veterans, then it climbs to Brand.
/*const WAVES = "213142516374:4;5<6768;86=;=6969<97?=><?>D?";

function battleWave(b) {
	const foe = i => {
		const c = WAVES.charCodeAt(b * 2 + i) - 48;
		return (c / 5 | 0) * 10 + c % 5 + 1;
	};
	return [foe(0), foe(1), foe(1)];
}*/

// 21 battles: boss kind,           boss lvl,            escort kind,         escort lvl
//             .....................:::::::::::::::::::::.....................:::::::::::::::::::::
const WAVES = "000111222111221113234345123123344445551511000000011121211212223123245512222222334351";

function battleWave(b) {
	const n = i => WAVES.charCodeAt(b + 21 * i) - 48;
	const e = n(2) * 10 + n(3);
	return [n(0) * 10 + n(1), e, e];
}


// 21×2 chars, bitmap 6-bit: kind in bits 0-2, lvl in 3-5 (base 64 like sprites)
/*const WAVES = "XP`PhXIPQ`YhJhRIZQYQaRaQbRbQiQiZiYKbjZKjLK";

function battleWave(b) {
	const n = i => (i = WAVES.charCodeAt(b * 2 + i), (i & 7) * 10 + (i >> 3 & 7));
	return [n(0), n(1), n(1)];
}*/


// levels 2-5 color palettes, level 1 uses the unit's own palette
const EnemyPalettes = [
	// 2 - leprechaun
	["d72", "3d2", "d32", "eb2"],
	// 3 - hydra
	["396", "bd2", "382", "bce"],
	// 4 - serpent
	["456" ,"ce2", "382", "bde"]
]

const UP = [0, -1];
const RIGHT = [1, 0];
const DOWN = [0, 1];
const LEFT = [-1, 0];

const ROOK = [UP, RIGHT, DOWN, LEFT];
// 4 rook dirs, 4 bishop dirs, 8 knight jumps - masked unit rays
const DIRS = [...ROOK, [1, 1], [1, -1], [-1, 1], [-1, -1], [1, -2], [-1, -2], [2, -1], [-2, -1], [1, 2], [-1, 2], [2, 1], [-2, 1]];
// move/atk type - the rays a unit is spawned with: 0:+, 1:x 2:*, 3:knight, 4:around
const RAYBASE = [[1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 1, 1]];

// [dx, dy, steps] per live direction, so rook and bishop can reach different distances
function rayList(g) {
	const out = [];
	for (let i = 0; i < 16; i++) {
		const n = g[i < 4 ? 0 : i < 8 ? 1 : 2];
		if (n) out.push([DIRS[i][0], DIRS[i][1], n]);
	}
	return out;
}

// A unit can upgrade its rays until the limits rn/rc set in unit settings are reached.
// The shorter rays rook/bishop (R/B) are first, knight (K) is last. Summary:
// knight * 100 + maxRook * 10 + maxBishop, so 121 reads "up to R2/B1, finally K".
function upgradeRay(t, lim, n) {
	const base = RAYBASE[t] || RAYBASE[0];
	let r = base[0];
	let b = base[1];
	let k = base[2];
	const mr = lim / 10 % 10 | 0;
	const mb = lim % 10;
	for (let i = 0; i < n; i++) {
		if (r < mr && (r <= b || b >= mb)) r ++;
		else if (b < mb) b ++;
		else if (lim > 99 && !k) k = 1;
		else break;
	}
	return [r, b, k];
}

// upgrades go like "R~1", "B~1", "K", or 0 once maxed
function rayStep(t, lim, n) {
	const a = upgradeRay(t, lim, n);
	const b = upgradeRay(t, lim, n + 1);
	return b[0] > a[0] ? "R" + b[0] : b[1] > a[1] ? "B" + b[1] : b[2] > a[2] ? "K" : 0;
}

function rayText(g) {
	g.pop || (g = [g / 10 % 10 | 0, g % 10, g > 99]);
	let s = g[0] ? "R" + g[0] : "";
	if (g[1]) s += (s && "-") + "B" + g[1];
	if (g[2]) s += (s && "-") + "K";
	return s;
}

function inBounds(x, y) {
	return x >= 0 && y >= 0 && x < boardWidth && y < boardHeight;
}

function isMapTile(x, y) {
	return inBounds(x, y) && !obstacles[y][x];
}

function initBoard() {
	const levelData = menu == 1 ? makeRandomLevel(40) : getLevelData(levelIndex);
	boardHeight = levelData.length;
	boardWidth = levelData[0].length;
	enemies = [];
	obstacles = [];
	coins = [];
	exits = [];
	rescues = [];
	stageCaptive = 0;
	stageItem = 0;
	unrescueLevel(levelIndex);
	rescueDying = [];
	pathData = [];
	pathStep = [];
	fillData = [];
	pathTrail = [];
	moveLog = [];
	pathCount = 0;
	retractX = -1;
	hopping = 0;
	enemiesTotal = 0;
	enemiesCleared = 0;
	coinsCollected = 0;
	moveCount = 0;
	levelScore = 0;
	totalScore = scoreStart;
	scoreBanked = 0;
	leftTotalThisLevel = 0;
	leftUnitsThisLevel = [0, 0, 0, 0, 0];
	revealPlayerTile = 0;
	state = 1;
	showEnd = 0;
	battleResult = 0;
	showObjective = !menu;
	moving = 0;

	let startX = 0;
	let startY = 0;
	let capIdx = 0;
	if (!levelCaptives[levelIndex]) levelCaptives[levelIndex] = [];

	for (let y = 0; y < boardHeight; y++) {
		enemies[y] = [];
		obstacles[y] = [];
		coins[y] = [];
		exits[y] = [];
		rescues[y] = [];
		rescueDying[y] = [];
		pathData[y] = [];
		pathStep[y] = [];
		fillData[y] = [];
		for (let x = 0; x < boardWidth; x++) {
			const c = levelData[y][x];
			enemies[y][x] = c == 1 ? 1 + (levelIndex > 3 && RNG(2 + (levelIndex / 18 | 0))) : 0;
			obstacles[y][x] = c == 3 ? 1 : 0;
			coins[y][x] = +(c == 4);
			exits[y][x] = c == 8 ? 1 : 0;
			rescues[y][x] = 0;
			if (c == 9 && !puzzleMode) {
				let bmp = levelCaptives[levelIndex][capIdx];
				if (!bmp) {
					bmp = pickRescueBmp();
					levelCaptives[levelIndex].push(bmp);
				}
				capIdx ++;
				rescues[y][x] = bmp;
				if (!stageCaptive) stageCaptive = bmp;
			}
			rescueDying[y][x] = 0;
			if (c == 1) enemiesTotal ++;
			pathData[y][x] = 0;
			pathStep[y][x] = 0;
			fillData[y][x] = 0;
			if (c == 2) {
				startX = x;
				startY = y;
			}
		}
	}

	if (!stageCaptive) {
		const spots = [];
		for (let y = 0; y < boardHeight; y++) {
			for (let x = 0; x < boardWidth; x++) {
				if (enemies[y][x] && Math.abs(x - startX) + Math.abs(y - startY) > 1) spots.push([x, y]);
			}
		}
		if (spots.length) {
			const s = spots[RNG(spots.length)];
			enemies[s[1]][s[0]] = 0;
			enemiesTotal --;
			rescues[s[1]][s[0]] = 1;
			stageItem = 1;
		}
	}

	player = new Player(startX, startY);
	if (menu != 1) placeStartPath(startX, startY);
	buildRainbowBackdrop();
}

function isPassable(x, y, dx, dy) {
	if (!inBounds(x, y) || enemies[y][x] || obstacles[y][x] || fillData[y][x] == 1 || pathStep[y][x]) return 0;
	if (rescues[y][x] && !rescueDying[y][x]) return 0;
	if (exits[y][x] && remainingRescue()) return 0;
	return 1;
}

function leprechaunType(v) {
	return v > 5 ? v - 5 : v;
}

function leprechaunDying(v) {
	return v > 5;
}

function isLeprechaunAlive(v) {
	return v > 0 && v < 6;
}

function isJailed(x, y) {
	return rescues[y][x] && !rescueDying[y][x];
}

function inGroup(x, y) {
	return isLeprechaunAlive(enemies[y][x]) || isJailed(x, y);
}

function anyDying() {
	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			if (leprechaunDying(enemies[y][x]) || rescueDying[y][x]) return 1;
		}
	}
	return 0;
}

function countEnemiesLeft() {
	leftTotalThisLevel = 0;
	leftUnitsThisLevel = [0, 0, 0, 0, 0];
	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			const v = enemies[y][x];
			if (!isLeprechaunAlive(v)) continue;
			leftTotalThisLevel ++;
			leftUnitsThisLevel[v - 1] ++;
		}
	}
}

function waitDelay(callback, frames = 30) {
	tween({}, frames, {}, callback);
}

function reviveDyingEnemies() {
	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			if (leprechaunDying(enemies[y][x])) {
				enemies[y][x] = leprechaunType(enemies[y][x]);
				fillData[y][x] = 0;
			}
			if (rescueDying[y][x]) {
				rescueDying[y][x] = 0;
				fillData[y][x] = 0;
			}
		}
	}
}

function getClusters() {
	const seen = [];
	const clusters = [];
	for (let y = 0; y < boardHeight; y++) {
		seen[y] = [];
		for (let x = 0; x < boardWidth; x++) seen[y][x] = 0;
	}

	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			if (!inGroup(x, y) || seen[y][x]) continue;
			const cluster = [];
			const stack = [[x, y]];
			seen[y][x] = 1;
			while (stack.length) {
				const cur = stack.pop();
				const cx = cur[0];
				const cy = cur[1];
				cluster.push(cur);
				const dirs = ROOK;
				for (let i = 0; i < 4; i++) {
					const nx = cx + dirs[i][0];
					const ny = cy + dirs[i][1];
					if (inBounds(nx, ny) && inGroup(nx, ny) && !seen[ny][nx]) {
						seen[ny][nx] = 1;
						stack.push([nx, ny]);
					}
				}
			}
			clusters.push(cluster);
		}
	}
	return clusters;
}

function isClusterSurrounded(cluster) {
	for (let i = 0; i < cluster.length; i++) {
		const x = cluster[i][0];
		const y = cluster[i][1];
		for (let d = 0; d < 4; d++) {
			const nx = x + ROOK[d][0];
			const ny = y + ROOK[d][1];
			if (!inBounds(nx, ny)) continue;
			if (obstacles[ny][nx] || rescues[ny][nx]) continue; // wall / cell seals this side
			let inCluster = 0;
			for (let j = 0; j < cluster.length; j++) {
				if (cluster[j][0] == nx && cluster[j][1] == ny) inCluster = 1;
			}
			if (inCluster) continue;
			if (!isPath(nx, ny) && !fillData[ny][nx]) return 0;
		}
	}
	return 1;
}

function markClusterDying(cluster, ahead) {
	for (let i = 0; i < cluster.length; i++) {
		const x = cluster[i][0];
		const y = cluster[i][1];
		if (isLeprechaunAlive(enemies[y][x])) enemies[y][x] += 5;
		if (rescues[y][x]) rescueDying[y][x] = 1;
		fillData[y][x] = 1;
	}
	if (rainbowAnim) rainbowDone = 2;
	else {
		rainbowDone = 0;
		rainbowWait = 0;
	}
	sfx(ahead ? "048" : "840");
}

function flushDyingEnemies() {
	const flushed = [];
	let n = 0;
	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			if (leprechaunDying(enemies[y][x])) {
				const kind = leprechaunType(enemies[y][x]);
				enemies[y][x] = 0;
				fillData[y][x] = 1;
				enemiesCleared ++;
				flushed.push([x, y, 0, kind]);
				n = 1;
			}
			const rescued = collectRescue(x, y);
			if (rescued) flushed.push(rescued);
		}
	}
	if (n) sfx("7<C");// capture enemy
	return flushed;
}

function restoreFlushed(flushed) {
	for (let i = 0; i < flushed.length; i++) {
		const x = flushed[i][0];
		const y = flushed[i][1];
		const bmp = flushed[i][2];
		fillData[y][x] = 0;
		if (bmp) {
			rescues[y][x] = bmp;
			rescueDying[y][x] = 0;
			const k = rescuedUnits.indexOf(bmp);
			if (k >= 0) rescuedUnits.splice(k, 1);
		} else if (flushed[i][3] < 0) {
			coins[y][x] = 1;
			coinsCollected -= 5;
		} else {
			enemies[y][x] = flushed[i][3] || 1;
			enemiesCleared --;
		}
	}
}

function collectCoin(x, y) {
	if (!coins[y][x]) return 0;
	coins[y][x] = 0;
	coinsCollected += 5;
	sfx("QX");
	return [x, y, 0, -1];
}

function getCurrentContext() {
	return iconContext || gameContext;
}

function drawSparkle(x, y, size, frame) {
	blit(objectBitmaps[1 + (frame & 1)], x, y, size);
}

function pickRescueBmp() {
	const taken = {};
	for (let i = 0; i < rescuedUnits.length; i++) taken[rescuedUnits[i]] = 1;
	const placed = levelCaptives[levelIndex];
	if (placed) {
		for (let i = 0; i < placed.length; i++) taken[placed[i]] = 1;
	}
	const pool = [];
	for (let i = 1; i < UNITS.length; i++) {
		if (!taken[UNITS[i][0]]) pool.push(UNITS[i][0]);
	}
	if (!pool.length) for (let i = 1; i < UNITS.length; i++) pool.push(UNITS[i][0]);
	return pool[RNG(pool.length)];
}

function unrescueLevel(i) {
	const list = levelCaptives[i];
	if (!list) return;
	for (let j = 0; j < list.length; j++) {
		const k = rescuedUnits.indexOf(list[j]);
		if (k >= 0) rescuedUnits.splice(k, 1);
	}
}

function allyMod(name) {
	if (!unitMods[name]) unitMods[name] = [0, 0, 0, 0];
	return unitMods[name];
}

function getUnitDefinition(name) {
	for (let i = 0; i < UNITS.length; i++) {
		if (UNITS[i][0] == name) return UNITS[i];
	}
}

function makeUnit(data, x, y, type) {
	const unit = new Unit(data, x, y, type);
	if (!unit.enemy) {
		const mod = allyMod(data[0]);
		unit.hpMax += mod[0];
		unit.hp = unit.hpMax;
		unit.dmg += mod[1];
	}
	return unit;
}

function getEnemyPalette(kind, l) {
	return l > 1 ? EnemyPalettes[kind][l - 2] : unitData[kind + 3];
}

function collectRescue(x, y) {
	const k = rescues[y][x];
	if (!k || !rescueDying[y][x]) return 0;
	rescues[y][x] = 0;
	rescueDying[y][x] = 0;
	fillData[y][x] = 1;
	sfx(k == 1 ? "AEKSX" : "ACG"); // jewel vs hero
	if (k != 1 && rescuedUnits.indexOf(k) < 0) rescuedUnits.push(k);
	return [x, y, k];
}

function remainingRescue() {
	for (let y = 0; y < boardHeight; y++) {
		for (let x = 0; x < boardWidth; x++) {
			if (isJailed(x, y)) return 1;
		}
	}
	return 0;
}

function worldNumber() {
	return (levelIndex / 9 | 0) + 1;
}

function shadowNumber() {
	return ((levelIndex / 3 | 0) % 3) + 1;
}

function stageNumber() {
	return (levelIndex % 3) + 1;
}

function isPerfect() {
	if (leftTotalThisLevel) return 0;
	if (stageCaptive && rescuedUnits.indexOf(stageCaptive) < 0) return 0;
	return 1;
}

function stageScore() {
	return enemiesCleared * 10 + coinsCollected + (state == 2 && isPerfect() ? 100 : 0);
}

function currentScore() {
	return totalScore + (scoreBanked ? 0 : stageScore());
}

function calcLevelScore() {
	levelScore = stageScore();
	return levelScore;
}

function scheduleEndScreen() {
	sfx(state == 2 ? "ACGPU" : "QMIE");//"IMIPU"
	waitDelay(()=> {
		calcLevelScore();
		if (state == 2 && !scoreBanked) {
			totalScore += levelScore;
			scoreBanked = 1;
			if (isPerfect()) perfects ++;
		}
		hiscore = Math.max(hiscore, currentScore());

		showEnd = 1;
		endBtnCur = 1; // start on NEXT; clamps back to RETRY when it is the only one
		redraw();
	});
}

function drawUnitIcon(src, cx, cy, size, pal) {
	const d = !src || src.bgr != null ? src : getUnitDefinition(src);
	const bmp = unitBitmaps[d && d.bgr != null ? d.bgr : d ? d[5] : 0];
	if (pal == null) pal = d && (d.palette != null ? d.palette : d.pal != null ? d.pal : d[6]);
	const scale = size / Math.max(bmp.width, bmp.height);
	const dw = bmp.width * scale;
	const dh = bmp.height * scale;
	if (pal && pal.length ? pal : pal != null && bmp[2]) {
		drawPaletted(bmp, pal, cx - dw / 2, cy - dh / 2, dw, dh, getCurrentContext());
	} else getCurrentContext().drawImage(bmp, 0, 0, bmp.width, bmp.height, cx - dw / 2, cy - dh / 2, dw, dh);
}

function drawMoveArrows(size) {
	if (moving || state != 1 || menu || showObjective || showEnd) return;
	const blink = (time / 1000 | 0) % 3;
	for (let i = 0; i < 4; i++) {
		const nx = player.x + ROOK[i][0];
		const ny = player.y + ROOK[i][1];
		if (!puzzleMoveAt(nx, ny) || isPrevPath(nx, ny)) continue;
		if ((coins[ny][nx] || exits[ny][nx]) && blink) continue;
		blit(objectBitmaps[4 + i], boardOffsetX + nx * size, boardOffsetY + ny * size, size);
	}
}

function checkCaptures(flushAcc) {
	const clusters = getClusters();
	for (let i = 0; i < clusters.length; i++) {
		if (isClusterSurrounded(clusters[i])) markClusterDying(clusters[i], flushAcc);
	}

	if (exits[player.y][player.x] && !remainingRescue()) {
		const extra = flushDyingEnemies();
		if (flushAcc) for (let i = 0; i < extra.length; i++) flushAcc.push(extra[i]);
		countEnemiesLeft();
		revealPlayerTile = 1;
		state = 2;
		scheduleEndScreen();
	}
}

function dismissObjective() {
	if (!showObjective) return;
	showObjective = 0;
	redraw();
}

function nextLevel() {
	scoreStart = totalScore;
	if (!puzzleMode) {
		leftoverEnemies += leftTotalThisLevel;
		for (let i = 0; i < 5; i++) leftoverKinds[i] += leftUnitsThisLevel[i];
	}
	leftTotalThisLevel = 0;
	leftUnitsThisLevel = [0, 0, 0, 0, 0];
	if (!puzzleMode && levelIndex % 3 == 2) {
		startBattle();
	} else if (levelIndex < lastIndex()) {
		levelIndex ++;
		resetLevel();
	} else restartCampaign();
}

function clearLeftovers() {
	leftoverEnemies = 0;
	leftTotalThisLevel = 0;
	leftoverKinds = [0, 0, 0, 0, 0];
	leftUnitsThisLevel = [0, 0, 0, 0, 0];
}

function afterBattleWin() {
	applyUpgradePicks();
	clearLeftovers();
	showUpgrade = 0;
	upgradePicks = {};
	showPick = 0;
	battleActive = 0;
	battleResult = 0;
	scoreStart = totalScore;
	if (levelIndex < campaignLength - 1) {
		levelIndex ++;
		resetLevel();
	} else {
		restartCampaign();
	}
}

function restartCampaign() {
	clearLeftovers();
	rescuedUnits = [];
	levelCaptives = [];
	generatedLevels = [];
	unitMods = {};
	battleParty = [];
	battleActive = 0;
	showPick = 0;
	showUpgrade = 0;
	levelIndex = 0;
	lives = 3;
	perfects = 0;
	totalScore = 0;
	scoreStart = 0;
	scoreBanked = 0;
	menu = 1;
	endBtnCur = 0;
	resetLevel();
	gameStart();
}

function startMode(puz) {
	audio = audio || new AudioContext();
	puzzleMode = puz;
	menu = 0;
	resetLevel();
}

function togglePause() {
	if (menu == 1 || showPick || showUpgrade || showObjective || showEnd) return;
	if (menu) {
		menu = 0;
		redraw();
		gameStart();
	} else {
		menu = 2;
		endBtnCur = 0;
		cancelAnimationFrame(gameLoop);
		updateUI();
	}
}

function blit(src, px, py, s) {
	getCurrentContext().drawImage(src, 0, 0, tileWidth, tileWidth, px, py, s, s);
}

function bounce(x, y, dying) {
	return (time + x * 90 + y * 180) / (dying ? 180 : 720) & 1;
}

function fitBoard() {
	const crtTile = cellSize * 2, dpr = window.devicePixelRatio, title = menu == 1;
	const fitW = boardWidth + title * 2, fitH = boardHeight + title * 2;
	let zoom = Math.min(width / Math.max(fitW, 6), height / Math.max(fitH, 6)) * dpr / crtTile;
	if (title) zoom = Math.max(.5, Math.min(6 * dpr, zoom));
	else zoom = Math.max(1, Math.min(6 * dpr, zoom | 0));
	const pad = 2 + title * 2;
	const canvasW = Math.max(boardWidth + pad, width * dpr / zoom / crtTile + !title | 0) * crtTile;
	const canvasH = Math.max(boardHeight + pad, height * dpr / zoom / crtTile + !title | 0) * crtTile;
	if (gc.width - canvasW | gc.height - canvasH) {
		gc.width = canvasW;
		gc.height = canvasH;
		gameContext.scale(2, 2);
		gameContext.imageSmoothingEnabled = 0;
		const c = document.createElement("canvas"), x = c.getContext("2d");
		c.width = 1;
		c.height = 2;
		x.fillStyle = "#8484";
		x.fillRect(0, 0, 1, 1);
		scanHPattern = gameContext.createPattern(c, "repeat");
	}
	viewScale = zoom / dpr;
	viewLeft = (width - canvasW * viewScale) / 2;
	viewTop = (height - canvasH * viewScale) / 2;
	gc.style.width = canvasW * viewScale + "px";
	gc.style.height = canvasH * viewScale + "px";
	gc.style.left = viewLeft + "px";
	gc.style.top = viewTop + "px";
	boardOffsetX = canvasW - boardWidth * crtTile >> 2;
	boardOffsetY = canvasH - boardHeight * crtTile >> 2;
	return cellSize;
}

function drawBoard() {
	if (!battleActive) {
		rainbowPulse = anyDying() || state == 2;
		scrollRainbow();
	}
	const size = fitBoard();
	const ox = boardOffsetX, oy = boardOffsetY;
	const vw = gc.width / 2, vh = gc.height / 2;
	for (let gy = -oy / size - 1 | 0; gy < (vh - oy) / size + 1 | 0; gy++) {
		for (let gx = -ox / size - 1 | 0; gx < (vw - ox) / size + 1 | 0; gx++) {
			const px = ox + gx * size, py = oy + gy * size;
			if (!isMapTile(gx, gy)) {
				drawPaletted(backgroundsBitmaps[0], 1, px, py, size, size, gameContext);
				let m = 0;
				for (let i = 4; i--;) if (isMapTile(gx + ROOK[i][0], gy + ROOK[i][1])) m |= 1 << i;
				if (m) blit(backgroundsBitmaps[m], px, py, size);
				continue;
			}
			if (battleActive) {
				blit(backgroundsBitmaps[0], px, py, size);
				continue;
			}
			const onPlayer = gx == player.x && gy == player.y;
			let tipOnly = 0;
			if (onPlayer && pathStep[gy][gx] && !revealPlayerTile) {
				let visits = 0;
				for (let i = 0; i < pathTrail.length; i++) {
					if (pathTrail[i][0] == gx && pathTrail[i][1] == gy) visits ++;
				}
				const tip = pathTrail[pathTrail.length - 1];
				tipOnly = tip && tip[0] == gx && tip[1] == gy && visits <= 1;
			}
			if (fillData[gy][gx] || (pathStep[gy][gx] && !tipOnly)) drawPurifiedTile(gx, gy);
			else blit(backgroundsBitmaps[0], px, py, size);
			if (exits[gy][gx]) {
				if (!puzzleMoveAt(gx, gy) || isPrevPath(gx, gy) || (time / 1000 | 0) % 3) {
					drawSparkle(px, py, size, (time / 180 | 0) + gx + gy);
				}
			} else if (coins[gy][gx]) {
				if (!puzzleMoveAt(gx, gy) || isPrevPath(gx, gy) || (time / 1000 | 0) % 3) {
					const cs = size * 2 / 3;
					drawPaletted(objectBitmaps[8], 0,
						px + (size - cs) / 2, py + size - cs, cs, cs, gameContext);
				}
			}
		}
	}

	if (battleActive) {
		const hero = (battleControl || battleSelect || 0).hero;
		for (let i = 0; i < battleTiles.length; i++) {
			const bt = battleTiles[i];
			const aimed = battleAim && battleHinted(bt.x, bt.y);
			gameContext.fillStyle = "#" + (bt.kind ? "f45" : hero ? "fe8" : "9f8") + (aimed ? "c" : bt.live ? "8" : "4");
			gameContext.fillRect(ox + bt.x * size, oy + bt.y * size, size, size);
			if (aimed) outlineUnit(bt, size, bt.kind ? "#f89" : "#fe8", 0.06, 2);
		}
		if (battleSelect && battleSelect != battleControl && battleSelect.hp > 0) {
			outlineUnit(battleSelect, size, battleSelect.enemy ? "#f89" : "#fe6", 0.05, 2);
		}
	} else if (menu != 1) drawFlowingPath(); 

	for (let y = 0; y < boardHeight; y++) {
		if (battleActive) {
			for (let i = 0; i < battleUnits.length; i++) {
				const u = battleUnits[i];
				if ((u.hp > 0 || u.shake) && (u.y + u.offsetY | 0) == y) u.draw(size);
			}
		} else {
			for (let x = 0; x < boardWidth; x++) {
				const px = ox + x * size, py = oy + y * size, r = rescues[y][x], k = enemies[y][x];
				const hop = bounce(x, y, r == 1 ? rescueDying[y][x] : leprechaunDying(k)) * size / 8;
				if (r == 1) {
					blit(objectBitmaps[0], px, py - hop, size);
				} else if (r) {
					drawUnitIcon(r, px + size / 2, py + size / 2, size);
					if (!rescueDying[y][x]) blit(objectBitmaps[3], px, py, size);
				}
				if (k) {
					drawUnitIcon({bgr: 2, palette: getEnemyPalette(0, leprechaunType(k))},
					px + size / 2, py + size / 2 - hop, size);
				}
			}
			if ((player.y + player.offsetY | 0) == y) player.draw();
		}
	}

	if (!battleActive && menu != 1) {
		drawMoveArrows(size);
	}
	gameContext.save();
	gameContext.scale(.5, .5);
	gameContext.globalCompositeOperation = "hard-light";
	gameContext.fillStyle = scanHPattern;
	gameContext.fillRect(0, 0, gc.width, gc.height);
	gameContext.restore();
}
