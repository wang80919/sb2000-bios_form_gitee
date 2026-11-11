// ------------------------------------------------------------------------
// 名称：restore.mjs
// 说明：验证用例共用的辅助：调用前备份一段内存，调用后还原，用于不换整个模拟器状态就能改写系统变量的用例。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：备份与还原都走模拟器客户端的 read/write cpu 命令；ranges 是 [地址, 长度] 的列表。
// ------------------------------------------------------------------------

/** 字节数组转十六进制串（小写） */
export const toHex = (bytes) => [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');

/**
 * 备份 ranges 里的内存，执行 action，再还原。
 * @param {{read: Function, send: Function}} client 模拟器客户端
 * @param {Array<[number, number]>} ranges 要备份的 [地址, 长度]
 * @param {() => Promise<any>} action 要执行的动作，返回值原样返回
 */
export const withRestore = async (client, ranges, action) => {
  const saved = [];
  for (const [address, length] of ranges) saved.push([address, Buffer.from(await client.read('cpu', address, length))]);
  try {
    return await action();
  } finally {
    for (const [address, bytes] of saved) await client.send(`write cpu ${address.toString(16)} ${toHex(bytes)}`);
  }
};

/** 简单的伪随机字节序列（同一种子结果相同） */
export const noise = (seed, length) => {
  let state = (seed * 2654435761) >>> 0 || 1;
  return Array.from({ length }, () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state & 0xff;
  });
};
