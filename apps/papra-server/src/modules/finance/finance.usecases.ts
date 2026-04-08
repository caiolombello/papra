export function getFinancialMonthRange({ financialMonth, startDay }: {
  financialMonth?: string;
  startDay: number;
}): { from: Date; to: Date; month: string } {
  const now = new Date();
  let year: number;
  let monthNum: number;

  if (financialMonth) {
    const [y, m] = financialMonth.split('-').map(Number);
    year = y!;
    monthNum = m! - 1;
  } else {
    year = now.getFullYear();
    monthNum = now.getMonth();
    if (now.getDate() < startDay) {
      monthNum -= 1;
      if (monthNum < 0) { monthNum = 11; year -= 1; }
    }
  }

  const from = new Date(year, monthNum, startDay, 0, 0, 0, 0);
  const nextMonth = monthNum + 1;
  const nextYear = nextMonth > 11 ? year + 1 : year;
  const to = new Date(nextYear, nextMonth > 11 ? 0 : nextMonth, startDay - 1, 23, 59, 59, 999);

  const month = `${year}-${String(monthNum + 1).padStart(2, '0')}`;
  return { from, to, month };
}
