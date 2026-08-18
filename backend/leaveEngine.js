/**
 * Calculates working days between startDate and endDate (inclusive).
 * Excludes Saturdays and Sundays.
 * 
 * @param {string} startDateStr - YYYY-MM-DD
 * @param {string} endDateStr - YYYY-MM-DD
 * @returns {number} number of working days
 */
export function calculateWorkingDays(startDateStr, endDateStr) {
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid startDate or endDate format");
  }

  const currentDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const finalDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  if (currentDate > finalDate) {
    return 0;
  }

  let workingDaysCount = 0;
  while (currentDate <= finalDate) {
    const dayOfWeek = currentDate.getDay(); 
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDaysCount++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDaysCount;
}

/**
 * Calculates leave accrued dynamically based on joinDate, rate, and asOfDate.
 * 
 * @param {string|Date} joinDate - YYYY-MM-DD
 * @param {number} accrualRatePerMonth - monthly accrual rate
 * @param {string|Date} [asOfDate] - date as of which to calculate accrual (defaults to today)
 * @returns {number} leave accrued (rounded to 1 decimal place)
 */
export function calculateAccrual(joinDate, accrualRatePerMonth, asOfDate = new Date()) {
  const start = new Date(joinDate);
  const end = new Date(asOfDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid joinDate or asOfDate format");
  }

  // Normalize dates to eliminate timezone time differences
  const startYear = start.getFullYear();
  const startMonth = start.getMonth();
  const startDate = start.getDate();

  const endYear = end.getFullYear();
  const endMonth = end.getMonth();
  const endDate = end.getDate();

  let totalMonths = (endYear - startYear) * 12 + (endMonth - startMonth);

  // If the as-of day is before the join day of the month, the current month is not fully elapsed
  if (endDate < startDate) {
    totalMonths--;
  }

  if (totalMonths < 0) {
    totalMonths = 0;
  }

  const accrued = totalMonths * accrualRatePerMonth;
  return Math.round(accrued * 10) / 10;
}

/**
 * Calculates available leave balance.
 * Available = Accrued - Used.
 * 
 * @param {number} accrued - accrued leave days
 * @param {number} used - used leave days
 * @returns {number} available leave balance
 */
export function calculateAvailableBalance(accrued, used) {
  const balance = accrued - used;
  return Math.round(balance * 10) / 10;
}
