DELETE FROM oauth_states;
DELETE FROM oauth_pending;
DELETE FROM oauth_identities;
UPDATE users SET github_id = NULL WHERE github_id IS NOT NULL;
