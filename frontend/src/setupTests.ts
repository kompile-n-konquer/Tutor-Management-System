import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

// findBy*/waitFor default to only 1s. On the contended CI runner a state
// update after a mocked fetch can take longer than that to land, so give the
// async queries the same headroom as the raised vitest test timeout.
configure({ asyncUtilTimeout: 5000 });
