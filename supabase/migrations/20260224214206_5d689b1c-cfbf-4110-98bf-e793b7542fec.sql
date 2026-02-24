
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins manage admin_users" ON public.admin_users;
DROP POLICY IF EXISTS "Users can check own admin status" ON public.admin_users;

-- Allow authenticated users to check their own admin status
CREATE POLICY "Users can check own admin status"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Admins can see all admin users
CREATE POLICY "Admins can view all admin_users"
  ON public.admin_users FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admins can insert new admin users
CREATE POLICY "Admins can insert admin_users"
  ON public.admin_users FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

-- Admins can update admin users
CREATE POLICY "Admins can update admin_users"
  ON public.admin_users FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()));

-- Admins can delete admin users
CREATE POLICY "Admins can delete admin_users"
  ON public.admin_users FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
