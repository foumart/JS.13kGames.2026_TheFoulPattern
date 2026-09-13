// Random puzzle map generator

let generatedLevels = [];
const genDirs = ROOK;

function hasRescue(stage) {
	return stage < 9 ? stage % 3 == 2 || stage == 7 : stage % 9 > 6;
}

function titleWH() {
	const s = 6, b = 2;
	return portrait ? [s, Math.max(s, (s + b) * height / width - b + .5 | 0)] : [Math.max(s, (s + b) * width / height - b + .5 | 0), s];
}

function getLevelData(stage) {
	return generatedLevels[stage] || (generatedLevels[stage] = makeRandomLevel(stage));
}

/*for (let stage = 0; stage < 63; stage++) {
    const world = stage / 9 | 0, slot = stage % 9;
    let width = world ? 8 + world - (world > 3) - 3 * (world < 3) - (world > 4) + (slot > 1) + (slot > 5) : stage < 2 ? 6 : 7 + (stage > 6);
    let height = world ? 6 + 2 * (world > 2) + (world > 3) : 5;
    console.log("level", stage + 1, ":", width, "x", height, "short", Math.min(width, height), (slot % 3 == 2 ? "-" : ""));
    if (slot == 8) console.log("world", world + 1, "battle")
}*/

// the trail the generator walks is the solution - pockets are filled with enemies
function makeRandomLevel(stage) {
	const progress = stage;
	let width, height;
	if (puzzleMode) {
		width = Math.min(16, 6 + ((stage + 1) / 9 | 0));
		height = Math.min(9, 5 + ((stage + 1) / 18 | 0));
	} else {
		const world = stage / 9 | 0, slot = stage % 9;
		width = world ? 8 + world - (world > 3) - 3 * (world < 3) - (world > 4) + (slot > 1) + (slot > 5) : stage < 2 ? 6 : 7 + (stage > 6);
		height = world ? 6 + 2 * (world > 2) + (world > 3) : 5;
	}

	if (menu == 1) {
		const s = titleWH();
		width = s[0];
		height = s[1];
	} else {
		if (portrait == width > height) {
			const swap = width;
			width = height;
			height = swap;
		}
		portrait ? width = Math.min(9, width) : height = Math.min(9, height);
	}

	const area = width * height;
	let want = progress < 3 ? 2 + progress * 2 : area / 6 + RNG(3) | 0;

	if (hasRescue(progress)) want += 2;

	function inMap(x, y) { return (x | y) >= 0 && x < width && y < height; }
	function id(x, y) { return x + y * width; }

	// keep seeds a tile apart so each one becomes its own pocket
	function hasRoom(seed, x, y) {
		for (let d = 9; d--;) {
			const ax = x + d % 3 - 1;
			const ay = y + (d / 3 | 0) - 1;
			if (inMap(ax, ay) && seed[id(ax, ay)]) return 0;
		}
		return 1;
	}

	function scatterSeeds() {
		const seed = [];
		let tint = 0;
		function plant(x, y, kind) {
			const shade = (x + y & 1) * 2 - 1;
			if (tint * shade > 0 || !hasRoom(seed, x, y)) return 0;
			seed[id(x, y)] = kind;
			tint += shade;
			return 1;
		}
		for (let n = want * 30, left = want; n -- && left;) {
			if (plant(1 + RNG(width - 2), 1 + RNG(height - 2), 1)) left --;
		}
		let blockTiles = 2 + RNG(3) + ((area - 56) / 24 | 0) + (progress / 9 | 0);
		for (let n = blockTiles * 8; n -- && blockTiles;) {
			const rim = progress < 5 || RNG(2);
			const e = RNG(4);
			const x = rim ? (e < 2 ? RNG(width) : e == 2 ? 0 : width - 1) : 1 + RNG(width - 2);
			const y = rim ? (e < 2 ? (e ? height - 1 : 0) : RNG(height)) : 1 + RNG(height - 2);
			if (plant(x, y, 2)) blockTiles --;
		}
		return seed;
	}

	// prevent crossing the trail itself
	function carveTrail(seed) {
		const at = [];
		let head;
		do {
			head = RNG(area);
		} while (seed[head]);
		const trail = [head];
		at[head] = 0;
		for (let n = area * 40; n --;) {
			if (RNG(2)) {
				trail.reverse();
				for (let i = trail.length; i --;) at[trail[i]] = i;
			}
			const last = trail.length - 1;
			const p = trail[last];
			const d = genDirs[RNG(4)];
			const x = p % width + d[0];
			const y = (p / width | 0) + d[1];
			if (!inMap(x, y)) continue;
			const k = id(x, y);
			if (seed[k]) continue;
			const j = at[k];
			if (j == null) {
				at[k] = trail.length;
				trail.push(k);
			} else if (j < last - 1) {
				for (let a = j + 1, b = last; a < b; a ++, b --) {
					const t = trail[a];
					trail[a] = trail[b];
					trail[b] = t;
					at[trail[a]] = a;
					at[trail[b]] = b;
				}
			}
		}
		const hits = [];
		for (let i = trail.length; i --;) hits[trail[i]] = (hits[trail[i]] || 0) + 1;
		while (hits[trail[0]] > 1) hits[trail.shift()] --;
		for (let gap; hits[trail[trail.length - 1]] > 1
			|| (gap = Math.abs(trail[0] - trail[trail.length - 1]), gap == 1 || gap == width);) {
			hits[trail.pop()] --;
		}
		return trail;
	}

	// pocket - sealed tile where every tile around it is trail
	function floodPocket(k, on, seen) {
		const stack = [k];
		const cells = [];
		seen[k] = 1;
		while (stack.length) {
			const c = stack.pop();
			cells.push(c);
			for (let d = 4; d --;) {
				const x = c % width + genDirs[d][0];
				const y = (c / width | 0) + genDirs[d][1];
				const n = id(x, y);
				if (!inMap(x, y) || on[n] || seen[n]) continue;
				seen[n] = 1;
				stack.push(n);
			}
		}
		return cells;
	}

	// seed array holds what's pre-placed on each tile before the carve
	// (1:leprechaun, 2:block)
	let trail;
	let seed;
	let holes;
	let path;
	let best = 0;
	for (let tries = 9; tries --;) {
		const s = scatterSeeds();
		const t = carveTrail(s);
		const on = [];
		const rows = [];
		const cols = [];
		let cross = 0;
		for (let i = t.length; i --;) {
			if (on[t[i]]) cross ++;
			on[t[i]] = 1;
			rows[t[i] / width | 0] = 1;
			cols[t[i] % width] = 1;
		}
		let walls = 0;
		for (let y = height; y --;) if (!rows[y]) walls ++;
		for (let x = width; x --;) if (!cols[x]) walls ++;
		const seen = [];
		const p = [];
		let spawns = 0;
		let waste = 0;
		for (let k = area; k --;) {
			if (on[k] || seen[k]) continue;
			const cells = floodPocket(k, on, seen);
			p.push(cells);
			if (cells.length > 3) waste += cells.length * cells.length;
			else if (s[cells[0]] != 2) spawns += cells.length;
		}
		const score = (spawns < want ? spawns : want) * 9 - cross * 9999 - waste - walls * 9999;
		if (!holes || score > best) {
			best = score;
			trail = t;
			seed = s;
			holes = p;
			path = on;
		}
		if (spawns >= want && !waste && !cross) break;
	}

	const grid = [];
	for (let y = 0; y < height; y++) {
		grid[y] = [];
		for (let x = 0; x < width; x++) grid[y][x] = 0;
	}

	// The trail runs from the Player to the exit - start at its lower end
	const tail = trail[trail.length - 1];
	const from = trail[0] > tail ? trail[0] : tail;
	const to = trail[0] > tail ? tail : trail[0];
	const exitX = to % width;
	const exitY = to / width | 0;

	// Pockets of 3 or less spawn leprechauns, the rest turn to blocks.
	// Tiles touching the exit turn to blocks too.
	const enemies = [];
	let far = 0;
	for (let i = holes.length; i --;) {
		const cells = holes[i];
		let rock = cells.length > 3 || enemies.length + cells.length > want;
		let beside = 0;
		for (let j = cells.length; j --;) {
			if (seed[cells[j]] == 2) rock = 1;
			if (Math.abs(cells[j] % width - exitX) + Math.abs((cells[j] / width | 0) - exitY) < 2) beside = 1;
		}
		for (let j = cells.length; j --;) {
			const x = cells[j] % width;
			const y = cells[j] / width | 0;
	grid[y][x] = rock ? (cells.length == 1 && !RNG(4) ? 0 : 3) : beside ? 0 : 1;
			if (!rock && !beside) {
				enemies.push([x, y]);
				far |= Math.abs(x - from % width) + Math.abs(y - (from / width | 0)) > 1;
			}
		}
	}

	if (!(hasRescue(progress) ? enemies.length : far) || progress > 2 && enemies.length < area / 11)
		return makeRandomLevel(stage);

	// start / end
	grid[from / width | 0][from % width] = 2;
	grid[to / width | 0][to % width] = 8;

	// gold coins on the trail
	const loot = 1 + (progress > 2 && 1 + (progress > 8 && RNG(2)));
	const pool = [];
	for (let k = area; k--;) if (!grid[k / width | 0][k % width] && path[k]) pool.push(k);
	for (let n = loot, i = pool.length; n && i; n--) {
		const k = pool.splice(RNG(i--), 1)[0];
		grid[k / width | 0][k % width] = 4;
	}

	if (hasRescue(progress) && progress % 9 != 8 && enemies.length) {
		const prison = enemies[RNG(enemies.length)];
		grid[prison[1]][prison[0]] = 9;
	}
	return grid;
}
