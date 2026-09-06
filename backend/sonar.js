const { scan } = require('@sonar/scan');

const runScan = async () => {
  try {
    await scan({
      serverUrl: 'http://localhost:9000',
      token: process.env.SONAR_TOKEN,

      options: {
        'sonar.projectKey': process.env.SONAR_PROJECT_NAME,
        'sonar.sources': '../frontend,.',
        'sonar.exclusions': '**/node_modules/**',
      },
    });
  } catch (error) {
    console.log(error.message);
  }
};

runScan();
