-- Fifth role: "caregiver" (field workers). "staff" stays for office staff.
ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_name_check;
ALTER TABLE roles ADD CONSTRAINT roles_name_check CHECK (name IN ('client', 'staff', 'admin', 'hr', 'caregiver'));

INSERT INTO roles (name, description)
VALUES ('caregiver', 'Caregiver / field worker portal user')
ON CONFLICT (name) DO NOTHING;

-- Anyone hired through recruitment before this migration was created as "staff":
-- move them to the new role. Run `npm run seed` afterwards to attach permissions.
UPDATE users
   SET role_id = (SELECT id FROM roles WHERE name = 'caregiver')
 WHERE id IN (SELECT user_id FROM caregiver_profiles)
   AND role_id = (SELECT id FROM roles WHERE name = 'staff');
