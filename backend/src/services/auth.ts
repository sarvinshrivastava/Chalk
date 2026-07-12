import { adminClient, createUserClient } from "../lib/supabase.js";
import { prisma } from "../lib/prisma.js";
import { AppError, withPrismaErrors } from "../lib/errors.js";

export async function signUpWithEmail(
  email: string,
  password: string,
  name: string,
) {
  const { data, error } = await adminClient.auth.signUp({
    email,
    password,
    options: { data: { name } },
  });

  if (error) throw new AppError(400, error.message, "SIGNUP_FAILED");
  if (!data.user)
    throw new AppError(500, "User creation failed", "SIGNUP_NO_USER");

  await prisma.users.upsert({
    where: { id: data.user.id },
    update: { name, auth_provider: "email" },
    create: { id: data.user.id, name, auth_provider: "email" },
  });

  return { user: data.user, session: data.session };
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await adminClient.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new AppError(401, error.message, "SIGNIN_FAILED");
  return { user: data.user, session: data.session };
}

export async function signInWithOAuth(
  accessToken: string,
  provider: "google" | "apple",
  name?: string,
) {
  const supabase = createUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    throw new AppError(401, "Invalid OAuth token", "OAUTH_INVALID");
  }

  const displayName = name || data.user.user_metadata?.full_name || "User";

  await prisma.users.upsert({
    where: { id: data.user.id },
    update: { name: displayName, auth_provider: provider },
    create: { id: data.user.id, name: displayName, auth_provider: provider },
  });

  return { user: data.user };
}

export async function refreshSession(refreshToken: string) {
  const { data, error } = await adminClient.auth.refreshSession({
    refresh_token: refreshToken,
  });
  if (error) throw new AppError(401, error.message, "REFRESH_FAILED");
  return { session: data.session };
}

export async function signOut(accessToken: string) {
  const supabase = createUserClient(accessToken);
  await supabase.auth.signOut();
}

export async function getProfile(userId: string) {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      upi_id: true,
      phone: true,
      created_at: true,
    },
  });

  if (!user) {
    throw new AppError(404, "User not found", "USER_NOT_FOUND");
  }

  return user;
}

export async function updateProfile(
  userId: string,
  updates: { name?: string; upi_id?: string | null; phone?: string | null },
) {
  return withPrismaErrors(() =>
    prisma.users.update({ where: { id: userId }, data: updates }),
  );
}
