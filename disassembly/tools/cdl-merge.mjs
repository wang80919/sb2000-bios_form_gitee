// ------------------------------------------------------------------------
// 名称：cdl-merge.mjs
// 说明：合并多份 CDL（代码数据标记），让多个采集场景的覆盖叠加到同一份清单里。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：低 4 位的访问标志取并集；窗口号取第一份有标志的 CDL，之后窗口不同则置“冲突”位；
//       标志位含义见 cdl-listing.mjs。
// ------------------------------------------------------------------------
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CDL } from './cdl-listing.mjs';

/**
 * 合并 CDL。
 * @param {Uint8Array[]} list 至少一份 CDL，长度必须相同
 * @returns {Uint8Array}
 */
export function mergeCdl(list) {
  if (list.length === 0) throw new Error('没有可合并的 CDL');
  const result = new Uint8Array(list[0].length);
  for (const cdl of list) {
    if (cdl.length !== result.length) throw new Error('CDL 长度不一致');
    for (let i = 0; i < cdl.length; i++) {
      const flags = cdl[i];
      if ((flags & 0x0f) === 0) continue;
      if ((result[i] & 0x0f) === 0) {
        result[i] = flags;
        continue;
      }
      let merged = result[i] | (flags & 0x0f) | (flags & CDL.CONFLICT);
      if ((flags & 0x70) !== (result[i] & 0x70)) merged |= CDL.CONFLICT;
      result[i] = merged;
    }
  }
  return result;
}

/**
 * 合并若干 CDL 文件或目录（目录里取所有 *-rom.cdl，不含输出文件本身），写到输出文件。
 * @param {string} output 输出文件
 * @param {string[]} inputs 输入 CDL 文件或目录
 * @returns {number} 合并的文件数
 */
export function mergeFiles(output, inputs) {
  const files = [];
  for (const input of inputs) {
    if (statSync(input).isDirectory()) {
      for (const name of readdirSync(input).sort()) {
        const full = path.join(input, name);
        if (name.endsWith('-rom.cdl') && path.resolve(full) !== path.resolve(output)) files.push(full);
      }
    } else {
      files.push(input);
    }
  }
  writeFileSync(output, mergeCdl(files.map((file) => new Uint8Array(readFileSync(file)))));
  return files.length;
}

if (process.argv[1]?.endsWith('cdl-merge.mjs')) {
  const [output, ...inputs] = process.argv.slice(2);
  if (!output || inputs.length === 0) {
    console.error('用法：node tools/cdl-merge.mjs <输出文件> <输入 CDL 或目录> [更多输入…]（目录里取所有 *-rom.cdl，不含输出文件本身）');
    process.exit(1);
  }
  console.log(`已合并 ${mergeFiles(output, inputs)} 份 CDL 到 ${output}`);
}
