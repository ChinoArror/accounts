import fetch from 'node-fetch';
const token = 'IjsRFQga4uuLcpxL8ZZmfmttD62Ia-zhtQIWm26N';
const accountId = '3903d3554a2e7453ce23f44bc989fe6b';

async function run() {
  const query = `
    query getAnalytics($accountTag: String!) {
      viewer {
        accounts(filter: {accountTag: $accountTag}) {
          workersAnalyticsEngineAdaptiveGroups(
            filter: { dataset: "auth-center", datetime_geq: "2024-01-01T00:00:00Z" },
            limit: 10
          ) {
            sum {
              double1
            }
            count
            dimensions {
              blob1
              blob6
            }
          }
        }
      }
    }
  `;
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables: { accountTag: accountId } })
  });
  console.log(await res.text());
}
run();
