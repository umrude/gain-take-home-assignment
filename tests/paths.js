// Shared constants for the test suite.
const path = require('path');

module.exports = {
  ROOT: path.join(__dirname, '..'),
  HOME: 'https://www.thisisgain.com/',
  BLOG: 'https://www.thisisgain.com/blog/',
  // One recording per page (see record.js)
  HAR: path.join(__dirname, '.cache', 'home.har.zip'),
  HAR_BLOG: path.join(__dirname, '.cache', 'blog.har.zip'),
  // The brief's three viewports: mobile "as small as 375px", tablet, desktop
  VIEWPORTS: {
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 },
    desktop: { width: 1440, height: 900 }
  }
};
