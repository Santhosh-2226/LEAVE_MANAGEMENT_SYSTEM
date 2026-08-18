export const DEFAULT_POLICIES = {
  baseLeave: 10.0,
  employeeRate: 1.0,
  managerRate: 2.0,
  seniorManagerRate: 4.0,
  directorRate: 5.0,
  vpRate: 5.0,
  partTimeRate: 0.5,
};

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

export function calculateAccrual(joinDate, role, employmentType = 'Full-Time', approvedLeaves = [], policy = DEFAULT_POLICIES, asOfDate = new Date()) {
  const start = new Date(joinDate);
  const end = new Date(asOfDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid joinDate or asOfDate format");
  }

  const baseLeave = typeof policy.baseLeave === 'number' ? policy.baseLeave : 10.0;
  let rate = 1.0;

  if (employmentType === 'Part-Time') {
    rate = typeof policy.partTimeRate === 'number' ? policy.partTimeRate : 0.5;
  } else {
    // Full-Time: rate based on role
    switch (role) {
      case 'Vice President':
        rate = typeof policy.vpRate === 'number' ? policy.vpRate : 5.0;
        break;
      case 'Director':
        rate = typeof policy.directorRate === 'number' ? policy.directorRate : 5.0;
        break;
      case 'Senior Manager':
        rate = typeof policy.seniorManagerRate === 'number' ? policy.seniorManagerRate : 4.0;
        break;
      case 'Manager':
        rate = typeof policy.managerRate === 'number' ? policy.managerRate : 2.0;
        break;
      case 'Employee':
      default:
        rate = typeof policy.employeeRate === 'number' ? policy.employeeRate : 1.0;
        break;
    }
  }

  let accruedFromMonths = 0;
  let monthsWithNoLeave = 0;
  let monthsWithLeave = 0;

  let currentYear = start.getFullYear();
  let currentMonth = start.getMonth(); // 0-11

  const endYear = end.getFullYear();
  const endMonth = end.getMonth();

  while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);

    const hasLeaveInMonth = approvedLeaves.some(l => {
      const lStart = new Date(l.startDate || l.start_date);
      const lEnd = new Date(l.endDate || l.end_date);
      return lStart <= monthEnd && lEnd >= monthStart;
    });

    if (!hasLeaveInMonth) {
      accruedFromMonths += rate;
      monthsWithNoLeave++;
    } else {
      monthsWithLeave++;
    }

    currentMonth++;
    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }
  }

  const totalAccrued = Math.round((baseLeave + accruedFromMonths) * 10) / 10;

  return {
    baseLeave,
    rate,
    employmentType,
    accruedFromMonths,
    monthsWithNoLeave,
    monthsWithLeave,
    totalAccrued
  };
}

export function calculateAvailableBalance(accrued, used) {
  return Math.round((accrued - used) * 10) / 10;
}
