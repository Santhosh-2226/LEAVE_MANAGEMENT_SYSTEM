export function calculateWorkingDays(startDateStr, endDateStr, holidays = []) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid startDate or endDate format");
  }

  const holidaySet = new Set(holidays);

  const currentDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const finalDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (currentDate > finalDate) return 0;

  let count = 0;
  while (currentDate <= finalDate) {
    const dow = currentDate.getDay();
    const iso = currentDate.toISOString().split('T')[0];
    if (dow !== 0 && dow !== 6 && !holidaySet.has(iso)) {
      count++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return count;
}

export function calculateAccrual(joinDate, accrualRatePerMonth, asOfDate = new Date()) {
  const start = new Date(joinDate);
  const end = new Date(asOfDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid joinDate or asOfDate format");
  }

  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const startDate = start.getDate();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth();
  const endDate = end.getDate();

  let totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth);

  if (endDate < startDate) totalMonths--;
  if (totalMonths < 0) totalMonths = 0;

  return Math.round(totalMonths * accrualRatePerMonth * 10) / 10;
}

export function calculateAvailableBalance(accrued, used) {
  return Math.round((accrued - used) * 10) / 10;
}
