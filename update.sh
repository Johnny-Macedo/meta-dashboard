#!/bin/bash
cd /Users/macbookair/meta-dashboard
export META_TOKEN=EAANsGH8H1LcBQ3aDKXKaRcAAkoi91SAF8mUnyD1oBQB4RN4ptxGTrhn3luikPQyZCkEmwjzy006xYzsdU3dF0W3VRGP5JTja4IYrtKULxGCdkJXrP9pYex7vYYuVKjZBTmPxLJXnGspvcz7JUCAXsxtLKAuw0RV3wP2qFOzW1gyM9uG1xFHHwnRgicTAZDZD
export AD_ACCOUNT_ID=1427801045649245
/opt/homebrew/bin/node fetch.js
git add data.json
git commit -m "update data $(date)"
git push origin main
