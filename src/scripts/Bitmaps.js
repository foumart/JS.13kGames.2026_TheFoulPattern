const unitBitmaps = [];
const backgroundsBitmaps = [];
const objectBitmaps = [];
const pathBitmaps = [];

// ImageEncryptor: 3 px/char, 3-char, transparent
function encodeBitmap(group, dest) {
	const packed = group[group.length - 1];
	const bank = group[0];
	const n = group.length - 2;
	const step = packed.length / n | 0;
	for (let k = 0; k < n; k++) {
		const enc = packed.substr(k * step, step);
		const px = [];
		for (let i = 0; i < enc.length; i++) {
			const z = enc.charCodeAt(i);
			px.push(z & 3, (z >> 2) & 3, (z >> 4) & 3);
		}
		const pal = group[k + 1];
		const palW = 3;
		dest.push(drawPalettedBitmap([px, bank, pal, palW], pal.substr(0, palW)));
	}
}

const unitData = [
	"eda665433fd049b3592159c6e90465feff8bf59c44834", // color bank
	"ab3", // unicorn idle
	"ab3", // unicorn jump
	"b52", // leprechaun
	"712", // hydra
	"792", // serpent
	"b56", // fiona
	"bd2", // bleys / brand
	"be6", // caine / corwin
	"E@@T?@`jChdNjjzjjz@jzhjzhjzE@@T}@PjNhazjjzjjz@hJpjBpj@@@@@|@`jBljNk{zkUzljNp@Cp@C`OO_yfYufkjy|fN@v@pjNl^z{pypoB\\UIWUukiu\\VM`UCPgK`\\mPpK`z@XiCXeblyJkzAyjg`kN`bB``@@Z@puApUQlnRvzZlkcpnBpsCpp@@k@pVB@UC`vJxnn^jgzzzpsC@CC"
];

const backgroundsData = [
	"4a5395385264133022001758546324", // color bank
	"012456789", // grass
	"023", // tile bottom
	"023", // tile left
	"023", // tile bottom left
	"023", // tile top
	"023", // tile horizontal
	"023", // tile top left
	"023", // tile bay right
	"023", // tile right
	"023", // tile bottom right
	"023", // tile vertical
	"023", // tile bay top
	"023", // tile top right
	"023", // tile bay left
	"023", // tile bay bottom
	"023", // tile hole
	"f_eYoYVYv{fUfZWm|q@B@C@@@l@P@PpV@\\@[wZH_LP@T@h@|@@@@@CLr{mfUg\\x`Lp@@LLDz@@@\\@p@CLVD\\ki|^@SL`HptV@@N@C@y@N@C@fyuNOCI@O@@@@pNl@pI@N@C@Vie^zSO`BpC@L@I@CCeCG@GovaErJCC@K@G|@lN@@pEcvagUuZJ_O`@pLDtW"
];

const objectsData = [
	"ffeffafd0deeabc465faad33622", // color bank
	"678", // jewel
	"012", // sparkleA
	"012", // sparkleB
	"034", // prison
	"012", // up
	"012", // right
	"012", // down
	"012", // left
	"125", // coin
	"`BXIXJhJlNpC@BpC^I\\m`C@B@@Lp`IPE`ILpCLBLAHBDCHCLp@|CsLp@p@@@@C@L|?@L@C@@@@p@p@sL|Cp@p@L@?OL@p@@@H@fHkfXzlOp@"
];

const pathsData = [
	"fffaf92e2", // color bank
	"012", // center
	"012", // top
	"012", // right
	"012", // top-right
	"012", // bottom
	"012", // top-bottom
	"012", // bottom-right
	"012", // top-bottom-right
	"012", // left
	"012", // top-left
	"012", // left-right
	"012", // top-left-right
	"012", // bottom-left
	"012", // top-bottom-left
	"012", // bottom-left-right
	"012", // cross
	"@@@@@@@@@@@@@@@@@@@@@@@@@@@P?AP?AP?AP?APnA@U@@@@@@@@@@@@@@@@@TU@y?@}?@y?@TU@@@@@@P?AP?AP?WP~?@y?@d?@PU@@@@@@@@@@@@@@@@U@PnAP?AP?AP?AP?AP?AP?AP?AP?AP?AP?AP?AP?AP?A@@@@@@@PU@d?@y?P~?P?WP?AP?AP?AP?AP?VP??P??P??P?VP?AP?A@@@@@@UE@?[@?_@?[@UE@@@@@@@P?AP?Au?A?oA?[@?F@UA@@@@@@@@@@@@@UUU?????????UUU@@@@@@P?AP?Ae?V?????????UUU@@@@@@@@@@@@UA@?F@?[@?oAu?AP?AP?AP?AP?Ae?A??A??A??Ae?AP?AP?A@@@@@@UUU?????????e?VP?AP?AP?AP?Ae?V?????????e?VP?AP?A"
];

encodeBitmap(unitData, unitBitmaps);
encodeBitmap(backgroundsData, backgroundsBitmaps);
encodeBitmap(objectsData, objectBitmaps);
encodeBitmap(pathsData, pathBitmaps);

// bitmap: [px, bank, pal, palW, cache]
function drawPalettedBitmap(src, ref) {
	if (!src[4]) src[4] = {};
	if (src[4][ref]) return src[4][ref];
	const bank = src[1];
	const palette = ref.replace(/./g, c => bank.substr(parseInt(c, 16) * 3, 3));
	const c = document.createElement("canvas");
	const ctx = c.getContext("2d");
	const size = Math.sqrt(src[0].length) | 0;
	c.width = size;
	c.height = size;
	for (let i = 5; i--;) c[i] = src[i];
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const p = src[0][y * size + x];
			if (p) {
				ctx.fillStyle = "#" + palette.substr(3 * (p - 1), 3);
				ctx.fillRect(x, y, 1, 1);
			}
		}
	}
	return src[4][ref] = c;
}

function drawPaletted(src, i, dx, dy, dw, dh, ctx) {
	const w = src[3] || 3;
	const ref = i.length ? i : src[2].substr((i || 0) * w, w);
	const bmp = drawPalettedBitmap(src, ref);
	ctx.drawImage(bmp, 0, 0, bmp.width, bmp.height, dx, dy, dw, dh);
}
