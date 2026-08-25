#!/usr/bin/env node
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// ../node_modules/.bun/sisteransi@1.0.5/node_modules/sisteransi/src/index.js
var require_src = __commonJS((exports, module) => {
  var ESC2 = "\x1B";
  var CSI2 = `${ESC2}[`;
  var beep = "\x07";
  var cursor = {
    to(x, y) {
      if (!y)
        return `${CSI2}${x + 1}G`;
      return `${CSI2}${y + 1};${x + 1}H`;
    },
    move(x, y) {
      let ret = "";
      if (x < 0)
        ret += `${CSI2}${-x}D`;
      else if (x > 0)
        ret += `${CSI2}${x}C`;
      if (y < 0)
        ret += `${CSI2}${-y}A`;
      else if (y > 0)
        ret += `${CSI2}${y}B`;
      return ret;
    },
    up: (count = 1) => `${CSI2}${count}A`,
    down: (count = 1) => `${CSI2}${count}B`,
    forward: (count = 1) => `${CSI2}${count}C`,
    backward: (count = 1) => `${CSI2}${count}D`,
    nextLine: (count = 1) => `${CSI2}E`.repeat(count),
    prevLine: (count = 1) => `${CSI2}F`.repeat(count),
    left: `${CSI2}G`,
    hide: `${CSI2}?25l`,
    show: `${CSI2}?25h`,
    save: `${ESC2}7`,
    restore: `${ESC2}8`
  };
  var scroll = {
    up: (count = 1) => `${CSI2}S`.repeat(count),
    down: (count = 1) => `${CSI2}T`.repeat(count)
  };
  var erase = {
    screen: `${CSI2}2J`,
    up: (count = 1) => `${CSI2}1J`.repeat(count),
    down: (count = 1) => `${CSI2}J`.repeat(count),
    line: `${CSI2}2K`,
    lineEnd: `${CSI2}K`,
    lineStart: `${CSI2}1K`,
    lines(count) {
      let clear = "";
      for (let i = 0;i < count; i++)
        clear += this.line + (i < count - 1 ? cursor.up() : "");
      if (count)
        clear += cursor.left;
      return clear;
    }
  };
  module.exports = { cursor, scroll, erase, beep };
});

// ../node_modules/.bun/picocolors@1.1.1/node_modules/picocolors/picocolors.js
var require_picocolors = __commonJS((exports, module) => {
  var p2 = process || {};
  var argv = p2.argv || [];
  var env = p2.env || {};
  var isColorSupported = !(!!env.NO_COLOR || argv.includes("--no-color")) && (!!env.FORCE_COLOR || argv.includes("--color") || p2.platform === "win32" || (p2.stdout || {}).isTTY && env.TERM !== "dumb" || !!env.CI);
  var formatter = (open, close, replace = open) => (input) => {
    let string = "" + input, index = string.indexOf(close, open.length);
    return ~index ? open + replaceClose(string, close, replace, index) + close : open + string + close;
  };
  var replaceClose = (string, close, replace, index) => {
    let result = "", cursor3 = 0;
    do {
      result += string.substring(cursor3, index) + replace;
      cursor3 = index + close.length;
      index = string.indexOf(close, cursor3);
    } while (~index);
    return result + string.substring(cursor3);
  };
  var createColors = (enabled = isColorSupported) => {
    let f2 = enabled ? formatter : () => String;
    return {
      isColorSupported: enabled,
      reset: f2("\x1B[0m", "\x1B[0m"),
      bold: f2("\x1B[1m", "\x1B[22m", "\x1B[22m\x1B[1m"),
      dim: f2("\x1B[2m", "\x1B[22m", "\x1B[22m\x1B[2m"),
      italic: f2("\x1B[3m", "\x1B[23m"),
      underline: f2("\x1B[4m", "\x1B[24m"),
      inverse: f2("\x1B[7m", "\x1B[27m"),
      hidden: f2("\x1B[8m", "\x1B[28m"),
      strikethrough: f2("\x1B[9m", "\x1B[29m"),
      black: f2("\x1B[30m", "\x1B[39m"),
      red: f2("\x1B[31m", "\x1B[39m"),
      green: f2("\x1B[32m", "\x1B[39m"),
      yellow: f2("\x1B[33m", "\x1B[39m"),
      blue: f2("\x1B[34m", "\x1B[39m"),
      magenta: f2("\x1B[35m", "\x1B[39m"),
      cyan: f2("\x1B[36m", "\x1B[39m"),
      white: f2("\x1B[37m", "\x1B[39m"),
      gray: f2("\x1B[90m", "\x1B[39m"),
      bgBlack: f2("\x1B[40m", "\x1B[49m"),
      bgRed: f2("\x1B[41m", "\x1B[49m"),
      bgGreen: f2("\x1B[42m", "\x1B[49m"),
      bgYellow: f2("\x1B[43m", "\x1B[49m"),
      bgBlue: f2("\x1B[44m", "\x1B[49m"),
      bgMagenta: f2("\x1B[45m", "\x1B[49m"),
      bgCyan: f2("\x1B[46m", "\x1B[49m"),
      bgWhite: f2("\x1B[47m", "\x1B[49m"),
      blackBright: f2("\x1B[90m", "\x1B[39m"),
      redBright: f2("\x1B[91m", "\x1B[39m"),
      greenBright: f2("\x1B[92m", "\x1B[39m"),
      yellowBright: f2("\x1B[93m", "\x1B[39m"),
      blueBright: f2("\x1B[94m", "\x1B[39m"),
      magentaBright: f2("\x1B[95m", "\x1B[39m"),
      cyanBright: f2("\x1B[96m", "\x1B[39m"),
      whiteBright: f2("\x1B[97m", "\x1B[39m"),
      bgBlackBright: f2("\x1B[100m", "\x1B[49m"),
      bgRedBright: f2("\x1B[101m", "\x1B[49m"),
      bgGreenBright: f2("\x1B[102m", "\x1B[49m"),
      bgYellowBright: f2("\x1B[103m", "\x1B[49m"),
      bgBlueBright: f2("\x1B[104m", "\x1B[49m"),
      bgMagentaBright: f2("\x1B[105m", "\x1B[49m"),
      bgCyanBright: f2("\x1B[106m", "\x1B[49m"),
      bgWhiteBright: f2("\x1B[107m", "\x1B[49m")
    };
  };
  module.exports = createColors();
  module.exports.createColors = createColors;
});

// src/stepaway.ts
import * as os6 from "node:os";
import * as path15 from "node:path";

// src/commands/push.ts
import { randomUUID } from "node:crypto";
import * as fs8 from "node:fs";
import * as os2 from "node:os";
import * as path9 from "node:path";

// src/sh.ts
import { spawn, spawnSync } from "node:child_process";
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    env: opts.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024
  });
  if (r.error)
    return { code: 127, stdout: "", stderr: String(r.error.message) };
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? ""
  };
}
function runAsync(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    });
    const cap = 64 * 1024 * 1024;
    const sink = () => {
      const bufs = [];
      let size = 0;
      return {
        push(c) {
          bufs.push(c);
          size += c.length;
          while (size > cap && bufs.length > 1)
            size -= bufs.shift().length;
        },
        text: () => Buffer.concat(bufs).toString("utf8")
      };
    };
    const out = sink();
    const err = sink();
    child.stdout?.on("data", (c) => out.push(c));
    child.stderr?.on("data", (c) => err.push(c));
    let settled = false;
    const done = (r) => {
      if (settled)
        return;
      settled = true;
      resolve(r);
    };
    child.on("error", (e) => done({ code: 127, stdout: "", stderr: String(e.message) }));
    child.on("close", (code) => done({
      code: code ?? 1,
      stdout: out.text(),
      stderr: err.text()
    }));
    if (opts.input !== undefined && child.stdin) {
      child.stdin.on("error", () => {});
      child.stdin.end(opts.input);
    }
  });
}
function bashAsync(script, args = [], opts = {}) {
  return runAsync("bash", ["-c", script, "stepaway", ...args], opts);
}
function lastLine(s) {
  const lines = s.trim().split(`
`).filter((l) => l.trim());
  return lines.length ? lines[lines.length - 1] : "(no output)";
}
function which(bin) {
  return run("bash", ["-lc", `command -v ${shq(bin)} >/dev/null 2>&1`]).code === 0;
}
function shq(s) {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

// ../node_modules/.bun/@clack+core@1.4.3/node_modules/@clack/core/dist/index.mjs
import { styleText } from "node:util";
import { stdout, stdin } from "node:process";
import * as l from "node:readline";
import l__default from "node:readline";

// ../node_modules/.bun/fast-string-truncated-width@3.0.3/node_modules/fast-string-truncated-width/dist/utils.js
var getCodePointsLength = (() => {
  const SURROGATE_PAIR_RE = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  return (input) => {
    let surrogatePairsNr = 0;
    SURROGATE_PAIR_RE.lastIndex = 0;
    while (SURROGATE_PAIR_RE.test(input)) {
      surrogatePairsNr += 1;
    }
    return input.length - surrogatePairsNr;
  };
})();
var isFullWidth = (x) => {
  return x === 12288 || x >= 65281 && x <= 65376 || x >= 65504 && x <= 65510;
};
var isWideNotCJKTNotEmoji = (x) => {
  return x === 8987 || x === 9001 || x >= 12272 && x <= 12287 || x >= 12289 && x <= 12350 || x >= 12441 && x <= 12543 || x >= 12549 && x <= 12591 || x >= 12593 && x <= 12686 || x >= 12688 && x <= 12771 || x >= 12783 && x <= 12830 || x >= 12832 && x <= 12871 || x >= 12880 && x <= 19903 || x >= 65040 && x <= 65049 || x >= 65072 && x <= 65106 || x >= 65108 && x <= 65126 || x >= 65128 && x <= 65131 || x >= 127488 && x <= 127490 || x >= 127504 && x <= 127547 || x >= 127552 && x <= 127560 || x >= 131072 && x <= 196605 || x >= 196608 && x <= 262141;
};

// ../node_modules/.bun/fast-string-truncated-width@3.0.3/node_modules/fast-string-truncated-width/dist/index.js
var ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|\u001b\]8;[^;]*;.*?(?:\u0007|\u001b\u005c)/y;
var CONTROL_RE = /[\x00-\x08\x0A-\x1F\x7F-\x9F]{1,1000}/y;
var CJKT_WIDE_RE = /(?:(?![\uFF61-\uFF9F\uFF00-\uFFEF])[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Tangut}]){1,1000}/yu;
var TAB_RE = /\t{1,1000}/y;
var EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}]{2}|\u{1F3F4}[\u{E0061}-\u{E007A}]{2}[\u{E0030}-\u{E0039}\u{E0061}-\u{E007A}]{1,3}\u{E007F}|(?:\p{Emoji}\uFE0F\u20E3?|\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation})(?:\u200D(?:\p{Emoji_Modifier_Base}\p{Emoji_Modifier}?|\p{Emoji_Presentation}|\p{Emoji}\uFE0F\u20E3?))*/yu;
var LATIN_RE = /(?:[\x20-\x7E\xA0-\xFF](?!\uFE0F)){1,1000}/y;
var MODIFIER_RE = /\p{M}+/gu;
var NO_TRUNCATION = { limit: Infinity, ellipsis: "" };
var getStringTruncatedWidth = (input, truncationOptions = {}, widthOptions = {}) => {
  const LIMIT = truncationOptions.limit ?? Infinity;
  const ELLIPSIS = truncationOptions.ellipsis ?? "";
  const ELLIPSIS_WIDTH = truncationOptions?.ellipsisWidth ?? (ELLIPSIS ? getStringTruncatedWidth(ELLIPSIS, NO_TRUNCATION, widthOptions).width : 0);
  const ANSI_WIDTH = 0;
  const CONTROL_WIDTH = widthOptions.controlWidth ?? 0;
  const TAB_WIDTH = widthOptions.tabWidth ?? 8;
  const EMOJI_WIDTH = widthOptions.emojiWidth ?? 2;
  const FULL_WIDTH_WIDTH = 2;
  const REGULAR_WIDTH = widthOptions.regularWidth ?? 1;
  const WIDE_WIDTH = widthOptions.wideWidth ?? FULL_WIDTH_WIDTH;
  const PARSE_BLOCKS = [
    [LATIN_RE, REGULAR_WIDTH],
    [ANSI_RE, ANSI_WIDTH],
    [CONTROL_RE, CONTROL_WIDTH],
    [TAB_RE, TAB_WIDTH],
    [EMOJI_RE, EMOJI_WIDTH],
    [CJKT_WIDE_RE, WIDE_WIDTH]
  ];
  let indexPrev = 0;
  let index = 0;
  let length = input.length;
  let lengthExtra = 0;
  let truncationEnabled = false;
  let truncationIndex = length;
  let truncationLimit = Math.max(0, LIMIT - ELLIPSIS_WIDTH);
  let unmatchedStart = 0;
  let unmatchedEnd = 0;
  let width = 0;
  let widthExtra = 0;
  outer:
    while (true) {
      if (unmatchedEnd > unmatchedStart || index >= length && index > indexPrev) {
        const unmatched = input.slice(unmatchedStart, unmatchedEnd) || input.slice(indexPrev, index);
        lengthExtra = 0;
        for (const char of unmatched.replaceAll(MODIFIER_RE, "")) {
          const codePoint = char.codePointAt(0) || 0;
          if (isFullWidth(codePoint)) {
            widthExtra = FULL_WIDTH_WIDTH;
          } else if (isWideNotCJKTNotEmoji(codePoint)) {
            widthExtra = WIDE_WIDTH;
          } else {
            widthExtra = REGULAR_WIDTH;
          }
          if (width + widthExtra > truncationLimit) {
            truncationIndex = Math.min(truncationIndex, Math.max(unmatchedStart, indexPrev) + lengthExtra);
          }
          if (width + widthExtra > LIMIT) {
            truncationEnabled = true;
            break outer;
          }
          lengthExtra += char.length;
          width += widthExtra;
        }
        unmatchedStart = unmatchedEnd = 0;
      }
      if (index >= length) {
        break outer;
      }
      for (let i = 0, l = PARSE_BLOCKS.length;i < l; i++) {
        const [BLOCK_RE, BLOCK_WIDTH] = PARSE_BLOCKS[i];
        BLOCK_RE.lastIndex = index;
        if (BLOCK_RE.test(input)) {
          lengthExtra = BLOCK_RE === CJKT_WIDE_RE ? getCodePointsLength(input.slice(index, BLOCK_RE.lastIndex)) : BLOCK_RE === EMOJI_RE ? 1 : BLOCK_RE.lastIndex - index;
          widthExtra = lengthExtra * BLOCK_WIDTH;
          if (width + widthExtra > truncationLimit) {
            truncationIndex = Math.min(truncationIndex, index + Math.floor((truncationLimit - width) / BLOCK_WIDTH));
          }
          if (width + widthExtra > LIMIT) {
            truncationEnabled = true;
            break outer;
          }
          width += widthExtra;
          unmatchedStart = indexPrev;
          unmatchedEnd = index;
          index = indexPrev = BLOCK_RE.lastIndex;
          continue outer;
        }
      }
      index += 1;
    }
  return {
    width: truncationEnabled ? truncationLimit : width,
    index: truncationEnabled ? truncationIndex : length,
    truncated: truncationEnabled,
    ellipsed: truncationEnabled && LIMIT >= ELLIPSIS_WIDTH
  };
};
var dist_default = getStringTruncatedWidth;

// ../node_modules/.bun/fast-string-width@3.0.2/node_modules/fast-string-width/dist/index.js
var NO_TRUNCATION2 = {
  limit: Infinity,
  ellipsis: "",
  ellipsisWidth: 0
};
var fastStringWidth = (input, options = {}) => {
  return dist_default(input, NO_TRUNCATION2, options).width;
};
var dist_default2 = fastStringWidth;

// ../node_modules/.bun/fast-wrap-ansi@0.2.2/node_modules/fast-wrap-ansi/lib/main.js
var ESC = "\x1B";
var CSI = "";
var END_CODE = 39;
var ANSI_ESCAPE_BELL = "\x07";
var ANSI_CSI = "[";
var ANSI_OSC = "]";
var ANSI_SGR_TERMINATOR = "m";
var ANSI_ESCAPE_LINK = `${ANSI_OSC}8;;`;
var GROUP_REGEX = new RegExp(`(?:\\${ANSI_CSI}(?<code>\\d+)m|\\${ANSI_ESCAPE_LINK}(?<uri>.*)${ANSI_ESCAPE_BELL})`, "y");
var getClosingCode = (openingCode) => {
  if (openingCode >= 30 && openingCode <= 37)
    return 39;
  if (openingCode >= 90 && openingCode <= 97)
    return 39;
  if (openingCode >= 40 && openingCode <= 47)
    return 49;
  if (openingCode >= 100 && openingCode <= 107)
    return 49;
  if (openingCode === 1 || openingCode === 2)
    return 22;
  if (openingCode === 3)
    return 23;
  if (openingCode === 4)
    return 24;
  if (openingCode === 7)
    return 27;
  if (openingCode === 8)
    return 28;
  if (openingCode === 9)
    return 29;
  if (openingCode === 0)
    return 0;
  return;
};
var wrapAnsiCode = (code) => `${ESC}${ANSI_CSI}${code}${ANSI_SGR_TERMINATOR}`;
var wrapAnsiHyperlink = (url) => `${ESC}${ANSI_ESCAPE_LINK}${url}${ANSI_ESCAPE_BELL}`;
var wrapWord = (rows, word, columns) => {
  const characters = word[Symbol.iterator]();
  let isInsideEscape = false;
  let isInsideLinkEscape = false;
  let lastRow = rows.at(-1);
  let visible = lastRow === undefined ? 0 : dist_default2(lastRow);
  let currentCharacter = characters.next();
  let nextCharacter = characters.next();
  let rawCharacterIndex = 0;
  while (!currentCharacter.done) {
    const character = currentCharacter.value;
    const characterLength = dist_default2(character);
    if (visible + characterLength <= columns) {
      rows[rows.length - 1] += character;
    } else {
      rows.push(character);
      visible = 0;
    }
    if (character === ESC || character === CSI) {
      isInsideEscape = true;
      isInsideLinkEscape = word.startsWith(ANSI_ESCAPE_LINK, rawCharacterIndex + 1);
    }
    if (isInsideEscape) {
      if (isInsideLinkEscape) {
        if (character === ANSI_ESCAPE_BELL) {
          isInsideEscape = false;
          isInsideLinkEscape = false;
        }
      } else if (character === ANSI_SGR_TERMINATOR) {
        isInsideEscape = false;
      }
    } else {
      visible += characterLength;
      if (visible === columns && !nextCharacter.done) {
        rows.push("");
        visible = 0;
      }
    }
    currentCharacter = nextCharacter;
    nextCharacter = characters.next();
    rawCharacterIndex += character.length;
  }
  lastRow = rows.at(-1);
  if (!visible && lastRow !== undefined && lastRow.length && rows.length > 1) {
    rows[rows.length - 2] += rows.pop();
  }
};
var stringVisibleTrimSpacesRight = (string) => {
  const words = string.split(" ");
  let last = words.length;
  while (last) {
    if (dist_default2(words[last - 1])) {
      break;
    }
    last--;
  }
  if (last === words.length) {
    return string;
  }
  return words.slice(0, last).join(" ") + words.slice(last).join("");
};
var exec = (string, columns, options = {}) => {
  if (options.trim !== false && string.trim() === "") {
    return "";
  }
  let returnValue = "";
  let escapeCode;
  let escapeUrl;
  const words = string.split(" ");
  let rows = [""];
  let rowLength = 0;
  for (let index = 0;index < words.length; index++) {
    const word = words[index];
    if (options.trim !== false) {
      const row = rows.at(-1) ?? "";
      const trimmed = row.trimStart();
      if (row.length !== trimmed.length) {
        rows[rows.length - 1] = trimmed;
        rowLength = dist_default2(trimmed);
      }
    }
    if (index !== 0) {
      if (rowLength >= columns && (options.wordWrap === false || options.trim === false)) {
        rows.push("");
        rowLength = 0;
      }
      if (rowLength || options.trim === false) {
        rows[rows.length - 1] += " ";
        rowLength++;
      }
    }
    const wordLength = dist_default2(word);
    if (options.hard && wordLength > columns) {
      const remainingColumns = columns - rowLength;
      const breaksStartingThisLine = 1 + Math.floor((wordLength - remainingColumns - 1) / columns);
      const breaksStartingNextLine = Math.floor((wordLength - 1) / columns);
      if (breaksStartingNextLine < breaksStartingThisLine) {
        rows.push("");
      }
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    if (rowLength + wordLength > columns && rowLength && wordLength) {
      if (options.wordWrap === false && rowLength < columns) {
        wrapWord(rows, word, columns);
        rowLength = dist_default2(rows.at(-1) ?? "");
        continue;
      }
      rows.push("");
      rowLength = 0;
    }
    if (rowLength + wordLength > columns && options.wordWrap === false) {
      wrapWord(rows, word, columns);
      rowLength = dist_default2(rows.at(-1) ?? "");
      continue;
    }
    rows[rows.length - 1] += word;
    rowLength += wordLength;
  }
  if (options.trim !== false) {
    rows = rows.map((row) => stringVisibleTrimSpacesRight(row));
  }
  const preString = rows.join(`
`);
  let inSurrogate = false;
  for (let i = 0;i < preString.length; i++) {
    const character = preString[i];
    returnValue += character;
    if (!inSurrogate) {
      inSurrogate = character >= "\uD800" && character <= "\uDBFF";
      if (inSurrogate) {
        continue;
      }
    } else {
      inSurrogate = false;
    }
    if (character === ESC || character === CSI) {
      GROUP_REGEX.lastIndex = i + 1;
      const groupsResult = GROUP_REGEX.exec(preString);
      const groups = groupsResult?.groups;
      if (groups?.code !== undefined) {
        const code = Number.parseFloat(groups.code);
        escapeCode = code === END_CODE ? undefined : code;
      } else if (groups?.uri !== undefined) {
        escapeUrl = groups.uri.length === 0 ? undefined : groups.uri;
      }
    }
    if (preString[i + 1] === `
`) {
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink("");
      }
      const closingCode = escapeCode ? getClosingCode(escapeCode) : undefined;
      if (escapeCode && closingCode) {
        returnValue += wrapAnsiCode(closingCode);
      }
    } else if (character === `
`) {
      if (escapeCode && getClosingCode(escapeCode)) {
        returnValue += wrapAnsiCode(escapeCode);
      }
      if (escapeUrl) {
        returnValue += wrapAnsiHyperlink(escapeUrl);
      }
    }
  }
  return returnValue;
};
var CRLF_OR_LF = /\r?\n/;
function wrapAnsi(string, columns, options) {
  return String(string).normalize().split(CRLF_OR_LF).map((line) => exec(line, columns, options)).join(`
`);
}

// ../node_modules/.bun/@clack+core@1.4.3/node_modules/@clack/core/dist/index.mjs
var import_sisteransi = __toESM(require_src(), 1);
import { ReadStream } from "node:tty";
function findCursor(s, o, l2) {
  if (!l2.some((r) => !r.disabled))
    return s;
  const t = s + o, n = Math.max(l2.length - 1, 0), e = t < 0 ? n : t > n ? 0 : t;
  return l2[e]?.disabled ? findCursor(e, o < 0 ? -1 : 1, l2) : e;
}
function findTextCursor(s, o, l2, i) {
  const t = i.split(`
`);
  let n = 0, e = s;
  for (const r of t) {
    if (e <= r.length)
      break;
    e -= r.length + 1, n++;
  }
  for (n = Math.max(0, Math.min(t.length - 1, n + l2)), e = Math.min(e, t[n].length) + o;e < 0 && n > 0; )
    n--, e += t[n].length + 1;
  for (;e > t[n].length && n < t.length - 1; )
    e -= t[n].length + 1, n++;
  e = Math.max(0, Math.min(t[n].length, e));
  let h = 0;
  for (let r = 0;r < n; r++)
    h += t[r].length + 1;
  return h + e;
}
var a$1 = ["up", "down", "left", "right", "space", "enter", "cancel"];
var t = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];
var settings = {
  actions: new Set(a$1),
  aliases: /* @__PURE__ */ new Map([
    ["k", "up"],
    ["j", "down"],
    ["h", "left"],
    ["l", "right"],
    ["\x03", "cancel"],
    ["escape", "cancel"]
  ]),
  messages: {
    cancel: "Canceled",
    error: "Something went wrong"
  },
  withGuide: true,
  date: {
    monthNames: [...t],
    messages: {
      required: "Please enter a valid date",
      invalidMonth: "There are only 12 months in a year",
      invalidDay: (n, e) => `There are only ${n} days in ${e}`,
      afterMin: (n) => `Date must be on or after ${n.toISOString().slice(0, 10)}`,
      beforeMax: (n) => `Date must be on or before ${n.toISOString().slice(0, 10)}`
    }
  }
};
function isActionKey(n, e) {
  if (typeof n == "string")
    return settings.aliases.get(n) === e;
  for (const s of n)
    if (s !== undefined && isActionKey(s, e))
      return true;
  return false;
}
function diffLines(i, s) {
  if (i === s)
    return;
  const e = i.split(`
`), t2 = s.split(`
`), r = Math.max(e.length, t2.length), f = [];
  for (let n = 0;n < r; n++)
    e[n] !== t2[n] && f.push(n);
  return {
    lines: f,
    numLinesBefore: e.length,
    numLinesAfter: t2.length,
    numLines: r
  };
}
var R = globalThis.process.platform.startsWith("win");
var CANCEL_SYMBOL = Symbol("clack:cancel");
function isCancel(e) {
  return e === CANCEL_SYMBOL;
}
function setRawMode(e, r) {
  const o = e;
  o.isTTY && o.setRawMode(r);
}
function block({
  input: e = stdin,
  output: r = stdout,
  overwrite: o = true,
  hideCursor: t2 = true
} = {}) {
  const s = l.createInterface({
    input: e,
    output: r,
    prompt: "",
    tabSize: 1
  });
  l.emitKeypressEvents(e, s), e instanceof ReadStream && e.isTTY && e.setRawMode(true);
  const n = (f, { name: a, sequence: p }) => {
    const c = String(f);
    if (isActionKey([c, a, p], "cancel")) {
      t2 && r.write(import_sisteransi.cursor.show), process.exit(0);
      return;
    }
    if (!o)
      return;
    const i = a === "return" ? 0 : -1, m = a === "return" ? -1 : 0;
    l.moveCursor(r, i, m, () => {
      l.clearLine(r, 1, () => {
        e.once("keypress", n);
      });
    });
  };
  return t2 && r.write(import_sisteransi.cursor.hide), e.once("keypress", n), () => {
    e.off("keypress", n), t2 && r.write(import_sisteransi.cursor.show), e instanceof ReadStream && e.isTTY && !R && e.setRawMode(false), s.terminal = false, s.close();
  };
}
var getColumns = (e) => ("columns" in e) && typeof e.columns == "number" ? e.columns : 80;
var getRows = (e) => ("rows" in e) && typeof e.rows == "number" ? e.rows : 20;
function wrapTextWithPrefix(e, r, o, t2 = o, s = o, n) {
  const f = getColumns(e ?? stdout);
  return wrapAnsi(r, f - o.length, {
    hard: true,
    trim: false
  }).split(`
`).map((c, i, m) => {
    const d = n ? n(c, i) : c;
    return i === 0 ? `${t2}${d}` : i === m.length - 1 ? `${s}${d}` : `${o}${d}`;
  }).join(`
`);
}
function runValidation(e, n) {
  if ("~standard" in e) {
    const a = e["~standard"].validate(n);
    if (a instanceof Promise)
      throw new TypeError("Schema validation must be synchronous. Update `validate()` and remove any asynchronous logic.");
    return a.issues?.at(0)?.message;
  }
  return e(n);
}

class V {
  input;
  output;
  _abortSignal;
  rl;
  opts;
  _render;
  _track = false;
  _prevFrame = "";
  _subscribers = /* @__PURE__ */ new Map;
  _cursor = 0;
  state = "initial";
  error = "";
  value;
  userInput = "";
  constructor(t2, e = true) {
    const { input: i = stdin, output: n = stdout, render: s, signal: r, ...o } = t2;
    this.opts = o, this.onKeypress = this.onKeypress.bind(this), this.close = this.close.bind(this), this.render = this.render.bind(this), this._render = s.bind(this), this._track = e, this._abortSignal = r, this.input = i, this.output = n;
  }
  unsubscribe() {
    this._subscribers.clear();
  }
  setSubscriber(t2, e) {
    const i = this._subscribers.get(t2) ?? [];
    i.push(e), this._subscribers.set(t2, i);
  }
  on(t2, e) {
    this.setSubscriber(t2, { cb: e });
  }
  once(t2, e) {
    this.setSubscriber(t2, { cb: e, once: true });
  }
  emit(t2, ...e) {
    const i = this._subscribers.get(t2) ?? [], n = [];
    for (const s of i)
      s.cb(...e), s.once && n.push(() => i.splice(i.indexOf(s), 1));
    for (const s of n)
      s();
  }
  prompt() {
    return new Promise((t2) => {
      if (this._abortSignal) {
        if (this._abortSignal.aborted)
          return this.state = "cancel", this.close(), t2(CANCEL_SYMBOL);
        this._abortSignal.addEventListener("abort", () => {
          this.state = "cancel", this.close();
        }, { once: true });
      }
      this.rl = l__default.createInterface({
        input: this.input,
        tabSize: 2,
        prompt: "",
        escapeCodeTimeout: 50,
        terminal: true
      }), this.rl.prompt(), this.opts.initialUserInput !== undefined && this._setUserInput(this.opts.initialUserInput, true), this.input.on("keypress", this.onKeypress), setRawMode(this.input, true), this.output.on("resize", this.render), this.render(), this.once("submit", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), setRawMode(this.input, false), t2(this.value);
      }), this.once("cancel", () => {
        this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), setRawMode(this.input, false), t2(CANCEL_SYMBOL);
      });
    });
  }
  _isActionKey(t2, e) {
    return t2 === "\t";
  }
  _shouldSubmit(t2, e) {
    return true;
  }
  _setValue(t2) {
    this.value = t2, this.emit("value", this.value);
  }
  _setUserInput(t2, e) {
    this.userInput = t2 ?? "", this.emit("userInput", this.userInput), e && this._track && this.rl && (this.rl.write(this.userInput), this._cursor = this.rl.cursor);
  }
  _clearUserInput() {
    this.rl?.write(null, { ctrl: true, name: "u" }), this._setUserInput("");
  }
  onKeypress(t2, e) {
    if (this._track && e.name !== "return" && (e.name && this._isActionKey(t2, e) && this.rl?.write(null, { ctrl: true, name: "h" }), this._cursor = this.rl?.cursor ?? 0, this._setUserInput(this.rl?.line)), this.state === "error" && (this.state = "active"), e?.name && (!this._track && settings.aliases.has(e.name) && this.emit("cursor", settings.aliases.get(e.name)), settings.actions.has(e.name) && this.emit("cursor", e.name)), t2 && (t2.toLowerCase() === "y" || t2.toLowerCase() === "n") && this.emit("confirm", t2.toLowerCase() === "y"), this.emit("key", t2, e), e?.name === "return" && this._shouldSubmit(t2, e)) {
      if (this.opts.validate) {
        const i = runValidation(this.opts.validate, this.value);
        i && (this.error = i instanceof Error ? i.message : i, this.state = "error", this.rl?.write(this.userInput));
      }
      this.state !== "error" && (this.state = "submit");
    }
    isActionKey([t2, e?.name, e?.sequence], "cancel") && (this.state = "cancel"), (this.state === "submit" || this.state === "cancel") && this.emit("finalize"), this.render(), (this.state === "submit" || this.state === "cancel") && this.close();
  }
  close() {
    this.input.unpipe(), this.input.removeListener("keypress", this.onKeypress), this.output.write(`
`), setRawMode(this.input, false), this.rl?.close(), this.rl = undefined, this.emit(`${this.state}`, this.value), this.unsubscribe();
  }
  restoreCursor() {
    const t2 = wrapAnsi(this._prevFrame, process.stdout.columns, { hard: true, trim: false }).split(`
`).length - 1;
    this.output.write(import_sisteransi.cursor.move(-999, t2 * -1));
  }
  render() {
    const t2 = wrapAnsi(this._render(this) ?? "", process.stdout.columns, {
      hard: true,
      trim: false
    });
    if (t2 !== this._prevFrame) {
      if (this.state === "initial")
        this.output.write(import_sisteransi.cursor.hide);
      else {
        const e = diffLines(this._prevFrame, t2), i = getRows(this.output);
        if (this.restoreCursor(), e) {
          const n = Math.max(0, e.numLinesAfter - i), s = Math.max(0, e.numLinesBefore - i);
          let r = e.lines.find((o) => o >= n);
          if (r === undefined) {
            this._prevFrame = t2;
            return;
          }
          if (e.lines.length === 1) {
            this.output.write(import_sisteransi.cursor.move(0, r - s)), this.output.write(import_sisteransi.erase.lines(1));
            const o = t2.split(`
`);
            this.output.write(o[r]), this._prevFrame = t2, this.output.write(import_sisteransi.cursor.move(0, o.length - r - 1));
            return;
          } else if (e.lines.length > 1) {
            if (n < s)
              r = n;
            else {
              const h = r - s;
              h > 0 && this.output.write(import_sisteransi.cursor.move(0, h));
            }
            this.output.write(import_sisteransi.erase.down());
            const f = t2.split(`
`).slice(r);
            this.output.write(f.join(`
`)), this._prevFrame = t2;
            return;
          }
        }
        this.output.write(import_sisteransi.erase.down());
      }
      this.output.write(t2), this.state === "initial" && (this.state = "active"), this._prevFrame = t2;
    }
  }
}
function p$1(l2, e) {
  if (l2 === undefined || e.length === 0)
    return 0;
  const i = e.findIndex((s) => s.value === l2);
  return i !== -1 ? i : 0;
}
function g(l2, e) {
  return (e.label ?? String(e.value)).toLowerCase().includes(l2.toLowerCase());
}
function m(l2, e) {
  if (e)
    return l2 ? e : e[0];
}
var T$1 = class T extends V {
  filteredOptions;
  multiple;
  isNavigating = false;
  selectedValues = [];
  focusedValue;
  #e = 0;
  #s = "";
  #t;
  #i;
  #n;
  get cursor() {
    return this.#e;
  }
  get userInputWithCursor() {
    if (!this.userInput)
      return styleText(["inverse", "hidden"], "_");
    if (this._cursor >= this.userInput.length)
      return `${this.userInput}█`;
    const e = this.userInput.slice(0, this.cursor), t2 = this.userInput.slice(this.cursor, this.cursor + 1), i = this.userInput.slice(this.cursor + 1);
    return `${e}${styleText("inverse", t2)}${i}`;
  }
  get options() {
    return typeof this.#i == "function" ? this.#i() : this.#i;
  }
  constructor(e) {
    super(e), this.#i = e.options, this.#n = e.placeholder;
    const t2 = this.options;
    this.filteredOptions = [...t2], this.multiple = e.multiple === true, this.#t = typeof e.options == "function" ? e.filter : e.filter ?? g;
    let i;
    if (e.initialValue && Array.isArray(e.initialValue) ? this.multiple ? i = e.initialValue : i = e.initialValue.slice(0, 1) : !this.multiple && this.options.length > 0 && (i = [this.options[0]?.value]), i)
      for (const s of i) {
        const n = t2.findIndex((o) => o.value === s);
        n !== -1 && (this.toggleSelected(s), this.#e = n);
      }
    this.focusedValue = this.options[this.#e]?.value, this.on("key", (s, n) => this.#l(s, n)), this.on("userInput", (s) => this.#u(s));
  }
  _isActionKey(e, t2) {
    return e === "\t" || this.multiple && this.isNavigating && t2.name === "space" && e !== undefined && e !== "";
  }
  #l(e, t2) {
    const i = t2.name === "up", s = t2.name === "down", n = t2.name === "return", o = this.userInput === "" || this.userInput === "\t", u = this.#n, a = this.options, f = u !== undefined && u !== "" && a.some((r) => !r.disabled && (this.#t ? this.#t(u, r) : true));
    if (t2.name === "tab" && o && f) {
      this.userInput === "\t" && this._clearUserInput(), this._setUserInput(u, true), this.isNavigating = false;
      return;
    }
    i || s ? (this.#e = findCursor(this.#e, i ? -1 : 1, this.filteredOptions), this.focusedValue = this.filteredOptions[this.#e]?.value, this.multiple || (this.selectedValues = [this.focusedValue]), this.isNavigating = true) : n ? this.value = m(this.multiple, this.selectedValues) : this.multiple ? this.focusedValue !== undefined && (t2.name === "tab" || this.isNavigating && t2.name === "space") ? this.toggleSelected(this.focusedValue) : this.isNavigating = false : (this.focusedValue && (this.selectedValues = [this.focusedValue]), this.isNavigating = false);
  }
  deselectAll() {
    this.selectedValues = [];
  }
  toggleSelected(e) {
    this.filteredOptions.length !== 0 && (this.multiple ? this.selectedValues.includes(e) ? this.selectedValues = this.selectedValues.filter((t2) => t2 !== e) : this.selectedValues = [...this.selectedValues, e] : this.selectedValues = [e]);
  }
  #u(e) {
    if (e !== this.#s) {
      this.#s = e;
      const t2 = this.options;
      e && this.#t ? this.filteredOptions = t2.filter((n) => this.#t?.(e, n)) : this.filteredOptions = [...t2];
      const i = p$1(this.focusedValue, this.filteredOptions);
      this.#e = findCursor(i, 0, this.filteredOptions);
      const s = this.filteredOptions[this.#e];
      s && !s.disabled ? this.focusedValue = s.value : this.focusedValue = undefined, this.multiple || (this.focusedValue !== undefined ? this.toggleSelected(this.focusedValue) : this.deselectAll());
    }
  }
};

class r extends V {
  get cursor() {
    return this.value ? 0 : 1;
  }
  get _value() {
    return this.cursor === 0;
  }
  constructor(t2) {
    super(t2, false), this.value = !!t2.initialValue, this.on("userInput", () => {
      this.value = this._value;
    }), this.on("confirm", (i) => {
      this.output.write(import_sisteransi.cursor.move(0, -1)), this.value = i, this.state = "submit", this.close();
    }), this.on("cursor", () => {
      this.value = !this.value;
    });
  }
}
var _ = {
  Y: { type: "year", len: 4 },
  M: { type: "month", len: 2 },
  D: { type: "day", len: 2 }
};
function M(r2) {
  return [...r2].map((t2) => _[t2]);
}
function P(r2) {
  const i = new Intl.DateTimeFormat(r2, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(2000, 0, 15)), s = [];
  let n = "/";
  for (const e of i)
    e.type === "literal" ? n = e.value.trim() || e.value : (e.type === "year" || e.type === "month" || e.type === "day") && s.push({ type: e.type, len: e.type === "year" ? 4 : 2 });
  return { segments: s, separator: n };
}
function p(r2) {
  return Number.parseInt((r2 || "0").replace(/_/g, "0"), 10) || 0;
}
function f(r2) {
  return {
    year: p(r2.year),
    month: p(r2.month),
    day: p(r2.day)
  };
}
function c(r2, t2) {
  return new Date(r2 || 2001, t2 || 1, 0).getDate();
}
function b(r2) {
  const { year: t2, month: i, day: s } = f(r2);
  if (!t2 || t2 < 0 || t2 > 9999 || !i || i < 1 || i > 12 || !s || s < 1)
    return;
  const n = new Date(Date.UTC(t2, i - 1, s));
  if (!(n.getUTCFullYear() !== t2 || n.getUTCMonth() !== i - 1 || n.getUTCDate() !== s))
    return { year: t2, month: i, day: s };
}
function C(r2) {
  const t2 = b(r2);
  return t2 ? new Date(Date.UTC(t2.year, t2.month - 1, t2.day)) : undefined;
}
function T2(r2, t2, i, s) {
  const n = i ? {
    year: i.getUTCFullYear(),
    month: i.getUTCMonth() + 1,
    day: i.getUTCDate()
  } : null, e = s ? {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate()
  } : null;
  return r2 === "year" ? { min: n?.year ?? 1, max: e?.year ?? 9999 } : r2 === "month" ? {
    min: n && t2.year === n.year ? n.month : 1,
    max: e && t2.year === e.year ? e.month : 12
  } : {
    min: n && t2.year === n.year && t2.month === n.month ? n.day : 1,
    max: e && t2.year === e.year && t2.month === e.month ? e.day : c(t2.year, t2.month)
  };
}

class U extends V {
  #i;
  #o;
  #t;
  #h;
  #u;
  #e = { segmentIndex: 0, positionInSegment: 0 };
  #n = true;
  #s = null;
  inlineError = "";
  get segmentCursor() {
    return { ...this.#e };
  }
  get segmentValues() {
    return { ...this.#t };
  }
  get segments() {
    return this.#i;
  }
  get separator() {
    return this.#o;
  }
  get formattedValue() {
    return this.#l(this.#t);
  }
  #l(t2) {
    return this.#i.map((i) => t2[i.type]).join(this.#o);
  }
  #r() {
    this._setUserInput(this.#l(this.#t)), this._setValue(C(this.#t) ?? undefined);
  }
  constructor(t2) {
    const i = t2.format ? { segments: M(t2.format), separator: t2.separator ?? "/" } : P(t2.locale), s = t2.separator ?? i.separator, n = t2.format ? M(t2.format) : i.segments, e = t2.initialValue ?? t2.defaultValue, m2 = e ? {
      year: String(e.getUTCFullYear()).padStart(4, "0"),
      month: String(e.getUTCMonth() + 1).padStart(2, "0"),
      day: String(e.getUTCDate()).padStart(2, "0")
    } : { year: "____", month: "__", day: "__" }, o = n.map((a) => m2[a.type]).join(s);
    super({ ...t2, initialUserInput: o }, false), this.#i = n, this.#o = s, this.#t = m2, this.#h = t2.minDate, this.#u = t2.maxDate, this.#r(), this.on("cursor", (a) => this.#f(a)), this.on("key", (a, u) => this.#y(a, u)), this.on("finalize", () => this.#p(t2));
  }
  #a() {
    const t2 = Math.max(0, Math.min(this.#e.segmentIndex, this.#i.length - 1)), i = this.#i[t2];
    if (i)
      return this.#e.positionInSegment = Math.max(0, Math.min(this.#e.positionInSegment, i.len - 1)), { segment: i, index: t2 };
  }
  #m(t2) {
    this.inlineError = "", this.#s = null;
    const i = this.#a();
    i && (this.#e.segmentIndex = Math.max(0, Math.min(this.#i.length - 1, i.index + t2)), this.#e.positionInSegment = 0, this.#n = true);
  }
  #d(t2) {
    const i = this.#a();
    if (!i)
      return;
    const { segment: s } = i, n = this.#t[s.type], e = !n || n.replace(/_/g, "") === "", m2 = Number.parseInt((n || "0").replace(/_/g, "0"), 10) || 0, o = T2(s.type, f(this.#t), this.#h, this.#u);
    let a;
    e ? a = t2 === 1 ? o.min : o.max : a = Math.max(Math.min(o.max, m2 + t2), o.min), this.#t = {
      ...this.#t,
      [s.type]: a.toString().padStart(s.len, "0")
    }, this.#n = true, this.#s = null, this.#r();
  }
  #f(t2) {
    if (t2)
      switch (t2) {
        case "right":
          return this.#m(1);
        case "left":
          return this.#m(-1);
        case "up":
          return this.#d(1);
        case "down":
          return this.#d(-1);
      }
  }
  #y(t2, i) {
    if (i?.name === "backspace" || i?.sequence === "" || i?.sequence === "\b" || t2 === "" || t2 === "\b") {
      this.inlineError = "";
      const n = this.#a();
      if (!n)
        return;
      if (!this.#t[n.segment.type].replace(/_/g, "")) {
        this.#m(-1);
        return;
      }
      this.#t[n.segment.type] = "_".repeat(n.segment.len), this.#n = true, this.#e.positionInSegment = 0, this.#r();
      return;
    }
    if (i?.name === "tab") {
      this.inlineError = "";
      const n = this.#a();
      if (!n)
        return;
      const e = i.shift ? -1 : 1, m2 = n.index + e;
      m2 >= 0 && m2 < this.#i.length && (this.#e.segmentIndex = m2, this.#e.positionInSegment = 0, this.#n = true);
      return;
    }
    if (t2 && /^[0-9]$/.test(t2)) {
      const n = this.#a();
      if (!n)
        return;
      const { segment: e } = n, m2 = !this.#t[e.type].replace(/_/g, "");
      if (this.#n && this.#s !== null && !m2) {
        const h = this.#s + t2, d = { ...this.#t, [e.type]: h }, g2 = this.#g(d, e);
        if (g2) {
          this.inlineError = g2, this.#s = null, this.#n = false;
          return;
        }
        this.inlineError = "", this.#t[e.type] = h, this.#s = null, this.#n = false, this.#r(), n.index < this.#i.length - 1 && (this.#e.segmentIndex = n.index + 1, this.#e.positionInSegment = 0, this.#n = true);
        return;
      }
      this.#n && !m2 && (this.#t[e.type] = "_".repeat(e.len), this.#e.positionInSegment = 0), this.#n = false, this.#s = null;
      const o = this.#t[e.type], a = o.indexOf("_"), u = a >= 0 ? a : Math.min(this.#e.positionInSegment, e.len - 1);
      if (u < 0 || u >= e.len)
        return;
      let l2 = o.slice(0, u) + t2 + o.slice(u + 1), D = false;
      if (u === 0 && o === "__" && (e.type === "month" || e.type === "day")) {
        const h = Number.parseInt(t2, 10);
        l2 = `0${t2}`, D = h <= (e.type === "month" ? 1 : 2);
      }
      if (e.type === "year" && (l2 = (o.replace(/_/g, "") + t2).padStart(e.len, "_")), !l2.includes("_")) {
        const h = { ...this.#t, [e.type]: l2 }, d = this.#g(h, e);
        if (d) {
          this.inlineError = d;
          return;
        }
      }
      this.inlineError = "", this.#t[e.type] = l2;
      const y = l2.includes("_") ? undefined : b(this.#t);
      if (y) {
        const { year: h, month: d } = y, g2 = c(h, d);
        this.#t = {
          year: String(Math.max(0, Math.min(9999, h))).padStart(4, "0"),
          month: String(Math.max(1, Math.min(12, d))).padStart(2, "0"),
          day: String(Math.max(1, Math.min(g2, y.day))).padStart(2, "0")
        };
      }
      this.#r();
      const S = l2.indexOf("_");
      D ? (this.#n = true, this.#s = t2) : S >= 0 ? this.#e.positionInSegment = S : a >= 0 && n.index < this.#i.length - 1 ? (this.#e.segmentIndex = n.index + 1, this.#e.positionInSegment = 0, this.#n = true) : this.#e.positionInSegment = Math.min(u + 1, e.len - 1);
    }
  }
  #g(t2, i) {
    const { month: s, day: n } = f(t2);
    if (i.type === "month" && (s < 0 || s > 12))
      return settings.date.messages.invalidMonth;
    if (i.type === "day" && (n < 0 || n > 31))
      return settings.date.messages.invalidDay(31, "any month");
  }
  #p(t2) {
    const { year: i, month: s, day: n } = f(this.#t);
    if (i && s && n) {
      const e = c(i, s);
      this.#t = {
        ...this.#t,
        day: String(Math.min(n, e)).padStart(2, "0")
      };
    }
    this.value = C(this.#t) ?? t2.defaultValue ?? undefined;
  }
}
var u$2 = class u extends V {
  options;
  cursor = 0;
  #t;
  getGroupItems(t2) {
    return this.options.filter((r2) => r2.group === t2);
  }
  isGroupSelected(t2) {
    const r2 = this.getGroupItems(t2), e = this.value;
    return e === undefined ? false : r2.every((s) => e.includes(s.value));
  }
  toggleValue() {
    const t2 = this.options[this.cursor];
    if (t2 !== undefined)
      if (this.value === undefined && (this.value = []), t2.group === true) {
        const r2 = t2.value, e = this.getGroupItems(r2);
        this.isGroupSelected(r2) ? this.value = this.value.filter((s) => e.findIndex((i) => i.value === s) === -1) : this.value = [...this.value, ...e.map((s) => s.value)], this.value = Array.from(new Set(this.value));
      } else {
        const r2 = this.value.includes(t2.value);
        this.value = r2 ? this.value.filter((e) => e !== t2.value) : [...this.value, t2.value];
      }
  }
  constructor(t2) {
    super(t2, false);
    const { options: r2 } = t2;
    this.#t = t2.selectableGroups !== false, this.options = Object.entries(r2).flatMap(([e, s]) => [
      { value: e, group: true, label: e },
      ...s.map((i) => ({ ...i, group: e }))
    ]), this.value = [...t2.initialValues ?? []], this.cursor = Math.max(this.options.findIndex(({ value: e }) => e === t2.cursorAt), this.#t ? 0 : 1), this.on("cursor", (e) => {
      switch (e) {
        case "left":
        case "up": {
          this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
          const s = this.options[this.cursor]?.group === true;
          !this.#t && s && (this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1);
          break;
        }
        case "down":
        case "right": {
          this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
          const s = this.options[this.cursor]?.group === true;
          !this.#t && s && (this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1);
          break;
        }
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
};
var o = /* @__PURE__ */ new Set(["up", "down", "left", "right"]);

class h extends V {
  #t = false;
  #s;
  focused = "editor";
  get userInputWithCursor() {
    if (this.state === "submit")
      return this.userInput;
    const t2 = this.userInput;
    if (this.cursor >= t2.length)
      return `${t2}█`;
    const s = t2.slice(0, this.cursor), r2 = t2.slice(this.cursor, this.cursor + 1), i = t2.slice(this.cursor + 1);
    return r2 === `
` ? `${s}█
${i}` : `${s}${styleText("inverse", r2)}${i}`;
  }
  get cursor() {
    return this._cursor;
  }
  #r(t2) {
    if (this.userInput.length === 0) {
      this._setUserInput(t2);
      return;
    }
    this._setUserInput(this.userInput.slice(0, this.cursor) + t2 + this.userInput.slice(this.cursor));
  }
  #i(t2) {
    const s = this.value ?? "";
    switch (t2) {
      case "up":
        this._cursor = findTextCursor(this._cursor, 0, -1, s);
        return;
      case "down":
        this._cursor = findTextCursor(this._cursor, 0, 1, s);
        return;
      case "left":
        this._cursor = findTextCursor(this._cursor, -1, 0, s);
        return;
      case "right":
        this._cursor = findTextCursor(this._cursor, 1, 0, s);
        return;
    }
  }
  _shouldSubmit(t2, s) {
    if (this.#s)
      return this.focused === "submit" ? true : (this.#r(`
`), this._cursor++, false);
    const r2 = this.#t;
    return this.#t = true, r2 && this.cursor === this.userInput.length ? (this.userInput[this.cursor - 1] === `
` && (this._setUserInput(this.userInput.slice(0, this.cursor - 1) + this.userInput.slice(this.cursor)), this._cursor--), true) : (this.#r(`
`), this._cursor++, false);
  }
  constructor(t2) {
    const s = t2.initialUserInput ?? t2.initialValue;
    super({
      ...t2,
      initialUserInput: s
    }, false), s !== undefined && (this._cursor = s.length), this.#s = t2.showSubmit ?? false, this.on("key", (r2, i) => {
      if (i?.name && o.has(i.name)) {
        this.#t = false, this.#i(i.name);
        return;
      }
      if (r2 === "\t" && this.#s) {
        this.focused = this.focused === "editor" ? "submit" : "editor";
        return;
      }
      if (i?.name !== "return") {
        if (this.#t = false, i?.name === "backspace" && this.cursor > 0) {
          this._setUserInput(this.userInput.slice(0, this.cursor - 1) + this.userInput.slice(this.cursor)), this._cursor--;
          return;
        }
        if (i?.name === "delete" && this.cursor < this.userInput.length) {
          this._setUserInput(this.userInput.slice(0, this.cursor) + this.userInput.slice(this.cursor + 1));
          return;
        }
        r2 && (this.#s && this.focused === "submit" && (this.focused = "editor"), this.#r(r2 ?? ""), this._cursor++);
      }
    }), this.on("userInput", (r2) => {
      this._setValue(r2);
    }), this.on("finalize", () => {
      this.value || (this.value = t2.defaultValue), this.value === undefined && (this.value = "");
    });
  }
}

class a extends V {
  options;
  cursor = 0;
  get _value() {
    return this.options[this.cursor]?.value;
  }
  get _enabledOptions() {
    return this.options.filter((e) => e.disabled !== true);
  }
  toggleAll() {
    const e = this._enabledOptions, i = this.value !== undefined && this.value.length === e.length;
    this.value = i ? [] : e.map((t2) => t2.value);
  }
  toggleInvert() {
    const e = this.value;
    if (!e)
      return;
    const i = this._enabledOptions.filter((t2) => !e.includes(t2.value));
    this.value = i.map((t2) => t2.value);
  }
  toggleValue() {
    this.value === undefined && (this.value = []);
    const e = this.value.includes(this._value);
    this.value = e ? this.value.filter((i) => i !== this._value) : [...this.value, this._value];
  }
  constructor(e) {
    super(e, false), this.options = e.options, this.value = [...e.initialValues ?? []];
    const i = Math.max(this.options.findIndex(({ value: t2 }) => t2 === e.cursorAt), 0);
    this.cursor = this.options[i]?.disabled ? findCursor(i, 1, this.options) : i, this.on("key", (t2, l2) => {
      l2.name === "a" && this.toggleAll(), l2.name === "i" && this.toggleInvert();
    }), this.on("cursor", (t2) => {
      switch (t2) {
        case "left":
        case "up":
          this.cursor = findCursor(this.cursor, -1, this.options);
          break;
        case "down":
        case "right":
          this.cursor = findCursor(this.cursor, 1, this.options);
          break;
        case "space":
          this.toggleValue();
          break;
      }
    });
  }
}
class n extends V {
  get userInputWithCursor() {
    if (this.state === "submit")
      return this.userInput;
    const t2 = this.userInput;
    if (this.cursor >= t2.length)
      return `${this.userInput}█`;
    const r2 = t2.slice(0, this.cursor), s = t2.slice(this.cursor, this.cursor + 1), e = t2.slice(this.cursor + 1);
    return `${r2}${styleText("inverse", s)}${e}`;
  }
  get cursor() {
    return this._cursor;
  }
  constructor(t2) {
    super({
      ...t2,
      initialUserInput: t2.initialUserInput ?? t2.initialValue
    }), this.on("userInput", (r2) => {
      this._setValue(r2);
    }), this.on("finalize", () => {
      this.value || (this.value = t2.defaultValue), this.value === undefined && (this.value = "");
    });
  }
}

// ../node_modules/.bun/@clack+prompts@1.7.0/node_modules/@clack/prompts/dist/index.mjs
import { styleText as styleText2, stripVTControlCharacters } from "node:util";
import process$1 from "node:process";
var import_sisteransi2 = __toESM(require_src(), 1);
function isUnicodeSupported() {
  if (process$1.platform !== "win32") {
    return process$1.env.TERM !== "linux";
  }
  return Boolean(process$1.env.CI) || Boolean(process$1.env.WT_SESSION) || Boolean(process$1.env.TERMINUS_SUBLIME) || process$1.env.ConEmuTask === "{cmd::Cmder}" || process$1.env.TERM_PROGRAM === "Terminus-Sublime" || process$1.env.TERM_PROGRAM === "vscode" || process$1.env.TERM === "xterm-256color" || process$1.env.TERM === "alacritty" || process$1.env.TERMINAL_EMULATOR === "JetBrains-JediTerm";
}
var unicode = isUnicodeSupported();
var isCI = () => process.env.CI === "true";
var unicodeOr = (o2, e) => unicode ? o2 : e;
var S_STEP_ACTIVE = unicodeOr("◆", "*");
var S_STEP_CANCEL = unicodeOr("■", "x");
var S_STEP_ERROR = unicodeOr("▲", "x");
var S_STEP_SUBMIT = unicodeOr("◇", "o");
var S_BAR_START = unicodeOr("┌", "T");
var S_BAR = unicodeOr("│", "|");
var S_BAR_END = unicodeOr("└", "—");
var S_BAR_START_RIGHT = unicodeOr("┐", "T");
var S_BAR_END_RIGHT = unicodeOr("┘", "—");
var S_RADIO_ACTIVE = unicodeOr("●", ">");
var S_RADIO_INACTIVE = unicodeOr("○", " ");
var S_CHECKBOX_ACTIVE = unicodeOr("◻", "[•]");
var S_CHECKBOX_SELECTED = unicodeOr("◼", "[+]");
var S_CHECKBOX_INACTIVE = unicodeOr("◻", "[ ]");
var S_PASSWORD_MASK = unicodeOr("▪", "•");
var S_BAR_H = unicodeOr("─", "-");
var S_CORNER_TOP_RIGHT = unicodeOr("╮", "+");
var S_CONNECT_LEFT = unicodeOr("├", "+");
var S_CORNER_BOTTOM_RIGHT = unicodeOr("╯", "+");
var S_CORNER_BOTTOM_LEFT = unicodeOr("╰", "+");
var S_CORNER_TOP_LEFT = unicodeOr("╭", "+");
var S_INFO = unicodeOr("●", "•");
var S_SUCCESS = unicodeOr("◆", "*");
var S_WARN = unicodeOr("▲", "!");
var S_ERROR = unicodeOr("■", "x");
var symbol = (o2) => {
  switch (o2) {
    case "initial":
    case "active":
      return styleText2("cyan", S_STEP_ACTIVE);
    case "cancel":
      return styleText2("red", S_STEP_CANCEL);
    case "error":
      return styleText2("yellow", S_STEP_ERROR);
    case "submit":
      return styleText2("green", S_STEP_SUBMIT);
  }
};
var symbolBar = (o2) => {
  switch (o2) {
    case "initial":
    case "active":
      return styleText2("cyan", S_BAR);
    case "cancel":
      return styleText2("red", S_BAR);
    case "error":
      return styleText2("yellow", S_BAR);
    case "submit":
      return styleText2("green", S_BAR);
  }
};
function formatInstructionFooter(o2, e) {
  const r2 = [`${e ? `${styleText2("cyan", S_BAR)}  ` : ""}${o2.join(" • ")}`];
  return e && r2.push(styleText2("cyan", S_BAR_END)), r2;
}
var I = (l2, e, w, p2, b2, C2 = false) => {
  let r2 = e, O = 0;
  if (C2)
    for (let i = p2 - 1;i >= w; i--) {
      const m2 = l2[i];
      if (m2 && (r2 -= m2.length), O++, r2 <= b2)
        break;
    }
  else
    for (let i = w;i < p2; i++) {
      const m2 = l2[i];
      if (m2 && (r2 -= m2.length), O++, r2 <= b2)
        break;
    }
  return { lineCount: r2, removals: O };
};
var limitOptions = ({
  cursor: l2,
  options: e,
  style: w,
  output: p2 = process.stdout,
  maxItems: b2 = Number.POSITIVE_INFINITY,
  columnPadding: C2 = 0,
  rowPadding: r2 = 4
}) => {
  const i = getColumns(p2) - C2, m2 = getRows(p2), M2 = styleText2("dim", "..."), v = Math.max(m2 - r2, 0), a2 = Math.max(Math.min(b2, v), 5);
  let f2 = 0;
  l2 >= a2 - 3 && (f2 = Math.max(Math.min(l2 - a2 + 3, e.length - a2), 0));
  let d = a2 < e.length && f2 > 0, c2 = a2 < e.length && f2 + a2 < e.length;
  const W = Math.min(f2 + a2, e.length), s = [];
  let g2 = 0;
  d && g2++, c2 && g2++;
  const T3 = f2 + (d ? 1 : 0), y = W - (c2 ? 1 : 0);
  for (let t2 = T3;t2 < y; t2++) {
    const n2 = e[t2], o2 = n2 ? w(n2, t2 === l2) : "", h2 = wrapAnsi(o2, i, {
      hard: true,
      trim: false
    }).split(`
`);
    s.push(h2), g2 += h2.length;
  }
  if (g2 > v) {
    let t2 = 0, n2 = 0, o2 = g2;
    const h2 = l2 - T3;
    let u3 = v;
    const L = () => I(s, o2, 0, h2, u3), E = () => I(s, o2, h2 + 1, s.length, u3, true);
    d ? ({ lineCount: o2, removals: t2 } = L(), o2 > u3 && (c2 || (u3 -= 1), { lineCount: o2, removals: n2 } = E())) : (c2 || (u3 -= 1), { lineCount: o2, removals: n2 } = E(), o2 > u3 && (u3 -= 1, { lineCount: o2, removals: t2 } = L())), t2 > 0 && (d = true, s.splice(0, t2)), n2 > 0 && (c2 = true, s.splice(s.length - n2, n2));
  }
  const x = [];
  d && x.push(M2);
  for (const t2 of s)
    for (const n2 of t2)
      x.push(n2);
  return c2 && x.push(M2), x;
};
var confirm = (i) => {
  const a2 = i.active ?? "Yes", s = i.inactive ?? "No";
  return new r({
    active: a2,
    inactive: s,
    signal: i.signal,
    input: i.input,
    output: i.output,
    initialValue: i.initialValue ?? true,
    render() {
      const e = i.withGuide ?? settings.withGuide, u3 = `${symbol(this.state)}  `, l2 = e ? `${styleText2("gray", S_BAR)}  ` : "", f2 = wrapTextWithPrefix(i.output, i.message, l2, u3), o2 = `${e ? `${styleText2("gray", S_BAR)}
` : ""}${f2}
`, c2 = this.value ? a2 : s;
      switch (this.state) {
        case "submit": {
          const r2 = e ? `${styleText2("gray", S_BAR)}  ` : "";
          return `${o2}${r2}${styleText2("dim", c2)}`;
        }
        case "cancel": {
          const r2 = e ? `${styleText2("gray", S_BAR)}  ` : "";
          return `${o2}${r2}${styleText2(["strikethrough", "dim"], c2)}${e ? `
${styleText2("gray", S_BAR)}` : ""}`;
        }
        default: {
          const r2 = e ? `${styleText2("cyan", S_BAR)}  ` : "", g2 = e ? styleText2("cyan", S_BAR_END) : "";
          return `${o2}${r2}${this.value ? `${styleText2("green", S_RADIO_ACTIVE)} ${a2}` : `${styleText2("dim", S_RADIO_INACTIVE)} ${styleText2("dim", a2)}`}${i.vertical ? e ? `
${styleText2("cyan", S_BAR)}  ` : `
` : ` ${styleText2("dim", "/")} `}${this.value ? `${styleText2("dim", S_RADIO_INACTIVE)} ${styleText2("dim", s)}` : `${styleText2("green", S_RADIO_ACTIVE)} ${s}`}
${g2}
`;
        }
      }
    }
  }).prompt();
};
var MULTISELECT_INSTRUCTIONS = [
  `${styleText2("dim", "↑/↓")} to navigate`,
  `${styleText2("dim", "Space:")} select`,
  `${styleText2("dim", "Enter:")} confirm`
];
var m2 = (i, u3) => i.split(`
`).map((d) => u3(d)).join(`
`);
var multiselect = (i) => {
  const u3 = (t2, a2) => {
    const r2 = t2.label ?? String(t2.value);
    return a2 === "disabled" ? `${styleText2("gray", S_CHECKBOX_INACTIVE)} ${m2(r2, (o2) => styleText2(["strikethrough", "gray"], o2))}${t2.hint ? ` ${styleText2("dim", `(${t2.hint ?? "disabled"})`)}` : ""}` : a2 === "active" ? `${styleText2("cyan", S_CHECKBOX_ACTIVE)} ${r2}${t2.hint ? ` ${styleText2("dim", `(${t2.hint})`)}` : ""}` : a2 === "selected" ? `${styleText2("green", S_CHECKBOX_SELECTED)} ${m2(r2, (o2) => styleText2("dim", o2))}${t2.hint ? ` ${styleText2("dim", `(${t2.hint})`)}` : ""}` : a2 === "cancelled" ? `${m2(r2, (o2) => styleText2(["strikethrough", "dim"], o2))}` : a2 === "active-selected" ? `${styleText2("green", S_CHECKBOX_SELECTED)} ${r2}${t2.hint ? ` ${styleText2("dim", `(${t2.hint})`)}` : ""}` : a2 === "submitted" ? `${m2(r2, (o2) => styleText2("dim", o2))}` : `${styleText2("dim", S_CHECKBOX_INACTIVE)} ${m2(r2, (o2) => styleText2("dim", o2))}`;
  }, d = i.required ?? true, v = i.showInstructions ?? true;
  return new a({
    options: i.options,
    signal: i.signal,
    input: i.input,
    output: i.output,
    initialValues: i.initialValues,
    required: d,
    cursorAt: i.cursorAt,
    validate(t2) {
      if (d && (t2 === undefined || t2.length === 0))
        return `Please select at least one option.
${styleText2("reset", styleText2("dim", `Press ${styleText2(["gray", "bgWhite", "inverse"], " space ")} to select, ${styleText2("gray", styleText2("bgWhite", styleText2("inverse", " enter ")))} to submit`))}`;
    },
    render() {
      const t2 = i.withGuide ?? settings.withGuide, a2 = wrapTextWithPrefix(i.output, i.message, t2 ? `${symbolBar(this.state)}  ` : "", `${symbol(this.state)}  `), r2 = `${t2 ? `${styleText2("gray", S_BAR)}
` : ""}${a2}
`, o2 = this.value ?? [], p2 = (n2, l2) => {
        if (n2.disabled)
          return u3(n2, "disabled");
        const s = o2.includes(n2.value);
        return l2 && s ? u3(n2, "active-selected") : s ? u3(n2, "selected") : u3(n2, l2 ? "active" : "inactive");
      };
      switch (this.state) {
        case "submit": {
          const n2 = this.options.filter(({ value: s }) => o2.includes(s)).map((s) => u3(s, "submitted")).join(styleText2("dim", ", ")) || styleText2("dim", "none"), l2 = wrapTextWithPrefix(i.output, n2, t2 ? `${styleText2("gray", S_BAR)}  ` : "");
          return `${r2}${l2}`;
        }
        case "cancel": {
          const n2 = this.options.filter(({ value: s }) => o2.includes(s)).map((s) => u3(s, "cancelled")).join(styleText2("dim", ", "));
          if (n2.trim() === "")
            return `${r2}${styleText2("gray", S_BAR)}`;
          const l2 = wrapTextWithPrefix(i.output, n2, t2 ? `${styleText2("gray", S_BAR)}  ` : "");
          return `${r2}${l2}${t2 ? `
${styleText2("gray", S_BAR)}` : ""}`;
        }
        case "error": {
          const n2 = t2 ? `${styleText2("yellow", S_BAR)}  ` : "", l2 = this.error.split(`
`).map(($, C2) => C2 === 0 ? `${t2 ? `${styleText2("yellow", S_BAR_END)}  ` : ""}${styleText2("yellow", $)}` : `   ${$}`).join(`
`), s = r2.split(`
`).length, h2 = l2.split(`
`).length + 1;
          return `${r2}${n2}${limitOptions({
            output: i.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: i.maxItems,
            columnPadding: n2.length,
            rowPadding: s + h2,
            style: p2
          }).join(`
${n2}`)}
${l2}
`;
        }
        default: {
          const n2 = t2 ? `${styleText2("cyan", S_BAR)}  ` : "", l2 = r2.split(`
`).length, s = v ? formatInstructionFooter(MULTISELECT_INSTRUCTIONS, t2) : t2 ? [styleText2("cyan", S_BAR_END)] : [], h2 = s.join(`
`), $ = s.length + 1;
          return `${r2}${n2}${limitOptions({
            output: i.output,
            options: this.options,
            cursor: this.cursor,
            maxItems: i.maxItems,
            columnPadding: n2.length,
            rowPadding: l2 + $,
            style: p2
          }).join(`
${n2}`)}
${h2}
`;
        }
      }
    }
  }).prompt();
};
var log = {
  message: (s = [], {
    symbol: e = styleText2("gray", S_BAR),
    secondarySymbol: r2 = styleText2("gray", S_BAR),
    output: m3 = process.stdout,
    spacing: l2 = 1,
    withGuide: c2
  } = {}) => {
    const t2 = [], o2 = c2 ?? settings.withGuide, f2 = o2 ? r2 : "", O = o2 ? `${e}  ` : "", u3 = o2 ? `${r2}  ` : "";
    for (let i = 0;i < l2; i++)
      t2.push(f2);
    const g2 = Array.isArray(s) ? s : s.split(`
`);
    if (g2.length > 0) {
      const [i, ...y] = g2;
      i.length > 0 ? t2.push(`${O}${i}`) : t2.push(o2 ? e : "");
      for (const p2 of y)
        p2.length > 0 ? t2.push(`${u3}${p2}`) : t2.push(o2 ? r2 : "");
    }
    m3.write(`${t2.join(`
`)}
`);
  },
  info: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("blue", S_INFO) });
  },
  success: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("green", S_SUCCESS) });
  },
  step: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("green", S_STEP_SUBMIT) });
  },
  warn: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("yellow", S_WARN) });
  },
  warning: (s, e) => {
    log.warn(s, e);
  },
  error: (s, e) => {
    log.message(s, { ...e, symbol: styleText2("red", S_ERROR) });
  }
};
var cancel = (o2 = "", t2) => {
  const i = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR_END)}  ` : "";
  i.write(`${e}${styleText2("red", o2)}

`);
};
var intro = (o2 = "", t2) => {
  const i = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR_START)}  ` : "";
  i.write(`${e}${o2}
`);
};
var outro = (o2 = "", t2) => {
  const i = t2?.output ?? process.stdout, e = t2?.withGuide ?? settings.withGuide ? `${styleText2("gray", S_BAR)}
${styleText2("gray", S_BAR_END)}  ` : "";
  i.write(`${e}${o2}

`);
};
var W$1 = (o2) => o2;
var C2 = (o2, e, s) => {
  const a2 = {
    hard: true,
    trim: false
  }, i = wrapAnsi(o2, e, a2).split(`
`), c2 = i.reduce((n2, t2) => Math.max(dist_default2(t2), n2), 0), u3 = i.map(s).reduce((n2, t2) => Math.max(dist_default2(t2), n2), 0), g2 = e - (u3 - c2);
  return wrapAnsi(o2, g2, a2);
};
var note = (o2 = "", e = "", s) => {
  const a2 = s?.output ?? process$1.stdout, i = s?.withGuide ?? settings.withGuide, c2 = s?.format ?? W$1, g2 = ["", ...C2(o2, getColumns(a2) - 6, c2).split(`
`).map(c2), ""], n2 = dist_default2(e), t2 = Math.max(g2.reduce((m3, F) => {
    const O = dist_default2(F);
    return O > m3 ? O : m3;
  }, 0), n2) + 2, h2 = g2.map((m3) => `${styleText2("gray", S_BAR)}  ${m3}${" ".repeat(t2 - dist_default2(m3))}${styleText2("gray", S_BAR)}`).join(`
`), T3 = i ? `${styleText2("gray", S_BAR)}
` : "", l$1 = i ? S_CONNECT_LEFT : S_CORNER_BOTTOM_LEFT;
  a2.write(`${T3}${styleText2("green", S_STEP_SUBMIT)}  ${styleText2("reset", e)} ${styleText2("gray", S_BAR_H.repeat(Math.max(t2 - n2 - 1, 1)) + S_CORNER_TOP_RIGHT)}
${h2}
${styleText2("gray", l$1 + S_BAR_H.repeat(t2 + 2) + S_CORNER_BOTTOM_RIGHT)}
`);
};
var W = (l2) => styleText2("magenta", l2);
var spinner = ({
  indicator: l2 = "dots",
  onCancel: h2,
  output: n2 = process.stdout,
  cancelMessage: G,
  errorMessage: O,
  frames: E = unicode ? ["◒", "◐", "◓", "◑"] : ["•", "o", "O", "0"],
  delay: F = unicode ? 80 : 120,
  signal: m3,
  ...I2
} = {}) => {
  const u3 = isCI();
  let M2, T3, d = false, S = false, s = "", p2, w = performance.now();
  const x = getColumns(n2), k = I2?.styleFrame ?? W, g2 = (e) => {
    const r2 = e > 1 ? O ?? settings.messages.error : G ?? settings.messages.cancel;
    S = e === 1, d && (a2(r2, e), S && typeof h2 == "function" && h2());
  }, f2 = () => g2(2), i = () => g2(1), A = () => {
    process.on("uncaughtExceptionMonitor", f2), process.on("unhandledRejection", f2), process.on("SIGINT", i), process.on("SIGTERM", i), process.on("exit", g2), m3 && m3.addEventListener("abort", i);
  }, H = () => {
    process.removeListener("uncaughtExceptionMonitor", f2), process.removeListener("unhandledRejection", f2), process.removeListener("SIGINT", i), process.removeListener("SIGTERM", i), process.removeListener("exit", g2), m3 && m3.removeEventListener("abort", i);
  }, y = () => {
    if (p2 === undefined)
      return;
    u3 && n2.write(`
`);
    const r2 = wrapAnsi(p2, x, {
      hard: true,
      trim: false
    }).split(`
`);
    r2.length > 1 && n2.write(import_sisteransi2.cursor.up(r2.length - 1)), n2.write(import_sisteransi2.cursor.to(0)), n2.write(import_sisteransi2.erase.down());
  }, C3 = (e) => e.replace(/\.+$/, ""), _2 = (e) => {
    const r2 = (performance.now() - e) / 1000, t2 = Math.floor(r2 / 60), o2 = Math.floor(r2 % 60);
    return t2 > 0 ? `[${t2}m ${o2}s]` : `[${o2}s]`;
  }, N = I2.withGuide ?? settings.withGuide, P2 = (e = "") => {
    d = true, M2 = block({ output: n2 }), s = C3(e), w = performance.now(), N && n2.write(`${styleText2("gray", S_BAR)}
`);
    let r2 = 0, t2 = 0;
    A(), T3 = setInterval(() => {
      if (u3 && s === p2)
        return;
      y(), p2 = s;
      const o2 = k(E[r2]);
      let v;
      if (u3)
        v = `${o2}  ${s}...`;
      else if (l2 === "timer")
        v = `${o2}  ${s} ${_2(w)}`;
      else {
        const B = ".".repeat(Math.floor(t2)).slice(0, 3);
        v = `${o2}  ${s}${B}`;
      }
      const j = wrapAnsi(v, x, {
        hard: true,
        trim: false
      });
      n2.write(j), r2 = r2 + 1 < E.length ? r2 + 1 : 0, t2 = t2 < 4 ? t2 + 0.125 : 0;
    }, F);
  }, a2 = (e = "", r2 = 0, t2 = false) => {
    if (!d)
      return;
    d = false, clearInterval(T3), y();
    const o2 = r2 === 0 ? styleText2("green", S_STEP_SUBMIT) : r2 === 1 ? styleText2("red", S_STEP_CANCEL) : styleText2("red", S_STEP_ERROR);
    s = e ?? s, t2 || (l2 === "timer" ? n2.write(`${o2}  ${s} ${_2(w)}
`) : n2.write(`${o2}  ${s}
`)), H(), M2();
  };
  return {
    start: P2,
    stop: (e = "") => a2(e, 0),
    message: (e = "") => {
      s = C3(e ?? s);
    },
    cancel: (e = "") => a2(e, 1),
    error: (e = "") => a2(e, 2),
    clear: () => a2("", 0, true),
    get isCancelled() {
      return S;
    }
  };
};
var u3 = {
  light: unicodeOr("─", "-"),
  heavy: unicodeOr("━", "="),
  block: unicodeOr("█", "#")
};
var SELECT_INSTRUCTIONS = [
  `${styleText2("dim", "↑/↓")} to navigate`,
  `${styleText2("dim", "Enter:")} confirm`
];
var i = `${styleText2("gray", S_BAR)}  `;
var text = (e) => new n({
  validate: e.validate,
  placeholder: e.placeholder,
  defaultValue: e.defaultValue,
  initialValue: e.initialValue,
  output: e.output,
  signal: e.signal,
  input: e.input,
  render() {
    const i2 = e?.withGuide ?? settings.withGuide, s = `${`${i2 ? `${styleText2("gray", S_BAR)}
` : ""}${symbol(this.state)}  `}${e.message}
`, c2 = e.placeholder && e.placeholder.length > 0 ? styleText2("inverse", e.placeholder[0]) + styleText2("dim", e.placeholder.slice(1)) : styleText2(["inverse", "hidden"], "_"), o2 = this.userInput ? this.userInputWithCursor : c2, l2 = this.value ?? "";
    switch (this.state) {
      case "error": {
        const n2 = this.error ? `  ${styleText2("yellow", this.error)}` : "", r2 = i2 ? `${styleText2("yellow", S_BAR)}  ` : "", d = i2 ? styleText2("yellow", S_BAR_END) : "";
        return `${s.trim()}
${r2}${o2}
${d}${n2}
`;
      }
      case "submit": {
        const n2 = l2 ? `  ${styleText2("dim", l2)}` : "", r2 = i2 ? styleText2("gray", S_BAR) : "";
        return `${s}${r2}${n2}`;
      }
      case "cancel": {
        const n2 = l2 ? `  ${styleText2(["strikethrough", "dim"], l2)}` : "", r2 = i2 ? styleText2("gray", S_BAR) : "";
        return `${s}${r2}${n2}${l2.trim() ? `
${r2}` : ""}`;
      }
      default: {
        const n2 = i2 ? `${styleText2("cyan", S_BAR)}  ` : "", r2 = i2 ? styleText2("cyan", S_BAR_END) : "";
        return `${s}${n2}${o2}
${r2}
`;
      }
    }
  }
}).prompt();

// src/ui.ts
var import_picocolors = __toESM(require_picocolors(), 1);
var isTTYOut = () => Boolean(process.stdout.isTTY);

class Ui {
  verbose;
  fancy;
  started = false;
  constructor(opts = {}) {
    this.verbose = Boolean(opts.verbose);
    this.fancy = !opts.plain && isTTYOut();
  }
  get interactive() {
    return Boolean(process.stdin.isTTY && process.stdout.isTTY);
  }
  static from(flags) {
    return new Ui({ verbose: Boolean(flags.verbose), plain: Boolean(flags.yes || flags.json) });
  }
  intro(title) {
    this.started = true;
    if (this.fancy)
      intro(import_picocolors.default.bgCyan(import_picocolors.default.black(` ${title} `)));
    else
      process.stderr.write(`${title}
`);
  }
  outro(message) {
    if (this.fancy && this.started)
      outro(message);
    else
      process.stdout.write(`${message}
`);
  }
  step(message) {
    if (this.fancy)
      log.step(message);
    else
      process.stderr.write(`${message}
`);
  }
  success(message) {
    if (this.fancy)
      log.success(import_picocolors.default.green(message));
    else
      process.stderr.write(`${message}
`);
  }
  info(message) {
    if (this.fancy)
      log.info(message);
    else
      process.stderr.write(`${message}
`);
  }
  detail(message) {
    if (!this.verbose)
      return;
    const text2 = message.replace(/\n+$/, "");
    if (!text2)
      return;
    if (this.fancy)
      log.message(import_picocolors.default.dim(text2));
    else
      process.stderr.write(`${text2}
`);
  }
  warn(message) {
    if (this.fancy)
      log.warn(import_picocolors.default.yellow(message));
    else
      process.stderr.write(`warning: ${message}
`);
  }
  error(message, suggestion) {
    if (this.fancy) {
      log.error(import_picocolors.default.red(message));
      if (suggestion)
        log.message(import_picocolors.default.dim(suggestion));
    } else {
      process.stderr.write(`${message}
`);
      if (suggestion)
        process.stderr.write(`${suggestion}
`);
    }
  }
  note(body, title) {
    if (this.fancy)
      note(body, title);
    else
      process.stdout.write((title ? `${title}
` : "") + body + `
`);
  }
  raw(text2) {
    process.stdout.write(text2);
  }
  cancel(message) {
    if (this.fancy)
      cancel(message);
    else
      process.stderr.write(`${message}
`);
  }
  spinner(label) {
    if (!this.fancy) {
      process.stderr.write(`${label}
`);
      return {
        update: (m3) => {
          if (this.verbose)
            process.stderr.write(`${m3}
`);
        },
        stop: (m3) => {
          if (m3)
            process.stderr.write(`${m3}
`);
        },
        fail: (m3) => process.stderr.write(`${m3}
`)
      };
    }
    const s = spinner({ indicator: "timer" });
    s.start(label);
    let done = false;
    return {
      update: (m3) => {
        if (!done)
          s.message(m3);
      },
      stop: (m3) => {
        if (done)
          return;
        done = true;
        s.stop(m3 ?? label);
      },
      fail: (m3) => {
        if (done)
          return;
        done = true;
        s.error(import_picocolors.default.red(m3));
      }
    };
  }
  async confirm(question, fallback) {
    if (!this.fancy || !this.interactive)
      return fallback;
    const a2 = await confirm({ message: question, initialValue: false });
    if (isCancel(a2))
      return false;
    return Boolean(a2);
  }
  async multiselect(question, options, fallback) {
    if (!this.fancy || !this.interactive || !options.length)
      return fallback;
    const a2 = await multiselect({
      message: question,
      options,
      initialValues: fallback,
      required: false
    });
    if (isCancel(a2))
      return fallback;
    return a2;
  }
  async text(question, placeholder) {
    if (!this.fancy || !this.interactive)
      return "";
    const a2 = await text({ message: question, placeholder, defaultValue: "" });
    if (isCancel(a2))
      return "";
    return String(a2 ?? "");
  }
}
var c2 = {
  ok: (s) => import_picocolors.default.green(s),
  warn: (s) => import_picocolors.default.yellow(s),
  bad: (s) => import_picocolors.default.red(s),
  dim: (s) => import_picocolors.default.dim(s),
  bold: (s) => import_picocolors.default.bold(s),
  cyan: (s) => import_picocolors.default.cyan(s)
};
function colorize(enabled) {
  if (enabled)
    return c2;
  const id = (s) => s;
  return { ok: id, warn: id, bad: id, dim: id, bold: id, cyan: id };
}
function pad(s, n2) {
  return s.length >= n2 ? s : s + " ".repeat(n2 - s.length);
}

// ../packages/core/src/config.ts
import * as path from "node:path";
var DEFAULT_EXCLUDES = [".claude/worktrees/", ".codex/worktrees/"];
var CONFIG_FILE = ".stepaway.json";
var DEFAULT_CONFIG = {
  remotePathBase: "/work",
  composeFile: null,
  excludeGlobs: [],
  setup: null,
  env: null
};
function excludePrefixes(cfg) {
  return [...DEFAULT_EXCLUDES, ...cfg.excludeGlobs].map((s) => s.replace(/^\.\//, "")).filter(Boolean);
}
function remoteProjectPath(cfg, localRoot) {
  return `${cfg.remotePathBase.replace(/\/+$/, "")}/${path.basename(localRoot)}`;
}
function remoteGitDir(localRoot) {
  return `/repo/${path.basename(localRoot)}.git`;
}
// ../packages/core/src/manifest.ts
function parseLargestDirty(line) {
  const [bytes, ...rest] = line.split("\t");
  return { path: rest.join("\t"), bytes: Number(bytes) || 0 };
}
function composeManifest(f2, extras = {}) {
  const carried = extras.envFiles ?? [];
  const carriedSet = new Set(carried.map((c3) => c3.path));
  return {
    captured: {
      project_path: f2.projectPath,
      slug: f2.slug,
      branch: f2.branch,
      head: f2.head,
      claude_version: f2.claudeVersion,
      session_ids: f2.sessionIds,
      dirty_file_count: f2.dirtyFiles.length,
      largest_dirty_files: f2.largestDirty.map(parseLargestDirty),
      env_files: carried,
      docker: extras.docker ?? null
    },
    not_captured: {
      gitignored_files: f2.ignoredCount,
      running_processes: true,
      env: {
        required_variables: f2.requiredVars,
        unsatisfied_variables: extras.unsatisfied ?? [],
        skipped_env_files: extras.skippedEnvFiles ?? f2.declaredEnvFiles.filter((d) => !carriedSet.has(d))
      },
      local_services: true,
      databases: true,
      orphan_containers: extras.docker?.orphans ?? [],
      refused_containers: extras.docker?.refused ?? [],
      docker_volumes_never_return: true
    }
  };
}
function capturedSessionId(m3) {
  return m3.captured.session_ids[0] ?? null;
}
// ../packages/core/src/capture-script.ts
var CAPTURE_SH = String.raw`
set -euo pipefail
PROJ="$(cd "$1" && pwd)"
OUT="$2"
if [ $# -ge 3 ]; then SESSION="$3"; else SESSION=""; fi
mkdir -p "$OUT/sessions" "$OUT/meta"

EXCL="$OUT/meta/excludes.txt"
printenv STEPAWAY_EXCLUDES > "$EXCL" 2>/dev/null || : > "$EXCL"

# prefix-match a repo-relative path against the exclude list (bash 3.2 safe)
excluded() {
  while IFS= read -r pre; do
    [ -n "$pre" ] || continue
    case "$1" in
      "$pre"*) return 0 ;;
    esac
  done < "$EXCL"
  return 1
}

cd "$PROJ"
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)
HEAD=$(git rev-parse HEAD 2>/dev/null || echo none)
printf '%s\n' "$PROJ"   > "$OUT/meta/project-path"
printf '%s\n' "$BRANCH" > "$OUT/meta/branch"
printf '%s\n' "$HEAD"   > "$OUT/meta/head"
(claude --version 2>/dev/null || echo unknown) | head -1 > "$OUT/meta/claude-version"

# 1. all branches + tags
git bundle create "$OUT/repo.bundle" --all >/dev/null 2>&1

# 2. dirty + untracked (gitignored excluded); record deletions separately
git ls-files -mo --exclude-standard > "$OUT/dirty-files.txt.all"
git ls-files -d > "$OUT/deleted-files.txt" || true
# a modified-then-deleted file shows up in -m too; tar would abort on it
: > "$OUT/dirty-files.txt"
while IFS= read -r f; do
  [ -n "$f" ] || continue
  [ -e "$f" ] || continue
  if excluded "$f"; then continue; fi
  printf '%s\n' "$f" >> "$OUT/dirty-files.txt"
done < "$OUT/dirty-files.txt.all"
rm -f "$OUT/dirty-files.txt.all"
if [ -s "$OUT/dirty-files.txt" ]; then
  tar czf "$OUT/dirty.tar.gz" -T "$OUT/dirty-files.txt"
else
  tar czf "$OUT/dirty.tar.gz" --files-from /dev/null
fi
# three largest dirty files, for the consent screen (name + bytes)
if [ -s "$OUT/dirty-files.txt" ]; then
  while IFS= read -r f; do
    [ -f "$f" ] || continue
    sz=$(wc -c < "$f" 2>/dev/null | tr -d ' ')
    [ -n "$sz" ] || sz=0
    printf '%s\t%s\n' "$sz" "$f"
  done < "$OUT/dirty-files.txt" | sort -rn | head -3 > "$OUT/meta/largest-dirty.txt" || true
else
  : > "$OUT/meta/largest-dirty.txt"
fi

# 3. Claude Code session transcript for this cwd — exactly one.
#    Slug = absolute path with '/' and '.' replaced by '-'. Some CLI versions
#    slug slightly differently, so prefer an existing directory if one matches.
SLUG=""
for cand in \
  "$(printf '%s' "$PROJ" | sed 's|[/.]|-|g')" \
  "$(printf '%s' "$PROJ" | sed 's|/|-|g')" \
  "$(printf '%s' "$PROJ" | sed 's|[^a-zA-Z0-9]|-|g')"; do
  if [ -d "$HOME/.claude/projects/$cand" ]; then SLUG="$cand"; break; fi
done
[ -n "$SLUG" ] || SLUG="$(printf '%s' "$PROJ" | sed 's|[/.]|-|g')"
printf '%s\n' "$SLUG" > "$OUT/meta/slug"
SESS_DIR="$HOME/.claude/projects/$SLUG"
if [ -d "$SESS_DIR" ]; then
  if [ -n "$SESSION" ] && [ -f "$SESS_DIR/$SESSION.jsonl" ]; then
    cp "$SESS_DIR/$SESSION.jsonl" "$OUT/sessions/"
  else
    NEWEST=$(ls -t "$SESS_DIR"/*.jsonl 2>/dev/null | head -1 || true)
    if [ -n "$NEWEST" ] && [ -f "$NEWEST" ]; then cp "$NEWEST" "$OUT/sessions/"; fi
  fi
fi

# 4. project config
if [ -e .claude ] || [ -e CLAUDE.md ]; then
  tar czf "$OUT/project-config.tar.gz" \
    --exclude '.claude/worktrees' \
    $([ -e .claude ] && echo .claude) $([ -e CLAUDE.md ] && echo CLAUDE.md) 2>/dev/null || true
fi

# 5. required env var NAMES, derived declaratively — never values, never the shell env.
COMPOSE_FILE="$(printenv STEPAWAY_COMPOSE_FILE 2>/dev/null || true)"
if [ -z "$COMPOSE_FILE" ] || [ ! -f "$COMPOSE_FILE" ]; then
  COMPOSE_FILE=""
  for f in compose.yaml compose.yml docker-compose.yml docker-compose.yaml; do
    [ -f "$f" ] && COMPOSE_FILE="$f" && break
  done
fi
printf '%s\n' "$COMPOSE_FILE" > "$OUT/meta/compose-file"

: > "$OUT/meta/required-vars.raw"
: > "$OUT/meta/declared-env-files.raw"

# names from compose interpolation (dollar-brace VAR references)
if [ -n "$COMPOSE_FILE" ] && command -v docker >/dev/null 2>&1; then
  docker compose -f "$COMPOSE_FILE" config --variables 2>/dev/null \
    | awk 'NR>1{print $1}' >> "$OUT/meta/required-vars.raw" || true
fi

# fallback: literal dollar-brace references in the compose file
if [ -n "$COMPOSE_FILE" ]; then
  grep -oE '\$\{[A-Za-z_][A-Za-z0-9_]*' "$COMPOSE_FILE" 2>/dev/null \
    | sed 's/^\${//' >> "$OUT/meta/required-vars.raw" || true
fi

# names from env_file: entries (docker compose config --variables omits these)
if [ -n "$COMPOSE_FILE" ]; then
  awk '
      /^[[:space:]]*env_file:/ {
        line=$0
        sub(/^[^:]*:/,"",line)
        gsub(/[][]/,"",line); gsub(/,/," ",line)
        gsub(/"/,"",line); gsub(/'"'"'/,"",line)
        if (line ~ /[^[:space:]]/) { print line; next }
        inlist=1; next
      }
      inlist && /^[[:space:]]*-[[:space:]]*/ {
        line=$0
        sub(/^[[:space:]]*-[[:space:]]*/,"",line)
        gsub(/"/,"",line); gsub(/'"'"'/,"",line)
        print line; next
      }
      { inlist=0 }
    ' "$COMPOSE_FILE" | tr -s ' \t' '\n' | sed '/^$/d' > "$OUT/meta/env-files.raw" || true
  while IFS= read -r ef; do
    [ -n "$ef" ] && [ -f "$ef" ] || continue
    printf '%s\n' "$ef" >> "$OUT/meta/declared-env-files.raw"
    sed 's/#.*//' "$ef" | grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' \
      | sed 's/=.*//; s/^[[:space:]]*//; s/[[:space:]]*$//; s/^export[[:space:]]*//' \
      >> "$OUT/meta/required-vars.raw" || true
  done < "$OUT/meta/env-files.raw"
  rm -f "$OUT/meta/env-files.raw"
fi

# names declared in .env.example (a declaration, not a captured value)
if [ -f .env.example ]; then
  sed 's/#.*//' .env.example | grep -E '^[[:space:]]*[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=' \
    | sed 's/=.*//; s/^[[:space:]]*//; s/[[:space:]]*$//; s/^export[[:space:]]*//' \
    >> "$OUT/meta/required-vars.raw" || true
fi

sort -u "$OUT/meta/required-vars.raw" | sed '/^$/d' > "$OUT/meta/required-vars.txt"
rm -f "$OUT/meta/required-vars.raw"

# 6. gitignored env files: candidates for the value carry (names only here).
{ git ls-files -o -i --exclude-standard \
  | grep -E '(^|/)(\.env(\..*)?$|[^/]*\.env)$' || true; } >> "$OUT/meta/declared-env-files.raw"

# compose says "./apps/web/.env", git ls-files says "apps/web/.env": same file.
# Normalise before sort -u or the picker shows (and carries) it twice.
: > "$OUT/meta/declared-env-files.txt"
sed -e 's|^\./||' -e 's|//*|/|g' "$OUT/meta/declared-env-files.raw" \
  | sort -u | sed '/^$/d' | while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    *.env.example|.env.example) continue ;;
  esac
  if excluded "$f"; then continue; fi
  printf '%s\n' "$f" >> "$OUT/meta/declared-env-files.txt"
done
rm -f "$OUT/meta/declared-env-files.raw"

git ls-files -o -i --exclude-standard | wc -l | tr -d ' ' > "$OUT/meta/ignored-count"

echo "captured -> $OUT"
`;
// ../packages/core/src/restore-script.ts
var RESTORE_SH = String.raw`
set -euo pipefail
IN="$(cd "$1" && pwd)"
PROJ="$2"
BRANCH="$3"
SLUG="$4"

# 1. repo
mkdir -p "$PROJ"
cd "$PROJ"
if [ ! -e .git ]; then
  git clone -q "$IN/repo.bundle" .
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -qb "$BRANCH"
else
  git fetch -q "$IN/repo.bundle" "$BRANCH"
  git checkout -q "$BRANCH" 2>/dev/null || git checkout -qb "$BRANCH"
  git reset -q --hard FETCH_HEAD
fi

# 2. dirty + untracked overlay; apply deletions
tar xzf "$IN/dirty.tar.gz" -C "$PROJ"
if [ -f "$IN/deleted-files.txt" ]; then
  while IFS= read -r f; do [ -n "$f" ] && rm -f "$PROJ/$f"; done < "$IN/deleted-files.txt"
fi

# 3. project config
[ -f "$IN/project-config.tar.gz" ] && tar xzf "$IN/project-config.tar.gz" -C "$PROJ" || true

# 4. session transcripts under the slug of the RESTORED path
mkdir -p "$HOME/.claude/projects/$SLUG"
cp "$IN/sessions/"*.jsonl "$HOME/.claude/projects/$SLUG/" 2>/dev/null || true

echo "restored -> $PROJ"
`;
var RESTORE_RUNNER_SH = String.raw`
set -euo pipefail
IN="$(cd "$1" && pwd)"
GITDIR="$2"
WT="$3"
BRANCH="$4"
SLUG="$5"

# kubectl cp preserves the laptop's uid; the runner is a single-user disposable
# pod, so ownership checks only get in the way.
git config --global --add safe.directory '*'

mkdir -p "$(dirname "$GITDIR")" "$WT"

# 1. git dir on the PVC
FRESH=0
if [ ! -d "$GITDIR" ]; then
  git clone -q --bare "$IN/repo.bundle" "$GITDIR"
  FRESH=1
fi
git --git-dir="$GITDIR" config core.bare false
git --git-dir="$GITDIR" config core.worktree "$WT"
git --git-dir="$GITDIR" config core.logallrefupdates true

# 2. working tree on the emptyDir, pointing at the PVC git dir via a .git FILE
printf 'gitdir: %s\n' "$GITDIR" > "$WT/.git"
if [ "$FRESH" = "0" ]; then
  # a second push onto the same session: fetch to FETCH_HEAD, then hard-reset
  # (fetching straight into a checked-out branch is refused by git)
  git --git-dir="$GITDIR" --work-tree="$WT" fetch -q "$IN/repo.bundle" "$BRANCH"
fi
git --git-dir="$GITDIR" --work-tree="$WT" checkout -f "$BRANCH" 2>/dev/null \
  || git --git-dir="$GITDIR" --work-tree="$WT" checkout -f -b "$BRANCH"
if [ "$FRESH" = "0" ]; then
  git --git-dir="$GITDIR" --work-tree="$WT" reset -q --hard FETCH_HEAD
fi

# 3. dirty + untracked overlay; apply deletions
tar xzf "$IN/dirty.tar.gz" -C "$WT"
if [ -f "$IN/deleted-files.txt" ]; then
  while IFS= read -r f; do [ -n "$f" ] && rm -f "$WT/$f"; done < "$IN/deleted-files.txt"
fi

# 4. project config
[ -f "$IN/project-config.tar.gz" ] && tar xzf "$IN/project-config.tar.gz" -C "$WT" || true

# 5. carried env files, mode 600
if [ -d "$IN/envfiles" ]; then
  (cd "$IN/envfiles" && tar cf - .) | (cd "$WT" && tar xf -)
  (cd "$IN/envfiles" && find . -type f -print) | while IFS= read -r f; do
    rel=$(printf '%s' "$f" | sed 's|^\./||')
    chmod 600 "$WT/$rel" 2>/dev/null || true
  done
fi

# 6. session transcript under the slug of the RESTORED path
mkdir -p "$HOME/.claude/projects/$SLUG"
mkdir -p /work/.stepaway 2>/dev/null || true
cp "$IN/sessions/"*.jsonl "$HOME/.claude/projects/$SLUG/" 2>/dev/null || true

# 7. sanity: the split layout must look like an ordinary repo from the tree
cd "$WT"
git status --porcelain >/dev/null

echo "restored -> $WT (git dir $GITDIR)"
`;
// ../packages/core/src/session.ts
function slugFor(projectPath) {
  return projectPath.replace(/[/.]/g, "-");
}
function slugCandidates(projectPath) {
  return [
    projectPath.replace(/[/.]/g, "-"),
    projectPath.replace(/\//g, "-"),
    projectPath.replace(/[^a-zA-Z0-9]/g, "-")
  ];
}
function selectSessionFrom(entries, want) {
  if (want)
    return entries.some((e) => e.id === want) ? want : null;
  let best = null;
  let bestT = -1;
  for (const e of entries) {
    if (e.mtimeMs > bestT) {
      bestT = e.mtimeMs;
      best = e.id;
    }
  }
  return best;
}
var PHANTOM_TEXTS = new Set(["Continue from where you left off.", "No response requested."]);
function messageText(obj) {
  const content = obj?.message?.content ?? obj?.content;
  if (typeof content === "string")
    return content.trim();
  if (Array.isArray(content)) {
    const texts = content.filter((c3) => c3 && (c3.type === "text" || typeof c3.text === "string")).map((c3) => String(c3.text ?? ""));
    if (texts.length === content.length && texts.length > 0)
      return texts.join("").trim();
  }
  return null;
}
function rewriteTranscript(content, srcPath, dstPath) {
  let text2 = content;
  if (srcPath !== dstPath) {
    text2 = text2.split(JSON.stringify(srcPath).slice(1, -1)).join(JSON.stringify(dstPath).slice(1, -1));
    text2 = text2.split(srcPath).join(dstPath);
  }
  const lines = text2.split(`
`);
  if (lines.length > 0 && lines[lines.length - 1] === "")
    lines.pop();
  let trimmed = 0;
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (!last.trim()) {
      lines.pop();
      continue;
    }
    let obj;
    try {
      obj = JSON.parse(last);
    } catch {
      break;
    }
    const t2 = messageText(obj);
    if (t2 !== null && PHANTOM_TEXTS.has(t2)) {
      lines.pop();
      trimmed++;
      continue;
    }
    break;
  }
  return { text: lines.length ? lines.join(`
`) + `
` : "", trimmed };
}
// ../packages/core/src/env.ts
import * as path2 from "node:path";
var ASSIGN_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;
function normalizeEnvPath(root, p2) {
  const raw = String(p2 ?? "").trim();
  if (!raw)
    return null;
  const rel = path2.relative(root, path2.resolve(root, raw));
  if (!rel || rel === ".." || rel.startsWith(`..${path2.sep}`) || path2.isAbsolute(rel))
    return null;
  return rel.split(path2.sep).join("/");
}
function normalizeEnvPaths(root, list) {
  const out = [];
  for (const p2 of list ?? []) {
    const n2 = normalizeEnvPath(root, p2);
    if (n2 && !out.includes(n2))
      out.push(n2);
  }
  return out;
}
function normalizeEnvConfig(root, cfg) {
  if (!cfg)
    return null;
  return { ...cfg, carryFiles: normalizeEnvPaths(root, cfg.carryFiles) };
}
function parseVarNames(content) {
  const names = [];
  for (const raw of content.split(`
`)) {
    if (/^\s*#/.test(raw))
      continue;
    const m3 = ASSIGN_RE.exec(raw);
    if (m3 && !names.includes(m3[1]))
      names.push(m3[1]);
  }
  return names;
}
function filterEnvFile(content, excludeVars, overrideVars, opts = {}) {
  const drop = new Set(excludeVars);
  const over = new Map(Object.entries(overrideVars));
  const kept = [];
  const dropped = [];
  const seenOverride = new Set;
  const out = [];
  const lines = content.split(`
`);
  const trailingNL = lines.length > 0 && lines[lines.length - 1] === "";
  if (trailingNL)
    lines.pop();
  for (const line of lines) {
    const m3 = /^\s*#/.test(line) ? null : ASSIGN_RE.exec(line);
    if (!m3) {
      out.push(line);
      continue;
    }
    const name = m3[1];
    if (drop.has(name)) {
      dropped.push(name);
      continue;
    }
    if (over.has(name)) {
      out.push(`${name}=${over.get(name)}`);
      seenOverride.add(name);
      if (!kept.includes(name))
        kept.push(name);
      continue;
    }
    out.push(line);
    if (!kept.includes(name))
      kept.push(name);
  }
  if (opts.appendMissing) {
    for (const [k, v] of over) {
      if (seenOverride.has(k) || drop.has(k))
        continue;
      out.push(`${k}=${v}`);
      if (!kept.includes(k))
        kept.push(k);
    }
  }
  return { text: out.length ? out.join(`
`) + `
` : "", kept, dropped };
}
function unsatisfiedVars(required, satisfied, runnerEnv) {
  return required.filter((v) => !satisfied.has(v) && !runnerEnv.has(v));
}
// ../packages/core/src/docker-script.ts
var DOCKER_RESTORE_SH = String.raw`
set -uo pipefail
IN="$1"
WT="$2"
COMPOSE="$3"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker: not installed on the runner; skipping services"
  exit 0
fi
if ! docker info >/dev/null 2>&1; then
  echo "docker: daemon not reachable on the runner; skipping services"
  exit 0
fi

if [ -d "$IN/volumes" ]; then
  for tarball in "$IN"/volumes/*.tar.gz; do
    [ -f "$tarball" ] || continue
    vol=$(basename "$tarball" .tar.gz)
    docker volume create "$vol" >/dev/null 2>&1 || true
    if docker run --rm -i -v "$vol":/v alpine tar xzf - -C /v < "$tarball"; then
      echo "restored volume $vol"
    else
      echo "WARN: could not restore volume $vol"
    fi
  done
fi

if [ -n "$COMPOSE" ] && [ -f "$WT/$COMPOSE" ]; then
  cd "$WT"
  docker compose -f "$COMPOSE" pull  || echo "WARN: docker compose pull failed"
  if docker compose -f "$COMPOSE" up -d; then
    echo "services up"
  else
    echo "WARN: docker compose up -d failed; the agent can retry"
  fi
fi
`;
// ../packages/core/src/run.ts
var DEFAULT_INSTRUCTION = "You were handed off mid-task to a runner. Review the last few turns and the working tree, then continue the task in progress.";
var DEFAULT_REMOTE_BASE = "/work";
function stepawayDir(remoteBase = DEFAULT_REMOTE_BASE) {
  const base = (remoteBase || DEFAULT_REMOTE_BASE).replace(/\/+$/, "") || "";
  return `${base}/.stepaway`;
}
function runLogPath(remoteBase = DEFAULT_REMOTE_BASE) {
  return `${stepawayDir(remoteBase)}/run.log`;
}
function exitMarkerPath(remoteBase = DEFAULT_REMOTE_BASE) {
  return `${stepawayDir(remoteBase)}/exit-code`;
}
var RUN_LOG = runLogPath();
var EXIT_MARKER = exitMarkerPath();
// ../packages/core/src/transcript.ts
function contentBlocks(obj) {
  const c3 = obj?.message?.content ?? obj?.content;
  if (Array.isArray(c3))
    return c3;
  if (typeof c3 === "string")
    return [{ type: "text", text: c3 }];
  return [];
}
var NOISE = /^no response requested\.?$/i;
var SUMMARY_FIELDS = [
  "command",
  "file_path",
  "path",
  "pattern",
  "url",
  "query",
  "prompt",
  "description",
  "notebook_path",
  "subagent_type"
];
var SUMMARY_MAX = 60;
function toolSummary(input) {
  if (!input || typeof input !== "object")
    return "";
  for (const f2 of SUMMARY_FIELDS) {
    const v = input[f2];
    if (typeof v === "string" && v.trim())
      return clip(v, SUMMARY_MAX);
    if (typeof v === "number")
      return String(v);
  }
  for (const v of Object.values(input)) {
    if (typeof v === "string" && v.trim() && v.length <= 120)
      return clip(v, SUMMARY_MAX);
  }
  return "";
}
function clip(s, n2) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= n2 ? one : one.slice(0, n2 - 1) + "…";
}
function renderLine(line) {
  const s = line.trim();
  if (!s)
    return [];
  let obj;
  try {
    obj = JSON.parse(s);
  } catch {
    return [];
  }
  const ts = typeof obj?.timestamp === "string" ? obj.timestamp : undefined;
  if (obj?.type === "assistant") {
    const out = [];
    for (const b2 of contentBlocks(obj)) {
      if (b2?.type === "text" && typeof b2.text === "string" && b2.text.trim()) {
        const text2 = b2.text.trim();
        if (NOISE.test(text2))
          continue;
        out.push({ kind: "assistant-text", level: "info", text: text2, timestamp: ts });
      } else if (b2?.type === "tool_use") {
        const tool = String(b2.name ?? "tool");
        const summary = toolSummary(b2.input);
        out.push({
          kind: "tool-use",
          level: "detail",
          text: summary ? `${tool}  ${summary}` : tool,
          tool,
          summary,
          timestamp: ts
        });
      }
    }
    return out;
  }
  if (obj?.type === "result") {
    const sub = typeof obj.subtype === "string" ? obj.subtype : "done";
    if (obj.is_error)
      return [{ kind: "error", level: "error", text: `run ended: ${sub}`, timestamp: ts }];
    return [{ kind: "result", level: "info", text: `run ended: ${sub}`, timestamp: ts }];
  }
  return [];
}
// ../packages/core/src/api.ts
var API_PREFIX = "/v1";
var ROUTES = {
  sessions: `${API_PREFIX}/sessions`,
  session: (id) => `${API_PREFIX}/sessions/${id}`,
  capture: (id) => `${API_PREFIX}/sessions/${id}/capture`,
  run: (id) => `${API_PREFIX}/sessions/${id}/run`,
  transcript: (id) => `${API_PREFIX}/sessions/${id}/transcript`,
  archive: (id) => `${API_PREFIX}/sessions/${id}/archive`,
  envNames: (id) => `${API_PREFIX}/sessions/${id}/env-names`,
  claudeToken: `${API_PREFIX}/claude-token`,
  diagnostics: `${API_PREFIX}/diagnostics`,
  healthz: `${API_PREFIX}/healthz`,
  version: `${API_PREFIX}/version`
};
// src/config.ts
import * as fs3 from "node:fs";
import * as path4 from "node:path";

// src/client.ts
import * as fs from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// src/version.ts
var VERSION = "0.3.1";

// src/client.ts
class ApiError extends Error {
  status;
  detail;
  url;
  constructor(message, status, detail, url) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.url = url;
    this.name = "ApiError";
  }
}
async function toApiError(res, url) {
  let error = `HTTP ${res.status} ${res.statusText || ""}`.trim();
  let detail;
  const body = await res.text().catch(() => "");
  if (body) {
    try {
      const j = JSON.parse(body);
      if (j && typeof j === "object") {
        if (typeof j.error === "string")
          error = j.error;
        if (typeof j.detail === "string")
          detail = j.detail;
      } else
        detail = body.slice(0, 400);
    } catch {
      detail = body.trim().split(`
`).slice(0, 3).join(`
`).slice(0, 400);
    }
  }
  if (res.status === 401 || res.status === 403) {
    detail = (detail ? detail + " — " : "") + "check the bearer token: stepaway auth --server-token <token>";
  }
  return new ApiError(error, res.status, detail, url);
}
function versionSkew(cli, server) {
  const part = (v) => v.split("-")[0].split(".").map((n2) => Number(n2) || 0);
  const [cMaj = 0, cMin = 0] = part(cli);
  const [sMaj = 0, sMin = 0] = part(server);
  if (cMaj !== sMaj) {
    return {
      ok: false,
      fatal: true,
      server,
      message: `incompatible versions: CLI ${cli}, backend ${server}. ` + `Upgrade the one that is behind (npm i -g https://stepaway.dev/stepaway.tgz, or helm upgrade).`
    };
  }
  if (cMin !== sMin) {
    return {
      ok: true,
      fatal: false,
      server,
      message: `version skew: CLI ${cli}, backend ${server} — same major, some features may differ.`
    };
  }
  return { ok: true, fatal: false, server, message: null };
}

class Client {
  server;
  token;
  constructor(o2) {
    this.server = o2.server.replace(/\/+$/, "");
    this.token = o2.token;
  }
  url(route) {
    return `${this.server}${route}`;
  }
  headers(extra = {}) {
    return { Authorization: `Bearer ${this.token}`, ...extra };
  }
  async fetch(route, init = {}) {
    let url = this.url(route);
    if (init.query) {
      const q = new URLSearchParams(init.query).toString();
      if (q)
        url += `?${q}`;
    }
    let res;
    try {
      res = await fetch(url, { ...init, headers: this.headers(init.headers) });
    } catch (e) {
      const cause = e?.cause?.code ?? e.message;
      throw new ApiError(`cannot reach ${this.server}`, 0, String(cause), url);
    }
    if (!res.ok)
      throw await toApiError(res, url);
    return res;
  }
  async json(route, init = {}) {
    const res = await this.fetch(route, init);
    const text2 = await res.text();
    if (!text2.trim())
      return;
    try {
      return JSON.parse(text2);
    } catch {
      throw new ApiError(`backend returned non-JSON on ${route}`, res.status, text2.slice(0, 200), this.url(route));
    }
  }
  jsonBody(body) {
    return { body: JSON.stringify(body), headers: { "content-type": "application/json" } };
  }
  version() {
    return this.json(ROUTES.version);
  }
  async checkVersion() {
    const v = await this.version();
    return versionSkew(VERSION, v?.version ?? "0.0.0");
  }
  diagnostics() {
    return this.json(ROUTES.diagnostics);
  }
  async healthz() {
    try {
      await this.fetch(ROUTES.healthz);
      return true;
    } catch {
      return false;
    }
  }
  putClaudeToken(token) {
    return this.json(ROUTES.claudeToken, { method: "PUT", ...this.jsonBody({ token }) });
  }
  createSession(req) {
    return this.json(ROUTES.sessions, { method: "POST", ...this.jsonBody(req) });
  }
  async listSessions() {
    const r2 = await this.json(ROUTES.sessions);
    if (Array.isArray(r2))
      return r2;
    if (r2 && Array.isArray(r2.sessions))
      return r2.sessions;
    return [];
  }
  getSession(id) {
    return this.json(ROUTES.session(id));
  }
  async deleteSession(id) {
    await this.json(ROUTES.session(id), { method: "DELETE" });
  }
  run(id, req) {
    return this.json(ROUTES.run(id), { method: "POST", ...this.jsonBody(req) });
  }
  async envNames(id, names) {
    if (!names.length)
      return new Set;
    const r2 = await this.json(ROUTES.envNames(id), { query: { names: names.join(",") } });
    return new Set(Array.isArray(r2?.satisfied) ? r2.satisfied : []);
  }
  async waitReady(id, o2 = {}) {
    const deadline = Date.now() + (o2.timeoutMs ?? 300000);
    for (;; ) {
      const s = await this.getSession(id);
      o2.onState?.(s);
      if (s.state === "failed") {
        throw new ApiError(`session ${id} failed`, 0, s.detail ?? "no detail from the backend");
      }
      if (s.state !== "pending")
        return s;
      if (Date.now() > deadline) {
        throw new ApiError(`runner ${s.podName || id} still pending after ${Math.round((o2.timeoutMs ?? 300000) / 1000)}s`, 0, "check the backend: stepaway doctor");
      }
      await sleep(o2.intervalMs ?? 2000);
    }
  }
  async uploadCapture(id, tarPath, setup) {
    const size = fs.statSync(tarPath).size;
    const web = Readable.toWeb(fs.createReadStream(tarPath));
    const res = await this.fetch(ROUTES.capture(id), {
      method: "POST",
      query: setup ? { setup } : undefined,
      headers: { "content-type": "application/gzip", "content-length": String(size) },
      body: web,
      duplex: "half"
    });
    const text2 = await res.text();
    if (!text2.trim()) {
      throw new ApiError("backend returned an empty body from /capture", res.status, "expected a CaptureReport");
    }
    try {
      return JSON.parse(text2);
    } catch {
      throw new ApiError("backend returned non-JSON from /capture", res.status, text2.slice(0, 200));
    }
  }
  async downloadArchive(id, destPath) {
    const res = await this.fetch(ROUTES.archive(id));
    if (!res.body)
      throw new ApiError("backend sent an empty archive", res.status);
    const out = fs.createWriteStream(destPath);
    await pipeline(Readable.fromWeb(res.body), out);
    return fs.statSync(destPath).size;
  }
  async transcript(id) {
    const res = await this.fetch(ROUTES.transcript(id));
    return res.text();
  }
  async followTranscript(id, onLine, o2 = {}) {
    const res = await this.fetch(ROUTES.transcript(id), {
      query: { follow: "1" },
      headers: { accept: "text/event-stream" },
      signal: o2.signal
    });
    if (!res.body)
      return;
    const dec = new TextDecoder;
    let buf = "";
    const flushEvent = (chunk) => {
      for (const raw of chunk.split(`
`)) {
        const line = raw.replace(/\r$/, "");
        if (!line.startsWith("data:"))
          continue;
        const payload = line.slice(5).replace(/^ /, "");
        if (payload)
          onLine(payload);
      }
    };
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i2;
        while ((i2 = buf.indexOf(`

`)) !== -1) {
          flushEvent(buf.slice(0, i2));
          buf = buf.slice(i2 + 2);
        }
      }
    } catch (e) {
      if (e?.name === "AbortError")
        return;
      throw e;
    }
    if (buf.trim())
      flushEvent(buf);
  }
}
function sleep(ms) {
  return new Promise((r2) => setTimeout(r2, ms));
}

// src/clientconfig.ts
import * as fs2 from "node:fs";
import * as os from "node:os";
import * as path3 from "node:path";
function configHome(env2 = process.env, home = os.homedir()) {
  const xdg = env2.XDG_CONFIG_HOME;
  return xdg && xdg.trim() ? xdg : path3.join(home, ".config");
}
function clientConfigPath(env2 = process.env, home = os.homedir()) {
  return path3.join(configHome(env2, home), "stepaway", "config.json");
}
function readClientConfig() {
  const p2 = clientConfigPath();
  if (!fs2.existsSync(p2))
    return {};
  try {
    const o2 = JSON.parse(fs2.readFileSync(p2, "utf8"));
    if (!o2 || typeof o2 !== "object")
      return {};
    return {
      server: typeof o2.server === "string" ? o2.server : undefined,
      token: typeof o2.token === "string" ? o2.token : undefined
    };
  } catch (e) {
    throw new Error(`${p2} is not valid JSON: ${e.message}`);
  }
}
function writeClientConfig(cfg) {
  const p2 = clientConfigPath();
  fs2.mkdirSync(path3.dirname(p2), { recursive: true, mode: 448 });
  fs2.writeFileSync(p2, JSON.stringify(cfg, null, 2) + `
`, { mode: 384 });
  try {
    fs2.chmodSync(p2, 384);
  } catch {}
  return p2;
}
function normalizeServer(url) {
  const s = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//.test(s))
    throw new Error(`server must be an http(s) URL: ${url}`);
  return s;
}
function resolveClient(flags, projectServer, global = readClientConfig()) {
  let server = null;
  let serverSrc = "unset";
  if (flags.server) {
    server = String(flags.server);
    serverSrc = "--server";
  } else if (projectServer) {
    server = String(projectServer);
    serverSrc = ".stepaway.json";
  } else if (global.server) {
    server = global.server;
    serverSrc = "global config";
  }
  let token = null;
  let tokenSrc = "unset";
  if (flags["server-token"]) {
    token = String(flags["server-token"]);
    tokenSrc = "--server-token";
  } else if (global.token) {
    token = global.token;
    tokenSrc = "global config";
  }
  return {
    server: server ? normalizeServer(server) : null,
    token,
    sources: { server: serverSrc, token: tokenSrc }
  };
}
var NOT_CONFIGURED = `no backend configured — run: stepaway auth --server https://stepaway.example.com --server-token <token>
` + "(the token is printed by the Helm chart's NOTES.txt on install)";

// src/config.ts
function projectRoot(dir) {
  const abs = path4.resolve(dir);
  const r2 = run("git", ["rev-parse", "--show-toplevel"], { cwd: abs });
  if (r2.code === 0 && r2.stdout.trim())
    return r2.stdout.trim();
  return abs;
}
function configPath(root) {
  return path4.join(root, CONFIG_FILE);
}
function loadRawConfig(root) {
  const p2 = configPath(root);
  if (!fs3.existsSync(p2))
    return {};
  try {
    const o2 = JSON.parse(fs3.readFileSync(p2, "utf8"));
    return o2 && typeof o2 === "object" ? o2 : {};
  } catch (e) {
    throw new Error(`${p2} is not valid JSON: ${e.message}`);
  }
}
function loadConfig(root) {
  const raw = loadRawConfig(root);
  const cfg = { ...DEFAULT_CONFIG, server: null, ...raw };
  cfg.server = typeof raw.server === "string" && raw.server.trim() ? raw.server.trim() : null;
  if (!Array.isArray(cfg.excludeGlobs))
    cfg.excludeGlobs = [];
  if (raw.env && typeof raw.env === "object") {
    cfg.env = {
      carryFiles: Array.isArray(raw.env.carryFiles) ? raw.env.carryFiles.map(String) : [],
      excludeVars: Array.isArray(raw.env.excludeVars) ? raw.env.excludeVars.map(String) : [],
      overrideVars: raw.env.overrideVars && typeof raw.env.overrideVars === "object" ? { ...raw.env.overrideVars } : {}
    };
  } else {
    cfg.env = null;
  }
  return cfg;
}
function patchConfig(root, patch) {
  const raw = loadRawConfig(root);
  const next = { ...raw, ...patch };
  const p2 = configPath(root);
  fs3.writeFileSync(p2, JSON.stringify(next, null, 2) + `
`);
  return p2;
}
function rememberEnvChoice(root, choice) {
  const raw = loadRawConfig(root);
  const prev = raw.env && typeof raw.env === "object" ? raw.env : {};
  return patchConfig(root, { env: { ...prev, carryFiles: choice.carryFiles, excludeVars: choice.excludeVars } });
}
function resolveConfig(root, flags) {
  const cfg = loadConfig(root);
  if (flags["remote-base"])
    cfg.remotePathBase = String(flags["remote-base"]);
  if (flags.server)
    cfg.server = String(flags.server);
  return cfg;
}
function openClient(root, flags, preferServer) {
  const projectServer = preferServer ?? (root ? loadConfig(root).server : null);
  const r2 = resolveClient(flags, projectServer, readClientConfig());
  if (!r2.server || !r2.token)
    return { client: null, error: NOT_CONFIGURED };
  return { client: new Client({ server: r2.server, token: r2.token }), server: r2.server };
}
function batonPath(root) {
  return path4.join(root, ".git", "stepaway-baton.json");
}
function readBaton(root) {
  const p2 = batonPath(root);
  if (!fs3.existsSync(p2))
    return null;
  try {
    return JSON.parse(fs3.readFileSync(p2, "utf8"));
  } catch {
    return null;
  }
}
function writeBaton(root, b2) {
  fs3.mkdirSync(path4.dirname(batonPath(root)), { recursive: true });
  fs3.writeFileSync(batonPath(root), JSON.stringify(b2, null, 2) + `
`);
}
function clearBaton(root) {
  try {
    fs3.rmSync(batonPath(root));
  } catch {}
}

// src/capture.ts
import * as fs4 from "node:fs";
import * as path5 from "node:path";
function readMeta(dir, name, dflt = "") {
  try {
    return fs4.readFileSync(path5.join(dir, "meta", name), "utf8").trim();
  } catch {
    return dflt;
  }
}
function readLines(dir, rel) {
  try {
    return fs4.readFileSync(path5.join(dir, rel), "utf8").split(`
`).map((l2) => l2.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
function readCaptureFacts(captureDir) {
  const sessionsDir = path5.join(captureDir, "sessions");
  const sessionIds = fs4.existsSync(sessionsDir) ? fs4.readdirSync(sessionsDir).filter((f2) => f2.endsWith(".jsonl")).map((f2) => f2.replace(/\.jsonl$/, "")).sort() : [];
  return {
    projectPath: readMeta(captureDir, "project-path"),
    slug: readMeta(captureDir, "slug"),
    branch: readMeta(captureDir, "branch"),
    head: readMeta(captureDir, "head", "none"),
    claudeVersion: readMeta(captureDir, "claude-version", "unknown"),
    sessionIds,
    dirtyFiles: readLines(captureDir, "dirty-files.txt"),
    largestDirty: readLines(captureDir, "meta/largest-dirty.txt"),
    ignoredCount: Number(readMeta(captureDir, "ignored-count", "0")) || 0,
    requiredVars: readLines(captureDir, "meta/required-vars.txt"),
    declaredEnvFiles: readLines(captureDir, "meta/declared-env-files.txt")
  };
}
function buildManifest(captureDir, extras = {}) {
  const m3 = composeManifest(readCaptureFacts(captureDir), extras);
  fs4.writeFileSync(path5.join(captureDir, "manifest.json"), JSON.stringify(m3, null, 2) + `
`);
  return m3;
}
async function captureLocal(projectDir, outDir, opts = {}) {
  fs4.mkdirSync(outDir, { recursive: true });
  const env2 = {
    ...process.env,
    STEPAWAY_EXCLUDES: (opts.excludes ?? []).join(`
`),
    STEPAWAY_COMPOSE_FILE: opts.composeFile ?? ""
  };
  const r2 = await bashAsync(CAPTURE_SH, [projectDir, outDir, opts.sessionId ?? ""], { env: env2 });
  if (r2.code !== 0)
    throw new Error(`capture failed:
${r2.stderr.trim() || r2.stdout.trim()}`);
}
function existingSlugDir(home, projectPath) {
  for (const c3 of slugCandidates(projectPath)) {
    if (fs4.existsSync(path5.join(home, ".claude", "projects", c3)))
      return c3;
  }
  return null;
}
function selectSession(home, projectPath, want) {
  const slug = existingSlugDir(home, projectPath);
  if (!slug)
    return null;
  const dir = path5.join(home, ".claude", "projects", slug);
  let entries = [];
  try {
    entries = fs4.readdirSync(dir).filter((f2) => f2.endsWith(".jsonl"));
  } catch {
    return null;
  }
  const listed = entries.flatMap((f2) => {
    try {
      return [{ id: f2.replace(/\.jsonl$/, ""), mtimeMs: fs4.statSync(path5.join(dir, f2)).mtimeMs }];
    } catch {
      return [];
    }
  });
  return selectSessionFrom(listed, want);
}
function rewriteSessions(captureDir, srcPath, dstPath) {
  const dir = path5.join(captureDir, "sessions");
  if (!fs4.existsSync(dir))
    return { files: 0, trimmed: 0 };
  let trimmed = 0;
  let files = 0;
  for (const f2 of fs4.readdirSync(dir).filter((f3) => f3.endsWith(".jsonl"))) {
    const p2 = path5.join(dir, f2);
    const out = rewriteTranscript(fs4.readFileSync(p2, "utf8"), srcPath, dstPath);
    fs4.writeFileSync(p2, out.text);
    trimmed += out.trimmed;
    files++;
  }
  return { files, trimmed };
}

// src/envcarry.ts
import * as fs5 from "node:fs";
import * as path6 from "node:path";
function carryEnvFiles(root, captureDir, declared, plan) {
  const outBase = path6.join(captureDir, "envfiles");
  const carried = [];
  const satisfied = new Set(Object.keys(plan.overrideVars));
  const dropped = [];
  const carryList = normalizeEnvPaths(root, plan.carryFiles);
  const chosen = new Set(carryList);
  const skipped = normalizeEnvPaths(root, declared).filter((d) => !chosen.has(d));
  let first = true;
  for (const rel of carryList) {
    const src = path6.join(root, rel);
    if (!fs5.existsSync(src))
      continue;
    const filtered = filterEnvFile(fs5.readFileSync(src, "utf8"), plan.excludeVars, plan.overrideVars, {
      appendMissing: first
    });
    first = false;
    const dst = path6.join(outBase, rel);
    fs5.mkdirSync(path6.dirname(dst), { recursive: true });
    fs5.writeFileSync(dst, filtered.text, { mode: 384 });
    for (const k of filtered.kept)
      satisfied.add(k);
    for (const d of filtered.dropped)
      if (!dropped.includes(d))
        dropped.push(d);
    carried.push({ path: rel, vars: filtered.kept.length });
  }
  const leftover = Object.entries(plan.overrideVars).filter(([k]) => !plan.excludeVars.includes(k));
  if (first && leftover.length) {
    const dst = path6.join(outBase, ".env");
    fs5.mkdirSync(outBase, { recursive: true });
    fs5.writeFileSync(dst, leftover.map(([k, v]) => `${k}=${v}`).join(`
`) + `
`, { mode: 384 });
    carried.push({ path: ".env", vars: leftover.length });
  }
  if (carried.length) {
    fs5.mkdirSync(path6.join(captureDir, "meta"), { recursive: true });
    fs5.writeFileSync(path6.join(captureDir, "meta", "env-carried.txt"), carried.map((c3) => `${c3.path}	${c3.vars}`).join(`
`) + `
`);
  }
  return { carried, satisfied, dropped, skipped };
}
function varCount(root, rel) {
  try {
    return parseVarNames(fs5.readFileSync(path6.join(root, rel), "utf8")).length;
  } catch {
    return 0;
  }
}
async function pickEnvFiles(ui, root, declared) {
  if (!declared.length)
    return { carryFiles: [], excludeVars: [] };
  const options = declared.map((f2) => {
    const n2 = varCount(root, f2);
    return { value: f2, label: f2, hint: `${n2} var${n2 === 1 ? "" : "s"}` };
  });
  const carryFiles = await ui.multiselect("env files to carry (values travel encrypted in the capture, never printed)", options, declared);
  let excludeVars = [];
  if (carryFiles.length) {
    const v = await ui.text("variable names to leave behind (comma-separated, Enter for none)", "none");
    excludeVars = v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return { carryFiles, excludeVars };
}
async function resolveEnvPlan(declared, remembered, opts) {
  const root = opts.root;
  const list = normalizeEnvPaths(root, declared);
  const mem = normalizeEnvConfig(root, remembered);
  if (mem) {
    return {
      plan: {
        carryFiles: mem.carryFiles.filter((f2) => list.includes(f2)),
        excludeVars: mem.excludeVars,
        overrideVars: mem.overrideVars
      },
      asked: false,
      declared: list
    };
  }
  const ui = opts.ui;
  if (opts.interactive && ui?.fancy && ui.interactive && list.length) {
    const picked = await pickEnvFiles(ui, root, list);
    return { plan: { ...picked, overrideVars: {} }, asked: true, declared: list };
  }
  return { plan: { carryFiles: [...list], excludeVars: [], overrideVars: {} }, asked: false, declared: list };
}

// src/docker.ts
import * as fs6 from "node:fs";
import * as path7 from "node:path";
var HELPER_IMAGE = "alpine";
var COMPOSE_CANDIDATES = ["compose.yaml", "compose.yml", "docker-compose.yml", "docker-compose.yaml"];
function findComposeFile(root, configured) {
  if (configured)
    return fs6.existsSync(path7.join(root, configured)) ? configured : null;
  for (const c3 of COMPOSE_CANDIDATES)
    if (fs6.existsSync(path7.join(root, c3)))
      return c3;
  return null;
}
function dockerAvailable() {
  return which("docker") && run("docker", ["info", "--format", "{{.ServerVersion}}"]).code === 0;
}
function inspectContainers(root, ids) {
  if (!ids.length)
    return [];
  const fmt = "{{.Id}}\t{{.Name}}\t{{.Config.Image}}\t{{.Image}}\t" + '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}},{{end}}{{end}}';
  const r2 = run("docker", ["inspect", "-f", fmt, ...ids], { cwd: root });
  if (r2.code !== 0)
    return [];
  return r2.stdout.split(`
`).map((l2) => l2.trim()).filter(Boolean).map((l2) => {
    const [id = "", name = "", image = "", digest = "", vols = ""] = l2.split("\t");
    return {
      id,
      name: name.replace(/^\//, ""),
      image,
      digest,
      volumes: vols.split(",").map((v) => v.trim()).filter(Boolean)
    };
  });
}
function composeProjectName(root, ids) {
  if (ids.length) {
    const r2 = run("docker", ["inspect", "-f", '{{index .Config.Labels "com.docker.compose.project"}}', ids[0]], {
      cwd: root
    });
    const n2 = r2.stdout.trim();
    if (r2.code === 0 && n2 && n2 !== "<no value>")
      return n2;
  }
  return path7.basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, "");
}
function planDocker(root, configuredCompose) {
  const composeFile = findComposeFile(root, configuredCompose);
  if (!composeFile)
    return null;
  if (!dockerAvailable())
    return null;
  const ps = run("docker", ["compose", "-f", composeFile, "ps", "-q"], { cwd: root });
  const ids = ps.code === 0 ? ps.stdout.split(`
`).map((s) => s.trim()).filter(Boolean) : [];
  const containers = inspectContainers(root, ids);
  const project = composeProjectName(root, ids);
  const all = run("docker", ["ps", "-q"], { cwd: root });
  const allIds = all.code === 0 ? all.stdout.split(`
`).map((s) => s.trim()).filter(Boolean) : [];
  const mine = new Set(containers.map((c3) => c3.id));
  const orphans = inspectContainers(root, allIds.filter((id) => ![...mine].some((m3) => m3.startsWith(id) || id.startsWith(m3)))).filter((c3) => !c3.name.startsWith(`${project}-`)).map((c3) => c3.name);
  const vl = run("docker", ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`], {
    cwd: root
  });
  const volumes = vl.code === 0 ? vl.stdout.split(`
`).map((s) => s.trim()).filter(Boolean) : [];
  return { composeFile, project, containers, orphans, volumes };
}
async function captureDocker(root, captureDir, plan, log2) {
  const warnings = [];
  const refused = [];
  const stopped = [];
  for (const c3 of plan.containers) {
    log2(`stopping ${c3.name} (30s grace)
`);
    await runAsync("docker", ["stop", "-t", "30", c3.id], { cwd: root });
    const st = await runAsync("docker", ["inspect", "-f", "{{.State.Running}}", c3.id], { cwd: root });
    if (st.stdout.trim() === "true") {
      refused.push(c3.name);
      warnings.push(`${c3.name} did not stop within 30s — its volumes are NOT carried (never torn).`);
    } else {
      stopped.push(c3);
    }
  }
  const refusedVolumes = new Set(plan.containers.filter((c3) => refused.includes(c3.name)).flatMap((c3) => c3.volumes));
  const outDir = path7.join(captureDir, "volumes");
  const carried = [];
  if (plan.volumes.length)
    fs6.mkdirSync(outDir, { recursive: true });
  for (const v of plan.volumes) {
    if (refusedVolumes.has(v))
      continue;
    const dest = path7.join(outDir, `${v}.tar.gz`);
    const r2 = await runAsync("bash", [
      "-c",
      `set -o pipefail; docker run --rm -v ${shq(v)}:/v:ro ${HELPER_IMAGE} tar czf - -C /v . > ${shq(dest)}`
    ]);
    if (r2.code !== 0) {
      warnings.push(`could not archive volume ${v}: ${lastLine(r2.stderr || r2.stdout)}`);
      fs6.rmSync(dest, { force: true });
      continue;
    }
    let bytes = 0;
    try {
      bytes = fs6.statSync(dest).size;
    } catch {}
    carried.push({ name: v, bytes });
    log2(`archived volume ${v} (${human(bytes)})
`);
  }
  for (const c3 of stopped) {
    const r2 = await runAsync("docker", ["start", c3.id], { cwd: root });
    if (r2.code !== 0)
      warnings.push(`could not restart ${c3.name} locally: ${(r2.stderr || r2.stdout).trim()}`);
  }
  if (stopped.length)
    log2(`restarted ${stopped.length} local container(s)
`);
  const manifest2 = {
    compose_file: plan.composeFile,
    project: plan.project,
    containers: plan.containers.map((c3) => ({ name: c3.name, image: c3.image, digest: c3.digest })),
    volumes: carried,
    refused,
    orphans: plan.orphans
  };
  fs6.writeFileSync(path7.join(captureDir, "meta", "docker.json"), JSON.stringify(manifest2, null, 2) + `
`);
  return { manifest: manifest2, warnings };
}
function human(bytes) {
  if (bytes < 1024)
    return `${bytes} B`;
  const u4 = ["KB", "MB", "GB", "TB"];
  let b2 = bytes / 1024;
  let i2 = 0;
  while (b2 >= 1024 && i2 < u4.length - 1) {
    b2 /= 1024;
    i2++;
  }
  return `${b2.toFixed(b2 < 10 ? 1 : 0)} ${u4[i2]}`;
}

// src/setup.ts
import * as fs7 from "node:fs";
import * as path8 from "node:path";
var SETUP_TABLE = [
  { marker: "bun.lock", command: "bun install" },
  { marker: "bun.lockb", command: "bun install" },
  { marker: "pnpm-lock.yaml", command: "pnpm i" },
  { marker: "yarn.lock", command: "yarn" },
  { marker: "package-lock.json", command: "npm ci" }
];
function detectSetup(dir) {
  for (const r2 of SETUP_TABLE) {
    if (fs7.existsSync(path8.join(dir, r2.marker)))
      return r2.command;
  }
  return null;
}
function resolveSetup(dir, configured) {
  if (typeof configured === "string")
    return configured.trim() || null;
  return detectSetup(dir);
}

// src/commands/push.ts
var BIG_FILE_BYTES = 50 * 1024 * 1024;
var LABEL_W = 18;
function consentSummary(m3, opts) {
  const k = colorize(opts.color !== false);
  const c3 = m3.captured;
  const n2 = m3.not_captured;
  const L = [];
  const row = (label, value, tint = (s) => s) => L.push(`  ${k.dim(pad(label, LABEL_W))}${tint(value)}`);
  const cont = (value, tint = (s) => s) => L.push(`  ${" ".repeat(LABEL_W)}${tint(value)}`);
  L.push(`${k.bold(c3.project_path)}  ${k.dim("→")}  ${k.bold(`${opts.target}:${opts.remote}`)}`);
  L.push("");
  L.push(k.ok(k.bold("moves")));
  row("branch", `${c3.branch} @ ${c3.head.slice(0, 12)}`, k.ok);
  row("dirty/untracked", `${c3.dirty_file_count} file(s)`, k.ok);
  const big = c3.largest_dirty_files.filter((f2) => f2.bytes > BIG_FILE_BYTES);
  if (big.length && !opts.verbose) {
    cont(`${big[0].path} (${human(big[0].bytes)})`, k.warn);
    if (big.length > 1)
      cont(`+${big.length - 1} more over 50 MB — see --verbose`, k.dim);
  } else if (opts.verbose) {
    for (const f2 of c3.largest_dirty_files)
      cont(`${f2.path} (${human(f2.bytes)})`, k.dim);
  }
  row("session", c3.session_ids.length ? c3.session_ids.join(", ") : "(none — code only)", k.ok);
  row("project config", ".claude/, CLAUDE.md (if present)", k.ok);
  row("env files", c3.env_files.length ? c3.env_files.map((e) => `${e.path} (${e.vars} var${e.vars === 1 ? "" : "s"})`).join(", ") : "(none)", k.ok);
  if (opts.docker) {
    const d = opts.docker;
    row("services", `stops ${d.containers.length} container(s): ` + (d.containers.length ? d.containers.map((x) => x.name).join(", ") : "(none running)"), k.ok);
    cont(`carries volume(s): ` + (d.volumes.length ? d.volumes.join(", ") : "(none)"), k.ok);
    cont(`laptop containers are restarted right after capture`, k.dim);
  }
  row("setup", opts.setup ?? "(none detected)", k.ok);
  row("agent", `runs autonomously on the runner: ${clip(opts.instruction, 80)}`, k.ok);
  L.push("");
  L.push(k.warn(k.bold("does NOT move")));
  row("gitignored files", String(n2.gitignored_files), k.warn);
  row("env files", `${n2.env.skipped_env_files.length} skipped` + (n2.env.skipped_env_files.length ? `: ${n2.env.skipped_env_files.join(", ")}` : ""), k.warn);
  row("env vars unmet", n2.env.unsatisfied_variables.length ? n2.env.unsatisfied_variables.join(", ") : "none — all declared vars resolve", n2.env.unsatisfied_variables.length ? k.bad : k.warn);
  if (n2.orphan_containers.length) {
    row("orphan containers", `${n2.orphan_containers.join(", ")} (no compose definition; cannot be rebuilt)`, k.bad);
  }
  row("docker volumes", "never come back on pull; they die with the pod", k.bad);
  row("also staying", "running processes, local services outside the compose project", k.warn);
  L.push("");
  L.push(k.dim(`durability: commits land on the PVC at ${opts.gitDir}; the working tree at ${opts.remote} does not survive the pod.`));
  return L.join(`
`);
}
function quiet(ui) {
  return (s) => {
    const text2 = s.replace(/[.\s]+$/, "").trim();
    if (text2)
      ui.detail(text2);
  };
}
function planToManifest(plan) {
  if (!plan)
    return null;
  return {
    compose_file: plan.composeFile,
    project: plan.project,
    containers: plan.containers.map((c3) => ({ name: c3.name, image: c3.image, digest: c3.digest })),
    volumes: plan.volumes.map((v) => ({ name: v, bytes: 0 })),
    refused: [],
    orphans: plan.orphans
  };
}
function manifestExtras(x, docker) {
  return {
    envFiles: x.env?.carried ?? [],
    unsatisfied: x.unmet,
    skippedEnvFiles: x.env?.skipped ?? [],
    docker
  };
}
var preflightBackend = async (x) => {
  try {
    const skew = await x.client.checkVersion();
    if (skew.fatal) {
      x.ui.error(skew.message ?? "incompatible backend version");
      return 1;
    }
    if (skew.message)
      x.ui.warn(skew.message);
  } catch (e) {
    x.ui.error(`backend unreachable: ${e.message}`, "check the URL and token, then: stepaway doctor");
    return 1;
  }
  return null;
};
var createSession = async (x) => {
  const boot = x.ui.spinner(`creating session ${x.apiId.slice(0, 8)} on ${x.target}`);
  x.boot = boot;
  try {
    x.session = await x.client.createSession({
      sessionId: x.apiId,
      project: path9.basename(x.root),
      options: { remotePathBase: x.cfg.remotePathBase }
    });
  } catch (e) {
    boot.fail(`could not create the session: ${e.message}`);
    return 1;
  }
  x.arm();
  return null;
};
var capture = async (x) => {
  x.boot?.update(`runner ${x.session?.podName || x.apiId.slice(0, 8)} booting — capturing ${path9.basename(x.root)} meanwhile`);
  try {
    await captureLocal(x.root, x.capDir, { sessionId: x.sid, excludes: x.excludes, composeFile: x.cfg.composeFile });
  } catch (e) {
    x.boot?.fail(`capture failed: ${e.message}`);
    return x.fail("capture failed");
  }
  return null;
};
var carryEnv = async (x) => {
  const rawDeclared = readLines(x.capDir, "meta/declared-env-files.txt");
  x.boot?.stop(`captured ${path9.basename(x.root)}; runner still booting`);
  x.boot = null;
  const { plan, asked, declared } = await resolveEnvPlan(rawDeclared, x.cfg.env, {
    interactive: !x.flags.yes,
    ui: x.ui,
    root: x.root
  });
  x.env = carryEnvFiles(x.root, x.capDir, declared, plan);
  if (asked) {
    const p2 = rememberEnvChoice(x.root, { carryFiles: plan.carryFiles, excludeVars: plan.excludeVars });
    x.ui.detail(`remembered env choices in ${p2}`);
  }
  return null;
};
var waitReadyAndCheckVars = async (x) => {
  const required = readLines(x.capDir, "meta/required-vars.txt");
  const wait = x.ui.spinner("waiting for the runner (image pull + claude install)");
  try {
    const ready = await x.client.waitReady(x.apiId, {
      onState: (s) => wait.update(`runner ${s.podName || x.apiId.slice(0, 8)}: ${s.state}`)
    });
    wait.stop(`runner ${ready.podName || x.apiId.slice(0, 8)} ready`);
  } catch (e) {
    wait.fail(e.message);
    return x.fail("runner never became ready");
  }
  let runnerEnv;
  try {
    runnerEnv = await x.client.envNames(x.apiId, required);
  } catch (e) {
    x.ui.warn(`could not query the runner's env names (${e.message}); assuming none are set`);
    runnerEnv = new Set;
  }
  x.unmet = unsatisfiedVars(required, x.env?.satisfied ?? new Set, runnerEnv);
  if (x.unmet.length) {
    x.ui.error(`refusing to hand off: ${x.unmet.length} declared variable(s) would be missing on the runner: ${x.unmet.join(", ")}`, `carry the file that defines them, or set them in .stepaway.json:
` + `  { "env": { "carryFiles": [...], "overrideVars": { "${x.unmet[0]}": "value" } } }
` + `nothing was transferred; the empty runner was deleted.`);
    return x.fail("unsatisfied variables");
  }
  return null;
};
var planTransfer = async (x) => {
  x.dplan = planDocker(x.root, x.cfg.composeFile);
  x.setupCmd = resolveSetup(x.root, x.cfg.setup);
  x.instruction = x.flags.goal ? String(x.flags.goal) : DEFAULT_INSTRUCTION;
  x.manifest = buildManifest(x.capDir, manifestExtras(x, planToManifest(x.dplan)));
  const rw = rewriteSessions(x.capDir, x.manifest.captured.project_path, x.remote);
  if (rw.trimmed)
    x.ui.detail(`trimmed ${rw.trimmed} phantom transcript line(s)`);
  return null;
};
var consent = async (x) => {
  const summary = consentSummary(x.manifest, {
    remote: x.remote,
    gitDir: x.gitDir,
    target: x.target,
    docker: x.dplan,
    setup: x.setupCmd,
    instruction: x.instruction,
    color: x.ui.fancy,
    verbose: x.ui.verbose
  });
  x.ui.note(summary, "this is what moves");
  if (!x.flags.yes) {
    if (!x.ui.interactive) {
      x.ui.error("refusing to transfer without consent (no TTY)", "re-run with --yes");
      return x.fail("no consent");
    }
    if (!await x.ui.confirm("Hand this session off to the runner?", false)) {
      x.ui.cancel("aborted — nothing was moved, nothing was stopped, and the empty runner was deleted");
      return x.fail("declined");
    }
  }
  return null;
};
var quiesceDocker = async (x) => {
  if (!x.dplan)
    return null;
  const spin = x.ui.spinner(`quiescing ${x.dplan.containers.length} container(s)`);
  const dres = await captureDocker(x.root, x.capDir, x.dplan, quiet(x.ui));
  spin.stop(`services quiesced and volumes carried`);
  for (const w of dres.warnings)
    x.ui.warn(w);
  x.manifest = buildManifest(x.capDir, manifestExtras(x, dres.manifest));
  return null;
};
var transfer = async (x) => {
  const xfer = x.ui.spinner(`transferring to ${x.target}`);
  const tr = await bashAsync(`set -e; tar czf ${shq(x.tarPath)} -C ${shq(os2.tmpdir())} ${shq(x.capDirName)}`);
  if (tr.code !== 0) {
    xfer.fail(`tar failed: ${lastLine(tr.stderr)}`);
    return x.fail("tar failed");
  }
  try {
    x.report = await x.client.uploadCapture(x.apiId, x.tarPath, x.setupCmd);
  } catch (e) {
    xfer.fail(`upload failed: ${e.message}`);
    x.disarm();
    x.ui.error("the session still exists on the backend", `retry, or: stepaway destroy --session ${x.apiId}`);
    return 1;
  }
  xfer.stop(`transferred to ${x.target} and restored on the runner`);
  x.ui.detail(JSON.stringify(x.report));
  const report = x.report;
  if (report && report.restored === false) {
    x.ui.error("the runner could not restore the capture", `stepaway destroy --session ${x.apiId} to clean up`);
    x.disarm();
    return 1;
  }
  if (report?.docker && report.docker.attempted && !report.docker.ok) {
    x.ui.warn(`services did not all come up on the runner${report.docker.detail ? `: ${report.docker.detail}` : ""}`);
  }
  if (report?.setup && report.setup.attempted && !report.setup.ok) {
    x.ui.warn(`setup failed on the runner (${report.setup.cmd ?? x.setupCmd}) — the agent can often fix it`);
    if (report.setup.tail)
      x.ui.detail(report.setup.tail);
  }
  return null;
};
var launch = async (x) => {
  const spin = x.ui.spinner("starting the unattended run");
  try {
    await x.client.run(x.apiId, { instruction: x.instruction });
    spin.stop("agent running unattended on the runner");
  } catch (e) {
    spin.fail(`could not start the run: ${e.message}`);
    x.ui.error("the runner is up with your code on it", `retry, or: stepaway destroy --session ${x.apiId}`);
    x.disarm();
    return 1;
  }
  writeBaton(x.root, {
    pushedAt: new Date().toISOString(),
    server: x.target,
    id: x.apiId,
    sessionId: capturedSessionId(x.manifest) ?? x.sid,
    remotePath: x.report?.workTree || x.remote
  });
  x.disarm();
  x.ui.outro(`pushed — the cloud is now the source of truth for ${path9.basename(x.root)}
` + `  watch:       stepaway peek -f
` + `  bring back:  stepaway pull
` + `  abandon:     stepaway destroy`);
  if (x.flags.json) {
    x.ui.raw(JSON.stringify({
      ok: true,
      server: x.target,
      sessionId: x.apiId,
      remotePath: x.report?.workTree || x.remote,
      gitDir: x.gitDir,
      report: x.report,
      manifest: x.manifest
    }, null, 2) + `
`);
  }
  return 0;
};
var PHASES = [
  preflightBackend,
  createSession,
  capture,
  carryEnv,
  waitReadyAndCheckVars,
  planTransfer,
  consent,
  quiesceDocker,
  transfer,
  launch
];
async function cmdPush(args, flags) {
  const ui = Ui.from(flags);
  const dir = args[0] ?? process.cwd();
  const root = projectRoot(dir);
  if (!fs8.existsSync(path9.join(root, ".git"))) {
    ui.error(`not a git repository: ${root}`, "run stepaway push from inside a git project");
    return 1;
  }
  const opened = openClient(root, flags);
  if (!opened.client) {
    ui.error("no backend configured", opened.error);
    return 1;
  }
  const client = opened.client;
  ui.intro(`stepaway push  ${path9.basename(root)}`);
  const cfg = resolveConfig(root, flags);
  const home = os2.homedir();
  const wanted = flags.session ? String(flags.session) : null;
  const sid = selectSession(home, root, wanted);
  if (wanted && !sid) {
    ui.error(`no transcript ${wanted}.jsonl for ${root}`, "list sessions: ls ~/.claude/projects");
    return 1;
  }
  if (!sid)
    ui.warn(`no Claude transcript for ${root}; carrying code only`);
  const capDirName = `stepaway-${Date.now()}`;
  const apiId = sid ?? randomUUID();
  let armed = false;
  let disarmed = false;
  let why = "aborted";
  const abandon = async () => {
    if (!armed || disarmed)
      return;
    disarmed = true;
    try {
      await client.deleteSession(apiId);
      ui.detail(`${why}: deleted session ${apiId}`);
    } catch (e) {
      ui.warn(`could not delete session ${apiId}: ${e.message} — run: stepaway destroy --session ${apiId}`);
    }
  };
  const x = {
    ui,
    client,
    flags,
    root,
    cfg,
    home,
    excludes: excludePrefixes(cfg),
    sid,
    apiId,
    remote: remoteProjectPath(cfg, root),
    gitDir: remoteGitDir(root),
    target: client.server,
    capDirName,
    capDir: path9.join(os2.tmpdir(), capDirName),
    tarPath: path9.join(os2.tmpdir(), `${capDirName}.tar.gz`),
    fail: (reason) => {
      why = reason;
      return 1;
    },
    arm: () => {
      armed = true;
    },
    disarm: () => {
      disarmed = true;
    },
    boot: null,
    session: null,
    env: null,
    unmet: [],
    dplan: null,
    setupCmd: null,
    instruction: DEFAULT_INSTRUCTION,
    manifest: null,
    report: null
  };
  const onSigint = () => {
    why = "interrupted";
    abandon().then(() => {
      process.stderr.write(`
aborted — nothing was moved; the runner was deleted
`);
      process.exit(130);
    });
  };
  process.on("SIGINT", onSigint);
  try {
    for (const phase of PHASES) {
      const code = await phase(x);
      if (code !== null)
        return code;
    }
    return 0;
  } finally {
    process.off("SIGINT", onSigint);
    await abandon();
    fs8.rmSync(x.tarPath, { force: true });
    fs8.rmSync(x.capDir, { recursive: true, force: true });
  }
}

// src/commands/pull.ts
import * as fs9 from "node:fs";
import * as os3 from "node:os";
import * as path10 from "node:path";

// src/restore.ts
function restoreLocal(captureDir, projectDir, branch, slug) {
  return bashAsync(RESTORE_SH, [captureDir, projectDir, branch, slug]);
}

// src/commands/pull.ts
async function cmdPull(args, flags) {
  const ui = Ui.from(flags);
  const dir = args[0] ?? process.cwd();
  const root = projectRoot(dir);
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    ui.error(`no handoff baton for ${root}`, "pass --session <id>, or push from here first");
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    ui.error("no backend configured", opened.error);
    return 1;
  }
  const client = opened.client;
  ui.intro(`stepaway pull  ${path10.basename(root)}`);
  const localDirty = run("git", ["status", "--porcelain"], { cwd: root }).stdout.trim();
  if (localDirty && !flags.overwrite) {
    const n2 = localDirty.split(`
`).length;
    if (baton) {
      ui.error(`local tree is dirty (${n2} file(s)) and this project was handed off ${baton.pushedAt}`, `cloud is the source of truth after a handoff: the runner's state will replace local changes.
` + "re-run with --overwrite to proceed.");
    } else {
      ui.error(`local tree is dirty (${n2} file(s)) and there is no handoff baton for this project`, "commit/stash first, or re-run with --overwrite.");
    }
    return 1;
  }
  try {
    const skew = await client.checkVersion();
    if (skew.fatal) {
      ui.error(skew.message ?? "incompatible backend version");
      return 1;
    }
    if (skew.message)
      ui.warn(skew.message);
  } catch (e) {
    ui.error(`backend unreachable: ${e.message}`, "check the URL and token, then: stepaway doctor");
    return 1;
  }
  const stamp = Date.now();
  const capDirName = `stepaway-pull-${stamp}`;
  const localTar = path10.join(os3.tmpdir(), `${capDirName}.tar.gz`);
  const xfer = ui.spinner(`fetching the archive from ${client.server}`);
  let bytes = 0;
  try {
    bytes = await client.downloadArchive(sessionId, localTar);
  } catch (e) {
    xfer.fail(`archive download failed: ${e.message}`);
    fs9.rmSync(localTar, { force: true });
    return 1;
  }
  const unpackRoot = path10.join(os3.tmpdir(), capDirName);
  fs9.rmSync(unpackRoot, { recursive: true, force: true });
  fs9.mkdirSync(unpackRoot, { recursive: true });
  const un = await bashAsync(`set -e; tar xzf ${shq(localTar)} -C ${shq(unpackRoot)}`);
  if (un.code !== 0) {
    xfer.fail(`untar failed: ${lastLine(un.stderr)}`);
    fs9.rmSync(localTar, { force: true });
    fs9.rmSync(unpackRoot, { recursive: true, force: true });
    return 1;
  }
  xfer.stop(`transferred home (${Math.max(1, Math.round(bytes / 1024))} KiB)`);
  const capDir = captureDirIn(unpackRoot);
  if (!capDir) {
    ui.error("the archive did not contain a capture directory", "the backend may have sent an empty archive");
    fs9.rmSync(localTar, { force: true });
    fs9.rmSync(unpackRoot, { recursive: true, force: true });
    return 1;
  }
  const m3 = buildManifest(capDir);
  rewriteSessions(capDir, m3.captured.project_path, root);
  const localSlug = existingSlugDir(os3.homedir(), root) ?? slugFor(root);
  const rspin = ui.spinner("restoring locally");
  const rest = await restoreLocal(capDir, root, m3.captured.branch, localSlug);
  ui.detail(rest.stdout);
  if (rest.code !== 0) {
    rspin.fail(`restore failed: ${lastLine(rest.stderr || rest.stdout)}`);
    return 1;
  }
  rspin.stop(`restored ${m3.captured.branch} into ${root}`);
  const sid = capturedSessionId(m3) ?? baton?.sessionId ?? null;
  fs9.rmSync(unpackRoot, { recursive: true, force: true });
  fs9.rmSync(localTar, { force: true });
  clearBaton(root);
  const dspin = ui.spinner(`deleting the runner and its PVC`);
  try {
    await client.deleteSession(sessionId);
    dspin.stop("runner deleted");
  } catch (e) {
    dspin.fail(`could not delete the session: ${e.message}`);
    ui.warn(`your work is home; clean up later with: stepaway destroy --session ${sessionId}`);
  }
  ui.outro(`pulled ${client.server} (${sessionId}) → ${root}
` + `  branch ${m3.captured.branch} @ ${m3.captured.head.slice(0, 12)}, ` + `${m3.captured.dirty_file_count} dirty file(s), ${m3.captured.session_ids.length} transcript(s)
` + (sid ? `  resume:  claude --resume ${sid}
` : "") + `  docker volumes on the runner are NOT pulled back — they died with the pod.`);
  if (flags.json) {
    process.stdout.write(JSON.stringify({ ok: true, sessionId: sid, deleted: sessionId, manifest: m3 }, null, 2) + `
`);
  }
  return 0;
}
function captureDirIn(unpackRoot) {
  if (fs9.existsSync(path10.join(unpackRoot, "meta")))
    return unpackRoot;
  for (const e of fs9.readdirSync(unpackRoot)) {
    const p2 = path10.join(unpackRoot, e);
    if (fs9.statSync(p2).isDirectory() && fs9.existsSync(path10.join(p2, "meta")))
      return p2;
  }
  return null;
}

// src/commands/status.ts
import * as path11 from "node:path";
function tintState(state, k) {
  if (state === "failed")
    return k.bad(k.bold(state));
  if (state === "done")
    return k.ok(k.bold(state));
  if (state === "running")
    return k.cyan(k.bold(state));
  return k.warn(k.bold(state));
}
async function cmdStatus(args, flags) {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const cfg = resolveConfig(root, flags);
  const baton = readBaton(root);
  const k = colorize(ui.fancy);
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    ui.error(opened.error);
    return 1;
  }
  const client = opened.client;
  if (!baton) {
    let sessions = [];
    let err2 = null;
    try {
      sessions = await client.listSessions();
    } catch (e) {
      err2 = e.message;
    }
    if (flags.json) {
      ui.raw(JSON.stringify({ project: root, handoff: false, server: client.server, sessions, error: err2 }, null, 2) + `
`);
      return err2 ? 1 : 0;
    }
    ui.raw(`project: ${root}
no active handoff (push with: stepaway push)
` + `backend: ${client.server}
` + `default remote working tree would be ${remoteProjectPath(cfg, root)}

`);
    if (err2) {
      ui.error(`could not list sessions: ${err2}`);
      return 1;
    }
    if (!sessions.length) {
      ui.raw(`sessions: (none)
`);
      return 0;
    }
    const w = (f2, head) => Math.max(head.length, ...sessions.map((s2) => f2(s2).length)) + 2;
    const idW = w((s2) => s2.id, "SESSION");
    const projW = w((s2) => s2.project ?? "", "PROJECT");
    const stW = w((s2) => s2.state ?? "", "STATE");
    ui.raw(k.dim(`${pad("SESSION", idW)}${pad("PROJECT", projW)}${pad("STATE", stW)}CREATED`) + `
`);
    for (const s2 of sessions) {
      ui.raw(`${pad(s2.id, idW)}${pad(s2.project ?? "", projW)}${pad(s2.state ?? "", stW)}${s2.createdAt ?? ""}
`);
    }
    return 0;
  }
  let s = null;
  let err = null;
  try {
    s = await client.getSession(baton.id);
  } catch (e) {
    err = e.message;
  }
  if (flags.json) {
    ui.raw(JSON.stringify({ project: root, handoff: true, baton, session: s, error: err }, null, 2) + `
`);
    return err ? 1 : 0;
  }
  ui.raw(`project:    ${root} (${path11.basename(root)})
` + `handed off: ${baton.pushedAt}
` + `backend:    ${baton.server}
` + `session:    ${baton.id}${baton.sessionId && baton.sessionId !== baton.id ? ` (transcript ${baton.sessionId})` : ""}
` + `state:      ${s ? tintState(s.state, k) : k.bad("unknown")}` + (s?.exitCode !== undefined && s?.exitCode !== null ? ` (exit ${s.exitCode})` : "") + `
` + (s?.detail ? `detail:     ${s.detail}
` : "") + (err ? `error:      ${err}
` : "") + `pod:        ${s?.podName ?? "(unknown)"}
` + `work tree:  ${baton.remotePath}
` + `git dir:    ${remoteGitDir(root)} (on the session PVC)
` + `
watch:       stepaway peek -f
` + `bring back:  stepaway pull
` + `abandon:     stepaway destroy
`);
  return err ? 1 : 0;
}

// src/commands/doctor.ts
import * as fs10 from "node:fs";
import * as os4 from "node:os";
import * as path12 from "node:path";
async function cmdDoctor(args, flags) {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const cfg = resolveConfig(root, flags);
  const checks = [];
  const add = (name, ok, detail, blocking = true) => checks.push({ name, ok, detail, blocking });
  const haveGit = which("git");
  add("git", haveGit, haveGit ? run("git", ["--version"]).stdout.trim() : "not found on PATH");
  add("tar", which("tar"), which("tar") ? "present" : "not found on PATH");
  add("bash", which("bash"), which("bash") ? "present" : "not found on PATH");
  const major = Number(process.versions.node.split(".")[0]) || 0;
  add("node >= 20", major >= 20, `${process.version} (stepaway ${VERSION})`);
  const isRepo = fs10.existsSync(path12.join(root, ".git"));
  add("git repo", isRepo, isRepo ? root : `${root} is not a git repository`);
  const home = os4.homedir();
  const slugDir = existingSlugDir(home, root);
  const sid = selectSession(home, root, flags.session ? String(flags.session) : null);
  add("claude session", Boolean(sid), sid ? `${sid} (from ${path12.join(home, ".claude", "projects", slugDir ?? slugFor(root))})` : `no transcript at ~/.claude/projects/${slugFor(root)} (nothing to resume; code still moves)`, false);
  const compose = findComposeFile(root, cfg.composeFile);
  const haveDocker = compose ? dockerAvailable() : false;
  add("docker carry", true, compose ? haveDocker ? `${compose} + local daemon reachable — services will be quiesced and carried` : `${compose} found but no reachable docker daemon; services will be skipped` : "no compose file; code + session handoff only", false);
  const setup = resolveSetup(root, cfg.setup);
  add("setup command", true, setup ?? "none detected (no lockfile); nothing will run", false);
  add("excludes", true, excludePrefixes(cfg).join(", ") || "(none)", false);
  const global = readClientConfig();
  const r2 = resolveClient(flags, loadConfig(root).server, global);
  const cfgFile = clientConfigPath();
  add("client config", Boolean(global.server && global.token) || Boolean(r2.server && r2.token), r2.server && r2.token ? `server from ${r2.sources.server}, token from ${r2.sources.token} (${cfgFile})` : `missing ${cfgFile} — run: stepaway auth --server <url> --server-token <token>`);
  if (r2.server && r2.token) {
    const client = new Client({ server: r2.server, token: r2.token });
    let reachable = false;
    try {
      const v = await client.version();
      reachable = true;
      add(`backend ${r2.server}`, true, `reachable, api ${v?.api ?? "?"} v${v?.version ?? "?"}`);
      const skew = versionSkew(VERSION, v?.version ?? "0.0.0");
      add("version skew", !skew.fatal, skew.message ?? `CLI and backend both ${VERSION}`, skew.fatal);
    } catch (e) {
      add(`backend ${r2.server}`, false, e.message);
    }
    if (reachable) {
      try {
        const d = await client.diagnostics();
        for (const c3 of d.checks ?? []) {
          add(`server: ${c3.name}`, c3.ok, c3.detail ?? (c3.ok ? "ok" : "failed"), c3.level === "fail");
        }
        if (!d.checks?.length)
          add("server: diagnostics", d.ok !== false, "backend reported no checks", false);
      } catch (e) {
        add("server: diagnostics", false, e.message);
      }
    }
  }
  const baton = readBaton(root);
  if (baton)
    add("handoff baton", true, `${baton.id} on ${baton.server} (pushed ${baton.pushedAt})`, false);
  if (flags.json) {
    ui.raw(JSON.stringify({ project: root, server: r2.server, checks }, null, 2) + `
`);
  } else {
    const k = colorize(ui.fancy);
    const width = Math.max(...checks.map((c3) => c3.name.length)) + 2;
    for (const c3 of checks) {
      const mark = c3.ok ? k.ok("✓") : c3.blocking ? k.bad("✗") : k.warn("!");
      const name = c3.ok ? pad(c3.name, width) : k.bold(pad(c3.name, width));
      ui.raw(`${mark} ${name}${k.dim(c3.detail)}
`);
    }
    ui.raw(`
${k.dim("target:")} ${r2.server ?? "(no backend)"} → ${remoteProjectPath(cfg, root)}
`);
  }
  return checks.some((c3) => !c3.ok && c3.blocking) ? 1 : 0;
}

// src/commands/init.ts
import * as fs11 from "node:fs";
async function cmdInit(args, flags) {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const p2 = configPath(root);
  const existed = fs11.existsSync(p2);
  const cfg = resolveConfig(root, flags);
  const patch = {
    remotePathBase: cfg.remotePathBase,
    excludeGlobs: cfg.excludeGlobs
  };
  if (cfg.server)
    patch.server = cfg.server;
  const compose = findComposeFile(root, cfg.composeFile);
  if (compose)
    patch.composeFile = compose;
  if (cfg.setup !== null)
    patch.setup = cfg.setup;
  patchConfig(root, patch);
  const setup = cfg.setup ?? detectSetup(root);
  const global = readClientConfig();
  if (flags.json) {
    ui.raw(JSON.stringify({ path: p2, updated: existed, config: loadConfig(root) }, null, 2) + `
`);
  } else {
    ui.raw(`${existed ? "updated" : "wrote"} ${p2}
` + `  backend: ${cfg.server ?? global.server ?? "(none yet — run stepaway auth)"}
` + `  remote working tree: ${remoteProjectPath(cfg, root)} (one pod per session)
` + `  compose file: ${compose ?? "(none)"}
` + `  setup: ${setup ?? "(none detected)"}
` + `next: stepaway auth, then stepaway doctor
`);
  }
  return 0;
}

// src/commands/skill.ts
import * as fs13 from "node:fs";
import * as os5 from "node:os";
import * as path14 from "node:path";

// src/pkg.ts
import * as fs12 from "node:fs";
import * as path13 from "node:path";
import { fileURLToPath } from "node:url";
function packageFile(rel) {
  const here = path13.dirname(fileURLToPath(import.meta.url));
  const cands = [
    path13.join(here, "..", rel),
    path13.join(here, "..", "..", rel),
    path13.join(process.cwd(), rel)
  ];
  for (const c3 of cands)
    if (fs12.existsSync(c3))
      return c3;
  throw new Error(`packaged file not found: ${rel} (looked in ${cands.join(", ")})`);
}

// src/commands/skill.ts
async function cmdSkill(args, flags) {
  const sub = args[0] ?? "install";
  if (sub !== "install") {
    process.stderr.write(`unknown skill subcommand: ${sub}
usage: stepaway skill install
`);
    return 1;
  }
  const src = packageFile(path14.join("skill", "stepaway"));
  const dst = path14.join(os5.homedir(), ".claude", "skills", "stepaway");
  fs13.mkdirSync(path14.dirname(dst), { recursive: true });
  fs13.rmSync(dst, { recursive: true, force: true });
  fs13.cpSync(src, dst, { recursive: true });
  if (flags.json)
    process.stdout.write(JSON.stringify({ installed: dst }, null, 2) + `
`);
  else
    process.stdout.write(`installed skill -> ${dst}
say "hand this off" in Claude Code to use it (restart the session to pick it up)
`);
  return 0;
}

// src/commands/auth.ts
import { spawn as spawn2 } from "node:child_process";
var TOKEN_RE = /\b(sk-ant-oat[A-Za-z0-9_-]{20,})/;
function findToken(text2) {
  const m3 = TOKEN_RE.exec(text2);
  return m3 ? m3[1] : null;
}
function ptyCommand(platform) {
  if (platform === "darwin")
    return { cmd: "script", args: ["-q", "/dev/null", "claude", "setup-token"] };
  return { cmd: "script", args: ["-qec", "claude setup-token", "/dev/null"] };
}
function runSetupToken(usePty) {
  return new Promise((resolve3) => {
    const { cmd, args } = usePty ? ptyCommand(process.platform) : { cmd: "claude", args: ["setup-token"] };
    const child = spawn2(cmd, args, { stdio: ["inherit", "pipe", "inherit"] });
    let buf = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      buf += chunk.toString("utf8");
      if (buf.length > 1e6)
        buf = buf.slice(-1e5);
    });
    child.on("error", () => resolve3({ token: null, code: 127 }));
    child.on("close", (code) => resolve3({ token: findToken(buf), code: code ?? 1 }));
  });
}
async function cmdAuth(args, flags) {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const projectServer = loadConfig(root).server;
  const global = readClientConfig();
  const pre = resolveClient(flags, projectServer, global);
  let server = pre.server;
  let bearer = pre.token;
  if (!server) {
    if (!ui.interactive) {
      ui.error("no backend URL. Re-run with:", "  stepaway auth --server https://stepaway.example.com --server-token <token>");
      return 1;
    }
    const a2 = (await ui.text("backend URL", "https://stepaway.example.com")).trim();
    if (!a2) {
      ui.error("no backend URL; nothing stored");
      return 1;
    }
    server = normalizeServer(a2);
  }
  if (!bearer) {
    if (!ui.interactive) {
      ui.error("no bearer token. Re-run with --server-token <token> (see the chart's NOTES.txt)");
      return 1;
    }
    bearer = (await ui.text("bearer token (from the Helm chart's NOTES.txt)")).trim() || null;
  }
  if (!bearer) {
    ui.error("no bearer token; nothing stored");
    return 1;
  }
  const client = new Client({ server, token: bearer });
  let skewNote = null;
  try {
    const skew = await client.checkVersion();
    if (skew.fatal) {
      ui.error(skew.message ?? "incompatible backend version");
      return 1;
    }
    skewNote = skew.message;
  } catch (e) {
    ui.error(`could not authenticate against ${server}: ${e.message}`);
    return 1;
  }
  const cfgPath = writeClientConfig({ server, token: bearer });
  ui.raw(`backend ${server} verified; saved to ${cfgPath} (mode 600)
`);
  if (skewNote)
    ui.warn(skewNote);
  let token = flags.token ? String(flags.token) : null;
  if (!token) {
    if (!which("claude")) {
      ui.error("claude is not on PATH. Install Claude Code, or pass an existing token:", "  stepaway auth --token <sk-ant-oat...>");
      return 1;
    }
    const usePty = which("script");
    ui.raw(`
running: claude setup-token
(complete the sign-in in your browser)

`);
    const r2 = await runSetupToken(usePty);
    token = r2.token;
    if (!token) {
      if (!ui.interactive) {
        ui.error(`could not read a token from 'claude setup-token' (exit ${r2.code}). Re-run with --token <value>.`);
        return 1;
      }
      ui.raw(`
`);
      token = (await ui.text("could not detect the token in that output — paste it here")).trim() || null;
    }
  }
  if (!token) {
    ui.error("no token; nothing stored on the backend");
    return 1;
  }
  if (!/^sk-ant-/.test(token)) {
    ui.error("that does not look like a Claude OAuth token (expected sk-ant-oat…)");
    return 1;
  }
  try {
    await client.putClaudeToken(token);
  } catch (e) {
    ui.error(`backend refused the Claude token: ${e.message}`);
    return 1;
  }
  token = "";
  ui.raw(`
stored your Claude token on ${server}
` + `runner pods read it as CLAUDE_CODE_OAUTH_TOKEN. Re-run 'stepaway auth' any time to rotate.
` + `config: ${clientConfigPath()}
`);
  return 0;
}

// src/transcript-format.ts
var import_picocolors2 = __toESM(require_picocolors(), 1);
function renderMarkdown(text2, color = true) {
  const bold = (s) => color ? import_picocolors2.default.bold(s) : s;
  const code = (s) => color ? import_picocolors2.default.cyan(import_picocolors2.default.dim(s)) : s;
  const out = [];
  let fenced = false;
  for (const raw of text2.split(`
`)) {
    if (/^\s*```/.test(raw)) {
      fenced = !fenced;
      out.push(color ? import_picocolors2.default.dim(raw) : raw);
      continue;
    }
    if (fenced) {
      out.push(color ? import_picocolors2.default.dim(raw) : raw);
      continue;
    }
    const h2 = /^(\s*)(#{1,6})\s+(.*)$/.exec(raw);
    if (h2) {
      out.push(`${h2[1]}${bold(h2[3])}`);
      continue;
    }
    out.push(inline(raw, bold, code));
  }
  return out.join(`
`);
}
function inline(line, bold, code) {
  const parts = line.split(/(`[^`]+`)/g);
  return parts.map((part) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2)
      return code(part.slice(1, -1));
    let s = part;
    s = s.replace(/\*\*([^*\n]+)\*\*/g, (_m, g2) => bold(g2));
    s = s.replace(/__([^_\n]+)__/g, (_m, g2) => bold(g2));
    s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=$|[\s.,;:)!?])/g, (_m, pre, g2) => `${pre}${bold(g2)}`);
    s = s.replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,;:)!?])/g, (_m, pre, g2) => `${pre}${bold(g2)}`);
    return s;
  }).join("");
}
function formatEvent(e, opts = {}) {
  const color = opts.color !== false;
  const dim = (s) => color ? import_picocolors2.default.dim(s) : s;
  switch (e.kind) {
    case "tool-use": {
      const name = e.tool ?? e.text;
      const summary = e.summary ? `  ${e.summary}` : "";
      return dim(`⚙ ${name}${summary}`);
    }
    case "result":
      return dim(`— ${e.text}`);
    case "error":
      return color ? import_picocolors2.default.red(`! ${e.text}`) : `! ${e.text}`;
    default:
      return renderMarkdown(e.text, color);
  }
}
var COLLAPSE_AT = 5;
var COLLAPSE_KEEP = 3;

class TranscriptPrinter {
  write;
  opts;
  pending = [];
  lastKind = null;
  constructor(write, opts = {}) {
    this.write = write;
    this.opts = opts;
  }
  push(e) {
    if (this.opts.collapse === false) {
      this.emit(e);
      return;
    }
    if (e.kind === "tool-use") {
      this.pending.push(e);
      return;
    }
    this.flush();
    this.emit(e);
  }
  flush() {
    const p2 = this.pending;
    this.pending = [];
    if (!p2.length)
      return;
    if (p2.length < COLLAPSE_AT) {
      for (const e of p2)
        this.emit(e);
      return;
    }
    for (const e of p2.slice(0, COLLAPSE_KEEP))
      this.emit(e);
    const n2 = p2.length - COLLAPSE_KEEP;
    const line = `… +${n2} more tool call${n2 === 1 ? "" : "s"}`;
    this.write(`${this.opts.color === false ? line : import_picocolors2.default.dim(line)}
`);
    this.lastKind = "tool-use";
  }
  emit(e) {
    if (this.lastKind && (e.kind === "assistant-text" || this.lastKind === "assistant-text")) {
      this.write(`
`);
    }
    this.write(`${formatEvent(e, this.opts)}
`);
    this.lastKind = e.kind;
  }
}

// src/commands/peek.ts
async function cmdPeek(args, flags) {
  const root = projectRoot(args[0] ?? process.cwd());
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    process.stderr.write(`no active handoff for ${root} (nothing to peek at)
`);
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    process.stderr.write(`${opened.error}
`);
    return 1;
  }
  const client = opened.client;
  const follow = Boolean(flags.follow);
  const printer = new TranscriptPrinter((s) => process.stdout.write(s), {
    color: Boolean(process.stdout.isTTY) && !flags.json,
    collapse: !follow
  });
  const emit = (line) => {
    for (const e of renderLine(line))
      printer.push(e);
  };
  if (!follow) {
    let text2;
    try {
      text2 = await client.transcript(sessionId);
    } catch (e) {
      process.stderr.write(`${e.message}
`);
      return 1;
    }
    if (!text2.trim()) {
      process.stderr.write(`no transcript yet for session ${sessionId}
`);
      return 1;
    }
    for (const line of text2.split(`
`))
      emit(line);
    printer.flush();
    return 0;
  }
  process.stderr.write(`peeking at ${client.server} (${sessionId.slice(0, 8)}) — ctrl-c to stop

`);
  const ac = new AbortController;
  const stop = () => ac.abort();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await client.followTranscript(sessionId, emit, { signal: ac.signal });
  } catch (e) {
    printer.flush();
    process.stderr.write(`${e.message}
`);
    return 1;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
  printer.flush();
  return 0;
}

// src/commands/destroy.ts
async function cmdDestroy(args, flags) {
  const ui = Ui.from(flags);
  const root = projectRoot(args[0] ?? process.cwd());
  const baton = readBaton(root);
  const sessionId = flags.session ? String(flags.session) : baton?.id;
  if (!sessionId) {
    ui.error(`no handoff baton for ${root}; name the session to destroy:`, `  stepaway destroy --session <id>
  ('stepaway status' lists what the backend is running)`);
    return 1;
  }
  const opened = openClient(root, flags, baton?.server);
  if (!opened.client) {
    ui.error(opened.error);
    return 1;
  }
  const client = opened.client;
  ui.raw(`destroy session ${sessionId} on ${client.server}
` + `  deletes the pod AND its PVC: any commits still only on the runner are lost.
` + (baton ? `  handed off ${baton.pushedAt}, transcript ${baton.sessionId ?? "(none)"}
` : "") + `  to keep the work instead, run: stepaway pull

`);
  if (!flags.yes) {
    if (!ui.interactive) {
      ui.error("refusing to destroy without confirmation: re-run with --yes (no TTY)");
      return 1;
    }
    if (!await ui.confirm("Destroy?", false)) {
      ui.error("aborted");
      return 1;
    }
  }
  try {
    await client.deleteSession(sessionId);
  } catch (e) {
    ui.error(`could not delete session ${sessionId}: ${e.message}`);
    return 1;
  }
  if (baton && baton.id === sessionId)
    clearBaton(root);
  ui.raw(`deleted session ${sessionId} (pod + PVC)
`);
  return 0;
}

// src/stepaway.ts
var HELP = `stepaway ${VERSION} — move a live Claude Code session to a runner on your cluster, and back.

usage:
  stepaway auth              point this laptop at a backend and store your Claude token there
  stepaway push [dir]        hand this session off: capture, restore on a fresh pod, run unattended
  stepaway peek [dir]        watch what the agent is doing (-f to follow)
  stepaway pull [dir]        bring code + transcript home, then delete the pod and its PVC
  stepaway status [dir]      where is this project right now?
  stepaway destroy [dir]     abandon a handoff: delete the pod and its PVC
  stepaway doctor [dir]      check everything push needs, here and on the backend
  stepaway init [dir]        write .stepaway.json
  stepaway skill install     install the Claude Code skill into ~/.claude/skills

flags:
  --server <url>             stepaway backend base URL (https://…)
  --server-token <value>     bearer token for that backend (see the chart's NOTES.txt)
  --session <id>             which session to act on (push: which transcript to carry)
  --remote-base <path>       remote working-tree parent (default /work)
  --goal "<text>"            push only: what the agent should continue with
  --token <value>            auth only: skip 'claude setup-token' and store this
  --yes, -y                  skip the prompt (the summary is still printed)
  --overwrite                pull only: let the runner's state replace local changes
  -f, --follow               peek only: stream as it happens
  --json                     machine-readable output where it makes sense
  --verbose                  show the per-phase detail behind each step
  -h, --help, -v, --version

The CLI is a pure HTTP client of the stepaway backend (install it with the Helm
chart). No kubectl, no kubeconfig, nothing cluster-shaped on this machine.

One pod per session: the git dir lives on a per-session PVC at /repo, the working
tree on an emptyDir at /work. Commits survive a pod crash; the working tree does not.

config: ~/.config/stepaway/config.json holds {server, token} for this machine;
.stepaway.json in the project root holds project choices (and may override the
server). Flags beat both.
`;
var VALUE_FLAGS = new Set([
  "server",
  "server-token",
  "remote-base",
  "goal",
  "session",
  "token"
]);
var BOOL_FLAGS = new Set(["yes", "json", "overwrite", "help", "version", "follow", "verbose"]);
function parseArgs(argv) {
  const flags = {};
  const args = [];
  let cmd = "";
  for (let i2 = 0;i2 < argv.length; i2++) {
    const a2 = argv[i2];
    if (a2 === "-h") {
      flags.help = true;
    } else if (a2 === "-v") {
      flags.version = true;
    } else if (a2 === "-y") {
      flags.yes = true;
    } else if (a2 === "-f") {
      flags.follow = true;
    } else if (a2.startsWith("--")) {
      let name = a2.slice(2);
      let value;
      const eq = name.indexOf("=");
      if (eq !== -1) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (VALUE_FLAGS.has(name)) {
        if (value === undefined)
          value = argv[++i2];
        if (value === undefined)
          throw new Error(`--${name} needs a value`);
        flags[name] = value;
      } else if (BOOL_FLAGS.has(name)) {
        flags[name] = value === undefined ? true : value !== "false";
      } else {
        throw new Error(`unknown flag: --${name}`);
      }
    } else if (!cmd) {
      cmd = a2;
    } else {
      args.push(a2);
    }
  }
  return { cmd, args, flags };
}
async function main() {
  let p2;
  try {
    p2 = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}

${HELP}`);
    return 2;
  }
  if (p2.flags.version || p2.cmd === "version") {
    process.stdout.write(`${VERSION}
`);
    return 0;
  }
  if (!p2.cmd || p2.flags.help || p2.cmd === "help") {
    process.stdout.write(HELP);
    return 0;
  }
  switch (p2.cmd) {
    case "auth":
      return cmdAuth(p2.args, p2.flags);
    case "push":
      return cmdPush(p2.args, p2.flags);
    case "peek":
      return cmdPeek(p2.args, p2.flags);
    case "pull":
      return cmdPull(p2.args, p2.flags);
    case "status":
      return cmdStatus(p2.args, p2.flags);
    case "destroy":
      return cmdDestroy(p2.args, p2.flags);
    case "doctor":
      return cmdDoctor(p2.args, p2.flags);
    case "init":
      return cmdInit(p2.args, p2.flags);
    case "skill":
      return cmdSkill(p2.args, p2.flags);
    case "_capture": {
      const [dir, out, target] = p2.args;
      if (!dir || !out) {
        process.stderr.write(`usage: stepaway _capture <project_dir> <out_dir> [rewrite_target_path]
`);
        return 2;
      }
      const root = path15.resolve(dir);
      const cfg = loadConfig(root);
      const sid = p2.flags.session ? String(p2.flags.session) : selectSession(os6.homedir(), root, null);
      await captureLocal(root, path15.resolve(out), {
        sessionId: sid,
        excludes: excludePrefixes(cfg),
        composeFile: cfg.composeFile
      });
      const m3 = buildManifest(path15.resolve(out));
      if (target)
        rewriteSessions(path15.resolve(out), m3.captured.project_path, target);
      process.stdout.write(JSON.stringify(m3, null, 2) + `
`);
      return 0;
    }
    default:
      process.stderr.write(`unknown command: ${p2.cmd}

${HELP}`);
      return 2;
  }
}
main().then((code) => {
  process.exitCode = code;
}).catch((e) => {
  const verbose = process.argv.includes("--verbose");
  const red = (s) => process.stderr.isTTY ? `\x1B[31m${s}\x1B[39m` : s;
  process.stderr.write(red(`stepaway: ${e.message}`) + `
`);
  if (verbose && e.stack)
    process.stderr.write(`${e.stack}
`);
  else
    process.stderr.write(`re-run with --verbose for the full stack
`);
  process.exitCode = 1;
});
export {
  parseArgs
};
