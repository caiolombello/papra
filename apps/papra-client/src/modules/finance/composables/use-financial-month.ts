import { createSignal } from 'solid-js';

export function useFinancialMonth() {
  const getCurrentFinancialMonth = () => {
    const now = new Date();
    const startDay = 15;
    let year = now.getFullYear();
    let month = now.getMonth();
    if (now.getDate() < startDay) {
      month -= 1;
      if (month < 0) {
        month = 11;
        year -= 1;
      }
    }
    return `${year}-${String(month + 1).padStart(2, '0')}`;
  };

  const [financialMonth, setFinancialMonth] = createSignal(getCurrentFinancialMonth());

  const formatFinancialMonth = (month: string) => {
    const [year, m] = month.split('-').map(Number);
    const startDay = 15;
    const from = new Date(year!, m! - 1, startDay);
    const endMonth = m!;
    const endYear = endMonth > 12 ? year! + 1 : year!;
    const to = new Date(endMonth > 12 ? endYear : year!, endMonth > 12 ? 0 : endMonth - 1 + 1, startDay - 1);
    return `${from.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} — ${to.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}`;
  };

  const navigateMonth = (direction: -1 | 1) => {
    const current = financialMonth();
    const [year, month] = current.split('-').map(Number);
    let newMonth = month! + direction;
    let newYear = year!;
    if (newMonth < 1) {
      newMonth = 12;
      newYear--;
    }
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
    }
    setFinancialMonth(`${newYear}-${String(newMonth).padStart(2, '0')}`);
  };

  return { financialMonth, setFinancialMonth, formatFinancialMonth, navigateMonth };
}
