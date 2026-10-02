const token = btoa('admin:Mylover10');
fetch('http://127.0.0.1:8787/admin/apps', {
    method: 'POST',
    headers: {
        'Authorization': 'Basic ' + token,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        app_id: 'test_app_2',
        app_name: 'Test App 2',
        callback_url: '',
        secret_key: 'test',
        use_agent_limit: false
    })
}).then(async r => {
    console.log(r.status, await r.text());
});
