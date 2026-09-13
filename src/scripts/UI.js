function createSpriteIcon(s, fn) {
	const c = document.createElement("canvas");
	c.width = c.height = s;
	iconContext = c.getContext("2d");
	iconContext.imageSmoothingEnabled = 0;
	if (fn) fn(s);
	iconContext = 0;
	return c;
}

function createSparkAnim(size) {
	const d = line();
	d.id = "spr";
	d.s = size;
	d.t = 0;
	return d;
}

function pulseSparkles() {
	const t = time / 180 | 0;
	if (self.spr && spr.parentNode && spr.t != t) {
		spr.innerHTML = "";
		spr.appendChild(createSpriteIcon(spr.s, s => drawSparkle(0, 0, s, t)));
		spr.t = t;
	}
}

function createIcon(unit, size) {
	return createSpriteIcon(size, s => drawUnitIcon(unit, s / 2, s / 2, s))
}

function createUnitStatsText(unit, size = 5, sep = "\n") {
	const hp = sep == "\n" ? Math.max(0, unit.hp) + "/" : "";
	const cap = (cur, n) => sep[0] == " " && (n = rayText(n)) && n != cur ? " (" + n + ")" : "";
	const txt = line(size);
	txt.style.whiteSpace = "pre";
	txt.textContent = "HP: " + hp + unit.hpMax + sep + "Dmg: " + unit.dmg
		+ sep + "Move: " + unit.mvMax + cap(unit.mvMax, unit.range)
		+ sep + "Att: " + unit.atkMax + cap(unit.atkMax, unit.reach);
	return txt;
}

function appendLine(c, t) {
	ms.appendChild(line(c, t));
}

function line(c = 3, t = "\xa0") {
	const d = row();
	d.className = ["css_title", "css_display", "css_headline", "css_subtitle", "css_body", "css_caption", "css_small", "css_tiny"][c];
	d.textContent = t;
	return d;
}

function row() {
	const d = document.createElement("div");
	d.className = "css_row";
	return d;
}

function uiSize() {
	return Math.max(20, Math.min(width, height) * 0.1 | 0);
}

function updateUI() {
	// top left and right panels
	const sc = currentScore();
	const ally = battleActive && !battleResult ? getBattleUIAlly() : 0;
	const foe = battleActive && !battleResult ? getBattleUIFoe() : 0;
	const size = uiSize();

	if (menu == 1) {
		//L.textContent = "";
		L.textContent = "game by Noncho Savov";
		//L.appendChild(line(4, "FoumartGames presents:"));
		//L.appendChild(line(3, "js13k game by Noncho Savov"));
		//L.appendChild(line(3, "by Noncho Savov"));
		//R.textContent = "";
		R.textContent = "v{VERSION}";
		//R.appendChild(line(4, "Arrows - move"));
		//R.appendChild(line(4, "Space - select"));
		//R.appendChild(line(4, "Enter - confirm"));
		//R.appendChild(line(4, "ESC - pause"));
	}
	else {
		L.textContent = "Score: " + sc;
		if (!puzzleMode) {
			L.appendChild(document.createElement("hr"));
			if (!battleActive || battleResult) {
				L.appendChild(line(5, "\xa0 The Unicorn \xa0"));
				L.appendChild(line(5, "of Order"));
				L.appendChild(playerCard(size));
			}
		}
		R.textContent = puzzleMode ? "Stage " + (levelIndex + 1) : "World " + worldNumber() + "-" + shadowNumber();
		if (!puzzleMode) R.appendChild(document.createElement("hr"));
		if (battleResult == 2) R.appendChild(line(4, "Vail cleared!"));
		if (battleActive && !battleResult || showPick) {
			if (ally) L.appendChild(unitCard(ally, size, 0));
			if (foe && foe.hp > 0) R.appendChild(unitCard(foe, size, 1));
		} else if (!puzzleMode && !battleResult) {
			R.appendChild(enemyCard(size));
		}
	}

	const fade = menu || showPick || showUpgrade || showObjective || (showEnd && (state > 1 || battleResult > 1));
	ov.style.background = fade ? "#103c" : "";
	if (!fade) {
		ms.textContent = "";
		hideEndButtons();
		return;
	}

	// overlay
	ms.style.pointerEvents = showPick || showUpgrade ? "auto" : "none";
	ms.textContent = "";
	if (menu == 1) {
		const logo = row();
		const sub = line(6, "");
		sub.appendChild(line(5, "The"));
		sub.appendChild(line(1, "Foul"));
		logo.appendChild(sub);
		logo.appendChild(line(0, "Pattern"));
		ms.appendChild(logo);
	} else if (menu == 2) appendLine(1, "PAUSED");
	else if (showPick) fillPick();
	else if (showUpgrade) fillUpgrade();
	else if (showObjective) fillBrief();
	else fillEnd();

	updateButtons();
}

function unitCard(unit, size, right) {
	const div = row();
	if (right) div.style.flexDirection = "row-reverse";
	div.appendChild(createIcon(unit, size));
	div.appendChild(createUnitStatsText(unit));
	return div;
}

function playerCard(size) {
	if (puzzleMode) return line(3, "Stage: " + levelIndex);// + " (" + perfects + ")");
	const d = row();
	d.appendChild(createSpriteIcon(size * .75, s => drawUnitIcon(0, s / 2, s / 2, s)));
	d.appendChild(line(3, ": " + lives));
	return d;
}

function foeThumb(v, s) {
	const k = v / 10 | 0, e = k > 2 && ENEMIES[k - 3];
	return createSpriteIcon(s, z => drawUnitIcon(
		e ? {bgr: e[5], palette: e[6]} : {bgr: 2 + k, palette: getEnemyPalette(k, v % 10)},
		z / 2, z / 2, z));
}

function enemyCard(size) {
	const d = row();
	d.style.display = "block";
	if (!showPick) {
		d.appendChild(line(5, "Vail upcoming"));
		d.appendChild(line(5, "in " + (4-stageNumber()) + " stage" + (4-stageNumber() > 1 ? "s" : "")));
	}
	// display boss support and leprechauns left in the enemy panel
	/*const seen = {};
    const add = (n, v, s) => {
        if (!n || seen[v]) return;
        seen[v] = 1;
        const r = row();
        //if (v == 2 && !showPick) r.appendChild(line(3, "!"));
        r.appendChild(foeThumb(v, s));
        //if (v != 2) r.appendChild(line(4, ": " + n));
        d.appendChild(r);
    };
    const w = battleWave(levelIndex / 3 | 0);
    const small = size * .45;
    add(1, w[0], size * .8);
    add(1, w[1], small);
    add(1, w[2], small);
    for (let k = 0; k < 5; k++) add(leftoverKinds[k], k + 1, small);*/
	d.appendChild(foeThumb(battleWave(levelIndex / 3 | 0)[0], size * .8));
	return d;
}

function printProgress() {
	appendLine(0, battleActive ? "Vail " + shadowNumber() : "Stage " + (levelIndex + 1));
}

function fillBrief() {
	const size = uiSize() * 1.2 | 0;
	printProgress();

	appendLine(portrait ? 1 : 3);

	if (stageCaptive) {
		const r = row();
		r.appendChild(line(2, "Rescue "));
		const c = createIcon(stageCaptive, size);
		r.appendChild(c);
		r.appendChild(line(2, stageCaptive));
		r.className = "css_row";
		c.className = "css_frame";
		ms.appendChild(r);
		appendLine(6 - portrait * 3);
	}

	if (stageItem) {
		const r = row();
		r.appendChild(line(2, "Obtain"));
		const c = createSpriteIcon(size, s => blit(objectBitmaps[0], 0, 0, s));
		//c.className = "css_frame";
		r.appendChild(c);
		r.appendChild(line(2, "Jewel"));
		ms.appendChild(r);
		appendLine(6 - portrait * 5);
	}

	appendLine(3, (stageCaptive || stageItem ? "and g" : "G") + "et to");
	ms.appendChild(createSparkAnim(size));
}

function fillPick() {
	const size = Math.min(width, height) / (rescuedUnits.length < 5 ? 6 : rescuedUnits.length + 2) | 0;
	const need = Math.min(2, rescuedUnits.length);
	printProgress();
	if (portrait) appendLine(4);
	appendLine(5 - portrait, need > 2 ? "Pick 2 allies" : "Your all" + (need == 2 ? "ies" : "y"));
	appendLine(6);
	const pickRow = row();
	for (let i = 0; i < rescuedUnits.length; i++) {
		const bmp = rescuedUnits[i];
		const wrap = row();
		wrap.className = "css_row css_chip" + (battleParty.indexOf(bmp) >= 0 ? " css_muted" : " css_idle") + (i == pickCursor ? " css_focused" : "");
		const icon = createIcon(rescuedUnits[i], size);
		wrap.onclick = toggleParty.bind(null, bmp);
		wrap.appendChild(icon);
		pickRow.appendChild(wrap);
	}
	ms.appendChild(pickRow);
	const name = rescuedUnits[pickCursor];
	if (!name) return;
	const unit = makeUnit(getUnitDefinition(name), 0, 0);
	appendLine(6);
	appendLine(2, unit.name);
	appendLine(4, "Level: " + (upgradeLvl(unit) + 1));
	if (portrait) ms.appendChild(document.createElement("hr"));
	//appendLine(6);
	ms.appendChild(createUnitStatsText(unit, 3, portrait ? " \n" : " \xa0 "));
	//const n = ["Rook", "Bishop", "Queen", "Knight", "Around"];
	//appendLine(3, "Move: " + n[unit.mv] + " / Attack: " + (unit.around ? n[4] : n[unit.atk]));
	//appendLine(4);
	//appendLine(4, "Legend:");
	//appendLine(4, "R: Rook, B: Bishop, Q: Queen, K: Knight");
}

function fillUpgrade() {
	const size = uiSize();
	appendLine(1, "VICTORY!");
	appendLine(6 - portrait * 3);
	const list = upgradeRows();
	for (let i = 0; i < list.length; i++) {
		const unit = list[i].u;
		const id = list[i].id;
		const kinds = list[i].kinds;
		const pick = upgradePicks[id];
		const upgradeTab = row();
		const thumb = line(4, "");
		const name = line(5, unit.name || "Unicorn");
		const icon = createIcon(unit, size * .6);
		icon.className = "css_frame";
		thumb.appendChild(name);
		thumb.appendChild(icon);
		const col = line(4, "");
		col.appendChild(createUnitStatsText(unit, 5, " | "));//portrait ? " | " : " \xa0 | \xa0 "));
		const btns = row();
		const all = upgradeKinds(unit, 1);
		for (let k = 0; k < all.length; k++) {
			const b = document.createElement("button");
			b.textContent = upgradeLabel(all[k], unit);
			const lock = k >= kinds.length;
			b.className = (pick == all[k] ? "css_picked" : "css_muted") + (!lock && i == upgradeCurUnit && k == upgradeCurOpt ? " css_focused" : "");
			if (lock) b.style.opacity = .4;
			else b.onclick = setUpgrade.bind(null, id, all[k]);
			btns.appendChild(b);
		}
		col.appendChild(btns);
		upgradeTab.appendChild(thumb);
		upgradeTab.appendChild(col);
		ms.appendChild(upgradeTab);
		ms.appendChild(document.createElement("hr"));
	}
}

function fillEnd() {
	if (!lives) {
		appendLine(1, "GAME OVER");
		appendLine(2, "SCORE " + currentScore());
		return;
	}
	if (runComplete()) {
		appendLine(1, "GAME COMPLETE");
		appendLine(2, "SCORE " + currentScore());
		return;
	}
	if (battleActive) {
		appendLine(1, battleResult == 2 ? "VICTORY!" : "DEFEAT");
		return;
	}
	if (state == 2) {
		const size = uiSize();
		appendLine(0, "STAGE CLEAR!");

		if (isPerfect()) {
			//const row1 = row();
			appendLine(6 - portrait * 5);
			appendLine(1, "Perfect!");
			//appendLine(3, "Bonus: 100");
			//row1.appendChild(createSparkAnim(size));
			//row1.appendChild(line(1, "+1"));
			//ms.appendChild(row1);
		}

		const row3 = line(3, "");
		const numbersLine = line(3);
		row3.appendChild(numbersLine);
		if (stageCaptive && rescuedUnits.indexOf(stageCaptive) >= 0) {
			const row2 = line(3, "");
			const ic = createIcon(stageCaptive, size);
			ic.className = "css_frame";
			row2.appendChild(ic);
			appendLine(6 - portrait * 5);
			ms.appendChild(row2);
			row2.appendChild(line(3, stageCaptive + " joined!"));
		}
		
		let vailed = 0;
		for (let kind = 0; kind < 5; kind++) {
			for (let n = leftUnitsThisLevel[kind]; n--;) {
				const enemy = foeThumb(kind + 1, size);
				row3.appendChild(enemy);
				enemy.className = "css_frame";
				vailed ++;
			}
		}
		if (vailed && !puzzleMode) {
			numbersLine.textContent = vailed + " leprechaun" + (vailed > 1 ? "s" : "");
			appendLine();
			ms.appendChild(row3);
			row3.appendChild(line(3, "enter the Vail"));
		}
	}/* else {
		appendLine(2, "STUCK - R");
		appendLine(2, "SCORE " + currentScore() + "  MOVES " + moveCount);
	}*/
}

let endBtnCur = 0;

function hideEndButtons() {
	Y.style.display = N.style.display = "none";
}

function btn(b, t, fn, on) {
	b.style.display = t ? "block" : "none";
	if (t) {
		b.textContent = t;
		b.onclick = fn;
		b.style.opacity = on == 0 ? "0.3" : "1";
	}
}

function updateButtons() {
	if (menu) {
		const t = menu == 1;
		btn(Y, t ? "Campaign" : "Resume", t ? () => startMode(0) : togglePause);
		btn(N, t ? "Puzzle" : "Quit", t ? () => startMode(1) : restartCampaign);
	} else if (showPick || showObjective) {
		btn(Y);
		btn(N, "Play", showPick ? confirmParty : dismissObjective,
			!showPick || battleParty.length >= Math.min(2, rescuedUnits.length));
	} else if (runComplete()) {
		btn(Y, "Restart", restartCampaign);
		btn(N);
	} else {
		btn(Y, "Re" + (lives ? "try" : "start"), lives ? resetHere : restartCampaign);
		btn(N, lives && state == 2 && (!puzzleMode && !battleActive && levelIndex % 3 == 2 ? "Confront" : "Next"),
			battleActive ? afterBattleWin : nextLevel);
	}
	syncEndCursor();
}

function endButtons() {
	const a = [];
	if (Y.style.display != "none") a.push(Y);
	if (N.style.display != "none") a.push(N);
	return a;
}

function syncEndCursor() {
	const a = endButtons();
	if (endBtnCur >= a.length) endBtnCur = a.length - 1;
	const on = showUpgrade ? upgradeCurUnit >= upgradeRows().length : showEnd || menu;
	for (let i = 0; i < a.length; i++) a[i].className = on && i == endBtnCur ? "css_focused" : "";
}

function moveEndCursor(dx) {
	const n = endButtons().length;
	if (!n || !dx) return;
	endBtnCur = (endBtnCur + dx + n) % n;
	syncEndCursor();
}

function activateEndButton() {
	const b = endButtons()[endBtnCur];
	if (b) b.onclick();
}
