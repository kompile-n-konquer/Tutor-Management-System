const prisma = require('../prisma/client');

// Slots locked by submitted applications: while an application is not rejected, the
// applicant must stay available for that course's tutoring slots. Locks follow the
// course's current slots, so a lecturer editing slots also moves the lock.
const getLockedSlots = async (userId) => {
  const applications = await prisma.application.findMany({
    where: { userId, status: { not: 'REJECTED' } },
    select: { course: { select: { slots: { select: { dayOfWeek: true, timeSlotId: true } } } } },
  });

  const lockedKeys = new Set();
  applications.forEach((application) => {
    application.course.slots.forEach((slot) => {
      lockedKeys.add(`${slot.dayOfWeek}-${slot.timeSlotId}`);
    });
  });

  return [...lockedKeys].map((key) => {
    const [dayOfWeek, timeSlotId] = key.split('-').map(Number);
    return { dayOfWeek, timeSlotId };
  });
};

module.exports = getLockedSlots;
