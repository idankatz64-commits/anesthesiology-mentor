-- Allow admin to read all feedback
CREATE POLICY "Admin can read all feedback"
ON public.user_feedback
FOR SELECT
USING (
  (SELECT email FROM auth.users WHERE id = auth.uid()) = 'idankatz64@gmail.com'
);