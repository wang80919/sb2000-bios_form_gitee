// ------------------------------------------------------------------------
// 名称：image-scan.mjs
// 说明：在官方软盘镜像的原始字节里查找对指定内存地址的读写指令，给“程序不读、不写这个变量”的结论提供证据
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-10
// 备注：用法 node tools/image-scan.mjs 地址[:名称] ...；没有找到命中说明所有镜像的原始字节里都没有这样的指令（含压缩前后的巧合除外）
// ------------------------------------------------------------------------
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { IMAGES_DIR } from './config.mjs';

/** 写类指令（含读改写）的绝对寻址操作码 */
const WRITE_OPS = new Map([[0x8d, 'STA'], [0x8e, 'STX'], [0x8c, 'STY'], [0xee, 'INC'], [0xce, 'DEC'], [0x0e, 'ASL'], [0x4e, 'LSR'], [0x2e, 'ROL'], [0x6e, 'ROR'], [0x9d, 'STA,X'], [0xfe, 'INC,X'], [0xde, 'DEC,X'], [0x1e, 'ASL,X'], [0x5e, 'LSR,X'], [0x3e, 'ROL,X'], [0x7e, 'ROR,X'], [0x99, 'STA,Y']]);
/** 读类指令的绝对寻址操作码 */
const READ_OPS = new Map([[0xad, 'LDA'], [0xae, 'LDX'], [0xac, 'LDY'], [0xcd, 'CMP'], [0xec, 'CPX'], [0xcc, 'CPY'], [0x6d, 'ADC'], [0xed, 'SBC'], [0x2d, 'AND'], [0x0d, 'ORA'], [0x4d, 'EOR'], [0x2c, 'BIT'], [0xbd, 'LDA,X'], [0xb9, 'LDA,Y'], [0xbe, 'LDX,Y'], [0xbc, 'LDY,X'], [0xdd, 'CMP,X'], [0xd9, 'CMP,Y'], [0x7d, 'ADC,X'], [0x79, 'ADC,Y'], [0x3d, 'AND,X'], [0x39, 'AND,Y'], [0x1d, 'ORA,X'], [0x19, 'ORA,Y'], [0x5d, 'EOR,X'], [0x59, 'EOR,Y'], [0xfd, 'SBC,X'], [0xf9, 'SBC,Y']]);

const targets = process.argv.slice(2).map((text) => {
  const [addr, name = ''] = text.split(':');
  return { address: parseInt(addr.replace('$', ''), 16), name };
});
const images = readdirSync(IMAGES_DIR).filter((f) => /\.img$/i.test(f));
const report = new Map(targets.map((t) => [t.address, { write: [], read: [] }]));
for (const image of images) {
  const bytes = readFileSync(path.join(IMAGES_DIR, image));
  for (let i = 0; i + 2 < bytes.length; i++) {
    const address = bytes[i + 1] | (bytes[i + 2] << 8);
    const entry = report.get(address);
    if (!entry) continue;
    if (WRITE_OPS.has(bytes[i])) entry.write.push(`${image}@${i.toString(16)}:${WRITE_OPS.get(bytes[i])}`);
    else if (READ_OPS.has(bytes[i])) entry.read.push(`${image}@${i.toString(16)}:${READ_OPS.get(bytes[i])}`);
  }
}
console.log(`扫描 ${images.length} 个镜像`);
for (const t of targets) {
  const entry = report.get(t.address);
  console.log(`$${t.address.toString(16).toUpperCase().padStart(4, '0')} ${t.name} 写类指令 ${entry.write.length} 处，读类指令 ${entry.read.length} 处`);
  for (const hit of entry.write.slice(0, 6)) console.log(`   写 ${hit}`);
  for (const hit of entry.read.slice(0, 6)) console.log(`   读 ${hit}`);
}
