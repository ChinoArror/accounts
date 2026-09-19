UPDATE register_codes
SET
  used_by_uuid = COALESCE(
    used_by_uuid,
    (
      SELECT uses.user_id
      FROM register_code_uses uses
      WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
      ORDER BY uses.used_at ASC
      LIMIT 1
    )
  ),
  used_by_username = COALESCE(
    used_by_username,
    (
      SELECT code_user.username
      FROM register_code_uses uses
      INNER JOIN users code_user ON code_user.uuid = uses.user_id OR code_user.id = uses.user_id
      WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
      ORDER BY uses.used_at ASC
      LIMIT 1
    )
  ),
  used_at = COALESCE(
    used_at,
    (
      SELECT uses.used_at
      FROM register_code_uses uses
      WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
      ORDER BY uses.used_at ASC
      LIMIT 1
    )
  )
WHERE EXISTS (
  SELECT 1
  FROM register_code_uses uses
  WHERE uses.code_id = register_codes.id OR uses.code_id = register_codes.code
);
