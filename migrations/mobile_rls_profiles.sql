-- Mobile app: allow authenticated users to create their own profile
CREATE POLICY "profiles: user insert own"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Auto-create profile row when a new user registers via phone OTP.
-- Only fires when auth.users.phone is not null (skips admin/operator email accounts).
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.phone IS NOT NULL THEN
    INSERT INTO public.profiles (id, phone)
    VALUES (NEW.id, NEW.phone)
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
