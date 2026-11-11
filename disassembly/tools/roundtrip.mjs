// ------------------------------------------------------------------------
// 名称：roundtrip.mjs
// 说明：校验汇编清单：把所有清单一起重新汇编，并逐字节与原始 ROM 比对。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：清单文件名为 Pxx.asm，xx 为十六进制页号，每个清单对应 ROM 的一个 4K 页。
// ------------------------------------------------------------------------
import { assemble } from '../../bios/tools/asm6502.mjs';
import { PAGE_SIZE } from './cdl-listing.mjs';

/**
 * 重新汇编清单并与 ROM 比对。
 * @param {Map<number, string>} listings 页号到汇编文本
 * @param {Uint8Array} rom 整个 ROM 空间（不含 iNES 文件头）
 * @returns {{ok: boolean, pagesChecked: number, mismatches: {page: number, offset: number, expected: number, actual: number}[]}}
 */
export function verifyListings(listings, rom) {
  const sources = [...listings.entries()].map(([index, text]) => ({
    name: `P${index.toString(16).toUpperCase().padStart(2, '0')}.asm`,
    text,
  }));
  const { segments } = assemble(sources);
  const mismatches = [];

  segments.forEach((segment, i) => {
    const page = [...listings.keys()][i];
    const start = page * PAGE_SIZE;
    if (segment.bytes.length !== PAGE_SIZE) {
      mismatches.push({ page, offset: Math.min(segment.bytes.length, PAGE_SIZE), expected: -1, actual: -1 });
      return;
    }
    for (let offset = 0; offset < PAGE_SIZE; offset++) {
      if (segment.bytes[offset] !== rom[start + offset]) {
        mismatches.push({ page, offset, expected: rom[start + offset], actual: segment.bytes[offset] });
        break;
      }
    }
  });

  return { ok: mismatches.length === 0, pagesChecked: segments.length, mismatches };
}
