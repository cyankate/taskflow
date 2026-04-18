import { diffLines } from "diff";

/**
 * 将 CRLF / 孤立的 \r 统一为 \n，再参与行 diff。
 * 否则一侧 LF、一侧 CRLF 会导致 diff 库把整文件当成「整段替换」，界面几乎全黄。
 */
export function normalizeTextForLineDiff(s) {
  return String(s ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/** 将 diff 块拆成行列表（保留空行） */
function chunkToLines(value) {
  const s = value == null ? "" : String(value);
  if (s.length === 0) return [];
  return s.split("\n");
}

function buildSplitDiffRowsFromParts(parts) {
  const rows = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (!p.added && !p.removed) {
      for (const line of chunkToLines(p.value)) {
        rows.push({ left: line, right: line, type: "equal" });
      }
      i++;
    } else if (p.removed) {
      const rem = chunkToLines(p.value);
      const next = parts[i + 1];
      if (next && next.added) {
        const add = chunkToLines(next.value);
        const n = Math.max(rem.length, add.length);
        for (let k = 0; k < n; k++) {
          const hasL = k < rem.length;
          const hasR = k < add.length;
          const L = hasL ? rem[k] : "";
          const R = hasR ? add[k] : "";
          if (hasL && hasR) {
            rows.push({ left: L, right: R, type: L === R ? "equal" : "change" });
          } else if (hasL) {
            rows.push({ left: L, right: "", type: "remove" });
          } else {
            rows.push({ left: "", right: R, type: "add" });
          }
        }
        i += 2;
      } else {
        for (const line of rem) {
          rows.push({ left: line, right: "", type: "remove" });
        }
        i++;
      }
    } else if (p.added) {
      for (const line of chunkToLines(p.value)) {
        rows.push({ left: "", right: line, type: "add" });
      }
      i++;
    } else {
      i++;
    }
  }
  return rows;
}

/**
 * 左右对照行数据：左列为服务器，右列为本地。
 * type: equal 同行相同 | change 同行替换 | remove 仅服务器 | add 仅本地
 */
export function computeSplitDiffRows(serverText, localText) {
  const server = normalizeTextForLineDiff(serverText);
  const local = normalizeTextForLineDiff(localText);
  const parts = diffLines(server, local, { ignoreWhitespace: false });
  return buildSplitDiffRowsFromParts(parts);
}
