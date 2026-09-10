require('dotenv').config();
const { notifyAssignmentAdded } = require('./email/notifier');

async function testEmail() {
  // We use a random integer ID to avoid Prisma's unique dedupe check from skipping
  // if you run this multiple times, and to satisfy Prisma's Int requirement.
  const uniqueId = Math.floor(Math.random() * 1000000);
  
  const mockAssignment = {
    id: uniqueId,
    course: {
      courseCode: 'TEST-101',
      courseName: 'Test Notification Course'
    },
    allocatedHours: 5,
    semester: 'Fall 2026',
    status: 'ASSIGNED',
    tutor: {
      user: {
        id: 1,
        firstName: 'Developer',
        lastName: 'Test',
        // Update this to your verified Resend email address!
        email: process.env.TEST_EMAIL || 'your-resend-account-email@example.com'
      }
    }
  };

  console.log('Attempting to send email notification to:', mockAssignment.tutor.user.email);
  console.log('Using unique assignment ID:', uniqueId);
  
  try {
    const result = await notifyAssignmentAdded(mockAssignment);
    console.log('\nEmail dispatch result:');
    console.dir(result, { depth: null });
  } catch (err) {
    console.error('\nError sending email:', err);
  }
}

testEmail().then(() => process.exit(0));
