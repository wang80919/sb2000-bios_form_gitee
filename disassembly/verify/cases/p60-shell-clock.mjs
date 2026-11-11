// ------------------------------------------------------------------------
// 名称：p60-shell-clock.mjs
// 说明：DOS 命令外壳 date、time 命令的验证用例：带参数设置合法与非法的日期、时间，交互输入新日期，检查屏幕显示的当前日期与时间，并读 ERAM 里的日期、时间变量。
// 作者：sungbin
// 邮箱：sungbin@3578.cn
// 日期：2026-11-09
// 备注：变量位置——日期 $6305 日、$6306 月、$6307 年（相对 1980）；时间 $068A 秒、$068B 分、$068C 时，时间变量由内核每秒递增，所以只检查时和分，秒只检查不小于设置值。
//       开机日期提示按回车保留默认值，所以起始日期是 01-01-1998（日 1、月 1、年 18）。预期值取自命令的参数，不取自 BIOS 的输出。
//       显示格式：日期“当前日期：”后一行“月-日-四位年”，时间“当前时间：”后一行“时:分:秒”。
// ------------------------------------------------------------------------
import { before } from '../lib/disk-check.mjs';
import { moreText, shellText } from '../lib/screen-text.mjs';

const hex = (value) => `$${value.toString(16).padStart(2, '0')}`;

/** 主机步骤：读 CPU 地址空间的一段内存 */
const readCpu = (address, length) => ({ host: async (client) => Buffer.from(await client.read('cpu', address, length)) });

/** 日期变量（日、月、年-1980）与预期值的比较 */
const dateBytes = (day, month, year) => (hostResult) => {
  const [d, m, y] = hostResult.data;
  return d === day && m === month && y === year - 1980 ? [] : [`日期变量预期 ${hex(day)} ${hex(month)} ${hex(year - 1980)}，实际 ${hex(d)} ${hex(m)} ${hex(y)}`];
};

/** 屏幕上有没有这一行 */
const hasLine = (lines, text) => lines.some((line) => line.trim() === text);

const make = (id, title, steps) => ({ id, title, fresh: true, freshAfter: true, steps });

const missing = (lines, wanted) => wanted.filter((text) => !hasLine(lines, text)).map((text) => `屏幕上没有“${text}”；实际：${JSON.stringify(lines)}`);

const cases = before
  ? [
      make('shell-clock.date-set', 'date 12-25-98：日期变量变为 25、12、年 18，再输入 date 显示“12-25-1998”', [
        { ...shellText('date 12-25-98'), check: () => [] },
        { ...moreText('date\n'), check: ({ data }) => missing(data, ['当前日期：', '12-25-1998']) },
        { ...readCpu(0x6305, 3), check: dateBytes(25, 12, 1998) },
      ]),
      make('shell-clock.date-4digit', 'date 12-25-2005：年写四位，年变量为 25，显示“12-25-2005”', [
        { ...shellText('date 12-25-2005'), check: () => [] },
        { ...moreText('date\n'), check: ({ data }) => missing(data, ['12-25-2005']) },
        { ...readCpu(0x6305, 3), check: dateBytes(25, 12, 2005) },
      ]),
      make('shell-clock.date-ask', 'date 后按提示输入 12-25-98：日期变量变为 25、12、年 18', [
        { ...shellText('date'), check: ({ data }) => missing(data, ['当前日期：', '01-01-1998', '请输入新日期(mm-dd-yy)：']) },
        { ...moreText('12-25-98\n'), check: () => [] },
        { ...readCpu(0x6305, 3), check: dateBytes(25, 12, 1998) },
      ]),
      make('shell-clock.date-bad-month', 'date 13-01-98：提示“非法日期”，日期变量不变（01-01-1998）', [
        { ...shellText('date 13-01-98'), check: ({ data }) => missing(data, ['非法日期']) },
        { ...readCpu(0x6305, 3), check: dateBytes(1, 1, 1998) },
      ]),
      make('shell-clock.date-bad-form', 'date 2-30-98：月份只写一位，提示“参数无效”，日期变量不变', [
        { ...shellText('date 2-30-98'), check: ({ data }) => missing(data, ['参数无效']) },
        { ...readCpu(0x6305, 3), check: dateBytes(1, 1, 1998) },
      ]),
      make('shell-clock.time-set', 'time 10:20:30：时变量 10、分变量 20、秒不小于 30，再输入 time 显示“10:20:”开头的时间', [
        { ...shellText('time 10:20:30'), check: () => [] },
        {
          ...moreText('time\n'),
          check: ({ data }) => {
            const shown = data.find((line) => /^\d\d:\d\d:\d\d$/.test(line.trim()));
            if (!data.some((line) => line.trim() === '当前时间：')) return [`没有“当前时间：”；实际：${JSON.stringify(data)}`];
            return shown?.startsWith('10:20:') ? [] : [`显示的时间预期以 10:20: 开头，实际 ${JSON.stringify(shown)}`];
          },
        },
        {
          ...readCpu(0x68a, 3),
          check: ({ data: [seconds, minutes, hours] }) => {
            const problems = [];
            if (hours !== 10) problems.push(`时预期 10，实际 ${hours}`);
            if (minutes !== 20) problems.push(`分预期 20，实际 ${minutes}`);
            if (seconds < 30) problems.push(`秒预期不小于 30，实际 ${seconds}`);
            return problems;
          },
        },
      ]),
      make('shell-clock.time-bad', 'time 25:00:00：提示“非法时间”，时变量不变（仍是开机后的 0 时）', [
        { ...shellText('time 25:00:00'), check: ({ data }) => missing(data, ['非法时间']) },
        { ...readCpu(0x68a, 3), check: ({ data: [, , hours] }) => (hours === 0 ? [] : [`时预期 0，实际 ${hours}`]) },
      ]),
    ]
  : [];

export { cases };
