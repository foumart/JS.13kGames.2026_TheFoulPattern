const { src, dest, series } = require('gulp');
const gulp = require('gulp');
const concat = require('gulp-concat');
const htmlmin = require('gulp-htmlmin');
const replace = require('gulp-string-replace');
const cleanCSS = require('gulp-clean-css');
const browserSync = require('browser-sync').create();
const closureCompiler = require('google-closure-compiler').gulp();
const argv = require('yargs').argv;
const gulpif = require('gulp-if');
const advzip = require('gulp-advzip');
const glob = require('glob');
const packageJson = require('./package.json');

// import ES modules
let del, zip, js, css, scripts;

const replaceOptions = { logs: { enabled: false } };
const timestamp = getDateString();

// Data taken directly from package.json
const name = packageJson.name;
const title = packageJson.title;
const id_name = `${name.replace(/\s/g, '')}`;//_${getDateString(true)}
const version = packageJson.version;
const iconExtension = packageJson.iconExtension;
const iconType = packageJson.iconType;
const iconSize = packageJson.iconSize;
const orientation = packageJson.orientation;

// Script Arguments:
// --dir: set the output directory
const dir = argv.dir || 'public';

// --test: don't use versioned zip file - useful for fast testing.
const test = argv.test != undefined ? true : false;

// --pwa: enable progressive web app - use a service worker, webmanifest and pwa initialization scripts. Adds ~850 bytes.
const pwa = argv.pwa != undefined ? true : false;

// --raw: don't pack the js files at all
const raw = argv.raw != undefined ? true : false;

// --debug: pack but don't compress js files, display service worker logs as well
const debug = argv.debug != undefined ? true : false;

// --roadroll: pack JS with Roadroller (SSE + Zopfli-scored wrapper search)
const roadroll = argv.roadroll != undefined ? true : false;

// --OO: infinite parameter search (Ctrl+C keeps the best result so far)
// --optimize / -O: 0 (no search), 1 (~30 attempts), 2 (~300). Default 1.
function parseRoadrollEffort() {
	if (argv.OO !== undefined) return Infinity;
	const raw = argv.optimize !== undefined ? argv.optimize : argv.O;
	if (raw === undefined) return 1;
	if (raw === 'O' || raw === true) return Infinity;
	const n = parseInt(raw, 10);
	if (n !== 0 && n !== 1 && n !== 2) {
		throw new Error('invalid --optimize (use 0, 1, 2, or O / --OO)');
	}
	return n;
}
const roadrollEffort = parseRoadrollEffort();
let didRoadroll = false;

function formatRoadrollParams(opts) {
	const parts = [];
	if (opts.sse) parts.push('--sse');
	if (typeof opts.numAbbreviations === 'number') parts.push('-Zab' + opts.numAbbreviations);
	if (typeof opts.dynamicModels === 'number') parts.push('-Zdy' + opts.dynamicModels);
	if (typeof opts.recipLearningRate === 'number') parts.push('-Zlr' + opts.recipLearningRate);
	if (typeof opts.pairRecipLearningRate === 'number') parts.push('-Zlp' + opts.pairRecipLearningRate);
	if (typeof opts.modelMaxCount === 'number') parts.push('-Zmc' + opts.modelMaxCount);
	if (typeof opts.modelRecipBaseCount === 'number') parts.push('-Zmd' + opts.modelRecipBaseCount);
	if (typeof opts.precision === 'number') parts.push('-Zpr' + opts.precision);
	if (opts.sparseSelectors) parts.push('-S' + opts.sparseSelectors.join(','));
	return parts.join(' ');
}

async function loadZopfliScore() {
	const path = require('path');
	const { pathToFileURL } = require('url');
	const zopfliPath = path.join(path.dirname(require.resolve('roadroller')), 'zopfli.mjs');
	const { createZopfliPackedScore } = await import(pathToFileURL(zopfliPath).href);
	return createZopfliPackedScore();
}

function decodeWithOptions(packer, extra) {
	const saved = packer.options;
	packer.options = { ...saved, ...extra };
	try {
		const { firstLine, secondLine } = packer.makeDecoder();
		return firstLine + secondLine;
	} finally {
		packer.options = saved;
	}
}

function interceptProcessStop(onStop, onForce) {
	const readline = require('readline');
	const signals = ['SIGINT', 'SIGTERM', 'SIGBREAK'];
	const saved = {};
	for (const sig of signals) {
		saved[sig] = process.listeners(sig).slice();
		process.removeAllListeners(sig);
		process.on(sig, onForce);
	}

	let rl;
	if (process.stdin && process.stdin.readable) {
		rl = readline.createInterface({
			input: process.stdin,
			prompt: '',
			historySize: 0
		});
		rl.on('SIGINT', onForce);
		rl.on('line', onStop);
	}

	return function restore() {
		if (rl) rl.close();
		for (const sig of signals) {
			process.removeAllListeners(sig);
			for (const listener of saved[sig]) process.on(sig, listener);
		}
	};
}

async function packJsWithRoadroller(js, wrapper, onPacked) {
	const { Packer } = await import('roadroller');
	const parts = String(wrapper || '').split('__ROADROLLER__');
	if (wrapper && parts.length !== 2) {
		throw new Error('Roadroller wrapper must contain exactly one __ROADROLLER__ marker');
	}
	const options = {
		sse: true,
		maxMemoryMB: 1000,
		optimizePrefix: parts[0] || '',
		optimizeSuffix: parts[1] || '',
		optimizeScore: await loadZopfliScore()
	};
	const inputs = [{ data: js, type: 'js', action: 'eval' }];
	const packer = new Packer(inputs, options);

	let best = {};
	let stopping = false;
	let restoreStop = () => {};
	const effortLabel = roadrollEffort === Infinity ? 'OO' : String(roadrollEffort);
	console.log(`        roadroller  --sse --zopfli -M1000 -O${effortLabel}` +
		(wrapper ? ' --optimize-wrapper' : ''));
	if (roadrollEffort === Infinity) {
		console.log('        roadroller  Press Enter to stop and pack the best result (Ctrl+C also works)');
	}

	const requestStop = () => {
		if (stopping) return;
		stopping = true;
		console.log('\nStopping search and keeping best result...');
	};
	const forceStop = () => {
		if (!stopping) {
			requestStop();
			return;
		}
		console.log('\nForce exit.');
		process.exit(130);
	};
	if (roadrollEffort === Infinity) {
		restoreStop = interceptProcessStop(requestStop, forceStop);
	}

	const checkpoint = packed => {
		if (typeof onPacked === 'function') onPacked(packed, formatRoadrollParams({ ...packer.options, ...best }));
	};

	const progress = async info => {
		await new Promise(resolve => setImmediate(resolve));
		if (info.best) best = info.best;
		let size = `${info.currentSize}`;
		if (info.currentSize100 !== undefined) size += `/${info.currentSize100}`;
		if (info.currentSize1000 !== undefined) size += `/${info.currentSize1000}`;
		console.log(
			`        (${info.pass}` +
			(typeof info.passRatio === 'number' ? ` ${(info.passRatio * 100).toFixed(1)}%` : '') +
			`) ${formatRoadrollParams({ ...packer.options, ...info.current })}: ` +
			`${size}${info.bestUpdated ? ' <-' : info.currentRejected ? ' x' : ''}`
		);
		if (info.bestUpdated) {
			try {
				checkpoint(decodeWithOptions(packer, info.best));
			} catch (e) {
				console.warn('        roadroller  checkpoint failed:', e.message || e);
			}
		}
		if (stopping) return false;
	};

	try {
		if (roadrollEffort > 0) {
			if (roadrollEffort === Infinity) {
				for (let level = 1; ; level++) {
					await packer.optimize(level, progress);
				}
			} else {
				await packer.optimize(roadrollEffort, progress);
			}
		}
	} catch (e) {
		if (!(e instanceof Error && e.message === 'search aborted')) throw e;
	}

	try {
		packer.options = { ...packer.options, ...best };
		const params = formatRoadrollParams(packer.options);
		console.log(`        roadroller  use \`-M1000 ${params}\` to replicate`);
		const packed = decodeWithOptions(packer, best);
		checkpoint(packed);
		return packed;
	} finally {
		restoreStop();
	}
}

// --mobile: should html tags for mobile be included. Adds 42 bytes.
const mobile = argv.mobile != undefined || argv.all != undefined ? `
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="apple-touch-icon" sizes="${iconSize}x${iconSize}" href="ico.${iconExtension}"/>` : false;

// --social: should html tags for social media be included. Adds around 100 bytes, depending on description length.
// TODO: quotes should not be removed for content that has space characters
const social = argv.social != undefined || argv.all != undefined ? `
<meta name="application-name" content="${title}"/>
<meta name="description" content="${packageJson.description}"/>
<meta name="keywords" content="${packageJson.keywords}"/>
<meta name="author" content="${packageJson.author.name}"/>
<meta name="twitter:card" content="summary"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${packageJson.description}"/>
<meta name="twitter:image" content="ico.${iconExtension}"/>` : false;

// Prepare a web icon to be used by html and pwa
function ico(callback) {
	if (!mobile) {
		return callback();
	}
	const fs = require('fs');
	const path = require('path');
	const srcIcon = path.join('src', `ico.${iconExtension}`);
	if (fs.existsSync(srcIcon)) {
		fs.mkdirSync(dir, { recursive: true });
		fs.copyFileSync(srcIcon, path.join(dir, `ico.${iconExtension}`));
	}
	callback();
}

// Copy other graphical assets (if any)
function assets(callback) {
	const fs = require('fs');
	const path = require('path');
	const assetsDir = 'src/assets';
	const outDir = path.join(dir, 'assets');
	if (!fs.existsSync(assetsDir)) {
		return callback();
	}
	const files = fs.readdirSync(assetsDir);
	if (!files.length) {
		return callback();
	}
	fs.mkdirSync(outDir, { recursive: true });
	files.forEach(file => {
		fs.copyFileSync(path.join(assetsDir, file), path.join(outDir, file));
	});
	callback();
}

// Prepare service worker script
function sw(callback) {
	if (pwa) {
		src(['resources/service_worker.js'], { allowEmpty: true })
			.pipe(replace('var debug;', `var debug = ${debug ? 'true' : 'false'};`, replaceOptions))
			.pipe(replace('{ID_NAME}', id_name, replaceOptions))
			.pipe(replace('{VERSION}', version, replaceOptions))
			.pipe(replace('{ICON_EXTENSION}', iconExtension, replaceOptions))
			.pipe(gulpif(!debug, replace('caches', 'window.caches', replaceOptions)))
			.pipe(gulpif(!debug,
				closureCompiler({
					compilation_level: 'ADVANCED_OPTIMIZATIONS',
					warning_level: 'QUIET',
					language_in: 'ECMASCRIPT6',
					language_out: 'ECMASCRIPT6'
				})
			))
			.pipe(gulpif(!debug, replace('window.caches', 'caches', replaceOptions)))
			.pipe(gulpif(!debug, replace('"use strict";', '', replaceOptions)))
			.pipe(concat('sw.js'))
			.pipe(dest(dir + '/'))
			.on('end', callback)
	} else {
		callback();
	}
}

// Compile (or copy if raw) the pwa initialization script as well as game logic scripts
function app(callback) {
	const scripts = [
		'src/scripts/*.js'
	];
	if (pwa) {
		scripts.unshift('resources/sw_init.js');
	}
	scripts.unshift('resources/app_init.js');

	if (raw) {
		// If raw is true, just copy the source files
		src(scripts, { allowEmpty: true })
			//.pipe(replace('_debug', 'debug', replaceOptions))
			.pipe(replace('let _debug;', `let _debug = ${debug || raw ? 'true' : 'false'};`, replaceOptions))
			.pipe(replace('let debugKeys = 1;', `let debugKeys = ${roadroll ? 0 : 1};`, replaceOptions))
			.pipe(gulpif(pwa, replace('service_worker', 'sw', replaceOptions)))
			.pipe(replace('{VERSION}', version, replaceOptions))
			.pipe(gulpif(!pwa, replace(/function init\(/g, 'window.addEventListener("load",init);function init(', replaceOptions)))
			.pipe(dest(dir + '/src/scripts/'))
			.on('end', callback);
	} else {
		// Otherwise compile
		src(scripts, { allowEmpty: true })
			.pipe(replace('let _debug;', `let _debug = ${debug || raw ? 'true' : 'false'};`, replaceOptions))
			.pipe(replace('let debugKeys = 1;', `let debugKeys = ${roadroll ? 0 : 1};`, replaceOptions))
			.pipe(gulpif(pwa, replace('service_worker', 'sw', replaceOptions)))
			.pipe(replace('{VERSION}', version, replaceOptions))
			.pipe(gulpif(!pwa, replace(/function init\(/g, 'window.addEventListener("load",init);function init(', replaceOptions)))
			.pipe(gulpif(!debug,
				closureCompiler({
					compilation_level: 'ADVANCED_OPTIMIZATIONS',
					warning_level: 'QUIET',
					language_in: 'ECMASCRIPT_2017',
					language_out: 'ECMASCRIPT6',
					externs: 'resources/externs.js'
				})
			))
			.pipe(concat('app.js'))
			.pipe(dest(dir + '/tmp/'))
			.on('end', callback);
	}
}

// Minify CSS
function cs(callback) {
	if (raw) {
		src('src/styles/*.css', { allowEmpty: true })
			.pipe(dest(dir + '/src/styles/'))
			.on('end', callback);
	} else {
		src('src/styles/*.css', { allowEmpty: true })
			.pipe(cleanCSS())
			.pipe(concat('temp.css'))
			.pipe(dest(dir + '/tmp/'))
			.on('end', callback)
	}
}

// Prepare web manifest file
function mf(callback) {
	if (pwa) {
		src('resources/mf.webmanifest', { allowEmpty: true })
			.pipe(replace('service_worker', 'sw', replaceOptions))
			.pipe(replace('{TITLE}', title, replaceOptions))
			.pipe(replace('{ICON_EXTENSION}', iconExtension, replaceOptions))
			.pipe(replace('{ICON_TYPE}', iconType, replaceOptions))
			.pipe(replace('{ICON_SIZE}', iconSize, replaceOptions))
			.pipe(replace('{ORIENTATION}', orientation, replaceOptions))
			.pipe(htmlmin({ collapseWhitespace: true }))
			.pipe(dest(dir + '/'))
			.on('end', callback);
	} else {
		callback();
	}
}

// Read the temporary JS and CSS files and shorten css_* class names
async function mangle() {
	if (!raw) {
		const fs = require('fs');
		css = fs.readFileSync(dir + '/tmp/temp.css', 'utf8');
		js = fs.readFileSync(dir + '/tmp/app.js', 'utf8');

		// Shorten css_* class names to a, b, c...
		if (!debug) {
			const classIds = [
				'css_title', 'css_caption', 'css_body', 'css_subtitle',
				'css_headline', 'css_display', 'css_small', 'css_tiny',
				'css_row', 'css_chip', 'css_picked', 'css_focused', 'css_idle',
				'css_frame', 'css_muted', 'css_georgia'
			];
			for (let i = 0; i < classIds.length; i++) {
				const regex = new RegExp(classIds[i], 'g');
				const letter = String.fromCharCode(i + 97);
				css = css.replace(regex, letter);
				js = js.replace(regex, letter);
			}
			// ["e","d","c","b","a"][i] -> "edcba"[i]
			js = js.replace(/\[("[a-z]")(,"[a-z]")+\]/g, m => '"' + m.replace(/[^a-z]/g, '') + '"');
		}
	}
}

// Inline JS and CSS into index.html or just include them if raw is specified
function pack(callback) {
	let stream = src('src/index.html', { allowEmpty: true });
	let scriptTags, cssTags;

	if (raw) {
		// Use glob to get all JavaScript files
		const scriptFiles = glob.sync('src/scripts/*.js').sort();
		// Add initialization scripts as well
		if (pwa) {
			scriptFiles.unshift('src/scripts/sw_init.js');
		}
		scriptFiles.unshift('src/scripts/app_init.js');

		// Create script tags for each JavaScript file in the array
		scriptTags = scriptFiles.map(scriptFile => {
			const p = scriptFile.replace(/\\/g, '/').replace(/src\/scripts\/[^/]+\//, 'src/scripts/');
			return `<script src="${p}"></script>`;
		}).join('\n\t');

		// Use glob to get all CSS files matching the pattern
		const cssFiles = glob.sync('src/styles/*.css');
		// Create link tags for each CSS file
		cssTags = cssFiles.map(cssFile => `<link rel="stylesheet" href="${cssFile.replace(/\\/g, '/')}">`).join('\n\t');
	}

	stream
		.pipe(gulpif(!pwa, replace('<link rel="icon" type="{ICON_TYPE}" sizes="any" href="ico.{ICON_EXTENSION}">', '', replaceOptions)))
		.pipe(gulpif(!pwa, replace('<link rel="manifest" href="mf.webmanifest">', '', replaceOptions)))
		.pipe(replace('{TITLE}', title, replaceOptions))
		.pipe(replace('{ICON_EXTENSION}', iconExtension, replaceOptions))
		.pipe(replace('{ICON_TYPE}', iconType, replaceOptions))
		.pipe(replace('rep_social', social != false ? social : '', replaceOptions))
		.pipe(replace('rep_mobile', mobile != false ? mobile : '', replaceOptions))
		.pipe(htmlmin({ collapseWhitespace: true, removeComments: true, removeAttributeQuotes: true }))
		.pipe(replace('rep_css', raw ? cssTags : '<style>' + css + '</style>', replaceOptions))
		.pipe(replace('rep_js', raw ? scriptTags : '<script>' + js + '</script>', replaceOptions))
		.pipe(concat('index.html'))
		.pipe(dest(dir + '/'))
		.on('end', callback);
}

// Delete the public folder at the beginning
function prep(callback) {
	(async () => {
		del = (await import('del')).deleteAsync;
		await del(dir);
		callback();
	})().catch(callback);
}

// Delete the temporary folder generated during packaging
function clean(callback) {
	(async () => {
		del = (await import('del')).deleteAsync;
		await del(dir + '/tmp/');
		callback();
	})();
}

// Pack the inline script already in public/index.html (no full rebuild)
async function packIndexHtml() {
	const fs = require('fs');
	const path = require('path');
	const htmlPath = dir + '/index.html';
	if (!fs.existsSync(htmlPath)) {
		throw new Error(htmlPath + ' not found. Run a build first.');
	}
	let html = fs.readFileSync(htmlPath, 'utf8');
	const open = html.lastIndexOf('<script>');
	const close = html.lastIndexOf('</script>');
	if (open < 0 || close < open) {
		throw new Error('No inline <script> in ' + htmlPath);
	}
	const js = html.slice(open + 8, close);
	const wrapper = html.slice(0, open + 8) + '__ROADROLLER__' + html.slice(close);
	const writePacked = (packed, params) => {
		fs.writeFileSync(htmlPath, html.slice(0, open + 8) + packed + html.slice(close));
		didRoadroll = true;
		if (params) {
			fs.mkdirSync('zip', { recursive: true });
			fs.writeFileSync(path.join('zip', 'roadroller-best.txt'), '-M1000 ' + params + '\n');
		}
	};
	const packed = await packJsWithRoadroller(js, wrapper, writePacked);
	writePacked(packed);
	didRoadroll = true;
	console.log(`        roadroller  ${js.length} -> ${packed.length} bytes`);
}

async function maybeRoadrollHtml() {
	if (debug || raw || !roadroll) return;
	await packIndexHtml();
}

async function roadrollHtml() {
	if (debug || raw) return;
	await packIndexHtml();
}

// Package zip (exclude any fonts that are used locally, like Twemoji.ttf)
function archive(callback) {
	if (debug || raw) callback();
	else {
		(async () => {
			const fs = require('fs');
			zip = (await import('gulp-zip')).default;
			const packedZip = roadroll || didRoadroll || fs.existsSync('zip/roadroller-best.txt');
			src([dir + '/**/*', '!' + dir + '/**/*.ttf', '!' + dir + '/tmp/**'], { allowEmpty: true })
				.pipe(zip(test ? 'game.zip' : 'game_' + timestamp + '.zip'))
				.pipe(advzip({
					optimizationLevel: 4,
					iterations: packedZip ? 1000 : 10
				}))
				.pipe(dest('zip/'))
				.on('end', callback);
		})();
	}
}

// Output the zip filesize
function check(callback) {
	if (debug || raw) callback();
	else {
		var fs = require('fs');
		const size = fs.statSync(test ? 'zip/game.zip' : 'zip/game_' + timestamp + '.zip').size;
		const limit = 1024 * 13;
		const left = limit - size;
		const percent = Math.abs(Math.round((left / limit) * 10000) / 100);
		console.log(`        ${size}        ${left} bytes ${left < 0 ? 'overhead' : 'remaining'} (${percent}%)`);
		callback();
	}
}

// Watch for changes in the source folder
function watch(callback) {
	browserSync.init({
		server: './public',
		ui: false,
		port: 8080
	});
	
	gulp.watch('./src').on('change', () => {
		exports.sync();
	});

	callback();
};

// Reload the browser sync instance, or run a new server with live reload
function reload(callback) {
	if (!browserSync.active) {
		watch(callback);
	} else {
		browserSync.reload();
		callback();
	}
}

// Helper function for timestamp and naming
function getDateString(shorter) {
	const date = new Date();
	const year = date.getFullYear();
	const month = `${date.getMonth() + 1}`.padStart(2, '0');
	const day =`${date.getDate()}`.padStart(2, '0');
	if (shorter) return `${year}${month}${day}`;
	const signiture =`${date.getHours()}`.padStart(2, '0')+`${date.getMinutes()}`.padStart(2, '0')+`${date.getSeconds()}`.padStart(2, '0');
	return `${year}${month}${day}_${signiture}`;
}

// Exports
exports.default = series(prep, ico, sw, app, cs, mf, mangle, assets, pack, maybeRoadrollHtml, clean, watch);
exports.build = series(prep, ico, sw, app, cs, mf, mangle, assets, pack, maybeRoadrollHtml, clean, watch);
exports.prod = series(prep, ico, sw, app, cs, mf, mangle, assets, pack, maybeRoadrollHtml, clean, archive, check);
exports.sync = series(ico, app, cs, mangle, assets, pack, maybeRoadrollHtml, clean, reload);
exports.zip = series(archive, check);
exports.roadroll = series(roadrollHtml, archive, check);

/*
   JS13K Template Gulpfile by Noncho Savov
   https://www.FoumartGames.com
*/
