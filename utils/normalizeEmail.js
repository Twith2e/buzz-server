export function normalizeEmail(email) {
  if (!email || typeof email !== "string") return null;
  console.log(email);
  return email.trim().toLowerCase();
}
