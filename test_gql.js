// Now we know: the schema only has count, confidence, dimensions{dataset,date,datetime,...}
// There's NO sum or blob fields in workersAnalyticsEngineAdaptiveGroups
// Custom datasets appear as their OWN type in GraphQL
// Let's find the auth-center dataset type

const query = `
query IntrospectionQuery {
  __schema {
    types {
      name
    }
  }
}
`;

async function test() {
  try {
    const res = await fetch('http://127.0.0.1:8787/admin/stats/graphql', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic YWRtaW46TXlsb3ZlcjEw',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: query, variables: {} })
    });
    const text = await res.text();
    const types = JSON.parse(text).data.__schema.types.map(t => t.name);
    // find types that include 'center', or custom ones
    const custom = types.filter(t =>
      t.includes('Center') ||
      t.includes('center') ||
      t.includes('authCenter') ||
      t.includes('Authcenter') ||
      t.includes('AuthCenter')
    );
    console.log('auth center types:', custom);
    // Also  look for any type that user defined datasets might create
    const ae = types.filter(t => t.includes('AnalyticsEngine') && !t.includes('Account'));
    console.log('analytics engine types:', ae);
  } catch (e) {
    console.error(e);
  }
}

test();
