const accountId = '3903d3554a2e7453ce23f44bc989fe6b';
const apiToken = 'mFfv3mKg0mAqHV7QIlxCmKbXhvF6C4gJRyj0jrnu';

async function testSQL() {
    const sql = `SELECT count() FROM "auth-center"`;
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiToken}`,
            'Content-Type': 'text/plain',
        },
        body: sql
    });

    console.log('Status:', response.status);
    console.log('Body:', await response.text());
}

testSQL();
