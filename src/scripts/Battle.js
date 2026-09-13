// expanded on https://www.foumartgames.com/games/AnimalTactics/ (lazer chess)
// by Noncho Savov' 2020
// All Rights reserved!

let battleActive = 0;
let battleUnits = [];
let battleSelect = null;
let battleControl = null;
let battlePhase = 0; // 0 player, 1 enemy
let thinking = 0;
let animating = 0;
let battleResult = 0; // 0 playing, 2 win, 3 lose
let battleAim = null; // {dx, dy} first keyboard direction
let battleTiles = []; // {x, y, kind} kind: 0 move, 1 attack
let battleHints = []; // currently aimed
let unicornWait = 0;
let battleEpoch = 0; // bumped to drop stale AI timeouts
let showPick = 0;
let showUpgrade = 0;
let battleParty = [];
let pickCursor = 0;
let upgradePicks = {};
let upgradeCurUnit = 0;
let upgradeCurOpt = 0;

function startBattle() {
	battleActive = 1;
	showEnd = 0;
	showUpgrade = 0;
	upgradePicks = {};
	showPick = 0;
	showObjective = 0;
	state = 1;
	battleResult = 0;
	animating = 0;
	thinking = 0;
	battleEpoch ++;
	battleAim = null;
	battleTiles = [];
	battleHints = [];
	battleControl = null;
	totalScore = scoreStart;
	battleUnits = [];
	for (let i = rescuedUnits.length; i--;) if (rescuedUnits[i] == 1) rescuedUnits.splice(i, 1);
	const n = rescuedUnits.length;
	battleParty = rescuedUnits.slice().sort((a, b) => upgradeLvl({name: b}) - upgradeLvl({name: a})).slice(0, 2);
	pickCursor = n ? rescuedUnits.indexOf(battleParty[0]) : 0;
	if (n) showPick = 1;
	else {
		spawnBattleParty();
		showObjective = 1;
	}
	updateUI();
}

// used when placing enemies for battle
function clearRock(x, y) {
	if (obstacles[y]) obstacles[y][x] = 0;
}

// portrait: enemies on y=0, heroes on y=H-2; landscape: heroes on x=1, enemies on x=W-2
function battleEdge(ally) {
	const w = boardWidth > boardHeight;
	const m = (w ? boardHeight : boardWidth) / 2 | 0;
	return w ? [ally ? 1 : boardWidth - 2, m, 0, 1] : [m - (ally && !(boardWidth & 1) | 0), ally ? boardHeight - 2 : 0, 1, 0];
}

function spawnBattleParty() {
	const e = battleEdge(1);
	battleUnits = [];
	const add = (def, d) => {
		const x = e[0] + e[2] * d, y = e[1] + e[3] * d;
		clearRock(x, y);
		battleUnits.push(makeUnit(getUnitDefinition(def), x, y));
	};
	add(UNITS[0][0], 0);
	for (let i = 0; i < battleParty.length && i < 2; i++) add(battleParty[i], i ? 2 : -2);
	spawnEnemies();
	beginRound();
}

function confirmParty() {
	if (!showPick) return;
	const need = Math.min(2, rescuedUnits.length);
	if (battleParty.length < need) return;
	showPick = 0;
	spawnBattleParty();
	redraw();
}

function pickPartyBmp(bmp) {
	if (!bmp) return;
	const i = battleParty.indexOf(bmp);
	if (i >= 0) battleParty.splice(i, 1);
	else if (battleParty.length < 2) battleParty.push(bmp);
	redraw();
}

function pickCursorUnit() {
	pickPartyBmp(rescuedUnits[pickCursor]);
}

function movePickCursor(dir) {
	const n = rescuedUnits.length;
	if (!n) return;
	pickCursor = (pickCursor + dir + n) % n;
	redraw();
}

function toggleParty(bmp) {
	const i = rescuedUnits.indexOf(bmp);
	if (i >= 0) pickCursor = i;
	pickPartyBmp(bmp);
}

function battleRoster(aliveOnly, foes) {
	const list = [];
	for (const unit of battleUnits) {
		if (unit.enemy == !!foes && (!aliveOnly || unit.hp > 0)) list.push(unit);
	}
	return list;
}

function upgradeId(u) {
	return u.hero ? 0 : u.name;
}

// 1 hp, 2 dmg, 3 move ray, 4 attack ray, 5 around, 6 life
// 3 and 4 unlock after a few picks; unicorn gets 5, then 4 (R1/B1/R2) and 6
function upgradeLvl(u) {
	const m = allyMod(u.name);
	return m[0] / 2 + m[1] + m[2] + m[3] + !!m[4];
}

function upgradeKinds(unit, all) {
	if (!unit || unit.hp <= 0) return [];
	const m = allyMod(unit.name);
	const kinds = [1, 2];
	if (rayStep(unit.mv, unit.range, m[2])) kinds.push(3);
	if ((!unit.hero || m[4]) && rayStep(unit.atk, unit.reach, m[3])) kinds.push(4);
	if (unit.hero) kinds.push(m[4] ? 6 : 5);
	return all ? kinds : kinds.slice(0, 2 + Math.min(2, upgradeLvl(unit)));
}

function upgradeRows() {
	const list = battleRoster(1);
	const rows = [];
	for (const b of list) {
		const kinds = upgradeKinds(b);
		if (kinds.length) rows.push({u: b, id: upgradeId(b), kinds});
	}
	return rows;
}

function defaultUpgradePicks() {
	upgradePicks = {};
	upgradeCurUnit = 0;
	upgradeCurOpt = 0;
	const rows = upgradeRows();
	for (const c of rows) upgradePicks[c.id] = 1;
}

function setUpgrade(id, kind) {
	upgradePicks[id] = kind;
	const rows = upgradeRows();
	for (let i = 0; i < rows.length; i++) {
		if (rows[i].id != id) continue;
		upgradeCurUnit = i;
		const j = rows[i].kinds.indexOf(kind);
		if (j >= 0) upgradeCurOpt = j;
	}
	redraw();
}

// After the last unit comes RETRY / NEXT buttons
function moveUpgradeCursor(dx, dy) {
	const rows = upgradeRows();
	if (!rows.length) return;
	const last = rows.length;
	upgradeCurUnit = (upgradeCurUnit + dy + last + 1) % (last + 1);
	if (upgradeCurUnit == last) {
		moveEndCursor(dx);
		redraw();
		return;
	}
	const n = rows[upgradeCurUnit].kinds.length;
	upgradeCurOpt = dx ? (upgradeCurOpt + dx + n) % n : Math.min(upgradeCurOpt, n - 1);
	redraw();
}

function pickUpgradeCursor() {
	const rows = upgradeRows();
	if (upgradeCurUnit >= rows.length) {
		activateEndButton();
		return;
	}
	const row = rows[upgradeCurUnit];
	if (!row) return;
	const kind = row.kinds[upgradeCurOpt];
	if (kind) setUpgrade(row.id, kind);
}

function applyUpgradePicks() {
	const list = battleRoster(1);
	for (const unit of list) {
		const k = upgradePicks[upgradeId(unit)];
		if (!k) continue;
		const m = allyMod(unit.name);
		if (k > 5) lives++;
		else if (k > 4) m[4] = 1;
		else m[k - 1] += k < 2 ? 2 : 1;
	}
}

function smarten(u, on) {
	u.smart = on;
	return u;
}

function createEnemy(kind, x, y, level) {
	if (kind > 2) return smarten(makeUnit(ENEMIES[kind - 3], x, y, 5), 1);
	level = level > 5 ? 5 : level || 1;
	return smarten(makeUnit([
		,
		// unitType: 0 leprechaun, 1 hydra, 2 serpent
		// HP
		kind ? 4 * level + (kind > 1 ? 4 : level < 2) : level + 1,
		// DMG
		kind ? kind > 1 ? level + 4 + (level == 3) - (level == 4) : level + 1 + (level > 1) + (level > 4) : level + 1 >> 1,
		// move & attack rays
		kind && 2,
		kind ? 2 : 1,
		2 + kind,
		getEnemyPalette(kind, level),
		// enemies are created at their ray ceiling
		[0, 11, 121][kind],
		!kind && level > 3 && 2
	], x, y, kind ? kind < 2 || level > 3 ? 4 : 6 : 3), kind && level > 3);
}

function spawnEnemies() {
	const e = battleEdge();
	const wave = battleWave(levelIndex / 3 | 0);
	for (let i = 0; i < wave.length; i++) {
		const v = wave[i], d = [0, -2, 2][i];
		const x = e[0] + e[2] * d, y = e[1] + e[3] * d;
		clearRock(x, y);
		battleUnits.push(createEnemy(v / 10 | 0, x, y, v % 10));
	}
	const queue = [];
	for (let k = 0; k < 5; k++) {
		for (let q = leftoverKinds[k]; q--;) queue.push(k + 1);
	}
	let n = queue.length;
	const spots = [];
	for (let y = 0; y < (e[2] ? 3 : boardHeight); y++) {
		for (let x = e[2] ? 0 : boardWidth - 3; x < boardWidth; x++) {
			if (getUnitAt(x, y) || hasObstacle(x, y)) continue;
			spots.push([x, y]);
		}
	}
	if (n > spots.length) n = spots.length;
	for (let i = spots.length - 1; i > 0; i--) {
		const j = RNG(i + 1);
		const t = spots[i];
		spots[i] = spots[j];
		spots[j] = t;
	}
	for (let i = 0; i < n; i++) {
		battleUnits.push(createEnemy(0, spots[i][0], spots[i][1], queue[i]));
	}
}

function hasObstacle(x, y) {
	return obstacles[y] && obstacles[y][x];
}

function resetBattle() {
	startBattle();
}

function getUnitAt(x, y) {
	for (const u of battleUnits) {
		if (u.hp > 0 && u.x == x && u.y == y) return u;
	}
	return null;
}

function isMapEmptyAt(x, y) {
	return inBounds(x, y) && !getUnitAt(x, y) && !hasObstacle(x, y);
}

function checkForBattleEnd() {
	if (battleResult) return 1;
	let p = 0, e = 0, hero = 0;
	for (const u of battleUnits) {
		if (u.hp <= 0) continue;
		if (u.enemy) e ++;
		else {
			p ++;
			hero |= u.hero;
		}
	}
	if (!p || !hero || !e) {
		battleFinish(!p || !hero ? 3 : 2);
		return 1;
	}
}

function battleFinish(result) {
	battleEpoch ++;
	battleResult = result;
	state = result;
	animating = 0;
	thinking = 0;
	battleTiles = [];
	battleHints = [];
	if (result == 3) --lives;
	if (result == 2 && levelIndex < campaignLength - 1) {
		showUpgrade = 1;
		defaultUpgradePicks();
	}
	scheduleEndScreen();
}

function getNextUnit() {
	for (const u of battleUnits) {
		if (u.hp > 0 && u.hero && !u.acted) return u;
	}
	return null;
}

function beginRound() {
	if (checkForBattleEnd()) return;
	battlePhase = 0;
	thinking = 0;
	battleAim = null;
	battleTiles = [];
	battleHints = [];
	for (const f of battleUnits) {
		f.moved = 0;
		f.acted = 0;
	}
	const unit = getNextUnit();
	if (unit) selectUnit(unit);
	else nextRoundPhase();
}

function selectUnit(u) {
	unicornWait = 0;
	battleControl = u && u.hero && u.hp > 0 && !(u.moved && u.acted) ? u : null;
	battleSelect = u;
	battleAim = null;
	battleHints = [];
	if (battleControl) activateUnitTiles(battleControl);
	else activateUnitTiles(u);
	updateUI();
}

function showTiles(u, attack) {
	battleTiles = [];
	battleHints = [];
	if (!u || u.hp <= 0) return;
	if (attack) {
		u.addAttackTiles(1);
		return;
	}
	const moves = u.moves();
	for (const h of moves) {
		battleTiles.push({x: h.x, y: h.y, kind: 0, live: 1});
	}
}

function activateUnitTiles(u) {
	battleTiles = [];
	battleHints = [];
	if (!u || u.hp <= 0) return;
	const mine = u == battleControl && !battlePhase && !thinking && !(u.moved && u.acted);
	if (!mine || !u.moved) {
		const moves = u.moves();
		const live = mine && !u.moved ? 1 : 0;
		for (const o of moves) {
			battleTiles.push({x: o.x, y: o.y, kind: 0, live});
		}
	}
	if (!mine || !u.acted) {
		u.addAttackTiles(mine && !u.acted ? 1 : 0);
	}
}

function battleRefreshTiles() {
	const u = battleControl;
	if (!u || u.hp <= 0 || (u.moved && u.acted) || battlePhase || thinking) {
		battleTiles = [];
		battleHints = [];
		return;
	}
	activateUnitTiles(u);
}

function getTileAt(x, y) {
	for (let i = 0; i < battleTiles.length; i++) {
		if (battleTiles[i].x == x && battleTiles[i].y == y && battleTiles[i].live) return battleTiles[i];
	}
	return null;
}

function battleFinishUnit(u) {
	u.moved = 1;
	u.acted = 1;
	battleTiles = [];
	battleHints = [];
	battleAim = null;
	battleControl = null;
	if (checkForBattleEnd()) return;
	nextRoundPhase();
}

function nextRoundPhase() {
	battleControl = null;
	battleAim = null;
	thinking = 1;
	const q = [];
	for (const u of battleUnits) {
		if (u.hp > 0 && !u.enemy && !u.hero) q.push(u);
	}
	nextUnitInQueue(q, startEnemyPhase);
	updateUI();
}

function playerMove(u, x, y) {
	performMove(u, x, y, () => afterHeroMove(u));
}

function afterHeroMove(u) {
	battleAim = null;
	battleHints = [];
	if (u.acted) {
		battleFinishUnit(u);
		return;
	}
	battleRefreshTiles();
	const hits = u.hits(u.x, u.y);
	if (!hits.length) battleFinishUnit(u);
	else if (u.around) playerAttack(u, hits[0].x, hits[0].y);
}

function playerAttack(u, x, y) {
	const hits = u.actHits(x, y);
	if (!hits.length) {
		if (u.moved) battleFinishUnit(u);
		return;
	}
	performAttack(u, hits, () => {
		if (checkForBattleEnd()) return;
		battleAim = null;
		battleHints = [];
		if (u.moved) {
			battleFinishUnit(u);
			return;
		}
		battleRefreshTiles();
	});
}

function startEnemyPhase() {
	if (checkForBattleEnd()) return;
	battlePhase = 1;
	thinking = 1;
	battleControl = null;
	battleTiles = [];
	battleHints = [];
	battleAim = null;
	const q = [];
	for (const u of battleUnits) {
		if (u.hp > 0 && u.enemy) {
			u.moved = 0;
			u.acted = 0;
			q.push(u);
		}
	}
	nextUnitInQueue(q, beginRound);
	updateUI();
}

function performMove(unit, x, y, done) {
	if (unit.enemy) {
		sfx("0*", 0.01); // enemy battle move
	} else {
		sfx("*09", 0.005); // player battle move
	}
	animating = 1;
	unit.offsetX = unit.x - x;
	unit.offsetY = unit.y - y;
	if (x < unit.x) unit.face = 1;
	if (x > unit.x) unit.face = -1;
	unit.x = x;
	unit.y = y;
	unit.moved = 1;
	battleTiles = [];
	battleHints = [];
	updateUI();
	tween(unit, 9, {offsetX: 0, offsetY: 0}, () => {
		animating = 0;
		updateUI();
		done();
	});
}

function hitShake(hits, then) {
	let n = hits.length;
	if (!n) {
		then();
		return;
	}
	for (let i = 0; i < hits.length; i++) {
		hits[i].shake = 1;
		tween(hits[i], 9, {shake: 0}, () => {
			if (--n <= 0) then();
		});
	}
}

function poke(u, x, y, then) {
	const dx = x - u.x;
	const dy = y - u.y
	const n = Math.max(1, Math.abs(dx) + Math.abs(dy));
	tween(u, 5, {offsetX: dx / n / 2, offsetY: dy / n / 2}, then);
}

function performAttack(u, hits, done) {
	animating = 1;
	battleTiles = [];
	battleHints = [];
	updateUI();
	const t = hits[0];
	poke(u, t ? t.x : u.x, t ? t.y : u.y, () => {
		sfx("SG"); // attack
		for (let i = 0; i < hits.length; i++) if ((hits[i].hp -= u.dmg) <= 0) sfx("MGA"); // destroy
		if (!u.enemy) {
			const mul = u.hero ? 2 : 1;
			for (let i = 0; i < hits.length; i++) {
				totalScore += 50 * mul;
				if (hits[i].hp <= 0) totalScore += 100 * mul;
			}
		}
		updateUI();
		hitShake(hits, () => {
			tween(u, 5, {offsetX: 0, offsetY: 0}, () => {
				u.acted = 1;
				animating = 0;
				updateUI();
				done();
			});
		});
	});
}

function knightSide(u, tile, dx, dy) {
	const tx = tile.x - u.x;
	const ty = tile.y - u.y;
	if (dy) return tx < 0 ? -1 : tx > 0 ? 1 : 0;
	return ty < 0 ? -1 : ty > 0 ? 1 : 0;
}

function knightTilesInDir(u, dx, dy) {
	const out = [];
	for (const t of battleTiles) {
		if (!t.live) continue;
		const tx = t.x - u.x;
		const ty = t.y - u.y;
		if (dy && ty == dy * 2 && (tx == 1 || tx == -1)) out.push(t);
		else if (dx && tx == dx * 2 && (ty == 1 || ty == -1)) out.push(t);
	}
	return out;
}

function pickKnightAim(u, dx, dy, dx2, dy2) {
	let side;
	if (dy) {
		if (dx2 < 0) side = -1;
		else if (dx2 > 0) side = 1;
		else side = 0;
	} else {
		if (dy2 < 0) side = -1;
		else if (dy2 > 0) side = 1;
		else side = 0;
	}
	const pool = [];
	for (let i = 0; i < battleHints.length; i++) {
		if (battleHints[i].live && knightSide(u, battleHints[i], dx, dy) == side) pool.push(battleHints[i]);
	}
	if (!pool.length) return null;
	if (pool[0].kind == 1) {
		for (let i = 0; i < pool.length; i++) {
			if (getUnitAt(pool[i].x, pool[i].y)) return pool[i];
		}
	}
	let best = pool[0];
	let bestD = 0;
	for (let i = 0; i < pool.length; i++) {
		const d = Math.abs(pool[i].x - u.x) + Math.abs(pool[i].y - u.y);
		if (d >= bestD) {
			bestD = d;
			best = pool[i];
		}
	}
	return best;
}

// pass a turn (move/act) by unicorn
function battleEndTurn() {
	if (!battleActive || battleResult || animating || battlePhase || thinking) return;
	battleEpoch ++;
	battleAim = null;
	battleTiles = [];
	battleHints = [];
	battleControl = null;
	nextRoundPhase();
	updateUI();
}

function getPosFromEvent(e) {
	const x = ((e.clientX - viewLeft) / viewScale / 2 - boardOffsetX) / cellSize | 0;
	const y = ((e.clientY - viewTop) / viewScale / 2 - boardOffsetY) / cellSize | 0;
	return inBounds(x, y) && {x, y};
}

function battleClick(event) {
	if (menu || showPick || showUpgrade || showEnd) return;
	if (showObjective) {
		dismissObjective();
		return;
	}
	swipe = event;
}

function battleTap(e) {
	if (!battleActive || battleResult || animating || battlePhase || thinking) return;
	const cell = getPosFromEvent(e);
	if (!cell) return;
	const occ = getUnitAt(cell.x, cell.y);
	const u = battleControl;
	if (unicornWait && occ == u) {
		unicornWait = 0;
		u.moved = 1;
		afterHeroMove(u);
		return;
	}
	if (occ && occ.hero && battleSelect == occ && !occ.moved) {
		unicornWait = 1;
		battleTiles = [{x: occ.x, y: occ.y, kind: 0, live: 1}];
		battleHints = [];
		battleAim = 0;
		updateUI();
		return;
	}
	if (occ) {
		if (u && battleSelect == u && !u.acted && occ.enemy && u.actHits(occ.x, occ.y).length)
			playerAttack(u, occ.x, occ.y);
		else selectUnit(occ);
		return;
	}
	const tile = getTileAt(cell.x, cell.y);
	if (tile && u && !(u.moved && u.acted)) {
		if (!tile.kind && !u.moved) playerMove(u, cell.x, cell.y);
		else if (tile.kind && !u.acted) playerAttack(u, cell.x, cell.y);
	} else if (battleSelect) selectUnit();
}

function battleKey(event) {
	if (battleResult || animating) return;
	const k = event.keyCode;
	if (k == 13 || k == 69) {
		battleEndTurn();
		return;
	}
	if (k == 9) {
		event.preventDefault();
		if (battlePhase || thinking) return;
		const list = battleRoster(1, event.shiftKey);
		if (!list.length) return;
		const i = list.indexOf(battleSelect || battleControl);
		selectUnit(list[(i + 1) % list.length]);
		return;
	}
	if (battlePhase || thinking) return;
	const u = battleControl;
	if (!u || !u.hero || (u.moved && u.acted)) return;

	if (k == 32) {
		if (battleAim) {
			battleAim = null;
			battleHints = [];
		}
		const hits = u.hits(u.x, u.y);
		if (!u.acted && hits.length) {
			playerAttack(u, hits[0].x, hits[0].y);
			return;
		}
		if (u.moved && !u.acted) battleFinishUnit(u);
		return;
	}

	const d = arrowDXY(k);
	if (d) battleDir(d);
}

function battleDir(d) {
	if (battleResult || animating || battlePhase || thinking) return;
	const u = battleControl;
	if (!u || !u.hero || (u.moved && u.acted)) return;
	const dx = d[0], dy = d[1];

	if (u.moved && !u.acted && u.atk != 3) {
		if (u.hits(u.x, u.y).length) playerAttack(u, u.x + dx, u.y + dy);
		else battleFinishUnit(u);
		return;
	}

	if (!battleTiles.length) battleRefreshTiles();

	if (!battleAim) {
		const forks = knightTilesInDir(u, dx, dy);
		if (!forks.length) return;
		battleAim = {dx, dy};
		battleHints = forks;
		return;
	}

	if ((!battleAim.dx && !dx) || (!battleAim.dy && !dy)) {
		if (!(dx == battleAim.dx && dy == battleAim.dy)) {
			battleAim = null;
			battleHints = [];
			return;
		}
	}

	const pick = pickKnightAim(u, battleAim.dx, battleAim.dy, dx, dy);
	battleAim = null;
	battleHints = [];
	if (!pick) return;
	if (pick.kind == 0) playerMove(u, pick.x, pick.y);
	else playerAttack(u, pick.x, pick.y);
}
